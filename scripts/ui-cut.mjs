// Chữ bị cắt "…": mở mọi màn + tấm phủ ở 1440 / 390 / 360 px, tìm ô truncate / ellipsis mà chữ dài hơn ô,
// và trang tràn ngang. Chữ nội dung phải XUỐNG DÒNG, không cắt. Chạy: npm run build && node scripts/ui-cut.mjs
import { T, TP, TX, UI_LANG, launch, startPreview } from './ui-lib.mjs'
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const DEVS = [
  { name: 'pc', viewport: { width: 1440, height: 900 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'small', viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
]
const srv = await startPreview()
const b = await launch()
const found = new Map()
const scan = async (p, dev, where) => {
  const sw = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (sw > 0) { const k = `${where} :: [tràn ngang ${sw}px]`; if (!found.has(k)) found.set(k, new Set()); found.get(k).add(dev) }
  // nút trên thanh trên đè lên nhau (màn hẹp không đủ chỗ)
  const lap = await p.evaluate(() => {
    const h = document.querySelector('header'); if (!h) return null
    const rs = [...h.querySelectorAll('button, a')].map(e => [e.getAttribute('aria-label') || e.innerText, e.getBoundingClientRect()]).filter(([, r]) => r.width)
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const [a, r] = rs[i], [b, s] = rs[j]
      if (r.left < s.right - 1 && s.left < r.right - 1 && r.top < s.bottom - 1 && s.top < r.bottom - 1 && !r.width === false && !(r.left >= s.left && r.right <= s.right) && !(s.left >= r.left && s.right <= r.right)) return `${a} ↔ ${b}`
    }
    return null
  })
  if (lap) { const k = `${where} :: [nút đè nhau: ${lap}]`; if (!found.has(k)) found.set(k, new Set()); found.get(k).add(dev) }
  const cut = await p.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('body *')) {
      if (!el.childNodes.length || el.children.length > 3) continue
      const cs = getComputedStyle(el)
      if (cs.textOverflow !== 'ellipsis' && !/line-clamp/.test(el.className)) continue
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || cs.visibility === 'hidden') continue
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2) out.push((el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 70))
    }
    for (const el of document.querySelectorAll('input')) {
      const r = el.getBoundingClientRect(); if (!r.width) continue
      if (el.value && el.scrollWidth > el.clientWidth + 1) out.push('[ô nhập] ' + el.value.slice(0, 60))
    }
    return out
  })
  for (const t of cut) { const k = `${where} :: ${t}`; if (!found.has(k)) found.set(k, new Set()); found.get(k).add(dev) }
}
for (const dev of DEVS) {
  const p = await (await b.newContext(dev)).newPage()
  await p.goto(srv.base + '#/trip/sample-t1', { waitUntil: 'networkidle' }); await p.waitForTimeout(3500)
  await scan(p, dev.name, 'Bàn xếp xe')
  await p.getByRole('button', { name: new RegExp('^' + esc(TP('Kết quả: {head}. Bấm để xem chi tiết'))) }).click(); await p.waitForTimeout(200); await scan(p, dev.name, 'Khung tên mở'); await p.getByRole('button', { name: new RegExp('^' + esc(TP('Kết quả: {head}. Bấm để xem chi tiết'))) }).click()
  await p.getByRole('button', { name: T('Sửa {name}', { name: TX('Sữa 180ml x48') }) }).first().click().catch(() => {}); await p.waitForTimeout(200); await scan(p, dev.name, 'Popup sửa mã từ dòng hàng'); await p.keyboard.press('Escape'); await p.waitForTimeout(150)
  // bấm dòng hàng = chỉ mã đó trên xe (nhãn "đang chỉ" ở đáy bản vẽ); bấm lại để bỏ chọn
  await p.getByRole('button', { name: TX('Sữa 180ml x48'), exact: true }).first().click().catch(() => {}); await p.waitForTimeout(300); await scan(p, dev.name, 'Chọn mã trên xe'); await p.getByRole('button', { name: TX('Sữa 180ml x48'), exact: true }).first().click().catch(() => {})
  // popup bảng diễn giải (nút trên khung 3D) — bảng rộng kéo ngang được, không tính là tràn trang
  await p.getByRole('button', { name: T('Diễn giải'), exact: true }).click(); await p.waitForTimeout(400); await scan(p, dev.name, 'Diễn giải từng mã'); await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  await p.getByRole('button', { name: new RegExp(esc(T('Bảng đếm chân'))) }).click(); await p.waitForTimeout(300); await scan(p, dev.name, 'Bảng đếm chân')
  await p.evaluate(() => window.scrollTo(0, 0))
  await p.getByRole('button', { name: T('Đổi xe') }).click(); await p.waitForTimeout(500); await scan(p, dev.name, 'Bảng Thùng xe')
  // thông số thùng xe gấp sẵn — bấm dòng tóm tắt để mở ô sửa
  await p.getByRole('dialog', { name: T('Thùng xe') }).locator('button[aria-expanded="false"]').first().click(); await p.waitForTimeout(200); await scan(p, dev.name, 'Bảng Thùng xe · mở thông số'); await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  await p.getByRole('button', { name: new RegExp('^' + esc(TP('Chuyến đang mở: {name}. Bấm để xem các chuyến'))) }).click(); await p.waitForTimeout(200); await scan(p, dev.name, 'Chọn chuyến'); await p.keyboard.press('Escape')
  for (const [label, tabs] of [['Mã hàng', ['Của tôi', 'Mẫu chung']], ['Xe', ['Xe của tôi', 'Mẫu chung']], ['Đơn hàng', []], ['Các chuyến', []], ['Tài khoản & dữ liệu', []], ['Nhập từ Excel', []]]) {
    await p.getByRole('button', { name: T('Danh mục') }).click(); await p.waitForTimeout(200)
    await p.getByRole('menu').or(p.locator('body')).getByRole('button', { name: T(label), exact: true }).last().click(); await p.waitForTimeout(500)
    await scan(p, dev.name, label)
    for (const t of tabs) { const tb = p.locator('[role=dialog]').last().getByRole('button', { name: new RegExp('^' + esc(T(t))) }).or(p.locator('[role=dialog]').last().getByRole('tab', { name: new RegExp('^' + esc(T(t))) })); if (await tb.count()) { await tb.first().click(); await p.waitForTimeout(300); await scan(p, dev.name, `${label} · ${t}`) } }
    if (label === 'Mã hàng') { await p.locator('[role=dialog]').last().getByText(TX('Sữa chua chai 100ml x48')).first().click().catch(e => console.log('!', e.message.slice(0, 60))); await p.waitForTimeout(300); await scan(p, dev.name, 'Form mã hàng'); await p.keyboard.press('Escape'); await p.waitForTimeout(200) }
    if (label === 'Xe') { await p.locator('[role=dialog]').last().getByText(TX('Xe pallet 15 tấn')).first().click().catch(e => console.log('!', e.message.slice(0, 60))); await p.waitForTimeout(600); await scan(p, dev.name, 'Form xe'); await p.keyboard.press('Escape'); await p.waitForTimeout(200) }
    await p.keyboard.press('Escape'); await p.waitForTimeout(250)
  }
  await p.goto(srv.base + '#/order/sample-o2', { waitUntil: 'networkidle' }); await p.waitForTimeout(800); await scan(p, dev.name, 'Trang đơn')
  await p.close()
}
await b.close(); await srv.close()
const byText = new Map()
for (const [k, d] of found) { const [where, text] = k.split(' :: '); const e = byText.get(text) ?? { where: new Set(), dev: new Set() }; e.where.add(where); d.forEach(x => e.dev.add(x)); byText.set(text, e) }
const rows = [...found.entries()]
for (const [text, e] of [...byText].sort((a, b) => [...a[1].where][0].localeCompare([...b[1].where][0]))) console.log(`[${[...e.dev].join(',')}] ${text}   ←  ${[...e.where].slice(0, 3).join(' | ')}${e.where.size > 3 ? ' …' : ''}`)
console.log(rows.length ? `\n${rows.length} chỗ bị cắt / tràn ngang — chữ nội dung phải xuống dòng` : `XANH [${UI_LANG}] — không chữ nào bị cắt, không tràn ngang`)
process.exit(rows.length ? 1 : 0)
