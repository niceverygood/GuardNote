# 가드노트 · GuardNote

개인정보 안전조치 **상시 증적 시스템**. 안전성 확보조치 10개 항목(고시 제4조~제13조)의 이행 활동을
**위변조 불가능한 해시 체인(SHA-256)**으로 봉인 기록해, 조사·손해배상 청구 시
"고의·과실 없음"을 입증할 수 있는 방어 자료로 축적한다.

> ⚠️ 이 시스템은 **법적 증적(무결성 기록)** 을 위한 것이지, 방화벽·백신 같은
> 침입 차단(공격 방어) 도구가 아니다.

## 구성

- **프론트엔드** — React 18 + Vite + Tailwind (`src/`)
- **백엔드** — Express + SQLite(better-sqlite3), **멀티테넌시** (`server/`)
- **원장** — `server/guardnote.db` (append-only, 서버가 테넌트별로 해시 체인 계산)

## 배포 모델 — 고객사는 어떻게 도입하나

고객사 서버에 이 프로그램을 통째로 설치하지 않는다. 대신:

- **고객사 내부**: 접속로그·권한변경 등을 읽어 API로 전송하는 가벼운 수집기만 설치
  (`server/collector-example.js`)
- **우리 쪽(SaaS)**: 실제 해시체인 봉인·저장·검증은 벤더가 운영하는 중립적인 서버에서 수행

이렇게 하면 (1) 고객사 프로덕션에 미치는 영향이 최소화되고, (2) 원장이 고객사 통제 밖에
있어 "고객사가 몰래 고칠 수 있었다"는 의심 없이 증거 신뢰성이 유지된다.

## 고객사(테넌트) 온보딩

고객사 1곳 = 원장 1개. 완전히 격리된다 (다른 고객사 데이터를 절대 볼 수 없음).
CLI 또는 **관리자 콘솔**(아래) 어느 쪽으로도 온보딩할 수 있다.

```bash
cd /Users/seungsoohan/Projects/GuardNote
npm run tenant gmarket "지마켓" pro      # slug 이름 [plan] · plan: free|pro|enterprise (기본 free)
npm run tenant -- list                   # 전체 테넌트 목록
```

API 키가 **이 실행에서 딱 한 번만** 출력된다. 이 키를:
- 프론트엔드 접속 시 로그인 화면에 입력, 또는
- 고객사 수집기 실행 시 환경변수로 전달: `GUARDNOTE_API_KEY=gn_live_... npm run collector`

**키 재발급(로테이션)** — 유출 의심 시 같은 테넌트(원장·플랜 그대로)에 새 키만 발급하고 기존 키를 즉시 무효화:

```bash
cd /Users/seungsoohan/Projects/GuardNote
npm run rotate-key gmarket
```

## 실행 (로컬 개발)

```bash
cd /Users/seungsoohan/Projects/GuardNote
npm install
npm run dev
```

- 웹: http://localhost:5173  · API: http://localhost:8787
- 최초 구동 시 **데모 테넌트**(`demo`, enterprise)가 자동 생성되고 초기 증적 11건이 시드된다.
- 서버 콘솔에 **데모 테넌트 API 키**와 **관리자 토큰**이 1회 출력된다 — 웹 로그인 화면에 그 값을 입력한다.

개별 실행:

```bash
cd /Users/seungsoohan/Projects/GuardNote
npm run server      # API만
npm run client      # 웹만
npm run collector   # 예시 자동수집기 실행 (GUARDNOTE_API_KEY 필요)
npm run anchor -- --all   # 전체 테넌트 head를 외부 타임스탬프로 앵커링(cron용)
```

## 배포 (단일 포트 모드)

`npm run build`로 프론트를 빌드해 두면(dist/ 생성) API 서버가 정적 파일까지 직접 서빙한다 —
Railway·Render·Fly 같은 Node 호스팅에 이 서버 하나만 올리면 웹+API가 같은 URL로 동작한다.
(프론트가 상대경로 `/api`를 호출하므로 CORS 설정도 불필요.)

