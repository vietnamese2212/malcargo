// Ghép dữ liệu của người dùng (xe · mã hàng · đơn) vào thuật toán xếp — cùng trình tự với màn 3D
// của SUPPLYC: xe xá xếp thẳng thùng; xe pallet gom mọi hàng lên pallet trước rồi xếp các pallet.
// File này THUẦN (không React) để chạy được trong Web Worker và trong bài kiểm. Chữ sinh ra ở đây (nhãn pallet,
// cảnh báo) là tiếng Việt gốc — Worker không biết ngôn ngữ; màn hình dịch bằng `tx()` (luật trong src/i18n/en.ts).
import {
  cartonsPerPalletEstimate, computeLoadPlan, packPallet as packPalletBy, palletizeGroups, palletFitError, palletsTooTall,
  palletFloorSlots, spacePallets, spreadToDoor, type LoadGroup, type LoadPlan, type PalletSpec, type PalletizeInput,
} from './loadPlan'
export { spreadTarget } from './loadPlan'
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

/** Thùng thật trên mặt pallet (`packPallet` của lõi — khoá theo dòng hàng; ở đây khoá = id mã hàng). */
function packPallet(spec: PalletSpec, layers: PalletLayer[], light: Set<string>, maxLayers: Map<string, number>) {
  const r = packPalletBy(spec, layers.map(({ itemId, ...l }) => ({ key: itemId, ...l })), light, maxLayers)
  return { cartons: r.cartons.map(({ key, ...c }): PalletCarton => ({ itemId: key, ...c })), deck: r.deck }
}

// Bể phần lẻ hàng nhẹ khi chuyến bật "Hàng nhẹ: pallet riêng" — không dồn chung pallet gộp với hàng thường
const LIGHT_POOL = { key: 'light', label: 'hàng nhẹ' } // i18n-ok

const toSpec = (p: PalletSettings): PalletSpec =>
  ({ l: p.l, w: p.w, h: p.maxH, baseH: p.baseH, baseColor: '#a07a4e', weightKg: p.kg })

/** Số thùng / pallet của mã: đã khai thì dùng; chưa khai thì ƯỚC theo cỡ thùng — số thùng gọn trong chân một
 *  lớp × số lớp vừa trần chiều cao pallet (≤ số lớp khai). Lõi coi mã thiếu quy cách là "1 pallet / mã" bất kể
 *  số thùng ⇒ 2.000 thùng vẫn ra 1 pallet, báo vừa xe (lỗi thử 29/10). Thùng không nằm nổi trên chân ⇒ null. */
export function perPalletOf(item: Item, spec: PalletSpec): number | null {
  return item.perPallet || cartonsPerPalletEstimate(spec, item, item.maxLayers)
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
