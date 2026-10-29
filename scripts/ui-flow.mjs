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
  const qty = st.orders.filter(o => !o.id.startsWith('sample-')).flatMap(o => o.lines).find(l => /st180/.test(l.itemId))?.qty
  const still = await q.evaluate(() => document.activeElement?.getAttribute('inputmode') === 'numeric')
  ok(String(qty) === typed && still && st.trips.length === 2, `${label}: gõ "${typed}" ⇒ tách 1 chuyến mới, lưu ${qty}, ô vẫn đang gõ: ${still}`)
}

await b.close(); await srv.close()
console.log(fail ? `${fail} phép HỎNG` : 'XANH')
process.exit(fail ? 1 : 0)
