// 결제 — 토스페이먼츠 빌링(정기결제) 연동.
//
// 플로우:
//   1) checkout  : 프론트에 clientKey/customerKey를 내려줌 → 토스 카드등록창(requestBillingAuth) 호출
//   2) complete  : 카드등록 성공 리다이렉트로 받은 authKey로 빌링키 발급 → 첫 달 즉시 청구 → 플랜 활성화
//   3) scheduler : 매월 next_billing_at 도래 시 빌링키로 자동 청구. 3회 실패 시 free로 강등.
//
// 모드:
//   - 실결제  : TOSS_SECRET_KEY / TOSS_CLIENT_KEY 환경변수 설정 시. 라이브 키(live_)면 실제 카드 청구,
//               테스트 키(test_)면 토스 샌드박스 청구.
//   - 모의(mock): 키 미설정 + 개발 환경(NODE_ENV!==production)일 때. 외부 호출 없이 전체 플로우가
//               동작한다(카드등록·청구를 서버가 시뮬레이션). 프로덕션에서 키 미설정이면 결제 비활성.
//
// 빌링키는 유출 시 임의 청구가 가능한 민감정보라 AES-256-GCM으로 암호화해 저장한다.
// 암호화 키는 DB 밖(환경변수 GUARDNOTE_BILLING_SECRET, dev는 .billing-secret 파일)에서 관리.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateSecret } from "./crypto-utils.js";
import {
  getSubscription, upsertSubscription, dueSubscriptions, recordPayment, listPayments, setPlan,
} from "./db.js";
import { getPlan } from "./plans.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECRET_FILE = path.join(__dirname, ".billing-secret");
const isProd = process.env.NODE_ENV === "production";

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || null;
const TOSS_CLIENT_KEY = process.env.TOSS_CLIENT_KEY || null;
const TOSS_API = "https://api.tosspayments.com";

// 결제 모드 판정 — 프론트/라우트가 분기에 쓴다
export function billingMode() {
  if (TOSS_SECRET_KEY && TOSS_CLIENT_KEY) return "toss";
  return isProd ? "disabled" : "mock";
}
export function tossClientKey() { return TOSS_CLIENT_KEY; }

/* ───────────────────────── 빌링키 암호화 ───────────────────────── */
function loadSecret() {
  if (process.env.GUARDNOTE_BILLING_SECRET) return process.env.GUARDNOTE_BILLING_SECRET;
  try {
    return fs.readFileSync(SECRET_FILE, "utf8").trim();
  } catch {
    const s = generateSecret();
    try { fs.writeFileSync(SECRET_FILE, s, { encoding: "utf8", mode: 0o600 }); } catch { /* 읽기전용 FS면 메모리에만 */ }
    return s;
  }
}
const ENC_KEY = crypto.createHash("sha256").update(loadSecret(), "utf8").digest(); // 32바이트 키

export function encryptBillingKey(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${ct.toString("hex")}`;
}

export function decryptBillingKey(enc) {
  const [v, ivHex, tagHex, ctHex] = String(enc).split(":");
  if (v !== "v1") throw new Error("알 수 없는 빌링키 암호화 형식");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]).toString("utf8");
}

/* ───────────────────────── 토스페이먼츠 API ───────────────────────── */
function tossHeaders() {
  return {
    Authorization: `Basic ${Buffer.from(`${TOSS_SECRET_KEY}:`).toString("base64")}`,
    "Content-Type": "application/json",
  };
}

async function tossPost(pathName, body) {
  const res = await fetch(`${TOSS_API}${pathName}`, {
    method: "POST",
    headers: tossHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || `토스페이먼츠 API 오류 (${res.status})`;
    const err = new Error(msg);
    err.code = data?.code;
    throw err;
  }
  return data;
}

// 카드등록창 성공 리다이렉트로 받은 authKey → 빌링키 발급
async function tossIssueBillingKey(authKey, customerKey) {
  const d = await tossPost("/v1/billing/authorizations/issue", { authKey, customerKey });
  const card = d.card || {};
  return {
    billingKey: d.billingKey,
    cardSummary: `${d.cardCompany || card.issuerCode || "카드"} ${card.number || d.cardNumber || "****"}`,
  };
}

// 빌링키로 1회 청구
async function tossCharge(billingKey, { customerKey, amount, orderId, orderName, customerName }) {
  const d = await tossPost(`/v1/billing/${encodeURIComponent(billingKey)}`, {
    customerKey, amount, orderId, orderName, customerName, taxFreeAmount: 0,
  });
  return {
    paymentKey: d.paymentKey,
    receiptUrl: d.receipt?.url || null,
    approvedAt: d.approvedAt || new Date().toISOString(),
  };
}

/* ───────────────────────── 공통 헬퍼 ───────────────────────── */
function newOrderId(tenantId) {
  return `gn-${tenantId}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

function addMonths(iso, n) {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + n);
  return d.toISOString();
}

