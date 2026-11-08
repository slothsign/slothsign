/**
 * Generate all app assets from the canonical <root>/assets/sloth.svg:
 *   1. Copy the SVG into each app's src/assets (apps build standalone).
 *   2. Render PNG icons from the SVG into apps/extension/public
 *      (the manifest references icon-<size>.png relative to publicDir, so
 *      CRXJS emits them at the dist root).
 *   3. Render the phone app icons into apps/phone/assets.
 *
 * Args:
 *   --source <path>   SVG source (default: root/assets/sloth.svg)
 *   --out <dir>       icon output dir (default: apps/extension/public)
 *   --sizes <list>    comma-separated sizes (default: 16,32,48,128)
 *
 * Usage: bun run sync:assets
 */
import sharp from "sharp";
import { cpSync, mkdirSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = join(root, "assets");

interface Args {
  source: string;
  out: string;
  sizes: number[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    source: join(assetsDir, "sloth.svg"),
    out: join(root, "apps", "extension", "public"),
    sizes: [16, 32, 48, 128],
  };
  for (const raw of argv.slice(2)) {
    const eq = raw.indexOf("=");
    const key = eq === -1 ? raw : raw.slice(0, eq);
    const value = eq === -1 ? undefined : raw.slice(eq + 1);
    switch (key) {
      case "--source":
        args.source = resolve(root, value!);
        break;
      case "--out":
        args.out = resolve(root, value!);
        break;
      case "--sizes":
        args.sizes = value!.split(",").map(Number);
        break;
      default:
        console.error(`Unknown arg: ${key}`);
        process.exit(1);
    }
  }
  return args;
}

const { source, out, sizes } = parseArgs(process.argv);

if (!existsSync(assetsDir)) {
  console.error(`No assets dir at ${assetsDir}`);
  process.exit(1);
}

// 1. Sync the SVG into each app's src/assets.
const assets = readdirSync(assetsDir).filter((name) => statSync(join(assetsDir, name)).isFile());
if (assets.length === 0) {
  console.error(`No files in ${assetsDir}`);
  process.exit(1);
}
const appsDir = join(root, "apps");
if (!existsSync(appsDir)) {
  console.error(`No apps dir at ${appsDir}`);
  process.exit(1);
}
for (const app of readdirSync(appsDir).filter((name) =>
  statSync(join(appsDir, name)).isDirectory(),
)) {
  const target = join(appsDir, app, "src", "assets");
  mkdirSync(target, { recursive: true });
  for (const name of assets) cpSync(join(assetsDir, name), join(target, name));
  console.log(`✔ synced ${assets.length} asset(s) -> ${target}`);
}

// 2. Render PNG icons from the SVG.
if (!existsSync(source)) {
  console.error(`No source icon at ${source}`);
  process.exit(1);
}
mkdirSync(out, { recursive: true });
const base = await sharp(source).resize(128, 128).png().toBuffer();
for (const size of sizes) {
  await sharp(base)
    .resize(size, size)
    .png()
    .toFile(join(out, `icon-${size}.png`));
  console.log(`✔ icon-${size}.png -> ${out}`);
}

// 3. Render the phone app icons. Android crops adaptive icons to the centre, so
// the foreground keeps the artwork inside the safe zone.
const phoneAssets = join(appsDir, "phone", "assets");
mkdirSync(phoneAssets, { recursive: true });
const PHONE_ICON = 1024;
const PHONE_ARTWORK = 620;
const phoneArtwork = await sharp(source, { density: 1200 })
  .resize(PHONE_ARTWORK, PHONE_ARTWORK, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();
const phoneCanvas = (background: sharp.Color) =>
  sharp({
    create: { width: PHONE_ICON, height: PHONE_ICON, channels: 4, background },
  }).composite([{ input: phoneArtwork, gravity: "centre" }]);
await phoneCanvas({ r: 255, g: 255, b: 255, alpha: 1 }).png().toFile(join(phoneAssets, "icon.png"));
await phoneCanvas({ r: 0, g: 0, b: 0, alpha: 0 })
  .png()
  .toFile(join(phoneAssets, "android-icon-foreground.png"));
console.log(`✔ phone icons -> ${phoneAssets}`);
