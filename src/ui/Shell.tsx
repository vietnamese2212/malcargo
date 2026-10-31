// Khung app: MỘT màn làm việc (Bàn xếp xe). Danh mục mã hàng / xe / đơn / chuyến / tài khoản mở thành
// tấm phủ (Panel) ngay trên màn đó — người mới không phải mò sang tab chuyên biệt.
import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, X } from 'lucide-react'
import { IconButton, KeyboardShield, cx, useViewportBox } from './kit'
import { t } from '../i18n'
import { useBackClose } from './route'

/** Chữ ký MAL (cùng kiểu logo mal.com.vn): "MAL" nghiêng đậm + nhãn sản phẩm CARGO nền xanh. */
export function Logo({ dark, compact }: { dark?: boolean; compact?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 leading-none">
      <span className={cx('font-extrabold italic tracking-[-0.04em]', compact ? 'text-[17px] sm:text-[22px]' : 'text-[22px]', dark ? 'text-white' : 'text-navy-950')}>MAL</span>
      <span className={cx('rounded bg-brand-500 px-1.5 py-[3px] text-[10px] font-bold tracking-[0.1em] text-white', compact && 'max-sm:hidden')}>CARGO</span>
    </span>
  )
}

/** Chữ G nhiều màu của Google — đúng cách Google yêu cầu cho nút đăng nhập. */
export const GoogleG = () => (
  <svg viewBox="0 0 48 48" className="h-[18px] w-[18px] shrink-0" aria-hidden>
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z" />
    <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.2z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.2C6.6 42.6 14.6 48 24 48z" />
  </svg>
)

export function Shell({ children }: { children: ReactNode }) {
  return <div className="min-h-full">{children}</div>
}

// ── Tấm phủ: một màn danh mục mở đè lên màn làm việc ────────────────────────
const PanelCtx = createContext<{ close: () => void } | null>(null)
export const usePanel = () => useContext(PanelCtx)

export function Panel({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role=dialog][data-sheet],[role=alertdialog]')) onClose() }
    window.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [open, onClose])
  const box = useViewportBox(open)
  useBackClose(open, onClose)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end" style={box}>
      <div className="absolute inset-0 bg-navy-950/45" style={{ animation: 'fade .15s' }} onClick={onClose} />
      <KeyboardShield className="bg-canvas" />
      <div role="dialog" aria-modal="true" data-scroll className="relative h-full w-full overflow-y-auto overscroll-contain bg-canvas sm:max-w-4xl sm:border-l sm:border-slate-200"
        style={{ animation: 'sheet-left .2s ease-out' }}>
        <PanelCtx.Provider value={{ close: onClose }}>{children}</PanelCtx.Provider>
      </div>
    </div>,
    document.body,
  )
}

/** Thanh tiêu đề trắng (khuôn Manhattan). Trong tấm phủ: có nút Đóng. Đứng riêng: có lối về Bàn xếp xe. */
export function PageHeader({ title, subtitle, back, backLabel, actions, children }: {
  title: ReactNode; subtitle?: ReactNode; back?: string; backLabel?: string; actions?: ReactNode; children?: ReactNode
}) {
  const panel = usePanel()
  const to = panel ? undefined : back ?? '#/'
  const toLabel = backLabel ?? t('Bàn xếp xe')
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {to && (
          <a href={to} className="hidden pt-4 text-[13px] font-medium text-slate-600 hover:text-slate-900 lg:inline-flex lg:items-center lg:gap-1">
            <ChevronLeft size={15} />{toLabel}
          </a>
        )}
        <div className={cx('flex items-center gap-2 py-2 lg:pb-4', to ? 'lg:pt-1' : 'lg:pt-5')}>
          {to && (
            <a href={to} aria-label={t('Về {where}', { where: toLabel })} className="tap-icon -ml-2 grid shrink-0 place-items-center rounded-md text-slate-700 hover:bg-slate-100 lg:hidden">
              <ChevronLeft size={22} />
            </a>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold leading-tight text-navy-950 lg:text-[22px]">{title}</h1>
            {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-slate-600">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
          {panel && <IconButton label={t('Đóng')} onClick={panel.close} className="-mr-2"><X size={20} /></IconButton>}
        </div>
        {children}
      </div>
    </header>
  )
}

/** Vùng nội dung. `flush`: điện thoại bỏ lề để thẻ danh sách tràn mép (đỡ phí 32 px bề ngang). */
export const Page = ({ children, className, flush }: { children: ReactNode; className?: string; flush?: boolean }) =>
  <div className={cx('mx-auto max-w-6xl pb-8 sm:px-6 sm:pt-5', flush ? 'pt-0' : 'px-4 pt-4', className)}>{children}</div>

/** Thẻ danh sách: điện thoại tràn mép (bỏ viền hai bên), máy tính là thẻ trắng bo góc trên canvas xám. */
export const ListCard = ({ children, className }: { children: ReactNode; className?: string }) =>
  <div className={cx('border-y border-slate-200 bg-white sm:rounded-lg sm:border', className)}>{children}</div>
