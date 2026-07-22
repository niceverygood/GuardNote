// 순수 암호화 유틸 — db.js와 auth.js가 함께 쓴다 (순환 import 방지용으로 분리).
import crypto from "node:crypto";

export function sha256(str) {
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

const API_KEY_PREFIX = "gn_live_";
const ADMIN_TOKEN_PREFIX = "gn_admin_";

// 192비트 랜덤 API 키. 평문은 발급 시 1회만 노출되고, DB엔 해시만 저장된다.
export function generateApiKey() {
  return API_KEY_PREFIX + crypto.randomBytes(24).toString("hex");
}

export function generateAdminToken() {
  return ADMIN_TOKEN_PREFIX + crypto.randomBytes(24).toString("hex");
}

export function generateSecret() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashApiKey(key) {
  return sha256(key);
}

// 앵커 서명용 HMAC-SHA256. 비밀키는 DB 밖에서 관리한다.
export function hmacSha256(secret, msg) {
  return crypto.createHmac("sha256", secret).update(msg, "utf8").digest("hex");
}

// 타이밍 공격에 안전한 문자열 비교 (관리자 토큰 대조 등)
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
