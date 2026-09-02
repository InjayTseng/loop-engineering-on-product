#!/usr/bin/env bash
# ios-shot.sh — correctness gate + observation for an iOS app.
# Builds THIS checkout for the simulator, installs + launches it, and screenshots.
# Exit 0 = build+launch OK (screenshot at $1); exit 1 = BUILD FAILED (tail of log printed).
#
# Usage: scripts/adapters/ios-shot.sh [/path/out.png]
# Env (from loop.config.env): IOS_PROJECT, IOS_SCHEME, IOS_BUNDLE_ID, IOS_SIM
# Boots $IOS_SIM if needed (open -a Simulator yourself if you want to watch).
set -e
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
echo "{\"ok\": true, \"screenshot\": \"$OUT\", \"built_from\": \"$ROOT\"}"
