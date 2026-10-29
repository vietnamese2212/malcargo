// Ghép dữ liệu của người dùng (xe · mã hàng · đơn) vào thuật toán xếp — cùng trình tự với màn 3D
// của SUPPLYC: xe xá xếp thẳng thùng; xe pallet gom mọi hàng lên pallet trước rồi xếp các pallet.
// File này THUẦN (không React) để chạy được trong Web Worker và trong bài kiểm. Chữ sinh ra ở đây (nhãn pallet,
// cảnh báo) là tiếng Việt gốc — Worker không biết ngôn ngữ; màn hình dịch bằng `tx()` (luật trong src/i18n/en.ts).
import {
  cartonsPerLayer, computeLoadPlan, palletizeGroups, palletFitError, palletsTooTall, runPattern,
  palletFloorSlots, type LoadGroup, type LoadPlan, type PalletSpec, type PalletizeInput, type PlacedBox,
} from './loadPlan'
import type { Item, PalletSettings, VehicleKind } from '../data/types'

export interface TruckInput { id: string; name: string; kind: VehicleKind; l: number; w: number; h: number; payloadKg: number | null }
export interface OrderInput { id: string; name: string; place: string; lines: { item: Item; qty: number }[] }
export interface TripInput {
  truck: TruckInput; orders: OrderInput[]; pallet: PalletSettings
  lightOwnPallet?: boolean   // xe pallet: phần lẻ hàng nhẹ đứng pallet riêng (mặc định dồn lên trên cùng pallet gộp)
  quick?: boolean            // chỉ cần biết chở hết hay không (gợi ý xe, ✓/✗ từng xe) — bỏ bước trải hàng tới cửa
}

