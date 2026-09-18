## Applicability

權限：不適用 —— 只約束渲染。
併發：不適用。
持久資料相容性：不適用 —— 不讀寫持久資料。
失敗路徑：適用 —— 含 HTML 的名稱、`javascript:` 網址。
測試連線：不適用 —— jsdom，不連任何服務。

## MODIFIED Requirements

### Requirement: 使用者提供的字串以文字呈現（具名元件）

`TalentFacts` 的名字、技能、自介、收件匣對話（`InboxPanel` 的對話畫面）每一封的 body 節點（`[data-testid="inbox-message-body"]`），
場景 chat 列表（`FE-K04`）每一列的 `name` 節點（`[data-testid="chat-name"]`）與 `body` 節點（`[data-testid="chat-body"]`），
以及專案資源（`FE-J14`）面板每一列與刪除確認層的名稱節點（`[data-testid="resource-label"]`）
SHALL 以文字節點呈現使用者提供的字串；字串含 HTML 時，該欄位的節點 SHALL NOT 有任何子元素。

專案資源看板的卡槽另立一條，因為它**刻意截斷**（`project-resources`〈資源看板〉：3D 上放不下 100 個字）：
可見節點（`[data-testid="resource-board-label"]`）SHALL 以文字節點呈現**原字串的一個前綴**（可再加截斷標記），
SHALL NOT 有任何子元素；同一個卡槽的可及名稱 SHALL 是未截斷的原字串，且 SHALL 以文字形式提供（屬性值，不是 HTML）。
**截斷不是安全措施**：兩者都不得讓使用者字串變成標記。

#### Scenario: [FE-T06-S06] 含 HTML 的名片與信，逐欄定位

- **WHEN** 以 `display_name`＝`<b onclick=alert(1)>x</b>`、`skills`＝`['<img src=x onerror=alert(2)>']`、`bio`＝`<script>alert(3)</script><i>y</i>` 渲染 `TalentFacts`
- **THEN** `h3` 的 `textContent` SHALL 等於 `<b onclick=alert(1)>x</b>` 且 SHALL 沒有子元素；`[data-testid="talent-skill"]` 的 `textContent` SHALL 等於那段 `<img …>` 且沒有子元素；`[data-testid="talent-bio"]` 的 `textContent` SHALL 等於那段 `<script>…` 且沒有子元素；整個 `talent-facts` 容器裡 SHALL 沒有 `b`、`img`、`script`、`i` 元素
- **WHEN** 收件匣的對話裡有兩封：body＝`<img src=x onerror=alert(4)><u>z</u>`、body＝`<svg onload=alert(5)></svg><a href="javascript:alert(6)">w</a>`
- **THEN** 兩封 `[data-testid="inbox-message-body"]` 的 `textContent` SHALL 各等於原字串、各 SHALL 沒有子元素；整個對話裡 SHALL 沒有 `img`、`u`、`svg`、`a[href^="javascript"]` 元素

#### Scenario: [FE-K04-S13] chat 的 name 與 body 含 HTML 仍只是文字

- **WHEN** 記憶體有一列 `name`＝`<img src=x onerror=alert(1)>`、`body`＝`<script>alert(2)</script><a href="javascript:alert(3)">x</a>`
- **THEN** 那一列的 `[data-testid="chat-name"]` 與 `[data-testid="chat-body"]` 的 `textContent` SHALL 各等於原字串、各 SHALL 沒有子元素
- **AND** 整個 chat 區裡 SHALL 沒有 `script`、`img`、`a[href^="javascript"]` 元素
- → 驗於：jsdom

#### Scenario: [FE-J14-S35] 資源名稱含 HTML、網址是 javascript:，面板與看板都只是文字

- **WHEN** 一筆資源 `label`＝`<img src=x onerror=alert(1)><b>r</b>`、`url`＝`javascript:alert(2)`（假資料，後端的資料庫規則收不下，這裡驗的是渲染端不信任輸入），分別渲染資源面板、該筆的刪除確認層、資源看板
- **THEN** 面板與確認層的 `[data-testid="resource-label"]` 的 `textContent` SHALL 各等於原字串、各 SHALL 沒有子元素
- **AND** 看板的 `[data-testid="resource-board-label"]` 的 `textContent` SHALL 是原字串的前綴（可含截斷標記）、SHALL 沒有子元素；
  該卡槽的可及名稱 SHALL 逐字等於原字串
- **AND** 三處 SHALL 都沒有 `img`、`b`、`a[href^="javascript"]` 元素；面板那一列的網址 SHALL 是 `unsafe-link` 純文字
- → 驗於：jsdom
