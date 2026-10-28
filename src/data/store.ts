// Kho dữ liệu của người dùng — luôn lưu trong máy (localStorage). Đã đăng nhập thì cloud.ts nghe mọi
// thay đổi ở đây và đẩy lên tài khoản.
import { useMemo } from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import type { Item, Order, PalletSettings, Trip, Vehicle } from './types'
import { t } from '../i18n'
import { ADMIN_ITEMS, ADMIN_VEHICLES, DEFAULT_PALLET_SETTINGS, SAMPLE_ORDERS, SAMPLE_TRIPS } from './catalog'

export const newId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

// Trình duyệt chặn bộ nhớ (chế độ riêng tư, xem trước…) thì app vẫn chạy, chỉ không nhớ.
const memory = new Map<string, string>()
const safeStorage: StateStorage = {
  getItem: k => { try { return localStorage.getItem(k) } catch { return memory.get(k) ?? null } },
  setItem: (k, v) => { try { localStorage.setItem(k, v) } catch { memory.set(k, v) } },
  removeItem: k => { try { localStorage.removeItem(k) } catch { memory.delete(k) } },
}

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

// ── CHUYẾN MẪU (+ 2 đơn của nó) luôn giữ nguyên: không xoá được, và sửa bất cứ gì trên nó thì app tự TÁCH
//    thành một chuyến mới (mã ddmmyy-hhmm-stt) mang thay đổi đó; chọn lại chuyến mẫu là thấy bản gốc.
export const isSample = (id: string) => id.startsWith('sample-')
const SAMPLE_TRIP = SAMPLE_TRIPS[0]

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
    map[oid] = newId(); orders.push({ ...src, id: map[oid], updatedAt: now })
  }
  const t: Trip = {
    ...trip, id: newId(), code, name: trip.name === SAMPLE_TRIP.name ? code : trip.name,
    orderIds: trip.orderIds.map(o => map[o] ?? o).filter(o => !isSample(o)), updatedAt: now,
  }
  return { trip: t, orders, fork: { from: SAMPLE_TRIP.id, to: t.id, orders: map, seen: false } as ForkInfo }
}

/** Chuyến THƯỜNG không giữ đơn mẫu (sửa đơn đó sẽ đụng chuyến mẫu): gặp thì sao ra đơn riêng. */
function detachSampleOrders(s: TO, t: Trip): { trip: Trip; added: Order[] } {
  const added: Order[] = []
  const orderIds = t.orderIds.map(oid => {
    if (!isSample(oid)) return oid
    const src = s.orders.find(o => o.id === oid) ?? SAMPLE_ORDERS.find(o => o.id === oid)
    if (!src) return oid
    const o = { ...src, id: newId(), updatedAt: Date.now() }
    added.push(o); return o.id
  })
  return { trip: added.length ? { ...t, orderIds } : t, added }
}

// Hàng của 2 đơn mẫu ĐỜI TRƯỚC (đồ tiêu dùng chung, thay bằng hàng sữa ngày 27/10/2026)
const OLD_SAMPLE_LINES: Record<string, Order['lines']> = {
  'sample-o1': [{ itemId: 'adm-i-chai', qty: 120 }, { itemId: 'adm-i-lon', qty: 160 }, { itemId: 'adm-i-banh', qty: 30 }],
  'sample-o2': [{ itemId: 'adm-i-mi', qty: 90 }, { itemId: 'adm-i-dau', qty: 60 }],
}

