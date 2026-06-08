create table if not exists public.platform_accounts (
  id text primary key,
  platform text not null check (platform in ('instagram', 'youtube')),
  provider_account_id text,
  username text,
  display_name text,
  status text not null default 'connected',
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (platform, provider_account_id)
);

create table if not exists public.instagram_tokens (
  id text primary key,
  tokens jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.youtube_tokens (
  id text primary key,
  tokens jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.scheduled_uploads
add column if not exists account_id text,
add column if not exists account_ids text[];

create or replace function public.set_platform_accounts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_platform_accounts_updated_at on public.platform_accounts;

create trigger trg_platform_accounts_updated_at
before update on public.platform_accounts
for each row
execute function public.set_platform_accounts_updated_at();

alter table public.platform_accounts enable row level security;
alter table public.instagram_tokens enable row level security;
alter table public.youtube_tokens enable row level security;

drop policy if exists "platform_accounts_select_anon" on public.platform_accounts;
create policy "platform_accounts_select_anon"
on public.platform_accounts
for select
to anon
using (true);

-- Token tables intentionally have no anon policies. They must be accessed only
-- through service-role server APIs.
