import type { AccountRef } from "@slothsign/core";

export type SignerMode = "watch-only" | "keystone-qr" | "trezor" | "address-qr";

export interface WalletConfig extends AccountRef {
  id: string;
  signer: SignerMode;
  label: string;
  createdAt: number;
  /** BIP-32 derivation path (keystone-qr EVM / AirGap Vault). */
  path?: string;
  /** Extended public key at the derivation path (keystone-qr EVM / AirGap Vault). */
  xpub?: string;
  /** Whether the address matches the address derived from path+xpub. */
  validated?: boolean;
}
