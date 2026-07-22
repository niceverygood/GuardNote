// 외부 타임스탬프 앵커링 — "그 시점에 이 원장이 이 상태였다"를 제3자가 확인 가능한 형태로 박제한다.
//
// 왜 필요한가: verifyChain의 꼬리절단 탐지(tenants.last_seq/last_hash)는 같은 DB 파일 안의
// 대조라서, DB에 완전한 쓰기 권한을 가진 공격자가 entries와 포인터를 "동시에" 맞춰 고치면
// 뚫린다. 앵커는 이 약점을 메운다:
//   1) 서명 비밀키(ANCHOR_SECRET)가 DB 밖에 있어, DB만 조작해서는 위조 head에 유효 서명을 못 만든다.
//   2) GUARDNOTE_ANCHOR_URL을 설정하면 외부 노터리에 head를 전송·박제해, DB 소유자조차 과거를 못 바꾼다.
//
// 앵커 = { tenant_id, seq, head_hash, anchored_at, signature }.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hmacSha256, generateSecret } from "./crypto-utils.js";
import { chainHead, ledgerTail, recordAnchor, latestAnchor, recomputedHashAt } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECRET_FILE = path.join(__dirname, ".anchor-secret");

// 서명 비밀키: 환경변수 우선, 없으면 파일에서 로드, 그것도 없으면 생성해 파일로 저장(dev 편의).
// 프로덕션에서는 GUARDNOTE_ANCHOR_SECRET를 시크릿 매니저로 주입하는 것을 전제로 한다.
function loadSecret() {
  if (process.env.GUARDNOTE_ANCHOR_SECRET) return process.env.GUARDNOTE_ANCHOR_SECRET;
  try {
    return fs.readFileSync(SECRET_FILE, "utf8").trim();
  } catch {
    const s = generateSecret();
    try { fs.writeFileSync(SECRET_FILE, s, { encoding: "utf8", mode: 0o600 }); } catch { /* 읽기전용 FS면 메모리에만 유지 */ }
    return s;
  }
}
const ANCHOR_SECRET = loadSecret();
const ANCHOR_URL = process.env.GUARDNOTE_ANCHOR_URL || null;

function anchorMessage({ tenant_id, seq, head_hash, anchored_at }) {
  return `${tenant_id}|${seq}|${head_hash}|${anchored_at}`;
}

export function signAnchor(a) {
  return hmacSha256(ANCHOR_SECRET, anchorMessage(a));
}

// 외부 노터리에 head를 전송하고 응답(영수증)을 받는다. 실패해도 로컬 앵커는 남긴다(best-effort).
async function postExternal(payload) {
  if (!ANCHOR_URL) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(ANCHOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return JSON.stringify(await res.json()).slice(0, 4000);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// 해당 테넌트의 현재 head를 앵커링한다. 이미 같은 seq를 앵커링했으면 중복 생성하지 않는다.
export async function anchorTenant(tenantId, anchoredAtIso) {
  const head = chainHead(tenantId);
  if (!head.last_seq) return { skipped: "빈 원장 — 앵커링할 블록이 없습니다." };
  const prev = latestAnchor(tenantId);
  if (prev && prev.seq === head.last_seq && prev.head_hash === head.last_hash) {
    return { skipped: "이미 최신 head가 앵커링되어 있습니다.", anchor: prev };
  }
  const base = {
    tenant_id: tenantId,
    seq: head.last_seq,
    head_hash: head.last_hash,
    anchored_at: anchoredAtIso || new Date().toISOString(),
  };
  const signature = signAnchor(base);
  const external = await postExternal({ ...base, signature });
  const anchor = recordAnchor({ ...base, signature, external });
  return { anchor };
}

// 최신 앵커를 기준으로 현재 원장이 앵커 시점의 상태를 유지하는지 검증한다.
//   signatureValid : 서명이 유효한가 (DB 밖 비밀키로 재계산 대조 — DB만 고쳐선 통과 못 함)
//   positionOk     : 앵커에 박제된 seq 블록을 지금 재계산해도 같은 head_hash가 나오는가
//                    (내용 변조·앵커seq 소실이면 불일치 또는 null → false)
//   truncated      : 현재 원장 실제 tail이 head 포인터(tenants.last_seq/last_hash)보다 짧은가
//
// truncated 검사가 반드시 필요한 이유(보안감사 지적):
//   앵커가 여러 개일 때, 공격자가 "더 최신" 블록들과 그에 해당하는 앵커 행을 함께 지우면
//   latestAnchor가 더 오래된(짧아진 prefix에 대해서도 유효한) 앵커를 돌려주고, positionOk가
//   그대로 통과해버린다. verifyChain은 head 포인터 대조로 이 절단을 잡는데, anchorStatus가
//   그걸 안 보면 verifyChain보다 약해져 "앵커는 정상"이라는 모순된 신호를 준다. 그래서 여기서도
//   동일한 절단 검사를 포함해 ok가 verifyChain과 어긋나지 않게 한다.
//   (단, head 포인터까지 함께 위조하는 완전한 DB 쓰기 공격은 외부 노터리(ANCHOR_URL) 없이는
//    근본적으로 못 막는다 — anchor.js 상단 주석 및 README 참고.)
export function anchorStatus(tenantId) {
  const a = latestAnchor(tenantId);
  if (!a) return { anchored: false };
  const signatureValid = signAnchor(a) === a.signature;
  const recomputed = recomputedHashAt(tenantId, a.seq);
  const positionOk = recomputed !== null && recomputed === a.head_hash;
  const head = chainHead(tenantId);
  const tail = ledgerTail(tenantId);
  const truncated = tail.seq !== head.last_seq || tail.hash !== head.last_hash;
  return {
    anchored: true,
    seq: a.seq,
    anchoredAt: a.anchored_at,
    external: !!a.external,
    signatureValid,
    positionOk,
    truncated,
    ok: signatureValid && positionOk && !truncated,
  };
}

export const anchoringEnabled = { external: !!ANCHOR_URL };
