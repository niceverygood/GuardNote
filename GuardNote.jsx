import React, { useState, useEffect, useCallback } from "react";
import {
  Shield, ShieldCheck, ShieldAlert, FileCheck2, AlertTriangle, Lock, KeyRound,
  Eye, Database, FileText, Server, Siren, Link2, BadgeCheck, Download, Clock,
  ChevronRight, X, Check, CheckCircle2, AlertCircle, Fingerprint, ScrollText,
  Building2, UserCog, Activity, HardDriveDownload, Flame, Copy
} from "lucide-react";

/* ───────────────────────── palette: "ink ledger + brass seal" ───────────────────────── */
const C = {
  ink: "#0E1621", ink2: "#16202D", ink3: "#1F2B3A",
  paper: "#F4F1E9", card: "#FBFAF6", line: "#E4DECF", line2: "#EFE9DC",
  brass: "#A9852E", brass2: "#C7A14A", brassBg: "#F3ECD8",
  green: "#2F7D55", greenBg: "#E7F1EA",
  amber: "#9C7322", amberBg: "#F6EFD9",
  red: "#A8412B", redBg: "#F4E4DE",
  text: "#1B2632", sub: "#4A5562", mut: "#7A8593",
};

const SERIF = "'Iowan Old Style','Palatino Linotype','Book Antiqua',Palatino,Georgia,serif";
const MONO = "'SF Mono','Roboto Mono',Menlo,Consolas,'Liberation Mono',monospace";

/* ───────────────────────── crypto ───────────────────────── */
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const GENESIS = "0000000000000000000000000000000000000000000000000000000000000000";
const payload = (e) => `${e.seq}|${e.ts}|${e.catKey}|${e.actor}|${e.action}`;

/* ───────────────────────── compliance domain (안전성 확보조치 기준) ───────────────────────── */
const CATS = [
  { key: "plan",   icon: ScrollText, name: "내부 관리계획 수립·시행", status: "ok",   items: 6, last: "2026-06-12" },
  { key: "auth",   icon: UserCog,    name: "접근 권한의 관리",        status: "ok",   items: 41, last: "2026-06-28" },
  { key: "access", icon: Lock,       name: "접근 통제",               status: "ok",   items: 18, last: "2026-06-27" },
  { key: "crypto", icon: KeyRound,   name: "개인정보의 암호화",       status: "ok",   items: 9,  last: "2026-06-20" },
  { key: "log",    icon: Activity,   name: "접속기록 보관·점검",      status: "warn", items: 12, last: "2026-05-31" },
  { key: "malware",icon: ShieldAlert,name: "악성프로그램 등 방지",    status: "ok",   items: 7,  last: "2026-06-25" },
  { key: "phys",   icon: Building2,  name: "물리적 안전조치",         status: "ok",   items: 4,  last: "2026-06-10" },
  { key: "disaster",icon: Server,    name: "재해·재난 대비",          status: "warn", items: 3,  last: "2026-04-18" },
  { key: "output", icon: Copy,       name: "출력·복사 시 보호조치",   status: "ok",   items: 5,  last: "2026-06-22" },
];
const catName = (k) => CATS.find((c) => c.key === k)?.name ?? k;

const RAW = [
  { ts: "2026-06-28 09:14", catKey: "auth",   actor: "한승수", action: "신규 입사자 개인정보 접근권한 부여 — 대표 승인 (열람: CS DB / 부여기간 한정)" },
  { ts: "2026-06-27 18:02", catKey: "access", actor: "이수빈", action: "관리자 콘솔 접속 IP 화이트리스트 갱신 — 2개 추가, 1개 회수" },
  { ts: "2026-06-25 11:30", catKey: "malware",actor: "김상주", action: "백신·EDR 정책 점검 및 정의 업데이트 검증 완료 (전 단말 17대)" },
  { ts: "2026-06-22 16:45", catKey: "output", actor: "유하니", action: "개인정보 포함 보고서 출력 워터마크·반출대장 기록 정책 점검" },
  { ts: "2026-06-20 10:08", catKey: "crypto", actor: "김동호", action: "DB 암호화 키 정기 교체 (KMS) — 고유식별정보 컬럼 재암호화 완료" },
  { ts: "2026-06-18 14:20", catKey: "auth",   actor: "이수빈", action: "퇴사자 1인 접근권한 즉시 회수 및 계정 비활성화 — 회수 확인" },
  { ts: "2026-06-15 13:00", catKey: "plan",   actor: "전직원", action: "개인정보 취급자 정기 보안교육 이수 (6/6명) — 수료 기록 첨부" },
  { ts: "2026-06-12 09:50", catKey: "plan",   actor: "한승수", action: "내부 관리계획 v3.2 개정·시행 — 보유기간·파기절차 조항 갱신" },
  { ts: "2026-05-31 17:40", catKey: "log",    actor: "이수빈", action: "접속기록 월간 점검 완료 — 비정상 접근 0건, 점검결과 보존" },
];

