// SỐ LỚP trên hình 3D (chủ dự án 14/11: "bổ sung thêm số lớp ở trên bản vẽ 3D"), cùng cách SUPPLYC (`loadplan3d/marks.ts` +
// LoadPlan3DDialog): gom chân theo số lớp — các chân liền nhau dọc xe (cách ≤ 1,2 m) cùng số lớp = MỘT nhãn, đặt trên nóc vùng đó.
// Khác SUPPLYC: đếm theo TỪNG MÃ (khoá chân = vị trí + khối) ⇒ hàng nhẹ nằm trên nóc khối khác có nhãn riêng "+n" (không cộng lẫn
// vào khối dưới); xe pallet: số LỚP THÙNG trên mỗi pallet (pallet không chồng). Chỉ tính thùng đã tới bước đang xem; đang soi
// đơn / mã thì chỉ khối được soi. Hàm thuần (không three) — vẽ ở `marks.ts`, kiểm ở check-engine.
import type { LoadPlan } from '../engine/loadPlan'
import type { PlanGroupMeta } from '../engine/plan'

/** `n` lớp; `on` = đứng trên nóc hàng khác (hiện "+n lớp"). Toạ độ mm của thuật toán: x dọc xe, y ngang, `top` = đỉnh vùng. */
export interface LayerBadge { n: number; on: boolean; x: number; y: number; top: number }

export function layerBadges(plan: LoadPlan, meta: PlanGroupMeta[], step: number | null, focus: Set<number> | null): LayerBadge[] {
  const shown = plan.placed.filter(b => (step == null || b.step <= step) && (!focus || focus.has(b.group)))
  type Col = { n: number; on: boolean; cx: number; cy: number; top: number }
  const cols: Col[] = []
  if (meta.some(m => m.isPallet)) {
    // pallet: số mức thùng thật trên mặt pallet (ruột `cartons`); khối quấn màng không có ruột ⇒ không ghi
    const levels = new Map<number, number>()
    meta.forEach((m, gi) => { if (m.isPallet && m.cartons?.length) levels.set(gi, new Set(m.cartons.map(c => Math.round(c.z))).size) })
    for (const b of shown) {
      const n = levels.get(b.group)
      if (n) cols.push({ n, on: false, cx: b.x + b.l / 2, cy: b.y + b.w / 2, top: b.z + b.h })
    }
  } else {
    const byKey = new Map<string, Col & { z0: number }>()
    for (const b of shown) {
      const k = `${Math.round(b.x)}|${Math.round(b.y)}|${b.group}`
      const c = byKey.get(k) ?? { n: 0, on: false, cx: b.x + b.l / 2, cy: b.y + b.w / 2, top: 0, z0: Infinity }
      c.n++; c.top = Math.max(c.top, b.z + b.h); c.z0 = Math.min(c.z0, b.z)
      byKey.set(k, c)
    }
    for (const c of byKey.values()) cols.push({ ...c, on: c.z0 > 1 })
  }
  // cùng số lớp (cùng kiểu nằm trên nóc / dưới sàn) + liền nhau dọc xe ⇒ một nhãn ở giữa vùng
  const badges: LayerBadge[] = []
  const byKind = new Map<string, Col[]>()
  for (const c of cols) { const k = `${c.n}|${c.on ? 1 : 0}`; const a = byKind.get(k); if (a) a.push(c); else byKind.set(k, [c]) }
  for (const list of byKind.values()) {
    const clusters: Col[][] = []
    for (const c of [...list].sort((a, b) => a.cx - b.cx)) {
      const last = clusters[clusters.length - 1]
      if (last && c.cx - last[last.length - 1].cx <= 1200) last.push(c); else clusters.push([c])
    }
    for (const cl of clusters) badges.push({
      n: cl[0].n, on: cl[0].on,
      x: cl.reduce((s, c) => s + c.cx, 0) / cl.length, y: cl.reduce((s, c) => s + c.cy, 0) / cl.length,
      top: Math.max(...cl.map(c => c.top)),
    })
  }
  return badges
}