function addDays(iso, n) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

// 구독 행 확보 (customer_key는 최초 1회 생성 후 고정)
export function ensureSubscription(tenant) {
  const existing = getSubscription(tenant.id);
  if (existing) return existing;
  return upsertSubscription(tenant.id, {
    customer_key: `gncus_${tenant.id}_${crypto.randomBytes(8).toString("hex")}`,
    plan: tenant.plan,
    status: "incomplete",
  });
}

// 1회 청구 실행 — 모드에 따라 토스 또는 모의. 성공/실패 모두 payments에 기록하고 결과를 돌려준다.
async function chargeOnce(sub, tenant, planKey, method) {
  const plan = getPlan(planKey);
  const orderId = newOrderId(tenant.id);
  const orderName = `가드노트 ${plan.label} 플랜 (월간)`;
  const base = {
    tenant_id: tenant.id, order_id: orderId, order_name: orderName,
    plan: planKey, amount: plan.priceMonthly, method,
  };
  try {
    let result;
    if (method === "toss") {
      result = await tossCharge(decryptBillingKey(sub.billing_key_enc), {
        customerKey: sub.customer_key,
        amount: plan.priceMonthly,
        orderId, orderName,
        customerName: tenant.name,
      });
    } else {
      // 모의 청구 — 외부 호출 없이 항상 승인. 개발 환경 전용.
      result = { paymentKey: `mock_${orderId}`, receiptUrl: null, approvedAt: new Date().toISOString() };
    }
    recordPayment({ ...base, status: "DONE", payment_key: result.paymentKey, receipt_url: result.receiptUrl, approved_at: result.approvedAt });
    return { ok: true, ...result };
  } catch (e) {
    recordPayment({ ...base, status: "FAILED", message: e.message });
    return { ok: false, message: e.message };
  }
}

/* ───────────────────────── 구독 라이프사이클 ───────────────────────── */
// 카드 등록 완료(authKey 수신 또는 mock) → 빌링키 확보 → 첫 달 청구 → 플랜 활성화
export async function activateSubscription(tenant, planKey, authKey) {
  const mode = billingMode();
  if (mode === "disabled") throw new Error("결제가 비활성화되어 있습니다 (TOSS_SECRET_KEY/TOSS_CLIENT_KEY 미설정).");
  const plan = getPlan(planKey);
  if (!plan.priceMonthly) throw new Error("무료 플랜은 결제 대상이 아닙니다.");

  let sub = ensureSubscription(tenant);

  // 1) 빌링키 확보
  let billingKeyEnc = sub.billing_key_enc;
  let cardSummary = sub.card_summary;
  if (mode === "toss") {
    if (!authKey) throw new Error("authKey가 없습니다. 카드등록창을 다시 진행하세요.");
    const issued = await tossIssueBillingKey(authKey, sub.customer_key);
    billingKeyEnc = encryptBillingKey(issued.billingKey);
    cardSummary = issued.cardSummary;
  } else if (!billingKeyEnc) {
    billingKeyEnc = encryptBillingKey(`mockbk_${crypto.randomBytes(12).toString("hex")}`);
    cardSummary = "모의카드 ****-4242 (개발용)";
  }
  sub = upsertSubscription(tenant.id, { ...sub, billing_key_enc: billingKeyEnc, card_summary: cardSummary, plan: planKey, amount: plan.priceMonthly });

  // 2) 첫 달 즉시 청구
  const charged = await chargeOnce(sub, tenant, planKey, mode === "toss" ? "toss" : "mock");
  if (!charged.ok) {
    upsertSubscription(tenant.id, { ...sub, status: "incomplete" });
    throw new Error(`첫 결제에 실패했습니다: ${charged.message}`);
  }

  // 3) 플랜 활성화 + 다음 청구일 설정
  setPlan(tenant.slug, planKey);
  const now = new Date().toISOString();
  return upsertSubscription(tenant.id, {
    ...sub, plan: planKey, status: "active", amount: plan.priceMonthly,
    next_billing_at: addMonths(now, 1), cancel_at_period_end: 0, fail_count: 0,
  });
}

