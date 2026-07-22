import React, { useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, ArrowUpRight, BadgeCheck, Bell, BookOpenCheck,
  Building2, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight,
  Circle, ClipboardCheck, CloudLightning, Copy, Database, Download, FileCheck2,
  FileText, FolderLock, KeyRound, LayoutDashboard, LockKeyhole, Menu,
  MoreHorizontal, Plus, Radar, Search, Shield, ShieldAlert, ShieldCheck,
  Sparkles, Trash2, UploadCloud, UserRound, Users, X
} from "lucide-react";

const CONTROLS = [
  { key: "plan", article: "제4조", name: "내부 관리계획", score: 82, tone: "warn", owner: "개인정보팀", due: "D-12", note: "2026년 정기 점검 결재 필요", icon: BookOpenCheck },
  { key: "auth", article: "제5조", name: "접근 권한", score: 94, tone: "good", owner: "인프라팀", due: "완료", note: "퇴직자 권한 회수 자동화", icon: KeyRound },
  { key: "access", article: "제6조", name: "접근통제", score: 71, tone: "bad", owner: "보안팀", due: "D-3", note: "외부접속 MFA 2건 미적용", icon: LockKeyhole },
  { key: "crypto", article: "제7조", name: "암호화", score: 88, tone: "good", owner: "개발팀", due: "D-26", note: "키 관리 절차 최신화", icon: ShieldCheck },
  { key: "log", article: "제8조", name: "접속기록", score: 76, tone: "warn", owner: "보안팀", due: "오늘", note: "대량 다운로드 3건 확인", icon: Activity },
  { key: "malware", article: "제9조", name: "악성프로그램", score: 100, tone: "good", owner: "IT팀", due: "완료", note: "EDR 정의 최신", icon: ShieldAlert },
  { key: "physical", article: "제10조", name: "물리적 조치", score: 91, tone: "good", owner: "총무팀", due: "D-48", note: "전산실 출입대장 정상", icon: Building2 },
  { key: "disaster", article: "제11조", name: "재해·재난", score: 67, tone: "bad", owner: "인프라팀", due: "D-7", note: "복구 훈련 결과 미등록", icon: CloudLightning },
  { key: "output", article: "제12조", name: "출력·복사", score: 85, tone: "good", owner: "경영지원", due: "D-31", note: "워터마크 정책 적용", icon: Copy },
  { key: "destroy", article: "제13조", name: "파기", score: 79, tone: "warn", owner: "데이터팀", due: "D-5", note: "보유기간 만료 248건", icon: Trash2 },
];

const QUESTIONS = [
  { id: 1, control: "제4조", title: "내부 관리계획의 이행 실태를 연 1회 이상 점검하고 있나요?", hint: "점검 대상·주기·방법·사후조치와 CPO 보고 이력을 확인합니다.", evidence: "내부 관리계획, 연간 점검 결과, CPO 결재문서", risk: "중요", answer: "partial" },
  { id: 2, control: "제5조", title: "권한 부여·변경·말소 내역을 최소 3년간 보관하고 있나요?", hint: "인사 변동과 시스템 계정의 회수 시점을 함께 대조합니다.", evidence: "계정 신청서, HR 퇴직자 목록, 권한 변경 로그", risk: "필수", answer: "yes" },
  { id: 3, control: "제6조", title: "외부에서 개인정보처리시스템 접속 시 안전한 인증수단을 적용했나요?", hint: "2026.11.1 시행사항을 포함해 OTP·인증서·보안토큰 적용 여부를 봅니다.", evidence: "MFA 정책, VPN 설정 화면, 접속 구성도", risk: "개선", answer: "no" },
  { id: 4, control: "제7조", title: "주민등록번호와 인증정보를 안전한 알고리즘으로 암호화하나요?", hint: "비밀번호는 복호화되지 않는 일방향 암호화가 필요합니다.", evidence: "암호화 정책, DB 스키마, 키 관리대장", risk: "필수", answer: "yes" },
  { id: 5, control: "제8조", title: "접속기록에 식별자·접속일시·접속지·정보주체·수행업무가 남나요?", hint: "검색조건으로 대량 처리한 경우에도 책임 추적성을 확보해야 합니다.", evidence: "접속기록 샘플, 로그 보관 정책, 위변조 방지 설정", risk: "중요", answer: "partial" },
  { id: 6, control: "제9조", title: "보안 프로그램을 자동 업데이트하고 주기적으로 점검하나요?", hint: "악성프로그램 방지 프로그램의 최신 상태와 탐지 이력을 확인합니다.", evidence: "EDR 콘솔 화면, 업데이트 정책, 월간 점검표", risk: "권고", answer: "yes" },
  { id: 7, control: "제11조", title: "재해·재난 발생 시 개인정보처리시스템 복구 계획을 검증했나요?", hint: "백업 보유만으로는 부족하며 실제 복구 훈련의 결과가 필요합니다.", evidence: "재해복구 계획, 훈련 결과, 백업 복원 로그", risk: "개선", answer: "no" },
  { id: 8, control: "제13조", title: "보유기간이 지난 개인정보를 복원 불가능한 방법으로 파기하나요?", hint: "파기 대상, 승인자, 방식, 결과를 일관되게 남겨야 합니다.", evidence: "파기대장, 삭제 작업 로그, 파기 승인문서", risk: "필수", answer: "partial" },
];

const INITIAL_VENDORS = [
  { id: 1, name: "페이웍스", service: "결제 대행", status: "위험", score: 58, due: "2026.07.25", evidence: 7, issue: "재위탁 현황 미제출" },
  { id: 2, name: "클라우드웨이브", service: "인프라 운영", status: "점검중", score: 81, due: "2026.07.30", evidence: 14, issue: "접근권한 증적 검토 중" },
  { id: 3, name: "메시지랩", service: "알림톡 발송", status: "양호", score: 96, due: "2026.09.12", evidence: 18, issue: "이상 없음" },
  { id: 4, name: "리서치온", service: "고객 설문", status: "미응답", score: 0, due: "2026.07.23", evidence: 0, issue: "점검 요청 2회 미응답" },
  { id: 5, name: "세이프스토어", service: "문서 보관", status: "양호", score: 92, due: "2026.10.04", evidence: 11, issue: "다음 분기 재점검" },
];

