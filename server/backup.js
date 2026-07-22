// 원장 자동 백업 — SQLite 온라인 백업 API 사용 (서비스 무중단, WAL과 안전하게 공존).
//
// 백업은 "원장을 우리가 지킨다"는 상품 약속의 물리적 실체다. 볼륨이 날아가면 고객사의
// 증거 전부가 날아간다 — 상용 운영에서 절대 꺼서는 안 되는 기능.
//
// 환경변수:
//   GUARDNOTE_BACKUP_DIR          백업 저장 폴더 (기본: DB와 같은 폴더의 backups/)
//   GUARDNOTE_BACKUP_INTERVAL_MS  주기 (기본: 프로덕션 6시간, 개발 0=꺼짐)
//   GUARDNOTE_BACKUP_KEEP         보관 개수 (기본 40 — 6시간 주기면 열흘치)
//
// 복구 절차는 README "백업과 복구" 참고 (요약: 서버 중지 → 백업 파일을 GUARDNOTE_DB 위치로
// 복사 → 서버 시작 → /api/verify 로 각 테넌트 무결성 확인).
import fs from "node:fs";
import path from "node:path";
import { db } from "./db.js";

const isProd = process.env.NODE_ENV === "production";
const DB_PATH = process.env.GUARDNOTE_DB || path.join(path.dirname(new URL(import.meta.url).pathname), "guardnote.db");
const BACKUP_DIR = process.env.GUARDNOTE_BACKUP_DIR || path.join(path.dirname(DB_PATH), "backups");
const INTERVAL_MS = Number(process.env.GUARDNOTE_BACKUP_INTERVAL_MS ?? (isProd ? 6 * 60 * 60 * 1000 : 0));
const KEEP = Math.max(1, Number(process.env.GUARDNOTE_BACKUP_KEEP ?? 40));

function stamp() {
  return new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14); // YYYYMMDDHHMMSS
}

// 백업 1회 실행 → 생성된 파일 경로 반환. better-sqlite3의 backup()은 페이지 단위로
// 잠금을 나눠 잡는 온라인 백업이라, 봉인 트래픽이 흐르는 중에도 안전하다.
export async function runBackupOnce() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const dest = path.join(BACKUP_DIR, `guardnote-${stamp()}.db`);
  await db.backup(dest);
  prune();
  return dest;
}

// 보관 개수 초과분 삭제 (오래된 것부터)
function prune() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => /^guardnote-\d{14}\.db$/.test(f))
    .sort(); // 파일명이 시간순 정렬과 일치
  while (files.length > KEEP) {
    const victim = files.shift();
    try { fs.unlinkSync(path.join(BACKUP_DIR, victim)); } catch { /* ignore */ }
  }
}

export function startBackupScheduler() {
  if (!INTERVAL_MS) {
    if (isProd) console.warn("⚠️  백업 스케줄러가 꺼져 있습니다 (GUARDNOTE_BACKUP_INTERVAL_MS=0) — 프로덕션 권장 설정이 아닙니다.");
    return null;
  }
  const run = () =>
    runBackupOnce()
      .then((f) => console.log(`💾 원장 백업 완료 → ${f}`))
      .catch((e) => console.error("❌ 원장 백업 실패:", e.message));
  run(); // 기동 직후 1회
  const timer = setInterval(run, INTERVAL_MS);
  timer.unref?.();
  console.log(`💾 백업 스케줄러 시작 — ${Math.round(INTERVAL_MS / 60000)}분 주기, 보관 ${KEEP}개, 폴더 ${BACKUP_DIR}`);
  return timer;
}
