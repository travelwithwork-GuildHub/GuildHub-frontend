#!/usr/bin/env bash
# archive 前的雙模型影子審查：把一個 change 的**全部**攤給第二、第三個模型看一次。
#
#   bash .github/scripts/archive-review.sh <change-id>                    第一輪：bundle → codex 與 gemini 平行 → 結果＋帳本
#   bash .github/scripts/archive-review.sh <change-id> --rereview         第二輪（**只准一次**）：修正後的 diff 對上一輪的「需修正」
#   bash .github/scripts/archive-review.sh <change-id> --judge <codex|gemini> <第N條需修正> <已驗證|誤報> [備註]
#   bash .github/scripts/archive-review.sh --report                       帳本結算：精確率、等待時間、升阻塞的三個數字
#
# 為什麼有這支（2026-09-12，兩位外部審查者六輪共識）：每天合 50–87 個 PR、199/200 由同一個人在中位數
# 3 分鐘內合併，產品層**從來沒有被第二個模型看過** —— codex／gemini 只審過治理層。單一 slice 的 PR
# 看不出跨 slice 的不一致，所以審查單位是 change（archive 前一次，≈4 次／日），不是 PR（60 次／日）。
#
# **是影子試跑，不阻塞。** 跑在 `/opsx:archive` 之前、`tasks.md` 全勾之後；結果只有三種標籤
# （需修正／可接受風險／誤報候選），只有指得出規格與檔案、給得出驗證方法的才算需修正。
# 升成阻塞的條件（要一起成立）：10 個 change 內 ≥2 條「需修正」經人工判定已驗證且在 archive 前修好、
# 誤報率 ≤20%、archive 等待 P90 ≤20 分鐘。**不成立就刪這支、prompts/06 與 .local/ 的帳本，不留空殼。**
# 修正之後回審**只准一次**；還要第三輪就是這套流程在製造等待，人工處理。
#
# 產物全在 `.local/`（gitignore）：`.local/archive-review/<id>/r1|r2/{bundle,codex,gemini}.md`、`.local/archive-review.jsonl`。
# 模型與旗標走環境變數：ARCHIVE_REVIEW_CODEX（預設 gpt-5.6-sol）、ARCHIVE_REVIEW_GEMINI（預設 gemini-3.1-pro-high）。
# 哪個 CLI 不在就**明說跳過**，不假裝審過。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
LEDGER=".local/archive-review.jsonl"
CODEX_MODEL="${ARCHIVE_REVIEW_CODEX:-gpt-5.6-sol}"
GEMINI_MODEL="${ARCHIVE_REVIEW_GEMINI:-gemini-3.1-pro-high}"
mkdir -p .local

ledger() { python3 -c 'import json,sys,datetime;d=json.loads(sys.argv[1]);d["ts"]=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds");print(json.dumps(d,ensure_ascii=False))' "$1" >> "$LEDGER"; }
TAG='^[[:space:]]*([-*]|[0-9]+[.)])?[[:space:]]*'
count() { grep -Ec "${TAG}\[$2\]" "$1" 2>/dev/null || true; }
# 一次審查「算數」的條件：CLI rc=0 而且真的寫了結論那一行。沒回答的記 ok=false，report 不算它。
answered() { [ "$1" = 0 ] && grep -q "^結論[：:]" "$2" && echo true || echo false; }
# 沒有 coreutils timeout（macOS）：自己盯。超過 ARCHIVE_REVIEW_TIMEOUT（預設 1500 秒）就殺，不要讓 wait 等到天亮。
watch() { local pid=$1 t=0; while kill -0 "$pid" 2>/dev/null; do [ "$t" -ge "${ARCHIVE_REVIEW_TIMEOUT:-1500}" ] && { kill "$pid" 2>/dev/null; return 124; }; sleep 5; t=$((t+5)); done; wait "$pid"; }

if [ "${1:-}" = "--report" ]; then
  [ -s "$LEDGER" ] || { echo "帳本是空的（${LEDGER}）"; exit 0; }
  python3 - "$LEDGER" <<'ZZPY'
