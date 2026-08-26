export type Chain = "ethereum" | "solana";

/**
 * Reference to an account: its chain and address.
 * Functions that deal with an address should accept this shape.
 */
export interface AccountRef {
  chain: Chain;
  /** EVM address or Solana public key (base58) */
  address: string;
}
