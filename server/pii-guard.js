// 개인정보(PII) 유입 차단 — 원장에는 "누가 언제 무엇을 했다"는 활동 메타데이터만 담겨야 한다.
//
// 왜 필수인가:
//  1) 원장은 append-only라 한 번 봉인된 개인정보는 삭제·정정이 불가능하다 — 파기 의무와 정면 충돌.
//  2) 원장에 정보주체의 개인정보가 들어오는 순간 가드노트(바틀)도 그 정보의 처리자가 된다.
// 그래서 저장 전에 서버가 대표적인 개인정보 패턴을 탐지해 400으로 거부한다.
//
// 한계(정직하게): 패턴 탐지는 완전하지 않다 — 이름·주소 같은 자유 텍스트 개인정보는 기술적으로
// 구분할 수 없다. 이 모듈은 "명백한 실수(전화번호·주민번호 붙여넣기)"를 막는 안전망이고,
// 계약(처리위탁 계약서)과 화면 안내가 나머지를 보완한다.
//
// 환경변수: GUARDNOTE_PII_GUARD=off 로 비활성화 (기본 켜짐)

const ENABLED = process.env.GUARDNOTE_PII_GUARD !== "off";

// 각 패턴은 [이름, 정규식, 예외판정(선택)] — 예외판정이 true를 돌려주면 통과시킨다.
const PATTERNS = [
  {
    name: "주민등록번호(또는 외국인등록번호)",
    // 950101-1234567 / 9501011234567 — 생년월일 6자리 + 성별코드 1~8
    re: /\b\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[-‐–]?[1-8]\d{6}\b/,
  },
  {
    name: "휴대전화번호",
    re: /\b01[016789][-‐–.\s]?\d{3,4}[-‐–.\s]?\d{4}\b/,
  },
  {
    name: "일반 전화번호",
    re: /\b0(2|[3-6]\d)[-‐–.\s]?\d{3,4}[-‐–.\s]?\d{4}\b/,
  },
  {
    name: "이메일 주소",
    re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  },
  {
    name: "카드번호로 보이는 숫자",
    // 4자리-4자리-4자리-4자리 (구분자 포함) 또는 연속 15~16자리
    re: /\b(?:\d{4}[-‐–.\s]){3}\d{3,4}\b|\b\d{15,16}\b/,
  },
  {
    name: "여권번호로 보이는 값",
    re: /\b[MSRODG]\d{8}\b/,
  },
  {
    name: "운전면허번호로 보이는 값",
    re: /\b\d{2}[-‐–]\d{2}[-‐–]\d{6}[-‐–]\d{2}\b/,
  },
];

// 필드 하나를 검사해 걸린 패턴 이름을 돌려준다 (없으면 null).
export function detectPii(text) {
  if (!ENABLED || typeof text !== "string" || !text) return null;
  for (const p of PATTERNS) {
    if (p.re.test(text)) return p.name;
  }
  return null;
}

// entries/ingest 공통 검사. 문제가 없으면 null, 있으면 사람이 읽을 에러 메시지를 돌려준다.
export function piiViolation({ actor, action }) {
  for (const [field, value] of [["담당자", actor], ["활동 내용", action]]) {
    const hit = detectPii(value);
    if (hit) {
      return (
        `${field}에 ${hit} 패턴이 감지되어 봉인을 거부했습니다. ` +
        `원장에는 개인정보가 아닌 활동 요약만 기록하세요 — 예: "홍길동(010-…) 권한 회수" 대신 "퇴사자 1인 접근권한 회수". ` +
        `원장은 수정·삭제가 불가능해, 개인정보가 봉인되면 파기 의무를 이행할 수 없게 됩니다.`
      );
    }
  }
  return null;
}

export const piiGuardEnabled = ENABLED;
