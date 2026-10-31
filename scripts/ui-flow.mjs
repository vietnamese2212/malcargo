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

// Form Mã hàng chặn trùng mã + ô số đỏ (chữ / âm) — trước 31/10 vẫn Lưu được, số gõ sai bỏ âm thầm
{
  await p.evaluate(() => { location.hash = '#/items' }); await p.waitForTimeout(400)
  await p.getByRole('button', { name: 'Thêm mã', exact: true }).click()
  const sh = p.locator('[role=dialog]')
  await sh.getByPlaceholder('SP001').fill('sp01'); await sh.getByPlaceholder('Sữa 110ml x48').fill('Thùng trùng mã')
  await sh.getByPlaceholder('Dài').fill('500'); await sh.getByPlaceholder('Rộng').fill('400'); await sh.getByPlaceholder('Cao').fill('300')
  await sh.getByRole('button', { name: 'Lưu', exact: true }).click(); await p.waitForTimeout(300)
  const dupMsg = await sh.getByText('Mã sp01 đã có, đặt mã khác.').isVisible()
  await sh.getByPlaceholder('SP001').fill('SP02')
  await sh.getByPlaceholder('—').fill('abc')   // thùng/pallet
  await sh.getByRole('button', { name: 'Lưu', exact: true }).click(); await p.waitForTimeout(300)
  const badMsg = await sh.getByText('Còn ô số gõ sai (viền đỏ), sửa lại hoặc xoá trống.').isVisible()
  const codes = await p.evaluate(() => JSON.parse(localStorage.getItem('malcargo-data-v1')).state.items.map(i => i.code))
  ok(dupMsg && badMsg && !codes.includes('SP02') && codes.filter(c => c.toLowerCase() === 'sp01').length === 1,
    `form Mã hàng: trùng mã ⇒ báo (${dupMsg}), ô số đỏ ⇒ không lưu (${badMsg}); mã đang có: ${codes.join(', ')}`)
  await sh.getByRole('button', { name: 'Huỷ' }).click(); await p.waitForTimeout(300)
}

// Chuyến mới chưa có xe: app tự chọn xe theo số GÕ XONG, không theo phím đầu (thử 31/10: gõ "1200" ⇒ xe 1,5 tấn, tải 788%)
{
  const q = await (await b.newContext(DEVICES[1])).newPage()
  await q.goto(srv.base + '#/trip/sample-t1', { waitUntil: 'networkidle' }); await q.waitForTimeout(1000)
  await q.getByRole('button', { name: 'Chuyến mới' }).click(); await q.waitForTimeout(800)
  await q.getByRole('button', { name: 'Thêm hàng' }).first().click(); await q.waitForTimeout(400)
  await q.locator('[role=dialog]').getByText('Sữa 180ml x48').first().click()
  await q.getByRole('button', { name: /Xong/ }).click(); await q.waitForTimeout(400)
  await q.locator('input[inputmode=numeric]').first().pressSequentially('1200', { delay: 250 }); await q.waitForTimeout(4500)
  const veh = await q.locator('text=/Xe tải [0-9,]+ tấn/').first().textContent().catch(() => '')
  ok(/15 tấn/.test(veh ?? ''), `chuyến mới gõ từng phím "1200" ⇒ xe tự chọn: ${veh} (phải là xe 15 tấn)`)
  await q.close()
}

