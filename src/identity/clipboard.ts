// 把金鑰放進剪貼簿。規格 `FE-A06-S08`／`S09`／`S11`。
//
// ⚠️⚠️ **拆成介面不是為了「可替換」，是為了讓「失敗」驗得到。**
//
// 判準要能問「寫入失敗的時候，畫面有沒有假裝成功」——
// 而那需要一個**會失敗**的剪貼簿。真的 `navigator.clipboard` 在 jsdom 裡
// 根本不存在，在真瀏覽器裡又幾乎總是成功。
//
// ⚠️ **注入的是「會成功還是會失敗」，不是一個 `toHaveBeenCalledWith` 的靶子。**
// 斷言「`writeText` 被呼叫了、參數是那把金鑰」是恆真的 ——
// 它只證明「我按了按鈕、我寫的程式呼叫了我寫的替身」，
// 而**真正要問的是「使用者得到的資訊符不符合實際發生的事」**。
// 兩個審查者對這件事的說法一致（本 change 的 design D4）。
//
// **真的剪貼簿由端到端驗**：授權過的 Chromium、按下複製、
// 再由測試自己讀回來比對（`S11`）。那一條 MUST NOT 用替身。

export interface ClipboardPort {
  /** 寫進剪貼簿。**失敗要 reject，不要吞掉。** */
  write(text: string): Promise<void>
}

/**
 * 瀏覽器的剪貼簿。
 *
 * ⚠️ **`navigator.clipboard` 有三種不在的方式**，而它們的處置一樣：
 * 非安全來源（http 而且不是 localhost）、使用者拒絕授權、舊瀏覽器。
 * 三種都 reject，讓呼叫端走同一條降級路徑。
 *
 * **不在這裡 try/catch 吞掉** —— 吞掉的話「寫入失敗」跟「寫入成功」
 * 在呼叫端長得一樣，而那正是 `S09` 要擋的事。
 */
export function browserClipboard(): ClipboardPort {
  return {
    async write(text) {
      const clipboard = globalThis.navigator?.clipboard
      if (clipboard === undefined) {
        throw new Error('這個瀏覽器（或這個連線）不允許自動複製。')
      }
      await clipboard.writeText(text)
    },
  }
}
