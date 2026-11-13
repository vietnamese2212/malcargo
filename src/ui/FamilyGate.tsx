// Mở app bằng link Family (…/f/<mã>, data/famlink.ts): tên Family + số người; Family MỞ ⇒ xem được ĐƠN HÀNG (chỉ xem, không
// lưu bản sao — chủ dự án 13/11); nút "Xin vào" (cần đăng nhập) ⇒ chủ / quản lý duyệt. Đã được mời ⇒ Tham gia; đã ở trong
// Family ⇒ mở dữ liệu Family. Đặt ở App (màn nào cũng có), như tấm nhận chuyến chia sẻ.
import { useEffect, useMemo, useState } from 'react'
import { Loader2, Lock, UsersRound } from 'lucide-react'
import { acceptInvite, declineInvite, peekFamily, requestJoin, signInGoogle, switchSpace, useAuth, type FamilyPeek } from '../data/cloud'
import { keepFamilyLink, useFamilyInbox } from '../data/famlink'
import { famLabel } from '../data/store'
import { Button, SearchInput, Sheet, fmtInt, fmtKgShort } from './kit'
import { GoogleG } from './Shell'
import { numLocale, t } from '../i18n'

const NOTE = 'text-[13px] leading-snug text-slate-600'
const SHOW = 30

