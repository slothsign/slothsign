// The app ships without the INTERNET permission, and React Native's HTTP client
// crashes the whole app when the OS refuses a socket. Replace the network
// globals so a stray call fails as an ordinary error instead. Import this after
// `expo`, which installs its own globals.
const denied = "Network access is disabled";

class BlockedTransport {
  constructor() {
    throw new Error(denied);
  }
}

const replacements: Record<string, unknown> = {
  fetch: () => Promise.reject(new Error(denied)),
  XMLHttpRequest: BlockedTransport,
  WebSocket: BlockedTransport,
};

for (const [name, value] of Object.entries(replacements)) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
