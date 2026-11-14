// Nhãn SỐ LỚP nổi trên nóc từng vùng hàng (cùng kiểu nhãn tròn tối của SUPPLYC `loadplan3d/marks.ts`). Luôn đọc được: không bị
// vách / hàng che (depthTest tắt), không tính che khuất môi trường (noAO). Chữ "n lớp" dùng chung texture theo nội dung —
// kéo thanh bước / bấm chạy dựng lại nhãn liên tục mà không vẽ lại canvas.
import * as THREE from 'three'
import type { LayerBadge } from './layerBadges'
import { t } from '../i18n'

const FONT = '"Be Vietnam Pro", "Segoe UI", system-ui, Arial, sans-serif'
export interface MarksHandle { group: THREE.Group; update: (badges: LayerBadge[]) => void; dispose: () => void }

export function buildMarks(truck: { length: number; width: number }, floorY: number): MarksHandle {
  const group = new THREE.Group()
  const W = truck.width / 1000, L = truck.length / 1000
  // xe dài thì camera lùi xa: nhãn to theo chiều dài xe để vẫn đọc được
  const k = THREE.MathUtils.clamp(L / 4.5, 1, 2.4)
  // điện thoại: xe vẽ nhỏ ⇒ nhãn to hơn chút cho đọc được (đo 390px: 0,17 m ra chữ ~8px)
  const H = 0.17 * k * (window.innerWidth < 640 ? 1.35 : 1)
  const mats = new Map<string, { mat: THREE.SpriteMaterial; tex: THREE.CanvasTexture; aspect: number }>()
  const matOf = (text: string) => {
    let m = mats.get(text)
    if (m) return m
    const probe = document.createElement('canvas').getContext('2d')!
    probe.font = 'bold 40px ' + FONT
    const el = document.createElement('canvas')
    el.width = Math.max(140, Math.ceil(probe.measureText(text).width) + 56); el.height = 88
    const c = el.getContext('2d')!
    c.fillStyle = 'rgba(11,20,36,0.88)'   // navy thương hiệu
    c.beginPath(); c.roundRect(4, 4, el.width - 8, el.height - 8, 40); c.fill()
    c.fillStyle = '#ffffff'; c.font = 'bold 40px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'
    c.fillText(text, el.width / 2, el.height / 2 + 2)
    const tex = new THREE.CanvasTexture(el)
    tex.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, fog: false, toneMapped: false })
    m = { mat, tex, aspect: el.width / el.height }
    mats.set(text, m)
    return m
  }
  const update = (badges: LayerBadge[]) => {
    group.clear()
    for (const b of badges) {
      const txt = t('{n} lớp', { n: b.n })
      const m = matOf(b.on ? '+' + txt : txt)
      const s = new THREE.Sprite(m.mat)
      s.renderOrder = 10; s.userData.noAO = true
      s.position.set(b.x / 1000, floorY + b.top / 1000 + H * 0.75, W / 2 - b.y / 1000)
      s.scale.set(H * m.aspect, H, 1)
      group.add(s)
    }
  }
  return { group, update, dispose: () => { group.clear(); mats.forEach(m => { m.mat.dispose(); m.tex.dispose() }); mats.clear() } }
}