const PROJECTS = [
  { name: "멤버십 2.0", owner: "프로덕트 A", stage: "설계 검토", progress: 72, risk: 2, date: "8월 8일 출시" },
  { name: "파트너 정산 포털", owner: "B2B 플랫폼", stage: "개선 중", progress: 48, risk: 5, date: "9월 2일 출시" },
  { name: "개인화 추천", owner: "데이터 랩", stage: "초기 진단", progress: 26, risk: 3, date: "일정 검토 중" },
];

const DOCUMENTS = [
  { id: "plan", title: "내부 관리계획", desc: "조직·권한·접근통제·교육·점검을 현재 상태에 맞춰 구성", meta: "제4조 · 24개 항목", icon: BookOpenCheck },
  { id: "risk", title: "위험도 분석 결과보고서", desc: "현황 조사부터 암호화 결정 근거와 내부결재용 결과까지 정리", meta: "부록 제2장 · 4단계", icon: Radar },
  { id: "vendor", title: "수탁자 점검 보고서", desc: "수탁자별 답변·증적·미흡사항과 사후조치를 한 문서로 통합", meta: "관리·감독 · 18개 항목", icon: Users },
  { id: "audit", title: "안전조치 이행점검 보고서", desc: "제4조~제13조 조치별 현황, 담당자, 개선기한을 자동 구성", meta: "10개 조치영역", icon: FileCheck2 },
];

const NAV = [
  { id: "dashboard", label: "오늘의 준수센터", icon: LayoutDashboard },
  { id: "audit", label: "안전조치 진단", icon: ClipboardCheck, badge: "8" },
  { id: "risk", label: "위험도 분석", icon: Radar },
  { id: "vendors", label: "수탁자 관리", icon: Users, badge: "2" },
  { id: "projects", label: "PbD 프로젝트", icon: ShieldCheck },
  { id: "documents", label: "문서 센터", icon: FileText },
  { id: "evidence", label: "증적 금고", icon: FolderLock },
];

const PAGE_META = {
  dashboard: ["오늘의 준수센터", "조치가 필요한 위험부터 먼저 보여드립니다."],
  audit: ["안전조치 진단", "2025.11 안내서 기준으로 답하고 증적까지 연결하세요."],
  risk: ["개인정보 위험도 분석", "암호화 적용 여부를 4단계 근거와 함께 판단합니다."],
  vendors: ["수탁자 관리", "점검 요청부터 증적 검토와 사후조치까지 한곳에서 관리합니다."],
  projects: ["Privacy by Design", "출시 전에 개인정보 위험을 발견하고 설계에 반영하세요."],
  documents: ["문서 센터", "현재 준수 데이터를 결재 가능한 문서로 바꿉니다."],
  evidence: ["증적 금고", "누가, 언제, 무엇을 확인했는지 변경 불가능한 이력으로 남깁니다."],
};

function cx(...names) { return names.filter(Boolean).join(" "); }

function Logo({ compact = false }) {
  return <div className={cx("brand", compact && "brand--compact")}>
    <span className="brand__mark"><Shield size={18} strokeWidth={2.4} /></span>
    {!compact && <span><strong>GUARD</strong>NOTE<small>PRIVACY OPERATIONS</small></span>}
  </div>;
}

function Status({ tone = "neutral", children }) {
  return <span className={`status status--${tone}`}><i />{children}</span>;
}

function Sidebar({ page, onPage, open, onClose }) {
  return <>
    {open && <button className="scrim" aria-label="메뉴 닫기" onClick={onClose} />}
    <aside className={cx("sidebar", open && "sidebar--open")}>
      <div className="sidebar__head"><Logo /><button className="mobile-close" onClick={onClose} aria-label="메뉴 닫기"><X size={20} /></button></div>
      <div className="workspace-switch">
        <span className="workspace-switch__avatar">H</span>
        <span><b>한빛커머스</b><small>Enterprise workspace</small></span>
        <ChevronDown size={15} />
      </div>
      <p className="nav-label">WORKSPACE</p>
      <nav className="main-nav" aria-label="주요 메뉴">
        {NAV.map(({ id, label, icon: Icon, badge }) => <button key={id} onClick={() => { onPage(id); onClose(); }} className={cx(page === id && "is-active")}>
          <Icon size={17} /><span>{label}</span>{badge && <em>{badge}</em>}
        </button>)}
      </nav>
      <div className="guide-card">
        <span className="guide-card__icon"><BookOpenCheck size={18} /></span>
        <div><b>2025.11 기준 반영</b><p>안전성 확보조치 안내서</p></div>
        <BadgeCheck size={16} className="guide-card__check" />
      </div>
      <div className="sidebar__foot">
        <div className="user-avatar">김</div>
        <div><b>김가드</b><small>개인정보 보호책임자</small></div>
        <MoreHorizontal size={18} />
      </div>
    </aside>
  </>;
}

function Topbar({ page, onMenu, onNotify, search, setSearch }) {
  const [title, sub] = PAGE_META[page];
  return <header className="topbar">
    <button className="menu-btn" onClick={onMenu} aria-label="메뉴 열기"><Menu size={21} /></button>
    <div className="topbar__title"><h1>{title}</h1><p>{sub}</p></div>
    <label className="global-search"><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="통제, 수탁자, 증적 검색" /></label>
    <button className="icon-btn has-dot" onClick={onNotify} aria-label="알림 열기"><Bell size={18} /></button>
    <button className="profile-chip"><span>김</span><ChevronDown size={14} /></button>
  </header>;
}

function Donut({ value, label = "준수 점수", size = 144 }) {
  return <div className="donut" style={{ "--value": `${value * 3.6}deg`, "--size": `${size}px` }}>
    <div><strong>{value}</strong><span>/100</span><small>{label}</small></div>
  </div>;
}

