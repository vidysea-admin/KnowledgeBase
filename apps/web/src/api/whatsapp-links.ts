/**
 * apps/web/src/api/whatsapp-links.ts -- unit wa-web (whatsapp-multiuser W10). Typed wrappers for the links routes of
 * apps/api/src/whatsapp/links/router.ts (W5) and the selection routes of apps/api/src/whatsapp/selection/router.ts (W6).
 *
 * Every call goes through `apiFetch` with the credential the pages already thread (the account-session marker, or a key).
 * Bodies are exactly the strict shapes the server accepts (unknown fields are 400 there); no tenant or owner id is ever sent.
 * Nothing here logs: the pairing QR returned by `connectLink` is a capture credential and is only handed back to the caller.
 */
import { ApiError, apiFetch } from "./client.js";

export type LinkState = "requested" | "approved" | "active" | "suspended" | "rejected" | "unlinked" | "revoked";
export type StudentData = "yes" | "no" | "unknown";
export type Capture = "all" | "selected" | "none";

export interface LinkHealth { lastStatus?: string; lastStatusAt?: string; lastRunAt?: string; lastSuccessAt?: string; lastMessageAt?: string; flags?: string[] }
/** The allowlist projection of `toLinkView`: admin-only fields (studentData, *By, archiver owner id) are present for an admin only. */
export interface LinkView {
  id: string; userId: string | null; legacy: boolean; label: string; state: LinkState;
  noticeVersion?: string; noticeShownAt?: string; requestedAt?: string; approvedAt?: string; approvalExpiresAt?: string; activatedAt?: string;
  suspendedReason?: string; rejectedReason?: string; unlinkedReason?: string; revokedReason?: string; blocksNewRequests?: boolean; createdAt?: string; updatedAt?: string;
  studentData?: StudentData; approvedBy?: string; health?: LinkHealth;
}
export interface Notice { version: string; text: string }
/** `state` is the archiver session status; `linkState` the KB link state. `qr` is null unless the archiver is awaiting a scan. */
export interface ConnectView { state: string; linkState: LinkState; qr: string | null; expiresAt: string | null; accountHint: string | null }

export interface GroupView { jid: string; subject: string; participantCount: number; marked: boolean; trackAllSenders: boolean }
export interface GroupList { view: "owner" | "admin"; canEdit: boolean; source: string; refreshedAt: string | null; truncated: boolean; groupCount: number; markedCount: number; groups: GroupView[] }
export interface SetGroupResult { changed: boolean; group: GroupView; capture?: Capture; markedCount?: number }
export interface PersonView { personId: string; label: string; selected: boolean; hasName: boolean }
export interface PeopleList { source: string; people: PersonView[] }
export interface SetPeopleResult { changed: boolean; count: number; capture: Capture }

/** ISS-WALINKS-009: the pairing QR is polled no faster than this (the server limits 30/min/link and a QR lives about a minute). */
export const QR_POLL_MIN_MS = 3000;

const base = "/whatsapp/links";
const lp = (id: string): string => `${base}/${encodeURIComponent(id)}`;
const gp = (id: string, jid: string): string => `${lp(id)}/groups/${encodeURIComponent(jid)}`;

export const getNotice = (k: string | null): Promise<Notice> => apiFetch(`${base}/notice`, k);
export const listLinks = (k: string | null): Promise<{ links: LinkView[] }> => apiFetch(base, k);
export const getLink = (k: string | null, id: string): Promise<{ link: LinkView }> => apiFetch(lp(id), k);
export const requestLink = (k: string | null, input: { label: string; noticeVersion: string }): Promise<{ link: LinkView }> => apiFetch(base, k, { method: "POST", body: input });
/** Owner only. Rate-limited server side (429 + Retry-After); never call it faster than `QR_POLL_MIN_MS`. */
export const connectLink = (k: string | null, id: string): Promise<ConnectView> => apiFetch(`${lp(id)}/connect`, k);

