// DIỄN GIẢI TỪNG MÃ (chủ dự án 28/10: "xếp khối như vậy thì cao bao nhiêu, lẻ bao nhiêu của từng mã — người làm
// tính được ngay từ lúc chưa lên hàng để có chiến thuật hợp lý, không cần bước trước bước sau"). Tóm từ sơ đồ đã
// tính — thuần (không React), chữ do màn hình ghép theo ngôn ngữ.
import type { TripResult } from './plan'

/** Xe thùng rời: một KHỐI = hàng của một mã trong một đơn. */
export interface LooseNote {
  group: number; label: string; orderName: string; orderId: string; itemId: string | null
  total: number; placed: number
  cols: number                  // số chân (thùng một lớp)
  layers: number                // số lớp của khối (chiều cao phần lớn các chân)
  fullCols: number              // chân cao đủ số lớp khối (kể cả chân có thùng nổi)
  low: [number, number][]       // lẻ THẤP: [số chân, số lớp] — chân chưa đủ lớp
  above: number                 // lẻ NỔI: thùng chồng trên mặt khối
  aboveLayers: number           // số lớp nổi cao nhất trên mặt khối
  rest: number                  // tổng thùng lẻ (thấp + nổi) — phần đủ lớp = fullCols × layers
  bodyMm: number                // cao thân khối = số lớp × cao thùng
  topMm: number                 // đỉnh cao nhất tính từ sàn xe
  onTop: boolean                // khối nằm trên nóc hàng khác
  lenMm: number; widMm: number  // mặt sàn khối chiếm: dọc xe × ngang xe
}

/** Phần lẻ của một mã nằm trên một pallet (không phải pallet chẵn). */
export interface PalletRest { group: number; label: string; n: number; from: number; to: number; of: number; heightMm: number; mixed: boolean }
/** Xe pallet: một mã trong một đơn. */
export interface PalletItemNote {
  itemId: string; label: string; orderName: string; orderId: string
  total: number                 // thùng của mã trong đơn
  full: { group: number; pallets: number; perPallet: number; perLayer: number; layers: number; heightMm: number; left: number } | null
  rest: PalletRest[]            // lẻ — mỗi mã nằm nguyên một pallet nên thường chỉ 1 dòng
}
/** Ruột một pallet gộp, từ DƯỚI lên: mỗi bậc = `times` lớp giống nhau liên tiếp. */
export interface MixNote {
  group: number; label: string; orderName: string; heightMm: number
  levels: { parts: { itemId: string; n: number }[]; times: number; full: boolean }[]
}

export function explainLoose(r: TripResult): LooseNote[] {
  const out: LooseNote[] = []
  for (const c of r.count) {
    const m = r.meta[c.group]
    const boxes = r.plan.placed.filter(b => b.group === c.group)
    if (!boxes.length) {
      out.push({ group: c.group, label: m.label, orderName: m.orderName, orderId: m.orderId, itemId: m.itemId, total: c.total, placed: 0, cols: 0, layers: 0, fullCols: 0, low: [], above: 0, aboveLayers: 0, rest: 0, bodyMm: 0, topMm: 0, onTop: false, lenMm: 0, widMm: 0 })
      continue
    }
    const cols = new Map<string, number>()
    for (const b of boxes) { const k = `${Math.round(b.x)}|${Math.round(b.y)}`; cols.set(k, (cols.get(k) ?? 0) + 1) }
    const hist = new Map<number, number>()
    for (const n of cols.values()) hist.set(n, (hist.get(n) ?? 0) + 1)
    // số lớp của khối = số lớp cho PHẦN ĐỦ LỚP (mọi chân cao ít nhất bấy nhiêu) nhiều thùng nhất — 8 chân × 8 + 8 chân
    // × 7 là khối 16 chân × 7 lớp, lẻ 8 thùng nổi lớp 8 (không phải 8 lớp, lẻ 56)
    const fullOf = (L: number) => [...cols.values()].filter(n => n >= L).length * L
    const layers = [...hist.keys()].sort((a, b) => fullOf(b) - fullOf(a) || a - b)[0]
    const fullCols = [...cols.values()].filter(n => n >= layers).length
    const low = [...hist.entries()].filter(([n]) => n < layers).sort((a, b) => b[0] - a[0]).map(([n, k]) => [k, n] as [number, number])
    const above = [...cols.values()].reduce((s, n) => s + Math.max(0, n - layers), 0)
    const h = boxes[0].h
    const x0 = Math.min(...boxes.map(b => b.x)), x1 = Math.max(...boxes.map(b => b.x + b.l))
    const y0 = Math.min(...boxes.map(b => b.y)), y1 = Math.max(...boxes.map(b => b.y + b.w))
    out.push({
      group: c.group, label: m.label, orderName: m.orderName, orderId: m.orderId, itemId: m.itemId, total: c.total, placed: c.placed,
      cols: cols.size, layers, fullCols, low, above, aboveLayers: Math.max(...cols.values()) - layers, rest: c.placed - fullCols * layers,
      bodyMm: layers * h, topMm: Math.max(...boxes.map(b => b.z + b.h)), onTop: c.onTopOfOthers,
      lenMm: x1 - x0, widMm: y1 - y0,
    })
  }
  return out
}

