// 초기 증적 시드 — 안전성 확보조치 항목(고시 제4조~제13조)을 지정된 테넌트의 원장에 봉인 적재한다.
// (그 테넌트의 원장이 비어있을 때만 넣는다. 이미 있으면 건드리지 않는다.)
import { appendEntry, allEntries } from "./db.js";

// 시각 오름차순(과거→현재). seq 1 = 가장 오래된 기록.
export const SEED = [
  { ts: "2026-04-18 10:30", cat_key: "disaster", actor: "김상주", action: "재해복구(DR) 모의훈련 실시 — 백업 복구 테스트 및 RTO 측정 완료" },
  { ts: "2026-05-31 17:40", cat_key: "log",      actor: "이수빈", action: "접속기록 월간 점검 완료 — 비정상 접근 0건, 점검결과 보존" },
  { ts: "2026-06-10 09:15", cat_key: "phys",     actor: "김상주", action: "서버실 출입통제·CCTV 분기 점검 및 출입기록 대조 완료" },
  { ts: "2026-06-12 09:50", cat_key: "plan",     actor: "한승수", action: "내부 관리계획 v3.2 개정·시행 — 보유기간·파기절차 조항 갱신" },
  { ts: "2026-06-15 13:00", cat_key: "plan",     actor: "전직원", action: "개인정보 취급자 정기 보안교육 이수 (6/6명) — 수료 기록 첨부" },
  { ts: "2026-06-18 14:20", cat_key: "auth",     actor: "이수빈", action: "퇴사자 1인 접근권한 즉시 회수 및 계정 비활성화 — 회수 확인" },
  { ts: "2026-06-20 10:08", cat_key: "crypto",   actor: "김동호", action: "DB 암호화 키 정기 교체 (KMS) — 고유식별정보 컬럼 재암호화 완료" },
  { ts: "2026-06-22 16:45", cat_key: "output",   actor: "유하니", action: "개인정보 포함 보고서 출력 워터마크·반출대장 기록 정책 점검" },
  { ts: "2026-06-25 11:30", cat_key: "malware",  actor: "김상주", action: "백신·EDR 정책 점검 및 정의 업데이트 검증 완료 (전 단말 17대)" },
  { ts: "2026-06-27 18:02", cat_key: "access",   actor: "이수빈", action: "관리자 콘솔 접속 IP 화이트리스트 갱신 — 2개 추가, 1개 회수" },
  { ts: "2026-06-28 09:14", cat_key: "auth",     actor: "한승수", action: "신규 입사자 개인정보 접근권한 부여 — 대표 승인 (열람: CS DB / 기간한정)" },
  { ts: "2026-06-30 15:20", cat_key: "destroy",  actor: "이수빈", action: "보유기간 경과 탈퇴회원 개인정보 파기 — 복구 불가 삭제 수행, 파기 결과 확인 (제13조)" },
];

export function seedIfEmpty(tenantId) {
  if (allEntries(tenantId).length > 0) return false;
  for (const e of SEED) appendEntry(tenantId, { ...e, source: "manual" });
  return true;
}
