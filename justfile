default:
    just --list

# Sync canonical assets from the repo root into each app
sync-assets:
    bun scripts/sync-assets.ts

# ---- Extension ----
# Run the extension dev server (WXT)
dev-extension:
    cd apps/extension && bun run dev

# Build the extension (WXT)
build-extension:
    cd apps/extension && bun run build

# Package the extension into a zip
zip-extension:
    cd apps/extension && rm -f slothsign.zip && bun run zip

# ---- CLI ----
# Build the CLI binaries and write bin/version.txt
build-cli:
    cd apps/cli && bun run build

# ---- Phone ----
# Regenerate the Android native project from app.json
sync-phone:
    cd apps/phone && EXPO_NO_GIT_STATUS=1 bunx expo prebuild --platform android --no-install --clean

# Build the signed Android release APK for arm64 (sync-phone regenerates the native project first)
build-phone: sync-phone
    bash scripts/build-phone.sh

# Install the built release APK on the connected phone, keeping its wallets
install-phone:
    adb install --user 0 -r apps/phone/android/app/build/outputs/apk/release/app-release.apk

# Upload the release APK to R2
upload-phone:
    rclone copyto apps/phone/android/app/build/outputs/apk/release/app-release.apk r2:public/slothsign/app-release.apk

# ---- Checks & tests ----
# Type-check, lint, and format all packages and apps
check:
    bun run --if-present --workspaces check && bunx oxlint --fix && bunx oxfmt

# Run the bun:test unit tests
test:
    bun run --if-present --workspaces test
