create table if not exists public.platform_connections (
  platform text primary key,
  display_name text,
  url text,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.platform_connections enable row level security;

create or replace function public.set_platform_connections_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_platform_connections_updated_at on public.platform_connections;

create trigger trg_platform_connections_updated_at
before update on public.platform_connections
for each row
execute function public.set_platform_connections_updated_at();

drop policy if exists "platform_connections_select_anon" on public.platform_connections;
drop policy if exists "platform_connections_insert_anon" on public.platform_connections;
drop policy if exists "platform_connections_update_anon" on public.platform_connections;

create policy "platform_connections_select_anon"
on public.platform_connections
for select
to anon
using (true);

create policy "platform_connections_insert_anon"
on public.platform_connections
for insert
to anon
with check (true);

create policy "platform_connections_update_anon"
on public.platform_connections
for update
to anon
using (true)
with check (true);
