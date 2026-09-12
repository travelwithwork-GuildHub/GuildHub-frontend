# VENDOR.md —— ui-ux-pro-max

上游 repo: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
上游 tag: v2.15.0
上游 commit: a38d04c3d5c298c851dbe5e6ee1965ee3de42cb5
授權: MIT（`LICENSE` 原封來自上游 repo 根目錄）
上游路徑: `.claude/skills/ui-ux-pro-max/`（`LICENSE` 除外）

## 搬了什麼、沒搬什麼

搬：`SKILL.md`、`references/`、`scripts/`（4 支，純標準庫）、12 個核心 CSV、
4 個 stack（`nextjs` `react` `threejs` `html-tailwind`）。

**沒搬**（為了留在閘門的 1 MB 合計上界內）：

- `data/google-fonts.csv`（747 KB）—— `--domain google-fonts` 會回 `File not found`
- `data/phosphor-icons-upstream.json`（824 KB）、`data/catalog-summary.json`、
  `data/data-provenance.json`、`data/google-font-licenses.json` —— 腳本不讀它們
- 其他 18 個 `data/stacks/*.csv` —— `--stack <那些>` 會回 `File not found`

`--domain` 與 `--stack` 缺檔時腳本印 `Error: File not found: …`／`Error: Stack file not found: …` 後正常結束，不會 crash。

## 相對上游改了什麼

只有 `SKILL.md` 與 `scripts/core.py` 的檔案模式；其他檔案位元相同（下表「同」）。

`SKILL.md`（4 處，都是為了「clone 即有、不裝任何東西」）：

1. 11 行指令 `python "${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/scripts/search.py"`
   → `python3 .claude/skills/ui-ux-pro-max/scripts/search.py`（從 repo 根目錄跑）
2. 〈Running the search tool〉開頭那段改成說明這是 vendored copy、沒有 `${CLAUDE_PLUGIN_ROOT}`
3. 「If `python` is not found…」那段改成列出沒搬的 domain／stack
4. `google-fonts` 那列與〈Available stacks〉那行標明沒搬

`scripts/core.py`：上游是 `100755`，這裡 `100644`（閘門不准執行位元；用 `python3` 叫用不需要）。

## 怎麼驗

