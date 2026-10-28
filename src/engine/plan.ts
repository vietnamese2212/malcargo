// Ghép dữ liệu của người dùng (xe · mã hàng · đơn) vào thuật toán xếp — cùng trình tự với màn 3D
// của SUPPLYC: xe xá xếp thẳng thùng; xe pallet gom mọi hàng lên pallet trước rồi xếp các pallet.
// File này THUẦN (không React) để chạy được trong Web Worker và trong bài kiểm.
import {
  computeLoadPlan, palletizeGroups, palletFitError, palletsTooTall, layerPattern,
  palletFloorSlots, type LoadGroup, type LoadPlan, type PalletSpec, type PalletizeInput, type PlacedBox,
} from './loadPlan'
import type { Item, PalletSettings, VehicleKind } from '../data/types'

export interface TruckInput { id: string; name: string; kind: VehicleKind; l: number; w: number; h: number; payloadKg: number | null }
export interface OrderInput { id: string; name: string; place: string; lines: { item: Item; qty: number }[] }
export interface TripInput {
  truck: TruckInput; orders: OrderInput[]; pallet: PalletSettings
  lightOwnPallet?: boolean   // xe pallet: phần lẻ hàng nhẹ đứng pallet riêng (mặc định dồn lên trên cùng pallet gộp)
}

export interface PlanGroupMeta {
  label: string
  orderName: string
  itemId: string | null      // null = pallet gộp nhiều mã
  isPallet: boolean          // khối là 1 PALLET (xe pallet)
  colorKey: string
  holds?: string[]           // pallet gộp: id các mã nằm trong khối này
  layers?: PalletLayer[]     // pallet: các lớp thùng THẬT từ dưới lên (nặng dưới, nhẹ trên)
  cartons?: PalletCarton[]   // pallet: từng thùng đã xếp trên mặt pallet — vẽ 3D đúng cỡ, đúng màu mã
  deck?: { x: number; y: number; l: number; w: number }   // pallet: chỗ tấm gỗ trong khối (khối = chân + phần thùng chờm mép)
  mix?: { itemId: string; label: string; n: number }[]   // pallet gộp: gồm mã nào, bao nhiêu thùng
}

/** Một lớp thùng trên pallet: `n` thùng cỡ l × w × h của một mã; `per` = số thùng một lớp đầy của mã đó. */
export interface PalletLayer { itemId: string; l: number; w: number; h: number; n: number; per: number }
/** Một thùng trên pallet: gốc = góc KHỐI pallet (chân + phần chờm) theo dài × rộng của khối, z từ mặt đế. */
export interface PalletCarton { itemId: string; x: number; y: number; z: number; l: number; w: number; h: number }

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

/** Thùng thật trên MẶT một pallet L×W, z tính từ mặt đế. Mỗi mã lần lượt theo ruột (nặng dưới, nhẹ trên);
 *  mỗi thùng vào vị trí của mẫu lớp ĐẦY của mã (`layerPattern` — đúng số thùng/lớp, căn giữa chân; chân không
 *  chứa nổi thì chờm mép) có mặt đỡ THẤP nhất (đặt trên điểm cao nhất của mặt đỡ; bằng nhau thì chỗ phẳng
 *  hơn trước) ⇒ chỗ trống của lớp thiếu được mã sau lấp nốt, cả mặt dâng đều — liền khối, không lỗ, không cột
 *  (user 28/10: "xếp liền khối trên pallet, không có khoảng hở"). Toạ độ theo góc KHỐI (chân + phần chờm —
 *  khớp `palletFoot` của lõi); `deck` = chỗ tấm gỗ trong khối. */
