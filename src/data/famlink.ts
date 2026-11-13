// LINK FAMILY (…/f/<mã>, chủ dự án 13/11): chủ / quản lý chia sẻ link ⇒ người ngoài mở ra thấy tên Family, Family MỞ thì
// xem được đơn hàng (chỉ xem), và bấm "Xin vào" (cần đăng nhập) ⇒ chủ / quản lý duyệt. Tấm hiện ở `ui/FamilyGate.tsx`.
import { create } from 'zustand'

export const useFamilyInbox = create<{ code: string | null }>(() => ({ code: null }))
const LINK = /^\/f\/([A-Za-z0-9_-]{6,40})\/?$/
const KEEP = 'malcargo-famlink-v1'

/** Mở app bằng link Family ⇒ ghi nhận mã, địa chỉ về trang gốc. Vừa đăng nhập Google từ tấm xin vào ⇒ mở lại tấm đó
 *  (đăng nhập quay về trang gốc, mất đường dẫn /f/…). */
export function catchFamilyLink() {
  const m = LINK.exec(location.pathname)
  if (m) {
    useFamilyInbox.setState({ code: m[1] })
    history.replaceState(history.state, '', '/' + location.search + location.hash)
    return
  }
  try {
    const c = sessionStorage.getItem(KEEP)
    if (c) { sessionStorage.removeItem(KEEP); useFamilyInbox.setState({ code: c }) }
  } catch { /* bộ nhớ bị chặn */ }
}
/** Sắp đi đăng nhập Google từ tấm xin vào: nhớ mã để quay về mở lại. */
export const keepFamilyLink = (code: string) => { try { sessionStorage.setItem(KEEP, code) } catch { /* bỏ qua */ } }
export const familyUrl = (code: string) => `${location.origin}/f/${code}`
