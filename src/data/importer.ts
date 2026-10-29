// Nhập từ Excel: MỖI LOẠI một file mẫu riêng (Mã hàng · Xe · Đơn hàng · Chuyến), một trang. Người dùng điền rồi nạp
// file, hoặc chép bảng dán vào. Trùng tên / mã với cái đã có ⇒ GHI ĐÈ (giữ id cũ), chưa có ⇒ thêm mới.
// Kiểm chặt (chủ dự án 29/10): tiêu đề cột đúng mẫu, số trong khoảng hợp lý, không trùng trong file — có lỗi là không nhập gì.
import type { Item, Order, Trip, Vehicle } from './types'
import { newId, type ImportBatch } from './store'
import { getLang, numLocale, t, tx, txEn } from '../i18n'
import { EN } from '../i18n/en'
import { saveFile } from '../ui/saveFile'

export type SheetKey = 'items' | 'vehicles' | 'orders' | 'trips'

// ── Số trong ô: khoảng hợp lệ (mm, kg) — cùng giới hạn form Thêm xe; số lẻ chỉ cho ở kích thước + kg.
// Dùng HAI nơi: kiểm lúc nạp (`parseImport`) và ràng buộc ô trong file mẫu (`saveTemplate`).
type Rule = { min: number; max: number; int?: boolean }
const DIM: Rule = { min: 10, max: 3000 }                  // cạnh thùng (mm)
const KG: Rule = { min: 0.01, max: 500 }                  // kg/thùng
const PER_PALLET: Rule = { min: 1, max: 5000, int: true }
const LAYERS: Rule = { min: 1, max: 50, int: true }
const BOX_L: Rule = { min: 500, max: 20000 }, BOX_W: Rule = { min: 500, max: 3500 }, BOX_H: Rule = { min: 500, max: 4500 }
const PAYLOAD: Rule = { min: 100, max: 60000 }
const QTY: Rule = { min: 1, max: 100000, int: true }
/** Danh sách chọn của cột trong file mẫu: lấy từ dữ liệu trong app (mã hàng, xe, đơn) hoặc giá trị cố định. */
type Pick = 'codes' | 'trucks' | 'orders' | 'modes' | 'x'

/** `text`: chữ hiện trên giao diện tiếng Anh khi nghĩa cột khác chữ dịch của `label` (vd cột "Mã hàng" = mã, không phải danh mục).
 *  `old`: tiêu đề cột đời trước vẫn nhận (file mẫu người dùng đã tải về). `late`: cột thêm sau — file mẫu cũ thiếu cột
 *  này vẫn nhận. `rule` / `pick` / `uniq` (không trùng dòng khác): ràng buộc ô. `file`: tên file mẫu của loại này. */
type Col = { label: string; text?: string; old?: string[]; late?: boolean; req?: boolean; w: number; rule?: Rule; pick?: Pick; uniq?: boolean }
export interface SheetDef { key: SheetKey; title: string; file: string; cols: Col[]; sample: (string | number)[][] }