// 해지 — 즉시 끊지 않고 이미 결제된 기간 종료(next_billing_at) 시점에 free로 강등한다.
export function cancelSubscription(tenant) {
  const sub = getSubscription(tenant.id);
  if (!sub || sub.status === "canceled" || !sub.next_billing_at) {
    throw new Error("해지할 활성 구독이 없습니다.");
  }
  return upsertSubscription(tenant.id, { ...sub, cancel_at_period_end: 1 });
}

// 해지 예약 철회
export function resumeSubscription(tenant) {
  const sub = getSubscription(tenant.id);
  if (!sub || !sub.cancel_at_period_end) throw new Error("해지 예약된 구독이 없습니다.");
  return upsertSubscription(tenant.id, { ...sub, cancel_at_period_end: 0 });
}

export function billingSummary(tenant) {
  const sub = getSubscription(tenant.id);
  return {
    mode: billingMode(),
    subscription: sub ? {
      plan: sub.plan, status: sub.status, cardSummary: sub.card_summary,
      amount: sub.amount, nextBillingAt: sub.next_billing_at,
      cancelAtPeriodEnd: !!sub.cancel_at_period_end, failCount: sub.fail_count,
    } : null,
    payments: listPayments(tenant.id).map((p) => ({
      orderId: p.order_id, orderName: p.order_name, plan: p.plan, amount: p.amount,
      status: p.status, method: p.method, message: p.message,
      receiptUrl: p.receipt_url, approvedAt: p.approved_at, createdAt: p.created_at,
    })),
  };
}

/* ───────────────────────── 정기결제 스케줄러 ───────────────────────── */
const MAX_FAILS = 3;

// 청구 시점이 도래한 구독을 전부 처리한다. (테스트를 위해 단독 실행도 가능)
export async function runBillingOnce() {
  const mode = billingMode();
  if (mode === "disabled") return [];
  const due = dueSubscriptions(new Date().toISOString());
  const results = [];
  for (const sub of due) {
    const tenant = { id: sub.tenant_id, slug: sub.slug, name: sub.name };

    // 해지 예약된 구독 — 기간 종료 시점 도달: free로 강등하고 종료
    if (sub.cancel_at_period_end) {
      setPlan(sub.slug, "free");
      upsertSubscription(sub.tenant_id, { ...sub, status: "canceled", next_billing_at: null });
      results.push({ slug: sub.slug, action: "canceled" });
      continue;
    }

    const charged = await chargeOnce(sub, tenant, sub.plan, mode === "toss" ? "toss" : "mock");
    if (charged.ok) {
      upsertSubscription(sub.tenant_id, {
        ...sub, status: "active", fail_count: 0,
        next_billing_at: addMonths(sub.next_billing_at, 1),
      });
      results.push({ slug: sub.slug, action: "charged", amount: sub.amount });
    } else {
      const fails = sub.fail_count + 1;
      if (fails >= MAX_FAILS) {
        // 연체 확정 — 유료 기능 회수. 원장 데이터는 그대로 유지된다(읽기·CSV는 free에서도 가능).
        setPlan(sub.slug, "free");
        upsertSubscription(sub.tenant_id, { ...sub, status: "canceled", fail_count: fails, next_billing_at: null });
        results.push({ slug: sub.slug, action: "downgraded", reason: charged.message });
      } else {
        upsertSubscription(sub.tenant_id, {
          ...sub, status: "past_due", fail_count: fails,
          next_billing_at: addDays(new Date().toISOString(), 1), // 다음 날 재시도
        });
        results.push({ slug: sub.slug, action: "retry_scheduled", fails, reason: charged.message });
      }
    }
  }
  return results;
}

export function startBillingScheduler() {
  if (billingMode() === "disabled") return;
  const interval = Number(process.env.GUARDNOTE_BILLING_INTERVAL_MS || 6 * 3600 * 1000); // 기본 6시간
  const tick = async () => {
    try {
      const r = await runBillingOnce();
      if (r.length) console.log(`💳 정기결제 처리: ${JSON.stringify(r)}`);
    } catch (e) {
      console.error("💳 정기결제 스케줄러 오류:", e.message);
    }
  };
  setTimeout(tick, 10_000); // 부팅 직후 1회 (10초 뒤 — 부팅 시드와 겹치지 않게)
  setInterval(tick, interval).unref();
  console.log(`💳 정기결제 스케줄러 시작 (모드: ${billingMode()}, 주기: ${Math.round(interval / 60000)}분)`);
}
