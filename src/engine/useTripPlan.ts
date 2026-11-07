// Hook gọi worker: gửi đầu vào mới nhất. Đổi cấu hình lúc đang tính ⇒ HUỶ HẲN lượt dở (worker không ngắt được giữa chừng, tin mới phải xếp
// hàng sau lượt cũ — gõ 4 phím từng chờ 4 lượt tính đủ); cấu hình vừa xem ⇒ hiện ngay từ bộ nhớ, không tính lại.
import { useEffect, useRef, useState } from 'react'
import type { TripInput, TripResult, TruckInput } from './plan'
import type { FitCheck, WorkerReq, WorkerRes } from './worker'

let worker: Worker | null = null
let seq = 0
let handler: ((r: WorkerRes) => void) | null = null   // lượt đang tính
function cancelJob() {
  if (!handler) return
  handler = null
  worker?.terminate()
  worker = null
}
function startJob(req: WorkerReq, onMsg: (r: WorkerRes) => void) {
  cancelJob()
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerRes>) => handler?.(e.data)
  }
  handler = onMsg
  worker.postMessage(req)
}

interface Plan { result: TripResult; suggestion: string | null; fits: Record<string, FitCheck> | null }
// Kết quả chỉ phụ thuộc đầu vào. Giữ vài cấu hình gần nhất (qua lại Thùng rời ↔ Pallet, bật / tắt công tắc, đổi xe rồi đổi lại)
const CACHE_MAX = 12
const cache = new Map<string, Plan>()
function remember(key: string, p: Plan) {
  cache.delete(key); cache.set(key, p)
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
}

/** `checkAll`: thử thêm hàng trên từng xe này (chỉ truyền khi bảng đổi xe đang mở — tốn thêm thời gian tính).
 *  `planning` = sơ đồ chưa xong; `busy` = còn đang thử xe để gợi ý. */
export function useTripPlan(input: TripInput | null, candidates: TruckInput[], checkAll?: TruckInput[]) {
  const [result, setResult] = useState<TripResult | null>(null)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [fits, setFits] = useState<Record<string, FitCheck> | null>(null)
  const [busy, setBusy] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // false = chưa khai (tắt công tắc xong khớp lại lúc chưa bật bao giờ)
  const key = input ? JSON.stringify([input, candidates, checkAll ?? null], (_, v) => (v === false ? undefined : v)) : ''

  useEffect(() => {
    cancelJob()
    if (!input) { setResult(null); setSuggestion(null); setFits(null); setBusy(false); setPlanning(false); return }
    const hit = cache.get(key)
    if (hit) {
      remember(key, hit)
      setError(null); setResult(hit.result); setSuggestion(hit.suggestion); setFits(hit.fits); setBusy(false); setPlanning(false)
      return
    }
    setBusy(true); setPlanning(true)
    const t = setTimeout(() => {
      const id = ++seq
      let plan: TripResult | null = null
      startJob({ id, input, candidates, checkAll }, res => {
        if ('error' in res) { handler = null; setBusy(false); setPlanning(false); setError(res.error); return }
        if ('result' in res) { plan = res.result; setError(null); setResult(res.result); setPlanning(false); return }
        handler = null
        setSuggestion(res.suggestion); setFits(res.fits); setBusy(false)
        if (plan) remember(key, { result: plan, suggestion: res.suggestion, fits: res.fits })
      })
    }, 120)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => cancelJob, [])

  return { result, suggestion, fits, busy, planning, error }
}