```bash
npm run build
npm start          # 웹+API를 GUARDNOTE_PORT(기본 8787) 하나로 서빙
```

호스팅 시 체크리스트:

- **디스크 볼륨** 필수 — SQLite 원장이 재배포에도 유지되도록 볼륨을 붙이고
  `GUARDNOTE_DB=/data/guardnote.db`로 경로 지정 (수파베이스 같은 DB 서비스는 대상 아님 —
  이 앱은 Node 프로세스 실행 + 파일 디스크가 필요하다)
- 포트는 `GUARDNOTE_PORT`로 지정하고 호스팅의 타깃 포트와 일치시킨다
- **시연용 인스턴스**: `NODE_ENV`를 production으로 두지 않아야 데모 테넌트 자동 생성·변조
  시뮬레이션이 동작한다. 이 상태의 공개 URL은 데모 API가 노출되므로 **가짜 데이터 전용**
- `GUARDNOTE_ADMIN_TOKEN`을 고정 주입해야 재배포 후에도 관리자 콘솔 접속 가능
  (테넌트 키 분실 시 관리자 콘솔에서 재발급하면 된다)

## 로그인 · 계정 (v0.3)

인증은 **2트랙**이다 — 서로 대체하지 않는다:

| | 사람 (웹 대시보드) | 기계 (수집기) |
|---|---|---|
| 방식 | 이메일 + 비밀번호 (scrypt 해시) | API 키 `gn_live_…` |
| 세션 | HTTP-only 쿠키(14일), DB 세션 — 재시작에도 유지 | 매 요청 Bearer 헤더 |
| 단위 | 테넌트당 여러 명 · 역할 owner/member | 테넌트당 1개, 로테이션 |

- **온보딩**: 관리자 콘솔에서 테넌트 생성 → [초대] 버튼으로 **owner 초대 링크**(7일 유효, 1회 표시)
  발급 → 고객 담당자에게 안전 채널로 전달 → 담당자가 링크에서 이름·비밀번호 설정 → 이후 owner가
  팀·계정 탭에서 팀원 초대. 이메일 발송 인프라 없이 동작하는 링크 방식.
- **기록자 봉인**: 계정 세션으로 봉인한 기록은 `recorded_by`(인증된 이메일)가 **해시 체인에 함께
  봉인**된다 — "담당자" 자기신고와 별개로 기록자 신원이 위변조 불가 대상이 된다. 기존 행(NULL)은
  종전 payload 형식을 유지하므로 과거 원장 검증이 깨지지 않는다.
- **계정 관리**: owner가 팀원 초대·비활성화(세션 즉시 무효)·비밀번호 재설정 링크 발급.
  자기 자신·마지막 활성 owner는 비활성화 불가. 비밀번호 변경 시 다른 기기 세션 전부 무효화.
- **활동 로그**: 로그인·봉인·내보내기·팀 변경이 사람 단위로 기록된다 (팀·계정 탭, owner만 조회).
- **초대 링크 기준 주소**: `GUARDNOTE_URL`이 설정돼 있으면 그 주소로 생성 (권장), 없으면 요청 호스트.
- 로그인 브루트포스는 IP + 계정 이중 카운터로 차단 (10회/10분).
- Phase 2 예정: 이메일 발송(초대·재설정 자동화), 2FA(TOTP), 세션 관리 화면, SSO.

## 상용 운영 하드닝 (v0.3)

납품(실고객) 운영을 위한 보호 계층. 전부 기본 켜짐이며 환경변수로 조정한다.

