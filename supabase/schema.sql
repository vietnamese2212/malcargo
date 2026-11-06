-- MalCargo — Supabase RIÊNG (không dùng DB của SUPPLYC). Chạy trong SQL Editor của project; chạy lại nhiều lần cũng không sao.
-- Đăng nhập: Authentication → Providers → Google (Client ID / Secret từ Google Cloud Console).

-- ── Admin: ai có email trong bảng này được sửa mẫu chung trên giao diện ──
create table if not exists public.admins (email text primary key);
-- super = toàn quyền (giá, mã giảm giá); admin thường: mẫu chung + xem màn Quản trị
alter table public.admins add column if not exists role text not null default 'admin' check (role in ('super', 'admin'));
alter table public.admins enable row level security;
-- mỗi người chỉ thấy dòng của chính mình (đủ để app biết "tôi có phải admin không")
drop policy if exists "admins: self read" on public.admins;
create policy "admins: self read" on public.admins for select using (email = auth.jwt() ->> 'email');

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where email = auth.jwt() ->> 'email')
$$;

-- ── Mẫu chung: xe + mã hàng. Ai cũng đọc (kể cả chưa đăng nhập), chỉ admin ghi ──
create table if not exists public.catalog (
  id text primary key,
  kind text not null check (kind in ('item', 'vehicle')),
  data jsonb not null,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.catalog enable row level security;
drop policy if exists "catalog: read all" on public.catalog;
create policy "catalog: read all" on public.catalog for select using (true);
drop policy if exists "catalog: admin insert" on public.catalog;
create policy "catalog: admin insert" on public.catalog for insert with check (public.is_admin());
drop policy if exists "catalog: admin update" on public.catalog;
create policy "catalog: admin update" on public.catalog for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "catalog: admin delete" on public.catalog;
create policy "catalog: admin delete" on public.catalog for delete using (public.is_admin());

-- ── Dữ liệu riêng: một bản JSON / người (mã hàng, xe, đơn, chuyến, pallet của tôi) ──
create table if not exists public.user_data (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.user_data enable row level security;
drop policy if exists "user_data: own" on public.user_data;
create policy "user_data: own" on public.user_data for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Quyền cho app (project mới có thể không tự cấp); RLS ở trên vẫn quyết định ai đọc / ghi dòng nào ──
grant usage on schema public to anon, authenticated;
grant select on public.catalog to anon, authenticated;
grant insert, update, delete on public.catalog to authenticated;
grant select on public.admins to authenticated;
grant select, insert, update, delete on public.user_data to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where email = auth.jwt() ->> 'email' and role = 'super')
$$;
grant execute on function public.is_super_admin() to anon, authenticated;

-- ── Lưu kiểu SO PHIÊN BẢN: mỗi lần ghi tăng `version`; app ghi kèm số phiên bản đã đọc — người / máy khác vừa ghi trước
--    thì không khớp ⇒ app kéo bản mới về, gộp từng bản ghi rồi ghi lại (không ai đè mất thay đổi của ai) ──
create or replace function public.bump_version() returns trigger language plpgsql as $$
begin new.version := old.version + 1; new.updated_at := now(); return new; end $$;
alter table public.user_data add column if not exists version bigint not null default 1;
drop trigger if exists user_data_version on public.user_data;
create trigger user_data_version before update on public.user_data for each row execute function public.bump_version();

-- ghi dữ liệu riêng: p_version null = chưa có bản trên máy chủ. Trả số phiên bản mới; null = không khớp (kéo về gộp)
create or replace function public.user_save(p_data jsonb, p_version bigint) returns bigint
language plpgsql security invoker set search_path = public as $$
declare v bigint;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_version is null then
    insert into user_data (user_id, data) values (auth.uid(), p_data) on conflict (user_id) do nothing returning version into v;
  else
    update user_data set data = p_data where user_id = auth.uid() and version = p_version returning version into v;
  end if;
  return v;
end $$;

-- ── FAMILY (nhóm / công ty): chủ tạo, mời thành viên bằng email Google; cả nhóm dùng chung MỘT bộ dữ liệu. Chủ giữ danh
--    mục (mã hàng, xe, cỡ pallet), thành viên làm đơn + chuyến. Phí theo tháng = số người (cả chủ) × giá × (100% − mã giảm) ──
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users on delete cascade,   -- mỗi người làm chủ tối đa 1 Family
  name text not null check (char_length(name) between 1 and 80),
  discount_code text,
  paid_until date,                                                         -- đã trả phí tới ngày (admin ghi khi thu tiền)
  created_at timestamptz not null default now()
);
create table if not exists public.family_members (
  family_id uuid not null references public.families on delete cascade,
  email text not null check (email = lower(email) and email like '%_@_%._%'),
  user_id uuid references auth.users on delete cascade,
  name text,
  role text not null default 'member' check (role in ('owner', 'member')),
  status text not null default 'invited' check (status in ('invited', 'active')),
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (family_id, email)
);
create index if not exists family_members_user on public.family_members (user_id);
create index if not exists family_members_email on public.family_members (email);
create table if not exists public.family_data (
  family_id uuid primary key references public.families on delete cascade,
  data jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);
