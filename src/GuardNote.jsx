import React, { useState, useEffect, useCallback } from "react";
import {
  Shield, ShieldCheck, ShieldAlert, FileCheck2, AlertTriangle, Lock, KeyRound,
  Database, FileText, Server, Siren, Link2, BadgeCheck, Download, Clock,
  ChevronRight, X, Check, CheckCircle2, AlertCircle, Fingerprint, ScrollText,
  Building2, UserCog, Activity, HardDriveDownload, Flame, Copy, Plus, Radio,
  FileDown, Filter, RotateCcw, CreditCard, FileSignature, Receipt, CalendarClock,
  ExternalLink, PenLine, Sparkles, Trash2
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

/* ───────────────────────── category metadata (icon + display) ───────────────────────── */
const CAT_ICON = {
  plan: ScrollText, auth: UserCog, access: Lock, crypto: KeyRound, log: Activity,
  malware: ShieldAlert, phys: Building2, disaster: Server, output: Copy, destroy: Trash2,
};
// 고시(제2025-9호) 제4조~제13조 순서
const CAT_ORDER = ["plan", "auth", "access", "crypto", "log", "malware", "phys", "disaster", "output", "destroy"];

/* ───────────────────────── auth (테넌트별 API 키) ───────────────────────── */
const KEY_STORAGE = "guardnote_api_key";
const getApiKey = () => localStorage.getItem(KEY_STORAGE) || "";
const setApiKey = (k) => localStorage.setItem(KEY_STORAGE, k);
const clearApiKey = () => localStorage.removeItem(KEY_STORAGE);

// 인증 헤더는 저장된 키가 있을 때만 붙인다 — 계정 로그인(세션 쿠키) 모드에서는
// 쿠키가 자동 동봉되므로 헤더가 없어도 서버가 세션으로 인증한다.
const authHeaders = () => {
  const key = getApiKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
};

async function authedFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), ...authHeaders() },
  });
  if (res.status === 401) {
    clearApiKey();
    throw new Error("AUTH_REQUIRED");
  }
  return res.json();
}

// 필터(발췌 조건)를 쿼리스트링으로 직렬화. 값이 없는 필드는 아예 붙이지 않는다.
function toQuery(filters) {
  const params = new URLSearchParams();
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  if (filters?.cat_key) params.set("cat_key", filters.cat_key);
  if (filters?.actor) params.set("actor", filters.actor);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// CSV/PDF처럼 실제 파일을 내려받는 요청 — Blob으로 받아 임시 <a download> 클릭으로 저장한다.
// (다운로드 요청도 Authorization 헤더가 필요해서 <a href>만으로는 인증을 붙일 수 없다.)
async function downloadBlob(res) {
  if (res.status === 401) { clearApiKey(); throw new Error("AUTH_REQUIRED"); }
  if (!res.ok) throw new Error("다운로드에 실패했습니다.");
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const filename = cd.match(/filename="?([^"]+)"?/)?.[1] || "download";
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}
async function authedDownload(url) {
  return downloadBlob(await fetch(url, { headers: authHeaders() }));
}
// AI 초안처럼 다운로드에 본문(JSON)이 필요한 경우 — 서버가 그 값을 그대로 PDF에 렌더링한다.
async function authedDownloadPost(url, body) {
  return downloadBlob(await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  }));
}

const jsonPost = (url, body) =>
  authedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

/* ───────────────────────── API client ───────────────────────── */
const api = {
  whoami: () => authedFetch("/api/whoami"),
  entries: (filters) => authedFetch(`/api/entries${toQuery(filters)}`),
  categories: () => authedFetch("/api/categories"),
  verify: () => authedFetch("/api/verify"),
  add: (body) => jsonPost("/api/entries", body),
  anchorSelf: () => jsonPost("/api/anchor"),
  pkg: () => authedFetch("/api/package"),
  exportCsv: (filters) => authedDownload(`/api/export/csv${toQuery(filters)}`),
  exportPdf: (filters) => authedDownload(`/api/export/pdf${toQuery(filters)}`),
  tamper: () => jsonPost("/api/_demo/tamper"),
  reset: (body) => jsonPost("/api/_demo/reset", body),
  // 구독·결제·계약
  billing: () => authedFetch("/api/billing"),
  checkout: (plan) => jsonPost("/api/billing/checkout", { plan }),
  completeBilling: (body) => jsonPost("/api/billing/complete", body),
  cancelBilling: () => jsonPost("/api/billing/cancel"),
  resumeBilling: () => jsonPost("/api/billing/resume"),
  contract: (kind) => authedFetch(`/api/contracts/${kind}`),
  signContract: (kind, body) => jsonPost(`/api/contracts/${kind}/sign`, body),
  contractPdf: (kind) => authedDownload(`/api/contracts/${kind}/pdf`),
  // 유출 대응 워크플로우
  breach: {
    status: () => authedFetch("/api/breach"),
    start: () => jsonPost("/api/breach/start"),
    end: () => jsonPost("/api/breach/end"),
    step: (stepKey) => jsonPost("/api/breach/step", { stepKey }),
    draftPdf: (stepKey) => authedDownload(`/api/breach/draft/${stepKey}`),
    aiSuggest: (stepKey) => jsonPost(`/api/breach/draft/${stepKey}/ai`),
    aiDraftPdf: (stepKey, fields, mode) => authedDownloadPost(`/api/breach/draft/${stepKey}/pdf`, { fields, mode }),
  },
  // 관리자 (관리자 토큰으로 로그인한 경우)
  admin: {
    tenants: () => authedFetch("/api/admin/tenants"),
    createTenant: (body) => jsonPost("/api/admin/tenants", body),
    rotate: (slug) => jsonPost(`/api/admin/tenants/${slug}/rotate`),
    setPlan: (slug, plan) => jsonPost(`/api/admin/tenants/${slug}/plan`, { plan }),
    anchor: (slug) => jsonPost(`/api/admin/tenants/${slug}/anchor`),
    monitor: () => authedFetch("/api/admin/monitor"),
    runMonitor: () => jsonPost("/api/admin/monitor/run"),
    runBilling: () => jsonPost("/api/admin/billing/run"),
    audit: () => authedFetch("/api/admin/audit"),
    invite: (slug, email, role) => jsonPost(`/api/admin/tenants/${slug}/invite`, { email, role }),
  },
  // 계정 인증 — login은 401에도 {error}를 그대로 화면에 보여야 하므로 authedFetch를 쓰지 않는다.
  auth: {
    login: async (email, password) => {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      return res.json();
    },
    logout: () => fetch("/api/auth/logout", { method: "POST" }).then((r) => r.json()),
    changePassword: (current, next) => jsonPost("/api/auth/password", { current, next }),
    inviteInfo: async (token) => (await fetch(`/api/auth/invite/${token}`)).json(),
    acceptInvite: async (token, body) => {
      const res = await fetch(`/api/auth/invite/${token}/accept`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      return res.json();
    },
  },
  team: {
    list: () => authedFetch("/api/team"),
    invite: (email, role) => jsonPost("/api/team/invite", { email, role }),
    setStatus: (id, status) => jsonPost(`/api/team/${id}/status`, { status }),
    resetLink: (id) => jsonPost(`/api/team/${id}/reset-link`),
    activity: () => authedFetch("/api/team/activity"),
  },
};

/* ───────────────────────── tiny UI atoms ───────────────────────── */
function Pill({ tone = "ok", children, icon: Ic }) {
  const map = {
    ok:   { bg: C.greenBg, fg: C.green, bd: "#CFE3D8" },
    warn: { bg: C.amberBg, fg: C.amber, bd: "#E8DCB8" },
    bad:  { bg: C.redBg,   fg: C.red,   bd: "#E7CCC2" },
    ink:  { bg: C.brassBg, fg: C.brass, bd: "#E6D8AE" },
    mut:  { bg: "#EEE9DC", fg: C.mut,   bd: C.line },
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

function Hash({ value, broken }) {
  if (!value) return <span style={{ color: C.mut, fontFamily: MONO }} className="text-[10.5px]">—</span>;
  return (
    <span style={{ fontFamily: MONO, color: broken ? C.red : C.sub }}
      className="text-[10.5px] tracking-tight">
      {value.slice(0, 10)}<span style={{ color: broken ? C.red : C.mut }}>…{value.slice(-6)}</span>
    </span>
  );
}

const catName = (cats, k) => cats.find((c) => c.key === k)?.name ?? k;

/* ───────────────────────── 로그인 게이트 (계정 / 접속 키) ───────────────────────── */
const gateField = (err) => ({ background: C.ink, border: `1px solid ${err ? C.red : C.ink3}`, color: C.paper });

function LoginGate({ onSubmitLogin, onSubmitKey }) {
  const [mode, setMode] = useState("account"); // account | key
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    const msg = mode === "account"
      ? (email.trim() && pw ? await onSubmitLogin(email.trim(), pw) : "이메일과 비밀번호를 입력하세요.")
      : (key.trim() ? await onSubmitKey(key.trim()) : "키를 입력하세요.");
    if (msg) { setErr(msg); setBusy(false); }
  };

  const tabBtn = (m, label) => (
    <button type="button" onClick={() => { setMode(m); setErr(null); }}
      style={{ color: mode === m ? C.brass2 : "#7C8DA0", borderBottom: mode === m ? `2px solid ${C.brass2}` : "2px solid transparent" }}
      className="px-1 pb-2 text-[12.5px] font-semibold transition-colors">{label}</button>
  );

  return (
    <div style={{ background: C.ink }} className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} style={{ background: C.ink2, border: `1px solid ${C.ink3}` }}
        className="w-full max-w-sm rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center gap-2">
          <div style={{ background: `linear-gradient(135deg,${C.brass2},${C.brass})` }}
            className="grid h-8 w-8 place-items-center rounded-[7px]">
            <Shield size={16} strokeWidth={2.4} color={C.ink} />
          </div>
          <span style={{ color: C.paper, fontFamily: SERIF }} className="text-[17px] font-semibold">가드노트 접속</span>
        </div>

        <div className="mt-4 flex items-center gap-4" style={{ borderBottom: `1px solid ${C.ink3}` }}>
          {tabBtn("account", "이메일 로그인")}
          {tabBtn("key", "접속 키")}
        </div>

        {mode === "account" ? (
          <>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" type="email" autoFocus
              autoComplete="username" style={gateField(err)} className="mt-4 w-full rounded-lg px-3 py-2.5 text-[13px] outline-none" />
            <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="비밀번호" type="password"
              autoComplete="current-password" style={gateField(err)} className="mt-2 w-full rounded-lg px-3 py-2.5 text-[13px] outline-none" />
          </>
        ) : (
          <>
            <p style={{ color: "#8A9BAD" }} className="mt-3 text-[12px] leading-relaxed">
              수집기용 고객사 API 키(<code style={{ fontFamily: MONO }}>gn_live_…</code>) 또는 관리자 토큰
              (<code style={{ fontFamily: MONO }}>gn_admin_…</code>)으로 접속합니다.
            </p>
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="gn_live_… / gn_admin_…"
              style={{ ...gateField(err), fontFamily: MONO }} className="mt-3 w-full rounded-lg px-3 py-2.5 text-[13px] outline-none" />
          </>
        )}

        {err && <div style={{ color: "#E48A72" }} className="mt-2 text-[11.5px]">{err}</div>}
        <button type="submit" disabled={busy}
          style={{ background: `linear-gradient(135deg,${C.brass2},${C.brass})`, color: C.ink }}
          className="mt-3 w-full rounded-lg py-2.5 text-[13px] font-semibold transition active:scale-[.98] disabled:opacity-60">
          {busy ? "확인 중…" : mode === "account" ? "로그인" : "접속"}
        </button>
        <p style={{ color: C.mut }} className="mt-3 text-[11px] leading-relaxed">
          {mode === "account"
            ? "계정은 초대 링크로 만들어집니다 — 링크가 없거나 비밀번호를 잊었다면 회사 관리자(owner)에게 요청하세요."
            : "키는 발급 시 한 번만 표시됩니다. 분실 시 관리자 콘솔에서 재발급하세요."}
        </p>
      </form>
    </div>
  );
}

/* ───────────────────────── 초대 수락 / 비밀번호 재설정 ───────────────────────── */
function InviteGate({ token, onDone }) {
  const [info, setInfo] = useState(null);   // { kind, tenantName, role, email }
  const [err, setErr] = useState(null);
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const d = await api.auth.inviteInfo(token);
      if (d.error) setErr(d.error);
      else setInfo(d);
    })();
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (pw !== pw2) { setErr("비밀번호가 서로 다릅니다."); return; }
    setBusy(true); setErr(null);
    const body = info.kind === "invite" ? { name, password: pw } : { password: pw };
    const out = await api.auth.acceptInvite(token, body);
    if (out.error) { setErr(out.error); setBusy(false); return; }
    onDone(out);
  };

  const isInvite = info?.kind === "invite";
  return (
    <div style={{ background: C.ink }} className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} style={{ background: C.ink2, border: `1px solid ${C.ink3}` }}
        className="w-full max-w-sm rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center gap-2">
          <div style={{ background: `linear-gradient(135deg,${C.brass2},${C.brass})` }}
            className="grid h-8 w-8 place-items-center rounded-[7px]">
            <Shield size={16} strokeWidth={2.4} color={C.ink} />
          </div>
          <span style={{ color: C.paper, fontFamily: SERIF }} className="text-[17px] font-semibold">
            {info ? (isInvite ? "팀 합류" : "비밀번호 재설정") : "링크 확인 중…"}
          </span>
        </div>
        {info && (
          <>
            <p style={{ color: "#8A9BAD" }} className="mt-3 text-[12px] leading-relaxed">
              <b style={{ color: C.paper }}>{info.tenantName}</b>의 가드노트
              {isInvite ? <> 에 <b style={{ color: C.brass2 }}>{info.role === "owner" ? "소유자" : "팀원"}</b>로 초대되었습니다.</> : " 계정 비밀번호를 다시 설정합니다."}
              {info.email && <><br />계정: <code style={{ fontFamily: MONO }}>{info.email}</code></>}
            </p>
            {isInvite && (
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (예: 홍길동)" autoFocus
                style={gateField(err)} className="mt-4 w-full rounded-lg px-3 py-2.5 text-[13px] outline-none" />
            )}
            <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="비밀번호 (8자 이상)" type="password"
              autoComplete="new-password" style={gateField(err)} className="mt-2 w-full rounded-lg px-3 py-2.5 text-[13px] outline-none" />
            <input value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="비밀번호 확인" type="password"
              autoComplete="new-password" style={gateField(err)} className="mt-2 w-full rounded-lg px-3 py-2.5 text-[13px] outline-none" />
          </>
        )}
        {err && <div style={{ color: "#E48A72" }} className="mt-2 text-[11.5px]">{err}</div>}
        {info && (
          <button type="submit" disabled={busy}
            style={{ background: `linear-gradient(135deg,${C.brass2},${C.brass})`, color: C.ink }}
            className="mt-3 w-full rounded-lg py-2.5 text-[13px] font-semibold transition active:scale-[.98] disabled:opacity-60">
            {busy ? "처리 중…" : isInvite ? "계정 만들고 시작하기" : "비밀번호 변경"}
          </button>
        )}
      </form>
    </div>
  );
}

