// Luồng người mới trên điện thoại: thêm mã → tạo đơn → chọn mã + số thùng → Xếp lên xe (app tự chọn xe)
// → tải lại trang dữ liệu vẫn còn. Chạy: npm run build && node scripts/ui-flow.mjs
import { DEVICES, OUT, launch, startPreview, watchErrors } from './ui-lib.mjs'

const srv = await startPreview()
const b = await launch()
const ctx = await b.newContext(DEVICES[1])
const p = await ctx.newPage()
const errs = watchErrors(p)
let fail = 0
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++ }

await p.goto(srv.base + '#/items', { waitUntil: 'networkidle' })
await p.getByRole('button', { name: 'Thêm mã', exact: true }).click()
await p.getByPlaceholder('SP001').fill('SP01')
await p.getByPlaceholder('Sữa 110ml x48').fill('Thùng thử nghiệm')
await p.getByPlaceholder('Dài').fill('500'); await p.getByPlaceholder('Rộng').fill('400'); await p.getByPlaceholder('Cao').fill('300')
await p.getByPlaceholder('0', { exact: true }).fill('10')   // kg/thùng
await p.getByRole('button', { name: 'Lưu' }).click()
await p.waitForTimeout(300)
ok(await p.getByText('Thùng thử nghiệm').isVisible(), 'mã mới hiện ngay ở tab "Của tôi"')

