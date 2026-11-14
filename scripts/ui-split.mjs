// "Chia ra nhiều xe": chuyến quá tải trên xe đang dùng ⇒ nút chia trên khung 3D ⇒ tấm xem trước (cần mấy xe, xe nào chở gì) ⇒
// "Tạo N chuyến mới" ⇒ chuyến gốc + chuyến mới đều "Vừa xe", tổng hàng không đổi. Chạy sau `npm run build`: node scripts/ui-split.mjs
import { DEVICES, OUT, T, launch, startPreview, watchErrors } from './ui-lib.mjs'
const srv = await startPreview(4195)
const b = await launch()
const now = Date.now()
// 700 thùng × 10 kg = 7 tấn trên xe 5 tấn (đủ chỗ, quá tải) + một đơn nhỏ
const seed = {
  state: {
    items: [{ id: 's-i1', owner: 'me', code: 'TH1', name: 'Hàng thử nặng', l: 425, w: 260, h: 145, kg: 10, perPallet: 110, maxLayers: 11, light: false, updatedAt: now }],
    vehicles: [{ id: 's-v1', owner: 'me', name: 'Xe thử 5 tấn', plate: '', kind: 'loose', l: 5700, w: 2000, h: 2000, payloadKg: 5000, updatedAt: now }],
    orders: [{ id: 's-o1', name: 'Đơn lớn', place: 'Kho A', lines: [{ itemId: 's-i1', qty: 600 }], updatedAt: now },
      { id: 's-o2', name: 'Đơn nhỏ', place: 'Kho B', lines: [{ itemId: 's-i1', qty: 100 }], updatedAt: now }],
    trips: [{ id: 's-t1', code: '141126-0800-01', name: '141126-0800-01', vehicleId: 's-v1', orderIds: ['s-o2', 's-o1'], updatedAt: now }],
    pallet: { l: 1200, w: 1000, maxH: 1650, baseH: 150, kg: 25 },
  }, version: 0,
}
let bad = 0
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) bad++ }
const data = p => p.evaluate(() => JSON.parse(localStorage.getItem('malcargo-data-v1')).state)
const verdict = p => p.locator('[data-scene]').getByRole('button', { name: new RegExp('^' + T('Kết quả: {head}. Bấm để xem chi tiết', { head: 'X' }).split('X')[0]) })

for (const dev of [DEVICES[0], { ...DEVICES[1], name: 'small', viewport: { width: 360, height: 740 } }]) {
  console.log(dev.name)
  const ctx = await b.newContext(dev)
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('malcargo-data-v1', JSON.stringify(s)); sessionStorage.setItem('seeded', '1') } }, seed)
  const p = await ctx.newPage(); const errs = watchErrors(p)
  await p.goto(srv.base + '#/trip/s-t1', { waitUntil: 'networkidle' })
  const btn = p.getByRole('button', { name: T('Chia ra nhiều xe'), exact: true })
  ok(await btn.waitFor({ timeout: 20000 }).then(() => true, () => false), 'quá tải: khung 3D có nút "Chia ra nhiều xe"')
  const box = await btn.boundingBox()
  ok(!dev.hasTouch || box.height >= 40, `nút đủ cao để chạm (${Math.round(box?.height ?? 0)}px)`)
  await p.screenshot({ path: `${OUT}/split-button-${dev.name}.png` })
  await btn.click()
  const sheet = p.locator('[data-sheet]').last()
  ok(await sheet.getByText(T('Cần {n} xe', { n: 2 })).waitFor({ timeout: 30000 }).then(() => true, () => false), 'tấm xem trước: "Cần 2 xe", xe 2 gợi ý xe nhỏ hơn')
  ok(await sheet.getByText(T('Đơn lớn') + ' (2)').first().isVisible(), 'đơn bị chia hiện tên mới "Đơn lớn (2)" ở xe 2')
  await p.screenshot({ path: `${OUT}/split-sheet-${dev.name}.png` })
  await sheet.getByRole('button', { name: T('Tạo {n} chuyến mới', { n: 1 }) }).click(); await p.waitForTimeout(600)
  const st = await data(p)
  const total = st.orders.filter(o => !o.id.startsWith('sample-')).reduce((s, o) => s + o.lines.reduce((a, l) => a + l.qty, 0), 0)
  const mine = st.trips.filter(t => !t.id.startsWith('sample-'))
  ok(mine.length === 2 && total === 700, `thành 2 chuyến, tổng hàng giữ 700 thùng (${mine.length} chuyến, ${total} thùng)`)
  ok(await p.getByText(T('Đã chia thành {n} chuyến — xem ở ô Chuyến xe', { n: 2 })).isVisible(), 'báo đã chia')
  // chuyến gốc + chuyến mới đều vừa xe
  ok(await verdict(p).filter({ hasText: T('Vừa xe') }).waitFor({ timeout: 20000 }).then(() => true, () => false), 'chuyến gốc giờ "Vừa xe"')
  const other = mine.find(t => t.id !== 's-t1')
  await p.evaluate(id => { location.hash = '#/trip/' + id }, other.id)
  ok(await verdict(p).filter({ hasText: T('Vừa xe') }).waitFor({ timeout: 20000 }).then(() => true, () => false), 'chuyến mới "Vừa xe"')
  await p.screenshot({ path: `${OUT}/split-after-${dev.name}.png` })
  ok(!errs.length, 'không lỗi trình duyệt' + (errs.length ? ': ' + errs.join(' | ') : ''))
  await ctx.close()
}
// Thùng rời ↔ Pallet = xem tình huống cho CHUYẾN NÀY (chủ dự án 14/11): xe giữ nguyên, chuyến khác cùng xe không đổi, không đẻ xe "(của tôi)"
console.log('đổi Thùng rời ↔ Pallet theo chuyến')
{
  const two = structuredClone(seed)
  two.state.trips.push({ id: 's-t2', code: '141126-0900-02', name: '141126-0900-02', vehicleId: 's-v1', orderIds: ['s-o2'], updatedAt: now })
  two.state.trips[0].orderIds = ['s-o1']
  const ctx = await b.newContext(DEVICES[0])
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('malcargo-data-v1', JSON.stringify(s)); sessionStorage.setItem('seeded', '1') } }, two)
  const p = await ctx.newPage(); const errs = watchErrors(p)
  await p.goto(srv.base + '#/trip/s-t1', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
  await p.getByRole('button', { name: 'Pallet', exact: true }).first().click(); await p.waitForTimeout(800)
  const st = await data(p)
  ok(st.trips.find(t => t.id === 's-t1').kind === 'pallet' && !st.trips.find(t => t.id === 's-t2').kind, 'chuyến này ghi Pallet, chuyến kia cùng xe không đổi')
  ok(st.vehicles.length === 1 && st.vehicles[0].kind === 'loose', 'xe giữ nguyên Thùng rời, không thêm xe')
  await p.getByRole('button', { name: T('Thùng rời'), exact: true }).first().click(); await p.waitForTimeout(800)
  ok(!(await data(p)).trips.find(t => t.id === 's-t1').kind, 'đổi lại Thùng rời (= cách chở của xe) ⇒ bỏ cách chở riêng')
  ok(!errs.length, 'không lỗi trình duyệt' + (errs.length ? ': ' + errs.join(' | ') : ''))
  await ctx.close()
}
await b.close(); await srv.close()
console.log(bad ? `${bad} phép HỎNG` : 'XANH')
process.exit(bad ? 1 : 0)
