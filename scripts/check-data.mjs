// Kiểm kho dữ liệu ngoài trình duyệt: dọn chuyến / đơn nháp trống, dấu đã xoá, gộp dữ liệu hai máy.
// Chạy: npm test
import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'malcargo-'))
const out = join(dir, 'store.mjs')
buildSync({ stdin: { contents: "export * from './src/data/store'; export { SAMPLE_TRIPS, SAMPLE_ORDERS, PREV_SAMPLE_TRIPS, PREV_SAMPLE_ORDERS } from './src/data/catalog'", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' })
const S = await import(pathToFileURL(out).href)
rmSync(dir, { recursive: true, force: true })

let fail = 0
const ok = (cond, msg) => { console.log(cond ? '  ✓' : '  ✗', msg); if (!cond) fail++ }
const D = () => S.useData.getState()
const ids = l => l.map(x => x.id).sort().join(',')
const day = 864e5, now = Date.now()
const order = (id, name, lines = [], extra = {}) => ({ id, name, place: '', lines, updatedAt: now - day, ...extra })
const trip = (id, name, orderIds, extra = {}) => ({ id, code: '281026-0900-01', name, vehicleId: null, orderIds, updatedAt: now - day, ...extra })
const base = { app: 'malcargo', version: 1, items: [], vehicles: [], pallet: { l: 1200, w: 1000, maxH: 1650, baseH: 150, kg: 25 } }
const mine = l => l.filter(x => !S.isSample(x.id))

console.log('• Dọn nháp trống')
D().replaceAll({ ...base,
  orders: [order('o-blank', 'Đơn 3'), order('o-named', 'Khách Hưng'), order('o-place', 'Đơn 4', [], { place: 'Q7' }),
    order('o-full', 'Đơn 5', [{ itemId: 'x', qty: 0 }]), order('o-in-open', 'Đơn 6')],
  trips: [trip('t-blank', '281026-0900-01', []), trip('t-old', 'Chuyến 2', []), trip('t-renamed', 'Xe đi Bình Dương', []),
    trip('t-only-blank', '281026-0900-01', ['o-blank']), trip('t-full', '281026-0900-01', ['o-full']),
    trip('t-open', '281026-0900-01', ['o-in-open'])],
  deleted: {},
})
D().sweepBlank(['t-open'])
ok(ids(mine(D().orders)) === 'o-full,o-in-open,o-named,o-place', `đơn còn lại: ${ids(mine(D().orders))} (bỏ đơn trống tên mặc định; giữ đơn có tên riêng / điểm giao / mã hàng / nằm trong chuyến đang mở)`)
ok(ids(mine(D().trips)) === 't-full,t-open,t-renamed', `chuyến còn lại: ${ids(mine(D().trips))} (bỏ chuyến trống / chỉ có đơn trống; giữ chuyến đặt tên riêng, chuyến đang mở)`)
ok(['o-blank', 't-blank', 't-old', 't-only-blank'].every(id => D().deleted[id]), 'mọi thứ đã dọn đều có dấu đã xoá')
ok(D().trips.some(t => t.id === 'sample-t1') && D().orders.some(o => o.id === 'sample-o1'), 'chuyến mẫu + đơn mẫu không bị dọn')
const before = D()
D().sweepBlank(['t-open'])
ok(D() === before, 'không còn gì để dọn ⇒ kho không đổi (không đẩy lên tài khoản vô cớ)')

console.log('• Xoá ⇒ dấu đã xoá')
D().removeOrder('o-named'); D().removeTrip('t-renamed')
ok(D().deleted['o-named'] >= now && D().deleted['t-renamed'] >= now, 'xoá đơn / chuyến ⇒ ghi lúc xoá')
D().removeTrip('sample-t1'); D().removeOrder('sample-o1')
ok(!D().deleted['sample-t1'] && !D().deleted['sample-o1'] && D().trips.some(t => t.id === 'sample-t1'), 'chuyến mẫu không xoá được, không mang dấu')

console.log('• Gộp hai máy')
const A = { ...base, deleted: { 'o-x': now - 1000, 't-x': now - 1000, 'o-y': now - 5 * day, 'old': now - 100 * day },
  orders: [order('o-z', 'Đơn Z')], trips: [trip('t-z', 'Z', ['o-z'])] }
const B = { ...base, deleted: {},
  orders: [order('o-x', 'Đơn X', [], { updatedAt: now - day }), order('o-y', 'Đơn Y', [], { updatedAt: now - day }), order('o-z', 'Đơn Z')],
  trips: [trip('t-x', 'X', ['o-x']), trip('t-k', 'K', ['o-x', 'o-y'])] }
const M = S.mergeBackup(A, B)
ok(!M.orders.some(o => o.id === 'o-x') && !M.trips.some(t => t.id === 't-x'), 'máy A xoá sau lần sửa cuối ở máy B ⇒ không sống lại')
ok(M.orders.some(o => o.id === 'o-y'), 'máy B sửa SAU khi máy A xoá ⇒ giữ bản sửa')
ok(M.trips.find(t => t.id === 't-k')?.orderIds.join() === 'o-y', 'chuyến máy B còn trỏ đơn đã xoá ⇒ gỡ đơn đó ra')
ok(!('old' in M.deleted) && 'o-x' in M.deleted, 'dấu đã xoá quá 90 ngày thì bỏ, còn hạn thì giữ')
ok(ids(S.mergeBackup(B, A).orders) === ids(M.orders), 'gộp theo chiều nào cũng như nhau')

console.log('• Thay cả bộ (nạp file / bản từ tài khoản)')
D().replaceAll({ ...base, orders: [order('o-1', 'Đơn 1', [{ itemId: 'x', qty: 1 }]), order('o-2', 'Đơn 2', [{ itemId: 'x', qty: 1 }])], trips: [], deleted: {} })
D().replaceAll({ ...base, orders: [order('o-2', 'Đơn 2', [{ itemId: 'x', qty: 1 }])], trips: [], deleted: { 'o-9': now } })
ok(D().deleted['o-1'] && D().deleted['o-9'], 'thứ biến mất ⇒ đánh dấu đã xoá; dấu của bộ mới được nhận')
D().removeOrder('o-2')
D().replaceAll({ ...base, orders: [order('o-2', 'Đơn 2', [{ itemId: 'x', qty: 1 }])], trips: [] })
ok(!D().deleted['o-2'] && D().orders.some(o => o.id === 'o-2'), 'nạp lại file có thứ đã xoá ⇒ sống lại, bỏ dấu (lần gộp sau không mất nữa)')
ok(!Object.keys(D().deleted).some(S.isSample), 'không bao giờ đánh dấu xoá chuyến / đơn mẫu')

console.log('• Hai chuyến mẫu (29/10: xe pallet 17 pallet · container 40ft)')
const samples = () => ids(D().trips.filter(t => S.isSample(t.id))) + ' / ' + ids(D().orders.filter(o => S.isSample(o.id)))
const want = ids(S.SAMPLE_TRIPS) + ' / ' + ids(S.SAMPLE_ORDERS)
// máy cũ còn chuyến mẫu đời trước NGUYÊN GỐC ⇒ chỉ thay mẫu, không đẻ chuyến
D().replaceAll({ ...base, orders: S.PREV_SAMPLE_ORDERS, trips: S.PREV_SAMPLE_TRIPS, deleted: {} })
ok(samples() === want && !mine(D().trips).length && !mine(D().orders).length, `mẫu đời trước nguyên gốc ⇒ thay bằng mẫu mới, không tách (${samples()})`)
// đời trước đã bị sửa (bản sao lưu cũ) ⇒ thay đổi giữ thành chuyến mới mang ĐỦ 2 đơn cũ, mẫu về bản mới
const edited = S.PREV_SAMPLE_ORDERS.map((o, i) => (i ? o : { ...o, lines: o.lines.map(l => ({ ...l, qty: l.qty + 1 })) }))
D().replaceAll({ ...base, orders: edited, trips: S.PREV_SAMPLE_TRIPS, deleted: {} })
const kept = mine(D().trips)
ok(samples() === want && kept.length === 1 && kept[0].orderIds.length === 2 && kept[0].name === kept[0].code && kept[0].vehicleId === 'adm-v-5t',
  `mẫu đời trước đã sửa ⇒ thành chuyến ${kept[0]?.name} (2 đơn, xe cũ), mẫu về bản mới`)
// sửa đơn của chuyến mẫu THỨ HAI ⇒ tách đúng chuyến đó (xe container), chuyến mẫu kia không đụng
D().replaceAll({ ...base, orders: [], trips: [], deleted: {} })
const o2 = S.SAMPLE_ORDERS.find(o => o.id === 'sample-o2')
D().upsertOrder({ ...o2, lines: o2.lines.map(l => ({ ...l, qty: l.qty + 5 })) })
const f = D().fork, ft = D().trips.find(t => t.id === f?.to)
ok(f?.from === 'sample-t2' && ft?.vehicleId === 'adm-v-c40' && ft.orderIds.length === 1 && D().orders.find(o => o.id === ft.orderIds[0])?.lines[0].qty === o2.lines[0].qty + 5 && samples() === want,
  'sửa đơn container mẫu ⇒ tách chuyến container (giữ xe, mang số mới), hai chuyến mẫu nguyên')

console.log(fail ? `\nĐỎ — ${fail} lỗi` : '\nXANH')
process.exit(fail ? 1 : 0)
