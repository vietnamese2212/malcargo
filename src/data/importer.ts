// Nhập từ Excel: MỖI LOẠI một file mẫu riêng (Mã hàng · Xe · Đơn hàng · Chuyến), một trang. Người dùng điền rồi nạp
// file, hoặc chép bảng dán vào. Trùng tên / mã với cái đã có ⇒ GHI ĐÈ (giữ id cũ), chưa có ⇒ thêm mới.
// Kiểm chặt (chủ dự án 29/10): tiêu đề cột đúng mẫu, số trong khoảng hợp lý, không trùng trong file — có lỗi là không nhập gì.
import type { Item, Order, Trip, Vehicle } from './types'
import { newId, type ImportBatch } from './store'
import { getLang, numLocale, t, tx } from '../i18n'
import { EN } from '../i18n/en'
import { saveFile } from '../ui/saveFile'

export type SheetKey = 'items' | 'vehicles' | 'orders' | 'trips'
/** `text`: chữ hiện trên giao diện tiếng Anh khi nghĩa cột khác chữ dịch của `label` (vd cột "Mã hàng" = mã, không phải danh mục).
 *  `old`: tiêu đề cột đời trước vẫn nhận (file mẫu người dùng đã tải về). `file`: tên file mẫu của loại này. */
type Col = { label: string; text?: string; old?: string[]; req?: boolean; w: number }
export interface SheetDef { key: SheetKey; title: string; file: string; cols: Col[]; sample: (string | number)[][] }

// Thứ tự cột = thứ tự trong file mẫu. Đổi ở đây là đổi cả file mẫu lẫn cách đọc.
// File mẫu theo ngôn ngữ giao diện: tên trang + tiêu đề cột tiếng Việt (`title`, `label`) hoặc bản tiếng Anh
// (`EN`, cột có `text` thì lấy `text`). Đọc file nhận CẢ HAI tên trang (đổi ngôn ngữ giữa chừng / file cũ vẫn đọc
// được); cột đọc theo VỊ TRÍ. Dòng ví dụ là dữ liệu, dịch lúc hiện bằng tx() (`sampleRows`).
export const SHEETS: SheetDef[] = [
  {
    key: 'items', title: 'Mã hàng', file: 'malcargo-mau-ma-hang.xlsx', // i18n-key
    cols: [
      { label: 'Mã hàng', text: 'Mã', req: true, w: 14 }, { label: 'Tên hàng', req: true, w: 30 }, { label: 'Dài (mm)', req: true, w: 10 }, // i18n-key
      { label: 'Rộng (mm)', req: true, w: 10 }, { label: 'Cao (mm)', req: true, w: 10 }, { label: 'Kg/thùng', w: 10 }, // i18n-key
      { label: 'Thùng/pallet', w: 12 }, { label: 'Chồng tối đa (lớp)', w: 16 }, { label: 'Hàng nhẹ (x)', w: 12 }, // i18n-key
    ],
    sample: [['SP001', 'Sữa 110ml x48', 420, 255, 100, 6.2, 140, 14, ''], ['SP002', 'Thạch túi 110ml x24', 310, 130, 130, 3.08, 216, 8, 'x']], // i18n-ok
  },
  {
    key: 'vehicles', title: 'Xe', file: 'malcargo-mau-xe.xlsx', // i18n-key
    cols: [
      { label: 'Tên xe', req: true, w: 20 }, { label: 'Biển số', w: 12 }, { label: 'Cách chở (Thùng rời / Pallet)', w: 26 }, // i18n-key
      { label: 'Dài lòng thùng (mm)', req: true, w: 18 }, { label: 'Rộng (mm)', req: true, w: 10 }, { label: 'Cao (mm)', req: true, w: 10 }, // i18n-key
      { label: 'Tải trọng (kg)', w: 14 }, // i18n-key
    ],
    sample: [['Xe 5 tấn số 1', '29C12345', 'Thùng rời', 5700, 2000, 2000, 5000], ['Xe pallet 8 tấn', '29C67890', 'Pallet', 7400, 2350, 2300, 8000]], // i18n-ok
  },
  {
    key: 'orders', title: 'Đơn hàng', file: 'malcargo-mau-don-hang.xlsx', // i18n-key
    cols: [{ label: 'Tên đơn', req: true, w: 18 }, { label: 'Điểm giao', w: 24 }, { label: 'Mã hàng', text: 'Mã', req: true, w: 14 }, { label: 'Số thùng', req: true, w: 10 }], // i18n-key
    sample: [['Đơn 101', 'Cửa hàng A', 'SP001', 120], ['Đơn 101', 'Cửa hàng A', 'SP002', 30], ['Đơn 102', 'Cửa hàng B', 'SP001', 80]], // i18n-ok
  },
  {
    key: 'trips', title: 'Chuyến', file: 'malcargo-mau-chuyen.xlsx', // i18n-key
    cols: [{ label: 'Tên chuyến', req: true, w: 18 }, { label: 'Xe (tên hoặc biển số)', w: 22 }, { label: 'Tên đơn (giao trước ghi trước)', old: ['Tên đơn'], req: true, w: 30 }], // i18n-key
    sample: [['Chuyến sáng 28/10', '29C12345', 'Đơn 101'], ['Chuyến sáng 28/10', '29C12345', 'Đơn 102']], // i18n-ok
  },
]

