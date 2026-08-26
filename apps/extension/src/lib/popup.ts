import browser from "webextension-polyfill";
import { setSignerWindow } from "./signerWindows.ts";

/**
 * Open the request window (sign + connect approvals) as a focused popup window.
 * browser.action.openPopup requires a user gesture, so we open the request page
 * via windows.create from the background instead. The window's tab is tracked so
 * the background can cancel the request when the window is closed.
 */
export async function openRequestWindow(id: string): Promise<void> {
  const win = await browser.windows.create({
    url: `${browser.runtime.getURL("/signer.html")}?id=${encodeURIComponent(id)}`,
    type: "popup",
    width: 400,
    height: 640,
  });
  if (!win) return;
  if (win.id != null) {
    const [tab] = await browser.tabs.query({ windowId: win.id });
    if (tab?.id != null) {
      await setSignerWindow({ windowId: win.id, tabId: tab.id, requestId: id });
    }
  }
}
