import browser from "webextension-polyfill";
import { log } from "../lib/log.ts";
import { setSignerWindow } from "./signerWindows.ts";

/**
 * Open the request window (sign + connect approvals) as a focused popup window.
 * browser.action.openPopup requires a user gesture, so we open the request page
 * via windows.create from the background instead. Openness is detected live
 * (tabs matching signer.html), never cached — a cache can outlive the window.
 */
export async function openRequestWindow(id: string): Promise<void> {
  let win: browser.Windows.Window | undefined;
  try {
    win = await browser.windows.create({
      url: `${browser.runtime.getURL("/signer.html")}?id=${encodeURIComponent(id)}`,
      type: "popup",
      width: 400,
      height: 640,
    });
  } catch (error) {
    log?.error(`failed to open signer window for request ${id}:`, error);
    throw error;
  }
  if (!win) {
    log?.warn(`no window returned for request ${id}`);
    return;
  }
  log?.debug(`signer window ${win.id} opened for request ${id}`);
  if (win.id != null) {
    const [tab] = await browser.tabs.query({ windowId: win.id });
    if (tab?.id != null) {
      await setSignerWindow({ windowId: win.id, tabId: tab.id, requestId: id });
    }
  }
}
