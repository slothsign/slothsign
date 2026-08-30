import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BINARY = "sloth";
const UPDATE_REPO = "slothsign/slothsign";
const TARGETS = ["bun-darwin-arm64", "bun-darwin-x64", "bun-linux-arm64", "bun-linux-x64"] as const;

const now = new Date();
const sha =
  Bun.spawnSync(["git", "rev-parse", "--short=7", "HEAD"]).stdout.toString().trim() || "unknown";
const VERSION_INFO = `${now.getUTCFullYear() - 2000}.${now.getUTCMonth() + 1}.${now.getUTCDate()}-${sha}`;

const defines = {
  "process.env.SLOTH_VERSION_INFO": JSON.stringify(VERSION_INFO),
  "process.env.SLOTH_UPDATE_REPO": JSON.stringify(UPDATE_REPO),
};

mkdirSync("bin", { recursive: true });

for (const target of TARGETS) {
  const name = `${BINARY}-${target.replace(/^bun-/, "")}`;
  console.log(`Building ${name} (${target})`);
  const result = await Bun.build({
    entrypoints: ["src/index.ts"],
    outdir: "bin",
    target: "bun",
    compile: { outfile: name, target },
    minify: true,
    define: defines,
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}

const lines = [VERSION_INFO];
for (const target of TARGETS) {
  const exe = `${BINARY}-${target.replace(/^bun-/, "")}`;
  const src = `bin/${exe}`;
  const raw = readFileSync(src);
  lines.push(`${exe} ${createHash("sha256").update(raw).digest("hex")}`);
  const gz = Bun.gzipSync(raw);
  writeFileSync(`${src}.gz`, gz);
  lines.push(`${exe}.gz ${createHash("sha256").update(gz).digest("hex")}`);
}
await Bun.write("bin/version.txt", lines.join("\n") + "\n");
console.log(`Wrote bin/version.txt (${VERSION_INFO})`);
