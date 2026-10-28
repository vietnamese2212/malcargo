// Ghép dữ liệu của người dùng (xe · mã hàng · đơn) vào thuật toán xếp — cùng trình tự với màn 3D
// của SUPPLYC: xe xá xếp thẳng thùng; xe pallet gom mọi hàng lên pallet trước rồi xếp các pallet.
// File này THUẦN (không React) để chạy được trong Web Worker và trong bài kiểm. Chữ sinh ra ở đây (nhãn pallet,
// cảnh báo) là tiếng Việt gốc — Worker không biết ngôn ngữ; màn hình dịch bằng `tx()` (luật trong src/i18n/en.ts).
import {
  computeLoadPlan, palletizeGroups, palletFitError, palletsTooTall, runPattern,
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
  unit: 'thùng' | 'pallet' // i18n-ok
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

type Rect = { x: number; y: number; l: number; w: number }
const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.l, b.x + b.l) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.w, b.y + b.w) - Math.max(a.y, b.y))
/** Một chỗ đặt vừa thùng l×w (thử 2 hướng) mà `ok` nhận (đủ chỗ đỡ): thử góc các ô trống và các góc của thùng lớp
 *  dưới (chồng thẳng cột lên thùng dưới); chỗ phải nằm trọn trong một ô trống; sát đáy rồi sát trái trước. */
function fitIn(free: Rect[], l: number, w: number, ok: (p: Rect) => boolean, below: Rect[] = []): Rect | null {
  const cand: Rect[] = []
  for (const [a, b] of [[l, w], [w, l]]) {
    for (const f of free) cand.push({ x: f.x, y: f.y, l: a, w: b })
    for (const d of below) for (const x of [d.x, d.x + d.l - a]) for (const y of [d.y, d.y + d.w - b]) cand.push({ x, y, l: a, w: b })
  }
  const inFree = (p: Rect) => free.some(f => p.x >= f.x - 1e-6 && p.y >= f.y - 1e-6 && p.x + p.l <= f.x + f.l + 1e-6 && p.y + p.w <= f.y + f.w + 1e-6)
  return cand.sort((p, q) => p.y - q.y || p.x - q.x).find(p => inFree(p) && ok(p)) ?? null
}
/** Cắt ô `p` khỏi danh sách chỗ trống (maxrects: mỗi chỗ trống bị chạm tách thành tối đa 4 dải), bỏ dải nằm trong dải khác. */
function cutFree(free: Rect[], p: Rect): Rect[] {
  const out: Rect[] = []
  for (const f of free) {
    if (p.x >= f.x + f.l || p.x + p.l <= f.x || p.y >= f.y + f.w || p.y + p.w <= f.y) { out.push(f); continue }
    if (p.x > f.x) out.push({ x: f.x, y: f.y, l: p.x - f.x, w: f.w })
    if (p.x + p.l < f.x + f.l) out.push({ x: p.x + p.l, y: f.y, l: f.x + f.l - p.x - p.l, w: f.w })
    if (p.y > f.y) out.push({ x: f.x, y: f.y, l: f.l, w: p.y - f.y })
    if (p.y + p.w < f.y + f.w) out.push({ x: f.x, y: p.y + p.w, l: f.l, w: f.y + f.w - p.y - p.w })
  }
  const inside = (a: Rect, b: Rect) => a.x >= b.x && a.y >= b.y && a.x + a.l <= b.x + b.l && a.y + a.w <= b.y + b.w
  return out.filter((a, i) => !out.some((b, j) => j !== i && inside(a, b) && (!inside(b, a) || j < i)))
}

/** Thùng thật trên MẶT pallet, xếp theo LỚP PHẲNG, z tính từ mặt đế (user 28/10: "phía dưới phải phủ hết, kể cả 1 lớp
 *  có nhiều hơn 1 mặt hàng vẫn phải phủ — ở dưới không chắc chắn thì đâu xếp được ở trên"; bản trước đặt từng thùng
 *  vào chỗ thấp nhất theo mẫu riêng của từng mã ⇒ lớp thiếu của mã này lệch khuôn mã kia, thành lỗ và bậc so le):
 *   1. dưới cùng: các LỚP ĐỦ của từng mã hàng thường, nặng trước (mẫu đúng số thùng/lớp, căn giữa chân — `runPattern`);
 *   2. phần lẻ hàng thường ghép thành LỚP HỖN HỢP phủ kín mặt pallet: mã đầu dồn một góc, chỗ còn lại lấp bằng mã
 *      khác (ưu tiên CÙNG chiều cao thùng); hàng thường hết mà lớp chưa kín ⇒ lấy HÀNG NHẸ lấp nốt;
 *   3. trên cùng: hàng nhẹ — lớp đủ rồi phần lẻ. Chỉ LỚP TRÊN CÙNG được thiếu.
 *  Lớp cao bằng thùng cao nhất trong lớp. Thùng lớp hỗn hợp nằm gọn trong chân, cụm thùng căn giữa.
 *  Toạ độ theo góc KHỐI (chân + phần chờm — khớp `palletFoot` của lõi); `deck` = chỗ tấm gỗ trong khối. */
