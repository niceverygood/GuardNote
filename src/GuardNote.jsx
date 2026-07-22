import React, { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bell,
  BookOpenCheck,
  Bot,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  Download,
  FileCheck2,
  FileOutput,
  FileSearch,
  FileText,
  FolderCheck,
  GraduationCap,
  History,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Users,
  WandSparkles,
  X,
} from "lucide-react";
import { fileToAiDocument, makeTextFile, runAi } from "./ai-client.js";

const cx = (...values) => values.filter(Boolean).join(" ");

const NAV = [
  { id: "dashboard", label: "운영 대시보드", icon: LayoutDashboard },
  { id: "audit", label: "개인정보 자가점검", icon: ClipboardCheck, badge: "600" },
  { id: "vendors", label: "수탁자 점검", icon: Users, badge: "AI" },
  { id: "pbd", label: "PbD 프로젝트", icon: BriefcaseBusiness },
  { id: "smart", label: "Smart Docs", icon: Sparkles, badge: "4" },
  { id: "history", label: "AI 검토 내역", icon: History },
];

const PAGE_META = {
  dashboard: ["운영 대시보드", "개인정보 준수 상태와 AI 검토 업무를 한눈에 확인합니다."],
  audit: ["개인정보 자가점검", "질문에 답하면 위반 가능성과 개선 권고를 즉시 안내합니다."],
  vendors: ["수탁자 점검", "수탁자의 답변·증적·교육 이력을 연결해 관리합니다."],
  pbd: ["PbD 프로젝트", "제품과 서비스의 기획부터 출시까지 개인정보 위험을 점검합니다."],
  smart: ["Smart Docs", "개인정보 문서의 검토·답변·생성을 AI로 자동화합니다."],
  history: ["AI 검토 내역", "자동화 결과와 근거, 담당자의 최종 판단을 추적합니다."],
};

const QUESTIONS = [
  { id: 27, area: "동의", title: "동의서의 선택 동의 항목을 필수 항목과 구분하고 있나요?", law: "개인정보 보호법 제22조", help: "선택정보에 동의하지 않아도 핵심 서비스를 이용할 수 있음을 명시해야 합니다." },
  { id: 29, area: "동의", title: "동의서에 개인정보 처리 목적과 항목이 명확하게 표시되어 있나요?", law: "개인정보 보호법 제15조", help: "수집 목적, 항목, 보유기간, 거부권 및 불이익을 구체적으로 안내해야 합니다." },
  { id: 33, area: "제3자 제공", title: "제3자 제공받는 자와 제공 목적, 항목, 보유기간을 고지하나요?", law: "개인정보 보호법 제17조", help: "제공받는 자의 명칭뿐 아니라 연락 가능한 정보와 보유기간도 함께 점검하세요." },
  { id: 42, area: "아동", title: "만 14세 미만 아동의 법정대리인 동의 절차가 있나요?", law: "개인정보 보호법 제22조의2", help: "법정대리인의 동의를 확인할 수 있는 별도의 절차와 기록이 필요합니다." },
  { id: 67, area: "제3자 제공", title: "제3자로부터 받은 개인정보의 출처와 이용 목적을 관리하나요?", law: "개인정보 보호법 제20조", help: "정보주체 요구 시 출처, 처리 목적, 처리정지 요구권을 알릴 수 있어야 합니다." },
  { id: 91, area: "국외 이전", title: "국외 이전 국가·시기·방법과 거부 방법을 고지하나요?", law: "개인정보 보호법 제28조의8", help: "이전받는 자, 국가, 일시·방법, 목적, 보유기간 및 거부 절차를 공개하세요." },
];

const VENDOR_SEED = [
  { id: 1, name: "클라우드웨이브", service: "인프라 운영", score: 91, progress: 100, status: "양호", evidence: 20, training: "이수" },
  { id: 2, name: "리서치온", service: "고객 설문", score: 68, progress: 72, status: "보완 필요", evidence: 14, training: "미이수" },
  { id: 3, name: "메시지랩", service: "알림톡 발송", score: 84, progress: 90, status: "검토 중", evidence: 18, training: "이수" },
  { id: 4, name: "페이링크", service: "결제 처리", score: 95, progress: 100, status: "양호", evidence: 22, training: "이수" },
];

const PROJECTS = [
  { id: 1, name: "멤버십 2.0", owner: "커머스팀", stage: "설계 검토", score: 74, open: 5, date: "2026.08.12" },
  { id: 2, name: "추천 AI", owner: "데이터팀", stage: "개선 중", score: 61, open: 9, date: "2026.09.03" },
  { id: 3, name: "파트너 포털", owner: "B2B팀", stage: "출시 승인", score: 93, open: 1, date: "2026.07.30" },
];

const INITIAL_HISTORY = [
  { id: 1, type: "문서 검토", title: "개인정보처리 동의서_v4.docx", result: "위반 3 · 권고 4", score: 72, time: "오늘 15:42", status: "검토 완료" },
  { id: 2, type: "증적 검토", title: "리서치온 · 침해사고 대응절차", result: "답변과 불일치", score: 38, time: "오늘 11:08", status: "보완 요청" },
  { id: 3, type: "자동 답변", title: "마케팅 수신 동의서.docx", result: "22문항 · 근거 명확성 94%", score: 94, time: "어제 18:20", status: "반영 완료" },
];

const SAMPLE_CONSENT = `개인정보 수집·이용 동의서
필수 수집 항목: 이름, 이메일, 연락처
이용 목적: 회원 가입 및 주문 처리
보유기간: 회원 탈퇴 시까지
마케팅 정보 수신 동의는 선택사항이며 동의하지 않아도 기본 서비스를 이용할 수 있습니다.
제3자 제공받는 자: 분석 파트너사
제공 목적: 고객 분석
제공 항목: 이메일
보유기간: 목적 달성 시까지`;

const SAMPLE_EVIDENCE = `화면 제목: 아이디 찾기
입력 항목: 이름, 이메일
버튼: 인증번호 발송
비고: 침해사고 대응 절차, 담당자 역할, 보고 체계, 정보주체 통지 또는 관계기관 신고 절차는 표시되어 있지 않음.`;

function Logo({ compact = false }) {
  return <div className={cx("brand", compact && "brand--compact")} aria-label="GuardNote">
    <span className="brand-mark"><i /><i /><i /></span>
    {!compact && <span><strong>GUARD</strong><b>NOTE</b><small>PRIVACY, MADE OPERABLE</small></span>}
  </div>;
}

