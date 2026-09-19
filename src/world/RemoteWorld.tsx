'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import type { NameTagNodes } from './NameTags'
import { realtimeAdapter } from '@/config/env'
import { RealtimeClient } from '@/realtime/client'
import { createReconnectSchedule } from '@/realtime/reconnect'
import type { ConnectionEvent } from '@/world/scenes/SceneProvider'
import { useWorldLease } from '@/realtime/WorldLeaseProvider'
import { createMessageValidator, type ProtocolViolation } from '@/realtime/protocol'
import type { ChatLink, SceneChatPort } from '@/realtime/sceneChatStore'
import type { StatusLink, StatusPort } from '@/realtime/statusStore'
import {
  applyMessage,
  createRemotePlayersState,
  onlineCountOf,
  resetRemotePlayers,
  type RemoteIdentity,
  type RemoteMotion,
} from '@/realtime/remotePlayers'
import { RemotePlayers } from './RemotePlayers'
import { PositionSync, type LocalPose } from './PositionSync'

// 遠端玩家接上連線的地方。規格 FE-R07。
//
// ⚠️ **父層統一收訊息、更新兩個容器；子元件不得各自訂閱。**
// 40 個訂閱者在每則 `pos` 上都會被喚醒一次，而其中 39 個跟自己無關。
//
// ⚠️ **只有低頻 Presence view 改變時才 setState**（成員進出、狀態文字 —— `FE-R10` D3）。
// `applyMessage` 回傳的就是那件事，`pos` 一律回 `false` —— 每秒 400 次的位置更新完全不經過 React。

const EMPTY_ROSTER: ReadonlyMap<string, RemoteIdentity> = new Map()

