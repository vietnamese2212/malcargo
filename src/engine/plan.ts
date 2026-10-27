// Ghép dữ liệu của người dùng (xe · mã hàng · đơn) vào thuật toán xếp — cùng trình tự với màn 3D
// của SUPPLYC: xe xá xếp thẳng thùng; xe pallet gom hàng lên pallet trước, hàng nhẹ rải lên nóc
// pallet (hoặc đóng pallet như hàng khác nếu chuyến bật vậy). File này THUẦN (không React) để chạy được trong Web Worker và trong bài kiểm.
import {
  computeLoadPlan, palletizeGroups, spreadOnTopOfPallets, palletFitError, palletsTooTall, cartonsPerLayer,
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
  holds?: string[]           // pallet gộp: id các mã có phần lẻ nằm trong (các) pallet gộp của đơn
}

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

/** Số pallet khi xếp các lớp hàng lẻ first-fit-decreasing dưới trần `budget` — cùng cách lõi gom pallet gộp. */
function ffdCount(layers: number[], budget: number): number {
  const pals: number[] = []
  for (const h of [...layers].sort((a, b) => b - a)) {
    const i = pals.findIndex(p => p + h <= budget)
    if (i >= 0) pals[i] += h; else pals.push(h)
  }
  return pals.length
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
      cartonsPerPallet: item.perPallet, isPalletCarrier: false, weightKg: item.kg,
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
    const hasRem = (g: G) => { const cpp = itemOf(g)?.perPallet; return !!cpp && g.count % cpp > 0 }   // có phần lẻ (vào pallet gộp)
    // Hàng nhẹ: mặc định rải thùng lên nóc pallet ("lên nóc" chỉ có nghĩa khi có pallet làm nền).
    // Chuyến bật "Hàng nhẹ đóng pallet" ⇒ đóng pallet như hàng khác: đủ thùng thì pallet chẵn,
    // phần lẻ dồn chung pallet gộp với phần lẻ các mã khác của đơn (luật pallet gộp của lõi).
    const hasBase = cartons.some(g => !g.onTop)
    const top = cartons.filter(g => g.onTop && hasBase && !input.lightInPallet)
    const toPal = cartons.filter(g => !top.includes(g))
    // …nhưng phần lẻ của MỘT mã nhẹ đã tự đủ pallet (tách ra không làm tăng số pallet của đơn — vd 200
    // túi / 216) thì để pallet RIÊNG của mã đó, không trộn lớp với hàng khác; gộp chỉ khi bớt được pallet.
    const ownLight = new Set<G>()
    if (input.lightInPallet) {
      const budget = spec.h - spec.baseH
      const layersOf = (g: G): number[] => {   // lớp phần lẻ — cùng cách lõi tính pallet gộp
        const cpp = itemOf(g)?.perPallet, rem = cpp ? g.count % cpp : 0
        if (!rem) return []
        const per = cartonsPerLayer(spec, g)
        return per > 0 ? Array<number>(Math.ceil(rem / per)).fill(g.h) : [budget]
      }
      const height = (g: G) => layersOf(g).reduce((s, h) => s + h, 0)
      for (const doKey of new Set(toPal.map(g => g.doKey))) {
        const mine = toPal.filter(g => g.doKey === doKey)
        const need = ffdCount(mine.flatMap(layersOf), budget)
        for (const g of mine.filter(x => x.onTop && height(x) > 0).sort((a, b) => height(b) - height(a))) {
          const sep = mine.filter(x => ownLight.has(x) || x === g)
          const n = sep.reduce((s, x) => s + ffdCount(layersOf(x), budget), 0) + ffdCount(mine.filter(x => !sep.includes(x)).flatMap(layersOf), budget)
          if (n <= need) ownLight.add(g)
        }
      }
    }
    const items: PalletizeInput[] = toPal.map(g => ({
      key: g.key, label: g.label, doKey: g.doKey, doLabel: g.doLabel, cartons: g.count,
      cartonsPerPallet: itemOf(g)?.perPallet ?? null,
      isPalletCarrier: false, weightKg: g.weightKg, carton: { l: g.l, w: g.w, h: g.h }, assumed: false, unitless: false,
      remPool: ownLight.has(g) ? { key: `own:${g.meta.itemId}`, label: g.label } : undefined,
    }))
    const res = palletizeGroups(items, spec)
    palletsUsed = res.palletCount
    const missing = toPal.filter(g => !itemOf(g)?.perPallet)
    if (missing.length)
      warnings.push(`Chưa khai số thùng/pallet: ${[...new Set(missing.map(g => g.label))].join(', ')} — đang tạm tính mỗi mã 1 pallet.`)
    const srcByKey = new Map(toPal.map(g => [g.key, g]))
    const palGroups: G[] = res.groups.map(pg => {
      // pallet lẻ riêng của một mã: khoá `<đơn>|mixed|own:<mã>|<n>` — mang tên + màu của mã
      const ownId = /\|mixed\|own:(.+)\|\d+$/.exec(pg.key)?.[1]
      const src = ownId ? toPal.find(g => g.doKey === pg.doKey && g.meta.itemId === ownId) : srcByKey.get(pg.key.replace(/\|(full|plt)$/, ''))
      const mixed = !src
      return {
        ...pg,
        meta: {
          label: mixed ? pg.label : `${src.label}${ownId || pg.key.endsWith('|plt') ? ' (pallet lẻ)' : ''}`,
          orderName: pg.doLabel, itemId: src?.meta.itemId ?? null, isPallet: true,
          colorKey: src?.meta.itemId ?? `mix|${pg.doKey}`,
          ...(mixed ? { holds: toPal.filter(g => g.doKey === pg.doKey && !ownLight.has(g) && hasRem(g)).map(g => g.meta.itemId!) } : {}),
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
