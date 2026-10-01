alter table public.future_atlas_ai_usage add column if not exists credit_quarters smallint not null default 4 check (credit_quarters in (1,2,3,4));
alter table private.future_atlas_ai_requests add column if not exists reserved_credit_quarters smallint not null default 4 check (reserved_credit_quarters in (0,1,2,3,4));

create or replace function public.future_atlas_authorize_user_request(p_request_id uuid,p_idempotency_key text,p_tool text,p_request_hash text)
returns table(request_id uuid,cache_scope text,credits_remaining integer,replay_status text,replay_payload jsonb,environment text)
language plpgsql security definer set search_path=''
as $$
declare v_user uuid := (select auth.uid()); v_existing private.future_atlas_ai_requests; v_spent integer; v_reserved integer;
begin
  if v_user is null then raise exception using errcode='28000',message='FA_AUTH_REQUIRED'; end if;
  if length(p_idempotency_key) not between 8 and 128 then raise exception using errcode='22023',message='FA_INVALID_IDEMPOTENCY_KEY'; end if;
  if length(p_tool) not between 1 and 40 or length(p_request_hash) not between 1 and 128 then raise exception using errcode='22023',message='FA_INVALID_REQUEST'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,12));
  select * into v_existing from private.future_atlas_ai_requests where user_id=v_user and idempotency_key=p_idempotency_key;
  select coalesce(sum(credit_quarters),0)::integer into v_spent from public.future_atlas_ai_usage where user_id=v_user and (used_at at time zone 'Asia/Kolkata')::date=(now() at time zone 'Asia/Kolkata')::date;
  if v_existing.id is not null then
    if v_existing.request_hash<>p_request_hash then raise exception using errcode='23505',message='FA_IDEMPOTENCY_CONFLICT'; end if;
    return query select v_existing.id,'user:'||v_user::text,greatest(0,(120-v_spent)/4),v_existing.status,v_existing.result_payload,'application'::text; return;
  end if;
  select coalesce(sum(reserved_credit_quarters),0)::integer into v_reserved from private.future_atlas_ai_requests where user_id=v_user and status='processing' and created_at>now()-interval '90 seconds';
  if v_spent+v_reserved+4>120 then raise exception using errcode='P0001',message='FA_DAILY_LIMIT'; end if;
  if (select count(*) from private.future_atlas_ai_requests where user_id=v_user and status='processing' and created_at>now()-interval '90 seconds')>=2 then raise exception using errcode='P0001',message='FA_USER_BUSY'; end if;
  if (select count(*) from private.future_atlas_ai_requests where status='processing' and created_at>now()-interval '90 seconds')>=100 then raise exception using errcode='P0001',message='FA_GLOBAL_BUSY'; end if;
  insert into private.future_atlas_ai_requests(id,user_id,idempotency_key,request_hash,tool,reserved_credit_quarters) values(p_request_id,v_user,p_idempotency_key,p_request_hash,p_tool,4);
  return query select p_request_id,'user:'||v_user::text,greatest(0,(120-v_spent-v_reserved-4)/4),'new',null::jsonb,'application'::text;
end $$;

create or replace function public.future_atlas_complete_user_request(p_request_id uuid,p_status text,p_result_payload jsonb default null,p_error_code text default null,p_provider text default null,p_duration_ms integer default null,p_credit_quarters integer default 4)
returns integer language plpgsql security definer set search_path=''
as $$
declare v_user uuid := (select auth.uid()); v_tool text; v_spent integer;
begin
  if v_user is null then raise exception using errcode='28000',message='FA_AUTH_REQUIRED'; end if;
  if p_status not in ('completed','failed') then raise exception using errcode='22023',message='FA_INVALID_STATUS'; end if;
  if p_credit_quarters not in (1,2,3,4) then raise exception using errcode='22023',message='FA_INVALID_CREDIT_COST'; end if;
  update private.future_atlas_ai_requests r set status=p_status,result_payload=case when p_status='completed' then p_result_payload else null end,error_code=p_error_code,provider=p_provider,duration_ms=p_duration_ms,completed_at=now(),reserved_credit_quarters=case when p_status='completed' then p_credit_quarters else 0 end where r.id=p_request_id and r.user_id=v_user and r.status='processing' returning r.tool into v_tool;
  if found and p_status='completed' then insert into public.future_atlas_ai_usage(user_id,request_id,mode,credit_quarters) values(v_user,p_request_id,v_tool,p_credit_quarters) on conflict (request_id) do nothing; end if;
  select coalesce(sum(credit_quarters),0)::integer into v_spent from public.future_atlas_ai_usage where user_id=v_user and (used_at at time zone 'Asia/Kolkata')::date=(now() at time zone 'Asia/Kolkata')::date;
  return greatest(0,(120-v_spent)/4);