function Dashboard({ onPage, doneActions, toggleAction }) {
  const doneCount = Object.values(doneActions).filter(Boolean).length;
  const score = 84 + doneCount;
  const actions = [
    { id: "mfa", type: "긴급", title: "외부접속 MFA 미적용 계정 2개", desc: "시행 예정 기준까지 102일", tone: "bad", icon: LockKeyhole },
    { id: "logs", type: "확인", title: "대량 다운로드 이상징후 3건", desc: "오늘 17:00까지 소명 필요", tone: "warn", icon: Activity },
    { id: "delete", type: "기한", title: "보유기간 만료 개인정보 248건", desc: "파기 승인 대기 중", tone: "neutral", icon: Trash2 },
  ];
  return <div className="page dashboard-page">
    <section className="hero-grid">
      <div className="score-card">
        <div className="section-kicker"><span>LIVE POSTURE</span><Status tone="good">운영 정상</Status></div>
        <div className="score-card__main">
          <Donut value={score} />
          <div className="score-copy">
            <span className="delta">▲ 6점 <small>지난달 대비</small></span>
            <h2>대응 가능한 상태입니다.</h2>
            <p>10개 조치영역 중 7개가 안정적입니다. 접근통제와 재해·재난 항목을 우선 개선하면 90점에 도달합니다.</p>
            <button className="text-action" onClick={() => onPage("audit")}>진단 이어하기 <ArrowUpRight size={15} /></button>
          </div>
        </div>
        <div className="score-card__footer">
          <span><b>7</b><small>양호 영역</small></span><span><b>3</b><small>개선 필요</small></span><span><b>28</b><small>연결된 증적</small></span><span><b>97%</b><small>점검 이행률</small></span>
        </div>
      </div>
      <div className="action-card">
        <div className="section-heading"><div><span className="section-kicker">TODAY</span><h3>오늘 먼저 처리할 일</h3></div><button onClick={() => onPage("audit")}>전체 보기 <ChevronRight size={15} /></button></div>
        <div className="action-list">
          {actions.map(({ id, title, desc, tone, type, icon: Icon }) => <button key={id} className={cx("action-item", doneActions[id] && "is-done")} onClick={() => toggleAction(id)}>
            <span className={`action-icon action-icon--${tone}`}>{doneActions[id] ? <Check size={17} /> : <Icon size={17} />}</span>
            <span><b>{title}</b><small>{doneActions[id] ? "처리 완료 · 증적에 기록됨" : desc}</small></span>
            <Status tone={doneActions[id] ? "good" : tone}>{doneActions[id] ? "완료" : type}</Status>
          </button>)}
        </div>
      </div>
    </section>

    <section className="metrics-row">
      <article><span className="metric-icon metric-icon--navy"><ClipboardCheck size={18} /></span><div><small>점검 진행률</small><strong>43 <em>/ 52</em></strong></div><div className="tiny-progress"><i style={{ width: "83%" }} /></div><b className="metric-delta">83%</b></article>
      <article><span className="metric-icon metric-icon--orange"><AlertTriangle size={18} /></span><div><small>열린 개선과제</small><strong>8 <em>건</em></strong></div><p>긴급 2 · 보통 6</p><b className="metric-delta metric-delta--warn">-3건</b></article>
      <article><span className="metric-icon metric-icon--green"><Users size={18} /></span><div><small>수탁자 응답률</small><strong>84 <em>%</em></strong></div><p>21개사 중 18개사</p><b className="metric-delta">+12%</b></article>
      <article><span className="metric-icon metric-icon--plum"><FileCheck2 size={18} /></span><div><small>증적 최신성</small><strong>91 <em>%</em></strong></div><p>30일 이내 수집</p><b className="metric-delta">+4%</b></article>
    </section>

    <section className="dashboard-lower">
      <div className="control-map panel">
        <div className="section-heading"><div><span className="section-kicker">CONTROL MAP</span><h3>10개 안전조치 현황</h3></div><button onClick={() => onPage("audit")}>상세 진단 <ChevronRight size={15} /></button></div>
        <div className="control-grid">
          {CONTROLS.map(({ key, article, name, score: itemScore, tone, note, icon: Icon }) => <button key={key} onClick={() => onPage("audit")} className="control-cell">
            <span className={`control-cell__icon control-cell__icon--${tone}`}><Icon size={17} /></span>
            <span><small>{article}</small><b>{name}</b><em>{note}</em></span>
            <strong className={`score-text score-text--${tone}`}>{itemScore}</strong>
            <i className="control-progress"><u className={`fill--${tone}`} style={{ width: `${itemScore}%` }} /></i>
          </button>)}
        </div>
      </div>
      <div className="trend panel">
        <div className="section-heading"><div><span className="section-kicker">6 MONTHS</span><h3>준수 추이</h3></div><Status tone="good">+14%</Status></div>
        <div className="bar-chart" aria-label="6개월 준수점수 추이">
          {[61, 66, 72, 70, 79, score].map((v, i) => <div key={i} className={cx(i === 5 && "is-current")}><span style={{ height: `${v}%` }}><b>{i === 5 ? v : ""}</b></span><small>{["2월", "3월", "4월", "5월", "6월", "7월"][i]}</small></div>)}
        </div>
        <div className="trend-note"><BadgeCheck size={18} /><p><b>가장 많이 개선된 영역</b><span>접근 권한 관리 · +22점</span></p></div>
      </div>
    </section>
  </div>;
}

