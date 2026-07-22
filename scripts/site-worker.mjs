import { mkdirSync } from "node:fs";
import { build } from "esbuild";

mkdirSync("dist/server", { recursive: true });
await build({
  entryPoints: ["server/site-worker.js"],
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: false,
  sourcemap: false,
  legalComments: "none",
});
