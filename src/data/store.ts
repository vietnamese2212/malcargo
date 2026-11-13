// Kho dữ liệu của người dùng — luôn lưu trong máy (localStorage). Đã đăng nhập thì cloud.ts nghe mọi
// thay đổi ở đây và đẩy lên tài khoản.
import { useMemo } from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import type { Item, Order, PalletSettings, Trip, Vehicle } from './types'
import { t } from '../i18n'
import { ADMIN_ITEMS, ADMIN_VEHICLES, DEFAULT_PALLET_SETTINGS, PREV_SAMPLES, SAMPLE_ORDERS, SAMPLE_TRIPS } from './catalog'

export const newId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

// Trình duyệt chặn bộ nhớ (chế độ riêng tư, xem trước…) thì app vẫn chạy, chỉ không nhớ.
const memory = new Map<string, string>()
const safeStorage = {
  getItem: (k: string): string | null => { try { return localStorage.getItem(k) } catch { return memory.get(k) ?? null } },
  setItem: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { memory.set(k, v) } },
  removeItem: (k: string) => { try { localStorage.removeItem(k) } catch { memory.delete(k) } },
} satisfies StateStorage

// ── BỘ DỮ LIỆU đang mở: "Của tôi" (id 'me') hoặc một FAMILY (id Family). Mỗi bộ lưu riêng trên máy (`dataKey`) — đổi bộ
//    không lẫn dữ liệu; cloud.ts đồng bộ bộ đang mở với tài khoản / Family. Nhớ bộ đang mở (mở lại app vẫn ở đó).
export type FamilyRole = 'owner' | 'manager' | 'member' | 'viewer'
export interface SpaceInfo { id: string; name: string | null; role: FamilyRole | null }
const SPACE = 'malcargo-space-v1'
export const dataKey = (space: string) => (space === 'me' ? 'malcargo-data-v1' : `malcargo-data-fam-${space}`)
const savedSpace = (): SpaceInfo => {
  try { const s = JSON.parse(safeStorage.getItem(SPACE) ?? 'null'); if (s?.id) return s } catch { /* hỏng ⇒ của tôi */ }
  return { id: 'me', name: null, role: null }
}
export const useSpace = create<SpaceInfo>(() => savedSpace())
useSpace.subscribe(s => safeStorage.setItem(SPACE, JSON.stringify(s)))
/** Tên Family lúc hiện: luôn có chữ "Family" để phân biệt với "Của tôi" (tên đã bắt đầu bằng Family thì giữ nguyên). */
export const famLabel = (name: string) => (/^\s*family\b/i.test(name) ? name : `Family ${name}`)
/** Thành viên / người chỉ xem của Family: mã hàng, xe, cỡ pallet CHỈ ĐỌC — chủ + quản lý giữ danh mục (máy chủ cũng chặn). */
const locks = (r: FamilyRole | null) => r === 'member' || r === 'viewer'
export const catalogLocked = () => locks(useSpace.getState().role)
export const useCatalogLocked = () => useSpace(s => locks(s.role))
export const LOCKED = 'Mã hàng, xe, cỡ pallet do chủ Family quản lý.' // i18n-key — câu báo cho thành viên, gọi t(LOCKED) lúc vẽ
/** Vai "Chỉ xem" trong Family: không sửa gì được (máy chủ cũng từ chối ghi). */
export const readOnly = () => useSpace.getState().role === 'viewer'
export const useReadOnly = () => useSpace(s => s.role === 'viewer')
export const READ_ONLY = 'Bạn chỉ có quyền xem dữ liệu Family này.' // i18n-key
/** Câu báo chung (App hiện thành dòng nổi): người chỉ xem bấm sửa ⇒ báo thay vì lặng lẽ không làm gì. */
export const useNotice = create<{ text: string | null; n: number }>(() => ({ text: null, n: 0 }))
export const notify = (text: string) => useNotice.setState(s => ({ text, n: s.n + 1 }))
const blocked = () => { if (!readOnly()) return false; notify(READ_ONLY); return true }
/** Nút tạo chuyến / đơn mới gọi trước: chỉ xem ⇒ báo + true (đừng chuyển sang chuyến không có). */
export const denyEdit = blocked

// Người đang đăng nhập (cloud.ts đặt) — trong Family, đơn / chuyến ghi tên người sửa lần cuối + email người tạo
let author: { email: string; name: string } | null = null
export const setAuthor = (a: { email: string; name: string } | null) => { author = a }
const who = <T extends { by?: string; madeBy?: string }>(x: T, isNew: boolean): T =>
  useSpace.getState().id === 'me' || !author ? x
    : { ...x, by: author.name || author.email, ...(isNew ? { madeBy: author.email } : {}) }

// Family nhiều người cùng làm ⇒ chỉ dọn nháp trống do CHÍNH MÁY NÀY tạo (nháp người khác vừa bấm "+" không bị xoá)
const DRAFTS = 'malcargo-drafts-v1'
const drafts = new Set<string>((() => { try { return JSON.parse(safeStorage.getItem(DRAFTS) ?? '[]') as string[] } catch { return [] } })())
const draft = (id: string) => { drafts.add(id); safeStorage.setItem(DRAFTS, JSON.stringify([...drafts].slice(-300))) }

