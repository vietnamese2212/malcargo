// Tài khoản & dữ liệu — GỌN (chủ dự án 31/10: "làm gọn gàng lại phần account, info ngắn gọn"): dòng tài khoản (ai đang
// đăng nhập · đồng bộ · nút) + số dữ liệu của bạn trên một dòng; mỗi khối sau chỉ một tên + một dòng ngắn, nút nằm bên
// phải (máy tính) — bỏ dải tiêu đề và đoạn giải thích dài.
import { useRef, useState, type ReactNode } from 'react'
import { Check, CloudOff, Download, Loader2, LogOut, MessageCircle, Trash2, Upload, UserRound } from 'lucide-react'
import { exportBackup, isSample, parseBackup, useData, type BackupData } from '../data/store'
import { signInGoogle, signOut, useAuth } from '../data/cloud'
import { DEFAULT_PALLET_SETTINGS } from '../data/catalog'
import { Badge, Button, Confirm, cx, fmtInt } from '../ui/kit'
import { PalletFields } from '../ui/PalletSettings'
import { GoogleG, ListCard, Page, PageHeader } from '../ui/Shell'
import { saveFile } from '../ui/saveFile'
import { t } from '../i18n'

/** Trạng thái lưu lên tài khoản — dùng chung với bảng tài khoản trên thanh trên. */
export function SyncStatus({ className }: { className?: string }) {
  const sync = useAuth(s => s.sync)
  return (
    <div className={cx('flex items-center gap-1.5 text-[12px]', sync === 'error' ? 'text-red-700' : 'text-slate-700', className)}>
      {sync === 'error' ? <><CloudOff size={14} className="shrink-0" />{t('Chưa lưu được lên tài khoản, sẽ thử lại khi có thay đổi')}</>
        : sync === 'saving' ? <><Loader2 size={14} className="shrink-0 animate-spin" />{t('Đang lưu lên tài khoản…')}</>
        : <><Check size={14} className="shrink-0 text-emerald-700" />{t('Dữ liệu đã lưu trên tài khoản')}</>}
    </div>
  )
}

