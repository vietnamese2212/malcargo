// Bước B — tài khoản Google + máy chủ Supabase RIÊNG của MalCargo (không dùng DB của SUPPLYC).
//  · Mẫu chung (xe, mã hàng) nằm ở bảng `catalog`: ai cũng đọc, chỉ admin ghi (RLS, xem supabase/schema.sql).
//  · Dữ liệu riêng: một bản JSON / người ở bảng `user_data` (RLS theo auth.uid()).
//    Đăng nhập ⇒ dữ liệu trên máy GỘP vào tài khoản; sau đó mỗi thay đổi tự đẩy lên, mở lại tab thì kéo bản mới về.
// Chưa khai VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ⇒ app chạy như bước A: chỉ lưu trên máy, mẫu chung lấy từ catalog.ts.
import { create } from 'zustand'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Item, Vehicle } from './types'
import { exportBackup, mergeBackup, parseBackup, useCatalog, useData, type BackupData } from './store'

const URL_ = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const cloudEnabled = !!(URL_ && KEY)

let client: Promise<SupabaseClient> | null = null
// supabase-js tải riêng, chỉ khi đã bật máy chủ — gói chính không nặng thêm
const sb = () => (client ??= import('@supabase/supabase-js').then(m =>
  m.createClient(URL_!, KEY!, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true } })))

export interface Account { id: string; email: string; name: string; avatar: string | null }
export type SyncState = 'idle' | 'saving' | 'saved' | 'error'
interface AuthState { status: 'off' | 'loading' | 'out' | 'in'; user: Account | null; isAdmin: boolean; sync: SyncState }
export const useAuth = create<AuthState>(() => ({ status: cloudEnabled ? 'loading' : 'off', user: null, isAdmin: false, sync: 'idle' }))

export async function signInGoogle() {
  const c = await sb()
  // về đúng trang gốc (không kèm #/…): mã đăng nhập trả về ở ?code=, không đụng định tuyến bằng dấu #
  await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } })
}
export async function signOut() {
  const c = await sb()
  await c.auth.signOut()
}

// ── Mẫu chung ────────────────────────────────────────────────────────────────
const CATALOG_CACHE = 'malcargo-catalog-v1'
type CatalogRow = { id: string; kind: 'item' | 'vehicle'; data: Item | Vehicle; sort: number }

function applyCatalog(rows: CatalogRow[]) {
  const items = rows.filter(r => r.kind === 'item').map(r => ({ ...(r.data as Item), updatedAt: (r.data as Item).updatedAt ?? 0, id: r.id, owner: 'admin' as const }))
  const vehicles = rows.filter(r => r.kind === 'vehicle').map(r => ({ ...(r.data as Vehicle), updatedAt: (r.data as Vehicle).updatedAt ?? 0, id: r.id, owner: 'admin' as const }))
  useCatalog.setState({ items, vehicles })
}

async function loadCatalog() {
  try { const c = localStorage.getItem(CATALOG_CACHE); if (c) applyCatalog(JSON.parse(c)) } catch { /* bộ nhớ bị chặn: dùng mặc định */ }
  const c = await sb()
  const { data, error } = await c.from('catalog').select('id, kind, data, sort').order('sort')
  // bảng trống (chưa nạp mẫu) ⇒ giữ mẫu mặc định, không xoá sạch danh mục của mọi người
  if (error || !data?.length) return
  applyCatalog(data as CatalogRow[])
  try { localStorage.setItem(CATALOG_CACHE, JSON.stringify(data)) } catch { /* bỏ qua */ }
}

/** Admin lưu một mẫu chung (thêm mới hoặc sửa). Trả về câu lỗi nếu không lưu được. */
export async function saveCatalog(kind: 'item' | 'vehicle', x: Item | Vehicle): Promise<string | null> {
  const c = await sb()
  const cur = useCatalog.getState()
  const list: (Item | Vehicle)[] = kind === 'item' ? cur.items : cur.vehicles
  const idx = list.findIndex(y => y.id === x.id)
  const data = { ...x, owner: 'admin' as const, updatedAt: Date.now() }
  const { error } = await c.from('catalog').upsert({ id: x.id, kind, data, sort: idx >= 0 ? idx : list.length, updated_at: new Date().toISOString() })
  if (error) return error.message
  const next = idx >= 0 ? list.map(y => (y.id === x.id ? data : y)) : [...list, data]
  useCatalog.setState(kind === 'item' ? { items: next as Item[] } : { vehicles: next as Vehicle[] })
  return null
}
export async function removeCatalog(kind: 'item' | 'vehicle', id: string): Promise<string | null> {
  const c = await sb()
  const { error } = await c.from('catalog').delete().eq('id', id)
  if (error) return error.message
  const cur = useCatalog.getState()
  useCatalog.setState(kind === 'item' ? { items: cur.items.filter(x => x.id !== id) } : { vehicles: cur.vehicles.filter(x => x.id !== id) })
  return null
}

