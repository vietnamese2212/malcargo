// Ghép dữ liệu của người dùng (xe · mã hàng · đơn) vào thuật toán xếp — cùng trình tự với màn 3D
// của SUPPLYC: xe xá xếp thẳng thùng; xe pallet gom hàng lên pallet trước, hàng nhẹ rải lên nóc
// pallet (hoặc đóng pallet như hàng khác nếu chuyến bật vậy). File này THUẦN (không React) để chạy được trong Web Worker và trong bài kiểm.
import {
  computeLoadPlan, palletizeGroups, spreadOnTopOfPallets, palletFitError, palletsTooTall,
  palletFloorSlots, type LoadGroup, type LoadPlan, type PalletSpec, type PalletizeInput,
} from './loadPlan'
import type { Item, PalletSettings, VehicleKind } from '../data/types'

export interface TruckInput { id: string; name: string; kind: VehicleKind; l: number; w: number; h: number; payloadKg: number | null }
export interface OrderInput { id: string; name: string; place: string; lines: { item: Item; qty: number }[] }
export interface TripInput {
  truck: TruckInput; orders: OrderInput[]; pallet: PalletSettings
  lightInPallet?: boolean   // xe pallet: hàng nhẹ đóng pallet như hàng khác thay vì rải thùng lên nóc pallet
}

export interface PlanGroupMeta {
  label: string
  orderName: string
  itemId: string | null      // null = pallet gộp nhiều mã
  isPallet: boolean          // khối là 1 PALLET (xe pallet)
  colorKey: string
  holds?: string[]           // pallet gộp: id các mã nằm trong khối này
  layers?: PalletLayer[]     // pallet: các lớp thùng THẬT từ dưới lên — vẽ 3D đúng cỡ thùng, đúng màu mã
  mix?: { itemId: string; label: string; n: number }[]   // pallet gộp: gồm mã nào, bao nhiêu thùng
}

/** Một lớp thùng trên pallet: `n` thùng cỡ l × w × h của một mã. */
export interface PalletLayer { itemId: string; l: number; w: number; h: number; n: number }

export interface CountRow {
  group: number
  label: string
  orderName: string
  unit: 'thùng' | 'pallet'
  placed: number
  total: number
  // Chân hàng: [số chân, số lớp] — vd [[36, 11], [4, 12]] = 36 chân cao 11 + 4 chân cao 12
  stacks: [number, number][]
  onTopOfOthers: boolean     // nằm trên nóc hàng khác (hàng nhẹ)
  firstStep: number
  mix?: { label: string; n: number }[]   // pallet gộp: gồm những mã nào
}

export interface TripResult {
  plan: LoadPlan
  meta: PlanGroupMeta[]
  count: CountRow[]
  totals: { cartons: number; kg: number; kgKnown: boolean; m3: number; pallets: number | null }
  weightKg: number
  payloadPct: number | null
  overweight: boolean
  fits: boolean
  floorSlots: number | null
  errors: string[]           // không vẽ được sơ đồ
  warnings: string[]
}

const toSpec = (p: PalletSettings): PalletSpec =>
  ({ l: p.l, w: p.w, h: p.maxH, baseH: p.baseH, baseColor: '#a07a4e', weightKg: p.kg })

type G = LoadGroup & { meta: PlanGroupMeta; topCarton?: boolean }

/** Gom đơn thành nhóm (đơn × mã). Đơn GIAO SAU xếp TRƯỚC (vào sâu trong, sát cabin). */
function cartonGroupsOf(orders: OrderInput[]): G[] {
  const out: G[] = []
  const loadOrder = [...orders].reverse()
  loadOrder.forEach((o, oi) => {
    const doKey = `${String(oi).padStart(3, '0')}|${o.id}`
    const byItem = new Map<string, G>()
    for (const ln of o.lines) {
      const it = ln.item
      if (!(ln.qty > 0)) continue
      const cur = byItem.get(it.id)
      if (cur) { cur.count += ln.qty; continue }
      const g: G = {
        key: `${doKey}|${it.id}`, label: it.name || it.code, doKey, doLabel: o.name,
        count: ln.qty, l: it.l, w: it.w, h: it.h, weightKg: it.kg, assumed: false,
        maxLayers: it.maxLayers, onTop: it.light,
        meta: { label: it.name || it.code, orderName: o.name, itemId: it.id, isPallet: false, colorKey: it.id },
      }
      byItem.set(it.id, g); out.push(g)
    }
  })
  return out
}