drop trigger if exists family_data_version on public.family_data;
create trigger family_data_version before update on public.family_data for each row execute function public.bump_version();

-- giá + mã giảm giá (admin đặt trên giao diện). Mã `featured` hiện công khai trên màn Family để người dùng tự nhập
create table if not exists public.app_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
insert into public.app_settings (key, value) values ('family_price_vnd', '0') on conflict do nothing;
create table if not exists public.discount_codes (
  code text primary key check (code = upper(code) and char_length(code) between 3 and 32),
  percent int not null check (percent between 1 and 100),
  active boolean not null default true,
  featured boolean not null default false,
  created_at timestamptz not null default now()
);
-- mã dùng thử công khai (chủ dự án 01/11: "mã discount rộng rãi THUNGHIEM tạm thời chạy trên giao diện Tạo Family")
insert into public.discount_codes (code, percent, active, featured) values ('THUNGHIEM', 100, true, true) on conflict do nothing;

create or replace function public.my_email() returns text language sql stable as $$ select lower(auth.jwt() ->> 'email') $$;
-- vai trò của tôi trong Family (null = không phải thành viên đã tham gia)
create or replace function public.family_role(p_family uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from family_members where family_id = p_family and user_id = auth.uid() and status = 'active'
$$;
create or replace function public.family_invited(p_family uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_members where family_id = p_family and email = public.my_email() and status = 'invited')
$$;

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_data enable row level security;
alter table public.app_settings enable row level security;
alter table public.discount_codes enable row level security;
-- đọc: thành viên thấy Family của mình; người được mời thấy tên Family + chủ (để quyết tham gia). Ghi: chỉ qua các hàm bên dưới
drop policy if exists "families: member read" on public.families;
create policy "families: member read" on public.families for select using (public.family_role(id) is not null or public.family_invited(id));
drop policy if exists "family_members: read" on public.family_members;
create policy "family_members: read" on public.family_members for select
  using (public.family_role(family_id) is not null or email = public.my_email() or (role = 'owner' and public.family_invited(family_id)));
drop policy if exists "family_data: member read" on public.family_data;
create policy "family_data: member read" on public.family_data for select using (public.family_role(family_id) is not null);
drop policy if exists "app_settings: read all" on public.app_settings;
create policy "app_settings: read all" on public.app_settings for select using (true);
drop policy if exists "app_settings: admin write" on public.app_settings;
create policy "app_settings: admin write" on public.app_settings for all using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists "discount_codes: read featured" on public.discount_codes;
create policy "discount_codes: read featured" on public.discount_codes for select using ((active and featured) or public.is_admin());
drop policy if exists "discount_codes: admin write" on public.discount_codes;
create policy "discount_codes: admin write" on public.discount_codes for all using (public.is_super_admin()) with check (public.is_super_admin());

-- Khách vãng lai: thiết bị mở app mà chưa từng đăng nhập. Chỉ giữ mã ngẫu nhiên + ngày, không tên, không IP, không dữ liệu nhập.
-- Không policy: chỉ hàm guest_ping + admin_stats chạm vào. Giữ 90 ngày; tối đa 5.000 thiết bị / ngày (khoá công khai ai cũng gọi được).
create table if not exists public.guest_visits (
  device text not null,
  day date not null default current_date,
  primary key (device, day)
);
create index if not exists guest_visits_day on public.guest_visits (day);
alter table public.guest_visits enable row level security;
create or replace function public.guest_ping(p_device text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_device is null or p_device !~ '^[0-9a-f-]{36}$' then return; end if;
  if auth.uid() is not null then delete from guest_visits where device = p_device; return; end if;   -- thiết bị đã đăng nhập: không phải khách
  if (select count(*) from guest_visits where day = current_date) >= 5000 then return; end if;
  insert into guest_visits (device) values (p_device) on conflict do nothing;
  delete from guest_visits where day < current_date - 90;
end $$;
revoke all on function public.guest_ping(text) from public;
grant execute on function public.guest_ping(text) to anon, authenticated;

-- Màn Quản trị: số tổng, chỉ admin gọi được. "Đang dùng" = đăng nhập hoặc lưu dữ liệu trong 30 ngày; "trả phí" = Family còn hạn paid_until.
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'new30', (select count(*) from auth.users where created_at >= now() - interval '30 days'),
    'active30', (select count(*) from auth.users u left join public.user_data d on d.user_id = u.id
      where greatest(u.last_sign_in_at, d.updated_at) >= now() - interval '30 days'),
    'guests30', (select count(distinct device) from public.guest_visits where day >= current_date - 30),
    'guests_today', (select count(*) from public.guest_visits where day = current_date),
    'families', (select count(*) from public.families),
    'family_people', (select count(*) from public.family_members where status = 'active'),
    'paying_families', (select count(*) from public.families where paid_until >= current_date),
    'paying_people', (select count(*) from public.family_members m join public.families f on f.id = m.family_id
      where m.status = 'active' and f.paid_until >= current_date));
end $$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

-- Danh sách người dùng + Family: CHỈ super admin. Chỉ trả SỐ đơn / chuyến / mã / xe, không bao giờ trả nội dung (chủ dự án 05/11: "chỉ đếm").
create or replace function public.admin_count(p jsonb) returns int
language sql immutable set search_path = public as $$
  select count(*)::int from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) e
  where coalesce(e ->> 'id', '') not like 'sample-%'   -- đơn / chuyến mẫu không tính