import json, sys, statistics
rows = [json.loads(l) for l in open(sys.argv[1], encoding="utf-8") if l.strip()]
runs = [r for r in rows if r.get("kind") == "review" and r.get("ok", True)]
skipped = sum(1 for r in rows if r.get("kind") == "review" and not r.get("ok", True))
okpairs = {(r["id"], r["model"]) for r in runs if r["round"] == 1}
judg = [r for r in rows if r.get("kind") == "judge" and (r["id"], r["model"]) in okpairs]  # 沒回答的 run 上的判定不算
ids = sorted({r["id"] for r in runs})
print(f"審過的 change：{len(ids)} 個（{', '.join(ids)}）；沒回答不算數的 run：{skipped}")
for m in ("codex", "gemini"):
    rs = [r for r in runs if r["model"] == m and r["round"] == 1]
    if not rs: print(f"{m}：沒跑過"); continue
    secs = sorted(r["seconds"] for r in rs)
    p = lambda q: secs[min(len(secs)-1, int(round(q*(len(secs)-1))))]
    print(f"{m}：第一輪 {len(rs)} 次，需修正 {sum(r['need_fix'] for r in rs)}／可接受風險 {sum(r['risk'] for r in rs)}／誤報候選 {sum(r['fp'] for r in rs)}；等待 P50 {p(.5)} 秒、P90 {p(.9)} 秒")
ok = sum(1 for j in judg if j["verdict"] == "已驗證"); fp = sum(1 for j in judg if j["verdict"] == "誤報")
prec = f"{ok/(ok+fp):.0%}" if ok+fp else "—"
rere = len({r["id"] for r in runs if r["round"] == 2})
# 一個 change 的等待 = 第一輪兩個模型裡慢的那個（平行跑）；P90 看所有 change。
waits = sorted(max(r["seconds"] for r in runs if r["id"] == i and r["round"] == 1) for i in ids if any(r["id"] == i and r["round"] == 1 for r in runs))
p90 = waits[min(len(waits)-1, int(round(.9*(len(waits)-1))))] if waits else 0
print(f"人工判定：已驗證 {ok}、誤報 {fp} → 誤報率 {f'{fp/(ok+fp):.0%}' if ok+fp else '—'}（精確率 {prec}）；回審過的 change {rere} 個；每個 change 的等待 P90 {p90} 秒")
print("升阻塞的三個數字：≥10 個 change 內 已驗證 ≥2、誤報率 ≤20%、等待 P90 ≤20 分鐘 → "
      + ("**三個都成立，可以考慮升阻塞**" if len(ids) >= 10 and ok >= 2 and (ok+fp) and fp/(ok+fp) <= .2 and p90 <= 1200 else "還沒到／不成立（10 個 change 後仍不成立就拆）"))
ZZPY
  exit 0
fi

ID="${1:?用法見檔頭}"; shift
WBS="$(printf '%s' "$ID" | cut -d- -f1,2 | tr '[:lower:]' '[:upper:]')"
DIR=".local/archive-review/$ID"

if [ "${1:-}" = "--judge" ]; then
  [ $# -ge 4 ] || { echo "用法：--judge <codex|gemini> <第N條需修正> <已驗證|誤報> [備註]" >&2; exit 2; }
  case "$4" in 已驗證|誤報) ;; *) echo "判定只能是 已驗證 或 誤報" >&2; exit 2;; esac
  # 只能判真的存在的那一條，而且一條只判一次 —— 不然精確率是編出來的。
  N=$(grep -Ec "${TAG}\[需修正\]" "$DIR/r1/$2.md" 2>/dev/null || true)
  [ "$3" -ge 1 ] 2>/dev/null && [ "$3" -le "${N:-0}" ] || { echo "✗ $2 第一輪只有 ${N:-0} 條需修正，沒有第 $3 條" >&2; exit 2; }
  ! grep -q "\"kind\": \"judge\", \"id\": \"$ID\", \"model\": \"$2\", \"finding\": $3," "$LEDGER" 2>/dev/null || { echo "✗ $ID $2 第 $3 條已經判過了" >&2; exit 2; }
  ledger "$(python3 -c 'import json,sys;print(json.dumps({"kind":"judge","id":sys.argv[1],"model":sys.argv[2],"finding":int(sys.argv[3]),"verdict":sys.argv[4],"note":" ".join(sys.argv[5:])},ensure_ascii=False))' "$ID" "$2" "$3" "$4" "${@:5}")"
  echo "✓ 記下了：$ID $2 第 $3 條 → $4"; exit 0
