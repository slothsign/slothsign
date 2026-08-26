import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import manifest from "./manifest.config.ts";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@keystonehq/bc-ur-registry-eth":
        "@keystonehq/bc-ur-registry-eth/dist/bc-ur-registry-eth.esm.js",
      hdkey: fileURLToPath(new URL("./src/lib/stubs/hdkey.ts", import.meta.url)),
      secp256k1: fileURLToPath(new URL("./src/lib/stubs/secp256k1.ts", import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    Icons({ compiler: "jsx", jsx: "react" }),
    nodePolyfills({ globals: { process: true, Buffer: true }, protocolImports: false }),
    crx({ manifest }),
  ],
  build: {
    rollupOptions: {
      input: {
        signer: "signer.html",
      },
    },
  },
});
