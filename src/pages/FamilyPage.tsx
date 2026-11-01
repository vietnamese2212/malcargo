// FAMILY (nhóm / công ty) — chủ dự án 01/11: "user đăng nhập thì tạo được Family, trả phí theo tháng để thêm người và dùng chung
// dữ liệu; bao nhiêu người thì bấy nhiêu tiền — giá 0 đ, đặt sau" + "có mã giảm giá, mã 100% hiện lên để user nhập" + "mã
// THUNGHIEM chạy ở màn Tạo Family". Chủ giữ danh mục (mã hàng, xe, cỡ pallet), thành viên làm đơn + chuyến. Mỗi người có bộ
// "Của tôi" + bộ của từng Family đang tham gia, đổi qua lại ở đây hoặc menu ≡.
import { useEffect, useState } from 'react'
import { Mail, Trash2, UsersRound, X } from 'lucide-react'
import {
  acceptInvite, adminDeleteCode, adminSaveCode, adminSetPrice, applyCode, createFamily, declineInvite, deleteFamily, inviteMember,
  leaveFamily, removeMember, renameFamily, signInGoogle, switchSpace, useAuth, useFamily, type Family, type Fee,
} from '../data/cloud'
import { useSpace } from '../data/store'
import { Badge, Button, Confirm, Field, IconButton, NumInput, Switch, TextInput, cx, fmtInt } from '../ui/kit'
import { GoogleG, ListCard, Page, PageHeader } from '../ui/Shell'
import { numLocale, t } from '../i18n'

const vnd = (n: number) => t('{n} đ', { n: fmtInt(n) })
const H2 = 'break-words text-[15px] font-semibold leading-snug text-slate-900'
const DESC = 'mt-0.5 break-words text-[13px] leading-snug text-slate-600'

export default function FamilyPage() {
  const { status, isAdmin } = useAuth()
  const { loaded, families, invites } = useFamily()
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
            {!!families.length && <SpacePicker />}
            {families.map(f => <FamilyCard key={f.id} f={f} />)}
            {loaded && !owns && <CreateFamily />}
          </>
        )}
        {signedIn && isAdmin && <AdminPricing />}
      </Page>
    </>
  )
}

