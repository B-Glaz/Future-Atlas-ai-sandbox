create table if not exists public.future_atlas_request_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  auth_type text not null check (auth_type in ('user','api_key','anonymous')),
  method text not null check (char_length(method) between 1 and 10),
  path text not null check (char_length(path) between 1 and 200),
  status_code smallint not null check (status_code between 100 and 599),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  request_id uuid,
  origin text,
  ip text,
  created_at timestamptz not null default now()
);
alter table public.future_atlas_request_logs enable row level security;
create index if not exists future_atlas_request_logs_user_time_idx on public.future_atlas_request_logs(user_id, created_at desc);
create index if not exists future_atlas_request_logs_time_idx on public.future_atlas_request_logs(created_at desc);
revoke all on public.future_atlas_request_logs from anon, authenticated;

create or replace function public.future_atlas_delete_my_data() returns void
language plpgsql security definer set search_path=''
as $$ declare v_user uuid := (select auth.uid()); begin
  if v_user is null then raise exception using errcode='28000',message='FA_AUTH_REQUIRED'; end if;
  delete from public.future_atlas_history_backups where user_id=v_user;
  delete from public.future_atlas_consent_log where user_id=v_user;
  delete from public.future_atlas_events where user_id=v_user;
  delete from public.future_atlas_request_logs where user_id=v_user;
  delete from public.future_atlas_ai_usage where user_id=v_user;
  delete from private.future_atlas_ai_requests where user_id=v_user;
  delete from public.future_atlas_profiles where user_id=v_user;
end $$;
revoke all on function public.future_atlas_delete_my_data() from public,anon;
grant execute on function public.future_atlas_delete_my_data() to authenticated;
