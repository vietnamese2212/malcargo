// Bàn xếp xe: nút toàn màn hình khung 3D (máy tính / điện thoại dọc / ngang) + nút "Nhập đơn từ Excel" (đơn vào đúng
// chuyến đang mở; điện thoại không có phần nhập Excel) + file mẫu MỖI LOẠI một file một trang, theo ngôn ngữ, lưu qua
// hộp "Lưu thành…" (giả lập — headless không có hộp thật; Huỷ / máy không có hộp ⇒ tải về), nạp lại ở ngôn ngữ kia.
// Chạy sau `npm run build`: node scripts/ui-tools.mjs
import readXlsxFile from 'read-excel-file/node'
import writeXlsxFile from 'write-excel-file/node'
import { writeFileSync } from 'node:fs'
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
for (const dev of [DEVICES[0], { ...DEVICES[1], name: 'tablet', viewport: { width: 820, height: 1180 } }]) {
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

// ── 3. Điện thoại (dọc, ngang): không có nút nhập Excel nào — bàn xếp xe (chuyến trống + có hàng), menu, danh mục Mã hàng
for (const dev of [DEVICES[1], { ...DEVICES[1], name: 'phone-ngang', viewport: { width: 844, height: 390 } }]) {
  console.log(dev.name + ' — không có phần nhập Excel')
  const ctx = await b.newContext(dev)
  const p = await ctx.newPage()
  const errs = watchErrors(p)
  const none = async (name, where) => ok(!(await p.getByRole('button', { name: T(name) }).count()), `không có nút "${T(name)}" — ${where}`)
  await p.goto(srv.base + '#/trip/sample-t1', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500)
  await none('Nhập đơn từ Excel', 'chuyến có hàng')
  await p.getByRole('button', { name: T('Danh mục') }).click(); await p.waitForTimeout(300)
  await none('Nhập từ Excel', 'menu')
  await p.getByRole('button', { name: T('Mã hàng'), exact: true }).first().click(); await p.waitForTimeout(500)
  await none('Dán từ Excel', 'danh mục Mã hàng')
  await p.screenshot({ path: `${OUT}/no-import-${dev.name}.png` })
  await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  await p.getByRole('button', { name: T('Chuyến mới'), exact: true }).click(); await p.waitForTimeout(500)
  await none('Nhập đơn từ Excel', 'chuyến trống')
  ok(await p.getByRole('button', { name: T('Thêm hàng') }).first().isVisible(), 'chuyến trống vẫn có nút Thêm hàng')
  ok(!errs.length, 'không lỗi trình duyệt' + (errs.length ? ': ' + errs.join(' | ') : ''))
  await ctx.close()
}

// ── 4. File mẫu MỖI LOẠI: một file một trang, đúng tên theo ngôn ngữ, lưu qua hộp "Lưu thành…"; nạp lại ở ngôn ngữ KIA,
// file của loại khác tự vào đúng loại, nạp nhiều loại rồi nhập một lần; file 4 trang đời trước + file trang "Sheet1"
{
  console.log('pc — file mẫu từng loại, hộp Lưu thành…')
  const ctx = await b.newContext({ ...DEVICES[0], acceptDownloads: true })
  // hộp "Lưu thành…" giả: ghi lại tên gợi ý + nội dung; __cancel ⇒ người dùng bấm Huỷ
  await ctx.addInitScript(() => {
    window.__saved = []
    window.showSaveFilePicker = async o => {
      if (window.__cancel) throw new DOMException('Huỷ', 'AbortError')
      const rec = { name: o.suggestedName, ext: Object.values(o.types?.[0]?.accept ?? {}).flat(), bytes: null }
      window.__saved.push(rec)
      const parts = []
      return { createWritable: async () => ({ write: async x => { parts.push(x) }, close: async () => { rec.bytes = [...new Uint8Array(await new Blob(parts).arrayBuffer())] } }) }
    }
  })
  const p = await ctx.newPage()
  const errs = watchErrors(p)
  await p.goto(srv.base + '#/trip/sample-t1', { waitUntil: 'networkidle' }); await p.waitForTimeout(2000)
  const sheet = p.locator('[data-sheet]')
  const lang = () => p.evaluate(() => JSON.parse(localStorage.getItem('malcargo-lang-v1')).state.lang)
  const flip = async () => { await p.locator('header').getByRole('button', { name: /tiếng|Vietnamese|English/i }).click(); await p.waitForTimeout(600) }
  const open = async () => { await p.locator('aside').getByRole('button', { name: /^(Nhập đơn từ Excel|Import orders from Excel)$/ }).click(); await p.waitForTimeout(400) }
  const TAB = { items: 'Mã hàng|Items', vehicles: 'Xe|Trucks', orders: 'Đơn hàng|Orders', trips: 'Chuyến|Trips' }
  const tab = k => sheet.getByRole('button', { name: new RegExp(`^(${TAB[k]})(\\s*· \\d+)?$`) })
  const WANT = {
    vi: { items: ['malcargo-mau-ma-hang.xlsx', 'Mã hàng', 'Mã hàng *'], vehicles: ['malcargo-mau-xe.xlsx', 'Xe', 'Tên xe *'], orders: ['malcargo-mau-don-hang.xlsx', 'Đơn hàng', 'Tên đơn *'], trips: ['malcargo-mau-chuyen.xlsx', 'Chuyến', 'Tên chuyến *'] },
    en: { items: ['malcargo-items-template.xlsx', 'Items', 'Code *'], vehicles: ['malcargo-trucks-template.xlsx', 'Trucks', 'Truck name *'], orders: ['malcargo-orders-template.xlsx', 'Orders', 'Order name *'], trips: ['malcargo-trips-template.xlsx', 'Trips', 'Trip name *'] },
  }
  const files = { vi: {}, en: {} }
  for (let i = 0; i < 2; i++) {
    const l = await lang()
    await open()
    ok(await tab('orders').getAttribute('aria-pressed') === 'true', `[${l}] mở từ nút nhập đơn ⇒ đang chọn Đơn hàng`)
    for (const k of Object.keys(TAB)) {
      await tab(k).click(); await p.waitForTimeout(150)
      const n = await p.evaluate(() => window.__saved.length)
      await sheet.getByRole('button', { name: /\.xlsx$/ }).click(); await p.waitForTimeout(700)
      const rec = await p.evaluate(i => window.__saved[i], n)
      const [fname, sname, head] = WANT[l][k]
      if (!rec?.bytes) { ok(false, `[${l}] ${k}: không lưu qua hộp Lưu thành…`); continue }
      files[l][k] = join(OUT, `template-${l}-${k}.xlsx`); writeFileSync(files[l][k], Buffer.from(rec.bytes))
      const wb = await readXlsxFile(files[l][k])
      ok(rec.name === fname && rec.ext.includes('.xlsx') && wb.length === 1 && wb[0].sheet === sname && wb[0].data[0][0] === head && wb[0].data.length >= 3,
        `[${l}] ${k}: hộp Lưu thành… gợi ý ${rec.name}, 1 trang "${wb[0].sheet}" [${wb[0].data[0].join(' | ')}] + ${wb[0].data.length - 1} dòng ví dụ`)
      if (l === 'en') ok(!/[à-ỹđ]/i.test(JSON.stringify([wb[0].sheet, wb[0].data[0]])), `[en] ${k}: tên trang / tiêu đề không còn chữ tiếng Việt`)
    }
    if (i === 0) await p.screenshot({ path: `${OUT}/import-sheet-${l}.png` })
    await p.keyboard.press('Escape'); await p.waitForTimeout(200)
    await flip()
  }
  // nạp chéo: đang ở Đơn hàng nạp file Mã hàng (ngôn ngữ kia) ⇒ tự chuyển sang Mã hàng · 2; rồi nạp file Đơn hàng ⇒ 2 mã + 2 đơn
  for (const l of ['vi', 'en']) {
    const other = l === 'vi' ? 'en' : 'vi'
    if ((await lang()) !== l) await flip()
    await open()
    await sheet.locator('input[type=file]').setInputFiles(files[other].items); await p.waitForTimeout(800)
    ok(await tab('items').getAttribute('aria-pressed') === 'true' && /2$/.test(await tab('items').innerText()), `[${l}] nạp file Mã hàng (${other}) lúc đang ở Đơn hàng ⇒ vào Mã hàng, đọc 2 mã`)
    await tab('orders').click(); await p.waitForTimeout(150)
    await sheet.locator('input[type=file]').setInputFiles(files[other].orders); await p.waitForTimeout(800)
    const btn = await sheet.getByRole('button', { name: /^(Nhập 4 dòng dữ liệu|Import 4 rows)$/ }).count()
    if (!btn) console.log('    nút:', await sheet.getByRole('button').allInnerTexts())
    ok(btn > 0 && !(await sheet.locator('li svg.lucide-triangle-alert, li svg.lucide-alert-triangle').count()), `[${l}] thêm file Đơn hàng (${other}) ⇒ 2 mã + 2 đơn nhập một lần, không lỗi dòng`)
    await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  }
  // file 4 trang đời trước ⇒ đọc đủ 4 loại; file tự làm (trang "Sheet1") ⇒ thành loại đang chọn
  if ((await lang()) !== 'vi') await flip()
  const old = join(OUT, 'old-4-sheets.xlsx'), own = join(OUT, 'own-sheet1.xlsx')
  await writeXlsxFile([
    { sheet: 'Mã hàng', data: [['Mã hàng *'], ['OLD1', 'Hàng cũ 1', 400, 300, 200], ['OLD2', 'Hàng cũ 2', 300, 200, 100]] },
    { sheet: 'Xe', data: [['Tên xe *'], ['Xe cũ', '29C00001', '', 5700, 2000, 2000, 5000]] },
    { sheet: 'Đơn hàng', data: [['Tên đơn *'], ['Đơn cũ', '', 'OLD1', 10]] },
    { sheet: 'Chuyến', data: [['Tên chuyến *'], ['Chuyến cũ', 'Xe cũ', 'Đơn cũ']] },
  ]).toFile(old)
  await writeXlsxFile([{ sheet: 'Sheet1', data: [['Đơn tự làm', 'Kho B', 'MAU-ST180', 12], ['Đơn tự làm', 'Kho B', 'MAU-ST110', 4]] }]).toFile(own)
  await open()
  await sheet.locator('input[type=file]').setInputFiles(old); await p.waitForTimeout(800)
  ok(await sheet.getByRole('button', { name: 'Nhập 5 dòng dữ liệu' }).count() > 0, 'file 4 trang đời trước ⇒ đọc đủ 2 mã + 1 xe + 1 đơn + 1 chuyến')
  await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  await open()
  await sheet.locator('input[type=file]').setInputFiles(own); await p.waitForTimeout(800)
  ok(await tab('orders').getAttribute('aria-pressed') === 'true' && await sheet.getByRole('button', { name: 'Nhập 1 dòng dữ liệu' }).count() > 0, 'file tự làm, trang "Sheet1" ⇒ đọc thành Đơn hàng (1 đơn 2 mã)')
  // Huỷ ở hộp Lưu thành… ⇒ không tải gì, không báo lỗi; máy không có hộp ⇒ tải về như thường
  await p.evaluate(() => { window.__cancel = true })
  let dl = null
  const onDl = d => { dl = d }
  p.on('download', onDl)
  const n0 = await p.evaluate(() => window.__saved.length)
  await sheet.getByRole('button', { name: /\.xlsx$/ }).click(); await p.waitForTimeout(800)
  ok(!dl && (await p.evaluate(() => window.__saved.length)) === n0 && !(await sheet.getByText('Không tạo được file mẫu.').count()), 'bấm Huỷ ở hộp Lưu thành… ⇒ không tải, không báo lỗi')
  p.off('download', onDl)
  await p.evaluate(() => { window.showSaveFilePicker = undefined })
  const [d2] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), sheet.getByRole('button', { name: /\.xlsx$/ }).click()])
  ok(d2.suggestedFilename() === 'malcargo-mau-don-hang.xlsx', `trình duyệt không có hộp Lưu thành… ⇒ tải về ${d2.suggestedFilename()}`)
  ok(!errs.length, 'không lỗi trình duyệt' + (errs.length ? ': ' + errs.join(' | ') : ''))
  await ctx.close()
}

await b.close(); await srv.close()
console.log(bad ? `ĐỎ — ${bad} lỗi` : 'XANH')
process.exit(bad ? 1 : 0)
