// KÉO / TRƯỢT / CHE trên máy cảm ứng (chủ dự án 01/11: "bấm Login thấy bị trượt, không kéo được xuống" — bảng Login
// gắn vào thanh trên dính, màn thấp thì đáy bảng khuất mà vuốt chỉ làm trang phía sau trôi). Ở mỗi màn / bảng thả / tấm
// (STATES của ui-states.mjs), trên màn THẤP (máy nhỏ, xoay ngang — chỗ ui-tap 390 / 360 dọc không thấy):
//  1. mọi chữ + nút cuộn tới được: nằm trọn trong màn, điểm giữa không bị vật khác đè (khung dính, bảng, lớp phủ)
//  2. vuốt trên bảng / tấm đang mở: trang phía sau KHÔNG trôi, bảng không tự đóng
//  3. khung nào nội dung dài hơn khung: vuốt là cuộn được
// Chạm thật qua sự kiện chạm (CDP) — giống ngón tay hơn lệnh cuộn. Chạy sau `npm run build`: node scripts/ui-scroll.mjs
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { OUT, UI_LANG, launch, startPreview, watchErrors } from './ui-lib.mjs'
import { STATES, T2_STATES } from './ui-states.mjs'
const touch = { deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const DEVS = [
  { name: '360×640', viewport: { width: 360, height: 640 }, ...touch },
  { name: '320×568', viewport: { width: 320, height: 568 }, ...touch },
  { name: 'ngang 667×375', viewport: { width: 667, height: 375 }, ...touch },
  { name: 'ngang 568×320', viewport: { width: 568, height: 320 }, ...touch },
]
const OVER = '[role=dialog],[role=alertdialog],[data-popover],[data-tour-card]'

// chạy trong trang: chữ + nút trong `scope` (null = trang, trừ tấm / bảng đang mở) không tới được / bị che
function probe(scope, OVER) {
  const all = scope ? [...document.querySelectorAll(scope)] : [document.body]
  const root = all[all.length - 1]
  if (!root) return [`(không thấy ${scope})`]
  const vw = innerWidth, vh = innerHeight
  const name = el => (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
  const tag = el => `<${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}>`
  const scrolls = el => { const s = getComputedStyle(el); return /(auto|scroll)/.test(s.overflowY + s.overflowX) }
  // bị cắt CỐ Ý bởi khung overflow-hidden không cuộn (khối đang gấp, chữ một dòng…) — việc của ui-cut, bỏ qua ở đây
  const clipped = el => {
    const r = el.getBoundingClientRect()
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a)
      if (/(hidden|clip)/.test(s.overflowX + s.overflowY) && !scrolls(a)) {
        const q = a.getBoundingClientRect()
        if (r.bottom <= q.top + 1 || r.top >= q.bottom - 1 || r.right <= q.left + 1 || r.left >= q.right - 1) return true
      }
    }
    return false
  }
  const noPointer = el => { for (let a = el; a; a = a.parentElement) if (getComputedStyle(a).pointerEvents === 'none') return true; return false }
  const hasText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
  const els = [...root.querySelectorAll('*')].filter(el => {
    if (!scope && el.closest(OVER)) return false
    if (el.closest('[aria-hidden=true],svg,script,style,option,canvas')) return false
    if (!(el.matches('button, a[href], input:not([type=hidden]), select, textarea, [role=switch], [role=tab]') || hasText(el))) return false
    if (el.disabled) return false
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 2 && r.height > 2 && !clipped(el)
  })
  const bad = []
  for (const el of els) {
    let why = null
    for (const block of ['nearest', 'center', 'end', 'start']) {
      el.scrollIntoView({ block, inline: 'nearest', behavior: 'instant' })
      const r = el.getBoundingClientRect()
      const top = Math.min(r.bottom, r.top + vh)   // chữ dài hơn màn: chỉ cần thấy được phần đầu
      if (r.top < -1 || top > vh + 1 || r.left < -1 || r.right > vw + 1) { why = `khuất ngoài màn (${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)} / ${vw}×${vh})`; continue }
      if (noPointer(el)) { why = null; break }
      const x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(vh - 1, Math.max(0, r.top + Math.min(r.height, vh) / 2))
      const h = document.elementFromPoint(x, y)
      // trúng chính nó / con / khung chứa nó (giữa chữ nhiều dòng rơi vào khoảng trống của dòng) — không có gì đè lên
      if (h && (el === h || el.contains(h) || h.contains(el) || !!h.closest('label')?.contains(el))) { why = null; break }
      why = h ? `bị che bởi ${name(h)} ${tag(h)}` : 'không trúng gì'
    }
    if (why) bad.push(`${name(el)} ${tag(el)} — ${why}`)
  }
  window.scrollTo(0, 0)
  return bad
}

// chạy trong trang: hộp của tấm / bảng đang mở + các khung cuộn bên trong (nội dung dài hơn khung)
function boxes(scope) {
  const all = [...document.querySelectorAll(scope)]
  const root = all[all.length - 1]
  if (!root) return null
  // bước soi chữ vừa cuộn trang về đầu — đưa tấm / bảng về lại trong màn như lúc nó mới mở
  root.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  const vis = r => ({ x: Math.max(0, r.left), y: Math.max(0, r.top), r: Math.min(innerWidth, r.right), b: Math.min(innerHeight, r.bottom) })
  const sc = [...root.querySelectorAll('*'), root].filter(e => {
    const s = getComputedStyle(e)
    return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 8 && e.getBoundingClientRect().height > 60
  })
  sc.forEach((e, i) => e.setAttribute('data-sc-probe', String(i)))
  return { root: vis(root.getBoundingClientRect()), sc: sc.map((e, i) => ({ i, ...vis(e.getBoundingClientRect()), name: `<${e.tagName.toLowerCase()}.${String(e.className).split(/\s+/).slice(0, 3).join('.')}>` })) }
}

