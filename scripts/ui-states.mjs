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
// Chuyến người khác chia sẻ (máy chủ giả lập: chặn lời gọi share_get, trả bản chụp này) — tên chữ không dấu để soát bản
// tiếng Anh; 2 mã mẫu chung (bên nhận đã có) + 1 mã riêng của người gửi
export const SHARE_PACK = {
  app: 'malcargo', kind: 'trip', version: 1,
  trip: { id: 't-share', name: 'Test share', vehicleId: 'adm-v-p15t', orderIds: ['o-a', 'o-b'], updatedAt: 0 },
  orders: [
    { id: 'o-a', name: 'Order A', place: 'District 7', lines: [{ itemId: 'adm-i-st180', qty: 220 }, { itemId: 'i-test', qty: 40 }], updatedAt: 0 },
    { id: 'o-b', name: 'Order B', place: '', lines: [{ itemId: 'adm-i-tui110', qty: 60 }], updatedAt: 0 },
  ],
  items: [
    { id: 'adm-i-st180', owner: 'admin', code: 'MAU-ST180', name: 'Sữa 180ml x48', l: 420, w: 255, h: 130, kg: 9.85, perPallet: 110, maxLayers: 11, light: false, updatedAt: 0 },
    { id: 'adm-i-tui110', owner: 'admin', code: 'MAU-TUI110', name: 'Thạch túi 110ml x24', l: 310, w: 130, h: 130, kg: 3.08, perPallet: 216, maxLayers: 8, light: true, updatedAt: 0 },
    { id: 'i-test', owner: 'me', code: 'TEST-1', name: 'Test item', l: 400, w: 300, h: 250, kg: 8, perPallet: 60, maxLayers: 6, light: false, updatedAt: 0 },
  ],
  vehicles: [{ id: 'adm-v-p15t', owner: 'admin', name: 'Xe pallet 15 tấn', plate: '', kind: 'pallet', l: 9500, w: 2500, h: 2600, payloadKg: 15000, updatedAt: 0 }],
  pallet: { l: 1200, w: 1000, maxH: 1650, baseH: 150, kg: 25 },
}
/** Mở app bằng link chia sẻ …/s/<mã>; `pack` = null ⇒ máy chủ trả "không có" (link sai / đã xoá). */
export async function openShare(p, pack = SHARE_PACK, code = 'TESTSHARE1') {
  await p.unroute('**/rest/v1/rpc/share_get').catch(() => {})
  await p.route('**/rest/v1/rpc/share_get', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pack) }))
  await p.goto(new URL(`/s/${code}`, p.url()).href, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
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
  ['Family (chưa đăng nhập)', menu('Family'), '[role=dialog]'],
  ['Hướng dẫn nhanh', menu('Hướng dẫn nhanh'), '[data-tour-card]'],
  ['Nhập từ Excel', menu('Nhập từ Excel'), '[role=dialog]', null, 'pc'],
  ['Chia sẻ chuyến (chưa đăng nhập)', async p => { await btn(p, starts('Chuyến đang mở: {name}. Bấm để xem các chuyến')).click(); await p.waitForTimeout(200); await btn(p, T('Chia sẻ chuyến này')).click() }, '[role=dialog]'],
  ['Mở link chia sẻ', openShare, '[role=dialog]'],
]
// mẫu 40ft (xe thùng rời) chỉ soi những màn khác hẳn mẫu pallet
export const T2_STATES = ['Bàn xếp xe', 'Kết quả mở', 'Diễn giải', 'Danh sách xe']
