// 앵커링 CLI — 특정 테넌트(또는 전체)의 현재 체인 head를 외부 타임스탬프로 박제한다.
// cron으로 주기 실행하면, 서버 상시 스케줄러(GUARDNOTE_MONITOR_INTERVAL_MS) 대신 쓸 수 있다.
//
//   node server/anchor-cli.js gmarket     — 특정 테넌트
//   node server/anchor-cli.js --all       — 전체 테넌트
import { listTenants, findTenantBySlug } from "./db.js";
import { anchorTenant } from "./anchor.js";
import { planAllows } from "./plans.js";

const [, , arg] = process.argv;

async function anchorOne(t) {
  const out = await anchorTenant(t.id);
  if (out.skipped) console.log(`· ${t.slug}: ${out.skipped}`);
  else console.log(`✓ ${t.slug}: 블록 #${String(out.anchor.seq).padStart(2, "0")} 앵커링 (${out.anchor.anchored_at})`);
}

async function main() {
  if (arg === "--all") {
    for (const t of listTenants()) {
      if (planAllows(t.plan, "anchor")) await anchorOne(t);
      else console.log(`· ${t.slug}: 플랜(${t.plan})에 앵커링 기능이 없어 건너뜀`);
    }
  } else if (arg) {
    const t = findTenantBySlug(arg);
    if (!t) { console.error("❌ 존재하지 않는 slug:", arg); process.exit(1); }
    await anchorOne(t);
  } else {
    console.log("사용법: node server/anchor-cli.js <slug> | --all");
    process.exit(1);
  }
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); });
