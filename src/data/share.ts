// CHIA SẺ CHUYẾN bằng link ngắn (…/s/<mã>): người gửi (đã đăng nhập) đưa BẢN CHỤP chuyến lên máy chủ — chuyến, các đơn,
// mã hàng + xe dùng trong chuyến, cỡ pallet. Ai có link mở ra là lưu được BẢN SAO về dữ liệu của mình: id mới hết, sửa
// bản sao không đụng bản của người gửi. Mã hàng / xe bên người nhận đã có Y HỆT (mẫu chung, hay chính mình gửi) thì dùng
// lại, không đẻ trùng. Máy chủ (cloud.ts) chỉ cất / trả bản chụp theo mã — không liệt kê được.
import { create } from 'zustand'
import type { Item, Order, PalletSettings, Trip, Vehicle } from './types'
import { copyOrderName, isDefaultTripName, isSample, newId, tripCode, useCatalog, useData, type ImportBatch } from './store'

export interface SharePack {
  app: 'malcargo'; kind: 'trip'; version: 1
  trip: Trip; orders: Order[]; items: Item[]; vehicles: Vehicle[]; pallet: PalletSettings
}

/** Bản chụp chuyến `tripId` để chia sẻ (đơn theo thứ tự giao, chỉ mã hàng / xe chuyến dùng — kể cả mẫu chung). */
export function packTrip(tripId: string): SharePack | null {
  const s = useData.getState(), cat = useCatalog.getState()
  const trip = s.trips.find(x => x.id === tripId)
  if (!trip) return null
  const orders = trip.orderIds.map(id => s.orders.find(o => o.id === id)).filter((o): o is Order => !!o)
  const all = [...s.items, ...cat.items]
  const items = [...new Set(orders.flatMap(o => o.lines.map(l => l.itemId)))].map(id => all.find(x => x.id === id)).filter((x): x is Item => !!x)
  const v = [...s.vehicles, ...cat.vehicles].find(x => x.id === trip.vehicleId)
  return { app: 'malcargo', kind: 'trip', version: 1, trip, orders, items, vehicles: v ? [v] : [], pallet: s.pallet }
}

// ── Đọc bản chụp từ máy chủ: ai đăng nhập cũng ghi được ⇒ kiểm từng trường, chỉ giữ trường app biết, số phải trong khoảng ──
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const num = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
const opt = (v: unknown, lo: number, hi: number) => (num(v, lo, hi) ? v : null)
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '')
const id = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length <= 80 ? v : null)

function cleanItem(x: unknown): Item | null {
  if (!isObj(x) || !id(x.id) || !num(x.l, 1, 20000) || !num(x.w, 1, 20000) || !num(x.h, 1, 20000)) return null
  return {
    id: x.id as string, owner: 'me', code: str(x.code, 60), name: str(x.name), l: x.l, w: x.w, h: x.h,
    kg: opt(x.kg, 0, 100000), perPallet: opt(x.perPallet, 1, 100000), maxLayers: opt(x.maxLayers, 1, 1000),
    looseLayers: opt(x.looseLayers, 1, 1000), light: x.light === true, updatedAt: 0,
  }
}
function cleanVehicle(x: unknown): Vehicle | null {
  if (!isObj(x) || !id(x.id) || (x.kind !== 'loose' && x.kind !== 'pallet') || !num(x.l, 100, 30000) || !num(x.w, 100, 10000) || !num(x.h, 100, 10000)) return null
  return {
    id: x.id as string, owner: 'me', name: str(x.name), plate: str(x.plate, 30), kind: x.kind, l: x.l, w: x.w, h: x.h,
    payloadKg: opt(x.payloadKg, 0, 1000000), ...(x.container === true ? { container: true } : {}), updatedAt: 0,
  }
}
function cleanOrder(x: unknown): Order | null {
  if (!isObj(x) || !id(x.id) || !Array.isArray(x.lines)) return null
  const lines = x.lines.slice(0, 500).filter((l): l is { itemId: string; qty: number } => isObj(l) && !!id(l.itemId) && num(l.qty, 0, 1e6))
    .map(l => ({ itemId: l.itemId, qty: Math.round(l.qty) }))
  return { id: x.id as string, name: str(x.name), place: str(x.place), lines, updatedAt: 0 }
}