export interface PlanGroupMeta {
  label: string
  orderName: string
  orderId: string            // gom theo đơn bằng id — hai đơn trùng tên trong một chuyến không bị cộng lẫn
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
  orderId: string
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
function packPallet(spec: PalletSpec, layers: PalletLayer[], light: Set<string>, maxLayers: Map<string, number>): { cartons: PalletCarton[]; deck: { x: number; y: number; l: number; w: number } } {
  const L = spec.l, W = spec.w
  type Run = PalletLayer & { left: number }
  const runs: Run[] = []
  for (const ly of layers) {
    const last = runs[runs.length - 1]
    if (last && last.itemId === ly.itemId && last.l === ly.l && last.w === ly.w && last.h === ly.h && last.per === ly.per) { last.n += ly.n; last.left += ly.n }
    else runs.push({ ...ly, left: ly.n })
  }
  // k = số lớp CÙNG MÃ chồng thẳng tới thùng này (tính cả nó) — không được vượt số lớp tối đa của mã
  type Box = Omit<PalletCarton, 'z'> & { k: number }
  const levels: Box[][] = []
  const heavy = runs.filter(r => !light.has(r.itemId)), lite = runs.filter(r => light.has(r.itemId))
  const patOf = (r: Run, n = r.per) => runPattern(spec, { n, per: r.per, l: r.l, w: r.w }) ?? []
  // khung KHỐI = chân + phần chờm của mẫu từng đợt (khớp `palletFoot` của lõi) — ô mẫu được chờm trong khung này
  let fx0 = 0, fy0 = 0, fx1 = L, fy1 = W
  for (const r of runs) for (const s of patOf(r, Math.min(r.n, r.per))) { fx0 = Math.min(fx0, s.x); fy0 = Math.min(fy0, s.y); fx1 = Math.max(fx1, s.x + s.l); fy1 = Math.max(fy1, s.y + s.w) }
  const inFoot = (s: Rect) => s.x >= fx0 && s.y >= fy0 && s.x + s.l <= fx1 && s.y + s.w <= fy1
  const inDeck = (s: Rect) => s.x >= 0 && s.y >= 0 && s.x + s.l <= L && s.y + s.w <= W
  const hit = (a: Rect, b: Rect) => a.x < b.x + b.l && b.x < a.x + a.l && a.y < b.y + b.w && b.y < a.y + a.w
  // CHỖ ĐỠ: thùng chỉ đặt nơi ≥ 70% đáy nằm trên lớp dưới (thùng lớp dưới thấp hơn mặt lớp ≤ 35mm vẫn tính — lớp
  // trộn thùng cao 130 với 100); lớp đầu tiên đỡ bằng mặt pallet. Không thùng nào treo trên ô trống của lớp dưới.
  // Riêng ô của MẪU LỚP ĐỦ (thùng chờm mép theo quy cách — 430×250 11/lớp đặt lên lớp 10/lớp gọn trong chân):
  // đỡ ≥ 50% mà TRỌNG TÂM thùng nằm trên thùng dưới cũng được (như chính pallet chẵn của mã đó).
  const MIN_SUP = 0.7, PIT = 35
  const topOf = (below: Box[]) => { const t = Math.max(...below.map(b => b.h)); return below.filter(b => b.h >= t - PIT) }
  const supportOn = (below: Box[] | undefined, p: Rect) => {
    if (!below) return overlap(p, { x: 0, y: 0, l: L, w: W }) / (p.l * p.w)
    return topOf(below).reduce((s, b) => s + overlap(p, b), 0) / (p.l * p.w)
  }
  const steady = (below: Box[] | undefined, p: Rect) => {
    const s = supportOn(below, p)
    if (s >= MIN_SUP) return true
    if (s < 0.5) return false
    const cx = p.x + p.l / 2, cy = p.y + p.w / 2
    return (below ? topOf(below) : [{ x: 0, y: 0, l: L, w: W }]).some(b => cx > b.x && cx < b.x + b.l && cy > b.y && cy < b.y + b.w)
  }
  const supportOf = (p: Rect) => supportOn(levels[levels.length - 1], p)
  const maxOf = (id: string) => maxLayers.get(id) ?? Infinity
  const ownOn = (below: Box[] | undefined, p: Rect, id: string) => 1 + Math.max(0, ...(below ?? []).filter(b => b.itemId === id && overlap(b, p) > 0).map(b => b.k))
  // mẫu lớp và 3 bản lật (mẫu căn giữa chân ⇒ lật vẫn nằm đúng khung) — chọn bản khớp lớp dưới
  const flips = (pat: Rect[]): Rect[][] => {
    const fx = (p: Rect) => ({ ...p, x: L - p.x - p.l }), fy = (p: Rect) => ({ ...p, y: W - p.y - p.w })
    return [pat, pat.map(fx), pat.map(fy), pat.map(p => fy(fx(p)))]
  }
  // `bridge` (chỉ hàng nhẹ, khi mẫu đủ không đặt trọn được): thùng được GÁC qua khe lớp ghép dưới (đỡ ≥ 30%) —
  // thạch túi nhẹ, thực tế vẫn xếp đủ lớp như vậy; không thế thì lớp nào cũng hụt ⇒ chồng quá số lớp thành tháp
  const full = (r: Run, bridge = false) => {
    const pats = flips(patOf(r))
    while (pats[0].length && r.left >= r.per) {
      const below = levels[levels.length - 1]
      const best = pats.filter(p => p.every(q => (bridge ? supportOn(below, q) >= 0.3 : steady(below, q)) && ownOn(below, q, r.itemId) <= maxOf(r.itemId)))
        .map(p => { const s = p.map(q => supportOn(below, q)); return { p, min: Math.min(...s), s: s.reduce((t, v) => t + v, 0) } })
        .sort((a, b) => b.min - a.min || b.s - a.s)[0]
      if (!best) break
      levels.push(best.p.map(p => ({ itemId: r.itemId, ...p, h: r.h, k: ownOn(below, p, r.itemId) }))); r.left -= r.per
    }
  }
  // MỘT LỚP GHÉP (phần lẻ không đủ lớp, user 28/10 tối: "xếp như này là hỏng — thực tế không bao giờ xếp vậy, sai
  // cả nguyên tắc số lớp": lớp đáy chỉ vài thùng lẻ + thạch túi lấp lỗ chỗ ⇒ mẫu lớp đủ của thạch không đặt trọn
  // lên trên, lớp nào cũng hụt 5 thùng ⇒ thạch chồng 11 lớp thành tháp, đỉnh lởm chởm). Nay THỬ nhiều cách đặt
  // rồi chọn: (1) đặt được nhiều thùng của nhóm nhất; (2) lớp kế (mẫu của mã sẽ xếp tiếp) ít ô thiếu đỡ nhất;
  // (3) phủ kín nhất; (4) gọn nhất. Cách đặt mã đầu: ô MẪU LỚP ĐỦ (mã cùng cỡ đáy chia nhau — lớp ghép vẫn đủ
  // 10 thùng 420×255), bỏ trống dồn về một cạnh; hoặc MẪU GỌN đúng số thùng, căn giữa / dồn một góc. Hàng lấp
  // (hàng nhẹ khi hàng thường đã hết) đặt TRƯỚC vào đúng ô mẫu lớp đủ của nó (lớp trên chồng thẳng cột), rồi mới
  // lấp chỗ hở. Mỗi cột thùng cùng mã không quá SỐ LỚP TỐI ĐA của mã (`k`) — lớp lẻ trên cùng tránh cột đã đủ.
  // `min` = ngưỡng chỗ đỡ, `free` = bỏ giới hạn số lớp (lớp nào không đặt nổi thùng nào thì nới dần để không sót thùng)
  const mixed = (group: Run[], fillers: (left: Map<Run, number>) => Run[], min = MIN_SUP, loose = false) => {
    const below = levels[levels.length - 1]
    const lead = group.find(r => r.left > 0)!
    const same = (r: Run) => (r.l === lead.l && r.w === lead.w) || (r.l === lead.w && r.w === lead.l)
    const near = (rs: Run[], left: Map<Run, number>) => rs.filter(r => left.get(r)! > 0).sort((a, b) => Math.abs(a.h - lead.h) - Math.abs(b.h - lead.h))
    const okFor = (r: Run) => (p: Rect) => supportOn(below, p) >= min && (loose || ownOn(below, p, r.itemId) <= maxOf(r.itemId))
    const k = Math.min(lead.per, group.filter(r => r.left > 0 && same(r)).reduce((s, r) => s + r.left, 0))
    const fullP = patOf(lead).filter(inDeck)
    const compact = patOf(lead, k)
    const toCorner = (pat: Rect[], cx: number, cy: number) => {
      if (!pat.length) return pat
      const x0 = Math.min(...pat.map(s => s.x)), x1 = Math.max(...pat.map(s => s.x + s.l))
      const y0 = Math.min(...pat.map(s => s.y)), y1 = Math.max(...pat.map(s => s.y + s.w))
      const dx = cx ? Math.max(0, L - x1) : -Math.max(0, x0), dy = cy ? Math.max(0, W - y1) : -Math.max(0, y0)
      return pat.map(s => ({ ...s, x: s.x + dx, y: s.y + dy }))
    }
    const orders: ((a: Rect, b: Rect) => number)[] = [(a, b) => a.y - b.y || a.x - b.x, (a, b) => b.y - a.y || b.x - a.x, (a, b) => a.x - b.x || a.y - b.y, (a, b) => b.x - a.x || b.y - a.y]
    const slotSets = new Map<string, Rect[]>()
    for (const s of [...orders.map(o => [...fullP].sort(o)), compact, ...[[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, b]) => toCorner(compact, a, b))]) {
      const ok = s.filter(p => inFoot(p) && supportOn(below, p) >= min)
      slotSets.set(JSON.stringify(ok.map(p => [p.x, p.y, p.l])), ok)
    }
    const sim = (slots: Rect[], align: Rect[] | null | 'none') => {
      const left = new Map(runs.map(r => [r, r.left]))
      let free: Rect[] = [{ x: 0, y: 0, l: L, w: W }]
      const lv: Box[] = []
      const add = (r: Run, p: Rect) => { lv.push({ itemId: r.itemId, ...p, h: r.h, k: ownOn(below, p, r.itemId) }); free = cutFree(free, p); left.set(r, left.get(r)! - 1) }
      const put = (r: Run) => { const ok = okFor(r); while (left.get(r)! > 0) { const p = fitIn(free, r.l, r.w, ok, below); if (!p) break; add(r, p) } }
      let sl = [...slots]
      for (const r of [lead, ...near(group, left).filter(r => r !== lead && same(r))]) {
        const ok = okFor(r)
        sl = sl.filter(s => { if (left.get(r)! > 0 && ok(s)) { add(r, s); return false } return true })
      }
      for (const r of near(group, left)) put(r)
      const fs = align === 'none' ? [] : near(fillers(left), left)
      for (const r of fs) {
        const ok = okFor(r)
        if (align && align !== 'none' && r === fs[0]) for (const p of align) if (left.get(r)! > 0 && inDeck(p) && ok(p) && !lv.some(b => hit(b, p))) add(r, p)
        put(r)
      }
      return { lv, left }
    }
    type Cand = ReturnType<typeof sim> & { key: number[] }
    const cands: Cand[] = []
    for (const slots of slotSets.values()) {
      const probe = sim(slots, 'none')
      const f0 = near(fillers(probe.left), probe.left)[0]
      const aligns: (Rect[] | null | 'none')[] = f0 ? ['none', null, ...flips(patOf(f0, Math.min(f0.per, f0.left)))] : ['none']
      for (const a of aligns) {
        const c = a === 'none' ? probe : sim(slots, a)
        if (!c.lv.length) continue
        const placed = group.reduce((s, r) => s + r.left - c.left.get(r)!, 0)
        // lớp kế: mã nặng còn ⇒ chưa biết mẫu; hết ⇒ mẫu của mã nhẹ đầu tiên còn thùng — tổng phần THIẾU ĐỠ của các ô
        // (dưới 70%) ở bản lật tốt nhất; ô vượt số lớp tính như hẫng hẳn
        const nx = group.some(r => c.left.get(r)! > 0 && !light.has(r.itemId)) ? null : runs.find(r => light.has(r.itemId) && c.left.get(r)! > 0)
        const bad = nx ? Math.min(...flips(patOf(nx, Math.min(nx.per, c.left.get(nx)!)))
          .map(p => p.reduce((t, q) => t + (ownOn(c.lv, q, nx.itemId) > maxOf(nx.itemId) ? 1 : Math.max(0, MIN_SUP - supportOn(c.lv, q))), 0))) : 0
        const area = c.lv.reduce((s, b) => s + overlap(b, { x: 0, y: 0, l: L, w: W }), 0)
        const bx = (Math.max(...c.lv.map(b => b.x + b.l)) - Math.min(...c.lv.map(b => b.x))) * (Math.max(...c.lv.map(b => b.y + b.w)) - Math.min(...c.lv.map(b => b.y)))
        cands.push({ ...c, key: [-placed, bad, -area, bx] })
      }
    }
    if (!cands.length) return false
    const pick = cands.reduce((a, b) => { for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return b.key[i] < a.key[i] ? b : a; return a })
    for (const r of runs) r.left = pick.left.get(r)!
    const lv = pick.lv
    // lớp TRÊN CÙNG (không còn gì xếp lên): cụm thùng dời về GIỮA chân (thùng thừa không nằm mép) — xa nhất mà mọi
    // thùng vẫn đủ chỗ đỡ. Lớp còn hàng đè lên thì giữ nguyên chỗ (đúng ô mẫu lớp trên)
    if (runs.some(r => r.left > 0)) { levels.push(lv); return true }
    const cx = Math.floor((L - Math.min(...lv.map(b => b.x)) - Math.max(...lv.map(b => b.x + b.l))) / 2)
    const cy = Math.floor((W - Math.min(...lv.map(b => b.y)) - Math.max(...lv.map(b => b.y + b.w))) / 2)
    const shift = (f: number) => lv.map(b => ({ ...b, x: b.x + Math.round(cx * f), y: b.y + Math.round(cy * f) }))
    const base = lv.map(supportOf)
    const f = [1, 0.75, 0.5, 0.25].find(k => shift(k).every((b, i) => supportOf(b) >= Math.min(min, base[i]) && (loose || ownOn(below, b, b.itemId) <= maxOf(b.itemId)))) ?? 0
    levels.push(shift(f).map(b => ({ ...b, k: ownOn(below, b, b.itemId) })))
    return true
  }
  // từng nhóm: lớp đủ của từng mã (mẫu đặt trọn được) rồi lớp ghép phần lẻ, lặp tới hết
  const stage = (group: Run[], fillers: (left: Map<Run, number>) => Run[], bridge = false) => {
    while (group.some(r => r.left > 0)) {
      for (const r of group) { full(r); if (bridge) full(r, true) }
      if (!group.some(r => r.left > 0)) break
      if (!(mixed(group, fillers) || mixed(group, fillers, 0) || mixed(group, fillers, 0, true))) break
    }
  }
  // hàng thường hết trong lớp này thì hàng nhẹ mới được lấp (không để hàng thường đè lên hàng nhẹ)
  stage(heavy, left => (heavy.some(r => left.get(r)! > 0) ? [] : lite))
  stage(lite, () => [], true)