$$;
revoke all on function public.admin_count(jsonb) from public, anon, authenticated;
create or replace function public.admin_people() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'not_super'; end if;
  return jsonb_build_object(
    'users', coalesce((select jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email,
        'name', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''),
        'created_at', u.created_at, 'last_used', greatest(u.last_sign_in_at, d.updated_at),
        'orders', public.admin_count(d.data -> 'orders'), 'trips', public.admin_count(d.data -> 'trips'),
        'items', public.admin_count(d.data -> 'items'), 'vehicles', public.admin_count(d.data -> 'vehicles'),
        'families', coalesce((select jsonb_agg(jsonb_build_object('name', f.name, 'role', m.role) order by f.name)
          from public.family_members m join public.families f on f.id = m.family_id
          where m.user_id = u.id and m.status = 'active'), '[]'::jsonb)
      ) order by greatest(u.last_sign_in_at, d.updated_at) desc nulls last, u.created_at desc)
      from auth.users u left join public.user_data d on d.user_id = u.id), '[]'::jsonb),
    'families', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'created_at', f.created_at, 'paid_until', f.paid_until,
        'orders', public.admin_count(d.data -> 'orders'), 'trips', public.admin_count(d.data -> 'trips'),
        'members', coalesce((select jsonb_agg(jsonb_build_object('email', m.email, 'name', m.name, 'role', m.role, 'status', m.status)
            order by m.role desc, m.status, m.email)   -- chủ trước, người đã vào trước người đang chờ
          from public.family_members m where m.family_id = f.id), '[]'::jsonb)
      ) order by f.created_at desc)
      from public.families f left join public.family_data d on d.family_id = f.id), '[]'::jsonb));
