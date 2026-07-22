import "dotenv/config";
import { runAiTask } from "../server/ai-core.js";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is required");
  process.exit(1);
}

const document = {
  kind: "text",
  name: "sample-consent.txt",
  text: `개인정보 수집·이용 동의서
필수 항목: 이름, 이메일
목적: 회원 가입과 주문 처리
보유기간: 회원 탈퇴 후 30일
마케팅 수신은 선택이며 동의하지 않아도 기본 서비스를 이용할 수 있습니다.
제3자 제공받는 자: 분석 파트너사
제공 목적: 고객 분석
제공 항목: 이메일
보유기간: 목적 달성 시까지`,
};
const config = { apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL };

const tests = [
  ["auto-answer", { document, questions: [
    { id: 27, area: "동의", title: "선택 동의를 필수 동의와 구분하고 있나요?", law: "개인정보 보호법 제22조" },
    { id: 33, area: "제3자 제공", title: "제3자 제공 보유기간을 구체적으로 고지하나요?", law: "개인정보 보호법 제17조" },
  ] }],
  ["document-review", { document, docType: "개인정보 수집·이용 동의서", contexts: ["마케팅 목적으로 이용"] }],
  ["evidence-review", { document: { kind: "text", name: "id-find.txt", text: "아이디 찾기 화면. 이름과 이메일 입력란 및 인증번호 발송 버튼만 있음." }, question: "개인정보 유출·침해사고 대응 절차를 작성하고 있습니까?", declaredAnswer: "예" }],
  ["document-generate", { type: "개인정보 수집·이용 동의서", form: { company: "한빛커머스", purpose: "회원 가입", items: "이름, 이메일", retention: "탈퇴 후 30일", contact: "privacy@example.com" } }],
];
const selectedTasks = new Set(process.argv.slice(2));

for (const [task, payload] of tests) {
  if (selectedTasks.size && !selectedTasks.has(task)) continue;
  const result = await runAiTask(task, payload, config);
  const shape = task === "auto-answer" ? `answers=${result.answers?.length}`
    : task === "document-review" ? `findings=${result.findings?.length},score=${result.score}`
      : task === "evidence-review" ? `match=${result.match},confidence=${result.confidence}`
        : `content=${result.content?.length},clauses=${result.clauses?.length}`;
  console.log(`${task}: ok (${shape}, keys=${Object.keys(result).join("|")}, model=${result.meta?.model})`);
}
