import browser from "webextension-polyfill";
import { create } from "zustand";
import type { Chain } from "@slothsign/core";
import { getActiveWallets, getCurrentChain, getWallets, isActiveTabConnected } from "@/lib/actions";
import type { ActiveWallets, WalletConfig } from "@/lib/config";

export interface ChainInfo {
  chainId: string;
  name: string;
}

interface PopupState {
  wallets: WalletConfig[];
  active: ActiveWallets;
  chainInfo: ChainInfo;
  connected: Record<Chain, boolean>;
  loaded: boolean;
  refresh: () => Promise<void>;
}

export const usePopupStore = create<PopupState>((set) => ({
  wallets: [],
  active: {},
  chainInfo: { chainId: "", name: "" },
  connected: { ethereum: false, solana: false },
  loaded: false,
  async refresh() {
    const settled = await Promise.allSettled([
      getWallets(),
      getActiveWallets(),
      isActiveTabConnected("ethereum"),
      isActiveTabConnected("solana"),
      getCurrentChain(),
    ]);
    set({
      wallets: settled[0].status === "fulfilled" ? (settled[0].value ?? []) : [],
      active: settled[1].status === "fulfilled" ? (settled[1].value ?? {}) : {},
      connected: {
        ethereum: settled[2].status === "fulfilled" ? settled[2].value : false,
        solana: settled[3].status === "fulfilled" ? settled[3].value : false,
      },
      chainInfo: settled[4].status === "fulfilled" ? settled[4].value : { chainId: "", name: "" },
      loaded: true,
    });
  },
}));

const TRACKED_KEYS = ["wallets", "activeWallets", "connectedOrigins", "evmChainId"] as const;

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (TRACKED_KEYS.some((key) => key in changes)) {
    void usePopupStore.getState().refresh();
  }
});