await p.evaluate(() => { location.hash = '#/orders' }); await p.waitForTimeout(300)
await p.getByRole('button', { name: 'Tạo đơn', exact: true }).click(); await p.waitForTimeout(300)
ok(/#\/order\//.test(p.url()), 'tạo đơn mở trang đơn')
await p.getByRole('button', { name: 'Chọn mã hàng' }).click()
await p.getByText('Thùng thử nghiệm').click()
await p.getByRole('button', { name: /Xong/ }).click()
await p.getByPlaceholder('Số thùng').fill('200'); await p.waitForTimeout(200)
await p.getByRole('button', { name: /Xếp lên xe/ }).click(); await p.waitForTimeout(5000)
ok(/#\/trip\//.test(p.url()), 'sang trang chuyến')
const status = await p.locator('text=/Vừa xe|Không vừa/').first().textContent()
ok(!!status?.includes('Vừa xe'), `trạng thái: ${status}`)
// 200 thùng 500×400×300 = 12 m³ · 2 tấn ⇒ xe 1,5t (8,4 m³) và 2,5t (11,3 m³) không đủ thể tích
const veh = await p.locator('text=/Xe tải [0-9,]+ tấn/').first().textContent()
ok(!!veh && !/1,5|2,5/.test(veh), `xe tự chọn: ${veh} (phải ≥ 3,5 tấn)`)
ok(await p.getByText('2 tấn').first().isVisible(), 'khối lượng 2 tấn')
await p.screenshot({ path: `${OUT}/flow-trip.jpg`, type: 'jpeg', quality: 75 })
const url = p.url()
await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(3500)
ok(p.url() === url && await p.locator('text=/Vừa xe/').first().isVisible(), 'tải lại trang: chuyến vẫn còn, vẫn tính ra')
ok(!errs.length, `không lỗi trình duyệt${errs.length ? ': ' + errs.join(' | ') : ''}`)

// Việc ĐẦU TIÊN của người mới: sửa số thùng ở chuyến mẫu (thử 29/10: phím đầu tách chuyến, ô mất con trỏ, "150" → "200"
// lưu thành 15). Trang đơn mẫu cũng vậy.
for (const [hash, label, typed] of [['#/trip/sample-t1', 'chuyến mẫu', '200'], ['#/order/sample-o1?back=trip:sample-t1', 'trang đơn mẫu', '175']]) {
  const q = await (await b.newContext(DEVICES[1])).newPage()
  await q.goto(srv.base + hash, { waitUntil: 'networkidle' }); await q.waitForTimeout(1200)
  const box = q.locator('input[inputmode=numeric]').first()
  await box.click(); await box.press('End')
  for (let i = 0; i < 3; i++) await box.press('Backspace')
  await box.pressSequentially(typed, { delay: 60 }); await q.waitForTimeout(400)
  const st = await q.evaluate(() => JSON.parse(localStorage.getItem('malcargo-data-v1')).state)
  const qty = st.orders.filter(o => !o.id.startsWith('sample-')).flatMap(o => o.lines)[0]?.qty
  const still = await q.evaluate(() => document.activeElement?.getAttribute('inputmode') === 'numeric')
  const forks = st.trips.filter(t => !t.id.startsWith('sample-')).length
  ok(String(qty) === typed && still && forks === 1, `${label}: gõ "${typed}" ⇒ tách ${forks} chuyến mới, lưu ${qty}, ô vẫn đang gõ: ${still}`)
}

// Sửa đơn (popup) sửa được cả HÀNG trong đơn: đổi số thùng, bỏ một mã, Lưu (chủ dự án 29/10) — trên máy tính
{
  const q = await (await b.newContext(DEVICES[0])).newPage()
  await q.goto(srv.base + '#/trip/sample-t1', { waitUntil: 'networkidle' }); await q.waitForTimeout(1200)
  await q.getByRole('button', { name: /^Sửa đơn Đơn mẫu pallet/ }).click()
  const sheet = q.locator('[data-sheet]')
  await sheet.getByLabel('Số thùng Sữa 180ml x48').fill('99')
  await sheet.getByRole('button', { name: 'Bỏ Thạch túi 110ml x24 khỏi đơn' }).click()
  await sheet.getByRole('button', { name: 'Lưu', exact: true }).click(); await q.waitForTimeout(500)
  const st = await q.evaluate(() => JSON.parse(localStorage.getItem('malcargo-data-v1')).state)
  const o = st.orders.find(x => !x.id.startsWith('sample-') && x.name === 'Đơn 1')
  ok(o?.lines.length === 5 && o.lines.find(l => /st180/.test(l.itemId))?.qty === 99 && !o.lines.some(l => /tui110/.test(l.itemId)),
    `Sửa đơn: đổi số thùng + bỏ mã ⇒ lưu vào đơn (bản tách): ${JSON.stringify(o?.lines)}`)
  // Cài đặt pallet: nút ⚙ ngay cạnh nút chọn Pallet (chuyến mẫu này đã là xe pallet)
  await q.getByRole('button', { name: 'Cài đặt pallet' }).click()
  const h = q.locator('[data-sheet]').getByLabel('Cao tối đa (cả đế)')
  await h.fill('1500'); await h.press('Enter'); await q.waitForTimeout(300)
  const p2 = await q.evaluate(() => JSON.parse(localStorage.getItem('malcargo-data-v1')).state.pallet)
  ok(p2.maxH === 1500, `Cài đặt pallet cạnh nút Pallet: cao tối đa (cả đế) lưu ${p2.maxH}`)
}

// Chọn xe như bộ lọc Excel (chủ dự án 29/10): bấm ô tên xe trên dải thông số ⇒ danh sách xe thả NGAY DƯỚI ô; chọn ⇒
// đổi xe, danh sách đóng; cuối danh sách "Chỉnh thông số thùng xe" ⇒ bảng sửa thông số
for (const dev of DEVICES) {
  const q = await (await b.newContext(dev)).newPage()
  await q.goto(srv.base + '#/trip/sample-t2', { waitUntil: 'networkidle' }); await q.waitForTimeout(1500)
  const chip = q.getByRole('button', { name: 'Đổi xe' })
  await chip.click(); await q.waitForTimeout(300)
  const pop = q.locator('[data-popover]')
  const cb = await chip.boundingBox(), pb = await pop.boundingBox()
  const under = !!pb && Math.abs(pb.x - cb.x) < 2 && pb.y >= cb.y + cb.height && pb.y < cb.y + cb.height + 12
  const listShown = await pop.getByLabel('Tìm xe').isVisible()
  await pop.getByText('Container 20ft', { exact: true }).click(); await q.waitForTimeout(800)
  const st = await q.evaluate(() => JSON.parse(localStorage.getItem('malcargo-data-v1')).state)
  ok(listShown && under && !(await pop.count()) && !(await q.getByRole('dialog', { name: 'Thùng xe' }).count()) && st.trips.some(t => !t.id.startsWith('sample-') && t.vehicleId === 'adm-v-c20'),
    `${dev.name}: bấm tên xe ⇒ danh sách thả ngay dưới ô (${under}), chọn Container 20ft ⇒ đổi xe, danh sách đóng`)
  await chip.click(); await q.waitForTimeout(300)
  await pop.getByRole('button', { name: 'Chỉnh thông số thùng xe' }).click(); await q.waitForTimeout(300)
  ok(await q.getByRole('dialog', { name: 'Thùng xe' }).getByLabel('Dài lòng thùng').isVisible() && !(await pop.count()), `${dev.name}: cuối danh sách "Chỉnh thông số" ⇒ bảng sửa thông số`)
}

// Đổi Thùng rời ↔ Pallet: khung 3D không đổi cỡ (chủ dự án 29/10: "khung xe nằm im, chỉ thay đổi hàng") — dải
// thông số có thêm nút pallet / công tắc hàng nhẹ cũng không được bóp khung
for (const dev of DEVICES) {
  const q = await (await b.newContext(dev)).newPage()
  await q.goto(srv.base + '#/trip/sample-t1', { waitUntil: 'networkidle' }); await q.waitForTimeout(1500)
  const size = () => q.evaluate(() => { const r = document.querySelector('[data-scene] canvas').getBoundingClientRect(); return `${Math.round(r.width)}×${Math.round(r.height)}` })
  const sizes = [await size()]
  for (const k of ['Thùng rời', 'Pallet']) { await q.getByRole('button', { name: k, exact: true }).click(); await q.waitForTimeout(1500); sizes.push(await size()) }
  ok(new Set(sizes).size === 1, `${dev.name}: đổi Pallet → Thùng rời → Pallet, khung 3D giữ cỡ (${sizes.join(' → ')})`)
}

await b.close(); await srv.close()
console.log(fail ? `${fail} phép HỎNG` : 'XANH')
process.exit(fail ? 1 : 0)