function AuditPage({ answers, setAnswers, evidenceFiles, setEvidenceFiles, notify }) {
  const [activeId, setActiveId] = useState(3);
  const [filter, setFilter] = useState("전체");
  const [query, setQuery] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const active = QUESTIONS.find(q => q.id === activeId);
  const answer = answers[activeId] || active.answer;
  const complete = Object.keys(answers).length;
  const filtered = QUESTIONS.filter(q => (filter === "전체" || (filter === "미흡" ? (answers[q.id] || q.answer) !== "yes" : q.control === filter)) && q.title.includes(query));
  const setAnswer = value => { setAnswers(prev => ({ ...prev, [activeId]: value })); notify("답변이 저장되고 준수점수에 반영되었습니다."); };
  const upload = e => { const file = e.target.files?.[0]; if (!file) return; setEvidenceFiles(p => ({ ...p, [activeId]: file.name })); notify("증적 파일이 안전하게 연결되었습니다."); };
  const review = () => { setReviewing(true); setTimeout(() => { setReviewing(false); notify("AI 증적 검토가 완료되었습니다. 답변과 92% 일치합니다."); }, 900); };
  return <div className="page">
    <section className="audit-summary panel">
      <div><span className="section-kicker">ANNUAL REVIEW · 2026</span><h2>정기 이행점검</h2><p>제4조~제13조 · 안내서 해설과 증적 기준을 반영한 52개 질문</p></div>
      <div className="audit-progress"><strong>{43 + complete}<small>/ 52</small></strong><span><i style={{ width: `${Math.min(98, 83 + complete * 2)}%` }} /></span><em>{Math.min(98, 83 + complete * 2)}% 완료</em></div>
      <button className="primary-btn" onClick={() => notify("현재 점검 결과가 임시 보고서로 저장되었습니다.")}><FileCheck2 size={16} /> 중간 보고서</button>
    </section>
    <section className="audit-layout">
      <div className="question-list panel">
        <div className="question-tools">
          <label><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="점검항목 검색" /></label>
          <div>{["전체", "미흡", "제6조", "제8조"].map(v => <button className={filter === v ? "is-active" : ""} onClick={() => setFilter(v)} key={v}>{v}</button>)}</div>
        </div>
        <div className="questions">
          {filtered.map((q, idx) => {
            const value = answers[q.id] || q.answer;
            return <button key={q.id} className={cx("question-row", activeId === q.id && "is-active")} onClick={() => setActiveId(q.id)}>
              <span className={cx("question-number", `answer--${value}`)}>{value === "yes" ? <Check size={14} /> : String(idx + 1).padStart(2, "0")}</span>
              <span><small>{q.control} · {q.risk}</small><b>{q.title}</b><em>{evidenceFiles[q.id] ? `증적 연결 · ${evidenceFiles[q.id]}` : q.evidence}</em></span>
              <span className={cx("answer-dot", `answer-dot--${value}`)}>{value === "yes" ? "적합" : value === "no" ? "미흡" : "보완"}</span>
            </button>;
          })}
        </div>
      </div>
      <aside className="question-detail panel">
        <div className="detail-head"><span className="section-kicker">{active.control} CHECKPOINT</span><Status tone={answer === "yes" ? "good" : answer === "no" ? "bad" : "warn"}>{answer === "yes" ? "적합" : answer === "no" ? "미흡" : "보완 필요"}</Status></div>
        <h3>{active.title}</h3>
        <p className="detail-hint">{active.hint}</p>
        <div className="answer-select" role="group" aria-label="점검 답변">
          {[{ k: "yes", l: "예", s: "충족" }, { k: "partial", l: "일부", s: "보완 필요" }, { k: "no", l: "아니요", s: "미충족" }].map(v => <button onClick={() => setAnswer(v.k)} className={answer === v.k ? "is-active" : ""} key={v.k}><span>{v.l}</span><small>{v.s}</small></button>)}
        </div>
        <div className="basis-box"><BookOpenCheck size={17} /><p><b>판단 근거</b><span>개인정보의 안전성 확보조치 기준 안내서(2025.11) {active.control} 해설</span></p><ArrowUpRight size={15} /></div>
        <div className="evidence-box">
          <div><b>권장 증적</b><span>{active.evidence}</span></div>
          <label className={cx("upload-zone", evidenceFiles[activeId] && "has-file")}>
            <input type="file" onChange={upload} />
            {evidenceFiles[activeId] ? <><FileCheck2 size={20} /><b>{evidenceFiles[activeId]}</b><span>클릭하여 교체</span></> : <><UploadCloud size={21} /><b>증적 파일 올리기</b><span>PDF, DOCX, XLSX · 최대 20MB</span></>}
          </label>
          {evidenceFiles[activeId] && <button className="ai-review" disabled={reviewing} onClick={review}><Sparkles size={15} />{reviewing ? "답변과 증적 대조 중…" : "AI로 답변 일치 여부 검토"}</button>}
        </div>
      </aside>
    </section>
  </div>;
}