// Chuyến nằm TRÊN thanh navy (chủ dự án 31/10: "đưa chuyến xe lên trên — để ở dưới chiếm không gian quá"): tên dài một
// dòng "…", thanh không cao thêm, khung 3D ngay dưới thanh; bấm ▾ ⇒ đầu bảng ghi tên đầy đủ + Đổi tên, bảng không tràn mép
// 360px; đang đổi tên mà chạm ra ngoài (bảng đóng trước khi ô kịp rời) ⇒ vẫn lưu; cuộn trang chuyến vẫn ở trên đầu
{
  const q = await (await b.newContext({ ...DEVICES[1], viewport: { width: 360, height: 760 } })).newPage()
  await q.goto(srv.base + '#/trip/sample-t2', { waitUntil: 'networkidle' }); await q.waitForTimeout(1200)
  const long = 'Chuyến giao Hà Nội – Hải Phòng – Quảng Ninh sáng thứ Hai tuần sau, xe anh Tuấn'   // ≤ 80 ký tự (ô tên)
  const open = () => q.getByRole('button', { name: /^Chuyến đang mở/ }).click()
  await open(); await q.waitForTimeout(300)
  await q.getByRole('button', { name: 'Đổi tên chuyến này' }).click()
  await q.getByLabel('Tên chuyến').fill(long); await q.getByLabel('Tên chuyến').press('Enter'); await q.waitForTimeout(1500)
  const pop = q.locator('[data-popover]')
  const full = await pop.getByText(long).first().isVisible()
  const pb = await pop.boundingBox()
  await q.screenshot({ path: `${OUT}/flow-longname-360.png` })
  const hd = await q.locator('header').evaluate(e => Math.round(e.getBoundingClientRect().height))
  const sc = await q.locator('[data-scene]').evaluate(e => Math.round(e.getBoundingClientRect().top))
  ok(hd === 48 && sc === 48 && full && pb.x >= 0 && pb.x + pb.width <= 360,
    `chuyến trên thanh: thanh cao ${hd}px, khung 3D từ ${sc}px; tên dài ⇒ đầu bảng ▾ ghi đủ: ${full}; bảng ${Math.round(pb.x)}–${Math.round(pb.x + pb.width)}px`)
  await q.getByRole('button', { name: 'Đổi tên chuyến này' }).click()
  await q.getByLabel('Tên chuyến').fill('Chuyến đổi tên dở'); await q.touchscreen.tap(180, 600); await q.waitForTimeout(800)
  const names = await q.evaluate(() => JSON.parse(localStorage.getItem('malcargo-data-v1')).state.trips.map(t => t.name))
  const closed = !(await pop.count())
  await q.evaluate(() => window.scrollTo(0, 900)); await q.waitForTimeout(300)
  const top = await q.getByRole('button', { name: /^Chuyến đang mở/ }).evaluate(e => Math.round(e.getBoundingClientRect().top))
  ok(closed && names.includes('Chuyến đổi tên dở') && top >= 0 && top < 48,
    `đang đổi tên chạm ra ngoài ⇒ bảng đóng (${closed}), tên vẫn lưu (${names.includes('Chuyến đổi tên dở')}); cuộn trang ⇒ ô chuyến vẫn ở đầu (${top}px)`)
  await q.close()
}

// Nút "Sửa đơn" trên dải thông số xe (chủ dự án 31/10: "gần nút thay đổi thông tin xe"): một đơn ⇒ mở luôn tấm Sửa đơn;
// nhiều đơn ⇒ chọn đơn trước, tấm mở đúng đơn đã chọn
{
  const q = await (await b.newContext(DEVICES[0])).newPage()
  await q.goto(srv.base + '#/trip/sample-t1', { waitUntil: 'networkidle' }); await q.waitForTimeout(1500)
  const edit = q.getByRole('button', { name: 'Sửa đơn', exact: true })
  await edit.click(); await q.waitForTimeout(400)
  const one = await q.locator('[role=dialog]').getByRole('textbox').first().inputValue()
  await q.keyboard.press('Escape'); await q.waitForTimeout(300)
  await q.getByRole('button', { name: 'Thêm đơn / điểm giao khác' }).click(); await q.waitForTimeout(400)
  await q.locator('[role=dialog]').getByRole('button', { name: /^Đơn mẫu 40ft/ }).click()
  await q.getByRole('button', { name: /^Thêm 1 đơn/ }).click(); await q.waitForTimeout(1500)
  await edit.click(); await q.waitForTimeout(300)
  const rows = q.locator('[data-popover] button')
  const n = await rows.count()
  const second = (await rows.nth(1).locator('span.block').first().textContent())?.trim()
  await q.screenshot({ path: `${OUT}/flow-order-edit.png` })
  await rows.nth(1).click(); await q.waitForTimeout(400)
  const got = await q.locator('[role=dialog]').getByRole('textbox').first().inputValue()
  ok(one === 'Đơn mẫu pallet' && n === 2 && !!second && got === second,
    `nút Sửa đơn: một đơn ⇒ mở "${one}"; hai đơn ⇒ chọn (${n} dòng), chọn "${second}" ⇒ tấm mở "${got}"`)
  await q.close()
}

