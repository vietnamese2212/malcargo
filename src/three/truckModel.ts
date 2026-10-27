// Xe tải thùng kín dựng bằng code theo ĐÚNG lòng thùng khai — cabin, bánh, gầm co giãn theo cỡ xe
// (xe 1,5 tấn khác xe 15 tấn), không dùng mô hình tải về vì mô hình cố định không khớp kích thước.
// Hệ toạ độ (mét): X dọc thân xe (0 = mặt trong vách đầu thùng, cabin ở phía X âm), Y lên trên,
// Z bề ngang (giữa xe = 0). Lòng thùng: x∈[0,L] · y∈[floorY, floorY+H] · z∈[-W/2, W/2].
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { glassTexture, grilleTexture, woodTexture } from './textures'

export interface TruckDimsM { L: number; W: number; H: number; pallet: boolean }

export interface TruckHandle {
  group: THREE.Group
  floorY: number
  panels: THREE.Object3D[]      // vách hông + nóc trong suốt (bật/tắt khi muốn nhìn vào trong)
  nearPanels: THREE.Object3D[]  // vách phía người xem (+Z) + nóc
  bounds: { minX: number; maxX: number; topY: number; halfW: number }
  dispose: () => void
}

const WALL = 0.045

export function buildTruck(d: TruckDimsM): TruckHandle {
  const { L, W, H } = d
  const g = new THREE.Group()
  const disposables: { dispose: () => void }[] = []
  const track = <T extends { dispose: () => void }>(x: T) => { disposables.push(x); return x }

  // ── cỡ theo hạng xe ────────────────────────────────────────────────────────
  const s = THREE.MathUtils.clamp((L - 3) / 6.5, 0, 1)            // 0 = xe 1,5t · 1 = xe 15t
  const r = 0.34 + 0.19 * s                                          // bán kính bánh
  const tw = 0.2 + 0.08 * s                                          // bề rộng lốp
  const chassisTop = 2 * r * 0.9 + 0.1
  const floorY = chassisTop + 0.14
  const Wout = W + 2 * WALL
  const cl = 1.35 + 0.6 * s                                          // dài cabin
  const cw = THREE.MathUtils.clamp(Wout - 0.02, 1.55, 2.48)
  const cabRear = -0.06 - 0.14
  const xf = cabRear - cl                                            // mặt trước cabin
  const cb = r * 1.05                                                // đáy cabin
  const cabTop = cb + 1.5 + 0.8 * s
  const beltY = cb + (cabTop - cb) * 0.46
  const slant = 0.12 + 0.06 * s
  const boxTop = floorY + H + 0.06

  // ── vật liệu ───────────────────────────────────────────────────────────────
  const paint = track(new THREE.MeshPhysicalMaterial({ color: '#f3f5f8', roughness: 0.32, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12 }))
  const panelPaint = track(new THREE.MeshStandardMaterial({ color: '#eceff3', roughness: 0.55, metalness: 0.05 }))
  const alu = track(new THREE.MeshStandardMaterial({ color: '#c3c9d1', roughness: 0.32, metalness: 0.85 }))
  const darkMetal = track(new THREE.MeshStandardMaterial({ color: '#262a31', roughness: 0.6, metalness: 0.4 }))
  const rubber = track(new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: 0.92, metalness: 0 }))
  const chrome = track(new THREE.MeshStandardMaterial({ color: '#e3e7ec', roughness: 0.15, metalness: 1 }))
  const navy = track(new THREE.MeshStandardMaterial({ color: '#0b1424', roughness: 0.5 }))
  const brand = track(new THREE.MeshStandardMaterial({ color: '#1a66ff', roughness: 0.45 }))
  const glassTex = track(glassTexture())
  const glass = track(new THREE.MeshPhysicalMaterial({ map: glassTex, roughness: 0.05, metalness: 0.3, clearcoat: 1, side: THREE.DoubleSide }))
  const headlight = track(new THREE.MeshStandardMaterial({ color: '#f4f8ff', emissive: '#dfe9ff', emissiveIntensity: 0.35, roughness: 0.1, metalness: 0.6 }))
  const amber = track(new THREE.MeshStandardMaterial({ color: '#f0a020', emissive: '#a35f00', emissiveIntensity: 0.3, roughness: 0.3 }))
  const red = track(new THREE.MeshStandardMaterial({ color: '#c0182a', emissive: '#7a0010', emissiveIntensity: 0.4, roughness: 0.3 }))
  const grilleTex = track(grilleTexture())
  const grille = track(new THREE.MeshStandardMaterial({ map: grilleTex, roughness: 0.5, metalness: 0.5 }))
  const woodTex = track(woodTexture(Math.max(5, Math.round(W / 0.2))))
  woodTex.wrapS = THREE.RepeatWrapping
  woodTex.repeat.set(Math.max(1, L / 2.4), 1)
  const wood = track(new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85 }))
  const wall = track(new THREE.MeshPhysicalMaterial({
    color: '#e8eef6', roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide,
  }))

  const box = (w: number, h: number, dd: number, m: THREE.Material, x: number, y: number, z: number, cast = true) => {
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, dd)), m)
    mesh.position.set(x, y, z); mesh.castShadow = cast; mesh.receiveShadow = true
    g.add(mesh); return mesh
  }
  const rbox = (w: number, h: number, dd: number, rad: number, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(track(new RoundedBoxGeometry(w, h, dd, 3, rad)), m)
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true
    g.add(mesh); return mesh
  }

  // ── CABIN: tiết diện hông (đầu bằng, kính hơi ngả) đùn theo bề ngang, bo cạnh ──────────────
  const bev = 0.05
  const prof = new THREE.Shape()
  prof.moveTo(cabRear - bev, cb + bev)
  prof.lineTo(xf + bev + 0.03, cb + bev)
  prof.lineTo(xf + bev, cb + bev + 0.12)
  prof.lineTo(xf + bev, beltY)
  prof.lineTo(xf + bev + slant, cabTop - bev - 0.06)
  prof.quadraticCurveTo(xf + bev + slant + 0.03, cabTop - bev, xf + bev + slant + 0.2, cabTop - bev)
  prof.lineTo(cabRear - bev, cabTop - bev)
  prof.closePath()
  const cabGeo = track(new THREE.ExtrudeGeometry(prof, { depth: cw - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4, curveSegments: 8 }))
  cabGeo.translate(0, 0, -(cw - 2 * bev) / 2)
  const cab = new THREE.Mesh(cabGeo, paint)
  cab.castShadow = true; cab.receiveShadow = true
  g.add(cab)

  // kính chắn gió — nằm trên mặt ngả phía trước
  {
    const A = new THREE.Vector2(xf, beltY + 0.05), B = new THREE.Vector2(xf + slant, cabTop - 0.14)
    const dir = B.clone().sub(A), len = dir.length(); dir.normalize()
    const n = new THREE.Vector3(-dir.y, dir.x, 0)
    const mid = new THREE.Vector3((A.x + B.x) / 2, (A.y + B.y) / 2, 0).addScaledVector(n, 0.004)
    const ws = new THREE.Mesh(track(new THREE.PlaneGeometry(cw - 0.22, len)), glass)
    ws.position.copy(mid); ws.up.set(dir.x, dir.y, 0); ws.lookAt(mid.clone().add(n))
    g.add(ws)
    // gạt mưa
    for (const z of [-cw * 0.18, cw * 0.18]) {
      const wp = box(0.012, 0.012, cw * 0.32, darkMetal, A.x - 0.006, A.y + 0.03, z)
      wp.rotation.x = 0.25
    }
  }
  // kính hông + cửa
  for (const side of [1, -1]) {
    const z = side * (cw / 2 + 0.002)
    const y0 = beltY + 0.06, y1 = cabTop - 0.16
    const fx = (y: number) => xf + 0.12 + slant * ((y - beltY) / (cabTop - beltY))
    const xr = xf + cl * 0.58
    const sh = new THREE.Shape()
    sh.moveTo(xr, y0); sh.lineTo(fx(y0), y0); sh.lineTo(fx(y1), y1); sh.lineTo(xr, y1); sh.closePath()
    const win = new THREE.Mesh(track(new THREE.ShapeGeometry(sh)), glass)
    win.position.z = z
    g.add(win)
    // kính sau nhỏ
    const back = new THREE.Mesh(track(new THREE.PlaneGeometry(cl * 0.22, y1 - y0 - 0.06)), glass)
    back.position.set(xr + 0.08 + cl * 0.11, (y0 + y1) / 2, z); if (side < 0) back.rotation.y = Math.PI
    g.add(back)
    // khe cửa + tay nắm
    box(0.006, cabTop - cb - 0.3, 0.004, darkMetal, xr + 0.03, (cb + cabTop) / 2 + 0.02, z, false)
    box(0.12, 0.025, 0.02, chrome, xr - 0.12, beltY - 0.04, z + side * 0.01, false)
    // sọc thương hiệu dọc hông cabin
    box(cl * 0.92, 0.05, 0.004, navy, (xf + cabRear) / 2 + 0.03, beltY - 0.12, z, false)
    box(cl * 0.92, 0.014, 0.004, brand, (xf + cabRear) / 2 + 0.03, beltY - 0.085, z, false)
    // bậc lên xuống
    box(0.36, 0.04, 0.16, darkMetal, xr - 0.15, cb - 0.18, side * (cw / 2 - 0.05))
    // gương chiếu hậu
    const armY = beltY + 0.18
    const arm = box(0.03, 0.03, 0.22, darkMetal, xf + 0.2, armY, side * (cw / 2 + 0.11), false)
    arm.rotation.y = side * 0.25
    rbox(0.07, 0.36, 0.17, 0.025, darkMetal, xf + 0.18, armY - 0.06, side * (cw / 2 + 0.24))
    box(0.004, 0.3, 0.13, glass, xf + 0.217, armY - 0.06, side * (cw / 2 + 0.24), false)
    // đèn xi nhan góc
    box(0.03, 0.06, 0.1, amber, xf - 0.012, cb + 0.36, side * (cw / 2 - 0.07), false)
  }
  // mặt trước: lưới tản nhiệt, đèn, cản, logo
  box(0.012, beltY - cb - 0.42, cw * 0.6, grille, xf - 0.012, (cb + 0.3 + beltY - 0.12) / 2, 0, false)
  box(0.014, 0.05, cw * 0.18, chrome, xf - 0.014, beltY - 0.07, 0, false)
  for (const side of [1, -1]) {
    rbox(0.05, 0.15, cw * 0.17, 0.03, headlight, xf - 0.01, cb + 0.36, side * (cw / 2 - cw * 0.16))
  }
  rbox(0.2, 0.24, cw + 0.04, 0.04, darkMetal, xf + 0.03, cb + 0.08, 0)

  // tấm chắn gió nóc cabin — chỉ khi thùng cao hơn cabin rõ rệt
  if (boxTop - cabTop > 0.25) {
    const top = boxTop - 0.04
    const sp = new THREE.Shape()
    sp.moveTo(cabRear - cl * 0.72, cabTop - 0.01)
    sp.lineTo(cabRear - 0.02, cabTop - 0.01)
    sp.lineTo(cabRear - 0.02, top)
    sp.lineTo(cabRear - 0.32, top)
    sp.quadraticCurveTo(cabRear - cl * 0.45, cabTop + (top - cabTop) * 0.45, cabRear - cl * 0.72, cabTop - 0.01)
    const dw = cw * 0.9
    const spGeo = track(new THREE.ExtrudeGeometry(sp, { depth: dw - 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 3 }))
    spGeo.translate(0, 0, -(dw - 0.06) / 2)
    const spoiler = new THREE.Mesh(spGeo, paint)
    spoiler.castShadow = true
    g.add(spoiler)
  }

  // ── KHUNG GẦM ─────────────────────────────────────────────────────────────
  const railZ = Math.min(0.46, Wout * 0.22)
  for (const z of [railZ, -railZ]) box(L - xf + 0.1, 0.2, 0.08, darkMetal, (xf + 0.3 + L + 0.1) / 2, chassisTop - 0.1, z)
  // dầm ngang dưới sàn thùng
  for (let x = 0.2; x < L; x += 0.55) box(0.07, 0.12, Wout - 0.06, darkMetal, x, floorY - 0.14, 0)

  // ── BÁNH ──────────────────────────────────────────────────────────────────
  const tireGeo = track(new THREE.CylinderGeometry(r, r, tw, 48, 1))
  tireGeo.rotateX(Math.PI / 2)
  const sideWallGeo = track(new THREE.TorusGeometry(r - tw * 0.18, tw * 0.18, 10, 48))
  const rimGeo = track(new THREE.CylinderGeometry(r * 0.6, r * 0.6, tw + 0.006, 32))
  rimGeo.rotateX(Math.PI / 2)
  const rimRingGeo = track(new THREE.TorusGeometry(r * 0.6, 0.016, 8, 36))
  const hubGeo = track(new THREE.CylinderGeometry(r * 0.2, r * 0.24, tw + 0.05, 20))
  hubGeo.rotateX(Math.PI / 2)
  const wheel = (x: number, z: number, outer: boolean) => {
    const wg = new THREE.Group()
    const tire = new THREE.Mesh(tireGeo, rubber); tire.castShadow = true
    wg.add(tire)
    for (const sz of [tw / 2 - tw * 0.18, -(tw / 2 - tw * 0.18)]) {
      const sw = new THREE.Mesh(sideWallGeo, rubber); sw.position.z = sz; wg.add(sw)
    }
    wg.add(new THREE.Mesh(rimGeo, alu))
    const ring = new THREE.Mesh(rimRingGeo, chrome); ring.position.z = (outer ? 1 : -1) * (tw / 2 + 0.004) * Math.sign(z); wg.add(ring)
    wg.add(new THREE.Mesh(hubGeo, darkMetal))
    wg.position.set(x, r, z)
    g.add(wg)
  }
  const outerZ = Wout / 2 - 0.06 - tw / 2
  const frontX = xf + cl * 0.42
  for (const sd of [1, -1]) wheel(frontX, sd * outerZ, true)
  const rearAxles = L > 7 ? [L * 0.6, L * 0.6 + 2 * r + 0.14] : [L * 0.64]
  for (const ax of rearAxles) for (const sd of [1, -1]) {
    wheel(ax, sd * outerZ, true)
    wheel(ax, sd * (outerZ - tw - 0.03), false)
  }
  // trục
  for (const ax of [frontX, ...rearAxles]) {
    const axle = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.05, Wout - 0.3, 12)), darkMetal)
    axle.rotation.x = Math.PI / 2; axle.position.set(ax, r, 0); g.add(axle)
  }
  // chắn bùn sau bánh cuối + vè trên bánh sau
  const lastAxle = rearAxles[rearAxles.length - 1]
  for (const sd of [1, -1]) {
    box(0.02, floorY - 0.16 - r * 0.35, tw * 2 + 0.06, rubber, lastAxle + r + 0.12, (floorY - 0.16 + r * 0.35) / 2, sd * (outerZ - tw / 2 - 0.015))
  }
  // bình dầu + thanh chắn hông
  const tankX = frontX + r + 0.3 + 0.35
  if (tankX + 0.4 < rearAxles[0] - r - 0.1) {
    const tank = new THREE.Mesh(track(new THREE.CylinderGeometry(0.2 + 0.05 * s, 0.2 + 0.05 * s, 0.75, 28)), alu)
    tank.rotation.z = Math.PI / 2; tank.position.set(tankX, chassisTop - 0.33, Wout / 2 - 0.36); tank.castShadow = true
    g.add(tank)
  }
  const gx0 = Math.max(frontX + r + 0.2, 0.15), gx1 = rearAxles[0] - r - 0.15
  if (gx1 - gx0 > 0.6) for (const sd of [1, -1]) for (const y of [floorY - 0.42, floorY - 0.24]) {
    box(gx1 - gx0, 0.05, 0.03, alu, (gx0 + gx1) / 2, y, sd * (Wout / 2 - 0.03))
  }

  // ── THÙNG ─────────────────────────────────────────────────────────────────
  box(L, 0.08, Wout, wood, L / 2, floorY - 0.04, 0)                      // sàn gỗ (mặt trên = floorY)
  for (const sd of [1, -1]) box(L, 0.14, 0.05, alu, L / 2, floorY - 0.05, sd * (Wout / 2 - 0.02))  // dầm biên
  box(0.06, H + 0.06, Wout, panelPaint, -0.03, floorY + (H + 0.06) / 2, 0)   // vách đầu (kín)
  // khung: cột góc, cột hông, ray nóc
  const post = 0.07
  for (const x of [0, L]) for (const sd of [1, -1]) box(post, H + 0.06, post, alu, x + (x ? -post / 2 + 0.03 : post / 2 - 0.03), floorY + (H + 0.06) / 2, sd * (Wout / 2 - post / 2))
  // vách hông + nóc trong suốt; khi "mở" thì ẩn cả vách, cột và vòm nóc phía người xem
  const panels: THREE.Object3D[] = []
  const nearPanels: THREE.Object3D[] = []
  for (const sd of [1, -1]) {
    box(L, 0.07, 0.05, alu, L / 2, floorY + H + 0.03, sd * (Wout / 2 - 0.025))
    for (let x = 0.62; x < L - 0.3; x += 0.62) {
      const ps = box(0.035, H, 0.028, alu, x, floorY + H / 2, sd * (Wout / 2 - 0.014))
      if (sd > 0) nearPanels.push(ps)
    }
  }
  for (let x = 0.62; x < L - 0.3; x += 0.62) nearPanels.push(box(0.04, 0.035, Wout - 0.06, alu, x, floorY + H + 0.045, 0, false))
  box(0.08, 0.1, Wout, alu, L - 0.01, floorY + H + 0.02, 0)               // khung cửa trên
  for (const sd of [1, -1]) {
    const p = box(L, H, 0.012, wall, L / 2, floorY + H / 2, sd * (Wout / 2 - 0.02), false)
    p.receiveShadow = false; panels.push(p); if (sd > 0) nearPanels.push(p)
  }
  const roof = box(L, 0.012, Wout - 0.04, wall, L / 2, floorY + H + 0.05, 0, false)
  roof.receiveShadow = false; panels.push(roof); nearPanels.push(roof)
  // cửa sau mở ~100°, mỗi cánh một nửa bề ngang
  const leafW = Wout / 2
  for (const sd of [1, -1]) {
    const pivot = new THREE.Group()
    pivot.position.set(L + 0.01, floorY, sd * (Wout / 2))
    pivot.rotation.y = sd * THREE.MathUtils.degToRad(100) * -1
    const leaf = new THREE.Mesh(track(new THREE.BoxGeometry(0.045, H + 0.02, leafW)), panelPaint)
    leaf.position.set(0, (H + 0.02) / 2, -sd * leafW / 2)
    leaf.castShadow = true; leaf.receiveShadow = true
    pivot.add(leaf)
    for (const off of [0.25, 0.75]) {
      const bar = new THREE.Mesh(track(new THREE.CylinderGeometry(0.014, 0.014, H - 0.1, 10)), chrome)
      bar.position.set(0.035, (H + 0.02) / 2, -sd * leafW * off)
      pivot.add(bar)
    }
    for (const hy of [0.25, H * 0.5, H - 0.25]) {
      const hinge = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 0.05, 0.14)), darkMetal)
      hinge.position.set(0.03, hy, -sd * 0.07)
      pivot.add(hinge)
    }
    g.add(pivot)
  }
  // cản sau + đèn hậu
  box(0.1, 0.1, Wout - 0.2, darkMetal, L + 0.04, floorY - 0.42, 0)
  for (const sd of [1, -1]) {
    box(0.04, 0.12, 0.26, red, L + 0.03, floorY - 0.24, sd * (Wout / 2 - 0.22), false)
    box(0.04, 0.12, 0.08, amber, L + 0.03, floorY - 0.24, sd * (Wout / 2 - 0.4), false)
  }

  return {
    group: g, floorY, panels, nearPanels,
    bounds: { minX: xf - 0.1, maxX: L + 0.2, topY: Math.max(boxTop, cabTop), halfW: Wout / 2 + 0.3 },
    dispose: () => disposables.forEach(x => x.dispose()),
  }
}
