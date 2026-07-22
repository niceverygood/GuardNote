import JSZip from "jszip";

const MAX_FILE_BYTES = 6 * 1024 * 1024;
const AI_TIMEOUT_MS = 75_000;

const bytesToBase64 = (bytes) => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

async function docxToText(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("DOCX 본문을 찾지 못했습니다.");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const paragraphs = Array.from(doc.getElementsByTagNameNS("*", "p"));
  const text = paragraphs.map((paragraph) => Array.from(paragraph.getElementsByTagNameNS("*", "t"))
    .map((node) => node.textContent || "").join("")).filter(Boolean).join("\n");
  if (!text.trim()) throw new Error("DOCX에서 분석할 텍스트를 찾지 못했습니다.");
  return text;
}

export async function fileToAiDocument(file, { allowImage = false } = {}) {
  if (!(file instanceof File)) throw new Error("실제 파일을 선택해주세요.");
  if (!file.size) throw new Error("비어 있는 파일은 분석할 수 없습니다.");
  if (file.size > MAX_FILE_BYTES) throw new Error("파일은 최대 6MB까지 분석할 수 있습니다.");

  const name = file.name || "첨부 문서";
  const extension = name.split(".").pop()?.toLowerCase();
  const mediaType = (file.type || "").toLowerCase();
  if (extension === "docx") return { kind: "text", name, text: await docxToText(file) };
  if (extension === "txt" || mediaType.startsWith("text/")) {
    const text = await file.text();
    if (!text.trim()) throw new Error("문서에서 분석할 텍스트를 찾지 못했습니다.");
    return { kind: "text", name, text };
  }
  if (extension === "pdf" || mediaType === "application/pdf") {
    return { kind: "base64", name, mediaType: "application/pdf", data: bytesToBase64(new Uint8Array(await file.arrayBuffer())) };
  }
  if (allowImage && ["image/png", "image/jpeg", "image/webp"].includes(mediaType)) {
    return { kind: "base64", name, mediaType, data: bytesToBase64(new Uint8Array(await file.arrayBuffer())) };
  }
  throw new Error(allowImage
    ? "PDF, DOCX, TXT, PNG, JPG, WEBP 파일을 선택해주세요."
    : "PDF, DOCX 또는 TXT 파일을 선택해주세요.");
}

export async function runAi(task, payload) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const response = await fetch(`/api/ai/${task}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "AI 요청을 처리하지 못했습니다.");
    return body;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("AI 분석 시간이 초과되었습니다. 문서 크기를 줄여 다시 시도해주세요.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function makeTextFile(name, text) {
  return new File([text], name, { type: "text/plain" });
}