export interface DataState {
  items: Item[]          // chỉ của người dùng — mẫu chung nằm ở catalog.ts
  vehicles: Vehicle[]
  orders: Order[]
  trips: Trip[]
  pallet: PalletSettings
  deleted: Deleted       // id đã xoá → lúc xoá: đồng bộ nhiều máy không làm thứ đã xoá sống lại
  fork: ForkInfo | null  // không lưu — chỉ để màn chuyến biết vừa tách chuyến mẫu
  markForkSeen: () => void
  upsertItem: (it: Item) => void
  removeItem: (id: string) => void
  upsertVehicle: (v: Vehicle) => void
  removeVehicle: (id: string) => void
  upsertOrder: (o: Order) => void
  removeOrder: (id: string) => void
  upsertTrip: (t: Trip) => void
  removeTrip: (id: string) => void
  sweepBlank: (keep: string[]) => void
  setPallet: (p: PalletSettings) => void
  replaceAll: (d: BackupData) => void
  importBatch: (d: ImportBatch) => void
}

/** Một lần nhập từ Excel: thêm mới hoặc ghi đè theo id (bản ghi đã khớp sẵn id cũ). */
export interface ImportBatch { items: Item[]; vehicles: Vehicle[]; orders: Order[]; trips: Trip[] }

export interface BackupData {
  app: 'malcargo'; version: 1
  items: Item[]; vehicles: Vehicle[]; orders: Order[]; trips: Trip[]; pallet: PalletSettings
  deleted?: Deleted      // bản cũ (trước khi có) không có
}

const upsert = <T extends { id: string }>(list: T[], x: T) => {
  const i = list.findIndex(y => y.id === x.id)
  if (i < 0) return [x, ...list]
  const next = list.slice(); next[i] = x; return next
}

// ── Dấu ĐÃ XOÁ (id → lúc xoá). Gộp dữ liệu hai máy thì bản ghi nào bị xoá SAU lần sửa cuối của nó sẽ bị bỏ —
//    trước đây gộp kiểu hợp, xoá ở máy này thì máy kia đẩy lại. Giữ 90 ngày cho gọn.
export type Deleted = Record<string, number>
const KEEP_DELETED = 90 * 864e5
function marks(...parts: (Deleted | undefined)[]): Deleted {
  const out: Deleted = {}, old = Date.now() - KEEP_DELETED
  for (const p of parts) for (const [id, at] of Object.entries(p ?? {})) if (at > old && !(out[id] >= at)) out[id] = at
  return out
}
const mark = (d: Deleted, ids: string[]) => { const now = Date.now(); return marks(d, Object.fromEntries(ids.filter(id => !isSample(id)).map(id => [id, now]))) }
const deadIn = (d: Deleted) => (x: { id: string; updatedAt: number }) => d[x.id] >= x.updatedAt

// ── BẢN NHÁP TRỐNG: bấm "+" / "Thêm hàng" / "Đơn mới" là có ngay chuyến / đơn để làm việc; bỏ đó không thêm gì
//    thì rời màn là app tự dọn (sweepBlank). Đã đặt tên riêng, khai điểm giao hay chọn mã hàng ⇒ giữ.
const DEFAULT_ORDER = /^Đơn \d+$/, DEFAULT_TRIP = /^Chuyến \d+$/ // i18n-ok tên mặc định lưu trong dữ liệu
export const isBlankOrder = (o: Order) => !isSample(o.id) && !o.lines.length && !o.place?.trim() && DEFAULT_ORDER.test(o.name)
const isBlankTrip = (t: Trip, orders: Set<string>) =>
  !isSample(t.id) && (t.name === t.code || DEFAULT_TRIP.test(t.name)) && !t.orderIds.some(id => orders.has(id))

// ── CHUYẾN MẪU (+ đơn của nó) luôn giữ nguyên: không xoá được, và sửa bất cứ gì trên nó thì app tự TÁCH
//    thành một chuyến mới (mã ddmmyy-hhmm-stt) mang thay đổi đó; chọn lại chuyến mẫu là thấy bản gốc.
export const isSample = (id: string) => id.startsWith('sample-')
const PREV_TRIPS = PREV_SAMPLES.flatMap(v => v.trips), PREV_ORDERS = PREV_SAMPLES.flatMap(v => v.orders)
// tên mặc định của chuyến mẫu (cả đời trước): tách ra thì chuyến mới lấy mã chuyến làm tên
const SAMPLE_NAMES = new Set([...SAMPLE_TRIPS, ...PREV_TRIPS].map(t => t.name))
// Bản sao của đơn mẫu mang tên ĐƠN MỚI "Đơn N" (chủ dự án 29/10: sửa đơn mẫu ⇒ ra "đơn 1", từ đó sửa mãi trên đơn 1 —
// giữ tên mẫu thì danh sách đầy "Đơn mẫu pallet", không biết đâu là mẫu); tên người dùng vừa tự đặt thì giữ
const SAMPLE_ORDER_NAMES = new Set([...SAMPLE_ORDERS, ...PREV_ORDERS].map(o => o.name))
const copyName = (name: string, taken: Order[]) =>
  (SAMPLE_ORDER_NAMES.has(name) ? nextName('Đơn', taken.map(o => o.name)) : name) // i18n-ok — tên mặc định lưu vào dữ liệu
