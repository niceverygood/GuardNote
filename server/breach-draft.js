// 유출 대응 워크플로우 — 단계별 "법정 양식 초안" PDF 생성.
//
// 실제 제출 문서가 아니라, 무엇을 채워야 하는지 알려주는 골격(작성 보조 초안)이다.
// 최종 제출 전 법률 검토가 필요하다는 문구를 항상 포함한다.
import PDFDocument from "pdfkit";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_PATH = path.join(__dirname, "assets/fonts/NotoSansKR-Variable.ttf");

const INK = "#0E1621";
const BRASS2 = "#C7A14A";
const SUB = "#4A5562";
const MUT = "#7A8593";
const LINE = "#D9D2C0";

const MARGIN = 50;
const PAGE_W = 595.28; // A4 pt
const CONTENT_W = PAGE_W - MARGIN * 2;

const TEMPLATES = {
  scope: {
    title: "유출 범위·항목 확정 보고서 (양식)",
    fields: [
      "유출 인지 일시", "유출 원인(추정)", "영향받은 정보주체 수(명)",
      "유출 항목", "고유식별정보 포함 여부", "1차 확인 담당자",
    ],
    note: "실제 유출 규모·항목 확정에는 로그 분석·포렌식 결과가 필요합니다. 본 양식은 작성 보조 초안이며 법률자문을 대체하지 않습니다.",
  },
  notify: {
    title: "정보주체 통지문 (양식)",
    fields: [
      "통지 대상", "유출 항목", "유출 시점", "유출 경위",
      "피해 최소화 대응 조치", "정보주체가 취할 수 있는 조치", "문의처(담당부서·연락처)",
    ],
    note: "개인정보보호법 제34조에 따라 지체 없이 통지해야 합니다. 통지 문구는 사안에 맞게 법률 검토 후 확정하세요.",
  },
  pipc: {
    title: "개인정보보호위원회 유출 신고서 (양식)",
    fields: [
      "신고인(개인정보처리자) 정보", "유출 인지 일시", "유출 규모(명)",
      "유출 항목", "경위 및 원인", "피해 확산 방지 조치", "정보주체 통지 현황",
    ],
    note: "1천 명 이상 등 요건 충족 시 72시간 이내 신고 대상입니다. 정확한 요건·기한은 사안별로 다르니 법률자문을 받으세요.",
  },
  kisa: {
    title: "KISA(KrCERT) 침해사고 신고서 (양식)",
    fields: [
      "신고 기관/담당자", "인지 일시", "침해 유형", "피해 시스템",
      "현재 대응 현황", "기술지원 요청 사항",
    ],
    note: "침해사고 신고는 정보통신망법에 근거합니다. 세부 절차는 KISA 118 상담센터를 통해 확인하세요.",
  },
};

export const BREACH_DRAFT_KEYS = Object.keys(TEMPLATES);

/**
 * @param {object} p
 * @param {object} p.tenant - { name, slug }
 * @param {string} p.stepKey - scope | notify | pipc | kisa
 * @param {string|null} p.startedAt - 사고 인지(대응 개시) 시각 ISO
 * @param {object|null} p.aiFields - { 항목명: 초안문구 } — 있으면 빈 밑줄 대신 문구를 채워 넣는다
 * @param {string|null} p.aiMode - "live" | "mock" — aiFields가 있을 때 상단에 출처를 표시
 * @returns {PDFDocument} - .pipe(res)로 스트리밍
 */
export function buildBreachDraftPdf({ tenant, stepKey, startedAt, aiFields, aiMode }) {
  const tpl = TEMPLATES[stepKey];
  if (!tpl) throw new Error("알 수 없는 단계입니다.");

  const doc = new PDFDocument({ size: "A4", margin: MARGIN });
  doc.registerFont("Noto", FONT_PATH);
  doc.font("Noto");

  const ensureSpace = (needed) => {
    if (doc.y + needed > doc.page.height - MARGIN - 30) doc.addPage();
  };

  doc.rect(MARGIN, 50, 28, 28).fill(BRASS2);
  doc.fillColor(INK).fontSize(13).text("G", MARGIN + 9, 57);
  doc.fillColor(MUT).fontSize(9).text("GuardNote · 가드노트 — 유출 대응 워크플로우", MARGIN + 38, 58);

  doc.fillColor(INK).fontSize(19).text(tpl.title, MARGIN, 100, { width: CONTENT_W });
  doc.fillColor(SUB).fontSize(10).text(`대상 테넌트: ${tenant.name}`, MARGIN, 132);
  doc.fillColor(MUT).fontSize(9).text(
    `사고 인지 시각: ${startedAt ? new Date(startedAt).toLocaleString("ko-KR") : "—"}  ·  양식 생성: ${new Date().toLocaleString("ko-KR")}`,
    MARGIN, 148
  );
  if (aiFields) {
    doc.fillColor(BRASS2).fontSize(8.5).text(
      aiMode === "live" ? "[AI] Claude 생성 초안" : "[AI] 초안 예시(모의 모드)",
      MARGIN, 148, { width: CONTENT_W, align: "right" }
    );
  }

  doc.moveTo(MARGIN, 175).lineTo(MARGIN + CONTENT_W, 175).strokeColor(LINE).stroke();

  doc.y = 195;
  const LABEL_W = 150;
  const VALUE_X = MARGIN + 160;
  const VALUE_W = CONTENT_W - 160;
  for (const field of tpl.fields) {
    const value = aiFields?.[field];
    if (value) {
      const h = doc.heightOfString(value, { width: VALUE_W, fontSize: 9.5 });
      ensureSpace(Math.max(h, 14) + 18);
      const rowY = doc.y;
      doc.fillColor(SUB).fontSize(10).text(field, MARGIN, rowY, { width: LABEL_W });
      doc.fillColor(INK).fontSize(9.5).text(value, VALUE_X, rowY, { width: VALUE_W, lineGap: 2 });
      doc.y = Math.max(doc.y, rowY + 14) + 18;
    } else {
      ensureSpace(40);
      const rowY = doc.y;
      doc.fillColor(SUB).fontSize(10).text(field, MARGIN, rowY, { width: LABEL_W });
      doc.moveTo(VALUE_X, rowY + 14).lineTo(MARGIN + CONTENT_W, rowY + 14).strokeColor(LINE).stroke();
      doc.y = rowY + 40;
    }
  }

  ensureSpace(60);
  doc.y += 6;
  doc.fillColor(MUT).fontSize(8.5).text(tpl.note, MARGIN, doc.y, { width: CONTENT_W, lineGap: 3 });

  ensureSpace(30);
  doc.y += 18;
  doc.fillColor(MUT).fontSize(8).text(
    aiFields
      ? "※ 본 문서는 가드노트가 AI로 생성한 작성 보조 초안이며, 실제 제출 문서가 아닙니다. 대괄호([ ])로 표시된 부분을 포함해 사실관계를 반드시 확인하고 최종 제출 전 법률 검토를 받으세요."
      : "※ 본 문서는 가드노트가 생성한 작성 보조 초안이며, 실제 제출 문서가 아닙니다. 최종 제출 전 법률 검토가 필요합니다.",
    MARGIN, doc.y, { width: CONTENT_W, lineGap: 3 }
  );

  return doc;
}
