import type { Chain } from "viem";
import {
  arbitrum,
  arbitrumSepolia,
  aurora,
  avalanche,
  base,
  baseSepolia,
  blast,
  bsc,
  celo,
  cronos,
  fantom,
  gnosis,
  linea,
  mainnet,
  mantle,
  moonbeam,
  moonriver,
  opBNB,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
  polygonZkEvm,
  scroll,
  sepolia,
  zksync,
} from "viem/chains";

export const EVM_CHAINS: Chain[] = [
  mainnet,
  sepolia,
  optimism,
  optimismSepolia,
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia,
  bsc,
  polygon,
  polygonAmoy,
  avalanche,
  gnosis,
  linea,
  zksync,
  scroll,
  polygonZkEvm,
  celo,
  fantom,
  moonbeam,
  moonriver,
  cronos,
  aurora,
  opBNB,
  blast,
  mantle,
];

export function getEvmRpcUrl(chain: Chain, custom?: Record<string, string>): string | undefined {
  if (custom) {
    const customUrl = custom[chainIdToHex(chain.id)];
    if (customUrl) return customUrl;
  }
  return chain.rpcUrls.default.http[0];
}

export function parseChainId(chainId: string | number): number | undefined {
  const id =
    typeof chainId === "string" ? Number.parseInt(chainId.replace(/^0x/i, ""), 16) : chainId;
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

export function chainIdToHex(id: number): string {
  return `0x${id.toString(16)}`;
}

export function getEvmChain(chainId: string | number): Chain | undefined {
  const id = parseChainId(chainId);
  if (id === undefined) return undefined;
  return EVM_CHAINS.find((c) => c.id === id);
}
