/** Policy Ask accepts the API's 4000 UTF-16 character bound for explicit drafts.
 * URL and Search handoffs retain their separate shared 512-code-point bound.
 */
export function normalizePolicyQuestion(raw: string): string {
  let head = raw.slice(0, 4000);
  // Do not create a lone surrogate when a supplementary character crosses the bound.
  if (/[\uD800-\uDBFF]$/.test(head)) head = head.slice(0, -1);
  return head.replace(/[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, " ").trim();
}
