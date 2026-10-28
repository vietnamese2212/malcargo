// Khung 3D: dựng một lần, thay xe / hàng / bước / góc nhìn theo props mà không dựng lại cảnh.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { LoadPlan } from '../engine/loadPlan'
import type { PlanGroupMeta } from '../engine/plan'
import { buildTruck, type TruckHandle } from './truckModel'
import { buildCargo, type CargoHandle } from './cargo'
import { concreteTexture } from './textures'
import { t } from '../i18n'

export type ViewPreset = 'overview' | 'rear' | 'top' | 'side'

export interface TruckSceneProps {
  truck: { l: number; w: number; h: number; kind: 'loose' | 'pallet' } | null
  plan?: LoadPlan | null
  meta?: PlanGroupMeta[]
  colors?: Map<string, string>
  step?: number | null
  focus?: Set<number> | null
  focusItem?: string | null   // đang soi một MÃ: trong pallet gộp, thùng mã khác cũng mờ
  view?: { preset: ViewPreset; n: number }
  walls?: 'glass' | 'open'
  className?: string
}

interface Ctx {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  sun: THREE.DirectionalLight
  blob: THREE.Mesh
  truck: TruckHandle | null
  cargo: CargoHandle | null
  dirty: boolean
  tween: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t0: number; dur: number } | null
}

export default function TruckScene(p: TruckSceneProps) {
  const host = useRef<HTMLDivElement>(null)
  const ctx = useRef<Ctx | null>(null)
  const [noGL, setNoGL] = useState(false)

  // ── dựng cảnh một lần ────────────────────────────────────────────────────
  useEffect(() => {
    const el = host.current!
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true })
    } catch { setNoGL(true); return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    el.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.touchAction = 'none'

    const scene = new THREE.Scene()
    const sky = new THREE.Color('#dde3ea')
    scene.background = sky
    scene.fog = new THREE.Fog(sky, 28, 75)
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = envTex
    scene.environmentIntensity = 0.55

    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200)
    camera.position.set(12, 6, 9)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.maxPolarAngle = Math.PI * 0.495
    controls.minDistance = 1.5
    controls.maxDistance = 45
    controls.zoomToCursor = true
    controls.screenSpacePanning = true

    scene.add(new THREE.HemisphereLight('#f4f8ff', '#9aa3ad', 0.55))
    const sun = new THREE.DirectionalLight('#fff6ea', 2.4)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.bias = -0.0003
    sun.shadow.normalBias = 0.025
    sun.shadow.radius = 4
    scene.add(sun, sun.target)
    const fill = new THREE.DirectionalLight('#dbe7ff', 0.5)
    fill.position.set(-8, 5, -10)
    scene.add(fill)

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({ map: (() => { const t = concreteTexture(); t.repeat.set(40, 40); return t })(), color: '#b9c0c9', roughness: 0.95 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)
    // bóng mờ sát gầm — xe "đứng" trên nền chứ không lơ lửng
    const blobCanvas = document.createElement('canvas'); blobCanvas.width = blobCanvas.height = 128
    const bc = blobCanvas.getContext('2d')!
    const rg = bc.createRadialGradient(64, 64, 8, 64, 64, 64)
    rg.addColorStop(0, 'rgba(0,0,0,0.6)'); rg.addColorStop(0.55, 'rgba(0,0,0,0.25)'); rg.addColorStop(1, 'rgba(0,0,0,0)')
    bc.fillStyle = rg; bc.fillRect(0, 0, 128, 128)
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blobCanvas), transparent: true, depthWrite: false }))
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.003
    scene.add(blob)

    const c: Ctx = { renderer, scene, camera, controls, sun, blob, truck: null, cargo: null, dirty: true, tween: null }
    ctx.current = c
    controls.addEventListener('change', () => { c.dirty = true })

    const resize = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1
      renderer.setSize(w, h, false)
      renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'
      camera.aspect = w / h; camera.updateProjectionMatrix(); c.dirty = true
    }
    const ro = new ResizeObserver(resize); ro.observe(el); resize()

    let raf = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (c.tween) {
        const k = Math.min(1, (now - c.tween.t0) / c.tween.dur)
        const e = 1 - Math.pow(1 - k, 3)
        camera.position.lerpVectors(c.tween.from, c.tween.to, e)
        controls.target.lerpVectors(c.tween.tFrom, c.tween.tTo, e)
        if (k >= 1) c.tween = null
        c.dirty = true
      }
      if (controls.update()) c.dirty = true
      if (c.dirty) { renderer.render(scene, camera); c.dirty = false }
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose()
      c.cargo?.dispose(); c.truck?.dispose()
      envTex.dispose(); pmrem.dispose()
      scene.traverse(o => {
        const m = o as THREE.Mesh
        if (m.isMesh) { m.geometry?.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x?.dispose()) }
      })
      renderer.dispose(); renderer.domElement.remove(); ctx.current = null
    }
  }, [])

  // ── xe ───────────────────────────────────────────────────────────────────
  const tk = p.truck ? `${p.truck.l}|${p.truck.w}|${p.truck.h}|${p.truck.kind}` : ''
  useEffect(() => {
    const c = ctx.current
    if (!c) return
    if (c.truck) { c.scene.remove(c.truck.group); c.truck.dispose(); c.truck = null }
    if (!p.truck) { c.dirty = true; return }
    const t = buildTruck({ L: p.truck.l / 1000, W: p.truck.w / 1000, H: p.truck.h / 1000, pallet: p.truck.kind === 'pallet' })
    c.truck = t
    c.scene.add(t.group)
    const b = t.bounds
    const cx = (b.minX + b.maxX) / 2, len = b.maxX - b.minX
    c.blob.scale.set(len + 1.6, b.halfW * 2 + 1.2, 1); c.blob.position.x = cx
    const span = Math.max(len, 4)
    c.sun.position.set(cx - span * 0.35, span * 1.3 + 4, span * 0.75 + 3)
    c.sun.target.position.set(cx, 0, 0)
    const sc = c.sun.shadow.camera
    sc.left = -span * 0.8; sc.right = span * 0.8; sc.top = span * 0.8; sc.bottom = -span * 0.8
    sc.near = 0.5; sc.far = span * 4 + 20; sc.updateProjectionMatrix()
    applyWalls(t, p.walls ?? 'open')
    goTo(c, 'overview', false)
    c.dirty = true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tk])

  // ── hàng ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const c = ctx.current
    if (!c) return
    if (c.cargo) { c.scene.remove(c.cargo.group); c.cargo.dispose(); c.cargo = null }
    if (p.plan && c.truck && p.meta && p.colors && p.plan.placed.length) {
      const cg = buildCargo(p.plan, p.meta, p.colors, c.truck.floorY)
      c.cargo = cg
      c.scene.add(cg.group)
      cg.setStep(p.step ?? null)
      cg.setFocus(p.focus ?? null, p.focusItem)
    }
    c.dirty = true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.plan, tk])

  useEffect(() => { const c = ctx.current; if (c?.cargo) { c.cargo.setStep(p.step ?? null); c.dirty = true } }, [p.step])
  useEffect(() => { const c = ctx.current; if (c?.cargo) { c.cargo.setFocus(p.focus ?? null, p.focusItem); c.dirty = true } }, [p.focus, p.focusItem])
  useEffect(() => { const c = ctx.current; if (c?.truck) { applyWalls(c.truck, p.walls ?? 'open'); c.dirty = true } }, [p.walls])
  useEffect(() => { const c = ctx.current; if (c && p.view) goTo(c, p.view.preset, true) }, [p.view?.n])

  return (
    <div ref={host} className={`relative overflow-hidden ${p.className ?? ''}`}>
      {noGL && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-slate-500">
          {t('Trình duyệt này không hiển thị được 3D. Số liệu và bảng đếm chân vẫn dùng bình thường.')}
        </div>
      )}
    </div>
  )
}