fi

[ -d "openspec/changes/$ID" ] || { echo "✗ openspec/changes/$ID 不存在 —— 已經封存了？這支要在 /opsx:archive **之前**跑。" >&2; exit 2; }
git fetch -q origin main
MAIN="$(git rev-parse origin/main)"

if [ "${1:-}" = "--rereview" ]; then
  ROUND=2; [ -s "$DIR/r1/main.sha" ] || { echo "✗ 沒有第一輪，先跑 bash .github/scripts/archive-review.sh $ID" >&2; exit 2; }
  [ ! -d "$DIR/r2" ] || { echo "✗ 回審只准一次（$DIR/r2 已存在）。還要一輪就是這套流程在製造等待 —— 人工處理，不要第三輪。" >&2; exit 2; }
else
  ROUND=1; [ ! -d "$DIR/r1" ] || { echo "✗ $DIR/r1 已存在。要重跑先自己把它移走；要回審用 --rereview。" >&2; exit 2; }
fi
OUT="$DIR/r$ROUND"; mkdir -p "$OUT"; printf '%s\n' "$MAIN" > "$OUT/main.sha"

# ── bundle ────────────────────────────────────────────────────────────────────────────────────────
EXCL=(-- . ':(exclude)package-lock.json' ':(exclude)docs/evidence' ':(exclude)*.png' ':(exclude)openspec/changes/archive')
slices() { git log "$1" --format=%H -i --grep="$ID" --grep="$WBS" --reverse; }
# squash commit 的內文只是各 commit 訊息的串接，**PR 說明（突變結果、刻意的取捨）不在裡面** —— 從主旨的 (#N) 去拿。
# 拿不到（離線、沒 gh）就明說，不假裝沒有。第一次真跑就是因為少了它，模型把 PR 裡寫明「刻意」的事標成需修正。
show_slice() {
  git show --stat --patch --format='### %h %s%n%n%b%n' "$1" "${EXCL[@]}"
  local pr; pr="$(git log -1 --format=%s "$1" | grep -oE '\(#[0-9]+\)$' | tr -dc 0-9)"
  [ -n "$pr" ] || return 0
  echo; echo "#### PR #${pr} 的說明"; gh pr view "$pr" --json body -q .body 2>/dev/null || echo "（拿不到 PR #${pr} 的說明：離線或沒有 gh）"
}
{
  cat prompts/06-archive-review.md
  echo; echo "# Bundle：${ID}（WBS ${WBS}）— main $(git rev-parse --short "$MAIN") — 第 $ROUND 輪"; echo
  if [ "$ROUND" = 1 ]; then
    echo "## docs/WBS.md 上這一列"; grep -i "^| $WBS " docs/WBS.md || echo "（WBS 上找不到 $WBS —— 這本身就值得寫進發現）"
    echo; echo "## docs/DECISIONS.md 裡提到它的段落（已拒絕的方案）"; grep -n -i -B2 -A10 -e "$ID" -e "$WBS" docs/DECISIONS.md || echo "（沒有）"
    echo; echo "## 凍結的規格（openspec/changes/$ID/）"
    find "openspec/changes/$ID" -name '*.md' -type f | sort | while read -r f; do echo; echo "### $f"; echo; cat "$f"; done
    echo; echo "## 合併進 main 的 slice（每個 squash commit 是一個 PR，舊到新）"
    n=0; for sha in $(slices "$MAIN"); do n=$((n+1)); echo; show_slice "$sha"; done
    echo; echo "（共 $n 個 commit；主旨含 $ID 或 $WBS 的都算）"
  else
    echo "## 上一輪標「需修正」的"; grep -Eh "${TAG}\[需修正\]" "$DIR/r1/codex.md" "$DIR/r1/gemini.md" 2>/dev/null || echo "（沒有 —— 那就不需要回審）"
    echo; echo "## 上一輪之後合併進 main 的修正"
    for sha in $(slices "$(cat "$DIR/r1/main.sha")..$MAIN"); do echo; show_slice "$sha"; done
  fi
} > "$OUT/bundle.md"
SIZE=$(wc -c < "$OUT/bundle.md" | tr -d " ")
[ "$SIZE" -lt 700000 ] || { echo "✗ bundle ${SIZE} bytes，超過命令列能塞的量 —— 這個 change 太大，人工拆開審。" >&2; exit 2; }
echo "bundle：$OUT/bundle.md（$SIZE bytes）"

