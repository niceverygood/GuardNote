// GuardNote — 멀티테넌시 위변조 불가능 증적 원장 (SQLite + SHA-256 해시 체인)
//
// 핵심 개념:
//  - 고객사(테넌트) 1곳 = 원장 1개. 모든 조회·기록은 tenant_id로 완전히 격리된다.
//  - 안전조치 활동은 "append(추가)"만 가능하다. 수정/삭제 API는 존재하지 않는다.
//  - 각 기록의 hash = SHA-256( payload(기록, tenant_id 포함) + 직전기록의 hash ).
//    tenant_id가 payload 안에 들어가므로, 블록을 다른 테넌트 소속으로 바꿔치기하는 것 자체가
//    해시 불일치로 드러난다 — 테넌트 경계 자체가 암호학적으로 봉인된다.
//  - 무결성 검증은 테넌트별 제네시스(0…0)부터 전체를 재계산한다. DB 파일을 직접 UPDATE 해도
//    그 지점부터 해시가 어긋나 즉시 드러난다.
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256, generateApiKey, hashApiKey } from "./crypto-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.GUARDNOTE_DB || path.join(__dirname, "guardnote.db");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    slug         TEXT NOT NULL UNIQUE,   -- 예: "gmarket"
    name         TEXT NOT NULL,          -- 예: "지마켓"
    api_key_hash TEXT NOT NULL UNIQUE,   -- 평문 키는 저장하지 않는다
    created_at   TEXT NOT NULL,
    last_seq     INTEGER NOT NULL DEFAULT 0,  -- 마지막으로 봉인된 블록의 seq (appendEntry와 같은 트랜잭션에서 갱신)
    last_hash    TEXT NOT NULL DEFAULT '0000000000000000000000000000000000000000000000000000000000000000'
  );

  CREATE TABLE IF NOT EXISTS entries (
    tenant_id  INTEGER NOT NULL REFERENCES tenants(id),
    seq        INTEGER NOT NULL,          -- 테넌트별 1부터 시작하는 시퀀스
    ts         TEXT NOT NULL,             -- 활동 시각 "YYYY-MM-DD HH:MM"
    cat_key    TEXT NOT NULL,             -- 안전성 확보조치 항목 키 (고시 제4조~제13조)
    actor      TEXT NOT NULL,             -- 담당자
    action     TEXT NOT NULL,             -- 활동 내용(증적)
    source     TEXT NOT NULL DEFAULT 'manual',  -- manual | ingest:<수집기명>
    prev_hash  TEXT NOT NULL,
    hash       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, seq)
  );

  CREATE INDEX IF NOT EXISTS idx_entries_tenant ON entries(tenant_id);

  -- 외부 타임스탬프 앵커: 특정 시점의 체인 머리(head)를 서명과 함께 박제한다.
  -- 서명 비밀키는 DB 밖(anchor.js가 관리)에 있어, DB만 조작해서는 위조된 head를 앵커링할 수 없다.
  CREATE TABLE IF NOT EXISTS anchors (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id   INTEGER NOT NULL REFERENCES tenants(id),
    seq         INTEGER NOT NULL,          -- 앵커링 당시의 마지막 블록 seq
    head_hash   TEXT NOT NULL,             -- 그 블록의 hash
    anchored_at TEXT NOT NULL,
    signature   TEXT NOT NULL,             -- HMAC 서명 (외부 비밀키 기반)
    external    TEXT                       -- 외부 TSA/노터리 응답(JSON), 없으면 NULL
  );
  CREATE INDEX IF NOT EXISTS idx_anchors_tenant ON anchors(tenant_id);

  -- 구독(결제) 상태 — 테넌트당 최대 1행. 빌링키는 AES-256-GCM으로 암호화 저장(billing.js).
  CREATE TABLE IF NOT EXISTS subscriptions (
    tenant_id       INTEGER PRIMARY KEY REFERENCES tenants(id),
    customer_key    TEXT NOT NULL UNIQUE,   -- 결제사에 등록하는 고객 식별자 (테넌트당 1회 생성)
    plan            TEXT NOT NULL,          -- 청구 기준 플랜 (tenants.plan과 동기화)
    status          TEXT NOT NULL,          -- incomplete | active | past_due | canceled
    billing_key_enc TEXT,                   -- 암호화된 빌링키 (등록 전 NULL)
    card_summary    TEXT,                   -- 표시용 카드 정보 (예: "신한 ****-1234")
    amount          INTEGER NOT NULL DEFAULT 0,  -- 월 청구액(원)
    next_billing_at TEXT,                   -- 다음 청구 시각(ISO)
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    fail_count      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );

  -- 결제(청구) 이력 — 성공/실패 모두 남긴다.
  CREATE TABLE IF NOT EXISTS payments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id   INTEGER NOT NULL REFERENCES tenants(id),
    order_id    TEXT NOT NULL UNIQUE,
    order_name  TEXT NOT NULL,
    plan        TEXT NOT NULL,
    amount      INTEGER NOT NULL,
    status      TEXT NOT NULL,              -- DONE | FAILED
    payment_key TEXT,                       -- 결제사 결제 식별자 (모의 모드는 mock_)
    receipt_url TEXT,                       -- 영수증 URL (결제사 제공 시)
    method      TEXT NOT NULL,              -- toss | mock
    message     TEXT,                       -- 실패 사유 등
    approved_at TEXT,                       -- 승인 시각(ISO)
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);

  -- 전자 계약 체결 기록 — 계약서 원문 해시 + 서명자 정보 + HMAC 봉인(contracts.js).
  CREATE TABLE IF NOT EXISTS contracts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id    INTEGER NOT NULL REFERENCES tenants(id),
    kind         TEXT NOT NULL,             -- service(이용계약) | dpa(개인정보 처리위탁계약)
    version      TEXT NOT NULL,             -- 계약서 양식 버전
    doc_hash     TEXT NOT NULL,             -- 체결 시점 계약서 원문 SHA-256
    signer_name  TEXT NOT NULL,
    signer_title TEXT NOT NULL,
    signer_email TEXT NOT NULL,
    signed_ip    TEXT,
    signed_at    TEXT NOT NULL,
    seal         TEXT NOT NULL,             -- HMAC 봉인 — DB만 고쳐서는 유효 봉인을 못 만든다
    UNIQUE (tenant_id, kind, version)
  );
  CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON contracts(tenant_id);

  -- 자동 무결성 검증 실행 기록 (스케줄러가 남긴다)
  CREATE TABLE IF NOT EXISTS monitor_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id   INTEGER NOT NULL REFERENCES tenants(id),
    checked_at  TEXT NOT NULL,
    intact      INTEGER NOT NULL,          -- 1/0
    blocks      INTEGER NOT NULL,
    truncated   INTEGER NOT NULL,          -- 1/0
    first_broken_seq INTEGER,
    alerted     INTEGER NOT NULL DEFAULT 0 -- 알림을 보냈으면 1
  );
  CREATE INDEX IF NOT EXISTS idx_monitor_tenant ON monitor_runs(tenant_id);