  let x0 = fx0, y0 = fy0, x1 = fx1, y1 = fy1
  for (const b of levels.flat()) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.l); y1 = Math.max(y1, b.y + b.w) }
  const out: PalletCarton[] = []
  let z = 0
  for (const lv of levels) {
    for (const b of lv) out.push({ itemId: b.itemId, x: b.x - x0, y: b.y - y0, z, l: b.l, w: b.w, h: b.h })
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

/** Số thùng / pallet của mã: đã khai thì dùng; chưa khai thì ƯỚC theo cỡ thùng — số thùng gọn trong chân một
 *  lớp × số lớp vừa trần chiều cao pallet (≤ số lớp khai). Lõi coi mã thiếu quy cách là "1 pallet / mã" bất kể
 *  số thùng ⇒ 2.000 thùng vẫn ra 1 pallet, báo vừa xe (lỗi thử 29/10). Thùng không nằm nổi trên chân ⇒ null. */
export function perPalletOf(item: Item, spec: PalletSpec): number | null {
  if (item.perPallet) return item.perPallet
  const per = cartonsPerLayer(spec, { l: item.l, w: item.w })
  const layers = Math.min(item.maxLayers || Infinity, Math.floor((spec.h - spec.baseH) / item.h))
  return per > 0 && layers >= 1 ? per * layers : null
}

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
        // xếp xá chồng được cao hơn trên pallet (chủ dự án 29/10: 110ml pallet 14 lớp, xá 28) — chưa khai thì như pallet
        maxLayers: it.looseLayers || it.maxLayers, onTop: it.light,
        meta: { label: it.name || it.code, orderName: o.name, orderId: o.id, itemId: it.id, isPallet: false, colorKey: it.id },
      }
      byItem.set(it.id, g); out.push(g)
    }
  })
  return out
}