| 기능 | 동작 | 환경변수 |
|---|---|---|
| **개인정보(PII) 유입 차단** | 주민번호·전화·이메일·카드번호 등 패턴이 담긴 기록을 400으로 거부 — 원장은 삭제 불가라 저장 전이 유일한 차단 기회 | `GUARDNOTE_PII_GUARD=off` (끄기) |
| **브루트포스 차단** | 인증 실패 10회/10분 초과 IP는 그 창 동안 시도 차단(429) | `GUARDNOTE_AUTH_FAIL_LIMIT` (0=off) |
| **레이트리밋** | IP당 분당 300요청 초과 시 429 (단일 인스턴스 전제, 메모리 카운터) | `GUARDNOTE_RATE_LIMIT` |
| **자동 백업** | SQLite 온라인 백업 — 프로덕션 기본 6시간 주기·40개 보관. 수동: `npm run backup` | `GUARDNOTE_BACKUP_DIR` · `GUARDNOTE_BACKUP_INTERVAL_MS` · `GUARDNOTE_BACKUP_KEEP` |
| **보안 헤더 + HTTPS 강제** | CSP·HSTS·nosniff·frame 차단, http→https 301 | `GUARDNOTE_FORCE_HTTPS=1` · `GUARDNOTE_CSP=off` |
| **관리자 감사 로그** | 온보딩·키 재발급·플랜 변경 등 운영 행위를 append 전용으로 기록, 콘솔에서 조회 | (항상 켜짐) |
| **접근 로그 / 정상 종료** | 경로·상태·소요시간 로그(쿼리 미기록), SIGTERM 시 WAL 체크포인트 후 종료 | `GUARDNOTE_ACCESS_LOG=off` |
| 입력 검증 | 담당자 60자·활동 500자·ingest 배치 200건 상한, `source` 위장 차단(수동 API는 항상 manual) | — |

프록시(Railway/nginx) 뒤에서는 `GUARDNOTE_TRUST_PROXY=1`을 설정해야 레이트리밋·감사 로그가
실제 클라이언트 IP를 본다.

### 백업과 복구

- 백업 파일: `GUARDNOTE_BACKUP_DIR/guardnote-YYYYMMDDHHMMSS.db` (기본: DB 옆 `backups/`)
- 볼륨과 **다른 물리 위치**로의 주기 반출(오브젝트 스토리지 등)은 호스팅 쪽에서 별도 구성할 것
- 복구: 서버 중지 → 백업 파일을 `GUARDNOTE_DB` 경로로 복사 → 서버 시작 → 관리자 콘솔
  "모니터 지금 실행"으로 전 테넌트 무결성 확인

### 납품 전 체크리스트

1. `NODE_ENV=production` (데모 테넌트·변조 API 자동 비활성)
2. `GUARDNOTE_ADMIN_TOKEN` + 봉인 비밀키 3종(`ANCHOR/CONTRACT/BILLING_SECRET`) 시크릿 매니저 주입
3. `GUARDNOTE_DB`를 영속 볼륨으로, `GUARDNOTE_BACKUP_DIR` 별도 경로 지정
4. `GUARDNOTE_FORCE_HTTPS=1` + `GUARDNOTE_TRUST_PROXY=1`
5. 실결제 시 `TOSS_CLIENT_KEY/TOSS_SECRET_KEY` (라이브 키)
6. `GUARDNOTE_MONITOR_INTERVAL_MS` + `GUARDNOTE_ALERT_WEBHOOK` (자동 무결성 감시·알림)
7. 온보딩: 관리자 콘솔에서 테넌트 생성 → 키는 고객사에 안전 채널로 1회 전달

## 관리자 콘솔 · 로그인 분기

로그인 화면에 입력한 토큰의 종류에 따라 화면이 자동으로 갈린다 (`GET /api/whoami` 판별):

- **테넌트 API 키**(`gn_live_…`) → 고객사 대시보드
- **관리자 토큰**(`gn_admin_…`) → 관리자 콘솔 — 테넌트 목록/생성, 플랜 변경, 키 재발급,
  즉시 앵커링, 무결성 모니터 실행·기록 조회

관리자 토큰은 개발 환경에서 `server/.admin-token`에 자동 생성되고, 프로덕션에서는
`GUARDNOTE_ADMIN_TOKEN` 환경변수로만 주입된다 (미설정 시 관리자 기능 비활성).

## 구독 플랜 (`server/plans.js`)

| 플랜 | 월 요금(VAT 포함) | 최대 증적 | PDF | 외부 앵커링 | 자동 모니터링 |
|---|---|---|---|---|---|
| free | 0원 | 100 | ✕ (CSV만) | ✕ | ✕ |
| pro | 290,000원 | 10,000 | ✓ | ✕ | ✓ |
| enterprise | 990,000원 | 무제한 | ✓ | ✓ | ✓ |