// Menu ≡ có "Tải app Android (APK)" — CHỈ máy Android (chủ dự án 31/10); iPhone / máy tính không thấy; tải về đúng file
{
  const UA = {
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  }
  const seen = {}
  for (const [k, dev] of [['android', { ...DEVICES[1], userAgent: UA.android }], ['iphone', { ...DEVICES[1], userAgent: UA.iphone }], ['pc', DEVICES[0]]]) {
    const q = await (await b.newContext({ ...dev, acceptDownloads: true })).newPage()
    await q.goto(srv.base + '#/trip/sample-t1', { waitUntil: 'networkidle' }); await q.waitForTimeout(800)
    await q.getByRole('button', { name: 'Danh mục' }).click(); await q.waitForTimeout(300)
    const link = q.locator('[data-popover]').getByRole('link', { name: 'Tải app Android (APK)' })
    seen[k] = await link.count()
    if (k === 'android' && seen[k]) {
      const [dl] = await Promise.all([q.waitForEvent('download'), link.click()])
      const size = (await import('node:fs')).statSync(await dl.path()).size
      seen.file = `${dl.suggestedFilename()} ${Math.round(size / 1024)} KB`
    }
    await q.close()
  }
  ok(seen.android === 1 && !seen.iphone && !seen.pc && /^MAL-Cargo\.apk \d{3,} KB$/.test(seen.file ?? ''),
    `menu tải APK: Android ${seen.android} · iPhone ${seen.iphone} · máy tính ${seen.pc}; tải về: ${seen.file}`)
}

// Hai tab cùng máy: tab kia lưu ⇒ tab này nạp lại, không ghi đè mất (thử 31/10: thêm mã ở tab A, sửa số ở tab B ⇒ mã của A mất)
{
  const c = await b.newContext(DEVICES[0])
  const A = await c.newPage(), B = await c.newPage()
  await A.goto(srv.base + '#/items', { waitUntil: 'networkidle' })
  await B.goto(srv.base + '#/trip/sample-t2', { waitUntil: 'networkidle' }); await B.waitForTimeout(1500)
  await A.getByRole('button', { name: 'Thêm mã', exact: true }).click()
  await A.getByPlaceholder('SP001').fill('TABA'); await A.getByPlaceholder('Sữa 110ml x48').fill('Mã tab A')
  await A.getByPlaceholder('Dài').fill('500'); await A.getByPlaceholder('Rộng').fill('400'); await A.getByPlaceholder('Cao').fill('300')
  await A.getByRole('button', { name: 'Lưu', exact: true }).click(); await A.waitForTimeout(500)
  await B.locator('input[inputmode=numeric]').first().fill('1000'); await B.waitForTimeout(800)
  await A.reload({ waitUntil: 'networkidle' }); await A.waitForTimeout(500)
  const codes = await A.evaluate(() => JSON.parse(localStorage.getItem('malcargo-data-v1')).state.items.map(i => i.code))
  ok(codes.includes('TABA'), `hai tab: sửa số ở tab B không xoá mã vừa thêm ở tab A (mã: ${codes.join(', ')})`)
  await c.close()
}

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
// Lỗi trên chỉ hiện khi phím rơi đúng một nhịp (bản thật 30/10: 1/3 lượt "tách 2 chuyến, lưu 7175") — soi thẳng nhịp đó:
// sau phím đầu, ô số thùng KHÔNG được nháy lại số của đơn mẫu (740 → 74 → 740 → 74 là màn vừa đọc lại đơn mẫu)
for (const [hash, label] of [['#/trip/sample-t1', 'chuyến mẫu'], ['#/order/sample-o1?back=trip:sample-t1', 'trang đơn mẫu']]) {
  const c = await b.newContext(DEVICES[1])
  await c.addInitScript(() => {
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
    window.__vals = []
    Object.defineProperty(HTMLInputElement.prototype, 'value', {
      get() { return d.get.call(this) },
      set(v) { if (this === document.querySelector('input[inputmode=numeric]')) window.__vals.push(String(v)); d.set.call(this, v) },
    })
  })
  const q = await c.newPage()
  await q.goto(srv.base + hash, { waitUntil: 'networkidle' }); await q.waitForTimeout(1200)
  const box = q.locator('input[inputmode=numeric]').first()
  const was = await box.inputValue()
  await box.click(); await box.press('End')
  await q.evaluate(() => { window.__vals = [] })
  await box.press('Backspace'); await q.waitForTimeout(500)
  const vals = await q.evaluate(() => window.__vals)
  ok(!vals.includes(was), `${label}: phím đầu tách chuyến, ô không nháy lại số mẫu ${was} (${vals.join(' → ') || 'không gán lại'})`)
  await c.close()
}