// Thứ tự cột = thứ tự trong file mẫu. Đổi ở đây là đổi cả file mẫu lẫn cách đọc.
// File mẫu theo ngôn ngữ giao diện: tên trang + tiêu đề cột tiếng Việt (`title`, `label`) hoặc bản tiếng Anh
// (`EN`, cột có `text` thì lấy `text`). Đọc file nhận CẢ HAI tên trang (đổi ngôn ngữ giữa chừng / file cũ vẫn đọc
// được); cột đọc theo VỊ TRÍ. Dòng ví dụ là dữ liệu, dịch lúc hiện bằng tx() (`sampleRows`).
export const SHEETS: SheetDef[] = [
  {
    key: 'items', title: 'Mã hàng', file: 'malcargo-mau-ma-hang.xlsx', // i18n-key
    cols: [
      { label: 'Mã hàng', text: 'Mã', req: true, w: 14, uniq: true }, { label: 'Tên hàng', req: true, w: 30 }, { label: 'Dài (mm)', req: true, w: 10, rule: DIM }, // i18n-key
      // nhập file: mọi cột bắt buộc trừ Hàng nhẹ (trống = không nhẹ) — chủ dự án 29/10; form Mã hàng vẫn cho để trống kg / pallet / lớp
      { label: 'Rộng (mm)', req: true, w: 10, rule: DIM }, { label: 'Cao (mm)', req: true, w: 10, rule: DIM }, { label: 'Kg/thùng', req: true, w: 10, rule: KG }, // i18n-key
      { label: 'Thùng/pallet', req: true, w: 12, rule: PER_PALLET }, { label: 'Chồng tối đa (lớp)', req: true, w: 16, rule: LAYERS }, { label: 'Hàng nhẹ (x)', w: 12, pick: 'x' }, // i18n-key
    ],
    sample: [['SP001', 'Sữa 110ml x48', 420, 255, 100, 6.2, 140, 14, ''], ['SP002', 'Thạch túi 110ml x24', 310, 130, 130, 3.08, 216, 8, 'x']], // i18n-ok
  },
  {
    key: 'vehicles', title: 'Xe', file: 'malcargo-mau-xe.xlsx', // i18n-key
    cols: [
      { label: 'Tên xe', req: true, w: 20 }, { label: 'Biển số', w: 12, uniq: true }, { label: 'Cách chở (Thùng rời / Pallet)', w: 26, pick: 'modes' }, // i18n-key
      { label: 'Dài lòng thùng (mm)', req: true, w: 18, rule: BOX_L }, { label: 'Rộng (mm)', req: true, w: 10, rule: BOX_W }, { label: 'Cao (mm)', req: true, w: 10, rule: BOX_H }, // i18n-key
      { label: 'Tải trọng (kg)', w: 14, rule: PAYLOAD }, // i18n-key
    ],
    sample: [['Xe 5 tấn số 1', '29C12345', 'Thùng rời', 5700, 2000, 2000, 5000], ['Xe pallet 8 tấn', '29C67890', 'Pallet', 7400, 2350, 2300, 8000]], // i18n-ok
  },
  {
    // Dòng xe (chủ dự án 29/10): xe trong app (tên hoặc biển số) — đơn vào chuyến thì chuyến dùng xe của đơn ĐẦU có ghi;
    // trống / không có trong app ⇒ bỏ qua, app tự gợi ý xe như thường
    key: 'orders', title: 'Đơn hàng', file: 'malcargo-mau-don-hang.xlsx', // i18n-key
    cols: [
      { label: 'Tên đơn', req: true, w: 18 }, { label: 'Điểm giao', w: 24 }, { label: 'Mã hàng', text: 'Mã', req: true, w: 34, pick: 'codes' }, // i18n-key
      { label: 'Số thùng', req: true, w: 10, rule: QTY }, { label: 'Dòng xe', w: 22, pick: 'trucks', late: true }, // i18n-key
    ],
    sample: [['Đơn 101', 'Cửa hàng A', 'SP001', 120, 'Xe tải 5 tấn'], ['Đơn 101', 'Cửa hàng A', 'SP002', 30, 'Xe tải 5 tấn'], ['Đơn 102', 'Cửa hàng B', 'SP001', 80, '']], // i18n-ok
  },
  {
    key: 'trips', title: 'Chuyến', file: 'malcargo-mau-chuyen.xlsx', // i18n-key
    cols: [
      { label: 'Tên chuyến', req: true, w: 18 }, { label: 'Xe (tên hoặc biển số)', w: 22, pick: 'trucks' }, // i18n-key
      { label: 'Tên đơn (giao trước ghi trước)', old: ['Tên đơn'], req: true, w: 30, pick: 'orders' }, // i18n-key
    ],
    sample: [['Chuyến sáng 28/10', '29C12345', 'Đơn 101'], ['Chuyến sáng 28/10', '29C12345', 'Đơn 102']], // i18n-ok
  },
]

