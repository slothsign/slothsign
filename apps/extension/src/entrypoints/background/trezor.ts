import TrezorConnect from "@trezor/connect-webextension";
import { payloadToMessage, payloadToTx, payloadToTypedData } from "@slothsign/chain-evm";
import { defaultPath, type WalletConfig } from "../../lib/config.ts";
import type { SignPendingRequest } from "../../lib/requestStore.ts";

const TREZOR_MANIFEST = {
  email: "hello@slothsign.app",
  appUrl: "https://github.com/slothsign/slothsign",
};

let initPromise: Promise<void> | undefined;

/** Initialize TrezorConnect once per service-worker lifetime. */
export function ensureTrezorConnect(): Promise<void> {
  const current = initPromise;
  if (current) return current;
  const next: Promise<void> = TrezorConnect.init({ manifest: TREZOR_MANIFEST }).then(
    () => undefined,
  );
  initPromise = next;
  next.catch(() => {
    if (initPromise === next) initPromise = undefined;
  });
  return next;
}

interface TrezorTxResult {
  v: string;
  r: string;
  s: string;
}

interface TrezorSignatureResult {
  address: string;
  signature: string;
}

function unwrap<T>(result: unknown, what: string): T {
  const res = result as { success?: boolean; payload?: { error?: unknown } };
  if (res && res.success) return res.payload as T;
  const message =
    res && res.payload && res.payload.error ? String(res.payload.error) : "unknown error";
  throw new Error(`Trezor ${what} failed: ${message}`);
}

function assertDeviceAddress(deviceAddress: unknown, expected: string): void {
  if (typeof deviceAddress !== "string") throw new Error("Trezor returned no address");
  if (deviceAddress.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `Trezor returned address ${deviceAddress}, expected ${expected}. Wrong device or derivation path?`,
    );
  }
}

/**
 * Fetch the account-level extended public key for local address derivation
 * (bulk-add, mismatch warnings). The device asks for confirmation on export.
 */
export async function getTrezorXpub(path: string): Promise<string> {
  if (!path.trim()) throw new Error("Derivation path is required");
  await ensureTrezorConnect();
  const res = unwrap<{ xpub: unknown }>(
    await TrezorConnect.ethereumGetPublicKey({ path, showOnTrezor: true }),
    "public-key export",
  );
  if (typeof res.xpub !== "string" || !res.xpub) throw new Error("Trezor returned no xpub");
  return res.xpub;
}

/**
 * Read the address for a path without prompting on the device. Used as a
 * pre-sign check so a wrong path fails before the user confirms anything.
 * `keepSession` keeps the passphrase session alive for the signing call that
 * follows, so passphrase users are not prompted twice.
 */
async function getTrezorAddressSilent(path: string): Promise<string> {
  const res = unwrap<{ address: unknown }>(
    await TrezorConnect.ethereumGetAddress({ path, showOnDisplay: false, keepSession: true }),
    "address check",
  );
  if (typeof res.address !== "string" || !res.address) {
    throw new Error("Trezor returned no address");
  }
  return res.address;
}

/**
 * Sign an EVM request with the connected Trezor. Returns a 0x-prefixed 65-byte
 * signature hex. Transactions carry an EIP-155 `v`, which the background's
 * `finalizeSignature` cannot parse, so `v` is normalized to a y-parity byte
 * (chain id is re-applied when the transaction is serialized).
 */
export async function signEvmWithTrezor(
  request: SignPendingRequest,
  wallet: WalletConfig | undefined,
): Promise<string> {
  if (request.chain !== "ethereum") {
    throw new Error("Trezor signing is EVM-only for now");
  }
  const signerRequest = request.signerRequest;
  if (!signerRequest) throw new Error("Missing signer request");
  await ensureTrezorConnect();
  const path = wallet?.path || defaultPath("ethereum");

  switch (signerRequest.type) {
    case "transaction": {
      const tx = payloadToTx(signerRequest.payload);
      // Fail before the user confirms anything when the path does not own
      // this wallet's address (the sign response itself carries no address).
      assertDeviceAddress(await getTrezorAddressSilent(path), request.address);
      const transaction: Record<string, unknown> = {
        to: tx.to ?? null,
        value: tx.value ?? "0x0",
        chainId: Number(BigInt(signerRequest.chainId)),
        nonce: tx.nonce,
        gasLimit: tx.gas,
        data: tx.data,
      };
      if (tx.maxFeePerGas !== undefined && tx.maxPriorityFeePerGas !== undefined) {
        transaction.maxFeePerGas = tx.maxFeePerGas;
        transaction.maxPriorityFeePerGas = tx.maxPriorityFeePerGas;
      } else {
        transaction.gasPrice = tx.gasPrice;
      }
      for (const key of Object.keys(transaction)) {
        if (transaction[key] === undefined) delete transaction[key];
      }
      const res = unwrap<TrezorTxResult>(
        await TrezorConnect.ethereumSignTransaction({ path, transaction }),
        "transaction signing",
      );
      const v = BigInt(res.v);
      let yParity: number;
      if (v === 27n) yParity = 0;
      else if (v === 28n) yParity = 1;
      else if (v >= 35n) yParity = Number((v - 35n) % 2n);
      else throw new Error(`Unexpected Trezor v value: ${res.v}`);
      const r = String(res.r).toLowerCase().startsWith("0x")
        ? String(res.r).slice(2)
        : String(res.r);
      const s = String(res.s).toLowerCase().startsWith("0x")
        ? String(res.s).slice(2)
        : String(res.s);
      return `0x${r.padStart(64, "0")}${s.padStart(64, "0")}${yParity === 1 ? "01" : "00"}`;
    }
    case "message": {
      const { message, address } = payloadToMessage(signerRequest.payload);
      const hex = message.startsWith("0x") && /^0x[0-9a-fA-F]*$/.test(message);
      const res = unwrap<TrezorSignatureResult>(
        await TrezorConnect.ethereumSignMessage({ path, message, hex }),
        "message signing",
      );
      assertDeviceAddress(res.address, address);
      return res.signature;
    }
    case "typedData": {
      const { address, typedData } = payloadToTypedData(signerRequest.payload);
      const res = unwrap<TrezorSignatureResult>(
        await TrezorConnect.ethereumSignTypedData({
          path,
          data: typedData,
          metamask_v4_compat: true,
        }),
        "typed-data signing",
      );
      assertDeviceAddress(res.address, address);
      return res.signature;
    }
  }
}
