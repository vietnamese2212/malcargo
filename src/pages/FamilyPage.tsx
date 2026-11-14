// FAMILY (nhóm / công ty) — chủ dự án 01/11: "user đăng nhập thì tạo được Family, trả phí theo tháng để thêm người và dùng chung
// dữ liệu; bao nhiêu người thì bấy nhiêu tiền — giá 0 đ, đặt sau" + "có mã giảm giá, mã 100% hiện lên để user nhập" + "mã
// THUNGHIEM chạy ở màn Tạo Family". Chủ giữ danh mục (mã hàng, xe, cỡ pallet), thành viên làm đơn + chuyến. Mỗi người có bộ
// "Của tôi" + bộ của từng Family đang tham gia, đổi qua lại ở đây hoặc menu ≡.
import { useEffect, useState } from 'react'
import { Check, ClipboardCopy, Crown, Loader2, Mail, RefreshCw, Send, Share2, Trash2, UsersRound, X } from 'lucide-react'
import {
  acceptInvite, adminDeleteCode, adminSaveCode, adminSetPrice, applyCode, approveMember, createFamily, declineInvite, deleteFamily, familyLink,
  inviteMember, isFamAdmin, leaveFamily, myFamilyWork, removeMember, renameFamily, setFamilyHideSamples, setFamilyOpen, setMemberRole, signInGoogle, switchSpace,
  transferOwner, useAuth, useFamily, type Family, type Fee, type Member,
} from '../data/cloud'
import { familyUrl } from '../data/famlink'
import type { SharePack } from '../data/share'
import { famLabel, useSpace, type FamilyRole } from '../data/store'
import { Badge, Button, Confirm, Field, IconButton, NumInput, Sheet, Switch, TextInput, cx, fmtInt } from '../ui/kit'
import { GoogleG, ListCard, Page, PageHeader } from '../ui/Shell'
import { numLocale, t } from '../i18n'

const vnd = (n: number) => t('{n} đ', { n: fmtInt(n) })
const H2 = 'break-words text-[15px] font-semibold leading-snug text-slate-900'
const DESC = 'mt-0.5 break-words text-[13px] leading-snug text-slate-600'

export default function FamilyPage() {
  const { status, isSuper } = useAuth()
  const { loaded, families, invites, asked } = useFamily()
  const signedIn = status === 'in'
  const owns = families.some(f => f.role === 'owner')
  return (
    <>
      <PageHeader title="Family" subtitle={t('Cả nhóm dùng chung mã hàng, xe, đơn và chuyến')} />
      <Page flush className="space-y-4">
        {!signedIn ? (
          <ListCard>
            <section className="px-4 py-5">
              <h2 className={H2}>{t('Đăng nhập để dùng Family')}</h2>
              <p className={DESC}>{t('Tạo Family cho công ty, hoặc nhận lời mời của người khác.')}</p>
              {status === 'out' && <Button className="mt-3 w-full sm:w-auto" onClick={() => void signInGoogle()}><GoogleG />{t('Tiếp tục với Google')}</Button>}
            </section>
          </ListCard>
        ) : (
          <>
            {invites.map(inv => <InviteCard key={inv.familyId} id={inv.familyId} name={inv.name} owner={inv.owner} />)}
            {asked.map(a => <AskedCard key={a.familyId} id={a.familyId} name={a.name} />)}
            {!!families.length && <SpacePicker />}
            {families.map(f => <FamilyCard key={f.id} f={f} />)}
            {loaded && !owns && <CreateFamily />}
          </>
        )}
        {signedIn && isSuper && <AdminPricing />}
      </Page>
    </>
  )
}

