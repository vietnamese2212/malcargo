// Bảng dịch tiếng Anh = gộp các file theo khu vực (khoá = chuỗi gốc tiếng Việt, đúng từng ký tự).
// Giá trị có thể chia số ít / số nhiều: '{n} {n:carton|cartons}'.
import { COMMON } from './en/common'
import { TRIP } from './en/trip'
import { PAGES } from './en/pages'
import { SHEETS } from './en/sheets'

export const EN: Record<string, string> = { ...COMMON, ...TRIP, ...PAGES, ...SHEETS }

// Tên dữ liệu MẪU (mã hàng, xe, chuyến / đơn mẫu) — dữ liệu người dùng tự khai giữ nguyên
export const EN_NAMES: Record<string, string> = {
  'Sữa 180ml x48': 'Milk 180ml x48',
  'Sữa 110ml x48': 'Milk 110ml x48',
  'Sữa chua 180ml x48': 'Drinking yogurt 180ml x48',
  'Sữa thạch 170ml x48': 'Jelly milk 170ml x48',
  'Sữa chua chai 100ml x48': 'Yogurt bottle 100ml x48',
  'Sữa chai 85ml x48': 'Milk bottle 85ml x48',
  'Thạch túi 110ml x24': 'Jelly pouch 110ml x24',
  'Xe tải 1,5 tấn': '1.5-ton truck',
  'Xe tải 2,5 tấn': '2.5-ton truck',
  'Xe tải 3,5 tấn': '3.5-ton truck',
  'Xe tải 5 tấn': '5-ton truck',
  'Xe tải 8 tấn': '8-ton truck',
  'Xe tải 15 tấn': '15-ton truck',
  'Xe pallet 8 tấn': '8-ton pallet truck',
  'Xe pallet 15 tấn': '15-ton pallet truck',
  'Chuyến mẫu': 'Sample trip',
  'Đơn mẫu 1': 'Sample order 1',
  'Đơn mẫu 2': 'Sample order 2',
  'Cửa hàng A': 'Store A',
  'Cửa hàng B': 'Store B',
  'hàng nhẹ': 'light goods',
  'thùng': 'cartons',
  'pallet': 'pallets',
}

// Số kiểu Việt Nam trong chữ máy sinh (4,31 tấn · 1.580 kg) → kiểu Anh (4.31 t · 1,580 kg)
const num = (s: string) => s
  .replace(/\d[\d.,]*/g, n => n.replace(/[.,]/g, c => (c === '.' ? ',' : '.')))
  .replace(/ tấn\b/g, ' t')
const list = (s: string, tx: (s: string) => string) => s.split(', ').map(tx).join(', ')

type Rule = [RegExp, (m: RegExpMatchArray, tx: (s: string) => string) => string]
// Chữ do thuật toán / dữ liệu ghép ra (nhãn pallet, cảnh báo) — `tx()` thử lần lượt
export const EN_RULES: Rule[] = [
  [/^(.+) \(của tôi\)$/, (m, tx) => `${tx(m[1])} (mine)`],
  // tên đơn tự đặt khi tạo ("Đơn 3" — lưu vào dữ liệu tiếng Việt)
  [/^Đơn (\d+)$/, m => `Order ${m[1]}`],
  [/^(.+) \(pallet lẻ\)$/, (m, tx) => `${tx(m[1])} (part pallet)`],
  [/^(.+) \(chưa khai quy cách\)$/, (m, tx) => `${tx(m[1])} (no pallet spec)`],
  [/^(.+) \(cao ([\d.,]+) ?m\)$/, (m, tx) => `${tx(m[1])} (${m[2].replace(',', '.')} m tall)`],
  [/^Pallet gộp \(hàng lẻ\)(?: #(\d+))?$/, m => `Mixed pallet (remainders)${m[1] ? ` #${m[1]}` : ''}`],
  [/^Pallet gộp (.+?)(?: #(\d+))?$/, (m, tx) => `Mixed pallet (${tx(m[1])})${m[2] ? ` #${m[2]}` : ''}`],
  [/^Chưa khai số thùng\/pallet: (.+) — đang ước theo cỡ thùng\.$/,
    (m, tx) => `Cartons per pallet not set: ${list(m[1], tx)} — estimated from the carton size.`],
  [/^Chưa khai số thùng\/pallet: (.+) — đang tạm tính mỗi mã 1 pallet\.$/,
    (m, tx) => `Cartons per pallet not set: ${list(m[1], tx)} — counting 1 pallet per item for now.`],
  [/^Pallet cao hơn lòng thùng xe: (.+)\.$/, (m, tx) => `Pallets taller than the cargo box: ${list(m[1], tx)}.`],
  [/^Thùng to hơn lòng thùng xe: (.+)\.$/, (m, tx) => `Cartons bigger than the cargo box: ${list(m[1], tx)}.`],
  [/^Pallet lẻ cao hơn mức cài đặt ([\d,]+) m: (.+)\.$/, (m, tx) => `Part pallets taller than the ${m[1].replace(',', '.')} m setting: ${list(m[2], tx)}.`],
  [/^Không đặt được lên trên hàng khác: (.+) — đã xếp như hàng thường\.$/,
    (m, tx) => `Could not go on top of other goods: ${list(m[1], tx)} — loaded as regular goods.`],
  [/^Vượt tải trọng: (.+) \/ (.+)\.$/, m => `Over payload: ${num(m[1])} / ${num(m[2])}.`],
  [/^Pallet (\d+)×(\d+)mm KHÔNG vừa mặt sàn xe (\d+)×(\d+)mm \(đã thử cả xoay ngang\) — kiểm lại kích thước pallet hoặc chọn xe khác\.$/,
    m => `A ${m[1]}×${m[2]} mm pallet does NOT fit the ${m[3]}×${m[4]} mm truck floor (tried turned too) — check the pallet size or pick another truck.`],
  [/^Pallet hàng lẻ cao (\d+)mm vượt chiều cao lòng xe (\d+)mm — hạ chiều cao xếp hàng trên pallet hoặc chọn xe khác\.$/,
    m => `Mixed pallets up to ${m[1]} mm are taller than the cargo box (${m[2]} mm) — lower the pallet height or pick another truck.`],
]
