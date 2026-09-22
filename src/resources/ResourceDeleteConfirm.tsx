'use client'

import { useEffect, useRef, useState } from 'react'
import type { ProjectResourceOut } from '@/api/contract/rest'
import { deleteResource } from '@/api/operations'
import { CAPTION, PRIMARY, SECONDARY, TITLE, withClass } from '@/design/controls'
import { SubmitError } from '@/forms/SubmitError'
import { PanelDialog } from '@/panel/PanelDialog'
import { useEscapeLayer } from '@/world/interaction/escapeLayers'
import { RESOURCE_DELETE_COPY } from './resourceRules'
import type { ResourcesStore } from './resourcesStore'

// 刪除資源的確認層。規格 `FE-J14`〈刪除要確認；取消不送、確認送一次〉、〈結案與權限失敗〉、
//〈鍵盤⋯⋯Escape 每次只關最上層〉、`output-safety`〈只是文字〉。
//
// ⚠️ **連按的 guard 用 `ref` 不用 state**（`OwnerActions.closingRef` 同一個理由）：同一個批次裡的
//    第二下 click 看到的 state 還是舊的 closure，用 state 擋不住「送出兩次 DELETE」。
// ⚠️ **焦點進「取消」**（安全的那一顆）：確認層是為了擋住誤刪，開起來就預選「刪除」等於沒擋。
// ⚠️ **Escape ＝ 取消**（`S20` 明文把 Escape 算成取消）：自己註冊一層，關掉它時面板還在、世界命令鎖不放。
// ⚠️ **失敗一律先走 `store.writeFailed()`**（design D2）：403／409 不只有「結案」一個意思。
//    只有 404 例外 —— 規格說那時「東西已經不在了」，照樣移除那一列**並重讀一次**（〈讀取的時機〉第 4 點指名的）。
// ⚠️ 名稱用文字節點呈現，不 `dangerouslySetInnerHTML`（`S35`：確認層也是渲染端，一樣不信任輸入）。

export interface ResourceDeleteConfirmProps {
  projectId: string
  store: ResourcesStore
  resource: ProjectResourceOut
  /** 取消、Escape、以及刪除完成（含 404）：回到清單。 */
  onDone: () => void
  /** 伺服器說沒有權限（而且專案仍不是 closed）：呼叫端要收掉寫入控制項。 */
  onWriteDenied: () => void
}

const TITLE_ID = 'resource-delete-title'

export function ResourceDeleteConfirm({ projectId, store, resource, onDone, onWriteDenied }: ResourceDeleteConfirmProps) {
  const root = useRef<HTMLDivElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEscapeLayer(onDone, root)
  useEffect(() => {
    cancel.current?.focus()
  }, [])

  const onConfirm = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      await deleteResource(projectId, resource.id)
      store.removed(projectId, resource.id)
      onDone()
    } catch (cause) {
      const outcome = await store.writeFailed(projectId, cause)
      if (outcome === 'closed') return // 面板換成「已結案」，這一層跟著被卸載 —— 沒有東西要顯示
      if (outcome.kind === 'not-found') {
        // 伺服器說它不在了：使用者要的結果已經成立。拿掉那一列，並照規格重讀一次。
        store.removed(projectId, resource.id)
        store.read(projectId)
        onDone()
        return
      }
      if (outcome.kind === 'permission-denied') onWriteDenied()
      setError(outcome.message)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <PanelDialog>
      <div
        ref={root}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        aria-busy={busy}
        data-testid="resource-delete-confirm"
        className="bg-surface-raised border-control-edge shadow-dialog rounded-panel w-dialog flex max-w-full flex-col gap-gutter border p-gutter"
      >
        <p id={TITLE_ID} {...TITLE}>
          {RESOURCE_DELETE_COPY.title}
        </p>
        {/* 刪的是哪一筆：名稱本身就是辨識依據（`S20`），而且只是文字（`S35`）。 */}
        <p data-testid="resource-label" className="text-ink break-words">
          {resource.label}
        </p>
        <p {...withClass(CAPTION, 'text-ink-muted')}>{RESOURCE_DELETE_COPY.body}</p>
        <SubmitError message={error} />
        <div className="flex gap-gutter">
          {/* 安全的那一顆排前面、而且是主要動作：確認層的預設答案是「不刪」。 */}
          <button ref={cancel} type="button" data-testid="resource-delete-confirm-no" {...PRIMARY} onClick={onDone} disabled={busy}>
            {RESOURCE_DELETE_COPY.cancel}
          </button>
          <button type="button" data-testid="resource-delete-confirm-yes" {...SECONDARY} onClick={onConfirm} disabled={busy}>
            {RESOURCE_DELETE_COPY.confirm}
          </button>
        </div>
      </div>
    </PanelDialog>
  )
}
