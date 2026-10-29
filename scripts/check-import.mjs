// Kiểm đọc file nhập Excel ngoài trình duyệt: tiêu đề cột đúng mẫu, số trong khoảng hợp lý (kích thước + kg cho số lẻ,
// số thùng / thùng-pallet / lớp phải nguyên), trùng trong file, mỗi lỗi báo đúng dòng. Chạy: npm test
import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'malcargo-'))
const out = join(dir, 'importer.mjs')
buildSync({ stdin: { contents: "export * from './src/data/importer'; export { useLang, tx } from './src/i18n'; export { parseNum } from './src/ui/kit'", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' })
const I = await import(pathToFileURL(out).href)
rmSync(dir, { recursive: true, force: true })
I.useLang.getState().setLang('vi')

let fail = 0
const ok = (cond, msg) => { console.log(cond ? '  ✓' : '  ✗', msg); if (!cond) fail++ }
const none = { items: [], vehicles: [], orders: [], trips: [] }
const head = k => I.SHEETS.find(s => s.key === k).cols.map(c => c.label + (c.req ? ' *' : ''))
const parse = (src, have = none) => I.parseImport(src, have)
// lỗi đúng dòng: "Mã hàng, dòng 3: …"
const has = (r, line, re) => r.errors.some(e => e.includes(`dòng ${line}:`) && re.test(e))

console.log('• Tiêu đề cột')
for (const k of ['items', 'vehicles', 'orders', 'trips']) ok(I.headError(k, head(k)) === null, `${k}: tiêu đề file mẫu tiếng Việt đúng mẫu`)
ok(I.headError('orders', ['Order name *', 'Delivery point', 'Code *', 'Cartons *']) === null, 'tiêu đề tiếng Anh, có dấu * ⇒ đúng mẫu')
ok(I.headError('items', ['mã hàng', 'TÊN HÀNG', 'Dài (mm)', 'Rộng (mm)', 'Cao (mm)', 'Kg/thùng', 'Thùng/pallet', 'Chồng tối đa (lớp)', 'Hàng nhẹ (x)', 'Chồng xá (lớp)', 'Ghi chú']) === null, 'hoa / thường, không dấu *, thừa cột ở cuối ⇒ vẫn đúng mẫu')
// cột "Chồng xá" thêm 29/10 ở cuối: file mẫu Mã hàng cũ (9 cột) vẫn nhận, chồng xá trống = như pallet
ok(I.headError('items', ['Mã hàng *', 'Tên hàng *', 'Dài (mm) *', 'Rộng (mm) *', 'Cao (mm) *', 'Kg/thùng *', 'Thùng/pallet *', 'Chồng tối đa (lớp) *', 'Hàng nhẹ (x)']) === null, 'file mẫu Mã hàng cũ thiếu cột Chồng xá ⇒ vẫn nhận')
ok(I.headError('trips', ['Tên chuyến', 'Xe (tên hoặc biển số)', 'Tên đơn']) === null, 'file mẫu Chuyến đời trước (cột C "Tên đơn") ⇒ vẫn nhận')
const swap = I.headError('items', ['Mã hàng', 'Tên hàng', 'Rộng (mm)', 'Dài (mm)', 'Cao (mm)', 'Kg/thùng', 'Thùng/pallet', 'Chồng tối đa (lớp)', 'Hàng nhẹ (x)'])
ok(/cột C/.test(swap ?? '') && /Dài \(mm\)/.test(swap ?? ''), `đảo cột ⇒ sai mẫu: ${swap}`)
const miss = I.headError('vehicles', ['Tên xe', 'Biển số', 'Cách chở (Thùng rời / Pallet)', 'Dài lòng thùng (mm)'])
ok(/thiếu cột E/.test(miss ?? ''), `thiếu cột ⇒ sai mẫu: ${miss}`)
let r = parse({ items: [['Mã hàng', 'Tên hàng', 'Rộng (mm)', 'Dài (mm)'], ['SP1', 'A', 400, 300, 200]] })
ok(!r.items.length && has(r, 1, /cột C/), 'bảng dán có tiêu đề sai mẫu ⇒ báo dòng 1, không nhận dòng nào')
r = parse({ items: [['SP1', 'A', 400, 300, 200, 5, 100, 10]] })
ok(r.items.length === 1 && !r.errors.length, 'bảng dán không có tiêu đề ⇒ đọc theo vị trí cột như cũ')

console.log('• Mã hàng')
const tpl = k => [head(k), ...I.SHEETS.find(s => s.key === k).sample]
r = parse({ items: tpl('items'), vehicles: tpl('vehicles'), orders: tpl('orders'), trips: tpl('trips') })
ok(!r.errors.length && r.items.length === 2 && r.vehicles.length === 2 && r.orders.length === 2 && r.trips.length === 1, `dòng ví dụ của 4 file mẫu ⇒ không lỗi (${r.errors.join(' | ')})`)
r = parse({ items: [head('items'), ['SP1', 'Hộp lẻ', '420,5', '255.5', 100, '9,85', 140, 14, ''], ['SP2', 'Thạch', 310, 130, 130, 3.08, 216, 8, 'x']] })
const sp1 = r.items.find(i => i.code === 'SP1')
ok(!r.errors.length && sp1?.l === 420.5 && sp1?.w === 255.5 && sp1?.kg === 9.85 && sp1?.perPallet === 140 && sp1?.light === false, 'kích thước + kg số lẻ (dấu phẩy hay chấm) ⇒ nhận; hàng nhẹ để trống ⇒ không nhẹ')
ok(r.items.find(i => i.code === 'SP2')?.light === true, 'Hàng nhẹ ghi x ⇒ hàng nhẹ')
{
  const ex = parse({ items: tpl('items') }).items, lx = parse({ items: [head('items'), ['SP4', 'Xá lẻ', 420, 255, 100, 6.2, 140, 14, '', '12,5']] })
  ok(ex.find(i => i.code === 'SP001')?.looseLayers === 28 && ex.find(i => i.code === 'SP002')?.looseLayers == null && sp1?.looseLayers == null && !lx.items.length && has(lx, 2, /Chồng xá/),
    'cột Chồng xá: dòng ví dụ 28 · trống ⇒ chưa khai (như pallet) · số lẻ ⇒ lỗi')
}
r = parse({ items: [head('items'), ['SP3', 'Thiếu', 420, 255, 100, '', '', '', '']] })
ok(!r.items.length && ['Kg/thùng', 'Thùng/pallet', 'Chồng tối đa \\(lớp\\)'].every(c => has(r, 2, new RegExp(`thiếu ${c}`))) && !r.errors.some(e => /Hàng nhẹ/.test(e)),
  'nhập file: thiếu kg / thùng-pallet / số lớp ⇒ lỗi; hàng nhẹ để trống thì không')
r = parse({ items: [head('items'),
  ['A1', 'Thùng to', 4200, 255, 100], ['A2', 'Ghi cm', 42, 25.5, 10], ['A3', 'Kg âm', 420, 255, 100, -1], ['A4', 'Thùng lẻ', 420, 255, 100, 6, 12.5],
  ['A5', 'Lớp chữ', 420, 255, 100, 6, 100, 'abc'], ['A6', 'Nhẹ lạ', 420, 255, 100, 6, 100, 10, 'có lẽ'], ['A7', 'Thiếu cao', 420, 255, ''], ['A1', 'Trùng', 420, 255, 100]]
})
ok(!r.items.length, `mọi dòng sai ⇒ không nhận dòng nào (${r.errors.length} lỗi)`)
ok(has(r, 2, /Dài \(mm\) phải từ 10 đến 3\.000/), 'cạnh 4.200 mm ⇒ ngoài khoảng 10–3.000')
ok(has(r, 3, /ghi cm/), 'cả 3 cạnh dưới 100 mm ⇒ hỏi có phải ghi cm')
ok(has(r, 4, /Kg\/thùng phải từ 0,01/), 'kg âm ⇒ lỗi')
ok(has(r, 5, /Thùng\/pallet phải là số nguyên/), 'thùng/pallet 12,5 ⇒ phải là số nguyên')
ok(has(r, 6, /Chồng tối đa \(lớp\) phải là số/), 'số lớp là chữ ⇒ phải là số')
ok(has(r, 7, /Hàng nhẹ \(x\): ghi x/), 'cột hàng nhẹ ghi lạ ⇒ lỗi')
ok(has(r, 8, /thiếu Cao \(mm\)/), 'thiếu cao ⇒ lỗi')
ok(has(r, 9, /mã "A1" trùng dòng 2/), 'mã ghi hai lần trong file ⇒ lỗi ở dòng sau, chỉ dòng trước')

console.log('• Xe')
r = parse({ vehicles: [head('vehicles'),
  ['Xe 1', '29C1', 'Thùng rời', 5700, 2000, 2000, 5000], ['Xe 2', '29C2', 'Ba gác', 5700, 2000, 2000], ['Xe 3', '29C3', '', 5.7, 2000, 2000],
  ['Xe 4', '29C4', 'Pallet', 7400, 2350, 2300, 999999], ['Xe 1b', '29c1', '', 5700, 2000, 2000]]
})
ok(r.vehicles.length === 1 && r.vehicles[0].kind === 'loose', 'xe đúng ⇒ nhận (thùng rời)')
ok(has(r, 3, /cách chở phải là/), 'cách chở ghi lạ ⇒ lỗi')
ok(has(r, 4, /Dài lòng thùng \(mm\) phải từ 500 đến 20\.000/), 'lòng thùng ghi mét (5,7) ⇒ ngoài khoảng')
ok(has(r, 5, /Tải trọng \(kg\) phải từ 100 đến 60\.000/), 'tải trọng quá lớn ⇒ lỗi')
ok(has(r, 6, /xe "29C1" trùng dòng 2/), 'biển số ghi hai lần (khác hoa thường) ⇒ lỗi')

console.log('• Đơn hàng')
const items = [{ id: 'i1', owner: 'me', code: 'SP1', name: 'A', l: 400, w: 300, h: 200, kg: 5, perPallet: null, maxLayers: null, light: false, updatedAt: 0 },
  { id: 'i2', owner: 'me', code: 'SP2', name: 'B', l: 400, w: 300, h: 200, kg: 5, perPallet: null, maxLayers: null, light: false, updatedAt: 0 }]
r = parse({ orders: [head('orders'), ['Đ1', 'Kho A', 'SP1', 10], ['Đ1', '', 'SP2', 5], ['Đ1', 'Kho A', 'SP1', 3]] }, { ...none, items })
ok(!r.errors.length && r.orders.length === 1 && r.orders[0].lines.map(l => `${l.itemId}:${l.qty}`).join() === 'i1:13,i2:5', 'đơn nhiều mã; cùng mã ghi hai dòng ⇒ cộng dồn (không lỗi)')
r = parse({ orders: [head('orders'), ['Đ1', '', 'SP1', 12.5], ['Đ2', '', 'SP1', 0], ['Đ3', '', 'SP9', 4], ['Đ4', 'Kho A', 'SP1', 4], ['Đ4', 'Kho B', 'SP2', 4]] }, { ...none, items })
ok(has(r, 2, /Số thùng phải là số nguyên/), 'số thùng 12,5 ⇒ phải là số nguyên')
ok(has(r, 3, /Số thùng phải từ 1/), 'số thùng 0 ⇒ lỗi')
ok(has(r, 4, /không thấy mã hàng "SP9"/), 'mã chưa có ⇒ lỗi')
ok(has(r, 6, /điểm giao khác dòng 5/), 'một đơn hai điểm giao ⇒ lỗi')

console.log('• Chuyến')
const orders = [{ id: 'o1', name: 'Đ1', place: '', lines: [], updatedAt: 0 }, { id: 'o2', name: 'Đ2', place: '', lines: [], updatedAt: 0 }]
const vehicles = [{ id: 'v1', owner: 'me', name: 'Xe 1', plate: '29C1', kind: 'loose', l: 5700, w: 2000, h: 2000, payloadKg: null, updatedAt: 0 },
  { id: 'v2', owner: 'me', name: 'Xe 2', plate: '29C2', kind: 'loose', l: 5700, w: 2000, h: 2000, payloadKg: null, updatedAt: 0 }]
r = parse({ trips: [['Tên chuyến', 'Xe (tên hoặc biển số)', 'Tên đơn'], ['C1', '29C1', 'Đ2'], ['C1', '', 'Đ1']] }, { ...none, orders, vehicles })
ok(!r.errors.length && r.trips[0]?.vehicleId === 'v1' && r.trips[0].orderIds.join() === 'o2,o1', 'thứ tự dòng = thứ tự giao; dòng sau để trống xe ⇒ không lỗi')
r = parse({ trips: [head('trips'), ['C1', 'Xe 9', 'Đ1'], ['C2', '29C1', 'Đ1'], ['C2', '29C2', 'Đ2'], ['C3', '', 'Đ1'], ['C3', '', 'Đ1']] }, { ...none, orders, vehicles })
ok(has(r, 2, /không thấy xe "Xe 9"/), 'xe không có ⇒ lỗi (trước đây vẫn nhập, chưa gán xe)')
ok(has(r, 4, /xe khác dòng 3/), 'một chuyến hai xe ⇒ lỗi')
ok(has(r, 6, /đơn "Đ1" đã ghi ở dòng 5/), 'một đơn ghi hai lần trong chuyến ⇒ lỗi')

console.log('• Dòng xe ở file Đơn hàng (trống / sai ⇒ bỏ qua, không chặn)')
const fleet = [...vehicles, { id: 'adm-v-5t', owner: 'admin', name: 'Xe tải 5 tấn', plate: '', kind: 'loose', l: 5700, w: 2000, h: 2000, payloadKg: 5000, updatedAt: 0 }]
r = parse({ orders: [head('orders'), ['Đ1', '', 'SP1', 10, 'Xe tải 5 tấn'], ['Đ1', '', 'SP2', 5, '29C2'], ['Đ2', '', 'SP1', 4, '29c2'], ['Đ3', '', 'SP1', 4, 'Xe ma'], ['Đ4', '', 'SP1', 4, '']] }, { ...none, items, vehicles: fleet })
const oid = n => r.orders.find(o => o.name === n)?.id
ok(!r.errors.length && r.orders.length === 4, `ghi xe sai / để trống ⇒ không lỗi (${r.errors.join(' | ')})`)
ok(r.orderTruck[oid('Đ1')] === 'adm-v-5t', 'một đơn ghi hai xe ⇒ lấy dòng đầu (theo tên xe)')
ok(r.orderTruck[oid('Đ2')] === 'v2', 'ghi biển số (khác hoa thường) ⇒ đúng xe')
ok(!r.orderTruck[oid('Đ3')] && !r.orderTruck[oid('Đ4')] && r.unknownTrucks.join() === 'Xe ma', 'xe không có trong app ⇒ bỏ qua, chỉ liệt kê để báo')
I.useLang.getState().setLang('en')
const enName = I.tx('Xe tải 5 tấn')
r = parse({ orders: [['Order name *', 'Delivery point', 'Code *', 'Cartons *', 'Vehicle type'], ['Đ1', '', 'SP1', 10, enName]] }, { ...none, items, vehicles: fleet })
I.useLang.getState().setLang('vi')
ok(enName !== 'Xe tải 5 tấn' && r.orderTruck[r.orders[0]?.id] === 'adm-v-5t', `file mẫu tiếng Anh ghi tên xe mẫu đã dịch ("${enName}") ⇒ đúng xe`)
r = parse({ orders: [head('orders'), ['Đ1', '', 'SP1', 10, enName]] }, { ...none, items, vehicles: fleet })
ok(r.orderTruck[r.orders[0]?.id] === 'adm-v-5t', 'app đang tiếng Việt, file ghi tên xe mẫu tiếng Anh ⇒ vẫn đúng xe')
ok(I.headError('orders', ['Tên đơn', 'Điểm giao', 'Mã hàng', 'Số thùng']) === null, 'file mẫu Đơn hàng đời trước (chưa có cột Dòng xe) ⇒ vẫn nhận')
ok(/cột E/.test(I.headError('orders', ['Tên đơn', 'Điểm giao', 'Mã hàng', 'Số thùng', 'Ghi chú']) ?? ''), 'cột E ghi tiêu đề khác ⇒ sai mẫu')
r = parse({
  orders: [head('orders'), ['Đ7', '', 'SP1', 1], ['Đ8', '', 'SP1', 1, '29C2'], ['Đ9', '', 'SP1', 1, 'Xe tải 5 tấn']],
  trips: [head('trips'), ['C7', '', 'Đ7'], ['C7', '', 'Đ8'], ['C7', '', 'Đ9'], ['C8', '29C1', 'Đ9']],
}, { ...none, items, vehicles: fleet })
ok(!r.errors.length && r.trips.find(x => x.name === 'C7')?.vehicleId === 'v2', 'chuyến không ghi xe ⇒ lấy dòng xe của đơn ĐẦU có ghi (Đ8)')
ok(r.trips.find(x => x.name === 'C8')?.vehicleId === 'v1', 'chuyến có ghi xe ⇒ giữ xe của chuyến')

console.log('• Mã hàng ghi "Mã - Tên" như danh sách chọn của file mẫu')
const named = [...items, { ...items[0], id: 'i3', code: 'MAU-ST180', name: 'Sữa 180ml x48', owner: 'admin' }, { ...items[0], id: 'i4', code: 'A - 1', name: 'Gạch' }]
r = parse({ orders: [head('orders'), ['Đ1', '', 'SP1 - A', 1], ['Đ2', '', 'MAU-ST180 - Milk 180ml x48', 1], ['Đ3', '', 'SP2 - Tên đã đổi', 1], ['Đ4', '', 'SP2', 1], ['Đ5', '', 'A - 1 - Gạch', 1], ['Đ6', '', 'SP9 - Không có', 1]] }, { ...none, items: named })
const it = n => r.orders.find(o => o.name === n)?.lines[0]?.itemId
ok(it('Đ1') === 'i1' && it('Đ2') === 'i3', '"Mã - Tên" (tên mẫu tiếng Việt hay tiếng Anh) ⇒ đúng mã')
ok(it('Đ3') === 'i2', 'tên hàng đã đổi sau khi tải file ⇒ vẫn nhận theo phần mã')
ok(it('Đ4') === 'i2', 'ghi mã không ⇒ vẫn nhận')
ok(it('Đ5') === 'i4', 'mã có chứa " - " ⇒ vẫn đúng mã')
ok(has(r, 7, /không thấy mã hàng "SP9 - Không có"/), 'mã không có ⇒ lỗi, báo nguyên giá trị đã ghi')

// ô số trong form (thử 29/10: gõ "8.000" kg ở form Xe lưu thành 8 kg)
console.log('• Ô số trong form: dấu ngăn hàng nghìn theo ngôn ngữ')
const P = I.parseNum
ok(P('8.000') === 8000 && P('5.700') === 5700 && P('1.234.567') === 1234567, 'tiếng Việt: "8.000" = 8000, "5.700" = 5700')
ok(P('9,85') === 9.85 && P('9.85') === 9.85 && P('12,5') === 12.5 && P('1.234,5') === 1234.5, 'tiếng Việt: "9,85" / "9.85" / "1.234,5" là số lẻ')
ok(P('1,250') === 1.25, 'tiếng Việt: "1,250" = 1,25 (phẩy là dấu thập phân)')
I.useLang.getState().setLang('en')
ok(P('8,000') === 8000 && P('8.000') === 8 && P('1,234.5') === 1234.5 && P('9.85') === 9.85 && P('9,85') === 9.85, 'tiếng Anh: "8,000" = 8000, "8.000" = 8, "9,85" vẫn là 9.85')
I.useLang.getState().setLang('vi')
ok(Number.isNaN(P('abc')) && Number.isNaN(P('')) && P('-5') === -5, 'chữ / trống ⇒ không phải số; "-5" vẫn đọc ra (ô tự báo đỏ vì < 0)')

console.log(fail ? `\nĐỎ — ${fail} lỗi` : '\nXANH')
process.exit(fail ? 1 : 0)
