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

const MIXED = '#7d8794'
// Màu quen của các mã mẫu chung (chỉ số trong PALETTE) — giữ đúng màu người dùng đã thấy trước khi màu
// thành cố định theo mã (27/10): Sữa chua 180 xanh dương, Thạch túi cam, Sữa 180 xanh ngọc, Sữa 110 tím…
const SAMPLE_HOME: Record<string, number> = { SCU180: 0, TUI110: 1, ST180: 2, ST110: 3, C100: 4, C85: 5, TH170: 7 }
const norm = (code: string) => code.trim().toUpperCase().replace(/^MAU-/, '')
const hash = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }

/**
 * id mã hàng → màu gốc, CỐ ĐỊNH theo MÃ — không theo thứ tự xếp, xe hay cách chở: đổi gì trên chuyến
 * thì thùng / pallet của mã vẫn giữ màu, mắt theo được nó đi đâu. "Màu nhà" của mã: mã mẫu theo bảng
 * trên (bản "của tôi" sao từ mã mẫu — bỏ tiền tố MAU- — cùng màu mẫu); mã khác băm từ mã. Hai mã cùng
 * chuyến trùng màu nhà: mã mẫu giữ màu, mã đến sau trong danh sách hàng của chuyến lấy màu trống kế tiếp.
 * Pallet gộp nhiều mã luôn màu xám (không có trong map).
 */
export function itemColors(tripItems: { id: string; code: string }[]): Map<string, string> {
  const isSample = (code: string) => SAMPLE_HOME[norm(code)] != null
  const m = new Map<string, string>(), used = new Set<number>()
  const list = [...new Map(tripItems.map(it => [it.id, it])).values()]
  for (const it of [...list.filter(x => isSample(x.code)), ...list.filter(x => !isSample(x.code))]) {
    let k = SAMPLE_HOME[norm(it.code)] ?? hash(norm(it.code) || it.id) % PALETTE.length
    for (let n = 0; n < PALETTE.length && used.has(k); n++) k = (k + 1) % PALETTE.length
    used.add(k); m.set(it.id, PALETTE[k])
  }
  return m
}

export const groupColor = (meta: PlanGroupMeta, colors: Map<string, string>) =>
  tint(colors.get(meta.colorKey) ?? MIXED)