export function orderTotals(lines: { item: Item; qty: number }[], pallet: PalletSettings) {
  const spec = toSpec(pallet)
  let cartons = 0, kg = 0, m3 = 0, kgKnown = true, palletKnown = true
  for (const { item, qty } of lines) {
    if (!(qty > 0)) continue
    cartons += qty
    m3 += (qty * item.l * item.w * item.h) / 1e9
    if (item.kg == null) kgKnown = false; else kg += qty * item.kg
    if (!perPalletOf(item, spec)) palletKnown = false
  }
  let pallets: number | null = null
  if (cartons > 0 && palletKnown) {
    const res = palletizeGroups(lines.filter(l => l.qty > 0).map(({ item, qty }) => ({
      key: item.id, label: item.name, doKey: 'o', doLabel: 'o', cartons: qty,
      cartonsPerPallet: perPalletOf(item, spec), layers: item.maxLayers, isPalletCarrier: false, weightKg: item.kg,
      carton: { l: item.l, w: item.w, h: item.h }, assumed: false, unitless: false,
    })), spec)
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
      group: gi, label: meta[gi].label, orderName: meta[gi].orderName, orderId: meta[gi].orderId,
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
      cartonsPerPallet: (itemOf(g) && perPalletOf(itemOf(g)!, spec)) ?? null, layers: itemOf(g)?.maxLayers ?? null,
      isPalletCarrier: false, weightKg: g.weightKg, carton: { l: g.l, w: g.w, h: g.h }, assumed: false, unitless: false,
      onTop: g.onTop, remPool: input.lightOwnPallet && g.onTop ? LIGHT_POOL : undefined,
    }))
    const res = palletizeGroups(items, spec)
    palletsUsed = res.palletCount
    const missing = toPal.filter(g => !itemOf(g)?.perPallet)
    const names = (gs: G[]) => [...new Set(gs.map(g => g.label))].join(', ')
    const guessed = missing.filter(g => { const it = itemOf(g); return !!it && !!perPalletOf(it, spec) })
    const unknown = missing.filter(g => !guessed.includes(g))   // thùng không nằm nổi trên chân pallet
    if (guessed.length) warnings.push(`Chưa khai số thùng/pallet: ${names(guessed)} — đang ước theo cỡ thùng.`) // i18n-ok
    if (unknown.length) warnings.push(`Chưa khai số thùng/pallet: ${names(unknown)} — đang tạm tính mỗi mã 1 pallet.`) // i18n-ok
    const srcByKey = new Map(toPal.map(g => [g.key, g]))
    const lightIds = new Set(allLines.filter(l => l.item.light).map(l => l.item.id))
    const maxLayers = new Map(allLines.filter(l => l.item.maxLayers).map(l => [l.item.id, l.item.maxLayers!]))
    const palGroups: G[] = res.groups.map(pg => {
      // ruột từ lõi (lớp thùng thật, dưới lên) — khoá dòng hàng ⇒ mã hàng
      const ls: PalletLayer[] | undefined = pg.contents?.map(c => ({ itemId: srcByKey.get(c.key)?.meta.itemId ?? c.key, l: c.l, w: c.w, h: c.h, n: c.n, per: c.per }))
      const packed = ls ? packPallet(spec, ls, lightIds, maxLayers) : null
      const ids = [...new Set((ls ?? []).map(x => x.itemId))]
      // pallet chẵn `|full` / pallet lẻ riêng `|plt` của 1 mã; khối gộp mà ruột chỉ 1 mã cũng mang tên + màu mã đó
      const src = srcByKey.get(pg.key.replace(/\|(full|plt)$/, '')) ?? (ids.length === 1 ? toPal.find(g => g.doKey === pg.doKey && g.meta.itemId === ids[0]) : undefined)
      const mixed = !src
      const mix = mixed && ls ? ids.map(id => ({
        itemId: id, label: allLines.find(l => l.item.id === id)?.item.name ?? id, n: ls.filter(x => x.itemId === id).reduce((s, x) => s + x.n, 0),
      })) : undefined
      return {
        ...pg,
        // cao khối = đỉnh thùng thật đã xếp (lớp ghép phần lẻ có thể thấp hơn lõi ước)
        ...(packed?.cartons.length ? { h: spec.baseH + Math.max(...packed.cartons.map(c => c.z + c.h)) } : {}),
        meta: {
          label: !src ? pg.label
            : srcByKey.has(pg.key.replace(/\|(full|plt)$/, '')) ? `${src.label}${pg.key.endsWith('|plt') ? ' (pallet lẻ)' : ''}` // i18n-ok
            : `${src.label} (pallet lẻ)`,   // khối của bể gộp mà ruột chỉ một mã // i18n-ok
          // khoá đơn của lõi = "thứ tự|id đơn" (cartonGroupsOf)
          orderName: pg.doLabel, orderId: pg.doKey.slice(pg.doKey.indexOf('|') + 1), itemId: src?.meta.itemId ?? null, isPallet: true,
          colorKey: src?.meta.itemId ?? `mix|${pg.doKey}`,
          ...(ls && packed ? { layers: ls, cartons: packed.cartons, deck: packed.deck } : {}),
          ...(mixed ? { holds: mix ? mix.map(x => x.itemId) : toPal.filter(g => g.doKey === pg.doKey).map(g => g.meta.itemId!), mix } : {}),
        },
      }
    })
    groups = palGroups
    // pallet LẺ / GỘP cao quá mức cài đặt (tính cả đế) — ca hiếm của lớp ghép (quét ngẫu nhiên: 1/6.657); nói ra
    // thay vì im lặng (chủ dự án 29/10: "pallet cao 1,65 bao gồm cả pallet")
    const over = palGroups.filter(g => !g.key.endsWith('|full') && g.h > spec.h + 5)
    if (over.length) warnings.push(`Pallet lẻ cao hơn mức cài đặt ${(spec.h / 1000).toFixed(2).replace('.', ',')} m: ${[...new Set(over.map(g => `${g.meta.label} (cao ${(g.h / 1000).toFixed(2).replace('.', ',')} m)`))].join(', ')}.`) // i18n-ok
    if (!fitErr) {
      // lõi ghi số kiểu Anh ("cao 4.00m") ⇒ đổi sang dấu phẩy tiếng Việt; bản tiếng Anh đổi lại ở luật dịch
      const tall = palletsTooTall(palGroups, T).map(s => s.replace(/\(cao (\d+)\.(\d+)m\)$/, '(cao $1,$2 m)'))
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
      let gs: LoadGroup[] = groups
      const stuck = new Set(plan.leftover.filter(x => groups[x.group].onTop).map(x => x.group))
      if (stuck.size) {
        const retryGroups = groups.map((g, i) => (stuck.has(i) ? { ...g, onTop: false } : g))
        const retry = computeLoadPlan(T, retryGroups)
        if (leftOf(retry) < leftOf(plan)) {
          plan = retry; gs = retryGroups
          warnings.push(`Không đặt được lên trên hàng khác: ${[...stuck].map(i => groups[i].label).join(', ')} — đã xếp như hàng thường.`) // i18n-ok
        }
      }
      // trải dài theo % tải (tải hàng — chưa khai kg mã nào ⇒ chưa biết tải, theo % sàn)
      if (!input.quick) plan = spreadToDoor(T, gs, plan, truck.payloadKg && totals.kgKnown ? (totals.kg / truck.payloadKg) * 100 : null)
    }
  }

  const meta = groups.map(g => g.meta)
  // Xe pallet: cộng khối lượng chính các tấm pallet
  const weightKg = totals.kg + (palletsUsed ?? 0) * pallet.kg
  if (palletsUsed != null) totals.pallets = palletsUsed
  const payloadPct = truck.payloadKg ? (weightKg / truck.payloadKg) * 100 : null
  const overweight = payloadPct != null && payloadPct > 100
  if (!totals.kgKnown) warnings.push('Có mã chưa khai kg/thùng — tổng khối lượng chưa đủ.') // i18n-ok
  // thùng to hơn lòng thùng xe (xoay ngang cũng không lọt) — nói thẳng lý do, khỏi khuyên "chia bớt hàng" (thử 29/10)
  if (truck.kind === 'loose') {
    const big = cartons.filter(g => g.h > T.height || !((g.l <= T.length && g.w <= T.width) || (g.w <= T.length && g.l <= T.width)))
    if (big.length) warnings.push(`Thùng to hơn lòng thùng xe: ${[...new Set(big.map(g => g.label))].join(', ')}.`) // i18n-ok
  }
  if (overweight) warnings.push(`Vượt tải trọng: ${fmtKg(weightKg)} / ${fmtKg(truck.payloadKg!)}.`) // i18n-ok
  const leftCount = plan.leftover.reduce((s, x) => s + x.count, 0)
  return {
    plan, meta, count: countSheet(plan, meta), totals, weightKg, payloadPct, overweight,
    fits: !errors.length && leftCount === 0 && !overweight, floorSlots, errors, warnings,
  }
}