/** Đơn chép từ chuyến người khác chia sẻ: tên mẫu / tên mặc định "Đơn N" ⇒ "Đơn N" kế tiếp bên mình; tên riêng giữ. */
export const copyOrderName = (name: string, taken: string[]) =>
  (SAMPLE_ORDER_NAMES.has(name) || DEFAULT_ORDER.test(name) ? nextName('Đơn', taken) : name) // i18n-ok — tên mặc định lưu vào dữ liệu
/** Tên mặc định của chuyến (tên chuyến mẫu, "Chuyến N") — chép sang thì lấy mã chuyến mới làm tên. */
export const isDefaultTripName = (name: string) => SAMPLE_NAMES.has(name) || DEFAULT_TRIP.test(name)
/** Chuyến mẫu đang giữ đơn mẫu `oid` — sửa đơn đó thì tách chuyến này. */
const sampleTripOf = (s: TO, oid: string) =>
  s.trips.find(t => isSample(t.id) && t.orderIds.includes(oid)) ?? SAMPLE_TRIPS.find(t => t.orderIds.includes(oid)) ?? SAMPLE_TRIPS[0]

/** Mã chuyến ddmmyy-hhmm-stt: thời điểm tạo + số thứ tự trong ngày. */
export function tripCode(trips: Trip[], d = new Date()): string {
  const p2 = (n: number) => String(n).padStart(2, '0')
  const day = `${p2(d.getDate())}${p2(d.getMonth() + 1)}${p2(d.getFullYear() % 100)}`
  const n = Math.max(0, ...trips.filter(t => t.code?.startsWith(`${day}-`)).map(t => Number(t.code!.split('-')[2]) || 0)) + 1
  return `${day}-${p2(d.getHours())}${p2(d.getMinutes())}-${p2(n)}`
}

/** Chuyến mới: tên mặc định = mã chuyến (đổi tên sau vẫn giữ mã). */
export const newTripLabel = (trips: Trip[]) => { const code = tripCode(trips); return { code, name: code } }

/** Chuyến mẫu vừa tách: `orders` = đơn mẫu → đơn mới. `seen` = màn chuyến đã chuyển sang chuyến mới. */
export interface ForkInfo { from: string; to: string; orders: Record<string, string>; seen: boolean }
type TO = { trips: Trip[]; orders: Order[] }

/** Tách chuyến mẫu (đã mang thay đổi `trip` / `override`) thành chuyến mới + bản sao các đơn mẫu. */
function makeFork(s: TO, trip: Trip, override?: Order) {
  const now = Date.now(), code = tripCode(s.trips)
  const map: Record<string, string> = {}
  const orders: Order[] = []
  for (const oid of trip.orderIds) {
    if (!isSample(oid)) continue
    const src = (override?.id === oid ? override : undefined) ?? s.orders.find(o => o.id === oid) ?? SAMPLE_ORDERS.find(o => o.id === oid)
    if (!src) continue
    map[oid] = newId(); orders.push({ ...src, id: map[oid], name: copyName(src.name, [...s.orders, ...orders]), updatedAt: now })
  }
  const t: Trip = {
    ...trip, id: newId(), code, name: SAMPLE_NAMES.has(trip.name) ? code : trip.name,
    orderIds: trip.orderIds.map(o => map[o] ?? o).filter(o => !isSample(o)), updatedAt: now,
  }
  return { trip: t, orders, fork: { from: trip.id, to: t.id, orders: map, seen: false } as ForkInfo }
}

/** Chuyến THƯỜNG không giữ đơn mẫu (sửa đơn đó sẽ đụng chuyến mẫu): gặp thì sao ra đơn riêng. */
function detachSampleOrders(s: TO, t: Trip): { trip: Trip; added: Order[] } {
  const added: Order[] = []
  const orderIds = t.orderIds.map(oid => {
    if (!isSample(oid)) return oid
    const src = s.orders.find(o => o.id === oid) ?? SAMPLE_ORDERS.find(o => o.id === oid)
    if (!src) return oid
    const o = { ...src, id: newId(), name: copyName(src.name, [...s.orders, ...added]), updatedAt: Date.now() }
    added.push(o); return o.id
  })
  return { trip: added.length ? { ...t, orderIds } : t, added }
}

// Hàng của 2 đơn mẫu đời trước nữa (đồ tiêu dùng chung, thay bằng hàng sữa ngày 27/10/2026)
const OLD_SAMPLE_LINES: Record<string, Order['lines']> = {
  'sample-o1': [{ itemId: 'adm-i-chai', qty: 120 }, { itemId: 'adm-i-lon', qty: 160 }, { itemId: 'adm-i-banh', qty: 30 }],
  'sample-o2': [{ itemId: 'adm-i-mi', qty: 90 }, { itemId: 'adm-i-dau', qty: 60 }],
}

