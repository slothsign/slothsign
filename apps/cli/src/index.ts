#!/usr/bin/env bun
import { renderEvmRequest } from "@slothsign/chain-evm";
import { renderSolanaRequest } from "@slothsign/chain-solana";
import type { SignerRequest } from "@slothsign/core";
import { decodeRequest, encodeResult, isSignerRequest } from "@slothsign/core";
import { signRequest } from "@slothsign/signing";
import { Command } from "commander";
import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";
import { getBackend, supportedModes } from "./keystore/index.ts";
import {
  editWallets,
  editWalletsFromStdin,
  ensureCacheFresh,
  readWallets,
  resolveKeyId,
  walletEntries,
} from "./wallets.ts";

const VERSION_INFO = process.env.SLOTH_VERSION_INFO ?? "dev";

const supported = supportedModes();

const ENV_TEXT = `Environment:
  SLOTH_KEYSTORE   storage backend: ${supported.map((b, i) => (i ? b : `${b} (default)`)).join(", ")}
  SLOTH_CACHE      address cache (default ~/.sloth/addresses.json)
  SLOTH_IDENTITY   age identity file  (default ~/.sloth/identity.txt)
  SLOTH_WALLETS    encrypted wallet registry (default ~/.sloth/wallets.age)
  SLOTH_RECIPIENT  age recipient to encrypt to (default: identity's public key)`;

function parseRequest(input: string): SignerRequest {
  if (input.startsWith("sloth://req/")) {
    return decodeRequest(input);
  }
  if (input.startsWith("sloth:")) {
    throw new Error("Unknown sloth URL. Expected a signing request (sloth://req/...).");
  }
  const parsed: unknown = JSON.parse(input);
  if (!isSignerRequest(parsed)) {
    throw new Error("Invalid signer request JSON");
  }
  return parsed;
}

const NO_COLOR = process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "";

function logDetail(text: string): void {
  const color = !NO_COLOR && process.stderr.isTTY;
  console.error(color ? `\x1b[37m${text}\x1b[0m` : text);
}

function summarize(request: SignerRequest): void {
  logDetail(`chain:   ${request.chain}`);
  logDetail(`chainId: ${request.chainId}`);
  logDetail(`address: ${request.address}`);
  logDetail(`type:    ${request.type}`);
  const rendered =
    request.chain === "ethereum" ? renderEvmRequest(request) : renderSolanaRequest(request);
  if (rendered.known) {
    logDetail(`intent:  ${JSON.stringify(rendered.intent)}`);
  } else {
    logDetail(`intent:  unknown (${rendered.reason ?? "unable to decode"})`);
  }
}

async function commandSign(payload: string): Promise<void> {
  let request: SignerRequest;
  try {
    request = parseRequest(payload);
  } catch (error) {
    throw new Error(`Invalid payload: ${String(error)}`);
  }
  summarize(request);
  ensureCacheFresh();
  const keyId = resolveKeyId(request.address);
  if (!keyId) {
    throw new Error(
      `No wallet for address ${request.address}. Run 'sloth wallet index' to rebuild the address cache.`,
    );
  }
  const wallets = readWallets();
  const match = walletEntries(wallets).find((entry) => entry.keyId === keyId);
  if (!match) {
    throw new Error(`Wallet for address ${request.address} not found (${keyId})`);
  }
  const [walletId, ...rest] = keyId.split(":");
  const path = rest.length > 0 ? rest.join(":") : undefined;
  const wallet = wallets.wallets.find((w) => w.id === walletId);
  if (!wallet) {
    throw new Error(`Wallet '${walletId}' not found in registry`);
  }
  const signature = await signRequest(request, wallet, path);
  logDetail(`wallet: ${keyId}`);
  logDetail("");
  console.log(encodeResult({ chain: request.chain, result: signature }));
}

function commandWalletList(): void {
  const wallets = readWallets();
  for (const wallet of wallets.wallets) {
    console.log("");
    if (wallet.kind === "mnemonic") {
      console.log(`${wallet.id} (mnemonic${wallet.passphrase ? " + passphrase" : ""})`);
    } else {
      console.log(`${wallet.id} (${wallet.chain} private key)`);
    }
    for (const { keyId, address } of walletEntries({
      version: wallets.version,
      wallets: [wallet],
    })) {
      console.log(`  ${keyId}: ${address}`);
    }
  }
}

function commandWalletIndex(): void {
  ensureCacheFresh();
  const wallets = readWallets();
  const count = walletEntries(wallets).length;
  console.log(`Rebuilt address cache at ~/.sloth/addresses.json (${count} addresses)`);
}

async function commandWalletEdit(): Promise<void> {
  if (process.stdin.isTTY) {
    const wallets = await editWallets();
    console.log(`Wrote ${wallets.wallets.length} wallet(s) to ${getBackend().describe()}`);
    console.log("");
    commandWalletList();
  } else {
    const text = await Bun.stdin.text();
    const wallets = editWalletsFromStdin(text);
    console.log(`Wrote ${wallets.wallets.length} wallet(s) to ${getBackend().describe()}`);
  }
}

async function readStdin(): Promise<string> {
  if (!process.stdin.isTTY) {
    return (await Bun.stdin.text()).trim();
  }
  const rl = createInterface({ input: stdin, output: stdout });
  const text = (await rl.question("")).trim();
  rl.close();
  return text;
}

function buildProgram(): Command {
  const program = new Command().name("sloth").description("isolated cross-chain signer");
  program.version(VERSION_INFO);
  program
    .command("sign [payload]")
    .description(
      "Decode, confirm and sign a request (sloth://req/… or raw SignerRequest JSON). Reads the request from stdin when no payload is given or '-' is passed.",
    )
    .action(async (payload: string | undefined) => {
      if (!payload || payload === "-") {
        payload = await readStdin();
        if (!payload) throw new Error("No request provided via stdin");
      }
      await commandSign(payload);
    });
  const wallet = program.command("wallet").description("Manage the encrypted wallet registry");
  wallet
    .command("edit")
    .description("Decrypt and edit the wallet registry in $EDITOR (or pipe JSON via stdin)")
    .action(() => {
      commandWalletEdit();
    });
  wallet
    .command("list")
    .description("Show declared wallets and their derived addresses")
    .action(() => {
      commandWalletList();
    });
  wallet
    .command("index")
    .description("Rebuild the address cache")
    .action(() => {
      commandWalletIndex();
    });
  program.addHelpText("afterAll", ENV_TEXT);
  return program;
}

async function main(): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(Bun.argv);
  } catch (error) {
    console.error(`sloth: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

await main();