`);

// ── 경량 마이그레이션: 이미 존재하는 tenants 테이블에 신규 컬럼을 안전하게 추가한다. ──
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn("tenants", "plan", "plan TEXT NOT NULL DEFAULT 'free'");
ensureColumn("tenants", "key_rotated_at", "key_rotated_at TEXT");
// 기록자(인증된 계정 이메일). 계정 로그인으로 봉인한 기록에만 채워지고 해시에 함께 봉인된다.
// 기존 행은 NULL — payload()가 NULL이면 종전 형식을 유지해 기존 체인 검증이 깨지지 않는다.
ensureColumn("entries", "recorded_by", "recorded_by TEXT");

// 유출사고 대응 워크플로우 상태 — 테넌트당 최대 1행. steps는 { stepKey: 완료시각ISO } JSON.
db.exec(`
  CREATE TABLE IF NOT EXISTS breach_state (
    tenant_id  INTEGER PRIMARY KEY REFERENCES tenants(id),
    active     INTEGER NOT NULL DEFAULT 0,
    started_at TEXT,
    steps      TEXT NOT NULL DEFAULT '{}'
  );
`);

// 관리자 감사 로그 — 테넌트를 넘나드는 운영 행위(온보딩·키 재발급·플랜 변경 등)는 전부 남긴다.
// 증적을 파는 회사가 자기 운영 행위의 증적을 안 남기는 것은 모순이다. append 전용으로만 쓴다.
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_audit (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    at     TEXT NOT NULL,
    action TEXT NOT NULL,   -- tenant.create | tenant.rotate | tenant.plan | tenant.anchor | monitor.run | billing.run
    target TEXT,            -- 대상 테넌트 slug 등
    detail TEXT,            -- 부가 정보 (예: 변경된 플랜)
    ip     TEXT
  );
`);

