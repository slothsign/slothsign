import browser from "webextension-polyfill";
import type { Chain } from "@slothsign/core";
import type { ActiveWallets, WalletConfig } from "./config.ts";
import type { RuntimeMessage } from "./messages.ts";
import type { PendingRequest } from "./requestStore.ts";

async function send<T>(message: RuntimeMessage): Promise<T> {
  return browser.runtime.sendMessage<RuntimeMessage, T>(message);
}

export function getWallets(): Promise<WalletConfig[]> {
  return send<WalletConfig[]>({ type: "get-wallets" });
}

export function setWallets(
  wallets: WalletConfig[],
  active?: ActiveWallets,
): Promise<WalletConfig[]> {
  return send<WalletConfig[]>({
    type: "set-wallets",
    wallets,
    ...(active ? { active } : {}),
  });
}

export function getPendingRequests(): Promise<PendingRequest[]> {
  return send<PendingRequest[]>({ type: "get-pending-requests" });
}

export function confirmConnect(id: string): Promise<{ ok: boolean; error?: string }> {
  return send({ type: "confirm-connect", id });
}

export function submitSignature(
  id: string,
  payload: string,
): Promise<{ ok: boolean; error?: string }> {
  return send({ type: "submit-signature", id, payload });
}

export function refreshGas(id: string): Promise<{ ok: boolean; error?: string }> {
  return send({ type: "refresh-gas", id });
}

export function trezorSign(id: string): Promise<{ ok: boolean; error?: string }> {
  return send({ type: "trezor-sign", id });
}

export function trezorGetXpub(
  path: string,
): Promise<{ ok: boolean; xpub?: string; error?: string }> {
  return send({ type: "trezor-get-xpub", path });
}

export function cancelRequest(id: string): Promise<{ ok: boolean }> {
  return send({ type: "cancel-request", id });
}

/** Fire-and-forget: the signer page reports its own closing (it knows its id). */
export function notifySignerClosed(id: string): Promise<unknown> {
  return send({ type: "signer-closed", id });
}

export function getActiveWallets(): Promise<ActiveWallets> {
  return send<ActiveWallets>({ type: "get-active-wallets" });
}

export function setActiveWallet(chain: Chain, id: string): Promise<ActiveWallets> {
  return send<ActiveWallets>({ type: "set-active-wallet", chain, id });
}

export function isActiveTabConnected(chain: Chain): Promise<boolean> {
  return send<boolean>({ type: "get-active-tab-connected", chain });
}

export function getCurrentChain(): Promise<{ chainId: string; name: string }> {
  return send({ type: "get-current-chain" });
}

export function disconnect(chain: Chain): Promise<{ ok: boolean }> {
  return send({ type: "disconnect", chain });
}
