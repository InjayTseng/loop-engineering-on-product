#!/usr/bin/env bash
# ios-shot.sh — correctness gate + observation for an iOS app.
# Builds THIS checkout for the simulator, installs + launches it, and screenshots. With IOS_TEST=1 it also
# runs the scheme's tests and writes one line per test ("PASSED Suite/testName()") to a text file, so a
# validator can show the specific test that covers a CLAIM — a bare "180 passed" shows no behavior, and a
# screenshot is invisible to text-only checks such as Jev claim-evidence (docs/09-jev.md).
# Exit 0 = build + launch (+ tests) OK; exit 1 = BUILD FAILED / TESTS FAILED (details printed).
#
# Usage: scripts/adapters/ios-shot.sh [/path/out.png]
#        scripts/adapters/ios-shot.sh --list-tests <result.xcresult>   (per-test lines only; reusable by
#                                                                     your own adapter)
# Env (from loop.config.env): IOS_PROJECT, IOS_SCHEME, IOS_BUNDLE_ID, IOS_SIM,
#      IOS_TEST (0|1, default 0), IOS_TESTS_OUT (default /tmp/loop-tests.txt)
# Boots $IOS_SIM if needed (open -a Simulator yourself if you want to watch).
set -e

list_tests() {  # $1 xcresult → "PASSED|FAILED|SKIPPED|EXPECTED_FAILURE Suite/testName()" per test (Xcode 16+)
  command -v jq >/dev/null || { echo "(per-test list needs jq)" >&2; return 1; }
  xcrun xcresulttool get test-results tests --path "$1" 2>/dev/null \
    | jq -r '.. | objects | select(.nodeType == "Test Case")
             | "\(.result // "Unknown" | ascii_upcase | gsub(" "; "_")) \(.nodeIdentifier // .name)"'
}
if [ "${1:-}" = "--list-tests" ]; then list_tests "${2:?usage: $0 --list-tests <result.xcresult>}"; exit $?; fi

OUT="${1:-/tmp/loop-shot.png}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
# Interactive use (/loop-once, /audit) has no driver to export the config — load it here.
[ -f loop.config.env ] && { set -a; . ./loop.config.env; set +a; }
: "${IOS_PROJECT:?set IOS_PROJECT in loop.config.env}"
: "${IOS_SCHEME:?set IOS_SCHEME in loop.config.env}"
: "${IOS_BUNDLE_ID:?set IOS_BUNDLE_ID in loop.config.env}"
IOS_SIM="${IOS_SIM:-iPhone 16 Pro}"
LOG=/tmp/loop-build.log
xcrun simctl boot "$IOS_SIM" >/dev/null 2>&1 || true   # no-op if already booted

# Resolve SPM first: a clean derived-data build otherwise fails to find packages.
xcodebuild -project "$IOS_PROJECT" -scheme "$IOS_SCHEME" -resolvePackageDependencies >/dev/null 2>&1 || true
xcodebuild -project "$IOS_PROJECT" -scheme "$IOS_SCHEME" -sdk iphonesimulator \
  -configuration Debug -derivedDataPath ./build build >"$LOG" 2>&1 \
  || { echo "BUILD FAILED — tail of $LOG:"; tail -40 "$LOG"; exit 1; }

APP=$(find ./build/Build/Products/Debug-iphonesimulator -maxdepth 1 -name "*.app" | head -1)
[ -z "$APP" ] && { echo "no .app found after build"; exit 1; }

xcrun simctl install booted "$APP" >/dev/null 2>&1
xcrun simctl terminate booted "$IOS_BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl launch booted "$IOS_BUNDLE_ID" >/dev/null 2>&1
sleep 8
xcrun simctl io booted screenshot "$OUT" >/dev/null 2>&1

TESTS_JSON=""
if [ "${IOS_TEST:-0}" = "1" ]; then
  RB=./build/loop-tests.xcresult; TLOG=/tmp/loop-test.log; LIST="${IOS_TESTS_OUT:-/tmp/loop-tests.txt}"
  rm -rf "$RB"; trc=0
  xcodebuild test -project "$IOS_PROJECT" -scheme "$IOS_SCHEME" -destination "platform=iOS Simulator,name=$IOS_SIM" \
    -derivedDataPath ./build -resultBundlePath "$RB" >"$TLOG" 2>&1 || trc=$?
  list_tests "$RB" > "$LIST" 2>/dev/null || true
  passed=$(grep -c '^PASSED ' "$LIST" 2>/dev/null || true); failed=$(grep -c '^FAILED ' "$LIST" 2>/dev/null || true)
  echo "TESTS: ${passed:-0} passed, ${failed:-0} failed — one line per test in $LIST."
  echo "  To show the test that covers your CLAIM: grep -i '<behavior>' $LIST"
  grep '^FAILED ' "$LIST" 2>/dev/null | head -20 | sed 's/^/  /' || true
  if [ "$trc" -ne 0 ]; then
    [ "${failed:-0}" -gt 0 ] || { echo "TESTS FAILED to run — tail of $TLOG:"; tail -30 "$TLOG"; }
    exit 1
  fi
  TESTS_JSON=", \"tests\": {\"passed\": ${passed:-0}, \"failed\": ${failed:-0}, \"list\": \"$LIST\"}"
fi
echo "{\"ok\": true, \"screenshot\": \"$OUT\", \"built_from\": \"$ROOT\"$TESTS_JSON}"
