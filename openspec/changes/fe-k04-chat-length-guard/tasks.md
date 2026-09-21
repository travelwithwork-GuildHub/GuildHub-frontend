# Tasks —— fe-k04-chat-length-guard

## 1. 規格（本 PR）
- [ ] 1.1 `spec/fe-k04-chat-length-guard` 分支，只動 `openspec/changes/fe-k04-chat-length-guard/`
- [ ] 1.2 `pnpm exec openspec validate fe-k04-chat-length-guard --strict` 綠
- [ ] 1.3 規格 PR 合併到 main

## 2. 實作：LIMITS 與 composer 送出守門（feat/fe-k04-chat-length-guard--guard）
- [ ] 2.1 `src/api/contract/limits.ts`：`chatBody` 改 `{min:0, max:500}`；`LIMIT_SOURCES.chatBody` 改指向部署閘道 relay 實測（`len>500` 靜默丟棄）＋`checkedOn: '2026-09-21'`；改註解（拿掉 `BE-G16 未解`／`protocol.py 只驗是字串`的舊事實，寫清楚 500 是 relay 政策、與 2000 顯示預算獨立）
- [ ] 2.2 `src/chat/SceneChatComposer.tsx`：`remaining(LIMITS.chatBody, value)` 剩餘字數（可定位、`aria-describedby`）；`violates() === 'too-long'` 時送出按鈕 disabled；**`submit()` 開頭擋 too-long**（Enter／form submit 也擋）；輸入框超長設 `aria-invalid`；不加原生 `maxlength`；改檔頭註解（「沒有上限」→ 500 送出守門）
- [ ] 2.3 交付前過 `ui-ux-pro-max`（forms/feedback：剩餘字數層級、超長欄位級回饋對比）
- [ ] 2.4 單元測試 `tests/scene-chat-composer.test.tsx`：舊 S07 測試改標 `FE-K04-S16`（500 送、501 三種觸發都不送、值保留、按鈕 disabled、無 maxlength）；新增 `FE-K04-S17`（剩餘字數更新、貼上 600 保留全文＋負剩餘＋disabled＋aria-invalid、超長不是 alert 是欄位級、20 emoji 剩餘算 480 不是 460）。S05／S06／S14 標籤不變

## 3. 實作：契約限制事實（併入 --guard）
- [ ] 3.1 `tests/scene-chat-memory.test.ts`：舊 `FE-R11-S09` 測試改標 `FE-R11-S11`；`LIMITS.chatBody` 斷言改 `{min:0, max:500}`、`LIMIT_SOURCES.chatBody.source` 斷言改實測來源（不再含 `protocol.py`）；**保留** Zod 自省無 length check、`ChatIn.safeParse(501 code point)` 通過（parse 不擋長度）
- [ ] 3.2 確認 `tests/forms-optimistic-limits.test.ts`（chatBody 有後端上限、不得進 `FORM_LIMITS`）、`tests/contract-limits.test.ts`、`tests/limit-source.test.ts` 全綠（chatBody 不是 form 欄位、應無影響 —— 跑一次確認）
- [ ] 3.3 `FE-R11-S04`（2001→留前 2000 顯示）不動：顯示記憶體預算與 500 送出上限各自獨立

## 4. 收尾
- [ ] 4.1 `pnpm lint` ＋ `pnpm test`（不帶 e2e）全綠
- [ ] 4.2 部署由使用者 `vercel --prod`；真機走查：打 >500 字送不出、有剩餘字數、刪到 500 可送
- [ ] 4.3 archive-review ＋封存（使用者手動 `archive-review.sh`）