/** Chọn bộ dữ liệu đang mở: "Của tôi" hoặc một Family. */
function SpacePicker() {
  const families = useFamily(s => s.families), members = useFamily(s => s.members)
  const cur = useSpace(s => s.id)
  const opts = [{ id: 'me', label: t('Của tôi'), sub: t('Chỉ mình bạn') },
    ...families.map(f => ({ id: f.id, label: f.name, sub: t('Family · {n} người', { n: (members[f.id] ?? []).filter(m => m.status === 'active').length }) }))]
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
          <h2 className={H2}>{t('Lời mời vào {name}', { name })}</h2>
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

function FamilyCard({ f }: { f: Family }) {
  const members = useFamily(s => s.members[f.id]) ?? []
  const fee = useFamily(s => s.fees[f.id])
  const open = useSpace(s => s.id === f.id)
  const owner = f.role === 'owner'
  const [email, setEmail] = useState(''), [code, setCode] = useState(f.discountCode ?? '')
  const [renaming, setRenaming] = useState(false), [name, setName] = useState(f.name)
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null)
  const [ask, setAsk] = useState<'leave' | 'delete' | { remove: string } | null>(null)
  useEffect(() => setCode(f.discountCode ?? ''), [f.discountCode])
  const run = async (p: Promise<string | null>, done?: () => void) => {
    setBusy(true); const e = await p; setBusy(false); setErr(e)
    if (!e) done?.()
  }
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
              <h2 className={cx(H2, 'text-[17px]')}>{f.name}</h2>
              <Badge tone="blue">{owner ? t('Chủ') : t('Thành viên')}</Badge>
              {open && <Badge tone="green">{t('Đang mở')}</Badge>}
            </div>
          )}
          <p className={DESC}>{owner ? t('Bạn giữ mã hàng, xe, cỡ pallet; mọi người cùng làm đơn và chuyến.') : t('Mã hàng, xe, cỡ pallet do chủ Family quản lý; bạn làm đơn và chuyến.')}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {owner && !renaming && <Button variant="ghost" className="text-brand-700" onClick={() => { setName(f.name); setRenaming(true) }}>{t('Đổi tên')}</Button>}
          {!open && <Button variant="primary" onClick={() => void switchSpace(f.id)}>{t('Mở dữ liệu Family')}</Button>}
        </div>
      </section>

      <section className="border-t border-slate-200 px-4 py-4">
        <h3 className="text-sm font-semibold text-slate-900">{t('Người trong Family')} <span className="font-normal text-slate-600">· {members.length}</span></h3>
        <ul className="mt-1 divide-y divide-slate-100">
          {members.map(m => (
            <li key={m.email} className="flex items-center gap-3 py-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">{(m.name || m.email).slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-medium text-slate-900">{m.name || m.email}</span>
                {m.name && <span className="block break-all text-[12px] text-slate-600">{m.email}</span>}
              </span>
              {m.role === 'owner' ? <Badge tone="blue">{t('Chủ')}</Badge> : m.status === 'invited' ? <Badge tone="amber">{t('Đang chờ')}</Badge> : null}
              {owner && m.role !== 'owner' && (
                <IconButton label={t('Bỏ {email} khỏi Family', { email: m.email })} onClick={() => setAsk({ remove: m.email })} className="text-slate-500"><X size={17} /></IconButton>
              )}
            </li>
          ))}
        </ul>
        {owner && (
          <form className="mt-2 flex gap-2" onSubmit={e => { e.preventDefault(); if (email.trim()) void run(inviteMember(f.id, email), () => setEmail('')) }}>
            <TextInput type="email" inputMode="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)}
              placeholder={t('Email Google của người cần mời')} aria-label={t('Email người cần mời')} className="min-w-0 flex-1" />
            <Button type="submit" variant="primary" disabled={busy || !email.trim()}><Mail size={16} />{t('Mời')}</Button>
          </form>
        )}
        {owner && <p className="mt-1.5 text-[12px] text-slate-600">{t('Người được mời đăng nhập bằng email này là thấy lời mời.')}</p>}
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
      <section className="border-t border-slate-200 px-4 py-3">
        {owner
          ? <Button variant="ghost" className="-ml-2 text-red-700" onClick={() => setAsk('delete')}><Trash2 size={16} />{t('Xoá Family')}</Button>
          : <Button variant="ghost" className="-ml-2 text-red-700" onClick={() => setAsk('leave')}>{t('Rời Family')}</Button>}
      </section>

      <Confirm open={ask === 'delete'} onClose={() => setAsk(null)} okText={t('Xoá Family')} title={t('Xoá {name}?', { name: f.name })}
        body={t('Mọi người mất quyền vào, đơn và chuyến của Family bị xoá. Tải file sao lưu trước nếu cần.')}
        onOk={() => void run(deleteFamily(f.id))} />
      <Confirm open={ask === 'leave'} onClose={() => setAsk(null)} okText={t('Rời Family')} title={t('Rời {name}?', { name: f.name })}
        body={t('Bạn không còn thấy dữ liệu của Family; dữ liệu "Của tôi" giữ nguyên.')} onOk={() => void run(leaveFamily(f.id))} />
      <Confirm open={!!ask && typeof ask === 'object'} onClose={() => setAsk(null)} okText={t('Bỏ khỏi Family')}
        title={t('Bỏ {email} khỏi Family?', { email: ask && typeof ask === 'object' ? ask.remove : '' })}
        onOk={() => { if (ask && typeof ask === 'object') void run(removeMember(f.id, ask.remove)) }} />
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
      title={t('Lời mời vào {name}', { name: inv?.name ?? '' })}
      body={t('{owner} mời bạn dùng chung mã hàng, xe, đơn và chuyến.', { owner: inv?.owner ?? '' })}
      onOk={() => { if (inv) void acceptInvite(inv.familyId) }} onClose={skip} />
  )
}