export const GENESIS = "0".repeat(64);
export { sha256 };

// 봉인 대상이 되는 정규화 payload. tenant_id가 포함되어 테넌트 소속까지 봉인된다.
// recorded_by(인증된 기록자)가 있으면 그것까지 봉인 — "누가 기록했는가"도 위변조 불가 대상이 된다.
// 없으면(기존 행·API 키 봉인) 종전 형식 그대로 — 과거 원장의 해시 재계산이 그대로 일치한다.
export function payload(e) {
  const base = `${e.tenant_id}|${e.seq}|${e.ts}|${e.cat_key}|${e.actor}|${e.action}`;
  return e.recorded_by ? `${base}|by:${e.recorded_by}` : base;
}

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return {
    ts: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`,
    iso: d.toISOString(),
  };
}

/* ───────────────────────── tenants (고객사) ───────────────────────── */
const TENANT_COLS = "id, slug, name, plan, created_at, key_rotated_at";
const insertTenantStmt = db.prepare(`
  INSERT INTO tenants (slug, name, api_key_hash, created_at, plan) VALUES (@slug, @name, @api_key_hash, @created_at, @plan)
`);
const findTenantBySlugStmt = db.prepare(`SELECT ${TENANT_COLS} FROM tenants WHERE slug = ?`);
export const findTenantByApiKeyHash = db.prepare(`SELECT ${TENANT_COLS} FROM tenants WHERE api_key_hash = ?`);
const chainHeadStmt = db.prepare("SELECT last_seq, last_hash FROM tenants WHERE id = ?");
const updateChainHeadStmt = db.prepare("UPDATE tenants SET last_seq = ?, last_hash = ? WHERE id = ?");
const updateKeyStmt = db.prepare("UPDATE tenants SET api_key_hash = ?, key_rotated_at = ? WHERE slug = ?");
const updatePlanStmt = db.prepare("UPDATE tenants SET plan = ? WHERE slug = ?");

// 신규 고객사 온보딩. 평문 API 키는 이 호출의 반환값으로만 존재하고 DB엔 해시만 저장된다 — 분실 시 재발급(로테이션)만 가능.
export function createTenant({ slug, name, plan = "free" }) {
  if (findTenantBySlugStmt.get(slug)) throw new Error(`이미 존재하는 slug 입니다: ${slug}`);
  const apiKey = generateApiKey();
  const created_at = new Date().toISOString();
  insertTenantStmt.run({ slug, name, api_key_hash: hashApiKey(apiKey), created_at, plan });
  return { tenant: findTenantBySlugStmt.get(slug), apiKey };
}

// API 키 재발급 — 같은 테넌트(원장·플랜 그대로)에 새 키만 발급한다. 기존 키는 즉시 무효.
export function rotateApiKey(slug) {
  const tenant = findTenantBySlugStmt.get(slug);
  if (!tenant) throw new Error(`존재하지 않는 slug 입니다: ${slug}`);
  const apiKey = generateApiKey();
  updateKeyStmt.run(hashApiKey(apiKey), new Date().toISOString(), slug);
  return { tenant: findTenantBySlugStmt.get(slug), apiKey };
}

export function setPlan(slug, plan) {
  const info = updatePlanStmt.run(plan, slug);
  if (info.changes === 0) throw new Error(`존재하지 않는 slug 입니다: ${slug}`);
  return findTenantBySlugStmt.get(slug);
}

export function findTenantBySlug(slug) {
  return findTenantBySlugStmt.get(slug);
}

export function listTenants() {
  return db.prepare(`SELECT ${TENANT_COLS} FROM tenants ORDER BY id ASC`).all();
}

export function countEntries(tenantId) {
  return db.prepare("SELECT COUNT(*) AS n FROM entries WHERE tenant_id = ?").get(tenantId).n;
}

/* ───────────────────────── entries (테넌트별 원장) ───────────────────────── */
const lastStmt = db.prepare("SELECT seq, hash FROM entries WHERE tenant_id = ? ORDER BY seq DESC LIMIT 1");
const insertStmt = db.prepare(`
  INSERT INTO entries (tenant_id, seq, ts, cat_key, actor, action, source, recorded_by, prev_hash, hash, created_at)
  VALUES (@tenant_id, @seq, @ts, @cat_key, @actor, @action, @source, @recorded_by, @prev_hash, @hash, @created_at)
`);

// 활동 1건을 해당 테넌트의 원장에 봉인 추가한다. seq/prev_hash/hash는 서버가 결정한다(클라이언트가 못 정한다).
// recorded_by 역시 서버가 인증된 세션에서만 채운다 — 클라이언트가 지정할 수 없다.
export const appendEntry = db.transaction((tenantId, { cat_key, actor, action, ts, source = "manual", recorded_by = null }) => {
  if (!tenantId) throw new Error("tenantId 는 필수입니다.");
  if (!cat_key || !actor || !action) {
    throw new Error("cat_key, actor, action 은 필수입니다.");
  }
  const last = lastStmt.get(tenantId);
  const seq = last ? last.seq + 1 : 1;
  const prev_hash = last ? last.hash : GENESIS;
  const stamp = nowStamp();
  const row = {
    tenant_id: tenantId,
    seq,
    ts: ts || stamp.ts,
    cat_key,
    actor,
    action,
    source,
    recorded_by: recorded_by || null,
    prev_hash,
    created_at: stamp.iso,
  };
  row.hash = sha256(payload(row) + prev_hash);
  insertStmt.run(row);
  // 체인의 "머리(head)"를 entries와 별도로 tenants에도 기록해둔다. entries 테이블에서
  // 가장 최근 블록(들)이 통째로 삭제되면 뒤에 비교할 블록이 없어 해시체인만으로는 감지가
  // 안 되는데, 이 head 포인터와 대조하면 그런 "꼬리 절단"도 verifyChain에서 잡아낼 수 있다.
  updateChainHeadStmt.run(seq, row.hash, tenantId);
  return row;
});

export function allEntries(tenantId) {
  return db.prepare("SELECT * FROM entries WHERE tenant_id = ? ORDER BY seq ASC").all(tenantId);
}

// 증거 "발췌"용 필터링. 무결성 검증(verifyChain)에는 절대 쓰지 않는다 — 검증은 항상 전체
// 원장 기준이어야 하고, 필터링된 부분만 떼어 재계산하면 "일부만 골라 보여준 것"과
// "실제로 위변조된 것"을 구분할 수 없게 되어 증거로서의 의미가 없어진다.
export function filterEntries(tenantId, { from, to, cat_key, actor } = {}) {
  let rows = allEntries(tenantId);
  if (from) rows = rows.filter((r) => r.ts.slice(0, 10) >= from);
  if (to) rows = rows.filter((r) => r.ts.slice(0, 10) <= to);
  if (cat_key) rows = rows.filter((r) => r.cat_key === cat_key);
  if (actor) {
    const needle = actor.toLowerCase();
    rows = rows.filter((r) => r.actor.toLowerCase().includes(needle));
  }
  return rows;
}

// 제네시스부터 전체 재계산 → tampering 지점 이후 전부 무효 처리(cascade). 항상 단일 테넌트 범위.
//
// 중간 블록을 지우면 다음 블록의 prev_hash가 안 맞아 자동으로 걸리지만, "맨 끝" 블록(들)을
// 통째로 지우면 비교할 다음 블록이 없어 체인 재계산만으로는 못 잡는다. 그래서 appendEntry가
// tenants 테이블에 별도로 남겨두는 head 포인터(last_seq/last_hash)와 실제 entries의 마지막
// 행을 대조해, 그 포인터보다 짧아진 경우 truncated로 표시한다.
//
// 한계: 이건 같은 DB 파일 안의 별도 테이블일 뿐이라, entries와 tenants.last_seq/last_hash를
// "둘 다" 동시에 고쳐 쓸 수 있는 공격자(예: DB 파일에 완전한 쓰기 권한을 가진 사람)까지는
// 못 막는다 — 실수로 인한 삭제나, 두 테이블을 일관되게 맞추지 못한 어설픈 조작은 잡아내지만,
// 진짜 완전한 방지(그 시점에 데이터가 존재했음을 제3자가 증명)는 외부 타임스탬프/공증
// 앵커링이 필요하다 (README "다음 단계" 참고).
export function verifyChain(tenantId) {
  const rows = allEntries(tenantId);
  let prev = GENESIS;
  let firstBrokenSeq = null;
  const results = rows.map((r) => {
    const expected = sha256(payload(r) + prev);
    const ok = expected === r.hash && r.prev_hash === prev;
    if (!ok && firstBrokenSeq === null) firstBrokenSeq = r.seq;
    prev = expected; // 재계산값으로 진행해야 이후 기록도 함께 깨진다
    return { seq: r.seq, ok };
  });

  const head = chainHeadStmt.get(tenantId) || { last_seq: 0, last_hash: GENESIS };
  const actualLastSeq = rows.length ? rows[rows.length - 1].seq : 0;
  const actualLastHash = rows.length ? rows[rows.length - 1].hash : GENESIS;
  const truncated = actualLastSeq !== head.last_seq || actualLastHash !== head.last_hash;

  return {
    intact: results.every((r) => r.ok) && !truncated,
    blocks: rows.length,
    firstBrokenSeq,
    truncated,
    expectedLastSeq: head.last_seq,
    actualLastSeq,
    results,
    verifiedAt: new Date().toISOString(),
  };
}

// warnDays: 숫자(일괄) 또는 { cat_key: 일수 } 맵 — 항목별 점검 주기(고시 기준)가 다르므로
// 접속기록(월 단위)과 내부 관리계획(연 단위)이 같은 잣대로 "점검 필요"가 되지 않게 한다.
export function categoryStats(tenantId, catKeys, warnDays = 28) {
  const rows = allEntries(tenantId);
  const now = Date.now();
  const warnOf = (k) => (typeof warnDays === "number" ? warnDays : warnDays[k] ?? 28);
  const byCat = {};
  for (const k of catKeys) byCat[k] = { items: 0, last: null };
  for (const r of rows) {
    const c = (byCat[r.cat_key] ||= { items: 0, last: null });
    c.items += 1;
    if (!c.last || r.ts > c.last) c.last = r.ts;
  }
  for (const k of Object.keys(byCat)) {
    const c = byCat[k];
    if (c.items === 0) {
      c.status = "none";
    } else {
      const ageDays = (now - new Date(c.last.replace(" ", "T")).getTime()) / 86400000;
      c.status = ageDays > warnOf(k) ? "warn" : "ok";
    }
  }
  return byCat;
}

/* ───────────────────────── 앵커 / 모니터링 저장 ───────────────────────── */
export function chainHead(tenantId) {
  return chainHeadStmt.get(tenantId) || { last_seq: 0, last_hash: GENESIS };
}

// tenants에 저장된 head 포인터가 아니라, entries 테이블의 "실제" 마지막 행. 앵커 검증이
// 꼬리 절단을 잡으려면 이 실제 tail과 포인터를 대조해야 한다 (verifyChain과 동일한 근거).
export function ledgerTail(tenantId) {
  const r = db.prepare("SELECT seq, hash FROM entries WHERE tenant_id = ? ORDER BY seq DESC LIMIT 1").get(tenantId);
  return r ? { seq: r.seq, hash: r.hash } : { seq: 0, hash: GENESIS };
}

// 현재 원장을 제네시스부터 재계산해, seq번째 블록의 "재계산된 해시"를 돌려준다.
// 앵커 검증에 쓰인다: 이 값이 앵커에 박제된 head_hash와 다르거나(내용 변조),
// 그 seq 블록 자체가 사라졌으면(꼬리 절단) null → 앵커 시점의 상태가 깨졌다는 증거.
export function recomputedHashAt(tenantId, seq) {
  const rows = allEntries(tenantId);
  let prev = GENESIS;
  for (const r of rows) {
    const expected = sha256(payload(r) + prev);
    if (r.seq === seq) return expected;
    prev = expected;
  }
  return null;
}

const insertAnchorStmt = db.prepare(`
  INSERT INTO anchors (tenant_id, seq, head_hash, anchored_at, signature, external)
  VALUES (@tenant_id, @seq, @head_hash, @anchored_at, @signature, @external)
`);
export function recordAnchor(a) {
  const info = insertAnchorStmt.run({ external: null, ...a });
  return { id: info.lastInsertRowid, ...a };
}
export function latestAnchor(tenantId) {
  return db.prepare("SELECT * FROM anchors WHERE tenant_id = ? ORDER BY seq DESC, id DESC LIMIT 1").get(tenantId);
}
export function listAnchors(tenantId, limit = 20) {
  return db.prepare("SELECT * FROM anchors WHERE tenant_id = ? ORDER BY id DESC LIMIT ?").all(tenantId, limit);
}

/* ───────────────────────── 구독 / 결제 / 계약 ───────────────────────── */
export function getSubscription(tenantId) {
  return db.prepare("SELECT * FROM subscriptions WHERE tenant_id = ?").get(tenantId);
}

// 테넌트당 1행. customer_key는 최초 생성 시 한 번만 만들고 이후 재사용한다
// (결제사 쪽 고객 식별자가 바뀌면 등록된 빌링키와의 연결이 끊어지기 때문).
export function upsertSubscription(tenantId, fields) {
  const now = new Date().toISOString();
  const existing = getSubscription(tenantId);
  if (!existing) {
    db.prepare(`
      INSERT INTO subscriptions (tenant_id, customer_key, plan, status, billing_key_enc, card_summary,
                                 amount, next_billing_at, cancel_at_period_end, fail_count, created_at, updated_at)
      VALUES (@tenant_id, @customer_key, @plan, @status, @billing_key_enc, @card_summary,
              @amount, @next_billing_at, @cancel_at_period_end, @fail_count, @created_at, @updated_at)
    `).run({
      tenant_id: tenantId,
      billing_key_enc: null, card_summary: null, amount: 0, next_billing_at: null,
      cancel_at_period_end: 0, fail_count: 0,
      ...fields, created_at: now, updated_at: now,
    });
  } else {
    const merged = { ...existing, ...fields, updated_at: now };
    db.prepare(`
      UPDATE subscriptions SET plan=@plan, status=@status, billing_key_enc=@billing_key_enc,
        card_summary=@card_summary, amount=@amount, next_billing_at=@next_billing_at,
        cancel_at_period_end=@cancel_at_period_end, fail_count=@fail_count, updated_at=@updated_at
      WHERE tenant_id=@tenant_id
    `).run({ ...merged, tenant_id: tenantId });
  }
  return getSubscription(tenantId);
}

// 청구 시점이 도래한 구독 전부 (스케줄러용)
export function dueSubscriptions(nowIso) {
  return db.prepare(`
    SELECT s.*, t.slug, t.name FROM subscriptions s JOIN tenants t ON t.id = s.tenant_id
    WHERE s.status IN ('active','past_due') AND s.next_billing_at IS NOT NULL AND s.next_billing_at <= ?
  `).all(nowIso);
}

export function recordPayment(p) {
  const info = db.prepare(`
    INSERT INTO payments (tenant_id, order_id, order_name, plan, amount, status, payment_key,
                          receipt_url, method, message, approved_at, created_at)
    VALUES (@tenant_id, @order_id, @order_name, @plan, @amount, @status, @payment_key,
            @receipt_url, @method, @message, @approved_at, @created_at)
  `).run({ payment_key: null, receipt_url: null, message: null, approved_at: null, ...p, created_at: new Date().toISOString() });
  return { id: info.lastInsertRowid, ...p };
}

export function listPayments(tenantId, limit = 24) {
  return db.prepare("SELECT * FROM payments WHERE tenant_id = ? ORDER BY id DESC LIMIT ?").all(tenantId, limit);
}

export function findContract(tenantId, kind, version) {
  return db.prepare("SELECT * FROM contracts WHERE tenant_id = ? AND kind = ? AND version = ?").get(tenantId, kind, version);
}

export function insertContract(c) {
  const info = db.prepare(`
    INSERT INTO contracts (tenant_id, kind, version, doc_hash, signer_name, signer_title, signer_email, signed_ip, signed_at, seal)
    VALUES (@tenant_id, @kind, @version, @doc_hash, @signer_name, @signer_title, @signer_email, @signed_ip, @signed_at, @seal)
  `).run({ signed_ip: null, ...c });
  return { id: info.lastInsertRowid, ...c };
}

export function listContracts(tenantId) {
  return db.prepare("SELECT * FROM contracts WHERE tenant_id = ? ORDER BY id ASC").all(tenantId);
}

/* ───────────────────────── 유출 대응(사고 워크플로우) 상태 ───────────────────────── */
export const BREACH_STEP_KEYS = ["scope", "notify", "pipc", "kisa"];

function defaultBreachState(tenantId) {
  return { tenant_id: tenantId, active: false, started_at: null, steps: {} };
}

export function getBreachState(tenantId) {
  const row = db.prepare("SELECT * FROM breach_state WHERE tenant_id = ?").get(tenantId);
  if (!row) return defaultBreachState(tenantId);
  return { tenant_id: row.tenant_id, active: !!row.active, started_at: row.started_at, steps: JSON.parse(row.steps || "{}") };
}

function saveBreachState(tenantId, { active, started_at, steps }) {
  const stepsJson = JSON.stringify(steps || {});
  const exists = db.prepare("SELECT 1 FROM breach_state WHERE tenant_id = ?").get(tenantId);
  if (exists) {
    db.prepare("UPDATE breach_state SET active=?, started_at=?, steps=? WHERE tenant_id=?")
      .run(active ? 1 : 0, started_at, stepsJson, tenantId);
  } else {
    db.prepare("INSERT INTO breach_state (tenant_id, active, started_at, steps) VALUES (?,?,?,?)")
      .run(tenantId, active ? 1 : 0, started_at, stepsJson);
  }
  return getBreachState(tenantId);
}

// 사고 대응 개시 — 통지·신고 기한(72시간) 카운트다운의 기준 시각을 여기서 고정한다.
export function startBreach(tenantId) {
  return saveBreachState(tenantId, { active: true, started_at: new Date().toISOString(), steps: {} });
}

// 대응 종료 — 다음 리허설/실제 사고를 위해 완전히 초기화한다(진행 이력은 원장의 봉인 기록으로 남아 있다).
export function endBreach(tenantId) {
  return saveBreachState(tenantId, { active: false, started_at: null, steps: {} });
}

// 단계 완료 토글. 활성 상태가 아니면(사고 대응을 개시하지 않았으면) 에러.
export function toggleBreachStep(tenantId, stepKey) {
  if (!BREACH_STEP_KEYS.includes(stepKey)) throw new Error("알 수 없는 단계입니다.");
  const cur = getBreachState(tenantId);
  if (!cur.active) throw new Error("먼저 유출사고 대응을 개시해야 합니다.");
  const steps = { ...cur.steps };
  if (steps[stepKey]) delete steps[stepKey];
  else steps[stepKey] = new Date().toISOString();
  return saveBreachState(tenantId, { active: true, started_at: cur.started_at, steps });
}

/* ───────────────────────── 관리자 감사 로그 ───────────────────────── */
const insertAuditStmt = db.prepare(
  "INSERT INTO admin_audit (at, action, target, detail, ip) VALUES (?, ?, ?, ?, ?)"
);
export function recordAudit(action, { target = null, detail = null, ip = null } = {}) {
  insertAuditStmt.run(new Date().toISOString(), action, target, detail, ip);
}
export function listAudit(limit = 100) {
  return db.prepare("SELECT * FROM admin_audit ORDER BY id DESC LIMIT ?").all(limit);
}

const insertMonitorStmt = db.prepare(`
  INSERT INTO monitor_runs (tenant_id, checked_at, intact, blocks, truncated, first_broken_seq, alerted)
  VALUES (@tenant_id, @checked_at, @intact, @blocks, @truncated, @first_broken_seq, @alerted)
`);
export function recordMonitorRun(r) {
  const info = insertMonitorStmt.run(r);
  return { id: info.lastInsertRowid, ...r };
}
export function latestMonitorRun(tenantId) {
  return db.prepare("SELECT * FROM monitor_runs WHERE tenant_id = ? ORDER BY id DESC LIMIT 1").get(tenantId);
}
export function recentMonitorRuns(limit = 50) {
  return db.prepare("SELECT * FROM monitor_runs ORDER BY id DESC LIMIT ?").all(limit);
}