export interface RemoteWorldProps {
  /** 本地角色的權威狀態，由 `LocalPlayer` 每幀寫入。 */
  poseRef: RefObject<LocalPose>
  /**
   * 單調時間來源。**注入的，而且寫入樣本與求值畫面位置用的是同一個。**
   *
   * ⚠️ 兩邊用不同時鐘的話（例如一邊 `performance.now()`、一邊
   * `useFrame` 的 `state.clock`），原點與暫停行為都不同，相減得到的數字
   * 沒有意義 —— 而症狀是「插值瞬間完成」或「永遠不開始」，
   * **沒有任何錯誤訊息**。測試靠傳一個假的來控制時間。
   */
  now?: () => number
  /**
   * 第幾代連線。**變了就整條連線關掉重開**（規格 `FE-A05-S04`）。
   *
   * ⚠️ **為什麼需要它**：即時層每個人的 `av` 來自那條連線背後的 session，
   * 而後端是在**登入時**把 `avatar_id` 寫進 session 的。改了 profile 之後
   * **已經在場的其他人看到的仍然是舊外觀** —— 除非連線重建。
   *
   * ⚠️ **它是 prop 不是 `useContext`。** 這個元件在 `<Canvas>` 裡面，
   * 而 React context **不會自動跨過 R3F 的 renderer 邊界** ——
   * 跟 `av` 是同一個理由（見 `WorldCanvas`）。
   *
   * ⚠️ 重連的代價寫在規格 `S05`：其他人可能短暫看到這個人離開又進來。
   */
  generation?: number
  /**
   * 連哪個 scene，來自場景註冊表（`FE-V01-S01`）。預設 `lobby`。
   *
   * ⚠️ **這裡不寫死 `lobby`，也不自己組 `room:` 字串** —— 形狀由 `sceneOf()` 決定。
   * 換 scene 是關掉重開（`FE-R01-S05`）：它在 effect 的依賴裡，變了就 cleanup 舊的、建新的。
   */
  scene?: string
  /** 進受密碼保護的房間才要。怎麼拿到它是 `FE-N08`；怎麼持有它是 `FE-V01` 的 `--transition` 那一片。 */
  token?: string
  /**
   * 換場景的閘門（規格 `FE-V01-S18`）。**跨兩次掛載的共用 ref**：舊的那一個在卸載時把
   * `client.close()` 回的 promise（舊 socket 的 close 事件到達、或 1 秒）放進來，新的那一個
   * 在 `connect()` 之前等它。
   *
   * ⚠️ 為什麼要等：後端 `disconnect()` 只查同 scene 的兄弟連線；新連線先 `join()` 的話被清掉的是新的人
   * （見 `CLOSE_ACK_TIMEOUT_MS`）。為什麼是 ref 不是 context：這個元件在 `<Canvas>` 裡。
   * 沒給的話不等 —— 既有的呼叫端與測試不用改。
   */
  closeGateRef?: RefObject<Promise<void> | null>
  /**
   * 連線事件回報（`FE-V01` 的過場：`ready` 提交、`open` 之前就關是失敗）。帶著這條連線的 `scene` 參數，
   * 收的人自己比對是不是目標場景。**自己在卸載時關的那一次不回報** —— 那不是「連不上」。
   * ⚠️ 要身分穩定：它在下面 effect 的依賴裡，換一個就重連。
   */
  onConnection?: (event: ConnectionEvent, scene: string) => void
  /**
   * 重連排程到點那一刻問的：這條連線（`scene`）還是目前場景的、而且沒有過場進行中嗎（`FE-R12-S10`，design D3）。
   * 排下時不問（React 可能還沒把 prop 換掉）；到點才問，回 false 就放棄這次、不建、不再排 —— 新的 effect 會接手。
   * 沒給就當永遠可以。⚠️ 要身分穩定：它在 effect 的依賴裡。
   */
  canReconnect?: (scene: string) => boolean
  /**
   * 場景聊天的口（`FE-R11`，design D1）：每建一條連線 `attach()` 一次，驗證成功的 `chat` 交給那條連線專屬的 `receive`；
   * 送出由這裡注入 `client.send` —— chat 模組永遠拿不到 client。**prop 不是 context**（在 `<Canvas>` 裡）。沒給就沒有聊天。
   */
  chat?: SceneChatPort
  /**
   * 自己的狀態文字的口（`FE-K05`，design D1）：每條連線 **ready 之後** `attach()` 一次（attach 會重送非空的狀態，沒 ready 送會拋），
   * `id === 自己` 的 `status` 回聲交給 `link.confirm()`（不進名單 —— 自己本來就不在名單裡）。**prop 不是 context**。沒給就沒有狀態。
   */
  status?: StatusPort
  /**
   * 目前 scene 的在線人數變了（`FE-R10`，design D4）。`null` 是「還沒有初始 snapshot」—— 不是 0。
   *
   * ⚠️ **身分要穩定**（例如直接傳 `useState` 的 setter）：它在 effect 的依賴裡，
   * 每次重繪換一個新函式的話，每一次人數變動都會關掉連線重開。
   * ⚠️ **它是 prop 不是 context 的回寫**：人數要送到 `<Canvas>` 外面的 DOM（D4），
   * 資料往外流，而 context 只往內流。
   */
  onOnlineCountChange?: (count: number | null) => void
  /**
   * 名單變了（規格 `name-tag`，design D5）：名字牌是 Canvas 外的 DOM，名單要送出去。
   * 跟 `onOnlineCountChange` 同一條路、同樣的要求：**身分要穩定**（傳 `useState` 的 setter），它在 effect 的依賴裡。
   * 卸載時送空名單 —— 舊場景的牌子跟舊子樹一起消失（`FE-W08-S10`）。
   */
  onRosterChange?: (roster: ReadonlyMap<string, RemoteIdentity>) => void
  /** 名字牌的節點登記，直接交給 `RemotePlayers`（每個角色每幀寫自己那一塊）。 */
  tagNodesRef?: RefObject<NameTagNodes>
}

const monotonicNow = () => performance.now()

