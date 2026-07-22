#!/bin/bash
# 가드노트 시연 종료 — 더블클릭하면 시연용 서버를 끕니다.
cd "$(dirname "$0")"

PIDS=$(lsof -ti:5173,8787 2>/dev/null)
if [ -z "$PIDS" ]; then
  echo "이미 꺼져 있습니다."
else
  echo "$PIDS" | xargs kill -9 2>/dev/null
  echo "✅ 가드노트를 종료했습니다."
fi
