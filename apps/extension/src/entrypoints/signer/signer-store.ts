import browser from "webextension-polyfill";
import { create } from "zustand";
import { getPendingRequests, getWallets } from "@/lib/actions";
import type { WalletConfig } from "@/lib/config";
import type { PendingRequest } from "@/lib/requestStore";

interface SignerState {
  wallets: WalletConfig[];
  requests: PendingRequest[];
  loaded: boolean;
  refresh: () => Promise<void>;
}

export const useSignerStore = create<SignerState>((set) => ({
  wallets: [],
  requests: [],
  loaded: false,
  async refresh() {
    const settled = await Promise.allSettled([getWallets(), getPendingRequests()]);
    set({
      wallets: settled[0].status === "fulfilled" ? (settled[0].value ?? []) : [],
      requests: settled[1].status === "fulfilled" ? (settled[1].value ?? []) : [],
      loaded: true,
    });
  },
}));

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if ("wallets" in changes || "requests" in changes) {
    void useSignerStore.getState().refresh();
  }
});