// So dòng hàng theo NỘI DUNG (mã × số thùng), không so chuỗi JSON: dữ liệu về từ máy chủ (jsonb) bị đảo thứ tự trường
// ({"qty","itemId"}) ⇒ so chuỗi tưởng mẫu đã bị sửa, mở app (đã đăng nhập) lần nào cũng tự tách 2 chuyến rác
// (chủ dự án 30/10: tài khoản có 34 chuyến — ~28 là bản sao y hệt mẫu, mọc theo cặp mỗi lần mở app)
const linesKey = (ls?: Order['lines']) => (ls ? ls.map(l => `${l.itemId}×${l.qty}`).join(',') : '\0')
const SAMPLE_SETS = [{ trips: SAMPLE_TRIPS, orders: SAMPLE_ORDERS }, ...PREV_SAMPLES]

/** Nạp dữ liệu (mở app, nạp file, đồng bộ): chuyến mẫu đã bị sửa ở bản cũ ⇒ giữ thay đổi thành chuyến mới, mẫu về gốc.
 *  Kèm dọn chuyến RÁC = bản sao y hệt một chuyến mẫu (tên vẫn là mã chuyến, cùng xe, từng đơn cùng điểm giao + hàng,
 *  không bật gì) — do lỗi so chuỗi ở trên đẻ ra; bỏ đi không mất gì. `dropped` ⇒ người gọi đánh dấu đã xoá. */
function resetSamples(d: TO): TO & { dropped: string[] } {
  let { trips, orders } = d
  // khớp bản mẫu hiện tại HOẶC bản mẫu đời trước (chưa ai sửa) ⇒ chỉ thay mẫu, không tách chuyến
  const pristineO = (o: Order) => linesKey(o.lines) === linesKey(OLD_SAMPLE_LINES[o.id])
    || [...SAMPLE_ORDERS, ...PREV_ORDERS].some(p => p.id === o.id && o.name === p.name && (o.place ?? '') === p.place && linesKey(o.lines) === linesKey(p.lines))
  const pristineT = (t: Trip) => [...SAMPLE_TRIPS, ...PREV_TRIPS].some(p => p.id === t.id && t.name === p.name && t.vehicleId === p.vehicleId && t.orderIds.join() === p.orderIds.join())
  for (const st of trips.filter(t => isSample(t.id))) {
    const changed = !pristineT(st) || st.orderIds.some(oid => { const o = orders.find(x => x.id === oid); return o && !pristineO(o) })
    if (changed) { const k = makeFork({ trips, orders }, st); trips = [k.trip, ...trips]; orders = [...k.orders, ...orders] }
  }
  // chuyến rác: bản sao y hệt một chuyến mẫu (mọi đời) — đơn của nó không nằm ở chuyến nào khác
  const byId = new Map(orders.map(o => [o.id, o]))
  const isClone = (t: Trip) => !isSample(t.id) && t.name === t.code && !t.lightOwnPallet && !t.lightOwnLoose && !t.kind && SAMPLE_SETS.some(v => v.trips.some(s =>
    s.vehicleId === t.vehicleId && s.orderIds.length === t.orderIds.length && s.orderIds.every((sid, i) => {
      const p = v.orders.find(x => x.id === sid), o = byId.get(t.orderIds[i])
      return !!p && !!o && (o.place ?? '') === p.place && (o.name === p.name || DEFAULT_ORDER.test(o.name)) && linesKey(o.lines) === linesKey(p.lines)
    })))
  const clones = trips.filter(isClone)
  const cloneOrders = new Set(clones.flatMap(t => t.orderIds))
  trips.filter(t => !clones.includes(t)).forEach(t => t.orderIds.forEach(o => cloneOrders.delete(o)))
  const dropped = [...clones.map(t => t.id), ...cloneOrders]
  trips = trips.filter(t => !clones.includes(t)); orders = orders.filter(o => !cloneOrders.has(o.id))
  trips = trips.filter(t => !isSample(t.id)).map(t => {
    const k = detachSampleOrders({ trips, orders }, t); orders = [...k.added, ...orders]; return k.trip
  })
  return { trips: [...trips, ...SAMPLE_TRIPS], orders: [...orders.filter(o => !isSample(o.id)), ...SAMPLE_ORDERS], dropped }
}

