-- MalCargo — Supabase RIÊNG (không dùng DB của SUPPLYC). Chạy trong SQL Editor của project; chạy lại nhiều lần cũng không sao.
-- Đăng nhập: Authentication → Providers → Google (Client ID / Secret từ Google Cloud Console).

-- ── Admin: ai có email trong bảng này được sửa mẫu chung trên giao diện ──
create table if not exists public.admins (email text primary key);
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

-- ── Admin đầu tiên (email dùng để ĐĂNG NHẬP MalCargo bằng Google) ──
insert into public.admins (email) values ('lam.tranhoang@mal.com.vn') on conflict do nothing;

-- ── Mẫu chung ban đầu (giống bản đóng gói trong src/data/catalog.ts) ──
insert into public.catalog (id, kind, sort, data) values
  ('adm-v-1t5', 'vehicle', 0, '{"name":"Xe tải 1,5 tấn","plate":"","kind":"loose","l":3100,"w":1600,"h":1700,"payloadKg":1500}'),
  ('adm-v-2t5', 'vehicle', 1, '{"name":"Xe tải 2,5 tấn","plate":"","kind":"loose","l":3500,"w":1750,"h":1850,"payloadKg":2500}'),
  ('adm-v-3t5', 'vehicle', 2, '{"name":"Xe tải 3,5 tấn","plate":"","kind":"loose","l":4300,"w":1900,"h":1900,"payloadKg":3500}'),
  ('adm-v-5t', 'vehicle', 3, '{"name":"Xe tải 5 tấn","plate":"","kind":"loose","l":5700,"w":2000,"h":2000,"payloadKg":5000}'),
  ('adm-v-8t', 'vehicle', 4, '{"name":"Xe tải 8 tấn","plate":"","kind":"loose","l":7400,"w":2350,"h":2150,"payloadKg":8000}'),
  ('adm-v-15t', 'vehicle', 5, '{"name":"Xe tải 15 tấn","plate":"","kind":"loose","l":9200,"w":2350,"h":2400,"payloadKg":15000}'),
  ('adm-v-p8t', 'vehicle', 6, '{"name":"Xe pallet 8 tấn","plate":"","kind":"pallet","l":7400,"w":2350,"h":2300,"payloadKg":8000}'),
  ('adm-v-p15t', 'vehicle', 7, '{"name":"Xe pallet 15 tấn","plate":"","kind":"pallet","l":9600,"w":2500,"h":2600,"payloadKg":15000}'),
  ('adm-i-lon', 'item', 0, '{"code":"MAU-LON24","name":"Nước giải khát 24 lon 330ml","l":400,"w":270,"h":125,"kg":8.5,"perPallet":90,"maxLayers":null,"light":false}'),
  ('adm-i-chai', 'item', 1, '{"code":"MAU-CHAI24","name":"Nước suối 24 chai 500ml","l":400,"w":270,"h":215,"kg":12.5,"perPallet":63,"maxLayers":null,"light":false}'),
  ('adm-i-dau', 'item', 2, '{"code":"MAU-DAU12","name":"Dầu ăn 12 chai 1L","l":330,"w":250,"h":300,"kg":11.5,"perPallet":60,"maxLayers":6,"light":false}'),
  ('adm-i-mi', 'item', 3, '{"code":"MAU-MI30","name":"Mì gói thùng 30 gói","l":440,"w":320,"h":190,"kg":2.6,"perPallet":48,"maxLayers":null,"light":false}'),
  ('adm-i-giay', 'item', 4, '{"code":"MAU-A4","name":"Giấy A4 thùng 5 ram","l":300,"w":220,"h":225,"kg":12.5,"perPallet":96,"maxLayers":8,"light":false}'),
  ('adm-i-banh', 'item', 5, '{"code":"MAU-BANH","name":"Bánh kẹo hộp giấy","l":300,"w":200,"h":150,"kg":1.5,"perPallet":100,"maxLayers":6,"light":true}')
on conflict (id) do nothing;
