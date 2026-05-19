create table if not exists public.content_stats (
  channel text primary key,
  total_count integer not null default 0,
  not_uploaded_count integer not null default 0,
  scheduled_count integer not null default 0,
  uploaded_count integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.content_stats (channel) values
  ('all'), ('blog'), ('newsletter'), ('instagram'), ('shorts')
on conflict (channel) do nothing;

alter table public.content_stats enable row level security;

drop policy if exists "content_stats_select_anon" on public.content_stats;
create policy "content_stats_select_anon"
on public.content_stats
for select
to anon
using (true);

create or replace function public.recompute_content_stats()
returns void
language plpgsql
as $$
begin
  update public.content_stats
  set total_count = 0,
      not_uploaded_count = 0,
      scheduled_count = 0,
      uploaded_count = 0,
      updated_at = timezone('utc', now());

  with channels as (
    select 'blog'::text as channel, e.upload_status->'blog' as info from public.extractions e where e.blog_content is not null
    union all
    select 'newsletter'::text, e.upload_status->'newsletter' from public.extractions e where e.newsletter_content is not null
    union all
    select 'instagram'::text, e.upload_status->'instagram' from public.extractions e where e.instagram_content is not null
    union all
    select 'shorts'::text, e.upload_status->'shorts' from public.extractions e where e.shorts_script is not null
  ),
  pool as (
    select channel, info from channels
    union all
    select 'all'::text as channel, info from channels
  ),
  agg as (
    select
      channel,
      count(*) as total,
      count(*) filter (
        where channel <> 'newsletter'
          and coalesce(info->>'status', 'not_uploaded') = 'not_uploaded'
          and coalesce((info->>'nativeSchedule')::boolean, false) = false
      ) as not_uploaded,
      count(*) filter (
        where channel <> 'newsletter'
          and ((info->>'status') = 'scheduled' or coalesce((info->>'nativeSchedule')::boolean, false) = true)
      ) as scheduled,
      count(*) filter (
        where channel <> 'newsletter'
          and (info->>'status') = 'uploaded'
          and coalesce((info->>'nativeSchedule')::boolean, false) = false
      ) as uploaded
    from pool
    group by channel
  )
  insert into public.content_stats (channel, total_count, not_uploaded_count, scheduled_count, uploaded_count, updated_at)
  select channel, total, not_uploaded, scheduled, uploaded, timezone('utc', now()) from agg
  on conflict (channel) do update set
    total_count = excluded.total_count,
    not_uploaded_count = excluded.not_uploaded_count,
    scheduled_count = excluded.scheduled_count,
    uploaded_count = excluded.uploaded_count,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.trg_recompute_content_stats()
returns trigger
language plpgsql
as $$
begin
  perform public.recompute_content_stats();
  return null;
end;
$$;

drop trigger if exists trg_extractions_stats_aiud on public.extractions;
create trigger trg_extractions_stats_aiud
after insert or update of blog_content, newsletter_content, instagram_content, shorts_script, upload_status or delete
on public.extractions
for each statement
execute function public.trg_recompute_content_stats();

select public.recompute_content_stats();