const leftOf = (p: LoadPlan) => p.leftover.reduce((s, x) => s + x.count, 0)

/** Xe XÁ: hàng trải dài theo % TẢI (chủ dự án 29/10: "xem % tải để quyết định cho chiếm bao nhiêu % sàn") — tải nặng
 *  thì trải dài cho tải chia đều các trục, chở gần đủ tải (≥ `SPREAD_FULL`%) thì TỚI SÁT CỬA ("bốc xá cần phải bốc
 *  tới sát cửa" — container sữa đủ tải mới đầy 62% thể tích, trước chừa ~0,7 m ở cửa, hàng xô khi chạy). Sàn cần dùng =
 *  % tải ÷ SPREAD_FULL (tải 50% ⇒ ≥ 59% sàn). Chưa biết tải (thiếu kg / xe chưa khai tải) ⇒ đã ≥ 75% sàn thì tới cửa.
 *  Cách làm: HẠ DẦN từng lớp của khối SÁT CỬA trước (giữ "cao thấp dần ra cửa"), mỗi lần chạy lại lõi — còn xếp đủ
 *  hàng thì giữ. Lõi chồng tới số lớp tối đa rồi mới tiến ra cửa nên không tự làm được; không sửa lõi — hạ `maxLayers`
 *  từng mã. Nhiều nhất `SPREAD_RUNS` lần chạy lõi. */
