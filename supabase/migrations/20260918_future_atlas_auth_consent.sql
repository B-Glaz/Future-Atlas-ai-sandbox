alter table public.future_atlas_profiles add column if not exists phone text;

create or replace function private.future_atlas_handle_new_user()
returns trigger language plpgsql security definer set search_path=''
as $$ begin
  insert into public.future_atlas_profiles(user_id,email,full_name)
  values(new.id,coalesce(new.email,''),nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name','')),''))
  on conflict(user_id) do update set email=excluded.email,full_name=coalesce(public.future_atlas_profiles.full_name,excluded.full_name),updated_at=now();
  return new;
end $$;
revoke all on function private.future_atlas_handle_new_user() from public,anon,authenticated;
drop trigger if exists future_atlas_auth_user_created on auth.users;
create trigger future_atlas_auth_user_created after insert or update of email,raw_user_meta_data on auth.users
for each row execute function private.future_atlas_handle_new_user();

create table if not exists public.future_atlas_consent_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  anonymous_id text not null check(length(anonymous_id)=36),
  necessary_accepted boolean not null default true check(necessary_accepted),
  analytics_accepted boolean not null default false,
  advertising_accepted boolean not null default false,
  consented_at timestamptz not null default now()
);
alter table public.future_atlas_consent_log enable row level security;
create index if not exists future_atlas_consent_user_time_idx on public.future_atlas_consent_log(user_id,consented_at desc);
create index if not exists future_atlas_consent_anonymous_time_idx on public.future_atlas_consent_log(anonymous_id,consented_at desc);
revoke all on public.future_atlas_consent_log from anon,authenticated;

create or replace function public.future_atlas_delete_my_data() returns void
language plpgsql security definer set search_path=''
as $$ declare v_user uuid := (select auth.uid()); begin
  if v_user is null then raise exception using errcode='28000',message='FA_AUTH_REQUIRED'; end if;
  delete from public.future_atlas_history_backups where user_id=v_user;
  delete from public.future_atlas_consent_log where user_id=v_user;
  delete from public.future_atlas_events where user_id=v_user;
  delete from public.future_atlas_ai_usage where user_id=v_user;
  delete from private.future_atlas_ai_requests where user_id=v_user;
  delete from public.future_atlas_profiles where user_id=v_user;
end $$;
revoke all on function public.future_atlas_delete_my_data() from public,anon;
grant execute on function public.future_atlas_delete_my_data() to authenticated;
