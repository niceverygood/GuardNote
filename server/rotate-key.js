// API 키 재발급 CLI — 같은 테넌트(원장·플랜 그대로)에 새 키를 발급하고 기존 키를 즉시 무효화한다.
// 키 유출이 의심될 때 사용. 원장 데이터는 그대로 유지된다.
//
//   node server/rotate-key.js gmarket
import { rotateApiKey } from "./db.js";

const [, , slug] = process.argv;

if (!slug) {
  console.log("사용법: node server/rotate-key.js <slug>");
  console.log("예시:   node server/rotate-key.js gmarket");
  process.exit(1);
}

try {
  const { tenant, apiKey } = rotateApiKey(slug);
  console.log(`🔄 API 키 재발급 완료 — ${tenant.name} (slug=${tenant.slug})`);
  console.log("   기존 키는 즉시 무효화되었습니다. 수집기·대시보드에 아래 새 키를 반영하세요.");
  console.log("");
  console.log("⚠️  아래 새 API 키는 지금 이 화면에서 딱 한 번만 표시됩니다.");
  console.log(`   ${apiKey}`);
} catch (e) {
  console.error("❌", e.message);
  process.exit(1);
}
