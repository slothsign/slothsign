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
    cd apps/extension && bun run zip

# ---- CLI ----
# Build the CLI binaries and write bin/version.txt
build-cli:
    cd apps/cli && bun run build

# ---- Checks & tests ----
# Type-check, lint, and format all packages and apps
check:
    bun run --if-present --workspaces check && bunx oxlint --fix && bunx oxfmt

# Run the bun:test unit tests
test:
    bun run --if-present --workspaces test
