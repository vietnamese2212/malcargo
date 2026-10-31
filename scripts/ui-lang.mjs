// Giao diện TIẾNG ANH không sót chữ tiếng Việt (chủ dự án 31/10: ô đổi tên chuyến mẫu hiện "Mẫu pallet" trong khi
// mọi chỗ khác ghi "Pallet demo"): mở từng màn / bảng thả / tấm (cùng danh sách ui-tap) + trang đơn mẫu, soi chữ đang
// hiện, chữ trong ô nhập, placeholder, aria-label, title — có dấu tiếng Việt là lỗi. Dữ liệu chỉ có mẫu (đều có bản
// dịch) nên không có ngoại lệ. Chạy sau `npm run build`: node scripts/ui-lang.mjs
process.env.MALCARGO_LANG = 'en'
const { DEVICES, launch, startPreview, watchErrors } = await import('./ui-lib.mjs')
const { STATES, T2_STATES } = await import('./ui-states.mjs')

// chạy trong trang: chữ tiếng Việt trong `scope` (null = trang, trừ tấm / bảng đang mở)
function scan(scope, OVER) {
  const VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i
  const all = scope ? [...document.querySelectorAll(scope)] : [document.body]
  const root = all[all.length - 1]
  if (!root) return [`(không thấy ${scope})`]
  const skip = el => (!scope && el.closest(OVER)) || el.closest('[aria-hidden=true],script,style')
    || !(el.checkVisibility ? el.checkVisibility({ visibilityProperty: true }) : el.getClientRects().length)
  const hits = new Set()
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n; (n = w.nextNode());) {
    const s = n.nodeValue.trim()
    if (s && VI.test(s) && n.parentElement && !skip(n.parentElement)) hits.add(`chữ: ${s.slice(0, 90)}`)
  }
  for (const el of root.querySelectorAll('[aria-label],[title],input,textarea')) {
    if (skip(el)) continue
    const attrs = [['aria-label', el.getAttribute('aria-label')], ['title', el.getAttribute('title')],
      ['ô nhập', el.matches('input,textarea') ? el.value : ''], ['placeholder', el.getAttribute('placeholder')]]
    for (const [k, v] of attrs) if (v && VI.test(v)) hits.add(`${k}: ${v.slice(0, 90)}`)
  }
  if (VI.test(document.title)) hits.add(`tiêu đề trang: ${document.title}`)
  return [...hits]
}

const srv = await startPreview(4189)
const b = await launch()
const bad = new Map()
const add = (k, where) => { if (!bad.has(k)) bad.set(k, new Set()); bad.get(k).add(where) }
let n = 0
for (const dev of DEVICES) {
  const p = await (await b.newContext(dev)).newPage()
  const errs = watchErrors(p)
  const runs = [
    ...['sample-t1', 'sample-t2'].flatMap(trip => STATES
      .filter(([what, , , , only]) => (!only || only === dev.name) && (trip === 'sample-t1' || T2_STATES.includes(what)))
      .map(([what, open, scope]) => [`${trip === 'sample-t1' ? 'Mẫu pallet' : 'Mẫu 40ft'} · ${what}`, `#/trip/${trip}`, open, scope])),
    ['Trang đơn mẫu pallet', '#/order/sample-o1', null, null],
    ['Trang đơn mẫu 40ft', '#/order/sample-o2', null, null],
  ]
  for (const [where, route, open, scope] of runs) {
    await p.goto(srv.base + `?n=${++n}${route}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
    p.setDefaultTimeout(8000)
    try {
      if (open) { await open(p); await p.waitForTimeout(500) }
      const hits = await p.evaluate(([s, f]) => (0, eval)(`(${f})`)(s, '[role=dialog],[role=alertdialog],[data-popover]'), [scope, scan.toString()])
      if (process.argv.includes('-v')) console.log(dev.name, where, hits.length)
      hits.forEach(h => add(h, `${dev.name} · ${where}`))
    } catch (e) { add(`(không mở được: ${e.message.split('\n')[0].slice(0, 90)})`, `${dev.name} · ${where}`) }
  }
  if (errs.length) add(`lỗi trình duyệt: ${errs[0].slice(0, 120)}`, dev.name)
  await p.close()
}

// Ô sửa hiện tên đã dịch nhưng LƯU mà không sửa ⇒ dữ liệu giữ tên gốc (tên mẫu / tên mặc định không thành bản dịch —
// bản sao đơn mẫu phải ra "Đơn N", xe mẫu thành "… (của tôi)")
const { T } = await import('./ui-lib.mjs')
const open = what => STATES.find(s => s[0] === what)[1]
const data = p => p.evaluate(() => JSON.parse(localStorage.getItem('malcargo-data-v1') ?? '{}').state ?? {})
const keep = [
  ['Đổi tên chuyến', 'Pallet demo', p => p.keyboard.press('Enter'),
    async p => (await data(p)).trips?.some(x => !x.id.startsWith('sample-')) ? 'Enter không sửa mà vẫn tách chuyến mẫu' : null],
  ['Sửa đơn (dải xe)', 'Pallet sample', p => p.getByRole('dialog').getByRole('button', { name: T('Lưu'), exact: true }).click(),
    async p => { const o = (await data(p)).orders?.find(x => !x.id.startsWith('sample-')); return !o ? 'không thấy bản sao đơn' : /^Đơn \d+$/.test(o.name) && o.place === 'Nhà phân phối A' ? null : `bản sao đơn lưu "${o.name}" · "${o.place}"` }],
  ['Sửa mã', 'Milk 180ml x48', p => p.getByRole('dialog').getByRole('button', { name: T('Lưu thành mã của tôi') }).click(),
    async p => { const n = (await data(p)).items?.[0]?.name; return n === 'Sữa 180ml x48' ? null : `mã lưu tên "${n}"` }],
  ['Sửa xe', '15-ton pallet truck', p => p.getByRole('dialog').getByRole('button', { name: T('Lưu thành xe của tôi') }).click(),
    async p => { const n = (await data(p)).vehicles?.[0]?.name; return n === 'Xe pallet 15 tấn (của tôi)' ? null : `xe lưu tên "${n}"` }],
]
{
  const p = await (await b.newContext(DEVICES[0])).newPage()
  for (const [what, shown, save, check] of keep) {
    await p.goto(srv.base + `?n=${++n}#/trip/sample-t1`, { waitUntil: 'networkidle' })
    await p.evaluate(() => localStorage.removeItem('malcargo-data-v1')); await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
    try {
      await open(what)(p); await p.waitForTimeout(400)
      const vals = await p.locator('[role=dialog] input, [data-popover] input').evaluateAll(els => els.map(e => e.value))
      if (!vals.includes(shown)) add(`ô sửa không hiện "${shown}" (có: ${vals.filter(Boolean).join(' | ')})`, `lưu không sửa · ${what}`)
      await save(p); await p.waitForTimeout(600)
      const e = await check(p)
      if (e) add(e, `lưu không sửa · ${what}`)
    } catch (e) { add(`(không chạy được: ${e.message.split('\n')[0].slice(0, 90)})`, `lưu không sửa · ${what}`) }
  }
  await p.close()
}
await b.close(); await srv.close()
for (const [k, w] of bad) console.log(`  ✗ ${k}\n      ở ${[...w].slice(0, 4).join(' | ')}${w.size > 4 ? ` (+${w.size - 4})` : ''}`)
console.log(bad.size ? `\n${bad.size} lỗi ngôn ngữ (giao diện tiếng Anh)` : 'XANH [en] — không sót chữ tiếng Việt, lưu không sửa giữ tên gốc')
process.exit(bad.size ? 1 : 0)
