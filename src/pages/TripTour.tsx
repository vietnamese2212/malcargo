// Hướng dẫn nhanh cho người mới (chủ dự án 31/10: "guide tour cho user mới khi cần, mở lên lần đầu, có thể skip"):
// tự mở MỘT lần ở lần đầu vào bàn xếp xe, bước nào cũng Bỏ qua được; mở lại ở menu ≡ "Hướng dẫn nhanh". Mỗi bước
// soi một chỗ thật trên màn (`data-tour`) — vùng sáng + thẻ chữ đặt chỗ còn trống (dưới / trên / phải / trái).
// Chỗ không có trên màn (chuyến chưa có xe ⇒ không có nút Thùng rời | Pallet) thì bỏ bước đó.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../ui/kit'
import { useBackClose } from '../ui/route'
import { t } from '../i18n'

const SEEN = 'malcargo-tour-v1'
const STEPS: { target?: string; title: string; body: string }[] = [
  { title: 'Chào mừng đến MalCargo', body: 'Khai mã hàng, xe và đơn — app tính số pallet, gợi ý xe vừa nhất, bảng đếm chân và sơ đồ xếp 3D. Chuyến mẫu cứ sửa thoải mái — mẫu gốc luôn giữ nguyên.' }, // i18n-key
  { target: 'trip', title: 'Chuyến xe', body: 'Mỗi chuyến là một xe cùng các đơn của nó. Bấm để đổi chuyến hoặc đổi tên; nút + tạo chuyến mới.' }, // i18n-key
  { target: 'truck', title: 'Chọn xe', body: 'Bấm để đổi xe — dấu ✓ là xe chở hết hàng. Lòng thùng, tải sửa ở cuối danh sách.' }, // i18n-key
  { target: 'kind', title: 'Thùng rời hay Pallet', body: 'Xếp xá từng thùng, hoặc xếp hàng lên pallet rồi đưa pallet lên xe.' }, // i18n-key
  { target: 'scene', title: 'Sơ đồ 3D', body: 'Kéo để xoay, chụm hoặc lăn chuột để phóng to. Dải trên cùng: số pallet, % tải, % thể tích; "Diễn giải": mỗi mã mấy lớp, pallet nào gộp chung.' }, // i18n-key
  { target: 'orders', title: 'Đơn hàng', body: 'Thêm mã, gõ số thùng — sơ đồ tính lại ngay. Nhiều điểm giao thì thêm đơn; đơn giao trước được xếp sát cửa.' }, // i18n-key
  { target: 'menu', title: 'Danh mục', body: 'Mã hàng, xe, đơn, các chuyến và sao lưu dữ liệu. Mở lại hướng dẫn này cũng ở đây.' }, // i18n-key
]
const seen = () => { try { return !!localStorage.getItem(SEEN) } catch { return true } }
const markSeen = () => { try { localStorage.setItem(SEEN, '1') } catch { /* chế độ riêng tư — lần sau hiện lại */ } }
const el = (target?: string) => (target ? document.querySelector<HTMLElement>(`[data-tour="${target}"]`) : null)
const shown = (e: HTMLElement | null) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'

type Box = { l: number; t: number; r: number; b: number }

/** Đưa chỗ cần soi vào màn: điện thoại thanh trên + khung 3D DÍNH đầu trang khi cuộn ⇒ đặt ngay dưới chúng. */
function reveal(e: HTMLElement) {
  window.scrollTo({ top: 0, behavior: 'instant' })
  const r = e.getBoundingClientRect()
  if (r.top < innerHeight * 0.55) return
  const cover = Math.max(0, ...[...document.querySelectorAll<HTMLElement>('header, [data-scene]')]
    .filter(x => getComputedStyle(x).position === 'sticky')
    .map(x => (parseFloat(getComputedStyle(x).top) || 0) + x.offsetHeight))
  window.scrollTo({ top: window.scrollY + r.top - cover - 8, behavior: 'instant' })
}