/** Dòng ví dụ theo ngôn ngữ đang chọn: tên mẫu dịch bằng tx(); mã, biển số, số giữ nguyên (tên đơn dịch giống nhau ở
 *  trang Đơn hàng và Chuyến nên vẫn khớp; cách chở không chứa "pallet" vẫn là thùng rời). */
export const sampleRows = (s: SheetDef) => s.sample.map(r => r.map((c, i) => {
  if (typeof c !== 'string') return c
  if (s.cols[i].pick !== 'codes') return tx(c)
  // mã hàng hiện như trong danh sách chọn: "Mã - Tên" (tên lấy ở dòng ví dụ của file Mã hàng)
  const it = SHEETS.find(x => x.key === 'items')!.sample.find(x => x[0] === c)
  return it ? itemLabel(c, tx(String(it[1]))) : c
}))

/** Mã hàng trong danh sách chọn của file mẫu: "Mã - Tên" — người dùng nhớ tên hàng, không nhớ mã (chủ dự án 29/10).
 *  Nạp lại thì tách lấy mã (`parseImport`); ghi mã không cũng nhận. */
const SEP = ' - '
const itemLabel = (code: string, name: string) => `${code}${SEP}${name}`

/** Tên trang / tiêu đề cột trong file mẫu, cả hai ngôn ngữ (`[vi, en]`); `sheetName` / `colHead` theo ngôn ngữ đang dùng. */
const titles = (s: SheetDef) => [s.title, EN[s.title] ?? s.title]
const heads = (c: Col) => [c.label, EN[c.text ?? c.label] ?? c.label]
const sheetName = (s: SheetDef) => titles(s)[getLang() === 'vi' ? 0 : 1]
const colHead = (c: Col) => heads(c)[getLang() === 'vi' ? 0 : 1]

export type Rows = (string | number | boolean | null | undefined)[][]
/** `orderTruck`: id đơn → id xe ghi ở cột Dòng xe; `unknownTrucks`: dòng xe ghi mà app không có (bỏ qua, chỉ báo). */
export interface ImportResult extends ImportBatch { errors: string[]; updated: number; orderTruck: Record<string, string>; unknownTrucks: string[] }

const str = (v: unknown) => (v == null ? '' : String(v).trim())
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return v
  const s = str(v).replace(/\s/g, '')
  if (!s) return null
  // 12,5 hoặc 12.5 đều nhận; 5.700 (dấu chấm nghìn kiểu VN) cũng nhận
  const n = Number(/^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s.replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}
const key = (s: string) => s.trim().toLowerCase()
const fmtN = (n: number) => n.toLocaleString(numLocale())
const letter = (i: number) => String.fromCharCode(65 + i)
const cols = (k: SheetKey) => SHEETS.find(s => s.key === k)!.cols

/** Chép từ Excel = các cột cách nhau bằng Tab (hoặc ;). */
export const splitPasted = (text: string): Rows => text.split(/\r?\n/).filter(l => l.trim()).map(l => l.split(/\t|;/))

// ── Dòng tiêu đề phải ĐÚNG mẫu: đủ cột, đúng thứ tự — cột đọc theo vị trí, đảo / chèn cột là dữ liệu vào nhầm ô.
// Tiếng Việt hay tiếng Anh đều được, dấu * không bắt buộc, cột thừa ở CUỐI bỏ qua.
const norm = (v: unknown) => key(str(v).replace(/\*$/, '')).replace(/\s+/g, ' ')
const names = (c: Col) => [...heads(c), ...(c.old ?? []).flatMap(o => [o, EN[o] ?? o])].map(norm)
/** null = đúng mẫu; sai ⇒ cột nào sai. */
export function headError(k: SheetKey, row: Rows[number] | undefined): string | null {
  for (const [i, c] of cols(k).entries()) {
    if (names(c).includes(norm(row?.[i])) || (c.late && !str(row?.[i]))) continue
    const got = str(row?.[i])
    return got ? t('cột {col} là "{got}", mẫu là "{want}"', { col: letter(i), got, want: colHead(c) })
      : t('thiếu cột {col} "{want}"', { col: letter(i), want: colHead(c) })
  }
  return null
}