# ── 平行送出 ──────────────────────────────────────────────────────────────────────────────────────
run_codex() {
  command -v codex >/dev/null || { echo "（跳過 codex：找不到 CLI）" | tee "$OUT/codex.md"; return; }
  local t0; t0=$(date +%s)
  if [ "$ROUND" = 2 ] && SESSION="$(python3 -c 'import json,sys;print([json.loads(l) for l in open(sys.argv[1]) if l.strip() and json.loads(l).get("kind")=="review" and json.loads(l)["id"]==sys.argv[2] and json.loads(l)["model"]=="codex" and json.loads(l).get("session")][-1]["session"])' "$LEDGER" "$ID" 2>/dev/null)" && [ -n "$SESSION" ]; then
    codex exec --skip-git-repo-check resume "$SESSION" "$(cat "$OUT/bundle.md")" < /dev/null > "$OUT/codex.md" 2> "$OUT/codex.err" &
  else
    codex exec --sandbox read-only --skip-git-repo-check -m "$CODEX_MODEL" -c model_reasoning_effort="high" "$(cat "$OUT/bundle.md")" < /dev/null > "$OUT/codex.md" 2> "$OUT/codex.err" &
  fi
  local rc=0; watch $! || rc=$?
  local sid; sid="$(grep -o 'session id: [0-9a-f-]*' "$OUT/codex.err" | tail -1 | cut -d' ' -f3)"
  ledger "{\"kind\":\"review\",\"id\":\"$ID\",\"round\":$ROUND,\"model\":\"codex\",\"seconds\":$(( $(date +%s) - t0 )),\"need_fix\":$(count "$OUT/codex.md" 需修正),\"risk\":$(count "$OUT/codex.md" 可接受風險),\"fp\":$(count "$OUT/codex.md" 誤報候選),\"ok\":$(answered "$rc" "$OUT/codex.md"),\"session\":\"$sid\"}"
  [ "$(answered "$rc" "$OUT/codex.md")" = true ] || echo "✗ codex 沒有回答（rc=${rc}；看 $OUT/codex.err）—— 這次不算數" >&2
}
run_gemini() {
  command -v agy >/dev/null || { echo "（跳過 gemini：找不到 agy CLI）" | tee "$OUT/gemini.md"; return; }
  local t0; t0=$(date +%s)
  { [ "$ROUND" = 2 ] && { echo "## 你上一輪的回答"; cat "$DIR/r1/gemini.md"; echo; }; cat "$OUT/bundle.md"; } > "$OUT/gemini.prompt.md"
  agy --print "$(cat "$OUT/gemini.prompt.md")" --model "$GEMINI_MODEL" --effort high --mode plan --print-timeout 25m > "$OUT/gemini.md" 2> "$OUT/gemini.err" &
  local rc=0; watch $! || rc=$?
  ledger "{\"kind\":\"review\",\"id\":\"$ID\",\"round\":$ROUND,\"model\":\"gemini\",\"seconds\":$(( $(date +%s) - t0 )),\"need_fix\":$(count "$OUT/gemini.md" 需修正),\"risk\":$(count "$OUT/gemini.md" 可接受風險),\"fp\":$(count "$OUT/gemini.md" 誤報候選),\"ok\":$(answered "$rc" "$OUT/gemini.md")}"
  [ "$(answered "$rc" "$OUT/gemini.md")" = true ] || echo "✗ gemini 沒有回答（rc=${rc}；看 $OUT/gemini.err）—— 這次不算數" >&2
}
run_codex & run_gemini & wait

echo; for m in codex gemini; do echo "── ${m}（$OUT/$m.md）"; grep -E "${TAG}\[(需修正|可接受風險|誤報候選)\]|^結論" "$OUT/$m.md" || tail -n 5 "$OUT/$m.md"; done
echo; echo "下一步：需修正的 → 原 session 修、合併，再跑 --rereview（只一次）；每一條需修正判定後 --judge；封存後 --report。"
