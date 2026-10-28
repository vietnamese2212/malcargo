// Bàn xếp xe: nút toàn màn hình khung 3D (máy tính / điện thoại dọc / ngang) + nút "Nhập đơn từ Excel" (đơn vào đúng
// chuyến đang mở) + file mẫu nhập Excel theo ngôn ngữ (tên trang, tiêu đề cột) nạp lại được ở ngôn ngữ kia.
// Chạy sau `npm run build`: node scripts/ui-tools.mjs
import readXlsxFile from 'read-excel-file/node'
import { join } from 'node:path'
import { DEVICES, OUT, T, launch, startPreview, watchErrors } from './ui-lib.mjs'

const srv = await startPreview(4184)
const b = await launch()
let bad = 0
const ok = (c, msg) => { console.log(c ? '  ✓' : '  ✗', msg); if (!c) bad++ }
const data = p => p.evaluate(() => JSON.parse(localStorage.getItem('malcargo-data-v1')).state)
const near = (a, b) => Math.abs(a - b) <= 1

// ── 1. Toàn màn hình
for (const dev of [DEVICES[0], DEVICES[1], { ...DEVICES[1], name: 'phone-ngang', viewport: { width: 844, height: 390 } }]) {
  console.log(dev.name + ' — toàn màn hình')
  const ctx = await b.newContext(dev)
  const p = await ctx.newPage()
  const errs = watchErrors(p)
  await p.goto(srv.base + '#/trip/sample-t1', { waitUntil: 'networkidle' }); await p.waitForTimeout(5000)
  const { width: vw, height: vh } = dev.viewport
  const scene = p.locator('[data-scene]')
  await p.getByRole('button', { name: T('Toàn màn hình'), exact: true }).click(); await p.waitForTimeout(700)
  const box = await scene.boundingBox(), cv = await scene.locator('canvas').boundingBox()
  ok(near(box.x, 0) && near(box.y, 0) && near(box.width, vw) && near(box.height, vh), `khung 3D phủ kín màn ${Math.round(box.width)}×${Math.round(box.height)}`)
  ok(cv && cv.height > vh * 0.6 && near(cv.width, vw), `hình 3D giãn theo (${cv && Math.round(cv.width)}×${cv && Math.round(cv.height)})`)
  ok(await p.evaluate(() => !!document.elementFromPoint(window.innerWidth - 5, 5)?.closest('[data-scene]')), 'thanh trên bị che, nút thoát nằm trên cùng')
  ok(await p.evaluate(() => document.documentElement.style.overflow === 'hidden'), 'trang phía sau không cuộn')
  await p.screenshot({ path: `${OUT}/full-${dev.name}.png` })
  await p.getByRole('button', { name: T('Thoát toàn màn hình') }).click(); await p.waitForTimeout(500)
  const back = await scene.boundingBox()
  ok(back.width < vw - 1 || back.height < vh - 1, `thoát ⇒ khung về chỗ cũ (${Math.round(back.width)}×${Math.round(back.height)})`)
  ok(await p.evaluate(() => document.documentElement.style.overflow === '' && !document.fullscreenElement), 'trang cuộn lại được, đã ra khỏi toàn màn hình')
  if (!dev.hasTouch) {
    await p.getByRole('button', { name: T('Toàn màn hình'), exact: true }).click(); await p.waitForTimeout(400)
    await p.keyboard.press('Escape'); await p.waitForTimeout(400)
    const esc = await scene.boundingBox()
    ok(esc.width < vw - 1, 'Esc ⇒ thoát toàn màn hình')
  }
  ok(!errs.length, 'không lỗi trình duyệt' + (errs.length ? ': ' + errs.join(' | ') : ''))
  await ctx.close()
}

// ── 2. Nhập đơn từ Excel ngay trên bàn xếp xe ⇒ đơn vào chuyến đang mở
const paste = async (p, text, n) => {
  const sheet = p.locator('[data-sheet]')
  await sheet.getByRole('textbox', { name: T('Dán bảng {name}', { name: T('Đơn hàng') }) }).fill(text)
  await sheet.getByRole('button', { name: T('Nhập {n} dòng dữ liệu', { n }) }).click(); await p.waitForTimeout(800)
}
for (const dev of [DEVICES[0], { ...DEVICES[1], name: 'small', viewport: { width: 360, height: 760 } }]) {
  console.log(dev.name + ' — nhập đơn vào chuyến')
  const ctx = await b.newContext(dev)
  const p = await ctx.newPage()
  const errs = watchErrors(p)
  await p.goto(srv.base + '#/trip/sample-t1', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500)
  await p.getByRole('button', { name: T('Chuyến mới'), exact: true }).click(); await p.waitForTimeout(500)
  const tid = (await p.evaluate(() => location.hash)).split('/')[2]
  await p.getByRole('button', { name: T('Nhập đơn từ Excel') }).click(); await p.waitForTimeout(400)
  const sheet = p.locator('[data-sheet]')
  ok(await sheet.getByRole('tab', { name: new RegExp('^' + T('Đơn hàng')), selected: true }).count() === 1 || await sheet.getByRole('textbox', { name: T('Dán bảng {name}', { name: T('Đơn hàng') }) }).isVisible(), 'mở sẵn trang Đơn hàng')
  await p.screenshot({ path: `${OUT}/import-trip-${dev.name}.png` })
  await paste(p, 'Đơn nhập 1\tCửa hàng X\tMAU-ST180\t50\nĐơn nhập 1\tCửa hàng X\tMAU-ST110\t20\nĐơn nhập 2\t\tMAU-ST180\t30', 2)
  let d = await data(p)
  const tr = d.trips.find(t => t.id === tid)
  const names = (tr?.orderIds ?? []).map(id => d.orders.find(o => o.id === id)?.name)
  ok(names.join() === 'Đơn nhập 1,Đơn nhập 2', `chuyến trống, nhập 2 đơn ⇒ cả 2 vào chuyến đang mở (${names.join(', ')})`)
  ok(await p.getByText('Đơn nhập 2', { exact: true }).first().isVisible(), 'đơn hiện ngay trên cột hàng')
  // chuyến mẫu: nhập đơn ⇒ tách thành chuyến mới mang thêm đơn đó, chuyến mẫu giữ nguyên
  await p.evaluate(() => { location.hash = '#/trip/sample-t1' }); await p.waitForTimeout(2500)
  await p.getByRole('button', { name: T('Nhập đơn từ Excel') }).click(); await p.waitForTimeout(400)
  await paste(p, 'Đơn nhập 3\tCửa hàng Y\tMAU-ST180\t10', 1)
  const h = await p.evaluate(() => location.hash)
  d = await data(p)
  const fork = d.trips.find(t => `#/trip/${t.id}` === h)
  ok(h !== '#/trip/sample-t1' && fork?.orderIds.length === 3 && d.orders.find(o => o.id === fork.orderIds[2])?.name === 'Đơn nhập 3',
    `chuyến mẫu: nhập đơn ⇒ chuyển sang chuyến mới có 2 đơn mẫu + đơn vừa nhập (${fork?.orderIds.length ?? 0} đơn)`)
  ok(d.trips.find(t => t.id === 'sample-t1')?.orderIds.length === 2, 'chuyến mẫu giữ nguyên 2 đơn')
  await p.screenshot({ path: `${OUT}/import-trip-done-${dev.name}.png` })
  ok(!errs.length, 'không lỗi trình duyệt' + (errs.length ? ': ' + errs.join(' | ') : ''))
  await ctx.close()
}

