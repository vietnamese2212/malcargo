// Chia sẻ chuyến bằng link (data/share.ts): tấm của NGƯỜI GỬI (tạo link, chép, gửi qua Zalo…) và tấm của NGƯỜI NHẬN
// (mở link ⇒ xem tóm tắt chuyến ⇒ "Lưu bản sao" vào dữ liệu của mình rồi mở luôn chuyến đó).
import { useEffect, useMemo, useState } from 'react'
import { Check, ClipboardCopy, Loader2, Send } from 'lucide-react'
import { createShare, fetchShare, signInGoogle, switchSpace, useAuth } from '../data/cloud'
import { adoptShare, packTrip, shareNeedsCatalog, shareUrl, useShareInbox, type SharePack } from '../data/share'
import { catalogLocked, findVehicle } from '../data/store'
import { resolveOrder } from '../data/resolve'
import { orderTotals } from '../engine/plan'
import { Button, Sheet, TextInput, fmtDims, fmtInt, fmtKgShort } from './kit'
import { GoogleG } from './Shell'
import { go } from './route'
import { t, tx } from '../i18n'

const NOTE = 'text-[13px] leading-snug text-slate-600'
const Wait = ({ text }: { text: string }) => (
  <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 size={16} className="animate-spin" />{text}</p>
)

// chuyến không đổi gì từ lần chia sẻ trước (trong phiên này) ⇒ dùng lại link cũ, không đẻ link mới mỗi lần mở tấm
const made = new Map<string, string>()

