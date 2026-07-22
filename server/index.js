// GuardNote API 서버 — Express + SQLite, 멀티테넌시(고객사별 원장 완전 격리)
import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  db, appendEntry, allEntries, filterEntries, verifyChain, categoryStats, GENESIS,
  createTenant, listTenants, rotateApiKey, setPlan, findTenantBySlug, countEntries,
  latestMonitorRun, recentMonitorRuns, listAnchors,
  getBreachState, startBreach, endBreach, toggleBreachStep,
  recordAudit, listAudit,
} from "./db.js";
import {
  securityHeaders, apiRateLimit, accessLog,
  authFailBlocked, recordAuthFail, AUTH_BLOCK_MESSAGE,
} from "./security.js";
import { piiViolation } from "./pii-guard.js";
import { COMPLIANCE, COMPLIANCE_SOURCE, warnDaysByKey } from "./compliance.js";
import { startBackupScheduler } from "./backup.js";
import { seedIfEmpty } from "./seed.js";
import {
  requireAuth, requireAdmin, requireUser, requireOwner,
  identify, sessionIdentity, readCookie, SESSION_COOKIE, adminEnabled, getAdminToken,
} from "./auth.js";
import {
  createUser, findUserByEmail, findUserById, listUsers, countActiveOwners,
  setUserStatus, setUserPassword, touchLastLogin, verifyPassword,
  createSession, revokeSession, createInvite, findInvite, consumeInvite,
  recordActivity, listActivity,
} from "./users.js";
import { entriesToCsv } from "./csv-export.js";
import { buildEvidencePdf } from "./pdf-report.js";
import { buildBreachDraftPdf } from "./breach-draft.js";
import { generateBreachDraft, FIELD_SETS as AI_FIELD_SETS } from "./ai-draft.js";
import { AiServiceError, aiServiceStatus, runAiTask } from "./ai-core.js";
import { PLANS, PLAN_KEYS, getPlan, planAllows, withinEntryQuota } from "./plans.js";
import { anchorTenant, anchorStatus } from "./anchor.js";
import { startMonitor, runMonitorOnce } from "./monitor.js";
import {
  billingMode, tossClientKey, ensureSubscription, activateSubscription,
  cancelSubscription, resumeSubscription, billingSummary, startBillingScheduler, runBillingOnce,
} from "./billing.js";
import {
  renderContract, signContract, contractStatus, allContractsSigned, buildContractPdf,
  CONTRACT_KINDS, CONTRACT_VERSION,
} from "./contracts.js";
import { findContract, getSubscription } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_KEY_FILE = path.join(__dirname, ".demo-key"); // 로컬 개발 편의용. 실제 고객 키는 이렇게 저장하지 않는다.
// 범용 PORT가 아니라 전용 변수명 사용 — `npm run dev`가 vite(웹)와 이 서버를 동시에 띄우는
// 구조라, 개발 툴링이 주입하는 PORT(웹용)와 충돌해 API 서버가 같은 포트로 바인딩을 시도하는 것을 방지.
const PORT = process.env.GUARDNOTE_PORT || 8787;
// 데모/시드 부트스트랩과 /api/_demo/* 는 프로덕션에서 절대 실행되면 안 된다 — 평문 키 파일 생성,
// 임의 UPDATE 등 로컬 개발 전용 동작이기 때문. 이 하나의 플래그로 둘 다 통제한다.
const demoEnabled = process.env.NODE_ENV !== "production";
const ALLOWED_ORIGINS = (process.env.GUARDNOTE_ALLOWED_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",").map((s) => s.trim()).filter(Boolean);

// 안전성 확보조치 10개 항목 — 고시(제2025-9호) 제2장 제4조~제13조 순서를 따른다.
// 조항·점검주기·권장 활동은 server/compliance.js에서 병합된다.
export const CAT_KEYS = [
  { key: "plan",     name: "내부 관리계획 수립·시행·점검" },
  { key: "auth",     name: "접근 권한의 관리" },
  { key: "access",   name: "접근통제" },
  { key: "crypto",   name: "개인정보의 암호화" },
  { key: "log",      name: "접속기록 보관 및 점검" },
  { key: "malware",  name: "악성프로그램 등 방지" },
  { key: "phys",     name: "물리적 안전조치" },
  { key: "disaster", name: "재해·재난 대비 안전조치" },
  { key: "output",   name: "출력·복사시 안전조치" },
  { key: "destroy",  name: "개인정보의 파기" },
];
const KEYS = CAT_KEYS.map((c) => c.key);
const catName = (key) => CAT_KEYS.find((c) => c.key === key)?.name ?? key;

// 유출 대응 워크플로우 4단계 표시 이름 (원장 기록 문구에 사용)
const BREACH_STEP_LABELS = {
  scope: "유출 범위·항목 확정",
  notify: "정보주체 통지",
  pipc: "보호위원회(PIPC) 신고",
  kisa: "KISA(KrCERT) 신고",
};

// 클라이언트에 내려줄 플랜 요약(내부 구조 그대로 노출)
const planView = (t) => {
  const p = getPlan(t.plan);
  return { key: p.key, label: p.label, maxEntries: p.maxEntries, features: p.features, priceMonthly: p.priceMonthly };
};

// 쿼리스트링에서 발췌(필터) 조건을 뽑아낸다. 값이 전부 없으면 전체 원장과 동일.
function parseFilters(req) {
  const { from, to, cat_key, actor } = req.query || {};
  return {
    from: typeof from === "string" && from ? from : null,
    to: typeof to === "string" && to ? to : null,
    cat_key: typeof cat_key === "string" && KEYS.includes(cat_key) ? cat_key : null,
    actor: typeof actor === "string" && actor ? actor : null,
  };
}