export const useData = create<DataState>()(
  persist(
    set => ({
      items: [],
      vehicles: [],
      orders: SAMPLE_ORDERS,
      trips: SAMPLE_TRIPS,
      pallet: DEFAULT_PALLET_SETTINGS,
      deleted: {},
      upsertItem: it => set(s => (catalogLocked() ? {} : { items: upsert(s.items, { ...it, owner: 'me', updatedAt: Date.now() }) })),
      removeItem: id => set(s => (catalogLocked() ? {} : { items: s.items.filter(x => x.id !== id), deleted: mark(s.deleted, [id]) })),
      upsertVehicle: v => set(s => (catalogLocked() ? {} : { vehicles: upsert(s.vehicles, { ...v, owner: 'me', updatedAt: Date.now() }) })),
      removeVehicle: id => set(s => (catalogLocked() ? {} : {
        vehicles: s.vehicles.filter(x => x.id !== id),
        trips: s.trips.map(t => (t.vehicleId === id ? { ...t, vehicleId: null } : t)),
        deleted: mark(s.deleted, [id]),
      })),
      fork: null,
      upsertOrder: o => set(s => {
        if (blocked()) return {}
        const now = Date.now()
        if (!isSample(o.id)) {
          const isNew = !s.orders.some(x => x.id === o.id)
          if (isNew) draft(o.id)
          return { orders: upsert(s.orders, who({ ...o, updatedAt: now }, isNew)) }
        }
        // đơn mẫu bị sửa: vừa tách xong (cùng một thao tác sửa nhiều đơn) ⇒ ghi vào bản sao; chưa tách ⇒ tách
        const f = s.fork
        if (f && !f.seen && f.orders[o.id]) {
          // bản sao đã mang tên "Đơn N": màn còn cầm đơn mẫu (tên mẫu) thì không ghi tên mẫu đè lại
          const cur = s.orders.find(x => x.id === f.orders[o.id])
          return { orders: upsert(s.orders, who({ ...o, id: f.orders[o.id], name: cur && SAMPLE_ORDER_NAMES.has(o.name) ? cur.name : o.name, updatedAt: now, madeBy: cur?.madeBy }, false)) }
        }
        const k = makeFork(s, sampleTripOf(s, o.id), o)
        return { trips: [who(k.trip, true), ...s.trips], orders: [...k.orders.map(x => who(x, true)), ...s.orders], fork: k.fork }
      }),
      removeOrder: id => set(s => (isSample(id) || blocked() ? {} : {
        orders: s.orders.filter(x => x.id !== id),
        trips: s.trips.map(t => ({ ...t, orderIds: t.orderIds.filter(o => o !== id) })),
        deleted: mark(s.deleted, [id]),
      })),
      upsertTrip: t => set(s => {
        if (blocked()) return {}
        const now = Date.now()
        if (!isSample(t.id)) {
          const isNew = !s.trips.some(x => x.id === t.id)
          if (isNew) draft(t.id)
          const k = detachSampleOrders(s, t)
          return { trips: upsert(s.trips, who({ ...k.trip, updatedAt: now }, isNew)), ...(k.added.length ? { orders: [...k.added.map(x => who(x, true)), ...s.orders] } : {}) }
        }
        const f = s.fork
        if (f && !f.seen && f.from === t.id) {
          const cur = s.trips.find(x => x.id === f.to)
          return { trips: upsert(s.trips, who({
            ...t, id: f.to, code: cur?.code, name: SAMPLE_NAMES.has(t.name) ? cur?.name ?? t.name : t.name,
            orderIds: t.orderIds.map(o => f.orders[o] ?? o), updatedAt: now, madeBy: cur?.madeBy,
          }, false)) }
        }
        const k = makeFork(s, t)
        return { trips: [who(k.trip, true), ...s.trips], orders: [...k.orders.map(x => who(x, true)), ...s.orders], fork: k.fork }
      }),
      removeTrip: id => set(s => (isSample(id) || blocked() ? {} : { trips: s.trips.filter(x => x.id !== id), deleted: mark(s.deleted, [id]) })),
      // dọn đơn / chuyến nháp trống, trừ những cái đang mở (`keep`) và đơn nằm trong chuyến đang mở
      sweepBlank: keep => set(s => {
        if (readOnly()) return s   // chỉ xem: không xoá gì (máy chủ cũng không nhận)
        const k = new Set(keep)
        s.trips.forEach(t => { if (k.has(t.id)) t.orderIds.forEach(o => k.add(o)) })
        const own = (id: string) => useSpace.getState().id === 'me' || drafts.has(id)
        const dropO = s.orders.filter(o => !k.has(o.id) && own(o.id) && isBlankOrder(o)).map(o => o.id)
        const orders = s.orders.filter(o => !dropO.includes(o.id))
        const alive = new Set(orders.map(o => o.id))
        const dropT = s.trips.filter(t => !k.has(t.id) && own(t.id) && isBlankTrip(t, alive)).map(t => t.id)
        if (!dropO.length && !dropT.length) return s   // y nguyên ⇒ không báo đổi, không đẩy lên tài khoản
        return {
          orders, deleted: mark(s.deleted, [...dropO, ...dropT]),
          trips: s.trips.filter(t => !dropT.includes(t.id)).map(t => (t.orderIds.some(o => dropO.includes(o)) ? { ...t, orderIds: t.orderIds.filter(o => !dropO.includes(o)) } : t)),
        }
      }),
      markForkSeen: () => set(s => (s.fork ? { fork: { ...s.fork, seen: true } } : {})),
      setPallet: pallet => set(catalogLocked() ? {} : { pallet }),
      // thay cả bộ (nạp file, xoá hết, bản từ tài khoản): thứ biến mất ⇒ đánh dấu đã xoá; thứ có trong bộ mới ⇒ bỏ dấu
      replaceAll: d => set(s => {
        const { trips, orders, dropped } = resetSamples(d)
        const alive = new Set([...d.items, ...d.vehicles, ...orders, ...trips].map(x => x.id))
        const gone = [...s.items, ...s.vehicles, ...s.orders, ...s.trips].map(x => x.id).filter(id => !alive.has(id))
        const deleted = mark(marks(s.deleted, d.deleted), [...gone, ...dropped])
        alive.forEach(id => delete deleted[id])
        return { items: d.items, vehicles: d.vehicles, pallet: d.pallet, trips, orders, deleted }
      }),
      importBatch: d => set(s => {
        if (blocked()) return {}
        const now = Date.now()
        const put = <T extends { id: string }>(list: T[], add: T[], extra: Partial<T>) => add.reduce((l, x) => upsert(l, { ...x, ...extra, updatedAt: now }), list)
        const mark2 = <T extends { id: string; by?: string; madeBy?: string }>(list: T[], add: T[]) =>
          add.map(x => who(x, !list.some(y => y.id === x.id)))
        // file nhập có ghi đè đơn mẫu / gắn đơn mẫu vào chuyến khác ⇒ vẫn giữ chuyến mẫu nguyên gốc
        const { trips, orders, dropped } = resetSamples({ orders: put(s.orders, mark2(s.orders, d.orders), {}), trips: put(s.trips, mark2(s.trips, d.trips), {}) })
        const lock = catalogLocked()   // thành viên Family: file có mã hàng / xe thì bỏ phần đó
        return {
          items: lock ? s.items : put(s.items, d.items, { owner: 'me' } as Partial<Item>),
          vehicles: lock ? s.vehicles : put(s.vehicles, d.vehicles, { owner: 'me' } as Partial<Vehicle>),
          trips, orders, deleted: mark(s.deleted, dropped),
        }
      }),
    }),
    {
      name: dataKey(useSpace.getState().id), storage: createJSONStorage(() => safeStorage),
      partialize: s => ({ items: s.items, vehicles: s.vehicles, orders: s.orders, trips: s.trips, pallet: s.pallet, deleted: s.deleted }),
      // máy đã lỡ xoá / sửa chuyến mẫu ở bản trước ⇒ mở app là chuyến mẫu về gốc (bản đã sửa thành chuyến mới)
      merge: (saved, cur) => {
        const s = { ...cur, ...(saved as Partial<DataState>) }
        const { trips, orders, dropped } = resetSamples(s)
        return { ...s, trips, orders, deleted: mark(s.deleted ?? {}, dropped) }
      },
    },
  ),
)

