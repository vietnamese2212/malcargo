// Nút nào cũng CHẠM ĐƯỢC (chủ dự án 30/10: "có nút không chạm được"): ở mỗi màn / bảng thả / tấm, lấy mọi nút,
// link, ô nhập đang hiện, cuộn tới rồi hỏi trình duyệt điểm giữa nút đang trúng cái gì — trúng vật khác (khung dính,
// vùng chạm vô hình 44px của nút bên cạnh, lớp phủ, khung pointer-events-none…) là lỗi. Máy cảm ứng còn đo cỡ vùng
// chạm (< 40px là nhỏ). 1440 chuột · 390 / 360 cảm ứng. Chạy sau `npm run build`: node scripts/ui-tap.mjs
import { DEVICES, T, TP, TX, UI_LANG, launch, startPreview, watchErrors } from './ui-lib.mjs'
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const DEVS = [DEVICES[0], DEVICES[1], { ...DEVICES[1], name: 'small', viewport: { width: 360, height: 760 } }]
const OVER = '[role=dialog],[role=alertdialog],[data-popover]'

// chạy trong trang: mọi thứ bấm được trong `scope` (null = trang, trừ tấm / bảng đang mở) — trả về chỗ bị che + chỗ nhỏ
async function probe(scope, OVER) {
  const all = scope ? [...document.querySelectorAll(scope)] : [document.body]
  const root = all[all.length - 1]
  if (!root) return { bad: [`(không thấy ${scope})`], small: [] }
  const coarse = matchMedia('(pointer: coarse)').matches
  const name = el => (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 48)
  const tag = el => `<${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}>`
  const els = [...root.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=switch], [role=tab]')].filter(el => {
    if (!scope && el.closest(OVER)) return false
    if (el.disabled || el.closest('[aria-hidden=true]')) return false
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') return false
    const r = el.getBoundingClientRect()
    return r.width > 4 && r.height > 4
  })
  const okHit = (el, h) => h && (el === h || el.contains(h) || !!h.closest('label')?.contains(el))
  const bad = [], small = []
  for (const el of els) {
    let cover = null
    // cuộn tới: giữa màn, đáy, đầu (điện thoại: khung 3D dính che nửa trên — hàng bên dưới chỉ thấy ở nửa dưới).
    // Cuộn tức thì + đo ngay: trình duyệt tự dàn lại trang (cả khung dính) khi hỏi vị trí — không cần chờ khung hình
    for (const block of ['nearest', 'center', 'end', 'start']) {
      el.scrollIntoView({ block, inline: 'nearest', behavior: 'instant' })
      const r = el.getBoundingClientRect()
      const x = r.left + r.width / 2, y = r.top + r.height / 2
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) { cover = 'nằm ngoài màn'; continue }
      const h = document.elementFromPoint(x, y)
      if (okHit(el, h)) { cover = null; break }
      cover = h ? `${name(h)} ${tag(h)}` : 'không trúng gì'
    }
    if (cover) bad.push(`${name(el)} ${tag(el)}  ←  ${cover}`)
    else if (coarse) {
      // vùng chạm thật: chính nút, vùng vô hình của lớp `hit` (≥ 44px), hoặc nhãn bọc ô tick
      const r = el.getBoundingClientRect()
      let w = r.width, h = r.height
      if (el.matches('.hit')) { w = Math.max(w, 44); h = Math.max(h, 44) }
      const lb = el.closest('label')?.getBoundingClientRect()
      if (lb) { w = Math.max(w, lb.width); h = Math.max(h, lb.height) }
      if (Math.min(w, h) < 40) small.push(`${name(el)} ${tag(el)}  ${Math.round(r.width)}×${Math.round(r.height)}`)
    }
  }
  window.scrollTo(0, 0)
  return { bad, small }
}