export function TripTour({ open, onOpen, onClose }: { open: boolean; onOpen: () => void; onClose: () => void }) {
  // lần đầu vào bàn xếp xe ⇒ tự mở (chờ màn dựng xong); người dùng đã kịp mở tấm / bảng nào thì để lần sau
  useEffect(() => {
    if (seen()) return
    const id = setTimeout(() => { if (!document.querySelector('[role=dialog],[role=alertdialog],[data-popover]')) onOpen() }, 900)
    return () => clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const close = () => { markSeen(); onClose() }
  useBackClose(open, close)
  return open ? <Tour onClose={close} /> : null
}

function Tour({ onClose }: { onClose: () => void }) {
  const steps = useMemo(() => STEPS.filter(s => !s.target || shown(el(s.target))), [])
  const [i, setI] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const [cardH, setCardH] = useState(200)
  const card = useRef<HTMLDivElement>(null)
  const step = steps[i]
  const last = i === steps.length - 1

  // khoá cuộn tay (thẻ chữ bám đúng chỗ); xong thì về chỗ cũ
  useEffect(() => {
    const y = window.scrollY, prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev; window.scrollTo({ top: y, behavior: 'instant' }) }
  }, [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  // bám theo chỗ đang soi mỗi khung hình (khung 3D dựng xong, xoay máy, dải thông số xuống dòng…)
  useEffect(() => {
    const e = el(step.target)
    if (e) reveal(e); else window.scrollTo({ top: 0, behavior: 'instant' })
    card.current?.querySelector<HTMLButtonElement>('[data-next]')?.focus({ preventScroll: true })
    let raf = 0, prev = ''
    const tick = () => {
      const r = e?.getBoundingClientRect()
      const b = r ? { l: Math.max(4, r.left - 4), t: Math.max(4, r.top - 4), r: Math.min(innerWidth - 4, r.right + 4), b: Math.min(innerHeight - 4, r.bottom + 4) } : null
      const key = b ? [b.l, b.t, b.r, b.b].map(Math.round).join() : ''
      if (key !== prev) { prev = key; setBox(b) }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [step])
  useLayoutEffect(() => { if (card.current && card.current.offsetHeight !== cardH) setCardH(card.current.offsetHeight) })

  // thẻ chữ: dưới → trên → phải → trái chỗ đang soi; không chỗ nào đủ (khung 3D trên điện thoại nhỏ) thì sát mép màn phía
  // rộng hơn — chỉ che một dải của chỗ đang soi
  const W = Math.min(340, innerWidth - 24), H = cardH, gap = 12
  const clampX = (x: number) => Math.max(12, Math.min(innerWidth - W - 12, x))
  const clampY = (y: number) => Math.max(12, Math.min(innerHeight - H - 12, y))
  const pos = !box ? { left: (innerWidth - W) / 2, top: Math.max(12, (innerHeight - H) / 2) }
    : innerHeight - box.b >= H + gap * 2 ? { left: clampX((box.l + box.r - W) / 2), top: box.b + gap }
    : box.t >= H + gap * 2 ? { left: clampX((box.l + box.r - W) / 2), top: box.t - gap - H }
    : innerWidth - box.r >= W + gap * 2 ? { left: box.r + gap, top: clampY(box.t) }
    : box.l >= W + gap * 2 ? { left: box.l - gap - W, top: clampY(box.t) }
    : { left: clampX((box.l + box.r - W) / 2), top: innerHeight - box.b >= box.t ? innerHeight - H - 12 : 12 }

  return createPortal(
    <div className="fixed inset-0 z-[60]" style={{ touchAction: 'none' }}>
      {box
        ? <div data-tour-ring className="pointer-events-none absolute rounded-lg ring-2 ring-brand-500 transition-all duration-200"
            style={{ left: box.l, top: box.t, width: box.r - box.l, height: box.b - box.t, boxShadow: '0 0 0 9999px rgba(11,20,36,.62)' }} />
        : <div className="absolute inset-0 bg-navy-950/60" />}
      <div ref={card} role="dialog" aria-modal="true" aria-labelledby="tour-title" data-tour-card data-tour-step={step.target ?? ''}
        className="absolute rounded-xl bg-white p-4 shadow-pop transition-[left,top] duration-200" style={{ width: W, ...pos }}>
        <div className="flex items-center gap-1.5" aria-hidden>
          {steps.map((_, k) => <span key={k} className={k === i ? 'h-1.5 w-5 rounded-full bg-brand-500' : 'h-1.5 w-1.5 rounded-full bg-slate-300'} />)}
          <span className="num ml-auto text-[12px] text-slate-500">{i + 1}/{steps.length}</span>
        </div>
        <h2 id="tour-title" className="mt-2.5 text-[17px] font-semibold leading-snug text-navy-950">{t(step.title)}</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">{t(step.body)}</p>
        <div className="mt-4 flex items-center gap-2">
          {!last && <Button variant="ghost" className="-ml-2 text-slate-600" onClick={onClose}>{t('Bỏ qua')}</Button>}
          <span className="flex-1" />
          {i > 0 && <Button onClick={() => setI(i - 1)}>{t('Quay lại')}</Button>}
          <Button data-next variant="primary" onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? t('Xong') : i === 0 ? t('Xem nhanh') : t('Tiếp')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