const SPREAD_FULL = 85, SPREAD_RUNS = 8
/** % chiều dài sàn hàng xá nên chiếm theo % tải (≥ 100 = tới sát cửa). */
export function spreadTarget(payloadPct: number | null, lengthUsedPct: number): number {
  if (payloadPct == null) return lengthUsedPct >= 75 ? 100 : 0
  return Math.min(100, (payloadPct / SPREAD_FULL) * 100)
}

/** Đếm THÁP: cột thùng lộ cao hơn xung quanh ở ≥ 3 phía (thành xe tính là tựa, phía cửa trống thì không) — cùng cách
 *  đo của bộ đo hình khối `scripts/out/q.mjs`. Trải hàng tới cửa không được đẻ thêm tháp (đo 29/10: 1 ca / 220). */
function towers(p: LoadPlan, T: { length: number; width: number }): number {
  type C = { x: number; y: number; l: number; w: number; top: number; bot: number; h: number }
  const cols = new Map<string, C>()
  for (const b of p.placed) {
    const k = `${b.x},${b.y},${b.l},${b.w}`
    const c = cols.get(k) ?? { x: b.x, y: b.y, l: b.l, w: b.w, top: 0, bot: 1e9, h: b.h }
    if (b.z + b.h >= c.top) c.h = b.h
    c.top = Math.max(c.top, b.z + b.h); c.bot = Math.min(c.bot, b.z); cols.set(k, c)
  }
  const C = [...cols.values()], e = 3
  const ov = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 20
  const side = (c: C, s: number) => {
    if (s === 0 && c.x <= e) return Infinity
    if (s === 1 && c.x + c.l >= T.length - e) return 0
    if (s === 2 && c.y <= e) return Infinity
    if (s === 3 && c.y + c.w >= T.width - e) return Infinity
    let best = 0
    for (const d of C) {
      if (d === c || d.top <= c.bot) continue
      const touch = s === 0 ? Math.abs(d.x + d.l - c.x) <= e && ov(c.y, c.y + c.w, d.y, d.y + d.w)
        : s === 1 ? Math.abs(c.x + c.l - d.x) <= e && ov(c.y, c.y + c.w, d.y, d.y + d.w)
        : s === 2 ? Math.abs(d.y + d.w - c.y) <= e && ov(c.x, c.x + c.l, d.x, d.x + d.l)
        : Math.abs(c.y + c.w - d.y) <= e && ov(c.x, c.x + c.l, d.x, d.x + d.l)
      if (touch) best = Math.max(best, d.top)
    }
    return best
  }
  return C.filter(c => [0, 1, 2, 3].filter(s => c.top - Math.max(side(c, s), c.bot) > Math.max(2 * c.h, 250)).length >= 3).length
}
function spreadToDoor(T: { length: number; width: number; height: number }, groups: LoadGroup[], base: LoadPlan, payloadPct: number | null): LoadPlan {
  // tới cửa = khe còn lại dưới 1,5 cạnh thùng nhỏ nhất của hàng đứng sàn (không đứng thêm được hàng thùng nào cho ra
  // hồn; hàng nhẹ nằm trên nóc, không tính)
  const floorGs = groups.filter(g => !g.onTop)
  const minSide = Math.min(...(floorGs.length ? floorGs : groups).map(g => Math.min(g.l, g.w)))
  const target = spreadTarget(payloadPct, base.lengthUsedPct)
  const done = (p: LoadPlan) => (target >= 100
    ? T.length - Math.max(0, ...p.placed.map(b => b.x + b.l)) < minSide * 1.5
    : p.lengthUsedPct >= target)
  if (leftOf(base) || !base.placed.length || done(base)) return base
  // số lớp từng mã đang chồng (cột thùng cùng mã cao nhất) + mã nào nằm sát cửa nhất
  const layersOf = (p: LoadPlan) => groups.map((_, gi) => {
    const col = new Map<string, number>()
    for (const b of p.placed) if (b.group === gi) { const k = `${Math.round(b.x)}|${Math.round(b.y)}`; col.set(k, (col.get(k) ?? 0) + 1) }
    return Math.max(0, ...col.values())
  })
  const doorX = groups.map((_, gi) => Math.max(0, ...base.placed.filter(b => b.group === gi).map(b => b.x + b.l)))
  const order = groups.map((_, gi) => gi).filter(gi => !groups[gi].onTop).sort((a, b) => doorX[b] - doorX[a])
  let best = base, cap = layersOf(base), runs = 0, failed = false
  const baseTowers = towers(base, T)
  for (const gi of order) {
    while (cap[gi] > 1 && runs < SPREAD_RUNS && !done(best)) {
      const next = cap.map((c, i) => (i === gi ? c - 1 : c))
      runs++
      const p = computeLoadPlan(T, groups.map((g, i) => (next[i] > 0 ? { ...g, maxLayers: Math.min(g.maxLayers ?? Infinity, next[i]) } : g)))
      // hạ nữa là bỏ thùng / không dài thêm / đẻ tháp ⇒ thôi (lần thử hỏng của lõi chậm gấp ~8 lần — không thử mã khác nữa)
      if (leftOf(p) || p.lengthUsedPct <= best.lengthUsedPct || towers(p, T) > baseTowers) { failed = true; break }
      best = p; cap = next
    }
    if (failed || runs >= SPREAD_RUNS || done(best)) break
  }
  return best
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
    const r = computeTrip({ truck: c, orders, pallet, lightOwnPallet, quick: true })
    if (r.fits) return c.id
  }
  return null
}

export const fmtKg = (kg: number) =>
  kg >= 1000 ? `${(kg / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tấn` : `${Math.round(kg).toLocaleString('vi-VN')} kg` // i18n-ok
