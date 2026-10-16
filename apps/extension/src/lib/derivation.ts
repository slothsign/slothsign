import type { Chain } from "@slothsign/core";

export const DEFAULT_EVM_PATH = "m/44'/60'/0'/0/0";
export const DEFAULT_SOLANA_PATH = "m/44'/501'/0'/0'";

export function defaultPath(chain: Chain): string {
  return chain === "solana" ? DEFAULT_SOLANA_PATH : DEFAULT_EVM_PATH;
}

export function normalizeEvmPath(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed || DEFAULT_EVM_PATH;
}