/** Dòng ví dụ theo ngôn ngữ đang chọn: tên mẫu dịch bằng tx(); mã, biển số, số giữ nguyên (tên đơn dịch giống nhau ở
 *  trang Đơn hàng và Chuyến nên vẫn khớp; cách chở không chứa "pallet" vẫn là thùng rời). */
export const sampleRows = (s: SheetDef) => s.sample.map(r => r.map(c => (typeof c === 'string' ? tx(c) : c)))

/** Tên trang / tiêu đề cột trong file mẫu, cả hai ngôn ngữ (`[vi, en]`); `sheetName` / `colHead` theo ngôn ngữ đang dùng. */
const titles = (s: SheetDef) => [s.title, EN[s.title] ?? s.title]
const heads = (c: Col) => [c.label, EN[c.text ?? c.label] ?? c.label]
const sheetName = (s: SheetDef) => titles(s)[getLang() === 'vi' ? 0 : 1]
const colHead = (c: Col) => heads(c)[getLang() === 'vi' ? 0 : 1]

export type Rows = (string | number | boolean | null | undefined)[][]
export interface ImportResult extends ImportBatch { errors: string[]; updated: number }

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
    if (names(c).includes(norm(row?.[i]))) continue
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

// ── Số trong ô: khoảng hợp lệ (mm, kg) — cùng giới hạn form Thêm xe; số lẻ chỉ cho ở kích thước + kg
type Rule = { min: number; max: number; int?: boolean }
const DIM: Rule = { min: 10, max: 3000 }                  // cạnh thùng (mm)
const KG: Rule = { min: 0.01, max: 500 }                  // kg/thùng
const PER_PALLET: Rule = { min: 1, max: 5000, int: true }
const LAYERS: Rule = { min: 1, max: 50, int: true }
const BOX_L: Rule = { min: 500, max: 20000 }, BOX_W: Rule = { min: 500, max: 3500 }, BOX_H: Rule = { min: 500, max: 4500 }
const PAYLOAD: Rule = { min: 100, max: 60000 }
const QTY: Rule = { min: 1, max: 100000, int: true }
const YES = /^(x|1|có|co|yes|y|true)$/i, NO = /^(0|không|khong|no|n|false|-)$/i // i18n-ok — giá trị file (x / có / yes…)
const LOOSE = /rời|roi|xá|loose/i // i18n-ok — giá trị file

