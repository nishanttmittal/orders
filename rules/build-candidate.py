#!/usr/bin/env python3
"""Build a CANDIDATE ruleset = the canonical attendance-app/firestore.rules with ONLY the Orders block replaced by
orders-rules-block.txt. Writes the candidate next to this script; never touches the canonical file."""
import re, sys, pathlib
here = pathlib.Path(__file__).parent
src = pathlib.Path('/home/nishel/attendance-app/firestore.rules').read_text()
block = (here / 'orders-rules-block.txt').read_text().rstrip('\n') + '\n'
a = src.index('    // ---- Orders (allowlist-locked')
b = src.index("    match /apps/orders { allow read, write: if oUser(); }\n", a) + len("    match /apps/orders { allow read, write: if oUser(); }\n")
old = src[a:b]
assert old.count('match /apps/orders') == 3, 'Orders block is not the shape expected — stop and look'
out = src[:a] + block + src[b:]
(here / 'firestore.rules.candidate').write_text(out)
print('old Orders block lines:', old.count('\n'), '| new:', block.count('\n'), '| candidate bytes:', len(out))
