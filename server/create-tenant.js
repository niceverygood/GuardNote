// 신규 고객사 온보딩 CLI.
//
//   node server/create-tenant.js gmarket "지마켓"            (기본 free 플랜)
//   node server/create-tenant.js gmarket "지마켓" pro         (플랜 지정)
//   node server/create-tenant.js list
//
// API 키는 이 실행에서 딱 한 번만 출력된다 — 안전한 곳(비밀관리소/1Password 등)에
// 보관 후, 고객사 수집기(server/collector-example.js)나 프론트엔드 접속에 사용한다.
// 분실 시 평문 복구는 불가능하고, 재발급은 node server/rotate-key.js <slug> 로 한다.
import { createTenant, listTenants } from "./db.js";
import { PLAN_KEYS } from "./plans.js";

const [, , cmd, ...rest] = process.argv;

if (cmd === "list") {
  const tenants = listTenants();
  if (tenants.length === 0) console.log("등록된 테넌트가 없습니다.");
  else console.table(tenants);
  process.exit(0);
}

const slug = cmd;
// 마지막 인자가 플랜 키면 플랜으로, 아니면 이름의 일부로 취급.
let plan = "free";
let nameParts = rest;
if (rest.length >= 1 && PLAN_KEYS.includes(rest[rest.length - 1])) {
  plan = rest[rest.length - 1];
  nameParts = rest.slice(0, -1);
}
const name = nameParts.join(" ");

if (!slug || !name) {
  console.log("사용법:");
  console.log("  node server/create-tenant.js <slug> <표시이름> [plan]   — 신규 고객사 온보딩");
  console.log("  node server/create-tenant.js list                       — 전체 테넌트 목록");
  console.log("");
  console.log(`  plan: ${PLAN_KEYS.join(" | ")} (기본 free)`);
  console.log("");
  console.log("예시:");
  console.log('  node server/create-tenant.js gmarket "지마켓" enterprise');
  process.exit(1);
}

try {
  const { tenant, apiKey } = createTenant({ slug, name, plan });
  console.log(`✅ 테넌트 생성 완료 — ${tenant.name} (id=${tenant.id}, slug=${tenant.slug}, plan=${tenant.plan})`);
  console.log("");
  console.log("⚠️  아래 API 키는 지금 이 화면에서 딱 한 번만 표시됩니다.");
  console.log(`   ${apiKey}`);
  console.log("");
  console.log("수집기 연동 예시:");
  console.log(`   GUARDNOTE_API_KEY=${apiKey} node server/collector-example.js`);
} catch (e) {
  console.error("❌", e.message);
  process.exit(1);
}
