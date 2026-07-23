import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

mkdirSync("dist/server", { recursive: true });

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const embeddedAssets = {};
const addAsset = (filePath, publicPath) => {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] || "application/octet-stream";
  embeddedAssets[publicPath] = {
    contentType,
    encoding: contentType.startsWith("text/") || extension === ".json" ? "utf8" : "base64",
    body: readFileSync(filePath, contentType.startsWith("text/") || extension === ".json" ? "utf8" : "base64"),
  };
};

addAsset("dist/index.html", "/index.html");
for (const name of readdirSync("dist/assets")) {
  addAsset(path.join("dist/assets", name), `/assets/${name}`);
}

const generatedEntry = "dist/server/.site-worker-entry.mjs";
writeFileSync(generatedEntry, `
import worker from "../../server/site-worker.js";

const EMBEDDED_ASSETS = ${JSON.stringify(embeddedAssets)};

function embeddedResponse(pathname) {
  const key = pathname === "/" ? "/index.html" : pathname;
  const asset = EMBEDDED_ASSETS[key];
  if (!asset) return new Response(null, { status: 404 });
  const body = asset.encoding === "base64"
    ? Uint8Array.from(atob(asset.body), (character) => character.charCodeAt(0))
    : asset.body;
  return new Response(body, {
    headers: {
      "content-type": asset.contentType,
      "cache-control": key === "/index.html" ? "no-cache" : "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request, env, context) {
    const platformAssets = env?.ASSETS;
    const assets = {
      async fetch(assetRequest) {
        if (platformAssets?.fetch) {
          const response = await platformAssets.fetch(assetRequest);
          if (response.status !== 404) return response;
        }
        return embeddedResponse(new URL(assetRequest.url).pathname);
      },
    };
    return worker.fetch(request, { ...env, ASSETS: assets }, context);
  },
};
`, "utf8");

await build({
  entryPoints: [generatedEntry],
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: false,
  sourcemap: false,
  legalComments: "none",
});

unlinkSync(generatedEntry);
