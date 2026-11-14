// Lỗi của app trên máy người dùng: gửi về máy chủ (`log_error` — chỉ câu lỗi, chỗ lỗi trong code, bản app, trình duyệt, màn đang mở;
// KHÔNG dữ liệu người dùng nhập) để biết mà sửa; bản mới vừa lên mà trang còn chạy bản cũ ⇒ tải lại MỘT lần thay vì hỏng.
import { sendError } from '../data/cloud'

const seen = new Set<string>()
// không phải lỗi của app: mất mạng, trình duyệt tự huỷ, cảnh báo vô hại của ResizeObserver
const NOISE = /ResizeObserver loop|^Failed to fetch$|NetworkError|Load failed|AbortError|aborted|^Script error\.?$/i
const CHUNK = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i
const msgOf = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : String((e as { message?: unknown })?.message ?? e ?? ''))

/** Màn đang mở, bỏ mã chuyến / đơn: "#/trip". */
const pageOf = () => location.hash.split('?')[0].split('/').slice(0, 2).join('/') || '#/'

export function report(e: unknown, where?: string) {
  const m = msgOf(e)
  if (!m || NOISE.test(m)) return
  const msg = `${where ? where + ': ' : ''}${e instanceof Error && e.name !== 'Error' ? e.name + ': ' : ''}${m}`.slice(0, 500)
  if (seen.has(msg) || seen.size >= 10) return   // mỗi lỗi một lần / phiên, tối đa 10
  seen.add(msg)
  void sendError({ msg, stack: e instanceof Error ? e.stack?.slice(0, 4000) : undefined, page: pageOf() })
}

/** File chia nhỏ của bản cũ không còn trên máy chủ (vừa lên bản mới) ⇒ tải lại trang, tối đa một lần / phút. */
export function reloadForNewVersion(e: unknown): boolean {
  if (!CHUNK.test(msgOf(e))) return false
  try {
    const k = 'malcargo-reloaded', last = Number(sessionStorage.getItem(k) ?? 0)
    if (Date.now() - last < 60000) return false
    sessionStorage.setItem(k, String(Date.now()))
  } catch { return false }
  location.reload()
  return true
}

export function watchErrors() {
  window.addEventListener('error', e => { const x = e.error ?? e.message; if (!reloadForNewVersion(x)) report(x) })
  window.addEventListener('unhandledrejection', e => { if (!reloadForNewVersion(e.reason)) report(e.reason) })
  window.addEventListener('vite:preloadError', e => { if (reloadForNewVersion((e as Event & { payload?: unknown }).payload ?? 'Unable to preload CSS')) e.preventDefault() })
}
