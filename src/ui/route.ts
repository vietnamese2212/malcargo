// Điều hướng bằng hash (#/trip/abc) — chạy được trên mọi máy chủ tĩnh và trong app cài đặt.
import { useEffect, useState } from 'react'

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
  history.replaceState(null, '', href(r))
  window.dispatchEvent(new Event('malcargo:route'))
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