export function parseImport(src: Partial<Record<SheetKey, Rows>>, have: { items: Item[]; vehicles: Vehicle[]; orders: Order[]; trips: Trip[] }): ImportResult {
  const out: ImportResult = { items: [], vehicles: [], orders: [], trips: [], errors: [], updated: 0 }
  const err = (k: SheetKey, line: number, msg: string) =>
    out.errors.push(t('{sheet}, dòng {line}: {msg}', { sheet: t(SHEETS.find(s => s.key === k)!.title), line, msg }))
  // số ở cột i: trống ⇒ null (cột không bắt buộc; bắt buộc thì báo thiếu); sai ⇒ báo lỗi, trả undefined
  const cell = (k: SheetKey, ln: number, r: Rows[number], i: number, rule: Rule, req?: boolean): number | null | undefined => {
    const v = num(r[i]), col = colHead(cols(k)[i])
    if (v == null) { if (req) err(k, ln, t('thiếu {col}', { col })); return req ? undefined : null }
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
    const l = cell('items', ln, r, 2, DIM, true), w = cell('items', ln, r, 3, DIM, true), h = cell('items', ln, r, 4, DIM, true)
    const kg = cell('items', ln, r, 5, KG), pp = cell('items', ln, r, 6, PER_PALLET), ml = cell('items', ln, r, 7, LAYERS)
    const light = str(r[8]), badLight = !!light && !YES.test(light) && !NO.test(light)
    if (badLight) err('items', ln, t('{col}: ghi x hoặc để trống', { col: colHead(cols('items')[8]) }))
    if (l == null || w == null || h == null || [kg, pp, ml].includes(undefined) || badLight) continue
    // gõ cm vào ô mm (cùng ngưỡng cảnh báo của form Mã hàng)
    if (l < 100 && w < 100 && h < 100) { err('items', ln, t('{code}: cả 3 cạnh dưới 100 mm — có phải đang ghi cm? (40 cm = 400 mm)', { code })); continue }
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
    const l = cell('vehicles', ln, r, 3, BOX_L, true), w = cell('vehicles', ln, r, 4, BOX_W, true), h = cell('vehicles', ln, r, 5, BOX_H, true)
    const kg = cell('vehicles', ln, r, 6, PAYLOAD)
    const kind = /pallet/i.test(mode) ? 'pallet' as const : !mode || LOOSE.test(mode) ? 'loose' as const : null
    if (!kind) err('vehicles', ln, t('cách chở phải là "{a}" hoặc "{b}"', { a: tx('Thùng rời'), b: 'Pallet' })) // i18n-ok — giá trị ghi trong file, như dòng ví dụ
    if (l == null || w == null || h == null || kg === undefined || !kind) continue
    const old = mineVehicles.find(v => (plate && key(v.plate) === key(plate)) || (!plate && key(v.name) === key(name)))
    if (old) out.updated++
    out.vehicles.push({ id: old?.id ?? newId(), owner: 'me', name: name || plate, plate, kind, l, w, h, payloadKg: kg, updatedAt: 0 })
  }

  // ── Đơn hàng (gom dòng theo tên đơn; cùng mã ghi hai dòng thì cộng dồn; một đơn chỉ một điểm giao)
  const allItems = [...out.items, ...have.items]
  const findItem = (code: string) => allItems.find(i => key(i.code) === key(code)) ?? allItems.find(i => key(i.code) === key(`MAU-${code}`))
  const orderMap = new Map<string, Order>(), placeAt = new Map<string, [string, number]>()
  for (const [ln, r] of body(src.orders ?? [], 'orders', (l, m) => err('orders', l, m), 3)) {
    const name = str(r[0]), place = str(r[1]), code = str(r[2])
    if (!name || !code) { err('orders', ln, t('thiếu tên đơn hoặc mã hàng')); continue }
    const it = findItem(code)
    if (!it) { err('orders', ln, t('không thấy mã hàng "{code}"', { code })); continue }
    const qty = cell('orders', ln, r, 3, QTY, true)
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
  }
  out.orders = [...orderMap.values()]

  // ── Chuyến (gom dòng theo tên chuyến, giữ thứ tự dòng = thứ tự giao; một chuyến một xe, mỗi đơn một dòng)
  const allVehicles = [...out.vehicles, ...have.vehicles]
  const findVehicle = (s: string) => allVehicles.find(v => v.plate && key(v.plate) === key(s)) ?? allVehicles.find(v => key(v.name) === key(s))
  const allOrders = [...out.orders, ...have.orders]
  const tripMap = new Map<string, Trip>(), truckOf = new Map<string, [string, number]>(), orderAt = new Map<string, number>()
  for (const [ln, r] of body(src.trips ?? [], 'trips', (l, m) => err('trips', l, m))) {
    const name = str(r[0]), vs = str(r[1]), on = str(r[2])
    if (!name || !on) { err('trips', ln, t('thiếu tên chuyến hoặc tên đơn')); continue }
    const o = allOrders.find(x => key(x.name) === key(on))
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
  out.trips = [...tripMap.values()]
  return out
}

/** File mẫu .xlsx của MỘT loại: một trang, dòng tiêu đề + 2–3 dòng ví dụ, theo ngôn ngữ. Có hộp "Lưu thành…" thì người
 *  dùng chọn chỗ lưu (`saveFile`). Trả về false khi bấm Huỷ. */
export function saveTemplate(k: SheetKey) {
  const s = SHEETS.find(x => x.key === k)!
  return saveFile(t(s.file), async () => {
    const { default: writeXlsxFile } = await import('write-excel-file/browser')
    const head = (label: string, req?: boolean) => ({ value: req ? `${label} *` : label, fontWeight: 'bold' as const, textColor: '#ffffff', backgroundColor: req ? '#1a66ff' : '#0b1424' })
    return writeXlsxFile([{
      sheet: sheetName(s), stickyRowsCount: 1, columns: s.cols.map(c => ({ width: Math.max(c.w, colHead(c).length + 4) })),
      data: [s.cols.map(c => head(colHead(c), c.req)), ...sampleRows(s)],
    }], { fontFamily: 'Arial', fontSize: 11 }).toBlob()
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
  for (const x of sheets) {
    const s = SHEETS.find(s => titles(s).map(key).includes(key(x.name))) ?? SHEETS.find(s => !headError(s.key, x.data[0]))
    if (!s) continue
    const e = headError(s.key, x.data[0])
    if (e) bad(x.name, e); else rows[s.key] = x.data
  }
  if (!Object.keys(rows).length && !errors.length && sheets[0]) bad(sheets[0].name, headError(k, sheets[0].data[0]) ?? '')
  return { rows, errors }
}