/** Xe pallet nhìn theo TỪNG PALLET (chủ dự án 29/10: "nhìn vào biết bao nhiêu pallet, pallet lẻ bao nhiêu, pallet nào
 *  chung nhau" — bảng theo mã phải đọc nhiều chữ). Thứ tự cabin ra cửa như bảng đếm chân. */
export interface PalletCard {
  group: number; orderName: string; orderId: string
  kind: 'full' | 'own' | 'mixed'   // chẵn · lẻ riêng một mã · lẻ GỘP nhiều mã
  count: number; placed: number    // số pallet giống hệt nhau trong khối (pallet chẵn cùng mã) · đã lên xe
  heightMm: number
  parts: { itemId: string; label: string; n: number; perLayer: number; layers: number }[]   // từ DƯỚI lên; n = thùng / pallet
}
export function explainPalletCards(r: TripResult): PalletCard[] {
  const out: PalletCard[] = []
  for (const c of r.count) {
    const gi = c.group, m = r.meta[gi], g = r.plan.groups[gi]
    if (!m.isPallet) continue
    const cs = m.cartons ?? []
    const low = (id: string) => Math.min(...cs.filter(x => x.itemId === id).map(x => x.z))
    const ids = [...new Set(cs.map(x => x.itemId))].sort((a, b) => low(a) - low(b))
    const parts = ids.map(id => {
      const mine = cs.filter(x => x.itemId === id)
      const per = new Map<number, number>()
      for (const x of mine) per.set(x.z, (per.get(x.z) ?? 0) + 1)
      return { itemId: id, label: m.mix?.find(x => x.itemId === id)?.label ?? m.label, n: mine.length, perLayer: Math.max(...per.values()), layers: per.size }
    })
    // không rõ ruột (thùng to hơn chân / chưa khai quy cách): một dòng tên khối, không số thùng
    if (!parts.length) parts.push({ itemId: m.itemId ?? '', label: m.label, n: 0, perLayer: 0, layers: 0 })
    const kind = g.key.endsWith('|full') ? 'full' : ids.length > 1 ? 'mixed' : 'own'
    out.push({ group: gi, orderName: m.orderName, orderId: m.orderId, kind, count: c.total, placed: c.placed, heightMm: g.h, parts })
  }
  return out
}

export function explainPallets(r: TripResult): { items: PalletItemNote[]; mixes: MixNote[] } {
  const items = new Map<string, PalletItemNote>()
  const mixes: MixNote[] = []
  // thứ tự theo bảng đếm chân (cabin ra cửa) để khớp danh sách bên dưới
  for (const c of r.count) {
    const gi = c.group, m = r.meta[gi], g = r.plan.groups[gi], cs = m.cartons ?? []
    if (!cs.length) continue
    const zs = [...new Set(cs.map(x => x.z))].sort((a, b) => a - b)
    const fullPallet = g.key.endsWith('|full')
    for (const id of new Set(cs.map(x => x.itemId))) {
      const key = `${m.orderId}|${id}`
      const note = items.get(key) ?? { itemId: id, label: m.mix?.find(x => x.itemId === id)?.label ?? m.label, orderName: m.orderName, orderId: m.orderId, total: 0, full: null, rest: [] }
      const mine = cs.filter(x => x.itemId === id)
      note.total += mine.length * g.count
      if (fullPallet) {
        note.label = m.label
        note.full = { group: gi, pallets: g.count, perPallet: mine.length, perLayer: mine.filter(x => x.z === zs[0]).length, layers: zs.length, heightMm: g.h, left: c.total - c.placed }
      } else {
        const lv = zs.map((z, i) => (mine.some(x => x.z === z) ? i + 1 : 0)).filter(Boolean)
        note.rest.push({ group: gi, label: m.label, n: mine.length, from: lv[0], to: lv[lv.length - 1], of: zs.length, heightMm: g.h, mixed: !!m.mix })
      }
      items.set(key, note)
    }
    if (m.mix) {
      const levels: MixNote['levels'] = []
      for (const z of zs) {
        const by = new Map<string, number>()
        for (const x of cs.filter(x => x.z === z)) by.set(x.itemId, (by.get(x.itemId) ?? 0) + 1)
        const parts = [...by.entries()].map(([itemId, n]) => ({ itemId, n }))
        const per = parts.length === 1 ? m.layers?.find(l => l.itemId === parts[0].itemId)?.per : undefined
        const sig = parts.map(p => `${p.itemId}:${p.n}`).join(',')
        const last = levels[levels.length - 1]
        if (last && last.parts.map(p => `${p.itemId}:${p.n}`).join(',') === sig) last.times++
        else levels.push({ parts, times: 1, full: per != null && parts[0].n >= per })
      }
      mixes.push({ group: gi, label: m.label, orderName: m.orderName, heightMm: g.h, levels })
    }
  }
  return { items: [...items.values()], mixes }
}
