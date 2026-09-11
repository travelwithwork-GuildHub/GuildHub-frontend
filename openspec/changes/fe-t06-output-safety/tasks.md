# `FE-T06` 任務

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-t06-output-safety`）

## 2. lint、safeHref、SafeExternalLink

對應 Requirement〈危險面在 lint 就被擋下〉、〈`safeHref` 只放行白名單的 scheme〉、〈`SafeExternalLink`⋯⋯〉

- [ ] 2.1 `eslint.config.mjs` 三個 selector（跟既有的 `no-restricted-syntax` 區塊一起帶；`SafeExternalLink.tsx` 用 file override 只拿掉第 3 條）；`InboxPanel` 的 body 節點加 `data-testid="inbox-message-body"`；`src/security/safeHref.ts`；`src/security/SafeExternalLink.tsx`
- [ ] 2.2 判準：`S01`～`S05`（`tests/output-safety-lint.test.ts`：正向與負向 fixture；`tests/safe-href.test.tsx`）
- [ ] 2.3 **突變**：selector 拿掉 → `S01`／`S02`／`S03`；`safeHref` 改 `startsWith('http')` → `S04`；`SafeExternalLink` 沒過也畫 `<a>` → `S05`

## 3. 輸出判準

對應 Requirement〈使用者提供的字串以文字呈現〉

- [ ] 3.1 判準 `S06`（`tests/output-safety-render.test.tsx`：真的 `TalentFacts` 與收件匣對話，逐欄定位）
- [ ] 3.2 **突變**（工作區上做完就 `git checkout` 還原）：`TalentFacts` 的 bio 改 `dangerouslySetInnerHTML` → lint 紅（先）＋ `S06` 紅

## 4. 收尾

- [ ] 4.1 `npm run typecheck`、`npm run lint`、`npm test` 全綠
- [ ] 4.2 封存（`archive/fe-t06-output-safety`，獨立 PR）