function RiskPage({ notify }) {
  const [step, setStep] = useState(1);
  const [info, setInfo] = useState({ file: "회원 신원확인 정보", passport: true, license: true, alien: false, allEncrypted: false });
  const [checks, setChecks] = useState([true, true, false, true, true, false]);
  const [result, setResult] = useState(null);
  const run = () => { const required = checks.some(v => !v) || !info.allEncrypted; setResult(required ? "required" : "optional"); setStep(4); notify("위험도 분석 결과보고서가 생성되었습니다."); };
  const checkLabels = ["접근권한 부여·변경·말소 기준을 운영한다", "외부 접속에 안전한 인증수단을 적용한다", "개인정보처리시스템과 업무용 PC를 분리한다", "접속기록을 1년 이상 안전하게 보관한다", "악성프로그램 방지 프로그램을 최신 상태로 유지한다", "정기 취약점 점검과 조치 이력을 보관한다"];
  return <div className="page">
    <section className="risk-steps panel">
      {["현황 조사", "점검 항목", "내부 검토", "결과보고서"].map((label, i) => <button key={label} onClick={() => setStep(i + 1)} className={cx(step === i + 1 && "is-active", step > i + 1 && "is-done")}><span>{step > i + 1 ? <Check size={14} /> : i + 1}</span><b>{label}</b>{i < 3 && <i />}</button>)}
    </section>
    <section className="risk-layout">
      <div className="risk-form panel">
        {step === 1 && <>
          <span className="section-kicker">STEP 01 · INVENTORY</span><h2>어떤 개인정보파일을 분석할까요?</h2><p className="form-intro">내부망에 주민등록번호 외 고유식별정보를 암호화하지 않고 저장하는 경우를 판단합니다.</p>
          <label className="field"><span>개인정보파일 명칭</span><input value={info.file} onChange={e => setInfo({ ...info, file: e.target.value })} /></label>
          <div className="field"><span>저장하는 고유식별정보</span><div className="check-grid">{[["passport", "여권번호"], ["license", "운전면허번호"], ["alien", "외국인등록번호"]].map(([k, l]) => <label key={k}><input type="checkbox" checked={info[k]} onChange={e => setInfo({ ...info, [k]: e.target.checked })} /><span><Check size={13} /></span>{l}</label>)}</div></div>
          <label className="toggle-row"><span><b>모든 항목을 암호화하여 저장 중</b><small>주민등록번호는 분석 결과와 관계없이 반드시 암호화해야 합니다.</small></span><input type="checkbox" checked={info.allEncrypted} onChange={e => setInfo({ ...info, allEncrypted: e.target.checked })} /><i /></label>
          <button className="primary-btn next-btn" onClick={() => setStep(2)}>점검 항목으로 <ChevronRight size={16} /></button>
        </>}
        {step === 2 && <>
          <span className="section-kicker">STEP 02 · SAFEGUARDS</span><h2>최소 안전조치를 확인하세요.</h2><p className="form-intro">하나라도 ‘아니요’라면 해당 고유식별정보를 암호화해야 합니다.</p>
          <div className="risk-checks">{checkLabels.map((label, i) => <button key={label} onClick={() => setChecks(c => c.map((v, x) => x === i ? !v : v))} className={checks[i] ? "is-yes" : "is-no"}><span>{checks[i] ? <Check size={15} /> : <X size={15} />}</span><b>{label}</b><em>{checks[i] ? "예" : "아니요"}</em></button>)}</div>
          <div className="form-actions"><button className="secondary-btn" onClick={() => setStep(1)}>이전</button><button className="primary-btn" onClick={() => setStep(3)}>검토하기 <ChevronRight size={16} /></button></div>
        </>}
        {step === 3 && <>
          <span className="section-kicker">STEP 03 · REVIEW</span><h2>분석 조건을 최종 확인하세요.</h2><p className="form-intro">결과는 개인정보파일 단위로 저장되며 CPO 또는 부서장 결재 후 보관해야 합니다.</p>
          <div className="review-sheet"><div><small>개인정보파일</small><b>{info.file}</b></div><div><small>고유식별정보</small><b>{[info.passport && "여권번호", info.license && "운전면허번호", info.alien && "외국인등록번호"].filter(Boolean).join(", ") || "없음"}</b></div><div><small>미충족 안전조치</small><b className={checks.every(Boolean) ? "good-text" : "bad-text"}>{checks.filter(v => !v).length}개</b></div><div><small>분석 기준</small><b>안내서 2025.11 · 부록 제2장</b></div></div>
          <div className="callout"><AlertTriangle size={18} /><p><b>중요</b><span>결과보고서는 사실에 근거해 작성하고 운영환경 변경 시 다시 분석해야 합니다.</span></p></div>
          <div className="form-actions"><button className="secondary-btn" onClick={() => setStep(2)}>이전</button><button className="primary-btn" onClick={run}><Radar size={16} /> 분석 실행</button></div>
        </>}
        {step === 4 && <div className="risk-result">
          <span className={cx("result-seal", result === "optional" && "result-seal--good")}>{result === "optional" ? <CheckCircle2 size={34} /> : <LockKeyhole size={34} />}</span>
          <span className="section-kicker">ANALYSIS COMPLETE</span><h2>{result === "optional" ? "현 상태에서 암호화 미적용을 검토할 수 있습니다." : "암호화 적용이 필요합니다."}</h2>
          <p>{result === "optional" ? "모든 최소 안전조치를 충족했습니다. 내부결재 후 결과보고서를 보관하세요." : `미충족 항목 ${checks.filter(v => !v).length}개가 확인되었습니다. 안전조치를 보완하거나 고유식별정보를 암호화하세요.`}</p>
          <div className="result-actions"><button className="primary-btn" onClick={() => notify("결과보고서 PDF가 다운로드 목록에 준비되었습니다.")}><Download size={16} /> 결과보고서</button><button className="secondary-btn" onClick={() => { setResult(null); setStep(1); }}>새 분석</button></div>
        </div>}
      </div>
      <aside className="guide-aside panel">
        <span className="guide-aside__mark"><BookOpenCheck size={22} /></span><span className="section-kicker">GUIDE NOTE</span><h3>위험도 분석은 암호화의 예외를 입증하는 절차입니다.</h3><p>단순 체크리스트가 아니라 현재 안전조치와 유출 시 정보주체 권리 침해 위험을 함께 분석해야 합니다.</p>
        <ul><li><Check size={14} /> 개인정보파일 단위로 분석</li><li><Check size={14} /> 하나라도 ‘아니요’면 암호화</li><li><Check size={14} /> 환경 변경 시 재분석</li><li><Check size={14} /> CPO 또는 부서장 결재 후 보관</li></ul>
        <div className="aside-source">개인정보의 안전성 확보조치 기준 안내서<br /><b>2025.11 · 162~188쪽</b></div>
      </aside>
    </section>
  </div>;
}

