#!/usr/bin/env bash
# Runs every Node / Playwright test and prints a pass/fail summary. Usage: GN_VENDOR=/path/with/node_modules tests/run-all.sh
cd "$(dirname "$0")/.."
TESTS="t-rules t-dice t-snake-sim t-brawl-sim t-audio t-hub t-ui t-net t-customize t-ludo-smoke t-ludo-full t-ludo-online t-snake-full t-snake-online t-brawl-full t-brawl-online"
fail=0
for t in $TESTS; do
  start=$(date +%s)
  if timeout 900 node tests/$t.mjs > /tmp/gn-$t.log 2>&1; then echo "PASS  $t ($(( $(date +%s) - start ))s)"; else echo "FAIL  $t ($(( $(date +%s) - start ))s)  see /tmp/gn-$t.log"; tail -n 8 /tmp/gn-$t.log; fail=1; fi
done
exit $fail
