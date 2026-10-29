// Nhập từ Excel: MỖI LOẠI một file mẫu riêng (Mã hàng · Xe · Đơn hàng · Chuyến), một trang. Người dùng điền rồi nạp
// file, hoặc chép bảng dán vào. Trùng tên / mã với cái đã có ⇒ GHI ĐÈ (giữ id cũ), chưa có ⇒ thêm mới.
import type { Item, Order, Trip, Vehicle } from './types'
import { newId, type ImportBatch } from './store'
import { getLang, t, tx } from '../i18n'
import { EN } from '../i18n/en'
import { saveFile } from '../ui/saveFile'

export type SheetKey = 'items' | 'vehicles' | 'orders' | 'trips'
/** `text`: chữ hiện trên giao diện tiếng Anh khi nghĩa cột khác chữ dịch của `label` (vd cột "Mã hàng" = mã, không phải danh mục).
 *  `file`: tên file mẫu của loại này. */
export interface SheetDef { key: SheetKey; title: string; file: string; cols: { label: string; text?: string; req?: boolean; w: number }[]; note: string; sample: (string | number)[][] }

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
    note: 'Kích thước THÙNG, đo mặt ngoài, tính mm. Hàng nhẹ ghi x. Mã trùng mã đã có ⇒ cập nhật.', // i18n-key
    sample: [['SP001', 'Sữa 110ml x48', 420, 255, 100, 6.2, 140, 14, ''], ['SP002', 'Thạch túi 110ml x24', 310, 130, 130, 3.08, 216, 8, 'x']], // i18n-ok
  },
  {
    key: 'vehicles', title: 'Xe', file: 'malcargo-mau-xe.xlsx', // i18n-key
    cols: [
      { label: 'Tên xe', req: true, w: 20 }, { label: 'Biển số', w: 12 }, { label: 'Cách chở (Thùng rời / Pallet)', w: 26 }, // i18n-key
      { label: 'Dài lòng thùng (mm)', req: true, w: 18 }, { label: 'Rộng (mm)', req: true, w: 10 }, { label: 'Cao (mm)', req: true, w: 10 }, // i18n-key
      { label: 'Tải trọng (kg)', w: 14 }, // i18n-key
    ],
    note: 'Đo LÒNG thùng (bên trong), tính mm. Cách chở bỏ trống = Thùng rời. Biển số (hoặc tên) trùng xe đã có ⇒ cập nhật.', // i18n-key
    sample: [['Xe 5 tấn số 1', '29C12345', 'Thùng rời', 5700, 2000, 2000, 5000], ['Xe pallet 8 tấn', '29C67890', 'Pallet', 7400, 2350, 2300, 8000]], // i18n-ok
  },
  {
    key: 'orders', title: 'Đơn hàng', file: 'malcargo-mau-don-hang.xlsx', // i18n-key
    cols: [{ label: 'Tên đơn', req: true, w: 18 }, { label: 'Điểm giao', w: 24 }, { label: 'Mã hàng', text: 'Mã', req: true, w: 14 }, { label: 'Số thùng', req: true, w: 10 }], // i18n-key
    note: 'Mỗi dòng một mã hàng; đơn nhiều mã thì lặp lại tên đơn. Mã hàng phải có sẵn trong app, hoặc nạp file Mã hàng cùng lúc.', // i18n-key
    sample: [['Đơn 101', 'Cửa hàng A', 'SP001', 120], ['Đơn 101', 'Cửa hàng A', 'SP002', 30], ['Đơn 102', 'Cửa hàng B', 'SP001', 80]], // i18n-ok
  },
  {
    key: 'trips', title: 'Chuyến', file: 'malcargo-mau-chuyen.xlsx', // i18n-key
    cols: [{ label: 'Tên chuyến', req: true, w: 18 }, { label: 'Xe (tên hoặc biển số)', w: 22 }, { label: 'Tên đơn', req: true, w: 18 }], // i18n-key
    note: 'Mỗi dòng một đơn, ghi theo THỨ TỰ GIAO: đơn giao trước ghi trước (được xếp sát cửa).', // i18n-key
    sample: [['Chuyến sáng 28/10', '29C12345', 'Đơn 101'], ['Chuyến sáng 28/10', '29C12345', 'Đơn 102']], // i18n-ok
  },
]

/** Dòng ví dụ theo ngôn ngữ đang chọn: tên mẫu dịch bằng tx(); mã, biển số, số giữ nguyên (tên đơn dịch giống nhau ở
 *  trang Đơn hàng và Chuyến nên vẫn khớp; cách chở không chứa "pallet" vẫn là thùng rời). */
