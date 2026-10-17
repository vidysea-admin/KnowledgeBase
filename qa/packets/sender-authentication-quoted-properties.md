# Checker packet — sender-authentication-quoted-properties

**Cycle:** 1; building/in-progress. **Checker:** /root/docker_dependency_review/checker_t052.

Changed source: packages/core/src/domain/sender-authentication.ts adds normalizePropertyQuotes before the existing stripComments/semicolon/token parser. Only ptype.property="nonempty-printable-atom" is dequoted; delimiter/control/escape/comment/method quotation fails before method parsing. Alignment and receiver selection code below this change are unchanged.

New focused test: packages/core/src/domain/sender-authentication-quoted-properties.test.ts. Five tests cover the sanitized actual Zoom quoted SMTP grammar, valid exact quoted domain/DKIM/SPF atoms, wrong alignment, quoted method/result/receiver, malformed/suffix/control/comment injection, escaped/quoted semicolons and duplicate receiver/DMARC precedence.

Actual grammar retained privately in the earlier connected Gmail read: mx.google.com; dkim=pass header.i=@zoom.us; spf=pass smtp.mailfrom="bounces+<redacted-recipient-token>@bounce-sg.zoom.us"; dmarc=pass (p=REJECT...) header.from=zoom.us. Public fixtures use synthetic recipient text. Observed DMARC-pass source evidence is distinct from actual assessSender execution; no post-change live authentication result is claimed.

Immediate consumers: apps/api/src/gws/gws-gmail.ts and store.ts use the canonical assessment for senderAuthenticated. Auto-join/profile gates retain their existing trust semantics. New inactive zoom-registration-proof.ts also consumes this same canonical assessment; no active D-079 consumer imports the inactive provider exception.

Standing oracle amendment reviewed independently by checker_t052: the original literal `mx.google.com; dmarc=pass header.from="ashoka.edu.in"` with From `a@ashoka.edu.in` remains VERBATIM as an explicit positive in the new test. Only that old negative entry becomes an additional unterminated-quote refusal. Quoting changes property representation, while exact domain, single receiver and DMARC-pass semantics remain the same. All other standing assertions are unchanged. No blanket RFC grammar compliance is claimed.

Frozen review: ARCHITECTURE.md and contracts/ contain no literal quoted Authentication-Results rejection rule; contracts/contracts.json stages is empty. The quoted-email refusal in qa/contracts/iss-capture-001 criterion 3 remains enforced by the unchanged strict From/email parser. No frozen or checker-owned file was edited.

D-015 floor queued verbatim: packages/meeting-bot/src/calendar/sender-authentication.test.ts covers ISS-322 four unauthenticated refusals plus four authenticated positives and ISS-333 d/e; apps/api/src/routes/meeting-candidates.test.ts covers ISS-333 a/b/c and ISS-CAPTURE-003 exact multi-@ scan/store refusal. Core standing and apps/api/src/gws/gws-gmail.test.ts cover the immediate assessment/acquisition consumer. Required counts are ISS-322 4+4, ISS-333 5 and ISS-CAPTURE-003 1; no new run result is claimed yet.

Broker commands: node --test --import tsx packages/core/src/domain/sender-authentication.test.ts packages/core/src/domain/sender-authentication-quoted-properties.test.ts; direct core compiler and applicable verifier. No test has run yet; current hashes and exit/output/duration will be added before ready-for-check. Independent criteria/verdict and actual downstream source evidence are required. No external action, production write, scope pivot or full T-052 PASS is conferred.

Current source SHA256 pins (BUILDING, unvalidated): parser `D2475FC7FE1D79C593993AFB069E8329052B9BC18469570F8A04C590D4A040E4`; standing tests `1C2F83EC4B13B121DE521459493FE7CE34024A9C6F159CE5A5B15ABF6721136E`; new tests `5B4BE8FD124F2478EF9795069B5682E02D8A9F438DA7D68CC1AEC5CC65BFC106`. Independent contract SHA256 `E099415E75307AE7C425FEC714B668AC4FEF17155AC7CAED86197C0393AD1CA5`. Final caller pins and broker output remain pending.
