// Hàng trên xe: thùng carton (InstancedMesh mỗi mã) và pallet (đế gỗ + từng THÙNG THẬT đã xếp trên mặt
// pallet — `PlanGroupMeta.cartons`; khối quấn màng chỉ còn cho pallet không rõ ruột — thùng to hơn chân
// pallet / chưa khai quy cách).
import * as THREE from 'three'
import type { LoadPlan, PlacedBox } from '../engine/loadPlan'
import type { PalletCarton, PlanGroupMeta } from '../engine/plan'
import { cartonSideTexture, cartonTopTexture, woodTexture, wrappedTexture } from './textures'
import { groupColor } from './colors'

export interface CargoHandle {
  group: THREE.Group
  setStep: (step: number | null) => void      // null = hiện hết
  // soi: khối ngoài `focus` mờ đi; có `item` ⇒ trong khối được soi, thùng của mã KHÁC cũng mờ (pallet gộp)
  setFocus: (focus: Set<number> | null, item?: string | null) => void
  dispose: () => void
}

// cum[i] = số instance của i khối đầu (theo bước) — mỗi pallet gộp có số thùng mỗi mã khác nhau
interface Part { mesh: THREE.InstancedMesh; cum: number[]; mats: THREE.Material[]; itemId?: string }
interface GroupMeshes { steps: number[]; parts: Part[] }

/** Thùng / tấm gỗ trên pallet (toạ độ theo khối L×W của nhóm — chân + phần chờm) → toạ độ trong xe của
 *  pallet `b`. Pallet đặt xoay (cạnh dài theo bề ngang xe) thì đổi trục. */
function onPallet<T extends { x: number; y: number; l: number; w: number }>(b: PlacedBox, L: number, cs: T[]): T[] {
  const turned = Math.abs(b.l - L) > 1
  return cs.map(c => turned
    ? { ...c, x: b.x + c.y, y: b.y + c.x, l: c.w, w: c.l }
    : { ...c, x: b.x + c.x, y: b.y + c.y })
}

const upperBound = (a: number[], v: number) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] <= v) lo = m + 1; else hi = m } return lo }

