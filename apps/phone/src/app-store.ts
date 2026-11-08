import type { SignerRequest } from "@slothsign/core";
import { create } from "zustand";
import {
  addToRegistry,
  applyWalletEdit,
  buildWallet,
  deriveAccounts,
  EMPTY_REGISTRY,
  findAccount,
  pathsToDerive,
  removeFromRegistry,
  type Registry,
  type RegistryAccount,
  type RegistryWallet,
  type WalletDraft,
  type WalletEdit,
} from "./lib/registry";
import { deleteSecret, loadRegistry, readSecret, saveRegistry, saveSecret } from "./native/vault";

export type Route =
  | { name: "home" }
  | { name: "add-wallet" }
  | { name: "wallet"; id: string }
  | { name: "edit-wallet"; id: string }
  | { name: "scan" }
  | {
      name: "review";
      request: SignerRequest;
      wallet: RegistryWallet;
      account: RegistryAccount;
    }
  | { name: "result"; qr: string };

interface AppState {
  route: Route;
  registry: Registry;
  loaded: boolean;
  loadFailed: boolean;
  navigate: (route: Route) => void;
  load: () => Promise<void>;
  addWallet: (draft: WalletDraft) => Promise<void>;
  editWallet: (wallet: RegistryWallet, edit: WalletEdit) => Promise<void>;
  removeWallet: (id: string) => Promise<void>;
  /** Route a scanned request to review, or return why it can't be signed here. */
  reviewScanned: (request: SignerRequest) => string | undefined;
}

function randomId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const useAppStore = create<AppState>((set, get) => ({
  route: { name: "home" },
  registry: EMPTY_REGISTRY,
  loaded: false,
  loadFailed: false,
  navigate: (route) => set({ route }),
  load: async () => {
    try {
      set({ registry: await loadRegistry(), loaded: true });
    } catch {
      set({ loaded: true, loadFailed: true });
    }
  },
  addWallet: async (draft) => {
    const { secret, entry } = buildWallet(randomId(), draft);
    const registry = addToRegistry(get().registry, entry);
    // The registry owns the path list, so editing paths never rewrites the secret.
    await saveSecret(secret.kind === "mnemonic" ? { ...secret, paths: [] } : secret);
    try {
      await saveRegistry(registry);
    } catch (error) {
      await deleteSecret(secret.id).catch(() => undefined);
      throw error;
    }
    set({ registry, route: { name: "wallet", id: entry.id } });
  },
  editWallet: async (wallet, edit) => {
    const missing = pathsToDerive(wallet, edit);
    const derived = missing.length > 0 ? deriveAccounts(await readSecret(wallet.id), missing) : [];
    const registry = applyWalletEdit(get().registry, wallet, edit, derived);
    await saveRegistry(registry);
    set({ registry, route: { name: "wallet", id: wallet.id } });
  },
  removeWallet: async (id) => {
    const registry = removeFromRegistry(get().registry, id);
    await saveRegistry(registry);
    await deleteSecret(id).catch(() => undefined);
    set({ registry, route: { name: "home" } });
  },
  reviewScanned: (request) => {
    const found = findAccount(get().registry, request);
    if (!found) return `No wallet on this phone matches ${request.address}.`;
    set({ route: { name: "review", request, ...found } });
    return undefined;
  },
}));