// Hai tab / app cài + tab trình duyệt trên cùng máy: mỗi tab giữ một bản trong bộ nhớ và lưu là ghi đè CẢ BỘ ⇒ tab cũ
// lưu là xoá mất thay đổi của tab kia (thử 31/10: thêm mã ở tab A, sửa số ở tab B, tải lại A ⇒ mã của A mất).
// Tab khác vừa lưu ⇒ nạp lại ngay (nạp lại không ghi ngược ra, không thành vòng qua lại giữa hai tab).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => { if (e.key === useData.persist.getOptions().name) void useData.persist.rehydrate() })
}

const EMPTY = { items: [], vehicles: [], orders: SAMPLE_ORDERS, trips: SAMPLE_TRIPS, pallet: DEFAULT_PALLET_SETTINGS, deleted: {} }
/** Mở bộ dữ liệu khác TRÊN MÁY NÀY (bản đã lưu trên máy; chưa có thì bộ trống + chuyến mẫu). cloud.ts gọi rồi kéo bản trên
 *  máy chủ về. */
export async function openSpace(info: SpaceInfo) {
  useSpace.setState(info, true)
  const key = dataKey(info.id)
  if (useData.persist.getOptions().name === key) return
  // xoá dấu tách chuyến TRƯỚC khi đổi chỗ lưu (mỗi lần đổi trạng thái là ghi cả bộ vào chỗ lưu đang trỏ)
  useData.setState({ fork: null })
  useData.persist.setOptions({ name: key })
  if (safeStorage.getItem(key) != null) await useData.persist.rehydrate()
  else useData.setState(EMPTY)
}
/** Thêm / ghi đè mã hàng, xe vào bộ "Của tôi" khi đang mở bộ khác (nhập Excel, dòng "Của tôi"): ghi thẳng bản lưu trên máy;
 *  lần tới mở "Của tôi" app tự gộp lên tài khoản (`pull` lúc mở bộ). */
