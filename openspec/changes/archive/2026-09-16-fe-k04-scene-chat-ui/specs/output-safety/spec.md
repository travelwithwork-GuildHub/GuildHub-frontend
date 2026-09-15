# output-safety Specification (delta)

## MODIFIED Requirements

### Requirement: 使用者提供的字串以文字呈現（具名元件）

`TalentFacts` 的名字、技能、自介、收件匣對話（`InboxPanel` 的對話畫面）每一封的 body 節點（`[data-testid="inbox-message-body"]`），
以及場景 chat 列表（`FE-K04`）每一列的 `name` 節點（`[data-testid="chat-name"]`）與 `body` 節點（`[data-testid="chat-body"]`）
SHALL 以文字節點呈現使用者提供的字串；字串含 HTML 時，該欄位的節點 SHALL NOT 有任何子元素。

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
