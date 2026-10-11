/**
 * apps/web/src/pages/calendar/useOptedOutIds.ts - which event ids the join rules already opt out of.
 *
 * ONE `GET /calendar/join-rules` (read scope `calendar`, which this page already uses) per API key,
 * not per selection. A failed or malformed read leaves the state UNKNOWN (null): the control then
 * simply offers the action and never claims a meeting is or is not opted out.
 */
import { useCallback, useEffect, useState } from "react";
import { getJoinRules } from "../join-rules/joinRulesClient.js";

export interface OptedOutIds { ids: ReadonlySet<string> | null; add(eventId: string): void }

export function useOptedOutIds(apiKey: string | null): OptedOutIds {
  const [ids, setIds] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => {
    if (!apiKey) { setIds(null); return; }
    let cancelled = false;
    getJoinRules(apiKey)
      .then((view) => { if (!cancelled) setIds(new Set(view.state.optedOutEventIds)); })
      .catch(() => { /* state stays unknown; the opt-out action is still offered */ });
    return () => { cancelled = true; };
  }, [apiKey]);
  const add = useCallback((eventId: string) => setIds((prev) => new Set([...(prev ?? []), eventId])), []);
  return { ids, add };
}