/** Bỏ dòng trống. Dòng đầu là tiêu đề (ô đầu trùng tên cột đầu, hoặc ô phải là số lại là chữ) ⇒ phải đúng mẫu rồi bỏ đi;
 *  sai mẫu ⇒ báo lỗi, bỏ cả bảng. Trả về [số dòng trong file, ô] để báo lỗi đúng dòng. */
function body(rows: Rows, k: SheetKey, err: (line: number, msg: string) => void, numCol?: number): [number, Rows[number]][] {
  const out = rows.map((r, i) => [i + 1, r] as [number, Rows[number]]).filter(([, r]) => r.some(c => str(c)))
  const [line, r] = out[0] ?? []
  if (!r || !(names(cols(k)[0]).includes(norm(r[0])) || (numCol != null && Number.isNaN(num(r[numCol]))))) return out
  const e = headError(k, r)
  if (e) { err(line!, e); return [] }
  return out.slice(1)
}

const YES = /^(x|1|có|co|yes|y|true)$/i, NO = /^(0|không|khong|no|n|false|-)$/i // i18n-ok — giá trị file (x / có / yes…)
const LOOSE = /rời|roi|xá|loose/i // i18n-ok — giá trị file

export function parseImport(src: Partial<Record<SheetKey, Rows>>, have: { items: Item[]; vehicles: Vehicle[]; orders: Order[]; trips: Trip[] }): ImportResult {
  const out: ImportResult = { items: [], vehicles: [], orders: [], trips: [], errors: [], updated: 0, orderTruck: {}, unknownTrucks: [] }
  const err = (k: SheetKey, line: number, msg: string) =>
    out.errors.push(t('{sheet}, dòng {line}: {msg}', { sheet: t(SHEETS.find(s => s.key === k)!.title), line, msg }))
  // số ở cột i theo `rule` của cột: trống ⇒ null (cột bắt buộc thì báo thiếu); sai ⇒ báo lỗi, trả undefined
  const cell = (k: SheetKey, ln: number, r: Rows[number], i: number): number | null | undefined => {
    const c = cols(k)[i], rule = c.rule!, v = num(r[i]), col = colHead(c)
    if (v == null) { if (c.req) err(k, ln, t('thiếu {col}', { col })); return c.req ? undefined : null }
    if (Number.isNaN(v)) err(k, ln, t('{col} phải là số', { col }))
    else if (rule.int && !Number.isInteger(v)) err(k, ln, t('{col} phải là số nguyên', { col }))
    else if (v < rule.min || v > rule.max) err(k, ln, t('{col} phải từ {min} đến {max}', { col, min: fmtN(rule.min), max: fmtN(rule.max) }))
    else return v
    return undefined
  }
  const mineItems = have.items.filter(i => i.owner === 'me'), mineVehicles = have.vehicles.filter(v => v.owner === 'me')

  // ── Mã hàng (một mã chỉ một dòng)
  const itemAt = new Map<string, number>()
  for (const [ln, r] of body(src.items ?? [], 'items', (l, m) => err('items', l, m), 2)) {
    const code = str(r[0]), name = str(r[1])
    if (!code || !name) { err('items', ln, t('thiếu mã hoặc tên')); continue }
    const dup = itemAt.get(key(code))
    if (dup) { err('items', ln, t('mã "{code}" trùng dòng {line}', { code, line: dup })); continue }
    itemAt.set(key(code), ln)
    const [l, w, h, kg, pp, ml] = [2, 3, 4, 5, 6, 7].map(i => cell('items', ln, r, i))
    const light = str(r[8]), badLight = !!light && !YES.test(light) && !NO.test(light)
    if (badLight) err('items', ln, t('{col}: ghi x hoặc để trống', { col: colHead(cols('items')[8]) }))
    // gõ cm vào ô mm (cùng ngưỡng cảnh báo của form Mã hàng) — báo cùng lúc với lỗi khác của dòng
    const cm = l != null && w != null && h != null && l < 100 && w < 100 && h < 100
    if (cm) err('items', ln, t('{code}: cả 3 cạnh dưới 100 mm — có phải đang ghi cm? (40 cm = 400 mm)', { code }))
    if (l == null || w == null || h == null || [kg, pp, ml].includes(undefined) || badLight || cm) continue
    const old = mineItems.find(i => key(i.code) === key(code))
    if (old) out.updated++
    out.items.push({ id: old?.id ?? newId(), owner: 'me', code, name, l, w, h, kg: kg ?? null, perPallet: pp ?? null, maxLayers: ml ?? null, light: YES.test(light), updatedAt: 0 })
  }

  // ── Xe (một biển số — hoặc một tên khi không biển số — chỉ một dòng)
  const truckAt = new Map<string, number>()
  for (const [ln, r] of body(src.vehicles ?? [], 'vehicles', (l, m) => err('vehicles', l, m), 3)) {
    const name = str(r[0]), plate = str(r[1]).toUpperCase(), mode = str(r[2])
    if (!name && !plate) { err('vehicles', ln, t('thiếu tên xe')); continue }
    const dup = truckAt.get(key(plate || name))
    if (dup) { err('vehicles', ln, t('xe "{name}" trùng dòng {line}', { name: plate || name, line: dup })); continue }
    truckAt.set(key(plate || name), ln)
    const [l, w, h, kg] = [3, 4, 5, 6].map(i => cell('vehicles', ln, r, i))
    const kind = /pallet/i.test(mode) ? 'pallet' as const : !mode || LOOSE.test(mode) ? 'loose' as const : null
    if (!kind) err('vehicles', ln, t('cách chở phải là "{a}" hoặc "{b}"', { a: tx('Thùng rời'), b: 'Pallet' })) // i18n-ok — giá trị ghi trong file, như dòng ví dụ
    if (l == null || w == null || h == null || kg === undefined || !kind) continue
    const old = mineVehicles.find(v => (plate && key(v.plate) === key(plate)) || (!plate && key(v.name) === key(name)))
    if (old) out.updated++
    out.vehicles.push({ id: old?.id ?? newId(), owner: 'me', name: name || plate, plate, kind, l, w, h, payloadKg: kg, updatedAt: 0 })
  }

  // xe theo biển số, rồi theo tên (tên xe / đơn mẫu khớp cả bản tiếng Anh — file mẫu tiếng Anh ghi tên tiếng Anh)
  const named = (name: string, s: string) => key(name) === key(s) || key(txEn(name)) === key(s)
  const allVehicles = [...out.vehicles, ...have.vehicles]
  const findVehicle = (s: string) => allVehicles.find(v => v.plate && key(v.plate) === key(s)) ?? allVehicles.find(v => named(v.name, s))

  // ── Đơn hàng (gom dòng theo tên đơn; cùng mã ghi hai dòng thì cộng dồn; một đơn chỉ một điểm giao;
  // dòng xe: lấy dòng đầu có ghi xe có trong app, ghi sai thì bỏ qua — không chặn)
  const allItems = [...out.items, ...have.items]
  // mã → "Mã - Tên" như danh sách chọn (tên mẫu tiếng Việt hay tiếng Anh) → phần trước " - " (tên hàng đã đổi sau khi tải file)
  const byCode = (c: string) => allItems.find(i => key(i.code) === key(c)) ?? allItems.find(i => key(i.code) === key(`MAU-${c}`))
  const findItem = (s: string) => byCode(s) ?? allItems.find(i => [i.name, txEn(i.name)].some(n => key(itemLabel(i.code, n)) === key(s)))
    ?? (s.includes(SEP) ? byCode(s.slice(0, s.indexOf(SEP))) : undefined)
  const orderMap = new Map<string, Order>(), placeAt = new Map<string, [string, number]>()
  for (const [ln, r] of body(src.orders ?? [], 'orders', (l, m) => err('orders', l, m), 3)) {
    const name = str(r[0]), place = str(r[1]), code = str(r[2]), truck = str(r[4])
    if (!name || !code) { err('orders', ln, t('thiếu tên đơn hoặc mã hàng')); continue }
    const it = findItem(code)
    if (!it) { err('orders', ln, t('không thấy mã hàng "{code}"', { code })); continue }
    const qty = cell('orders', ln, r, 3)
    if (qty == null) continue
    const p0 = placeAt.get(key(name))
    if (place && p0 && key(p0[0]) !== key(place)) { err('orders', ln, t('đơn "{name}": điểm giao khác dòng {line} ("{place}")', { name, line: p0[1], place: p0[0] })); continue }
    if (place && !p0) placeAt.set(key(name), [place, ln])
    let o = orderMap.get(key(name))
    if (!o) {
      const old = have.orders.find(x => key(x.name) === key(name))
      if (old) out.updated++
      o = { id: old?.id ?? newId(), name, place: place || old?.place || '', lines: [], updatedAt: 0 }
      orderMap.set(key(name), o)
    }
    if (place) o.place = place
    const line = o.lines.find(l => l.itemId === it.id)
    if (line) line.qty += qty; else o.lines.push({ itemId: it.id, qty })
    const v = truck ? findVehicle(truck) : null
    if (v && !out.orderTruck[o.id]) out.orderTruck[o.id] = v.id
    if (truck && !v && !out.unknownTrucks.includes(truck)) out.unknownTrucks.push(truck)
  }
  out.orders = [...orderMap.values()]

  // ── Chuyến (gom dòng theo tên chuyến, giữ thứ tự dòng = thứ tự giao; một chuyến một xe, mỗi đơn một dòng;
  // không dòng nào ghi xe ⇒ lấy dòng xe của đơn ĐẦU có ghi ở file Đơn hàng)
  const allOrders = [...out.orders, ...have.orders]
  const tripMap = new Map<string, Trip>(), truckOf = new Map<string, [string, number]>(), orderAt = new Map<string, number>()
  for (const [ln, r] of body(src.trips ?? [], 'trips', (l, m) => err('trips', l, m))) {
    const name = str(r[0]), vs = str(r[1]), on = str(r[2])
    if (!name || !on) { err('trips', ln, t('thiếu tên chuyến hoặc tên đơn')); continue }
    const o = allOrders.find(x => named(x.name, on))
    if (!o) { err('trips', ln, t('không thấy đơn "{name}"', { name: on })); continue }
    const v = vs ? findVehicle(vs) : null
    if (vs && !v) { err('trips', ln, t('không thấy xe "{name}"', { name: vs })); continue }
    const v0 = truckOf.get(key(name))
    if (vs && v0 && key(v0[0]) !== key(vs)) { err('trips', ln, t('chuyến "{name}": xe khác dòng {line} ("{truck}")', { name, line: v0[1], truck: v0[0] })); continue }
    if (vs && !v0) truckOf.set(key(name), [vs, ln])
    const at = orderAt.get(`${key(name)}|${o.id}`)
    if (at) { err('trips', ln, t('đơn "{name}" đã ghi ở dòng {line}', { name: on, line: at })); continue }
    orderAt.set(`${key(name)}|${o.id}`, ln)
    let trip = tripMap.get(key(name))
    if (!trip) {
      const old = have.trips.find(x => key(x.name) === key(name))
      if (old) out.updated++
      // chuyến đã có: giữ mã chuyến + cài đặt (hàng nhẹ xe pallet…), file chỉ ghi đè xe và đơn
      trip = { ...old, id: old?.id ?? newId(), name, vehicleId: old?.vehicleId ?? null, orderIds: [], updatedAt: 0 }
      tripMap.set(key(name), trip)
    }
    if (v) trip.vehicleId = v.id
    trip.orderIds.push(o.id)
  }
  for (const [k, trip] of tripMap) {
    const v = truckOf.has(k) ? undefined : trip.orderIds.map(id => out.orderTruck[id]).find(Boolean)
    if (v) trip.vehicleId = v
  }
  out.trips = [...tripMap.values()]
  return out
}

