// Kiểm lớp tính toán ngoài trình duyệt: bất biến hình học + bảng đếm chân + thời gian.
// Chạy: npm test
import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'malcargo-'))
const out = join(dir, 'engine.mjs')
buildSync({ entryPoints: ['scripts/engine-entry.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' })
const E = await import(pathToFileURL(out).href)
rmSync(dir, { recursive: true, force: true })

let fail = 0
const ok = (cond, msg) => { if (!cond) { fail++; console.log('  ✗ ' + msg) } }

function invariants(name, r) {
  const p = r.plan, T = p.truck
  const left = p.leftover.reduce((s, x) => s + x.count, 0)
  ok(p.placed.length + left === p.totalCount, `${name}: đặt ${p.placed.length} + thừa ${left} ≠ tổng ${p.totalCount}`)
  for (const b of p.placed) {
    if (b.x < -1 || b.y < -1 || b.z < -1 || b.x + b.l > T.length + 1 || b.y + b.w > T.width + 1 || b.z + b.h > T.height + 1) {
      ok(false, `${name}: thùng ra ngoài lòng xe`); break
    }
  }
  const ps = p.placed
  outer: for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j]
    if (a.x + a.l - 1 > b.x && b.x + b.l - 1 > a.x && a.y + a.w - 1 > b.y && b.y + b.w - 1 > a.y && a.z + a.h - 1 > b.z && b.z + b.h - 1 > a.z) {
      ok(false, `${name}: hai khối chồng lấn nhau`); break outer
    }
  }
  const sheet = r.count.reduce((s, c) => s + c.stacks.reduce((t, [n, l]) => t + n * l, 0), 0)
  ok(sheet === p.placed.length, `${name}: bảng đếm chân ${sheet} ≠ số đã xếp ${p.placed.length}`)
  // xe pallet: khối pallet nào cũng có ruột (lớp thùng thật) — lõi đổi cách chia lớp mà plan.ts không theo
  // thì ruột không khớp chiều cao, 3D lùi về khối quấn màng ⇒ phải báo ở đây
  const pal = r.meta.map((m, gi) => ({ m, g: p.groups[gi] })).filter(x => x.m.isPallet)
  if (pal.length && !r.errors.length) {
    const inPal = pal.reduce((s, x) => s + (x.m.layers ?? []).reduce((a, l) => a + l.n, 0) * x.g.count, 0)
    const loose = r.count.filter(c => c.unit === 'thùng').reduce((s, c) => s + c.total, 0)
    ok(pal.every(x => x.m.layers?.length) && inPal + loose === r.totals.cartons,
      `${name}: ruột pallet ${inPal} + thùng rời ${loose} ≠ ${r.totals.cartons} thùng (khối thiếu ruột: ${pal.filter(x => !x.m.layers).map(x => x.m.label).join(', ') || 'không'})`)
  }
}

const items = Object.fromEntries(E.ADMIN_ITEMS.map(i => [i.id, i]))
const trucks = Object.fromEntries(E.ADMIN_VEHICLES.map(v => [v.id, v]))
const orderOf = o => ({ id: o.id, name: o.name, place: o.place, lines: o.lines.map(l => ({ item: items[l.itemId], qty: l.qty })) })
const sample = E.SAMPLE_ORDERS.map(orderOf)

