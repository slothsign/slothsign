import {
  announceEvmProvider,
  handleNotification as handleEvmNotification,
} from "./src/entrypoints/provider/evm";
import {
  handleNotification as handleSolanaNotification,
  registerSolanaProvider,
} from "./src/entrypoints/provider/solana";
import { isWindowNotification } from "./src/entrypoints/provider/shared";

// MAIN-world providers: EIP-6963 (EVM) + wallet-standard (Solana).
// All logic lives in src/entrypoints/provider/; this file just wires the
// page's postMessage notifications back into the providers.

announceEvmProvider();
registerSolanaProvider();

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (!isWindowNotification(event.data)) return;
  const handler =
    event.data.chain === "ethereum" ? handleEvmNotification : handleSolanaNotification;
  handler(event.data);
});
