// 예시 수집기 — 실제 서버/DB의 로그를 읽어 GuardNote 원장에 자동 적재하는 자리.
//
// 지금은 "이런 이벤트가 이렇게 들어온다"를 보여주는 샘플이다. 실전에서는 아래
// collectEvents() 안을, 진짜 소스(예: /var/log 접속로그, DB audit 테이블,
// KMS 키교체 이벤트, EDR 콘솔 API 등)를 읽어 표준 형태로 바꾸는 코드로 교체한다.
//
// 실행 (API 서버가 떠 있어야 함):
//   GUARDNOTE_API_KEY=gn_live_xxx node server/collector-example.js
// API 키는 node server/create-tenant.js <slug> <이름> 으로 고객사별 발급.

const API = process.env.GUARDNOTE_API || "http://localhost:8787";
const API_KEY = process.env.GUARDNOTE_API_KEY;
const COLLECTOR = "syslog-agent";

if (!API_KEY) {
  console.error("❌ GUARDNOTE_API_KEY 환경변수가 필요합니다. (node server/create-tenant.js 로 발급받은 키)");
  process.exit(1);
}

// TODO(실전): 여기서 실제 로그/audit 소스를 읽어 표준 이벤트 배열로 변환.
async function collectEvents() {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  return [
    { cat_key: "log",    actor: COLLECTOR, action: `[자동] 접속기록 수집 — 최근 1시간 로그인 3건 정상, 실패 0건 (${stamp})` },
    { cat_key: "access", actor: COLLECTOR, action: `[자동] 방화벽 차단 이벤트 요약 — 외부 스캔 12건 차단 (${stamp})` },
  ];
}

async function main() {
  const events = await collectEvents();
  const res = await fetch(`${API}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ collector: COLLECTOR, events }),
  });
  if (!res.ok) {
    console.error("적재 실패:", res.status, await res.text());
    process.exit(1);
  }
  const out = await res.json();
  console.log(`✅ ${out.ingested}건 봉인 적재 (source=ingest:${COLLECTOR})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
