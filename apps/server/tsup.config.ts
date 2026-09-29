import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

// Bundles the server and every runtime dependency into dist/, so the Docker
// image only needs `node` and the migrations folder.
export default defineConfig({
  entry: { index: "src/index.ts", migrate: "src/migrate.ts" },
  format: ["cjs"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: [/.*/],
  // Optional native add-ons that the libraries load inside try/catch.
  external: ["pg-native", "bufferutil", "utf-8-validate"],
  define: { __APP_VERSION__: JSON.stringify(version) },
});