// ── Ràng buộc ô trong file mẫu (Data Validation của Excel — chủ dự án 29/10: "ép người dùng không làm sai, list lấy
// luôn dữ liệu trong app"): số theo `rule`, cột `uniq` không trùng dòng khác, cột `pick` chỉ chọn trong danh sách.
// Danh sách lấy từ app (mã hàng, xe, đơn) nằm ở trang ẩn `_lists`; ghi sai ⇒ Excel chặn, báo lý do.
const LAST = 5000            // số dòng dữ liệu có ràng buộc
const LISTS = '_lists'       // trang ẩn chứa danh sách chọn — đọc file thì bỏ qua
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const dv = (type: string, ref: string, msg: string, f1: string, f2?: string) =>
  `<dataValidation ${type} allowBlank="1" showErrorMessage="1" errorTitle="MalCargo" error="${xmlEsc(msg)}" sqref="${ref}">` +
  `<formula1>${xmlEsc(f1)}</formula1>${f2 == null ? '' : `<formula2>${f2}</formula2>`}</dataValidation>`
type Have = { items: Item[]; vehicles: Vehicle[]; orders: Order[] }

function checks(s: SheetDef, have: Have): { xml: string; lists: string[][] } {
  const uniq = (l: string[]) => [...new Set(l.filter(Boolean))]
  const pick: Record<Pick, string[]> = {
    codes: uniq(have.items.map(i => itemLabel(i.code, tx(i.name)))), orders: uniq(have.orders.map(o => tx(o.name))),
    trucks: uniq(have.vehicles.flatMap(v => [tx(v.name), v.plate])),   // tên (tên mẫu theo ngôn ngữ) + biển số
    modes: [tx('Thùng rời'), 'Pallet'], x: ['x'], // i18n-ok — giá trị ghi trong file
  }
  const lists: string[][] = [], out: string[] = []
  s.cols.forEach((c, i) => {
    const L = letter(i), ref = `${L}2:${L}${LAST}`
    if (c.rule) {
      const { min, max, int } = c.rule, vars = { min: fmtN(min), max: fmtN(max) }
      out.push(dv(`type="${int ? 'whole' : 'decimal'}" operator="between"`, ref,
        int ? t('Nhập số nguyên từ {min} đến {max}.', vars) : t('Nhập số từ {min} đến {max}.', vars), String(min), String(max)))
    }
    if (c.uniq) out.push(dv('type="custom"', ref, t('Trùng với dòng khác trong file.'), `COUNTIF($${L}$2:$${L}$${LAST},${L}2)<=1`))
    const vals = c.pick ? pick[c.pick] : []
    if (!vals.length) return
    let f = `"${vals.join(',')}"`                         // giá trị cố định ghi thẳng
    if (c.pick === 'codes' || c.pick === 'trucks' || c.pick === 'orders') {
      lists.push(vals)
      const C = letter(lists.length - 1)
      f = `'${LISTS}'!$${C}$1:$${C}$${vals.length}`
    }
    out.push(dv('type="list"', ref, t('Chọn trong danh sách — lấy từ dữ liệu trong app.'), f))
  })
  return { xml: out.length ? `<dataValidations count="${out.length}">${out.join('')}</dataValidations>` : '', lists }
}

