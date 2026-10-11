/**
 * apps/web/src/pages/calendar/useOptedOutIds.ts - which event ids the join rules already opt out of.
 *
 * ONE `GET /calendar/join-rules` (read scope `calendar`, which this page already uses) per API key,
 * not per selection. A failed or malformed read leaves the state UNKNOWN (null): the control then
 * simply offers the action and never claims a meeting is or is not opted out.
 * It also remembers how many `url:` identities were stored (never shown) so an opt-out's answer can be compared.
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import { parseView } from "../join-rules/joinRulesModel.js";
import { urlIdentityCount } from "./optOutOutcome.js";

export interface OptedOutIds { ids: ReadonlySet<string> | null; linkCount: number | null; add(eventId: string, response?: unknown): void }

export function useOptedOutIds(apiKey: string | null): OptedOutIds {
  const [ids, setIds] = useState<ReadonlySet<string> | null>(null);
  const [linkCount, setLinkCount] = useState<number | null>(null);
  useEffect(() => {
    if (!apiKey) { setIds(null); setLinkCount(null); return; }
    let cancelled = false;
    apiFetch<unknown>("/calendar/join-rules", apiKey)
      .then((raw) => {
        const view = parseView(raw);
        if (!view || cancelled) return;
        setIds(new Set(view.state.optedOutEventIds));
        setLinkCount(urlIdentityCount(raw));
      })
      .catch(() => { /* state stays unknown; the opt-out action is still offered */ });
    return () => { cancelled = true; };
  }, [apiKey]);
  const add = useCallback((eventId: string, response?: unknown) => {
    setIds((prev) => new Set([...(prev ?? []), eventId]));
    const after = urlIdentityCount(response);
    if (after !== null) setLinkCount(after);
  }, []);
  return { ids, linkCount, add };
}