/** Nạp dữ liệu (mở app, nạp file, đồng bộ): chuyến mẫu đã bị sửa ở bản cũ ⇒ giữ thay đổi thành chuyến mới, mẫu về gốc. */
function resetSamples(d: TO): TO {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  let { trips, orders } = d
  const st = trips.find(t => t.id === SAMPLE_TRIP.id)
  // khớp bản mẫu hiện tại HOẶC bản mẫu đời trước (chưa ai sửa) ⇒ chỉ thay mẫu, không tách chuyến
  const pristine = (o: Order, p: Order) => same([o.name, o.place, o.lines], [p.name, p.place, p.lines]) || same(o.lines, OLD_SAMPLE_LINES[o.id])
  const changed = st && (!same([st.name, st.vehicleId, st.orderIds], [SAMPLE_TRIP.name, SAMPLE_TRIP.vehicleId, SAMPLE_TRIP.orderIds])
    || SAMPLE_ORDERS.some(p => { const o = orders.find(x => x.id === p.id); return o && !pristine(o, p) }))
  if (st && changed) { const k = makeFork({ trips, orders }, st); trips = [k.trip, ...trips]; orders = [...k.orders, ...orders] }
  trips = trips.filter(t => !isSample(t.id)).map(t => {
    const k = detachSampleOrders({ trips, orders }, t); orders = [...k.added, ...orders]; return k.trip
  })
  return { trips: [...trips, ...SAMPLE_TRIPS], orders: [...orders.filter(o => !isSample(o.id)), ...SAMPLE_ORDERS] }
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
      upsertItem: it => set(s => ({ items: upsert(s.items, { ...it, owner: 'me', updatedAt: Date.now() }) })),
      removeItem: id => set(s => ({ items: s.items.filter(x => x.id !== id), deleted: mark(s.deleted, [id]) })),
      upsertVehicle: v => set(s => ({ vehicles: upsert(s.vehicles, { ...v, owner: 'me', updatedAt: Date.now() }) })),
      removeVehicle: id => set(s => ({
        vehicles: s.vehicles.filter(x => x.id !== id),
        trips: s.trips.map(t => (t.vehicleId === id ? { ...t, vehicleId: null } : t)),
        deleted: mark(s.deleted, [id]),
      })),
      fork: null,
      upsertOrder: o => set(s => {
        const now = Date.now()
        if (!isSample(o.id)) return { orders: upsert(s.orders, { ...o, updatedAt: now }) }
        // đơn mẫu bị sửa: vừa tách xong (cùng một thao tác sửa nhiều đơn) ⇒ ghi vào bản sao; chưa tách ⇒ tách
        const f = s.fork
        if (f && !f.seen && f.orders[o.id]) return { orders: upsert(s.orders, { ...o, id: f.orders[o.id], updatedAt: now }) }
        const k = makeFork(s, s.trips.find(t => t.id === SAMPLE_TRIP.id) ?? SAMPLE_TRIP, o)
        return { trips: [k.trip, ...s.trips], orders: [...k.orders, ...s.orders], fork: k.fork }
      }),
      removeOrder: id => set(s => (isSample(id) ? {} : {
        orders: s.orders.filter(x => x.id !== id),
        trips: s.trips.map(t => ({ ...t, orderIds: t.orderIds.filter(o => o !== id) })),
        deleted: mark(s.deleted, [id]),
      })),
      upsertTrip: t => set(s => {
        const now = Date.now()
        if (!isSample(t.id)) {
          const k = detachSampleOrders(s, t)
          return { trips: upsert(s.trips, { ...k.trip, updatedAt: now }), ...(k.added.length ? { orders: [...k.added, ...s.orders] } : {}) }
        }
        const f = s.fork
        if (f && !f.seen && f.from === t.id) {
          const cur = s.trips.find(x => x.id === f.to)
          return { trips: upsert(s.trips, {
            ...t, id: f.to, code: cur?.code, name: t.name === SAMPLE_TRIP.name ? cur?.name ?? t.name : t.name,
            orderIds: t.orderIds.map(o => f.orders[o] ?? o), updatedAt: now,
          }) }
        }
        const k = makeFork(s, t)
        return { trips: [k.trip, ...s.trips], orders: [...k.orders, ...s.orders], fork: k.fork }
      }),
      removeTrip: id => set(s => (isSample(id) ? {} : { trips: s.trips.filter(x => x.id !== id), deleted: mark(s.deleted, [id]) })),
      // dọn đơn / chuyến nháp trống, trừ những cái đang mở (`keep`) và đơn nằm trong chuyến đang mở
      sweepBlank: keep => set(s => {
        const k = new Set(keep)
        s.trips.forEach(t => { if (k.has(t.id)) t.orderIds.forEach(o => k.add(o)) })
        const dropO = s.orders.filter(o => !k.has(o.id) && isBlankOrder(o)).map(o => o.id)
        const orders = s.orders.filter(o => !dropO.includes(o.id))
        const alive = new Set(orders.map(o => o.id))
        const dropT = s.trips.filter(t => !k.has(t.id) && isBlankTrip(t, alive)).map(t => t.id)
        if (!dropO.length && !dropT.length) return s   // y nguyên ⇒ không báo đổi, không đẩy lên tài khoản
        return {
          orders, deleted: mark(s.deleted, [...dropO, ...dropT]),
          trips: s.trips.filter(t => !dropT.includes(t.id)).map(t => (t.orderIds.some(o => dropO.includes(o)) ? { ...t, orderIds: t.orderIds.filter(o => !dropO.includes(o)) } : t)),
        }
      }),
      markForkSeen: () => set(s => (s.fork ? { fork: { ...s.fork, seen: true } } : {})),
      setPallet: pallet => set({ pallet }),
      // thay cả bộ (nạp file, xoá hết, bản từ tài khoản): thứ biến mất ⇒ đánh dấu đã xoá; thứ có trong bộ mới ⇒ bỏ dấu
      replaceAll: d => set(s => {
        const next = resetSamples(d)
        const alive = new Set([...d.items, ...d.vehicles, ...next.orders, ...next.trips].map(x => x.id))
        const gone = [...s.items, ...s.vehicles, ...s.orders, ...s.trips].map(x => x.id).filter(id => !alive.has(id))
        const deleted = mark(marks(s.deleted, d.deleted), gone)
        alive.forEach(id => delete deleted[id])
        return { items: d.items, vehicles: d.vehicles, pallet: d.pallet, ...next, deleted }
      }),
      importBatch: d => set(s => {
        const now = Date.now()
        const put = <T extends { id: string }>(list: T[], add: T[], extra: Partial<T>) => add.reduce((l, x) => upsert(l, { ...x, ...extra, updatedAt: now }), list)
        return {
          items: put(s.items, d.items, { owner: 'me' } as Partial<Item>),
          vehicles: put(s.vehicles, d.vehicles, { owner: 'me' } as Partial<Vehicle>),
          // file nhập có ghi đè đơn mẫu / gắn đơn mẫu vào chuyến khác ⇒ vẫn giữ chuyến mẫu nguyên gốc
          ...resetSamples({ orders: put(s.orders, d.orders, {}), trips: put(s.trips, d.trips, {}) }),
        }
      }),
    }),
    {
      name: 'malcargo-data-v1', storage: createJSONStorage(() => safeStorage),
      partialize: s => ({ items: s.items, vehicles: s.vehicles, orders: s.orders, trips: s.trips, pallet: s.pallet, deleted: s.deleted }),
      // máy đã lỡ xoá / sửa chuyến mẫu ở bản trước ⇒ mở app là chuyến mẫu về gốc (bản đã sửa thành chuyến mới)
      merge: (saved, cur) => {
        const s = { ...cur, ...(saved as Partial<DataState>) }
        return { ...s, ...resetSamples(s) }
      },
    },
  ),
)

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

/** Tên kế tiếp kiểu "Đơn 3" — đếm theo số lớn nhất đang có, không theo số lượng. */
export function nextName(prefix: string, names: string[]): string {
  let max = 0
  const re = new RegExp(`^${prefix} (\\d+)$`)
  for (const n of names) { const m = re.exec(n); if (m) max = Math.max(max, Number(m[1])) }
  return `${prefix} ${max + 1}`
}