export const sampleRows = (s: SheetDef) => s.sample.map(r => r.map(c => (typeof c === 'string' ? tx(c) : c)))

/** Tên trang / tiêu đề cột trong file mẫu, cả hai ngôn ngữ (`[vi, en]`); `sheetName` / `colHead` theo ngôn ngữ đang dùng. */
const titles = (s: SheetDef) => [s.title, EN[s.title] ?? s.title]
const heads = (c: SheetDef['cols'][number]) => [c.label, EN[c.text ?? c.label] ?? c.label]
const sheetName = (s: SheetDef) => titles(s)[getLang() === 'vi' ? 0 : 1]
export const colHead = (c: SheetDef['cols'][number]) => heads(c)[getLang() === 'vi' ? 0 : 1]

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

/** Chép từ Excel = các cột cách nhau bằng Tab (hoặc ;). */
export const splitPasted = (text: string): Rows => text.split(/\r?\n/).filter(l => l.trim()).map(l => l.split(/\t|;/))

/** Bỏ dòng trống và dòng tiêu đề (ô đầu trùng tên cột đầu, hoặc ô phải là số lại là chữ).
 *  Trả về [số dòng trong file, ô] để báo lỗi đúng dòng. */
function body(rows: Rows, k: SheetKey, numCol?: number): [number, Rows[number]][] {
  const first = heads(SHEETS.find(s => s.key === k)!.cols[0]).map(key)
  const isHead = (r: Rows[number]) => first.includes(key(str(r[0]).replace(/\*$/, ''))) || (numCol != null && Number.isNaN(num(r[numCol])))
  return rows.map((r, i) => [i + 1, r] as [number, Rows[number]])
    .filter(([, r]) => r.some(c => str(c)))
    .filter(([, r], i) => !(i === 0 && isHead(r)))
}

