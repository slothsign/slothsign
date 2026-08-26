import browser from "webextension-polyfill";
import {
  WINDOW_CHANNEL,
  postToPage,
  isWindowRequest,
  postToPageNotification,
} from "./src/lib/windowChannel.ts";
import {
  ChainIdParamSchema,
  RpcResultSchema,
  RuntimeNotificationSchema,
  SwitchChainResultSchema,
  type WindowResponse,
} from "./src/lib/messages.ts";

/**
 * ISOLATED world bridge: relays provider messages from the page (MAIN world)
 * to the background via runtime messaging, then posts the response back.
 */
browser.runtime.onMessage.addListener((msg: unknown) => {
  const parsed = RuntimeNotificationSchema.safeParse(msg);
  if (!parsed.success) return;
  const notification = parsed.data;
  if (notification.type === "disconnect-notify") {
    postToPageNotification({
      channel: WINDOW_CHANNEL,
      type: "disconnected",
      chain: notification.chain,
    });
  } else if (notification.type === "chain-changed-notify") {
    postToPageNotification({
      channel: WINDOW_CHANNEL,
      type: "chainChanged",
      chain: "ethereum",
      chainId: notification.chainId,
    });
  } else {
    postToPageNotification({
      channel: WINDOW_CHANNEL,
      type: "accountsChanged",
      chain: notification.chain,
      accounts: notification.accounts,
    });
  }
});

window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  if (!isWindowRequest(event.data)) return;
  const data = event.data;

  try {
    if (data.type === "accounts" || data.type === "connect") {
      const accounts = await browser.runtime.sendMessage({
        type: data.type === "connect" ? "connect-request" : "accounts-request",
        chain: data.chain,
      });
      respond(data.id, { ok: true, result: accounts });
      return;
    }

    if (data.type === "disconnect") {
      await browser.runtime.sendMessage({ type: "disconnect", chain: data.chain });
      respond(data.id, { ok: true });
      return;
    }

    if (data.type === "chainId") {
      const chainId = await browser.runtime.sendMessage({
        type: "chain-id-request",
        chain: data.chain,
      });
      respond(data.id, { ok: true, result: chainId });
      return;
    }

    if (data.type === "switchChain") {
      const requested = ChainIdParamSchema.safeParse(data.params?.[0]);
      const result = await browser.runtime.sendMessage({
        type: "switch-chain-request",
        chain: data.chain,
        chainId: requested.success ? requested.data.chainId : "",
      });
      const parsed = SwitchChainResultSchema.safeParse(result);
      if (parsed.success) {
        if (parsed.data.ok) {
          respond(data.id, { ok: true, result: parsed.data.chainId });
        } else {
          respond(data.id, {
            ok: false,
            error: { code: parsed.data.code, message: parsed.data.message },
          });
        }
      } else {
        respond(data.id, {
          ok: false,
          error: { code: -32603, message: "Invalid switch-chain response" },
        });
      }
      return;
    }

    if (data.type === "rpc") {
      const result = await browser.runtime.sendMessage({
        type: "rpc-request",
        chain: data.chain,
        method: data.method,
        params: data.params ?? [],
      });
      const parsed = RpcResultSchema.safeParse(result);
      if (parsed.success) {
        if (parsed.data.ok) {
          respond(data.id, { ok: true, result: parsed.data.result });
        } else {
          respond(data.id, {
            ok: false,
            error: {
              code: parsed.data.code,
              message: parsed.data.message,
              ...(parsed.data.data !== undefined ? { data: parsed.data.data } : {}),
            },
          });
        }
      } else {
        respond(data.id, {
          ok: false,
          error: { code: -32603, message: "Invalid RPC response" },
        });
      }
      return;
    }

    if (data.type === "rpcConfig") {
      const result = await browser.runtime.sendMessage({ type: "solana-rpc-request" });
      respond(data.id, { ok: true, result });
      return;
    }

    const result = await browser.runtime.sendMessage({
      type: "sign-request",
      chain: data.chain,
      method: data.method,
      params: data.params,
    });
    respond(data.id, { ok: true, result });
  } catch (error) {
    respond(data.id, {
      ok: false,
      error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
    });
  }
});

function respond(id: string, response: Omit<WindowResponse, "channel" | "id">): void {
  postToPage({ channel: WINDOW_CHANNEL, id, ...response });
}
