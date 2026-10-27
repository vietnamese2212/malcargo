// Hàng trên xe: thùng carton (InstancedMesh mỗi mã) và pallet (đế gỗ + khối hàng quấn màng).
import * as THREE from 'three'
import type { LoadPlan } from '../engine/loadPlan'
import type { PlanGroupMeta } from '../engine/plan'
import { cartonSideTexture, cartonTopTexture, woodTexture, wrappedTexture } from './textures'
import { groupColor } from './colors'

export interface CargoHandle {
  group: THREE.Group
  setStep: (step: number | null) => void      // null = hiện hết
  setFocus: (focus: Set<number> | null) => void
  dispose: () => void
}

interface GroupMeshes { steps: number[]; perBox: { mesh: THREE.InstancedMesh; k: number }[]; mats: THREE.Material[] }

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

  for (const [gi, boxesIn] of byGroup) {
    const boxes = [...boxesIn].sort((a, b) => a.step - b.step)
    const m = meta[gi]
    const base = plan.groups[gi]?.base
    const hex = groupColor(m, colors)
    const entry: GroupMeshes = { steps: boxes.map(b => b.step), perBox: [], mats: [] }

    const place = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      tmp.position.set(x, y, z); tmp.scale.set(sx, sy, sz); tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }

    if (base) {
      // PALLET: ván mặt + 9 chân gỗ, hàng quấn màng phía trên
      const n = boxes.length
      const gw = track(woodMat.clone())   // riêng từng nhóm để làm mờ được khi soi mã khác
      const deck = new THREE.InstancedMesh(unitBox, gw, n)
      const feet = new THREE.InstancedMesh(unitBox, gw, n * 9)
      const cargoMat = track(new THREE.MeshPhysicalMaterial({ map: wrapTex, color: hex, roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.3 }))
      const cargo = new THREE.InstancedMesh(unitBox, cargoMat, n)
      entry.mats.push(cargoMat, gw)
      boxes.forEach((b, i) => {
        const l = b.l / 1000, w = b.w / 1000, h = b.h / 1000, bh = base.h / 1000
        const cx = (b.x + b.l / 2) / 1000, cz = W / 2 - (b.y + b.w / 2) / 1000, y0 = floorY + b.z / 1000
        place(deck, i, cx, y0 + bh * 0.82, cz, l, bh * 0.36, w)
        let k = 0
        for (const fx of [-1, 0, 1]) for (const fz of [-1, 0, 1]) {
          place(feet, i * 9 + k++, cx + fx * (l / 2 - l * 0.07), y0 + bh * 0.32, cz + fz * (w / 2 - w * 0.07), l * 0.14, bh * 0.64, w * 0.14)
        }
        place(cargo, i, cx, y0 + bh + (h - bh) / 2, cz, l * 0.985, h - bh - 0.004, w * 0.985)
      })
      for (const mesh of [deck, feet, cargo]) { mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true; mesh.instanceMatrix.needsUpdate = true; root.add(mesh) }
      entry.perBox.push({ mesh: deck, k: 1 }, { mesh: feet, k: 9 }, { mesh: cargo, k: 1 })
    } else {
      // THÙNG CARTON: nóc có băng keo, hông có nhãn; màu mã pha giấy
      const side = track(new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.88 }))
      const top = track(new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.8 }))
      const mats = [side, side, top, side, side, side]
      const mesh = new THREE.InstancedMesh(unitBox, mats, boxes.length)
      entry.mats.push(side, top)
      boxes.forEach((b, i) => {
        place(mesh, i,
          (b.x + b.l / 2) / 1000, floorY + (b.z + b.h / 2) / 1000, W / 2 - (b.y + b.w / 2) / 1000,
          (b.l - 8) / 1000, (b.h - 5) / 1000, (b.w - 8) / 1000)
        // lệch sáng tối rất nhẹ từng thùng — tránh mảng màu phẳng như nhựa
        col.set(hex).multiplyScalar(0.94 + ((i * 7919) % 13) / 100)
        mesh.setColorAt(i, col)
      })
      mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      root.add(mesh)
      entry.perBox.push({ mesh, k: 1 })
    }
    groups[gi] = entry
  }

  const setStep = (step: number | null) => {
    let h = 0
    for (const e of groups) {
      if (!e) continue
      const n = step == null ? e.steps.length : upperBound(e.steps, step)
      for (const p of e.perBox) p.mesh.count = n * p.k
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

  const setFocus = (focus: Set<number> | null) => {
    groups.forEach((e, gi) => {
      if (!e) return
      const dim = focus != null && focus.size > 0 && !focus.has(gi)
      for (const mat of e.mats) {
        mat.transparent = dim; mat.opacity = dim ? 0.1 : 1; mat.depthWrite = !dim; mat.needsUpdate = true
      }
      for (const p of e.perBox) p.mesh.castShadow = !dim
    })
  }

  setStep(null)
  return { group: root, setStep, setFocus, dispose: () => disposables.forEach(x => x.dispose()) }
}
