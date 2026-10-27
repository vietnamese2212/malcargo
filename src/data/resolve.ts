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
