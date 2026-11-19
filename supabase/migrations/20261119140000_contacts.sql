-- Carnet de contacts (onglet Contacts, sous Mes clients) : personnes rattachées ou non à un client.
create table if not exists public.contacts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  first_name text, last_name text, role text, company text,
  email text, phone text, notes text,
  created_at timestamptz not null default now()
);
alter table public.contacts enable row level security;
create policy "contacts select own" on public.contacts for select using (auth.uid() = user_id);
create policy "contacts insert own" on public.contacts for insert with check (auth.uid() = user_id);
create policy "contacts update own" on public.contacts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "contacts delete own" on public.contacts for delete using (auth.uid() = user_id);
