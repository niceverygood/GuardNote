import { AiServiceError, aiServiceStatus, runAiTask } from "./ai-core.js";

const AI_PATHS = {
  "/api/ai/auto-answer": "auto-answer",
  "/api/ai/document-review": "document-review",
  "/api/ai/evidence-review": "evidence-review",
  "/api/ai/document-generate": "document-generate",
};

const requestWindows = new Map();
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  },
});

function rateLimited(request) {
  const key = request.headers.get("cf-connecting-ip") || "unknown";
  const now = Date.now();
  const current = requestWindows.get(key);
  if (!current || now - current.startedAt > 60_000) {
    requestWindows.set(key, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > 20;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const config = { apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL };

    if (url.pathname === "/api/ai/status") {
      if (request.method !== "GET") return json({ error: "허용되지 않은 요청입니다." }, 405);
      return json(aiServiceStatus(config));
    }

    const task = AI_PATHS[url.pathname];
    if (task) {
      if (request.method !== "POST") return json({ error: "허용되지 않은 요청입니다." }, 405);
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin) return json({ error: "허용되지 않은 출처입니다." }, 403);
      if (rateLimited(request)) return json({ error: "AI 요청이 많습니다. 잠시 후 다시 시도해주세요.", code: "ai_rate_limited" }, 429);
      const length = Number(request.headers.get("content-length") || 0);
      if (length > 9 * 1024 * 1024) return json({ error: "요청 파일이 너무 큽니다." }, 413);
      try {
        const payload = await request.json();
        return json(await runAiTask(task, payload, config));
      } catch (error) {
        if (error instanceof AiServiceError) return json({ error: error.message, code: error.code }, error.status);
        console.error("GuardNote AI worker error", error?.message || error);
        return json({ error: "AI 요청을 처리하지 못했습니다." }, 500);
      }
    }

    let response = await env.ASSETS.fetch(request);
    if (response.status === 404 && request.method === "GET" && !url.pathname.includes(".")) {
      response = await env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
    }
    return response;
  },
};
