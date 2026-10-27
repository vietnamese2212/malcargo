// Hook gọi worker: gửi đầu vào mới nhất, bỏ kết quả cũ về muộn.
import { useEffect, useRef, useState } from 'react'
import type { TripInput, TripResult, TruckInput } from './plan'
import type { FitCheck, WorkerReq, WorkerRes } from './worker'

let worker: Worker | null = null
let seq = 0
const waiting = new Map<number, (r: WorkerRes) => void>()
function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerRes>) => { waiting.get(e.data.id)?.(e.data); waiting.delete(e.data.id) }
  }
  return worker
}

/** `checkAll`: thử thêm hàng trên từng xe này (chỉ truyền khi bảng đổi xe đang mở — tốn thêm thời gian tính). */
export function useTripPlan(input: TripInput | null, candidates: TruckInput[], checkAll?: TruckInput[]) {
  const [result, setResult] = useState<TripResult | null>(null)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [fits, setFits] = useState<Record<string, FitCheck> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)
  const key = input ? JSON.stringify([input, candidates, checkAll ?? null]) : ''

  useEffect(() => {
    if (!input) { setResult(null); setSuggestion(null); setFits(null); return }
    setBusy(true)
    const t = setTimeout(() => {
      const id = ++seq
      latest.current = id
      waiting.set(id, res => {
        if (latest.current !== id) return
        setBusy(false)
        if ('error' in res) { setError(res.error); return }
        setError(null); setResult(res.result); setSuggestion(res.suggestion); setFits(res.fits)
      })
      getWorker().postMessage({ id, input, candidates, checkAll } satisfies WorkerReq)
    }, 120)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { result, suggestion, fits, busy, error }
}
