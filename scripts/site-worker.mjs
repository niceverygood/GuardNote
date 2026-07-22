import { mkdirSync, writeFileSync } from "node:fs";

const worker = `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let response = await env.ASSETS.fetch(request);

    if (response.status === 404 && request.method === "GET" && !url.pathname.includes(".")) {
      const fallback = new URL("/index.html", url);
      response = await env.ASSETS.fetch(new Request(fallback, request));
    }

    return response;
  },
};
`;

mkdirSync("dist/server", { recursive: true });
writeFileSync("dist/server/index.js", worker, "utf8");