```bash
git clone -q https://github.com/nextlevelbuilder/ui-ux-pro-max-skill /tmp/up && git -C /tmp/up checkout -q a38d04c3d5c298c851dbe5e6ee1965ee3de42cb5
cd .claude/skills/ui-ux-pro-max
for f in $(awk -F'|' '/^\| `/ {gsub(/[` ]/,"",$2); print $2}' VENDOR.md); do
  src=/tmp/up/.claude/skills/ui-ux-pro-max/$f; [ "$f" = LICENSE ] && src=/tmp/up/LICENSE
  cmp -s "$f" "$src" && echo "same  $f" || echo "DIFF  $f"
done                                                                 # 只有 SKILL.md 該是 DIFF
diff -u /tmp/up/.claude/skills/ui-ux-pro-max/SKILL.md SKILL.md       # 只該看到上面 4 處
shasum -a 256 -c <(awk -F'|' '/^\| `/ {gsub(/[` ]/,"",$2); gsub(/ /,"",$5); print $5"  "$2}' VENDOR.md)   # 表格對得上這個 commit
```

## 檔案清單（sha256）

| 檔案 | bytes | 對上游 | sha256（這裡） | sha256（上游） |
|---|---:|:---:|---|---|
| `LICENSE` | 1075 | 同 | 738f69dfa83db5c347c678fb9d90e560877059f0de93a327c39001bff92dc014 | （同左） |
| `SKILL.md` | 15989 | 改 | e5148b3716dc68ca521bb26d29d1bd172fd39b8753ec796d47fe1f66bb9423b8 | ea087c341bfb5b23195c7302027268ede86da802554c18a5c4896a6017b439f9 |
| `data/app-interface.csv` | 11046 | 同 | 331e7cf2c0b222d80c566c5f255c63cb339f65bfd02e471a720f28e4864a9f08 | （同左） |
| `data/charts.csv` | 23365 | 同 | 4115cf1120680f2cedef0676cb648f30c7ef4699e2a947535d4113e71ed3b12a | （同左） |
| `data/colors.csv` | 37940 | 同 | 8162429222bce22df62b564085946a30d07cc9722c58d0a3a494bd0d1d00841c | （同左） |
| `data/icons.csv` | 57945 | 同 | 50816c6012030178195a16ee481ebf58b47bd985d70e8ec58886cc83f6eddafc | （同左） |
| `data/landing.csv` | 25449 | 同 | 9a2edd3bb676c2a58f00ade7a062e285222d4297bfd847c8d5b056f0dbbf52d0 | （同左） |
| `data/motion.csv` | 14679 | 同 | 381affe8df8ea1f66fbbda2598827f9f54299107bbe6a1b4e9b68f6b62091ceb | （同左） |
| `data/products.csv` | 75623 | 同 | 42473f75e8dde5987bdf89ce55d8c168091b80a356cae691dd60247d80720b70 | （同左） |
| `data/react-performance.csv` | 15080 | 同 | 3d925802539abac5afeb63ae8aa1960b7229ad271b3a47caed40ab2d97ad0734 | （同左） |
| `data/stacks/html-tailwind.csv` | 16551 | 同 | d05a581d20af57b8ca0104a6d31d90a07c437d500662a96c3029fc2f9a4678ee | （同左） |
| `data/stacks/nextjs.csv` | 18687 | 同 | ecd2c27b2ea0127d203ae726060efcdd7335b5e83f96b99e4f3befbbfeebd5a4 | （同左） |
| `data/stacks/react.csv` | 19036 | 同 | 2d2b9c198e875106a30f7ee68341a9ee0033cad60a7e130cf23152783e08aeda | （同左） |
| `data/stacks/threejs.csv` | 46051 | 同 | 97542e0ba34915a0ff7578be20e1619495df47c95c8c1c39b83e3785e1de771f | （同左） |
| `data/styles.csv` | 149478 | 同 | a93a4d9d7025856575d7b7583bda020be9043013432c5af7c58af9dbdfb206b7 | （同左） |
| `data/typography.csv` | 49997 | 同 | 321fc446e89024488ebae96dda93efc4d2307bd8bddb240857ad51364f6782c8 | （同左） |
| `data/ui-reasoning.csv` | 77360 | 同 | f0774dd741cecdad5eec842034bd6d5e9ea50e9f220a1910069748daa0bb8e9a | （同左） |
| `data/ux-guidelines.csv` | 27516 | 同 | ff81ec613f70ba9fc3fcce52dbe4ae35d44b2079dbe6dc066d2d6e38c28facd5 | （同左） |
| `references/pro-rules.md` | 10909 | 同 | d28442d61c310b49c054a4ea736f89fb3008beebdbbc38c4b3a540b8f7fadf23 | （同左） |
| `references/quick-reference.md` | 24526 | 同 | 0609bc7c89dacb40472465d8fc14257b56b2c43439660fc8d6fa3b8c022e1876 | （同左） |
| `scripts/core.py` | 41234 | 同 | e544826963efefce3c59b65e18d83d92a5baf571f05458025bf1fa9021eced42 | （同左） |
| `scripts/design_system.py` | 70937 | 同 | 6a94743c3362c9c7e6d1450b94f4014d9ea752e7b4e151f6f0bdb217e0544bf7 | （同左） |
| `scripts/reasoning_contract.py` | 5824 | 同 | b8bac1af82aa280d3e06f00aabaeac4337e632996b07fed874e2b6ee6e9c5913 | （同左） |
| `scripts/search.py` | 9123 | 同 | 8373e2dd2d560d9853ec116140de0e0d5bee45a6abe5e041173c84e1c36a7f87 | （同左） |

合計 845420 bytes（不含本檔）。
