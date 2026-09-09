#!/usr/bin/env bash
# 這個 PR 有多大 —— **在寫 PR 說明之前跑它**。
#
# 為什麼是「之前」：寫說明是整個流程裡最貴的一步。先寫說明再發現超標的話，
# 拆分支之後那份說明要整份重寫。`FE-W12` 那個 change 就這樣浪費了三次
# （429 / 505 / 509 行）。
#
#   bash .github/scripts/pr-size.sh            # 對 origin/main 量
#   bash .github/scripts/pr-size.sh <base>     # 對別的基準量
#
# **超標時 exit 1**，但**沒有任何 CI 在跑它** —— 見 AGENTS.md〈PR 的大小〉。
set -euo pipefail

BASE="${1:-origin/main}"
PRODUCT_MAX=250
TOTAL_MAX=800

if ! git rev-parse --verify --quiet "$BASE" >/dev/null; then
  echo "找不到基準 $BASE —— 先 git fetch origin" >&2
  exit 2
fi

# ⚠️ **三個點**：對 merge base 量，不是對 base 的當前 HEAD。
# 兩個點會把「base 上別人合併進去的東西」算進你的 diff。
# `--no-renames` 讓改名算成「刪一個加一個」—— 那是 reviewer 真的要看的量。
NUMSTAT="$(git diff --numstat --no-renames "$BASE...HEAD")"

product=0; tests=0; other=0; generated=0

while IFS=$'\t' read -r added _deleted path; do
  [ -z "${path:-}" ] && continue
  [ "$added" = "-" ] && added=0   # 二進位檔
  case "$path" in
    # 產生物與二進位：不算。它們不是給人逐行讀的。
    package-lock.json|*.lock|*.png|*.jpg|*.jpeg|*.gif|*.webp|*.ico|*.woff|*.woff2)
      generated=$((generated + added)) ;;
    src/api/contract/schema.d.ts|src/api/contract/GENERATED.md|docs/evidence/*/report.json)
      generated=$((generated + added)) ;;
    # 判準
    tests/*)
      tests=$((tests + added)) ;;
    # 產品程式碼 —— 這一類的上限最緊
    src/*|app/*)
      product=$((product + added)) ;;
    *)
      other=$((other + added)) ;;
  esac
done <<< "$NUMSTAT"

total=$((product + tests + other))

# ⚠️ **空的 diff 不是「通過」。**
# 它幾乎一定代表「還沒 commit」—— 而這支腳本量的是 commit 過的東西。
# 印一個綠勾出去的話，它會變成一個**在最需要它的時候恆真**的閘門。
# （實測踩過：在同一個複合指令裡把 `pr-size.sh` 排在 `git commit` 前面，
#  它回報 0 行並印了「可以寫 PR 說明了」。）
if [ "$total" -eq 0 ] && [ "$generated" -eq 0 ]; then
  echo "相對 $BASE 沒有任何差異 —— 你 commit 了嗎？（這支腳本量的是 commit 過的東西）" >&2
  exit 2
fi

printf '基準 %s\n\n' "$BASE"
printf '  產品程式碼  %5d  （上限 %d）\n' "$product" "$PRODUCT_MAX"
printf '  判準        %5d\n' "$tests"
printf '  其他        %5d  （規格、文件、CI）\n' "$other"
printf '  ────────────────\n'
printf '  人工撰寫    %5d  （上限 %d）\n' "$total" "$TOTAL_MAX"
[ "$generated" -gt 0 ] && printf '  產生物      %5d  （不計）\n' "$generated"
printf '\n'

fail=0
if [ "$product" -gt "$PRODUCT_MAX" ]; then
  printf '✗ 產品程式碼超過 %d 行（%d）—— 那是一次要理解的業務邏輯上限\n' "$PRODUCT_MAX" "$product"
  fail=1
fi
if [ "$total" -gt "$TOTAL_MAX" ]; then
  printf '✗ 人工撰寫合計超過 %d 行（%d）\n' "$TOTAL_MAX" "$total"
  fail=1
fi

if [ "$fail" = 1 ]; then
  printf '\n**現在就拆，不要先寫 PR 說明。**\n'
  printf '⚠️ 但拆的時候不得把「實作」與「直接證明它的判準」分開 ——\n'
  printf '   那樣兩個 PR 都變成不能單獨審的東西。按 Scenario 切，不要按行數切。\n'
  exit 1
fi

printf '✓ 可以寫 PR 說明了\n'