end $$;

create or replace function public.future_atlas_credit_status() returns table(credits_remaining integer,reset_at timestamptz)
language sql security definer set search_path=''
as $$ select greatest(0,(120-coalesce(sum(u.credit_quarters),0)::integer)/4),((date_trunc('day',now() at time zone 'Asia/Kolkata')+interval '1 day') at time zone 'Asia/Kolkata') from public.future_atlas_ai_usage u where u.user_id=(select auth.uid()) and (u.used_at at time zone 'Asia/Kolkata')::date=(now() at time zone 'Asia/Kolkata')::date $$;

revoke all on function public.future_atlas_authorize_user_request(uuid,text,text,text) from public,anon;
revoke all on function public.future_atlas_complete_user_request(uuid,text,jsonb,text,text,integer,integer) from public,anon;
revoke all on function public.future_atlas_credit_status() from public,anon;
grant execute on function public.future_atlas_authorize_user_request(uuid,text,text,text) to authenticated;
grant execute on function public.future_atlas_complete_user_request(uuid,text,jsonb,text,text,integer,integer) to authenticated;
grant execute on function public.future_atlas_credit_status() to authenticated;

create table if not exists public.future_atlas_events (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete set null,
  anonymous_id text not null check (length(anonymous_id)=36), event_name text not null check (event_name in ('page_view','tool_result','guidance_open','forum_cta')),
  category text not null check (category in ('necessary','additional')), metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  occurred_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '13 months'
);
alter table public.future_atlas_events enable row level security;
create index if not exists future_atlas_events_user_time_idx on public.future_atlas_events(user_id,occurred_at desc);
create index if not exists future_atlas_events_anonymous_time_idx on public.future_atlas_events(anonymous_id,occurred_at desc);
revoke all on public.future_atlas_events from anon,authenticated;

create table if not exists public.future_atlas_history_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  history jsonb not null default '{}'::jsonb check (jsonb_typeof(history)='object'),
  consent text,
  updated_at timestamptz not null default now()
);
alter table public.future_atlas_history_backups enable row level security;
revoke all on public.future_atlas_history_backups from anon,authenticated;

create or replace function public.future_atlas_delete_my_data() returns void
language plpgsql security definer set search_path=''
as $$ declare v_user uuid := (select auth.uid()); begin
  if v_user is null then raise exception using errcode='28000',message='FA_AUTH_REQUIRED'; end if;
  delete from public.future_atlas_history_backups where user_id=v_user;
  delete from public.future_atlas_events where user_id=v_user;
  delete from public.future_atlas_ai_usage where user_id=v_user;
  delete from private.future_atlas_ai_requests where user_id=v_user;
  delete from public.future_atlas_profiles where user_id=v_user;
end $$;
revoke all on function public.future_atlas_delete_my_data() from public,anon;
grant execute on function public.future_atlas_delete_my_data() to authenticated;

create or replace function private.future_atlas_purge_expired_events() returns bigint
language plpgsql security definer set search_path=''
as $$ declare affected bigint; begin delete from public.future_atlas_events where expires_at<=now(); get diagnostics affected=row_count; return affected; end $$;
revoke all on function private.future_atlas_purge_expired_events() from public,anon,authenticated;
