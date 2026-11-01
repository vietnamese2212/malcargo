// Bước B — tài khoản Google + máy chủ Supabase RIÊNG của MalCargo (không dùng DB của SUPPLYC).
//  · Mẫu chung (xe, mã hàng) nằm ở bảng `catalog`: ai cũng đọc, chỉ admin ghi (RLS, xem supabase/schema.sql).
//  · Dữ liệu riêng: một bản JSON / người ở bảng `user_data` (RLS theo auth.uid()); Family: một bản JSON / nhóm ở `family_data`.
//    Đăng nhập ⇒ dữ liệu trên máy GỘP vào tài khoản; sau đó mỗi thay đổi tự đẩy lên, quay lại tab / mỗi 20 giây thì kéo bản mới về.
// Chưa khai VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ⇒ app chạy như bước A: chỉ lưu trên máy, mẫu chung lấy từ catalog.ts.
import { create } from 'zustand'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Item, Vehicle } from './types'
import {
  catalogLocked, dropSpace, exportBackup, mergeBackup, myCatalog, openSpace, parseBackup, useCatalog, useData, useSpace, type BackupData,
} from './store'
import { cleanPack, type SharePack } from './share'
import { t } from '../i18n'
import { replaceRoute } from '../ui/route'

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

// ── Bộ dữ liệu đang mở ("Của tôi" = bảng `user_data`, Family = `family_data`) đồng bộ với máy chủ ─────────────
// Ghi kèm SỐ PHIÊN BẢN đã đọc: người / máy khác vừa ghi trước ⇒ máy chủ trả "không khớp" ⇒ kéo bản mới về, gộp từng bản ghi
// (sửa sau thắng, dấu đã xoá giữ nguyên tác dụng) rồi ghi lại — nhiều người cùng làm một Family không đè mất của nhau.
let uid: string | null = null
let version: number | null = null   // phiên bản trên máy chủ của bộ đang mở mà máy này đang cầm (null = chưa có / chưa biết)
let applying = false                // đang thay bằng bản từ máy chủ / đang đổi bộ ⇒ đừng đẩy ngược lên
let pushTimer: ReturnType<typeof setTimeout> | undefined
let saving: Promise<void> = Promise.resolve()

// bộ còn thay đổi chưa đẩy lên (mất mạng, đóng app giữa chừng) — mở lại thì gộp lên trước, không lấy bản máy chủ đè
const DIRTY = 'malcargo-dirty-v1'
const dirtyList = (): string[] => { try { return JSON.parse(localStorage.getItem(DIRTY) ?? '[]') } catch { return [] } }
const isDirty = (id: string) => dirtyList().includes(id)
const setDirty = (id: string, on: boolean) => {
  const l = dirtyList().filter(x => x !== id)
  try { localStorage.setItem(DIRTY, JSON.stringify(on ? [...l, id] : l)) } catch { /* bỏ qua */ }
}

type Remote = { ok: boolean; data: BackupData | null; version: number | null }
async function fetchRemote(withData = true): Promise<Remote> {
  const c = await sb(), sp = useSpace.getState().id
  const cols = withData ? 'data, version' : 'version'
  const { data, error } = sp === 'me'
    ? await c.from('user_data').select(cols).eq('user_id', uid!).maybeSingle()
    : await c.from('family_data').select(cols).eq('family_id', sp).maybeSingle()
  if (error) return { ok: false, data: null, version: null }
  const row = data as { data?: unknown; version: number } | null
  const parsed = row?.data ? parseBackup(JSON.stringify(row.data)) : null
  return { ok: true, data: parsed && typeof parsed !== 'string' ? parsed : null, version: row?.version ?? null }
}

async function saveRemote(d: BackupData): Promise<number | null> {
  const c = await sb(), sp = useSpace.getState().id
  const { data, error } = sp === 'me'
    ? await c.rpc('user_save', { p_data: d, p_version: version })
    : await c.rpc('family_save', { p_family: sp, p_data: d, p_version: version })
  if (error) throw error
  return data as number | null
}

/** Gộp bản trên máy chủ với bản trên máy (bản ghi: sửa sau thắng; cỡ pallet: của máy này). Thành viên Family không sửa
 *  được danh mục ⇒ lấy nguyên mã hàng, xe, cỡ pallet trên máy chủ (máy chủ cũng bỏ phần đó khi thành viên ghi). */
function withLocal(remote: BackupData): BackupData {
  const m = mergeBackup(remote, exportBackup())
  return catalogLocked() ? { ...m, items: remote.items, vehicles: remote.vehicles, pallet: remote.pallet } : m
}

function replaceFromRemote(d: BackupData) {
  applying = true
  useData.getState().replaceAll(d)
  applying = false
}

/** Đẩy bộ đang mở lên (xếp hàng sau lần đẩy trước). Không khớp phiên bản ⇒ kéo về, gộp, ghi lại (≤ 4 lần). */
function push(): Promise<void> {
  saving = saving.then(async () => {
    if (!uid) return
    const sp = useSpace.getState().id
    useAuth.setState({ sync: 'saving' })
    for (let i = 0; i < 4; i++) {
      const v = await saveRemote(exportBackup())
      if (useSpace.getState().id !== sp) return   // đổi sang bộ khác giữa chừng
      if (v != null) {
        version = v
        if (!pushTimer) setDirty(sp, false)
        useAuth.setState({ sync: 'saved' })
        return
      }
      const r = await fetchRemote()
      if (!r.ok || useSpace.getState().id !== sp) break
      if (r.data) replaceFromRemote(withLocal(r.data))
      version = r.version
    }
    useAuth.setState({ sync: 'error' })
  }).catch(() => { useAuth.setState({ sync: 'error' }) })
  return saving
}

/** `first`: vừa đăng nhập / vừa mở bộ này. "Của tôi" ⇒ gộp dữ liệu trên máy vào tài khoản rồi đẩy lên (như trước); Family ⇒
 *  máy này còn thay đổi chưa đẩy thì gộp + đẩy, không thì lấy bản máy chủ. Lần sau: máy chủ có bản mới thì lấy về. */
async function pull(first: boolean) {
  if (!uid) return
  const sp = useSpace.getState().id
  const r = await fetchRemote()
  if (useSpace.getState().id !== sp) return
  if (!r.ok) { useAuth.setState({ sync: 'error' }); return }
  if (first) {
    version = r.version
    if (sp !== 'me' && !r.data) return
    if (sp !== 'me' && !isDirty(sp)) { replaceFromRemote(r.data!); return }
    if (r.data) replaceFromRemote(sp === 'me' ? mergeBackup(exportBackup(), r.data) : withLocal(r.data))
    await push()
  } else if (r.data && r.version !== version && !pushTimer && !isDirty(sp)) {
    version = r.version
    replaceFromRemote(r.data)
  }
}

/** Hỏi nhẹ (chỉ số phiên bản) xem người khác vừa sửa chưa — có thì kéo bản mới về. */
async function check() {
  if (!uid || pushTimer || document.visibilityState !== 'visible' || useAuth.getState().sync === 'saving') return
  const r = await fetchRemote(false)
  if (r.ok && r.version !== version) await pull(false)
}

/** Đang ở màn một chuyến của bộ cũ ⇒ sang chuyến sửa gần nhất của bộ mới, tại chỗ (tấm / bảng đang mở vẫn giữ — App giữ
 *  màn chuyến khi bộ dữ liệu vừa đổi). */
function jumpToLatest() {
  if (!location.hash.startsWith('#/trip/')) return
  const latest = [...useData.getState().trips].sort((a, b) => b.updatedAt - a.updatedAt)[0]
  if (latest) replaceRoute({ page: 'trip', id: latest.id })
}

/** Mở bộ dữ liệu khác: "me" hoặc id một Family đang tham gia. Đẩy nốt thay đổi của bộ đang mở trước. */
export async function switchSpace(id: string) {
  if (id === useSpace.getState().id) return
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = undefined; void push() }
  await saving
  const f = useFamily.getState().families.find(x => x.id === id)
  applying = true
  try { await openSpace({ id, name: f?.name ?? null, role: f?.role ?? null }) } finally { applying = false }
  jumpToLatest()
  version = null
  if (uid) await pull(true)
}

// ── FAMILY: chủ tạo, mời bằng email; cả nhóm dùng chung một bộ dữ liệu (chủ giữ mã hàng, xe, cỡ pallet) ─────────────
export interface Family { id: string; name: string; role: 'owner' | 'member'; discountCode: string | null; paidUntil: string | null }
export interface Member { email: string; name: string | null; role: 'owner' | 'member'; status: 'invited' | 'active' }
export interface Invite { familyId: string; name: string; owner: string }
export interface Fee { price: number; people: number; code: string | null; percent: number; paidUntil: string | null }
export interface Code { code: string; percent: number; active: boolean; featured: boolean }
interface FamilyState {
  loaded: boolean; families: Family[]; invites: Invite[]; members: Record<string, Member[]>; fees: Record<string, Fee>
  price: number; codes: Code[]   // giá / người / tháng + mã giảm giá (người thường chỉ thấy mã công khai; admin thấy hết)
}
export const useFamily = create<FamilyState>(() => ({ loaded: false, families: [], invites: [], members: {}, fees: {}, price: 0, codes: [] }))

const ERR: Record<string, string> = {
  already_owner: 'Bạn đã làm chủ một Family.', // i18n-key
  bad_code: 'Mã giảm giá không đúng hoặc đã ngừng.', // i18n-key
  payment_required: 'Còn phí tháng phải trả nên chưa thêm người được — nhập mã giảm giá hoặc liên hệ MAL.', // i18n-key
  bad_email: 'Email không hợp lệ.', // i18n-key
  already_member: 'Email này đã có trong Family.', // i18n-key
  not_owner: 'Chỉ chủ Family làm được việc này.', // i18n-key
  no_invite: 'Lời mời không còn.', // i18n-key
}
/** Chạy một hàm của máy chủ; trả câu lỗi (theo ngôn ngữ) hoặc null. */
async function call(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: string | null }> {
  const c = await sb()
  const { data, error } = await c.rpc(fn, args)
  return { data, error: error ? t(ERR[error.message] ?? error.message) : null }
}

export async function loadPricing() {
  const c = await sb()
  const [{ data: s }, { data: codes }] = await Promise.all([
    c.from('app_settings').select('value').eq('key', 'family_price_vnd').maybeSingle(),
    c.from('discount_codes').select('code, percent, active, featured').order('created_at'),
  ])
  useFamily.setState({ price: Number(s?.value ?? 0) || 0, codes: (codes ?? []) as Code[] })
}

/** Family đang tham gia + lời mời đang chờ + thành viên + phí. */
export async function loadFamilies() {
  const me = useAuth.getState().user?.email.toLowerCase()
  if (!uid || !me) { useFamily.setState({ loaded: true, families: [], invites: [], members: {}, fees: {} }); return }
  const c = await sb()
  const [{ data: fs, error }, { data: ms }] = await Promise.all([
    c.from('families').select('id, name, discount_code, paid_until, created_at').order('created_at'),
    c.from('family_members').select('family_id, email, name, role, status, invited_at').order('invited_at'),
  ])
  if (error) return
  const rows = (ms ?? []) as (Member & { family_id: string })[]
  const families: Family[] = [], invites: Invite[] = [], members: Record<string, Member[]> = {}
  for (const f of (fs ?? []) as { id: string; name: string; discount_code: string | null; paid_until: string | null }[]) {
    const mine = rows.find(m => m.family_id === f.id && m.email === me)
    const list = rows.filter(m => m.family_id === f.id)
    if (mine?.status === 'active') { families.push({ id: f.id, name: f.name, role: mine.role, discountCode: f.discount_code, paidUntil: f.paid_until }); members[f.id] = list }
    else if (mine) { const o = list.find(m => m.role === 'owner'); invites.push({ familyId: f.id, name: f.name, owner: o?.name || o?.email || '' }) }
  }
  families.sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0))
  const fees: Record<string, Fee> = {}
  await Promise.all(families.map(async f => {
    const { data } = await c.rpc('family_fee', { p_family: f.id })
    const x = data as { price: number; people: number; code: string | null; percent: number; paid_until: string | null } | null
    if (x) fees[f.id] = { price: Number(x.price), people: x.people, code: x.code, percent: x.percent, paidUntil: x.paid_until }
  }))
  useFamily.setState({ loaded: true, families, invites, members, fees })
  // bộ đang mở là một Family không còn tham gia (rời / bị bỏ / Family đã xoá) ⇒ về "Của tôi", bỏ bản lưu trên máy
  const sp = useSpace.getState()
  if (sp.id !== 'me') {
    const f = families.find(x => x.id === sp.id)
    if (!f) { await switchSpace('me'); dropSpace(sp.id) }
    else if (f.name !== sp.name || f.role !== sp.role) useSpace.setState({ ...sp, name: f.name, role: f.role })
  }
}

/** Tạo Family (chép mã hàng, xe, cỡ pallet của tôi sang nếu chọn) rồi mở luôn bộ dữ liệu Family. */
export async function createFamily(name: string, copyMine: boolean, code: string): Promise<string | null> {
  const cat = copyMine ? myCatalog() : { items: [], vehicles: [], pallet: useData.getState().pallet }
  const data: BackupData = { app: 'malcargo', version: 1, ...cat, orders: [], trips: [], deleted: {} }
  const r = await call('family_create', { p_name: name.trim(), p_data: data, p_code: code.trim() || null })
  if (r.error) return r.error
  await loadFamilies()
  await switchSpace(r.data as string)
  return null
}
export async function renameFamily(id: string, name: string) { const r = await call('family_rename', { p_family: id, p_name: name.trim() }); await loadFamilies(); return r.error }
export async function inviteMember(id: string, email: string) { const r = await call('family_invite', { p_family: id, p_email: email }); await loadFamilies(); return r.error }
export async function removeMember(id: string, email: string) { const r = await call('family_remove', { p_family: id, p_email: email }); await loadFamilies(); return r.error }
export async function applyCode(id: string, code: string) { const r = await call('family_apply_code', { p_family: id, p_code: code }); await loadFamilies(); return r.error }
export async function acceptInvite(id: string): Promise<string | null> {
  const r = await call('family_accept', { p_family: id })
  if (r.error) return r.error
  await loadFamilies()
  await switchSpace(id)
  return null
}
export async function declineInvite(id: string) { const r = await call('family_decline', { p_family: id }); await loadFamilies(); return r.error }
export async function leaveFamily(id: string) { const r = await call('family_leave', { p_family: id }); await loadFamilies(); return r.error }
export async function deleteFamily(id: string) { const r = await call('family_delete', { p_family: id }); await loadFamilies(); return r.error }

/** Admin: giá mỗi người / tháng (đồng) + mã giảm giá. */
export async function adminSetPrice(vnd: number): Promise<string | null> {
  const c = await sb()
  const { error } = await c.from('app_settings').upsert({ key: 'family_price_vnd', value: vnd, updated_at: new Date().toISOString() })
  await loadPricing(); await loadFamilies()
  return error?.message ?? null
}
export async function adminSaveCode(x: Code): Promise<string | null> {
  const c = await sb()
  const { error } = await c.from('discount_codes').upsert({ ...x, code: x.code.trim().toUpperCase() })
  await loadPricing(); await loadFamilies()
  return error?.message ?? null
}
export async function adminDeleteCode(code: string): Promise<string | null> {
  const c = await sb()
  const { error } = await c.from('discount_codes').delete().eq('code', code)
  await loadPricing(); await loadFamilies()
  return error?.message ?? null
}

// ── CHIA SẺ CHUYẾN (share.ts): người đăng nhập đưa bản chụp lên ⇒ mã link; ai có mã cũng đọc được (không cần đăng nhập) ─
const SHARE_ERR: Record<string, string> = {
  not_signed_in: 'Cần đăng nhập để chia sẻ.', // i18n-key
  too_big: 'Chuyến quá lớn để chia sẻ.', // i18n-key
  too_many: 'Hôm nay đã tạo quá nhiều link, mai thử lại.', // i18n-key
}
const SHARE_NET = 'Không tạo được link — kiểm tra mạng rồi thử lại.' // i18n-key
export async function createShare(p: SharePack): Promise<{ code: string } | { error: string }> {
  try {
    const c = await sb()
    const { data, error } = await c.rpc('share_create', { p_data: p })
    if (error || typeof data !== 'string') return { error: t(SHARE_ERR[error?.message ?? ''] ?? SHARE_NET) }
    return { code: data }
  } catch { return { error: t(SHARE_NET) } }
}
/** Bản chụp theo mã link: `missing` = mã sai / đã xoá; `error` = mất mạng. */
export async function fetchShare(code: string): Promise<{ pack: SharePack } | { missing: true } | { error: true }> {
  if (!cloudEnabled) return { error: true }
  try {
    const c = await sb()
    const { data, error } = await c.rpc('share_get', { p_code: code })
    if (error) return { error: true }
    const pack = cleanPack(data)
    return pack ? { pack } : { missing: true }
  } catch { return { error: true } }
}

// ── Đăng nhập / đăng xuất ─────────────────────────────────────────────────────────────────────────────────────────
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
  const before = useSpace.getState().id
  await loadFamilies()   // bộ đang mở là Family không còn tham gia ⇒ đã tự về "Của tôi" (và kéo bản tài khoản về)
  if (useSpace.getState().id === before) { version = null; await pull(true) }
}

async function onSignedOut() {
  uid = null
  version = null
  const { families } = useFamily.getState(), open = useSpace.getState().id
  useAuth.setState({ status: 'out', user: null, isAdmin: false, sync: 'idle' })
  useFamily.setState({ loaded: true, families: [], invites: [], members: {}, fees: {} })
  // dữ liệu Family cần đăng nhập ⇒ về "Của tôi", bỏ bản Family lưu trên máy (máy dùng chung)
  if (useSpace.getState().id !== 'me') {
    applying = true
    try { await openSpace({ id: 'me', name: null, role: null }) } finally { applying = false }
    jumpToLatest()
  }
  ;[open, ...families.map(f => f.id)].forEach(dropSpace)
}

let started = false
export function initCloud() {
  if (!cloudEnabled || started) return
  started = true
  loadCatalog().catch(() => { /* mất mạng: dùng bản đã có */ })
  loadPricing().catch(() => { /* mất mạng */ })
  sb().then(async c => {
    c.auth.onAuthStateChange((_e, session) => {
      // chạy ngoài callback: supabase-js khuyên không gọi API khác ngay trong đây
      setTimeout(() => {
        if (session?.user) onSignedIn(session.user).catch(() => useAuth.setState({ sync: 'error' }))
        else void onSignedOut()
      })
    })
    // đợi đổi xong mã đăng nhập rồi mới dọn ?code=… khỏi thanh địa chỉ
    await c.auth.getSession()
    if (location.search.includes('code=')) history.replaceState(null, '', location.pathname + location.hash)
  })
  useData.subscribe(() => {
    if (!uid || applying) return
    setDirty(useSpace.getState().id, true)
    clearTimeout(pushTimer)
    pushTimer = setTimeout(() => { pushTimer = undefined; void push() }, 1200)
  })
  // quay lại tab / mỗi 20 giây khi đang xem: người khác (Family) hay máy khác vừa sửa ⇒ kéo bản mới về
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { void check(); void loadFamilies() } })
  setInterval(() => { void check() }, 20000)
}