// Nút Back của máy (Android / app cài) đóng tấm đang mở TRÊN CÙNG, không rời màn (thử 31/10: đang mở danh mục mà Back ⇒
// thoát hẳn app). Đóng bằng nút thì mục lịch sử của tấm tự lùi; tách chuyến mẫu lúc đang mở tấm ⇒ đóng xong vẫn ở chuyến mới.
{
  const q = await (await b.newContext(DEVICES[1])).newPage()
  await q.goto(srv.base + '#/trip/sample-t1', { waitUntil: 'networkidle' }); await q.waitForTimeout(1200)
  const dialogs = () => q.locator('[role=dialog]').count()
  const back = async () => { await q.evaluate(() => history.back()); await q.waitForTimeout(500) }
  await q.getByRole('button', { name: 'Danh mục' }).click(); await q.waitForTimeout(200)
  await q.locator('[data-popover]').getByRole('button', { name: 'Mã hàng', exact: true }).click(); await q.waitForTimeout(400)
  await q.getByRole('button', { name: 'Thêm mã', exact: true }).click(); await q.waitForTimeout(400)
  const two = await dialogs()
  await back(); const one = await dialogs()
  await back(); const zero = await dialogs()
  ok(two === 2 && one === 1 && zero === 0 && q.url().endsWith('#/trip/sample-t1'), `Back: đóng tấm Thêm mã (${two} → ${one}) rồi danh mục (→ ${zero}), vẫn ở chuyến mẫu`)
  // đóng bằng nút: lịch sử về đúng như trước khi mở (không còn mục "tấm" phải Back suông)
  await q.getByRole('button', { name: 'Danh mục' }).click(); await q.waitForTimeout(200)
  await q.locator('[data-popover]').getByRole('button', { name: 'Mã hàng', exact: true }).click(); await q.waitForTimeout(400)
  await q.locator('[role=dialog]').getByRole('button', { name: 'Đóng' }).first().click(); await q.waitForTimeout(500)
  const st = await q.evaluate(() => history.state?.overlay ?? null)
  ok(!(await dialogs()) && !st, `đóng danh mục bằng nút ⇒ lịch sử không còn mục của tấm (${st})`)
  // tách chuyến mẫu lúc đang mở tấm (Sửa mã ở dòng hàng → Lưu thành mã của tôi) ⇒ đóng tấm vẫn ở chuyến MỚI, không về mẫu
  await q.getByRole('button', { name: 'Sửa Sữa 180ml x48' }).first().click(); await q.waitForTimeout(400)
  await q.locator('[role=dialog]').getByPlaceholder('0', { exact: true }).fill('10')
  await q.getByRole('button', { name: 'Lưu thành mã của tôi' }).click(); await q.waitForTimeout(1200)
  const head = await q.locator('h1').innerText()
  ok(!q.url().includes('sample-t1') && !(await dialogs()) && !/Mẫu pallet/.test(head), `tách chuyến khi đang mở tấm ⇒ đóng xong ở chuyến mới (${q.url().split('#')[1]}, "${head.replace(/\s+/g, ' ')}")`)
  await q.close()
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

// Hướng dẫn nhanh cho người mới (chủ dự án 31/10: "mở lên lần đầu, có thể skip"): lần đầu tự mở; Bỏ qua ⇒ tải lại không
// mở nữa; menu ≡ "Hướng dẫn nhanh" mở lại; mỗi bước vùng sáng nằm trên đúng chỗ, thẻ chữ trọn trong màn; Back đóng
for (const dev of [DEVICES[0], DEVICES[1], { ...DEVICES[1], name: 'small', viewport: { width: 360, height: 640 } }]) {
  const q = await (await b.newContext({ ...dev, freshTour: true })).newPage()
  const e2 = watchErrors(q)
  await q.goto(srv.base + '#/trip/sample-t1', { waitUntil: 'networkidle' }); await q.waitForTimeout(2000)
  const card = q.locator('[data-tour-card]')
  const auto = await card.isVisible()
  await card.getByRole('button', { name: 'Bỏ qua' }).click(); await q.waitForTimeout(300)
  const gone = !(await card.count())
  await q.reload({ waitUntil: 'networkidle' }); await q.waitForTimeout(2000)
  ok(auto && gone && !(await card.count()), `${dev.name}: lần đầu tự mở hướng dẫn (${auto}), Bỏ qua ⇒ đóng (${gone}), tải lại không mở nữa`)
  const menu = async () => { await q.getByRole('button', { name: 'Danh mục' }).click(); await q.waitForTimeout(200); await q.locator('[data-popover]').getByRole('button', { name: 'Hướng dẫn nhanh' }).click(); await q.waitForTimeout(500) }
  await menu()
  const bad = [], seen = []
  for (let i = 0; i < 10 && await card.count(); i++) {
    await q.waitForTimeout(500)
    const s = await q.evaluate(() => {
      const c = document.querySelector('[data-tour-card]'), cr = c.getBoundingClientRect(), target = c.dataset.tourStep
      const ring = document.querySelector('[data-tour-ring]')?.getBoundingClientRect()
      const tr = target && document.querySelector(`[data-tour="${target}"]`)?.getBoundingClientRect()
      const inView = cr.left >= 0 && cr.top >= 0 && cr.right <= innerWidth && cr.bottom <= innerHeight
      const cx = ring && (ring.left + ring.right) / 2, cy = ring && (ring.top + ring.bottom) / 2
      const onTarget = !target || (!!tr && !!ring && cx >= tr.left && cx <= tr.right && cy >= tr.top && cy <= tr.bottom && cy > 0 && cy < innerHeight)
      return { target: target || 'chào', title: document.querySelector('#tour-title').textContent, inView, onTarget }
    })
    seen.push(s.target)
    if (!s.inView || !s.onTarget) bad.push(`${s.target} (thẻ trong màn ${s.inView}, vùng sáng đúng chỗ ${s.onTarget})`)
    if (dev.name !== 'pc') await q.screenshot({ path: `${OUT}/flow-tour-${dev.name}-${i}.jpg`, type: 'jpeg', quality: 70 })
    const last = await card.getByRole('button', { name: 'Xong' }).count()
    await card.getByRole('button', { name: last ? 'Xong' : i === 0 ? 'Xem nhanh' : 'Tiếp', exact: true }).click()
  }
  ok(!bad.length && seen.length === 7 && !(await card.count()), `${dev.name}: hướng dẫn đủ ${seen.length} bước (${seen.join(' → ')})${bad.length ? ' — lệch: ' + bad.join('; ') : ''}, Xong ⇒ đóng`)
  await menu()
  const url = q.url()
  await q.goBack(); await q.waitForTimeout(500)
  ok(!(await card.count()) && q.url() === url && !e2.length, `${dev.name}: nút Back đóng hướng dẫn, vẫn ở bàn xếp xe${e2.length ? ' — lỗi: ' + e2[0] : ''}`)
  await q.close()
}

await b.close(); await srv.close()
console.log(fail ? `${fail} phép HỎNG` : 'XANH')
process.exit(fail ? 1 : 0)
