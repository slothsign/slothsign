# AGENTS.md

## Tech Stack

- bun monorepo
- Shared packages (`packages/`): `@slothsign/core`, `@slothsign/keystore`, `@slothsign/chain-evm`, `@slothsign/chain-solana`
- App: `apps/extension` — cross-chain signing extension (EVM + Solana) built with WXT
  - Framework: React 19 + TypeScript; entrypoints under `src/entrypoints/`
  - UI: shadcn v4 (`src/components/ui/`); Tailwind CSS v4, prefer named scale utilities (e.g. `text-xs`, `size-4`) over arbitrary-value classes (e.g. `text-[10px]`)
  - Icons: lucide-react (shadcn `iconLibrary: lucide`); unplugin-icons + `@iconify-json/mdi` remain wired in `wxt.config.ts` for `~icons/…` imports
  - State: zustand; use `useShallow` from `zustand/react/shallow` to batch selectors
  - Validation: zod (form + runtime message schemas in `src/lib/`)
  - Signing types in `@slothsign/core` (`AccountRef`, `SignerRequest`); chain adapters in `@slothsign/chain-evm` / `@slothsign/chain-solana`
  - Import alias: `@/*` → `./src/*`
  - shadcn CLI: always use the latest (`bunx shadcn@latest add …`); WXT isn't auto-detected, so `components.json` is managed manually

## Development

- Run `just check` to type-check, lint and format all packages and apps.
- Run `just test` to run the `bun:test` unit tests (`packages/core`, `packages/chain-evm`, `packages/chain-solana`).
- `just sync-assets` generates all icons from the canonical `assets/sloth.svg`: it copies the SVG into each app's `src/assets/` and renders PNG icons into `apps/extension/public/` (the manifest references `icon-*.png` relative to publicDir, so they land at the dist root).
- New native deps with install scripts must be added to `trustedDependencies` in the root `package.json` (the field replaces bun's default allow-list).
- Always install dependencies with `bun add` (installs the latest version); never hand-edit `package.json` dependency entries.

## Conventions

- Do not show implementation details to users.
- Do not modify shadcn components directly.