const srv = await startPreview(4189)
const b = await launch()
const bad = new Map()
const add = (k, dev) => { if (!bad.has(k)) bad.set(k, new Set()); bad.get(k).add(dev) }
let n = 0
for (const dev of DEVS) {
  const ctx = await b.newContext(dev)
  const p = await ctx.newPage()
  const cdp = await ctx.newCDPSession(p)
  const errs = watchErrors(p)
  // ngón tay kéo từ (x, y0) tới (x, y1)
  const drag = async (x, y0, y1) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] })
    for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / 8 }] }); await p.waitForTimeout(16) }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(350)
  }
  for (const trip of ['sample-t1', 'sample-t2']) {
    for (const [what, open, scope, close, only] of STATES) {
      if (only && only !== 'phone') continue
      if (process.env.UI_ONLY && !new RegExp(process.env.UI_ONLY).test(what)) continue   // soi lại vài màn: UI_ONLY='Góc|xe'
      if (trip === 'sample-t2' && !T2_STATES.includes(what)) continue
      const where = `${trip === 'sample-t1' ? 'Mẫu pallet' : 'Mẫu 40ft'} · ${what}`
      await p.goto(srv.base + `?n=${++n}#/trip/${trip}`, { waitUntil: 'domcontentloaded' })
      await p.locator('[data-scene] canvas').first().waitFor({ timeout: 10000 }).catch(() => {}); await p.waitForTimeout(500)
      p.setDefaultTimeout(8000)
      try {
        if (open) { await open(p); await p.waitForTimeout(500) }
        const r = await p.evaluate(([s, o, f]) => (0, eval)(`(${f})`)(s, o), [scope, OVER, probe.toString()])
        r.forEach(x => add(`${where} :: ${x}`, dev.name))
        // vuốt trên tấm / bảng đang mở (lên rồi xuống): trang phía sau đứng yên, tấm vẫn mở
        if (scope && scope !== '[data-scene]') {
          // bảng nằm theo trang tự cuộn trang cho lọt vào màn lúc mở (cuộn mượt) — chờ xong rồi mới đo chỗ vuốt
          await p.waitForTimeout(400)
          const bx = await p.evaluate(([s, f]) => (0, eval)(`(${f})`)(s), [scope, boxes.toString()])
          if (bx) {
            const y0 = await p.evaluate(() => scrollY)
            const cx = Math.round((bx.root.x + bx.root.r) / 2), mid = (bx.root.y + bx.root.b) / 2, d = Math.min(70, (bx.root.b - bx.root.y) / 2 - 6)
            for (const [a, z] of [[mid + d, mid - d], [mid - d, mid + d]]) {
              await drag(cx, Math.round(a), Math.round(z))
              const st = await p.evaluate(s => ({ y: scrollY, open: !!document.querySelector(s) }), scope)
              if (Math.abs(st.y - y0) > 2) add(`${where} :: vuốt trên tấm / bảng ⇒ trang phía sau trôi ${Math.round(st.y - y0)}px`, dev.name)
              if (!st.open) { add(`${where} :: vuốt trên tấm / bảng ⇒ tấm tự đóng`, dev.name); break }
            }
            // khung có nội dung dài: vuốt lên là cuộn được
            for (const s of bx.sc) {
              const before = await p.evaluate(i => document.querySelector(`[data-sc-probe="${i}"]`)?.scrollTop ?? -1, s.i)
              if (before < 0) continue
              const x = Math.round((s.x + s.r) / 2), m = (s.y + s.b) / 2, dd = Math.min(60, (s.b - s.y) / 2 - 4)
              await drag(x, Math.round(m + dd), Math.round(m - dd))
              const after = await p.evaluate(i => document.querySelector(`[data-sc-probe="${i}"]`)?.scrollTop ?? -1, s.i)
              if (after >= 0 && after <= before && before < 1) add(`${where} :: khung cuộn ${s.name} vuốt không cuộn`, dev.name)
            }
          }
        }
        if (close) await close(p).catch(() => {})
      } catch (e) { add(`${where} :: (không mở được: ${e.message.split('\n')[0].slice(0, 90)})`, dev.name) }
    }
  }
  if (errs.length) add(`lỗi trình duyệt :: ${errs[0].slice(0, 120)}`, dev.name)
  await ctx.close()
}
await b.close(); await srv.close()
// đủ danh sách ra file; màn hình in gọn: mỗi màn / tấm vài dòng đầu
writeFileSync(join(OUT, 'ui-scroll.txt'), [...bad].map(([k, d]) => `[${[...d].join(', ')}] ${k}`).join('\n'))
const per = new Map()
for (const [k, d] of bad) { const s = k.split(' :: ')[0]; if (!per.has(s)) per.set(s, []); per.get(s).push(`[${[...d].join(', ')}] ${k.split(' :: ')[1]}`) }
for (const [s, ls] of per) { console.log(`  ✗ ${s} — ${ls.length} chỗ`); ls.slice(0, 4).forEach(l => console.log(`      ${l}`)) }
console.log(bad.size ? `\n${bad.size} chỗ kéo / trượt / che` : `XANH [${UI_LANG}] — màn thấp, xoay ngang: chữ + nút tới được, vuốt không làm trang phía sau trôi, khung dài cuộn được`)
process.exit(bad.size ? 1 : 0)