function VendorsPage({ vendors, setVendors, notify }) {
  const [filter, setFilter] = useState("전체");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(1);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const rows = vendors.filter(v => (filter === "전체" || v.status === filter) && (v.name + v.service).includes(query));
  const chosen = vendors.find(v => v.id === selected) || vendors[0];
  const add = e => { e.preventDefault(); if (!newName.trim()) return; const item = { id: Date.now(), name: newName.trim(), service: "신규 위탁업무", status: "미응답", score: 0, due: "2026.08.05", evidence: 0, issue: "점검 요청 준비" }; setVendors(v => [...v, item]); setSelected(item.id); setAdding(false); setNewName(""); notify("새 수탁자가 등록되었습니다."); };
  const request = () => { setVendors(v => v.map(x => x.id === chosen.id ? { ...x, status: "점검중", issue: "점검 요청 발송 완료" } : x)); notify(`${chosen.name} 담당자에게 점검 요청을 발송했습니다.`); };
  return <div className="page">
    <section className="vendor-metrics metrics-row">
      <article><span className="metric-icon metric-icon--navy"><Users size={18} /></span><div><small>전체 수탁자</small><strong>{vendors.length}<em>개사</em></strong></div><p>활성 계약 기준</p></article>
      <article><span className="metric-icon metric-icon--green"><CheckCircle2 size={18} /></span><div><small>점검 완료</small><strong>{vendors.filter(v => v.status === "양호").length}<em>개사</em></strong></div><p>이번 분기</p></article>
      <article><span className="metric-icon metric-icon--orange"><AlertTriangle size={18} /></span><div><small>주의 필요</small><strong>{vendors.filter(v => ["위험", "미응답"].includes(v.status)).length}<em>개사</em></strong></div><p>미흡·미응답</p></article>
      <article><span className="metric-icon metric-icon--plum"><FileCheck2 size={18} /></span><div><small>AI 증적 검토</small><strong>47<em>건</em></strong></div><p>일치율 91%</p></article>
    </section>
    <section className="vendor-layout">
      <div className="vendor-table panel">
        <div className="table-toolbar"><label><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="수탁자 또는 위탁업무 검색" /></label><div>{["전체", "위험", "점검중", "미응답"].map(v => <button onClick={() => setFilter(v)} className={filter === v ? "is-active" : ""} key={v}>{v}</button>)}</div><button className="primary-btn" onClick={() => setAdding(true)}><Plus size={15} /> 수탁자 추가</button></div>
        <div className="table-head"><span>수탁자 / 위탁업무</span><span>상태</span><span>준수점수</span><span>증적</span><span>제출기한</span></div>
        <div className="table-body">{rows.map(v => <button key={v.id} onClick={() => setSelected(v.id)} className={cx("table-row", selected === v.id && "is-active")}><span><i>{v.name[0]}</i><b>{v.name}<small>{v.service}</small></b></span><span><Status tone={v.status === "양호" ? "good" : v.status === "위험" ? "bad" : v.status === "점검중" ? "warn" : "neutral"}>{v.status}</Status></span><strong className={v.score < 60 ? "bad-text" : v.score < 85 ? "warn-text" : "good-text"}>{v.score || "—"}</strong><span>{v.evidence}건</span><span>{v.due}</span></button>)}</div>
      </div>
      <aside className="vendor-detail panel">
        <div className="vendor-title"><span>{chosen.name[0]}</span><div><h3>{chosen.name}</h3><p>{chosen.service}</p></div><button><MoreHorizontal size={18} /></button></div>
        <div className="vendor-score"><Donut value={chosen.score || 0} label="수탁자 점수" size={112} /><div><Status tone={chosen.status === "양호" ? "good" : chosen.status === "위험" ? "bad" : "warn"}>{chosen.status}</Status><p>{chosen.issue}</p></div></div>
        <div className="detail-facts"><div><small>제출기한</small><b>{chosen.due}</b></div><div><small>증적자료</small><b>{chosen.evidence}건</b></div><div><small>담당자</small><b>박수탁 매니저</b></div><div><small>최근 점검</small><b>2026. 04. 18</b></div></div>
        <div className="evidence-review"><span><Sparkles size={15} /> AI 증적 검토</span><b>{chosen.evidence ? "답변-증적 일치율 88%" : "검토할 증적이 없습니다"}</b><p>{chosen.evidence ? "보안서약서의 유효기간이 답변과 다릅니다." : "점검 요청 후 제출된 증적을 자동으로 대조합니다."}</p></div>
        <button className="primary-btn wide" onClick={request}><ArrowUpRight size={16} /> {chosen.status === "점검중" ? "점검 요청 다시 보내기" : "점검 요청 보내기"}</button>
      </aside>
    </section>
    {adding && <div className="modal-backdrop" onMouseDown={() => setAdding(false)}><form className="modal" onSubmit={add} onMouseDown={e => e.stopPropagation()}><button type="button" className="modal-close" onClick={() => setAdding(false)}><X size={18} /></button><span className="section-kicker">NEW PROCESSOR</span><h2>수탁자 추가</h2><p>점검을 요청할 수탁자 정보를 등록합니다.</p><label className="field"><span>회사명</span><input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="예: 클라우드파트너" /></label><button className="primary-btn wide" type="submit">등록하고 점검 준비</button></form></div>}
  </div>;
}