export function buildCargo(plan: LoadPlan, meta: PlanGroupMeta[], colors: Map<string, string>, floorY: number): CargoHandle {
  const root = new THREE.Group()
  const disposables: { dispose: () => void }[] = []
  const track = <T extends { dispose: () => void }>(x: T) => { disposables.push(x); return x }
  const W = plan.truck.width / 1000

  const topTex = track(cartonTopTexture())
  const sideTex = track(cartonSideTexture())
  const wrapTex = track(wrappedTexture())
  const woodTex = track(woodTexture(5))
  const unitBox = track(new THREE.BoxGeometry(1, 1, 1))
  const woodMat = track(new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85 }))

  const groups: GroupMeshes[] = []
  const tmp = new THREE.Object3D()
  const col = new THREE.Color()

  // Thùng của BƯỚC đang xem — viền sáng để mắt bắt ngay chỗ vừa đặt
  const hlMat = track(new THREE.MeshBasicMaterial({ color: '#4d8dff', transparent: true, opacity: 0.35, depthWrite: false }))
  const hl = new THREE.InstancedMesh(unitBox, hlMat, Math.max(1, plan.placed.length))
  hl.count = 0; hl.renderOrder = 2; hl.frustumCulled = false
  root.add(hl)

  const byGroup = new Map<number, typeof plan.placed>()
  for (const b of plan.placed) {
    const a = byGroup.get(b.group)
    if (a) a.push(b); else byGroup.set(b.group, [b])
  }

  const place = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    tmp.position.set(x, y, z); tmp.scale.set(sx, sy, sz); tmp.updateMatrix()
    mesh.setMatrixAt(i, tmp.matrix)
  }
  const finish = (mesh: THREE.InstancedMesh) => {
    mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    root.add(mesh)
  }
  // THÙNG CARTON (mm, góc x·y·z): nóc có băng keo, hông có nhãn; màu mã pha giấy, lệch sáng tối rất nhẹ
  // từng thùng — tránh mảng màu phẳng như nhựa. Mỗi lô thùng một mesh + vật liệu riêng (làm mờ riêng được).
  const cartonPart = (list: { x: number; y: number; z: number; l: number; w: number; h: number }[], hex: string, cum: number[], itemId?: string): Part => {
    const side = track(new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.88 }))
    const top = track(new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.8 }))
    const mesh = new THREE.InstancedMesh(unitBox, [side, side, top, side, side, side], Math.max(1, list.length))
    list.forEach((b, i) => {
      place(mesh, i, (b.x + b.l / 2) / 1000, floorY + (b.z + b.h / 2) / 1000, W / 2 - (b.y + b.w / 2) / 1000,
        (b.l - 8) / 1000, (b.h - 5) / 1000, (b.w - 8) / 1000)
      col.set(hex).multiplyScalar(0.94 + ((i * 7919) % 13) / 100)
      mesh.setColorAt(i, col)
    })
    finish(mesh)
    return { mesh, cum, mats: [side, top], itemId }
  }
  const upTo = (n: number, k: number) => Array.from({ length: n + 1 }, (_, i) => i * k)

  for (const [gi, boxesIn] of byGroup) {
    const boxes = [...boxesIn].sort((a, b) => a.step - b.step)
    const m = meta[gi]
    const base = plan.groups[gi]?.base
    const hex = groupColor(m, colors)
    const entry: GroupMeshes = { steps: boxes.map(b => b.step), parts: [] }

    if (base) {
      // PALLET: ván mặt + 9 chân gỗ — đúng cỡ chân pallet (`deck`), thùng chờm mép thì khối rộng hơn tấm gỗ
      const n = boxes.length
      const L = plan.groups[gi].l
      const gw = track(woodMat.clone())   // riêng từng nhóm để làm mờ được khi soi mã khác
      const deck = new THREE.InstancedMesh(unitBox, gw, n)
      const feet = new THREE.InstancedMesh(unitBox, gw, n * 9)
      boxes.forEach((b0, i) => {
        const b = m.deck ? onPallet(b0, L, [m.deck])[0] : b0
        const l = b.l / 1000, w = b.w / 1000, bh = base.h / 1000
        const cx = (b.x + b.l / 2) / 1000, cz = W / 2 - (b.y + b.w / 2) / 1000, y0 = floorY + b0.z / 1000
        place(deck, i, cx, y0 + bh * 0.82, cz, l, bh * 0.36, w)
        let k = 0
        for (const fx of [-1, 0, 1]) for (const fz of [-1, 0, 1]) {
          place(feet, i * 9 + k++, cx + fx * (l / 2 - l * 0.07), y0 + bh * 0.32, cz + fz * (w / 2 - w * 0.07), l * 0.14, bh * 0.64, w * 0.14)
        }
      })
      finish(deck); finish(feet)
      entry.parts.push({ mesh: deck, cum: upTo(n, 1), mats: [gw] }, { mesh: feet, cum: upTo(n, 9), mats: [gw] })
      if (m.cartons?.length) {
        // thùng thật — mỗi MÃ một mesh: pallet gộp thấy rõ từng mã, đúng cỡ thùng, đúng màu
        const byItem = new Map<string, { list: PalletCarton[]; cum: number[] }>()
        for (const c of m.cartons) if (!byItem.has(c.itemId)) byItem.set(c.itemId, { list: [], cum: [0] })
        for (const b of boxes) {
          for (const c of onPallet(b, L, m.cartons)) byItem.get(c.itemId)!.list.push({ ...c, z: b.z + base.h + c.z })
          for (const v of byItem.values()) v.cum.push(v.list.length)
        }
        for (const [itemId, v] of byItem) entry.parts.push(cartonPart(v.list, groupColor({ ...m, colorKey: itemId }, colors), v.cum, itemId))
      } else {
        // không rõ ruột: khối hàng quấn màng một màu
        const cargoMat = track(new THREE.MeshPhysicalMaterial({ map: wrapTex, color: hex, roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.3 }))
        const cargo = new THREE.InstancedMesh(unitBox, cargoMat, n)
        boxes.forEach((b, i) => {
          const l = b.l / 1000, w = b.w / 1000, h = b.h / 1000, bh = base.h / 1000
          place(cargo, i, (b.x + b.l / 2) / 1000, floorY + b.z / 1000 + bh + (h - bh) / 2, W / 2 - (b.y + b.w / 2) / 1000, l * 0.985, h - bh - 0.004, w * 0.985)
        })
        finish(cargo)
        entry.parts.push({ mesh: cargo, cum: upTo(n, 1), mats: [cargoMat], itemId: m.itemId ?? undefined })
      }
    } else {
      entry.parts.push(cartonPart(boxes, hex, upTo(boxes.length, 1), m.itemId ?? undefined))
    }
    groups[gi] = entry
  }

  const setStep = (step: number | null) => {
    let h = 0
    for (const e of groups) {
      if (!e) continue
      const n = step == null ? e.steps.length : upperBound(e.steps, step)
      for (const p of e.parts) p.mesh.count = p.cum[n]
    }
    if (step != null) {
      for (const b of plan.placed) {
        if (b.step !== step) continue
        tmp.position.set((b.x + b.l / 2) / 1000, floorY + (b.z + b.h / 2) / 1000, W / 2 - (b.y + b.w / 2) / 1000)
        tmp.scale.set(b.l / 1000 + 0.012, b.h / 1000 + 0.012, b.w / 1000 + 0.012); tmp.updateMatrix()
        hl.setMatrixAt(h++, tmp.matrix)
      }
    }
    hl.count = h
    hl.instanceMatrix.needsUpdate = true
  }

  const setFocus = (focus: Set<number> | null, item?: string | null) => {
    groups.forEach((e, gi) => {
      if (!e) return
      const groupDim = focus != null && focus.size > 0 && !focus.has(gi)
      for (const p of e.parts) {
        const dim = groupDim || (!!item && !!p.itemId && p.itemId !== item)
        for (const mat of p.mats) {
          // mờ vừa đủ thấy khối xung quanh — biết khối đang soi nằm trên / cạnh cái gì
          mat.transparent = dim; mat.opacity = dim ? 0.2 : 1; mat.depthWrite = !dim; mat.needsUpdate = true
        }
        p.mesh.castShadow = !dim
      }
    })
  }

  setStep(null)
  return { group: root, setStep, setFocus, dispose: () => disposables.forEach(x => x.dispose()) }
}
