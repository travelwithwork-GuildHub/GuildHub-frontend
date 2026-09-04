#!/usr/bin/env bash
# 把 docs/WBS.md 產成一頁可以點開收合的網頁。
#
#     bash .github/scripts/wbs-page.sh          # 產生 docs/wbs.html
#     bash .github/scripts/wbs-page.sh --open   # 產生並開啟
#
# **產物不進版控。** 一份「從 WBS.md 產出來、卻自己存在版控裡」的 HTML
# 會漂 —— 有人改了 WBS 但忘了重產，那一頁就開始說謊，而且沒有人會發現。
# 它在 .gitignore 裡，要看就重跑一次。
#
# 這一頁跟 progress.sh 的差別：
#
#   progress.sh   現在做到哪裡（狀態、被什麼擋住、規則違規）。**每天用的**
#   這一頁         整份計畫長什麼樣（161 項的細節、每週負荷、跨項依賴）。**要review 時用的**
#
# **狀態的判定邏輯兩邊必須一樣。** app.js 裡的 state() 是從 progress.sh 搬過來的
# ——同一套互斥標記、同一條「有週次就排得動」。改了一邊就要改另一邊，
# 否則會出現「指令說未開始、網頁說等外部」這種各說各話。
#
# 模板在 .github/scripts/wbs-page/ 底下，改樣式改那裡。

set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

OPEN=0
[ "${1:-}" = "--open" ] && OPEN=1

SRC="docs/WBS.md"
DIR=".github/scripts/wbs-page"
OUT="docs/wbs.html"

[ -f "$SRC" ] || { echo "找不到 $SRC" >&2; exit 2; }
[ -f "$DIR/template.html" ] || { echo "找不到 $DIR/template.html" >&2; exit 2; }

python3 - "$SRC" "$DIR" "$OUT" <<'PY'
import re, json, sys, pathlib, collections

src_path, tpl_dir, out_path = sys.argv[1], pathlib.Path(sys.argv[2]), sys.argv[3]
src = pathlib.Path(src_path).read_text(encoding="utf-8")
lines = src.splitlines()

def is_sep(i):
    if i >= len(lines):
        return False
    s = lines[i].strip()
    return s.startswith("|") and set(s) <= set("-:| ")

def plain(s):
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)
    return s.strip()

# ── 解析工作分解表 ─────────────────────────────────────────────────
# 表頭的定義是「下一行是分隔線」，跟 progress.sh 一致 ——
# 說明用的表格裡也會出現 | **ID** | … | 這種資料列。
items, groups = [], []
cur = None
in_t = False
ncols = 0
gname = None
gdesc = []

for n, raw in enumerate(lines, 1):
    line = raw.strip()
    if line.startswith("## "):
        gname = line[3:].strip()
        gdesc = []
        if gname.startswith(("FE-", "BE-")):
            groups.append({"id": gname.split()[0], "title": gname, "desc": ""})
        in_t = False
        cur = None
        continue
    if line.startswith("> ") and groups and gname and gname.startswith(("FE-", "BE-")) and not in_t:
        gdesc.append(line[2:])
        groups[-1]["desc"] = "\n".join(gdesc)
    if not line.startswith("|"):
        in_t = False
        cur = None
        continue
    c = [x.strip() for x in line.strip("|").split("|")]
    h = re.sub(r"[*`]", "", c[0]).strip()
    if h.casefold() == "id" and is_sep(n):
        in_t = len(c) >= 5
        ncols = len(c) if in_t else 0
        cur = None
        continue
    if not in_t:
        continue
    if h and set(h) <= set("-: "):
        continue
    if len(c) != ncols:
        continue
    if re.fullmatch(r"[A-Z]+-[A-Z][0-9]+", h):
        cur = {"id": h, "group": groups[-1]["id"] if groups else "?",
               "name": re.sub(r"[*`]", "", c[1]), "rows": []}
        items.append(cur)
    if cur is None:
        continue
    cur["rows"].append({"work": c[2], "week": c[3], "pts": c[4],
                        "blk": c[5], "mark": c[6]})

