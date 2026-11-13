// Các màn / bảng thả / tấm cần soi — dùng chung cho ui-tap (nút chạm được), ui-scroll (màn thấp: che chữ, vuốt trượt)
// và ui-lang (sót chữ tiếng Việt khi giao diện tiếng Anh). Thêm màn / tấm mới ⇒ thêm vào đây.
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
    { id: 'o-a', name: 'Order A', place: 'District 7', lines: [{ itemId: '17047429-4e68-4236-8d2e-1b91b8eac4be', qty: 220 }, { itemId: 'i-test', qty: 40 }], updatedAt: 0 },
    { id: 'o-b', name: 'Order B', place: '', lines: [{ itemId: '89e64f1f-548f-487d-aec8-74ce5c0d1580', qty: 60 }], updatedAt: 0 },
  ],
  items: [
    { id: '17047429-4e68-4236-8d2e-1b91b8eac4be', owner: 'admin', code: 'SP002', name: 'TBA 180', l: 425, w: 260, h: 145, kg: 10, perPallet: 110, maxLayers: 11, looseLayers: 15, light: false, updatedAt: 0 },
    { id: '89e64f1f-548f-487d-aec8-74ce5c0d1580', owner: 'admin', code: 'SP008', name: 'ECOLEAN', l: 315, w: 140, h: 135, kg: 3.08, perPallet: 224, maxLayers: 8, looseLayers: 11, light: true, updatedAt: 0 },
    { id: 'i-test', owner: 'me', code: 'TEST-1', name: 'Test item', l: 400, w: 300, h: 250, kg: 8, perPallet: 60, maxLayers: 6, light: false, updatedAt: 0 },
  ],
  vehicles: [{ id: 'adm-v-p15t', owner: 'admin', name: 'Xe pallet 15 tấn', plate: '', kind: 'pallet', l: 9600, w: 2350, h: 2600, payloadKg: 15000, updatedAt: 0 }],
  pallet: { l: 1200, w: 1000, maxH: 1650, baseH: 150, kg: 25 },
}
/** Mở app bằng link chia sẻ …/s/<mã>; `pack` = null ⇒ máy chủ trả "không có" (link sai / đã xoá). */
export async function openShare(p, pack = SHARE_PACK, code = 'TESTSHARE1') {
  await p.unroute('**/rest/v1/rpc/share_get').catch(() => {})
  await p.route('**/rest/v1/rpc/share_get', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pack) }))
  await p.goto(new URL(`/s/${code}`, p.url()).href, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
}

// Link Family (…/f/<mã>, máy chủ giả lập chặn family_peek): Family MỞ ⇒ kèm đơn hàng — tên chữ không dấu để soát bản tiếng Anh
export const FAMILY_PEEK = { id: 'fam1', name: 'Test Co', open: true, people: 3, me: null, orders: [
  { id: 'o1', name: 'Order North', place: 'Ha Noi', by: 'Nguoi A', updatedAt: Date.now(), lines: [{ code: 'SP002', name: 'TBA 180', qty: 120, kg: 9.85 }, { code: 'SP008', name: 'ECOLEAN', qty: 40, kg: 3.08 }] },
  ...Array.from({ length: 7 }, (_, i) => ({ id: `o${i + 2}`, name: `Order ${i + 2}`, place: '', by: null, updatedAt: Date.now() - 864e5 * (i + 1), lines: [{ code: 'X1', name: 'Item X', qty: 10 + i, kg: null }] })),
] }
export async function openFamilyLink(p, peek = FAMILY_PEEK) {
  await p.unroute('**/rest/v1/rpc/family_peek').catch(() => {})
  await p.route('**/rest/v1/rpc/family_peek', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(peek) }))
  await p.goto(new URL('/f/TESTFAMLINK', p.url()).href, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
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
  ['Login', p => btn(p, T('Login')).click(), '[data-popover]'],
  ['Tuỳ chọn đơn', p => btn(p, starts('Tuỳ chọn {name}')).first().click(), '[data-popover]'],
  ['Đổi tên chuyến', async p => { await btn(p, starts('Chuyến đang mở: {name}. Bấm để xem các chuyến')).click(); await p.waitForTimeout(200); await btn(p, T('Đổi tên chuyến này')).click() }, '[data-popover]'],
  ['Sửa đơn (dải xe)', p => btn(p, T('Sửa đơn')).click(), '[role=dialog]'],
  ['Toàn màn hình', p => btn(p, T('Toàn màn hình')).click(), '[data-scene]', p => btn(p, T('Thoát toàn màn hình')).click()],
  ['Sửa đơn', p => btn(p, starts('Sửa đơn {name}')).first().click(), '[role=dialog]'],
  ['Sửa mã', p => btn(p, T('Sửa {name}', { name: TX('TBA 180') })).first().click(), '[role=dialog]'],
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
  ['Mở link Family (mở)', p => openFamilyLink(p), '[role=dialog]'],
  ['Mở link Family (đóng)', p => openFamilyLink(p, { ...FAMILY_PEEK, open: false, orders: null }), '[role=dialog]'],
]
// mẫu 40ft (xe thùng rời) chỉ soi những màn khác hẳn mẫu pallet
export const T2_STATES = ['Bàn xếp xe', 'Kết quả mở', 'Diễn giải', 'Danh sách xe']
