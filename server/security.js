// 상용 운영 하드닝 — 보안 헤더 · HTTPS 강제 · 레이트리밋 · 접근 로그.
//
// 전제: 단일 프로세스 배포(SQLite와 동일한 전제). 레이트리밋 카운터는 메모리에 두며,
// 다중 인스턴스로 확장할 때는 저장소를 외부화해야 한다(그 시점은 Postgres 이전과 같은 단계).
//
// 환경변수:
//   GUARDNOTE_FORCE_HTTPS=1     x-forwarded-proto가 http면 https로 301 리다이렉트 + HSTS
//   GUARDNOTE_TRUST_PROXY=1     프록시(Railway/Render/nginx) 뒤에서 실제 클라이언트 IP 사용
//   GUARDNOTE_CSP=off           Content-Security-Policy 헤더 끄기 (문제 발생 시 탈출구)
//   GUARDNOTE_RATE_LIMIT=300    IP당 분당 최대 요청 수 (0이면 비활성, 기본 300)
//   GUARDNOTE_AUTH_FAIL_LIMIT=10  IP당 10분 창에서 허용되는 인증 실패 횟수 (0이면 비활성)
//   GUARDNOTE_ACCESS_LOG=off    요청 로그 끄기

const FORCE_HTTPS = process.env.GUARDNOTE_FORCE_HTTPS === "1";
const CSP_ENABLED = process.env.GUARDNOTE_CSP !== "off";
const RATE_LIMIT_PER_MIN = Number(process.env.GUARDNOTE_RATE_LIMIT ?? 300);
const AUTH_FAIL_LIMIT = Number(process.env.GUARDNOTE_AUTH_FAIL_LIMIT ?? 10);
const AUTH_FAIL_WINDOW_MS = 10 * 60 * 1000;
const ACCESS_LOG = process.env.GUARDNOTE_ACCESS_LOG !== "off";

// 결제(토스페이먼츠) SDK·카드등록창이 동작해야 하므로 해당 도메인만 예외로 연다.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://js.tosspayments.com",
  "style-src 'self' 'unsafe-inline'", // React 인라인 style 속성 사용
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.tosspayments.com",
  "frame-src https://*.tosspayments.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join("; ");

// ── 보안 헤더 + HTTPS 강제 ─────────────────────────────────────────────
export function securityHeaders(req, res, next) {
  if (FORCE_HTTPS && req.headers["x-forwarded-proto"] === "http") {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }
  if (FORCE_HTTPS) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (CSP_ENABLED) res.setHeader("Content-Security-Policy", CSP);
  next();
}

// ── 슬라이딩 윈도우 카운터 (메모리) ──────────────────────────────────────
function makeWindowCounter(windowMs) {
  const hits = new Map(); // key → [timestamps]
  function count(key, now) {
    const arr = hits.get(key) || [];
    const fresh = arr.filter((t) => now - t < windowMs);
    hits.set(key, fresh);
    return fresh;
  }
  return {
    add(key) {
      const now = Date.now();
      const fresh = count(key, now);
      fresh.push(now);
      hits.set(key, fresh);
      return fresh.length;
    },
    size(key) {
      return count(key, Date.now()).length;
    },
    sweep() {
      const now = Date.now();
      for (const [k, arr] of hits) {
        const fresh = arr.filter((t) => now - t < windowMs);
        if (fresh.length === 0) hits.delete(k);
        else hits.set(k, fresh);
      }
    },
  };
}

const globalCounter = makeWindowCounter(60 * 1000);
const authFailCounter = makeWindowCounter(AUTH_FAIL_WINDOW_MS);
// 메모리 누수 방지 — 오래된 IP 항목 주기 정리
const sweeper = setInterval(() => { globalCounter.sweep(); authFailCounter.sweep(); }, 5 * 60 * 1000);
sweeper.unref?.();

// ── 전역 레이트리밋 (IP당 분당 N회) ─────────────────────────────────────
// 정적 파일은 제외하고 /api 경로에만 건다 (SPA 에셋 로딩을 막지 않기 위함).
export function apiRateLimit(req, res, next) {
  if (!RATE_LIMIT_PER_MIN) return next();
  const n = globalCounter.add(req.ip || "unknown");
  if (n > RATE_LIMIT_PER_MIN) {
    return res.status(429).json({ error: "요청이 너무 잦습니다. 잠시 후 다시 시도하세요." });
  }
  next();
}

// ── 인증 실패 제한 (브루트포스 차단) ────────────────────────────────────
// 잘못된 키/토큰으로 10분 안에 N회 이상 실패한 IP는 그 창이 끝날 때까지 인증 시도를 거부한다.
export function authFailBlocked(ip) {
  if (!AUTH_FAIL_LIMIT) return false;
  return authFailCounter.size(ip || "unknown") >= AUTH_FAIL_LIMIT;
}

export function recordAuthFail(ip) {
  if (!AUTH_FAIL_LIMIT) return;
  authFailCounter.add(ip || "unknown");
}

export const AUTH_BLOCK_MESSAGE = "인증 실패가 반복되어 이 IP의 시도를 일시 차단했습니다. 10분 후 다시 시도하세요.";

// ── 접근 로그 (경량) ────────────────────────────────────────────────────
// 쿼리스트링은 담당자 이름 등 업무 데이터가 들어갈 수 있어 기록하지 않는다. 경로+상태+시간만.
export function accessLog(req, res, next) {
  if (!ACCESS_LOG) return next();
  const started = Date.now();
  res.on("finish", () => {
    if (!req.path.startsWith("/api")) return; // 정적 파일은 제외
    const who = req.tenant ? req.tenant.slug : req.admin ? "admin" : "-";
    console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms ip=${req.ip} who=${who}`);
  });
  next();
}