const cases = [
  ['Chuyến mẫu · xe 5 tấn', trucks['adm-v-5t'], sample],
  ['Chuyến mẫu · xe 1,5 tấn (quá tải)', trucks['adm-v-1t5'], sample],
  ['Chuyến mẫu · xe pallet 8 tấn', trucks['adm-v-p8t'], sample],
  ['1 mã 1000 thùng · xe 15 tấn', trucks['adm-v-15t'], [{ id: 'x', name: 'Đơn X', place: '', lines: [{ item: items['adm-i-st110'], qty: 1000 }] }]],
  ['Toàn hàng nhẹ · xe pallet', trucks['adm-v-p15t'], [{ id: 'y', name: 'Đơn Y', place: '', lines: [{ item: items['adm-i-tui110'], qty: 50 }] }]],
]
for (const [name, truck, orders] of cases) {
  const t0 = performance.now()
  const r = E.computeTrip({ truck, orders, pallet: E.DEFAULT_PALLET_SETTINGS })
  const ms = Math.round(performance.now() - t0)
  invariants(name, r)
  const lines = r.count.map(c => `${c.label} [${c.orderName}] ${c.stacks.map(([n, l]) => `${n}×${l}`).join(' + ')} = ${c.placed}/${c.total} ${c.unit}${c.onTopOfOthers ? ' (trên nóc)' : ''}`)
  console.log(`• ${name} — ${ms} ms · vừa xe: ${r.fits} · ${r.plan.placedCount}/${r.plan.totalCount} · thể tích ${r.plan.volumePct.toFixed(1)}% · ${E.fmtKg(r.weightKg)} (${r.payloadPct?.toFixed(0)}% tải)${r.totals.pallets != null ? ` · ${r.totals.pallets} pallet` : ''}`)
  for (const l of lines) console.log('    ' + l)
  for (const w of [...r.errors, ...r.warnings]) console.log('    ! ' + w)
}
// Hàng nhẹ thùng TO hơn thùng nền, ở đơn xếp sau — phải xếp đủ (xe 5 tấn còn rộng). Từ 27/10
// lõi tự lát phẳng được lên nóc (levelFill) nên không cần lớp dự phòng của plan.ts nữa.
{
  const big = { ...items['adm-i-tui110'], l: 500, w: 350, h: 300 }
  const os = sample.map(o => ({ ...o, lines: o.lines.map(l => (l.item.id === 'adm-i-tui110' ? { ...l, item: big } : l)) }))
  const r = E.computeTrip({ truck: trucks['adm-v-5t'], orders: os, pallet: E.DEFAULT_PALLET_SETTINGS })
  invariants('hàng nhẹ thùng to', r)
  ok(r.plan.placedCount === r.plan.totalCount, `hàng nhẹ thùng to: chỉ xếp ${r.plan.placedCount}/${r.plan.totalCount}`)
}
// Xe pallet (user 28/10): mọi hàng NẰM GỌN trên pallet của nó (không thùng rời vắt qua pallet), có KHE giữa
// các pallet; pallet chẵn = quy cách ÷ số lớp thùng/lớp, KHÔNG quá số lớp khai ("110 thùng – 11 lớp ⇒ 1 lớp
// 10 thùng"; ảnh: Sữa 180 thành 13 lớp vượt quy định); phần lẻ MỖI MÃ nằm nguyên MỘT pallet ("100 thùng,
// quy cách 110 mà không lên 1 pallet?"), dồn pallet gộp ≤ 1,65m, hàng NHẸ TRÊN CÙNG; chuyến bật "Hàng nhẹ:
// pallet riêng" ⇒ phần lẻ hàng nhẹ đứng pallet riêng.
{
  const tui = items['adm-i-tui110']
  const P = E.DEFAULT_PALLET_SETTINGS
  const os = [{ id: 'z', name: 'Đơn Z', place: '', lines: [
    { item: items['adm-i-scu180'], qty: 110 }, { item: items['adm-i-c100'], qty: 200 }, { item: tui, qty: 200 },
  ] }]
  const lightIds = new Set(E.ADMIN_ITEMS.filter(i => i.light).map(i => i.id))
  const palletChecks = (name, r) => {
    invariants(name, r)
    ok(r.fits && r.count.every(c => c.unit === 'pallet'), `${name}: phải toàn pallet và vừa xe, được ${JSON.stringify(r.count.map(c => [c.label, c.unit, c.placed]))}`)
    const remOn = new Map()   // mã → số pallet KHÔNG chẵn đang chứa nó
    for (const [gi, m] of r.meta.entries()) {
      const g = r.plan.groups[gi], cs = m.cartons ?? [], d = m.deck
      // thùng trong khối; khối = chân + phần chờm, chờm mỗi bên ≤ 60mm
      ok(d && cs.every(c => c.x >= -0.5 && c.y >= -0.5 && c.x + c.l <= g.l + 0.5 && c.y + c.w <= g.w + 0.5)
        && Math.max(d.x, d.y, g.l - d.x - d.l, g.w - d.y - d.w) <= 60, `${name}: ${m.label} có thùng ra ngoài khối pallet / chờm quá 60mm`)
      // đủ thùng (không rơi thùng nào khi xếp lớp) + CHỖ ĐỠ: thùng không nằm sát mặt pallet phải được đỡ ≥ 60% đáy
      // (thùng dưới thấp hơn ≤ 35mm vẫn tính — lớp trộn thùng cao 130 / 100); user 28/10: "phía dưới phải phủ hết"
      ok(cs.length === (m.layers ?? []).reduce((s, l) => s + l.n, 0), `${name}: ${m.label} xếp ${cs.length} thùng ≠ ruột ${(m.layers ?? []).reduce((s, l) => s + l.n, 0)}`)
      const weak = cs.filter(c => c.z >= 1).map(c => {
        let s = 0
        for (const d of cs) if (d.z < c.z && d.z + d.h <= c.z + 1 && d.z + d.h >= c.z - 36) s += Math.max(0, Math.min(c.x + c.l, d.x + d.l) - Math.max(c.x, d.x)) * Math.max(0, Math.min(c.y + c.w, d.y + d.w) - Math.max(c.y, d.y))
        return { c, s: s / (c.l * c.w) }
      }).filter(x => x.s < 0.6)
      ok(!weak.length, `${name}: ${m.label} có ${weak.length} thùng đỡ dưới 60% đáy (vd ${weak[0] && `${weak[0].c.itemId} z${weak[0].c.z} ${Math.round(weak[0].s * 100)}%`})`)
      const it = m.itemId ? items[m.itemId] : null
      if (it && cs.length === it.perPallet) {
        const per = Math.ceil(it.perPallet / it.maxLayers), top = Math.max(...cs.map(c => c.z + c.h))
        ok(top <= it.maxLayers * it.h + 0.5 && cs.filter(c => c.z < 1).length === per,
          `${name}: ${m.label} pallet chẵn phải ${per} thùng/lớp, ≤ ${it.maxLayers} lớp — được ${cs.filter(c => c.z < 1).length}/lớp, cao ${top}`)
      } else for (const id of new Set(cs.map(c => c.itemId))) remOn.set(`${m.orderName}|${id}`, (remOn.get(`${m.orderName}|${id}`) ?? 0) + 1)
      let lap = 0, heavyOnLight = 0
      for (let i = 0; i < cs.length; i++) for (let j = 0; j < cs.length; j++) {
        if (i === j) continue
        const a = cs[i], b = cs[j]
        const xy = a.x + a.l - 1 > b.x && b.x + b.l - 1 > a.x && a.y + a.w - 1 > b.y && b.y + b.w - 1 > a.y
        if (i < j && xy && a.z + a.h - 1 > b.z && b.z + b.h - 1 > a.z) lap++
        if (xy && !lightIds.has(a.itemId) && lightIds.has(b.itemId) && a.z >= b.z + b.h - 1) heavyOnLight++
      }
      ok(!lap, `${name}: ${m.label} có ${lap} cặp thùng chồng lấn`)
      ok(!heavyOnLight, `${name}: ${m.label} có ${heavyOnLight} thùng hàng thường nằm TRÊN hàng nhẹ`)
      if (m.mix) ok(r.plan.groups[gi].h <= P.maxH + 0.5, `${name}: ${m.label} cao ${r.plan.groups[gi].h} > ${P.maxH}`)
    }
    for (const [k, n] of remOn) ok(n === 1, `${name}: phần lẻ ${k} vắt qua ${n} pallet`)
    const ps = r.plan.placed
    // làn nào có từ 2 pallet thì giữa chúng phải có khe
    const sameLane = ps.some(a => ps.some(b => b !== a && b.x > a.x && Math.abs(b.y - a.y) < 1))
    if (sameLane) ok(ps.some(a => ps.some(b => b !== a && b.x >= a.x + a.l + 1 && Math.abs(b.y - a.y) < 1)), `${name}: các pallet trong làn phải có khe`)
  }
  const show = r => r.count.map(c => `${c.label}${c.mix ? ' [' + c.mix.map(x => x.n + ' ' + x.label).join(' + ') + ']' : ''}`).join(' · ')
  // Ca ảnh chủ dự án 28/10: chuyến mẫu, xe 5 tấn đổi sang chở pallet
  const s = E.computeTrip({ truck: { ...trucks['adm-v-5t'], kind: 'pallet' }, orders: sample, pallet: P })
  palletChecks('pallet · chuyến mẫu xe 5 tấn', s)
  ok(s.meta.some(m => m.mix?.some(x => x.itemId === tui.id)), 'pallet · chuyến mẫu: thạch túi phải dồn lên pallet gộp phần lẻ')
  console.log(`• Pallet · chuyến mẫu xe 5 tấn — ${show(s)}`)
  // Ảnh chủ dự án 28/10: Sữa chua chai 144 = pallet chẵn 143 + 1 thùng thừa dồn lên pallet lẻ (Sữa chua 180) —
  // thùng thừa phải nằm GỌN giữa mặt, không ra góc chờm mép theo mẫu 11 thùng/lớp (nhìn như gác lên pallet bên)
  {
    const os144 = sample.map(o => ({ ...o, lines: o.lines.map(l => (l.item.id === 'adm-i-c100' ? { ...l, qty: 144 } : l)) }))
    const r = E.computeTrip({ truck: { ...trucks['adm-v-5t'], kind: 'pallet' }, orders: os144, pallet: P })
    palletChecks('pallet · thùng thừa 144', r)
    const gi = r.meta.findIndex(m => m.mix?.some(x => x.itemId === 'adm-i-c100' && x.n === 1))
    const m = r.meta[gi], d = m?.deck, c = m?.cartons.find(x => x.itemId === 'adm-i-c100')
    ok(c && d.x === 0 && d.y === 0 && c.x >= d.x && c.x + c.l <= d.x + d.l && c.y >= d.y && c.y + c.w <= d.y + d.w
      && Math.abs(c.x + c.l / 2 - (d.x + d.l / 2)) < 60 && Math.abs(c.y + c.w / 2 - (d.y + d.w / 2)) < 60,
      `pallet · thùng thừa 144: thùng thừa phải nằm giữa mặt pallet lẻ, gọn trong chân — được ${JSON.stringify({ c, d })}`)
  }
  // Ảnh chủ dự án 28/10: phần lẻ nhỏ của 2 mã nặng + nhiều thạch túi — lớp dưới phải phủ kín (lớp hỗn hợp nhiều mã),
  // thạch túi không chồng lên ô trống / bậc so le
  for (const [nm, ls] of [['5 Sữa 180 + 7 Sữa 110 + 150 túi', [['adm-i-st180', 115], ['adm-i-st110', 147], ['adm-i-tui110', 150]]],
    ['13 Sữa 180 + 20 Sữa chua chai + 60 túi', [['adm-i-st180', 13], ['adm-i-c100', 20], ['adm-i-tui110', 60]]],
    ['9 Sữa thạch + 17 Sữa chai + 100 túi', [['adm-i-th170', 9], ['adm-i-c85', 17], ['adm-i-tui110', 100]]]]) {
    const r = E.computeTrip({ truck: trucks['adm-v-p8t'], orders: [{ id: 'm', name: 'Đơn M', place: '', lines: ls.map(([id, qty]) => ({ item: items[id], qty })) }], pallet: P })
    palletChecks(`pallet · lớp phủ kín · ${nm}`, r)
    const mx = r.meta.find(m => m.mix)
    const bottom = mx ? mx.cartons.filter(c => c.z < 1).reduce((s, c) => s + c.l * c.w, 0) / (P.l * P.w) : 0
    ok(bottom >= 0.85, `pallet · lớp phủ kín · ${nm}: lớp đáy pallet gộp chỉ phủ ${Math.round(bottom * 100)}% mặt pallet`)
  }
  const a = E.computeTrip({ truck: trucks['adm-v-p8t'], orders: os, pallet: P })
  palletChecks('pallet · phần lẻ dồn', a)
  ok(a.count.some(c => a.meta[c.group].itemId === items['adm-i-c100'].id && a.meta[c.group].cartons?.length === 143), 'pallet · phần lẻ dồn: Sữa chua chai phải có 1 pallet chẵn 143 thùng')
  console.log(`• Pallet · phần lẻ dồn (xe pallet 8 tấn) — ${show(a)}`)
  const b = E.computeTrip({ truck: trucks['adm-v-p8t'], orders: os, pallet: P, lightOwnPallet: true })
  palletChecks('pallet · nhẹ pallet riêng', b)
  ok(b.meta.filter(m => m.cartons?.some(c => c.itemId === tui.id)).every(m => m.cartons.every(c => c.itemId === tui.id)), 'pallet · nhẹ pallet riêng: pallet chứa thạch túi chỉ có thạch túi')
  console.log(`• Pallet · nhẹ pallet riêng — ${b.count.map(c => c.label).join(' · ')}`)
  ok(E.suggestTruck(os, P, E.ADMIN_VEHICLES.filter(v => v.kind === 'pallet'), true) === 'adm-v-p8t', 'pallet: gợi ý xe phải là xe pallet 8 tấn')
}
const t0 = performance.now()
const sug = E.suggestTruck(sample, E.DEFAULT_PALLET_SETTINGS, E.ADMIN_VEHICLES.filter(v => v.kind === 'loose'))
console.log(`• Gợi ý xe cho chuyến mẫu: ${sug} (${Math.round(performance.now() - t0)} ms)`)
console.log(fail ? `\n${fail} lỗi` : '\nXANH')
process.exit(fail ? 1 : 0)