function ProjectsPage({ notify }) {
  const [expanded, setExpanded] = useState("멤버십 2.0");
  const [checks, setChecks] = useState([true, true, false, false]);
  return <div className="page">
    <section className="pbd-hero panel"><div><span className="section-kicker">PRIVACY BY DESIGN</span><h2>출시 이후가 아니라,<br />설계하는 지금 점검하세요.</h2><p>기획·개발·출시 게이트마다 필요한 개인정보 보호조치를 팀과 함께 확인합니다.</p><button className="primary-btn" onClick={() => notify("새 프로젝트 템플릿이 준비되었습니다.")}><Plus size={16} /> 새 프로젝트</button></div><div className="pbd-visual"><span>IDEA</span><i /><span>DESIGN</span><i /><span className="is-active">REVIEW</span><i /><span>LAUNCH</span><strong><ShieldCheck size={38} /></strong></div></section>
    <section className="project-grid">
      {PROJECTS.map(p => <article key={p.name} className={cx("project-card panel", expanded === p.name && "is-active")} onClick={() => setExpanded(p.name)}>
        <div className="project-card__top"><Status tone={p.stage === "개선 중" ? "bad" : p.stage === "설계 검토" ? "warn" : "neutral"}>{p.stage}</Status><button><MoreHorizontal size={18} /></button></div><h3>{p.name}</h3><p>{p.owner} · {p.date}</p><div className="project-progress"><span><b>점검 진행률</b><em>{p.progress}%</em></span><i><u style={{ width: `${p.progress}%` }} /></i></div><div className="project-meta"><span><AlertTriangle size={14} /> 열린 위험 <b>{p.risk}</b></span><span><FileCheck2 size={14} /> 연결 증적 <b>{Math.round(p.progress / 8)}</b></span></div>
      </article>)}
    </section>
    <section className="gate-board panel"><div className="section-heading"><div><span className="section-kicker">CURRENT GATE</span><h3>{expanded} · 설계 검토</h3></div><Status tone="warn">2개 조치 필요</Status></div><div className="gate-list">{["처리 목적과 최소 수집항목이 기획서에 명시되어 있나요?", "보유기간과 파기 트리거가 데이터 설계에 반영되었나요?", "관리자 화면에 최소권한과 접근기록이 설계되어 있나요?", "위탁·재위탁 흐름과 국외이전 여부를 확인했나요?"].map((v, i) => <button key={v} onClick={() => setChecks(c => c.map((x, n) => n === i ? !x : x))}><span className={checks[i] ? "is-checked" : ""}>{checks[i] && <Check size={14} />}</span><b>{v}</b><em>{checks[i] ? "확인" : "검토 필요"}</em></button>)}</div></section>
  </div>;
}