// 로컬 개발용 데모 테넌트 준비. 실제 고객 온보딩은:
//   node server/create-tenant.js <slug> <표시이름>
// demoEnabled(NODE_ENV!==production)일 때만 실행 — 프로덕션에선 평문 키 파일을 아예 만들지 않는다.
function ensureDemoTenant() {
  let demo = listTenants().find((t) => t.slug === "demo");
  if (!demo) {
    const created = createTenant({ slug: "demo", name: "㈜바틀 (데모)", plan: "enterprise" });
    demo = created.tenant;
    fs.writeFileSync(DEMO_KEY_FILE, created.apiKey, { encoding: "utf8", mode: 0o600 }); // 소유자만 읽기/쓰기
  } else if (demo.plan !== "enterprise") {
    setPlan("demo", "enterprise"); // 데모는 모든 기능이 보이도록 enterprise 유지
  }
  seedIfEmpty(demo.id);
  return demo;
}
if (demoEnabled) {
  const demoTenant = ensureDemoTenant();
  if (fs.existsSync(DEMO_KEY_FILE)) {
    console.log(`🔑 데모 테넌트(${demoTenant.name}) API 키 — 프론트엔드 접속 시 입력하세요:`);
    console.log(`   ${fs.readFileSync(DEMO_KEY_FILE, "utf8").trim()}`);
  }
  if (adminEnabled) {
    console.log("🛠  관리자 토큰 — 관리자 콘솔 접속 시 입력하세요:");
    console.log(`   ${getAdminToken()}`);
  }
}

const PKG = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

const app = express();
// 프록시(Railway/Render/nginx) 뒤에서는 req.ip가 실제 클라이언트 IP를 가리켜야
// 레이트리밋·감사 로그가 의미를 가진다.
if (process.env.GUARDNOTE_TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(securityHeaders);
app.use(accessLog);
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use("/api", apiRateLimit);
app.use(express.json({ limit: "9mb" }));

// 헬스체크는 인증 없이 — 로드밸런서/모니터링용
app.get("/api/health", (req, res) => res.json({
  ok: true, version: PKG.version, uptimeSec: Math.floor(process.uptime()), genesis: GENESIS,
}));

// 새 개인정보 AI 워크스페이스. 키는 서버 환경변수로만 읽고 브라우저에는 절대 노출하지 않는다.
// 로컬 개발과 Sites Worker가 동일한 ai-core를 사용해 결과 구조가 달라지지 않도록 한다.
const AI_TASK_BY_PATH = {
  "/auto-answer": "auto-answer",
  "/document-review": "document-review",
  "/evidence-review": "evidence-review",
  "/document-generate": "document-generate",
};
const aiConfig = () => ({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL });
const aiRateWindows = new Map();
app.use("/api/ai", (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: "허용되지 않은 출처입니다." });
  const key = req.ip || "unknown";
  const now = Date.now();
  const window = aiRateWindows.get(key);
  if (!window || now - window.startedAt > 60_000) aiRateWindows.set(key, { startedAt: now, count: 1 });
  else if (++window.count > 20) return res.status(429).json({ error: "AI 요청이 많습니다. 잠시 후 다시 시도해주세요." });
  next();
});
app.get("/api/ai/status", (req, res) => res.json(aiServiceStatus(aiConfig())));
for (const [routePath, task] of Object.entries(AI_TASK_BY_PATH)) {
  app.post(`/api/ai${routePath}`, async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json(await runAiTask(task, req.body, aiConfig()));
    } catch (error) {
      if (error instanceof AiServiceError) return res.status(error.status).json({ error: error.message, code: error.code });
      console.error("GuardNote AI API error", error?.message || error);
      res.status(500).json({ error: "AI 요청을 처리하지 못했습니다." });
    }
  });
}

// 신원 확인 — 세션 쿠키(계정) 또는 Bearer 토큰(관리자/테넌트 키)을 판별해 화면을 분기한다.
// requireAuth를 타지 않는 경로이므로 브루트포스 카운터를 여기서도 직접 건다.
app.get("/api/whoami", (req, res) => {
  if (authFailBlocked(req.ip)) return res.status(429).json({ error: AUTH_BLOCK_MESSAGE });
  const sess = sessionIdentity(req);
  if (sess) {
    return res.json({
      role: "tenant",
      tenant: { name: sess.tenant.name, slug: sess.tenant.slug, plan: planView(sess.tenant) },
      user: { email: sess.user.email, name: sess.user.name, role: sess.user.role },
    });
  }
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  const id = scheme === "Bearer" && token ? identify(token) : null;
  if (!id) {
    if (token) recordAuthFail(req.ip);
    return res.status(401).json({ error: "유효하지 않은 토큰입니다." });
  }
  if (id.role === "admin") return res.json({ role: "admin" });
  res.json({ role: "tenant", tenant: { name: id.tenant.name, slug: id.tenant.slug, plan: planView(id.tenant) }, user: null });
});

/* ═══════════════════ 계정 인증 (세션 쿠키) ═══════════════════ */
// 사람용 로그인. 수집기(기계)는 기존 API 키를 그대로 쓴다 — 두 트랙은 서로 대체하지 않는다.
function setSessionCookie(res, token, maxAgeSec) {
  const secure = process.env.GUARDNOTE_FORCE_HTTPS === "1" ? "; Secure" : "";
  res.setHeader("Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`);
}
function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}
const userView = (u) => ({ email: u.email, name: u.name, role: u.role });

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  // IP 기준 + 계정 기준 이중 카운터 — 한 계정을 여러 IP로 두드리는 것도 막는다.
  if (authFailBlocked(req.ip) || authFailBlocked(`email:${email}`)) {
    return res.status(429).json({ error: AUTH_BLOCK_MESSAGE });
  }
  const user = email ? findUserByEmail(email) : null;
  const ok = user && user.status === "active" && verifyPassword(password, user.pw_hash);
  if (!ok) {
    recordAuthFail(req.ip);
    if (email) recordAuthFail(`email:${email}`);
    return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
  }
  const sess = createSession(user.id, req.ip);
  setSessionCookie(res, sess.token, sess.maxAgeSec);
  touchLastLogin(user.id);
  recordActivity(user.tenant_id, user.email, "login", { ip: req.ip });
  const tenant = db.prepare("SELECT id, slug, name, plan FROM tenants WHERE id = ?").get(user.tenant_id);
  res.json({ role: "tenant", tenant: { name: tenant.name, slug: tenant.slug, plan: planView(tenant) }, user: userView(user) });
});

