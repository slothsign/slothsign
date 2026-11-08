import {
  addressFromPrivateKey,
  assertSignableEvmTransaction,
  payloadToMessage,
  payloadToTx,
  payloadToTypedData,
  signEvmSignature,
  signMessage,
  signTypedData,
  type PrivateKey,
} from "@slothsign/chain-evm";
import {
  bytesToBase64,
  keypairFromMnemonic,
  keypairFromSecret,
  payloadToTransactionBytes,
  signMessageFromPayload,
  signTransaction,
  signTransactionDetached,
} from "@slothsign/chain-solana";
import type { SignerRequest } from "@slothsign/core";
import { derivePrivateKey } from "@slothsign/keystore";
import { hexPrivateKey, type Wallet } from "./wallets.ts";

export interface SignOptions {
  /**
   * Return a Solana transaction's detached 64-byte signature instead of the
   * full signed transaction, so the result fits in a single QR code.
   */
  detachedSolanaTransaction?: boolean;
}

function evmPrivateKey(wallet: Wallet, path: string | undefined): PrivateKey {
  if (wallet.kind === "privateKey") return wallet.privateKey as PrivateKey;
  if (!path) throw new Error("Path required for mnemonic EVM derivation");
  return hexPrivateKey(derivePrivateKey(wallet.mnemonic, path, wallet.passphrase));
}

function solanaKeypair(wallet: Wallet, path: string | undefined) {
  if (wallet.kind === "privateKey") return keypairFromSecret(wallet.privateKey);
  if (!path) throw new Error("Path required for mnemonic Solana derivation");
  return keypairFromMnemonic(wallet.mnemonic, path, wallet.passphrase);
}

function assertAddress(derived: string, expected: string): void {
  if (derived !== expected) {
    throw new Error(`Address mismatch: wallet derives ${derived}, request expects ${expected}`);
  }
}

/**
 * Sign a request with the wallet key at `path`. The key must derive exactly the
 * address the request names; the signature is returned as the chain-specific
 * result string carried by the `sloth://sig/…` transport.
 */
export async function signRequest(
  request: SignerRequest,
  wallet: Wallet,
  path: string | undefined,
  options: SignOptions = {},
): Promise<string> {
  if (request.chain === "ethereum") {
    const privateKey = evmPrivateKey(wallet, path);
    assertAddress(addressFromPrivateKey(privateKey).toLowerCase(), request.address.toLowerCase());
    switch (request.type) {
      case "transaction": {
        const tx = payloadToTx(request.payload);
        assertSignableEvmTransaction(tx);
        return signEvmSignature(privateKey, tx, request.chainId);
      }
      case "message": {
        const { message } = payloadToMessage(request.payload);
        return signMessage(privateKey, message);
      }
      case "typedData": {
        const { typedData } = payloadToTypedData(request.payload);
        return signTypedData(privateKey, typedData);
      }
    }
  }
  if (request.chain === "solana") {
    const keypair = solanaKeypair(wallet, path);
    assertAddress(keypair.publicKey.toBase58(), request.address);
    switch (request.type) {
      case "transaction": {
        const tx = payloadToTransactionBytes(request.payload);
        const sign = options.detachedSolanaTransaction ? signTransactionDetached : signTransaction;
        return bytesToBase64(sign(keypair, tx));
      }
      case "message": {
        return bytesToBase64(await signMessageFromPayload(keypair, request.payload));
      }
      case "typedData":
        throw new Error("Solana does not support typedData signing");
    }
  }
  throw new Error(`Unsupported chain: ${request.chain}`);
}