/** Chọn bộ dữ liệu đang mở: "Của tôi" hoặc một Family. */
function SpacePicker() {
  const families = useFamily(s => s.families), members = useFamily(s => s.members)
  const cur = useSpace(s => s.id)
  const opts = [{ id: 'me', label: t('Của tôi'), sub: t('Chỉ mình bạn') },
    ...families.map(f => ({ id: f.id, label: famLabel(f.name), sub: t('{n} người', { n: (members[f.id] ?? []).filter(m => m.status === 'active').length }) }))]
  return (
    <ListCard>
      <section className="px-4 py-4">
        <h2 className={H2}>{t('Dữ liệu đang mở')}</h2>
        <div role="radiogroup" aria-label={t('Dữ liệu đang mở')} className="mt-3 grid gap-2 sm:grid-cols-2">
          {opts.map(o => (
            <button key={o.id} type="button" role="radio" aria-checked={cur === o.id} onClick={() => void switchSpace(o.id)}
              className={cx('flex min-h-[52px] items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors',
                cur === o.id ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-300 bg-white hover:bg-slate-50')}>
              <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full border-2', cur === o.id ? 'border-brand-500' : 'border-slate-400')}>
                {cur === o.id && <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />}
              </span>
              <span className="min-w-0">
                <span className="block break-words text-sm font-semibold text-slate-900">{o.label}</span>
                <span className="block text-[12px] text-slate-600">{o.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </ListCard>
  )
}

function InviteCard({ id, name, owner }: { id: string; name: string; owner: string }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null)
  const run = async (p: Promise<string | null>) => { setBusy(true); setErr(await p); setBusy(false) }
  return (
    <ListCard className="border-brand-200">
      <section className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h2 className={H2}>{t('Lời mời vào {name}', { name: famLabel(name) })}</h2>
          <p className={DESC}>{t('{owner} mời bạn dùng chung mã hàng, xe, đơn và chuyến.', { owner })}</p>
          {err && <p className="mt-1 text-[13px] text-red-700">{err}</p>}
        </div>
        <div className="flex gap-2">
          <Button className="max-sm:flex-1" disabled={busy} onClick={() => run(declineInvite(id))}>{t('Từ chối')}</Button>
          <Button variant="primary" className="max-sm:flex-1" disabled={busy} onClick={() => run(acceptInvite(id))}>{t('Tham gia')}</Button>
        </div>
      </section>
    </ListCard>
  )
}

/** Mã giảm giá + mã đang mở công khai (bấm là điền). */
function CodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const codes = useFamily(s => s.codes).filter(c => c.featured && c.active)
  return (
    <div>
      <Field label={t('Mã giảm giá')}>
        <TextInput value={value} onChange={e => onChange(e.target.value.toUpperCase())} maxLength={32} autoCapitalize="characters" placeholder={codes[0]?.code ?? ''} />
      </Field>
      {codes.map(c => (
        <button key={c.code} type="button" onClick={() => onChange(c.code)}
          className="mt-1.5 flex min-h-[40px] w-full items-center gap-2 rounded-md border border-dashed border-brand-500 bg-brand-50 px-3 text-left text-[13px] text-brand-700 hover:bg-brand-100">
          <span className="font-bold tracking-wide">{c.code}</span><span>{t('giảm {p}% — bấm để dùng', { p: c.percent })}</span>
        </button>
      ))}
    </div>
  )
}

function FeeBox({ fee }: { fee?: Fee }) {
  if (!fee) return null
  const sub = fee.price * fee.people, total = Math.round((sub * (100 - fee.percent)) / 100)
  return (
    <div className="num rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700">
      <div className="flex justify-between gap-3"><span>{t('{n} người × {price} / tháng', { n: fee.people, price: vnd(fee.price) })}</span><span className="whitespace-nowrap">{vnd(sub)}</span></div>
      {!!fee.percent && <div className="flex justify-between gap-3 text-emerald-800"><span>{t('Mã {code}: giảm {p}%', { code: fee.code ?? '', p: fee.percent })}</span><span className="whitespace-nowrap">−{vnd(sub - total)}</span></div>}
      <div className="mt-1 flex justify-between gap-3 border-t border-slate-200 pt-1 font-semibold text-slate-900"><span>{t('Phải trả mỗi tháng')}</span><span className="whitespace-nowrap">{vnd(total)}</span></div>
      {fee.paidUntil && <div className="mt-0.5">{t('Đã trả tới {d}', { d: new Date(fee.paidUntil).toLocaleDateString(numLocale()) })}</div>}
    </div>
  )
}

function CreateFamily() {
  const price = useFamily(s => s.price)
  const [name, setName] = useState(''), [copy, setCopy] = useState(true), [code, setCode] = useState('')
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null)
  const create = async () => {
    if (!name.trim()) { setErr(t('Nhập tên Family')); return }
    setBusy(true); setErr(await createFamily(name, copy, code)); setBusy(false)
  }
  return (
    <ListCard>
      <form className="px-4 py-4" onSubmit={e => { e.preventDefault(); void create() }}>
        <h2 className={H2}>{t('Tạo Family')}</h2>
        <p className={DESC}>{t('Mời người cùng công ty dùng chung dữ liệu. Bạn là chủ: giữ mã hàng, xe, cỡ pallet; thêm / bớt người.')}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={t('Tên Family')}><TextInput value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder={t('Tên công ty / nhóm')} /></Field>
          <CodeField value={code} onChange={setCode} />
        </div>
        <div className="mt-3"><Switch checked={copy} onChange={setCopy} label={t('Chép mã hàng, xe, cỡ pallet của tôi sang')} /></div>
        <p className="mt-3 text-[13px] text-slate-600">
          {price ? t('Phí {price} / người / tháng, tính cả chủ.', { price: vnd(price) }) : t('Hiện miễn phí.')}
        </p>
        {err && <p className="mt-2 text-[13px] text-red-700">{err}</p>}
        <Button type="submit" variant="primary" className="mt-3 w-full sm:w-auto" disabled={busy}><UsersRound size={17} />{busy ? t('Đang tạo…') : t('Tạo Family')}</Button>
      </form>
    </ListCard>
  )
}

const ROLES = ['manager', 'member', 'viewer'] as const
const ROLE_LABEL: Record<FamilyRole, string> = { owner: 'Chủ', manager: 'Quản lý', member: 'Thành viên', viewer: 'Chỉ xem' } // i18n-key
const ROLE_DESC: Record<FamilyRole, string> = {
  owner: 'Bạn giữ mã hàng, xe, cỡ pallet; mọi người cùng làm đơn và chuyến.', // i18n-key
  manager: 'Bạn cùng chủ quản lý mã hàng, xe, cỡ pallet và duyệt người; mọi người cùng làm đơn và chuyến.', // i18n-key
  member: 'Mã hàng, xe, cỡ pallet do chủ Family quản lý; bạn làm đơn và chuyến.', // i18n-key
  viewer: 'Bạn chỉ xem dữ liệu của Family, không sửa được.', // i18n-key
}
const Avatar = ({ m }: { m: Member }) => (
  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">{(m.name || m.email).slice(0, 1).toUpperCase()}</span>
)
const Who = ({ m }: { m: Member }) => (
  <span className="min-w-0 flex-1">
    <span className="block break-words text-sm font-medium text-slate-900">{m.name || m.email}</span>
    {m.name && <span className="block break-all text-[12px] text-slate-600">{m.email}</span>}
  </span>
)

type Ask = 'leave' | 'delete' | 'transfer' | { remove: string } | null

function FamilyCard({ f }: { f: Family }) {
  const all = useFamily(s => s.members[f.id]) ?? []
  const members = all.filter(m => m.status !== 'requested'), asking = all.filter(m => m.status === 'requested')
  const fee = useFamily(s => s.fees[f.id])
  const open = useSpace(s => s.id === f.id)
  const owner = f.role === 'owner', admin = isFamAdmin(f.role)
  const [email, setEmail] = useState(''), [code, setCode] = useState(f.discountCode ?? '')
  const [renaming, setRenaming] = useState(false), [name, setName] = useState(f.name)
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null)
  const [ask, setAsk] = useState<Ask>(null)
  const [sharing, setSharing] = useState(false)
  // rời Family: chuyến do mình tạo ⇒ hỏi có mang bản sao về "Của tôi" không (tick sẵn)
  const [work, setWork] = useState<SharePack[]>([]), [takeCopy, setTakeCopy] = useState(true)
  // chuyển quyền chủ: chọn người đã vào Family
  const heirs = members.filter(m => m.status === 'active' && m.role !== 'owner')
  const [heir, setHeir] = useState('')
  useEffect(() => setCode(f.discountCode ?? ''), [f.discountCode])
  useEffect(() => {
    if (ask !== 'leave') return
    let live = true
    setWork([]); setTakeCopy(true)
    void myFamilyWork(f.id).then(w => { if (live) setWork(w) })
    return () => { live = false }
  }, [ask, f.id])
  const run = async (p: Promise<string | null>, done?: () => void) => {
    setBusy(true); const e = await p; setBusy(false); setErr(e)
    if (!e) done?.()
  }
  const canRemove = (m: Member) => admin && m.role !== 'owner' && (m.role !== 'manager' || owner)
  return (
    <ListCard>
      <section className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void run(renameFamily(f.id, name), () => setRenaming(false)) }}>
              <TextInput autoFocus value={name} maxLength={80} onChange={e => setName(e.target.value)} aria-label={t('Tên Family')} className="min-w-0 flex-1" />
              <Button type="submit" variant="primary" disabled={busy || !name.trim()}>{t('Lưu')}</Button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className={cx(H2, 'text-[17px]')}>{famLabel(f.name)}</h2>
              <Badge tone="blue">{t(ROLE_LABEL[f.role])}</Badge>
              {open && <Badge tone="green">{t('Đang mở')}</Badge>}
            </div>
          )}
          <p className={DESC}>{t(ROLE_DESC[f.role])}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {admin && !renaming && <Button variant="ghost" className="text-brand-700" onClick={() => { setName(f.name); setRenaming(true) }}>{t('Đổi tên')}</Button>}
          {!open && <Button variant="primary" onClick={() => void switchSpace(f.id)}>{t('Mở dữ liệu Family')}</Button>}
        </div>
      </section>

      {admin && (
        <section className="border-t border-slate-200 px-4 py-4">
          <Switch checked={f.open} onChange={v => void run(setFamilyOpen(f.id, v))}
            label={t('Mở cho người ngoài xem đơn hàng')}
            hint={f.open ? t('Ai có link Family xem được đơn hàng (chỉ xem, không sửa). Mã hàng, xe, chuyến vẫn kín.') : t('Đang đóng: chỉ người trong Family xem được dữ liệu.')} />
          <Button className="mt-3 w-full sm:w-auto" onClick={() => setSharing(true)}><Share2 size={16} />{t('Chia sẻ Family')}</Button>
          <p className="mt-1.5 text-[12px] text-slate-600">{t('Gửi link cho người muốn vào: họ đăng nhập rồi bấm Xin vào, bạn duyệt ở đây.')}</p>
          {/* chủ dự án 14/11: "chủ family có thể chọn — hide hết đơn mẫu đi cho toàn family" */}
          {f.hideSupported && <div className="mt-4">
            <Switch checked={f.hideSamples} onChange={v => void run(setFamilyHideSamples(f.id, v))}
              label={t('Ẩn dữ liệu mẫu cho cả Family')}
              hint={f.hideSamples ? t('Mọi người trong Family không thấy chuyến và đơn mẫu (Mẫu pallet, Mẫu 40ft).') : t('Chuyến và đơn mẫu đang hiện cho mọi người — để làm quen app.')} />
          </div>}
        </section>
      )}

      {admin && !!asking.length && (
        <section className="border-t border-slate-200 bg-amber-50/50 px-4 py-4">
          <h3 className="text-sm font-semibold text-slate-900">{t('Xin vào')} <span className="font-normal text-slate-600">· {asking.length}</span></h3>
          <ul className="mt-1 divide-y divide-amber-100">
            {asking.map(m => (
              <li key={m.email} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
                <Avatar m={m} /><Who m={m} />
                <div className="flex gap-2 max-sm:w-full">
                  <Button className="max-sm:flex-1" disabled={busy} onClick={() => void run(removeMember(f.id, m.email))} aria-label={t('Từ chối {email}', { email: m.email })}>{t('Từ chối')}</Button>
                  <Button variant="primary" className="max-sm:flex-1" disabled={busy} onClick={() => void run(approveMember(f.id, m.email))} aria-label={t('Duyệt {email}', { email: m.email })}><Check size={16} />{t('Duyệt')}</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border-t border-slate-200 px-4 py-4">
        <h3 className="text-sm font-semibold text-slate-900">{t('Người trong Family')} <span className="font-normal text-slate-600">· {members.length}</span></h3>
        <ul className="mt-1 divide-y divide-slate-100">
          {members.map(m => (
            <li key={m.email} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <Avatar m={m} /><Who m={m} />
              {m.status === 'invited' && <Badge tone="amber">{t('Đang chờ')}</Badge>}
              {owner && m.role !== 'owner' ? (
                <select value={m.role} disabled={busy} onChange={e => void run(setMemberRole(f.id, m.email, e.target.value as Exclude<FamilyRole, 'owner'>))}
                  aria-label={t('Vai của {email}', { email: m.email })}
                  className="h-10 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800 max-sm:text-base">
                  {ROLES.map(r => <option key={r} value={r}>{t(ROLE_LABEL[r])}</option>)}
                </select>
              ) : m.status === 'active' && <Badge tone={m.role === 'owner' ? 'blue' : 'slate'}>{t(ROLE_LABEL[m.role])}</Badge>}
              {canRemove(m) && (
                <IconButton label={t('Bỏ {email} khỏi Family', { email: m.email })} onClick={() => setAsk({ remove: m.email })} className="text-slate-500"><X size={17} /></IconButton>
              )}
            </li>
          ))}
        </ul>
        {admin && (
          <form className="mt-2 flex gap-2" onSubmit={e => { e.preventDefault(); if (email.trim()) void run(inviteMember(f.id, email), () => setEmail('')) }}>
            <TextInput type="email" inputMode="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)}
              placeholder={t('Email Google của người cần mời')} aria-label={t('Email người cần mời')} className="min-w-0 flex-1" />
            <Button type="submit" variant="primary" disabled={busy || !email.trim()}><Mail size={16} />{t('Mời')}</Button>
          </form>
        )}
        {admin && <p className="mt-1.5 text-[12px] text-slate-600">{t('Người được mời đăng nhập bằng email này là thấy lời mời.')}</p>}
        {owner && <p className="mt-1 text-[12px] text-slate-600">{t('Quản lý: sửa mã hàng, xe và duyệt người như chủ. Chỉ xem: không sửa được gì.')}</p>}
      </section>

      {owner && (
        <section className="border-t border-slate-200 px-4 py-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">{t('Phí tháng')}</h3>
          <FeeBox fee={fee} />
          <form className="mt-3 grid items-start gap-2 sm:grid-cols-[1fr_auto]" onSubmit={e => { e.preventDefault(); void run(applyCode(f.id, code)) }}>
            <CodeField value={code} onChange={setCode} />
            <Button type="submit" className="sm:mt-[26px]" disabled={busy || code === (f.discountCode ?? '')}>{t('Áp dụng mã')}</Button>
          </form>
        </section>
      )}

      {err && <p className="border-t border-slate-200 px-4 py-2 text-[13px] text-red-700">{err}</p>}
      <section className="flex flex-wrap items-center gap-x-2 border-t border-slate-200 px-4 py-3">
        {owner ? (
          <>
            {!!heirs.length && <Button variant="ghost" className="-ml-2 text-brand-700" onClick={() => { setHeir(heirs[0].email); setAsk('transfer') }}><Crown size={16} />{t('Chuyển quyền chủ')}</Button>}
            <Button variant="ghost" className={cx('text-red-700', !heirs.length && '-ml-2')} onClick={() => setAsk('delete')}><Trash2 size={16} />{t('Xoá Family')}</Button>
            <p className="w-full text-[12px] text-slate-600">{t('Chủ muốn rời thì chuyển quyền chủ cho người khác trước.')}</p>
          </>
        ) : <Button variant="ghost" className="-ml-2 text-red-700" onClick={() => setAsk('leave')}>{t('Rời Family')}</Button>}
      </section>

      <Confirm open={ask === 'delete'} onClose={() => setAsk(null)} okText={t('Xoá Family')} title={t('Xoá {name}?', { name: famLabel(f.name) })}
        body={t('Mọi người mất quyền vào, đơn và chuyến của Family bị xoá, không lấy lại được.')}
        onOk={() => void run(deleteFamily(f.id))} />
      <Confirm open={ask === 'leave'} onClose={() => setAsk(null)} okText={t('Rời Family')} title={t('Rời {name}?', { name: famLabel(f.name) })}
        body={<>
          <p>{t('Bạn không còn thấy dữ liệu của Family; dữ liệu "Của tôi" giữ nguyên.')}</p>
          {!!work.length && (
            <label className="mt-3 flex min-h-[44px] cursor-pointer items-center gap-2.5 text-slate-800">
              <input type="checkbox" className="h-5 w-5 shrink-0 accent-brand-500" checked={takeCopy} onChange={e => setTakeCopy(e.target.checked)} />
              <span>{t('Mang theo bản sao {n} chuyến bạn tạo (kèm đơn) về "Của tôi"', { n: work.length })}</span>
            </label>
          )}
        </>}
        onOk={() => void run(leaveFamily(f.id, takeCopy ? work : []))} />
      <Confirm open={ask === 'transfer'} onClose={() => setAsk(null)} danger={false} okText={t('Chuyển quyền')} title={t('Chuyển quyền chủ {name}', { name: famLabel(f.name) })}
        body={<>
          <p>{t('Người nhận thành chủ: giữ phí tháng, xoá được Family. Bạn thành Quản lý.')}</p>
          <select value={heir} onChange={e => setHeir(e.target.value)} aria-label={t('Chuyển quyền chủ cho')}
            className="mt-3 h-11 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800 max-sm:text-base">
            {heirs.map(m => <option key={m.email} value={m.email}>{m.name ? `${m.name} · ${m.email}` : m.email}</option>)}
          </select>
        </>}
        onOk={() => { if (heir) void run(transferOwner(f.id, heir)) }} />
      <Confirm open={!!ask && typeof ask === 'object'} onClose={() => setAsk(null)} okText={t('Bỏ khỏi Family')}
        title={t('Bỏ {email} khỏi Family?', { email: ask && typeof ask === 'object' ? ask.remove : '' })}
        onOk={() => { if (ask && typeof ask === 'object') void run(removeMember(f.id, ask.remove)) }} />
      <FamilyShareSheet open={sharing} onClose={() => setSharing(false)} f={f} />
    </ListCard>
  )
}

/** Chủ / quản lý: link Family (chép, gửi, đổi link). Người mở link: Family MỞ ⇒ xem đơn hàng; ai cũng bấm Xin vào được. */
function FamilyShareSheet({ open, onClose, f }: { open: boolean; onClose: () => void; f: Family }) {
  const [code, setCode] = useState<string | null>(f.link), [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false), [renew, setRenew] = useState(false), [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setCopied(false); setErr(null)
    if (f.link) { setCode(f.link); return }
    let live = true
    void familyLink(f.id).then(r => { if (live) { if ('code' in r) setCode(r.code); else setErr(r.error) } })
    return () => { live = false }
  }, [open, f.id, f.link])
  const url = code ? familyUrl(code) : ''
  const copy = async () => {
    try { await navigator.clipboard.writeText(url) } catch {
      const el = document.querySelector<HTMLInputElement>('[data-family-url]'); el?.select(); document.execCommand('copy')
    }
    setCopied(true)
  }
  const doRenew = async () => {
    setBusy(true); const r = await familyLink(f.id, true); setBusy(false)
    if ('code' in r) { setCode(r.code); setCopied(false) } else setErr(r.error)
  }
  const canSend = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  return (
    <Sheet open={open} onClose={onClose} title={t('Chia sẻ Family')} subtitle={famLabel(f.name)}>
      {err ? <p className="text-sm text-red-700">{err}</p> : !code ? (
        <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 size={16} className="animate-spin" />{t('Đang tạo link…')}</p>
      ) : (
        <div>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{t('Link Family')}</span>
            <TextInput data-family-url readOnly value={url} onFocus={e => e.currentTarget.select()} />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" className="flex-1 sm:flex-none" onClick={() => void copy()}>
              {copied ? <Check size={16} /> : <ClipboardCopy size={16} />}{copied ? t('Đã chép') : t('Chép link')}
            </Button>
            {canSend && <Button className="flex-1 sm:flex-none" onClick={() => void navigator.share({ title: famLabel(f.name), url }).catch(() => {})}><Send size={16} />{t('Gửi…')}</Button>}
          </div>
          <p className="mt-4 text-[13px] leading-snug text-slate-600">
            {f.open ? t('Family đang MỞ: ai có link xem được đơn hàng (chỉ xem). Muốn vào làm cùng thì bấm Xin vào, bạn duyệt.')
              : t('Family đang ĐÓNG: người mở link chỉ thấy tên Family và nút Xin vào, bạn duyệt.')}
          </p>
          <Button variant="ghost" className="-ml-2 mt-2 text-red-700" disabled={busy} onClick={() => setRenew(true)}><RefreshCw size={16} />{t('Đổi link')}</Button>
        </div>
      )}
      <Confirm open={renew} onClose={() => setRenew(false)} okText={t('Đổi link')} title={t('Đổi link Family?')}
        body={t('Link cũ thôi dùng được ngay. Người đã vào Family không bị ảnh hưởng.')} onOk={() => void doRenew()} />
    </Sheet>
  )
}

/** Family tôi đã xin vào, đang chờ duyệt — rút yêu cầu được. */
function AskedCard({ id, name }: { id: string; name: string }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null)
  return (
    <ListCard>
      <section className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h2 className={H2}>{famLabel(name)}</h2>
          <p className={DESC}>{t('Đã gửi yêu cầu xin vào — chờ chủ Family duyệt.')}</p>
          {err && <p className="mt-1 text-[13px] text-red-700">{err}</p>}
        </div>
        <Button disabled={busy} onClick={async () => { setBusy(true); setErr(await declineInvite(id)); setBusy(false) }}>{t('Rút yêu cầu')}</Button>
      </section>
    </ListCard>
  )
}

/** Admin: giá mỗi người / tháng + mã giảm giá (mã "công khai" hiện ở màn Tạo Family / Phí tháng để người dùng tự nhập). */
function AdminPricing() {
  const price = useFamily(s => s.price), codes = useFamily(s => s.codes)
  const [p, setP] = useState<number | null>(price)
  const [code, setCode] = useState(''), [pct, setPct] = useState<number | null>(100), [featured, setFeatured] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => setP(price), [price])
  return (
    <ListCard>
      <section className="px-4 py-4">
        <div className="flex items-center gap-2"><h2 className={H2}>{t('Giá & mã giảm giá')}</h2><Badge tone="blue">Admin</Badge></div>
        <form className="mt-3 flex items-end gap-2" onSubmit={async e => { e.preventDefault(); setErr(await adminSetPrice(p ?? 0)) }}>
          <Field label={t('Giá mỗi người / tháng')} className="min-w-0 flex-1"><NumInput value={p} onChange={setP} suffix={t('đ')} /></Field>
          <Button type="submit" disabled={p === price}>{t('Lưu')}</Button>
        </form>
        <ul className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
          {codes.map(c => (
            <li key={c.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="min-w-0 flex-1 text-sm"><b className="tracking-wide">{c.code}</b> <span className="num text-slate-600">−{c.percent}%</span></span>
              <label className="tap flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={c.featured} onChange={async e => setErr(await adminSaveCode({ ...c, featured: e.target.checked }))} />{t('Công khai')}</label>
              <label className="tap flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={c.active} onChange={async e => setErr(await adminSaveCode({ ...c, active: e.target.checked }))} />{t('Đang dùng')}</label>
              <IconButton label={t('Xoá mã {code}', { code: c.code })} onClick={async () => setErr(await adminDeleteCode(c.code))} className="text-slate-500"><Trash2 size={16} /></IconButton>
            </li>
          ))}
        </ul>
        <form className="mt-3 grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_120px_auto_auto]"
          onSubmit={async e => {
            e.preventDefault()
            if (!/^[A-Z0-9_-]{3,32}$/.test(code.trim()) || !pct || pct < 1 || pct > 100) { setErr(t('Mã 3–32 ký tự (chữ, số), giảm 1–100%.')); return }
            const er = await adminSaveCode({ code, percent: Math.round(pct), active: true, featured })
            setErr(er); if (!er) setCode('')
          }}>
          <Field label={t('Mã mới')}><TextInput value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={32} autoCapitalize="characters" /></Field>
          <Field label={t('Giảm')}><NumInput value={pct} onChange={setPct} suffix="%" /></Field>
          <label className="tap flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)} />{t('Công khai')}</label>
          <Button type="submit" variant="primary">{t('Thêm mã')}</Button>
        </form>
        {err && <p className="mt-2 text-[13px] text-red-700">{err}</p>}
        <p className="mt-2 text-[12px] text-slate-600">{t('Phí đang chỉ tính để hiện — chưa có thanh toán online. Family còn phí phải trả thì chưa thêm người được.')}</p>
      </section>
    </ListCard>
  )
}

/** Vừa đăng nhập mà có lời mời ⇒ hỏi luôn (Để sau ⇒ không hỏi lại trong phiên này; lời mời vẫn ở tấm Family). */
export function InvitePrompt() {
  const invites = useFamily(s => s.invites)
  const [later, setLater] = useState<string[]>(() => { try { return JSON.parse(sessionStorage.getItem('malcargo-invite-later') ?? '[]') } catch { return [] } })
  const inv = invites.find(i => !later.includes(i.familyId))
  const skip = () => {
    if (!inv) return
    const l = [...later, inv.familyId]; setLater(l)
    try { sessionStorage.setItem('malcargo-invite-later', JSON.stringify(l)) } catch { /* bỏ qua */ }
  }
  return (
    <Confirm open={!!inv} danger={false} okText={t('Tham gia')} cancelText={t('Để sau')}
      title={t('Lời mời vào {name}', { name: famLabel(inv?.name ?? '') })}
      body={t('{owner} mời bạn dùng chung mã hàng, xe, đơn và chuyến.', { owner: inv?.owner ?? '' })}
      onOk={() => { if (inv) void acceptInvite(inv.familyId) }} onClose={skip} />
  )
}
