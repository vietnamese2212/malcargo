// Nút "In phiếu" (bảng đếm chân): mở hộp in một lần, phiếu có đủ thông tin, khi in chỉ còn phiếu (A4), in xong tự bỏ.
// Xuất PDF thật ra scripts/out/print-*.pdf — mở xem bằng mắt.
import { launch, startPreview, OUT, T, TX, watchErrors } from './ui-lib.mjs'

const { base, close } = await startPreview(4187)
const b = await launch()
let fail = 0
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fail++ }

for (const [trip, name, pal] of [['sample-t1', 'Mẫu pallet', true], ['sample-t2', 'Mẫu 40ft', false]]) {
  for (const vw of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    console.log(`• ${name} ${vw.width}px`)
    const ctx = await b.newContext({ viewport: vw })
    await ctx.addInitScript(() => { window.__prints = 0; window.print = () => { window.__prints++ } })
    const p = await ctx.newPage(), errs = watchErrors(p)
    await p.goto(`${base}#/trip/${trip}`)
    await p.waitForFunction(() => /Vừa xe|Fits/.test(document.body.innerText), null, { timeout: 60000 })
    await p.waitForTimeout(1500)
    const head = p.getByRole('button', { name: new RegExp(T('Bảng đếm chân')) }).first()
    if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click()
    const btn = p.getByRole('button', { name: T('In phiếu'), exact: true })
    await btn.scrollIntoViewIfNeeded(); await btn.click()
    await p.waitForFunction(() => window.__prints > 0, null, { timeout: 10000 }).catch(() => {})
    const sheet = p.locator('[data-print]')
    const txt = (await sheet.innerText().catch(() => '')).replace(/\s+/g, ' ')
    const rows = await p.evaluate(() => document.querySelectorAll('[data-print] table')[2]?.querySelectorAll('tbody tr').length ?? 0)
    // số dòng bảng đếm chân trên màn = dòng tóm tắt của khối ("9 dòng, thứ tự xếp từ cabin ra cửa")
    const want = Number((await head.innerText()).match(/(\d+) (dòng|rows?)/)?.[1] ?? -1)
    ok(await p.evaluate(() => window.__prints) === 1, 'bấm In phiếu ⇒ mở hộp in đúng một lần')
    ok(txt.includes(TX(name)) && /Vừa xe|Fits/.test(txt) && txt.includes(pal ? 'Pallet' : T('Thùng rời')), `phiếu có tên chuyến, kết quả, kiểu chở`)
    ok(rows > 0 && rows === want, `bảng đếm chân trên phiếu đủ ${rows}/${want} dòng như trên màn`)
    ok(await p.evaluate(() => !!document.querySelector('[data-print] img')?.getAttribute('src')?.startsWith('data:image/png')), 'có ảnh sơ đồ 3D')
    ok(!(await sheet.isVisible()), 'trên màn: phiếu ẩn')
    await p.emulateMedia({ media: 'print' })
    ok(await sheet.isVisible() && !(await p.locator('#root').isVisible()), 'khi in: chỉ còn phiếu, màn app ẩn')
    if (vw.width === 1440) await p.pdf({ path: `${OUT}/print-${trip}.pdf`, format: 'A4', printBackground: true })
    await p.emulateMedia({ media: 'screen' })
    await p.evaluate(() => window.dispatchEvent(new Event('afterprint')))
    await p.waitForTimeout(200)
    ok(await sheet.count() === 0, 'in xong ⇒ bỏ phiếu')
    ok(!errs.length, 'không lỗi trình duyệt' + (errs.length ? ': ' + errs.join(' | ') : ''))
    await ctx.close()
  }
}
await b.close(); await close()
console.log(fail ? `\nĐỎ — ${fail} lỗi` : '\nXANH — In phiếu')
process.exit(fail ? 1 : 0)