export function saveToMine(d: ImportBatch) {
  const key = dataKey('me'), now = Date.now()
  let saved: { state?: Partial<BackupData>; version?: number } | null = null
  try { saved = JSON.parse(safeStorage.getItem(key) ?? 'null') } catch { /* hỏng ⇒ bộ trống */ }
  const s = { ...EMPTY, ...saved?.state }
  const put = <T extends { id: string }>(list: T[], add: T[]) => add.reduce((l, x) => upsert(l, { ...x, owner: 'me', updatedAt: now } as T), list)
  const stamp = <T extends { id: string }>(list: T[], add: T[]) => add.reduce((l, x) => upsert(l, { ...x, updatedAt: now }), list)
  safeStorage.setItem(key, JSON.stringify({ state: { ...s, items: put(s.items, d.items), vehicles: put(s.vehicles, d.vehicles), orders: stamp(s.orders, d.orders), trips: stamp(s.trips, d.trips) }, version: saved?.version ?? 0 }))
}
/** Đăng xuất / đổi tài khoản: bộ "Của tôi" trên máy về như máy mới, để người sau không gộp phải dữ liệu người trước. KHÔNG dùng
 *  `replaceAll` — nó ghi dấu đã xoá, gộp lên tài khoản sẽ xoá thật. */
export function resetMine() {
  if (useSpace.getState().id === 'me') useData.setState({ ...EMPTY, fork: null })
  else safeStorage.removeItem(dataKey('me'))
}
/** Bỏ bản lưu trên máy của một Family (đăng xuất / rời / bị bỏ khỏi Family). */
export const dropSpace = (id: string) => { if (id !== 'me') safeStorage.removeItem(dataKey(id)) }
/** Cả bộ "Của tôi" khi đang mở bộ khác (đọc bản lưu trên máy) — nhập Excel so trùng + tra mã theo bộ này. */
export function mySet(): { items: Item[]; vehicles: Vehicle[]; orders: Order[]; trips: Trip[] } {
  try {
    const s = JSON.parse(safeStorage.getItem(dataKey('me')) ?? 'null')?.state
    if (s) return { items: s.items ?? [], vehicles: s.vehicles ?? [], orders: s.orders ?? [], trips: s.trips ?? [] }
  } catch { /* hỏng ⇒ trống */ }
  return { items: [], vehicles: [], orders: [], trips: [] }
}
/** Mã hàng, xe, cỡ pallet của bộ "Của tôi" (đang mở bộ khác thì đọc bản lưu trên máy) — chép sang Family mới tạo. */
export function myCatalog(): Pick<BackupData, 'items' | 'vehicles' | 'pallet'> {
  if (useSpace.getState().id === 'me') { const s = useData.getState(); return { items: s.items, vehicles: s.vehicles, pallet: s.pallet } }
  try {
    const s = JSON.parse(safeStorage.getItem(dataKey('me')) ?? 'null')?.state
    if (s) return { items: s.items ?? [], vehicles: s.vehicles ?? [], pallet: s.pallet ?? DEFAULT_PALLET_SETTINGS }
  } catch { /* hỏng ⇒ trống */ }
  return { items: [], vehicles: [], pallet: DEFAULT_PALLET_SETTINGS }
}

// ── Mẫu chung: admin sửa trên giao diện, lưu ở máy chủ (cloud.ts nạp về). Chưa nối máy chủ
//    hoặc đang mất mạng ⇒ dùng bản mặc định đóng gói trong catalog.ts / bản đã nạp lần trước.
export const useCatalog = create<{ items: Item[]; vehicles: Vehicle[] }>(() => ({ items: ADMIN_ITEMS, vehicles: ADMIN_VEHICLES }))

// ── Tra cứu: mẫu chung + của tôi ────────────────────────────────────────────
export function useAllItems(): Item[] {
  const mine = useData(s => s.items)
  const shared = useCatalog(s => s.items)
  return useMemo(() => [...mine, ...shared], [mine, shared])
}
export function useAllVehicles(): Vehicle[] {
  const mine = useData(s => s.vehicles)
  const shared = useCatalog(s => s.vehicles)
  return useMemo(() => [...mine, ...shared], [mine, shared])
}
export const findItem = (items: Item[], id: string) => items.find(x => x.id === id)
export const findVehicle = (vs: Vehicle[], id: string | null) => (id ? vs.find(x => x.id === id) : undefined)

export function exportBackup(): BackupData {
  const s = useData.getState()
  return { app: 'malcargo', version: 1, items: s.items, vehicles: s.vehicles, orders: s.orders, trips: s.trips, pallet: s.pallet, deleted: s.deleted }
}

export function parseBackup(text: string): BackupData | string {
  let d: unknown
  try { d = JSON.parse(text) } catch { return t('File không đọc được (không phải file sao lưu của app).') }
  const b = d as Partial<BackupData>
  if (!b || b.app !== 'malcargo' || !Array.isArray(b.items) || !Array.isArray(b.vehicles)
    || !Array.isArray(b.orders) || !Array.isArray(b.trips) || !b.pallet)
    return t('File không phải bản sao lưu của MalCargo.')
  return b as BackupData
}

/** Gộp dữ liệu trên máy vào dữ liệu tài khoản khi đăng nhập: cùng id thì giữ bản sửa sau cùng;
 *  bị xoá (ở máy nào cũng vậy) sau lần sửa cuối ⇒ bỏ. */
