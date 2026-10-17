/** Stop only the controller capability owned by this invocation; retain its durable request. */
export function createOwnedCaptureStop({state, id, tenantId, control, active, update, now, onFailure}) {
  let pending = Promise.resolve();
  return {
    request(reason) {
      const handle = control();
      if (!handle || !active() || state.operations[id].stopDisposition) return;
      try {update(id, {reason, stopDisposition: {tenantId, sessionId: id, generation: handle.generation,
        reason: 'cancelled', requestedAt: new Date(now()).toISOString()}});}
      catch (error) {onFailure(error);}
      // No delayed metadata write can escape the owned child/lane lifetime.
      pending = pending.then(() => handle.stop('cancelled')).catch(() => 'unavailable');
    },
    async drain() {await pending;},
  };
}
