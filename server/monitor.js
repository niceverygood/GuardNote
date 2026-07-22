// 자동 무결성 검증 스케줄러 — 정해진 주기마다 모든(모니터링 대상) 테넌트의 원장을 검증하고,
// 위변조/절단/앵커 불일치가 감지되면 알림(웹훅 + 콘솔)을 보낸다. 선택적으로 자동 앵커링도 수행.
//
// 환경변수:
//   GUARDNOTE_MONITOR_INTERVAL_MS : 검증 주기(ms). 없으면 스케줄러 비활성.
//   GUARDNOTE_ALERT_WEBHOOK       : 위반 감지 시 POST할 URL(Slack Incoming Webhook 등).
//   GUARDNOTE_AUTO_ANCHOR         : "1"이면 매 검증마다 head가 진전된 테넌트를 자동 앵커링.
import { listTenants, verifyChain, recordMonitorRun, latestMonitorRun } from "./db.js";
import { anchorStatus, anchorTenant } from "./anchor.js";
import { planAllows } from "./plans.js";

const AUTO_ANCHOR = process.env.GUARDNOTE_AUTO_ANCHOR === "1";
const WEBHOOK = process.env.GUARDNOTE_ALERT_WEBHOOK || null;

async function sendAlert(tenant, run, anchor) {
  const reason = run.truncated ? "원장 꼬리 절단(최근 기록 삭제)"
    : run.first_broken_seq != null ? `블록 #${String(run.first_broken_seq).padStart(2, "0")}부터 해시 불일치`
    : anchor && anchor.anchored && !anchor.ok ? "앵커 불일치(앵커 시점 이후 과거 변조 의심)"
    : "무결성 위반";
  const text = `🚨 [가드노트] ${tenant.name}(${tenant.slug}) 원장 무결성 위반 감지 — ${reason} · ${run.checked_at}`;
  console.error(text);
  if (!WEBHOOK) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, tenant: tenant.slug, run, anchor }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
  } catch (e) {
    console.error("알림 웹훅 전송 실패:", e.message);
  }
}

// 한 번의 검증 사이클. 테스트/수동 실행용으로도 export.
export async function runMonitorOnce() {
  const summary = [];
  for (const tenant of listTenants()) {
    if (!planAllows(tenant.plan, "monitor")) continue;

    if (AUTO_ANCHOR && planAllows(tenant.plan, "anchor")) {
      try { await anchorTenant(tenant.id); } catch (e) { console.error(`앵커링 실패(${tenant.slug}):`, e.message); }
    }

    const v = verifyChain(tenant.id);
    const a = anchorStatus(tenant.id);
    const anchorBroken = a.anchored && !a.ok;
    const intact = v.intact && !anchorBroken;

    const prev = latestMonitorRun(tenant.id);
    // 알림 스팸 방지: 직전 검증이 정상이었다가 지금 깨진 "전이 시점"에만 알린다.
    const shouldAlert = !intact && (!prev || prev.intact === 1);

    const run = recordMonitorRun({
      tenant_id: tenant.id,
      checked_at: new Date().toISOString(),
      intact: intact ? 1 : 0,
      blocks: v.blocks,
      truncated: v.truncated ? 1 : 0,
      first_broken_seq: v.firstBrokenSeq ?? null,
      alerted: shouldAlert ? 1 : 0,
    });

    if (shouldAlert) await sendAlert(tenant, run, a);
    summary.push({ slug: tenant.slug, intact, blocks: v.blocks, anchored: a.anchored });
  }
  return summary;
}

// 스케줄러 시작. 반환값의 stop()으로 정지.
export function startMonitor() {
  const interval = Number(process.env.GUARDNOTE_MONITOR_INTERVAL_MS || 0);
  if (!interval || interval <= 0) return { enabled: false };
  console.log(`🔎 자동 무결성 검증 스케줄러 시작 — ${interval}ms 주기` +
    (WEBHOOK ? " · 위반 시 웹훅 알림" : " · 콘솔 알림") + (AUTO_ANCHOR ? " · 자동 앵커링" : ""));
  runMonitorOnce().catch((e) => console.error("모니터 초기 실행 오류:", e.message));
  const timer = setInterval(() => {
    runMonitorOnce().catch((e) => console.error("모니터 실행 오류:", e.message));
  }, interval);
  timer.unref?.();
  return { enabled: true, stop: () => clearInterval(timer) };
}
