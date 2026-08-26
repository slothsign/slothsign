import browser from "webextension-polyfill";
import { create } from "zustand";
import {
  defaultPath,
  normalizeWallet,
  validateAddress,
  walletFormSchema,
  type ActiveWallets,
  type SignerMode,
  type WalletConfig,
} from "@/lib/config";
import { getActiveWallets, getWallets, setActiveWallet, setWallets } from "@/lib/actions";

export function validateField(
  wallets: WalletConfig[],
  chain: "ethereum" | "solana",
  address: string,
): string | null {
  const formatMessage = validateAddress({ chain, address });
  if (formatMessage) return formatMessage;
  const trimmed = address.trim();
  const duplicate = wallets.some(
    (w) => w.chain === chain && w.address.toLowerCase() === trimmed.toLowerCase(),
  );
  return duplicate ? "A wallet with this address already exists" : null;
}

interface OptionsState {
  wallets: WalletConfig[];
  active: ActiveWallets;
  chain: "ethereum" | "solana";
  address: string;
  signer: SignerMode;
  label: string;
  path: string;
  xpub: string;
  fieldErrors: Record<string, string>;

  loadWallets: () => Promise<void>;
  addWallet: () => Promise<boolean>;
  deriveAddWallet: (
    xpub: string,
    path: string,
    address: string,
    label?: string,
  ) => Promise<string | false>;
  removeWallet: (id: string) => Promise<void>;
  renameWallet: (id: string, label: string) => Promise<void>;
  changeSigner: (id: string, signer: SignerMode) => Promise<void>;
  updateWalletField: (id: string, field: "path" | "xpub", value: string) => Promise<void>;
  setActive: (chain: "ethereum" | "solana", id: string) => Promise<void>;

  setChain: (chain: "ethereum" | "solana") => void;
  setAddress: (address: string) => void;
  setSigner: (signer: SignerMode) => void;
  setLabel: (label: string) => void;
  setPath: (path: string) => void;
  setXpub: (xpub: string) => void;
  setFieldError: (field: string, message: string) => void;
}

export const useOptionsStore = create<OptionsState>((set, get) => ({
  wallets: [],
  active: {},
  chain: "ethereum",
  address: "",
  signer: "keystone-qr",
  label: "",
  path: defaultPath("ethereum"),
  xpub: "",
  fieldErrors: {},

  async loadWallets() {
    const [wallets, active] = await Promise.all([getWallets(), getActiveWallets()]);
    set({ wallets: wallets ?? [], active });
  },

  async addWallet() {
    const { chain, address, signer, label, path, xpub, wallets } = get();
    const parsed = walletFormSchema.safeParse({ chain, address, signer, label, path, xpub });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "");
        if (field && !errors[field]) errors[field] = issue.message;
      }
      set({ fieldErrors: errors });
      return false;
    }
    const { chain: nextChain, address: nextAddress } = parsed.data;
    const message = validateField(wallets, nextChain, nextAddress);
    if (message) {
      set({ fieldErrors: { address: message } });
      return false;
    }
    const newWallet = normalizeWallet({ ...parsed.data });
    const next = [...wallets, newWallet];
    const saved = await setWallets(next, { [nextChain]: newWallet.id });
    set({
      wallets: saved,
      active: { ...get().active, [nextChain]: newWallet.id },
      fieldErrors: {},
      address: "",
      label: "",
      path: defaultPath(nextChain),
      xpub: "",
    });
    return true;
  },

  async deriveAddWallet(xpub, path, address, label) {
    const { wallets } = get();
    const message = validateField(wallets, "ethereum", address);
    if (message) return false;
    const newWallet = normalizeWallet({
      chain: "ethereum",
      address,
      signer: "keystone-qr",
      label: label ?? "",
      path,
      xpub,
      validated: true,
    });
    const next = [...wallets, newWallet];
    const saved = await setWallets(next);
    set({ wallets: saved });
    return newWallet.id;
  },

  async removeWallet(id) {
    const next = get().wallets.filter((w) => w.id !== id);
    const saved = await setWallets(next);
    set({ wallets: saved });
  },

  async renameWallet(id, label) {
    const next = get().wallets.map((w) => (w.id === id ? { ...w, label: label.trim() } : w));
    const saved = await setWallets(next);
    set({ wallets: saved });
  },

  async changeSigner(id, signer) {
    const next = get().wallets.map((w) => (w.id === id ? { ...w, signer } : w));
    const saved = await setWallets(next);
    set({ wallets: saved });
  },

  async updateWalletField(id, field, value) {
    const next = get().wallets.map((w) => (w.id === id ? { ...w, [field]: value.trim() } : w));
    const saved = await setWallets(next);
    set({ wallets: saved });
  },

  async setActive(chain, id) {
    const active = await setActiveWallet(chain, id);
    set({ active });
  },

  setChain: (chain) => set({ chain, path: defaultPath(chain) }),
  setAddress: (address) => set({ address }),
  setSigner: (signer) => set({ signer }),
  setLabel: (label) => set({ label }),
  setPath: (path) => set({ path }),
  setXpub: (xpub) => set({ xpub }),
  setFieldError: (field, message) =>
    set((state) => ({ fieldErrors: { ...state.fieldErrors, [field]: message } })),
}));

const TRACKED_KEYS = ["wallets", "activeWallets"] as const;

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (TRACKED_KEYS.some((key) => key in changes)) {
    void useOptionsStore.getState().loadWallets();
  }
});