for it in items:
    wk, pts, blk, marks, dl, fb = set(), 0, set(), set(), None, False
    for r in it["rows"]:
        for m in re.findall(r"W[0-9]+(?:–W[0-9]+)?", r["week"]):
            wk.add(m)
        md_ = re.fullmatch(r"決策≤W([0-9]+)", r["week"])
        if md_:
            dl = int(md_.group(1))
        if "【沒答案就】" in r["work"]:
            fb = True
        if r["pts"].isdigit():
            pts += int(r["pts"])
        for g in re.findall(r"[A-Z]+-[A-Z][0-9]+", plain(r["blk"])):
            blk.add(g)
        head = re.split(r"[｜|]", r["mark"], 1)[0]
        for w in re.split(r"[+＋\s]+", head):
            if w.strip():
                marks.add(w.strip())
    it["weeks"] = sorted(wk, key=lambda s: int(re.findall(r"\d+", s)[0]))
    it["pts"] = pts
    it["blockers"] = sorted(blk)
    it["marks"] = sorted(marks)
    it["deadline"] = dl
    it["fallback"] = fb
    it["reason"] = next((re.split(r"[｜|]", r["mark"], 1)[1].strip()
                         for r in it["rows"] if "｜" in r["mark"]), "")

# 反向索引：這個缺口影響哪些項目。**算的，不是手寫的。**
affects = collections.defaultdict(list)
for it in items:
    for g in it["blockers"]:
        affects[g].append(it["id"])

mile = []
mi = src.find("## 里程碑")
if mi > 0:
    for line in src[mi:].splitlines():
        if not line.strip().startswith("| **W"):
            continue
        c = [x.strip() for x in line.strip().strip("|").split("|")]
        if len(c) >= 2:
            mile.append({"w": re.sub(r"[*]", "", c[0]), "text": c[1]})

deps = []
di = src.find("已知的跨項依賴")
if di > 0:
    for line in src[di:di + 2000].splitlines():
        if not line.startswith("| `"):
            continue
        c = [x.strip() for x in line.strip().strip("|").split("|")]
        if len(c) == 2:
            deps.append({"a": c[0], "b": c[1]})

data = {"items": items,
        "groups": [g for g in groups if any(i["group"] == g["id"] for i in items)],
        "affects": dict(affects), "milestones": mile, "deps": deps}

# ── 組頁面 ─────────────────────────────────────────────────────────
blob = json.dumps(data, ensure_ascii=False).replace("</script>", "<\\/script>")
html = ("<!doctype html>\n<html lang=\"zh-Hant\">\n<head>\n<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n"
        + (tpl_dir / "template.html").read_text(encoding="utf-8").split("</style>")[0]
        + "</style>\n</head>\n<body>\n"
        + (tpl_dir / "template.html").read_text(encoding="utf-8").split("</style>")[1]
        + "\n<script type=\"application/json\" id=\"wbs-data\">" + blob + "</script>\n"
        + "<script>\n" + (tpl_dir / "app.js").read_text(encoding="utf-8") + "\n</script>\n"
        + "</body>\n</html>\n")
pathlib.Path(out_path).write_text(html, encoding="utf-8")

fe = [i for i in items if i["group"] != "BE-G"]
print("✓ " + out_path)
print("  " + str(len(items)) + " 項（" + str(len(fe)) + " 項在前端手上、"
      + str(len(items) - len(fe)) + " 項待銜接）、"
      + str(sum(i["pts"] for i in fe)) + " 點、" + str(len(mile)) + " 個里程碑")
PY

rc=$?
[ $rc -eq 0 ] || exit $rc

if [ "$OPEN" = "1" ]; then
  case "$(uname)" in
    Darwin) open "$OUT" ;;
    *) command -v xdg-open >/dev/null && xdg-open "$OUT" || echo "自己開 $OUT" ;;
  esac
fi
