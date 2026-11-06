// Màn Quản trị (chủ dự án 05/11: "admin cần biết có bao nhiêu user, bao nhiêu người sử dụng, bao nhiêu người trả phí";
// "super admin xem được user nào đăng ký, theo Family, bao nhiêu khách vãng lai, các đơn đã làm" + chọn "chỉ đếm").
// Chỉ đọc. Admin: số tổng (`admin_stats`). Super admin: thêm danh sách (`admin_people`) — máy chủ chỉ trả SỐ đơn / chuyến, không trả nội dung.
import { useEffect, useState } from 'react'
import { numLocale, t } from '../i18n'
import { loadAdminPeople, loadAdminStats, useAuth, type AdminFamily, type AdminPeople, type AdminStats, type AdminUser } from '../data/cloud'
import { Badge, Button, SummaryBand, fmtInt } from '../ui/kit'
import { ListCard, Page, PageHeader } from '../ui/Shell'
import { famLabel } from '../data/store'

const day = (d: string | null) => (d ? new Date(d).toLocaleDateString(numLocale()) : '—')
const today = () => new Date().toISOString().slice(0, 10)

export default function AdminPage() {
  const isSuper = useAuth(s => s.isSuper)
  const [stats, setStats] = useState<AdminStats | null>(null), [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(true)
  const load = () => {
    setBusy(true); setErr(null)
    loadAdminStats().then(r => { if (typeof r === 'string') setErr(r); else setStats(r) }).finally(() => setBusy(false))
  }
  useEffect(load, [])
  const n = (v?: number) => (stats && v != null ? fmtInt(v) : '…')
  return (
    <>
      <PageHeader title={t('Quản trị')} actions={<Badge tone="blue">{isSuper ? 'Super admin' : 'Admin'}</Badge>} />
      <Page flush className="space-y-4">
        <ListCard>
          <SummaryBand tiles={[
            { label: t('Tài khoản'), value: n(stats?.users), sub: t('{n} mới trong 30 ngày', { n: n(stats?.new30) }) },
            { label: t('Đang sử dụng'), value: n(stats?.active30), sub: t('hoạt động trong 30 ngày') },
            { label: t('Khách vãng lai'), value: n(stats?.guests30), sub: t('30 ngày · {n} hôm nay', { n: n(stats?.guests_today) }) },
            { label: 'Family', value: n(stats?.families), sub: t('{n} người', { n: n(stats?.family_people) }) },
            { label: t('Đang trả phí'), value: n(stats?.paying_people), sub: t('{n} Family còn hạn', { n: n(stats?.paying_families) }) },
          ]} />
          {err && (
            <div className="flex items-center gap-3 px-4 py-3">
              <p className="min-w-0 flex-1 break-words text-[13px] text-red-700">{t('Không đọc được số liệu: {e}', { e: err })}</p>
              <Button disabled={busy} onClick={load}>{t('Thử lại')}</Button>
            </div>
          )}
          <p className="px-4 py-3 text-[13px] leading-snug text-slate-600">{t('Khách vãng lai: số thiết bị mở app mà chưa từng đăng nhập. Không biết họ là ai, làm gì.')}</p>
        </ListCard>
        {isSuper && <People />}
      </Page>
    </>
  )
}

/** Hai danh sách của super admin. */
function People() {
  const [data, setData] = useState<AdminPeople | null>(null), [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(true)
  const load = () => {
    setBusy(true); setErr(null)
    loadAdminPeople().then(r => { if (typeof r === 'string') setErr(r); else setData(r) }).finally(() => setBusy(false))
  }
  useEffect(load, [])
  if (err) return (
    <ListCard>
      <div className="flex items-center gap-3 px-4 py-3">
        <p className="min-w-0 flex-1 break-words text-[13px] text-red-700">{t('Không đọc được danh sách: {e}', { e: err })}</p>
        <Button disabled={busy} onClick={load}>{t('Thử lại')}</Button>
      </div>
    </ListCard>
  )
  if (!data) return <p className="px-4 text-[13px] text-slate-600 sm:px-0">{t('Đang tải…')}</p>
  const sum = (k: 'orders' | 'trips', list: { orders: number; trips: number }[]) => list.reduce((a, x) => a + x[k], 0)
  return (
    <>
      <ListCard>
        <Head title={t('Người dùng')} n={data.users.length} orders={sum('orders', data.users)} trips={sum('trips', data.users)} />
        <ul className="divide-y divide-slate-100" data-admin-users>{data.users.map(u => <UserRow key={u.id} u={u} />)}</ul>
      </ListCard>
      <ListCard>
        <Head title="Family" n={data.families.length} orders={sum('orders', data.families)} trips={sum('trips', data.families)} />
        {data.families.length
          ? <ul className="divide-y divide-slate-100" data-admin-families>{data.families.map(f => <FamilyRow key={f.id} f={f} />)}</ul>
          : <p className="px-4 py-3 text-[13px] text-slate-600">{t('Chưa có Family nào.')}</p>}
      </ListCard>
      <p className="px-4 text-[13px] leading-snug text-slate-600 sm:px-0">{t('Chỉ đếm số đơn, chuyến; không xem được nội dung. Đơn trong Family tính ở Family, không tính vào từng người.')}</p>
    </>
  )
}

const Head = ({ title, n, orders, trips }: { title: string; n: number; orders: number; trips: number }) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-slate-200 px-4 py-3">
    <h2 className="text-[15px] font-semibold text-navy-900">{title} <span className="num font-normal text-slate-600">({fmtInt(n)})</span></h2>
    <span className="num text-[13px] text-slate-600">{t('{n} đơn', { n: fmtInt(orders) })} · {t('{n} chuyến', { n: fmtInt(trips) })}</span>
  </div>
)

function UserRow({ u }: { u: AdminUser }) {
  return (
    <li className="gap-x-4 px-4 py-3 sm:flex sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="break-words text-[14px] font-medium text-slate-900">{u.name || u.email}</div>
        {u.name && <div className="break-all text-[13px] text-slate-600">{u.email}</div>}
        <div className="num mt-0.5 text-[12px] text-slate-600">{t('Đăng ký {d}', { d: day(u.created_at) })} · {t('Dùng gần nhất {d}', { d: day(u.last_used) })}</div>
        {!!u.families.length && (
          <div className="mt-1 flex flex-wrap gap-1">
            {u.families.map(f => <span key={f.name} className="min-w-0 max-w-full break-words rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">{famLabel(f.name)} · {f.role === 'owner' ? t('Chủ') : t('Thành viên')}</span>)}
          </div>
        )}
      </div>
      <div className="num mt-1 flex-none text-[13px] text-slate-700 sm:mt-0 sm:text-right">
        <div>{t('{n} đơn', { n: fmtInt(u.orders) })} · {t('{n} chuyến', { n: fmtInt(u.trips) })}</div>
        <div className="text-[12px] text-slate-600">{t('{n} mã', { n: fmtInt(u.items) })} · {t('{n} xe', { n: fmtInt(u.vehicles) })}</div>
      </div>
    </li>
  )
}

function FamilyRow({ f }: { f: AdminFamily }) {
  const paid = !!f.paid_until && f.paid_until >= today()
  return (
    <li className="px-4 py-3">
      <div className="gap-x-4 sm:flex sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 break-words text-[14px] font-medium text-slate-900">{f.name}</span>
            <Badge tone={paid ? 'green' : 'slate'}>{paid ? t('Đã trả tới {d}', { d: day(f.paid_until) }) : t('Chưa trả phí')}</Badge>
          </div>
          <div className="num mt-0.5 text-[12px] text-slate-600">{t('Tạo {d}', { d: day(f.created_at) })}</div>
        </div>
        <div className="num mt-1 flex-none text-[13px] text-slate-700 sm:mt-0">{t('{n} đơn', { n: fmtInt(f.orders) })} · {t('{n} chuyến', { n: fmtInt(f.trips) })}</div>
      </div>
      <ul className="mt-2 space-y-1">
        {f.members.map(m => (
          <li key={m.email} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-slate-700">
            <span className="min-w-0 break-all">{m.email}</span>
            {m.role === 'owner' && <Badge tone="blue">{t('Chủ')}</Badge>}
            {m.status === 'invited' && <Badge tone="amber">{t('Đang chờ')}</Badge>}
          </li>
        ))}
      </ul>
    </li>
  )
}