/** Người gửi: tạo link cho chuyến `tripId` (cần đăng nhập — người nhận thì không). */
export function ShareSheet({ open, onClose, tripId, tripName }: { open: boolean; onClose: () => void; tripId: string; tripName: string }) {
  const status = useAuth(s => s.status)
  const [st, setSt] = useState<{ code?: string; error?: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [n, setN] = useState(0)   // bấm "Thử lại"
  useEffect(() => {
    if (!open || status !== 'in') return
    setCopied(false)
    const p = packTrip(tripId)
    if (!p || !p.orders.some(o => o.lines.some(l => l.qty > 0))) { setSt({ error: t('Chuyến chưa có hàng để chia sẻ.') }); return }
    const key = JSON.stringify(p)
    if (made.has(key)) { setSt({ code: made.get(key) }); return }
    setSt(null)
    let live = true
    void createShare(p).then(r => {
      if ('code' in r) made.set(key, r.code)
      if (live) setSt(r)
    })
    return () => { live = false }
  }, [open, status, tripId, n])
  const url = st?.code ? shareUrl(st.code) : ''
  const copy = async () => {
    try { await navigator.clipboard.writeText(url) } catch {
      const el = document.querySelector<HTMLInputElement>('[data-share-url]'); el?.select(); document.execCommand('copy')
    }
    setCopied(true)
  }
  const canSend = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  return (
    <Sheet open={open} onClose={onClose} title={t('Chia sẻ chuyến')} subtitle={tx(tripName)}>
      {status === 'loading' ? <Wait text={t('Đang tải…')} />
        : status !== 'in' ? (
          <div>
            <p className={NOTE}>{t('Đăng nhập để tạo link. Người nhận không cần đăng nhập.')}</p>
            {status === 'out' && <Button className="mt-3 w-full sm:w-auto" onClick={() => void signInGoogle()}><GoogleG />{t('Tiếp tục với Google')}</Button>}
          </div>
        )
        : st?.error ? (
          <div>
            <p className="text-sm text-red-700">{st.error}</p>
            <Button className="mt-3" onClick={() => setN(x => x + 1)}>{t('Thử lại')}</Button>
          </div>
        )
        : !st?.code ? <Wait text={t('Đang tạo link…')} />
        : (
          <div>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{t('Link chuyến này')}</span>
              <TextInput data-share-url readOnly value={url} onFocus={e => e.currentTarget.select()} />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" className="flex-1 sm:flex-none" onClick={() => void copy()}>
                {copied ? <Check size={16} /> : <ClipboardCopy size={16} />}{copied ? t('Đã chép') : t('Chép link')}
              </Button>
              {canSend && (
                <Button className="flex-1 sm:flex-none" onClick={() => void navigator.share({ title: tx(tripName), url }).catch(() => {})}>
                  <Send size={16} />{t('Gửi…')}
                </Button>
              )}
            </div>
            <p className={`mt-4 ${NOTE}`}>{t('Ai có link đều xem và lưu được bản sao chuyến này (đơn, mã hàng, xe). Họ sửa bản sao không đổi chuyến của bạn.')}</p>
            <p className={`mt-2 ${NOTE}`}>{t('Sửa chuyến xong muốn gửi bản mới thì chia sẻ lại.')}</p>
          </div>
        )}
    </Sheet>
  )
}

/** Người nhận: mở app bằng link chia sẻ ⇒ tấm này tự mở (đặt ở App, màn nào cũng có). */
export function ShareInbox() {
  const code = useShareInbox(s => s.code)
  const [st, setSt] = useState<SharePack | 'loading' | 'missing' | 'error'>('loading')
  const [n, setN] = useState(0)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!code) return
    setSt('loading')
    let live = true
    void fetchShare(code).then(r => { if (live) setSt('pack' in r ? r.pack : 'missing' in r ? 'missing' : 'error') })
    return () => { live = false }
  }, [code, n])
  const pack = typeof st === 'object' ? st : null
  // thành viên Family không thêm được mã hàng / xe ⇒ bản sao cần thêm thì lưu vào "Của tôi"
  const toMe = !!pack && catalogLocked() && shareNeedsCatalog(pack)
  const sum = useMemo(() => {
    if (!pack) return null
    const os = pack.trip.orderIds.map(id => pack.orders.find(o => o.id === id)).filter(o => !!o).map(o => ({ o: o!, r: resolveOrder(o!, pack.items) }))
    return {
      v: findVehicle(pack.vehicles, pack.trip.vehicleId), orders: os.map(x => ({ id: x.o.id, name: x.o.name, place: x.o.place, cartons: orderTotals(x.r.lines, pack.pallet).cartons })),
      all: orderTotals(os.flatMap(x => x.r.lines), pack.pallet),
    }
  }, [pack])
  if (!code) return null
  const close = () => useShareInbox.setState({ code: null })
  const save = async () => {
    if (!pack || saving) return
    setSaving(true)
    if (toMe) await switchSpace('me')
    const id = adoptShare(pack)
    close()
    go({ page: 'trip', id })
  }
  const SHOW = 8
  return (
    <Sheet open onClose={close} title={t('Chuyến được chia sẻ')}
      footer={st === 'missing' ? <Button className="w-full" onClick={close}>{t('Đóng')}</Button>
        : st === 'error' ? <div className="flex gap-2"><Button className="flex-1" onClick={close}>{t('Đóng')}</Button><Button variant="primary" className="flex-1" onClick={() => setN(x => x + 1)}>{t('Thử lại')}</Button></div>
        : <div className="flex gap-2"><Button className="flex-1" onClick={close}>{t('Để sau')}</Button><Button variant="primary" className="flex-1" disabled={!pack || saving} onClick={() => void save()}>{t('Lưu bản sao')}</Button></div>}>
      {st === 'loading' ? <Wait text={t('Đang tải chuyến…')} />
        : st === 'missing' ? <p className="text-sm text-slate-700">{t('Link không đúng hoặc chuyến đã bị xoá.')}</p>
        : st === 'error' ? <p className="text-sm text-slate-700">{t('Không tải được chuyến — kiểm tra mạng rồi thử lại.')}</p>
        : pack && sum && (
          <div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="break-words text-[15px] font-bold leading-snug text-slate-900">{tx(pack.trip.name) || t('Chuyến xe')}</div>
              <div className="mt-0.5 break-words text-[13px] leading-snug text-slate-700">
                {sum.v ? <>{tx(sum.v.name)} <span className="num whitespace-nowrap">· {fmtDims(sum.v.l, sum.v.w, sum.v.h)} mm</span></> : t('Chưa chọn xe')}
              </div>
              <div className="num mt-0.5 text-[13px] text-slate-700">
                {t('{n} đơn', { n: sum.orders.length })} · {t('{n} thùng', { n: fmtInt(sum.all.cartons) })}{sum.all.kg > 0 && <> · {fmtKgShort(sum.all.kg)}</>}
              </div>
            </div>
            <ul className="mt-3 divide-y divide-slate-100 text-[13px]">
              {sum.orders.slice(0, SHOW).map(o => (
                <li key={o.id} className="flex items-baseline gap-2 py-1.5">
                  <span className="min-w-0 flex-1 break-words text-slate-800"><span className="font-semibold">{tx(o.name)}</span>{o.place && <span className="text-slate-600"> · {o.place}</span>}</span>
                  <span className="num shrink-0 text-slate-600">{t('{n} thùng', { n: fmtInt(o.cartons) })}</span>
                </li>
              ))}
              {sum.orders.length > SHOW && <li className="py-1.5 text-slate-600">{t('+{n} đơn nữa', { n: sum.orders.length - SHOW })}</li>}
            </ul>
            {toMe && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-900">{t('Sẽ lưu vào dữ liệu "Của tôi" — trong Family, mã hàng và xe do chủ quản lý.')}</p>}
            <p className={`mt-3 ${NOTE}`}>{t('Lưu bản sao vào dữ liệu của bạn rồi mở ra xem sơ đồ xếp — sửa thoải mái, bản của người gửi không đổi.')}</p>
          </div>
        )}
    </Sheet>
  )
}