const btn = (p, name, exact = true) => p.getByRole('button', typeof name === 'string' ? { name, exact } : { name })
const starts = vi => new RegExp('^' + esc(TP(vi)))
const menu = label => async p => {
  await btn(p, T('Danh mục')).click(); await p.waitForTimeout(200)
  await p.locator('[data-popover]').getByRole('button', { name: T(label), exact: true }).click(); await p.waitForTimeout(500)
}
// [tên, mở, phạm vi soi, đóng]
const STATES = [
  ['Bàn xếp xe', null, null],
  ['Kết quả mở', p => btn(p, starts('Kết quả: {head}. Bấm để xem chi tiết')).click(), null, p => btn(p, starts('Kết quả: {head}. Bấm để xem chi tiết')).click()],
  ['Bảng đếm chân', p => btn(p, new RegExp(esc(T('Bảng đếm chân')))).click(), null, p => btn(p, new RegExp(esc(T('Bảng đếm chân')))).click()],
  ['Danh sách chuyến', p => btn(p, starts('Chuyến đang mở: {name}. Bấm để xem các chuyến')).click(), '[data-popover]'],
  ['Danh sách xe', p => btn(p, T('Đổi xe')).click(), '[data-popover]'],
  ['Góc nhìn', p => btn(p, starts('Góc nhìn: {view}')).click(), '[data-popover]'],
  ['Danh mục', p => btn(p, T('Danh mục')).click(), '[data-popover]'],
  ['Tuỳ chọn đơn', p => btn(p, starts('Tuỳ chọn {name}')).first().click(), '[data-popover]'],
  ['Đổi tên chuyến', p => btn(p, T('Đổi tên chuyến này')).click(), null],
  ['Toàn màn hình', p => btn(p, T('Toàn màn hình')).click(), '[data-scene]', p => btn(p, T('Thoát toàn màn hình')).click()],
  ['Sửa đơn', p => btn(p, starts('Sửa đơn {name}')).first().click(), '[role=dialog]'],
  ['Sửa mã', p => btn(p, T('Sửa {name}', { name: TX('Sữa 180ml x48') })).first().click(), '[role=dialog]'],
  ['Thùng xe', async p => { await btn(p, T('Đổi xe')).click(); await p.waitForTimeout(400); await p.locator('[data-popover]').getByRole('button', { name: T('Chỉnh thông số thùng xe') }).click() }, '[role=dialog]'],
  ['Sửa xe', async p => { await btn(p, T('Đổi xe')).click(); await p.waitForTimeout(400); await p.locator('[data-popover]').getByRole('button', { name: T('Sửa {name}', { name: TX('Xe pallet 15 tấn') }) }).click() }, '[role=dialog]'],
  ['Cài đặt pallet', p => btn(p, T('Cài đặt pallet')).click(), '[role=dialog]'],
  ['Diễn giải', p => btn(p, T('Diễn giải')).click(), '[role=dialog]'],
  ['Thêm hàng (chọn mã)', p => btn(p, T('Thêm hàng')).first().click(), '[role=dialog]'],
  ['Thêm đơn', p => btn(p, T('Thêm đơn / điểm giao khác')).click(), '[role=dialog]'],
  ['Mã hàng', menu('Mã hàng'), '[role=dialog]'],
  ['Xe', menu('Xe'), '[role=dialog]'],
  ['Đơn hàng', menu('Đơn hàng'), '[role=dialog]'],
  ['Các chuyến', menu('Các chuyến'), '[role=dialog]'],
  ['Tài khoản', menu('Tài khoản & dữ liệu'), '[role=dialog]'],
  ['Nhập từ Excel', menu('Nhập từ Excel'), '[role=dialog]', null, 'pc'],
]
const srv = await startPreview(4188)
const b = await launch()
const bad = new Map(), small = new Map()
const add = (m, k, dev) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(dev) }
let n = 0
for (const dev of DEVS) {
  const p = await (await b.newContext(dev)).newPage()
  const errs = watchErrors(p)
  for (const trip of ['sample-t1', 'sample-t2']) {
    for (const [what, open, scope, close, only] of STATES) {
      if (only && only !== dev.name) continue
      if (trip === 'sample-t2' && !['Bàn xếp xe', 'Kết quả mở', 'Diễn giải', 'Danh sách xe'].includes(what)) continue
      // nạp lại trang mỗi lần (thêm ?n= — cùng địa chỉ thì trình duyệt không nạp lại, tấm còn mở từ lần trước)
      await p.goto(srv.base + `?n=${++n}#/trip/${trip}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
      p.setDefaultTimeout(8000)
      try {
        if (open) { await open(p); await p.waitForTimeout(500) }
        const r = await p.evaluate(([s, o]) => (0, eval)(`(${o})`)(s, '[role=dialog],[role=alertdialog],[data-popover]'), [scope, probe.toString()])
        const where = `${trip === 'sample-t1' ? 'Mẫu pallet' : 'Mẫu 40ft'} · ${what}`
        if (process.argv.includes('-v')) console.log(dev.name, where, r.bad.length, r.small.length)
        r.bad.forEach(x => add(bad, `${where} :: ${x}`, dev.name))
        r.small.forEach(x => add(small, `${where} :: ${x}`, dev.name))
        if (close) await close(p).catch(() => {})
      } catch (e) { add(bad, `${trip} · ${what} :: (không mở được: ${e.message.split('\n')[0].slice(0, 90)})`, dev.name) }
    }
  }
  if (errs.length) add(bad, `lỗi trình duyệt :: ${errs[0].slice(0, 120)}`, dev.name)
  await p.close()
}
await b.close(); await srv.close()
for (const [k, d] of small) console.log(`  · nhỏ [${[...d].join(',')}] ${k}`)
for (const [k, d] of bad) console.log(`  ✗ [${[...d].join(',')}] ${k}`)
console.log(bad.size ? `\n${bad.size} nút bị che / không chạm được` : `XANH [${UI_LANG}] — mọi nút đều chạm được (${small.size} chỗ vùng chạm < 40px)`)
process.exit(bad.size ? 1 : 0)
