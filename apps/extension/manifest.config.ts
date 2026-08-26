import { defineManifest } from "@crxjs/vite-plugin";
import { version } from "./package.json" with { type: "json" };

const buildType = process.env.SLOTHSIGN_BUILD_TYPE ?? "build";

export default defineManifest({
  manifest_version: 3,
  name: buildType === "zip" ? "SlothSign" : "SlothSign (Build)",
  description: "Just sign. Isolated Web3 signer provider.",
  version,
  permissions: ["storage", "activeTab"],
  host_permissions: ["https://*/*"],
  background: {
    service_worker: "src/entrypoints/background/index.ts",
    type: "module",
  },
  action: {
    default_title: "SlothSign",
    default_popup: "popup.html",
    default_icon: {
      16: "icon-16.png",
      32: "icon-32.png",
      48: "icon-48.png",
      128: "icon-128.png",
    },
  },
  options_ui: {
    page: "options.html",
    open_in_tab: true,
  },
  content_scripts: [
    {
      js: ["bridge.iife.ts"],
      matches: ["http://*/*", "https://*/*"],
      run_at: "document_start",
    },
    {
      js: ["provider.iife.ts"],
      matches: ["http://*/*", "https://*/*"],
      run_at: "document_start",
      world: "MAIN",
    },
  ],
  icons: {
    16: "icon-16.png",
    32: "icon-32.png",
    48: "icon-48.png",
    128: "icon-128.png",
  },
});
