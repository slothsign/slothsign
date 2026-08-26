# SlothSign

> **Just sign.**

SlothSign is a minimalist, cross-chain isolated signer — not another hot wallet.

It isolates the one step that needs the hardest security boundary: **signing**. DApps and your browser keep doing business logic and network access; SlothSign handles private-key isolation, transaction understanding, human confirmation, and cryptographic signing. It sits between hot and hardware wallets: hardware-grade key isolation with software-grade UX.

## Why

- **Hot wallets** are feature-heavy and self-interested — accounts, RPC, balances, swaps, staking, DApp browsers. For users who just want an address to sign, that's baggage, and it rarely supports pure, account-agnostic signing across chains and devices.
- **Hardware wallets** isolate keys well but pair, unlock, and confirm awkwardly; their tiny screens can't render complex transactions, and Solana quickly degrades to blind signing.
- A dedicated, long-offline signing device gives near-hardware isolation with a far larger screen and real decoding ability.

## Principles

1. **Not a wallet** — no balances, portfolio, history, swaps, bridges, or DApp browser.
2. **Only signing** — `request → understand → confirm → sign → return signature`.
3. **Key isolation** — the extension and DApp never hold private keys.
4. **No forced pairing** — pure data transport via text, clipboard, or QR.
5. **Network-decoupled** — RPC and broadcast stay with the DApp.
6. **Honest display** — anything it can't decode is explicitly marked unknown, never disguised as understood.

## Features

- **Cross-chain**: EVM (EIP-1193 / EIP-6963) and Solana (wallet-standard).
- **Extension as transport + signer provider** — exposes the signer without touching keys.
- **Three signing modes** per address: `watch-only`, `qr` (offline phone / CLI), `trezor`.
- **Unified `SignerRequest` envelope** (`sloth://req/…`, result `sloth://sig/…`) handled by per-chain adapters.
- **Local keystore** (BIP-39, scrypt + AES) for CLI signing; a single mnemonic derives both EVM and Solana keys.
- **Intent rendering** that decodes transactions, messages, and typed data — and says _unknown_ when it can't.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/slothsign/slothsign/main/scripts/install.sh | sh
```

The install script picks the right binary for your OS/arch, marks it executable, and (on macOS) clears the Gatekeeper quarantine. Once installed, keep it current with:

```sh
sloth update
```

## License

MIT