function DocumentsPage({ notify }) {
  const [selected, setSelected] = useState("plan");
  const [generated, setGenerated] = useState(false);
  const [content, setContent] = useState("");
  const generate = () => { setGenerated(true); setContent("제1장 총칙\n\n제1조(목적) 본 내부 관리계획은 개인정보의 분실·도난·유출·위조·변조 또는 훼손을 방지하고, 개인정보 보호법 제29조 및 개인정보의 안전성 확보조치 기준에 따른 기술적·관리적·물리적 안전조치를 정함을 목적으로 한다.\n\n제2장 개인정보 보호 조직\n\n개인정보 보호책임자는 본 계획의 적정성과 실효성을 보장하기 위하여 연 1회 이상 이행 여부를 점검하고, 중요한 변경사항을 즉시 반영하며 수정 이력을 관리한다.\n\n제3장 접근권한 및 접근통제\n\n개인정보처리시스템의 접근권한은 업무상 필요한 최소한으로 부여하며, 외부 접속에는 안전한 인증수단을 적용한다."); notify("현재 점검 데이터를 반영해 문서 초안을 만들었습니다."); };
  const download = () => { const blob = new Blob([content], { type: "text/plain;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "GuardNote_내부관리계획_초안.txt"; a.click(); URL.revokeObjectURL(url); notify("문서 초안을 다운로드했습니다."); };
  return <div className="page documents-page">
    <section className="docs-intro"><div><span className="section-kicker">SMART DOCUMENTS</span><h2>점검을 끝냈다면,<br />문서는 이미 절반 완성됐습니다.</h2><p>답변, 담당자, 증적, 개선과제를 연결해 검토 가능한 초안을 만듭니다.</p></div><div className="docs-stamp"><Sparkles size={22} /><strong>43</strong><span>개 데이터 포인트<br />자동 반영 가능</span></div></section>
    <section className="docs-layout">
      <div className="template-grid">{DOCUMENTS.map(({ id, title, desc, meta, icon: Icon }) => <button key={id} onClick={() => { setSelected(id); setGenerated(false); }} className={cx("template-card", selected === id && "is-active")}><span><Icon size={20} /></span><Status tone={id === "plan" ? "good" : "neutral"}>{id === "plan" ? "추천" : "템플릿"}</Status><h3>{title}</h3><p>{desc}</p><small>{meta}</small><ChevronRight size={17} /></button>)}</div>
      <aside className="generator panel">
        {!generated ? <><span className="generator__icon"><FileText size={25} /></span><span className="section-kicker">READY TO GENERATE</span><h3>{DOCUMENTS.find(d => d.id === selected)?.title}</h3><p>현재 워크스페이스의 진단 결과와 증적 메타데이터를 반영합니다. 확정되지 않은 내용은 빈칸으로 표시됩니다.</p><div className="data-points"><span><Check size={13} /> 회사 기본정보</span><span><Check size={13} /> 10개 조치영역</span><span><Check size={13} /> 담당자·기한</span><span><Check size={13} /> 개선과제</span></div><button className="primary-btn wide" onClick={generate}><Sparkles size={16} /> 안전한 초안 만들기</button><small className="generator-note">생성 결과는 법률 자문이 아니며 담당자의 최종 검토가 필요합니다.</small></> : <><div className="generated-head"><div><Status tone="good">초안 생성 완료</Status><h3>내부 관리계획 v0.1</h3></div><button className="icon-btn" onClick={() => setGenerated(false)}><X size={17} /></button></div><textarea value={content} onChange={e => setContent(e.target.value)} aria-label="생성된 문서 초안" /><div className="form-actions"><button className="secondary-btn" onClick={() => setGenerated(false)}>다시 생성</button><button className="primary-btn" onClick={download}><Download size={15} /> 다운로드</button></div></>}
      </aside>
    </section>
  </div>;
}

function EvidencePage({ notify }) {
  const [filter, setFilter] = useState("전체");
  const events = [
    { time: "17:18:42", area: "제8조 접속기록", action: "대량 다운로드 이상징후 검토 완료", actor: "김가드", hash: "8e31…a42f", tone: "warn" },
    { time: "16:44:09", area: "제5조 접근권한", action: "퇴직자 2명 계정 말소 증적 연결", actor: "이인프라", hash: "9c21…d113", tone: "good" },
    { time: "15:02:17", area: "수탁자 관리", action: "클라우드웨이브 증적 14건 수신", actor: "박수탁", hash: "14bd…88ca", tone: "neutral" },
    { time: "11:26:51", area: "제13조 파기", action: "파기 대상 248건 승인 요청", actor: "최데이터", hash: "f2b7…10e4", tone: "bad" },
    { time: "09:10:03", area: "제4조 내부 관리계획", action: "2026년 정기 이행점검 시작", actor: "김가드", hash: "0aa1…3f71", tone: "good" },
  ];
  const shown = events.filter(e => filter === "전체" || e.area.includes(filter));
  const exportCsv = () => { const csv = "시간,영역,활동,담당자,무결성\n" + events.map(e => [e.time, e.area, e.action, e.actor, e.hash].join(",")).join("\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = "guardnote-evidence-ledger.csv"; a.click(); URL.revokeObjectURL(url); notify("증적 원장을 CSV로 내보냈습니다."); };
  return <div className="page">
    <section className="vault-hero panel"><div className="vault-shield"><FolderLock size={33} /></div><div><span className="section-kicker">EVIDENCE INTEGRITY</span><h2>증적 원장 무결성 정상</h2><p>마지막 검증 2026.07.22 17:21 · 연결된 148개 기록이 모두 일치합니다.</p></div><div className="vault-hash"><small>LATEST ANCHOR</small><code>0x8e31c9…a42f</code><Status tone="good">VERIFIED</Status></div><button className="primary-btn" onClick={() => notify("148개 기록의 해시 체인이 모두 일치합니다.")}><ShieldCheck size={16} /> 지금 검증</button></section>
    <section className="ledger panel"><div className="section-heading"><div><span className="section-kicker">AUDIT TRAIL</span><h3>최근 증적 활동</h3></div><div className="ledger-actions">{["전체", "제8조", "수탁자"].map(v => <button className={filter === v ? "is-active" : ""} onClick={() => setFilter(v)} key={v}>{v}</button>)}<button className="secondary-btn" onClick={exportCsv}><Download size={14} /> CSV</button></div></div><div className="ledger-head"><span>시간</span><span>조치영역</span><span>활동</span><span>담당자</span><span>무결성</span></div><div className="ledger-body">{shown.map((e, i) => <div className="ledger-row" key={e.hash}><span>{e.time}</span><span><i className={`event-dot event-dot--${e.tone}`} />{e.area}</span><b>{e.action}</b><span>{e.actor}</span><code>{e.hash} <CheckCircle2 size={13} /></code>{i < shown.length - 1 && <u />}</div>)}</div></section>
  </div>;
}

function NotificationDrawer({ open, onClose }) {
  return <><button onClick={onClose} className={cx("drawer-scrim", open && "is-open")} aria-label="알림 닫기" /><aside className={cx("drawer", open && "is-open")}><div className="drawer-head"><div><span className="section-kicker">INBOX</span><h2>알림</h2></div><button className="icon-btn" onClick={onClose}><X size={18} /></button></div><div className="notification-list"><article className="unread"><span><AlertTriangle size={17} /></span><div><b>외부접속 MFA 미적용</b><p>제6조 접근통제에서 2개 계정의 보완이 필요합니다.</p><small>12분 전</small></div></article><article className="unread"><span><Users size={17} /></span><div><b>수탁자 점검 마감 임박</b><p>리서치온이 아직 점검에 응답하지 않았습니다.</p><small>1시간 전</small></div></article><article><span><CheckCircle2 size={17} /></span><div><b>증적 무결성 검증 완료</b><p>오늘 연결된 14개 기록이 모두 정상입니다.</p><small>3시간 전</small></div></article></div></aside></>;
}

export default function GuardNote() {
  const [page, setPage] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [doneActions, setDoneActions] = useState({});
  const [answers, setAnswers] = useState({});
  const [evidenceFiles, setEvidenceFiles] = useState({});
  const [vendors, setVendors] = useState(INITIAL_VENDORS);
  const timer = useRef(null);
  const notify = message => { setToast(message); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(""), 2600); };
  const go = id => { setPage(id); setSearch(""); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const content = useMemo(() => {
    if (page === "dashboard") return <Dashboard onPage={go} doneActions={doneActions} toggleAction={id => { setDoneActions(p => ({ ...p, [id]: !p[id] })); notify(doneActions[id] ? "처리 완료를 취소했습니다." : "처리 완료로 기록했습니다."); }} />;
    if (page === "audit") return <AuditPage answers={answers} setAnswers={setAnswers} evidenceFiles={evidenceFiles} setEvidenceFiles={setEvidenceFiles} notify={notify} />;
    if (page === "risk") return <RiskPage notify={notify} />;
    if (page === "vendors") return <VendorsPage vendors={vendors} setVendors={setVendors} notify={notify} />;
    if (page === "projects") return <ProjectsPage notify={notify} />;
    if (page === "documents") return <DocumentsPage notify={notify} />;
    return <EvidencePage notify={notify} />;
  }, [page, doneActions, answers, evidenceFiles, vendors]);

  return <div className="app-shell">
    <Sidebar page={page} onPage={go} open={menuOpen} onClose={() => setMenuOpen(false)} />
    <main className="main-shell">
      <Topbar page={page} onMenu={() => setMenuOpen(true)} onNotify={() => setNotifyOpen(true)} search={search} setSearch={setSearch} />
      {search && <div className="search-result"><Search size={17} /><span><b>“{search}”</b> 검색 준비됨</span><p>현재 화면의 통제·수탁자·증적을 필터링하려면 Enter를 누르세요.</p><button onClick={() => setSearch("")}><X size={16} /></button></div>}
      {content}
      <footer className="app-footer"><Logo compact /><span>GuardNote Compliance OS</span><p>기준 출처: 개인정보보호위원회 「개인정보의 안전성 확보조치 기준 안내서」 2025.11.</p><em>마지막 동기화 17:21</em></footer>
    </main>
    <NotificationDrawer open={notifyOpen} onClose={() => setNotifyOpen(false)} />
    <div className={cx("toast", toast && "is-visible")}><CheckCircle2 size={17} />{toast}</div>
  </div>;
}