/** File mẫu .xlsx của MỘT loại: một trang, dòng tiêu đề + 2–3 dòng ví dụ, theo ngôn ngữ, kèm ràng buộc ô (`checks`) lấy
 *  danh sách từ dữ liệu trong app (`have`). Có hộp "Lưu thành…" thì người dùng chọn chỗ lưu (`saveFile`). False = bấm Huỷ. */
export function saveTemplate(k: SheetKey, have: Have) {
  const s = SHEETS.find(x => x.key === k)!
  return saveFile(t(s.file), async () => {
    const [{ default: writeXlsxFile }, { unzipSync, zipSync, strFromU8, strToU8 }] = await Promise.all([import('write-excel-file/browser'), import('fflate')])
    const head = (label: string, req?: boolean) => ({ value: req ? `${label} *` : label, fontWeight: 'bold' as const, textColor: '#ffffff', backgroundColor: req ? '#1a66ff' : '#0b1424' })
    const { xml, lists } = checks(s, have)
    const blob = await writeXlsxFile([
      {
        sheet: sheetName(s), stickyRowsCount: 1, columns: s.cols.map(c => ({ width: Math.max(c.w, colHead(c).length + 4) })),
        data: [s.cols.map(c => head(colHead(c), c.req)), ...sampleRows(s)],
      },
      ...(lists.length ? [{ sheet: LISTS, data: Array.from({ length: Math.max(...lists.map(l => l.length)) }, (_, r) => lists.map(l => l[r] ?? null)) }] : []),
    ], { fontFamily: 'Arial', fontSize: 11 }).toBlob()
    // thư viện ghi Excel chưa có ràng buộc ô ⇒ chèn thẳng vào XML của trang, ẩn trang danh sách
    const z = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    const edit = (f: string, fn: (x: string) => string) => { z[f] = strToU8(fn(strFromU8(z[f]))) }
    edit('xl/worksheets/sheet1.xml', x => x.replace('</sheetData>', `</sheetData>${xml}`))
    if (lists.length) edit('xl/workbook.xml', x => x.replace(`name="${LISTS}"/>`, `name="${LISTS}" state="hidden"/>`))
    return new Blob([zipSync(z)], { type: XLSX })
  })
}