// ── 3. File mẫu theo ngôn ngữ: tải bản Việt + bản Anh, mỗi bản nạp lại ở ngôn ngữ KIA vẫn đủ dòng
{
  console.log('pc — file mẫu hai ngôn ngữ')
  const ctx = await b.newContext({ ...DEVICES[0], acceptDownloads: true })
  const p = await ctx.newPage()
  const errs = watchErrors(p)
  await p.goto(srv.base + '#/trip/sample-t1', { waitUntil: 'networkidle' }); await p.waitForTimeout(2000)
  const lang = () => p.evaluate(() => JSON.parse(localStorage.getItem('malcargo-lang-v1')).state.lang)
  const flip = async () => { await p.locator('header').getByRole('button', { name: /tiếng|Vietnamese|English/i }).click(); await p.waitForTimeout(600) }
  const open = async () => { await p.locator('aside').getByRole('button', { name: /^(Nhập đơn từ Excel|Import orders from Excel)$/ }).click(); await p.waitForTimeout(400) }
  const files = {}
  for (let i = 0; i < 2; i++) {
    const l = await lang()
    await open()
    const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('[data-sheet]').getByRole('button', { name: /\.xlsx$/ }).first().click()])
    files[l] = join(OUT, `template-${l}.xlsx`); await dl.saveAs(files[l])
    await p.keyboard.press('Escape'); await p.waitForTimeout(200)
    await flip()
  }
  const vi = await readXlsxFile(files.vi), en = await readXlsxFile(files.en)
  const heads = s => s.map(x => `${x.sheet}[${x.data[0]?.[0] ?? ''}]`).join(' · ')
  console.log('    vi:', heads(vi)); console.log('    en:', heads(en))
  ok(vi.map(s => s.sheet).join() === 'Hướng dẫn,Mã hàng,Xe,Đơn hàng,Chuyến' && vi[1].data[0][0] === 'Mã hàng *', 'file mẫu tiếng Việt: tên trang + tiêu đề cột tiếng Việt')
  ok(en.map(s => s.sheet).join() === 'Guide,Items,Trucks,Orders,Trips' && en[1].data[0][0] === 'Code *' && en[3].data[0].join() === 'Order name *,Delivery point,Code *,Cartons *', 'file mẫu tiếng Anh: tên trang + tiêu đề cột tiếng Anh')
  ok(!/[à-ỹđ]/i.test(JSON.stringify(en.map(s => [s.sheet, s.data[0]]))), 'file tiếng Anh không còn chữ tiếng Việt ở tên trang / tiêu đề')
  // nạp chéo: đang ở ngôn ngữ nào cũng đọc được file ngôn ngữ kia (2 mã + 2 xe + 2 đơn + 1 chuyến = 7 dòng)
  for (const l of ['vi', 'en']) {
    const other = l === 'vi' ? 'en' : 'vi'
    if ((await lang()) !== l) await flip()
    await open()
    await p.locator('[data-sheet] input[type=file]').setInputFiles(files[other]); await p.waitForTimeout(800)
    const btn = await p.locator('[data-sheet] footer, [data-sheet]').getByRole('button', { name: /^(Nhập 7 dòng dữ liệu|Import 7 rows)/ }).count()
    if (!btn) console.log('    nút:', await p.locator('[data-sheet]').getByRole('button').allInnerTexts())
    ok(btn > 0, `giao diện ${l}, nạp file mẫu ${other} ⇒ đọc đủ 7 dòng`)
    await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  }
  ok(!errs.length, 'không lỗi trình duyệt' + (errs.length ? ': ' + errs.join(' | ') : ''))
  await ctx.close()
}

await b.close(); await srv.close()
console.log(bad ? `ĐỎ — ${bad} lỗi` : 'XANH')
process.exit(bad ? 1 : 0)
