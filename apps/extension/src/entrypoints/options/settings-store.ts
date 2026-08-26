import browser from "webextension-polyfill";
import { create } from "zustand";
import { readRpcUrls, writeRpcUrls, type RpcUrls } from "@/lib/config";

interface SettingsState {
  open: boolean;
  rpcUrls: RpcUrls;
  load: () => Promise<void>;
  setRpcUrl: (key: string, url: string) => Promise<void>;
  setOpen: (open: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  open: false,
  rpcUrls: {},

  async load() {
    set({ rpcUrls: await readRpcUrls() });
  },

  async setRpcUrl(key, url) {
    const trimmed = url.trim();
    const next = { ...get().rpcUrls };
    if (trimmed) next[key] = trimmed;
    else delete next[key];
    set({ rpcUrls: next });
    await writeRpcUrls(next);
  },

  setOpen: (open) => set({ open }),
}));

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.rpcUrls) return;
  const value = changes.rpcUrls.newValue;
  if (typeof value === "object" && value !== null) {
    useSettingsStore.setState({ rpcUrls: value as RpcUrls });
  } else {
    useSettingsStore.setState({ rpcUrls: {} });
  }
});
