#!/usr/bin/env bash
# 規格階段的 PR 不得包含產品程式碼。
#
# AGENTS.md：「不得在 specs 談定前寫產品程式碼。」
# 在這個檢查存在之前，那只是一句規範 —— 實測過，
# 一個「合法規格 + 產品程式碼」的 PR 可以直接通過所有 required check。
#
# 這個檢查是決定性的：只看檔案路徑，不做任何判斷。
set -euo pipefail

BASE="${1:?用法: check-pr-phase.sh <base-ref>}"

CHANGED="$(git diff --name-only "origin/${BASE}...HEAD")"
[ -z "$CHANGED" ] && { echo "沒有變更。"; exit 0; }

# 規格內容。**不含 tasks.md** ——
# 實作期間打勾是正常的，不該被擋。
SPEC="$(echo "$CHANGED" | grep -E '^openspec/changes/[^/]+/(proposal\.md|design\.md|specs/)' || true)"

# 產品程式碼。文件、設定、CI、測試腳本都不算。
CODE="$(echo "$CHANGED" | grep -E '^(src|app|components|lib|hooks|pages)/' || true)"

if [ -n "$SPEC" ] && [ -n "$CODE" ]; then
  echo "✗ 這個 PR 同時修改了規格內容與產品程式碼。"
  echo
  echo "規格："
  echo "$SPEC" | sed 's/^/    /'
  echo "產品程式碼："
  echo "$CODE" | sed 's/^/    /'
  echo
  echo "AGENTS.md：規格要先開 draft PR 談定，才能寫產品程式碼。"
  echo "拆成兩個 PR：先送規格，談定合併後再送實作。"
  echo
  echo "（實作期間更新 tasks.md 的打勾不受此限制。）"
  exit 1
fi

if [ -n "$SPEC" ]; then echo "✓ 規格階段的 PR，未含產品程式碼。"
elif [ -n "$CODE" ]; then echo "✓ 實作階段的 PR，未修改規格內容。"
else echo "✓ 未涉及規格或產品程式碼。"; fi
