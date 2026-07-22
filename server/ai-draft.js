// AI 초안 작성 — 유출 대응 양식(정보주체 통지문 등)의 실제 문안을 LLM으로 생성한다.
//
// ANTHROPIC_API_KEY가 없으면 모의 모드로 동작한다 — billing.js의 모의 결제 모드와 같은 설계
// 원칙이다: 키가 없어도 전체 플로우를 시연할 수 있어야 하고, 키를 넣으면 자동으로 실제 Claude
// 호출로 전환된다. 실제 호출이 실패해도(네트워크, 키 오류 등) 시연이 끊기지 않도록 모의 초안으로
// 안전하게 대체한다.
const MODEL = "claude-sonnet-5";

export const FIELD_SETS = {
  scope: [
    "유출 인지 일시", "유출 원인(추정)", "영향받은 정보주체 수(명)",
    "유출 항목", "고유식별정보 포함 여부", "1차 확인 담당자",
  ],
  notify: [
    "통지 대상", "유출 항목", "유출 시점", "유출 경위",
    "피해 최소화 대응 조치", "정보주체가 취할 수 있는 조치", "문의처(담당부서·연락처)",
  ],
  pipc: [
    "신고인(개인정보처리자) 정보", "유출 인지 일시", "유출 규모(명)",
    "유출 항목", "경위 및 원인", "피해 확산 방지 조치", "정보주체 통지 현황",
  ],
  kisa: [
    "신고 기관/담당자", "인지 일시", "침해 유형", "피해 시스템",
    "현재 대응 현황", "기술지원 요청 사항",
  ],
};

const STEP_TITLES = {
  scope: "유출 범위·항목 확정 보고서",
  notify: "정보주체 통지문",
  pipc: "개인정보보호위원회 유출 신고서",
  kisa: "KISA(KrCERT) 침해사고 신고서",
};

export function aiDraftEnabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// 모의 모드 — 실제 API 호출 없이, 실무에서 바로 다듬어 쓸 수 있는 수준의 예시 문안을 반환한다.
function mockDraft(stepKey, ctx) {
  const when = ctx.startedAt ? new Date(ctx.startedAt).toLocaleString("ko-KR") : "[인지 일시를 입력하세요]";
  const who = ctx.tenantName || "[회사명]";
  const MOCKS = {
    scope: {
      "유출 인지 일시": when,
      "유출 원인(추정)": "[내부 조사 중 — 예: 접근권한 관리 미비로 인한 비인가 접근 추정]",
      "영향받은 정보주체 수(명)": "[로그 분석 후 확정 — 잠정 규모 파악 중]",
      "유출 항목": "[예: 이름·이메일·연락처 — 고유식별정보 포함 여부 확인 필요]",
      "고유식별정보 포함 여부": "[확인 중]",
      "1차 확인 담당자": `${who} 개인정보보호 책임자`,
    },
    notify: {
      "통지 대상": "유출된 개인정보에 해당하는 정보주체 전원",
      "유출 항목": "[확정된 유출 항목을 기재하세요]",
      "유출 시점": when,
      "유출 경위": `당사는 ${when}경 이상 징후를 인지하고 즉시 대응 절차에 착수하였습니다. 정확한 유출 경위는 조사 완료 후 갱신하여 안내드리겠습니다.`,
      "피해 최소화 대응 조치": "접근 경로 차단, 관련 계정 비밀번호 재설정 등 필요한 기술적 조치를 취하였으며, 관계 기관에 신고를 진행하고 있습니다.",
      "정보주체가 취할 수 있는 조치": "비밀번호 변경, 명의도용 방지 서비스 이용, 계정 이상 거래 모니터링을 권고드립니다.",
      "문의처(담당부서·연락처)": `${who} 개인정보보호책임자 · [연락처를 입력하세요]`,
    },
    pipc: {
      "신고인(개인정보처리자) 정보": who,
      "유출 인지 일시": when,
      "유출 규모(명)": "[잠정 규모 — 확정 후 갱신]",
      "유출 항목": "[유출 항목을 기재하세요]",
      "경위 및 원인": "[조사 결과에 따라 기재]",
      "피해 확산 방지 조치": "접근 차단, 계정 잠금, 취약점 조치 등 즉시 조치를 완료하였습니다.",
      "정보주체 통지 현황": "개별 통지 절차를 진행 중입니다.",
    },
    kisa: {
      "신고 기관/담당자": `${who} 정보보호 담당자`,
      "인지 일시": when,
      "침해 유형": "[예: 비인가 접근, 악성코드 감염 등 — 조사 결과에 따라 기재]",
      "피해 시스템": "[영향받은 시스템/서비스명]",
      "현재 대응 현황": "격리 조치 및 원인 분석을 진행 중입니다.",
      "기술지원 요청 사항": "포렌식 분석 및 유사 침해 재발 방지 대책에 대한 자문을 요청드립니다.",
    },
  };
  return MOCKS[stepKey];
}

async function realDraft(stepKey, ctx) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const fields = FIELD_SETS[stepKey];

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    tools: [{
      name: "draft_fields",
      description: "문서 각 항목별 초안 문안",
      input_schema: {
        type: "object",
        properties: Object.fromEntries(fields.map((f) => [f, { type: "string" }])),
        required: fields,
      },
    }],
    tool_choice: { type: "tool", name: "draft_fields" },
    messages: [{
      role: "user",
      content:
        `당신은 한국 개인정보보호법 실무에 밝은 사내 컴플라이언스 담당자입니다. ` +
        `"${STEP_TITLES[stepKey]}" 문서의 초안을 작성해주세요.\n\n` +
        `회사명: ${ctx.tenantName}\n` +
        `사고 인지 시각: ${ctx.startedAt ? new Date(ctx.startedAt).toLocaleString("ko-KR") : "미확정"}\n\n` +
        `아래 각 항목에 대해 실무에서 바로 다듬어 쓸 수 있는 정중하고 명확한 문안을 작성하세요. ` +
        `아직 확정되지 않은 사실(정확한 유출 인원수, 구체적 원인 등)은 절대 지어내지 말고 ` +
        `"[확인 후 기재]" 형태의 대괄호 플레이스홀더로 표시하세요. 과장되거나 법적으로 단정적인 표현은 피하세요.\n\n` +
        `항목: ${fields.join(", ")}`,
    }],
  });

  const toolUse = msg.content.find((c) => c.type === "tool_use");
  if (!toolUse) throw new Error("AI 응답에서 초안을 추출하지 못했습니다.");
  return toolUse.input;
}

// { fields, mode: "live"|"mock", error? } 를 반환한다. 실제 호출 실패 시에도 모의 초안으로 대체해
// 시연이 끊기지 않게 한다.
export async function generateBreachDraft(stepKey, ctx) {
  if (!FIELD_SETS[stepKey]) throw new Error("알 수 없는 단계입니다.");
  if (!aiDraftEnabled()) {
    return { fields: mockDraft(stepKey, ctx), mode: "mock" };
  }
  try {
    const fields = await realDraft(stepKey, ctx);
    return { fields, mode: "live" };
  } catch (e) {
    return { fields: mockDraft(stepKey, ctx), mode: "mock", error: e.message };
  }
}
