#!/bin/bash
# 가드노트 시연 시작 — 더블클릭하면 서버를 켜고, 로그인 키를 클립보드에 복사하고, 브라우저를 엽니다.
cd "$(dirname "$0")"

healthy() { curl -sf http://localhost:8787/api/health >/dev/null 2>&1; }
web_up()  { curl -sf http://localhost:5173 >/dev/null 2>&1; }

if ! healthy; then
  echo "▶ 가드노트 구동 중…"
  lsof -ti:5173,8787 2>/dev/null | xargs kill -9 2>/dev/null
  if [ ! -d node_modules ]; then
    echo "▶ 최초 1회 의존성 설치 중… (몇 분 걸릴 수 있음)"
    npm install
  fi
  nohup npm run dev > .demo-run.log 2>&1 &
  for i in $(seq 1 60); do
    healthy && web_up && break
    sleep 1
  done
fi

if ! healthy || ! web_up; then
  echo "❌ 서버가 뜨지 않았습니다. 로그를 확인하세요: $(pwd)/.demo-run.log"
  exit 1
fi

tr -d '\n' < server/.demo-key | pbcopy
echo ""
echo "✅ 가드노트 실행 중 → http://localhost:5173"
echo "✅ 데모 로그인 키를 클립보드에 복사했습니다 — 로그인창에 ⌘V 하고 '접속'을 누르세요."
echo "   (관리자 콘솔 토큰이 필요하면 터미널에서: cat server/.admin-token)"
open http://localhost:5173