export function FamilyGate() {
  const code = useFamilyInbox(s => s.code)
  const status = useAuth(s => s.status)
  const [st, setSt] = useState<FamilyPeek | 'loading' | 'missing' | 'error'>('loading')
  const [n, setN] = useState(0)
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState(''), [more, setMore] = useState(false)
  // đăng nhập / đăng xuất giữa chừng ⇒ đọc lại (trạng thái "tôi" đổi)
  useEffect(() => {
    if (!code || status === 'loading') return
    let live = true
    void peekFamily(code).then(r => { if (live) setSt('peek' in r ? r.peek : 'missing' in r ? 'missing' : 'error') })
    return () => { live = false }
  }, [code, n, status])
  const peek = typeof st === 'object' ? st : null
  const orders = useMemo(() => {
    const k = q.trim().toLowerCase()
    const all = peek?.orders ?? []
    return k ? all.filter(o => [o.name, o.place, ...o.lines.flatMap(l => [l.code, l.name])].some(s => s.toLowerCase().includes(k))) : all
  }, [peek, q])
  if (!code) return null
  const close = () => { useFamilyInbox.setState({ code: null }); setSt('loading'); setErr(null); setQ(''); setMore(false) }
  const run = async (p: Promise<string | null>) => { setBusy(true); const e = await p; setBusy(false); setErr(e); if (!e) setN(x => x + 1) }
  const me = peek?.me ?? null
  const ask = () => run(requestJoin(code).then(r => ('error' in r ? r.error : null)))
  const login = () => { keepFamilyLink(code); void signInGoogle() }
  const openData = async () => { if (!peek) return; setBusy(true); await switchSpace(peek.id); setBusy(false); close() }
  const join = async () => { if (!peek) return; setBusy(true); const e = await acceptInvite(peek.id); setBusy(false); setErr(e); if (!e) close() }

  const footer = st === 'missing' ? <Button className="w-full" onClick={close}>{t('Đóng')}</Button>
    : st === 'error' ? <div className="flex gap-2"><Button className="flex-1" onClick={close}>{t('Đóng')}</Button><Button variant="primary" className="flex-1" onClick={() => setN(x => x + 1)}>{t('Thử lại')}</Button></div>
    : !peek ? null
    : me?.status === 'active' ? <div className="flex gap-2"><Button className="flex-1" onClick={close}>{t('Đóng')}</Button><Button variant="primary" className="flex-1" disabled={busy} onClick={() => void openData()}>{t('Mở dữ liệu Family')}</Button></div>
    : me?.status === 'invited' ? <div className="flex gap-2"><Button className="flex-1" disabled={busy} onClick={() => void run(declineInvite(peek.id))}>{t('Từ chối')}</Button><Button variant="primary" className="flex-1" disabled={busy} onClick={() => void join()}>{t('Tham gia')}</Button></div>
    : me?.status === 'requested' ? <div className="flex gap-2"><Button className="flex-1" onClick={close}>{t('Đóng')}</Button><Button className="flex-1" disabled={busy} onClick={() => void run(declineInvite(peek.id))}>{t('Rút yêu cầu')}</Button></div>
    : status === 'in' ? <div className="flex gap-2"><Button className="flex-1" onClick={close}>{t('Để sau')}</Button><Button variant="primary" className="flex-1" disabled={busy} onClick={() => void ask()}><UsersRound size={16} />{t('Xin vào Family')}</Button></div>
    : status === 'out' ? <div className="flex gap-2"><Button className="flex-1" onClick={close}>{t('Để sau')}</Button><Button variant="primary" className="flex-1" onClick={login}><GoogleG />{t('Đăng nhập để xin vào')}</Button></div>
    : <Button className="w-full" onClick={close}>{t('Đóng')}</Button>

  return (
    <Sheet open onClose={close} wide title={peek ? famLabel(peek.name) : 'Family'} subtitle={peek ? t('{n} người', { n: peek.people }) : undefined} footer={footer}>
      {st === 'loading' ? <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 size={16} className="animate-spin" />{t('Đang tải…')}</p>
        : st === 'missing' ? <p className="text-sm text-slate-700">{t('Link không đúng hoặc đã được đổi.')}</p>
        : st === 'error' ? <p className="text-sm text-slate-700">{t('Không tải được — kiểm tra mạng rồi thử lại.')}</p>
        : peek && (
          <div data-family-gate>
            <p className={`rounded-md px-3 py-2 text-[13px] leading-snug ${me?.status === 'requested' ? 'bg-amber-50 text-amber-900' : me ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50 text-slate-700'}`}>
              {me?.status === 'active' ? t('Bạn đã ở trong Family này.')
                : me?.status === 'invited' ? t('Bạn đã được mời vào Family này.')
                : me?.status === 'requested' ? t('Đã gửi yêu cầu xin vào — chờ chủ Family duyệt.')
                : t('Xin vào để cùng làm đơn và chuyến với Family này. Chủ Family duyệt rồi bạn mới vào được.')}
            </p>
            {err && <p className="mt-2 text-[13px] text-red-700">{err}</p>}
            {!peek.orders ? (
              <p className="mt-4 flex items-start gap-2 text-sm text-slate-700"><Lock size={16} className="mt-0.5 shrink-0 text-slate-500" />{t('Family này đóng — chỉ người trong Family xem được dữ liệu.')}</p>
            ) : (
              <div className="mt-4">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <h3 className="text-sm font-semibold text-slate-900">{t('Đơn hàng')}</h3>
                  <span className="num text-[13px] text-slate-600">{t('{n} đơn', { n: fmtInt(peek.orders.length) })} · {t('chỉ xem')}</span>
                </div>
                {peek.orders.length > 5 && <SearchInput className="mt-2" value={q} onChange={e => setQ(e.target.value)} placeholder={t('Tìm đơn, điểm giao, mã hàng…')} aria-label={t('Tìm đơn')} />}
                {!peek.orders.length && <p className={`mt-2 ${NOTE}`}>{t('Family chưa có đơn hàng nào.')}</p>}
                <ul className="mt-2 space-y-2">
                  {(more ? orders : orders.slice(0, SHOW)).map(o => {
                    const cartons = o.lines.reduce((s, l) => s + l.qty, 0)
                    const kg = o.lines.reduce((s, l) => s + (l.kg ?? 0) * l.qty, 0)
                    return (
                      <li key={o.id} className="rounded-lg border border-slate-200 px-3 py-2">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="min-w-0 break-words text-sm font-semibold text-slate-900">{o.name}</span>
                          {o.place && <span className="min-w-0 break-words text-[13px] text-slate-700">· {o.place}</span>}
                          <span className="num ml-auto whitespace-nowrap text-[13px] text-slate-700">{t('{n} thùng', { n: fmtInt(cartons) })}{kg > 0 && <> · {fmtKgShort(kg)}</>}</span>
                        </div>
                        {o.lines.length > 0 && (
                          <ul className="mt-1 text-[13px] text-slate-700">
                            {o.lines.map((l, i) => (
                              <li key={i} className="flex items-baseline gap-2">
                                <span className="min-w-0 flex-1 break-words">{l.code ? <b className="font-medium">{l.code}</b> : null}{l.code && l.name ? ' · ' : ''}{l.name}</span>
                                <span className="num shrink-0">{fmtInt(l.qty)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {(o.by || o.updatedAt > 0) && (
                          <div className="mt-1 text-[12px] text-slate-500">
                            {o.by ? t('Sửa bởi {name} · {time}', { name: o.by, time: when(o.updatedAt) }) : when(o.updatedAt)}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
                {!more && orders.length > SHOW && <Button variant="ghost" className="mt-2 text-brand-700" onClick={() => setMore(true)}>{t('Xem thêm {n} đơn', { n: orders.length - SHOW })}</Button>}
              </div>
            )}
          </div>
        )}
    </Sheet>
  )
}

/** Lúc sửa: hôm nay ⇒ giờ:phút; ngày khác ⇒ ngày. */
export function when(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms), now = new Date()
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString(numLocale(), { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(numLocale(), { day: '2-digit', month: '2-digit', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}
