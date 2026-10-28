// Bộ thành phần dùng chung — một kiểu nút, một kiểu ô nhập, một kiểu tấm trượt cho cả app.
// Khuôn Manhattan (thẻ trắng trên canvas xám, dải tổng hợp navy, section band) + luật dễ đọc:
// chữ phụ tối thiểu slate-500 trên nền trắng, không bóng trên thứ nằm yên, góc bo 6–8 px.
import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { Search, X } from 'lucide-react'
import { numLocale, t } from '../i18n'

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export function Button({ variant = 'secondary', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return (
    <button
      {...rest}
      className={cx(
        'tap inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-3.5 text-sm font-semibold transition-colors select-none',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700',
        variant === 'secondary' && 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 active:bg-slate-100',
        variant === 'ghost' && 'text-slate-700 hover:bg-slate-100',
        variant === 'danger' && 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
        className,
      )}
    >{children}</button>
  )
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button {...rest} aria-label={label} title={label}
      className={cx('tap-icon grid shrink-0 place-items-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-35 disabled:hover:bg-transparent',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500', className)}>
      {children}
    </button>
  )
}

// `group`: bọc một NHÓM nút (Segmented…) — dùng div, vì thẻ label chuyển cú bấm vào chữ nhãn thành bấm nút đầu
export function Field({ label, hint, error, children, className, group }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string; group?: boolean }) {
  const Tag = group ? 'div' : 'label'
  return (
    <Tag className={cx('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-700">{error}</span>
        : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </Tag>
  )
}

// 16 px trên điện thoại: iPhone tự phóng to khi ô nhập nhỏ hơn
const INPUT = 'tap w-full rounded-md border border-slate-300 bg-white px-3 text-base outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-600 sm:text-sm'

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(INPUT, className)} />
}

export function SearchInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cx('relative', className)}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
      <input type="search" {...rest} className={cx(INPUT, 'pl-9')} />
    </div>
  )
}

/** Ô số — giữ chuỗi thô khi đang gõ, báo ra số (hoặc null khi để trống). */
export function NumInput({ value, onChange, suffix, className, min = 0, ...rest }:
  Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number | null; onChange: (v: number | null) => void; suffix?: string; min?: number }) {
  const [raw, setRaw] = useState(value == null ? '' : String(value))
  useEffect(() => {
    const cur = raw.trim() === '' ? null : Number(raw.replace(',', '.'))
    if (cur !== value) setRaw(value == null ? '' : String(value))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <div className={cx('relative', className)}>
      <input {...rest} inputMode="decimal" value={raw}
        onChange={e => {
          const t = e.target.value
          setRaw(t)
          if (t.trim() === '') { onChange(null); return }
          const n = Number(t.replace(',', '.'))
          if (Number.isFinite(n) && n >= min) onChange(n)
        }}
        className={cx(INPUT, 'num', suffix && 'pr-16')} />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">{suffix}</span>}
    </div>
  )
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="tap flex w-full items-center gap-3 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-left hover:bg-slate-50">
      <span className="flex-1">
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      </span>
      <span className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-brand-500' : 'bg-slate-300')}>
        <span className={cx('absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform', checked && 'translate-x-4')} />
      </span>
    </button>
  )
}

