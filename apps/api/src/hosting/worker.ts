import { createHmac, randomUUID } from "node:crypto";
import { HostingService } from "./service.js";
import { hostingUrl } from "./policy.js";
import { HostingError, type HostingDelivery, type HostingPrincipal } from "./types.js";
import { createHostingTransport, type HostingTransport } from "./transport.js";

/** Explicit authenticated drain. Persistent claims fence concurrency; remote ACK ambiguity is at-least-once. */
export class HostingWorker {
  constructor(readonly service: HostingService, private readonly transport: HostingTransport = createHostingTransport()) {}
  async dispatch(principal: HostingPrincipal, limit = 5): Promise<{ attempted: number; delivered: number; uncertain: number }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new HostingError("invalid_dispatch_limit");
    let attempted = 0, delivered = 0, uncertain = 0;
    for (let n = 0; n < limit; n++) {
      const claim = await this.service.operate(principal, "deliveries:dispatch", async (state) => {
        const now = this.service.now();
        const job = [...state.deliveries.values()].find((d) => (d.status === "queued" && d.nextAt <= now) || (d.status === "sending" && d.leaseUntil <= now));
        if (!job) return { value: null };
        const subscription = state.subscriptions.get(job.subscriptionId);
        if (!subscription?.enabled || subscription.generation !== job.generation) throw new HostingError("delivery_recovery_required", 503);
        const attemptId = randomUUID();
        return { value: { job: { ...job, attempts: job.attempts + 1 }, subscription: { ...subscription }, attemptId },
          operation: "delivery.claim", target: job.id, outcome: job.status === "sending" ? "acknowledgement_uncertain_retry" : "attempting",
          data: { id: job.id, attemptId, leaseUntil: now + 30000 } };
      });
      if (!claim) break;
      attempted++;
      const { job, subscription, attemptId } = claim;
      const controller = new AbortController();
      const stopObserving = this.service.observeRevoke(principal.tenantId, subscription.id, controller);
      let error: string | null = null;
      let ok = false;
      try {
        const secret = this.service.unseal(principal.tenantId, subscription);
        const timestamp = String(Math.floor(this.service.now() / 1000));
        const signature = createHmac("sha256", secret).update(`${timestamp}.${job.id}.${job.body}`).digest("hex");
        const status = await this.transport({ url: hostingUrl(subscription.url, this.service.options.origins), body: job.body,
          signal: controller.signal,
          connect: async (start) => this.service.operate<Promise<number>>(principal, "deliveries:dispatch", async (state) => {
            const current = state.deliveries.get(job.id), s = state.subscriptions.get(subscription.id);
            if (controller.signal.aborted || !s?.enabled || s.generation !== job.generation || current?.status !== "sending" || current.attemptId !== attemptId || current.leaseUntil <= this.service.now()) throw new HostingError("subscription_revoked", 503);
            // start() synchronously creates/ends the numeric-address TLS request under this lock.
            // Returning its Promise (without awaiting it inside build) releases the lock for revocation.
            return { value: start() };
          }),
          headers: { "X-LKB-Webhook-Id": job.id, "X-LKB-Webhook-Timestamp": timestamp, "X-LKB-Webhook-Signature": `v1=${signature}` } });
        ok = status >= 200 && status < 300;
        if (!ok) error = status >= 300 && status < 400 ? "redirect_refused" : "remote_non_2xx";
      } catch (failure) {
        error = failure instanceof HostingError && ["destination_not_allowed", "signing_material_unavailable", "dns_timeout"].includes(failure.code) ? failure.code : "transport_failed";
      } finally { stopObserving(); }
      try {
        const accepted = await this.service.operate(principal, "deliveries:dispatch", async (state) => {
          const current = state.deliveries.get(job.id), currentSubscription = state.subscriptions.get(job.subscriptionId);
          if (current?.status !== "sending" || current.attemptId !== attemptId || !currentSubscription?.enabled || currentSubscription.generation !== job.generation) return { value: false };
          const status: HostingDelivery["status"] = ok ? "delivered" : job.attempts >= 5 ? "failed" : "queued";
          return { value: true, operation: "delivery.result", target: job.id, outcome: status,
            data: { id: job.id, attemptId, status, error, deliveredAt: ok ? new Date(this.service.now()).toISOString() : null,
              nextAt: this.service.now() + Math.min(60000, 2000 * 2 ** job.attempts) } };
        });
        if (!accepted) uncertain++;
        else if (ok) delivered++;
      } catch { uncertain++; }
    }
    return { attempted, delivered, uncertain };
  }
}
