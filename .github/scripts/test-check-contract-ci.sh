#!/usr/bin/env bash
# `check-contract-ci.py` 自己的負向測試：把防禦拿掉要變紅。閘門壞掉的方式是安靜的 —— 只有本來該紅的變綠。
set -euo pipefail
cd "$(dirname "$0")/../.."
CHECK="python3 .github/scripts/check-contract-ci.py"
# 暫存檔留在 mktemp 的目錄裡不清（幾 KB；runner 是拋棄式的、本機在 /tmp）—— 這支腳本刻意不含任何刪除指令。
TMP=$(mktemp -d)
fail=0
expect_rc() { # $1 期望 rc、$2 標籤、$3 檔案
  local rc=0; $CHECK "$3" >"$TMP/out" 2>&1 || rc=$?
  if [ "$rc" = "$1" ]; then echo "✓ $2"; else echo "✗ $2（rc=$rc，期望 $1）"; cat "$TMP/out"; fail=1; fi
}

# 1. 真的 ci.yml 要過。
expect_rc 0 "repo 的 ci.yml 通過" .github/workflows/ci.yml

# 2. 沒有 postgres service → 紅。
python3 - "$TMP/no-pg.yml" <<'PY'
import sys, yaml
d = yaml.safe_load(open('.github/workflows/ci.yml'))
for j in d['jobs'].values(): j.pop('services', None)
yaml.safe_dump(d, open(sys.argv[1], 'w'), allow_unicode=True)
PY
expect_rc 1 "拿掉 postgres service → 紅" "$TMP/no-pg.yml"

# 3. 沒有跑 test:contract:internal 的 step → 紅。
python3 - "$TMP/no-internal.yml" <<'PY'
import sys, yaml
d = yaml.safe_load(open('.github/workflows/ci.yml'))
for j in d['jobs'].values():
    j['steps'] = [s for s in j['steps'] if 'test:contract:internal' not in str(s.get('run', ''))]
yaml.safe_dump(d, open(sys.argv[1], 'w'), allow_unicode=True)
PY
expect_rc 1 "拿掉 test:contract:internal 那一步 → 紅" "$TMP/no-internal.yml"

# 4. 偷加一步跑 guildhub → 紅（三種寫法各一）。
for bad in "node scripts/contract-guildhub.mjs" "bash ../GuildHub-backend/run.sh" "CONTRACT_TARGET=guildhub npx vitest run --config vitest.contract.mts"; do
  python3 - "$TMP/guildhub.yml" "$bad" <<'PY'
import sys, yaml
d = yaml.safe_load(open('.github/workflows/ci.yml'))
next(iter(d['jobs'].values()))['steps'].append({'name': 'sneaky', 'run': sys.argv[2]})
yaml.safe_dump(d, open(sys.argv[1], 'w'), allow_unicode=True)
PY
  expect_rc 1 "偷加「${bad}」→ 紅" "$TMP/guildhub.yml"
done

# 5. 只在 step **名稱**裡出現 guildhub 不算（比的是結構，不是整檔文字）。
python3 - "$TMP/name-only.yml" <<'PY'
import sys, yaml
d = yaml.safe_load(open('.github/workflows/ci.yml'))
next(iter(d['jobs'].values()))['steps'].append({'name': '這一步的名字提到 contract-guildhub 與 run.sh，但 run 是乾淨的', 'run': 'echo ok'})
yaml.safe_dump(d, open(sys.argv[1], 'w'), allow_unicode=True)
PY
expect_rc 0 "只有 step 名稱提到 guildhub → 不算" "$TMP/name-only.yml"

# 6. 設了 GUILDHUB_BACKEND_DIR → 紅。
python3 - "$TMP/backend-dir.yml" <<'PY'
import sys, yaml
d = yaml.safe_load(open('.github/workflows/ci.yml'))
next(iter(d['jobs'].values()))['env'] = {'GUILDHUB_BACKEND_DIR': '../GuildHub-backend'}
yaml.safe_dump(d, open(sys.argv[1], 'w'), allow_unicode=True)
PY
expect_rc 1 "設了 GUILDHUB_BACKEND_DIR → 紅" "$TMP/backend-dir.yml"

if [ "$fail" = 0 ]; then echo "全部通過"; else echo "有紅的"; exit 1; fi
