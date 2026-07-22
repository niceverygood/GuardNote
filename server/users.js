// 사람용 인증 — 테넌트 소속 사용자 계정 · 서버 세션 · 초대/재설정 링크 · 활동 로그.
//
// 설계 원칙:
//  - 인증 2트랙: 사람은 계정+세션쿠키, 기계(수집기)는 기존 API 키. 서로 대체하지 않는다.
//  - 비밀번호는 Node 내장 crypto.scrypt로 해시(신규 의존성 없음), 세션·초대 토큰은
//    원문을 돌려주고 DB에는 SHA-256 해시만 저장한다 — DB가 유출돼도 세션 탈취가 안 되게.
//  - 초대는 "링크 1회 발급" 방식: 이메일 인프라 없이 시작할 수 있고(Phase 1),
//    나중에 메일 발송이 붙어도 같은 토큰을 본문에 실어 보내면 된다.
import crypto from "node:crypto";
import { db } from "./db.js";
import { sha256 } from "./crypto-utils.js";

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id     INTEGER NOT NULL REFERENCES tenants(id),
    email         TEXT NOT NULL UNIQUE,      -- 전역 유일: 로그인 시 테넌트 선택이 필요 없다
    name          TEXT NOT NULL,
    pw_hash       TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'member',  -- owner | member
    status        TEXT NOT NULL DEFAULT 'active',  -- active | disabled
    created_at    TEXT NOT NULL,
    last_login_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

  -- 서버 세션: 쿠키에는 원문 토큰, DB에는 해시만.
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    ip         TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  -- 초대(kind=invite) / 비밀번호 재설정(kind=reset) 링크 — 1회용, 7일 유효.
  CREATE TABLE IF NOT EXISTS invites (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    kind       TEXT NOT NULL DEFAULT 'invite',  -- invite | reset
    tenant_id  INTEGER NOT NULL REFERENCES tenants(id),
    user_id    INTEGER,                          -- reset일 때 대상 사용자
    email      TEXT,                             -- invite일 때 초대 대상 이메일
    role       TEXT NOT NULL DEFAULT 'member',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at    TEXT
  );

  -- 테넌트 사용자 활동 로그 (로그인·봉인·내보내기 등) — 열람 책임 추적용, append 전용.
  CREATE TABLE IF NOT EXISTS user_activity (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    email     TEXT NOT NULL,
    action    TEXT NOT NULL,   -- login | logout | invite.accept | password.change | entry.seal | export.csv | export.pdf
    detail    TEXT,
    ip        TEXT,
    at        TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_activity_tenant ON user_activity(tenant_id);
`);

const now = () => new Date().toISOString();

/* ───────────────────────── 비밀번호 (scrypt) ───────────────────────── */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("비밀번호는 8자 이상이어야 합니다.");
  }
  if (password.length > 200) throw new Error("비밀번호가 너무 깁니다.");
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT).toString("hex");
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, salt, hash] = String(stored).split("$");
    if (alg !== "scrypt") return false;
    const calc = crypto.scryptSync(String(password), salt, Buffer.from(hash, "hex").length, {
      N: Number(N), r: Number(r), p: Number(p),
    });
    return crypto.timingSafeEqual(calc, Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

/* ───────────────────────── 사용자 ───────────────────────── */
const normEmail = (e) => String(e || "").trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function createUser({ tenant_id, email, name, role = "member", password }) {
  email = normEmail(email);
  if (!EMAIL_RE.test(email)) throw new Error("올바른 이메일이 아닙니다.");
  if (!name || !String(name).trim()) throw new Error("이름은 필수입니다.");
  if (!["owner", "member"].includes(role)) throw new Error("알 수 없는 역할입니다.");
  if (findUserByEmail(email)) throw new Error("이미 등록된 이메일입니다.");
  const info = db.prepare(`
    INSERT INTO users (tenant_id, email, name, pw_hash, role, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?)
  `).run(tenant_id, email, String(name).trim().slice(0, 60), hashPassword(password), role, now());
  return findUserById(info.lastInsertRowid);
}

export function findUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(normEmail(email));
}
export function findUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}
export function listUsers(tenantId) {
  return db.prepare(
    "SELECT id, email, name, role, status, created_at, last_login_at FROM users WHERE tenant_id = ? ORDER BY id ASC"
  ).all(tenantId);
}
export function countActiveOwners(tenantId) {
  return db.prepare("SELECT COUNT(*) AS n FROM users WHERE tenant_id = ? AND role='owner' AND status='active'").get(tenantId).n;
}
export function setUserStatus(id, status) {
  db.prepare("UPDATE users SET status = ? WHERE id = ?").run(status, id);
  if (status === "disabled") revokeUserSessions(id); // 비활성화 즉시 접속도 끊는다
  return findUserById(id);
}
export function setUserPassword(id, password) {
  db.prepare("UPDATE users SET pw_hash = ? WHERE id = ?").run(hashPassword(password), id);
  revokeUserSessions(id); // 비밀번호가 바뀌면 기존 세션 전부 무효화
}
export function touchLastLogin(id) {
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now(), id);
}

/* ───────────────────────── 세션 ───────────────────────── */
const SESSION_DAYS = 14;

export function createSession(userId, ip) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip) VALUES (?,?,?,?,?)")
    .run(sha256(token), userId, now(), expires, ip || null);
  return { token, expiresAt: expires, maxAgeSec: SESSION_DAYS * 86400 };
}

// 세션 토큰 → { user, tenant } (유효하지 않으면 null). 만료분은 발견 즉시 지운다.
export function findSession(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT s.token_hash, s.expires_at, u.*
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(sha256(token));
  if (!row) return null;
  if (row.expires_at <= now()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(row.token_hash);
    return null;
  }
  if (row.status !== "active") return null;
  const tenant = db.prepare("SELECT id, slug, name, plan, created_at, key_rotated_at FROM tenants WHERE id = ?").get(row.tenant_id);
  if (!tenant) return null;
  const { token_hash, expires_at, pw_hash, ...user } = row;
  return { user, tenant };
}

export function revokeSession(token) {
  if (!token) return;
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}
export function revokeUserSessions(userId) {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}
export function purgeExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now());
  db.prepare("DELETE FROM invites WHERE used_at IS NULL AND expires_at <= ?").run(now());
}
purgeExpiredSessions(); // 기동 시 1회 청소

/* ───────────────────────── 초대 / 재설정 링크 ───────────────────────── */
const INVITE_DAYS = 7;

export function createInvite({ kind = "invite", tenant_id, user_id = null, email = null, role = "member" }) {
  if (kind === "invite") {
    email = normEmail(email);
    if (!EMAIL_RE.test(email)) throw new Error("초대할 이메일을 올바르게 입력하세요.");
    if (findUserByEmail(email)) throw new Error("이미 등록된 이메일입니다.");
    if (!["owner", "member"].includes(role)) throw new Error("알 수 없는 역할입니다.");
  }
  const token = crypto.randomBytes(24).toString("hex");
  db.prepare(`
    INSERT INTO invites (token_hash, kind, tenant_id, user_id, email, role, created_at, expires_at)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(sha256(token), kind, tenant_id, user_id, email, role, now(), new Date(Date.now() + INVITE_DAYS * 86400000).toISOString());
  return { token, expiresDays: INVITE_DAYS };
}

export function findInvite(token) {
  if (!token) return null;
  const row = db.prepare("SELECT * FROM invites WHERE token_hash = ?").get(sha256(String(token)));
  if (!row || row.used_at || row.expires_at <= now()) return null;
  return row;
}

export function consumeInvite(id) {
  db.prepare("UPDATE invites SET used_at = ? WHERE id = ?").run(now(), id);
}

/* ───────────────────────── 사용자 활동 로그 ───────────────────────── */
export function recordActivity(tenantId, email, action, { detail = null, ip = null } = {}) {
  db.prepare("INSERT INTO user_activity (tenant_id, email, action, detail, ip, at) VALUES (?,?,?,?,?,?)")
    .run(tenantId, email, action, detail, ip, now());
}
export function listActivity(tenantId, limit = 100) {
  return db.prepare("SELECT * FROM user_activity WHERE tenant_id = ? ORDER BY id DESC LIMIT ?").all(tenantId, limit);
}