end $$;
revoke all on function public.admin_people() from public, anon;
grant execute on function public.admin_people() to authenticated;

-- giá đang áp cho một Family: { price, people, code, percent, paid_until }
create or replace function public.family_fee(p_family uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'price', coalesce((select (value #>> '{}')::numeric from app_settings where key = 'family_price_vnd'), 0),
    'people', (select count(*) from family_members where family_id = f.id),
    'code', f.discount_code,
    'percent', coalesce((select percent from discount_codes d where d.code = f.discount_code and d.active), 0),
    'paid_until', f.paid_until)
  from families f where f.id = p_family and (public.family_role(p_family) is not null or public.family_invited(p_family))
$$;

-- tạo Family (+ mã giảm giá nhập ngay ở màn tạo — trống / không có thì bỏ qua)
drop function if exists public.family_create(text, jsonb);
create or replace function public.family_create(p_name text, p_data jsonb, p_code text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare fid uuid; me text := public.my_email(); c text := nullif(upper(trim(p_code)), '');
begin
  if auth.uid() is null or me is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from families where owner_id = auth.uid()) then raise exception 'already_owner'; end if;
  if c is not null and not exists (select 1 from discount_codes where code = c and active) then raise exception 'bad_code'; end if;
  insert into families (owner_id, name, discount_code) values (auth.uid(), trim(p_name), c) returning id into fid;
  insert into family_members (family_id, email, user_id, name, role, status, joined_at)
    values (fid, me, auth.uid(), auth.jwt() -> 'user_metadata' ->> 'full_name', 'owner', 'active', now());
  insert into family_data (family_id, data) values (fid, p_data);
  return fid;
end $$;

create or replace function public.family_rename(p_family uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.family_role(p_family) is distinct from 'owner' then raise exception 'not_owner'; end if;
  update families set name = trim(p_name) where id = p_family;
end $$;

-- thêm người: còn phải trả phí (giá sau giảm > 0) mà chưa trả ⇒ chưa thêm được
create or replace function public.family_invite(p_family uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare fee jsonb := public.family_fee(p_family); e text := lower(trim(p_email));
begin
  if public.family_role(p_family) is distinct from 'owner' then raise exception 'not_owner'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email'; end if;
  if exists (select 1 from family_members where family_id = p_family and email = e) then raise exception 'already_member'; end if;
  if (fee ->> 'price')::numeric * (100 - (fee ->> 'percent')::int) > 0
     and coalesce((fee ->> 'paid_until')::date < current_date, true) then raise exception 'payment_required'; end if;
  insert into family_members (family_id, email) values (p_family, e);
end $$;

create or replace function public.family_remove(p_family uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.family_role(p_family) is distinct from 'owner' then raise exception 'not_owner'; end if;
  delete from family_members where family_id = p_family and email = lower(trim(p_email)) and role = 'member';
end $$;

create or replace function public.family_accept(p_family uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update family_members set status = 'active', user_id = auth.uid(), joined_at = now(), name = auth.jwt() -> 'user_metadata' ->> 'full_name'
    where family_id = p_family and email = public.my_email() and status = 'invited';
  if not found then raise exception 'no_invite'; end if;
end $$;

create or replace function public.family_decline(p_family uuid) returns void
language sql security definer set search_path = public as $$
  delete from family_members where family_id = p_family and email = public.my_email() and status = 'invited'
$$;

create or replace function public.family_leave(p_family uuid) returns void
language sql security definer set search_path = public as $$
  delete from family_members where family_id = p_family and user_id = auth.uid() and role = 'member'
$$;

create or replace function public.family_delete(p_family uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.family_role(p_family) is distinct from 'owner' then raise exception 'not_owner'; end if;
  delete from families where id = p_family;
end $$;

-- mã giảm giá: trống = bỏ mã; mã không có / đã tắt ⇒ lỗi. Trả % giảm
create or replace function public.family_apply_code(p_family uuid, p_code text) returns int
language plpgsql security definer set search_path = public as $$
declare c text := nullif(upper(trim(p_code)), ''); pct int;
begin
  if public.family_role(p_family) is distinct from 'owner' then raise exception 'not_owner'; end if;
  if c is not null then
    select percent into pct from discount_codes where code = c and active;
    if pct is null then raise exception 'bad_code'; end if;
  end if;
  update families set discount_code = c where id = p_family;
  return coalesce(pct, 0);
end $$;

-- ghi dữ liệu Family (so phiên bản như user_save). Chủ ghi cả bộ; thành viên chỉ ghi được đơn + chuyến (+ dấu xoá của
-- chúng) — mã hàng, xe, cỡ pallet giữ nguyên bản của chủ, dù app gửi gì lên
create or replace function public.family_save(p_family uuid, p_data jsonb, p_version bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare r text := public.family_role(p_family); v bigint; cur jsonb; dead jsonb;
begin
  if r is null then raise exception 'not_member'; end if;
  if r = 'owner' then
    update family_data set data = p_data where family_id = p_family and version = p_version returning version into v;
    return v;
  end if;
  select data into cur from family_data where family_id = p_family and version = p_version for update;
  if not found then return null; end if;
  select coalesce(jsonb_object_agg(k, at), '{}') into dead from jsonb_each(coalesce(p_data -> 'deleted', '{}')) as e(k, at)
    where k not in (select x ->> 'id' from jsonb_array_elements(coalesce(cur -> 'items', '[]') || coalesce(cur -> 'vehicles', '[]')) x where x ->> 'id' is not null);
  update family_data set data = cur || jsonb_build_object('orders', coalesce(p_data -> 'orders', '[]'), 'trips', coalesce(p_data -> 'trips', '[]'), 'deleted', dead)
    where family_id = p_family returning version into v;
  return v;
end $$;

grant select on public.families, public.family_members, public.family_data to authenticated;
grant select on public.app_settings, public.discount_codes to anon, authenticated;
grant insert, update, delete on public.app_settings, public.discount_codes to authenticated;
grant execute on function public.user_save(jsonb, bigint), public.family_fee(uuid), public.family_create(text, jsonb, text),
  public.family_rename(uuid, text), public.family_invite(uuid, text), public.family_remove(uuid, text), public.family_accept(uuid),
  public.family_decline(uuid), public.family_leave(uuid), public.family_delete(uuid), public.family_apply_code(uuid, text),
  public.family_save(uuid, jsonb, bigint), public.family_role(uuid), public.family_invited(uuid), public.my_email() to authenticated;

-- ── CHIA SẺ CHUYẾN: người đăng nhập đưa BẢN CHỤP chuyến (chuyến + đơn + mã hàng + xe) lên ⇒ mã link ngắn; ai có mã cũng
--    đọc được qua share_get (không cần đăng nhập) rồi lưu bản sao về máy mình. Không ai liệt kê / đọc thẳng bảng được.
create table if not exists public.shares (
  code text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists shares_owner_idx on public.shares (owner_id, created_at);
alter table public.shares enable row level security;   -- không policy nào: chỉ hai hàm dưới chạm vào bảng
revoke all on public.shares from anon, authenticated;

create or replace function public.share_create(p_data jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if jsonb_typeof(p_data) <> 'object' or p_data ->> 'app' <> 'malcargo' or p_data ->> 'kind' <> 'trip' then raise exception 'bad_data'; end if;
  if octet_length(p_data::text) > 1000000 then raise exception 'too_big'; end if;
  if (select count(*) from shares where owner_id = auth.uid() and created_at > now() - interval '1 day') >= 200 then raise exception 'too_many'; end if;
  loop
    -- 10 ký tự base64url từ uuid ngẫu nhiên (~56 bit) — không đoán / dò được
    c := translate(left(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), 10), '+/', '-_');
    begin
      insert into shares (code, owner_id, data) values (c, auth.uid(), p_data);
      return c;
    exception when unique_violation then null;   -- trùng mã (rất hiếm) ⇒ lấy mã khác
    end;
  end loop;
end $$;

create or replace function public.share_get(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select data from shares where code = p_code
$$;

revoke execute on function public.share_create(jsonb) from public, anon;
grant execute on function public.share_create(jsonb) to authenticated;
grant execute on function public.share_get(text) to anon, authenticated;

-- ── Admin đầu tiên (email dùng để ĐĂNG NHẬP MalCargo bằng Google) ──
insert into public.admins (email, role) values ('lam.tranhoang@mal.com.vn', 'super') on conflict (email) do update set role = 'super';

-- ── Mẫu chung ban đầu (giống bản đóng gói trong src/data/catalog.ts) ──
-- các bộ mã hàng mẫu đời trước (admin thay cả bộ 06/11/2026 bằng SP001–SP016)
delete from public.catalog where id in ('adm-i-lon', 'adm-i-chai', 'adm-i-dau', 'adm-i-mi', 'adm-i-giay', 'adm-i-banh',
  'adm-i-st180', 'adm-i-st110', 'adm-i-th170', 'adm-i-c85', 'adm-i-tui110', '961dcd8c-92c7-4f7a-b84f-c5223ec13433',
  '276012d0-01bb-4045-9366-0e1c90bb4905', 'f9428150-8e0d-4f6b-9de5-ec134ff530c8', 'f5b6706e-3abd-4a0c-bbdc-cf0ba56471b2');
insert into public.catalog (id, kind, sort, data) values
  ('adm-v-1t5', 'vehicle', 0, '{"name":"Xe tải 1,5 tấn","plate":"","kind":"loose","l":3100,"w":1600,"h":1700,"payloadKg":1500}'),
  ('adm-v-2t5', 'vehicle', 1, '{"name":"Xe tải 2,5 tấn","plate":"","kind":"loose","l":3500,"w":1750,"h":1850,"payloadKg":2500}'),
  ('adm-v-3t5', 'vehicle', 2, '{"name":"Xe tải 3,5 tấn","plate":"","kind":"loose","l":4300,"w":1900,"h":1900,"payloadKg":3500}'),
  ('adm-v-5t', 'vehicle', 3, '{"name":"Xe tải 5 tấn","plate":"","kind":"loose","l":5700,"w":2000,"h":2000,"payloadKg":5000}'),
  ('adm-v-8t', 'vehicle', 4, '{"name":"Xe tải 8 tấn","plate":"","kind":"loose","l":7400,"w":2350,"h":2150,"payloadKg":8000}'),
  ('adm-v-15t', 'vehicle', 5, '{"name":"Xe tải 15 tấn","plate":"","kind":"loose","l":9200,"w":2350,"h":2400,"payloadKg":15000}'),
  ('adm-v-p8t', 'vehicle', 6, '{"name":"Xe pallet 8 tấn","plate":"","kind":"pallet","l":7400,"w":2350,"h":2300,"payloadKg":8000}'),
  ('adm-v-p15t', 'vehicle', 7, '{"name":"Xe pallet 15 tấn","plate":"","kind":"pallet","l":9600,"w":2350,"h":2600,"payloadKg":15000}'),
  ('adm-v-c20', 'vehicle', 8, '{"name":"Container 20ft","plate":"","kind":"loose","l":5898,"w":2352,"h":2393,"payloadKg":28000,"container":true}'),
  ('adm-v-c40', 'vehicle', 9, '{"name":"Container 40ft","plate":"","kind":"loose","l":12032,"w":2352,"h":2393,"payloadKg":28500,"container":true}'),
  ('b4e80e14-5754-425b-b656-2fe05ccf5c50', 'item', 9, '{"code":"SP001","name":"TBA 110","l":425,"w":240,"h":105,"kg":6.2,"perPallet":150,"maxLayers":14,"looseLayers":28,"light":false}'),
  ('17047429-4e68-4236-8d2e-1b91b8eac4be', 'item', 10, '{"code":"SP002","name":"TBA 180","l":425,"w":260,"h":145,"kg":9.85,"perPallet":110,"maxLayers":10,"light":false}'),
  ('b4cd3e0b-50a5-4c50-b49a-b3f07847599b', 'item', 11, '{"code":"SP003","name":"TBA 100","l":430,"w":240,"h":105,"kg":5.7,"perPallet":150,"maxLayers":14,"light":false}'),
  ('681a1674-9181-4569-baaa-71f06618cf48', 'item', 12, '{"code":"SP004","name":"TBA 100x36","l":370,"w":220,"h":105,"kg":1,"perPallet":182,"maxLayers":14,"light":false}'),
  ('9f03e562-f28e-4ee7-b959-aa0b46e0e362', 'item', 13, '{"code":"SP005","name":"TBA 100 Thạch","l":425,"w":255,"h":110,"kg":1,"perPallet":150,"maxLayers":14,"light":false}'),
  ('bfeba6de-90ac-4375-ac88-f3ca0de4b2f2', 'item', 14, '{"code":"SP006","name":"TBA 170","l":430,"w":260,"h":135,"kg":9.5,"perPallet":110,"maxLayers":11,"light":false}'),
  ('d131667b-61d1-4f65-816e-87c1b1ffe5e2', 'item', 15, '{"code":"SP007","name":"TBA 170 Thạch","l":425,"w":285,"h":140,"kg":1,"perPallet":110,"maxLayers":14,"light":false}'),
  ('89e64f1f-548f-487d-aec8-74ce5c0d1580', 'item', 16, '{"code":"SP008","name":"ECOLEAN","l":315,"w":140,"h":135,"kg":3.08,"perPallet":224,"maxLayers":11,"light":true}'),
  ('7f577621-125d-45e7-81eb-36a985e8996c', 'item', 17, '{"code":"SP009","name":"TBA 180 SBN","l":280,"w":230,"h":135,"kg":1,"perPallet":209,"maxLayers":14,"light":false}'),
  ('632dd554-6edf-4366-b78e-689b304fa82a', 'item', 18, '{"code":"SP010","name":"HDPE","l":360,"w":285,"h":110,"kg":1,"perPallet":156,"maxLayers":14,"light":false}'),
  ('b20729b9-7bd2-436f-8f37-5e7e55d69e36', 'item', 19, '{"code":"SP011","name":"XÚC XÍCH MÌ + KẸO NỔ","l":350,"w":260,"h":235,"kg":1,"perPallet":78,"maxLayers":14,"light":false}'),
  ('190e3f30-1879-4e1c-89d2-697f5b2f49ff', 'item', 20, '{"code":"SP012","name":"XÚC XÍCH LY","l":360,"w":250,"h":265,"kg":3.4,"perPallet":65,"maxLayers":5,"light":true}'),
  ('bb30813f-367f-4ace-b819-ca1baf851788', 'item', 21, '{"code":"SP013","name":"THẠCH KẸO 300G","l":410,"w":230,"h":165,"kg":1,"perPallet":72,"maxLayers":14,"light":false}'),
  ('adb606ed-9cb7-4587-8462-0bca533c4d71', 'item', 22, '{"code":"SP014","name":"THẠCH RAU CÂU 30g","l":305,"w":215,"h":160,"kg":1,"perPallet":136,"maxLayers":14,"light":false}'),
  ('b9b51ccf-1faa-41a5-927d-ad6542539efa', 'item', 23, '{"code":"SP015","name":"PET 240 ( Matcha )","l":320,"w":215,"h":180,"kg":1,"perPallet":128,"maxLayers":14,"light":false}'),
  ('f547412b-aba9-4608-901a-c4d2390d2d49', 'item', 24, '{"code":"SP016","name":"PET 430 ( Manuka )","l":385,"w":255,"h":215,"kg":1,"perPallet":77,"maxLayers":14,"light":false}')
on conflict (id) do nothing;