/** Một khối: tên + một dòng ngắn; nút gọn nằm bên phải (máy tính) hoặc dưới (điện thoại), ô nhập thì xuống dưới. */
function Row({ title, desc, side, children }: { title: string; desc: ReactNode; side?: ReactNode; children?: ReactNode }) {
  return (
    <section className="border-t border-slate-200 px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-[15px] font-semibold leading-snug text-slate-900">{title}</h2>
          <p className="mt-0.5 break-words text-[13px] leading-snug text-slate-600">{desc}</p>
        </div>
        {side && <div className="flex shrink-0 flex-wrap gap-2">{side}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </section>
  )
}

export default function AccountPage() {
  const s = useData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<BackupData | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [signErr, setSignErr] = useState<string | null>(null)
  const [askReset, setAskReset] = useState(false)
  const { status, user, isAdmin } = useAuth()
  const signedIn = status === 'in' && !!user

  const download = () => saveFile(`${t('malcargo-sao-luu')}-${new Date().toLocaleDateString('en-CA')}.json`,
    () => new Blob([JSON.stringify(exportBackup(), null, 1)], { type: 'application/json' }))
  const onFile = async (f: File | undefined) => {
    if (!f) return
    const r = parseBackup(await f.text())
    if (typeof r === 'string') setMsg(r); else { setMsg(null); setPending(r) }
    if (fileRef.current) fileRef.current.value = ''
  }
  // chỉ đếm dữ liệu của người dùng — chuyến mẫu + 2 đơn mẫu có sẵn từ đầu, người mới chưa nhập gì không phải thấy "2 đơn · 1 chuyến"
  const [items, vehicles, orders, trips] = [s.items.length, s.vehicles.length, s.orders.filter(o => !isSample(o.id)).length, s.trips.filter(x => !isSample(x.id)).length]
  const counts = [
    [items, t('{n:mã hàng|mã hàng}', { n: items })], [vehicles, t('{n:xe|xe}', { n: vehicles })],
    [orders, t('{n:đơn|đơn}', { n: orders })], [trips, t('{n:chuyến|chuyến}', { n: trips })],
  ] as const

  return (
    <>
      <PageHeader title={t('Tài khoản & dữ liệu')} />
      <Page flush className="space-y-4">
        <ListCard>
          {/* tài khoản: cùng nút Login trên thanh trên (trước đây ghi "sắp có" trong khi Login đã chạy — thử 29/10) */}
          <section className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className={cx('grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full text-base font-bold',
                signedIn ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500')}>
                {!signedIn ? <UserRound size={22} strokeWidth={1.75} />
                  : user.avatar ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  : (user.name || user.email).slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="break-words text-[15px] font-semibold leading-snug text-slate-900">{signedIn ? user.name || user.email : t('Chưa đăng nhập')}</span>
                  {signedIn && isAdmin && <Badge tone="blue">Admin</Badge>}
                </div>
                <div className="break-words text-[13px] leading-snug text-slate-600">{signedIn ? user.email : t('Dữ liệu chỉ nằm trên máy này')}</div>
                {signedIn && <SyncStatus className="mt-1" />}
              </div>
            </div>
            {signedIn
              ? <Button className="w-full sm:w-auto" onClick={() => signOut()}><LogOut size={16} />{t('Đăng xuất')}</Button>
              : status === 'out' && <Button className="w-full sm:w-auto" onClick={() => signInGoogle().catch(e => setSignErr(String(e?.message ?? e)))}><GoogleG />{t('Tiếp tục với Google')}</Button>}
          </section>
          {signErr && <p className="-mt-2 px-4 pb-3 text-[13px] text-red-700">{signErr}</p>}
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-[13px] text-slate-600">
            <span className="font-medium text-slate-700">{t('Dữ liệu của bạn')}</span>
            {counts.map(([n, label], i) => (
              <span key={i} className="whitespace-nowrap"><b className="num text-[15px] font-semibold text-slate-900">{fmtInt(n)}</b> {label}</span>
            ))}
          </div>

          <Row title={t('Sao lưu')} desc={t('Giữ một bản phòng khi xoá trình duyệt, hoặc chuyển sang máy khác.')}
            side={<>
              <Button variant="primary" className="max-sm:flex-1" onClick={download}><Download size={17} />{t('Tải file sao lưu')}</Button>
              <Button className="max-sm:flex-1" onClick={() => fileRef.current?.click()}><Upload size={17} />{t('Nạp từ file')}</Button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
            </>}>
            {msg && <p className="text-sm text-red-700">{msg}</p>}
          </Row>

          <Row title={t('Cỡ pallet')} desc={t('Áp cho mọi chuyến xe pallet.')}>
            <PalletFields cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" />
          </Row>

          <Row title={t('Xoá dữ liệu trên máy này')} desc={t('Mã hàng, xe, đơn, chuyến của bạn.')}
            side={<Button variant="danger" className="max-sm:flex-1" onClick={() => setAskReset(true)}><Trash2 size={16} />{t('Xoá hết')}</Button>} />
        </ListCard>

        <section className="mx-4 flex flex-col gap-3 rounded-lg bg-navy-950 p-5 text-white sm:mx-0 sm:flex-row sm:items-center">
          <div className="flex-1">
            <div className="text-[15px] font-semibold">{t('Cần quản lý cả kho và vận tải?')}</div>
            <p className="mt-0.5 text-sm text-slate-300">{t('SUPPLYC — phần mềm kho & vận tải, dùng thử 3 tháng miễn phí.')}</p>
          </div>
          <div className="flex gap-2">
            <a href="https://mal.com.vn" target="_blank" rel="noreferrer" className="tap inline-flex items-center rounded-md bg-white px-4 text-sm font-semibold text-navy-950 hover:bg-slate-100">{t('Xem SUPPLYC')}</a>
            <a href="https://zalo.me/0972702149" target="_blank" rel="noreferrer" className="tap inline-flex items-center gap-2 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"><MessageCircle size={17} />Zalo</a>
          </div>
        </section>
      </Page>

      <Confirm open={!!pending} onClose={() => setPending(null)} danger={false} okText={t('Nạp và thay')}
        title={t('Thay dữ liệu bằng file sao lưu?')}
        body={pending && t('File có {items} mã · {vehicles} xe · {orders} đơn · {trips} chuyến. Dữ liệu hiện tại trên máy sẽ bị thay.',
          { items: pending.items.length, vehicles: pending.vehicles.length, orders: pending.orders.filter(o => !isSample(o.id)).length, trips: pending.trips.filter(x => !isSample(x.id)).length })}
        onOk={() => { if (pending) s.replaceAll(pending) }} />
      <Confirm open={askReset} onClose={() => setAskReset(false)} okText={t('Xoá hết')} title={t('Xoá toàn bộ dữ liệu?')}
        body={t('Mã hàng, xe, đơn, chuyến của bạn trên máy này sẽ mất. Nên tải file sao lưu trước.')}
        onOk={() => s.replaceAll({ app: 'malcargo', version: 1, items: [], vehicles: [], orders: [], trips: [], pallet: DEFAULT_PALLET_SETTINGS })} />
    </>
  )
}
