import type { Item, Order, Vehicle } from './types'
import type { OrderInput, TruckInput } from '../engine/plan'

export function resolveOrder(o: Order, items: Item[]): OrderInput & { missing: number } {
  const byId = new Map(items.map(i => [i.id, i]))
  let missing = 0
  const lines: OrderInput['lines'] = []
  for (const l of o.lines) {
    const it = byId.get(l.itemId)
    if (!it) { missing++; continue }
    lines.push({ item: it, qty: l.qty })
  }
  return { id: o.id, name: o.name, place: o.place, lines, missing }
}

export const truckOf = (v: Vehicle): TruckInput =>
  ({ id: v.id, name: v.name, kind: v.kind, l: v.l, w: v.w, h: v.h, payloadKg: v.payloadKg })

/** Xe được TỰ CHỌN / GỢI Ý cho chuyến: cùng kiểu chở và cùng DÒNG với xe đang dùng — chưa có xe thì chỉ xe tải;
 *  container chỉ khi người dùng tự chọn (chủ dự án 28/10: Container 20ft nhỏ hơn xe 8 tấn nên bị tự chọn). */
export const pickPool = (vehicles: Vehicle[], current: Vehicle | undefined): Vehicle[] =>
  vehicles.filter(v => v.kind === (current?.kind ?? 'loose') && !!v.container === !!current?.container)