/** Bản chụp hợp lệ hay không (null = hỏng / không phải chuyến chia sẻ của app). */
export function cleanPack(x: unknown): SharePack | null {
  if (!isObj(x) || x.app !== 'malcargo' || x.kind !== 'trip' || !isObj(x.trip) || !Array.isArray(x.trip.orderIds)) return null
  const t = x.trip
  const list = <T,>(v: unknown, f: (y: unknown) => T | null, max: number) => (Array.isArray(v) ? v.slice(0, max).map(f).filter((y): y is T => !!y) : [])
  const p = isObj(x.pallet) ? x.pallet : {}
  return {
    app: 'malcargo', kind: 'trip', version: 1,
    trip: {
      id: id(t.id) ?? 'trip', name: str(t.name, 80), ...(typeof t.code === 'string' ? { code: str(t.code, 40) } : {}),
      vehicleId: id(t.vehicleId), orderIds: (t.orderIds as unknown[]).slice(0, 200).map(id).filter((y): y is string => !!y),
      ...(t.lightOwnPallet === true ? { lightOwnPallet: true } : {}), updatedAt: 0,
    },
    orders: list(x.orders, cleanOrder, 200), items: list(x.items, cleanItem, 1000), vehicles: list(x.vehicles, cleanVehicle, 5),
    pallet: {
      l: opt(p.l, 100, 5000) ?? 1200, w: opt(p.w, 100, 5000) ?? 1000, maxH: opt(p.maxH, 100, 5000) ?? 1650,
      baseH: opt(p.baseH, 0, 1000) ?? 150, kg: opt(p.kg, 0, 1000) ?? 25,
      ...(opt(p.gap, 0, 500) != null ? { gap: opt(p.gap, 0, 500)! } : {}),
    },
  }
}

// ── Lưu bản sao ──────────────────────────────────────────────────────────────────────────────────────────────────
const code = (s: string) => s.trim().toLowerCase()
// mã y hệt — hoặc bản đã chép từ link lần trước, bị thêm đuôi "-2" vì trùng một mã khác của mình
const sameCode = (mine: string, theirs: string) => {
  const m = code(mine), t = code(theirs)
  return m === t || (m.startsWith(`${t}-`) && /^\d+$/.test(m.slice(t.length + 1)))
}
const sameItem = (mine: Item, theirs: Item) => sameCode(mine.code, theirs.code)
  && mine.l === theirs.l && mine.w === theirs.w && mine.h === theirs.h && (mine.kg ?? null) === (theirs.kg ?? null)
  && (mine.perPallet ?? null) === (theirs.perPallet ?? null) && (mine.maxLayers ?? null) === (theirs.maxLayers ?? null)
  && (mine.looseLayers ?? null) === (theirs.looseLayers ?? null) && !!mine.light === !!theirs.light
const sameVehicle = (a: Vehicle, b: Vehicle) => a.kind === b.kind && a.l === b.l && a.w === b.w && a.h === b.h
  && (a.payloadKg ?? null) === (b.payloadKg ?? null) && !!a.container === !!b.container
  && (a.plate ?? '').trim().toUpperCase() === (b.plate ?? '').trim().toUpperCase()

type Mine = { items: Item[]; vehicles: Vehicle[]; orders: Order[]; trips: Trip[] }
type Shared = { items: Item[]; vehicles: Vehicle[] }

/** Bản sao chuyến chia sẻ thành một lần nhập (id mới hết). Mã hàng / xe đã có y hệt (của tôi hoặc mẫu chung) ⇒ dùng lại;
 *  chưa có ⇒ thêm thành của tôi (mã trùng mã khác của tôi ⇒ thêm đuôi "-2"). Đơn tên mặc định ⇒ "Đơn N" kế tiếp bên mình. */
