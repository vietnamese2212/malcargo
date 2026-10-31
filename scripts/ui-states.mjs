// Các màn / bảng thả / tấm cần soi — dùng chung cho ui-tap (nút chạm được) và ui-lang (sót chữ tiếng Việt khi giao
// diện tiếng Anh). Thêm màn / tấm mới ⇒ thêm vào đây.
import { T, TP, TX } from './ui-lib.mjs'

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const btn = (p, name, exact = true) => p.getByRole('button', typeof name === 'string' ? { name, exact } : { name })
export const starts = vi => new RegExp('^' + esc(TP(vi)))
const menu = label => async p => {
  await btn(p, T('Danh mục')).click(); await p.waitForTimeout(200)
  await p.locator('[data-popover]').getByRole('button', { name: T(label), exact: true }).click(); await p.waitForTimeout(500)
}
// [tên, mở, phạm vi soi, đóng, chỉ trên máy]
export const STATES = [
  ['Bàn xếp xe', null, null],
  ['Kết quả mở', p => btn(p, starts('Kết quả: {head}. Bấm để xem chi tiết')).click(), null, p => btn(p, starts('Kết quả: {head}. Bấm để xem chi tiết')).click()],
  ['Bảng đếm chân', p => btn(p, new RegExp(esc(T('Bảng đếm chân')))).click(), null, p => btn(p, new RegExp(esc(T('Bảng đếm chân')))).click()],
  ['Danh sách chuyến', p => btn(p, starts('Chuyến đang mở: {name}. Bấm để xem các chuyến')).click(), '[data-popover]'],
  ['Danh sách xe', p => btn(p, T('Đổi xe')).click(), '[data-popover]'],
  ['Góc nhìn', p => btn(p, starts('Góc nhìn: {view}')).click(), '[data-popover]'],
  ['Danh mục', p => btn(p, T('Danh mục')).click(), '[data-popover]'],
  ['Tuỳ chọn đơn', p => btn(p, starts('Tuỳ chọn {name}')).first().click(), '[data-popover]'],
  ['Đổi tên chuyến', async p => { await btn(p, starts('Chuyến đang mở: {name}. Bấm để xem các chuyến')).click(); await p.waitForTimeout(200); await btn(p, T('Đổi tên chuyến này')).click() }, '[data-popover]'],
  ['Sửa đơn (dải xe)', p => btn(p, T('Sửa đơn')).click(), '[role=dialog]'],
  ['Toàn màn hình', p => btn(p, T('Toàn màn hình')).click(), '[data-scene]', p => btn(p, T('Thoát toàn màn hình')).click()],
  ['Sửa đơn', p => btn(p, starts('Sửa đơn {name}')).first().click(), '[role=dialog]'],
  ['Sửa mã', p => btn(p, T('Sửa {name}', { name: TX('Sữa 180ml x48') })).first().click(), '[role=dialog]'],
  ['Thùng xe', async p => { await btn(p, T('Đổi xe')).click(); await p.waitForTimeout(400); await p.locator('[data-popover]').getByRole('button', { name: T('Chỉnh thông số thùng xe') }).click() }, '[role=dialog]'],
  ['Sửa xe', async p => { await btn(p, T('Đổi xe')).click(); await p.waitForTimeout(400); await p.locator('[data-popover]').getByRole('button', { name: T('Sửa {name}', { name: TX('Xe pallet 15 tấn') }) }).click() }, '[role=dialog]'],
  ['Cài đặt pallet', p => btn(p, T('Cài đặt pallet')).click(), '[role=dialog]'],
  ['Diễn giải', p => btn(p, T('Diễn giải')).click(), '[role=dialog]'],
  ['Thêm hàng (chọn mã)', p => btn(p, T('Thêm hàng')).first().click(), '[role=dialog]'],
  ['Thêm đơn', p => btn(p, T('Thêm đơn / điểm giao khác')).click(), '[role=dialog]'],
  ['Mã hàng', menu('Mã hàng'), '[role=dialog]'],
  ['Xe', menu('Xe'), '[role=dialog]'],
  ['Đơn hàng', menu('Đơn hàng'), '[role=dialog]'],
  ['Các chuyến', menu('Các chuyến'), '[role=dialog]'],
  ['Tài khoản', menu('Tài khoản & dữ liệu'), '[role=dialog]'],
  ['Hướng dẫn nhanh', menu('Hướng dẫn nhanh'), '[data-tour-card]'],
  ['Nhập từ Excel', menu('Nhập từ Excel'), '[role=dialog]', null, 'pc'],
]
// mẫu 40ft (xe thùng rời) chỉ soi những màn khác hẳn mẫu pallet
export const T2_STATES = ['Bàn xếp xe', 'Kết quả mở', 'Diễn giải', 'Danh sách xe']
