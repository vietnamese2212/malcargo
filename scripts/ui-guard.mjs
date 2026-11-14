// Form còn thay đổi chưa lưu không mất vì chạm nhầm (thử 14/11: điền form mã hàng, cất bàn phím, chạm dải mờ ⇒ mất hết):
// chạm ra ngoài / X / Back ⇒ hỏi "Bỏ những gì vừa sửa?"; "Sửa tiếp" (hay Back lần nữa) ⇒ tấm còn nguyên chữ; "Bỏ thay đổi" ⇒ đóng,
// vẫn ở Bàn xếp xe (lịch sử không lùi quá). Form chưa sửa gì ⇒ đóng ngay như cũ. Chạy sau `npm run build`: node scripts/ui-guard.mjs
import { DEVICES, OUT, T, launch, startPreview, watchErrors } from './ui-lib.mjs'
const srv = await startPreview(4196)
const b = await launch()
let bad = 0
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) bad++ }
const dev = { ...DEVICES[1], name: 'phone' }
const ctx = await b.newContext(dev)
const p = await ctx.newPage(); const errs = watchErrors(p)
await p.goto(srv.base + '#/trip/sample-t1', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
const openForm = async (panel = false) => {
  if (panel) {   // danh mục Mã hàng (tấm phủ) — mở một lần, còn mở sau khi form đóng
    await p.getByRole('button', { name: T('Danh mục') }).click(); await p.waitForTimeout(200)
    await p.getByRole('button', { name: T('Mã hàng'), exact: true }).last().click(); await p.waitForTimeout(400)
  }
  await p.getByRole('dialog').last().getByRole('button', { name: new RegExp(T('Thêm mã')) }).first().click(); await p.waitForTimeout(400)
}
const sheet = () => p.locator('[data-sheet]').last()
const ask = () => p.getByRole('alertdialog')
const backdrop = async () => { await p.keyboard.press('Tab'); await p.evaluate(() => (document.activeElement)?.blur()); await p.touchscreen.tap(180, 30); await p.waitForTimeout(400) }

await openForm(true)
ok(await sheet().getByRole('heading', { name: T('Thêm mã hàng') }).isVisible(), 'mở form Thêm mã hàng')
await backdrop()
ok(!(await p.locator('[data-sheet]').filter({ hasText: T('Thêm mã hàng') }).count()), 'form chưa sửa gì: chạm ra ngoài ⇒ đóng ngay, không hỏi')

await openForm()
await sheet().getByPlaceholder('SP001').fill('THU-01')
await backdrop()
ok(await ask().isVisible(), 'đã gõ mã: chạm ra ngoài ⇒ hỏi "Bỏ những gì vừa sửa?"')
await p.screenshot({ path: `${OUT}/guard-ask.png` })
await ask().getByRole('button', { name: T('Sửa tiếp') }).click(); await p.waitForTimeout(300)
ok(!(await ask().count()) && await sheet().getByPlaceholder('SP001').inputValue() === 'THU-01', '"Sửa tiếp" ⇒ tấm còn, chữ còn')

await p.goBack(); await p.waitForTimeout(500)
ok(await ask().isVisible() && await sheet().isVisible(), 'Back ⇒ hỏi, tấm chưa đóng')
await p.goBack(); await p.waitForTimeout(500)
ok(!(await ask().count()) && await sheet().getByPlaceholder('SP001').inputValue() === 'THU-01', 'Back lần nữa ⇒ đóng hộp hỏi (= sửa tiếp), tấm + chữ còn')

await sheet().getByRole('button', { name: T('Đóng') }).first().click(); await p.waitForTimeout(300)
ok(await ask().isVisible(), 'X ⇒ hỏi')
await ask().getByRole('button', { name: T('Bỏ thay đổi') }).click(); await p.waitForTimeout(600)
ok(!(await p.locator('[data-sheet]').filter({ hasText: T('Thêm mã hàng') }).count()), '"Bỏ thay đổi" ⇒ đóng form')
ok(p.url().includes('#/trip/sample-t1'), `vẫn ở Bàn xếp xe (${p.url().split('#')[1]})`)
// danh mục Mã hàng (tấm phủ) còn mở ⇒ Back đóng nó, vẫn ở chuyến
await p.goBack(); await p.waitForTimeout(500)
ok(p.url().includes('#/trip/sample-t1') && await p.locator('[data-tour=trip]').isVisible(), 'Back tiếp ⇒ đóng danh mục, vẫn ở chuyến (lịch sử không lệch)')
ok(!errs.length, 'không lỗi trình duyệt' + (errs.length ? ': ' + errs.join(' | ') : ''))
await b.close(); await srv.close()
console.log(bad ? `${bad} phép HỎNG` : 'XANH')
process.exit(bad ? 1 : 0)
