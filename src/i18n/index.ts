// HAI NGÔN NGỮ: tiếng Việt là GỐC — chuỗi giao diện viết thẳng tiếng Việt trong code, bọc `t()`; tiếng Anh tra
// bảng `en/*.ts` theo đúng chuỗi gốc (thiếu bản dịch ⇒ hiện tiếng Việt; `npm test` báo chuỗi thiếu).
// Chọn ngôn ngữ ở nút VI/EN cạnh Login, nhớ trên máy (không theo tài khoản). Đổi ngôn ngữ ⇒ App dựng lại
// toàn bộ (key = ngôn ngữ) nên `t()` gọi ở đâu lúc vẽ cũng đúng — chỉ đừng gọi `t()` ở cấp module (chạy một lần).
//   t('Thêm hàng vào {name}', { name })   chữ giao diện — có trong bảng dịch
//   tx(label)                             chữ do DỮ LIỆU MẪU / THUẬT TOÁN sinh (tên mã, xe, đơn mẫu; nhãn pallet
//                                         gộp; cảnh báo) — tra bảng tên rồi luật mẫu; dữ liệu người dùng giữ nguyên
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { EN, EN_NAMES, EN_RULES } from './en'

export type Lang = 'vi' | 'en'

const memory = new Map<string, string>()
const safeStorage: StateStorage = {
  getItem: k => { try { return localStorage.getItem(k) } catch { return memory.get(k) ?? null } },
  setItem: (k, v) => { try { localStorage.setItem(k, v) } catch { memory.set(k, v) } },
  removeItem: k => { try { localStorage.removeItem(k) } catch { memory.delete(k) } },
}

// Mặc định TIẾNG ANH (chủ dự án 28/10); người dùng bấm nút cạnh Login để sang tiếng Việt
export const useLang = create<{ lang: Lang; setLang: (lang: Lang) => void }>()(persist(
  set => ({ lang: 'en', setLang: lang => set({ lang }) }),
  { name: 'malcargo-lang-v1', storage: createJSONStorage(() => safeStorage) },
))

export const getLang = (): Lang => useLang.getState().lang
/** Locale định dạng số: 12.345,6 (vi) · 12,345.6 (en) */
export const numLocale = () => (getLang() === 'en' ? 'en-US' : 'vi-VN')

type Vars = Record<string, string | number>
// `{n}` = giá trị; `{n:carton|cartons}` = số ít khi n === 1, còn lại số nhiều (chỉ cần cho tiếng Anh)
const fill = (s: string, vars?: Vars) => (vars
  ? s.replace(/\{(\w+):([^|}]*)\|([^}]*)\}/g, (m, k: string, one: string, many: string) => (k in vars ? (Number(vars[k]) === 1 ? one : many) : m))
    .replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
  : s)

/** Chữ giao diện. `vi` = chuỗi gốc tiếng Việt (cũng là khoá tra bảng dịch); `{tên}` thay bằng `vars`. */
export function t(vi: string, vars?: Vars): string {
  if (getLang() === 'vi') return fill(vi, vars)
  return fill(EN[vi] ?? vi, vars)
}

/** Chữ do dữ liệu mẫu / thuật toán sinh: tên mẫu (bảng tên) → luật mẫu (nhãn ghép, cảnh báo) → giữ nguyên. */
export function tx(s: string): string {
  if (getLang() === 'vi' || !s) return s
  const hit = EN_NAMES[s] ?? EN[s]
  if (hit != null) return hit
  for (const [re, f] of EN_RULES) {
    const m = s.match(re)
    if (m) return f(m, tx)
  }
  return s
}
