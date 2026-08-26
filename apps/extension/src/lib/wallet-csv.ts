import { parse } from "csv-parse/sync";
import { nanoid } from "nanoid";
import {
  SIGNER_MODE_LABELS,
  validateAddress,
  validateDerivationPath,
  validateSolanaPath,
  validateXpub,
  type SignerMode,
  type WalletConfig,
} from "./config";

const SIGNER_VALUES = Object.keys(SIGNER_MODE_LABELS) as SignerMode[];

function escapeCsv(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function walletsToCsv(wallets: WalletConfig[]): string {
  const header = ["chain", "address", "signer", "label", "path", "xpub"];
  const rows = wallets.map((w) =>
    [w.chain, w.address, w.signer, w.label, w.path ?? "", w.xpub ?? ""]
      .map((v) => escapeCsv(v))
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export interface CsvImportResult {
  wallets: WalletConfig[];
  errors: string[];
}

export function csvToWallets(text: string, existing: WalletConfig[]): CsvImportResult {
  let records: unknown[];
  try {
    records = parse(text, {
      columns: true,
      bom: true,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
    });
  } catch {
    return { wallets: [], errors: ["Could not parse the CSV file."] };
  }

  const wallets: WalletConfig[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  records.forEach((record, index) => {
    const label = `Row ${index + 2}`;
    const row = record as Record<string, unknown>;
    const chain = typeof row.chain === "string" ? row.chain.trim() : "";
    if (chain !== "ethereum" && chain !== "solana") {
      errors.push(`${label}: chain must be "ethereum" or "solana"`);
      return;
    }
    const signer = typeof row.signer === "string" ? row.signer.trim() : "";
    if (!(SIGNER_VALUES as readonly string[]).includes(signer)) {
      errors.push(`${label}: unknown signer "${signer}"`);
      return;
    }
    const address = typeof row.address === "string" ? row.address.trim() : "";
    const addressError = validateAddress({ chain, address });
    if (addressError) {
      errors.push(`${label}: ${addressError}`);
      return;
    }
    const rawLabel = typeof row.label === "string" ? row.label.trim() : "";
    if (rawLabel.length > 40) {
      errors.push(`${label}: label must be 40 characters or fewer`);
      return;
    }
    const path = typeof row.path === "string" ? row.path.trim() : "";
    const pathError =
      chain === "ethereum" ? validateDerivationPath(path) : validateSolanaPath(path);
    if (pathError) {
      errors.push(`${label}: ${pathError}`);
      return;
    }
    const xpub = typeof row.xpub === "string" ? row.xpub.trim() : "";
    const xpubError = validateXpub(xpub);
    if (xpubError) {
      errors.push(`${label}: ${xpubError}`);
      return;
    }
    const key = `${chain}:${address.toLowerCase()}`;
    const duplicate =
      seen.has(key) ||
      existing.some((w) => w.chain === chain && w.address.toLowerCase() === address.toLowerCase());
    if (duplicate) {
      errors.push(`${label}: duplicate wallet ${address}`);
      return;
    }
    seen.add(key);
    wallets.push({
      id: nanoid(),
      chain,
      address,
      signer: signer as SignerMode,
      label: rawLabel,
      createdAt: Date.now(),
      path: path || undefined,
      xpub: xpub || undefined,
    });
  });

  return { wallets, errors };
}