/** Đọc file .xlsx đã điền. Mỗi trang là loại mang TÊN trang (tiếng Việt hay tiếng Anh, không phân biệt hoa thường —
 *  file mẫu, kể cả file 4 trang đời trước), trang tên khác thì nhận theo dòng tiêu đề. Dòng 1 phải là tiêu đề ĐÚNG mẫu,
 *  sai ⇒ `errors` (cả file bị từ chối). Không trang nào nhận ra ⇒ báo lỗi tiêu đề của trang đầu theo loại `k` đang chọn. */
export async function readWorkbook(file: File, k: SheetKey): Promise<{ rows: Partial<Record<SheetKey, Rows>>; errors: string[] }> {
  const { default: readXlsxFile } = await import('read-excel-file/browser')
  // ô ngày (vd tên chuyến "28/10" Excel tự hiểu là ngày) → chữ ngày/tháng/năm cố định: là DỮ LIỆU, không theo ngôn ngữ giao diện
  const cells = (data: unknown[][]): Rows => data.map(r => r.map(c => (c instanceof Date ? c.toLocaleDateString('vi-VN') : (c as string | number | boolean | null))))
  const sheets = (await readXlsxFile(file)).map(x => ({ name: x.sheet, data: cells(x.data) }))
  const rows: Partial<Record<SheetKey, Rows>> = {}, errors: string[] = []
  const bad = (sheet: string, msg: string) => errors.push(t('Trang {sheet}: {msg}', { sheet, msg }))
  for (const x of sheets.filter(x => x.name !== LISTS)) {
    const s = SHEETS.find(s => titles(s).map(key).includes(key(x.name))) ?? SHEETS.find(s => !headError(s.key, x.data[0]))
    if (!s) continue
    const e = headError(s.key, x.data[0])
    if (e) bad(x.name, e); else rows[s.key] = x.data
  }
  if (!Object.keys(rows).length && !errors.length && sheets[0]) bad(sheets[0].name, headError(k, sheets[0].data[0]) ?? '')
  return { rows, errors }
}
