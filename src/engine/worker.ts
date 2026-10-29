/// <reference lib="webworker" />
// Tính sơ đồ trong luồng nền — đơn vài nghìn thùng × nhiều cỡ xe không làm đứng giao diện.
import { computeTrip, orderTotals, suggestTruck, type TripInput, type TruckInput, type TripResult } from './plan'

/** Kết quả thử hàng của chuyến trên MỘT xe: chở hết · thiếu chỗ · quá tải. */
export type FitCheck = 'fit' | 'space' | 'weight'
export type WorkerReq = { id: number; input: TripInput; candidates: TruckInput[]; checkAll?: TruckInput[] }
export type WorkerRes = { id: number; result: TripResult; suggestion: string | null; fits: Record<string, FitCheck> | null } | { id: number; error: string }

self.onmessage = (e: MessageEvent<WorkerReq>) => {
  const { id, input, candidates, checkAll } = e.data
  try {
    const result = computeTrip(input)
    // Xe hiện tại đã vừa thì vẫn tìm xe NHỎ hơn mà vẫn vừa (tiết kiệm cước)
    const suggestion = suggestTruck(input.orders, input.pallet, candidates, input.lightOwnPallet)
    // Bảng đổi xe đang mở: thử hàng trên từng xe để đánh dấu ✓ / ✗ ngay trong danh sách.
    // Lọc nhanh bằng thể tích + tải trước, chỉ xe qua được mới chạy thuật toán xếp.
    let fits: Record<string, FitCheck> | null = null
    if (checkAll) {
      fits = {}
      const t = orderTotals(input.orders.flatMap(o => o.lines), input.pallet)
      for (const c of checkAll) {
        if (c.payloadKg && t.kgKnown && t.kg > c.payloadKg) { fits[c.id] = 'weight'; continue }
        if ((c.l * c.w * c.h) / 1e9 < t.m3) { fits[c.id] = 'space'; continue }
        const r = computeTrip({ ...input, truck: c, quick: true })
        fits[c.id] = r.fits ? 'fit' : r.overweight ? 'weight' : 'space'
      }
    }
    ;(self as unknown as Worker).postMessage({ id, result, suggestion, fits } satisfies WorkerRes)
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies WorkerRes)
  }
}
