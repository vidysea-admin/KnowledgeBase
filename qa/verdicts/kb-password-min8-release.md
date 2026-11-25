# KB password minimum release

Cycle checked: 3 (focused repair, expressly approved by Umesh)
Verdict: PASS

Independent checks covered the shared password policy, password hashing, the account routes, UI text, and the real desktop-to-bootstrap handoff. The earlier checks retained one desktop isolation blocker. The final scoped reviewers verified both fixes on the same helper snapshot. The app source and candidate images are unchanged from the earlier checks.

- Optimized Python still enforces five explicit instance and database restrictions. Receipt: `qa/.delivery/f4b2bcdf174aea557d87be164ac2127042a307797269bdb791849a8e958cb251.log`.
- The test launcher constructs a single direct loopback URI and verifies the port, scratch path, loopback binding and owning process. Receipt: `qa/.delivery/87c8ab1d88994a99cedac73d50074a949142f4f369d5c512853828347935029a.log`.
- Real disposable MongoDB received one eligible eight-digit bootstrap through the desktop form. Seven digits failed before account creation. Closed-vocabulary refusal text contained no input. The live first-account check is tracked separately in the release report.