function Pill({ tone = "neutral", children }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

function Progress({ value, tone = "orange" }) {
  return <span className="progress" aria-label={`${value}%`}><i className={`progress--${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></span>;
}

function downloadText(filename, content, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Sidebar({ page, onPage, open, onClose }) {
  return <>
    {open && <button className="mobile-scrim" onClick={onClose} aria-label="메뉴 닫기" />}
    <aside className={cx("sidebar", open && "is-open")}>
      <div className="sidebar-head"><Logo /><button className="mobile-only icon-button" onClick={onClose} aria-label="메뉴 닫기"><X size={19} /></button></div>
      <div className="workspace"><span>H</span><div><b>한빛커머스</b><small>Privacy workspace</small></div><ChevronDown size={15} /></div>
      <small className="nav-caption">COMPLIANCE WORKSPACE</small>
      <nav className="main-nav" aria-label="주요 메뉴">
        {NAV.map(({ id, label, icon: Icon, badge }) => <button key={id} onClick={() => { onPage(id); onClose(); }} className={page === id ? "is-active" : ""}>
          <Icon size={18} /><span>{label}</span>{badge && <em>{badge}</em>}
        </button>)}
      </nav>
      <div className="reference-card"><BookOpenCheck size={19} /><div><b>2025.11 기준 적용</b><p>안전성 확보조치 및 최신 법령 기준</p></div><BadgeCheck size={17} /></div>
      <div className="sidebar-foot"><span className="avatar">김</span><div><b>김가드</b><small>개인정보 보호책임자</small></div><ChevronRight size={16} /></div>
    </aside>
  </>;
}

function Topbar({ page, onMenu, onSearch, onNotice }) {
  const [title, sub] = PAGE_META[page];
  return <header className="topbar">
    <button className="mobile-only icon-button" onClick={onMenu} aria-label="메뉴 열기"><Menu size={20} /></button>
    <div className="topbar-title"><h1>{title}</h1><p>{sub}</p></div>
    <label className="global-search"><Search size={16} /><input onChange={e => onSearch(e.target.value)} placeholder="질문, 수탁자, 문서 검색" aria-label="전체 검색" /></label>
    <button className="icon-button has-alert" onClick={onNotice} aria-label="알림 열기"><Bell size={18} /></button>
    <button className="profile-button"><span>김</span><ChevronDown size={14} /></button>
  </header>;
}

function Metric({ label, value, sub, icon: Icon, tone = "orange" }) {
  return <article className="metric-card"><span className={`metric-icon metric-icon--${tone}`}><Icon size={19} /></span><div><small>{label}</small><strong>{value}</strong><p>{sub}</p></div></article>;
}

function Dashboard({ go, history }) {
  return <div className="page dashboard-page">
    <section className="hero-panel">
      <div><Pill tone="good">LIVE · 최신 기준 반영</Pill><h2>법을 외우지 않아도,<br /><em>놓친 위험은 보이게.</em></h2><p>점검 질문, 수탁자 증적, 개인정보 문서를 하나의 흐름으로 연결하고 AI가 근거와 함께 다음 조치를 제안합니다.</p><div className="hero-actions"><button className="primary-button" onClick={() => go("audit")}><ClipboardCheck size={17} /> 자가점검 이어하기</button><button className="ghost-button" onClick={() => go("smart")}><Sparkles size={17} /> AI 문서 검토</button></div></div>
      <div className="hero-score"><span className="score-orbit"><i /><i /><i /><strong>82<small>/100</small></strong></span><div><b>현재 준수 점수</b><p>지난달보다 8점 상승했습니다.</p><span><CheckCircle2 size={14} /> 10개 영역 중 7개 안정</span></div></div>
    </section>
    <section className="metric-grid">
      <Metric label="점검 완료" value="426 / 600" sub="71% · 답변 즉시 판정" icon={ClipboardCheck} />
      <Metric label="수탁자 응답률" value="84%" sub="21개사 중 18개사" icon={Users} tone="green" />
      <Metric label="열린 위험" value="12건" sub="위반 4 · 권고 8" icon={AlertTriangle} tone="red" />
      <Metric label="AI 자동화" value="31건" sub="이번 달 18.4시간 절감" icon={Bot} tone="purple" />
    </section>
    <section className="dashboard-grid">
      <article className="panel action-panel"><div className="section-head"><div><small>ACTION CENTER</small><h3>오늘 먼저 처리할 일</h3></div><button onClick={() => go("history")}>전체 내역 <ArrowRight size={15} /></button></div>
        <button className="action-row" onClick={() => go("vendors")}><span className="action-no">01</span><div><b>리서치온 증적자료 1건 불일치</b><p>답변과 무관한 화면이 제출되었습니다.</p></div><Pill tone="bad">긴급</Pill><ChevronRight size={17} /></button>
        <button className="action-row" onClick={() => go("smart")}><span className="action-no">02</span><div><b>신규 마케팅 동의서 검토 대기</b><p>AI 사전검토 후 법무팀에 전달하세요.</p></div><Pill tone="warn">오늘</Pill><ChevronRight size={17} /></button>
        <button className="action-row" onClick={() => go("pbd")}><span className="action-no">03</span><div><b>추천 AI 프로젝트 설계 위험 9건</b><p>프로파일링과 국외 이전 흐름 확인이 필요합니다.</p></div><Pill>검토</Pill><ChevronRight size={17} /></button>
      </article>
      <article className="panel ai-launcher"><div className="section-head"><div><small>SMART DOCS</small><h3>AI 업무 바로가기</h3></div><Sparkles size={20} /></div>
        <div className="launcher-grid">
          <button onClick={() => go("smart")}><FileSearch size={21} /><b>문서 검토</b><small>위반·권고와 근거</small></button>
          <button onClick={() => go("audit")}><MessageSquareText size={21} /><b>자동 답변</b><small>문서로 질문 응답</small></button>
          <button onClick={() => go("smart")}><FileOutput size={21} /><b>문서 생성</b><small>입력정보로 초안</small></button>
          <button onClick={() => go("vendors")}><FolderCheck size={21} /><b>증적 검토</b><small>답변과 일치 판정</small></button>
        </div>
      </article>
    </section>
    <section className="panel recent-panel"><div className="section-head"><div><small>RECENT AI RUNS</small><h3>최근 AI 검토</h3></div><button onClick={() => go("history")}>검토 내역 보기 <ArrowRight size={15} /></button></div><div className="history-table compact"><div className="table-header"><span>유형</span><span>대상</span><span>결과</span><span>시간</span><span>상태</span></div>{history.slice(0, 3).map(row => <div className="table-row" key={row.id}><span><Pill tone="ai">{row.type}</Pill></span><b>{row.title}</b><span>{row.result}</span><span>{row.time}</span><span><Pill tone={row.status.includes("완료") || row.status.includes("반영") ? "good" : "warn"}>{row.status}</Pill></span></div>)}</div></section>
  </div>;
}

function AnswerButtons({ value, onChange }) {
  return <div className="answer-buttons" role="group" aria-label="답변 선택">
    {[['yes','예'],['no','아니요'],['na','해당 없음']].map(([id, label]) => <button key={id} className={value === id ? "is-selected" : ""} onClick={() => onChange(id)}>{value === id && <Check size={14} />}{label}</button>)}
  </div>;
}

function AutoAnswerModal({ onClose, onApply, notify, addHistory }) {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [summary, setSummary] = useState("");
  const fileRef = useRef(null);
  const generate = async () => {
    if (!file) return notify("분석할 동의서 또는 처리방침을 선택해주세요.");
    setProcessing(true);
    try {
      const out = await runAi("auto-answer", {
        document: await fileToAiDocument(file),
        questions: QUESTIONS.map(({ id, area, title, law }) => ({ id, area, title, law })),
      });
      setResults(out.answers || []);
      setSummary(out.summary || "문서 근거를 점검 문항과 연결했습니다.");
    } catch (error) {
      notify(error.message);
    } finally {
      setProcessing(false);
    }
  };
  const apply = () => {
    onApply(Object.fromEntries(results.map(r => [r.id, r.answer])));
    const average = results.length ? Math.round(results.reduce((sum, row) => sum + Number(row.confidence || 0), 0) / results.length) : 0;
    addHistory({ type: "자동 답변", title: file.name, result: `${results.length}문항 · 근거 명확성 ${average}%`, score: average, status: "반영 완료" });
    notify(`AI 답변 ${results.length}건을 점검표에 반영했습니다.`);
    onClose();
  };
  return <div className="modal-backdrop"><section className="modal modal--wide" role="dialog" aria-modal="true" aria-labelledby="auto-title"><button className="modal-close" onClick={onClose} aria-label="AI 자동답변 닫기"><X size={19} /></button>
    <div className="modal-eyebrow"><WandSparkles size={17} /> AI AUTO ANSWER</div><h2 id="auto-title">문서를 읽고 점검 답변을 채웁니다.</h2><p>동의서나 처리방침에서 근거를 찾아 답변과 근거 명확성을 제안합니다. 적용 전 항목별 근거를 확인할 수 있습니다.</p>
    {!results && <><div className="upload-card" onClick={() => fileRef.current?.click()}><input ref={fileRef} type="file" accept=".pdf,.docx,.txt" onChange={e => setFile(e.target.files?.[0] || null)} /><span><UploadCloud size={25} /></span><div><b>{file ? file.name : "문서를 끌어놓거나 선택하세요"}</b><p>{file ? `${Math.max(1, Math.round(file.size / 1024))}KB · 분석 준비됨` : "PDF, DOCX, TXT · 최대 6MB"}</p></div><button type="button">파일 선택</button></div><button className="sample-link" onClick={() => setFile(makeTextFile("[샘플] 개인정보처리동의서.txt", SAMPLE_CONSENT))}><FileText size={15} /> 샘플 동의서 사용</button>
      <div className="scope-box"><b>이번 분석 범위</b><span><Check size={14} /> 동의의 구분과 표시</span><span><Check size={14} /> 처리 목적·항목·보유기간</span><span><Check size={14} /> 제3자 제공과 국외 이전</span><span><Check size={14} /> 아동·민감정보·고유식별정보</span></div>
      {processing ? <div className="ai-progress"><span className="ai-spinner"><Sparkles size={23} /></span><div><b>문서 근거를 질문과 연결하고 있습니다.</b><p>문서 구조 분석 → 관련 조항 탐색 → 답변 신뢰도 계산</p><Progress value={72} /></div></div> : <div className="modal-actions"><button className="secondary-button" onClick={onClose}>취소</button><button className="primary-button" onClick={generate}><Sparkles size={16} /> AI 답변 생성</button></div>}</>}
    {results && <><div className="result-summary"><span className="score-badge">{results.length}<small>건</small></span><div><b>{results.length}개 문항의 답변을 생성했습니다.</b><p>{summary}</p></div><Pill tone="good">Claude 분석 완료</Pill></div><div className="auto-result-table"><div className="auto-head"><span>문항</span><span>AI 답변</span><span>근거 명확성</span><span>문서 근거</span></div>{results.map(row => { const label = row.answer === "yes" ? "예" : row.answer === "no" ? "아니요" : "해당 없음"; return <div className="auto-row" key={row.id}><span>Q{row.id}</span><b className={row.answer === "no" ? "text-bad" : ""}>{label}</b><span>{row.confidence}%</span><p>{row.evidence}<small><BookOpenCheck size={12} /> {row.legalBasis}</small></p></div>; })}</div><div className="modal-actions"><button className="secondary-button" onClick={() => setResults(null)}>다시 분석</button><button className="primary-button" onClick={apply}><Check size={16} /> 답변 {results.length}건 반영</button></div></>}
    <small className="ai-disclaimer"><AlertCircle size={13} /> 문서는 Claude API로 암호화 전송되며 GuardNote 서버에 저장되지 않습니다. 결과는 담당자가 최종 검토하세요.</small>
  </section></div>;
}

function AuditPage({ answers, setAnswers, notify, addHistory }) {
  const [area, setArea] = useState("전체");
  const [selected, setSelected] = useState(QUESTIONS[0].id);
  const [autoOpen, setAutoOpen] = useState(false);
  const shown = QUESTIONS.filter(q => area === "전체" || q.area === area);
  const selectedQ = QUESTIONS.find(q => q.id === selected) || QUESTIONS[0];
  const answered = Object.keys(answers).length;
  const noCount = Object.values(answers).filter(v => v === "no").length;
  const exportReport = () => {
    const lines = QUESTIONS.map(q => `Q${q.id}\t${q.title}\t${answers[q.id] || "미답변"}\t${q.law}`).join("\n");
    downloadText("GuardNote_개인정보_자가점검_보고서.txt", `한빛커머스 개인정보 자가점검 보고서\n기준: 2025.11\n\n${lines}`);
    notify("자가점검 보고서를 다운로드했습니다.");
  };
  return <div className="page audit-page">
    <section className="audit-overview panel"><div><Pill tone="ai">600 RULES · LIVE</Pill><h2>답변하는 즉시,<br />법적 위험과 다음 조치를 확인하세요.</h2><p>최신 법령·해석·판례·안내서를 연결해 각 답변의 준수 여부와 근거를 제공합니다.</p></div><div className="audit-progress"><strong>{421 + answered}<small>/600</small></strong><Progress value={Math.round((421 + answered) / 6)} /><span>전체 진행률 {Math.round((421 + answered) / 6)}%</span></div><div className="audit-stats"><span><b>{noCount + 4}</b> 위반 가능</span><span><b>8</b> 개선 권고</span><button className="primary-button" onClick={() => setAutoOpen(true)}><Sparkles size={16} /> AI 자동답변</button><button className="secondary-button" onClick={exportReport}><Download size={15} /> 보고서</button></div></section>
    <section className="audit-workspace">
      <div className="question-panel panel"><div className="question-toolbar"><label><Search size={15} /><input placeholder="점검 질문 검색" aria-label="점검 질문 검색" /></label><div>{["전체","동의","제3자 제공","아동","국외 이전"].map(v => <button key={v} className={area === v ? "is-active" : ""} onClick={() => setArea(v)}>{v}</button>)}</div></div>
        <div className="question-list">{shown.map((q, index) => <article key={q.id} className={cx("question-card", selected === q.id && "is-active")} onClick={() => setSelected(q.id)}><span className="question-index">{String(index + 1).padStart(2, "0")}</span><div><small>Q{q.id} · {q.area}</small><h3>{q.title}</h3><p>{q.law}</p><AnswerButtons value={answers[q.id]} onChange={value => setAnswers(prev => ({ ...prev, [q.id]: value }))} /></div>{answers[q.id] && <span className={cx("answer-state", answers[q.id] === "no" ? "is-bad" : "is-good")}>{answers[q.id] === "no" ? <AlertTriangle size={15} /> : <Check size={15} />}</span>}</article>)}</div>
      </div>
      <aside className="guidance-panel panel"><small className="section-label">INSTANT GUIDANCE</small><h3>Q{selectedQ.id} 판단 가이드</h3><Pill tone={answers[selectedQ.id] === "no" ? "bad" : answers[selectedQ.id] ? "good" : "warn"}>{answers[selectedQ.id] === "no" ? "위반 가능" : answers[selectedQ.id] ? "현재 답변 준수" : "답변 대기"}</Pill><div className="guidance-law"><BookOpenCheck size={18} /><div><b>관계 법령</b><p>{selectedQ.law}</p></div></div><div className="guidance-copy"><b>판단 기준</b><p>{selectedQ.help}</p></div><div className="guidance-copy"><b>권장 증적</b><p>최신 동의서, 화면 캡처, 내부 승인 이력, 변경 전후 비교본을 연결하세요.</p></div><button className="secondary-button wide"><UploadCloud size={15} /> 증적자료 연결</button><small className="sync-note"><RefreshCw size={13} /> 2026.07.22 법령 데이터 동기화 완료</small></aside>
    </section>
    {autoOpen && <AutoAnswerModal onClose={() => setAutoOpen(false)} onApply={generated => setAnswers(prev => ({ ...prev, ...generated }))} notify={notify} addHistory={addHistory} />}
  </div>;
}

function EvidenceResultModal({ result, onClose, onApply }) {
  const tone = result.match === "일치" ? "good" : result.match === "불일치" ? "bad" : "warn";
  return <div className="modal-backdrop"><section className="modal evidence-modal" role="dialog" aria-modal="true" aria-labelledby="evidence-title"><button className="modal-close" onClick={onClose} aria-label="증적 검토 결과 닫기"><X size={19} /></button><div className="modal-eyebrow"><Sparkles size={17} /> AI EVIDENCE REVIEW</div><h2 id="evidence-title">증적자료 검토 결과</h2><div className="evidence-result-top"><Pill tone={tone}>AI {result.match}</Pill><span>근거 명확성 {result.confidence}%</span><small>Claude 실시간 분석</small></div><div className="result-block"><b>판정</b><p>{result.judgment}</p></div><div className="result-block"><b>근거</b><p>{result.basis}</p></div><div className="result-block suggestion"><b>AI 보완 제안</b><ul>{(result.suggestions || []).map(item => <li key={item}>{item}</li>)}</ul></div><div className="modal-actions"><button className="secondary-button" onClick={onClose}>닫기</button>{result.match !== "일치" && <button className="primary-button" onClick={onApply}><MessageSquareText size={16} /> 보완 요청 생성</button>}</div><small className="ai-disclaimer"><AlertCircle size={13} /> AI 판정은 담당자가 증적 원본과 함께 최종 확인해야 합니다.</small></section></div>;
}

function VendorsPage({ vendors, setVendors, notify, addHistory }) {
  const [selectedId, setSelectedId] = useState(vendors[1]?.id || vendors[0]?.id);
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [evidenceResult, setEvidenceResult] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const fileRef = useRef(null);
  const selected = vendors.find(v => v.id === selectedId) || vendors[0];
  const analyze = async () => {
    if (!file) return notify("검토할 증적자료를 선택해주세요.");
    setProcessing(true);
    try {
      const out = await runAi("evidence-review", {
        document: await fileToAiDocument(file, { allowImage: true }),
        question: "개인정보 유출·침해사고에 대비한 대응 절차를 작성하고 있습니까?",
        declaredAnswer: "예",
      });
      setEvidenceResult(out);
      setResultOpen(true);
    } catch (error) {
      notify(error.message);
    } finally {
      setProcessing(false);
    }
  };
  const requestFix = () => {
    setResultOpen(false);
    setVendors(rows => rows.map(v => v.id === selected.id ? { ...v, status: "보완 요청", score: Math.min(v.score, 68) } : v));
    addHistory({ type: "증적 검토", title: `${selected.name} · 침해사고 대응절차`, result: `답변과 ${evidenceResult?.match || "불일치"}`, score: evidenceResult?.confidence || 0, status: "보완 요청" });
    notify(`${selected.name} 담당자에게 AI 근거가 포함된 보완 요청을 만들었습니다.`);
  };
  const addVendor = e => {
    e.preventDefault();
    if (!newName.trim()) return;
    const next = { id: Date.now(), name: newName.trim(), service: "신규 위탁업무", score: 0, progress: 0, status: "점검 전", evidence: 0, training: "미이수" };
    setVendors(rows => [...rows, next]); setSelectedId(next.id); setAdding(false); setNewName(""); notify("새 수탁자를 등록했습니다.");
  };
  const certificate = () => {
    downloadText(`${selected.name}_개인정보보호교육_수료증.txt`, `개인정보보호교육 수료증\n\n수탁자: ${selected.name}\n교육과정: 개인정보 처리업무 기본교육\n상태: ${selected.training}\n발급일: 2026.07.22\n\nGuardNote`);
    notify("교육 수료증을 다운로드했습니다.");
  };
  return <div className="page vendor-page">
    <section className="vendor-summary"><div><Pill tone="ai">PROCESSOR OVERSIGHT</Pill><h2>수탁자 답변을 넘어,<br />증적의 신뢰성까지 확인합니다.</h2><p>맞춤 점검표, 교육 이수, 증적자료와 AI 판정을 한 화면에서 관리하세요.</p></div><div className="vendor-summary-stats"><span><b>{vendors.length}</b> 등록 수탁자</span><span><b>84%</b> 평균 응답률</span><span><b>2</b> 보완 필요</span><button className="primary-button" onClick={() => setAdding(true)}><Plus size={16} /> 수탁자 추가</button></div></section>
    <section className="vendor-layout">
      <div className="vendor-list panel"><div className="section-head"><div><small>PROCESSORS</small><h3>수탁자 관리 현황</h3></div><label className="small-search"><Search size={14} /><input placeholder="수탁자 검색" aria-label="수탁자 검색" /></label></div><div className="vendor-table-head"><span>수탁자</span><span>진행률</span><span>점수</span><span>증적</span><span>상태</span></div>{vendors.map(v => <button key={v.id} className={cx("vendor-row", selectedId === v.id && "is-active")} onClick={() => { setSelectedId(v.id); setFile(null); }}><span><i>{v.name[0]}</i><b>{v.name}<small>{v.service}</small></b></span><span><Progress value={v.progress} />{v.progress}%</span><strong>{v.score || "—"}</strong><span>{v.evidence}건</span><Pill tone={v.status === "양호" ? "good" : v.status.includes("보완") ? "bad" : v.status === "점검 전" ? "neutral" : "warn"}>{v.status}</Pill></button>)}</div>
      <aside className="vendor-detail panel"><div className="vendor-profile"><span>{selected.name[0]}</span><div><small>SELECTED PROCESSOR</small><h3>{selected.name}</h3><p>{selected.service}</p></div><Pill tone={selected.status === "양호" ? "good" : selected.status.includes("보완") ? "bad" : "warn"}>{selected.status}</Pill></div><div className="vendor-detail-grid"><span><small>점검 점수</small><b>{selected.score || "—"}</b></span><span><small>제출 증적</small><b>{selected.evidence}건</b></span><span><small>교육</small><b>{selected.training}</b></span></div>
        <div className="custom-check"><div><small>CUSTOM CHECKLIST</small><b>필수 점검 20문항</b></div><span>관리적 7</span><span>기술적 7</span><span>생명주기 6</span></div>
        <div className="training-box"><GraduationCap size={20} /><div><b>개인정보 처리업무 교육</b><p>{selected.training === "이수" ? "2026년 정기교육을 이수했습니다." : "아직 교육을 이수하지 않았습니다."}</p></div><button className="secondary-button" onClick={certificate}>{selected.training === "이수" ? "수료증" : "교육 요청"}</button></div>
        <div className="evidence-work"><div className="section-head"><div><small>AI EVIDENCE MATCH</small><h3>증적자료 일치 검토</h3></div><Pill tone="ai">LIVE AI</Pill></div><p className="evidence-question">Q. 개인정보 유출·침해사고에 대비한 대응 절차를 작성하고 있습니까?</p><AnswerButtons value="yes" onChange={() => {}} /><div className="evidence-upload" onClick={() => fileRef.current?.click()}><input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" onChange={e => setFile(e.target.files?.[0] || null)} /><UploadCloud size={20} /><div><b>{file ? file.name : "증적자료 선택"}</b><small>{file ? "Claude 검토 준비됨" : "PDF, DOCX, TXT, PNG, JPG · 최대 6MB"}</small></div></div><button className="sample-link" onClick={() => setFile(makeTextFile("ID찾기_화면_설명.txt", SAMPLE_EVIDENCE))}><FileCheck2 size={15} /> 불일치 샘플 증적 사용</button>{processing ? <div className="inline-processing"><span className="ai-spinner"><Sparkles size={19} /></span><div><b>Claude가 답변과 증적을 대조하고 있습니다.</b><Progress value={68} /></div></div> : <button className="primary-button wide" onClick={analyze}><Sparkles size={16} /> AI 증적 검토</button>}</div>
      </aside>
    </section>
    {resultOpen && evidenceResult && <EvidenceResultModal result={evidenceResult} onClose={() => setResultOpen(false)} onApply={requestFix} />}
    {adding && <div className="modal-backdrop"><form className="modal modal--small" onSubmit={addVendor}><button type="button" className="modal-close" onClick={() => setAdding(false)} aria-label="수탁자 추가 닫기"><X size={19} /></button><div className="modal-eyebrow"><Users size={17} /> NEW PROCESSOR</div><h2>수탁자 등록</h2><p>회사명과 위탁업무를 등록한 뒤 맞춤 점검표를 보낼 수 있습니다.</p><label className="field"><span>수탁자명</span><input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="예: 데이터파트너" /></label><label className="field"><span>위탁업무</span><input defaultValue="신규 위탁업무" /></label><button className="primary-button wide" type="submit">등록하고 점검 준비</button></form></div>}
  </div>;
}

function PbdPage({ notify }) {
  const [selectedId, setSelectedId] = useState(1);
  const [checks, setChecks] = useState([true, true, false, false, true, false]);
  const selected = PROJECTS.find(p => p.id === selectedId) || PROJECTS[0];
  const items = ["처리 목적과 최소 수집항목이 기획서에 정의되어 있나요?","프로파일링과 자동화된 결정 여부를 안내하나요?","보유기간과 파기 트리거가 데이터 설계에 반영되었나요?","관리자 권한과 접속기록이 최소권한 원칙으로 설계되었나요?","수탁자·재수탁자와 국외 이전 흐름을 확인했나요?","출시 전 개인정보 영향 검토와 승인 책임자가 지정되었나요?"];
  const remaining = checks.filter(v => !v).length;
  const report = () => { downloadText(`${selected.name}_PbD_검토보고서.txt`, `${selected.name} Privacy by Design 검토보고서\n\n${items.map((v,i)=>`${checks[i]?"[완료]":"[조치 필요]"} ${v}`).join("\n")}`); notify("PbD 검토보고서를 다운로드했습니다."); };
  return <div className="page pbd-page"><section className="pbd-hero"><div><Pill tone="ai">PRIVACY BY DESIGN</Pill><h2>출시 직전이 아니라,<br />설계하는 지금 점검하세요.</h2><p>새 제품과 서비스마다 600개 법적 기준을 맞춤 구성하고, 기획·설계·개발·출시 게이트별 위험을 관리합니다.</p></div><div className="stage-line"><span className="done"><Check size={15} /> 기획</span><i /><span className="active">설계 검토</span><i /><span>개발</span><i /><span>출시 승인</span></div></section><section className="project-cards">{PROJECTS.map(p => <button key={p.id} onClick={() => setSelectedId(p.id)} className={cx("project-card", selectedId === p.id && "is-active")}><span><Pill tone={p.stage === "개선 중" ? "bad" : p.stage === "설계 검토" ? "warn" : "good"}>{p.stage}</Pill><small>{p.date}</small></span><h3>{p.name}</h3><p>{p.owner}</p><div><Progress value={p.score} /><b>{p.score}%</b></div><small>열린 위험 {p.open}건</small></button>)}</section><section className="pbd-board panel"><div className="section-head"><div><small>CURRENT GATE</small><h3>{selected.name} · {selected.stage}</h3></div><div className="board-actions"><Pill tone={remaining ? "warn" : "good"}>{remaining ? `${remaining}개 조치 필요` : "검토 완료"}</Pill><button className="secondary-button" onClick={report}><Download size={15} /> 보고서</button></div></div><div className="pbd-checks">{items.map((item,i) => <button key={item} onClick={() => setChecks(rows => rows.map((v,n)=>n===i?!v:v))}><span className={checks[i] ? "is-checked" : ""}>{checks[i] && <Check size={15} />}</span><div><b>{item}</b><small>{i === 1 ? "자동화된 의사결정 · 개인정보 보호법 제37조의2" : i === 4 ? "처리위탁 · 국외 이전 흐름" : "설계 검토 체크포인트"}</small></div><Pill tone={checks[i] ? "good" : "warn"}>{checks[i] ? "확인" : "검토 필요"}</Pill></button>)}</div></section></div>;
}

function DocReview({ notify, addHistory }) {
  const [docType, setDocType] = useState("개인정보 수집·이용 동의서");
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [context, setContext] = useState([true,false,true,false]);
  const fileRef = useRef(null);
  const contextLabels = ["만 14세 미만 아동도 이용","민감정보를 수집","마케팅 목적으로 이용","개인정보를 국외 이전"];
  const run = async () => {
    if (!file) return notify("검토할 개인정보 문서를 선택해주세요.");
    setProcessing(true);
    try {
      const out = await runAi("document-review", {
        document: await fileToAiDocument(file),
        docType,
        contexts: contextLabels.filter((_, index) => context[index]),
      });
      setResult(out);
      const violations = (out.findings || []).filter(item => item.level === "위반").length;
      const recommendations = (out.findings || []).filter(item => item.level === "권고").length;
      addHistory({ type: "문서 검토", title: file.name, result: `위반 ${violations} · 권고 ${recommendations}`, score: out.score || 0, status: "검토 완료" });
    } catch (error) {
      notify(error.message);
    } finally {
      setProcessing(false);
    }
  };
  const exportResult = () => { downloadText("AI_문서검토_결과.txt", `문서: ${file?.name}\n유형: ${docType}\n모델: ${result?.meta?.model || "Claude"}\n\n총평: ${result?.summary || ""}\n\n${(result?.findings || []).map((v,i)=>`${i+1}. [${v.level}] ${v.title}\n${v.detail}\n문서 문구: ${v.excerpt}\n근거: ${v.legalBasis}`).join("\n\n")}`); notify("AI 문서검토 결과를 다운로드했습니다."); };
  if (result) { const findings = result.findings || []; const violations = findings.filter(v => v.level === "위반").length; const recommendations = findings.filter(v => v.level === "권고").length; return <section className="doc-result panel"><div className="doc-result-head"><div><Pill tone="ai">AI DOCUMENT REVIEW · LIVE</Pill><h3>문서 검토 결과</h3><p>{file?.name} · {docType}</p></div><div className="review-score"><strong>{result.score}</strong><span>/100</span><small>문서 적정성</small></div><button className="secondary-button" onClick={exportResult}><Download size={15} /> 결과 저장</button></div><p className="review-summary-copy">{result.summary}</p><div className="finding-summary"><span><b>{violations}</b> 위반</span><span><b>{recommendations}</b> 권고</span><span><b>{result.compliantCount || 0}</b> 준수</span></div><div className="finding-list">{findings.map((finding,i)=><article key={`${finding.title}-${i}`}><span>{i+1}</span><Pill tone={finding.level === "위반" ? "bad" : "warn"}>{finding.level}</Pill><div><h4>{finding.title}</h4><p>{finding.detail}</p><blockquote>{finding.excerpt}</blockquote><small><BookOpenCheck size={13} /> {finding.legalBasis}</small></div><ChevronDown size={17} /></article>)}</div><div className="doc-result-actions"><button className="secondary-button" onClick={() => setResult(null)}>다른 문서 검토</button><button className="primary-button" onClick={exportResult}><FileOutput size={16} /> 개선안 포함 보고서</button></div></section>; }
  return <section className="doc-review panel"><div className="doc-step"><span>1</span><div><small>DOCUMENT TYPE</small><h3>검토할 문서 유형</h3></div></div><div className="doc-type-grid">{["개인정보 수집·이용 동의서","개인정보 처리방침","내부 관리계획","개인정보 처리 위수탁계약서"].map(v=><button key={v} className={docType===v?"is-active":""} onClick={()=>setDocType(v)}><FileText size={18} />{v}{docType===v&&<Check size={15}/>}</button>)}</div><div className="doc-step"><span>2</span><div><small>UPLOAD</small><h3>문서 첨부</h3></div></div><div className="upload-card" onClick={() => fileRef.current?.click()}><input ref={fileRef} type="file" accept=".pdf,.docx,.txt" onChange={e=>setFile(e.target.files?.[0]||null)}/><span><UploadCloud size={25}/></span><div><b>{file?file.name:"검토할 문서를 선택하세요"}</b><p>{file?"업로드 완료 · Claude 분석 준비됨":"PDF, DOCX, TXT · 최대 6MB"}</p></div><button type="button">파일 선택</button></div><button className="sample-link" onClick={()=>setFile(makeTextFile("[샘플] 개인정보처리동의서_v4.txt",SAMPLE_CONSENT))}><FileText size={15}/> 샘플 문서 사용</button><div className="doc-step"><span>3</span><div><small>CONTEXT</small><h3>문서 적용 맥락</h3></div></div><div className="context-grid">{contextLabels.map((v,i)=><button key={v} onClick={()=>setContext(rows=>rows.map((x,n)=>n===i?!x:x))} className={context[i]?"is-active":""}><span>{context[i]&&<Check size={14}/>}</span>{v}</button>)}</div>{processing?<div className="ai-progress"><span className="ai-spinner"><Sparkles size={23}/></span><div><b>Claude가 문서 조항과 2025.11 기준을 대조하고 있습니다.</b><p>문서 구조 → 필수 고지 → 위반·권고 → 개선안 생성</p><Progress value={76}/></div></div>:<button className="primary-button wide review-run" onClick={run}><Sparkles size={17}/> AI 정확성 검토 시작</button>}<small className="ai-disclaimer"><ShieldCheck size={13}/> 문서는 Claude API로 암호화 전송되며 GuardNote 서버에 저장되지 않습니다.</small></section>;
}

function DocGenerator({ notify, addHistory }) {
  const [type, setType] = useState("개인정보 수집·이용 동의서");
  const [form, setForm] = useState({ company:"한빛커머스", purpose:"회원 가입, 주문 처리 및 고객 문의 대응", items:"이름, 이메일, 휴대전화번호, 배송지", retention:"회원 탈퇴 후 30일", contact:"privacy@hanbit.example" });
  const [content, setContent] = useState("");
  const [processing, setProcessing] = useState(false);
  const [generation, setGeneration] = useState(null);
  const generate = async () => {
    setProcessing(true);
    try {
      const out = await runAi("document-generate", { type, form });
      setContent(out.content || "");
      setGeneration(out);
      addHistory({type:"문서 생성",title:out.title || `${type} 초안`,result:`조항 근거 ${(out.clauses || []).length}개 구성`,score:Math.max(0, 100 - (out.warnings || []).length * 5),status:"초안 생성"});
    } catch (error) {
      notify(error.message);
    } finally {
      setProcessing(false);
    }
  };
  const save=()=>{downloadText(`GuardNote_${type}_초안.txt`,content);notify("AI 문서 초안을 다운로드했습니다.");};
  return <section className="generator-layout"><div className="generator-form panel"><Pill tone="ai">AI DOCUMENT GENERATOR · LIVE</Pill><h3>관련 정보만 입력하면<br />검토 가능한 초안을 만듭니다.</h3><p>Claude가 입력 정보와 2025.11 안전성 확보조치 기준을 함께 검토해 편집 가능한 초안을 생성합니다.</p><label className="field"><span>문서 유형</span><select value={type} onChange={e=>setType(e.target.value)}><option>개인정보 수집·이용 동의서</option><option>개인정보 처리방침</option><option>내부 관리계획</option><option>개인정보 처리 위수탁계약서</option></select></label>{[["company","회사·기관명"],["purpose","처리 목적"],["items","개인정보 항목"],["retention","보유·이용기간"],["contact","개인정보 문의처"]].map(([key,label])=><label className="field" key={key}><span>{label}</span><input value={form[key]} onChange={e=>setForm(prev=>({...prev,[key]:e.target.value}))}/></label>)}{processing?<div className="ai-progress compact"><span className="ai-spinner"><Sparkles size={21}/></span><div><b>Claude가 필수 조항을 구성하고 있습니다.</b><Progress value={82}/></div></div>:<button className="primary-button wide" onClick={generate}><WandSparkles size={16}/> 안전한 초안 생성</button>}</div><div className="document-editor panel">{!content?<div className="editor-empty"><span><FileOutput size={30}/></span><h3>생성된 문서가 여기에 표시됩니다.</h3><p>필수 고지사항, 동의 거부권, 보유기간 표현을 자동 점검하고 수정 가능한 초안을 제공합니다.</p><div><span><Check size={14}/> 필수조항 자동 구성</span><span><Check size={14}/> 법적 근거 연결</span><span><Check size={14}/> 누락·모호 표현 경고</span></div></div>:<><div className="editor-head"><div><Pill tone="good">Claude 초안 생성 완료</Pill><h3>{generation?.title || type}</h3></div><button className="secondary-button" onClick={save}><Download size={15}/> 다운로드</button></div><div className="validation-strip"><span><CheckCircle2 size={16}/> 조항 근거 {(generation?.clauses || []).length}개 연결</span><span><AlertTriangle size={16}/> 확인 필요 {(generation?.warnings || []).length}건</span></div>{(generation?.warnings || []).length > 0 && <ul className="generation-warnings">{generation.warnings.map(item=><li key={item}>{item}</li>)}</ul>}<textarea value={content} onChange={e=>setContent(e.target.value)} aria-label="생성된 문서 초안"/><div className="clause-trace"><b>조항 근거</b>{(generation?.clauses || []).map(item=><span key={`${item.label}-${item.legalBasis}`}>{item.label} · {item.legalBasis}</span>)}</div></>}</div></section>;
}

function SmartDocsPage({ notify, addHistory, openAuto, go }) {
  const [tool, setTool] = useState("review");
  const tools = [
    { id:"review", icon:FileSearch, title:"AI 문서 검토", desc:"문서의 위반·권고·개선안과 법적 근거" },
    { id:"answer", icon:MessageSquareText, title:"AI 자동답변", desc:"동의서와 처리방침으로 점검 답변 생성" },
    { id:"generate", icon:FileOutput, title:"AI 문서 생성", desc:"업무 정보로 안전한 문서 초안 생성", fresh:true },
    { id:"evidence", icon:FolderCheck, title:"AI 증적 검토", desc:"수탁자의 답변과 증적자료 일치 판정" },
  ];
  const select = id => { if(id === "answer") openAuto(); else if(id === "evidence") go("vendors"); else setTool(id); };
  return <div className="page smart-page"><section className="smart-hero"><div><Pill tone="ai">SMART DOCS · CLAUDE LIVE</Pill><h2>읽고, 답하고, 만들고, 검증하는<br /><em>개인정보 AI 워크스페이스</em></h2><p>문서와 점검을 분리하지 않고 하나의 근거 흐름으로 연결합니다.</p></div><div className="smart-trust"><ShieldCheck size={27}/><b>Privacy-first AI</b><span>서버 비밀키 보호</span><span>문서 원문 미저장</span><span>담당자 최종 승인</span></div></section><section className="tool-grid">{tools.map(({id,icon:Icon,title,desc,fresh})=><button key={id} className={cx(tool===id&&"is-active")} onClick={()=>select(id)}><span><Icon size={22}/></span><div><h3>{title}{fresh&&<Pill tone="ai">LIVE</Pill>}</h3><p>{desc}</p></div><ChevronRight size={18}/></button>)}</section>{tool === "review" ? <DocReview notify={notify} addHistory={addHistory}/> : <DocGenerator notify={notify} addHistory={addHistory}/>}</div>;
}

function HistoryPage({ history, notify }) {
  const [filter, setFilter] = useState("전체");
  const [selected, setSelected] = useState(null);
  const shown = history.filter(v => filter === "전체" || v.type === filter);
  const exportCsv=()=>{ const csv="유형,대상,결과,점수,시간,상태\n"+shown.map(v=>[v.type,v.title,v.result,v.score,v.time,v.status].join(",")).join("\n");downloadText("GuardNote_AI검토내역.csv",csv,"text/csv;charset=utf-8");notify("AI 검토 내역을 CSV로 다운로드했습니다.");};
  return <div className="page history-page"><section className="history-intro"><div><Pill tone="ai">EXPLAINABLE AI LOG</Pill><h2>AI 판단도 감사 가능한 기록으로.</h2><p>입력 문서, 제안 답변, 신뢰도, 근거, 담당자의 최종 결정을 함께 보존합니다.</p></div><button className="secondary-button" onClick={exportCsv}><Download size={15}/> CSV 내보내기</button></section><section className="panel history-panel"><div className="history-toolbar"><div>{["전체","문서 검토","자동 답변","증적 검토","문서 생성"].map(v=><button className={filter===v?"is-active":""} onClick={()=>setFilter(v)} key={v}>{v}</button>)}</div><label className="small-search"><Search size={14}/><input placeholder="검토 대상 검색" aria-label="검토 대상 검색"/></label></div><div className="history-table"><div className="table-header"><span>유형</span><span>대상</span><span>AI 결과</span><span>신뢰도</span><span>실행 시간</span><span>상태</span><span></span></div>{shown.map(row=><button className="table-row" key={row.id} onClick={()=>setSelected(row)}><span><Pill tone="ai">{row.type}</Pill></span><b>{row.title}</b><span>{row.result}</span><span><Progress value={row.score}/>{row.score}%</span><span>{row.time}</span><span><Pill tone={row.status.includes("완료")||row.status.includes("반영")?"good":row.status.includes("보완")?"bad":"warn"}>{row.status}</Pill></span><ChevronRight size={16}/></button>)}</div></section>{selected&&<div className="modal-backdrop"><section className="modal modal--small" role="dialog" aria-modal="true" aria-labelledby="history-title"><button className="modal-close" onClick={()=>setSelected(null)} aria-label="검토 상세 닫기"><X size={19}/></button><div className="modal-eyebrow"><History size={17}/> REVIEW DETAIL</div><h2 id="history-title">{selected.type}</h2><p>{selected.title}</p><div className="detail-card"><span><small>AI 결과</small><b>{selected.result}</b></span><span><small>신뢰도</small><b>{selected.score}%</b></span><span><small>상태</small><b>{selected.status}</b></span><span><small>처리 시간</small><b>{selected.time}</b></span></div><div className="result-block"><b>설명 가능한 근거</b><p>관련 문서의 문구와 연결된 법적 기준을 비교해 결과를 생성했습니다. 담당자의 최종 검토 이력과 수정 내용이 함께 기록됩니다.</p></div><button className="primary-button wide" onClick={()=>setSelected(null)}>확인</button></section></div>}</div>;
}

function NoticeDrawer({ open, onClose, go }) {
  return <><button className={cx("drawer-scrim",open&&"is-open")} onClick={onClose} aria-label="알림 닫기"/><aside className={cx("notice-drawer",open&&"is-open")}><div className="drawer-head"><div><small>INBOX</small><h2>알림</h2></div><button className="icon-button" onClick={onClose} aria-label="알림 닫기"><X size={18}/></button></div><button onClick={()=>{go("vendors");onClose();}}><span className="notice-icon bad"><AlertTriangle size={17}/></span><div><b>증적자료 불일치</b><p>리서치온의 침해사고 대응 증적을 보완해야 합니다.</p><small>12분 전</small></div></button><button onClick={()=>{go("smart");onClose();}}><span className="notice-icon ai"><Sparkles size={17}/></span><div><b>AI 문서검토 완료</b><p>동의서에서 위반 3건과 권고 4건을 찾았습니다.</p><small>1시간 전</small></div></button><button onClick={()=>{go("pbd");onClose();}}><span className="notice-icon good"><CheckCircle2 size={17}/></span><div><b>PbD 게이트 승인</b><p>파트너 포털 프로젝트가 출시 승인 단계로 이동했습니다.</p><small>어제</small></div></button></aside></>;
}

export default function GuardNote() {
  const [page, setPage] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [answers, setAnswers] = useState({ 29:"yes", 67:"yes" });
  const [vendors, setVendors] = useState(VENDOR_SEED);
  const [history, setHistory] = useState(INITIAL_HISTORY);
  const [autoOpen, setAutoOpen] = useState(false);
  const timer = useRef(null);
  const notify = message => { setToast(message); window.clearTimeout(timer.current); timer.current = window.setTimeout(()=>setToast(""),2800); };
  const go = id => { setPage(id); setSearch(""); window.scrollTo({top:0,behavior:"smooth"}); };
  const addHistory = entry => setHistory(rows => [{ id:Date.now()+Math.random(), time:"방금", ...entry }, ...rows]);
  const content = useMemo(()=>{
    if(page==="dashboard") return <Dashboard go={go} history={history}/>;
    if(page==="audit") return <AuditPage answers={answers} setAnswers={setAnswers} notify={notify} addHistory={addHistory}/>;
    if(page==="vendors") return <VendorsPage vendors={vendors} setVendors={setVendors} notify={notify} addHistory={addHistory}/>;
    if(page==="pbd") return <PbdPage notify={notify}/>;
    if(page==="smart") return <SmartDocsPage notify={notify} addHistory={addHistory} openAuto={()=>setAutoOpen(true)} go={go}/>;
    return <HistoryPage history={history} notify={notify}/>;
  },[page,answers,vendors,history]);
  return <div className="app-shell"><Sidebar page={page} onPage={go} open={menuOpen} onClose={()=>setMenuOpen(false)}/><main className="main-shell"><Topbar page={page} onMenu={()=>setMenuOpen(true)} onSearch={setSearch} onNotice={()=>setNoticeOpen(true)}/>{search&&<div className="search-banner"><Search size={16}/><span><b>“{search}”</b> 관련 결과를 현재 화면에서 찾고 있습니다.</span><button onClick={()=>setSearch("")} aria-label="검색 닫기"><X size={16}/></button></div>}{content}<footer><Logo compact/><span>GuardNote Privacy Intelligence</span><p>개인정보 보호법 · 안전성 확보조치 기준 2025.11</p><em>AI 결과는 담당자 검토 후 확정됩니다.</em></footer></main><NoticeDrawer open={noticeOpen} onClose={()=>setNoticeOpen(false)} go={go}/>{autoOpen&&<AutoAnswerModal onClose={()=>setAutoOpen(false)} onApply={generated=>setAnswers(prev=>({...prev,...generated}))} notify={notify} addHistory={addHistory}/>}<div className={cx("toast",toast&&"is-visible")}><CheckCircle2 size={17}/>{toast}</div></div>;
}
