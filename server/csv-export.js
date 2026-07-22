// CSV 인코딩 — RFC 4180 최소 구현. BOM을 붙여 Windows 엑셀에서 한글 인코딩이 깨지지 않게 한다.
function csvCell(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function entriesToCsv(entries, catName) {
  const header = ["번호", "일시", "카테고리", "담당자", "기록자(인증)", "활동내용", "출처", "직전해시", "봉인해시"];
  const lines = [header.map(csvCell).join(",")];
  for (const e of entries) {
    lines.push(
      [e.seq, e.ts, catName(e.cat_key), e.actor, e.recorded_by || "", e.action, e.source, e.prev_hash, e.hash]
        .map(csvCell)
        .join(",")
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
