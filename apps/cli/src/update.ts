import { chmod, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

export interface UpdateOptions {
  repo: string;
  currentVersion: string;
  baseName: string;
}

function githubFetch(url: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return fetch(url, { headers });
}

export async function runUpdate(options: UpdateOptions): Promise<void> {
  const { repo, currentVersion, baseName } = options;
  const base = `https://github.com/${repo}/releases/latest/download`;
  const manifestRes = await githubFetch(`${base}/version.txt`);
  if (!manifestRes.ok) {
    throw new Error(`Failed to fetch version info (${manifestRes.status})`);
  }
  const manifest = (await manifestRes.text()).trim().split("\n");
  const remoteVersion = manifest[0]?.trim();
  if (!remoteVersion) {
    throw new Error("Invalid version manifest");
  }
  if (remoteVersion === currentVersion) {
    console.log("already up to date");
    return;
  }
  const assets = new Map<string, string>();
  for (const line of manifest.slice(1)) {
    const [name, sha] = line.trim().split(/\s+/);
    if (name && sha) assets.set(name, sha);
  }
  console.log(`updating from ${currentVersion} to ${remoteVersion}`);
  const asset = `${baseName}-${process.platform}-${process.arch}.gz`;
  const expected = assets.get(asset);
  const res = await githubFetch(`${base}/${asset}`);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}) for ${asset}`);
  }
  const compressed = new Uint8Array(await res.arrayBuffer());
  if (expected) {
    const actual = createHash("sha256").update(compressed).digest("hex");
    if (actual !== expected) {
      throw new Error(`Checksum mismatch for ${asset}`);
    }
  }
  const bytes = Bun.gunzipSync(compressed);
  const target = process.execPath;
  const tmp = join(dirname(target), `${asset}.tmp-${process.pid}`);
  await Bun.write(tmp, bytes);
  await chmod(tmp, 0o755);
  await rename(tmp, target);
  console.log("updated");
}
