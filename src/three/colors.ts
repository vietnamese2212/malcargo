// Màu từng mã hàng — dùng chung cho sơ đồ 3D và chú thích, để ô màu ở danh sách khớp đúng thùng.
// KHÔNG import three ở đây: file này nằm trong gói chính, three chỉ tải khi màn 3D mở.
import type { PlanGroupMeta } from '../engine/plan'

const PALETTE = [
  '#2f6fe0', '#d9622b', '#2a9d8f', '#8e5bd0', '#d43f52', '#c99a1a',
  '#1f9fc4', '#c2508e', '#4b5fd1', '#6d9c2f', '#a8642c', '#3a8c6e',
]
const KRAFT = [0xc9, 0xa7, 0x7c]

/** Màu nhóm pha với màu giấy carton — nhìn như thùng thật mà vẫn phân biệt được mã. */
export function tint(hex: string, kraft = 0.32): string {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => Math.round(v + (KRAFT[i] - v) * kraft))
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('')
}

/** colorKey → màu gốc, ổn định theo thứ tự xuất hiện. Pallet gộp nhiều mã luôn màu xám. */
export function colorMap(meta: PlanGroupMeta[]): Map<string, string> {
  const m = new Map<string, string>()
  let i = 0
  for (const g of meta) {
    if (m.has(g.colorKey)) continue
    if (g.colorKey.startsWith('mix|')) { m.set(g.colorKey, '#7d8794'); continue }
    m.set(g.colorKey, PALETTE[i++ % PALETTE.length])
  }
  return m
}

export const groupColor = (meta: PlanGroupMeta, colors: Map<string, string>) =>
  tint(colors.get(meta.colorKey) ?? '#7d8794')
