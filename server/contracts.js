// 전자 계약 — 유료 플랜 결제 전에 반드시 체결해야 하는 두 계약을 관리한다.
//   service : 가드노트 서비스 이용계약서
//   dpa     : 개인정보 처리위탁 계약서 (개인정보보호법 제26조)
//
// 체결 방식(전자문서법·전자서명법상 "당사자 간 합의된 전자서명" 방식):
//   1) 고객이 계약서 전문을 화면에서 확인하고 서명자 정보(성명·직책·이메일)를 입력 후 동의
//   2) 서버가 체결 시점 계약서 원문의 SHA-256 해시(doc_hash)를 계산해 저장
//   3) tenant|kind|version|doc_hash|서명자|시각을 DB 밖 비밀키로 HMAC 봉인(seal)
//      → DB만 조작해서는 유효한 체결 기록을 위조할 수 없다 (앵커와 동일한 신뢰 모델)
//   4) 체결본 PDF에 원문 + 서명 정보 + 해시 + 봉인값을 함께 박아 증빙으로 내려준다
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { sha256, hmacSha256, generateSecret } from "./crypto-utils.js";
import { findContract, insertContract, listContracts } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECRET_FILE = path.join(__dirname, ".contract-secret");
const FONT_PATH = path.join(__dirname, "assets/fonts/NotoSansKR-Variable.ttf");

// 봉인 비밀키 — 앵커/관리자 토큰과 동일한 로딩 규칙 (환경변수 우선, dev는 파일 자동 생성)
function loadSecret() {
  if (process.env.GUARDNOTE_CONTRACT_SECRET) return process.env.GUARDNOTE_CONTRACT_SECRET;
  try {
    return fs.readFileSync(SECRET_FILE, "utf8").trim();
  } catch {
    const s = generateSecret();
    try { fs.writeFileSync(SECRET_FILE, s, { encoding: "utf8", mode: 0o600 }); } catch { /* 읽기전용 FS면 메모리에만 */ }
    return s;
  }
}
const CONTRACT_SECRET = loadSecret();

export const CONTRACT_VERSION = "1.0";
const VENDOR = { name: "㈜바틀 (GuardNote 운영사)", contact: "dev@bottlecorp.kr" };

