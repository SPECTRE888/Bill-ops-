-- Login Google + abonnement Stripe pour Helm.
-- profiles/subscriptions : identité + statut d'abonnement, écrits uniquement par les Edge
-- Functions (service role) ; login_relay : handoff des tokens de session pour le flux Electron
-- desktop (pas d'origine https locale pour recevoir un redirectTo direct), calqué sur
-- oauth_pending (flux Gmail existant, laissé intact).

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null,
  plan text not null default 'standard',
  period text not null default 'monthly',
  expires_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);

alter table public.subscriptions enable row level security;

create policy "subscriptions_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);

create table if not exists public.login_relay (
  state text primary key,
  access_token text not null,
  refresh_token text not null,
  created_at timestamptz not null default now()
);

alter table public.login_relay enable row level security;
-- Aucune policy pour authenticated/anon : service role only, comme oauth_pending.
