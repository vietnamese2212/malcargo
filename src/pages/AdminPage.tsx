// Màn Quản trị (chủ dự án 05/11: "admin cần biết có bao nhiêu user, bao nhiêu người sử dụng, bao nhiêu người trả phí").
// Chỉ đọc. Số do hàm máy chủ `admin_stats` trả, chỉ admin gọi được. Người mở app mà không đăng nhập thì không đếm được.
import { useEffect, useState } from 'react'
import { t } from '../i18n'
import { loadAdminStats, useAuth, type AdminStats } from '../data/cloud'
import { Badge, Button, SummaryBand, fmtInt } from '../ui/kit'
import { ListCard, Page, PageHeader } from '../ui/Shell'

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
            { label: 'Family', value: n(stats?.families), sub: t('{n} người', { n: n(stats?.family_people) }) },
            { label: t('Đang trả phí'), value: n(stats?.paying_people), sub: t('{n} Family còn hạn', { n: n(stats?.paying_families) }) },
          ]} />
          {err && (
            <div className="flex items-center gap-3 px-4 py-3">
              <p className="min-w-0 flex-1 break-words text-[13px] text-red-700">{t('Không đọc được số liệu: {e}', { e: err })}</p>
              <Button disabled={busy} onClick={load}>{t('Thử lại')}</Button>
            </div>
          )}
          <p className="px-4 py-3 text-[13px] leading-snug text-slate-600">{t('Chỉ đếm người đã đăng nhập.')}</p>
        </ListCard>
      </Page>
    </>
  )
}
