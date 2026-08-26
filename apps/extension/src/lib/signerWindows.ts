import browser from "webextension-polyfill";

const KEY = "signerWindow";

interface SignerWindowEntry {
  windowId: number;
  tabId: number;
  requestId: string;
}

export async function getSignerWindow(): Promise<SignerWindowEntry | undefined> {
  const { [KEY]: entry } = await browser.storage.local.get(KEY);
  return entry as SignerWindowEntry | undefined;
}

export async function setSignerWindow(entry: SignerWindowEntry): Promise<void> {
  await browser.storage.local.set({ [KEY]: entry });
}

export async function clearSignerWindow(): Promise<void> {
  await browser.storage.local.remove(KEY);
}

export async function clearSignerWindowForRequest(requestId: string): Promise<void> {
  const entry = await getSignerWindow();
  if (entry && entry.requestId === requestId) {
    await clearSignerWindow();
  }
}
