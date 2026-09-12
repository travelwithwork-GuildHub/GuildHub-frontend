#!/usr/bin/env bash
# 主幹的瀏覽器安全網：對 `next start` 起來的建置產物跑 `tests/e2e/` 裡**不需要任何服務**的那幾支。
#
#   npm run build && bash .github/scripts/e2e-main.sh        （本機；CI 由 .github/workflows/e2e-main.yml 在 push main 時跑）
#
# **是安全網，不是閘門**：只在合併進 main 之後跑，不是 required check。存在的理由是
# 2026-09-13 量到的一個洞 —— 這些腳本已經寫了、也抓得到單元測試抓不到的回歸
# （實測：把 `WorldCanvas` 傳給 `LocalPlayer` 的 `av` 拿掉，971 條單元測試全綠，
# `avatar-pixels.mjs` 與 `avatar-picker.mjs` 紅），但只有人記得的時候才會跑。
#
# 只列**用 `page.route`／`routeWebSocket` 偽造回應、不連任何後端與資料庫**的腳本。
# 要真後端的（identity-flow、multi-tab…）永遠不進來（AGENTS.md〈測試環境隔離〉第 2 條）；
# 要本地 Postgres ＋ 第二次 build 的（inbox、profile-editor、internal-backend）等這一組
# 跑出 flake 基線再說。**加一支就是加一個 flake 來源，要有理由。**
#
# 停止條件（第六輪共識）：flake ≥5% 或每週維護 >15 分鐘 → 刪 workflow 與這支，腳本留手動。
set -euo pipefail

SCRIPTS=(avatar-picker avatar-pixels board-panel control-contrast deep-link rooms-fixture)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
OUT="${E2E_OUT:-$(mktemp -d)}"
mkdir -p "$OUT"

[ -f .next/BUILD_ID ] || { echo "✗ 沒有 .next/BUILD_ID —— 先 npm run build（打的是 next start，不是 next dev）" >&2; exit 2; }

# 隨機 port：不跟本機開著的 dev server（3100）或契約測試撞。
PORT="$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
FRONTEND="http://127.0.0.1:$PORT"

# 直接跑 next 的 bin，不經 `npx` —— 多一層包裝，殺掉包裝會留孤兒咬著 port（契約 harness 抓過）。
NEXT_PUBLIC_APP_ENV=local node node_modules/next/dist/bin/next start -p "$PORT" -H 127.0.0.1 > "$OUT/server.log" 2>&1 &
SERVER=$!
cleanup() {
  kill "$SERVER" 2>/dev/null || true
  pkill -P "$SERVER" 2>/dev/null || true
  wait "$SERVER" 2>/dev/null || true
}
trap cleanup EXIT

# ready 的判準是 HTTP 真的回 200，不是 log 印了 Ready。
for _ in $(seq 1 60); do
  curl -fsS -o /dev/null "$FRONTEND/" 2>/dev/null && break
  kill -0 "$SERVER" 2>/dev/null || { echo "✗ next start 在 ready 之前就退出了" >&2; cat "$OUT/server.log" >&2; exit 2; }
  sleep 1
done
curl -fsS -o /dev/null "$FRONTEND/" || { echo "✗ $FRONTEND 60 秒內沒有回 200" >&2; cat "$OUT/server.log" >&2; exit 2; }

ran=0; failed=(); flaky=()
run_one() {
  # OUT／SHOTS：每支的截圖與 report.json 都收進 $OUT，不寫進 repo 的 docs/evidence/。
  FRONTEND="$FRONTEND" OUT="$OUT/$1" SHOTS="$OUT/$1" node "tests/e2e/$1.mjs" > "$OUT/$1$2.log" 2>&1
}
for n in "${SCRIPTS[@]}"; do
  start=$(date +%s)
  if run_one "$n" ""; then
    echo "✓ ${n}（$(( $(date +%s) - start )) 秒）"
  elif run_one "$n" ".retry"; then
    # 第一次紅、重跑綠：**記成 flake，不記成通過**。這個數字是停止條件的分子（≥5% 就拆）——
    # 用 workflow annotation 讓它在 run 的摘要頁看得到、`gh run view` 數得到。
    echo "::warning title=e2e-main flake::${n} 第一次紅、重跑綠（log：${n}.log 與 ${n}.retry.log）"
    echo "~ ${n}（flake，$(( $(date +%s) - start )) 秒）"
    flaky+=("$n")
  else
    echo "✗ ${n}（$(( $(date +%s) - start )) 秒）—— 重跑仍紅，最後 20 行："
    tail -n 20 "$OUT/$n.retry.log" | sed 's/^/    /'
    failed+=("$n")
  fi
  ran=$((ran + 1))
done

# 六支都要真的跑過。少跑一支還回綠，這條安全網就是空殼。
if [ "$ran" -ne "${#SCRIPTS[@]}" ]; then
  echo "✗ 只跑了 ${ran}/${#SCRIPTS[@]} 支" >&2
  exit 1
fi
if [ "${#failed[@]}" -gt 0 ]; then
  echo "✗ ${#failed[@]}/${#SCRIPTS[@]} 支紅：${failed[*]}（log 與截圖在 ${OUT}）" >&2
  exit 1
fi
echo "✓ ${#SCRIPTS[@]}/${#SCRIPTS[@]} 支通過，flake ${#flaky[@]} 支（${OUT}）"
