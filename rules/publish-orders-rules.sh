#!/bin/bash
# Publish ONLY the tighter Orders rules. The owner runs this and types the project id when asked.
#
# Why a script: all apps share one rules file (~/attendance-app/firestore.rules), and that file may hold another
# session's edits that are not published yet (08-10-2026: Falcon). This publishes "what is LIVE now + the new Orders
# block" and nothing else, then puts the shared file back exactly as it was, with the same Orders block added to it
# (so a later publish of that other work cannot bring the old Orders rules back).
set -euo pipefail
CANON=/home/nishel/attendance-app/firestore.rules
JOBS=/home/nishel/attendance-app/jobs
HERE=/home/nishel/orders/rules
TMP="$(mktemp -d)"
STAMP="$(date +%F_%H%M%S)"
WIP="/home/nishel/.claude/backups/firestore.rules.shared-before-orders-publish.$STAMP"

cp -p "$CANON" "$WIP"; chmod 600 "$WIP"
(cd "$JOBS" && LIVE_OUT="$TMP/live.rules" node -e "const {client,liveFirestoreRules}=require('./getRules');(async()=>{const r=await liveFirestoreRules(await client());require('fs').writeFileSync(process.env.LIVE_OUT,r.content)})().catch(e=>{console.error(e.message);process.exit(1)})")
python3 "$HERE/build-candidate.py" "$TMP/live.rules" "$TMP/A.rules" >/dev/null   # live + Orders block
python3 "$HERE/build-candidate.py" "$WIP" "$TMP/B.rules" >/dev/null             # shared file + Orders block

restore() {
  # the shared file always ends as: what it was + the Orders block (unless someone else changed it meanwhile)
  if cmp -s "$CANON" "$TMP/A.rules" || cmp -s "$CANON" "$WIP"; then cp "$TMP/B.rules" "$CANON"; echo "Shared rules file put back (other unpublished work kept, Orders block added)."
  else echo "⚠ The shared rules file was changed by someone else during this run — left as it is. Copy before this run: $WIP"; fi
}
trap restore EXIT

cp "$TMP/A.rules" "$CANON"
echo "Publishing: the live rules + the new Orders block only. Type the project id when asked."
(cd "$JOBS" && node deployRules.js)
(cd "$JOBS" && LIVE_OUT="$TMP/after.rules" node -e "const {client,liveFirestoreRules}=require('./getRules');(async()=>{const r=await liveFirestoreRules(await client());require('fs').writeFileSync(process.env.LIVE_OUT,r.content)})()")
if cmp -s "$TMP/after.rules" "$TMP/A.rules"; then echo "✅ LIVE: the new Orders rules are published."; else echo "✗ NOT published (live rules are unchanged or different). Nothing else was touched."; fi
