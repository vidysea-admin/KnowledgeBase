/**
 * D-015 corpus: every recorded ISS-T040GEN-* attack reproduction (qa/issues.t040gen.jsonl; ISS-T040GEN-012 is recorded in the
 * lane t040reject ledger row of the same file), transcribed VERBATIM: the source turn text and the quote the attack ships.
 * Each case carries an ORACLE label: the quote asserts something different from its source. The offline replay uses these
 * labels in a deterministic fake judge; it proves the wiring, not any model. ISS-T040GEN-001/-003/-004/-005 record no
 * negation/polarity attack (recall loss, span cuts, missing schema kind, un-wired caller) so they have no cases here.
 */
export interface AttackCase { id: string; text: string; quote: string }
const c = (id: string, text: string, quote: string): AttackCase => ({ id, text, quote });

export const ATTACKS: AttackCase[] = [
  // ISS-T040GEN-002
  c("ISS-T040GEN-002", "We do not recommend applying in March", "recommend applying in March"),
  c("ISS-T040GEN-002", "I do not think it is safe to wait", "think it is safe to wait"),
  // ISS-T040GEN-006
  c("ISS-T040GEN-006", "I do not think e.g. March works for everyone.", "March works for everyone."),
  c("ISS-T040GEN-006", "We do not accept applications from the U.S. after March first.", "after March first."),
  c("ISS-T040GEN-006", "We do not recommend it vs. applying in March works.", "applying in March works."),
  c("ISS-T040GEN-006", "We do not recommend this approx. 3.5 lakh fee.", "3.5 lakh fee."),
  c("ISS-T040GEN-006", "He said we do not recommend it, Dr. Rao recommends applying in March.", "Rao recommends applying in March."),
  // ISS-T040GEN-007 (b)
  c("ISS-T040GEN-007", "Apply in March? Absolutely not.", "Apply in March?"),
  c("ISS-T040GEN-007", "Should we apply in March? Definitely not!", "Should we apply in March?"),
  // ISS-T040GEN-008
  c("ISS-T040GEN-008", "We do not accept Pvt. Colleges applications after March first.", "Colleges applications after March first."),
  c("ISS-T040GEN-008", "I do not recommend Univ. Admissions in March for everyone.", "Admissions in March for everyone."),
  c("ISS-T040GEN-008", "We never take Asst. Professors in March for this program.", "Professors in March for this program."),
  c("ISS-T040GEN-008", "I do not think Ave. Road students apply in March.", "Road students apply in March."),
  c("ISS-T040GEN-008", "I do not think the Pkwy. Campus works for everyone in March.", "Campus works for everyone in March."),
  c("ISS-T040GEN-008", "We do not apply in the Q1. March works for everyone else.", "March works for everyone else."),
  // ISS-T040GEN-009
  c("ISS-T040GEN-009", "Apply in March. Wrong.", "Apply in March."),
  c("ISS-T040GEN-009", "Apply in March. Incorrect.", "Apply in March."),
  c("ISS-T040GEN-009", "Apply in March. I disagree.", "Apply in March."),
  c("ISS-T040GEN-009", "Apply in March. That is false.", "Apply in March."),
  c("ISS-T040GEN-009", "Apply in March. Bad idea.", "Apply in March."),
  c("ISS-T040GEN-009", "He is wrong; apply in March.", "apply in March."),
  // ISS-T040GEN-010 (the row names pvt.; "same for univ. Colleges, mgmt. Quota, pg. Courses")
  c("ISS-T040GEN-010", "We do not accept pvt. Colleges applications after March first.", "Colleges applications after March first."),
  c("ISS-T040GEN-010", "We do not accept univ. Colleges applications after March first.", "Colleges applications after March first."),
  c("ISS-T040GEN-010", "We do not accept mgmt. Quota applications after March first.", "Quota applications after March first."),
  c("ISS-T040GEN-010", "We do not accept pg. Courses applications after March first.", "Courses applications after March first."),
  // ISS-T040GEN-011
  c("ISS-T040GEN-011", "Fees are 1000 rupees. Wrong.", "Fees are 1000 rupees."),
  c("ISS-T040GEN-011", "Fees are 1000 rupees. Ignore that.", "Fees are 1000 rupees."),
  c("ISS-T040GEN-011", "Fees are 1000 rupees. Not for freshers at this college though.", "Fees are 1000 rupees."),
  // ISS-T040GEN-012
  c("ISS-T040GEN-012", "Admission is open for pvt. Colleges do not take March applications.", "Admission is open for pvt."),
  c("ISS-T040GEN-012", "Seats are open in pvt. Colleges but not in govt ones.", "Seats are open in pvt."),
  c("ISS-T040GEN-012", "Seats are open in pvt. Colleges only if you apply early.", "Seats are open in pvt."),
];

/** Benign controls the oracle labels "same": a faithful whole-sentence note must still ship. */
export const CONTROLS: { text: string; quote: string }[] = [
  { text: "The programme fee is 1,000 rupees today.", quote: "The programme fee is 1,000 rupees today." },
  { text: "We decided to open the intake in March.", quote: "We decided to open the intake in March." },
  { text: "We do not accept applications after March first.", quote: "We do not accept applications after March first." },
];