export const approveLink = (k: string | null, id: string, studentData: StudentData): Promise<{ link: LinkView }> => apiFetch(`${lp(id)}/approve`, k, { method: "POST", body: { studentData } });
export type LinkAction = "reject" | "suspend" | "resume" | "revoke" | "unlink";
export const linkAction = (k: string | null, id: string, action: LinkAction): Promise<{ link: LinkView; changed?: boolean }> => apiFetch(`${lp(id)}/${action}`, k, { method: "POST", body: {} });

export const listGroups = (k: string | null, id: string): Promise<GroupList> => apiFetch(`${lp(id)}/groups`, k);
export const setGroup = (k: string | null, id: string, jid: string, body: { marked: boolean; trackAllSenders?: boolean }): Promise<SetGroupResult> => apiFetch(gp(id, jid), k, { method: "PUT", body });
export const listPeople = (k: string | null, id: string, jid: string): Promise<PeopleList> => apiFetch(`${gp(id, jid)}/people`, k);
export const setPeople = (k: string | null, id: string, jid: string, personIds: string[]): Promise<SetPeopleResult> => apiFetch(`${gp(id, jid)}/people`, k, { method: "PUT", body: { personIds } });

/**
 * ISS-WASEL-002. The archiver keeps capture at "all" while a group's trackAllSenders is true, so choosing people alone changes nothing.
 * Order is fixed: (1) when the group captures everyone, PUT it with trackAllSenders:false; (2) PUT the people; (3) read the capture
 * mode back from that response and return it. A group that is not "all" skips step 1. The caller shows the returned `capture`, so a
 * restriction that did not take effect is visible rather than assumed.
 */
export async function restrictToPeople(k: string | null, id: string, group: GroupView, personIds: string[]): Promise<SetPeopleResult> {
  if (group.trackAllSenders) await setGroup(k, id, group.jid, { marked: true, trackAllSenders: false });
  return setPeople(k, id, group.jid, personIds);
}

const RETRY = (e: ApiError): string => (e.retryAfterSeconds !== undefined ? ` Try again in about ${Math.max(1, e.retryAfterSeconds)} second(s).` : "");
/** One plain sentence per failure the links and selection routes can produce; never the server's own text. */
export function describeLinkError(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong. Try again.";
  switch (err.code) {
    case "archiver_api_unavailable": return "The WhatsApp service is temporarily unavailable. Try again shortly.";
    case "selection_unavailable": return "Choosing groups is temporarily unavailable. Try again shortly.";
    case "links_unavailable": return "WhatsApp links are temporarily unavailable. Try again shortly.";
    case "notice_unavailable": return "The notice text is unavailable, so a link cannot be requested right now.";
    case "approval_expired": return "The approval expired after 14 days. Request a new link.";
    case "link_exists": return "You already have a WhatsApp link.";
    case "link_blocked": return "An administrator must clear a block before you can request a new link.";
    case "self_approval_forbidden": return "Only the sole administrator may approve their own request.";
    case "invalid_state": return "That is not possible in the link's current state.";
    case "group_not_marked": return "Capture this group first, then choose people.";
    case "archiver_owner_unavailable": return "The WhatsApp session for this link is no longer available. Ask an administrator.";
    case "csrf": return "Your session needs a refresh. Reload the page.";
    default: break;
  }
  switch (err.status) {
    case 0: return "Cannot reach the server. Check your connection and try again.";
    case 400: return "That request was not valid.";
    case 401: return "You were signed out. Sign in again.";
    case 403: return err.code === "read_only_role" ? "Your role is read-only." : "You do not have access to that.";
    case 404: return "That could not be found.";
    case 429: return `Too many requests.${RETRY(err) || " Wait a little and try again."}`;
    case 503: return "The WhatsApp service is temporarily unavailable. Try again shortly.";
    default: return "Something went wrong. Try again.";
  }
}