export function mergeBackup(a: BackupData, b: BackupData): BackupData {
  const deleted = marks(a.deleted, b.deleted), dead = deadIn(deleted)
  const mergeList = <T extends { id: string; updatedAt: number }>(x: T[], y: T[]) => {
    const m = new Map(y.map(v => [v.id, v]))
    for (const v of x) { const o = m.get(v.id); if (!o || v.updatedAt > o.updatedAt) m.set(v.id, v) }
    return [...m.values()].filter(v => !dead(v))
  }
  const orders = mergeList(a.orders, b.orders), alive = new Set(orders.map(o => o.id))
  const gone = (o: string) => o in deleted && !alive.has(o)
  return {
    app: 'malcargo', version: 1, pallet: b.pallet ?? a.pallet, deleted,
    items: mergeList(a.items, b.items), vehicles: mergeList(a.vehicles, b.vehicles), orders,
    // chuyến bản máy kia còn trỏ tới đơn đã xoá ⇒ gỡ ra
    trips: mergeList(a.trips, b.trips).map(t => (t.orderIds.some(gone) ? { ...t, orderIds: t.orderIds.filter(o => !gone(o)) } : t)),
  }
}

// ── ĐỒNG BỘ TỪNG BẢN GHI (chủ dự án 10/11): máy chỉ gửi phần đã đổi so với bản máy chủ đang có, kéo về chỉ phần mới.
//    `Synced` = máy chủ đang có gì (id → updatedAt, dấu xoá, cỡ pallet) — dựng lại mỗi lần kéo cả bộ, cập nhật sau mỗi lần gửi / nhận.
export interface Synced { recs: Record<string, number>; del: Deleted; pallet: string }
type Rec = { id: string; updatedAt: number }
const recsOf = (d: Partial<BackupData>): Rec[] => [...(d.items ?? []), ...(d.vehicles ?? []), ...(d.orders ?? []), ...(d.trips ?? [])]
export const syncedOf = (d: BackupData): Synced =>
  ({ recs: Object.fromEntries(recsOf(d).map(x => [x.id, x.updatedAt])), del: { ...(d.deleted ?? {}) }, pallet: JSON.stringify(d.pallet) })

/** Phần đã đổi so với máy chủ (null = không có gì). `catalog` = false (thành viên Family): không gửi mã hàng, xe, cỡ pallet. */
export function changesSince(d: BackupData, s: Synced | null, catalog = true): Partial<BackupData> | null {
  const pick = <T extends Rec>(l: T[]) => l.filter(x => s?.recs[x.id] !== x.updatedAt)
  const out: Partial<BackupData> = {}
  const items = catalog ? pick(d.items) : [], vehicles = catalog ? pick(d.vehicles) : [], orders = pick(d.orders), trips = pick(d.trips)
  const del = Object.fromEntries(Object.entries(d.deleted ?? {}).filter(([k, at]) => s?.del[k] !== at))
  if (items.length) out.items = items
  if (vehicles.length) out.vehicles = vehicles
  if (orders.length) out.orders = orders
  if (trips.length) out.trips = trips
  if (Object.keys(del).length) out.deleted = del
  if (catalog && JSON.stringify(d.pallet) !== s?.pallet) out.pallet = d.pallet
  return Object.keys(out).length ? out : null
}

/** Máy chủ đã nhận / vừa gửi về phần `c` ⇒ ghi vào bản "máy chủ đang có". */
export function markSynced(s: Synced | null, c: Partial<BackupData>): Synced {
  return {
    recs: { ...s?.recs, ...Object.fromEntries(recsOf(c).map(x => [x.id, x.updatedAt])) },
    del: { ...s?.del, ...c.deleted },
    pallet: c.pallet ? JSON.stringify(c.pallet) : s?.pallet ?? '',
  }
}

/** Gộp phần mới từ máy chủ vào bộ trên máy — như mergeBackup: bản ghi sửa sau thắng, dấu xoá giữ tác dụng; thay đổi chưa
 *  gửi của máy này (mới hơn) giữ nguyên. Cỡ pallet: máy chủ có bản mới mà máy này chưa sửa cỡ ⇒ lấy của máy chủ. */
export function applyChanges(local: BackupData, inc: Partial<BackupData>, s: Synced | null): BackupData {
  const remote: BackupData = {
    app: 'malcargo', version: 1, items: inc.items ?? [], vehicles: inc.vehicles ?? [], orders: inc.orders ?? [], trips: inc.trips ?? [],
    pallet: local.pallet, deleted: inc.deleted ?? {},
  }
  const m = mergeBackup(remote, local)
  if (inc.pallet && JSON.stringify(local.pallet) === s?.pallet) m.pallet = inc.pallet
  return m
}

/** Tên kế tiếp kiểu "Đơn 3" — đếm theo số lớn nhất đang có, không theo số lượng. */
export function nextName(prefix: string, names: string[]): string {
  let max = 0
  const re = new RegExp(`^${prefix} (\\d+)$`)
  for (const n of names) { const m = re.exec(n); if (m) max = Math.max(max, Number(m[1])) }
  return `${prefix} ${max + 1}`
}
