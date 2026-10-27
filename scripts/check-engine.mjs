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
// Xe pallet, chuyến bật "Hàng nhẹ đóng pallet" ⇒ không còn thùng rời nào. 200 túi (216/pallet) tự đủ một
// pallet ⇒ pallet RIÊNG; 25 túi thì dồn chung pallet gộp với phần lẻ mã khác. Tắt ⇒ rải thùng lên nóc.
{
  const tui = items['adm-i-tui110']
  const os = [{ id: 'z', name: 'Đơn Z', place: '', lines: [
    { item: items['adm-i-scu180'], qty: 110 }, { item: items['adm-i-c100'], qty: 120 }, { item: tui, qty: 200 },
  ] }]
  const a = E.computeTrip({ truck: trucks['adm-v-p8t'], orders: os, pallet: E.DEFAULT_PALLET_SETTINGS, lightInPallet: true })
  invariants('nhẹ · đóng pallet', a)
  ok(a.fits && a.count.every(c => c.unit === 'pallet'),
    `nhẹ · đóng pallet: phải toàn pallet và vừa xe, được ${JSON.stringify(a.count.map(c => [c.label, c.unit, c.placed]))}`)
  const rowA = a.count.filter(c => a.meta[c.group].itemId === tui.id)
  ok(rowA.length === 1 && rowA[0].placed === 1, `nhẹ · đóng pallet: 200 túi phải là 1 pallet riêng, được ${JSON.stringify(a.count.map(c => c.label))}`)
  ok(E.suggestTruck(os, E.DEFAULT_PALLET_SETTINGS, E.ADMIN_VEHICLES.filter(v => v.kind === 'pallet'), true) === 'adm-v-p8t',
    'nhẹ · đóng pallet: gợi ý xe phải là xe pallet 8 tấn')
  console.log(`• Nhẹ · đóng pallet (xe pallet 8 tấn) — ${a.count.map(c => `${c.label} ${c.placed} ${c.unit}`).join(' · ')}`)
  const few = [{ id: 'w', name: 'Đơn W', place: '', lines: [{ item: items['adm-i-st180'], qty: 150 }, { item: tui, qty: 25 }] }]
  const c = E.computeTrip({ truck: trucks['adm-v-p8t'], orders: few, pallet: E.DEFAULT_PALLET_SETTINGS, lightInPallet: true })
  invariants('nhẹ ít · đóng pallet', c)
  ok(c.count.every(x => x.unit === 'pallet') && !c.count.some(x => c.meta[x.group].itemId === tui.id),
    `nhẹ ít · đóng pallet: 25 túi phải dồn vào pallet gộp, được ${JSON.stringify(c.count.map(x => x.label))}`)
  console.log(`• Nhẹ ít · đóng pallet — ${c.count.map(x => `${x.label} ${x.placed} ${x.unit}`).join(' · ')}`)
  const b = E.computeTrip({ truck: trucks['adm-v-p8t'], orders: os, pallet: E.DEFAULT_PALLET_SETTINGS })
  invariants('nhẹ · lên nóc', b)
  const rowB = b.count.filter(c => b.meta[c.group].itemId === tui.id)
  // (200 túi trên nóc chỉ 2 pallet nền: chồng ≤ 8 lớp nên còn dư vài thùng — ca nên bật "Hàng nhẹ đóng pallet")
  ok(rowB.length === 1 && rowB[0].unit === 'thùng' && rowB[0].onTopOfOthers && rowB[0].placed > 0,
    `nhẹ · lên nóc: thạch túi phải rải thùng lên nóc, được ${JSON.stringify(rowB.map(c => [c.label, c.unit, c.placed]))}`)
  console.log(`• Nhẹ · lên nóc (xe pallet 8 tấn) — ${b.count.map(c => `${c.label} ${c.placed}/${c.total} ${c.unit}`).join(' · ')}`)
}
const t0 = performance.now()
const sug = E.suggestTruck(sample, E.DEFAULT_PALLET_SETTINGS, E.ADMIN_VEHICLES.filter(v => v.kind === 'loose'))
console.log(`• Gợi ý xe cho chuyến mẫu: ${sug} (${Math.round(performance.now() - t0)} ms)`)
console.log(fail ? `\n${fail} lỗi` : '\nXANH')
process.exit(fail ? 1 : 0)
