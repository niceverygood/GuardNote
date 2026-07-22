// 수동 백업 CLI — `npm run backup`
// 배포 전, 마이그레이션 전, 또는 불안할 때 언제든 1회 백업을 뜬다.
import { runBackupOnce } from "./backup.js";
import { listTenants, verifyChain } from "./db.js";

const file = await runBackupOnce();

// 백업 직후 원본 원장의 무결성을 함께 출력해, "깨진 상태를 백업"하는 실수를 바로 알아차리게 한다.
let broken = 0;
for (const t of listTenants()) {
  const v = verifyChain(t.id);
  if (!v.intact) { broken += 1; console.error(`⚠️  ${t.slug}: 무결성 위반 상태로 백업됨 (blocks=${v.blocks})`); }
}
console.log(`✅ 백업 완료 → ${file}${broken ? ` (경고: 위반 테넌트 ${broken}곳 포함)` : " · 전 테넌트 무결성 정상"}`);