/* ───────────────────────── tiny UI atoms ───────────────────────── */
function Pill({ tone = "ok", children, icon: Ic }) {
  const map = {
    ok:   { bg: C.greenBg, fg: C.green, bd: "#CFE3D8" },
    warn: { bg: C.amberBg, fg: C.amber, bd: "#E8DCB8" },
    bad:  { bg: C.redBg,   fg: C.red,   bd: "#E7CCC2" },
    ink:  { bg: C.brassBg, fg: C.brass, bd: "#E6D8AE" },
  }[tone];
  return (
    <span style={{ background: map.bg, color: map.fg, border: `1px solid ${map.bd}` }}
      className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-semibold tracking-tight whitespace-nowrap">
      {Ic && <Ic size={12} strokeWidth={2.4} />}{children}
    </span>
  );
}

function Tab({ active, onClick, icon: Ic, label }) {
  return (
    <button onClick={onClick}
      style={{ color: active ? C.paper : "#9FB0C2",
        borderBottom: active ? `2px solid ${C.brass2}` : "2px solid transparent" }}
      className="group inline-flex items-center gap-2 px-1 pb-3 pt-2 text-sm font-medium transition-colors">
      <Ic size={16} strokeWidth={2} style={{ color: active ? C.brass2 : "#7C8DA0" }} />
      {label}
    </button>
  );
}

/* ───────────────────────── Hash cell ───────────────────────── */
function Hash({ value, broken }) {
  return (
    <span style={{ fontFamily: MONO, color: broken ? C.red : C.sub }}
      className="text-[10.5px] tracking-tight">
      {value.slice(0, 10)}<span style={{ color: broken ? C.red : C.mut }}>…{value.slice(-6)}</span>
    </span>
  );
}

