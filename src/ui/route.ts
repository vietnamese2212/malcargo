// Điều hướng bằng hash (#/trip/abc) — chạy được trên mọi máy chủ tĩnh và trong app cài đặt.
import { useEffect, useRef, useState } from 'react'

export type Route =
  | { page: 'trips' } | { page: 'trip'; id: string }
  | { page: 'orders' } | { page: 'order'; id: string; back?: string }
  | { page: 'items' } | { page: 'vehicles' } | { page: 'account' }

export function parse(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  const parts = path.split('/').filter(Boolean)
  const q = new URLSearchParams(query)
  switch (parts[0]) {
    case 'trip': return parts[1] ? { page: 'trip', id: parts[1] } : { page: 'trips' }
    case 'orders': return { page: 'orders' }
    case 'order': return parts[1] ? { page: 'order', id: parts[1], back: q.get('back') ?? undefined } : { page: 'orders' }
    case 'items': return { page: 'items' }
    case 'vehicles': return { page: 'vehicles' }
    case 'account': return { page: 'account' }
    default: return { page: 'trips' }
  }
}

export function href(r: Route): string {
  switch (r.page) {
    case 'trip': return `#/trip/${r.id}`
    case 'order': return `#/order/${r.id}${r.back ? `?back=${encodeURIComponent(r.back)}` : ''}`
    default: return `#/${r.page}`
  }
}

export const go = (r: Route) => { window.location.hash = href(r) }

/** Đổi địa chỉ tại chỗ (thay, không thêm vào lịch sử, không cuộn lên đầu) — dùng khi chuyến mẫu vừa tách thành chuyến mới. */
export const replaceRoute = (r: Route) => {
  // đang mở tấm / tấm vừa đóng mà lần lùi chưa chạy xong (lùi là bất đồng bộ — Lưu ở tấm sửa mã vừa tách chuyến vừa đóng
  // tấm): các mục lịch sử bên dưới còn địa chỉ cũ ⇒ lùi về chúng thì sửa địa chỉ lại (xem popstate dưới)
  if (overlays.length || ownBack) pendingHash = href(r)
  history.replaceState(history.state, '', href(r))
  window.dispatchEvent(new Event('malcargo:route'))
}

// ── Nút Back (Android / trình duyệt) đóng tấm / bảng / hộp hỏi đang mở TRÊN CÙNG, không rời màn (thử 31/10: đang mở danh
//    mục mà bấm Back ⇒ thoát hẳn app — trong app cài (APK) mở thẳng thì lịch sử chỉ có một mục). Mỗi tấm mở đẩy một mục lịch
//    sử CÙNG địa chỉ; Back ⇒ đóng tấm trên cùng; đóng bằng nút / Esc ⇒ app tự lùi đúng mục đó.
const overlays: { close: () => void }[] = []
let ownBack = 0                        // lần lùi do chính app gọi (đóng tấm bằng nút) — popstate của nó bỏ qua
let pendingHash: string | null = null  // địa chỉ đã đổi tại chỗ lúc đang mở tấm
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (pendingHash && window.location.hash !== pendingHash) history.replaceState(history.state, '', pendingHash)
    if (ownBack) ownBack--
    else overlays.pop()?.close()
    if (!overlays.length && !ownBack) pendingHash = null
  })
}

/** Gắn vào tấm / bảng phủ: `open` ⇒ Back của máy đóng nó (gọi `onClose`). */
export function useBackClose(open: boolean, onClose: () => void) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    const me = { close: () => close.current() }
    overlays.push(me)
    history.pushState({ overlay: true }, '')
    return () => {
      const i = overlays.indexOf(me)
      if (i < 0) return   // đã đóng bằng Back — mục lịch sử đã lùi rồi
      overlays.splice(i, 1)
      // đang đứng ở mục của tấm (không phải vừa chuyển sang màn khác từ trong tấm) ⇒ lùi bỏ mục đó
      if (history.state?.overlay) { ownBack++; history.back() }
    }
  }, [open])
}

export function useRoute(): Route {
  const [r, setR] = useState(() => parse(window.location.hash))
  useEffect(() => {
    const on = () => { setR(parse(window.location.hash)); window.scrollTo(0, 0) }
    const quiet = () => setR(parse(window.location.hash))
    window.addEventListener('hashchange', on)
    window.addEventListener('malcargo:route', quiet)
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('malcargo:route', quiet) }
  }, [])
  return r
}