export function RemoteWorld({
  poseRef,
  now = monotonicNow,
  generation = 0,
  scene = 'lobby',
  token,
  closeGateRef,
  onConnection,
  canReconnect,
  chat,
  status,
  onOnlineCountChange,
  onRosterChange,
  tagNodesRef,
}: RemoteWorldProps) {
  // **名單進 React**（低頻，決定掛幾個元件）。
  const [roster, setRoster] = useState<ReadonlyMap<string, RemoteIdentity>>(EMPTY_ROSTER)
  // **動態不在 React 裡**（每秒 400 次）。這個容器建立一次就不再換掉，
  // 只被就地改寫 —— 所以它可以當 prop 傳下去而不造成重繪。
  //
  // 用 `useState` 的 lazy initializer 而不是 `useRef`：`react-hooks/refs`
  // 擋掉「在 render 期間讀 ref」（`useRef(...).current` 拿來算 prop 就是那件事），
  // **而那條規則是對的** —— 那樣寫在 concurrent render 下會讀到不該讀的東西。
  // 這裡要的是「建立一次、之後不變」，`useState` 的初始值正好就是那個語意。
  const [state] = useState(createRemotePlayersState)
  // 目前的連線。**client 物件的身分就是 session generation** ——
  // 換 scene 時它被換掉，`PositionSync` 靠比對身分決定要不要重置節流。
  const clientRef = useRef<RealtimeClient | null>(null)
  const motion: ReadonlyMap<string, RemoteMotion> = state.motion
  // 規格 `FE-R06-S02`：同一個身分已經在別的分頁連著時，這裡**不建立連線**。
  // 匿名一律 `true` —— 兩個匿名分頁在世界裡是兩個人（`S01`）。
  const { allowed } = useWorldLease()

  useEffect(() => {
    // 規格 `FE-O14-S07`：即時層的資料來源是 `none` 時
    // **MUST NOT 建立任何 WebSocket 連線**。
    //
    // ⚠️ **早退在最前面，而且不留任何痕跡** —— `none` 是一個正常狀態，
    // 不是錯誤。在這裡 `console.warn` 一行會讓每一個單人預覽的訪客
    // 在 console 看到一則警告，而那會教人忽略警告。
    if (realtimeAdapter() === 'none') return

    // ⚠️ **這個早退要在建立 client 之前，不是在 `connect()` 之前。**
    // 建了再不連的話，`clientRef` 上會掛一個永遠 `idle` 的 client，
    // 而 `PositionSync` 是靠 client 物件的身分判斷 session generation 的
    // —— 那會讓「取得資格之後接手」多一次莫名其妙的重置。
    //
    // 規格 `FE-R06-S02`：「第二個分頁 **MUST NOT 建立 world 連線**」。
    if (!allowed) return

    // 違規通報。**必填** —— `FE-R02` 的契約明文寫著它保證不了呼叫端有沒有在看，
    // 所以這裡要真的接上一個東西，而不是傳一個空函式。
    //
    // ⚠️ **接到 console 是暫時的。** 使用者看得見的呈現是 `FE-X03` 的事；`FE-R12` 做的是斷線重連，
    // 明寫不把協定違規做成可見呈現（demo 範圍外）。那個缺口是知道的，不是忘了。
    const onViolation = (violation: ProtocolViolation, raw: string) => {
      console.warn(`[realtime] 收到不合協定的訊息（${violation}）：`, raw)
    }
    const validate = createMessageValidator(onViolation)

    let cancelled = false
    // 在線人數跟著低頻 Presence view 一起通知（`FE-R10` D4）。status 也會走到這裡但人數沒變 ——
    // **不另外去重**：呼叫端傳的是 `useState` 的 setter，值相同時 React 不會重繪，
    // 在這裡多記一份「上次通知的值」是驗不到的程式碼。
    const reportCount = () => onOnlineCountChange?.(onlineCountOf(state))
    const clearRemote = () => {
      resetRemotePlayers(state)
      setRoster(EMPTY_ROSTER)
      onRosterChange?.(EMPTY_ROSTER)
      reportCount()
    }
    // `FE-R12`（design D1；ADR 0013）：重連迴圈住在這個 effect 裡。`ready` 過的連線意外斷了 → 清鬼影、發 `recovering`、排一次 `open()`；
    // 退避與「一次只有一個」在 `createReconnectSchedule`；沒斷線時它什麼計時器都沒有（`FE-R01-S08` 不變）。
    const retry = createReconnectSchedule()
    // 目前的連線。**每次 `open()` 換一個 client 物件** —— 下游（`PositionSync`、聊天的 link）靠它的身分當 session generation。
    let current: RealtimeClient | null = null
    let detachLinks = () => {}
    // **effect 層級**（不是每條連線）：這個 effect 曾經 ready 過嗎（design D3）。第一條從沒 ready 過就斷 → 交給過場（S08）；
    // ready 過之後，連重連時握手再被拒（那條沒 ready）也繼續重試（S04）—— 迴圈的歸屬看歷史，不看當下這條。
    let everReady = false

    const open = () => {
      // 這條連線在聊天記憶體裡的身分。注入的 sender 只收 `ChatIn`：序列化在這裡、`client.send()` 沒 ready 就拋 `RealtimeError`，不包、不吞。
      let link: ChatLink | null = null
      let statusLink: StatusLink | null = null
      const client = new RealtimeClient({
        scene,
        token,
        onStateChange: (next) => {
          // 不是目前的 client 一律丟（design D1 的第二道防禦；第一道是 client 自己拆 listener）
          if (client !== current) return
          if (next === 'ready') {
            everReady = true
            retry.reset()
            onConnection?.({ kind: 'ready' }, scene)
            // 狀態的口在 ready 之後才接（`FE-K05-S04`）：attach 會把非空的狀態重送到這條新連線
            statusLink ??= status?.attach((input) => client.send(JSON.stringify(input))) ?? null
          }
        },
        onClosed: (info) => {
          // 卸載時 `client.close()` 也會發一次（code 1000、`opened` 看情況）—— 那是自己關的，不是連不上。
          if (cancelled || client !== current) return
          if (!everReady) {
            // 這個 effect 還沒 ready 過（第一次進場、過場中握手被拒、open 了沒 hello）→ 交給過場，不重連（S08）。
            onConnection?.({ kind: 'closed', opened: info.opened }, scene)
            return
          }
          // ready 過的 effect 意外斷了（含重連時握手又被拒）。當下清鬼影（不等新 snapshot，design D2）、人數變未知、通知、排重連（S01／S04）。
          current = null
          clientRef.current = null
          detachLinks()
          clearRemote()
          onConnection?.({ kind: 'recovering' }, scene)
          retry.schedule(() => {
            if (cancelled) return
            // 到點才問「還是我嗎」（`S10`）：過場中、場景換了就放棄，新的 effect 會接手
            if (canReconnect !== undefined && !canReconnect(scene)) return
            open()
          })
        },
        onMessage: (raw) => {
          if (client !== current) return
          const result = validate(raw)
          if (!result.ok) return
          // 聊天只分流 `t === 'chat'`，交的是驗證器產出的那個物件（`FE-R11-S01`）；自己的回聲也交（D2）。
          if (result.message.t === 'chat') link?.receive(result.message)
          // 自己的 `status` 回聲是「目前狀態」的唯一來源（`FE-K05` D2）；別人的照樣進名單（下面的 `applyMessage`）
          if (result.message.t === 'status' && result.message.id === client.selfId) statusLink?.confirm(result.message.text)
          // `selfId` 用來把自己排除在遠端玩家之外 —— `snapshot` 裡包含自己。
          if (applyMessage(state, result.message, client.selfId, now())) {
            // 名單真的變了才重繪。**這是唯一會呼叫 setState 的地方。**
            setRoster(state.roster)
            onRosterChange?.(state.roster)
            reportCount()
          }
        },
      })
      current = client
      clientRef.current = client
      link = chat?.attach((input) => client.send(JSON.stringify(input)), scene) ?? null
      detachLinks = () => {
        link?.detach()
        statusLink?.detach()
        detachLinks = () => {}
      }
      onConnection?.({ kind: 'connecting' }, scene)
      client.connect()
    }
    // 先等上一棵子樹的連線關乾淨（`FE-V01-S18`），再連。閘門是空的（第一次掛載）就立刻連。
    // `cancelled`：等的期間就被卸載（Strict Mode 的第二次 effect、或使用者又換了場景）的話不連 ——
    // 那時 cleanup 已經跑過，再建一條就是第二條連線。
    const gate = closeGateRef?.current ?? null
    if (gate === null) open()
    else
      void gate
        .then(() => {
          if (!cancelled) open()
        })
        // 走到這裡代表上面那個 `cancelled` 的守衛壞了。不吞掉：留一行給人看，測試也靠這一行抓突變。
        .catch((error: unknown) => console.error('[realtime] 換場景後建立連線失敗：', error))

    return () => {
      cancelled = true
      retry.cancel()
      clientRef.current = null
      detachLinks()
      // 等待重連期間卸載：沒有 client 可關，閘門立刻放行
      const acked = current?.close() ?? Promise.resolve()
      // ⚠️ **接在前一個閘門後面，不是蓋掉它。** 連換兩次（A→B→C）時 B 可能還沒等到 A 的 ack 就卸載了：
      // B 自己沒有 socket，`close()` 立刻解決 —— 直接放進去的話 C 會立刻連，A 的 ack 就被跳過了。
      if (closeGateRef) {
        const previous = closeGateRef.current ?? Promise.resolve()
        closeGateRef.current = previous.then(() => acked)
      }
      // 卸載時把所有容器清回初始值 —— 留著的話，重新掛載會先閃出一批舊角色，
      // 或者在新連線的 snapshot 到達之前顯示上一條連線的人數（`FE-R10-S09`）。
      clearRemote()
    }
    // `state` 是 `useState` 的初始值，身分穩定 —— 列進來只是讓
    // exhaustive-deps 不必被關掉，不會造成重新連線。
    //
    // ⚠️ **`now` 也在依賴裡**，所以傳一個 inline 箭頭函式會每次重繪都重連。
    // 正式碼傳的是模組層級的 `monotonicNow`（身分穩定）；
    // 測試要傳假時鐘的話，也要傳一個身分穩定的。
  }, [state, now, allowed, generation, scene, token, closeGateRef, onConnection, canReconnect, chat, status, onOnlineCountChange, onRosterChange])

  return (
    <>
      <RemotePlayers roster={roster} motion={motion} now={now} tagNodesRef={tagNodesRef} />
      <PositionSync clientRef={clientRef} poseRef={poseRef} />
    </>
  )
}
