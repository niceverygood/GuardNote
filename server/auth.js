// 인증 미들웨어 — 인증은 2트랙이다.
//  - 기계(수집기)·간이 접속: Bearer API 키 → req.tenant
//  - 사람(웹 대시보드): 세션 쿠키(gn_session) → req.tenant + req.user
//  - requireAdmin: 관리자 토큰 검증 → req.admin. 테넌트 전체를 넘나드는 운영 작업 전용.
//  - identify    : 주어진 Bearer 토큰이 관리자인지 테넌트인지 판별 (/api/whoami 용).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findTenantByApiKeyHash } from "./db.js";
import { findSession } from "./users.js";
import { hashApiKey, generateAdminToken, safeEqual } from "./crypto-utils.js";
import { authFailBlocked, recordAuthFail, AUTH_BLOCK_MESSAGE } from "./security.js";

export const SESSION_COOKIE = "gn_session";

// 의존성 없이 쿠키 헤더 파싱 — 필요한 것은 세션 쿠키 하나뿐이다.
export function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// 세션 쿠키 → { user, tenant } 또는 null
export function sessionIdentity(req) {
  return findSession(readCookie(req, SESSION_COOKIE));
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_TOKEN_FILE = path.join(__dirname, ".admin-token");
const isProd = process.env.NODE_ENV === "production";

// 관리자 토큰 로드: 환경변수 우선. 없으면 (개발 환경에서만) 파일 로드/생성.
// 프로덕션에서 환경변수가 없으면 관리자 기능을 아예 비활성화한다 — 자동 생성된 토큰이
// 파일로 굴러다니는 상황을 프로덕션에서 만들지 않기 위함.
function loadAdminToken() {
  if (process.env.GUARDNOTE_ADMIN_TOKEN) return process.env.GUARDNOTE_ADMIN_TOKEN;
  if (isProd) return null;
  try {
    return fs.readFileSync(ADMIN_TOKEN_FILE, "utf8").trim();
  } catch {
    const t = generateAdminToken();
    try { fs.writeFileSync(ADMIN_TOKEN_FILE, t, { encoding: "utf8", mode: 0o600 }); } catch { /* ignore */ }
    return t;
  }
}
const ADMIN_TOKEN = loadAdminToken();
export const adminEnabled = !!ADMIN_TOKEN;
export function getAdminToken() { return ADMIN_TOKEN; }

function bearer(req) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  return scheme === "Bearer" && token ? token : null;
}

// 토큰 → { role, tenant? } 또는 null
export function identify(token) {
  if (!token) return null;
  if (ADMIN_TOKEN && safeEqual(token, ADMIN_TOKEN)) return { role: "admin" };
  const tenant = findTenantByApiKeyHash.get(hashApiKey(token));
  if (tenant) return { role: "tenant", tenant };
  return null;
}

export function requireAuth(req, res, next) {
  if (authFailBlocked(req.ip)) {
    return res.status(429).json({ error: AUTH_BLOCK_MESSAGE });
  }
  // 1순위: Bearer API 키 (수집기·간이 접속)
  const token = bearer(req);
  if (token) {
    const id = identify(token);
    if (id?.role === "tenant") {
      req.tenant = id.tenant;
      return next();
    }
  }
  // 2순위: 세션 쿠키 (계정 로그인) — 키가 없거나 무효여도 유효한 세션이 있으면 통과.
  const sess = sessionIdentity(req);
  if (sess) {
    req.tenant = sess.tenant;
    req.user = sess.user;
    return next();
  }
  if (token) recordAuthFail(req.ip); // 무작위 키 대입을 10분 창에서 차단
  return res.status(401).json({ error: "인증이 필요합니다 — 계정으로 로그인하거나 'Authorization: Bearer <API 키>' 헤더를 포함하세요." });
}

// 계정 로그인(세션)이 반드시 필요한 라우트용 — 팀 관리·비밀번호 변경 등 "사람"의 행위.
export function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(403).json({ error: "이 기능은 계정 로그인에서만 사용할 수 있습니다 (접속 키로는 불가)." });
  }
  next();
}

export function requireOwner(req, res, next) {
  if (!req.user || req.user.role !== "owner") {
    return res.status(403).json({ error: "소유자(owner) 권한이 필요합니다." });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(503).json({ error: "관리자 기능이 비활성화되어 있습니다 (GUARDNOTE_ADMIN_TOKEN 미설정)." });
  }
  if (authFailBlocked(req.ip)) {
    return res.status(429).json({ error: AUTH_BLOCK_MESSAGE });
  }
  const token = bearer(req);
  if (!token || !safeEqual(token, ADMIN_TOKEN)) {
    recordAuthFail(req.ip);
    return res.status(401).json({ error: "관리자 토큰이 필요합니다." });
  }
  req.admin = true;
  next();
}
