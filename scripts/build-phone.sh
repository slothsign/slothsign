#!/usr/bin/env bash
# Builds the signed Android release APK. Expects the keystore secrets in the environment.
set -euo pipefail

: "${SLOTHSIGNER_KEYSTORE_BASE64:?Run this with the keystore secrets in the environment}"
: "${SLOTHSIGNER_KEYSTORE_PASSWORD:?Run this with the keystore secrets in the environment}"

keystore=$(mktemp)
trap 'rm -f "$keystore"' EXIT
printf %s "$SLOTHSIGNER_KEYSTORE_BASE64" | base64 -d > "$keystore"
export SLOTHSIGNER_KEYSTORE_PATH="$keystore"

# No daemon, so the password doesn't stay in a background process after the build.
cd apps/phone/android
./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon
