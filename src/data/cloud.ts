// Bước B — tài khoản Google + máy chủ Supabase RIÊNG của MalCargo (không dùng DB của SUPPLYC).
//  · Mẫu chung (xe, mã hàng) nằm ở bảng `catalog`: ai cũng đọc, chỉ admin ghi (RLS, xem supabase/schema.sql).
//  · Dữ liệu riêng: một bản JSON / người ở bảng `user_data` (RLS theo auth.uid()); Family: một bản JSON / nhóm ở `family_data`.
//    Đăng nhập ⇒ dữ liệu trên máy GỘP vào tài khoản; sau đó mỗi thay đổi tự đẩy lên, quay lại tab / mỗi 20 giây thì kéo bản mới về.
// Chưa khai VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ⇒ app chạy như bước A: chỉ lưu trên máy, mẫu chung lấy từ catalog.ts.
import { create } from 'zustand'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Item, Order, Trip, Vehicle } from './types'
import {
  applyChanges, catalogLocked, changesSince, dropSpace, exportBackup, markSynced, mergeBackup, myCatalog, openSpace, parseBackup, readOnly,
  resetMine, setAuthor, syncedOf, useCatalog, useData, useSpace, type BackupData, type FamilyRole, type Synced,
} from './store'
import { adoptShare, cleanPack, type SharePack } from './share'
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
interface AuthState { status: 'off' | 'loading' | 'out' | 'in'; user: Account | null; isAdmin: boolean; isSuper: boolean; sync: SyncState }
export const useAuth = create<AuthState>(() => ({ status: cloudEnabled ? 'loading' : 'off', user: null, isAdmin: false, isSuper: false, sync: 'idle' }))