export function shareBatch(p: SharePack, mine: Mine, shared: Shared): { batch: ImportBatch; tripId: string } {
  const now = Date.now()
  const itemOf = new Map<string, string>(), items: Item[] = []
  const pool = [...mine.items, ...shared.items]
  const codes = new Set(mine.items.map(i => code(i.code)))
  for (const it of p.items) {
    const hit = pool.find(x => x.id === it.id && sameItem(x, it)) ?? pool.find(x => sameItem(x, it))
    if (hit) { itemOf.set(it.id, hit.id); continue }
    const base = it.code.trim() || '?'
    let c = base
    for (let n = 2; codes.has(code(c)); n++) c = `${base}-${n}`
    codes.add(code(c))
    const x: Item = { ...it, id: newId(), owner: 'me', code: c, updatedAt: now }
    items.push(x); pool.push(x); itemOf.set(it.id, x.id)
  }
  const vehicles: Vehicle[] = []
  let vehicleId: string | null = null
  const v = p.vehicles.find(x => x.id === p.trip.vehicleId)
  if (v) {
    const vp = [...mine.vehicles, ...shared.vehicles]
    const hit = vp.find(x => x.id === v.id && sameVehicle(x, v)) ?? vp.find(x => x.name === v.name && sameVehicle(x, v)) ?? vp.find(x => sameVehicle(x, v))
    if (hit) vehicleId = hit.id
    else { const x: Vehicle = { ...v, id: newId(), owner: 'me', updatedAt: now }; vehicles.push(x); vehicleId = x.id }
  }
  const names = mine.orders.map(o => o.name)
  const orders: Order[] = p.trip.orderIds.map(oid => p.orders.find(o => o.id === oid)).filter((o): o is Order => !!o).map(o => {
    const name = copyOrderName(o.name, names)
    names.push(name)
    return { id: newId(), name, place: o.place, lines: o.lines.filter(l => itemOf.has(l.itemId)).map(l => ({ itemId: itemOf.get(l.itemId)!, qty: l.qty })), updatedAt: now }
  })
  const tc = tripCode(mine.trips)
  const trip: Trip = {
    id: newId(), code: tc, name: !p.trip.name.trim() || isDefaultTripName(p.trip.name) ? tc : p.trip.name,
    vehicleId, orderIds: orders.map(o => o.id), ...(p.trip.lightOwnPallet ? { lightOwnPallet: true } : {}), updatedAt: now,
  }
  return { batch: { items, vehicles, orders, trips: [trip] }, tripId: trip.id }
}

/** Bản sao cần thêm mã hàng / xe vào dữ liệu đang mở không (thành viên Family không thêm được ⇒ lưu vào "Của tôi"). */
export function shareNeedsCatalog(p: SharePack): boolean {
  const { batch } = shareBatch(p, useData.getState(), useCatalog.getState())
  return batch.items.length + batch.vehicles.length > 0
}

/** Lưu bản sao vào bộ dữ liệu đang mở ⇒ id chuyến để mở. */
export function adoptShare(p: SharePack): string {
  const s = useData.getState()
  const { batch, tripId } = shareBatch(p, s, useCatalog.getState())
  s.importBatch(batch)
  if (useData.getState().trips.some(t => t.id === tripId)) return tripId
  // bản sao Y HỆT một chuyến mẫu (người gửi chia sẻ chuyến mẫu chưa sửa) ⇒ kho tự dọn như bản sao rác — mở luôn chuyến
  // mẫu đó bên người nhận (ai cũng có sẵn)
  const st = useData.getState().trips
  return (st.find(t => t.id === p.trip.id) ?? st.find(t => isSample(t.id) && t.vehicleId === p.trip.vehicleId) ?? st.find(t => isSample(t.id)) ?? st[0]).id
}

// ── Link: mở app bằng …/s/<mã> ⇒ ghi nhận mã (tấm "Chuyến được chia sẻ" mở ra), đưa địa chỉ về trang gốc ─────────────
export const useShareInbox = create<{ code: string | null }>(() => ({ code: null }))
const LINK = /^\/s\/([A-Za-z0-9_-]{6,40})\/?$/
export function catchShareLink() {
  const m = LINK.exec(location.pathname)
  if (!m) return
  useShareInbox.setState({ code: m[1] })
  history.replaceState(history.state, '', '/' + location.search + location.hash)
}
export const shareUrl = (code: string) => `${location.origin}/s/${code}`