export function orderTotals(lines: { item: Item; qty: number }[], pallet: PalletSettings) {
  let cartons = 0, kg = 0, m3 = 0, kgKnown = true, palletKnown = true
  for (const { item, qty } of lines) {
    if (!(qty > 0)) continue
    cartons += qty
    m3 += (qty * item.l * item.w * item.h) / 1e9
    if (item.kg == null) kgKnown = false; else kg += qty * item.kg
    if (!item.perPallet) palletKnown = false
  }
  let pallets: number | null = null
  if (cartons > 0 && palletKnown) {
    const res = palletizeGroups(lines.filter(l => l.qty > 0).map(({ item, qty }) => ({
      key: item.id, label: item.name, doKey: 'o', doLabel: 'o', cartons: qty,
      cartonsPerPallet: item.perPallet, layers: item.maxLayers, isPalletCarrier: false, weightKg: item.kg,
      carton: { l: item.l, w: item.w, h: item.h }, assumed: false, unitless: false,
    })), toSpec(pallet))
    pallets = res.palletCount
  }
  return { cartons, kg, kgKnown, m3, pallets }
}

/** Đếm chân: gom thùng của từng nhóm theo vị trí (x,y) — mỗi vị trí là một chân. */
function countSheet(plan: LoadPlan, meta: PlanGroupMeta[]): CountRow[] {
  const rows: CountRow[] = []
  plan.groups.forEach((g, gi) => {
    const boxes = plan.placed.filter(b => b.group === gi)
    const left = plan.leftover.filter(x => x.group === gi).reduce((s, x) => s + x.count, 0)
    if (!boxes.length && !left) return
    const cols = new Map<string, number>()
    let lifted = false
    for (const b of boxes) {
      const k = `${Math.round(b.x)}|${Math.round(b.y)}`
      cols.set(k, (cols.get(k) ?? 0) + 1)
    }
    // Chân đứng trên nóc hàng KHÁC (hàng nhẹ / thùng nổi) — đáy thấp nhất của chân > 0
    const minZ = new Map<string, number>()
    for (const b of boxes) {
      const k = `${Math.round(b.x)}|${Math.round(b.y)}`
      minZ.set(k, Math.min(minZ.get(k) ?? Infinity, b.z))
    }
    for (const z of minZ.values()) if (z > 1) lifted = true
    const hist = new Map<number, number>()
    for (const n of cols.values()) hist.set(n, (hist.get(n) ?? 0) + 1)
    const stacks = [...hist.entries()].sort((a, b) => b[1] - a[1]).map(([layers, n]) => [n, layers] as [number, number])
    rows.push({
      group: gi, label: meta[gi].label, orderName: meta[gi].orderName,
      unit: meta[gi].isPallet ? 'pallet' : 'thùng',
      placed: boxes.length, total: boxes.length + left, stacks, onTopOfOthers: lifted,
      firstStep: boxes.length ? Math.min(...boxes.map(b => b.step)) : Infinity,
      ...(meta[gi].mix ? { mix: meta[gi].mix!.map(({ label, n }) => ({ label, n })) } : {}),
    })
  })
  return rows.sort((a, b) => a.firstStep - b.firstStep)
}

