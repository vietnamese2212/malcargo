// Chọn nhiều để xoá ở Mã hàng / Xe / Đơn hàng: tick 2 dòng → thanh "Đã chọn 2/3" → Xoá → xác nhận → còn 1.
// + điện thoại: chạm ra ngoài menu chỉ đóng menu (không bấm xuyên); đang gõ mà chạm ra ngoài tấm sửa thì chỉ cất bàn phím.
// Chạy sau `npm run build`: node scripts/ui-bulk.mjs
import { DEVICES, OUT, T, launch, startPreview, watchErrors } from './ui-lib.mjs'
const srv = await startPreview(4183)
const b = await launch()
const now = Date.now()
const item = (id, code, name) => ({ id, owner: 'me', code, name, l: 400, w: 300, h: 200, kg: 8, perPallet: null, maxLayers: null, light: false, updatedAt: now })
const veh = (id, name) => ({ id, owner: 'me', name, plate: '', kind: 'loose', l: 5000, w: 2000, h: 2000, payloadKg: 5000, updatedAt: now })
const ord = (id, name, itemId) => ({ id, name, place: '', lines: [{ itemId, qty: 10 }], updatedAt: now })
const seed = {
  state: {
    items: [item('t-i1', 'A1', 'Hàng thử 1'), item('t-i2', 'A2', 'Hàng thử 2'), item('t-i3', 'A3', 'Hàng thử 3')],
    vehicles: [veh('t-v1', 'Xe thử 1'), veh('t-v2', 'Xe thử 2'), veh('t-v3', 'Xe thử 3')],
    orders: [ord('t-o1', 'Đơn thử 1', 't-i1'), ord('t-o2', 'Đơn thử 2', 't-i2'), ord('t-o3', 'Đơn thử 3', 't-i3')],
    trips: [], pallet: { l: 1200, w: 1000, maxH: 1650, baseH: 150, kg: 25 },
  }, version: 0,
}
let bad = 0
const ok = (c, msg) => { console.log(c ? '  ✓' : '  ✗', msg); if (!c) bad++ }
const tripCount = p => p.evaluate(() => JSON.parse(localStorage.getItem('malcargo-data-v1')).state.trips.length)
const openPanel = async (p, menu) => {
  await p.getByRole('button', { name: T('Danh mục') }).click(); await p.waitForTimeout(200)
  await p.getByRole('menu').or(p.locator('body')).getByRole('button', { name: T(menu), exact: true }).last().click(); await p.waitForTimeout(400)
  return p.getByRole('dialog').last()
}
for (const dev of [DEVICES[0], { ...DEVICES[1], name: 'small', viewport: { width: 360, height: 760 } }]) {
  console.log(dev.name)
  const ctx = await b.newContext(dev)
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('malcargo-data-v1', JSON.stringify(s)); sessionStorage.setItem('seeded', '1') } }, seed)
  const p = await ctx.newPage()
  const errs = watchErrors(p)
  await p.goto(srv.base + '#/trip/sample-t1', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)

  // điện thoại: đang gõ trong tấm sửa mà chạm ra ngoài ⇒ chỉ cất bàn phím, tấm vẫn mở; chạm lần nữa mới đóng
  if (dev.hasTouch) {
    const dlg = await openPanel(p, 'Mã hàng')
    await dlg.getByText('Hàng thử 3', { exact: true }).tap(); await p.waitForTimeout(300)
    const sheet = p.locator('[data-sheet]')
    await sheet.getByRole('textbox').nth(1).tap(); await p.keyboard.type(' sửa'); await p.waitForTimeout(100)
    await p.touchscreen.tap(dev.viewport.width / 2, 15); await p.waitForTimeout(200)
    const typing = await p.evaluate(() => ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? ''))
    ok(await sheet.isVisible() && !typing && (await sheet.getByRole('textbox').nth(1).inputValue()).endsWith(' sửa'), 'đang gõ, chạm ra ngoài ⇒ cất bàn phím, tấm sửa vẫn mở, chữ còn nguyên')
    await p.touchscreen.tap(dev.viewport.width / 2, 15); await p.waitForTimeout(200)
    ok(!(await sheet.count()), 'chạm ra ngoài lần nữa ⇒ đóng tấm sửa')
    await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  }

  for (const [menu, names, tab] of [['Mã hàng', ['Hàng thử 1', 'Hàng thử 2', 'Hàng thử 3'], 'Của tôi'], ['Xe', ['Xe thử 1', 'Xe thử 2', 'Xe thử 3'], 'Xe của tôi'], ['Đơn hàng', ['Đơn thử 1', 'Đơn thử 2', 'Đơn thử 3'], null]]) {
    const dlg = await openPanel(p, menu)
    if (tab) await dlg.getByRole('button', { name: new RegExp('^' + T(tab)) }).click(); await p.waitForTimeout(200)
    for (const n of names.slice(0, 2)) await dlg.getByRole('checkbox', { name: T('Chọn {name}', { name: n }) }).check()
    const bar = dlg.getByText(T('Đã chọn {n}/{total}', { n: 2, total: 3 }))
    ok(await bar.isVisible(), `${menu}: tick 2 dòng ⇒ thanh "Đã chọn 2/3"`)
    ok(!(await p.locator('[data-sheet]').count()) && (await p.getByRole('dialog').count()) === 1, `${menu}: tick không mở dòng`)
    await p.screenshot({ path: `${OUT}/bulk-${['items', 'vehicles', 'orders'][['Mã hàng', 'Xe', 'Đơn hàng'].indexOf(menu)]}-${dev.name}.png` })
    await dlg.getByRole('button', { name: T('Xoá {n}', { n: 2 }) }).click(); await p.waitForTimeout(200)
    const conf = p.getByRole('alertdialog')
    console.log('    hỏi:', (await conf.innerText()).replace(/\s+/g, ' '))
    await conf.getByRole('button', { name: T('Xoá'), exact: true }).click(); await p.waitForTimeout(300)
    const left = await Promise.all(names.map(n => dlg.getByText(n, { exact: true }).count()))
    ok(left.join() === '0,0,1', `${menu}: xoá xong còn đúng dòng 3 (${left.join()})`)
    ok(!(await bar.isVisible()), `${menu}: thanh chọn biến mất`)
    await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  }

  // điện thoại: menu đang mở, chạm ra ngoài chỉ đóng menu, không bấm trúng nút "Chuyến mới" nằm dưới ngón tay
  if (dev.hasTouch) {
    const trips0 = await tripCount(p)
    await p.getByRole('button', { name: T('Danh mục') }).tap(); await p.waitForTimeout(200)
    await p.getByRole('button', { name: T('Chuyến mới'), exact: true }).tap(); await p.waitForTimeout(400)
    const trips1 = await tripCount(p)
    const menuOpen = await p.getByRole('button', { name: T('Danh mục') }).getAttribute('aria-expanded')
    ok(trips1 === trips0 && menuOpen === 'false', `chạm "Chuyến mới" khi menu đang mở ⇒ chỉ đóng menu (chuyến ${trips0} → ${trips1}, menu mở: ${menuOpen})`)
    await p.getByRole('button', { name: T('Chuyến mới'), exact: true }).tap(); await p.waitForTimeout(400)
    const trips2 = await tripCount(p)
    ok(trips2 === trips0 + 1, `chạm lần nữa (menu đã đóng) ⇒ tạo chuyến như thường (${trips0} → ${trips2})`)
  }
  ok(!errs.length, 'không lỗi trình duyệt' + (errs.length ? ': ' + errs.join(' | ') : ''))
  await ctx.close()
}
await b.close(); await srv.close()
console.log(bad ? `ĐỎ — ${bad} lỗi` : 'XANH')
process.exit(bad ? 1 : 0)