function applyWalls(t: TruckHandle, walls: 'glass' | 'open') {
  for (const o of t.panels) o.visible = true
  if (walls === 'open') for (const o of t.nearPanels) o.visible = false
}

function goTo(c: Ctx, preset: ViewPreset, animate: boolean) {
  const t = c.truck
  if (!t) return
  const b = t.bounds
  const cx = (b.minX + b.maxX) / 2, len = b.maxX - b.minX
  // Căn khung theo KHỐI CẦU bao xe + góc nhìn ngang/dọc của khung — xe nào, màn nào cũng lọt trọn
  const vfov = THREE.MathUtils.degToRad(c.camera.fov)
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * c.camera.aspect)
  const fov = Math.min(vfov, hfov)
  const sphere = (dx: number, dy: number, dz: number) => 0.5 * Math.sqrt(dx * dx + dy * dy + dz * dz)
  const dist = (rad: number, k: number) => (rad / Math.sin(fov / 2)) * k
  const tgt = new THREE.Vector3(cx, b.topY * 0.5, 0)
  let dir: THREE.Vector3, rad: number, k = 0.9
  switch (preset) {
    case 'rear':
      dir = new THREE.Vector3(1, 0.32, 0.22); rad = sphere(b.halfW * 2, b.topY, 2); k = 1.05
      tgt.set(b.maxX - 1.2, t.floorY + (b.topY - t.floorY) * 0.45, 0); break
    case 'top':
      dir = new THREE.Vector3(0.0001, 1, 0.0001); rad = sphere(len, 0, b.halfW * 2); k = 1.0
      tgt.set(cx, t.floorY, 0); break
    case 'side':
      dir = new THREE.Vector3(0, 0.16, 1); rad = sphere(len, b.topY, 0); k = 1.0; break
    default:
      // nhỉnh hơn khối cầu để cánh cửa mở ở đuôi không chạm mép; tâm hơi thấp để xe nằm trên thanh bước
      dir = new THREE.Vector3(0.62, 0.5, 0.78); rad = sphere(len + 0.8, b.topY, b.halfW * 2); k = 0.95
      tgt.y = b.topY * 0.36
  }
  const pos = tgt.clone().addScaledVector(dir.normalize(), Math.max(dist(rad, k), 2.5))
  if (!animate) {
    c.camera.position.copy(pos); c.controls.target.copy(tgt); c.controls.update(); c.dirty = true; return
  }
  c.tween = { from: c.camera.position.clone(), to: pos, tFrom: c.controls.target.clone(), tTo: tgt, t0: performance.now(), dur: 650 }
}
