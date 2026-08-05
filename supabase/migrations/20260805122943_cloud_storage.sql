-- Stockage cloud par utilisateur (remplace localStorage comme source de vérité, remplace le
-- "code de synchro" anonyme / billops_sync). RLS : le client écrit directement via son JWT de
-- session (contrairement à profiles/subscriptions, écrites uniquement par les Edge Functions),
-- donc policies complètes select/insert/update/delete scindées par auth.uid() = user_id.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  prefix text,
  email text,
  phone text,
  addr text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clients_user_id_idx on public.clients (user_id);
alter table public.clients enable row level security;
create policy "clients_select_own" on public.clients for select using (auth.uid() = user_id);
create policy "clients_insert_own" on public.clients for insert with check (auth.uid() = user_id);
create policy "clients_update_own" on public.clients for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "clients_delete_own" on public.clients for delete using (auth.uid() = user_id);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client text,
  label text,
  addr text,
  contact text,
  date text,
  time_from text,
  time_to text,
  hours numeric,
  rate numeric,
  status text,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  actual_hours numeric,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bookings_user_id_idx on public.bookings (user_id);
alter table public.bookings enable row level security;
create policy "bookings_select_own" on public.bookings for select using (auth.uid() = user_id);
create policy "bookings_insert_own" on public.bookings for insert with check (auth.uid() = user_id);
create policy "bookings_update_own" on public.bookings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "bookings_delete_own" on public.bookings for delete using (auth.uid() = user_id);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  num text,
  client text,
  date text,
  work_date text,
  total numeric,
  status text,
  state jsonb,
  html text,
  booking_id uuid,
  booking_ids uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, num)
);
create index if not exists invoices_user_id_idx on public.invoices (user_id);
alter table public.invoices enable row level security;
create policy "invoices_select_own" on public.invoices for select using (auth.uid() = user_id);
create policy "invoices_insert_own" on public.invoices for insert with check (auth.uid() = user_id);
create policy "invoices_update_own" on public.invoices for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "invoices_delete_own" on public.invoices for delete using (auth.uid() = user_id);

create table if not exists public.company_info (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text,
  tagline text,
  addr text,
  contact text,
  siret text,
  tva text,
  rcs text,
  pay text,
  rib text,
  updated_at timestamptz not null default now()
);
alter table public.company_info enable row level security;
create policy "company_info_select_own" on public.company_info for select using (auth.uid() = user_id);
create policy "company_info_insert_own" on public.company_info for insert with check (auth.uid() = user_id);
create policy "company_info_update_own" on public.company_info for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "company_info_delete_own" on public.company_info for delete using (auth.uid() = user_id);
