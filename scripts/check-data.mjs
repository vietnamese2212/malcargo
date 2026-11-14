// Kiểm kho dữ liệu ngoài trình duyệt: dọn chuyến / đơn nháp trống, dấu đã xoá, gộp dữ liệu hai máy.
// Chạy: npm test
import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'malcargo-'))
const out = join(dir, 'store.mjs')
buildSync({ stdin: { contents: "export * from './src/data/store'; export * from './src/data/share'; export { SAMPLE_TRIPS, SAMPLE_ORDERS, PREV_SAMPLES } from './src/data/catalog'", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' })
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

console.log('• Hai chuyến mẫu (06/11: xe pallet 17 pallet · container 40ft)')
const samples = () => ids(D().trips.filter(t => S.isSample(t.id))) + ' / ' + ids(D().orders.filter(o => S.isSample(o.id)))
const want = ids(S.SAMPLE_TRIPS) + ' / ' + ids(S.SAMPLE_ORDERS)
// máy cũ còn chuyến mẫu MỌI đời trước NGUYÊN GỐC ⇒ chỉ thay mẫu, không đẻ chuyến
S.PREV_SAMPLES.forEach((v, i) => {
  D().replaceAll({ ...base, orders: v.orders, trips: v.trips, deleted: {} })
  ok(samples() === want && !mine(D().trips).length && !mine(D().orders).length, `mẫu đời trước #${i + 1} nguyên gốc ⇒ thay bằng mẫu mới, không tách (${samples()})`)
})
// đời trước đã bị sửa (bản sao lưu cũ) ⇒ thay đổi giữ thành chuyến mới mang ĐỦ 2 đơn cũ (tên "Đơn 1", "Đơn 2"), mẫu về bản mới
const old = S.PREV_SAMPLES[0]
const edited = old.orders.map((o, i) => (i ? o : { ...o, lines: o.lines.map(l => ({ ...l, qty: l.qty + 1 })) }))
D().replaceAll({ ...base, orders: edited, trips: old.trips, deleted: {} })
const kept = mine(D().trips), keptNames = kept[0]?.orderIds.map(id => D().orders.find(o => o.id === id)?.name).sort().join()
ok(samples() === want && kept.length === 1 && keptNames === 'Đơn 1,Đơn 2' && kept[0].name === kept[0].code && kept[0].vehicleId === 'adm-v-5t',
  `mẫu đời trước đã sửa ⇒ thành chuyến ${kept[0]?.name} (${keptNames}, xe cũ), mẫu về bản mới`)

// Bản từ tài khoản (jsonb) đảo thứ tự trường trong dòng hàng {"qty","itemId"} — trước 30/10 so chuỗi JSON ⇒ tưởng mẫu
// bị sửa, mở app nào cũng tự tách 2 chuyến rác (tài khoản chủ dự án: 34 chuyến). Kèm: dọn bản sao rác y hệt mẫu
{
  const flip = o => ({ ...o, lines: o.lines.map(l => ({ qty: l.qty, itemId: l.itemId })) })
  D().replaceAll({ ...base, orders: S.SAMPLE_ORDERS.map(flip), trips: S.SAMPLE_TRIPS, deleted: {} })
  ok(!mine(D().trips).length && !mine(D().orders).length && samples() === want, `mẫu về từ máy chủ (trường đảo thứ tự) ⇒ KHÔNG tách chuyến (${mine(D().trips).length} chuyến của tôi)`)
  const st = S.SAMPLE_TRIPS[0], so = S.SAMPLE_ORDERS.find(o => o.id === st.orderIds[0])
  const clone = (id, oid, n, extra = {}) => [trip(id, '291026-2235-12', [oid], { code: '291026-2235-12', vehicleId: st.vehicleId, ...extra }), order(oid, `Đơn ${n}`, so.lines.map(l => ({ qty: l.qty, itemId: l.itemId })), { place: so.place })]
  const [t1, o1c] = clone('t-clone', 'o-clone', 13)
  const [t2, o2c] = clone('t-real', 'o-real', 19)
  o2c.lines = o2c.lines.map((l, i) => (i ? l : { ...l, qty: l.qty - 31 }))   // chuyến anh sửa thật (2.452 thùng)
  const [t3, o3c] = clone('t-light', 'o-light', 20, { lightOwnPallet: true })   // chỉ bật công tắc hàng nhẹ ⇒ vẫn là của anh
  D().replaceAll({ ...base, orders: [...S.SAMPLE_ORDERS.map(flip), o1c, o2c, o3c], trips: [...S.SAMPLE_TRIPS, t1, t2, t3], deleted: {} })
  ok(ids(mine(D().trips)) === 't-light,t-real' && !D().orders.some(o => o.id === 'o-clone') && D().deleted['t-clone'] && D().deleted['o-clone'],
    `bản sao y hệt mẫu ⇒ dọn + đánh dấu đã xoá; chuyến đã sửa / bật công tắc ⇒ giữ (${ids(mine(D().trips))})`)
}

// Chủ dự án 29/10: "chọn đơn mẫu, thay đổi gì ⇒ ra đơn mới (đơn 1), từ đó sửa mãi trên đơn 1; chỉ ra đơn 2 khi
// tạo chuyến mới hoặc chọn lại đơn mẫu làm tiếp"
D().replaceAll({ ...base, orders: [], trips: [], deleted: {} })
const o1 = S.SAMPLE_ORDERS.find(o => o.id === 'sample-o1')
D().upsertOrder({ ...o1, lines: o1.lines.map((l, i) => (i ? l : { ...l, qty: l.qty + 1 })) })
const f1 = D().fork
// phím gõ nhanh còn cầm đơn MẪU (tên mẫu) trước khi màn chuyển sang bản sao ⇒ ghi vào bản sao, không đè tên
D().upsertOrder({ ...o1, lines: o1.lines.map((l, i) => (i ? l : { ...l, qty: l.qty + 2 })) })
D().markForkSeen()
const copy1 = () => D().orders.find(o => o.id === f1.orders['sample-o1'])
ok(copy1()?.name === 'Đơn 1' && copy1().place === o1.place && copy1().lines[0].qty === o1.lines[0].qty + 2 && mine(D().trips).length === 1,
  `sửa đơn mẫu ⇒ 1 chuyến mới, đơn bản sao tên "${copy1()?.name}" (không mang tên mẫu), phím sau ghi vào nó`)
for (let k = 0; k < 3; k++) D().upsertOrder({ ...copy1(), lines: copy1().lines.map((l, i) => (i ? l : { ...l, qty: l.qty + 1 })) })
D().upsertTrip({ ...D().trips.find(t => t.id === f1.to), lightOwnPallet: true })
ok(mine(D().trips).length === 1 && mine(D().orders).length === 1 && copy1().lines[0].qty === o1.lines[0].qty + 5,
  'sửa tiếp đơn 1 / chuyến của nó nhiều lần ⇒ vẫn 1 chuyến, 1 đơn')
D().upsertOrder({ ...o1, lines: o1.lines.map((l, i) => (i ? l : { ...l, qty: 7 })) })
const names = mine(D().orders).map(o => o.name).sort().join()
ok(mine(D().trips).length === 2 && names === 'Đơn 1,Đơn 2', `chọn lại đơn mẫu, sửa ⇒ chuyến thứ 2, đơn "Đơn 2" (${names})`)
// tự đặt tên ngay lúc sửa đơn mẫu (popup Sửa đơn) ⇒ giữ tên đó
D().markForkSeen()
D().upsertOrder({ ...o1, name: 'Khách Hưng' })
ok(mine(D().orders).some(o => o.name === 'Khách Hưng'), 'đổi tên đơn mẫu ⇒ bản sao giữ tên người dùng đặt')
// sửa đơn của chuyến mẫu THỨ HAI ⇒ tách đúng chuyến đó (xe container), chuyến mẫu kia không đụng
D().replaceAll({ ...base, orders: [], trips: [], deleted: {} })
const o2 = S.SAMPLE_ORDERS.find(o => o.id === 'sample-o2')
D().upsertOrder({ ...o2, lines: o2.lines.map(l => ({ ...l, qty: l.qty + 5 })) })
const f = D().fork, ft = D().trips.find(t => t.id === f?.to)
ok(f?.from === 'sample-t2' && ft?.vehicleId === 'adm-v-c40' && ft.orderIds.length === 1 && D().orders.find(o => o.id === ft.orderIds[0])?.lines[0].qty === o2.lines[0].qty + 5 && samples() === want,
  'sửa đơn container mẫu ⇒ tách chuyến container (giữ xe, mang số mới), hai chuyến mẫu nguyên')

console.log('• Bộ dữ liệu: Của tôi / Family')
{
  const item = (id, code) => ({ id, owner: 'me', code, name: code, l: 400, w: 300, h: 200, kg: 5, perPallet: null, maxLayers: null, light: false, updatedAt: now })
  const backup = extra => ({ ...base, items: D().items, vehicles: D().vehicles, orders: D().orders, trips: D().trips, pallet: D().pallet, deleted: D().deleted, ...extra })
  D().replaceAll({ ...base, items: [item('i-me', 'ME')], orders: [order('o-me', 'Khách A')], trips: [], deleted: {} })
  await S.openSpace({ id: 'fam1', name: 'Cty', role: 'member' })
  ok(!D().items.length && !mine(D().orders).length && D().trips.some(t => t.id === 'sample-t1'), 'mở Family lần đầu trên máy ⇒ bộ trống + chuyến mẫu, không mang dữ liệu của tôi sang')
  D().upsertItem(item('i-x', 'X')); D().setPallet({ ...base.pallet, maxH: 1000 })
  D().importBatch({ items: [item('i-y', 'Y')], vehicles: [], orders: [order('o-imp', 'Khách nhập')], trips: [] })
  ok(!D().items.length && D().pallet.maxH === 1650 && D().orders.some(o => o.id === 'o-imp'), 'thành viên Family: không thêm mã hàng / đổi cỡ pallet (kể cả qua file nhập), đơn vẫn nhập được')
  D().upsertOrder(order('o-fam', 'Đơn 7'))   // nháp trống do máy này tạo
  D().replaceAll(backup({ orders: [...D().orders, order('o-other', 'Đơn 8')] }))   // nháp trống của người khác, về từ máy chủ
  D().sweepBlank([])
  ok(!D().orders.some(o => o.id === 'o-fam') && D().orders.some(o => o.id === 'o-other'), 'Family: chỉ dọn nháp trống do máy này tạo — nháp người khác vừa bấm "+" giữ nguyên')
  await S.openSpace({ id: 'me', name: null, role: null })
  ok(ids(D().items) === 'i-me' && D().orders.some(o => o.id === 'o-me') && !D().orders.some(o => o.id === 'o-imp'), 'về "Của tôi" ⇒ dữ liệu của tôi nguyên vẹn, không lẫn đơn Family')
  D().upsertItem(item('i-2', 'ME2'))
  await S.openSpace({ id: 'fam1', name: 'Cty', role: 'owner' })
  ok(D().orders.some(o => o.id === 'o-other') && !D().items.length, 'mở lại Family ⇒ bản Family lưu trên máy')
  ok(ids(S.myCatalog().items) === 'i-2,i-me', 'đang mở Family vẫn đọc được mã hàng của tôi (chép sang Family mới)')
  D().upsertItem(item('i-own', 'OWN'))
  ok(ids(D().items) === 'i-own', 'chủ Family sửa được danh mục')
  await S.openSpace({ id: 'me', name: null, role: null })
  S.dropSpace('fam1')   // như cloud.ts: rời bộ đó trước rồi mới bỏ bản lưu
  await S.openSpace({ id: 'fam1', name: 'Cty', role: 'member' })
  ok(!D().items.length && !D().orders.some(o => o.id === 'o-other'), 'bỏ bản lưu Family (đăng xuất / rời) ⇒ mở lại là bộ trống')
  await S.openSpace({ id: 'me', name: null, role: null })
}

console.log('• Family: vai trò, ai sửa / ai tạo')
{
  const item = (id, code) => ({ id, owner: 'me', code, name: code, l: 400, w: 300, h: 200, kg: 5, perPallet: null, maxLayers: null, light: false, updatedAt: now })
  S.setAuthor({ email: 'lan@example.com', name: 'Lan' })
  // Của tôi: không ghi ai sửa
  D().upsertOrder(order('o-mine', 'Khách riêng'))
  ok(!D().orders.find(o => o.id === 'o-mine').by && !D().orders.find(o => o.id === 'o-mine').madeBy, '"Của tôi": đơn không ghi người sửa / người tạo')
  // Family (thành viên): đơn / chuyến mới ghi người tạo + người sửa; người khác sửa ⇒ đổi người sửa, giữ người tạo
  await S.openSpace({ id: 'fam2', name: 'Cty', role: 'member' })
  D().upsertOrder(order('o-f', 'Khách F', [{ itemId: 'x', qty: 5 }]))
  D().upsertTrip(trip('t-f', 'Xe F', ['o-f']))
  let o = D().orders.find(x => x.id === 'o-f'), tr = D().trips.find(x => x.id === 't-f')
  ok(o.by === 'Lan' && o.madeBy === 'lan@example.com' && tr.by === 'Lan' && tr.madeBy === 'lan@example.com', 'Family: đơn / chuyến mới ghi người tạo + người sửa')
  S.setAuthor({ email: 'hung@example.com', name: 'Hưng' })
  D().upsertOrder({ ...o, lines: [{ itemId: 'x', qty: 9 }] })
  o = D().orders.find(x => x.id === 'o-f')
  ok(o.by === 'Hưng' && o.madeBy === 'lan@example.com', 'người khác sửa ⇒ đổi người sửa, giữ người tạo')
  // sửa chuyến mẫu trong Family ⇒ bản tách mang người tạo là người sửa
  D().upsertTrip({ ...D().trips.find(x => x.id === 'sample-t1'), name: 'Mẫu sửa' })
  const fk = D().trips.find(x => x.id === D().fork?.to)
  ok(!!fk && fk.madeBy === 'hung@example.com' && D().orders.filter(x => fk.orderIds.includes(x.id)).every(x => x.madeBy === 'hung@example.com'), 'tách chuyến mẫu trong Family ⇒ bản tách + đơn của nó ghi người tạo')
  D().markForkSeen()
  // Quản lý: sửa được danh mục
  await S.openSpace({ id: 'fam2', name: 'Cty', role: 'manager' })
  D().upsertItem(item('i-mgr', 'MGR'))
  ok(D().items.some(x => x.id === 'i-mgr') && !S.catalogLocked() && !S.readOnly(), 'quản lý: sửa được mã hàng (như chủ)')
  // Chỉ xem: không sửa gì được, có câu báo; không dọn nháp
  await S.openSpace({ id: 'fam2', name: 'Cty', role: 'viewer' })
  const before = JSON.stringify({ o: D().orders, t: D().trips, i: D().items, p: D().pallet })
  const n0 = S.useNotice.getState().n
  D().upsertOrder({ ...o, name: 'Sửa trộm' }); D().removeOrder('o-f'); D().upsertTrip({ ...tr, name: 'X' }); D().removeTrip('t-f')
  D().upsertTrip({ ...D().trips.find(x => x.id === 'sample-t1'), name: 'Mẫu sửa 2' })
  D().upsertItem(item('i-v', 'V')); D().setPallet({ ...base.pallet, maxH: 900 })
  D().importBatch({ items: [], vehicles: [], orders: [order('o-v', 'Nhập trộm')], trips: [] })
  D().upsertOrder(order('o-blank-v', 'Đơn 9')); D().sweepBlank([])
  ok(JSON.stringify({ o: D().orders, t: D().trips, i: D().items, p: D().pallet }) === before, 'chỉ xem: không sửa / xoá / tách mẫu / nhập / đổi danh mục được')
  ok(S.useNotice.getState().n > n0 && S.useNotice.getState().text === S.READ_ONLY && S.denyEdit() === true, 'chỉ xem: bấm sửa ⇒ có câu báo; nút tạo mới bị chặn')
  ok(S.catalogLocked(), 'chỉ xem: danh mục khoá')
  await S.openSpace({ id: 'me', name: null, role: null })
  ok(S.denyEdit() === false, '"Của tôi": không chặn')
  S.setAuthor(null)
  S.dropSpace('fam2')
}

console.log('• Chia sẻ chuyến: bản chụp ⇒ người nhận lưu bản sao')
{
  const it = (id, code, extra = {}) => ({ id, owner: 'me', code, name: `Hàng ${code}`, l: 400, w: 300, h: 200, kg: 5, perPallet: 80, maxLayers: 8, light: false, updatedAt: now, ...extra })
  const veh = { id: 'v-me', owner: 'me', name: 'Xe của A', plate: '51C-12345', kind: 'pallet', l: 9500, w: 2400, h: 2500, payloadKg: 15000, updatedAt: now }
  // người gửi: một mã của mình + một mã mẫu chung, xe của mình, 2 đơn (một đơn tên mặc định), bật "hàng nhẹ pallet riêng"
  D().replaceAll({ ...base, items: [it('i-a', 'A1')], vehicles: [veh], deleted: {},
    orders: [order('o-s1', 'Khách Hưng', [{ itemId: 'i-a', qty: 30 }, { itemId: '17047429-4e68-4236-8d2e-1b91b8eac4be', qty: 50 }], { place: 'Q7' }), order('o-s2', 'Đơn 4', [{ itemId: 'i-a', qty: 5 }])],
    trips: [trip('t-s', 'Xe đi Bình Dương', ['o-s2', 'o-s1'], { vehicleId: 'v-me', lightOwnPallet: true })] })
  const pack = S.packTrip('t-s')
  ok(pack && pack.orders.map(o => o.id).join() === 'o-s2,o-s1' && ids(pack.items) === '17047429-4e68-4236-8d2e-1b91b8eac4be,i-a' && pack.vehicles[0]?.id === 'v-me',
    'bản chụp: đơn theo thứ tự giao, đủ mã hàng (cả mẫu chung) + xe')
  const wire = S.cleanPack(JSON.parse(JSON.stringify(pack)))   // qua máy chủ (JSON)
  ok(!!wire && wire.items.length === 2 && wire.trip.lightOwnPallet === true && wire.orders[1].place === 'Q7', 'đọc lại bản chụp sau khi qua máy chủ')
  ok(S.cleanPack({ app: 'x' }) === null && S.cleanPack(null) === null && S.cleanPack({ ...pack, items: [{ id: 'bad', l: 'abc' }] }).items.length === 0,
    'bản chụp hỏng / trường sai kiểu ⇒ bỏ')
  // người nhận: đã có một mã KHÁC cũng tên mã "A1", đã có "Đơn 4"
  D().replaceAll({ ...base, items: [it('i-r', 'A1', { l: 999 })], vehicles: [], orders: [order('o-r', 'Đơn 4')], trips: [], deleted: {} })
  const tid = S.adoptShare(wire)
  const nt = D().trips.find(t => t.id === tid), nos = nt?.orderIds.map(id => D().orders.find(o => o.id === id)) ?? []
  const added = D().items.find(i => i.id !== 'i-r')
  ok(nt?.name === 'Xe đi Bình Dương' && nt.code !== nt.name && nt.lightOwnPallet === true && nos.map(o => o?.name).join() === 'Đơn 5,Khách Hưng' && nos[1]?.place === 'Q7',
    `lưu bản sao ⇒ chuyến mới (giữ tên, mã chuyến mới, giữ công tắc); đơn tên mặc định ⇒ "Đơn N" kế tiếp (${nos.map(o => o?.name)})`)
  ok(D().items.length === 2 && added?.code === 'A1-2' && added.owner === 'me' && nos[1]?.lines.some(l => l.itemId === '17047429-4e68-4236-8d2e-1b91b8eac4be') && nos[1].lines.some(l => l.itemId === added.id),
    `mã chưa có ⇒ thêm thành mã của tôi (trùng mã khác ⇒ "${added?.code}"); mã mẫu chung dùng lại`)
  const nv = D().vehicles[0]
  ok(D().vehicles.length === 1 && nv.id !== 'v-me' && nt?.vehicleId === nv.id && nv.owner === 'me', 'xe chưa có ⇒ thêm thành xe của tôi, id mới')
  const tid2 = S.adoptShare(wire)
  ok(tid2 !== tid && D().items.length === 2 && D().vehicles.length === 1, 'lưu cùng link lần hai ⇒ chuyến thứ hai, mã hàng / xe dùng lại (không đẻ trùng)')
  // chuyến mẫu: mọi mã + xe là mẫu chung ⇒ không thêm gì vào danh mục
  D().replaceAll({ ...base, orders: [], trips: [], deleted: {} })
  const sp = S.cleanPack(JSON.parse(JSON.stringify(S.packTrip('sample-t1'))))
  ok(!S.shareNeedsCatalog(sp), 'chuyến mẫu: mã + xe đều là mẫu chung ⇒ không cần thêm danh mục')
  ok(S.adoptShare(sp) === 'sample-t1' && !mine(D().trips).length && !mine(D().orders).length,
    'chuyến mẫu CHƯA SỬA ⇒ mở luôn chuyến mẫu bên người nhận (không đẻ bản sao y hệt mẫu)')
  sp.orders[0].lines[0].qty += 3   // người gửi đã sửa chuyến mẫu
  const ts = S.adoptShare(sp), st = D().trips.find(t => t.id === ts)
  ok(st && !S.isSample(ts) && st.name === st.code && st.vehicleId === S.SAMPLE_TRIPS[0].vehicleId && !D().items.length && st.orderIds.length === 1
    && D().orders.find(o => o.id === st.orderIds[0])?.lines[0].qty === sp.orders[0].lines[0].qty,
    'chuyến mẫu ĐÃ SỬA ⇒ bản sao là chuyến thường (tên = mã mới, mang số đã sửa), xe mẫu chung, mẫu không đụng')
  // thành viên Family: bản sao cần thêm mã ⇒ tấm lưu sẽ đưa vào "Của tôi" (ở đây kiểm cờ)
  await S.openSpace({ id: 'fam2', name: 'Cty', role: 'member' })
  ok(S.shareNeedsCatalog(wire) && S.catalogLocked(), 'thành viên Family + bản sao cần thêm mã ⇒ phải lưu sang "Của tôi"')
  await S.openSpace({ id: 'me', name: null, role: null })
  S.dropSpace('fam2')
}

console.log('• Đồng bộ từng bản ghi: chỉ gửi phần đổi, kéo về không đè thay đổi chưa gửi')
{
  const u = n => now - day + n   // mốc giờ thật (dấu xoá quá 90 ngày tự bỏ)
  const pal = { l: 1200, w: 1000, maxH: 1650, baseH: 150, kg: 25 }
  const srv = { ...base, pallet: pal, items: [{ id: 'i1', code: 'A', updatedAt: u(1) }], orders: [order('s1', 'Đơn 1', [], { updatedAt: u(10) }), order('s2', 'Đơn 2', [], { updatedAt: u(10) })], trips: [trip('st', 'Chuyến', ['s1', 's2'], { updatedAt: u(10) })], deleted: {} }
  const syn = S.syncedOf(srv)
  ok(S.changesSince(srv, syn) === null, 'máy giống máy chủ ⇒ không gửi gì')
  const local = { ...srv, orders: [order('s1', 'Đơn 1 sửa', [], { updatedAt: u(20) }), srv.orders[1], order('n1', 'Đơn mới', [], { updatedAt: u(21) })], deleted: { gone: u(30) } }
  const c = S.changesSince(local, syn)
  ok(ids(c.orders ?? []) === 'n1,s1' && !c.trips && !c.items && !c.pallet && c.deleted?.gone === u(30), 'chỉ gửi đơn sửa + đơn mới + dấu xoá mới, không gửi bản ghi không đổi')
  ok(ids(S.changesSince({ ...local, items: [{ id: 'i1', code: 'B', updatedAt: u(2) }], pallet: { ...pal, l: 1100 } }, syn, false).orders) === 'n1,s1'
    && !S.changesSince({ ...local, items: [{ id: 'i1', code: 'B', updatedAt: u(2) }], pallet: { ...pal, l: 1100 } }, syn, false).items, 'thành viên Family: không gửi mã hàng, cỡ pallet')
  ok(Object.keys(S.changesSince(srv, null)).sort().join() === 'deleted,items,orders,pallet,trips'.replace('deleted,', ''), 'chưa biết máy chủ có gì ⇒ gửi hết (máy chủ tự gộp)')
  const syn2 = S.markSynced(syn, c)
  ok(S.changesSince(local, syn2) === null, 'gửi xong ⇒ lần sau không gửi lại')
  // người khác sửa s2 + xoá s1; máy này đang sửa s1 (chưa gửi, MỚI hơn lúc xoá) và đổi cỡ pallet
  const mine2 = { ...local, orders: [order('s1', 'Đơn 1 sửa tiếp', [], { updatedAt: u(50) }), local.orders[1], local.orders[2]], pallet: { ...pal, l: 1100 } }
  const inc = { orders: [order('s2', 'Đơn 2 (người khác)', [], { updatedAt: u(40) })], deleted: { s1: u(45) }, pallet: { ...pal, l: 1300 } }
  const m = S.applyChanges(mine2, inc, syn2)
  ok(m.orders.find(o => o.id === 's2')?.name === 'Đơn 2 (người khác)' && m.orders.find(o => o.id === 's1')?.name === 'Đơn 1 sửa tiếp' && m.orders.some(o => o.id === 'n1'),
    'kéo về: lấy bản người khác, giữ thay đổi chưa gửi (sửa SAU lúc xoá ⇒ còn), giữ đơn mới')
  ok(m.pallet.l === 1100, 'máy này đã đổi cỡ pallet chưa gửi ⇒ giữ cỡ của máy')
  ok(S.applyChanges(local, inc, syn2).pallet.l === 1300, 'máy này chưa đổi cỡ pallet ⇒ lấy cỡ mới trên máy chủ')
  const m2 = S.applyChanges(local, { deleted: { s2: u(99) } }, syn2)
  ok(!m2.orders.some(o => o.id === 's2') && m2.trips[0].orderIds.join() === 's1', 'kéo về dấu xoá ⇒ đơn mất, chuyến bỏ đơn đó')
  ok(S.applyChanges(local, { orders: [order('s1', 'cũ', [], { updatedAt: u(15) })] }, syn2).orders.find(o => o.id === 's1').name === 'Đơn 1 sửa', 'bản máy chủ CŨ hơn bản trên máy ⇒ không đè')
}

console.log('• Tên chuyến để hiện (chủ dự án 14/11: không có số chuyến thì gọi theo số đơn)')
{
  const os = [{ id: 'a', name: '131126_77' }, { id: 'b', name: '131126_78' }, { id: 'c', name: 'Đơn rất dài tên khách hàng số một' }]
  const tr = (name, orderIds, extra = {}) => ({ id: 't1', code: '141126-0655-01', name, orderIds, ...extra })
  ok(S.tripTitle(tr('141126-0655-01', ['a']), os) === '131126_77', 'chuyến tên mã ⇒ gọi theo đơn')
  ok(S.tripTitle(tr('141126-0655-01', ['a', 'b']), os) === '131126_77, 131126_78', 'hai đơn ⇒ nối tên')
  ok(S.tripTitle(tr('141126-0655-01', ['a', 'b', 'c']), os) === '131126_77, 131126_78 +1', 'dài quá 40 ký tự ⇒ +n')
  ok(S.tripTitle(tr('Chuyến 3', ['a']), os) === '131126_77', 'tên mặc định Chuyến N ⇒ gọi theo đơn')
  ok(S.tripTitle(tr('Xe sáng thứ 2', ['a']), os) === 'Xe sáng thứ 2', 'đã đặt tên riêng ⇒ giữ tên')
  ok(S.tripTitle(tr('141126-0655-01', []), os) === '141126-0655-01', 'chuyến chưa có đơn ⇒ hiện mã')
  ok(S.tripTitle({ ...S.SAMPLE_TRIPS[0] }, [{ id: S.SAMPLE_TRIPS[0].orderIds[0], name: 'ĐƠN X' }]) !== 'ĐƠN X', 'chuyến mẫu ⇒ giữ tên mẫu, không gọi theo đơn')
  ok(S.tripMade(tr('x', [])) === '14/11 06:55', 'giờ tạo đọc từ mã chuyến')
}

console.log(fail ? `\nĐỎ — ${fail} lỗi` : '\nXANH')
process.exit(fail ? 1 : 0)
