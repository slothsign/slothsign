import { mkdirSync } from "node:fs";

const now = new Date();
const sha = Bun.spawnSync(["git", "rev-parse", "--short=7", "HEAD"]).stdout.toString().trim();
const VERSION_INFO = `${now.getUTCFullYear() - 2000}.${now.getUTCMonth() + 1}.${now.getUTCDate()}-${sha}`;
const UPDATE_REPO = "slothsign/slothsign";

const TARGETS = ["bun-darwin-arm64", "bun-darwin-x64", "bun-linux-arm64", "bun-linux-x64"] as const;

mkdirSync("bin", { recursive: true });

for (const target of TARGETS) {
  const name = `sloth-${target.replace(/^bun-/, "")}`;
  console.log(`Building ${name} (${target})`);
  const result = await Bun.build({
    entrypoints: ["src/index.ts"],
    outdir: "bin",
    target: "bun",
    compile: { outfile: name, target },
    minify: true,
    define: {
      "process.env.SLOTH_VERSION_INFO": JSON.stringify(VERSION_INFO),
      "process.env.SLOTH_UPDATE_REPO": JSON.stringify(UPDATE_REPO),
    },
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}

await Bun.write("bin/version.txt", VERSION_INFO);
console.log(`Wrote version ${VERSION_INFO} to bin/version.txt`);
