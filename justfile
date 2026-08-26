# Sync canonical assets from <root>/assets into each app
sync-assets:
    bun scripts/sync-assets.ts

# ---- Extension ----
dev-extension:
    cd apps/extension && bun run dev

build-extension:
    cd apps/extension && bun run build

zip-extension:
    cd apps/extension && bun run zip

# ---- Checks & tests ----
check:
    bun run --if-present --workspaces check && bunx oxlint --fix && bunx oxfmt

test:
    bun run --if-present --workspaces test