app.post("/api/auth/logout", (req, res) => {
  const sess = sessionIdentity(req);
  if (sess) recordActivity(sess.tenant.id, sess.user.email, "logout", { ip: req.ip });
  revokeSession(readCookie(req, SESSION_COOKIE));
  clearSessionCookie(res);
  res.json({ ok: true });
});

// 초대/재설정 링크 정보 — 수락 화면이 회사명·이메일을 표시할 때 사용 (인증 불필요, 토큰이 곧 자격)
app.get("/api/auth/invite/:token", (req, res) => {
  const inv = findInvite(req.params.token);
  if (!inv) return res.status(404).json({ error: "유효하지 않거나 만료된 링크입니다. 새 링크를 요청하세요." });
  const tenant = db.prepare("SELECT name FROM tenants WHERE id = ?").get(inv.tenant_id);
  const target = inv.kind === "reset" && inv.user_id ? findUserById(inv.user_id) : null;
  res.json({
    kind: inv.kind, tenantName: tenant?.name || "", role: inv.role,
    email: inv.kind === "reset" ? target?.email || null : inv.email,
    expiresAt: inv.expires_at,
  });
});

// 초대 수락(계정 생성) / 비밀번호 재설정 — 완료 즉시 로그인 세션을 연다.
app.post("/api/auth/invite/:token/accept", (req, res) => {
  try {
    const inv = findInvite(req.params.token);
    if (!inv) return res.status(404).json({ error: "유효하지 않거나 만료된 링크입니다. 새 링크를 요청하세요." });
    const { name, password } = req.body || {};
    let user;
    if (inv.kind === "invite") {
      user = createUser({ tenant_id: inv.tenant_id, email: inv.email, name, role: inv.role, password });
      recordActivity(inv.tenant_id, user.email, "invite.accept", { detail: `role=${inv.role}`, ip: req.ip });
    } else {
      user = findUserById(inv.user_id);
      if (!user) return res.status(404).json({ error: "대상 계정을 찾을 수 없습니다." });
      setUserPassword(user.id, password);
      if (user.status !== "active") setUserStatus(user.id, "active");
      recordActivity(inv.tenant_id, user.email, "password.change", { detail: "재설정 링크", ip: req.ip });
    }
    consumeInvite(inv.id);
    const sess = createSession(user.id, req.ip);
    setSessionCookie(res, sess.token, sess.maxAgeSec);
    touchLastLogin(user.id);
    const tenant = db.prepare("SELECT id, slug, name, plan FROM tenants WHERE id = ?").get(user.tenant_id);
    res.status(201).json({ role: "tenant", tenant: { name: tenant.name, slug: tenant.slug, plan: planView(tenant) }, user: userView(user) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ═══════════════════ 관리자 API (requireAdmin) ═══════════════════ */
// blanket 테넌트 인증(app.use("/api", requireAuth))보다 먼저 등록해야, 관리자 토큰이
// 테넌트 인증에 걸려 401 나는 것을 피할 수 있다.
app.use("/api/admin", requireAdmin);

app.get("/api/admin/tenants", (req, res) => {
  const tenants = listTenants().map((t) => {
    const v = verifyChain(t.id);
    const a = anchorStatus(t.id);
    const last = latestMonitorRun(t.id);
    const sub = getSubscription(t.id);
    return {
      ...t, plan: planView(t), blocks: v.blocks,
      integrity: { intact: v.intact, truncated: v.truncated, firstBrokenSeq: v.firstBrokenSeq },
      anchor: a, lastCheck: last ? last.checked_at : null,
      billing: sub ? { status: sub.status, nextBillingAt: sub.next_billing_at, cancelAtPeriodEnd: !!sub.cancel_at_period_end } : null,
    };
  });
  res.json({ tenants, plans: PLANS });
});

// 정기결제 즉시 1회 실행 (청구 시점 도래분 처리) — 운영 점검용
app.post("/api/admin/billing/run", async (req, res) => {
  const results = await runBillingOnce();
  recordAudit("billing.run", { detail: `${results.length}건 처리`, ip: req.ip });
  res.json({ ran: results.length, results });
});

app.post("/api/admin/tenants", (req, res) => {
  try {
    const { slug, name, plan = "free" } = req.body || {};
    if (!slug || !name) return res.status(400).json({ error: "slug, name 은 필수입니다." });
    if (!PLAN_KEYS.includes(plan)) return res.status(400).json({ error: "알 수 없는 plan 입니다." });
    const { tenant, apiKey } = createTenant({ slug, name, plan });
    recordAudit("tenant.create", { target: slug, detail: `${name} · ${plan}`, ip: req.ip });
    res.status(201).json({ tenant: { ...tenant, plan: planView(tenant) }, apiKey });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/admin/tenants/:slug/rotate", (req, res) => {
  try {
    const { tenant, apiKey } = rotateApiKey(req.params.slug);
    recordAudit("tenant.rotate", { target: req.params.slug, detail: "API 키 재발급(기존 키 무효화)", ip: req.ip });
    res.json({ tenant: { ...tenant, plan: planView(tenant) }, apiKey });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.post("/api/admin/tenants/:slug/plan", (req, res) => {
  try {
    const { plan } = req.body || {};
    if (!PLAN_KEYS.includes(plan)) return res.status(400).json({ error: "알 수 없는 plan 입니다." });
    const tenant = setPlan(req.params.slug, plan);
    recordAudit("tenant.plan", { target: req.params.slug, detail: `→ ${plan}`, ip: req.ip });
    res.json({ tenant: { ...tenant, plan: planView(tenant) } });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.post("/api/admin/tenants/:slug/anchor", async (req, res) => {
  const t = findTenantBySlug(req.params.slug);
  if (!t) return res.status(404).json({ error: "존재하지 않는 slug 입니다." });
  const out = await anchorTenant(t.id);
  recordAudit("tenant.anchor", { target: req.params.slug, detail: `seq #${out.anchor?.seq ?? "?"}`, ip: req.ip });
  res.json(out);
});

// 감사 로그 조회 — 운영 행위 추적 (append 전용, 수정·삭제 API 없음)
app.get("/api/admin/audit", (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  res.json({ audit: listAudit(limit) });
});

// 초대/재설정 링크의 기준 주소 — 배포 환경에선 GUARDNOTE_URL(공식 주소)을 우선 사용하고,
// 없으면 요청 호스트로 만든다 (개발 환경에선 vite 프록시 때문에 API 포트가 잡힐 수 있음).
const publicBase = (req) => (process.env.GUARDNOTE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
const inviteUrlOf = (req, token) => `${publicBase(req)}/?invite=${token}`;

// 테넌트 최초 owner 초대 링크 발급 — 온보딩: 테넌트 생성 → owner 초대 링크를 고객 담당자에게 전달.
app.post("/api/admin/tenants/:slug/invite", (req, res) => {
  try {
    const t = findTenantBySlug(req.params.slug);
    if (!t) return res.status(404).json({ error: "존재하지 않는 slug 입니다." });
    const { email, role = "owner" } = req.body || {};
    const inv = createInvite({ kind: "invite", tenant_id: t.id, email, role });
    recordAudit("tenant.invite", { target: req.params.slug, detail: `${email} (${role})`, ip: req.ip });
    res.status(201).json({ inviteUrl: inviteUrlOf(req, inv.token), expiresDays: inv.expiresDays });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/admin/monitor", (req, res) => {
  const bySlug = Object.fromEntries(listTenants().map((t) => [t.id, t.slug]));
  const runs = recentMonitorRuns(50).map((r) => ({ ...r, slug: bySlug[r.tenant_id] }));
  res.json({ runs });
});

app.post("/api/admin/monitor/run", async (req, res) => {
  const summary = await runMonitorOnce();
  recordAudit("monitor.run", { detail: `${summary.length}곳 검증`, ip: req.ip });
  res.json({ ran: summary.length, summary });
});

/* ═══════════════════ 테넌트 API (requireAuth) ═══════════════════ */
app.use("/api", requireAuth);

/* ── 내 계정 · 팀 관리 (계정 로그인 전용 — API 키로는 접근 불가) ── */
app.post("/api/auth/password", requireUser, (req, res) => {
  try {
    const { current, next } = req.body || {};
    const me = findUserById(req.user.id);
    if (!verifyPassword(String(current || ""), me.pw_hash)) {
      return res.status(400).json({ error: "현재 비밀번호가 올바르지 않습니다." });
    }
    setUserPassword(me.id, next); // 다른 기기 세션은 전부 무효화된다
    const sess = createSession(me.id, req.ip); // 이 기기는 새 세션으로 유지
    setSessionCookie(res, sess.token, sess.maxAgeSec);
    recordActivity(req.tenant.id, me.email, "password.change", { ip: req.ip });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/team", requireUser, (req, res) => {
  res.json({ users: listUsers(req.tenant.id), me: { email: req.user.email, role: req.user.role } });
});

// 초대 링크 발급 — 링크는 이 응답에서 한 번만 내려간다 (DB엔 해시만 저장).
app.post("/api/team/invite", requireUser, requireOwner, (req, res) => {
  try {
    const { email, role = "member" } = req.body || {};
    const inv = createInvite({ kind: "invite", tenant_id: req.tenant.id, email, role });
    recordActivity(req.tenant.id, req.user.email, "team.invite", { detail: `${email} (${role})`, ip: req.ip });
    res.status(201).json({ inviteUrl: inviteUrlOf(req, inv.token), expiresDays: inv.expiresDays });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 비밀번호 재설정 링크 발급 (owner) — 이메일 인프라 없이도 분실 대응이 가능하다.
app.post("/api/team/:id/reset-link", requireUser, requireOwner, (req, res) => {
  const target = findUserById(Number(req.params.id));
  if (!target || target.tenant_id !== req.tenant.id) return res.status(404).json({ error: "팀원을 찾을 수 없습니다." });
  const inv = createInvite({ kind: "reset", tenant_id: req.tenant.id, user_id: target.id, role: target.role });
  recordActivity(req.tenant.id, req.user.email, "team.reset-link", { detail: target.email, ip: req.ip });
  res.status(201).json({ inviteUrl: inviteUrlOf(req, inv.token), expiresDays: inv.expiresDays });
});

// 계정 비활성화/재활성화 (owner). 자기 자신과 마지막 owner는 잠글 수 없다.
app.post("/api/team/:id/status", requireUser, requireOwner, (req, res) => {
  const target = findUserById(Number(req.params.id));
  if (!target || target.tenant_id !== req.tenant.id) return res.status(404).json({ error: "팀원을 찾을 수 없습니다." });
  const { status } = req.body || {};
  if (!["active", "disabled"].includes(status)) return res.status(400).json({ error: "status는 active|disabled 여야 합니다." });
  if (status === "disabled") {
    if (target.id === req.user.id) return res.status(400).json({ error: "자기 자신은 비활성화할 수 없습니다." });
    if (target.role === "owner" && countActiveOwners(req.tenant.id) <= 1) {
      return res.status(400).json({ error: "마지막 활성 owner는 비활성화할 수 없습니다." });
    }
  }
  const updated = setUserStatus(target.id, status);
  recordActivity(req.tenant.id, req.user.email, status === "disabled" ? "team.disable" : "team.enable", { detail: target.email, ip: req.ip });
  res.json({ user: { id: updated.id, email: updated.email, status: updated.status } });
});

// 사용자 활동 로그 (owner) — 누가 로그인·봉인·내보내기 했는지
app.get("/api/team/activity", requireUser, requireOwner, (req, res) => {
  const limit = Math.min(300, Math.max(1, Number(req.query.limit) || 100));
  res.json({ activity: listActivity(req.tenant.id, limit) });
});

// 원장 조회 (해당 테넌트만). from/to/cat_key/actor 쿼리로 "발췌 보기"도 지원 —
// 조건이 하나도 없으면 지금까지와 동일하게 전체 원장을 반환한다.
app.get("/api/entries", (req, res) => {
  const filters = parseFilters(req);
  const hasFilter = !!(filters.from || filters.to || filters.cat_key || filters.actor);
  const entries = hasFilter ? filterEntries(req.tenant.id, filters) : allEntries(req.tenant.id);
  res.json({ genesis: GENESIS, entries, filtered: hasFilter, filters: hasFilter ? filters : null });
});

// 항목 메타(조항·주기·권장활동)와 테넌트별 현황을 병합한 카드 뷰
function categoriesView(tenantId) {
  const stats = categoryStats(tenantId, KEYS, warnDaysByKey());
  return CAT_KEYS.map((c) => {
    const comp = COMPLIANCE[c.key] || {};
    return {
      ...c, ...stats[c.key],
      article: comp.article || null,
      articleTitle: comp.articleTitle || null,
      cycle: comp.cycle || null,
      activities: comp.activities || [],
    };
  });
}

// 카테고리 현황(증적 건수·최근일·상태·고시 근거) + 플랜/사용량
app.get("/api/categories", (req, res) => {
  const cats = categoriesView(req.tenant.id);
  const okCount = cats.filter((c) => c.status === "ok").length;
  res.json({
    categories: cats, okCount, total: cats.length, score: Math.round((okCount / cats.length) * 100),
    standard: COMPLIANCE_SOURCE,
    tenant: { name: req.tenant.name, slug: req.tenant.slug, plan: planView(req.tenant) },
    usage: { entries: countEntries(req.tenant.id) },
  });
});

// 무결성 검증 — 제네시스부터 전체 재계산 + 앵커 상태 (해당 테넌트 원장만)
app.get("/api/verify", (req, res) => {
  res.json({ ...verifyChain(req.tenant.id), anchor: anchorStatus(req.tenant.id) });
});

// 앵커링 실행 (플랜에 anchor 기능이 있어야 함)
app.post("/api/anchor", async (req, res) => {
  if (!planAllows(req.tenant.plan, "anchor")) {
    return res.status(402).json({ error: "외부 타임스탬프 앵커링은 Enterprise 플랜에서 사용할 수 있습니다." });
  }
  const out = await anchorTenant(req.tenant.id);
  res.json(out);
});

/* ═══════════════════ 유출 대응 워크플로우 ═══════════════════ */
// 상태 조회 — 활성 여부, 개시 시각(=72시간 통지·신고 기한 카운트다운 기준), 단계별 완료 시각
app.get("/api/breach", (req, res) => {
  res.json(getBreachState(req.tenant.id));
});

// 사고 대응 개시 — 개시 시각을 원장에도 봉인 기록해, "대응을 시작했다"는 사실 자체를 증적화한다.
app.post("/api/breach/start", (req, res) => {
  if (!quotaGuard(req, res)) return;
  const state = startBreach(req.tenant.id);
  appendEntry(req.tenant.id, {
    cat_key: "log", actor: "CISO",
    action: `[사고대응] 유출사고 대응 개시 — 통지·신고 기한(72시간) 카운트다운 시작 (${new Date(state.started_at).toLocaleString("ko-KR")})`,
    recorded_by: req.user?.email || null,
  });
  res.json(state);
});

// 대응 종료 — 다음 대응/리허설을 위해 초기화(진행 이력은 원장의 봉인 기록으로 남는다)
app.post("/api/breach/end", (req, res) => {
  res.json(endBreach(req.tenant.id));
});

// 단계 완료 토글 — "완료"로 바뀌는 순간만 원장에 봉인해, 기한을 지켰다는 사실 자체가 증거가 되게 한다.
app.post("/api/breach/step", (req, res) => {
  try {
    const { stepKey } = req.body || {};
    const before = getBreachState(req.tenant.id);
    const willComplete = !before.steps[stepKey];
    if (willComplete && !quotaGuard(req, res)) return;
    const state = toggleBreachStep(req.tenant.id, stepKey);
    if (willComplete && state.steps[stepKey]) {
      appendEntry(req.tenant.id, {
        cat_key: "log", actor: "CISO",
        action: `[사고대응] 단계 완료 — ${BREACH_STEP_LABELS[stepKey] || stepKey} (${new Date(state.steps[stepKey]).toLocaleString("ko-KR")})`,
        recorded_by: req.user?.email || null,
      });
    }
    res.json(state);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 법정 양식 초안 PDF — 작성 보조용 골격 문서(실제 제출 문서 아님)
app.get("/api/breach/draft/:stepKey", (req, res) => {
  try {
    const state = getBreachState(req.tenant.id);
    const filename = `guardnote_breach_${req.params.stepKey}_${req.tenant.slug}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    const doc = buildBreachDraftPdf({ tenant: req.tenant, stepKey: req.params.stepKey, startedAt: state.started_at });
    doc.pipe(res);
    doc.end();
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// AI 초안 생성 — ANTHROPIC_API_KEY가 있으면 실제 Claude 호출, 없으면 모의 초안(mode:"mock").
app.post("/api/breach/draft/:stepKey/ai", async (req, res) => {
  try {
    const { stepKey } = req.params;
    if (!AI_FIELD_SETS[stepKey]) return res.status(400).json({ error: "알 수 없는 단계입니다." });
    const state = getBreachState(req.tenant.id);
    const out = await generateBreachDraft(stepKey, { tenantName: req.tenant.name, startedAt: state.started_at });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// AI(또는 수동 편집)로 채워진 필드 값을 받아 최종 PDF를 생성한다. 프론트가 미리 보여준 문구를
// 그대로 문서화하는 것이므로 서버는 재생성 없이 그 값을 그대로 렌더링만 한다.
app.post("/api/breach/draft/:stepKey/pdf", (req, res) => {
  try {
    const { stepKey } = req.params;
    const { fields, mode } = req.body || {};
    const state = getBreachState(req.tenant.id);
    const filename = `guardnote_breach_${stepKey}_ai_${req.tenant.slug}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    const doc = buildBreachDraftPdf({
      tenant: req.tenant, stepKey, startedAt: state.started_at,
      aiFields: fields || null, aiMode: mode || "mock",
    });
    doc.pipe(res);
    doc.end();
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ═══════════════════ 전자 계약 (결제 전 필수 체결) ═══════════════════ */
// 계약 현황 요약 — 어떤 계약이 체결/미체결인지
app.get("/api/contracts", (req, res) => {
  res.json({ contracts: contractStatus(req.tenant), version: CONTRACT_VERSION });
});

// 계약서 전문 조회 — 체결 전 화면 표시용. 체결됐으면 체결 정보도 함께.
app.get("/api/contracts/:kind", (req, res) => {
  const { kind } = req.params;
  if (!CONTRACT_KINDS.includes(kind)) return res.status(404).json({ error: "알 수 없는 계약 종류입니다." });
  const rendered = renderContract(kind, req.tenant.name);
  const signed = findContract(req.tenant.id, kind, CONTRACT_VERSION);
  res.json({
    ...rendered,
    signed: !!signed,
    signedAt: signed?.signed_at || null,
    signerName: signed?.signer_name || null,
    docHash: signed?.doc_hash || null,
  });
});

// 계약 체결 — 서명자 정보 + 동의. 같은 버전은 1회만 체결되고 이후엔 기존 기록을 돌려준다.
app.post("/api/contracts/:kind/sign", (req, res) => {
  try {
    const { kind } = req.params;
    if (!CONTRACT_KINDS.includes(kind)) return res.status(404).json({ error: "알 수 없는 계약 종류입니다." });
    const { signerName, signerTitle, signerEmail, agreed } = req.body || {};
    if (!agreed) return res.status(400).json({ error: "계약 내용에 대한 동의 표시가 필요합니다." });
    const { contract, alreadySigned } = signContract(req.tenant, kind, { signerName, signerTitle, signerEmail }, req.ip);
    res.status(alreadySigned ? 200 : 201).json({
      signed: true, alreadySigned,
      kind, version: contract.version, docHash: contract.doc_hash,
      signerName: contract.signer_name, signedAt: contract.signed_at,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 체결본 PDF 다운로드 — 원문 + 전자서명 정보 + 해시/봉인 검증 결과
app.get("/api/contracts/:kind/pdf", (req, res) => {
  const { kind } = req.params;
  if (!CONTRACT_KINDS.includes(kind)) return res.status(404).json({ error: "알 수 없는 계약 종류입니다." });
  const contract = findContract(req.tenant.id, kind, CONTRACT_VERSION);
  if (!contract) return res.status(404).json({ error: "아직 체결되지 않은 계약입니다." });
  const filename = `guardnote_contract_${kind}_${req.tenant.slug}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  const doc = buildContractPdf({ tenant: req.tenant, contract });
  doc.pipe(res);
  doc.end();
});

/* ═══════════════════ 구독 · 결제 ═══════════════════ */
// 구독 현황 + 결제 내역 + 계약 현황 + 구매 가능한 플랜 — 구독 화면이 한 번에 불러간다
app.get("/api/billing", (req, res) => {
  res.json({
    ...billingSummary(req.tenant),
    clientKey: billingMode() === "toss" ? tossClientKey() : null,
    currentPlan: req.tenant.plan,
    plans: PLANS,
    contracts: contractStatus(req.tenant),
  });
});

// 결제 시작 — 두 계약이 모두 체결되어 있어야 진행(아니면 409). 카드등록창 호출에 필요한 값을 내려준다.
app.post("/api/billing/checkout", (req, res) => {
  try {
    const { plan } = req.body || {};
    if (!PLAN_KEYS.includes(plan)) return res.status(400).json({ error: "알 수 없는 plan 입니다." });
    if (!getPlan(plan).priceMonthly) return res.status(400).json({ error: "무료 플랜은 결제가 필요 없습니다." });
    if (billingMode() === "disabled") {
      return res.status(503).json({ error: "결제가 비활성화되어 있습니다 (TOSS_SECRET_KEY/TOSS_CLIENT_KEY 미설정)." });
    }
    if (!allContractsSigned(req.tenant)) {
      return res.status(409).json({
        error: "결제 전에 서비스 이용계약서와 개인정보 처리위탁 계약서를 먼저 체결해야 합니다.",
        contracts: contractStatus(req.tenant),
      });
    }
    const sub = ensureSubscription(req.tenant);
    const p = getPlan(plan);
    res.json({
      mode: billingMode(),
      clientKey: billingMode() === "toss" ? tossClientKey() : null,
      customerKey: sub.customer_key,
      plan: p.key,
      amount: p.priceMonthly,
      orderName: `가드노트 ${p.label} 플랜 (월간)`,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 카드 등록 완료 → 빌링키 발급 → 첫 달 즉시 청구 → 플랜 활성화.
// 토스 모드에선 카드등록창 successUrl 리다이렉트로 받은 authKey가 필요하고, 모의 모드에선 불필요.
app.post("/api/billing/complete", async (req, res) => {
  try {
    const { plan, authKey } = req.body || {};
    if (!PLAN_KEYS.includes(plan)) return res.status(400).json({ error: "알 수 없는 plan 입니다." });
    if (!allContractsSigned(req.tenant)) {
      return res.status(409).json({ error: "계약이 체결되지 않아 결제를 진행할 수 없습니다." });
    }
    const sub = await activateSubscription(req.tenant, plan, authKey);
    const updated = findTenantBySlug(req.tenant.slug);
    res.json({
      ok: true,
      plan: planView(updated),
      subscription: {
        plan: sub.plan, status: sub.status, cardSummary: sub.card_summary,
        amount: sub.amount, nextBillingAt: sub.next_billing_at,
      },
    });
  } catch (e) {
    res.status(402).json({ error: e.message });
  }
});

// 해지 — 이미 결제된 기간 종료 시점에 free로 강등 (즉시 차단하지 않음)
app.post("/api/billing/cancel", (req, res) => {
  try {
    const sub = cancelSubscription(req.tenant);
    res.json({ ok: true, cancelAtPeriodEnd: true, effectiveAt: sub.next_billing_at });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 해지 예약 철회
app.post("/api/billing/resume", (req, res) => {
  try {
    const sub = resumeSubscription(req.tenant);
    res.json({ ok: true, cancelAtPeriodEnd: false, nextBillingAt: sub.next_billing_at });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 플랜 한도를 넘겼는지 검사 (append 계열 공통)
function quotaGuard(req, res) {
  if (!withinEntryQuota(req.tenant.plan, countEntries(req.tenant.id))) {
    res.status(402).json({ error: `현재 플랜(${getPlan(req.tenant.plan).label})의 증적 한도를 초과했습니다. 플랜을 상향하세요.` });
    return false;
  }
  return true;
}

// 봉인 전 공통 검증 — 필수값·길이·시각 형식, 그리고 개인정보(PII) 패턴 차단.
// 원장은 수정·삭제가 불가능하므로 "저장 전"이 개인정보를 걸러낼 유일한 기회다.
const TS_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
function entryViolation({ actor, action, ts }) {
  if (typeof actor !== "string" || !actor.trim()) return "actor(담당자)는 필수입니다.";
  if (typeof action !== "string" || !action.trim()) return "action(활동 내용)은 필수입니다.";
  if (actor.length > 60) return "담당자는 60자 이하여야 합니다.";
  if (action.length > 500) return "활동 내용은 500자 이하여야 합니다.";
  if (ts != null && (typeof ts !== "string" || !TS_RE.test(ts))) return "ts는 'YYYY-MM-DD HH:MM' 형식이어야 합니다.";
  return piiViolation({ actor, action });
}

// 활동 1건 봉인 추가 (수동 입력 전용). append-only.
// tenant_id는 요청 바디에서 절대 받지 않고, source도 항상 'manual'로 고정한다 —
// 출처(수동/자동수집) 표시는 증거의 일부이므로 클라이언트가 위장할 수 없어야 한다.
app.post("/api/entries", (req, res) => {
  try {
    const { cat_key, actor, action, ts } = req.body || {};
    if (!KEYS.includes(cat_key)) return res.status(400).json({ error: "알 수 없는 cat_key 입니다." });
    const bad = entryViolation({ actor, action, ts });
    if (bad) return res.status(400).json({ error: bad });
    if (!quotaGuard(req, res)) return;
    // 계정 세션으로 봉인하면 인증된 기록자(recorded_by)가 해시 체인에 함께 봉인된다.
    const row = appendEntry(req.tenant.id, { cat_key, actor, action, ts, source: "manual", recorded_by: req.user?.email || null });
    if (req.user) recordActivity(req.tenant.id, req.user.email, "entry.seal", { detail: `#${row.seq} ${cat_key}`, ip: req.ip });
    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 자동 수집 전용 엔드포인트 — 고객사 내부에 심어둔 수집기가 이벤트를 밀어넣는다.
// source 는 항상 ingest:<수집기명> 으로 태깅된다.
// 전건을 먼저 검증하고 하나라도 문제면 아무것도 적재하지 않는다 — 수집기 오류를
// 조용히 삼키는 대신 어느 이벤트가 왜 거부됐는지 즉시 알려주기 위함.
app.post("/api/ingest", (req, res) => {
  try {
    const { collector = "unknown", events } = req.body || {};
    const list = Array.isArray(events) ? events : [req.body];
    if (list.length === 0) return res.status(400).json({ error: "events 가 비어 있습니다." });
    if (list.length > 200) return res.status(400).json({ error: "한 번에 200건까지만 적재할 수 있습니다. 배치를 나눠 보내세요." });
    const colName = String(collector).replace(/[^\w.\-]/g, "").slice(0, 40) || "unknown";
    for (let i = 0; i < list.length; i++) {
      const ev = list[i] || {};
      if (!KEYS.includes(ev.cat_key)) return res.status(400).json({ error: `events[${i}]: 알 수 없는 cat_key 입니다.` });
      const bad = entryViolation({ actor: ev.actor || colName, action: ev.action, ts: ev.ts });
      if (bad) return res.status(400).json({ error: `events[${i}]: ${bad}` });
    }
    const created = [];
    for (const ev of list) {
      if (!withinEntryQuota(req.tenant.plan, countEntries(req.tenant.id))) {
        return res.status(402).json({
          error: `현재 플랜(${getPlan(req.tenant.plan).label})의 증적 한도를 초과했습니다.`,
          ingested: created.length, entries: created,
        });
      }
      created.push(appendEntry(req.tenant.id, {
        cat_key: ev.cat_key,
        actor: ev.actor || colName,
        action: ev.action,
        ts: ev.ts,
        source: `ingest:${colName}`,
      }));
    }
    res.status(201).json({ ingested: created.length, entries: created });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 증거 패키지 메타 — 제출용 요약 + 무결성 검증서 (해당 테넌트만)
app.get("/api/package", (req, res) => {
  const v = verifyChain(req.tenant.id);
  res.json({
    generatedAt: new Date().toISOString(),
    integrity: { ...v, anchor: anchorStatus(req.tenant.id) },
    blocks: v.blocks,
    categories: categoriesView(req.tenant.id),
    contents: [
      "내부 관리계획 및 개정 이력",
      "접근권한 부여·회수 대장 (전체)",
      "접속기록 및 월간 점검 결과",
      "암호화 적용 현황 및 키 교체 기록",
      "보안교육 수료 내역",
      `증적 원장 무결성 검증서 (SHA-256 · ${v.blocks}블록)`,
    ],
  });
});

// CSV 다운로드 — from/to/cat_key/actor 로 발췌 가능. 조건 없으면 전체 원장. (모든 플랜 허용)
app.get("/api/export/csv", (req, res) => {
  const filters = parseFilters(req);
  const hasFilter = !!(filters.from || filters.to || filters.cat_key || filters.actor);
  const entries = hasFilter ? filterEntries(req.tenant.id, filters) : allEntries(req.tenant.id);
  const csv = entriesToCsv(entries, catName);
  if (req.user) recordActivity(req.tenant.id, req.user.email, "export.csv", { detail: `${entries.length}건`, ip: req.ip });
  const filename = `guardnote_${req.tenant.slug}_${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

// PDF 증거 패키지 다운로드 — 무결성 검증서는 항상 전체 원장 기준, 발췌 목록만 필터 적용.
// PDF 생성은 유료(Pro 이상) 기능.
app.get("/api/export/pdf", (req, res) => {
  if (!planAllows(req.tenant.plan, "pdf")) {
    return res.status(402).json({ error: "PDF 증거 패키지는 Pro 이상 플랜에서 사용할 수 있습니다. (CSV는 모든 플랜 지원)" });
  }
  const filters = parseFilters(req);
  const hasFilter = !!(filters.from || filters.to || filters.cat_key || filters.actor);
  const integrity = { ...verifyChain(req.tenant.id), anchor: anchorStatus(req.tenant.id) }; // 항상 전체 원장
  const categories = categoriesView(req.tenant.id);
  const entries = hasFilter ? filterEntries(req.tenant.id, filters) : allEntries(req.tenant.id);
  if (req.user) recordActivity(req.tenant.id, req.user.email, "export.pdf", { detail: `${entries.length}건`, ip: req.ip });

  const filename = `guardnote_${req.tenant.slug}_${new Date().toISOString().slice(0, 10)}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const doc = buildEvidencePdf({ tenant: req.tenant, integrity, categories, entries, filters: hasFilter ? filters : null, catName });
  doc.pipe(res);
  doc.end();
});

// ── 데모 전용: 변조 시뮬레이션 ──────────────────────────────────────────
// 실제 시스템엔 없어야 할 "직접 UPDATE"를 일부러 실행해, DB를 직접 조작해도
// 무결성 검증이 잡아낸다는 걸 보여준다. 대상은 항상 요청 테넌트 소유 행으로 제한.
// demoEnabled(NODE_ENV=production이면 false)가 아니면 비활성.
app.post("/api/_demo/tamper", (req, res) => {
  if (!demoEnabled) return res.status(403).json({ error: "데모 기능 비활성" });
  const target = db.prepare("SELECT seq, action FROM entries WHERE tenant_id=? AND cat_key='auth' ORDER BY seq ASC LIMIT 1")
    .get(req.tenant.id);
  if (!target) return res.status(404).json({ error: "대상 없음" });
  db.prepare("UPDATE entries SET action=? WHERE tenant_id=? AND seq=?")
    .run("[사후수정] 접근권한 회수 일자를 사고 이전으로 소급 변경", req.tenant.id, target.seq);
  res.json({ tamperedSeq: target.seq, original: target.action });
});

app.post("/api/_demo/reset", (req, res) => {
  if (!demoEnabled) return res.status(403).json({ error: "데모 기능 비활성" });
  const { seq, original } = req.body || {};
  if (!seq || typeof original !== "string") return res.status(400).json({ error: "seq, original 필요" });
  db.prepare("UPDATE entries SET action=? WHERE tenant_id=? AND seq=?").run(original, req.tenant.id, seq);
  res.json({ restoredSeq: seq });
});

// ── 단일 포트 서빙 (배포용) ─────────────────────────────────────────────
// 빌드된 프론트(dist/)가 있으면 이 서버가 정적 파일까지 직접 서빙한다. Railway/Render 같은
// 호스팅에 서버 하나만 올려도 웹+API가 같은 URL로 동작(프론트는 상대경로 /api 호출이라 CORS 불필요).
// 로컬 개발(npm run dev)은 vite(5173)가 /api를 프록시하므로 이 블록의 영향을 받지 않는다.
const DIST_DIR = path.join(__dirname, "..", "dist");
if (fs.existsSync(path.join(DIST_DIR, "index.html"))) {
  app.use(express.static(DIST_DIR));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next(); // 미정의 API는 404 유지
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

const server = app.listen(PORT, () => {
  console.log(`🛡  GuardNote API v${PKG.version}  →  http://localhost:${PORT}`);
  startMonitor();
  startBillingScheduler();
  startBackupScheduler();
});

// ── 정상 종료 (재배포·재시작 시 원장 보호) ──────────────────────────────
// 진행 중인 응답을 마친 뒤 WAL을 본 파일에 체크포인트하고 DB를 닫는다.
// 호스팅(Railway 등)의 재배포는 SIGTERM으로 온다.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} 수신 — 연결을 정리하고 원장을 닫습니다.`);
  server.close(() => {
    try {
      db.pragma("wal_checkpoint(TRUNCATE)");
      db.close();
      console.log("원장 정리 완료. 종료합니다.");
    } catch (e) {
      console.error("종료 중 오류:", e.message);
    }
    process.exit(0);
  });
  // 열린 연결이 안 닫혀도 8초 뒤에는 강제 종료 (호스팅의 kill 타임아웃보다 먼저)
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