/** Chọn một trong vài lựa chọn ngang hàng trong form (Cách chở…). */
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cx('flex rounded-md border border-slate-300 bg-slate-100 p-0.5', className)}>
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={cx('tap flex-1 rounded-[5px] px-3 text-sm font-semibold transition-colors',
            value === o.value ? 'border border-slate-300 bg-white text-slate-900' : 'border border-transparent text-slate-600 hover:text-slate-900')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Tab gạch chân trên một vạch kẻ suốt chiều ngang — chuyển giữa các phần của cùng một màn. */
// `flush`: nằm sát đáy thanh tiêu đề — vạch của thanh tiêu đề làm vạch kẻ, tab không tự kẻ thêm.
export function Tabs<T extends string>({ value, onChange, options, className, flush }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; flush?: boolean }) {
  return (
    <div className={cx('relative flex gap-5 overflow-x-auto', className)}>
      {!flush && <span className="absolute inset-x-0 bottom-0 h-px bg-slate-200" />}
      {options.map(o => {
        const on = value === o.value
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(o.value)}
            className={cx('tap relative z-[1] shrink-0 whitespace-nowrap border-b-2 px-0.5 text-sm font-semibold transition-colors',
              on ? 'border-brand-500 text-slate-900' : 'border-transparent text-slate-600 hover:text-slate-900')}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

type Tone = 'slate' | 'blue' | 'amber' | 'red' | 'green'
export function Badge({ children, tone = 'slate', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  const t = {
    slate: 'bg-slate-100 text-slate-700', blue: 'bg-brand-50 text-brand-700', amber: 'bg-amber-50 text-amber-800',
    red: 'bg-red-50 text-red-800', green: 'bg-emerald-50 text-emerald-800',
  }[tone]
  return <span className={cx('inline-flex flex-none items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold', t, className)}>{children}</span>
}

/** Dải tổng hợp navy (chữ ký Manhattan) — số lớn trắng, nhãn nhỏ; ô có `pct` vẽ thêm thanh đo đúng tỉ lệ. */
export type BandTile = { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'warn' | 'bad'; pct?: number | null }
// `square`: luôn 2 × 2 (cột hẹp như bảng bên của màn chuyến), không trải 4 ô một hàng.
export function SummaryBand({ tiles, className, square }: { tiles: BandTile[]; className?: string; square?: boolean }) {
  const four = tiles.length >= 4
  return (
    <div className={cx('grid bg-navy-900 text-white', four ? (square ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4') : tiles.length === 3 ? 'grid-cols-3' : 'grid-cols-2', className)}>
      {tiles.map((t, i) => (
        // 4 ô xếp 2 × 2: ô 3 sang hàng mới — bỏ vạch trái, thêm vạch trên
        <div key={t.label} className={cx('min-w-0 border-white/10 px-4 py-3', i > 0 && 'border-l',
          four && i === 2 && (square ? 'border-l-0' : 'max-sm:border-l-0'), four && i >= 2 && (square ? 'border-t' : 'max-sm:border-t'))}>
          <div className="break-words text-[12px] leading-tight text-slate-300">{t.label}</div>
          <div className={cx('num mt-0.5 truncate text-xl font-semibold leading-tight',
            t.tone === 'bad' ? 'text-red-300' : t.tone === 'warn' ? 'text-amber-300' : 'text-white')}>{t.value}</div>
          {t.pct != null && (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/15">
              <div className={cx('h-full rounded-full', t.pct > 100 ? 'bg-red-400' : t.pct >= 85 ? 'bg-amber-400' : 'bg-brand-500')}
                style={{ width: `${Math.min(100, Math.max(0, t.pct))}%` }} />
            </div>
          )}
          {t.sub && <div className="num mt-1 truncate text-[12px] text-slate-300">{t.sub}</div>}
        </div>
      ))}
    </div>
  )
}

/** Thanh tiêu đề khối (section band): vạch xanh + tên khối + thao tác riêng của khối. */
export function SectionBand({ title, meta, right, className }: { title: ReactNode; meta?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex min-h-[40px] items-center gap-2 border-y border-slate-200 bg-slate-50 py-1 pl-0 pr-2', className)}>
      <span className="h-4 w-[3px] shrink-0 rounded-r bg-brand-500" />
      <h2 className="min-w-0 flex-1 break-words pl-2.5 text-[13px] font-semibold leading-snug text-slate-900">
        {title}{meta != null && <span className="ml-1.5 font-normal text-slate-600">{meta}</span>}
      </h2>
      {right}
    </div>
  )
}

/** Chân danh sách: tổng số dòng, căn trái; ghi chú phụ căn phải. */
export function ListFooter({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-b-lg border-t border-slate-200 bg-slate-50 px-4 py-2 text-[12px] text-slate-600">
      <span className="num whitespace-nowrap">{children}</span>
      {right && <span className="min-w-0 flex-1 break-words text-right leading-snug">{right}</span>}
    </div>
  )
}

/** Hàng tiêu đề cột của danh sách (chỉ máy tính) — cùng lưới với từng dòng. */
export function ListHead({ grid, children }: { grid: string; children: ReactNode }) {
  return <div className={cx('hidden h-9 items-center gap-4 border-b border-slate-200 px-4 text-[12px] font-medium text-slate-600 sm:grid', grid)}>{children}</div>
}

/** Thùng carton vẽ ĐÚNG TỈ LỆ mặt trước (rộng × cao) — nhìn là biết thùng dẹt hay cao.
 *  `color`: tô đúng màu khối hàng trên sơ đồ 3D, để danh sách và hình khớp nhau. */
export function BoxGlyph({ w, h, light, color, className }: { w: number; h: number; light?: boolean; color?: string; className?: string }) {
  const S = 28, k = S / Math.max(w, h, 1)
  const bw = Math.max(6, w * k), bh = Math.max(6, h * k)
  const x = (S - bw) / 2 + 2, y = S - bh + 2
  const fill = color ?? (light ? '#efe4d2' : '#d8b98c')
  return (
    <svg viewBox="0 0 32 32" className={cx('h-8 w-8 shrink-0', className)} aria-hidden>
      <rect x={x} y={y} width={bw} height={bh} rx="1.5" fill={fill} stroke="rgba(11,20,36,.35)" strokeWidth="1" />
      <rect x={x + bw / 2 - Math.min(2.5, bw / 6)} y={y} width={Math.min(5, bw / 3)} height={Math.min(bh, 7)} fill="rgba(255,255,255,.35)" />
    </svg>
  )
}

/** Ô số "áp khi ngừng gõ": chỉ báo ra khi số hợp lệ VÀ người dùng ngừng gõ 0,6 s / rời ô / Enter —
 *  sơ đồ 3D không nhảy theo từng phím (gõ 5.700 không vẽ ra xe dài 5 mm giữa chừng). */
export function LiveNum({ value, onCommit, valid = n => n > 0, suffix, label, className }: {
  value: number | null; onCommit: (v: number | null) => void; valid?: (n: number) => boolean; suffix?: string; label: string; className?: string
}) {
  // số thập phân hiện dấu phẩy kiểu Việt Nam (12,5); gõ chấm hay phẩy đều nhận
  const show = (v: number | null) => (v == null ? '' : String(v).replace('.', ','))
  const [raw, setRaw] = useState(show(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setRaw(show(value)) }, [value, focused])
  const parse = (t: string) => (t.trim() === '' ? null : Number(t.replace(/\s/g, '').replace(',', '.')))
  const n = parse(raw)
  const ok = n == null || (Number.isFinite(n) && valid(n))
  // Áp ĐÚNG MỘT LẦN cho mỗi số: hẹn giờ và rời ô cùng gọi được, số đã áp thì bỏ qua
  // (áp hai lần với xe/mã mẫu = sinh hai bản "của tôi").
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const sent = useRef<number | null | undefined>(undefined)
  const commit = () => {
    clearTimeout(timer.current)
    if (ok && n !== value && n !== sent.current) { sent.current = n; onCommit(n) }
  }
  useEffect(() => { sent.current = undefined }, [value])
  useEffect(() => {
    if (!focused) return
    timer.current = setTimeout(commit, 600)
    return () => clearTimeout(timer.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw])
  return (
    <label className={cx('block min-w-0', className)}>
      <span className="mb-1 block text-[12px] font-medium text-slate-600">{label}</span>
      <span className="relative block">
        <input inputMode="decimal" value={raw} aria-invalid={!ok}
          onChange={e => setRaw(e.target.value)} onFocus={() => setFocused(true)}
          onBlur={() => { commit(); setFocused(false) }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className={cx(INPUT, 'num px-2.5', suffix && 'pr-9', !ok && 'border-red-400 focus:border-red-500 focus:ring-red-100')} />
        {suffix && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-slate-500">{suffix}</span>}
      </span>
    </label>
  )
}

/** Tấm trượt: điện thoại trượt từ đáy, máy tính trượt từ lề phải. Header + thân cuộn + chân dính đáy. */
export function Sheet({ open, onClose, title, subtitle, children, footer, wide }: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean | 'table'
}) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end">
      <div className="absolute inset-0 bg-navy-950/45" style={{ animation: 'fade .15s' }} onClick={onClose} />
      <div role="dialog" aria-modal="true" data-sheet
        className={cx('relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-pop sm:h-full sm:max-h-none sm:rounded-none sm:border-l sm:border-slate-200',
          wide === 'table' ? 'sm:max-w-[780px]' : wide ? 'sm:max-w-[560px]' : 'sm:max-w-[460px]')}
        style={{ animation: `${window.innerWidth < 640 ? 'sheet-up' : 'sheet-left'} .2s ease-out` }}>
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300 sm:hidden" />
        <div className="flex items-start gap-3 border-b border-slate-200 px-5 pb-3 pt-2 sm:py-4">
          <div className="min-w-0 flex-1 pt-1">
            <h2 className="text-lg font-semibold leading-snug text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-slate-600">{subtitle}</p>}
          </div>
          <IconButton label={t('Đóng')} onClick={onClose} className="-mr-2"><X size={20} /></IconButton>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && <div className="pb-safe border-t border-slate-200 bg-white px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/** Bảng nhỏ bật ra dưới nút (chọn chuyến, góc nhìn, menu ⋮, hướng dẫn). Bấm ra ngoài / Esc để đóng.
 *  `hover`: máy tính rê chuột là hiện (dùng làm chú thích), điện thoại vẫn chạm để mở. */
export function Popover({ trigger, children, align = 'left', up, hover, className, panelClass }: {
  trigger: (p: { open: boolean; toggle: () => void }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'; up?: boolean; hover?: boolean; className?: string; panelClass?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', down)
    window.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', down); window.removeEventListener('keydown', key) }
  }, [open])
  const close = () => setOpen(false)
  const fine = () => window.matchMedia('(hover: hover)').matches
  return (
    <div ref={ref} className={cx('relative', className)}
      onPointerEnter={hover ? () => fine() && setOpen(true) : undefined} onPointerLeave={hover ? () => fine() && setOpen(false) : undefined}>
      {/* có `hover` + chuột: rê vào đã mở rồi, bấm thì GIỮ mở (đừng đảo lại thành đóng) */}
      {trigger({ open, toggle: () => setOpen(o => (hover && fine() ? true : !o)) })}
      {open && (
        <div className={cx('absolute z-50 rounded-lg border border-slate-300 bg-white text-slate-900 shadow-pop',
          up ? 'bottom-full mb-1.5' : 'top-full mt-1.5', align === 'right' ? 'right-0' : 'left-0', panelClass)}
          style={{ animation: 'fade .12s' }}>
          {children(close)}
        </div>
      )}
    </div>
  )
}

/** Một dòng trong menu bật ra. */
export function MenuItem({ icon, children, onClick, danger, disabled }: { icon?: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={cx('tap flex w-full items-center gap-2.5 px-3 text-left text-sm transition-colors disabled:opacity-40',
        danger ? 'text-red-700 hover:bg-red-50' : 'text-slate-800 hover:bg-slate-100')}>
      {icon && <span className="shrink-0 text-slate-500">{icon}</span>}{children}
    </button>
  )
}

/** Hộp xác nhận nhỏ giữa màn — chỉ dùng cho xoá / thay dữ liệu. */
export function Confirm({ open, title, body, okText = t('Xoá'), danger = true, onOk, onClose }: {
  open: boolean; title: string; body?: ReactNode; okText?: string; danger?: boolean; onOk: () => void; onClose: () => void
}) {
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center p-5">
      <div className="absolute inset-0 bg-navy-950/45" onClick={onClose} />
      <div role="alertdialog" aria-modal="true" className="relative w-full max-w-sm rounded-lg bg-white p-5 shadow-pop" style={{ animation: 'sheet-up .15s ease-out' }}>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {body && <div className="mt-1.5 text-sm text-slate-700">{body}</div>}
        <div className="mt-5 flex gap-2">
          <Button className="flex-1" onClick={onClose}>{t('Huỷ')}</Button>
          <Button className="flex-1" variant={danger ? 'danger' : 'primary'} onClick={() => { onOk(); onClose() }}>{okText}</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Khối trống: giữ khung, một câu nói rõ việc tiếp theo, một nút. */
export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <div className="text-slate-500">{icon}</div>
      <h3 className="mt-3 text-base font-semibold text-slate-900">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-slate-600">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

// ── định dạng số ─────────────────────────────────────────────────────────────
export const fmtInt = (n: number) => Math.round(n).toLocaleString(numLocale())
export const fmtDec = (n: number, d = 1) => n.toLocaleString(numLocale(), { maximumFractionDigits: d })
export const fmtDims = (l: number, w: number, h: number) => `${fmtInt(l)} × ${fmtInt(w)} × ${fmtInt(h)}`
export const fmtM3 = (m3: number) => `${fmtDec(m3, m3 < 10 ? 2 : 1)} m³`
export const fmtKgShort = (kg: number) => (kg >= 1000 ? `${fmtDec(kg / 1000, 2)} ${t('tấn')}` : `${fmtInt(kg)} kg`)
