/**
 * apps/web/src/pages/join-rules/enforcement.ts - the ONE switch for what the web UI may promise about join rules.
 *
 * `JOIN_RULES_ENFORCED = false` because the scheduler does not apply join rules yet (`applyJoinRules` is not called by it;
 * wiring it needs the Approver's ruling on contract precondition W3, qa/contracts/t037-join-rules-veto-select.md).
 * Until then the UI says rules, approvals and opt-outs are RECORDED and may not stop the bot. When the scheduler is wired,
 * flip this ONE constant to true: every enforced variant below is already written and tested.
 * Never let a string say "will not join" while this is false.
 */
export const JOIN_RULES_ENFORCED = false;

const NOT_ENFORCED = "Join rules are not enforced by the bot yet, so it may still join until enforcement is switched on.";

export interface OptOutCopy { confirm: string; sharedLink: string; undo: string; done: string }

/** Opt-out wording for the Calendar page. `sharedLink` is shown only when a meeting link is sent. */
export function optOutCopy(enforced: boolean): OptOutCopy {
  return enforced
    ? {
      confirm: "The bot will not join this meeting, even if a rule or an approval would otherwise allow it.",
      sharedLink: "Opting out by this link also applies to other meetings that use the same link (recurring series, personal rooms).",
      undo: "Undoing an opt-out is not available in this screen yet.",
      done: "Opted out: the bot will not join this meeting.",
    }
    : {
      confirm: `This records an opt-out for this meeting. ${NOT_ENFORCED}`,
      sharedLink: "Opting out by this link will, once enforcement is on, also apply to other meetings that use the same link (recurring series, personal rooms).",
      undo: "Undoing an opt-out is not available in this screen yet.",
      done: "Opt-out recorded for this meeting. It is not enforced by the bot yet: the bot may still join until enforcement is switched on.",
    };
}

export const UNRECOGNISED_LINK_NOTE = "Recorded for this calendar entry only. The link could not be recognised as a meeting link, so a separate invitation for the same meeting would not be covered.";
export const LINK_NOT_NEW_NOTE = "No new link identity was added: the link was either already recorded or could not be recognised as a meeting link.";

/** Page-level and editor strings on the join-rules page. */
export function pageCopy(enforced: boolean): { subtitle: string; approvalsNote: string; noRules: string; allow: string; deny: string; noticeSuffix: string } {
  return enforced
    ? {
      subtitle: "Decide which meetings the bot may join without a human click.",
      approvalsNote: "An approval makes the bot join future meetings from that sender or domain with no human click.",
      noRules: "There are no rules. Without a rule or an approval, the bot never joins on its own.",
      allow: "allow (join with no click)", deny: "deny (never join)", noticeSuffix: "",
    }
    : {
      subtitle: `Edit the join rules. They are stored but not applied yet: ${NOT_ENFORCED}`,
      approvalsNote: "An approval is recorded so that, once enforcement is switched on, the bot joins future meetings from that sender or domain with no human click. It is not enforced yet.",
      noRules: "There are no rules. Once enforcement is switched on, a meeting needs a rule or an approval before the bot joins it on its own.",
      allow: "allow (join with no click, once enforced)", deny: "deny (do not join, once enforced)",
      noticeSuffix: " Recorded only: the bot does not enforce join rules yet.",
    };
}