export function computeTrip(input: TripInput): TripResult {
  const { truck, orders, pallet } = input
  const T = { length: truck.l, width: truck.w, height: truck.h }
  const errors: string[] = []
  const warnings: string[] = []
  const cartons = cartonGroupsOf(orders)
  const allLines = orders.flatMap(o => o.lines)
  const totals = orderTotals(allLines, pallet)

  let groups: G[] = cartons
  let floorSlots: number | null = null
  let palletsUsed: number | null = null
  if (truck.kind === 'pallet') {
    const spec = toSpec(pallet)
    const fitErr = palletFitError(spec, T)
    if (fitErr) errors.push(fitErr)
    floorSlots = fitErr ? null : palletFloorSlots(spec, T)
    const itemOf = (g: G) => allLines.find(l => l.item.id === g.meta.itemId)?.item
    // Hàng nhẹ: mặc định rải thùng lên nóc pallet ("lên nóc" chỉ có nghĩa khi có pallet làm nền).
    // Chuyến bật "Hàng nhẹ đóng pallet" ⇒ đóng pallet như hàng khác (luật pallet của lõi: pallet chẵn,
    // phần lẻ tự đủ pallet thì pallet riêng, còn lại pallet gộp nặng dưới nhẹ trên).
    const hasBase = cartons.some(g => !g.onTop)
    const top = cartons.filter(g => g.onTop && hasBase && !input.lightInPallet)
    const toPal = cartons.filter(g => !top.includes(g))
    const items: PalletizeInput[] = toPal.map(g => ({
      key: g.key, label: g.label, doKey: g.doKey, doLabel: g.doLabel, cartons: g.count,
      cartonsPerPallet: itemOf(g)?.perPallet ?? null, layers: itemOf(g)?.maxLayers ?? null,
      isPalletCarrier: false, weightKg: g.weightKg, carton: { l: g.l, w: g.w, h: g.h }, assumed: false, unitless: false,
    }))
    const res = palletizeGroups(items, spec)
    palletsUsed = res.palletCount
    const missing = toPal.filter(g => !itemOf(g)?.perPallet)
    if (missing.length)
      warnings.push(`Chưa khai số thùng/pallet: ${[...new Set(missing.map(g => g.label))].join(', ')} — đang tạm tính mỗi mã 1 pallet.`)
    const srcByKey = new Map(toPal.map(g => [g.key, g]))
    const palGroups: G[] = res.groups.map(pg => {
      // ruột từ lõi (lớp thùng thật, dưới lên) — khoá dòng hàng ⇒ mã hàng
      const ls: PalletLayer[] | undefined = pg.contents?.map(c => ({ itemId: srcByKey.get(c.key)?.meta.itemId ?? c.key, l: c.l, w: c.w, h: c.h, n: c.n }))
      const ids = [...new Set((ls ?? []).map(x => x.itemId))]
      // pallet chẵn `|full` / pallet lẻ riêng `|plt` của 1 mã; khối gộp mà ruột chỉ 1 mã cũng mang tên + màu mã đó
      const src = srcByKey.get(pg.key.replace(/\|(full|plt)$/, '')) ?? (ids.length === 1 ? toPal.find(g => g.doKey === pg.doKey && g.meta.itemId === ids[0]) : undefined)
      const mixed = !src
      const mix = mixed && ls ? ids.map(id => ({
        itemId: id, label: allLines.find(l => l.item.id === id)?.item.name ?? id, n: ls.filter(x => x.itemId === id).reduce((s, x) => s + x.n, 0),
      })) : undefined
      return {
        ...pg,
        meta: {
          label: src && srcByKey.has(pg.key.replace(/\|(full|plt)$/, '')) ? `${src.label}${pg.key.endsWith('|plt') ? ' (pallet lẻ)' : ''}` : pg.label,
          orderName: pg.doLabel, itemId: src?.meta.itemId ?? null, isPallet: true,
          colorKey: src?.meta.itemId ?? `mix|${pg.doKey}`,
          ...(ls ? { layers: ls } : {}),
          ...(mixed ? { holds: mix ? mix.map(x => x.itemId) : toPal.filter(g => g.doKey === pg.doKey).map(g => g.meta.itemId!), mix } : {}),
        },
      }
    })
    groups = [...palGroups, ...top.map(g => ({ ...g, onTop: true, topCarton: true }))]
    if (!fitErr) {
      const tall = palletsTooTall(palGroups, T)
      if (tall.length) errors.push(`Pallet cao hơn lòng thùng xe: ${tall.join(', ')}.`)
    }
  }

  let plan: LoadPlan
  if (errors.length || !groups.length) {
    plan = { truck: T, groups, placed: [], leftover: groups.map((g, i) => ({ group: i, count: g.count })).filter(x => x.count > 0),
      stepCount: 0, volumePct: 0, placedCount: 0, totalCount: groups.reduce((s, g) => s + g.count, 0), weightKg: 0, lengthUsedPct: 0 }
  } else {
    const topIdx = groups.map((g, i) => (g.topCarton ? i : -1)).filter(i => i >= 0)
    if (!topIdx.length) plan = computeLoadPlan(T, groups)
    else plan = spreadOnTopOfPallets(computeLoadPlan(T, groups.map(g => (g.topCarton ? { ...g, count: 0 } : g))), topIdx, groups)
    // Dự phòng (đo 26/10): hàng nhẹ thùng TO hơn thùng nền nằm ở đơn xếp SAU bị thuật toán bỏ lại
    // toàn bộ dù xe còn chỗ — ca hiếm vì hàng nhẹ thường là túi / hộp nhỏ hơn thùng nền.
    // Không vá lõi (giữ bản chép khớp SUPPLYC): xếp lại các mã đó như hàng thường và NÓI RA.
    if (truck.kind === 'loose') {
      const stuck = new Set(plan.leftover.filter(x => groups[x.group].onTop).map(x => x.group))
      if (stuck.size) {
        const retry = computeLoadPlan(T, groups.map((g, i) => (stuck.has(i) ? { ...g, onTop: false } : g)))
        const leftOf = (p: LoadPlan) => p.leftover.reduce((s, x) => s + x.count, 0)
        if (leftOf(retry) < leftOf(plan)) {
          plan = retry
          warnings.push(`Không đặt được lên trên hàng khác: ${[...stuck].map(i => groups[i].label).join(', ')} — đã xếp như hàng thường.`)
        }
      }
    }
  }

  const meta = groups.map(g => g.meta)
  // Xe pallet: cộng khối lượng chính các tấm pallet
  const weightKg = totals.kg + (palletsUsed ?? 0) * pallet.kg
  if (palletsUsed != null) totals.pallets = palletsUsed
  const payloadPct = truck.payloadKg ? (weightKg / truck.payloadKg) * 100 : null
  const overweight = payloadPct != null && payloadPct > 100
  if (!totals.kgKnown) warnings.push('Có mã chưa khai kg/thùng — tổng khối lượng chưa đủ.')
  if (overweight) warnings.push(`Vượt tải trọng: ${fmtKg(weightKg)} / ${fmtKg(truck.payloadKg!)}.`)
  const leftCount = plan.leftover.reduce((s, x) => s + x.count, 0)
  return {
    plan, meta, count: countSheet(plan, meta), totals, weightKg, payloadPct, overweight,
    fits: !errors.length && leftCount === 0 && !overweight, floorSlots, errors, warnings,
  }
}

/** Xe nhỏ nhất (theo thể tích lòng thùng) chở hết hàng và không vượt tải — cùng kiểu xe. */
export function suggestTruck(orders: OrderInput[], pallet: PalletSettings, candidates: TruckInput[], lightInPallet?: boolean): string | null {
  const t = orderTotals(orders.flatMap(o => o.lines), pallet)
  if (!t.cartons) return null
  const list = candidates
    .filter(c => c.l > 0 && c.w > 0 && c.h > 0)
    .filter(c => (c.l * c.w * c.h) / 1e9 >= t.m3)
    .filter(c => !(c.payloadKg && t.kgKnown && t.kg > c.payloadKg))
    .sort((a, b) => a.l * a.w * a.h - b.l * b.w * b.h)
  for (const c of list) {
    const r = computeTrip({ truck: c, orders, pallet, lightInPallet })
    if (r.fits) return c.id
  }
  return null
}

export const fmtKg = (kg: number) =>
  kg >= 1000 ? `${(kg / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tấn` : `${Math.round(kg).toLocaleString('vi-VN')} kg`