/* ════════════════════════ APP ════════════════════════ */
export default function GuardNote() {
  const [role, setRole] = useState(null);       // null | "tenant" | "admin"
  const [user, setUser] = useState(null);        // 계정 로그인 시 { email, name, role } — 키 접속이면 null
  const [booting, setBooting] = useState(true);  // 최초 whoami 확인 중
  // 초대/재설정 링크로 진입한 경우 (?invite=<token>) — 수락 화면을 먼저 보여준다.
  const [inviteToken, setInviteToken] = useState(() => new URLSearchParams(window.location.search).get("invite"));
  // 토스 카드등록창은 successUrl/failUrl로 "리다이렉트 복귀"하므로, 복귀 시 곧바로 구독 탭을 연다.
  const [tab, setTab] = useState(() => (new URLSearchParams(window.location.search).get("billing") ? "billing" : "status"));
  const [entries, setEntries] = useState([]);
  const [cats, setCats] = useState([]);
  const [score, setScore] = useState(0);
  const [okCount, setOkCount] = useState(0);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [verifyRes, setVerifyRes] = useState(null); // {intact, firstBrokenSeq, results, verifiedAt, blocks}
  const [verifying, setVerifying] = useState(false);
  const [tamperInfo, setTamperInfo] = useState(null); // {tamperedSeq, original}
  const [pkgOpen, setPkgOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [e, c] = await Promise.all([api.entries(), api.categories()]);
      setEntries(e.entries || []);
      setCats((c.categories || []).slice().sort((a, b) => CAT_ORDER.indexOf(a.key) - CAT_ORDER.indexOf(b.key)));
      setScore(c.score || 0);
      setOkCount(c.okCount || 0);
      setTenant(c.tenant || null);
      setErr(null);
    } catch (e) {
      if (e.message === "AUTH_REQUIRED") { setRole(null); return; }
      setErr("백엔드에 연결할 수 없습니다. `npm run dev`로 서버가 함께 떠 있는지 확인하세요.");
    } finally {
      setLoading(false);
    }
  }, []);

  // 최초 진입 시 신원 확인 — 세션 쿠키(계정) 또는 저장된 키 어느 쪽이든 whoami가 판별한다.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const who = await api.whoami();
        if (alive) { setRole(who.role); setUser(who.user || null); }
      } catch {
        if (alive) { clearApiKey(); setRole(null); }
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => { if (role === "tenant") load(); }, [role, load]);

  // 게이트: 접속 키 제출 → whoami로 역할 확인. 실패 시 에러 문자열 반환(게이트가 표시).
  const submitKey = useCallback(async (k) => {
    setApiKey(k);
    try {
      const who = await api.whoami();
      setLoading(true);
      setRole(who.role);
      setUser(who.user || null);
      return null;
    } catch {
      clearApiKey();
      return "유효하지 않은 키/토큰입니다. 다시 확인하세요.";
    }
  }, []);

  // 게이트: 계정 로그인 (세션 쿠키는 서버가 심는다)
  const submitLogin = useCallback(async (email, password) => {
    const out = await api.auth.login(email, password);
    if (out.error) return out.error;
    setLoading(true);
    setRole(out.role);
    setUser(out.user || null);
    return null;
  }, []);

  const logout = useCallback(async () => {
    try { if (user) await api.auth.logout(); } catch { /* 이미 만료된 세션 등 — 무시 */ }
    clearApiKey();
    setUser(null);
    setRole(null);
  }, [user]);

  const verify = useCallback(async () => {
    setVerifying(true);
    setVerifyRes(null);
    await new Promise((r) => setTimeout(r, 420)); // 검증 연출
    const v = await api.verify();
    setVerifyRes(v);
    setVerifying(false);
  }, []);

  const addEntry = useCallback(async (body) => {
    const row = await api.add(body);
    if (row.error) { setErr(row.error); return false; }
    setVerifyRes(null);
    await load();
    return true;
  }, [load]);

  const tamper = useCallback(async () => {
    const info = await api.tamper();
    if (info.error) { setErr(info.error); return; }
    setTamperInfo(info);
    setVerifyRes(null);
    await load();
  }, [load]);

  const resetTamper = useCallback(async () => {
    if (!tamperInfo) return;
    await api.reset({ seq: tamperInfo.tamperedSeq, original: tamperInfo.original });
    setTamperInfo(null);
    setVerifyRes(null);
    await load();
  }, [tamperInfo, load]);

  const anchorNow = useCallback(async () => {
    const out = await api.anchorSelf();
    if (out.error) { setErr(out.error); return; }
    await verify(); // 앵커 후 최신 상태 반영
  }, [verify]);

  // per-seq validity map from verify results
  const validBySeq = verifyRes ? Object.fromEntries(verifyRes.results.map((r) => [r.seq, r.ok])) : null;
  const intact = verifyRes?.intact;
  const brokenSeq = verifyRes?.firstBrokenSeq ?? null;
  const brokenCount = brokenSeq != null ? entries.filter((e) => e.seq >= brokenSeq).length : 0;
  const truncated = !!verifyRes?.truncated && brokenSeq == null; // 개별 블록 해시는 멀쩡한데 "꼬리"가 통째로 사라진 경우

  if (booting) {
    return <div style={{ background: C.ink, color: "#8A9BAD" }} className="grid min-h-screen place-items-center text-[13px]">불러오는 중…</div>;
  }
  // 초대/재설정 링크 — 로그인 여부와 무관하게 수락 화면이 항상 우선한다.
  // (초대받은 사람은 지금 로그인돼 있는 사람과 다른 사람일 수 있다 — 수락하면 새 세션으로 교체된다.)
  if (inviteToken) {
    return <InviteGate token={inviteToken} onDone={(who) => {
      window.history.replaceState({}, "", window.location.pathname);
      setInviteToken(null);
      setLoading(true);
      setRole(who.role);
      setUser(who.user || null);
      load(); // role이 이미 tenant였던 경우(다른 계정이 로그인돼 있던 컴퓨터) useEffect가 재실행되지 않으므로 직접 로드
    }} />;
  }
  if (!role) {
    return <LoginGate onSubmitLogin={submitLogin} onSubmitKey={submitKey} />;
  }
  if (role === "admin") {
    return <AdminConsole onLogout={logout} />;
  }

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
            <div className="hidden items-center gap-3 sm:flex">
              <div className="text-right leading-none">
                <div style={{ color: "#8A9BAD" }} className="text-[10.5px]">
                  {user ? `${user.name} · ${user.email}${user.role === "owner" ? " · 소유자" : ""}` : "고객사(테넌트)"}
                </div>
                <div className="mt-0.5 flex items-center justify-end gap-1.5">
                  <span style={{ color: C.paper }} className="text-[12.5px] font-medium">{tenant?.name || "—"}</span>
                  {tenant?.plan && (
                    <span style={{ background: C.brassBg, color: C.brass, border: "1px solid #E6D8AE" }}
                      className="rounded-full px-1.5 py-[1px] text-[9.5px] font-semibold">{tenant.plan.label}</span>
                  )}
                </div>
              </div>
              <button onClick={logout}
                style={{ color: "#8A9BAD", border: "1px solid #2A3849" }}
                className="rounded-md px-2 py-1 text-[10.5px] transition hover:text-white">
                {user ? "로그아웃" : "테넌트 전환"}
              </button>
            </div>
          </div>
          <nav className="mt-4 flex items-center gap-6">
            <Tab active={tab === "status"} onClick={() => setTab("status")} icon={ShieldCheck} label="방어 현황" />
            <Tab active={tab === "ledger"} onClick={() => setTab("ledger")} icon={Link2} label="증적 원장" />
            <Tab active={tab === "breach"} onClick={() => setTab("breach")} icon={Siren} label="유출 대응" />
            <Tab active={tab === "billing"} onClick={() => setTab("billing")} icon={CreditCard} label="구독·결제" />
            <Tab active={tab === "team"} onClick={() => setTab("team")} icon={UserCog} label="팀·계정" />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-7 sm:px-8">
        {err && (
          <div style={{ background: C.redBg, border: "1px solid #E7CCC2", color: C.red }}
            className="mb-5 flex items-center gap-2 rounded-xl px-4 py-3 text-[12.5px]">
            <AlertTriangle size={16} /> {err}
          </div>
        )}
        {loading ? (
          <div style={{ color: C.mut }} className="py-20 text-center text-[13px]">원장을 불러오는 중…</div>
        ) : (
          <>
            {tab === "status" && (
              <StatusView score={score} okCount={okCount} cats={cats} onOpenPkg={() => setPkgOpen(true)} />
            )}
            {tab === "ledger" && (
              <LedgerView
                entries={entries} cats={cats} validBySeq={validBySeq} verifying={verifying}
                verifyRes={verifyRes} tamperInfo={tamperInfo} onVerify={verify}
                onTamper={tamper} onReset={resetTamper} onAdd={addEntry} onAnchor={anchorNow}
                plan={tenant?.plan} intact={intact} brokenSeq={brokenSeq} brokenCount={brokenCount} truncated={truncated}
              />
            )}
            {tab === "breach" && <BreachView onRefresh={load} />}
            {tab === "billing" && <BillingView onPlanChanged={load} />}
            {tab === "team" && <TeamView user={user} />}
          </>
        )}
      </main>

      {pkgOpen && <PackageModal onClose={() => setPkgOpen(false)} />}
    </div>
  );
}

