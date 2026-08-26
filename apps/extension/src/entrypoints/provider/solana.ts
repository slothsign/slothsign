import {
  SolanaSignAndSendTransaction,
  SolanaSignMessage,
  SolanaSignTransaction,
  type SolanaSignAndSendTransactionFeature,
  type SolanaSignMessageFeature,
  type SolanaSignTransactionFeature,
} from "@solana/wallet-standard-features";
import { PublicKey } from "@solana/web3.js";
import type { Wallet, WalletAccount, WalletIcon } from "@wallet-standard/base";
import {
  StandardConnect,
  StandardDisconnect,
  StandardEvents,
  type StandardConnectFeature,
  type StandardDisconnectFeature,
  type StandardEventsFeature,
  type StandardEventsListeners,
} from "@wallet-standard/features";
import { registerWallet } from "@wallet-standard/wallet";
import {
  ICON,
  base64ToBytes,
  bridgeRequest,
  bytesToBase64,
  type WindowNotification,
} from "./shared";

function buildSolanaAccounts(addresses: string[], signAndSend: boolean): WalletAccount[] {
  return addresses.map((address) => {
    const pubkey = new PublicKey(address);
    return {
      address,
      publicKey: pubkey.toBytes(),
      chains: ["solana:mainnet"] as const,
      features: (signAndSend
        ? [SolanaSignTransaction, SolanaSignMessage, SolanaSignAndSendTransaction]
        : [SolanaSignTransaction, SolanaSignMessage]) as readonly `${string}:${string}`[],
      label: "SlothSign",
      icon: ICON as WalletIcon,
    };
  });
}

async function solanaAccounts(type: "accounts" | "connect"): Promise<WalletAccount[]> {
  const addresses = await bridgeRequest<string[]>(type, "solana");
  return buildSolanaAccounts(addresses, solanaSignAndSend);
}

type ChangeListener = StandardEventsListeners["change"];

const solanaChangeListeners = new Set<ChangeListener>();
let solanaWallet: { accounts: readonly WalletAccount[] } | undefined;
let solanaSignAndSend = false;

function setSolanaAccounts(accounts: WalletAccount[]): void {
  if (solanaWallet) solanaWallet.accounts = accounts;
  for (const listener of solanaChangeListeners) listener({ accounts });
}

function notifySolanaDisconnected(): void {
  setSolanaAccounts([]);
}

function updateSolanaAccounts(addresses: string[]): void {
  setSolanaAccounts(buildSolanaAccounts(addresses, solanaSignAndSend));
}

function registerSolanaWallet(): void {
  void (async () => {
    const [addresses, rpcConfig] = await Promise.all([
      bridgeRequest<string[]>("accounts", "solana"),
      bridgeRequest<{ rpcUrl: string | null }>("rpcConfig", "solana"),
    ]);
    solanaSignAndSend = rpcConfig?.rpcUrl != null;

    const wallet: Wallet = {
      version: "1.0.0",
      name: "SlothSign",
      icon: ICON as WalletIcon,
      chains: ["solana:mainnet"],
      features: {
        [StandardConnect]: {
          version: "1.0.0",
          connect: async () => {
            const accounts = await solanaAccounts("connect");
            setSolanaAccounts(accounts);
            return { accounts };
          },
        },
        [StandardDisconnect]: {
          version: "1.0.0",
          disconnect: async () => {
            await bridgeRequest("disconnect", "solana");
          },
        },
        [StandardEvents]: {
          version: "1.0.0",
          on: (_event: "change", listener: ChangeListener) => {
            solanaChangeListeners.add(listener);
            return () => solanaChangeListeners.delete(listener);
          },
        },
        [SolanaSignTransaction]: {
          version: "1.0.0",
          supportedTransactionVersions: ["legacy"],
          signTransaction: async (...inputs) => {
            const input = inputs[0]!;
            const publicKey = input.account?.address ?? solanaWallet?.accounts[0]?.address;
            const signed = await bridgeRequest<string>("sign", "solana", "signTransaction", [
              publicKey,
              { transaction: bytesToBase64(input.transaction) },
            ]);
            return [{ signedTransaction: base64ToBytes(signed) }];
          },
        },
        [SolanaSignMessage]: {
          version: "1.0.0",
          signMessage: async (...inputs) => {
            const input = inputs[0]!;
            const publicKey = input.account?.address ?? solanaWallet?.accounts[0]?.address;
            const signature = await bridgeRequest<string>("sign", "solana", "signMessage", [
              publicKey,
              { message: bytesToBase64(input.message) },
            ]);
            return [{ signedMessage: input.message, signature: base64ToBytes(signature) }];
          },
        },
        ...(solanaSignAndSend
          ? {
              [SolanaSignAndSendTransaction]: {
                version: "1.0.0" as const,
                supportedTransactionVersions: ["legacy"] as const,
                signAndSendTransaction: async (...inputs) => {
                  const input = inputs[0]!;
                  const publicKey = input.account?.address ?? solanaWallet?.accounts[0]?.address;
                  const signature = await bridgeRequest<string>(
                    "sign",
                    "solana",
                    "signAndSendTransaction",
                    [
                      publicKey,
                      {
                        transaction: bytesToBase64(input.transaction),
                        options: input.options,
                      },
                    ],
                  );
                  return [{ signature: base64ToBytes(signature) }];
                },
              },
            }
          : {}),
      } satisfies SolanaSignTransactionFeature &
        SolanaSignMessageFeature &
        Partial<SolanaSignAndSendTransactionFeature> &
        StandardConnectFeature &
        StandardDisconnectFeature &
        StandardEventsFeature,
      accounts: buildSolanaAccounts(addresses, solanaSignAndSend),
    };

    solanaWallet = wallet;
    registerWallet(wallet);
  })();
}

export function registerSolanaProvider(): void {
  registerSolanaWallet();
}

export function handleNotification({ type, accounts }: WindowNotification): void {
  switch (type) {
    case "accountsChanged":
      updateSolanaAccounts(Array.isArray(accounts) ? accounts : []);
      break;
    case "disconnected":
      notifySolanaDisconnected();
      break;
    case "chainChanged":
      break;
  }
}
