// Vân bề mặt vẽ bằng canvas — không tải ảnh ngoài, chạy được khi mất mạng.
import * as THREE from 'three'

function canvas(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const el = document.createElement('canvas')
  el.width = w; el.height = h
  const c = el.getContext('2d')!
  draw(c)
  const t = new THREE.CanvasTexture(el)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

// Nhiễu hạt mịn — giấy carton, bê tông, gỗ đều cần một chút để không trông như nhựa
function grain(c: CanvasRenderingContext2D, w: number, h: number, amount: number, n = 2400) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() < 0.5 ? 0 : 255
    c.fillStyle = `rgba(${v},${v},${v},${Math.random() * amount})`
    c.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5)
  }
}

function edgeShade(c: CanvasRenderingContext2D, w: number, h: number, strength: number) {
  const g = c.createLinearGradient(0, 0, w, 0)
  g.addColorStop(0, `rgba(0,0,0,${strength})`); g.addColorStop(0.06, 'rgba(0,0,0,0)')
  g.addColorStop(0.94, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${strength})`)
  c.fillStyle = g; c.fillRect(0, 0, w, h)
  const v = c.createLinearGradient(0, 0, 0, h)
  v.addColorStop(0, `rgba(0,0,0,${strength})`); v.addColorStop(0.06, 'rgba(0,0,0,0)')
  v.addColorStop(0.94, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${strength})`)
  c.fillStyle = v; c.fillRect(0, 0, w, h)
}

/** Mặt nóc thùng: giấy + băng keo chạy dọc giữa. Màu nhóm nhân vào qua instanceColor. */
export const cartonTopTexture = () => canvas(256, 256, c => {
  c.fillStyle = '#f4efe6'; c.fillRect(0, 0, 256, 256)
  grain(c, 256, 256, 0.05)
  // nắp gấp: đường giữa
  c.fillStyle = 'rgba(0,0,0,0.10)'; c.fillRect(0, 126, 256, 3)
  // băng keo trong hơi bóng
  c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(0, 104, 256, 48)
  c.fillStyle = 'rgba(0,0,0,0.06)'; c.fillRect(0, 104, 256, 2); c.fillRect(0, 150, 256, 2)
  edgeShade(c, 256, 256, 0.22)
})

/** Mặt hông thùng: giấy, nhãn trắng nhỏ, dấu "hướng lên". */
export const cartonSideTexture = () => canvas(256, 256, c => {
  c.fillStyle = '#f4efe6'; c.fillRect(0, 0, 256, 256)
  grain(c, 256, 256, 0.05)
  c.fillStyle = 'rgba(255,255,255,0.75)'; c.fillRect(150, 150, 76, 54)
  c.fillStyle = 'rgba(30,30,30,0.35)'
  for (let i = 0; i < 4; i++) c.fillRect(158, 160 + i * 10, 40 + (i % 2) * 14, 3)
  // ↑↑ hướng đặt
  c.strokeStyle = 'rgba(30,30,30,0.35)'; c.lineWidth = 4
  for (const x of [40, 64]) {
    c.beginPath(); c.moveTo(x, 92); c.lineTo(x, 50); c.moveTo(x - 9, 60); c.lineTo(x, 48); c.lineTo(x + 9, 60); c.stroke()
  }
  c.fillRect(30, 98, 44, 4)
  edgeShade(c, 256, 256, 0.25)
})

/** Hàng đã quấn màng trên pallet: lưới thùng mờ dưới lớp màng. */
export const wrappedTexture = () => canvas(256, 256, c => {
  c.fillStyle = '#f1ece3'; c.fillRect(0, 0, 256, 256)
  grain(c, 256, 256, 0.04)
  c.strokeStyle = 'rgba(0,0,0,0.16)'; c.lineWidth = 2
  for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(i * 64, 0); c.lineTo(i * 64, 256); c.stroke() }
  for (let i = 1; i < 6; i++) { c.beginPath(); c.moveTo(0, i * 42.6); c.lineTo(256, i * 42.6); c.stroke() }
  // vệt bóng của màng quấn
  for (let i = 0; i < 9; i++) {
    c.fillStyle = `rgba(255,255,255,${0.10 + Math.random() * 0.12})`
    c.fillRect(0, Math.random() * 256, 256, 3 + Math.random() * 6)
  }
  edgeShade(c, 256, 256, 0.18)
})

/** Gỗ: ván chạy dọc. */
export const woodTexture = (planks = 6) => canvas(512, 256, c => {
  const w = 512, h = 256, ph = h / planks
  for (let i = 0; i < planks; i++) {
    const base = 150 + Math.random() * 30
    c.fillStyle = `rgb(${base + 20},${base - 18},${base - 60})`
    c.fillRect(0, i * ph, w, ph)
    for (let k = 0; k < 14; k++) {
      c.strokeStyle = `rgba(90,55,25,${0.08 + Math.random() * 0.12})`
      c.lineWidth = 1 + Math.random() * 1.5
      const y = i * ph + Math.random() * ph
      c.beginPath(); c.moveTo(0, y)
      for (let x = 0; x <= w; x += 32) c.lineTo(x, y + Math.sin(x / 40 + k) * 2)
      c.stroke()
    }
    c.fillStyle = 'rgba(40,22,8,0.55)'; c.fillRect(0, i * ph, w, 2)
  }
  grain(c, w, h, 0.06, 3000)
})

/** Bê tông sân bãi: hạt + khe co giãn. */
export const concreteTexture = () => {
  const t = canvas(512, 512, c => {
    c.fillStyle = '#d9dde2'; c.fillRect(0, 0, 512, 512)
    grain(c, 512, 512, 0.06, 9000)
    // vệt loang rất nhẹ — đậm hơn là lộ hoạ tiết lặp khi lát cả sân
    for (let i = 0; i < 18; i++) {
      c.fillStyle = `rgba(0,0,0,${Math.random() * 0.012})`
      c.beginPath(); c.arc(Math.random() * 512, Math.random() * 512, 40 + Math.random() * 90, 0, Math.PI * 2); c.fill()
    }
    c.fillStyle = 'rgba(0,0,0,0.10)'; c.fillRect(0, 0, 512, 2); c.fillRect(0, 0, 2, 512)
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** Lưới tản nhiệt: nan ngang tối. */
export const grilleTexture = () => canvas(256, 128, c => {
  c.fillStyle = '#16191e'; c.fillRect(0, 0, 256, 128)
  for (let i = 0; i < 7; i++) {
    const y = 10 + i * 16
    const g = c.createLinearGradient(0, y, 0, y + 8)
    g.addColorStop(0, '#5b626c'); g.addColorStop(1, '#2a2f36')
    c.fillStyle = g; c.fillRect(10, y, 236, 8)
  }
})

/** Mặt kính phản chiếu trời nhẹ. */
export const glassTexture = () => canvas(128, 256, c => {
  const g = c.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, '#5b7590'); g.addColorStop(0.45, '#22303f'); g.addColorStop(1, '#141c26')
  c.fillStyle = g; c.fillRect(0, 0, 128, 256)
  c.fillStyle = 'rgba(255,255,255,0.10)'
  c.beginPath(); c.moveTo(0, 40); c.lineTo(128, 0); c.lineTo(128, 30); c.lineTo(0, 90); c.fill()
})