/* ════════════════════════ 1. 방어 현황 ════════════════════════ */
function StatusView({ score, okCount, cats, onOpenPkg }) {
  const ring = 2 * Math.PI * 52;
  const totalItems = cats.reduce((s, c) => s + (c.items || 0), 0);
  const gaps = cats.filter((c) => c.status !== "ok").length;
  return (
    <div className="space-y-6">
      {/* hero */}
      <section style={{ background: C.ink, border: `1px solid ${C.ink3}` }}
        className="overflow-hidden rounded-2xl">
        <div className="grid gap-6 p-6 sm:grid-cols-[auto,1fr] sm:p-8">
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
          <div className="flex flex-col justify-center">
            <Pill tone="ink" icon={BadgeCheck}>입증 가능 상태</Pill>
            <h1 style={{ color: C.paper, fontFamily: SERIF }} className="mt-3 text-[22px] font-semibold leading-snug sm:text-[25px]">
              지금 조사·손해배상 청구가 들어와도<br className="hidden sm:block" /> 안전조치 이행을 입증할 수 있습니다.
            </h1>
            <p style={{ color: "#9FB0C2" }} className="mt-2.5 max-w-xl text-[13px] leading-relaxed">
              개인정보보호법상 손해배상 책임은 사업자가 <span style={{ color: C.brass2 }}>“고의·과실 없음”을 입증</span>해야 면책됩니다.
              가드노트는 10개 안전성 확보조치(고시 제4조~제13조)의 이행 증적을 위변조 불가능한 형태로 상시 축적해, 제출 가능한 방어 자료로 보관합니다.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button onClick={onOpenPkg}
                style={{ background: `linear-gradient(135deg,${C.brass2},${C.brass})`, color: C.ink }}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold shadow-sm transition active:scale-[.98]">
                <Download size={15} strokeWidth={2.4} /> 증거 패키지 생성
              </button>
              <div style={{ color: "#8A9BAD" }} className="flex items-center gap-1.5 text-[11.5px]">
                <Database size={13} /> SQLite 원장에 봉인 보관 중
              </div>
            </div>
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${C.ink3}` }} className="grid grid-cols-3 divide-x">
          {[
            { n: `${okCount}/${cats.length}`, l: "이행 완료 항목" },
            { n: `${totalItems}`, l: "봉인된 증적 건수" },
            { n: `${gaps}`, l: "점검·보완 필요 항목" },
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
          <h2 style={{ color: C.text }} className="text-[15px] font-semibold tracking-tight">안전성 확보조치 10개 항목</h2>
          <span style={{ color: C.mut }} className="text-[11.5px]">고시 제2025-9호 ('25.10.31. 개정) 제4조~제13조 기준</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cats.map((c, i) => {
            const Ic = CAT_ICON[c.key] || ScrollText;
            const warn = c.status === "warn";
            const none = c.status === "none";
            const bd = none ? "#E7CCC2" : warn ? "#E8DCB8" : C.line;
            return (
              <div key={c.key}
                style={{ background: C.card, border: `1px solid ${bd}` }}
                className="group rounded-xl p-4 transition hover:shadow-sm">
                <div className="flex items-start justify-between">
                  <div style={{ background: none ? C.redBg : warn ? C.amberBg : C.brassBg }}
                    className="grid h-9 w-9 place-items-center rounded-lg">
                    <Ic size={17} strokeWidth={2} color={none ? C.red : warn ? C.amber : C.brass} />
                  </div>
                  {none ? <Pill tone="bad" icon={AlertCircle}>증적 없음</Pill>
                    : warn ? <Pill tone="warn" icon={AlertCircle}>점검 필요</Pill>
                    : <Pill tone="ok" icon={Check}>이행</Pill>}
                </div>
                <div style={{ color: C.text }} className="mt-3 text-[13.5px] font-semibold leading-snug">
                  <span style={{ color: C.mut, fontFamily: MONO }} className="mr-1.5 text-[11px]">{String(i + 1).padStart(2, "0")}</span>
                  {c.name}
                  {c.article && (
                    <span style={{ background: C.line2, color: C.sub, fontFamily: MONO }}
                      className="ml-1.5 rounded px-1 py-[1px] align-middle text-[9.5px] font-medium">{c.article}</span>
                  )}
                </div>
                <div className="mt-2.5 flex items-center justify-between" title={c.cycle?.label || ""}>
                  <span style={{ color: C.sub }} className="text-[11.5px]">증적 {c.items || 0}건</span>
                  <span style={{ color: none ? C.red : warn ? C.amber : C.mut }} className="text-[11.5px]">
                    {none ? "증적 추가 필요"
                      : warn ? `주기 경과 · ${c.last?.slice(0, 10)}${c.cycle ? ` (${c.cycle.basis} ${c.cycle.days}일)` : ""}`
                      : `최근 ${c.last?.slice(0, 10)}`}
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
function LedgerView({ entries, cats, validBySeq, verifying, verifyRes, tamperInfo, onVerify, onTamper, onReset, onAdd, onAnchor, plan, intact, brokenSeq, brokenCount, truncated }) {
  const [showAdd, setShowAdd] = useState(false);
  const [anchoring, setAnchoring] = useState(false);
  const canPdf = plan?.features?.pdf !== false;   // 플랜 정보 없으면 허용(백엔드가 최종 강제)
  const canAnchor = !!plan?.features?.anchor;
  const anchor = verifyRes?.anchor;
  const doAnchor = async () => { setAnchoring(true); try { await onAnchor(); } finally { setAnchoring(false); } };

  // 발췌(필터) 상태 — 원장 전체와 별개로, "특정 사건 증거만" 뽑아 보는 화면 전용.
  const emptyFilters = { from: "", to: "", cat_key: "", actor: "" };
  const [filterInput, setFilterInput] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(null); // null = 발췌 없음(전체 원장 보기)
  const [filteredEntries, setFilteredEntries] = useState(null);
  const [filterLoading, setFilterLoading] = useState(false);
  const [filterErr, setFilterErr] = useState(null);
  const [exporting, setExporting] = useState(null); // "csv" | "pdf" | null

  const applyFilter = async () => {
    setFilterLoading(true); setFilterErr(null);
    try {
      const res = await api.entries(filterInput);
      setFilteredEntries(res.entries || []);
      setAppliedFilters({ ...filterInput });
    } catch (e) {
      setFilterErr("발췌 조회에 실패했습니다.");
    } finally {
      setFilterLoading(false);
    }
  };
  const clearFilter = () => {
    setFilterInput(emptyFilters);
    setAppliedFilters(null);
    setFilteredEntries(null);
  };
  const download = async (type) => {
    setExporting(type); setFilterErr(null);
    try {
      await (type === "csv" ? api.exportCsv(appliedFilters) : api.exportPdf(appliedFilters));
    } catch (e) {
      setFilterErr("다운로드에 실패했습니다.");
    } finally {
      setExporting(null);
    }
  };

  const viewEntries = appliedFilters ? (filteredEntries || []) : entries;
  const showChain = !appliedFilters; // 발췌 보기에서는 인접 블록 시각화(체인 연결선·직전해시)를 끈다 — 필터링된 행은 실제 원장에서 인접하지 않기 때문

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
              모든 안전조치 활동은 <b>서버에서</b> 직전 기록의 해시와 연결되어 봉인됩니다(해시 체인).
              검증은 제네시스부터 전체를 재계산하므로, DB 파일을 직접 고쳐도 그 지점부터 연결이 깨져
              <span style={{ color: C.red, fontWeight: 600 }}> 조작 사실이 즉시 드러납니다.</span>
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-[210px]">
            <button onClick={onVerify} disabled={verifying}
              style={{ background: C.ink, color: C.paper }}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition active:scale-[.98] disabled:opacity-60">
              {verifying ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> 검증 중…</>
                : <><ShieldCheck size={15} strokeWidth={2.4} /> 무결성 검증</>}
            </button>
            <button onClick={() => setShowAdd((v) => !v)}
              style={{ color: C.brass, border: `1px solid ${C.line}`, background: "#fff" }}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition hover:bg-[#F4F1E9]">
              <Plus size={13} /> 활동 기록 추가
            </button>
            {canAnchor && (
              <button onClick={doAnchor} disabled={anchoring}
                style={{ color: C.brass, border: `1px solid ${C.line}`, background: "#fff" }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition hover:bg-[#F4F1E9] disabled:opacity-60">
                <Fingerprint size={13} /> {anchoring ? "앵커링 중…" : "지금 외부 앵커링"}
              </button>
            )}
            {!tamperInfo
              ? <button onClick={onTamper}
                  style={{ color: C.red, border: `1px solid ${C.line}`, background: "#fff" }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition hover:bg-[#FBF3F0]">
                  <Flame size={13} /> 변조 시뮬레이션 (DB 직접 수정)
                </button>
              : <button onClick={onReset}
                  style={{ color: C.sub, border: `1px solid ${C.line}`, background: "#fff" }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition hover:bg-[#F4F1E9]">
                  원장 원복
                </button>}
          </div>
        </div>

        {showAdd && <AddForm cats={cats} onAdd={onAdd} onDone={() => setShowAdd(false)} />}

        {/* verdict banner */}
        {verifyRes && (
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
                  : truncated ? `무결성 위반 감지 — 봉인된 최근 기록이 삭제되어 원장 끝부분이 잘려나갔습니다.`
                  : `무결성 위반 감지 — ${brokenCount}건의 기록이 봉인 이후 변경되었습니다.`}
              </div>
              <div style={{ color: intact ? "#3E6B53" : "#8A4030" }} className="mt-0.5 text-[11.5px]">
                {intact
                  ? `검증 시각 ${new Date(verifyRes.verifiedAt).toLocaleTimeString("ko-KR")} · SHA-256 체인 ${verifyRes.blocks}블록 전부 일치`
                  : truncated
                  ? `기록된 마지막 봉인은 #${String(verifyRes.expectedLastSeq).padStart(2, "0")}인데 원장엔 #${String(verifyRes.actualLastSeq).padStart(2, "0")}까지만 있습니다 — 개별 기록은 멀쩡해도 삭제 자체가 조작입니다.`
                  : `#${String(brokenSeq).padStart(2, "0")} 기록부터 해시 불일치 — 이 시점 이후 원장 전체를 신뢰할 수 없습니다.`}
              </div>
              {/* 외부 앵커 상태 */}
              {anchor && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <Fingerprint size={12} color={anchor.anchored ? (anchor.ok ? C.green : C.red) : C.mut} />
                  <span style={{ color: anchor.anchored ? (anchor.ok ? "#3E6B53" : "#8A4030") : C.mut }} className="text-[11px]">
                    {!anchor.anchored
                      ? "외부 타임스탬프 앵커 없음 — ‘지금 외부 앵커링’으로 이 시점을 박제할 수 있습니다."
                      : anchor.ok
                      ? `외부 앵커 정상 · 블록 #${String(anchor.seq).padStart(2, "0")} 시점 박제됨${anchor.external ? " (외부 노터리)" : " (로컬 서명)"}`
                      : anchor.truncated
                      ? "외부 앵커 불일치 — 앵커 이후 최근 기록이 삭제된 절단이 감지되었습니다."
                      : "외부 앵커 불일치 — 앵커 시점 이후 과거 기록이 변조되었을 수 있습니다."}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 발췌 조회 + 내보내기 */}
      <section style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1.5">
            <Filter size={14} color={C.brass} />
            <span style={{ color: C.text }} className="text-[12.5px] font-semibold">특정 사건 증거만 뽑기</span>
          </div>
          <div className="flex flex-col gap-1">
            <label style={{ color: C.mut }} className="text-[10px]">기간 (부터)</label>
            <input type="date" value={filterInput.from}
              onChange={(e) => setFilterInput((f) => ({ ...f, from: e.target.value }))}
              style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.text }}
              className="rounded-lg px-2.5 py-1.5 text-[12px]" />
          </div>
          <div className="flex flex-col gap-1">
            <label style={{ color: C.mut }} className="text-[10px]">기간 (까지)</label>
            <input type="date" value={filterInput.to}
              onChange={(e) => setFilterInput((f) => ({ ...f, to: e.target.value }))}
              style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.text }}
              className="rounded-lg px-2.5 py-1.5 text-[12px]" />
          </div>
          <div className="flex flex-col gap-1">
            <label style={{ color: C.mut }} className="text-[10px]">항목</label>
            <select value={filterInput.cat_key}
              onChange={(e) => setFilterInput((f) => ({ ...f, cat_key: e.target.value }))}
              style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.text }}
              className="min-w-[140px] rounded-lg px-2.5 py-1.5 text-[12px]">
              <option value="">전체</option>
              {cats.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label style={{ color: C.mut }} className="text-[10px]">담당자</label>
            <input value={filterInput.actor} placeholder="이름 포함 검색"
              onChange={(e) => setFilterInput((f) => ({ ...f, actor: e.target.value }))}
              style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.text }}
              className="w-[110px] rounded-lg px-2.5 py-1.5 text-[12px]" />
          </div>
          <button onClick={applyFilter} disabled={filterLoading}
            style={{ background: C.ink, color: C.paper }}
            className="rounded-lg px-3.5 py-1.5 text-[12px] font-semibold transition active:scale-[.98] disabled:opacity-60">
            {filterLoading ? "조회 중…" : "발췌 조회"}
          </button>
          {appliedFilters && (
            <button onClick={clearFilter}
              className="inline-flex items-center gap-1 text-[12px]" style={{ color: C.sub }}>
              <RotateCcw size={12} /> 전체 보기로
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => download("csv")} disabled={!!exporting}
              style={{ color: C.brass, border: `1px solid ${C.line}`, background: "#fff" }}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition hover:bg-[#F4F1E9] disabled:opacity-60">
              <FileDown size={13} /> {exporting === "csv" ? "생성 중…" : "CSV"}
            </button>
            <button onClick={() => download("pdf")} disabled={!!exporting || !canPdf}
              title={canPdf ? "" : "PDF 증거 패키지는 Pro 이상 플랜에서 제공됩니다"}
              style={{ background: canPdf ? `linear-gradient(135deg,${C.brass2},${C.brass})` : "#EDE7D8", color: canPdf ? C.ink : C.mut }}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition active:scale-[.98] disabled:opacity-60">
              <Download size={13} /> {exporting === "pdf" ? "생성 중…" : canPdf ? "PDF" : "PDF (Pro)"}
            </button>
          </div>
        </div>
        {appliedFilters && (
          <div style={{ color: C.mut }} className="mt-2.5 text-[11px]">
            발췌 적용 중 · {viewEntries.length}건 표시 — 무결성 검증은 이 발췌와 무관하게 항상 전체 원장 기준으로 이뤄집니다.
          </div>
        )}
        {filterErr && <div style={{ color: C.red }} className="mt-2.5 text-[11px]">{filterErr}</div>}
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
          {viewEntries.length === 0 && (
            <div style={{ color: C.mut }} className="px-4 py-8 text-center text-[12.5px]">
              {appliedFilters ? "조건에 맞는 증적이 없습니다." : "아직 기록이 없습니다."}
            </div>
          )}
          {viewEntries.map((e, i) => {
            const broken = showChain && validBySeq ? !validBySeq[e.seq] : false;
            const prevOk = i === 0 ? true : showChain && validBySeq ? validBySeq[viewEntries[i - 1].seq] : true;
            const isFirstBreak = showChain && broken && prevOk;
            const ingest = e.source && e.source.startsWith("ingest:");
            return (
              <div key={e.seq}>
                {showChain && i > 0 && (
                  <div className="flex items-center gap-1 px-4 sm:px-5" style={{ height: 0 }}>
                    <div className="ml-[14px] sm:ml-[16px] -translate-y-1/2">
                      <Link2 size={11} color={broken ? C.red : C.brass2}
                        style={{ opacity: broken ? 1 : 0.55, transform: broken ? "rotate(45deg)" : "none" }} />
                    </div>
                  </div>
                )}
                <div style={{ background: broken ? C.redBg : "transparent" }}
                  className="grid grid-cols-[40px,1fr,110px] items-center gap-3 px-4 py-3 sm:grid-cols-[44px,1fr,150px,150px] sm:px-4">
                  <div className="flex justify-center">
                    <span style={{
                      background: broken ? "#fff" : C.ink, color: broken ? C.red : C.brass2,
                      fontFamily: MONO, border: broken ? `1px solid ${C.red}` : "none",
                    }} className="grid h-7 w-7 place-items-center rounded-md text-[11px] font-semibold">
                      {String(e.seq).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill tone={broken ? "bad" : "ink"}>{catName(cats, e.cat_key)}</Pill>
                      {isFirstBreak && <Pill tone="bad" icon={Flame}>변조 지점</Pill>}
                      {ingest && <Pill tone="mut" icon={Radio}>자동수집</Pill>}
                      <span style={{ color: C.mut, fontFamily: MONO }} className="text-[10.5px]">{e.ts}</span>
                    </div>
                    <div style={{ color: broken ? C.red : C.text }} className="mt-1 text-[12.5px] leading-snug">
                      {e.action}
                    </div>
                    <div style={{ color: C.mut }} className="mt-0.5 text-[11px]">
                      담당 · {e.actor}
                      {e.recorded_by && <span> · 기록 <span style={{ fontFamily: MONO }}>{e.recorded_by}</span> ✓</span>}
                    </div>
                  </div>
                  <div className="hidden sm:block">
                    {showChain ? <Hash value={e.prev_hash} broken={broken && i > 0} /> : <span style={{ color: C.mut }} className="text-[10.5px]">—</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {showChain && validBySeq && (broken
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
          {appliedFilters
            ? "발췌 보기 — 행 간 인접성 표시는 생략됩니다 (실제 원장에서 연속된 블록이 아닐 수 있음)"
            : "블록 #00 = 제네시스 · 접속기록은 법정 보존기간(1년 이상) 동안 봉인 보관됩니다"}
        </div>
      </section>
    </div>
  );
}

/* ── 활동 기록 추가 폼 ── */
function AddForm({ cats, onAdd, onDone }) {
  const [catKey, setCatKey] = useState(cats[0]?.key || "plan");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  // 선택한 항목의 고시 근거 권장 활동 — 고르면 활동 내용이 채워지고 자유롭게 수정 가능
  const activities = cats.find((c) => c.key === catKey)?.activities || [];

  const submit = async (e) => {
    e.preventDefault();
    if (!actor.trim() || !action.trim()) return;
    setBusy(true);
    const ok = await onAdd({ cat_key: catKey, actor: actor.trim(), action: action.trim() });
    setBusy(false);
    if (ok) { setActor(""); setAction(""); onDone(); }
  };

  const field = { background: "#fff", border: `1px solid ${C.line}`, color: C.text };
  return (
    <form onSubmit={submit} style={{ background: "#fff", border: `1px dashed ${C.line}` }}
      className="mt-4 grid gap-2.5 rounded-xl p-4 sm:grid-cols-[180px,1fr]">
      <select value={catKey} onChange={(e) => setCatKey(e.target.value)} style={field}
        className="rounded-lg px-3 py-2 text-[12.5px]">
        {cats.map((c) => <option key={c.key} value={c.key}>{c.article ? `${c.article} · ` : ""}{c.name}</option>)}
      </select>
      <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="담당자 (예: 한승수)" style={field}
        className="rounded-lg px-3 py-2 text-[12.5px] outline-none" />
      {activities.length > 0 && (
        <select value="" onChange={(e) => { if (e.target.value) setAction(e.target.value); }} style={{ ...field, color: C.sub }}
          className="rounded-lg px-3 py-2 text-[12px] sm:col-span-2">
          <option value="">권장 활동에서 고르기 (고시 근거 자동 입력) — 선택 사항</option>
          {activities.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      )}
      <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="활동 내용 — 개인정보(전화·주민번호 등) 제외 · 봉인되면 수정 불가"
        style={field} className="rounded-lg px-3 py-2 text-[12.5px] outline-none sm:col-span-2" />
      <div className="flex items-center gap-2 sm:col-span-2">
        <button type="submit" disabled={busy}
          style={{ background: C.ink, color: C.paper }}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold transition active:scale-[.98] disabled:opacity-60">
          <Lock size={13} /> {busy ? "봉인 중…" : "원장에 봉인"}
        </button>
        <button type="button" onClick={onDone} style={{ color: C.sub }} className="px-2 text-[12px]">취소</button>
        <span style={{ color: C.mut }} className="ml-auto text-[11px]">추가 즉시 직전 해시와 체인 연결됩니다</span>
      </div>
    </form>
  );
}

/* ════════════════════════ 3. 유출 대응 ════════════════════════ */
const BREACH_STEPS = [
  { key: "scope",  icon: Database,    t: "유출 범위·항목 확정", d: "영향받은 정보주체 수와 유출 항목(고유식별정보 포함 여부) 산정" },
  { key: "notify", icon: FileText,    t: "정보주체 통지", d: "지체 없이 개별 통지 — 유출 항목·시점·대응절차·문의처 포함" },
  { key: "pipc",   icon: ShieldAlert, t: "보호위원회(PIPC) 신고", d: "정해진 기한 내 신고서 제출 (1천명 이상 등 요건 시)" },
  { key: "kisa",   icon: Server,      t: "KISA(KrCERT) 신고", d: "침해사고 신고 및 기술지원 요청" },
];
const BREACH_DEADLINE_MS = 72 * 60 * 60 * 1000; // 개인정보보호법상 신고 기한 기준 — 72시간

function fmtCountdown(ms) {
  const overdue = ms <= 0;
  const totalSec = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return { text: `${overdue ? "-" : ""}${pad(h)}:${pad(m)}:${pad(s)}`, overdue };
}

function BreachView({ onRefresh }) {
  const [state, setState] = useState({ active: false, started_at: null, steps: {} });
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [busyStep, setBusyStep] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [aiDrafts, setAiDrafts] = useState({}); // { [stepKey]: { loading, fields, mode, error } }

  useEffect(() => {
    let alive = true;
    api.breach.status().then((s) => { if (alive) { setState(s); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  // 활성 상태일 때만 매초 재렌더 — 실시간 카운트다운을 위해서다.
  useEffect(() => {
    if (!state.active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.active]);

  const toggle = async () => {
    setStarting(true);
    try {
      if (state.active) {
        setState(await api.breach.end());
      } else {
        setState(await api.breach.start());
        await onRefresh?.(); // 개시 사실이 원장에 새로 봉인됐으니 증적 원장도 갱신
      }
    } finally {
      setStarting(false);
    }
  };

  const toggleStep = async (key) => {
    setBusyStep(key);
    try {
      setState(await api.breach.step(key));
      await onRefresh?.(); // 완료 처리 시 원장에 새 봉인 기록이 생겼을 수 있다
    } finally {
      setBusyStep(null);
    }
  };

  const aiSuggest = async (key) => {
    setAiDrafts((prev) => ({ ...prev, [key]: { loading: true } }));
    const out = await api.breach.aiSuggest(key);
    if (out.error && !out.fields) {
      setAiDrafts((prev) => ({ ...prev, [key]: { loading: false, error: out.error } }));
      return;
    }
    setAiDrafts((prev) => ({ ...prev, [key]: { loading: false, fields: out.fields, mode: out.mode } }));
  };

  const aiPdf = async (key) => {
    const d = aiDrafts[key];
    if (!d?.fields) return;
    await api.breach.aiDraftPdf(key, d.fields, d.mode);
  };

  const armed = state.active;
  const deadlineAt = state.started_at ? new Date(state.started_at).getTime() + BREACH_DEADLINE_MS : null;
  const cd = deadlineAt != null ? fmtCountdown(deadlineAt - now) : null;

  if (loading) return <div style={{ color: C.mut }} className="py-20 text-center text-[13px]">불러오는 중…</div>;

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
          <button onClick={toggle} disabled={starting}
            style={{ background: armed ? "#fff" : C.red, color: armed ? C.red : "#fff" }}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition active:scale-[.98] disabled:opacity-60">
            {armed ? "대응 종료" : <><Siren size={15} /> 사고 대응 개시</>}
          </button>
        </div>

        {armed && cd && (
          <div style={{ background: cd.overdue ? "#3A2020" : "#1E2A38", border: `1px solid ${cd.overdue ? "#5A2E2A" : "#3A2A28"}` }}
            className="mt-4 flex items-center gap-3 rounded-xl px-4 py-3">
            <Clock size={18} color="#E48A72" />
            <div>
              <div style={{ color: C.paper }} className="text-[13px] font-semibold">
                {cd.overdue ? "통지·신고 기한 초과" : "통지·신고 기한 카운트다운 시작됨"}
              </div>
              <div style={{ color: "#9FB0C2" }} className="text-[11.5px]">인지 시각 기준 72시간 — 잔여 시간 내 정보주체 통지 및 신고 완료 필요</div>
            </div>
            <div style={{ color: "#E48A72", fontFamily: MONO }} className="ml-auto text-[20px] font-semibold">{cd.text}</div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        {BREACH_STEPS.map((s) => {
          const Ic = s.icon;
          const doneAt = state.steps?.[s.key];
          const done = !!doneAt;
          const ai = aiDrafts[s.key];
          return (
            <div key={s.key} style={{ background: C.card, border: `1px solid ${C.line}` }}
              className="rounded-xl p-4">
              <div className="flex items-center gap-4">
                <button onClick={() => toggleStep(s.key)} disabled={!armed || busyStep === s.key}
                  title={armed ? (done ? "완료 취소" : "완료로 표시") : "먼저 사고 대응을 개시하세요"}
                  style={{ background: done ? C.greenBg : C.brassBg, cursor: armed ? "pointer" : "default" }}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg transition disabled:opacity-60">
                  {done ? <Check size={18} color={C.green} strokeWidth={2.6} /> : <Ic size={18} color={C.brass} strokeWidth={2} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div style={{ color: C.text }} className="text-[13.5px] font-semibold">{s.t}</div>
                  <div style={{ color: C.sub }} className="mt-0.5 text-[12px] leading-snug">{s.d}</div>
                  {done && (
                    <div style={{ color: C.green }} className="mt-0.5 text-[11px]">
                      완료 · {new Date(doneAt).toLocaleString("ko-KR")}
                    </div>
                  )}
                </div>
                <button onClick={() => aiSuggest(s.key)} disabled={!armed || ai?.loading}
                  style={{ color: armed ? C.brass : C.mut, border: `1px solid ${C.line}` }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-medium transition disabled:opacity-50">
                  <Sparkles size={13} /> {ai?.loading ? "생성 중…" : "AI 초안 생성"}
                </button>
                <button onClick={() => api.breach.draftPdf(s.key)} disabled={!armed}
                  style={{ color: armed ? C.brass : C.mut, border: `1px solid ${C.line}` }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-medium transition disabled:opacity-50">
                  양식 초안 <ChevronRight size={13} />
                </button>
              </div>

              {ai?.error && (
                <div style={{ background: C.redBg, color: C.red }} className="mt-3 rounded-lg px-3 py-2 text-[11.5px]">
                  AI 초안 생성 실패: {ai.error}
                </div>
              )}

              {ai?.fields && (
                <div style={{ background: C.line2, border: `1px solid ${C.line}` }} className="mt-3 space-y-2 rounded-lg p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span style={{ color: C.brass }} className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold">
                      <Sparkles size={12} /> {ai.mode === "live" ? "AI(Claude) 생성 초안" : "AI 초안 예시 (모의 모드)"} — 검토 후 사용
                    </span>
                    <button onClick={() => aiPdf(s.key)}
                      style={{ color: C.brass }} className="inline-flex items-center gap-1 text-[11px] font-semibold">
                      <Download size={12} /> PDF로 받기
                    </button>
                  </div>
                  {Object.entries(ai.fields).map(([k, v]) => (
                    <div key={k} className="text-[11.5px] leading-relaxed">
                      <span style={{ color: C.sub }} className="font-semibold">{k}: </span>
                      <span style={{ color: C.text }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
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

/* ════════════════════════ 4. 구독·결제 ════════════════════════ */
const won = (n) => `${(n ?? 0).toLocaleString("ko-KR")}원`;
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("ko-KR") : "—");
const SUB_STATUS = {
  active:     { label: "구독 중",       tone: "ok" },
  past_due:   { label: "결제 재시도 중", tone: "warn" },
  canceled:   { label: "해지됨",        tone: "mut" },
  incomplete: { label: "결제 미완료",   tone: "warn" },
};

// 토스페이먼츠 SDK — 실결제 모드에서 결제 버튼을 누르는 시점에 지연 로드한다.
function loadTossSdk() {
  return new Promise((resolve, reject) => {
    if (window.TossPayments) return resolve(window.TossPayments);
    const s = document.createElement("script");
    s.src = "https://js.tosspayments.com/v1/payment";
    s.onload = () => resolve(window.TossPayments);
    s.onerror = () => reject(new Error("토스페이먼츠 SDK를 불러오지 못했습니다."));
    document.head.appendChild(s);
  });
}

function BillingView({ onPlanChanged }) {
  const [data, setData] = useState(null);        // GET /api/billing 응답
  const [err, setErr] = useState(null);
  const [notice, setNotice] = useState(null);
  const [subscribing, setSubscribing] = useState(null); // 결제 진행 중인 planKey (모달)
  const [completing, setCompleting] = useState(false);  // 토스 복귀 후 승인 처리 중

  const reload = useCallback(async () => {
    try {
      const d = await api.billing();
      if (d.error) throw new Error(d.error);
      setData(d);
    } catch (e) {
      if (e.message !== "AUTH_REQUIRED") setErr("구독 정보를 불러오지 못했습니다.");
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // 토스 카드등록창 복귀 처리 — successUrl(?billing=auth&plan=...&authKey=...) / failUrl(?billing=fail)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const st = params.get("billing");
    if (!st) return;
    window.history.replaceState({}, "", window.location.pathname); // 새로고침 시 중복 승인 방지
    if (st === "fail") {
      setErr(params.get("message") ? `카드 등록 실패: ${params.get("message")}` : "카드 등록이 취소되었거나 실패했습니다.");
      return;
    }
    if (st === "auth" && params.get("authKey") && params.get("plan")) {
      (async () => {
        setCompleting(true);
        const res = await api.completeBilling({ plan: params.get("plan"), authKey: params.get("authKey") });
        setCompleting(false);
        if (res.error) setErr(res.error);
        else {
          setNotice(`${res.plan.label} 플랜 결제가 완료되었습니다. 다음 결제일: ${fmtDate(res.subscription.nextBillingAt)}`);
          onPlanChanged();
        }
        reload();
      })();
    }
  }, []); // 최초 1회 — 리다이렉트 복귀 시점에만 의미가 있다

  const cancel = async () => {
    if (!confirm("구독을 해지할까요? 이미 결제된 기간이 끝나는 날까지 서비스가 유지되고, 이후 Free 플랜으로 전환됩니다.")) return;
    const r = await api.cancelBilling();
    if (r.error) { setErr(r.error); return; }
    setNotice(`해지가 예약되었습니다. ${fmtDate(r.effectiveAt)}까지 이용 후 Free 플랜으로 전환됩니다.`);
    reload();
  };
  const resume = async () => {
    const r = await api.resumeBilling();
    if (r.error) { setErr(r.error); return; }
    setNotice("해지 예약을 철회했습니다. 구독이 계속 유지됩니다.");
    reload();
  };

  if (!data) {
    return <div style={{ color: C.mut }} className="py-20 text-center text-[13px]">{err || "구독 정보를 불러오는 중…"}</div>;
  }

  const sub = data.subscription;
  const subStatus = sub ? SUB_STATUS[sub.status] || SUB_STATUS.incomplete : null;
  const planKeys = Object.keys(data.plans);
  const PLAN_FEATURE_ROWS = [
    ["증적 한도", (p) => (p.maxEntries < 0 ? "무제한" : `${p.maxEntries.toLocaleString("ko-KR")}건`)],
    ["PDF 증거 패키지", (p) => (p.features.pdf ? "포함" : "미포함 (CSV만)")],
    ["자동 무결성 모니터링", (p) => (p.features.monitor ? "포함" : "미포함")],
    ["외부 타임스탬프 앵커링", (p) => (p.features.anchor ? "포함" : "미포함")],
  ];

  return (
    <div className="space-y-5">
      {err && (
        <div style={{ background: C.redBg, border: "1px solid #E7CCC2", color: C.red }}
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-[12.5px]">
          <AlertTriangle size={16} className="shrink-0" /> {err}
          <button onClick={() => setErr(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}
      {notice && (
        <div style={{ background: C.greenBg, border: "1px solid #CFE3D8", color: C.green }}
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-[12.5px]">
          <BadgeCheck size={16} className="shrink-0" /> {notice}
          <button onClick={() => setNotice(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}
      {completing && (
        <div style={{ background: C.brassBg, border: "1px solid #E6D8AE", color: C.brass }}
          className="rounded-xl px-4 py-3 text-[12.5px]">카드 등록이 확인되었습니다 — 첫 결제를 승인하는 중…</div>
      )}
      {data.mode === "mock" && (
        <div style={{ background: C.amberBg, border: "1px solid #E8DCB8", color: C.amber }}
          className="rounded-xl px-4 py-2.5 text-[11.5px]">
          현재 <b>모의 결제 모드</b>(개발용)입니다 — 카드 등록·청구가 시뮬레이션됩니다. 서버에
          <code style={{ fontFamily: MONO }}> TOSS_CLIENT_KEY / TOSS_SECRET_KEY </code>를 설정하면 토스페이먼츠 실결제로 전환됩니다.
        </div>
      )}

      {/* 현재 구독 */}
      <section style={{ background: C.ink, border: `1px solid ${C.ink3}` }} className="rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CreditCard size={17} color={C.brass2} />
              <span style={{ color: C.paper, fontFamily: SERIF }} className="text-[17px] font-semibold">현재 구독</span>
              {subStatus && <Pill tone={subStatus.tone}>{subStatus.label}</Pill>}
              {sub?.cancelAtPeriodEnd && <Pill tone="warn" icon={CalendarClock}>해지 예약됨</Pill>}
            </div>
            <div style={{ color: "#9FB0C2" }} className="mt-2 text-[12.5px]">
              {data.plans[data.currentPlan]?.label || data.currentPlan} 플랜
              {sub?.amount ? ` · 월 ${won(sub.amount)} (VAT 포함)` : " · 무료"}
              {sub?.cardSummary ? ` · ${sub.cardSummary}` : ""}
            </div>
            {sub?.nextBillingAt && (
              <div style={{ color: "#8A9BAD" }} className="mt-1 text-[11.5px]">
                {sub.cancelAtPeriodEnd ? "이용 종료 예정일" : "다음 자동 결제일"} · {fmtDate(sub.nextBillingAt)}
                {sub.failCount > 0 && ` · 결제 실패 ${sub.failCount}회 (3회 실패 시 Free 전환)`}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {sub && sub.status !== "canceled" && sub.nextBillingAt && (
              sub.cancelAtPeriodEnd
                ? <button onClick={resume} style={{ background: C.brass2, color: C.ink }}
                    className="rounded-lg px-3.5 py-2 text-[12.5px] font-semibold transition active:scale-[.98]">해지 철회</button>
                : <button onClick={cancel} style={{ color: "#E48A72", border: "1px solid #3A2A28" }}
                    className="rounded-lg px-3.5 py-2 text-[12.5px] font-medium transition hover:bg-white/5">구독 해지</button>
            )}
          </div>
        </div>
      </section>

      {/* 계약 현황 */}
      <section style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded-2xl p-5">
        <div className="flex items-center gap-2">
          <FileSignature size={16} color={C.brass} />
          <h2 style={{ color: C.text }} className="text-[14px] font-semibold">전자 계약</h2>
          <span style={{ color: C.mut }} className="text-[11px]">유료 플랜 결제 전에 두 계약이 모두 체결되어야 합니다</span>
        </div>
        <div className="mt-3 space-y-2">
          {data.contracts.map((c) => (
            <div key={c.kind} style={{ background: "#fff", border: `1px solid ${C.line}` }}
              className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3">
              <div className="min-w-0 flex-1">
                <div style={{ color: C.text }} className="text-[12.5px] font-semibold">{c.title} <span style={{ color: C.mut }} className="font-normal">v{c.version}</span></div>
                {c.signed
                  ? <div style={{ color: C.sub }} className="mt-0.5 text-[11px]">
                      {fmtDate(c.signedAt)} · {c.signerName} 전자서명
                      {c.valid && !(c.valid.sealValid && c.valid.docMatches) && <span style={{ color: C.red }}> · ⚠ 체결기록 검증 실패</span>}
                    </div>
                  : <div style={{ color: C.mut }} className="mt-0.5 text-[11px]">미체결 — 플랜 결제 시 체결 절차가 진행됩니다</div>}
              </div>
              {c.signed
                ? <>
                    <Pill tone="ok" icon={Check}>체결됨</Pill>
                    <button onClick={() => api.contractPdf(c.kind)}
                      style={{ color: C.brass, border: `1px solid ${C.line}`, background: "#fff" }}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-medium transition hover:bg-[#F4F1E9]">
                      <FileDown size={12} /> 체결본 PDF
                    </button>
                  </>
                : <Pill tone="warn" icon={PenLine}>미체결</Pill>}
            </div>
          ))}
        </div>
      </section>

      {/* 플랜 선택 */}
      <section>
        <h2 style={{ color: C.text }} className="mb-3 text-[15px] font-semibold tracking-tight">플랜</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {planKeys.map((k) => {
            const p = data.plans[k];
            const current = data.currentPlan === k;
            const paid = p.priceMonthly > 0;
            return (
              <div key={k} style={{ background: C.card, border: `1px solid ${current ? C.brass : C.line}` }}
                className="flex flex-col rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <span style={{ color: C.text, fontFamily: SERIF }} className="text-[16px] font-semibold">{p.label}</span>
                  {current && <Pill tone="ink" icon={BadgeCheck}>이용 중</Pill>}
                </div>
                <div className="mt-2">
                  <span style={{ color: C.text, fontFamily: SERIF }} className="text-[22px] font-semibold">
                    {paid ? won(p.priceMonthly) : "무료"}
                  </span>
                  {paid && <span style={{ color: C.mut }} className="ml-1 text-[11px]">/월 · VAT 포함</span>}
                </div>
                <div className="mt-3 flex-1 space-y-1.5">
                  {PLAN_FEATURE_ROWS.map(([label, fn]) => (
                    <div key={label} className="flex items-center justify-between text-[11.5px]">
                      <span style={{ color: C.sub }}>{label}</span>
                      <span style={{ color: C.text }} className="font-medium">{fn(p)}</span>
                    </div>
                  ))}
                </div>
                {!current && paid && (
                  <button onClick={() => setSubscribing(k)}
                    style={{ background: `linear-gradient(135deg,${C.brass2},${C.brass})`, color: C.ink }}
                    className="mt-4 rounded-lg py-2.5 text-[13px] font-semibold transition active:scale-[.98]">
                    계약 체결 후 결제하기
                  </button>
                )}
                {!current && !paid && (
                  <div style={{ color: C.mut }} className="mt-4 text-center text-[11px]">유료 구독 해지 시 자동 전환됩니다</div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 결제 내역 */}
      <section style={{ background: C.card, border: `1px solid ${C.line}` }} className="overflow-hidden rounded-2xl">
        <div style={{ borderBottom: `1px solid ${C.line}` }} className="flex items-center gap-2 px-5 py-3.5">
          <Receipt size={15} color={C.brass} />
          <h2 style={{ color: C.text }} className="text-[13.5px] font-semibold">결제 내역</h2>
        </div>
        {data.payments.length === 0 ? (
          <div style={{ color: C.mut }} className="px-5 py-8 text-center text-[12px]">아직 결제 내역이 없습니다.</div>
        ) : (
          <div className="divide-y" style={{ borderColor: C.line2 }}>
            {data.payments.map((p) => (
              <div key={p.orderId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                {p.status === "DONE"
                  ? <CheckCircle2 size={15} color={C.green} className="shrink-0" />
                  : <AlertCircle size={15} color={C.red} className="shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div style={{ color: C.text }} className="text-[12.5px] font-medium">{p.orderName}</div>
                  <div style={{ color: C.mut, fontFamily: MONO }} className="text-[10.5px]">
                    {new Date(p.approvedAt || p.createdAt).toLocaleString("ko-KR")} · {p.orderId}
                    {p.message && <span style={{ color: C.red, fontFamily: "inherit" }}> · {p.message}</span>}
                  </div>
                </div>
                <span style={{ color: p.status === "DONE" ? C.text : C.red, fontFamily: MONO }} className="text-[12.5px] font-semibold">
                  {won(p.amount)}
                </span>
                {p.receiptUrl && (
                  <a href={p.receiptUrl} target="_blank" rel="noreferrer"
                    style={{ color: C.brass }} className="inline-flex items-center gap-1 text-[11px] font-medium">
                    영수증 <ExternalLink size={11} />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {subscribing && (
        <SubscribeModal
          planKey={subscribing} data={data}
          onClose={() => setSubscribing(null)}
          onDone={async (msg) => {
            setSubscribing(null);
            if (msg) setNotice(msg);
            await reload();
            onPlanChanged();
          }}
        />
      )}
    </div>
  );
}

/* ── 계약 체결 → 카드 등록 → 첫 결제 모달 ── */
function SubscribeModal({ planKey, data, onClose, onDone }) {
  const plan = data.plans[planKey];
  const unsigned = data.contracts.filter((c) => !c.signed);
  const [step, setStep] = useState(unsigned.length ? "contract" : "pay"); // contract → pay → done
  const [idx, setIdx] = useState(0);                 // 지금 체결 중인 계약 인덱스 (unsigned 기준)
  const [texts, setTexts] = useState({});            // kind → 계약서 전문
  const [signer, setSigner] = useState({ name: "", title: "", email: "" });
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(null);            // complete 응답

  // 미체결 계약 전문 로드
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const c of unsigned) {
        const d = await api.contract(c.kind);
        if (!alive) return;
        setTexts((t) => ({ ...t, [c.kind]: d.body }));
      }
    })();
    return () => { alive = false; };
  }, []); // 모달 오픈 시 1회

  const current = unsigned[idx];

  const sign = async () => {
    if (!signer.name.trim() || !signer.title.trim() || !signer.email.trim()) { setErr("서명자 성명·직책·이메일을 모두 입력하세요."); return; }
    if (!agreed) { setErr("계약 내용 확인·동의에 체크해야 체결할 수 있습니다."); return; }
    setBusy(true); setErr(null);
    const r = await api.signContract(current.kind, {
      signerName: signer.name, signerTitle: signer.title, signerEmail: signer.email, agreed: true,
    });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setAgreed(false);
    if (idx + 1 < unsigned.length) setIdx(idx + 1);
    else setStep("pay");
  };

  const pay = async () => {
    setBusy(true); setErr(null);
    try {
      const co = await api.checkout(planKey);
      if (co.error) throw new Error(co.error);
      if (co.mode === "mock") {
        // 모의 모드 — 카드등록창 없이 서버가 등록·첫 결제를 시뮬레이션
        const res = await api.completeBilling({ plan: planKey });
        if (res.error) throw new Error(res.error);
        setDone(res);
        setStep("done");
      } else {
        // 실결제 — 토스 카드등록창으로 이동(리다이렉트). 복귀 후 BillingView가 승인을 마무리한다.
        const TossPayments = await loadTossSdk();
        await TossPayments(co.clientKey).requestBillingAuth("카드", {
          customerKey: co.customerKey,
          successUrl: `${window.location.origin}/?billing=auth&plan=${planKey}`,
          failUrl: `${window.location.origin}/?billing=fail`,
        });
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const field = { background: "#fff", border: `1px solid ${C.line}`, color: C.text };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(14,22,33,.55)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: C.card, border: `1px solid ${C.line}` }}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl shadow-2xl">
        <div style={{ background: C.ink }} className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            {step === "pay" ? <CreditCard size={17} color={C.brass2} /> : <FileSignature size={17} color={C.brass2} />}
            <span style={{ color: C.paper, fontFamily: SERIF }} className="text-[15px] font-semibold">
              {plan.label} 플랜 — {step === "contract" ? `계약 체결 (${idx + 1}/${unsigned.length})` : step === "pay" ? "결제" : "완료"}
            </span>
          </div>
          <button onClick={onClose}><X size={18} color="#8A9BAD" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {err && (
            <div style={{ background: C.redBg, border: "1px solid #E7CCC2", color: C.red }}
              className="mb-4 rounded-xl px-4 py-2.5 text-[12px]">{err}</div>
          )}

          {step === "contract" && current && (
            <>
              <div style={{ color: C.text }} className="text-[14px] font-semibold">{current.title} <span style={{ color: C.mut }} className="text-[11px] font-normal">v{current.version}</span></div>
              <div style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}
                className="mt-3 h-64 overflow-y-auto whitespace-pre-wrap rounded-xl p-4 text-[11.5px] leading-relaxed">
                {texts[current.kind] || "계약서를 불러오는 중…"}
              </div>
              <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
                <input value={signer.name} onChange={(e) => setSigner((s) => ({ ...s, name: e.target.value }))}
                  placeholder="서명자 성명" style={field} className="rounded-lg px-3 py-2 text-[12.5px] outline-none" />
                <input value={signer.title} onChange={(e) => setSigner((s) => ({ ...s, title: e.target.value }))}
                  placeholder="직책 (예: 대표이사)" style={field} className="rounded-lg px-3 py-2 text-[12.5px] outline-none" />
                <input value={signer.email} onChange={(e) => setSigner((s) => ({ ...s, email: e.target.value }))}
                  placeholder="이메일" type="email" style={field} className="rounded-lg px-3 py-2 text-[12.5px] outline-none" />
              </div>
              <label className="mt-3 flex cursor-pointer items-start gap-2">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
                <span style={{ color: C.sub }} className="text-[12px] leading-snug">
                  위 계약서 전문을 확인했으며 내용에 동의합니다. 체결 시 계약서 원문의 SHA-256 해시와 서명 정보가
                  위변조 방지 봉인과 함께 기록됩니다.
                </span>
              </label>
              <button onClick={sign} disabled={busy}
                style={{ background: C.ink, color: C.paper }}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold transition active:scale-[.98] disabled:opacity-60">
                <PenLine size={14} /> {busy ? "체결 중…" : "전자서명으로 체결"}
              </button>
            </>
          )}

          {step === "pay" && (
            <>
              <div style={{ background: "#fff", border: `1px solid ${C.line}` }} className="rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <span style={{ color: C.sub }} className="text-[12.5px]">가드노트 {plan.label} 플랜 (월간)</span>
                  <span style={{ color: C.text, fontFamily: SERIF }} className="text-[18px] font-semibold">{won(plan.priceMonthly)}<span style={{ color: C.mut }} className="text-[11px]">/월</span></span>
                </div>
                <div style={{ color: C.mut }} className="mt-1 text-[11px]">
                  VAT 포함 · 오늘 첫 결제 후 매월 같은 날 등록 카드로 자동 결제 · 언제든 해지 가능
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <BadgeCheck size={14} color={C.green} />
                <span style={{ color: C.sub }} className="text-[12px]">서비스 이용계약서·개인정보 처리위탁 계약서 체결 완료</span>
              </div>
              <button onClick={pay} disabled={busy}
                style={{ background: `linear-gradient(135deg,${C.brass2},${C.brass})`, color: C.ink }}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg py-3 text-[13.5px] font-semibold transition active:scale-[.98] disabled:opacity-60">
                <CreditCard size={15} />
                {busy ? "처리 중…" : data.mode === "mock" ? "모의 카드 등록 + 첫 결제 진행 (개발용)" : "카드 등록하고 결제하기"}
              </button>
              {data.mode !== "mock" && (
                <p style={{ color: C.mut }} className="mt-2 text-center text-[10.5px]">토스페이먼츠 카드등록창으로 이동합니다</p>
              )}
            </>
          )}

          {step === "done" && done && (
            <div className="py-4 text-center">
              <BadgeCheck size={40} color={C.green} className="mx-auto" />
              <div style={{ color: C.text, fontFamily: SERIF }} className="mt-3 text-[17px] font-semibold">결제 완료 — {done.plan.label} 플랜이 활성화되었습니다</div>
              <div style={{ color: C.sub }} className="mt-2 text-[12.5px]">
                {done.subscription.cardSummary} · 월 {won(done.subscription.amount)} · 다음 결제일 {fmtDate(done.subscription.nextBillingAt)}
              </div>
              <button onClick={() => onDone(`${done.plan.label} 플랜 결제가 완료되었습니다.`)}
                style={{ background: C.ink, color: C.paper }}
                className="mt-5 rounded-lg px-6 py-2.5 text-[13px] font-semibold transition active:scale-[.98]">확인</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════ Evidence Package modal ════════════════════════ */
function PackageModal({ onClose }) {
  const [stage, setStage] = useState("build"); // build → done
  const [pkg, setPkg] = useState(null);
  const [downloading, setDownloading] = useState(null); // "csv" | "pdf" | null
  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await api.pkg();
      await new Promise((r) => setTimeout(r, 900));
      if (alive) { setPkg(p); setStage("done"); }
    })();
    return () => { alive = false; };
  }, []);
  const intact = pkg?.integrity?.intact;
  const download = async (type) => {
    setDownloading(type);
    try {
      await (type === "csv" ? api.exportCsv() : api.exportPdf());
    } finally {
      setDownloading(null);
    }
  };
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
              <div style={{ background: intact ? C.greenBg : C.redBg, border: `1px solid ${intact ? "#CFE3D8" : "#E7CCC2"}` }}
                className="flex items-center gap-2.5 rounded-xl px-4 py-3">
                {intact ? <BadgeCheck size={20} color={C.green} strokeWidth={2.2} />
                        : <AlertTriangle size={20} color={C.red} strokeWidth={2.2} />}
                <div>
                  <div style={{ color: intact ? C.green : C.red }} className="text-[13px] font-semibold">
                    {intact ? "제출용 패키지 준비 완료" : "무결성 위반 — 제출 전 원장 확인 필요"}
                  </div>
                  <div style={{ color: intact ? "#3E6B53" : "#8A4030" }} className="text-[11px]">
                    PDF + 검증서 · SHA-256 체인 {pkg?.blocks}블록
                  </div>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {pkg?.contents?.map((c, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <FileCheck2 size={15} color={C.brass} className="shrink-0" />
                    <span style={{ color: C.text }} className="text-[12.5px]">{c}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex gap-2">
                <button onClick={() => download("csv")} disabled={!!downloading}
                  style={{ color: C.brass, border: `1px solid ${C.line}`, background: "#fff" }}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold transition disabled:opacity-60">
                  <FileDown size={15} strokeWidth={2.4} /> {downloading === "csv" ? "생성 중…" : "CSV"}
                </button>
                <button onClick={() => download("pdf")} disabled={!!downloading}
                  style={{ background: `linear-gradient(135deg,${C.brass2},${C.brass})`, color: C.ink }}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold transition disabled:opacity-60">
                  <Download size={15} strokeWidth={2.4} /> {downloading === "pdf" ? "생성 중…" : "PDF 다운로드"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════ 팀 · 계정 ════════════════════════ */
const ACTIVITY_LABEL = {
  login: "로그인", logout: "로그아웃", "invite.accept": "합류",
  "password.change": "비밀번호 변경", "entry.seal": "봉인", "export.csv": "CSV 내보내기",
  "export.pdf": "PDF 내보내기", "team.invite": "초대 발급", "team.disable": "계정 비활성화",
  "team.enable": "계정 활성화", "team.reset-link": "재설정 링크 발급",
};

function TeamView({ user }) {
  const [data, setData] = useState(null);        // { users, me }
  const [activity, setActivity] = useState([]);
  const [err, setErr] = useState(null);
  const [notice, setNotice] = useState(null);
  const [inv, setInv] = useState({ email: "", role: "member" });
  const [link, setLink] = useState(null);        // { label, url } — 발급 직후 1회 표시
  const [pw, setPw] = useState({ current: "", next: "", next2: "" });
  const [busy, setBusy] = useState(false);
  const isOwner = user?.role === "owner";

  const reload = useCallback(async () => {
    if (!user) return;
    try {
      const d = await api.team.list();
      if (d.error) throw new Error(d.error);
      setData(d);
      if (isOwner) {
        const a = await api.team.activity();
        setActivity(a.activity || []);
      }
    } catch (e) {
      if (e.message !== "AUTH_REQUIRED") setErr("팀 정보를 불러오지 못했습니다.");
    }
  }, [user, isOwner]);
  useEffect(() => { reload(); }, [reload]);

  // 접속 키 모드 — 계정 기능을 쓸 수 없음을 안내
  if (!user) {
    return (
      <section style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded-2xl p-6">
        <div className="flex items-center gap-2">
          <UserCog size={18} color={C.brass} />
          <h2 style={{ color: C.text, fontFamily: SERIF }} className="text-[17px] font-semibold">팀 · 계정</h2>
        </div>
        <p style={{ color: C.sub }} className="mt-3 text-[13px] leading-relaxed">
          지금은 <b>접속 키</b>로 들어와 있어 계정 기능(팀원 관리·기록자 봉인·활동 로그)을 쓸 수 없습니다.
          계정은 <b>초대 링크</b>로 만들어집니다 — 링크가 필요하면 가드노트 운영팀 또는 회사의 소유자(owner)에게 요청하세요.
        </p>
        <p style={{ color: C.mut }} className="mt-2 text-[11.5px]">
          계정으로 봉인한 기록에는 인증된 기록자가 해시 체인에 함께 봉인되어 증거의 신빙성이 올라갑니다.
        </p>
      </section>
    );
  }

  const submitInvite = async (e) => {
    e.preventDefault();
    if (!inv.email.trim() || busy) return;
    setBusy(true); setErr(null);
    const out = await api.team.invite(inv.email.trim(), inv.role);
    setBusy(false);
    if (out.error) { setErr(out.error); return; }
    setLink({ label: `${inv.email.trim()} 초대 링크 (7일 유효)`, url: out.inviteUrl });
    setInv({ email: "", role: "member" });
    reload();
  };

  const resetLink = async (u) => {
    const out = await api.team.resetLink(u.id);
    if (out.error) { setErr(out.error); return; }
    setLink({ label: `${u.email} 비밀번호 재설정 링크 (7일 유효)`, url: out.inviteUrl });
  };

  const toggleStatus = async (u) => {
    const next = u.status === "active" ? "disabled" : "active";
    const out = await api.team.setStatus(u.id, next);
    if (out.error) { setErr(out.error); return; }
    reload();
  };

  const changePw = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (pw.next !== pw.next2) { setErr("새 비밀번호가 서로 다릅니다."); return; }
    setBusy(true); setErr(null); setNotice(null);
    const out = await api.auth.changePassword(pw.current, pw.next);
    setBusy(false);
    if (out.error) { setErr(out.error); return; }
    setPw({ current: "", next: "", next2: "" });
    setNotice("비밀번호가 변경되었습니다. 다른 기기의 세션은 모두 로그아웃 처리됐습니다.");
  };

  const field = { background: "#fff", border: `1px solid ${C.line}`, color: C.text };
  return (
    <div className="space-y-5">
      {err && (
        <div style={{ background: C.redBg, border: "1px solid #E7CCC2", color: C.red }}
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-[12.5px]">
          <AlertTriangle size={16} className="shrink-0" /> {err}
          <button onClick={() => setErr(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}
      {notice && (
        <div style={{ background: C.greenBg, border: "1px solid #CFE3D8", color: C.green }}
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-[12.5px]">
          <BadgeCheck size={16} className="shrink-0" /> {notice}
          <button onClick={() => setNotice(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}
      {link && (
        <div style={{ background: C.brassBg, border: `1px solid ${C.brass2}` }} className="rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span style={{ color: C.brass }} className="text-[12px] font-semibold">⚠️ {link.label} — 지금 한 번만 표시됩니다. 본인에게 안전한 채널로 전달하세요.</span>
            <button onClick={() => setLink(null)}><X size={15} color={C.mut} /></button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.text, fontFamily: MONO }}
              className="flex-1 overflow-x-auto rounded-md px-3 py-2 text-[11.5px]">{link.url}</code>
            <button onClick={() => navigator.clipboard?.writeText(link.url)}
              style={{ background: C.brass2, color: C.ink }}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-2 text-[11.5px] font-semibold"><Copy size={12} /> 복사</button>
          </div>
        </div>
      )}

      {/* 팀원 목록 */}
      <section style={{ background: C.card, border: `1px solid ${C.line}` }} className="overflow-hidden rounded-2xl">
        <div style={{ borderBottom: `1px solid ${C.line}` }} className="flex flex-wrap items-center gap-2 px-5 py-3.5">
          <UserCog size={15} color={C.brass} />
          <h2 style={{ color: C.text }} className="text-[13.5px] font-semibold">팀원</h2>
          <span style={{ color: C.mut }} className="text-[11px]">계정으로 봉인한 기록에는 기록자가 함께 봉인됩니다</span>
        </div>
        {isOwner && (
          <form onSubmit={submitInvite} style={{ background: "#fff", borderBottom: `1px solid ${C.line2}` }}
            className="flex flex-wrap items-center gap-2 px-5 py-3">
            <input value={inv.email} onChange={(e) => setInv((f) => ({ ...f, email: e.target.value }))}
              placeholder="초대할 이메일" type="email" style={field}
              className="w-56 rounded-lg px-3 py-1.5 text-[12px] outline-none" />
            <select value={inv.role} onChange={(e) => setInv((f) => ({ ...f, role: e.target.value }))}
              style={field} className="rounded-lg px-2 py-1.5 text-[12px]">
              <option value="member">팀원</option>
              <option value="owner">소유자</option>
            </select>
            <button type="submit" disabled={busy}
              style={{ background: C.ink, color: C.paper }}
              className="rounded-lg px-3.5 py-1.5 text-[12px] font-semibold transition active:scale-[.98] disabled:opacity-60">
              초대 링크 발급
            </button>
            <span style={{ color: C.mut }} className="text-[10.5px]">이메일 발송 없이 링크를 직접 전달하는 방식입니다</span>
          </form>
        )}
        <div className="divide-y" style={{ borderColor: C.line2 }}>
          {(data?.users || []).map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div style={{ color: C.text }} className="text-[12.5px] font-medium">
                  {u.name} {u.email === user.email && <span style={{ color: C.mut }}>(나)</span>}
                </div>
                <div style={{ color: C.mut, fontFamily: MONO }} className="text-[10.5px]">{u.email}</div>
              </div>
              <Pill tone={u.role === "owner" ? "ink" : "mut"}>{u.role === "owner" ? "소유자" : "팀원"}</Pill>
              {u.status === "active"
                ? <Pill tone="ok" icon={Check}>활성</Pill>
                : <Pill tone="bad" icon={AlertCircle}>비활성</Pill>}
              {isOwner && u.email !== user.email && (
                <div className="flex items-center gap-1.5">
                  <button onClick={() => resetLink(u)}
                    style={{ color: C.brass, border: `1px solid ${C.line}`, background: "#fff" }}
                    className="rounded-md px-2 py-1 text-[11px] transition hover:bg-[#F4F1E9]">비밀번호 재설정</button>
                  <button onClick={() => toggleStatus(u)}
                    style={{ color: u.status === "active" ? C.red : C.green, border: `1px solid ${C.line}`, background: "#fff" }}
                    className="rounded-md px-2 py-1 text-[11px] transition hover:bg-[#F4F1E9]">
                    {u.status === "active" ? "비활성화" : "재활성화"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 내 비밀번호 변경 */}
      <section style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded-2xl p-5">
        <div className="flex items-center gap-2">
          <KeyRound size={15} color={C.brass} />
          <h2 style={{ color: C.text }} className="text-[13.5px] font-semibold">비밀번호 변경</h2>
        </div>
        <form onSubmit={changePw} className="mt-3 grid gap-2.5 sm:grid-cols-3">
          <input value={pw.current} onChange={(e) => setPw((f) => ({ ...f, current: e.target.value }))}
            placeholder="현재 비밀번호" type="password" autoComplete="current-password" style={field}
            className="rounded-lg px-3 py-2 text-[12.5px] outline-none" />
          <input value={pw.next} onChange={(e) => setPw((f) => ({ ...f, next: e.target.value }))}
            placeholder="새 비밀번호 (8자 이상)" type="password" autoComplete="new-password" style={field}
            className="rounded-lg px-3 py-2 text-[12.5px] outline-none" />
          <input value={pw.next2} onChange={(e) => setPw((f) => ({ ...f, next2: e.target.value }))}
            placeholder="새 비밀번호 확인" type="password" autoComplete="new-password" style={field}
            className="rounded-lg px-3 py-2 text-[12.5px] outline-none" />
          <div className="sm:col-span-3">
            <button type="submit" disabled={busy}
              style={{ background: C.ink, color: C.paper }}
              className="rounded-lg px-4 py-2 text-[12.5px] font-semibold transition active:scale-[.98] disabled:opacity-60">
              변경
            </button>
          </div>
        </form>
      </section>

      {/* 활동 로그 (owner) */}
      {isOwner && (
        <section style={{ background: C.card, border: `1px solid ${C.line}` }} className="overflow-hidden rounded-2xl">
          <div style={{ borderBottom: `1px solid ${C.line}` }} className="flex items-center gap-2 px-5 py-3.5">
            <Activity size={15} color={C.brass} />
            <h2 style={{ color: C.text }} className="text-[13.5px] font-semibold">활동 로그</h2>
            <span style={{ color: C.mut }} className="text-[11px]">누가 로그인·봉인·내보내기를 했는지 — 지울 수 없습니다</span>
          </div>
          {activity.length === 0 ? (
            <div style={{ color: C.mut }} className="px-5 py-8 text-center text-[12px]">아직 기록이 없습니다.</div>
          ) : (
            <div className="divide-y" style={{ borderColor: C.line2 }}>
              {activity.slice(0, 15).map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span style={{ color: C.brass, fontFamily: MONO }} className="w-28 shrink-0 text-[11px]">{ACTIVITY_LABEL[a.action] || a.action}</span>
                  <span style={{ color: C.text, fontFamily: MONO }} className="shrink-0 text-[11.5px]">{a.email}</span>
                  <span style={{ color: C.sub }} className="min-w-0 flex-1 truncate text-[11.5px]">{a.detail || ""}</span>
                  <span style={{ color: C.mut, fontFamily: MONO }} className="ml-auto shrink-0 text-[10.5px]">{new Date(a.at).toLocaleString("ko-KR")}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* ════════════════════════ 관리자 콘솔 ════════════════════════ */
// 발급받은 새 API 키를 "이 화면에서 한 번만" 보여주는 상자 (복사 지원)
function RevealKey({ label, apiKey, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(apiKey); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard 차단 환경 */ }
  };
  return (
    <div style={{ background: "#1E2A38", border: `1px solid ${C.brass}` }} className="mt-3 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <span style={{ color: C.brass2 }} className="text-[12px] font-semibold">⚠️ {label} — 지금 한 번만 표시됩니다. 안전한 곳에 보관하세요.</span>
        <button onClick={onClose}><X size={15} color="#8A9BAD" /></button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <code style={{ background: C.ink, color: C.paper, fontFamily: MONO }} className="flex-1 overflow-x-auto rounded-md px-3 py-2 text-[12px]">{apiKey}</code>
        <button onClick={copy} style={{ background: C.brass2, color: C.ink }} className="inline-flex items-center gap-1 rounded-md px-2.5 py-2 text-[11.5px] font-semibold">
          <Copy size={12} /> {copied ? "복사됨" : "복사"}
        </button>
      </div>
    </div>
  );
}

function AdminConsole({ onLogout }) {
  const [data, setData] = useState(null);   // { tenants, plans }
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [audit, setAudit] = useState([]); // 관리자 감사 로그
  const [err, setErr] = useState(null);
  const [reveal, setReveal] = useState(null); // { label, apiKey }
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ slug: "", name: "", plan: "free" });

  const reload = useCallback(async () => {
    try {
      const [t, m, a] = await Promise.all([api.admin.tenants(), api.admin.monitor(), api.admin.audit()]);
      if (t.error) throw new Error(t.error);
      setData(t);
      setRuns(m.runs || []);
      setAudit(a.audit || []);
      setErr(null);
    } catch (e) {
      if (e.message === "AUTH_REQUIRED") { onLogout(); return; }
      setErr("관리자 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => { reload(); }, [reload]);

  const planKeys = data ? Object.keys(data.plans) : ["free", "pro", "enterprise"];

  const createTenant = async (e) => {
    e.preventDefault();
    if (!form.slug.trim() || !form.name.trim() || busy) return;
    setBusy(true); setErr(null);
    const res = await api.admin.createTenant({ slug: form.slug.trim(), name: form.name.trim(), plan: form.plan });
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setReveal({ label: `${res.tenant.name} API 키`, apiKey: res.apiKey });
    setForm({ slug: "", name: "", plan: "free" });
    setShowCreate(false);
    reload();
  };
  const rotate = async (slug, name) => {
    if (!confirm(`${name}(${slug})의 API 키를 재발급할까요? 기존 키는 즉시 무효화됩니다.`)) return;
    const res = await api.admin.rotate(slug);
    if (res.error) { setErr(res.error); return; }
    setReveal({ label: `${name} 새 API 키`, apiKey: res.apiKey });
    reload();
  };
  // 고객사 최초 owner 계정 초대 — 링크를 발급해 담당자에게 안전 채널로 전달한다.
  const inviteOwner = async (slug, name) => {
    const email = prompt(`${name}(${slug})의 소유자(owner)로 초대할 담당자 이메일:`);
    if (!email) return;
    const res = await api.admin.invite(slug, email.trim(), "owner");
    if (res.error) { setErr(res.error); return; }
    setReveal({ label: `${name} owner 초대 링크 (7일 유효, 1회 표시)`, apiKey: res.inviteUrl });
  };
  const changePlan = async (slug, plan) => {
    const res = await api.admin.setPlan(slug, plan);
    if (res.error) { setErr(res.error); return; }
    reload();
  };
  const anchor = async (slug) => {
    const res = await api.admin.anchor(slug);
    if (res.error) { setErr(res.error); return; }
    reload();
  };
  const runMonitor = async () => {
    setBusy(true);
    await api.admin.runMonitor();
    setBusy(false);
    reload();
  };
  const runBilling = async () => {
    setBusy(true);
    const r = await api.admin.runBilling();
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    alert(r.ran === 0 ? "청구 시점이 도래한 구독이 없습니다." : `${r.ran}건 처리: ${JSON.stringify(r.results)}`);
    reload();
  };

  const statusPill = (t) => {
    if (!t.integrity.intact) return <Pill tone="bad" icon={AlertTriangle}>위반</Pill>;
    return <Pill tone="ok" icon={BadgeCheck}>정상</Pill>;
  };
  const anchorPill = (t) => {
    if (!t.anchor?.anchored) return <Pill tone="mut">미앵커</Pill>;
    return t.anchor.ok ? <Pill tone="ok" icon={Fingerprint}>#{String(t.anchor.seq).padStart(2, "0")}</Pill>
                       : <Pill tone="bad" icon={AlertTriangle}>불일치</Pill>;
  };

  return (
    <div style={{ background: C.ink, color: C.paper, fontFamily: "ui-sans-serif,system-ui,'Apple SD Gothic Neo','Malgun Gothic',sans-serif" }}
      className="min-h-screen w-full">
      {/* 헤더 */}
      <header style={{ borderBottom: `1px solid ${C.ink3}` }} className="px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div style={{ background: `linear-gradient(135deg,${C.brass2},${C.brass})` }} className="grid h-8 w-8 place-items-center rounded-[7px]">
              <UserCog size={17} strokeWidth={2.4} color={C.ink} />
            </div>
            <div className="leading-none">
              <div className="flex items-center gap-1.5">
                <span style={{ color: C.paper, fontFamily: SERIF }} className="text-[17px] font-semibold">가드노트 관리자 콘솔</span>
              </div>
              <div style={{ color: "#8A9BAD" }} className="mt-[3px] text-[10.5px]">테넌트 온보딩 · 플랜 · 키 · 무결성 모니터링</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={runMonitor} disabled={busy}
              style={{ color: C.brass2, border: `1px solid ${C.ink3}` }}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition hover:bg-white/5 disabled:opacity-60">
              <Activity size={13} /> 모니터 지금 실행
            </button>
            <button onClick={runBilling} disabled={busy}
              style={{ color: C.brass2, border: `1px solid ${C.ink3}` }}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition hover:bg-white/5 disabled:opacity-60">
              <CreditCard size={13} /> 정기결제 실행
            </button>
            <button onClick={onLogout} style={{ color: "#8A9BAD", border: `1px solid ${C.ink3}` }}
              className="rounded-md px-3 py-1.5 text-[12px] transition hover:text-white">로그아웃</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-7 sm:px-8">
        {err && (
          <div style={{ background: "#2A1E1C", border: "1px solid #5A3A34", color: "#E48A72" }} className="mb-5 flex items-center gap-2 rounded-xl px-4 py-3 text-[12.5px]">
            <AlertTriangle size={16} /> {err}
          </div>
        )}
        {reveal && <RevealKey label={reveal.label} apiKey={reveal.apiKey} onClose={() => setReveal(null)} />}

        {/* 테넌트 섹션 */}
        <div className="mt-5 mb-3 flex items-center justify-between">
          <h2 style={{ color: C.paper }} className="text-[15px] font-semibold">고객사(테넌트) {data ? `· ${data.tenants.length}` : ""}</h2>
          <button onClick={() => setShowCreate((v) => !v)} style={{ background: `linear-gradient(135deg,${C.brass2},${C.brass})`, color: C.ink }}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold">
            <Plus size={13} /> 신규 테넌트
          </button>
        </div>

        {showCreate && (
          <form onSubmit={createTenant} style={{ background: C.ink2, border: `1px solid ${C.ink3}` }} className="mb-4 grid gap-2.5 rounded-xl p-4 sm:grid-cols-[1fr,1fr,140px,auto]">
            <input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="slug (예: gmarket)"
              style={{ background: C.ink, border: `1px solid ${C.ink3}`, color: C.paper, fontFamily: MONO }} className="rounded-lg px-3 py-2 text-[12.5px] outline-none" />
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="표시 이름 (예: 지마켓)"
              style={{ background: C.ink, border: `1px solid ${C.ink3}`, color: C.paper }} className="rounded-lg px-3 py-2 text-[12.5px] outline-none" />
            <select value={form.plan} onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
              style={{ background: C.ink, border: `1px solid ${C.ink3}`, color: C.paper }} className="rounded-lg px-3 py-2 text-[12.5px]">
              {planKeys.map((p) => <option key={p} value={p}>{data?.plans[p]?.label || p}</option>)}
            </select>
            <button type="submit" disabled={busy} style={{ background: C.brass2, color: C.ink }} className="rounded-lg px-4 py-2 text-[12.5px] font-semibold disabled:opacity-60">
              {busy ? "생성 중…" : "생성 + 키 발급"}
            </button>
          </form>
        )}

        {loading ? (
          <div style={{ color: "#8A9BAD" }} className="py-16 text-center text-[13px]">불러오는 중…</div>
        ) : (
          <div style={{ background: C.ink2, border: `1px solid ${C.ink3}` }} className="overflow-hidden rounded-xl">
            <div style={{ background: "#101A26", borderBottom: `1px solid ${C.ink3}`, color: "#8A9BAD" }}
              className="grid grid-cols-[1.4fr,1fr,0.8fr,0.8fr,0.8fr,auto] gap-2 px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wide">
              <span>고객사</span><span>플랜</span><span>블록</span><span>무결성</span><span>앵커</span><span className="text-right">작업</span>
            </div>
            <div className="divide-y" style={{ borderColor: C.ink3 }}>
              {data.tenants.map((t) => (
                <div key={t.slug} className="grid grid-cols-[1.4fr,1fr,0.8fr,0.8fr,0.8fr,auto] items-center gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <div style={{ color: C.paper }} className="truncate text-[13px] font-medium">{t.name}</div>
                    <div style={{ color: C.mut, fontFamily: MONO }} className="text-[10.5px]">{t.slug}</div>
                  </div>
                  <div>
                    <select value={t.plan.key} onChange={(e) => changePlan(t.slug, e.target.value)}
                      style={{ background: C.ink, border: `1px solid ${C.ink3}`, color: C.paper }} className="rounded-md px-2 py-1 text-[11.5px]">
                      {planKeys.map((p) => <option key={p} value={p}>{data.plans[p]?.label || p}</option>)}
                    </select>
                  </div>
                  <div style={{ color: "#9FB0C2", fontFamily: MONO }} className="text-[12px]">{t.blocks}</div>
                  <div>{statusPill(t)}</div>
                  <div>{anchorPill(t)}</div>
                  <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => inviteOwner(t.slug, t.name)} title="owner 계정 초대 링크 발급"
                      style={{ color: "#9FD0AE", border: `1px solid ${C.ink3}` }} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition hover:bg-white/5">
                      <Plus size={12} /> 초대
                    </button>
                    <button onClick={() => anchor(t.slug)} title="지금 앵커링"
                      style={{ color: C.brass2, border: `1px solid ${C.ink3}` }} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition hover:bg-white/5">
                      <Fingerprint size={12} /> 앵커
                    </button>
                    <button onClick={() => rotate(t.slug, t.name)} title="API 키 재발급"
                      style={{ color: "#E4B36A", border: `1px solid ${C.ink3}` }} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition hover:bg-white/5">
                      <KeyRound size={12} /> 키 재발급
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 모니터 로그 */}
        <h2 style={{ color: C.paper }} className="mb-3 mt-8 text-[15px] font-semibold">최근 무결성 검증 기록</h2>
        <div style={{ background: C.ink2, border: `1px solid ${C.ink3}` }} className="overflow-hidden rounded-xl">
          {runs.length === 0 ? (
            <div style={{ color: C.mut }} className="px-4 py-8 text-center text-[12px]">
              아직 자동 검증 기록이 없습니다. 상단 “모니터 지금 실행”을 누르거나, 서버에 GUARDNOTE_MONITOR_INTERVAL_MS 를 설정하세요.
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: C.ink3 }}>
              {runs.slice(0, 12).map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  {r.intact ? <BadgeCheck size={15} color={C.green} className="shrink-0" /> : <AlertTriangle size={15} color="#E48A72" className="shrink-0" />}
                  <span style={{ color: C.paper, fontFamily: MONO }} className="w-24 shrink-0 text-[11.5px]">{r.slug}</span>
                  <span style={{ color: r.intact ? "#7FB79A" : "#E48A72" }} className="w-24 shrink-0 text-[11.5px]">
                    {r.intact ? "정상" : r.truncated ? "꼬리절단" : r.first_broken_seq != null ? `#${String(r.first_broken_seq).padStart(2, "0")} 불일치` : "위반"}
                  </span>
                  <span style={{ color: C.mut }} className="text-[11px]">블록 {r.blocks}</span>
                  {!!r.alerted && <Pill tone="bad" icon={Radio}>알림 발송</Pill>}
                  <span style={{ color: C.mut, fontFamily: MONO }} className="ml-auto text-[10.5px]">{new Date(r.checked_at).toLocaleString("ko-KR")}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 관리자 감사 로그 — 운영 행위(온보딩·키·플랜·앵커)는 전부 기록되고 지울 수 없다 */}
        <h2 style={{ color: C.paper }} className="mb-3 mt-8 text-[15px] font-semibold">운영 감사 로그</h2>
        <div style={{ background: C.ink2, border: `1px solid ${C.ink3}` }} className="overflow-hidden rounded-xl">
          {audit.length === 0 ? (
            <div style={{ color: C.mut }} className="px-4 py-8 text-center text-[12px]">
              아직 기록된 운영 행위가 없습니다. 테넌트 생성·키 재발급·플랜 변경 등이 여기 남습니다.
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: C.ink3 }}>
              {audit.slice(0, 12).map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span style={{ color: C.brass2, fontFamily: MONO }} className="w-32 shrink-0 text-[11px]">
                    {{ "tenant.create": "테넌트 생성", "tenant.rotate": "키 재발급", "tenant.plan": "플랜 변경",
                       "tenant.anchor": "앵커링", "monitor.run": "모니터 실행", "billing.run": "정기결제 실행" }[a.action] || a.action}
                  </span>
                  <span style={{ color: C.paper, fontFamily: MONO }} className="w-24 shrink-0 truncate text-[11.5px]">{a.target || "—"}</span>
                  <span style={{ color: "#9FB0C2" }} className="min-w-0 flex-1 truncate text-[11.5px]">{a.detail || ""}</span>
                  <span style={{ color: C.mut, fontFamily: MONO }} className="ml-auto shrink-0 text-[10.5px]">{new Date(a.at).toLocaleString("ko-KR")}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <p style={{ color: C.mut }} className="mt-6 text-[11px] leading-relaxed">
          ※ 관리자 토큰은 모든 테넌트를 넘나드는 운영 권한입니다. 프로덕션에서는 GUARDNOTE_ADMIN_TOKEN 을 시크릿 매니저로 주입하세요.
        </p>
      </main>
    </div>
  );
}
