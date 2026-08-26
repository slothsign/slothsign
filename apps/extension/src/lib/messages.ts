import { z } from "zod";

export const WINDOW_CHANNEL = "slothsign";

export const ActiveWalletsSchema = z.object({
  ethereum: z.string().optional(),
  solana: z.string().optional(),
});

export type ActiveWallets = z.infer<typeof ActiveWalletsSchema>;

export const WindowRequestSchema = z.object({
  channel: z.literal(WINDOW_CHANNEL),
  id: z.string(),
  type: z.enum([
    "sign",
    "accounts",
    "connect",
    "disconnect",
    "chainId",
    "switchChain",
    "rpc",
    "rpcConfig",
  ]),
  chain: z.enum(["ethereum", "solana"]),
  method: z.string().optional(),
  params: z.array(z.unknown()).optional(),
});

export const WindowResponseSchema = z.object({
  channel: z.literal(WINDOW_CHANNEL),
  id: z.string(),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z
    .object({ code: z.number(), message: z.string(), data: z.unknown().optional() })
    .optional(),
});

export const WindowNotificationSchema = z.discriminatedUnion("type", [
  z.object({
    channel: z.literal(WINDOW_CHANNEL),
    type: z.literal("disconnected"),
    chain: z.enum(["ethereum", "solana"]),
  }),
  z.object({
    channel: z.literal(WINDOW_CHANNEL),
    type: z.literal("chainChanged"),
    chain: z.literal("ethereum"),
    chainId: z.string(),
  }),
  z.object({
    channel: z.literal(WINDOW_CHANNEL),
    type: z.literal("accountsChanged"),
    chain: z.enum(["ethereum", "solana"]),
    accounts: z.array(z.string()),
  }),
]);

export type WindowRequest = z.infer<typeof WindowRequestSchema>;
export type WindowResponse = z.infer<typeof WindowResponseSchema>;
export type WindowNotification = z.infer<typeof WindowNotificationSchema>;

export const RuntimeMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("sign-request"),
    chain: z.enum(["ethereum", "solana"]),
    method: z.string(),
    params: z.array(z.unknown()),
  }),
  z.object({ type: z.literal("accounts-request"), chain: z.enum(["ethereum", "solana"]) }),
  z.object({ type: z.literal("connect-request"), chain: z.enum(["ethereum", "solana"]) }),
  z.object({
    type: z.literal("get-active-tab-connected"),
    chain: z.enum(["ethereum", "solana"]),
  }),
  z.object({ type: z.literal("disconnect"), chain: z.enum(["ethereum", "solana"]) }),
  z.object({
    type: z.literal("chain-id-request"),
    chain: z.enum(["ethereum", "solana"]),
  }),
  z.object({
    type: z.literal("switch-chain-request"),
    chain: z.literal("ethereum"),
    chainId: z.string(),
  }),
  z.object({
    type: z.literal("rpc-request"),
    chain: z.literal("ethereum"),
    method: z.string(),
    params: z.array(z.unknown()),
  }),
  z.object({ type: z.literal("get-current-chain") }),
  z.object({ type: z.literal("solana-rpc-request") }),
  z.object({ type: z.literal("submit-signature"), id: z.string(), payload: z.string() }),
  z.object({
    type: z.literal("sign-result"),
    id: z.string(),
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: z.string().optional(),
  }),
  z.object({ type: z.literal("cancel-request"), id: z.string() }),
  z.object({ type: z.literal("get-pending-requests") }),
  z.object({ type: z.literal("confirm-connect"), id: z.string() }),
  z.object({ type: z.literal("get-wallets") }),
  z.object({
    type: z.literal("set-wallets"),
    wallets: z.array(z.unknown()),
    active: ActiveWalletsSchema.optional(),
  }),
  z.object({ type: z.literal("get-active-wallets") }),
  z.object({
    type: z.literal("set-active-wallet"),
    chain: z.enum(["ethereum", "solana"]),
    id: z.string(),
  }),
  z.object({
    type: z.literal("accounts-changed-notify"),
    chain: z.enum(["ethereum", "solana"]),
    accounts: z.array(z.string()),
  }),
]);

export type RuntimeMessage = z.infer<typeof RuntimeMessageSchema>;

export const ChainSchema = z.enum(["ethereum", "solana"]);

export const RuntimeNotificationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("disconnect-notify"), chain: ChainSchema }),
  z.object({ type: z.literal("chain-changed-notify"), chainId: z.string() }),
  z.object({
    type: z.literal("accounts-changed-notify"),
    chain: ChainSchema,
    accounts: z.array(z.string()),
  }),
]);

export type RuntimeNotification = z.infer<typeof RuntimeNotificationSchema>;

export const ChainIdParamSchema = z.object({ chainId: z.string() });

export const JsonRpcResponseSchema = z.object({
  result: z.unknown().optional(),
  error: z
    .object({ code: z.number(), message: z.string(), data: z.unknown().optional() })
    .optional(),
});

export const RpcResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), result: z.unknown().optional() }),
  z.object({
    ok: z.literal(false),
    code: z.number(),
    message: z.string(),
    data: z.unknown().optional(),
  }),
]);

export const SwitchChainResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), chainId: z.string() }),
  z.object({ ok: z.literal(false), code: z.number(), message: z.string() }),
]);