/* ───────────────────────── 계약서 템플릿 ───────────────────────── */
// {{tenant}} 자리에 고객사 표시 이름이 들어간다. doc_hash는 이 치환이 끝난 "체결 시점 원문" 기준.
const TEMPLATES = {
  service: {
    kind: "service",
    title: "가드노트(GuardNote) 서비스 이용계약서",
    body: `가드노트(GuardNote) 서비스 이용계약서 (v{{version}})

{{vendor}}(이하 "회사")와 {{tenant}}(이하 "고객사")는 개인정보 안전조치 상시 증적 서비스
"가드노트"(이하 "서비스")의 이용에 관하여 다음과 같이 계약을 체결한다.

제1조 (목적)
본 계약은 회사가 제공하는 서비스의 이용 조건과 절차, 회사와 고객사의 권리·의무 및
책임 사항을 정함을 목적으로 한다.

제2조 (서비스의 내용)
① 회사는 고객사에게 다음 기능을 제공한다.
  1. 개인정보 안전성 확보조치 이행 활동의 위변조 방지(SHA-256 해시체인) 봉인 기록
  2. 원장 무결성 검증 및 검증 결과 리포트(CSV·PDF) 생성
  3. 구독 플랜에 따른 자동 무결성 모니터링, 외부 타임스탬프 앵커링
② 서비스는 침입 차단(방화벽·백신 등) 도구가 아니며, 회사는 고객사의 개인정보 유출
사고 자체를 방지할 의무를 부담하지 않는다. 서비스의 목적은 이행 증적의 무결성 보존이다.

제3조 (이용요금 및 결제)
① 이용요금은 고객사가 선택한 구독 플랜의 월 요금(부가가치세 포함)으로 하며, 등록된
결제수단으로 매월 자동 청구된다.
② 청구 실패 시 회사는 3회까지 재시도하며, 최종 실패 시 유료 기능이 제한되고 플랜이
무료 플랜으로 전환될 수 있다. 이미 봉인된 증적 원장은 전환 후에도 삭제되지 않는다.
③ 고객사는 언제든지 해지할 수 있으며, 해지 시 이미 결제된 이용기간 종료일까지 서비스가
유지된다. 일할 환불은 제공하지 않는다.

제4조 (증적 데이터의 소유와 보존)
① 고객사가 서비스에 기록한 증적 데이터의 소유권은 고객사에 있다.
② 회사는 증적 원장의 무결성 보존을 위해 수정·삭제 기능을 제공하지 않으며, 이는
서비스의 본질적 기능으로서 고객사는 이에 동의한다.
③ 계약 종료 시 고객사는 종료일로부터 30일 이내에 전체 원장을 내보내기(CSV·PDF)로
회수할 수 있으며, 그 이후 회사는 데이터를 파기할 수 있다.

제5조 (회사의 의무)
① 회사는 연 99.5% 이상의 서비스 가용성을 목표로 서비스를 운영한다.
② 회사는 증적 원장의 위변조가 감지된 경우 지체 없이 고객사에 통지한다.
③ 회사는 고객사의 사전 동의 없이 증적 데이터를 제3자에게 제공하지 않는다.
단, 법령에 따른 수사기관·법원의 적법한 요구가 있는 경우는 예외로 하며 이 경우
지체 없이 고객사에 그 사실을 통지한다.

제6조 (고객사의 의무)
① 고객사는 API 키를 안전하게 관리하며, 유출 의심 시 즉시 재발급을 요청한다.
② 고객사는 증적 기록(활동 내용 필드)에 정보주체의 실제 개인정보를 포함하지 않는다.
증적에는 "누가, 언제, 어떤 조치를 했다"는 메타데이터만 기록되어야 한다.

제7조 (책임의 제한)
① 회사의 손해배상 책임은 고의 또는 중대한 과실이 없는 한 최근 12개월간 고객사가
실제 지급한 이용요금 총액을 한도로 한다.
② 회사는 증적 기록의 "내용의 진실성"을 보증하지 않는다. 회사가 보증하는 것은 기록이
봉인된 이후 위변조되지 않았다는 "무결성"이다.

제8조 (계약기간 및 해지)
① 본 계약은 체결일부터 효력이 발생하며, 구독이 유지되는 동안 존속한다.
② 일방이 본 계약을 중대하게 위반하고 14일 이내에 시정하지 않는 경우 상대방은
계약을 해지할 수 있다.

제9조 (분쟁 해결)
본 계약과 관련한 분쟁은 대한민국 법을 준거법으로 하며, 민사소송법상의 관할법원에
제소한다.

본 계약의 체결은 전자문서 및 전자거래 기본법에 따른 전자문서로 하며, 고객사 서명권자의
전자 동의(성명·직책·이메일 입력 및 동의 표시)와 회사의 봉인 서명으로 성립한다.`,
  },
  dpa: {
    kind: "dpa",
    title: "개인정보 처리위탁 계약서",
    body: `개인정보 처리위탁 계약서 (v{{version}})

{{tenant}}(이하 "위탁자")와 {{vendor}}(이하 "수탁자")는 개인정보보호법 제26조에 따라
개인정보 처리업무의 위탁에 관하여 다음과 같이 계약을 체결한다.

제1조 (위탁업무의 목적 및 범위)
위탁자는 수탁자에게 다음 업무를 위탁한다.
  1. 개인정보 안전조치 이행 증적의 수집·봉인·보관 (증적 메타데이터에 한함)
  2. 증적 원장의 무결성 검증 및 리포트 생성
※ 위탁 대상은 담당자 성명 등 증적 기록상의 최소한의 개인정보에 한하며, 위탁자는
정보주체의 개인정보 원본을 수탁자 시스템에 저장해서는 안 된다.

제2조 (재위탁 제한)
수탁자는 위탁자의 사전 서면(전자문서 포함) 동의 없이 위탁받은 업무를 제3자에게
재위탁하지 않는다. 클라우드 인프라(호스팅) 이용 현황은 위탁자에게 고지한다.

제3조 (개인정보의 안전성 확보조치)
수탁자는 개인정보보호법 제29조 및 「개인정보의 안전성 확보조치 기준」에 따라
접근 권한 관리, 접근 통제, 암호화, 접속기록 보관, 악성프로그램 방지 등의 조치를
이행한다. API 키는 해시로만 저장하고, 빌링키 등 민감 정보는 암호화하여 저장한다.

제4조 (목적 외 이용·제공 금지)
수탁자는 위탁받은 개인정보를 위탁업무 수행 목적 외로 이용하거나 제3자에게
제공하지 않는다.

제5조 (관리·감독 및 교육)
① 위탁자는 수탁자의 개인정보 처리 현황을 연 1회 이상 점검할 수 있으며, 수탁자는
이에 성실히 협조한다.
② 수탁자는 개인정보를 처리하는 직원에게 연 1회 이상 개인정보보호 교육을 실시한다.

제6조 (개인정보의 파기)
수탁자는 위탁업무가 종료되거나 계약이 해지된 경우, 위탁자의 데이터 회수 기간(30일)
경과 후 지체 없이 보유 중인 개인정보를 복구 불가능한 방법으로 파기하고 그 결과를
위탁자에게 통지한다.

제7조 (유출 통지)
수탁자는 개인정보 유출 사고를 인지한 경우 지체 없이(늦어도 24시간 이내) 위탁자에게
통지하고, 피해 최소화를 위한 조치를 즉시 수행한다.

제8조 (손해배상)
수탁자가 본 계약을 위반하여 위탁자 또는 정보주체에게 손해가 발생한 경우 수탁자는
그 손해를 배상한다. 수탁자의 책임 범위는 서비스 이용계약서 제7조를 따르되, 본 조의
개인정보 유출로 인한 손해에는 해당 한도를 적용하지 않는다.

본 계약의 체결은 전자문서로 하며, 위탁자 서명권자의 전자 동의와 수탁자의 봉인 서명으로
성립한다.`,
  },
};

