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
// các pallet; đủ quy cách ⇒ pallet chẵn; phần lẻ mặc định DỒN pallet gộp ≤ 1,65m, hàng NHẸ TRÊN CÙNG, liền khối;
// chuyến bật "Hàng nhẹ: pallet riêng" ⇒ phần lẻ hàng nhẹ đứng pallet riêng. Ca = chuyến 271026-1936-01.
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
    for (const [gi, m] of r.meta.entries()) {
      const cs = m.cartons ?? []
      ok(cs.every(c => c.x >= -0.5 && c.y >= -0.5 && c.x + c.l <= P.l + 0.5 && c.y + c.w <= P.w + 0.5), `${name}: ${m.label} có thùng chờm ra ngoài chân pallet`)
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
    const ps = r.plan.placed
    ok(ps.some(a => ps.some(b => b !== a && b.x >= a.x + a.l + 1 && Math.abs(b.y - a.y) < 1)), `${name}: các pallet trong làn phải có khe`)
  }
  const a = E.computeTrip({ truck: trucks['adm-v-p8t'], orders: os, pallet: P })
  palletChecks('pallet · phần lẻ dồn', a)
  ok(a.count.some(c => a.meta[c.group].itemId === items['adm-i-c100'].id && a.meta[c.group].cartons?.length === 143), 'pallet · phần lẻ dồn: Sữa chua chai phải có 1 pallet chẵn 143 thùng')
  ok(a.meta.some(m => m.mix?.some(x => x.itemId === tui.id) && m.mix.some(x => x.itemId === items['adm-i-c100'].id)), 'pallet · phần lẻ dồn: thạch túi phải dồn chung pallet gộp với phần lẻ Sữa chua chai')
  console.log(`• Pallet · phần lẻ dồn (xe pallet 8 tấn) — ${a.count.map(c => `${c.label}${c.mix ? ' [' + c.mix.map(x => x.n + ' ' + x.label).join(' + ') + ']' : ''}`).join(' · ')}`)
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