/* ════════════════════════ APP ════════════════════════ */
export default function GuardNote() {
  const [tab, setTab] = useState("status");
  const [entries, setEntries] = useState([]);     // live content (can be tampered)
  const [stored, setStored] = useState([]);        // immutable recorded hashes
  const [valid, setValid] = useState(null);        // bool[] per entry after verify
  const [verifying, setVerifying] = useState(false);
  const [verifiedAt, setVerifiedAt] = useState(null);
  const [tampered, setTampered] = useState(false);
  const [pkgOpen, setPkgOpen] = useState(false);

  /* build the chain once */
  useEffect(() => {
    (async () => {
      const ordered = [...RAW].reverse().map((e, i) => ({ ...e, seq: i + 1 }));
      let prev = GENESIS;
      const built = [];
      const hashes = [];
      for (const e of ordered) {
        const h = await sha256(payload(e) + prev);
        built.push({ ...e, prevHash: prev, hash: h });
        hashes.push(h);
        prev = h;
      }
      setEntries(built);
      setStored(hashes);
    })();
  }, []);

  /* recompute chain forward from current content, compare to stored */
  const verify = useCallback(async () => {
    setVerifying(true);
    setValid(null);
    await new Promise((r) => setTimeout(r, 480));
    let prev = GENESIS;
    const res = [];
    for (let i = 0; i < entries.length; i++) {
      const h = await sha256(payload(entries[i]) + prev);
      res.push(h === stored[i]);
      prev = h; // cascade: a tampered record invalidates everything downstream
    }
    setValid(res);
    setVerifying(false);
    setVerifiedAt(new Date());
  }, [entries, stored]);

  const tamper = () => {
    // silently edit a historical record's content — as a bad actor backdating would
    setEntries((prev) =>
      prev.map((e) => (e.seq === 6 ? { ...e, action: "[사후수정] 접근권한 회수 일자를 사고 이전으로 변경" } : e))
    );
    setTampered(true);
    setValid(null);
    setVerifiedAt(null);
  };
  const reset = () => {
    setEntries((prev) =>
      prev.map((e) => (e.seq === 6 ? { ...e, action: RAW[3].action /* 회수 원문 */ } : e))
    );
    // restore exact original
    setEntries((prev) => prev.map((e) => {
      const orig = [...RAW].reverse().map((x, i) => ({ ...x, seq: i + 1 })).find((x) => x.seq === e.seq);
      return { ...e, action: orig.action };
    }));
    setTampered(false);
    setValid(null);
    setVerifiedAt(null);
  };

  const okCount = CATS.filter((c) => c.status === "ok").length;
  const score = Math.round((okCount / CATS.length) * 100);
  const intact = valid && valid.every(Boolean);
  const brokenFrom = valid ? valid.findIndex((v) => !v) : -1;

  return (
    <div style={{ background: C.paper, color: C.text, fontFamily: "ui-sans-serif,system-ui,'Apple SD Gothic Neo','Malgun Gothic',sans-serif" }}
      className="min-h-screen w-full">

      {/* ── top bar ── */}
      <header style={{ background: C.ink }} className="px-5 pt-4 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div style={{ background: `linear-gradient(135deg,${C.brass2},${C.brass})` }}
                className="grid h-8 w-8 place-items-center rounded-[7px] shadow-sm">
                <Shield size={17} strokeWidth={2.4} color={C.ink} />
              </div>
              <div className="leading-none">
                <div className="flex items-center gap-1.5">
                  <span style={{ color: C.paper, fontFamily: SERIF }} className="text-[17px] font-semibold tracking-tight">가드노트</span>
                  <span style={{ color: "#7C8DA0" }} className="text-[11px] font-medium">GuardNote</span>
                </div>
                <div style={{ color: "#8A9BAD" }} className="mt-[3px] text-[10.5px]">개인정보 안전조치 상시 증적 시스템</div>
              </div>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <span style={{ color: "#8A9BAD" }} className="text-[11px]">개인정보보호책임자</span>
              <span style={{ color: C.paper }} className="text-[12px] font-medium">한승수 · ㈜바틀</span>
            </div>
          </div>
          <nav className="mt-4 flex items-center gap-6">
            <Tab active={tab === "status"} onClick={() => setTab("status")} icon={ShieldCheck} label="방어 현황" />
            <Tab active={tab === "ledger"} onClick={() => setTab("ledger")} icon={Link2} label="증적 원장" />
            <Tab active={tab === "breach"} onClick={() => setTab("breach")} icon={Siren} label="유출 대응" />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-7 sm:px-8">
        {tab === "status" && (
          <StatusView score={score} okCount={okCount} onOpenPkg={() => setPkgOpen(true)} />
        )}
        {tab === "ledger" && (
          <LedgerView
            entries={entries} valid={valid} verifying={verifying} verifiedAt={verifiedAt}
            tampered={tampered} onVerify={verify} onTamper={tamper} onReset={reset}
            intact={intact} brokenFrom={brokenFrom}
          />
        )}
        {tab === "breach" && <BreachView />}
      </main>

      {pkgOpen && <PackageModal onClose={() => setPkgOpen(false)} />}
    </div>
  );
}