export function parseImport(src: Partial<Record<SheetKey, Rows>>, have: { items: Item[]; vehicles: Vehicle[]; orders: Order[]; trips: Trip[] }): ImportResult {
  const out: ImportResult = { items: [], vehicles: [], orders: [], trips: [], errors: [], updated: 0 }
  const err = (k: SheetKey, line: number, msg: string) =>
    out.errors.push(t('{sheet}, dòng {line}: {msg}', { sheet: t(SHEETS.find(s => s.key === k)!.title), line, msg }))
  const mineItems = have.items.filter(i => i.owner === 'me'), mineVehicles = have.vehicles.filter(v => v.owner === 'me')

  // ── Mã hàng
  for (const [ln, r] of body(src.items ?? [], 'items', 2)) {
    const code = str(r[0]), name = str(r[1]), l = num(r[2]), w = num(r[3]), h = num(r[4])
    if (!code || !name) { err('items', ln, t('thiếu mã hoặc tên')); continue }
    if (!(l! > 0 && w! > 0 && h! > 0)) { err('items', ln, t('{code}: thiếu kích thước dài × rộng × cao', { code })); continue }
    const kg = num(r[5]), pp = num(r[6]), ml = num(r[7])
    const old = mineItems.find(i => key(i.code) === key(code))
    if (old) out.updated++
    const it: Item = {
      id: old?.id ?? newId(), owner: 'me', code, name, l: l!, w: w!, h: h!,
      kg: kg != null && !Number.isNaN(kg) ? kg : null,
      perPallet: pp != null && pp > 0 ? Math.round(pp) : null,
      maxLayers: ml != null && ml > 0 ? Math.round(ml) : null,
      light: /^(x|1|có|co|yes|y|true)$/i.test(str(r[8])), updatedAt: 0, // i18n-ok — giá trị file (x / có / yes…)
    }
    out.items = [...out.items.filter(x => key(x.code) !== key(code)), it]
  }

  // ── Xe
  for (const [ln, r] of body(src.vehicles ?? [], 'vehicles', 3)) {
    const name = str(r[0]), plate = str(r[1]).toUpperCase(), l = num(r[3]), w = num(r[4]), h = num(r[5]), kg = num(r[6])
    if (!name && !plate) { err('vehicles', ln, t('thiếu tên xe')); continue }
    if (!(l! >= 500 && w! >= 500 && h! >= 500)) { err('vehicles', ln, t('{name}: lòng thùng phải nhập mm (dài, rộng, cao ≥ 500)', { name: name || plate })); continue }
    const old = mineVehicles.find(v => (plate && key(v.plate) === key(plate)) || (!plate && key(v.name) === key(name)))
    if (old) out.updated++
    out.vehicles.push({
      id: old?.id ?? newId(), owner: 'me', name: name || plate, plate, kind: /pallet/i.test(str(r[2])) ? 'pallet' : 'loose',
      l: l!, w: w!, h: h!, payloadKg: kg != null && kg > 0 ? kg : null, updatedAt: 0,
    })
  }

  // ── Đơn hàng (gom dòng theo tên đơn)
  const allItems = [...out.items, ...have.items]
  const findItem = (code: string) => allItems.find(i => key(i.code) === key(code)) ?? allItems.find(i => key(i.code) === key(`MAU-${code}`))
  const orderMap = new Map<string, Order>()
  for (const [ln, r] of body(src.orders ?? [], 'orders', 3)) {
    const name = str(r[0]), place = str(r[1]), code = str(r[2]), qty = num(r[3])
    if (!name || !code) { err('orders', ln, t('thiếu tên đơn hoặc mã hàng')); continue }
    const it = findItem(code)
    if (!it) { err('orders', ln, t('không thấy mã hàng "{code}"', { code })); continue }
    if (!(qty! > 0)) { err('orders', ln, t('{code}: số thùng phải lớn hơn 0', { code })); continue }
    let o = orderMap.get(key(name))
    if (!o) {
      const old = have.orders.find(x => key(x.name) === key(name))
      if (old) out.updated++
      o = { id: old?.id ?? newId(), name, place: place || old?.place || '', lines: [], updatedAt: 0 }
      orderMap.set(key(name), o)
    }
    if (place && !o.place) o.place = place
    const line = o.lines.find(l => l.itemId === it.id)
    if (line) line.qty += Math.round(qty!); else o.lines.push({ itemId: it.id, qty: Math.round(qty!) })
  }
  out.orders = [...orderMap.values()]

  // ── Chuyến (gom dòng theo tên chuyến, giữ thứ tự dòng = thứ tự giao)
  const allVehicles = [...out.vehicles, ...have.vehicles]
  const findVehicle = (s: string) => allVehicles.find(v => v.plate && key(v.plate) === key(s)) ?? allVehicles.find(v => key(v.name) === key(s))
  const allOrders = [...out.orders, ...have.orders]
  const tripMap = new Map<string, Trip>()
  for (const [ln, r] of body(src.trips ?? [], 'trips')) {
    const name = str(r[0]), vs = str(r[1]), on = str(r[2])
    if (!name || !on) { err('trips', ln, t('thiếu tên chuyến hoặc tên đơn')); continue }
    const o = allOrders.find(x => key(x.name) === key(on))
    if (!o) { err('trips', ln, t('không thấy đơn "{name}"', { name: on })); continue }
    let trip = tripMap.get(key(name))
    if (!trip) {
      const old = have.trips.find(x => key(x.name) === key(name))
      if (old) out.updated++
      // chuyến đã có: giữ mã chuyến + cài đặt (hàng nhẹ xe pallet…), file chỉ ghi đè xe và đơn
      trip = { ...old, id: old?.id ?? newId(), name, vehicleId: old?.vehicleId ?? null, orderIds: [], updatedAt: 0 }
      tripMap.set(key(name), trip)
    }
    if (vs) {
      const v = findVehicle(vs)
      if (v) trip.vehicleId = v.id; else err('trips', ln, t('không thấy xe "{name}" (chuyến vẫn nhập, chưa gán xe)', { name: vs }))
    }
    if (!trip.orderIds.includes(o.id)) trip.orderIds.push(o.id)
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

/** Đọc file .xlsx đã điền. Trang mang tên một loại (tiếng Việt hay tiếng Anh, không phân biệt hoa thường) ⇒ đọc thành
 *  loại đó — file mẫu, kể cả file 4 trang đời trước; không trang nào mang tên loại nào ⇒ trang ĐẦU là loại `k` đang chọn. */
export async function readWorkbook(file: File, k: SheetKey): Promise<Partial<Record<SheetKey, Rows>>> {
  const { default: readXlsxFile } = await import('read-excel-file/browser')
  const sheets = await readXlsxFile(file)
  // ô ngày (vd tên chuyến "28/10" Excel tự hiểu là ngày) → chữ ngày/tháng/năm cố định: là DỮ LIỆU, không theo ngôn ngữ giao diện
  const cells = (data: unknown[][]): Rows => data.map(r => r.map(c => (c instanceof Date ? c.toLocaleDateString('vi-VN') : (c as string | number | boolean | null))))
  const out: Partial<Record<SheetKey, Rows>> = {}
  for (const s of SHEETS) {
    const names = titles(s).map(key)
    const hit = sheets.find(x => names.includes(key(x.sheet)))
    if (hit) out[s.key] = cells(hit.data)
  }
  if (!Object.keys(out).length && sheets[0]) out[k] = cells(sheets[0].data)
  return out
}