// ── Dữ liệu riêng của người dùng ─────────────────────────────────────────────
let uid: string | null = null
let applying = false            // đang thay bằng bản từ máy chủ ⇒ đừng đẩy ngược lên
let lastSeen = ''               // updated_at của bản trên máy chủ mà máy này đã có
let pushTimer: ReturnType<typeof setTimeout> | undefined

async function push() {
  if (!uid) return
  useAuth.setState({ sync: 'saving' })
  const c = await sb()
  const at = new Date().toISOString()
  const { error } = await c.from('user_data').upsert({ user_id: uid, data: exportBackup(), updated_at: at })
  if (error) { useAuth.setState({ sync: 'error' }); return }
  lastSeen = at
  useAuth.setState({ sync: 'saved' })
}

function replaceFromRemote(d: BackupData) {
  applying = true
  useData.getState().replaceAll(d)
  applying = false
}

async function pull(first: boolean) {
  if (!uid) return
  const c = await sb()
  const { data, error } = await c.from('user_data').select('data, updated_at').eq('user_id', uid).maybeSingle()
  if (error) { useAuth.setState({ sync: 'error' }); return }
  const remote = data ? parseBackup(JSON.stringify(data.data)) : null
  if (first) {
    // lần đầu trên máy này: gộp dữ liệu đang có trên máy vào tài khoản rồi đẩy lên
    replaceFromRemote(remote && typeof remote !== 'string' ? mergeBackup(exportBackup(), remote) : exportBackup())
    await push()
  } else if (data && remote && typeof remote !== 'string' && data.updated_at !== lastSeen) {
    lastSeen = data.updated_at
    replaceFromRemote(remote)
  }
}

async function onSignedIn(u: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
  if (uid === u.id) return
  uid = u.id
  const md = u.user_metadata ?? {}
  useAuth.setState({
    status: 'in',
    user: { id: u.id, email: u.email ?? '', name: String(md.full_name ?? md.name ?? u.email ?? ''), avatar: (md.avatar_url as string) ?? null },
  })
  const c = await sb()
  const { data } = await c.rpc('is_admin')
  useAuth.setState({ isAdmin: data === true })
  await pull(true)
}

let started = false
export function initCloud() {
  if (!cloudEnabled || started) return
  started = true
  loadCatalog().catch(() => { /* mất mạng: dùng bản đã có */ })
  sb().then(async c => {
    c.auth.onAuthStateChange((_e, session) => {
      // chạy ngoài callback: supabase-js khuyên không gọi API khác ngay trong đây
      setTimeout(() => {
        if (session?.user) onSignedIn(session.user).catch(() => useAuth.setState({ sync: 'error' }))
        else { uid = null; useAuth.setState({ status: 'out', user: null, isAdmin: false, sync: 'idle' }) }
      })
    })
    // đợi đổi xong mã đăng nhập rồi mới dọn ?code=… khỏi thanh địa chỉ
    await c.auth.getSession()
    if (location.search.includes('code=')) history.replaceState(null, '', location.pathname + location.hash)
  })
  useData.subscribe(() => {
    if (!uid || applying) return
    clearTimeout(pushTimer)
    pushTimer = setTimeout(() => { pushTimer = undefined; push().catch(() => useAuth.setState({ sync: 'error' })) }, 1200)
  })
  // quay lại tab (có thể đã sửa trên máy khác) ⇒ kéo bản mới về — trừ khi máy này còn thay đổi chưa đẩy
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !pushTimer && useAuth.getState().sync !== 'saving') pull(false).catch(() => {})
  })
}
