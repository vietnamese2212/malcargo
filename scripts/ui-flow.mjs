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
await p.getByPlaceholder('Nước suối 24 chai').fill('Thùng thử nghiệm')
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

await b.close(); await srv.close()
console.log(fail ? `${fail} phép HỎNG` : 'XANH')
process.exit(fail ? 1 : 0)