function packPallet(L: number, W: number, layers: PalletLayer[]): { cartons: PalletCarton[]; deck: { x: number; y: number; l: number; w: number } } {
  const runs: PalletLayer[] = []
  for (const ly of layers) {
    const last = runs[runs.length - 1]
    if (last && last.itemId === ly.itemId && last.l === ly.l && last.w === ly.w && last.h === ly.h && last.per === ly.per) last.n += ly.n
    else runs.push({ ...ly })
  }
  const pats = runs.map(run => layerPattern(L, W, run.l, run.w, run.per) ?? [])
  let x0 = 0, y0 = 0, x1 = L, y1 = W
  for (const p of pats.flat()) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + p.l); y1 = Math.max(y1, p.y + p.w) }
  const R = 10, nx = Math.ceil((x1 - x0) / R), ny = Math.ceil((y1 - y0) / R)
  const H = new Float32Array(nx * ny)
  const out: PalletCarton[] = []
  runs.forEach((run, ri) => {
    const pat = pats[ri]
    if (!pat.length) return
    // ô lưới NẰM TRỌN trong thùng (thùng 255mm cạnh nhau không dùng chung ô mép)
    const spots = pat.map(p => ({ x: p.x - x0, y: p.y - y0, l: p.l, w: p.w,
      i0: Math.ceil((p.x - x0) / R), i1: Math.floor((p.x - x0 + p.l) / R), j0: Math.ceil((p.y - y0) / R), j1: Math.floor((p.y - y0 + p.w) / R) }))
    const span = (s: typeof spots[number]) => {
      let mn = Infinity, mx = -Infinity
      for (let i = s.i0; i < s.i1; i++) for (let j = s.j0; j < s.j1; j++) { const v = H[i * ny + j]; if (v < mn) mn = v; if (v > mx) mx = v }
      return { mn, mx }
    }
    for (let k = 0; k < run.n; k++) {
      let pick = 0, pz = Infinity, pd = Infinity
      spots.forEach((s, q) => {
        const { mn, mx } = span(s)
        if (mx < pz - 1e-6 || (Math.abs(mx - pz) <= 1e-6 && mx - mn < pd)) { pz = mx; pd = mx - mn; pick = q }
      })
      const s = spots[pick]
      out.push({ itemId: run.itemId, x: s.x, y: s.y, z: pz, l: s.l, w: s.w, h: run.h })
      for (let i = s.i0; i < s.i1; i++) for (let j = s.j0; j < s.j1; j++) H[i * ny + j] = pz + run.h
    }
  })
  return { cartons: out, deck: { x: -x0, y: -y0, l: L, w: W } }
}

/** KHE GIỮA CÁC PALLET (user 28/10: "tạo khoảng hở giữa các pallet"): dàn phần sàn còn THỪA thành khe đều
 *  (≤ 80mm) — không bớt chỗ pallet nào. Mỗi pallet lùi `bậc × khe`, bậc = số pallet nối nhau đứng TRƯỚC nó
 *  trong cùng dải (dọc: cùng khoảng bề ngang; ngang: cùng khoảng chiều dài) ⇒ pallet đặt xoay / khối rộng
 *  hơn chân (thùng chờm mép) ở làn bên cạnh cũng không bị đẩy đè lên. */
function spacePallets(plan: LoadPlan): LoadPlan {
  const T = plan.truck
  const placed = plan.placed.map(b => ({ ...b }))
  const spread = (pos: 'x' | 'y', len: 'l' | 'w', cross: 'x' | 'y', crossLen: 'l' | 'w', room: number) => {
    const bs = [...placed].sort((a, b) => a[pos] - b[pos])
    const depth = new Map<PlacedBox, number>()
    for (const b of bs) {
      let d = 0
      for (const a of bs) {
        if (a === b || a[pos] + a[len] > b[pos] + 1) continue
        if (Math.min(a[cross] + a[crossLen], b[cross] + b[crossLen]) - Math.max(a[cross], b[cross]) > 1) d = Math.max(d, (depth.get(a) ?? 0) + 1)
      }
      depth.set(b, d)
    }
    let gap = 80
    for (const b of bs) { const d = depth.get(b)!; if (d > 0) gap = Math.min(gap, (room - b[pos] - b[len]) / d) }
    if (gap > 0) for (const b of bs) b[pos] += depth.get(b)! * gap
  }
  spread('x', 'l', 'y', 'w', T.length)
  spread('y', 'w', 'x', 'l', T.width)
  const maxX = placed.reduce((m, b) => Math.max(m, b.x + b.l), 0)
  return { ...plan, placed, lengthUsedPct: T.length > 0 ? Math.round((maxX / T.length) * 100) : 0 }
}

// Bể phần lẻ hàng nhẹ khi chuyến bật "Hàng nhẹ: pallet riêng" — không dồn chung pallet gộp với hàng thường
const LIGHT_POOL = { key: 'light', label: 'hàng nhẹ' }