한도·기능은 서버에서 강제된다(초과 시 `402`). 실제 과금은 아래 "구독 결제" 참고.

## 구독 결제 (`server/billing.js`) — 토스페이먼츠 빌링

유료 플랜 전환은 웹 대시보드 **구독·결제 탭**에서 진행된다:
**전자 계약 체결 → 카드 등록 → 첫 달 즉시 결제 → 플랜 활성화 → 매월 자동 청구**.

- **실결제 모드**: 서버에 토스페이먼츠 키를 설정하면 활성화된다. 라이브 키(`live_`)는 실제
  카드 청구, 테스트 키(`test_`)는 토스 샌드박스 청구.

  ```bash
  cd /Users/seungsoohan/Projects/GuardNote
  TOSS_CLIENT_KEY=live_ck_... TOSS_SECRET_KEY=live_sk_... npm run dev
  ```

- **모의 모드(개발용)**: 키 미설정 + 개발 환경이면 카드등록·청구가 서버에서 시뮬레이션되어
  외부 호출 없이 전체 플로우를 테스트할 수 있다. 프로덕션에서 키 미설정이면 결제 비활성.
- **정기결제 스케줄러**: 서버가 주기적으로(기본 6시간, `GUARDNOTE_BILLING_INTERVAL_MS`)
  청구일 도래 구독을 자동 청구한다. 실패 시 다음 날 재시도, 3회 실패 시 free로 강등(원장은 유지).
- **해지**: 즉시 차단하지 않고 이미 결제된 기간 종료일에 free로 전환된다. 종료 전 철회 가능.
- **빌링키 보안**: 빌링키는 AES-256-GCM으로 암호화 저장. 암호화 키는 DB 밖에서 관리
  (`GUARDNOTE_BILLING_SECRET`, 개발 시 `server/.billing-secret` 자동 생성).

## 전자 계약 (`server/contracts.js`)

유료 결제 전에 두 계약을 반드시 체결해야 한다(미체결 시 결제 API가 `409` 반환):

1. **가드노트 서비스 이용계약서** — 서비스 범위, 요금, 데이터 소유권, 책임 한도
2. **개인정보 처리위탁 계약서** — 개인정보보호법 제26조에 따른 수탁자 의무

체결 방식은 가드노트의 신뢰 모델과 동일하다: 서명자 정보(성명·직책·이메일) + 동의 →
체결 시점 계약서 원문의 **SHA-256 해시** + **HMAC 봉인**(비밀키는 DB 밖,
`GUARDNOTE_CONTRACT_SECRET` / 개발 시 `server/.contract-secret`)으로 기록되어, DB만
조작해서는 유효한 체결 기록을 위조할 수 없다. 체결본은 원문·서명정보·해시·봉인 검증
결과가 담긴 **PDF**로 다운로드된다.

## 자동 무결성 검증 스케줄러 (`server/monitor.js`)

환경변수로 켠다. 주기마다 (모니터링 대상 플랜의) 모든 테넌트를 검증하고, 위변조·꼬리절단·
앵커불일치가 감지되면 **정상→위반으로 바뀌는 시점**에 알림을 보낸다(웹훅 + 콘솔).

```bash
GUARDNOTE_MONITOR_INTERVAL_MS=3600000 \   # 1시간마다
GUARDNOTE_ALERT_WEBHOOK=https://hooks.slack.com/... \   # 없으면 콘솔에만
GUARDNOTE_AUTO_ANCHOR=1 \                  # 매 검증마다 head가 진전된 테넌트 자동 앵커링
npm run server
```

## 외부 타임스탬프 앵커링 (`server/anchor.js`)

특정 시점의 체인 head를 **DB 밖 비밀키로 서명**해 박제한다. `tenants.last_seq/last_hash`
꼬리절단 탐지의 약점(같은 DB 안 대조 → DB 전체 쓰기 권한자가 동시 조작 시 우회 가능)을 메운다:

- 서명 비밀키(`GUARDNOTE_ANCHOR_SECRET`, 개발 시 `server/.anchor-secret`)는 DB에 없어,
  DB만 고쳐서는 위조 head에 유효 서명을 못 만든다.
- `GUARDNOTE_ANCHOR_URL`을 설정하면 외부 노터리에도 head를 전송·박제한다(영수증 저장).
- 검증(`/api/verify`, PDF)에 앵커 상태가 함께 표시된다: `signatureValid`(서명 유효) + `positionOk`(앵커 시점 블록 재계산 일치).

## 핵심 동작

- **테넌트 격리**: 모든 조회·기록이 인증된 `req.tenant.id`로 스코핑된다. 요청 바디의
  tenant_id는 절대 신뢰하지 않는다 — 다른 테넌트 원장에 쓰는 스푸핑을 원천 차단.
- **봉인**: 활동 추가 시 `hash = SHA-256( payload(tenant_id 포함) + 직전 hash )` 로 체인 연결.
  수정/삭제 API 없음. tenant_id가 payload 안에 있어 블록을 다른 테넌트로 옮겨치기하는 것 자체가 해시 불일치로 드러난다.
- **검증** (`GET /api/verify`): 테넌트별 제네시스(0…0)부터 전체 재계산. DB 파일을 직접 UPDATE 해도
  그 지점부터 해시가 어긋나 즉시 탐지되고, 이후 블록 전부 무효 처리된다(cascade). 가장 최근 블록을
  통째로 삭제하는 "꼬리 절단"도 `tenants.last_seq/last_hash` 포인터와 대조해 `truncated:true`로 탐지한다.
- **자동수집** (`POST /api/ingest`): 고객사 내부에 심어둔 수집기가 API 키로 인증해 이벤트를 밀어넣는다.
- **발췌·내보내기**: `from`/`to`/`cat_key`/`actor` 쿼리로 "특정 사건 증거만" 필터링해 조회·CSV·PDF로
  뽑을 수 있다. 단, 무결성 검증(`/api/verify`, PDF의 검증서 페이지)은 필터와 무관하게 **항상 전체
  원장**을 기준으로 한다 — 발췌는 어디까지나 표시·제출 편의이지, 검증 대상이 아니다.

## API

모든 `/api/*` (`/api/health` 제외)는 `Authorization: Bearer <API 키>` 헤더 필요.
`/api/entries`·`/api/export/*`는 공통으로 `from`(YYYY-MM-DD)·`to`·`cat_key`·`actor` 쿼리로 발췌 가능.

테넌트 API (`Authorization: Bearer <gn_live_…>`):

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET  | `/api/health`     | 헬스체크 (인증 불필요) |
| GET  | `/api/whoami`     | 토큰이 관리자/테넌트인지 판별 (프론트 화면 분기) |
| GET  | `/api/entries`    | 원장 조회 — 쿼리 없으면 전체, 있으면 발췌 |
| GET  | `/api/categories` | 10개 항목 현황·점수·고시 근거·테넌트 정보·플랜·사용량 |
| GET  | `/api/verify`     | 무결성 검증 + 앵커 상태 (항상 전체 원장) |
| POST | `/api/entries`    | 활동 1건 봉인 추가 (플랜 한도 초과 시 402) |
| POST | `/api/ingest`     | 자동수집 적재 (`source=ingest:<수집기>`, 한도 402) |
| POST | `/api/anchor`     | 현재 head 외부 앵커링 (enterprise 플랜) |
| GET  | `/api/package`    | 제출용 증거 패키지 메타(JSON 미리보기) |
| GET  | `/api/export/csv` | 원장(또는 발췌) CSV 다운로드 — Excel 호환 BOM 포함 |
| GET  | `/api/export/pdf` | 증거 패키지 PDF 다운로드 (Pro 이상, 아니면 402) |
| GET  | `/api/billing`    | 구독·결제내역·계약 현황 + 플랜 정보 |
| POST | `/api/billing/checkout` | 결제 시작 — 계약 미체결 시 409 |
| POST | `/api/billing/complete` | 카드 등록 완료 → 빌링키 발급 → 첫 결제 → 플랜 활성화 |
| POST | `/api/billing/cancel` · `/api/billing/resume` | 해지 예약 / 철회 |
| GET  | `/api/contracts` · `/api/contracts/:kind` | 계약 현황 / 계약서 전문 (kind: service·dpa) |
| POST | `/api/contracts/:kind/sign` | 전자 계약 체결 (서명자 정보 + 동의) |
| GET  | `/api/contracts/:kind/pdf` | 체결본 PDF 다운로드 |
| POST | `/api/_demo/tamper` · `/api/_demo/reset` | 데모용 변조/원복 (`NODE_ENV=production` 시 비활성) |