export async function signInGoogle() {
  const c = await sb()
  // về đúng trang gốc (không kèm #/…): mã đăng nhập trả về ở ?code=, không đụng định tuyến bằng dấu #
  // select_account: luôn hiện bảng chọn tài khoản, không thì Google tự vào lại tài khoản vừa dùng
  await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } } })
}
/** Đăng xuất MÁY NÀY (máy khác giữ nguyên). Đẩy nốt thay đổi trước, rồi dọn ngay — đổi tài khoản rời trang liền sau đó. */
export async function signOut() {
  const c = await sb()
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = undefined; void push() }
  await saving
  await c.auth.signOut({ scope: 'local' })
  await onSignedOut()
}
export async function switchAccount() {
  await signOut()
  await signInGoogle()
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
/** Màn Quản trị: số tổng do hàm máy chủ tính, chỉ admin gọi được. Trả câu lỗi nếu không đọc được. */
export interface AdminStats { users: number; new30: number; active30: number; guests30: number; guests_today: number; families: number; family_people: number; paying_families: number; paying_people: number }
/** Danh sách cho super admin: máy chủ chỉ trả SỐ đơn / chuyến / mã / xe, không trả nội dung. */
export interface AdminUser { id: string; email: string; name: string; created_at: string; last_used: string | null; orders: number; trips: number; items: number; vehicles: number; families: { name: string; role: FamilyRole }[] }
export interface AdminFamily { id: string; name: string; created_at: string; paid_until: string | null; orders: number; trips: number; members: { email: string; name: string | null; role: FamilyRole; status: 'invited' | 'requested' | 'active' }[] }
export interface AdminPeople { users: AdminUser[]; families: AdminFamily[] }
export async function loadAdminPeople(): Promise<AdminPeople | string> {
  const c = await sb()
  const { data, error } = await c.rpc('admin_people')
  return error ? error.message : data as AdminPeople
}
export async function loadAdminStats(): Promise<AdminStats | string> {
  const c = await sb()
  const { data, error } = await c.rpc('admin_stats')
  return error ? error.message : data as AdminStats
}
/** Đọc bộ Family không đang mở — nhập Excel so trùng + tra mã theo bộ này. */
export async function readFamily(fid: string): Promise<Partial<BackupData> | null> {
  const c = await sb()
  const { data, error } = await c.from('family_data').select('data').eq('family_id', fid).maybeSingle()
  if (error) return null
  return ((data as { data: Partial<BackupData> | null } | null)?.data) ?? {}
}
/** Nhập Excel, dòng "Family" khi bộ Family không mở: gửi thẳng phần thêm lên máy chủ (`family_sync` tự gộp từng bản ghi) —
 *  trùng mã / biển số ⇒ ghi đè đúng bản đó. Mở bộ Family thì app kéo về như thường. */
export async function saveToFamily(fid: string, add: { items: Item[]; vehicles: Vehicle[]; orders: Order[]; trips: Trip[] }): Promise<string | null> {
  const { items, vehicles } = add
  const c = await sb(), now = Date.now(), same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
  const { data, error } = await c.from('family_data').select('data').eq('family_id', fid).maybeSingle()
  if (error) return error.message
  const row = data as { data: Partial<BackupData> | null } | null
  if (!row) return 'family_data'
  const curI = row.data?.items ?? [], curV = row.data?.vehicles ?? []
  // mã / biển số đã có trong Family ⇒ dùng id bản đó (ghi đè), đơn / chuyến trong file đổi theo
  const itemOf = (x: Item) => curI.find(y => same(y.code, x.code))
  const vehOf = (x: Vehicle) => curV.find(y => (x.plate ? same(y.plate, x.plate) : !y.plate && same(y.name, x.name)))
  const itemId = new Map(items.map(x => [x.id, itemOf(x)?.id ?? x.id])), vehId = new Map(vehicles.map(x => [x.id, vehOf(x)?.id ?? x.id]))
  const changes = {
    items: items.map(x => ({ ...x, id: itemId.get(x.id)!, owner: 'me', updatedAt: now })),
    vehicles: vehicles.map(x => ({ ...x, id: vehId.get(x.id)!, owner: 'me', updatedAt: now })),
    orders: add.orders.map(o => ({ ...o, updatedAt: now, lines: o.lines.map(l => ({ ...l, itemId: itemId.get(l.itemId) ?? l.itemId })) })),
    trips: add.trips.map(x => ({ ...x, updatedAt: now, vehicleId: x.vehicleId && (vehId.get(x.vehicleId) ?? x.vehicleId) })),
  }
  const r = await c.rpc('family_sync', { p_family: fid, p_changes: changes, p_since: null })
  return r.error ? r.error.message : null
}
/** Admin nhập Excel vào Mẫu chung: ghi một lần cả danh sách (không được quyền ⇒ máy chủ từ chối, không ghi gì). */
export async function saveCatalogMany(kind: 'item' | 'vehicle', xs: (Item | Vehicle)[]): Promise<string | null> {
  if (!xs.length) return null
  const c = await sb()
  const cur = useCatalog.getState()
  const list: (Item | Vehicle)[] = kind === 'item' ? cur.items : cur.vehicles
  const now = Date.now(), datas = xs.map(x => ({ ...x, owner: 'admin' as const, updatedAt: now }))
  const { error } = await c.from('catalog').upsert(datas.map((data, i) => {
    const idx = list.findIndex(y => y.id === data.id)
    return { id: data.id, kind, data, sort: idx >= 0 ? idx : list.length + i, updated_at: new Date(now).toISOString() }
  }))
  if (error) return error.message
  const next = [...list.map(y => datas.find(d => d.id === y.id) ?? y), ...datas.filter(d => !list.some(y => y.id === d.id))]
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
let synced: Synced | null = null    // máy chủ đang có gì (theo bản ghi) — chỉ gửi phần khác; null = chưa biết ⇒ gửi hết, máy chủ tự gộp

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

/** Gửi phần đã đổi; máy chủ gộp từng bản ghi. `others`: có máy / người khác ghi sau phiên bản máy này đang cầm. */
async function sendChanges(chg: Partial<BackupData>, since: number | null): Promise<{ version: number; others: boolean }> {
  const c = await sb(), sp = useSpace.getState().id
  const { data, error } = sp === 'me'
    ? await c.rpc('user_sync', { p_changes: chg, p_since: since })
    : await c.rpc('family_sync', { p_family: sp, p_changes: chg, p_since: since })
  if (error) throw error
  return data as { version: number; others: boolean }
}

/** Phần mới hơn phiên bản `since` (full = cả bộ). null = chưa có dữ liệu trên máy chủ. */
async function fetchSince(since: number | null): Promise<{ version: number; full: boolean; data: Partial<BackupData> } | null> {
  const c = await sb(), sp = useSpace.getState().id
  const { data, error } = sp === 'me'
    ? await c.rpc('user_since', { p_since: since })
    : await c.rpc('family_since', { p_family: sp, p_since: since })
  if (error) throw error
  return data as { version: number; full: boolean; data: Partial<BackupData> } | null
}

/** Kéo phần mới về, gộp vào bản trên máy (thay đổi chưa gửi của máy này giữ nguyên). */
async function pullSince(since: number | null) {
  const sp = useSpace.getState().id
  const r = await fetchSince(since)
  if (!r || useSpace.getState().id !== sp) return
  if (r.full) {
    const p = parseBackup(JSON.stringify(r.data))
    if (typeof p === 'string') return
    replaceFromRemote(withLocal(p)); synced = syncedOf(p)
  } else {
    replaceFromRemote(applyChanges(exportBackup(), r.data, synced)); synced = markSynced(synced, r.data)
  }
  version = r.version
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

/** Đẩy phần đã đổi của bộ đang mở (xếp hàng sau lần đẩy trước). Máy chủ gộp từng bản ghi ⇒ không còn "không khớp phiên bản
 *  ⇒ ghi lại"; có người / máy khác vừa ghi ⇒ kéo phần của họ về sau khi gửi. */
function push(): Promise<void> {
  saving = saving.then(async () => {
    if (!uid) return
    const sp = useSpace.getState().id
    // chỉ xem: máy chủ không nhận ghi (store cũng chặn sửa) — không gửi gì
    const chg = readOnly() ? null : changesSince(exportBackup(), synced, !catalogLocked())
    if (!chg) { if (!pushTimer) setDirty(sp, false); useAuth.setState({ sync: 'saved' }); return }
    useAuth.setState({ sync: 'saving' })
    const since = version
    const r = await sendChanges(chg, since)
    if (useSpace.getState().id !== sp) return   // đổi sang bộ khác giữa chừng
    synced = markSynced(synced, chg)
    version = r.version
    if (r.others) await pullSince(since)
    if (!pushTimer) setDirty(sp, false)
    useAuth.setState({ sync: 'saved' })
  }).catch(() => { useAuth.setState({ sync: 'error' }) })
  return saving
}

/** Vừa đăng nhập / vừa mở bộ này: kéo CẢ bộ. "Của tôi" ⇒ gộp dữ liệu trên máy vào tài khoản rồi đẩy phần khác lên; Family ⇒
 *  máy này còn thay đổi chưa đẩy thì gộp + đẩy, không thì lấy bản máy chủ. Sau đó chỉ kéo phần mới (`pullSince`). */
async function pull() {
  if (!uid) return
  const sp = useSpace.getState().id
  const r = await fetchRemote()
  if (useSpace.getState().id !== sp) return
  if (!r.ok) { useAuth.setState({ sync: 'error' }); return }
  version = r.version
  synced = r.data ? syncedOf(r.data) : null
  if (sp !== 'me' && !r.data) return
  if (sp !== 'me' && !isDirty(sp)) { replaceFromRemote(r.data!); return }
  if (r.data) replaceFromRemote(sp === 'me' ? mergeBackup(exportBackup(), r.data) : withLocal(r.data))
  await push()
}

/** Hỏi nhẹ (chỉ số phiên bản) xem người khác vừa sửa chưa — có thì kéo bản mới về. */
async function check() {
  if (!uid || pushTimer || document.visibilityState !== 'visible' || useAuth.getState().sync === 'saving') return
  const sp = useSpace.getState().id
  const r = await fetchRemote(false)
  if (!r.ok || r.version === version || pushTimer || useSpace.getState().id !== sp) return
  try { await pullSince(version) } catch { useAuth.setState({ sync: 'error' }) }
}

/** Đang ở màn một chuyến của bộ cũ ⇒ sang chuyến sửa gần nhất của bộ mới, tại chỗ (tấm / bảng đang mở vẫn giữ — App giữ
 *  màn chuyến khi bộ dữ liệu vừa đổi). */
function jumpToLatest() {
  if (!location.hash.startsWith('#/trip/')) return
  // chuyến thật trước chuyến mẫu (Family vừa tải về có chuyến của mọi người — đừng đứng ở "Mẫu pallet")
  const latest = [...useData.getState().trips].sort((a, b) =>
    Number(a.id.startsWith('sample-')) - Number(b.id.startsWith('sample-')) || b.updatedAt - a.updatedAt)[0]
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
  const at = location.hash
  version = null; synced = null
  if (uid) await pull()
  // máy chưa từng mở bộ này: lúc nhảy chỉ có chuyến mẫu ⇒ tải về xong chọn lại (người dùng chưa tự đi chỗ khác)
  if (location.hash === at && useSpace.getState().id === id) jumpToLatest()
}

// ── FAMILY: chủ tạo, mời bằng email hoặc duyệt người xin vào qua link; cả nhóm dùng chung một bộ dữ liệu. Vai trò: Chủ ·
//    Quản lý (như chủ, trừ xoá Family / chuyển quyền / phân vai / mã giảm giá) · Thành viên (đơn + chuyến) · Chỉ xem ──────
export interface Family {
  id: string; name: string; role: FamilyRole; discountCode: string | null; paidUntil: string | null
  open: boolean        // MỞ: ai có link xem được đơn hàng (chỉ xem)
  link: string | null  // mã link xin vào / xem (chủ, quản lý tạo)
}
export interface Member { email: string; name: string | null; role: FamilyRole; status: 'invited' | 'requested' | 'active'; invited_at?: string }
export interface Invite { familyId: string; name: string; owner: string }
export interface Fee { price: number; people: number; code: string | null; percent: number; paidUntil: string | null }
export interface Code { code: string; percent: number; active: boolean; featured: boolean }
interface FamilyState {
  loaded: boolean; families: Family[]; invites: Invite[]; members: Record<string, Member[]>; fees: Record<string, Fee>
  asked: { familyId: string; name: string }[]   // Family tôi đã xin vào, đang chờ duyệt
  price: number; codes: Code[]   // giá / người / tháng + mã giảm giá (người thường chỉ thấy mã công khai; admin thấy hết)
}
export const useFamily = create<FamilyState>(() => ({ loaded: false, families: [], invites: [], members: {}, fees: {}, asked: [], price: 0, codes: [] }))
/** Chủ / quản lý: duyệt người, mở / đóng, link, đổi tên, sửa danh mục. */
export const isFamAdmin = (r: FamilyRole | null | undefined) => r === 'owner' || r === 'manager'
/** Số người đang xin vào ở các Family tôi làm chủ / quản lý — nhãn số ở menu ≡. */
export const useJoinRequests = () => useFamily(s => s.families.filter(f => isFamAdmin(f.role))
  .reduce((n, f) => n + (s.members[f.id] ?? []).filter(m => m.status === 'requested').length, 0))

const ERR: Record<string, string> = {
  already_owner: 'Bạn đã làm chủ một Family.', // i18n-key
  bad_code: 'Mã giảm giá không đúng hoặc đã ngừng.', // i18n-key
  payment_required: 'Còn phí tháng phải trả nên chưa thêm người được — nhập mã giảm giá hoặc liên hệ MAL.', // i18n-key
  bad_email: 'Email không hợp lệ.', // i18n-key
  already_member: 'Email này đã có trong Family.', // i18n-key
  not_owner: 'Chỉ chủ Family làm được việc này.', // i18n-key
  no_invite: 'Lời mời không còn.', // i18n-key
  bad_name: 'Nhập tên Family', // i18n-key
  no_request: 'Yêu cầu xin vào không còn.', // i18n-key
  no_member: 'Người này không còn trong Family.', // i18n-key
  other_owner: 'Người này đang làm chủ một Family khác nên chưa nhận quyền chủ được.', // i18n-key
  read_only: 'Bạn chỉ có quyền xem dữ liệu Family này.', // i18n-key
  not_signed_in: 'Cần đăng nhập.', // i18n-key
  no_link: 'Link không đúng hoặc đã được đổi.', // i18n-key
  too_many: 'Family đang có quá nhiều yêu cầu chờ duyệt, thử lại sau.', // i18n-key
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
  if (!uid || !me) { useFamily.setState({ loaded: true, families: [], invites: [], members: {}, fees: {}, asked: [] }); return }
  const c = await sb()
  const [{ data: fs, error }, { data: ms }] = await Promise.all([
    c.from('families').select('id, name, discount_code, paid_until, open, link, created_at').order('created_at'),
    c.from('family_members').select('family_id, email, name, role, status, invited_at').order('invited_at'),
  ])
  if (error) return
  const rows = (ms ?? []) as (Member & { family_id: string })[]
  const families: Family[] = [], invites: Invite[] = [], asked: FamilyState['asked'] = [], members: Record<string, Member[]> = {}
  type Row = { id: string; name: string; discount_code: string | null; paid_until: string | null; open: boolean | null; link: string | null }
  for (const f of (fs ?? []) as Row[]) {
    const mine = rows.find(m => m.family_id === f.id && m.email === me)
    const list = rows.filter(m => m.family_id === f.id)
    if (mine?.status === 'active') {
      families.push({ id: f.id, name: f.name, role: mine.role, discountCode: f.discount_code, paidUntil: f.paid_until, open: !!f.open, link: f.link ?? null })
      members[f.id] = list
    } else if (mine?.status === 'requested') asked.push({ familyId: f.id, name: f.name })
    else if (mine) { const o = list.find(m => m.role === 'owner'); invites.push({ familyId: f.id, name: f.name, owner: o?.name || o?.email || '' }) }
  }
  const rank = { owner: 0, manager: 1, member: 2, viewer: 3 }
  families.sort((a, b) => rank[a.role] - rank[b.role])
  const fees: Record<string, Fee> = {}
  await Promise.all(families.map(async f => {
    const { data } = await c.rpc('family_fee', { p_family: f.id })
    const x = data as { price: number; people: number; code: string | null; percent: number; paid_until: string | null } | null
    if (x) fees[f.id] = { price: Number(x.price), people: x.people, code: x.code, percent: x.percent, paidUntil: x.paid_until }
  }))
  useFamily.setState({ loaded: true, families, invites, members, fees, asked })
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
/** Từ chối lời mời, hoặc rút yêu cầu xin vào. */
export async function declineInvite(id: string) { const r = await call('family_decline', { p_family: id }); await loadFamilies(); return r.error }
export async function deleteFamily(id: string) { const r = await call('family_delete', { p_family: id }); await loadFamilies(); return r.error }
export async function approveMember(id: string, email: string) { const r = await call('family_approve', { p_family: id, p_email: email }); await loadFamilies(); return r.error }
export async function setMemberRole(id: string, email: string, role: Exclude<FamilyRole, 'owner'>) { const r = await call('family_set_role', { p_family: id, p_email: email, p_role: role }); await loadFamilies(); return r.error }
export async function transferOwner(id: string, email: string) { const r = await call('family_transfer', { p_family: id, p_email: email }); await loadFamilies(); return r.error }
export async function setFamilyOpen(id: string, open: boolean) { const r = await call('family_set_open', { p_family: id, p_open: open }); await loadFamilies(); return r.error }
/** Link xin vào / xem của Family (chưa có thì tạo); `renew` ⇒ đổi link, link cũ hết tác dụng. */
export async function familyLink(id: string, renew = false): Promise<{ code: string } | { error: string }> {
  try {
    const r = await call('family_link', { p_family: id, p_new: renew })
    await loadFamilies()
    return r.error || typeof r.data !== 'string' ? { error: r.error ?? t(SHARE_NET) } : { code: r.data }
  } catch { return { error: t(SHARE_NET) } }
}

/** Mở link Family: tên, mở / đóng, tôi đang ở đâu; Family MỞ ⇒ kèm đơn hàng (chỉ đơn). */
export interface PeekLine { code: string; name: string; qty: number; kg: number | null }
export interface PeekOrder { id: string; name: string; place: string; by: string | null; updatedAt: number; lines: PeekLine[] }
export interface FamilyPeek {
  id: string; name: string; open: boolean; people: number
  me: { status: Member['status']; role: FamilyRole } | null
  orders: PeekOrder[] | null
}
export async function peekFamily(code: string): Promise<{ peek: FamilyPeek } | { missing: true } | { error: true }> {
  if (!cloudEnabled) return { error: true }
  try {
    const c = await sb()
    const { data, error } = await c.rpc('family_peek', { p_code: code })
    if (error) return { error: true }
    if (!data || typeof data !== 'object') return { missing: true }
    const d = data as Record<string, unknown>
    const s = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '')
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    const orders = Array.isArray(d.orders) ? (d.orders as Record<string, unknown>[]).map(o => ({
      id: s(o.id, 80), name: s(o.name), place: s(o.place), by: s(o.by) || null, updatedAt: n(o.updatedAt) ?? 0,
      lines: (Array.isArray(o.lines) ? o.lines as Record<string, unknown>[] : []).map(l => ({ code: s(l.code, 60), name: s(l.name), qty: n(l.qty) ?? 0, kg: n(l.kg) })),
    })) : null
    const me = d.me && typeof d.me === 'object' ? d.me as FamilyPeek['me'] : null
    return { peek: { id: s(d.id, 80), name: s(d.name, 80), open: d.open === true, people: n(d.people) ?? 0, me, orders } }
  } catch { return { error: true } }
}
/** Xin vào qua link (cần đăng nhập) ⇒ trạng thái của tôi trong Family đó. */
export async function requestJoin(code: string): Promise<{ status: Member['status'] } | { error: string }> {
  try {
    const r = await call('family_request', { p_code: code })
    await loadFamilies()
    const st = (r.data as { status?: Member['status'] } | null)?.status
    return r.error || !st ? { error: r.error ?? t(SHARE_NET) } : { status: st }
  } catch { return { error: t(SHARE_NET) } }
}

/** Đơn + chuyến do TÔI tạo trong Family (rời Family thì mang bản sao theo). Bộ đang mở ⇒ đọc trên máy; không ⇒ đọc máy chủ. */
export async function myFamilyWork(id: string): Promise<SharePack[]> {
  const me = useAuth.getState().user?.email.toLowerCase()
  if (!me) return []
  const d = useSpace.getState().id === id ? exportBackup() : await readFamily(id)
  if (!d) return []
  const cat = useCatalog.getState()
  const items = [...(d.items ?? []), ...cat.items], vehicles = [...(d.vehicles ?? []), ...cat.vehicles]
  const orders = d.orders ?? []
  return (d.trips ?? []).filter(x => x.madeBy?.toLowerCase() === me && !x.id.startsWith('sample-')).map(trip => {
    const os = trip.orderIds.map(o => orders.find(y => y.id === o)).filter((o): o is Order => !!o)
    const used = new Set(os.flatMap(o => o.lines.map(l => l.itemId)))
    return {
      app: 'malcargo', kind: 'trip', version: 1, trip, orders: os, items: items.filter(i => used.has(i.id)),
      vehicles: vehicles.filter(v => v.id === trip.vehicleId), pallet: d.pallet ?? useData.getState().pallet,
    } as SharePack
  })
}
/** Rời Family; `copy` = bản chụp các chuyến do tôi tạo (myFamilyWork) ⇒ lưu bản sao vào "Của tôi" sau khi rời. */
export async function leaveFamily(id: string, copy: SharePack[] = []) {
  const r = await call('family_leave', { p_family: id })
  if (r.error) return r.error
  await loadFamilies()   // đang mở bộ Family đó ⇒ đã tự về "Của tôi"
  if (copy.length) {
    if (useSpace.getState().id !== 'me') await switchSpace('me')
    for (const p of copy) adoptShare(p)
  }
  return null
}

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
// dữ liệu "Của tôi" trên máy thuộc tài khoản nào (không có = của khách, đăng nhập thì gộp lên như thường)
const OWNER = 'malcargo-owner-v1'
const ownerOf = () => { try { return localStorage.getItem(OWNER) } catch { return null } }
const setOwner = (id: string | null) => { try { if (id) localStorage.setItem(OWNER, id); else localStorage.removeItem(OWNER) } catch { /* bỏ qua */ } }
async function onSignedIn(u: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
  if (uid === u.id) return
  // dữ liệu trên máy là của tài khoản khác (đổi tài khoản giữa chừng, phiên cũ hết hạn) ⇒ bỏ trước khi gộp, không đưa sang người này
  const otherOwner = !!ownerOf() && ownerOf() !== u.id
  if (otherOwner) { uid = null; resetMine(); setDirty('me', false); jumpToLatest() }
  setOwner(u.id)
  uid = u.id
  const md = u.user_metadata ?? {}
  setAuthor({ email: (u.email ?? '').toLowerCase(), name: String(md.full_name ?? md.name ?? u.email ?? '') })
  useAuth.setState({
    status: 'in',
    user: { id: u.id, email: u.email ?? '', name: String(md.full_name ?? md.name ?? u.email ?? ''), avatar: (md.avatar_url as string) ?? null },
  })
  const c = await sb()
  const { data } = await c.rpc('is_admin')
  const sup = data === true ? await c.rpc('is_super_admin') : null
  useAuth.setState({ isAdmin: data === true, isSuper: sup?.data === true })
  const before = useSpace.getState().id
  await loadFamilies()   // bộ đang mở là Family không còn tham gia ⇒ đã tự về "Của tôi" (và kéo bản tài khoản về)
  if (useSpace.getState().id === before) { version = null; synced = null; await pull() }
  if (otherOwner) jumpToLatest()   // chuyến đang mở là của người trước, đã bỏ ⇒ sang chuyến gần nhất của tài khoản này
}

async function onSignedOut() {
  const wasIn = uid !== null   // mở app chưa đăng nhập cũng vào đây: dữ liệu của khách phải giữ nguyên
  uid = null
  version = null; synced = null
  const { families } = useFamily.getState(), open = useSpace.getState().id
  setAuthor(null)
  useAuth.setState({ status: 'out', user: null, isAdmin: false, isSuper: false, sync: 'idle' })
  useFamily.setState({ loaded: true, families: [], invites: [], members: {}, fees: {}, asked: [] })
  // dữ liệu Family cần đăng nhập ⇒ về "Của tôi", bỏ bản Family lưu trên máy (máy dùng chung)
  if (useSpace.getState().id !== 'me') {
    applying = true
    try { await openSpace({ id: 'me', name: null, role: null }) } finally { applying = false }
    jumpToLatest()
  }
  ;[open, ...families.map(f => f.id)].forEach(dropSpace)
  // dữ liệu của tôi đã nằm trên tài khoản ⇒ rời máy. Còn thay đổi chưa đẩy (mất mạng) ⇒ giữ lại, cùng tài khoản đăng nhập lại sẽ đẩy tiếp
  if (wasIn && !isDirty('me')) { resetMine(); setOwner(null); jumpToLatest() }
}

// Đếm khách vãng lai: thiết bị chưa từng đăng nhập gửi một mã ngẫu nhiên, mỗi ngày một lần (không tên, không dữ liệu nhập).
// Đăng nhập ⇒ máy chủ bỏ mã đó khỏi danh sách khách, máy này thôi gửi. Trình duyệt tự động (bot, script kiểm) không đếm.
const GUEST_KEY = 'malcargo-guest-v1'
async function countGuest(c: SupabaseClient, signedIn: boolean) {
  if (navigator.webdriver) return
  try {
    const g = JSON.parse(localStorage.getItem(GUEST_KEY) ?? 'null') as { id?: string; day?: string; known?: boolean } | null
    if (g?.known) return
    if (signedIn) {
      if (g?.id) await c.rpc('guest_ping', { p_device: g.id })
      localStorage.setItem(GUEST_KEY, JSON.stringify({ known: true }))
      return
    }
    const day = new Date().toISOString().slice(0, 10)
    if (g?.day === day) return
    const id = g?.id ?? crypto.randomUUID()
    const { error } = await c.rpc('guest_ping', { p_device: id })
    if (!error) localStorage.setItem(GUEST_KEY, JSON.stringify({ id, day }))
  } catch { /* bộ nhớ bị chặn / mất mạng: lần sau */ }
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
    const { data: { session } } = await c.auth.getSession()
    if (location.search.includes('code=')) history.replaceState(null, '', location.pathname + location.hash)
    void countGuest(c, !!session)
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
