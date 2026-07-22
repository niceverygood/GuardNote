// 증거 패키지 PDF 생성 — 제출 가능한 형태의 증적 리포트.
//
// 중요한 설계 원칙: 무결성 검증(2페이지)은 필터와 무관하게 항상 "전체 원장"을 기준으로
// 한다. 필터링은 어디까지나 "발췌 목록"에만 적용되고, 그 발췌가 어떤 전체 원장에서
// 나왔는지(총 블록 수·검증 결과)를 함께 명시해 신뢰성을 보증한다.
import PDFDocument from "pdfkit";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_PATH = path.join(__dirname, "assets/fonts/NotoSansKR-Variable.ttf");

const INK = "#0E1621";
const BRASS = "#A9852E";
const BRASS2 = "#C7A14A";
const SUB = "#4A5562";
const MUT = "#7A8593";
const LINE = "#D9D2C0";
const GREEN = "#2F7D55";
const RED = "#A8412B";

const MARGIN = 50;
const PAGE_W = 595.28; // A4 pt
const CONTENT_W = PAGE_W - MARGIN * 2;

function fmtHash(h) {
  if (!h) return "—";
  return `${h.slice(0, 12)}…${h.slice(-8)}`;
}

function shortDate(iso) {
  return new Date(iso).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

// 마진 경계(page.height - MARGIN)보다 아래(바깥)에 텍스트를 두면 pdfkit이 "넘쳤다"고
// 판단해 빈 페이지를 자동으로 하나 더 만든다. 반드시 그 경계보다 위(안쪽)에 그려야 한다.
function footer(doc, pageNo) {
  const y = doc.page.height - MARGIN - 20;
  doc.fontSize(8).fillColor(MUT)
    .text("가드노트 · GuardNote — 개인정보 안전조치 증적 패키지", MARGIN, y, { width: CONTENT_W / 2, lineBreak: false });
  doc.fontSize(8).fillColor(MUT)
    .text(String(pageNo), MARGIN, y, { width: CONTENT_W, align: "right", lineBreak: false });
}

/**
 * @param {object} p
 * @param {object} p.tenant - { name, slug }
 * @param {object} p.integrity - verifyChain() 결과 (항상 전체 원장 기준)
 * @param {Array}  p.categories - categoryStats 기반 항목 배열 (고시 제4조~제13조, article 포함)
 * @param {Array}  p.entries - 발췌(필터 적용된) 증적 목록
 * @param {object} p.filters - { from, to, cat_key, actor } 사용자가 건 필터 (없으면 전체)
 * @param {Function} p.catName - cat_key -> 표시이름
 * @returns {PDFDocument} - .pipe(res)로 스트리밍
 */
export function buildEvidencePdf({ tenant, integrity, categories, entries, filters, catName }) {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN });
  doc.registerFont("Noto", FONT_PATH);
  doc.font("Noto");

  // 페이지 번호는 "지금 쓰고 있는 페이지가 끝나 다음 페이지로 넘어가는 바로 그 순간"에만
  // 매긴다 — 나중에 한꺼번에 되돌아가 매기려 하면(switchToPage) pdfkit의 내부 커서 상태와
  // 어긋나 의도치 않은 빈 페이지가 생긴다. 그래서 addPage 대신 이 헬퍼만 쓴다.
  let pageNo = 1;
  const nextPage = () => {
    footer(doc, pageNo);
    doc.addPage();
    pageNo += 1;
  };
  const ensureSpace = (needed, onNewPage) => {
    // footer가 하단에서 20pt 위에 그려지므로, 본문은 그보다 더 위에서 끊어야 겹치지 않는다.
    if (doc.y + needed > doc.page.height - MARGIN - 30) {
      nextPage();
      if (onNewPage) onNewPage();
    }
  };

  const generatedAt = new Date();
  const hasFilter = !!(filters?.from || filters?.to || filters?.cat_key || filters?.actor);

  /* ── 표지 ── */
  doc.rect(MARGIN, 90, 34, 34).fill(BRASS2);
  doc.fillColor(INK).fontSize(16).text("G", MARGIN + 11, 99);
  doc.fillColor(SUB).fontSize(11).text("GuardNote · 가드노트", MARGIN + 46, 96);
  doc.fillColor(MUT).fontSize(9).text("개인정보 안전조치 상시 증적 시스템", MARGIN + 46, 113);

  doc.fillColor(INK).fontSize(26).text("개인정보 안전조치 증거 패키지", MARGIN, 170, { width: CONTENT_W });
  doc.fillColor(SUB).fontSize(12).text(`제출 대상: ${tenant.name}`, MARGIN, 215);
  doc.fillColor(MUT).fontSize(10).text(`생성 일시: ${shortDate(generatedAt)}`, MARGIN, 235);
  doc.fillColor(MUT).fontSize(10).text(
    hasFilter
      ? `발췌 조건: ${[
          filters.from || filters.to ? `기간 ${filters.from || "제한없음"} ~ ${filters.to || "제한없음"}` : null,
          filters.cat_key ? `항목 "${catName(filters.cat_key)}"` : null,
          filters.actor ? `담당자 "${filters.actor}" 포함` : null,
        ].filter(Boolean).join(" · ")}`
      : "발췌 조건: 없음 (전체 원장)",
    MARGIN, 251, { width: CONTENT_W }
  );

  const intact = integrity.intact;
  doc.roundedRect(MARGIN, 300, CONTENT_W, 60, 6).fillAndStroke(intact ? "#E7F1EA" : "#F4E4DE", intact ? "#CFE3D8" : "#E7CCC2");
  doc.fillColor(intact ? GREEN : RED).fontSize(13)
    .text(intact ? "✓ 원장 무결성 정상 — 전체 봉인 이후 위변조 없음" : "⚠ 원장 무결성 위반 감지", MARGIN + 16, 316);
  doc.fillColor(intact ? "#3E6B53" : "#8A4030").fontSize(9)
    .text(`SHA-256 해시체인 · 전체 ${integrity.blocks}블록 · 검증시각 ${shortDate(integrity.verifiedAt)}`, MARGIN + 16, 336);

  doc.fillColor(MUT).fontSize(9).text(
    "본 문서는 가드노트가 자동 생성한 제출용 자료입니다. 개인정보보호법상 손해배상 책임에서 " +
    "사업자의 “고의·과실 없음” 입증을 위해, 안전성 확보조치 이행 증적을 SHA-256 해시체인으로 " +
    "봉인·보관한 원장을 근거로 합니다.",
    MARGIN, 400, { width: CONTENT_W, lineGap: 3 }
  );

  /* ── 무결성 검증서 (항상 전체 원장 기준) ── */
  nextPage();
  doc.fillColor(INK).fontSize(18).text("무결성 검증서", MARGIN, MARGIN);
  doc.fillColor(MUT).fontSize(9).text("Certificate of Chain Integrity — 이 페이지는 발췌 조건과 무관하게 항상 전체 원장을 기준으로 합니다.", MARGIN, MARGIN + 26, { width: CONTENT_W });

  const anchor = integrity.anchor;
  const anchorText = !anchor || !anchor.anchored
    ? "미앵커링"
    : anchor.ok
    ? `정상 — 블록 #${String(anchor.seq).padStart(2, "0")} 기준 ${shortDate(anchor.anchoredAt)} 박제${anchor.external ? " (외부 노터리)" : " (로컬 서명)"}`
    : anchor.truncated
    ? `불일치 감지 — 앵커 이후 최근 기록이 삭제된 절단이 감지됨`
    : `불일치 감지 — 앵커 시점(#${String(anchor.seq).padStart(2, "0")}) 이후 과거 기록이 변조되었을 수 있음`;

  let y = MARGIN + 60;
  const rows1 = [
    ["대상 테넌트", `${tenant.name} (${tenant.slug})`],
    ["원장 전체 블록 수", `${integrity.blocks} 블록`],
    ["무결성 상태", intact ? "정상 (전체 일치)" : `위반 (블록 #${String(integrity.firstBrokenSeq ?? "?").padStart(2, "0")}부터 불일치)`],
    ["원장 절단(꼬리 삭제) 여부", integrity.truncated ? "감지됨 — 최근 봉인 기록 일부가 삭제된 것으로 보임" : "없음"],
    ["외부 타임스탬프 앵커", anchorText],
    ["검증 알고리즘", "SHA-256( 활동내용 + 직전 블록 해시 ), 제네시스(0…0)부터 순차 재계산"],
    ["검증 시각", shortDate(integrity.verifiedAt)],
  ];
  for (const [k, v] of rows1) {
    doc.fillColor(SUB).fontSize(10).text(k, MARGIN, y, { width: 150 });
    doc.fillColor(INK).fontSize(10).text(v, MARGIN + 160, y, { width: CONTENT_W - 160 });
    y += Math.max(20, doc.heightOfString(v, { width: CONTENT_W - 160 }) + 8);
  }

  y += 10;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).strokeColor(LINE).stroke();
  y += 16;
  doc.fillColor(SUB).fontSize(10).text(
    "검증 방법: 모든 안전조치 활동은 기록 즉시 직전 기록의 해시와 연결되어 봉인됩니다(해시 체인). " +
    "한 건이라도 사후에 고치면 그 지점부터 모든 연결이 끊어져 조작 사실이 드러납니다. 또한 가장 " +
    "최근 기록을 통째로 삭제하는 시도(꼬리 절단)도 원장에 별도로 기록된 체인 헤드 포인터와 대조해 탐지합니다.",
    MARGIN, y, { width: CONTENT_W, lineGap: 3 }
  );

  /* ── 안전성 확보조치 항목 현황 (고시 제4조~제13조) ── */
  nextPage();
  doc.fillColor(INK).fontSize(18).text(`안전성 확보조치 ${categories.length}개 항목 현황`, MARGIN, MARGIN);
  doc.fillColor(MUT).fontSize(9).text("개인정보의 안전성 확보조치 기준 (개인정보보호위원회 고시 제2025-9호, '25.10.31. 일부개정) 제4조~제13조", MARGIN, MARGIN + 24);

  y = MARGIN + 55;
  const colX = [MARGIN, MARGIN + 30, MARGIN + 290, MARGIN + 360, MARGIN + 440];
  const headers = ["#", "항목명", "증적건수", "최근일자", "상태"];
  doc.fontSize(9).fillColor(MUT);
  headers.forEach((h, i) => doc.text(h, colX[i], y, { width: (colX[i + 1] || MARGIN + CONTENT_W) - colX[i] }));
  y += 16;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).strokeColor(LINE).stroke();
  y += 8;

  categories.forEach((c, i) => {
    const statusLabel = c.status === "ok" ? "이행" : c.status === "warn" ? "점검 필요" : "증적 없음";
    const statusColor = c.status === "ok" ? GREEN : c.status === "warn" ? BRASS : RED;
    doc.fontSize(9).fillColor(INK);
    doc.text(String(i + 1).padStart(2, "0"), colX[0], y, { width: colX[1] - colX[0] });
    doc.text(c.article ? `${c.name} (${c.article})` : c.name, colX[1], y, { width: colX[2] - colX[1] });
    doc.text(`${c.items || 0}건`, colX[2], y, { width: colX[3] - colX[2] });
    doc.text(c.last ? c.last.slice(0, 10) : "—", colX[3], y, { width: colX[4] - colX[3] });
    doc.fillColor(statusColor).text(statusLabel, colX[4], y, { width: MARGIN + CONTENT_W - colX[4] });
    y += 20;
  });

  /* ── 발췌 증적 목록 ── */
  nextPage();
  doc.fillColor(INK).fontSize(18).text("발췌 증적 목록", MARGIN, MARGIN);
  doc.fillColor(MUT).fontSize(9).text(
    hasFilter
      ? `필터 적용됨 · 아래 ${entries.length}건은 전체 ${integrity.blocks}블록 원장에서 조건에 맞는 기록만 발췌한 것입니다.`
      : `전체 ${entries.length}건 (원장 전체)`,
    MARGIN, MARGIN + 24, { width: CONTENT_W }
  );

  // #, 일시, 항목, 담당자, 활동내용(가장 넓게), 봉인해시 순. 합이 CONTENT_W를 넘지 않게.
  const colX2 = [MARGIN, MARGIN + 26, MARGIN + 106, MARGIN + 186, MARGIN + 236, MARGIN + 401];
  const headers2 = ["#", "일시", "항목", "담당자", "활동내용", "봉인해시"];
  const drawTableHeader = () => {
    const headerY = doc.y; // doc.y를 컬럼마다 다시 읽으면 이전 컬럼이 미뤄놓은 값이 섞여 계단식으로 밀린다 — 한 번만 고정해서 쓴다.
    doc.fontSize(9).fillColor(MUT);
    headers2.forEach((h, i) => doc.text(h, colX2[i], headerY, { width: (colX2[i + 1] || MARGIN + CONTENT_W) - colX2[i] }));
    doc.y = headerY + 14;
    doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_W, doc.y).strokeColor(LINE).stroke();
    doc.y += 8;
  };
  doc.moveDown(1.2);
  drawTableHeader();

  if (entries.length === 0) {
    doc.fontSize(10).fillColor(MUT).text("조건에 맞는 증적이 없습니다.", MARGIN, doc.y);
  }

  for (const e of entries) {
    // 실제로 몇 줄이 필요할지 미리 정확히 알 수 없으니, 어림값으로 페이지가 넘어가야 하는지만 먼저 판단한다.
    const estH = doc.heightOfString(e.action, { width: colX2[5] - colX2[4] - 8, fontSize: 9 });
    ensureSpace(estH + 18, () => { doc.moveDown(0.2); drawTableHeader(); });

    const rowY = doc.y;
    doc.fontSize(9).fillColor(INK);
    doc.text(String(e.seq).padStart(2, "0"), colX2[0], rowY, { width: colX2[1] - colX2[0] });
    doc.text(e.ts, colX2[1], rowY, { width: colX2[2] - colX2[1] });
    doc.text(catName(e.cat_key), colX2[2], rowY, { width: colX2[3] - colX2[2] });
    doc.text(e.actor, colX2[3], rowY, { width: colX2[4] - colX2[3] });
    // 활동내용을 마지막에 그려서, 그 결과로 갱신되는 doc.y(실제 렌더된 높이)를 다음 행 위치의
    // 근거로 삼는다 — heightOfString의 사전 예측치가 아니라 실제 렌더 결과를 신뢰한다.
    doc.text(e.action, colX2[4], rowY, { width: colX2[5] - colX2[4] - 8 });
    const actionBottom = doc.y;
    doc.fontSize(8).fillColor(MUT).text(fmtHash(e.hash), colX2[5], rowY, { width: MARGIN + CONTENT_W - colX2[5] });
    doc.y = Math.max(actionBottom, rowY + 14) + 8;
  }

  footer(doc, pageNo); // 마지막 페이지는 다음 addPage가 없으니 여기서 직접 마무리

  return doc;
}