function packPallet(spec: PalletSpec, layers: PalletLayer[], light: Set<string>): { cartons: PalletCarton[]; deck: { x: number; y: number; l: number; w: number } } {
  const L = spec.l, W = spec.w
  type Run = PalletLayer & { left: number }
  const runs: Run[] = []
  for (const ly of layers) {
    const last = runs[runs.length - 1]
    if (last && last.itemId === ly.itemId && last.l === ly.l && last.w === ly.w && last.h === ly.h && last.per === ly.per) { last.n += ly.n; last.left += ly.n }
    else runs.push({ ...ly, left: ly.n })
  }
  type Box = Omit<PalletCarton, 'z'>
  const levels: Box[][] = []
  const heavy = runs.filter(r => !light.has(r.itemId)), lite = runs.filter(r => light.has(r.itemId))
  // CHỖ ĐỠ: thùng chỉ đặt nơi ≥ 70% đáy nằm trên lớp dưới (thùng lớp dưới thấp hơn mặt lớp ≤ 35mm vẫn tính — lớp
  // trộn thùng cao 130 với 100); lớp đầu tiên đỡ bằng mặt pallet. Không thùng nào treo trên ô trống của lớp dưới.
  const MIN_SUP = 0.7, PIT = 35
  const supportOf = (p: Rect) => {
    const below = levels[levels.length - 1]
    if (!below) return overlap(p, { x: 0, y: 0, l: L, w: W }) / (p.l * p.w)
    const top = Math.max(...below.map(b => b.h))
    return below.filter(b => b.h >= top - PIT).reduce((s, b) => s + overlap(p, b), 0) / (p.l * p.w)
  }
  const full = (r: Run) => {
    const pat = runPattern(spec, { n: r.per, per: r.per, l: r.l, w: r.w }) ?? []
    while (pat.length && r.left >= r.per && pat.every(p => supportOf(p) >= MIN_SUP)) {
      levels.push(pat.map(p => ({ itemId: r.itemId, ...p, h: r.h }))); r.left -= r.per
    }
  }
  // một lớp hỗn hợp: `group` theo thứ tự — mã đầu trước, rồi mã cùng chiều cao, rồi mã thấp / cao dần.
  // `min` = ngưỡng chỗ đỡ (lớp nào không đặt nổi thùng nào thì hạ về 0 để không bỏ sót thùng)
  const mixed = (group: Run[], fillers: () => Run[], min = MIN_SUP) => {
    let free: Rect[] = [{ x: 0, y: 0, l: L, w: W }]
    const lv: Box[] = []
    const ok = (p: Rect) => supportOf(p) >= min
    const below = levels[levels.length - 1] ?? []
    const put = (r: Run) => {
      while (r.left > 0) {
        const p = fitIn(free, r.l, r.w, ok, below)
        if (!p) break
        lv.push({ itemId: r.itemId, ...p, h: r.h }); free = cutFree(free, p); r.left--
      }
    }
    const lead = group.find(r => r.left > 0)!
    const near = (rs: Run[]) => rs.filter(r => r.left > 0).sort((a, b) => Math.abs(a.h - lead.h) - Math.abs(b.h - lead.h))
    // ô của MẪU LỚP ĐỦ của mã đầu (trong chân): mã đầu + các mã CÙNG CỠ ĐÁY thùng chia nhau các ô này — lớp ghép
    // vẫn đủ 10 thùng 420×255 như lớp một mã (xếp tự do chỉ được 8)
    const same = (r: Run) => (r.l === lead.l && r.w === lead.w) || (r.l === lead.w && r.w === lead.l)
    const slots = (runPattern(spec, { n: lead.per, per: lead.per, l: lead.l, w: lead.w }) ?? [])
      .filter(s => s.x >= 0 && s.y >= 0 && s.x + s.l <= L && s.y + s.w <= W && ok(s)).sort((a, b) => a.y - b.y || a.x - b.x)
    for (const r of [lead, ...near(group).filter(same)]) {
      while (r.left > 0 && slots.length) { const s = slots.shift()!; lv.push({ itemId: r.itemId, ...s, h: r.h }); free = cutFree(free, s); r.left-- }
    }
    for (const r of near(group)) put(r)
    for (const r of near(fillers())) put(r)
    if (!lv.length) return false
    // cụm thùng dời về GIỮA chân (thùng thừa không nằm mép) — xa nhất mà mọi thùng vẫn đủ chỗ đỡ
    const cx = Math.floor((L - Math.min(...lv.map(b => b.x)) - Math.max(...lv.map(b => b.x + b.l))) / 2)
    const cy = Math.floor((W - Math.min(...lv.map(b => b.y)) - Math.max(...lv.map(b => b.y + b.w))) / 2)
    const shift = (f: number) => lv.map(b => ({ ...b, x: b.x + Math.round(cx * f), y: b.y + Math.round(cy * f) }))
    const base = lv.map(supportOf)
    const f = [1, 0.75, 0.5, 0.25].find(k => shift(k).every((b, i) => supportOf(b) >= Math.min(min, base[i]))) ?? 0
    levels.push(shift(f))
    return true
  }
  for (const r of heavy) full(r)
  // hàng thường hết trong lớp này thì hàng nhẹ mới được lấp (không để hàng thường đè lên hàng nhẹ)
  const liteIfDone = () => (heavy.some(r => r.left > 0) ? [] : lite)
  while (heavy.some(r => r.left > 0) && (mixed(heavy, liteIfDone) || mixed(heavy, liteIfDone, 0))) { /* lớp kế */ }
  for (const r of lite) full(r)
  while (lite.some(r => r.left > 0) && (mixed(lite, () => []) || mixed(lite, () => [], 0))) { /* lớp kế */ }

  let x0 = 0, y0 = 0, x1 = L, y1 = W
  for (const b of levels.flat()) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.l); y1 = Math.max(y1, b.y + b.w) }
  const out: PalletCarton[] = []
  let z = 0
  for (const lv of levels) {
    for (const b of lv) out.push({ ...b, x: b.x - x0, y: b.y - y0, z })
    z += Math.max(...lv.map(b => b.h))
  }
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
const LIGHT_POOL = { key: 'light', label: 'hàng nhẹ' } // i18n-ok

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
      unit: meta[gi].isPallet ? 'pallet' : 'thùng', // i18n-ok
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
      warnings.push(`Chưa khai số thùng/pallet: ${[...new Set(missing.map(g => g.label))].join(', ')} — đang tạm tính mỗi mã 1 pallet.`) // i18n-ok
    const srcByKey = new Map(toPal.map(g => [g.key, g]))
    const lightIds = new Set(allLines.filter(l => l.item.light).map(l => l.item.id))
    const palGroups: G[] = res.groups.map(pg => {
      // ruột từ lõi (lớp thùng thật, dưới lên) — khoá dòng hàng ⇒ mã hàng
      const ls: PalletLayer[] | undefined = pg.contents?.map(c => ({ itemId: srcByKey.get(c.key)?.meta.itemId ?? c.key, l: c.l, w: c.w, h: c.h, n: c.n, per: c.per }))
      const packed = ls ? packPallet(spec, ls, lightIds) : null
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
            : srcByKey.has(pg.key.replace(/\|(full|plt)$/, '')) ? `${src.label}${pg.key.endsWith('|plt') ? ' (pallet lẻ)' : ''}` // i18n-ok
            : `${src.label} (pallet lẻ)`,   // khối của bể gộp mà ruột chỉ một mã // i18n-ok
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
      if (tall.length) errors.push(`Pallet cao hơn lòng thùng xe: ${tall.join(', ')}.`) // i18n-ok
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
          warnings.push(`Không đặt được lên trên hàng khác: ${[...stuck].map(i => groups[i].label).join(', ')} — đã xếp như hàng thường.`) // i18n-ok
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
  if (!totals.kgKnown) warnings.push('Có mã chưa khai kg/thùng — tổng khối lượng chưa đủ.') // i18n-ok
  if (overweight) warnings.push(`Vượt tải trọng: ${fmtKg(weightKg)} / ${fmtKg(truck.payloadKg!)}.`) // i18n-ok
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
  kg >= 1000 ? `${(kg / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tấn` : `${Math.round(kg).toLocaleString('vi-VN')} kg` // i18n-ok