/* ════════════════════════ 1. 방어 현황 ════════════════════════ */
function StatusView({ score, okCount, onOpenPkg }) {
  const ring = 2 * Math.PI * 52;
  return (
    <div className="space-y-6">
      {/* hero */}
      <section style={{ background: C.ink, border: `1px solid ${C.ink3}` }}
        className="overflow-hidden rounded-2xl">
        <div className="grid gap-6 p-6 sm:grid-cols-[auto,1fr] sm:p-8">
          {/* gauge */}
          <div className="mx-auto sm:mx-0">
            <div className="relative grid h-[148px] w-[148px] place-items-center">
              <svg width="148" height="148" className="-rotate-90">
                <circle cx="74" cy="74" r="52" fill="none" stroke="#243246" strokeWidth="11" />
                <circle cx="74" cy="74" r="52" fill="none" stroke="url(#g)" strokeWidth="11"
                  strokeLinecap="round" strokeDasharray={ring}
                  strokeDashoffset={ring - (ring * score) / 100} />
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor={C.brass2} /><stop offset="1" stopColor={C.green} />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute text-center leading-none">
                <div style={{ color: C.paper, fontFamily: SERIF }} className="text-[40px] font-semibold">{score}</div>
                <div style={{ color: "#8A9BAD" }} className="mt-1 text-[11px] tracking-wide">방어 준비도</div>
              </div>
            </div>
          </div>
          {/* verdict */}
          <div className="flex flex-col justify-center">
            <Pill tone="ink" icon={BadgeCheck}>입증 가능 상태</Pill>
            <h1 style={{ color: C.paper, fontFamily: SERIF }} className="mt-3 text-[22px] font-semibold leading-snug sm:text-[25px]">
              지금 조사·손해배상 청구가 들어와도<br className="hidden sm:block" /> 안전조치 이행을 입증할 수 있습니다.
            </h1>
            <p style={{ color: "#9FB0C2" }} className="mt-2.5 max-w-xl text-[13px] leading-relaxed">
              개인정보보호법상 손해배상 책임은 사업자가 <span style={{ color: C.brass2 }}>“고의·과실 없음”을 입증</span>해야 면책됩니다.
              가드노트는 9개 안전성 확보조치의 이행 증적을 위변조 불가능한 형태로 상시 축적해, 제출 가능한 방어 자료로 보관합니다.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button onClick={onOpenPkg}
                style={{ background: `linear-gradient(135deg,${C.brass2},${C.brass})`, color: C.ink }}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold shadow-sm transition active:scale-[.98]">
                <Download size={15} strokeWidth={2.4} /> 증거 패키지 생성
              </button>
              <div style={{ color: "#8A9BAD" }} className="flex items-center gap-1.5 text-[11.5px]">
                <Clock size={13} /> 마지막 무결성 검증 · 오늘 08:30
              </div>
            </div>
          </div>
        </div>
        {/* footer stat strip */}
        <div style={{ borderTop: `1px solid ${C.ink3}` }} className="grid grid-cols-3 divide-x" >
          {[
            { n: `${okCount}/${CATS.length}`, l: "이행 완료 항목" },
            { n: "1,420", l: "보존 중인 증적 (1년+)" },
            { n: "0건", l: "미해결 비정상 접근" },
          ].map((s, i) => (
            <div key={i} style={{ borderColor: C.ink3 }} className="px-5 py-3.5 text-center sm:text-left">
              <div style={{ color: C.paper, fontFamily: SERIF }} className="text-[19px] font-semibold">{s.n}</div>
              <div style={{ color: "#8A9BAD" }} className="text-[11px]">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* category grid */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 style={{ color: C.text }} className="text-[15px] font-semibold tracking-tight">안전성 확보조치 9개 항목</h2>
          <span style={{ color: C.mut }} className="text-[11.5px]">개인정보의 안전성 확보조치 기준 (고시) 기준</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CATS.map((c, i) => {
            const Ic = c.icon;
            const warn = c.status === "warn";
            return (
              <div key={c.key}
                style={{ background: C.card, border: `1px solid ${warn ? "#E8DCB8" : C.line}` }}
                className="group rounded-xl p-4 transition hover:shadow-sm">
                <div className="flex items-start justify-between">
                  <div style={{ background: warn ? C.amberBg : C.brassBg }}
                    className="grid h-9 w-9 place-items-center rounded-lg">
                    <Ic size={17} strokeWidth={2} color={warn ? C.amber : C.brass} />
                  </div>
                  {warn
                    ? <Pill tone="warn" icon={AlertCircle}>점검 필요</Pill>
                    : <Pill tone="ok" icon={Check}>이행</Pill>}
                </div>
                <div style={{ color: C.text }} className="mt-3 text-[13.5px] font-semibold leading-snug">
                  <span style={{ color: C.mut, fontFamily: MONO }} className="mr-1.5 text-[11px]">{String(i + 1).padStart(2, "0")}</span>
                  {c.name}
                </div>
                <div className="mt-2.5 flex items-center justify-between">
                  <span style={{ color: C.sub }} className="text-[11.5px]">증적 {c.items}건</span>
                  <span style={{ color: warn ? C.amber : C.mut }} className="text-[11.5px]">
                    {warn ? "갱신 권장" : `최근 ${c.last}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* ════════════════════════ 2. 증적 원장 (signature) ════════════════════════ */
function LedgerView({ entries, valid, verifying, verifiedAt, tampered, onVerify, onTamper, onReset, intact, brokenFrom }) {
  return (
    <div className="space-y-5">
      {/* explainer + controls */}
      <section style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <div className="flex items-center gap-2">
              <Fingerprint size={18} color={C.brass} strokeWidth={2.2} />
              <h2 style={{ color: C.text, fontFamily: SERIF }} className="text-[17px] font-semibold">위변조 불가능 증적 원장</h2>
            </div>
            <p style={{ color: C.sub }} className="mt-2 text-[12.5px] leading-relaxed">
              모든 안전조치 활동은 기록 즉시 직전 기록의 해시와 연결되어 봉인됩니다(해시 체인).
              한 건이라도 사후에 고치면 그 지점부터 모든 연결이 깨져, <span style={{ color: C.red, fontWeight: 600 }}>조작 사실이 즉시 드러납니다.</span>
              사고 후 날짜를 끼워넣는 식의 방어는 오히려 증거인멸이 됩니다 — 가드노트가 막아주는 건 바로 그 유혹입니다.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-[200px]">
            <button onClick={onVerify} disabled={verifying}
              style={{ background: C.ink, color: C.paper }}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition active:scale-[.98] disabled:opacity-60">
              {verifying ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> 검증 중…</>
                : <><ShieldCheck size={15} strokeWidth={2.4} /> 무결성 검증</>}
            </button>
            {!tampered
              ? <button onClick={onTamper}
                  style={{ color: C.red, border: `1px solid ${C.line}`, background: "#fff" }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition hover:bg-[#FBF3F0]">
                  <Flame size={13} /> 변조 시뮬레이션
                </button>
              : <button onClick={onReset}
                  style={{ color: C.sub, border: `1px solid ${C.line}`, background: "#fff" }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition hover:bg-[#F4F1E9]">
                  원장 원복
                </button>}
          </div>
        </div>

        {/* verdict banner */}
        {valid && (
          <div style={{
            background: intact ? C.greenBg : C.redBg,
            border: `1px solid ${intact ? "#CFE3D8" : "#E7CCC2"}`,
          }} className="mt-4 flex items-start gap-3 rounded-xl px-4 py-3">
            {intact
              ? <BadgeCheck size={20} color={C.green} strokeWidth={2.2} className="mt-[1px] shrink-0" />
              : <AlertTriangle size={20} color={C.red} strokeWidth={2.2} className="mt-[1px] shrink-0" />}
            <div>
              <div style={{ color: intact ? C.green : C.red }} className="text-[13px] font-semibold">
                {intact ? "무결성 검증 완료 — 원장이 봉인된 이후 단 한 건도 변경되지 않았습니다." 
                        : `무결성 위반 감지 — ${entries.length - brokenFrom}건의 기록이 봉인 이후 변경되었습니다.`}
              </div>
              <div style={{ color: intact ? "#3E6B53" : "#8A4030" }} className="mt-0.5 text-[11.5px]">
                {intact
                  ? `검증 시각 ${verifiedAt?.toLocaleTimeString("ko-KR")} · SHA-256 체인 ${entries.length}블록 전부 일치`
                  : `#${entries[brokenFrom]?.seq} 기록부터 해시 불일치 — 이 시점 이후 원장 전체를 신뢰할 수 없습니다.`}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* the ledger */}
      <section style={{ background: C.card, border: `1px solid ${C.line}` }} className="overflow-hidden rounded-2xl">
        <div style={{ background: C.line2, borderBottom: `1px solid ${C.line}` }}
          className="grid grid-cols-[40px,1fr,110px] items-center gap-3 px-4 py-2.5 sm:grid-cols-[44px,1fr,150px,150px]">
          {["#", "기록", "직전 해시", "봉인 해시"].map((h, i) => (
            <span key={i} style={{ color: C.mut }}
              className={`text-[10.5px] font-semibold uppercase tracking-wide ${i === 2 ? "hidden sm:block" : ""}`}>{h}</span>
          ))}
        </div>

        <div className="divide-y" style={{ borderColor: C.line2 }}>
          {entries.map((e, i) => {
            const broken = valid ? !valid[i] : false;
            const isFirstBreak = broken && (i === 0 || valid[i - 1]);
            return (
              <div key={e.seq}>
                {/* chain connector */}
                {i > 0 && (
                  <div className="flex items-center gap-1 px-4 sm:px-5" style={{ height: 0 }}>
                    <div className="ml-[14px] sm:ml-[16px] -translate-y-1/2">
                      <Link2 size={11} color={broken ? C.red : C.brass2}
                        style={{ opacity: broken ? 1 : 0.55, transform: broken ? "rotate(45deg)" : "none" }} />
                    </div>
                  </div>
                )}
                <div style={{ background: broken ? C.redBg : "transparent" }}
                  className="grid grid-cols-[40px,1fr,110px] items-center gap-3 px-4 py-3 sm:grid-cols-[44px,1fr,150px,150px] sm:px-4">
                  {/* seq */}
                  <div className="flex justify-center">
                    <span style={{
                      background: broken ? "#fff" : C.ink, color: broken ? C.red : C.brass2,
                      fontFamily: MONO, border: broken ? `1px solid ${C.red}` : "none",
                    }} className="grid h-7 w-7 place-items-center rounded-md text-[11px] font-semibold">
                      {String(e.seq).padStart(2, "0")}
                    </span>
                  </div>
                  {/* record */}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill tone={broken ? "bad" : "ink"}>{catName(e.catKey)}</Pill>
                      {isFirstBreak && <Pill tone="bad" icon={Flame}>변조 지점</Pill>}
                      <span style={{ color: C.mut, fontFamily: MONO }} className="text-[10.5px]">{e.ts}</span>
                    </div>
                    <div style={{ color: broken ? C.red : C.text }} className="mt-1 text-[12.5px] leading-snug">
                      {e.action}
                    </div>
                    <div style={{ color: C.mut }} className="mt-0.5 text-[11px]">담당 · {e.actor}</div>
                  </div>
                  {/* prev hash */}
                  <div className="hidden sm:block"><Hash value={e.prevHash} broken={broken && i > 0} /></div>
                  {/* hash */}
                  <div className="flex items-center gap-1.5">
                    {valid && (broken
                      ? <AlertCircle size={13} color={C.red} className="shrink-0" />
                      : <CheckCircle2 size={13} color={C.green} className="shrink-0" />)}
                    <Hash value={e.hash} broken={broken} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ background: C.line2, color: C.mut }} className="px-4 py-2.5 text-center text-[11px]">
          블록 #00 = 제네시스 · 접속기록은 법정 보존기간(1년 이상) 동안 봉인 보관됩니다
        </div>
      </section>
    </div>
  );
}

/* ════════════════════════ 3. 유출 대응 ════════════════════════ */
function BreachView() {
  const [armed, setArmed] = useState(false);
  const steps = [
    { icon: Database,   t: "유출 범위·항목 확정", d: "영향받은 정보주체 수와 유출 항목(고유식별정보 포함 여부) 산정", done: armed },
    { icon: FileText,   t: "정보주체 통지", d: "지체 없이 개별 통지 — 유출 항목·시점·대응절차·문의처 포함", done: false },
    { icon: ShieldAlert,t: "보호위원회(PIPC) 신고", d: "정해진 기한 내 신고서 제출 (1천명 이상 등 요건 시)", done: false },
    { icon: Server,     t: "KISA(KrCERT) 신고", d: "침해사고 신고 및 기술지원 요청", done: false },
  ];
  return (
    <div className="space-y-5">
      <section style={{ background: armed ? C.ink : C.card, border: `1px solid ${armed ? C.red : C.line}` }}
        className="overflow-hidden rounded-2xl p-6 transition-colors">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Siren size={18} color={armed ? "#E48A72" : C.red} strokeWidth={2.2} />
              <h2 style={{ color: armed ? C.paper : C.text, fontFamily: SERIF }} className="text-[17px] font-semibold">
                {armed ? "유출 대응 진행 중" : "유출사고 대응 워크플로우"}
              </h2>
            </div>
            <p style={{ color: armed ? "#9FB0C2" : C.sub }} className="mt-2 max-w-xl text-[12.5px] leading-relaxed">
              사고 인지 시점부터 모든 조치가 자동으로 원장에 봉인 기록됩니다. 신고·통지 기한 준수 여부 자체가
              감경의 핵심 사유가 되므로, 가드노트는 법정 양식 초안을 미리 채워 대기시킵니다.
            </p>
          </div>
          <button onClick={() => setArmed((v) => !v)}
            style={{ background: armed ? "#fff" : C.red, color: armed ? C.red : "#fff" }}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition active:scale-[.98]">
            {armed ? "대응 종료" : <><Siren size={15} /> 사고 대응 개시</>}
          </button>
        </div>

        {armed && (
          <div style={{ background: "#1E2A38", border: "1px solid #3A2A28" }}
            className="mt-4 flex items-center gap-3 rounded-xl px-4 py-3">
            <Clock size={18} color="#E48A72" />
            <div>
              <div style={{ color: C.paper }} className="text-[13px] font-semibold">통지·신고 기한 카운트다운 시작됨</div>
              <div style={{ color: "#9FB0C2" }} className="text-[11.5px]">인지 시각 기준 — 잔여 시간 내 정보주체 통지 및 신고 완료 필요</div>
            </div>
            <div style={{ color: "#E48A72", fontFamily: MONO }} className="ml-auto text-[20px] font-semibold">71:48:12</div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        {steps.map((s, i) => {
          const Ic = s.icon;
          return (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.line}` }}
              className="flex items-center gap-4 rounded-xl p-4">
              <div style={{ background: s.done ? C.greenBg : C.brassBg }}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg">
                {s.done ? <Check size={18} color={C.green} strokeWidth={2.6} /> : <Ic size={18} color={C.brass} strokeWidth={2} />}
              </div>
              <div className="min-w-0 flex-1">
                <div style={{ color: C.text }} className="text-[13.5px] font-semibold">{s.t}</div>
                <div style={{ color: C.sub }} className="mt-0.5 text-[12px] leading-snug">{s.d}</div>
              </div>
              <button disabled={!armed}
                style={{ color: armed ? C.brass : C.mut, border: `1px solid ${C.line}` }}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-medium transition disabled:opacity-50">
                양식 초안 <ChevronRight size={13} />
              </button>
            </div>
          );
        })}
      </section>
      <p style={{ color: C.mut }} className="px-1 text-[11px] leading-relaxed">
        ※ 실제 신고 요건·기한은 사안과 개정 법령에 따라 달라집니다. 본 화면은 데모이며 법률자문을 대체하지 않습니다.
      </p>
    </div>
  );
}

/* ════════════════════════ Evidence Package modal ════════════════════════ */
function PackageModal({ onClose }) {
  const [stage, setStage] = useState("build"); // build → done
  useEffect(() => { const t = setTimeout(() => setStage("done"), 1500); return () => clearTimeout(t); }, []);
  const contents = [
    "내부 관리계획 v3.2 (개정 이력 포함)",
    "접근권한 부여·회수 대장 (전체)",
    "접속기록 및 월간 점검 결과 (1년+)",
    "암호화 적용 현황 및 키 교체 기록",
    "보안교육 수료 내역",
    "증적 원장 무결성 검증서 (SHA-256)",
  ];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(14,22,33,.55)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: C.card, border: `1px solid ${C.line}` }}
        className="w-full max-w-md overflow-hidden rounded-2xl shadow-2xl">
        <div style={{ background: C.ink }} className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <HardDriveDownload size={17} color={C.brass2} />
            <span style={{ color: C.paper, fontFamily: SERIF }} className="text-[15px] font-semibold">증거 패키지</span>
          </div>
          <button onClick={onClose}><X size={18} color="#8A9BAD" /></button>
        </div>
        <div className="p-5">
          {stage === "build" ? (
            <div className="py-6 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px]"
                style={{ borderColor: C.line, borderTopColor: C.brass }} />
              <div style={{ color: C.sub }} className="mt-4 text-[13px]">증적을 모으고 무결성 검증서를 봉인하는 중…</div>
            </div>
          ) : (
            <>
              <div style={{ background: C.greenBg, border: "1px solid #CFE3D8" }}
                className="flex items-center gap-2.5 rounded-xl px-4 py-3">
                <BadgeCheck size={20} color={C.green} strokeWidth={2.2} />
                <div>
                  <div style={{ color: C.green }} className="text-[13px] font-semibold">제출용 패키지 준비 완료</div>
                  <div style={{ color: "#3E6B53" }} className="text-[11px]">PDF + 검증서 · 즉시 제출 가능</div>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {contents.map((c, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <FileCheck2 size={15} color={C.brass} className="shrink-0" />
                    <span style={{ color: C.text }} className="text-[12.5px]">{c}</span>
                  </div>
                ))}
              </div>
              <button onClick={onClose}
                style={{ background: `linear-gradient(135deg,${C.brass2},${C.brass})`, color: C.ink }}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold">
                <Download size={15} strokeWidth={2.4} /> 패키지 내려받기 (데모)
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