export const CONTRACT_KINDS = Object.keys(TEMPLATES);

// 체결 시점 원문 렌더링 — doc_hash는 항상 이 결과물 기준
export function renderContract(kind, tenantName) {
  const t = TEMPLATES[kind];
  if (!t) throw new Error(`알 수 없는 계약 종류: ${kind}`);
  const body = t.body
    .replaceAll("{{tenant}}", tenantName)
    .replaceAll("{{vendor}}", VENDOR.name)
    .replaceAll("{{version}}", CONTRACT_VERSION);
  return { kind, title: t.title, version: CONTRACT_VERSION, body };
}

function sealMessage(c) {
  return `${c.tenant_id}|${c.kind}|${c.version}|${c.doc_hash}|${c.signer_name}|${c.signer_email}|${c.signed_at}`;
}

// 계약 체결 — 같은 (테넌트, 종류, 버전)은 1회만 체결 가능. 이미 체결됐으면 기존 기록 반환.
export function signContract(tenant, kind, { signerName, signerTitle, signerEmail }, ip) {
  if (!TEMPLATES[kind]) throw new Error(`알 수 없는 계약 종류: ${kind}`);
  if (!signerName?.trim() || !signerTitle?.trim() || !signerEmail?.trim()) {
    throw new Error("서명자 성명·직책·이메일은 필수입니다.");
  }
  const existing = findContract(tenant.id, kind, CONTRACT_VERSION);
  if (existing) return { contract: existing, alreadySigned: true };

  const rendered = renderContract(kind, tenant.name);
  const record = {
    tenant_id: tenant.id,
    kind,
    version: CONTRACT_VERSION,
    doc_hash: sha256(rendered.body),
    signer_name: signerName.trim(),
    signer_title: signerTitle.trim(),
    signer_email: signerEmail.trim(),
    signed_ip: ip || null,
    signed_at: new Date().toISOString(),
  };
  record.seal = hmacSha256(CONTRACT_SECRET, sealMessage(record));
  return { contract: insertContract(record), alreadySigned: false };
}

// 체결 기록 검증 — 봉인(seal) 유효성 + 현재 템플릿 원문과 체결 시점 해시 일치 여부
export function verifyContract(tenant, c) {
  const sealValid = hmacSha256(CONTRACT_SECRET, sealMessage(c)) === c.seal;
  const rendered = renderContract(c.kind, tenant.name);
  const docMatches = sha256(rendered.body) === c.doc_hash;
  return { sealValid, docMatches };
}

// 테넌트의 계약 현황 요약 — 결제 게이트(둘 다 체결돼야 결제 가능)와 프론트 표시에 쓴다
export function contractStatus(tenant) {
  const signed = listContracts(tenant.id);
  return CONTRACT_KINDS.map((kind) => {
    const c = signed.filter((s) => s.kind === kind && s.version === CONTRACT_VERSION).at(-1);
    return {
      kind,
      title: TEMPLATES[kind].title,
      version: CONTRACT_VERSION,
      signed: !!c,
      signedAt: c?.signed_at || null,
      signerName: c?.signer_name || null,
      valid: c ? verifyContract(tenant, c) : null,
    };
  });
}

