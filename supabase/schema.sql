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
-- bộ mã hàng mẫu đời đầu (đồ tiêu dùng chung) đã thay bằng cỡ thùng hàng sữa / đồ uống hộp
delete from public.catalog where id in ('adm-i-lon', 'adm-i-chai', 'adm-i-dau', 'adm-i-mi', 'adm-i-giay', 'adm-i-banh');
insert into public.catalog (id, kind, sort, data) values
  ('adm-v-1t5', 'vehicle', 0, '{"name":"Xe tải 1,5 tấn","plate":"","kind":"loose","l":3100,"w":1600,"h":1700,"payloadKg":1500}'),
  ('adm-v-2t5', 'vehicle', 1, '{"name":"Xe tải 2,5 tấn","plate":"","kind":"loose","l":3500,"w":1750,"h":1850,"payloadKg":2500}'),
  ('adm-v-3t5', 'vehicle', 2, '{"name":"Xe tải 3,5 tấn","plate":"","kind":"loose","l":4300,"w":1900,"h":1900,"payloadKg":3500}'),
  ('adm-v-5t', 'vehicle', 3, '{"name":"Xe tải 5 tấn","plate":"","kind":"loose","l":5700,"w":2000,"h":2000,"payloadKg":5000}'),
  ('adm-v-8t', 'vehicle', 4, '{"name":"Xe tải 8 tấn","plate":"","kind":"loose","l":7400,"w":2350,"h":2150,"payloadKg":8000}'),
  ('adm-v-15t', 'vehicle', 5, '{"name":"Xe tải 15 tấn","plate":"","kind":"loose","l":9200,"w":2350,"h":2400,"payloadKg":15000}'),
  ('adm-v-p8t', 'vehicle', 6, '{"name":"Xe pallet 8 tấn","plate":"","kind":"pallet","l":7400,"w":2350,"h":2300,"payloadKg":8000}'),
  ('adm-v-p15t', 'vehicle', 7, '{"name":"Xe pallet 15 tấn","plate":"","kind":"pallet","l":9500,"w":2500,"h":2600,"payloadKg":15000}'),
  ('adm-v-c20', 'vehicle', 8, '{"name":"Container 20ft","plate":"","kind":"loose","l":5898,"w":2352,"h":2393,"payloadKg":28000,"container":true}'),
  ('adm-v-c40', 'vehicle', 9, '{"name":"Container 40ft","plate":"","kind":"loose","l":12032,"w":2352,"h":2393,"payloadKg":28500,"container":true}'),
  ('adm-i-st180', 'item', 0, '{"code":"MAU-ST180","name":"Sữa 180ml x48","l":420,"w":255,"h":130,"kg":9.85,"perPallet":110,"maxLayers":11,"light":false}'),
  ('adm-i-st110', 'item', 1, '{"code":"MAU-ST110","name":"Sữa 110ml x48","l":420,"w":255,"h":100,"kg":6.2,"perPallet":140,"maxLayers":14,"looseLayers":28,"light":false}'),
  ('adm-i-scu180', 'item', 2, '{"code":"MAU-SCU180","name":"Sữa chua 180ml x48","l":420,"w":255,"h":130,"kg":10.05,"perPallet":110,"maxLayers":11,"light":false}'),
  ('adm-i-th170', 'item', 3, '{"code":"MAU-TH170","name":"Sữa thạch 170ml x48","l":430,"w":250,"h":130,"kg":9.5,"perPallet":100,"maxLayers":11,"light":false}'),
  ('adm-i-c100', 'item', 4, '{"code":"MAU-C100","name":"Sữa chua chai 100ml x48","l":430,"w":250,"h":100,"kg":5.9,"perPallet":143,"maxLayers":14,"light":false}'),
  ('adm-i-c85', 'item', 5, '{"code":"MAU-C85","name":"Sữa chai 85ml x48","l":357,"w":276,"h":105,"kg":5.05,"perPallet":143,"maxLayers":13,"light":false}'),
  ('adm-i-tui110', 'item', 6, '{"code":"MAU-TUI110","name":"Thạch túi 110ml x24","l":310,"w":130,"h":130,"kg":3.08,"perPallet":216,"maxLayers":8,"light":true}')
on conflict (id) do nothing;
