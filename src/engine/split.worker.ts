/// <reference lib="webworker" />
// Chia ra nhiều xe trong luồng nền (mỗi xe tính lại đủ bước — đơn lớn mất vài giây). Worker riêng: worker sơ đồ bị huỷ mỗi lần
// đổi cấu hình (useTripPlan), không được kéo theo lượt chia đang chạy.
import { splitTrip, partInput, type SplitResult } from './split'
import { computeTrip, suggestTruck, type TripInput, type TruckInput } from './plan'

export type SplitReq = { input: TripInput; candidates: TruckInput[] }
/** `lastTruck`: xe nhỏ hơn vẫn chở hết phần CUỐI (thường chỉ còn ít hàng) — null = không có / chính xe này. */
export type SplitRes = { progress: number } | { done: SplitResult & { lastTruck: string | null } } | { error: string }

const post = (m: SplitRes) => (self as unknown as Worker).postMessage(m)
self.onmessage = (e: MessageEvent<SplitReq>) => {
  const { input, candidates } = e.data
  try {
    const res = splitTrip(input, 20, k => post({ progress: k }))
    let lastTruck: string | null = null
    if (!res.error && res.parts.length > 1) {
      const vol = (t: TruckInput) => t.l * t.w * t.h
      const smaller = candidates.filter(c => c.kind === input.truck.kind && vol(c) < vol(input.truck))
      const last = partInput(input, res.parts[res.parts.length - 1])
      lastTruck = smaller.length ? suggestTruck(last.orders, input.pallet, smaller, input.lightOwnPallet, input.lightOwnLoose) : null
      // gợi ý xe chọn bằng lượt nhanh ⇒ thử lại đủ bước, không vừa thì thôi (mở chuyến ra phải "Vừa xe")
      const lt = smaller.find(c => c.id === lastTruck)
      if (lt && !computeTrip({ ...last, truck: lt }).fits) lastTruck = null
    }
    post({ done: { ...res, lastTruck } })
  } catch (err) {
    post({ error: err instanceof Error ? err.message : String(err) })
  }
}