export function allContractsSigned(tenant) {
  return contractStatus(tenant).every((c) => c.signed);
}

/* ───────────────────────── 체결본 PDF ───────────────────────── */
const MARGIN = 50;
const PAGE_W = 595.28; // A4 pt
const CONTENT_W = PAGE_W - MARGIN * 2;
const INK = "#0E1621";
const SUB = "#4A5562";
const MUT = "#7A8593";
const LINE = "#D9D2C0";
const GREEN = "#2F7D55";
const RED = "#A8412B";

function shortDate(iso) {
  return new Date(iso).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

// 체결된 계약의 증빙 PDF. 원문 전문 + 전자서명 정보 + 해시/봉인값을 담는다.
export function buildContractPdf({ tenant, contract }) {
  const rendered = renderContract(contract.kind, tenant.name);
  const { sealValid, docMatches } = verifyContract(tenant, contract);

  const doc = new PDFDocument({ size: "A4", margin: MARGIN });
  doc.registerFont("Noto", FONT_PATH);
  doc.font("Noto");

  // 표지 헤더
  doc.rect(MARGIN, MARGIN, 26, 26).fill("#C7A14A");
  doc.fillColor(INK).fontSize(12).text("G", MARGIN + 8, MARGIN + 6);
  doc.fillColor(SUB).fontSize(10).text("GuardNote · 전자 계약 체결본", MARGIN + 36, MARGIN + 2);
  doc.fillColor(MUT).fontSize(8).text(`문서 버전 v${contract.version} · 생성 ${shortDate(new Date().toISOString())}`, MARGIN + 36, MARGIN + 16);

  doc.fillColor(INK).fontSize(18).text(rendered.title, MARGIN, MARGIN + 52, { width: CONTENT_W });

  // 체결 요약 박스
  const boxY = doc.y + 12;
  const ok = sealValid && docMatches;
  doc.roundedRect(MARGIN, boxY, CONTENT_W, 96, 6).fillAndStroke(ok ? "#E7F1EA" : "#F4E4DE", ok ? "#CFE3D8" : "#E7CCC2");
  doc.fillColor(ok ? GREEN : RED).fontSize(11)
    .text(ok ? "✓ 체결 기록 검증 완료 — 봉인 서명 유효 · 체결 시점 원문과 일치"
             : "⚠ 체결 기록 검증 실패 — 봉인 또는 원문 불일치", MARGIN + 14, boxY + 12);
  doc.fillColor(SUB).fontSize(9)
    .text(`서명자: ${contract.signer_name} (${contract.signer_title}) · ${contract.signer_email}`, MARGIN + 14, boxY + 34)
    .text(`체결 시각: ${shortDate(contract.signed_at)}${contract.signed_ip ? ` · IP ${contract.signed_ip}` : ""}`, MARGIN + 14, boxY + 50)
    .text(`원문 SHA-256: ${contract.doc_hash}`, MARGIN + 14, boxY + 66, { width: CONTENT_W - 28 });

  doc.y = boxY + 110;
  doc.fillColor(MUT).fontSize(8).text(
    `봉인 서명(HMAC-SHA256): ${contract.seal} — 봉인 비밀키는 데이터베이스 외부에서 관리되어, ` +
    "DB 기록만 수정해서는 유효한 체결 기록을 만들 수 없습니다.",
    MARGIN, doc.y, { width: CONTENT_W, lineGap: 2 }
  );

  // 계약 원문 전문
  doc.moveDown(1);
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_W, doc.y).strokeColor(LINE).stroke();
  doc.moveDown(0.8);
  doc.fillColor(INK).fontSize(9.5).text(rendered.body, MARGIN, doc.y, { width: CONTENT_W, lineGap: 3.5 });

  // 서명란
  doc.moveDown(2);
  const sigY = doc.y;
  doc.fillColor(SUB).fontSize(10);
  doc.text(`고객사(위탁자): ${tenant.name}`, MARGIN, sigY);
  doc.text(`서명권자: ${contract.signer_name} (${contract.signer_title})  [전자서명 · ${shortDate(contract.signed_at)}]`, MARGIN, sigY + 18);
  doc.text(`운영사(수탁자): ${VENDOR.name}  [봉인 서명 · HMAC-SHA256]`, MARGIN, sigY + 36);

  return doc;
}
