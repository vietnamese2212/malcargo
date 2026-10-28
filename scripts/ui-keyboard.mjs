// Giả lập bàn phím iPhone: thay window.visualViewport bằng bản giả, "mở bàn phím" = thu chiều cao phần thấy.
// Soát: tấm sửa bám phần thấy + che dải dưới; ô đang gõ kéo vào chỗ thấy; bảng Thùng xe nằm trên bàn phím;
// khung 3D thôi dính; trang đơn ẩn dải tổng. Chạy sau `npm run build`: node scripts/ui-keyboard.mjs
import { OUT, T, launch, startPreview, watchErrors } from './ui-lib.mjs'
const srv = await startPreview(4184)
const b = await launch()
const dev = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const KB = 336   // cao bàn phím + thanh gợi ý
let bad = 0
const ok = (c, msg) => { console.log(c ? '  ✓' : '  ✗', msg); if (!c) bad++ }
const ctx = await b.newContext(dev)
await ctx.addInitScript(() => {
  const vv = new EventTarget()
  let kbH = 0
  Object.defineProperties(vv, {
    width: { get: () => innerWidth }, height: { get: () => innerHeight - kbH },
    offsetTop: { value: 0 }, offsetLeft: { value: 0 }, scale: { value: 1 },
  })
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
  window.__kb = (h) => { kbH = h; vv.dispatchEvent(new Event('resize')) }
})
const p = await ctx.newPage()
const errs = watchErrors(p)
const kb = async open => { await p.evaluate(h => window.__kb(h), open ? KB : 0); await p.waitForTimeout(450) }
const rectOf = (sel) => p.evaluate(s => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && { top: Math.round(r.top), bottom: Math.round(r.bottom) } }, sel)
await p.goto(srv.base + '#/trip/sample-t1', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500)
const visBottom = 844 - KB

// 1. tấm "Thêm mã hàng": chạm ô Dài (dưới đáy) rồi mở bàn phím
await p.getByRole('button', { name: T('Danh mục') }).click(); await p.waitForTimeout(200)
await p.getByRole('button', { name: T('Mã hàng'), exact: true }).last().click(); await p.waitForTimeout(400)
await p.getByRole('button', { name: T('Thêm mã'), exact: true }).first().click(); await p.waitForTimeout(400)
const dai = p.locator('[data-sheet] input[placeholder="' + T('Dài') + '"]')
await dai.focus(); await kb(true)
const sheet = await rectOf('[data-sheet]')
ok(sheet.bottom <= visBottom + 1, `tấm sửa: đáy ${sheet.bottom} ≤ mép bàn phím ${visBottom}`)
const lr = await dai.boundingBox()
const body = await rectOf('[data-sheet] [data-scroll]')
ok(lr.y >= body.top - 1 && lr.y + lr.height <= body.bottom + 1, `ô Dài đang gõ nằm trong phần thấy (${Math.round(lr.y)}–${Math.round(lr.y + lr.height)} trong ${body.top}–${body.bottom})`)
const shield = await p.evaluate(y => { const e = document.elementFromPoint(200, y); return !!e && !!e.closest('[aria-hidden]') && !e.closest('[data-sheet]') }, visBottom + 20)
ok(shield, 'dải dưới mép phần thấy (sau thanh gợi ý) được che, không chạm trúng trang')
const save = await p.locator('[data-sheet]').getByRole('button', { name: T('Lưu'), exact: true }).boundingBox()
ok(save && save.y + save.height <= visBottom, 'nút Lưu nằm trên bàn phím')
await p.screenshot({ path: `${OUT}/kb-sheet.png` })
await kb(false); await p.keyboard.press('Escape'); await p.waitForTimeout(200); await p.keyboard.press('Escape'); await p.waitForTimeout(300)

// 2. bảng Thùng xe: mở thông số, chạm ô Dài lòng thùng
await p.getByRole('button', { name: T('Đổi xe') }).click(); await p.waitForTimeout(400)
await p.getByRole('dialog', { name: T('Thùng xe') }).locator('button[aria-expanded="false"]').first().click(); await p.waitForTimeout(200)
const len = p.getByRole('dialog', { name: T('Thùng xe') }).getByLabel(T('Dài lòng thùng'))
await len.focus(); await kb(true)
const spec = await rectOf('[role=dialog][aria-label="' + T('Thùng xe') + '"]')
ok(spec.bottom <= visBottom + 1, `bảng Thùng xe: đáy ${spec.bottom} ≤ mép bàn phím ${visBottom}`)
const lb = await len.boundingBox()
ok(lb.y >= 0 && lb.y + lb.height <= visBottom, `ô Dài lòng thùng thấy được (${Math.round(lb.y)}–${Math.round(lb.y + lb.height)})`)
await p.screenshot({ path: `${OUT}/kb-spec.png` })
await len.blur(); await kb(false); await p.keyboard.press('Escape'); await p.waitForTimeout(300)

// 3. Bàn xếp xe: gõ số thùng — khung 3D thôi dính
await p.evaluate(() => window.scrollTo(0, 600)); await p.waitForTimeout(200)
const qty = p.getByLabel(T('Số thùng {name}', { name: 'Sữa chua chai 100ml x48' }))
await qty.focus(); await kb(true)
const pos = await p.evaluate(() => getComputedStyle(document.querySelector('[data-scene]')).position)
ok(pos === 'relative', `khung 3D khi bàn phím mở: ${pos}`)
await qty.blur(); await kb(false)
ok(await p.evaluate(() => getComputedStyle(document.querySelector('[data-scene]')).position) === 'sticky', 'cất bàn phím: khung 3D dính lại')

// 4. trang đơn: dải tổng ẩn khi gõ
await p.goto(srv.base + '#/order/sample-o1', { waitUntil: 'networkidle' }); await p.waitForTimeout(800)
const bar = p.getByRole('button', { name: T('Xem chuyến') })
ok(await bar.isVisible(), 'trang đơn: dải tổng hiện khi không gõ')
await p.getByRole('textbox').first().focus(); await kb(true)
ok(!(await bar.isVisible()), 'trang đơn: bàn phím mở ⇒ ẩn dải tổng')
await kb(false)
ok(await bar.isVisible(), 'cất bàn phím ⇒ dải tổng hiện lại')

ok(!errs.length, 'không lỗi trình duyệt' + (errs.length ? ': ' + errs.join(' | ') : ''))

// 5. máy tính: cửa sổ thấp lại KHÔNG phải bàn phím — dải tổng trang đơn vẫn hiện
const pc = await b.newContext({ viewport: { width: 1280, height: 900 } })
await pc.addInitScript(() => {
  const vv = new EventTarget(); let kbH = 0
  Object.defineProperties(vv, { width: { get: () => innerWidth }, height: { get: () => innerHeight - kbH }, offsetTop: { value: 0 }, offsetLeft: { value: 0 }, scale: { value: 1 } })
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
  window.__kb = (h) => { kbH = h; vv.dispatchEvent(new Event('resize')) }
})
const q = await pc.newPage()
await q.goto(srv.base + '#/order/sample-o1', { waitUntil: 'networkidle' }); await q.waitForTimeout(800)
await q.getByRole('textbox').first().focus(); await q.evaluate(() => window.__kb(400)); await q.waitForTimeout(300)
ok(await q.getByRole('button', { name: T('Xem chuyến') }).isVisible(), 'máy tính: cửa sổ thấp lại ⇒ dải tổng vẫn hiện (không tưởng là bàn phím)')
await b.close(); await srv.close()
console.log(bad ? `ĐỎ — ${bad} lỗi` : 'XANH')
process.exit(bad ? 1 : 0)
