#!/usr/bin/env bash
# 把 docs/WBS.md 寫進 Excel 管理表的「前端」工作表。
#
#     bash .github/scripts/wbs-excel.sh                    # 預設那個檔名
#     bash .github/scripts/wbs-excel.sh 別的檔案.xlsx
#
# **會覆蓋整個「前端」工作表。** 每次都從 WBS.md 重出 ——
# 手改 Excel 的內容會被蓋掉，要改就改 docs/WBS.md 再重跑。
#
# 保留的東西：你的欄位結構（進度／Owner／日期／工時／Document）、
# Status 的下拉選單、三層列的樣式、凍結窗格與篩選。
# **保留的是格子，不是內容** —— 進度、Owner、日期那幾欄留空給你填。
#
# **狀態不是這裡算的。** 跟 `progress.sh --json` 要 ——
# 這一頁、網頁、指令曾經各自算過一次，三邊給出三個不同的答案。
#
# Status 欄的對映（左邊是 progress.sh 算出來的，右邊是你下拉選單裡的值）：
#
#   未開始 → Next-going      等外部 → Pending       待裁決 → TBD
#   已取消 → Cancelled       常態   → Regular
#
# 「現況」欄放的是機器算得出來、但 Excel 表達不了的東西：
# 週次或決策期限、依賴哪幾個缺口、這個缺口影響幾項、以及 Alarm 的理由。
#
# 需要 openpyxl：pip install openpyxl

set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

XLSX="${1:-Project 管理表_tww.xlsx}"
[ -f "$XLSX" ] || { echo "找不到 $XLSX" >&2; exit 2; }
python3 -c "import openpyxl" 2>/dev/null || {
  echo "需要 openpyxl：pip install openpyxl" >&2; exit 2; }

DATA="$(bash .github/scripts/progress.sh --json)" || {
  echo "✗ progress.sh --json 失敗" >&2; exit 1; }

DATA="$DATA" python3 - "$XLSX" <<'PY'
import os, sys, json, re, copy, collections
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.worksheet.datavalidation import DataValidation

data = json.loads(os.environ["DATA"])
path = sys.argv[1]
items, groups, affects = data["items"], data["groups"], data["affects"]

# progress.sh 的狀態 → 下拉選單的值
STATUS = {"未開始": "Next-going", "等外部": "Pending", "待裁決": "TBD",
          "已取消": "Cancelled", "常態": "Regular"}
DROPDOWN = ("Done,On-going,Next-going,Alarm,Delay,Pending,Debug,TBD,"
            "Cancelled,Regular")

def clean(s):
    s = re.sub(r"<!--.*?-->", "", s or "", flags=re.S)
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)
    return re.sub(r"[*`]", "", s).strip()

wb = openpyxl.load_workbook(path)
if "前端" not in wb.sheetnames:
    print("✗ 找不到「前端」工作表", file=sys.stderr)
    raise SystemExit(2)
ws = wb["前端"]
NCOL = max(ws.max_column, 20)

# 三層列的樣式，從原本的表取，不要自己發明一套
GRP = dict(fill=PatternFill("solid", fgColor="FF9E9E9E"), font=Font(bold=True, size=11))
ITEM = dict(fill=PatternFill("solid", fgColor="FFE7E7E7"), font=Font(bold=True))
WORK = dict(fill=PatternFill("solid", fgColor="FFFFFFFF"), font=Font())

if ws.max_row > 1:
    ws.delete_rows(2, ws.max_row - 1)

def put(row, style, cells):
    for col in range(1, NCOL + 1):
        c = ws.cell(row=row, column=col)
        c.fill = copy.copy(style["fill"])
        c.font = copy.copy(style["font"])
        c.alignment = Alignment(vertical="top", wrap_text=(col in (6, 8)))
    for col, v in cells.items():
        ws.cell(row=row, column=col, value=v)

r = 2
for g in groups:
    its = [i for i in items if i["group"] == g["id"]]
    if not its:
        continue
    desc = next((clean(l) for l in (g["desc"] or "").split("\n")
                 if l.strip() and not l.startswith("|")), "")
    put(r, GRP, {1: g["id"], 2: clean(g["title"]), 7: "Next-going",
                 8: desc[:300], 14: sum(i["pts"] for i in its) or None})
    r += 1
    for it in its:
        st = STATUS[it["state"]]
        alarm = "⚠ " if "Alarm" in it["marks"] else ""
        wk = "、".join(it["weeks"]) or (
            ("決策≤W%d" % it["deadline"]) if it["deadline"] else "—")
        extra = "".join(x for x in (
            ("　依賴：" + "、".join(it["blockers"])) if it["blockers"] else "",
            ("　影響 %d 項" % len(affects.get(it["id"], []))) if affects.get(it["id"]) else "",
            ("　" + clean(it["reason"])) if it["reason"] else ""))
        put(r, ITEM, {1: it["id"], 5: clean(it["name"]), 7: st,
                      8: (alarm + wk + extra)[:400], 14: it["pts"] or None})
        r += 1
        for row in it["rows"]:
            w = clean(row["week"])
            w = "" if w == "—" else w
            h = "　".join(x for x in (w, clean(row["blk"]), clean(row["mark"])) if x)
            put(r, WORK, {5: clean(it["name"]), 6: clean(row["work"])[:900],
                          7: st, 8: h[:400], 9: 0.0,
                          14: float(row["pts"]) if str(row["pts"]).isdigit() else None})
            r += 1

last = r - 1
ws.data_validations.dataValidation = []
dv = DataValidation(type="list", formula1='"%s"' % DROPDOWN, allow_blank=True)
ws.add_data_validation(dv)
dv.add("G2:G%d" % last)
ws.freeze_panes = "A2"
ws.auto_filter.ref = "A1:%s%d" % (openpyxl.utils.get_column_letter(NCOL), last)
wb.save(path)

st = collections.Counter(i["state"] for i in items)
print("✓ " + path + " 的「前端」工作表")
print("  " + str(last - 1) + " 列（群組 " + str(len(groups))
      + "、項目 " + str(len(items)) + "）")
print("  " + "、".join(k + " " + str(v) for k, v in st.most_common()))
print("  進度／Owner／日期那幾欄留空 —— 那是你要填的，機器算不出來")
PY
