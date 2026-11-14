// Chia hàng của MỘT chuyến ra nhiều xe cùng loại khi một xe không chở hết (chủ dự án 14/11: "phát triển app thật sự" — điều vận
// cần biết ngay "mấy xe" và chia sẵn, thay vì tự bớt hàng). KHÔNG phải luật xếp: mỗi xe vẫn do lõi xếp như thường; ở đây chỉ chọn
// phần hàng nào lên xe nào — xe 1 lấy đúng phần lõi xếp được (phần lõi bỏ lại là phía cửa = đơn giao trước), quá tải thì bớt tiếp
// từ đơn giao trước; phần còn lại sang xe 2, cứ thế. Mỗi xe được tính lại ĐỦ BƯỚC (không `quick`) ⇒ mở chuyến ra là "Vừa xe".
import { computeTrip, type TripInput, type TripResult } from './plan'

export interface SplitLine { orderId: string; itemId: string; qty: number }
export type SplitPart = SplitLine[]
export interface SplitResult {
  parts: SplitPart[]
  /** `unplaceable`: có hàng không lên được xe này dù xe trống (thùng / pallet to hơn lòng xe…) — `stuck` = lý do / tên mã;
   *  `too_many`: cần hơn `max` xe. */
  error?: 'unplaceable' | 'too_many'
  stuck?: string[]
}

const K = (orderId: string, itemId: string) => `${orderId}\u0001${itemId}`
const sum = (m: Map<string, number>) => [...m.values()].reduce((s, n) => s + n, 0)

/** Số thùng KHÔNG lên xe theo (đơn, mã). Xe pallet: pallet bị bỏ lại × ruột của MỘT pallet trong khối đó. */
export function leftByLine(r: TripResult, qty: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>()
  const add = (k: string, n: number) => { if (n > 0) out.set(k, (out.get(k) ?? 0) + n) }
  for (const { group, count } of r.plan.leftover) {
    const m = r.meta[group], g = r.plan.groups[group]
    if (!m || count <= 0) continue
    if (!m.isPallet) { add(K(m.orderId, m.itemId!), count); continue }
    if (m.layers?.length) {
      const per = new Map<string, number>()
      for (const l of m.layers) per.set(l.itemId, (per.get(l.itemId) ?? 0) + l.n)
      for (const [itemId, n] of per) add(K(m.orderId, itemId), n * count)
    } else if (m.itemId) {
      // mã chưa có quy cách pallet (lõi coi cả dòng là các pallet đều nhau) ⇒ chia đều theo số pallet
      const all = qty.get(K(m.orderId, m.itemId)) ?? 0
      add(K(m.orderId, m.itemId), Math.round((all * count) / Math.max(1, g?.count ?? 1)))
    }
  }
  // không bỏ lại nhiều hơn số đang xếp (làm tròn của nhánh ước)
  for (const [k, n] of out) out.set(k, Math.min(n, qty.get(k) ?? 0))
  return out
}

/** Đầu vào của chuyến chỉ còn `qty` (đơn × mã), giữ thứ tự giao. */
export function inputWith(input: TripInput, qty: Map<string, number>): TripInput {
  return {
    ...input,
    orders: input.orders
      .map(o => {
        const seen = new Set<string>()
        const lines = o.lines.filter(l => l.qty > 0 && !seen.has(l.item.id) && seen.add(l.item.id))
          .map(l => ({ item: l.item, qty: qty.get(K(o.id, l.item.id)) ?? 0 })).filter(l => l.qty > 0)
        return { ...o, lines }
      })
      .filter(o => o.lines.length),
  }
}

/** Đầu vào của chuyến chỉ còn hàng của một phần. */
export const partInput = (input: TripInput, part: SplitPart): TripInput =>
  inputWith(input, new Map(part.map(x => [K(x.orderId, x.itemId), x.qty])))

/** Bớt hàng cho đủ tải: lấy từ đơn GIAO TRƯỚC (nằm sát cửa) trước, mỗi mã đủ số thùng bù phần vượt. */
function dropForWeight(input: TripInput, take: Map<string, number>, excessKg: number) {
  for (const o of input.orders) {
    for (const l of o.lines) {
      if (excessKg <= 0) return
      const k = K(o.id, l.item.id), have = take.get(k) ?? 0, kg = l.item.kg ?? 0
      if (!have || kg <= 0) continue
      const n = Math.min(have, Math.ceil(excessKg / kg))
      take.set(k, have - n); excessKg -= n * kg
    }
  }
}

/** Chia hàng của chuyến ra nhiều xe `input.truck`. `onPart(k)` báo đang tính xe thứ k (1, 2…). */
export function splitTrip(input: TripInput, max = 20, onPart?: (k: number) => void): SplitResult {
  const want = new Map<string, number>()
  for (const o of input.orders) for (const l of o.lines) if (l.qty > 0) want.set(K(o.id, l.item.id), (want.get(K(o.id, l.item.id)) ?? 0) + l.qty)
  const parts: SplitPart[] = []
  while (sum(want) > 0) {
    if (parts.length >= max) return { parts, error: 'too_many' }
    onPart?.(parts.length + 1)
    const take = new Map(want)
    let quick = true, ok = false
    // lượt nhanh để chọn phần hàng, lượt đủ bước để chắc chắn phần đó vừa (lõi xếp lại ít hàng hơn vẫn có thể bỏ sót — thử lại)
    for (let n = 0; n < 10 && sum(take) > 0; n++) {
      const r = computeTrip({ ...inputWith(input, take), quick })
      if (r.errors.length) return { parts, error: 'unplaceable', stuck: r.errors }
      const left = leftByLine(r, take)
      if (sum(left)) { for (const [k, v] of left) take.set(k, (take.get(k) ?? 0) - v); continue }
      if (r.overweight && input.truck.payloadKg) { dropForWeight(input, take, r.weightKg - input.truck.payloadKg); continue }
      if (quick) { quick = false; continue }
      ok = true; break
    }
    if (!ok || !sum(take)) {
      const names = [...new Set(input.orders.flatMap(o => o.lines.filter(l => (want.get(K(o.id, l.item.id)) ?? 0) > 0).map(l => l.item.name || l.item.code)))]
      return { parts, error: 'unplaceable', stuck: names }
    }
    const part: SplitPart = []
    for (const o of input.orders) {
      const seen = new Set<string>()
      for (const l of o.lines) {
        const k = K(o.id, l.item.id)
        if (seen.has(k)) continue
        seen.add(k)
        const q = take.get(k) ?? 0
        if (q > 0) { part.push({ orderId: o.id, itemId: l.item.id, qty: q }); want.set(k, (want.get(k) ?? 0) - q) }
      }
    }
    parts.push(part)
  }
  return { parts }
}