const toSpec = (p: PalletSettings): PalletSpec =>
  ({ l: p.l, w: p.w, h: p.maxH, baseH: p.baseH, baseColor: '#a07a4e', weightKg: p.kg })

type G = LoadGroup & { meta: PlanGroupMeta }

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
    // Xe pallet: MỌI hàng nằm gọn trên pallet của nó (user 28/10: "hàng trên pallet phải tách biệt với
    // pallet khác" — bỏ kiểu rải thùng rời lên nóc nhiều pallet). Đủ quy cách ⇒ pallet chẵn; phần lẻ:
    // mặc định dồn pallet gộp (≤ 1,65m) với hàng nhẹ TRÊN CÙNG; chuyến bật "Hàng nhẹ: pallet riêng"
    // ⇒ phần lẻ hàng nhẹ đứng pallet riêng (bể riêng của lõi).
    const toPal = cartons
    const items: PalletizeInput[] = toPal.map(g => ({
      key: g.key, label: g.label, doKey: g.doKey, doLabel: g.doLabel, cartons: g.count,
      cartonsPerPallet: itemOf(g)?.perPallet ?? null, layers: itemOf(g)?.maxLayers ?? null,
      isPalletCarrier: false, weightKg: g.weightKg, carton: { l: g.l, w: g.w, h: g.h }, assumed: false, unitless: false,
      onTop: g.onTop, remPool: input.lightOwnPallet && g.onTop ? LIGHT_POOL : undefined,
    }))
    const res = palletizeGroups(items, spec)
    palletsUsed = res.palletCount
    const missing = toPal.filter(g => !itemOf(g)?.perPallet)
    if (missing.length)
      warnings.push(`Chưa khai số thùng/pallet: ${[...new Set(missing.map(g => g.label))].join(', ')} — đang tạm tính mỗi mã 1 pallet.`)
    const srcByKey = new Map(toPal.map(g => [g.key, g]))
    const palGroups: G[] = res.groups.map(pg => {
      // ruột từ lõi (lớp thùng thật, dưới lên) — khoá dòng hàng ⇒ mã hàng
      const ls: PalletLayer[] | undefined = pg.contents?.map(c => ({ itemId: srcByKey.get(c.key)?.meta.itemId ?? c.key, l: c.l, w: c.w, h: c.h, n: c.n, per: c.per }))
      const packed = ls ? packPallet(spec.l, spec.w, ls) : null
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
          label: !src ? pg.label
            : srcByKey.has(pg.key.replace(/\|(full|plt)$/, '')) ? `${src.label}${pg.key.endsWith('|plt') ? ' (pallet lẻ)' : ''}`
            : `${src.label} (pallet lẻ)`,   // khối của bể gộp mà ruột chỉ một mã
          orderName: pg.doLabel, itemId: src?.meta.itemId ?? null, isPallet: true,
          colorKey: src?.meta.itemId ?? `mix|${pg.doKey}`,
          ...(ls && packed ? { layers: ls, cartons: packed.cartons, deck: packed.deck } : {}),
          ...(mixed ? { holds: mix ? mix.map(x => x.itemId) : toPal.filter(g => g.doKey === pg.doKey).map(g => g.meta.itemId!), mix } : {}),
        },
      }
    })
    groups = palGroups
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
    plan = computeLoadPlan(T, groups)
    if (truck.kind === 'pallet') plan = spacePallets(plan)
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
export function suggestTruck(orders: OrderInput[], pallet: PalletSettings, candidates: TruckInput[], lightOwnPallet?: boolean): string | null {
  const t = orderTotals(orders.flatMap(o => o.lines), pallet)
  if (!t.cartons) return null
  const list = candidates
    .filter(c => c.l > 0 && c.w > 0 && c.h > 0)
    .filter(c => (c.l * c.w * c.h) / 1e9 >= t.m3)
    .filter(c => !(c.payloadKg && t.kgKnown && t.kg > c.payloadKg))
    .sort((a, b) => a.l * a.w * a.h - b.l * b.w * b.h)
  for (const c of list) {
    const r = computeTrip({ truck: c, orders, pallet, lightOwnPallet })
    if (r.fits) return c.id
  }
  return null
}

export const fmtKg = (kg: number) =>
  kg >= 1000 ? `${(kg / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tấn` : `${Math.round(kg).toLocaleString('vi-VN')} kg`
