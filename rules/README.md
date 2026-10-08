# Orders — Firestore rules (candidate, NOT live yet)

All UNICO apps share ONE ruleset: `~/attendance-app/firestore.rules`, published with `~/attendance-app/jobs/deployRules.js`.
This folder only holds the tighter Orders block and its tests. Nothing here is deployed by the app's `npm run deploy`.

- `orders-rules-block.txt` — the replacement for the 3-line Orders block (owner-only deletes / cancel / money, users list readable by listed people only, staff cannot mark a group line sent or re-send a sent one, order numbers only from the counter, no phone can write an AUDIT entry, manager
  cannot remove a line, names add-only for staff, write-once log readable by the owner only, counter only goes up).
- `build-candidate.py` — writes `firestore.rules.candidate` = the canonical file with only the Orders block replaced.
- `orders.rules.test.mjs` — 24 emulator tests (what the manager's app really does must pass; what he must never do
  must fail). Run: `cd ~/laser-rules-test && cp ~/orders/rules/orders.rules.test.mjs . && firebase emulators:exec --only firestore --project unico-operations "node --test orders.rules.test.mjs"`

To publish (owner's decision; the canonical file is shared with other apps and may hold another session's unpublished edits):
1. `cd ~/attendance-app/jobs && node getRules.js` and make sure the canonical file equals what is live (or that any difference is meant).
2. Replace the Orders block in `~/attendance-app/firestore.rules` with `orders-rules-block.txt`, re-run the tests against it (`RULES=~/attendance-app/firestore.rules`).
3. `node deployRules.js --dry`, then `node deployRules.js`, then `node auditAllRules.js`.
4. On both phones: sign in, enter an order, mark a dispatch, correct an order, settle a doubt.
