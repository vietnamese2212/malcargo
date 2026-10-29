import { useRef, useState, type ReactNode } from 'react'
import { Download, LogIn, MessageCircle, RotateCcw, Upload } from 'lucide-react'
import { exportBackup, parseBackup, useData, type BackupData } from '../data/store'
import { signInGoogle, useAuth } from '../data/cloud'
import { DEFAULT_PALLET_SETTINGS } from '../data/catalog'
import { Button, Confirm, LiveNum, SectionBand, fmtInt } from '../ui/kit'
import { ListCard, Page, PageHeader } from '../ui/Shell'
import { saveFile } from '../ui/saveFile'
import { t } from '../i18n'

/** Một nhóm cài đặt: band tiêu đề + câu giải thích nhìn thấy ngay + phần điều khiển. */
function Group({ title, desc, children, first }: { title: string; desc: ReactNode; children: ReactNode; first?: boolean }) {
  return (
    <>
      <SectionBand title={title} className={first ? 'border-t-0 sm:rounded-t-[7px]' : undefined} />
      <div className="px-4 py-4">
        <p className="max-w-2xl text-sm text-slate-700">{desc}</p>
        <div className="mt-3">{children}</div>
      </div>
    </>
  )
}

export default function AccountPage() {
  const s = useData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<BackupData | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [askReset, setAskReset] = useState(false)
  const auth = useAuth()

  const download = () => saveFile(`malcargo-sao-luu-${new Date().toLocaleDateString('en-CA')}.json`,
    () => new Blob([JSON.stringify(exportBackup(), null, 1)], { type: 'application/json' }))
  const onFile = async (f: File | undefined) => {
    if (!f) return
    const r = parseBackup(await f.text())
    if (typeof r === 'string') setMsg(r); else { setMsg(null); setPending(r) }
    if (fileRef.current) fileRef.current.value = ''
  }
  const p = s.pallet
  const counts = [[s.items.length, t('mã hàng')], [s.vehicles.length, t('xe')], [s.orders.length, t('đơn')], [s.trips.length, t('chuyến')]] as const

  return (
    <>
      <PageHeader title={t('Tài khoản & dữ liệu')} />
      <Page flush className="space-y-4">
        <ListCard>
          {/* cùng nút Login trên thanh trên (trước đây ghi "sắp có" trong khi Login đã chạy — thử 29/10) */}
          <Group first title={t('Dữ liệu trên máy này')}
            desc={auth.status === 'in' && auth.user ? t('Đã đăng nhập {email} — dữ liệu trên máy tự đồng bộ lên tài khoản.', { email: auth.user.email })
              : auth.status === 'off' ? t('Mọi thứ bạn nhập đang lưu trong trình duyệt của máy này.')
              : t('Mọi thứ bạn nhập đang lưu trong trình duyệt của máy này. Đăng nhập Google để dùng cùng dữ liệu trên máy khác.')}>
            <div className="grid grid-cols-4 divide-x divide-slate-200 rounded-md border border-slate-200">
              {counts.map(([n, label]) => (
                <div key={label} className="px-3 py-2">
                  <div className="num text-xl font-semibold text-slate-900">{fmtInt(n)}</div>
                  <div className="text-[12px] text-slate-600">{label}</div>
                </div>
              ))}
            </div>
            {auth.status === 'out' && (
              <Button className="mt-3 w-full sm:w-auto" onClick={() => signInGoogle().catch(e => setMsg(String(e?.message ?? e)))}><LogIn size={17} />{t('Tiếp tục với Google')}</Button>
            )}
          </Group>

          <Group title={t('Sao lưu')}
            desc={t('Xoá dữ liệu trình duyệt hoặc gỡ app là mất dữ liệu trên máy. Tải file sao lưu để giữ, hoặc để chuyển sang máy khác.')}>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={download}><Download size={17} />{t('Tải file sao lưu')}</Button>
              <Button onClick={() => fileRef.current?.click()}><Upload size={17} />{t('Nạp từ file')}</Button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
            </div>
            {msg && <p className="mt-2 text-sm text-red-700">{msg}</p>}
          </Group>

          <Group title={t('Pallet dùng khi chở xe pallet')}
            desc={t('Áp cho mọi chuyến xe pallet. Pallet hàng nguyên cao theo số thùng/pallet của từng mã; pallet gộp hàng lẻ không cao quá mức dưới.')}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {/* cùng khoảng số với bảng Thùng xe — số vô lý (chân 10 mm, đế 2 m) không được lưu, ô đỏ */}
              <LiveNum label={t('Dài chân')} value={p.l} valid={n => n >= 400 && n <= 2000} suffix="mm" onCommit={v => v && s.setPallet({ ...p, l: v })} />
              <LiveNum label={t('Rộng chân')} value={p.w} valid={n => n >= 400 && n <= 2000} suffix="mm" onCommit={v => v && s.setPallet({ ...p, w: v })} />
              <LiveNum label={t('Cao tối đa pallet lẻ')} value={p.maxH} valid={n => n >= 500 && n <= 3000} suffix="mm" onCommit={v => v && s.setPallet({ ...p, maxH: v })} />
              <LiveNum label={t('Cao đế pallet')} value={p.baseH} valid={n => n >= 50 && n <= 300} suffix="mm" onCommit={v => v && s.setPallet({ ...p, baseH: v })} />
              <LiveNum label={t('Nặng pallet rỗng')} value={p.kg} valid={n => n >= 0 && n <= 100} suffix="kg" onCommit={v => v != null && s.setPallet({ ...p, kg: v })} />
            </div>
            <button className="tap mt-2 text-[13px] font-medium text-brand-700 hover:text-brand-600" onClick={() => s.setPallet(DEFAULT_PALLET_SETTINGS)}>{t('Về mặc định 1200 × 1000')}</button>
          </Group>

          <Group title={t('Xoá dữ liệu')} desc={t('Xoá mọi mã hàng, xe, đơn, chuyến của bạn trên máy này. Nên tải file sao lưu trước.')}>
            <Button variant="danger" onClick={() => setAskReset(true)}><RotateCcw size={16} />{t('Xoá toàn bộ dữ liệu trên máy này')}</Button>
          </Group>
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
          { items: pending.items.length, vehicles: pending.vehicles.length, orders: pending.orders.length, trips: pending.trips.length })}
        onOk={() => { if (pending) s.replaceAll(pending) }} />
      <Confirm open={askReset} onClose={() => setAskReset(false)} okText={t('Xoá hết')} title={t('Xoá toàn bộ dữ liệu?')}
        body={t('Mã hàng, xe, đơn, chuyến của bạn trên máy này sẽ mất. Nên tải file sao lưu trước.')}
        onOk={() => s.replaceAll({ app: 'malcargo', version: 1, items: [], vehicles: [], orders: [], trips: [], pallet: DEFAULT_PALLET_SETTINGS })} />
    </>
  )
}