관리자 API (`Authorization: Bearer <gn_admin_…>`):

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET  | `/api/admin/tenants` | 전체 테넌트 + 블록수·무결성·앵커·최근검증 |
| POST | `/api/admin/tenants` | 테넌트 생성 (`{slug,name,plan}` → apiKey 1회 반환) |
| POST | `/api/admin/tenants/:slug/rotate` | API 키 재발급 |
| POST | `/api/admin/tenants/:slug/plan`   | 플랜 변경 (`{plan}`) |
| POST | `/api/admin/tenants/:slug/anchor` | 해당 테넌트 즉시 앵커링 |
| GET  | `/api/admin/monitor`     | 최근 무결성 검증 실행 기록 |
| POST | `/api/admin/monitor/run` | 무결성 검증 1회 즉시 실행 |
| POST | `/api/admin/billing/run` | 정기결제 1회 즉시 실행 (청구일 도래분 처리) |

## PDF 폰트

`server/assets/fonts/NotoSansKR-Variable.ttf` — Google Noto Sans KR, SIL Open Font License.
Homebrew Cask(`font-noto-sans-kr`)로 받은 정식 배포본을 그대로 번들링했다. 라이선스 전문은
같은 폴더의 `OFL-LICENSE.txt` 참고.

## 구현 완료된 운영 기능

- ✅ API 키 재발급(로테이션) — CLI(`npm run rotate-key`) + 관리자 콘솔
- ✅ 자동 무결성 검증 스케줄러 + 알림(웹훅/콘솔) — `server/monitor.js`
- ✅ 관리자 콘솔(웹) + 관리자 API — 온보딩·플랜·키·앵커·모니터
- ✅ 외부 타임스탬프 앵커링(서명 + 선택적 외부 노터리) — `server/anchor.js`
- ✅ 구독 플랜 + 사용량/기능 강제 — `server/plans.js`
- ✅ 결제 연동(토스페이먼츠 빌링 정기결제 + 개발용 모의 모드) — `server/billing.js`
- ✅ 전자 계약(이용계약·처리위탁계약 체결, 해시+HMAC 봉인, 체결본 PDF) — `server/contracts.js`

## 다음 단계 (실전 전환)

1. **네트워크 보안** — HTTPS 필수화, 민감 고객사는 VPN/전용선 연동 옵션
2. **개인정보 미포함 검증** — `action` 필드에 실제 개인정보가 들어가지 않도록 서버측 가이드/검증 추가
   (원장엔 "누가 언제 무엇을 했다"는 메타데이터만 있어야 함 — 아니면 우리도 개인정보처리자가 됨)
3. **결제 운영 보강** — 토스 웹훅 수신(승인 취소·카드 만료 동기화), 세금계산서 발행, 청구서 이메일
4. **계약 법률 감수** — 이용계약·위탁계약 템플릿의 변호사 검토 및 버전 관리 프로세스
5. **PostgreSQL 이전** — 다중 서버·대규모 시 SQLite → Postgres, 테넌트별 커넥션 풀링.
   현재 모든 쿼리가 better-sqlite3 동기 API에 묶여 있어, 실제 Postgres 인스턴스를 띄운 상태에서
   스토리지 계층을 추상화해 검증하는 별도 작업으로 진행해야 한다(검증 없는 무단 이전은 지양).
