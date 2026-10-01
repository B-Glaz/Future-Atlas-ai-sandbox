create table if not exists private.future_atlas_refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists private.future_atlas_access_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  refresh_token_id uuid not null references private.future_atlas_refresh_tokens(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table private.future_atlas_refresh_tokens enable row level security;
alter table private.future_atlas_access_tokens enable row level security;
create index if not exists future_atlas_refresh_tokens_user_idx on private.future_atlas_refresh_tokens(user_id, created_at desc);
create index if not exists future_atlas_access_tokens_user_idx on private.future_atlas_access_tokens(user_id, created_at desc);
revoke all on private.future_atlas_refresh_tokens from public, anon, authenticated;
revoke all on private.future_atlas_access_tokens from public, anon, authenticated;

create or replace function private.future_atlas_token_hash(p_token text)
returns text language sql immutable set search_path='' as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;

create or replace function private.future_atlas_acting_user_id()
returns uuid language plpgsql stable security definer set search_path=''
as $$
declare v_user uuid := (select auth.uid()); v_token text; v_hash text;
begin
  if v_user is not null then return v_user; end if;
  v_token := nullif(btrim(coalesce(current_setting('request.header.x-future-atlas-token', true), '')), '');
  if v_token is null then
    begin
      v_token := nullif(btrim(coalesce(current_setting('request.headers', true)::json->>'x-future-atlas-token','')), '');
    exception when others then
      v_token := null;
    end;
  end if;
  if v_token is null or left(v_token, 7) <> 'fa_atk_' then return null; end if;
  v_hash := private.future_atlas_token_hash(v_token);
  select a.user_id into v_user
  from private.future_atlas_access_tokens a
  join private.future_atlas_refresh_tokens r on r.id = a.refresh_token_id
  where a.token_hash = v_hash and a.revoked_at is null and a.expires_at > now()
    and r.revoked_at is null and r.expires_at > now();
  return v_user;
end $$;
revoke all on function private.future_atlas_token_hash(text), private.future_atlas_acting_user_id() from public, anon, authenticated;

create or replace function public.future_atlas_authorize_user_request(p_request_id uuid,p_idempotency_key text,p_tool text,p_request_hash text)
returns table(request_id uuid,cache_scope text,credits_remaining integer,replay_status text,replay_payload jsonb,environment text)
language plpgsql security definer set search_path=''
as $$
declare v_user uuid := private.future_atlas_acting_user_id(); v_existing private.future_atlas_ai_requests; v_spent integer; v_reserved integer;
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
declare v_user uuid := private.future_atlas_acting_user_id(); v_tool text; v_spent integer;
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
language plpgsql security definer set search_path=''
as $$
declare v_user uuid := private.future_atlas_acting_user_id();
begin
  if v_user is null then raise exception using errcode='28000',message='FA_AUTH_REQUIRED'; end if;
  return query select greatest(0,(120-coalesce(sum(u.credit_quarters),0)::integer)/4),((date_trunc('day',now() at time zone 'Asia/Kolkata')+interval '1 day') at time zone 'Asia/Kolkata') from public.future_atlas_ai_usage u where u.user_id=v_user and (u.used_at at time zone 'Asia/Kolkata')::date=(now() at time zone 'Asia/Kolkata')::date;
end $$;

create or replace function public.future_atlas_create_tenant(p_name text,p_slug text,p_environment text default 'sandbox')
returns table(id uuid,public_id uuid,name text,slug text,environment text,status text) language plpgsql security definer set search_path=''
as $$ declare v_user uuid:=private.future_atlas_acting_user_id();v private.future_atlas_tenants;begin
if v_user is null then raise exception using errcode='28000',message='FA_AUTH_REQUIRED';end if;
if p_environment not in ('sandbox','production') then raise exception using errcode='22023',message='FA_INVALID_ENVIRONMENT';end if;
insert into private.future_atlas_tenants(name,slug,environment) values(btrim(p_name),lower(btrim(p_slug)),p_environment) returning * into v;
insert into private.future_atlas_tenant_members values(v.id,v_user,'owner',now());return query select v.id,v.public_id,v.name,v.slug,v.environment,v.status;end $$;

create or replace function public.future_atlas_list_tenants() returns table(id uuid,public_id uuid,name text,slug text,environment text,status text,role text,daily_limit integer,concurrency_limit integer)
language sql security definer set search_path='' as $$select t.id,t.public_id,t.name,t.slug,t.environment,t.status,m.role,t.daily_limit,t.concurrency_limit from private.future_atlas_tenant_members m join private.future_atlas_tenants t on t.id=m.tenant_id where m.user_id=private.future_atlas_acting_user_id() order by t.created_at$$;

create or replace function public.future_atlas_issue_credential(p_tenant_id uuid,p_name text,p_scopes text[] default array['ai:generate'],p_expires_at timestamptz default null)
returns table(credential_id uuid,api_key text,key_prefix text,scopes text[],expires_at timestamptz) language plpgsql security definer set search_path=''
as $$declare u uuid:=private.future_atlas_acting_user_id();e text;token text;prefix text;cid uuid;begin
select t.environment into e from private.future_atlas_tenants t join private.future_atlas_tenant_members m on m.tenant_id=t.id where t.id=p_tenant_id and m.user_id=u and m.role in('owner','admin') and t.status='active';
if e is null then raise exception using errcode='42501',message='FA_TENANT_FORBIDDEN';end if;if not(p_scopes<@array['ai:generate']::text[]) then raise exception using errcode='22023',message='FA_INVALID_SCOPE';end if;
prefix:=case when e='production' then 'fa_live_' else 'fa_test_' end;token:=prefix||encode(extensions.gen_random_bytes(24),'hex');
insert into private.future_atlas_api_credentials(tenant_id,name,key_prefix,secret_hash,scopes,expires_at,created_by) values(p_tenant_id,btrim(p_name),left(token,16),encode(extensions.digest(token,'sha256'),'hex'),p_scopes,p_expires_at,u) returning id into cid;
return query select cid,token,left(token,16),p_scopes,p_expires_at;end $$;

create or replace function public.future_atlas_register_domain(p_tenant_id uuid,p_origin text)
returns table(domain_id uuid,origin text,verification_token text,verified boolean) language plpgsql security definer set search_path=''
as $$declare u uuid:=private.future_atlas_acting_user_id();o text:=lower(rtrim(btrim(p_origin),'/'));r private.future_atlas_tenant_domains;begin
if not exists(select 1 from private.future_atlas_tenant_members where tenant_id=p_tenant_id and user_id=u and role in('owner','admin')) then raise exception using errcode='42501',message='FA_TENANT_FORBIDDEN';end if;
if o!~'^https://[a-z0-9.-]+(:[0-9]{1,5})?$' and o!~'^http://(localhost|127[.]0[.]0[.]1)(:[0-9]{1,5})?$' then raise exception using errcode='22023',message='FA_INVALID_ORIGIN';end if;
insert into private.future_atlas_tenant_domains(tenant_id,origin,verification_token) values(p_tenant_id,o,'future-atlas-verification='||encode(extensions.gen_random_bytes(18),'hex')) on conflict(tenant_id,origin) do update set verification_token=excluded.verification_token,verified_at=null returning * into r;
return query select r.id,r.origin,r.verification_token,r.verified_at is not null;end $$;

create or replace function public.future_atlas_can_verify_domain(p_domain_id uuid,p_origin text,p_token text) returns boolean
language sql security definer set search_path='' as $$select exists(select 1 from private.future_atlas_tenant_domains d join private.future_atlas_tenant_members m on m.tenant_id=d.tenant_id where d.id=p_domain_id and d.origin=lower(rtrim(btrim(p_origin),'/')) and d.verification_token=p_token and m.user_id=private.future_atlas_acting_user_id() and m.role in('owner','admin'))$$;

create or replace function public.future_atlas_tenant_details(p_tenant_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
if not exists(select 1 from private.future_atlas_tenant_members where tenant_id=p_tenant_id and user_id=private.future_atlas_acting_user_id()) then raise exception using errcode='42501',message='FA_TENANT_FORBIDDEN';end if;
return jsonb_build_object('credentials',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'keyPrefix',key_prefix,'scopes',scopes,'status',status,'lastUsedAt',last_used_at,'expiresAt',expires_at,'createdAt',created_at) order by created_at) from private.future_atlas_api_credentials where tenant_id=p_tenant_id),'[]'::jsonb),'domains',coalesce((select jsonb_agg(jsonb_build_object('id',id,'origin',origin,'verified',verified_at is not null,'verificationToken',case when verified_at is null then verification_token else null end,'createdAt',created_at) order by created_at) from private.future_atlas_tenant_domains where tenant_id=p_tenant_id),'[]'::jsonb),'usage',jsonb_build_object('last24Hours',(select count(*) from private.future_atlas_ai_requests where tenant_id=p_tenant_id and created_at>=now()-interval '24 hours'),'processing',(select count(*) from private.future_atlas_ai_requests where tenant_id=p_tenant_id and status='processing' and created_at>now()-interval '90 seconds'),'completed',(select count(*) from private.future_atlas_ai_requests where tenant_id=p_tenant_id and status='completed' and created_at>=now()-interval '24 hours'),'failed',(select count(*) from private.future_atlas_ai_requests where tenant_id=p_tenant_id and status='failed' and created_at>=now()-interval '24 hours')));end$$;

create or replace function public.future_atlas_revoke_credential(p_credential_id uuid) returns boolean language plpgsql security definer set search_path=''
as $$declare u uuid:=private.future_atlas_acting_user_id();n integer;begin update private.future_atlas_api_credentials c set status='revoked',revoked_at=now() where c.id=p_credential_id and exists(select 1 from private.future_atlas_tenant_members m where m.tenant_id=c.tenant_id and m.user_id=u and m.role in('owner','admin'));get diagnostics n=row_count;return n=1;end$$;
create or replace function public.future_atlas_remove_domain(p_domain_id uuid) returns boolean language plpgsql security definer set search_path=''
as $$declare u uuid:=private.future_atlas_acting_user_id();n integer;begin delete from private.future_atlas_tenant_domains d where d.id=p_domain_id and exists(select 1 from private.future_atlas_tenant_members m where m.tenant_id=d.tenant_id and m.user_id=u and m.role in('owner','admin'));get diagnostics n=row_count;return n=1;end$$;
create or replace function public.future_atlas_set_tenant_status(p_tenant_id uuid,p_status text) returns boolean language plpgsql security definer set search_path=''
as $$declare u uuid:=private.future_atlas_acting_user_id();n integer;begin if p_status not in('active','suspended') then raise exception using errcode='22023',message='FA_INVALID_STATUS';end if;update private.future_atlas_tenants t set status=p_status where t.id=p_tenant_id and exists(select 1 from private.future_atlas_tenant_members m where m.tenant_id=t.id and m.user_id=u and m.role='owner');get diagnostics n=row_count;return n=1;end$$;

create or replace function public.future_atlas_issue_api_tokens()
returns table(access_token text, refresh_token text, access_expires_at timestamptz, refresh_expires_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare v_user uuid := (select auth.uid()); v_refresh_id uuid; v_access text; v_refresh text; v_access_exp timestamptz; v_refresh_exp timestamptz;
begin
  if v_user is null then raise exception using errcode='28000',message='FA_AUTH_REQUIRED'; end if;
  v_access := 'fa_atk_'||encode(extensions.gen_random_bytes(24),'hex');
  v_refresh := 'fa_rtk_'||encode(extensions.gen_random_bytes(32),'hex');
  v_access_exp := now() + interval '1 hour';
  v_refresh_exp := now() + interval '30 days';
  update private.future_atlas_access_tokens set revoked_at=now() where user_id=v_user and revoked_at is null;
  update private.future_atlas_refresh_tokens set revoked_at=now() where user_id=v_user and revoked_at is null;
  insert into private.future_atlas_refresh_tokens(user_id,token_hash,expires_at) values(v_user,private.future_atlas_token_hash(v_refresh),v_refresh_exp) returning id into v_refresh_id;
  insert into private.future_atlas_access_tokens(user_id,refresh_token_id,token_hash,expires_at) values(v_user,v_refresh_id,private.future_atlas_token_hash(v_access),v_access_exp);
  return query select v_access, v_refresh, v_access_exp, v_refresh_exp;
end $$;

create or replace function public.future_atlas_refresh_api_token(p_refresh_token text)
returns table(access_token text, access_expires_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare v_refresh private.future_atlas_refresh_tokens; v_access text; v_access_exp timestamptz;
begin
  if left(coalesce(p_refresh_token,''), 7) <> 'fa_rtk_' then raise exception using errcode='28000',message='FA_INVALID_REFRESH_TOKEN'; end if;
  select * into v_refresh from private.future_atlas_refresh_tokens where token_hash=private.future_atlas_token_hash(p_refresh_token);
  if v_refresh.id is null or v_refresh.revoked_at is not null or v_refresh.expires_at<=now() then raise exception using errcode='28000',message='FA_INVALID_REFRESH_TOKEN'; end if;
  v_access := 'fa_atk_'||encode(extensions.gen_random_bytes(24),'hex');
  v_access_exp := now() + interval '1 hour';
  update private.future_atlas_access_tokens set revoked_at=now() where refresh_token_id=v_refresh.id and revoked_at is null;
  insert into private.future_atlas_access_tokens(user_id,refresh_token_id,token_hash,expires_at) values(v_refresh.user_id,v_refresh.id,private.future_atlas_token_hash(v_access),v_access_exp);
  return query select v_access, v_access_exp;
end $$;

create or replace function public.future_atlas_inspect_api_token(p_token text)
returns table(valid boolean, token_type text, expires_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare v_hash text; v_access private.future_atlas_access_tokens; v_refresh private.future_atlas_refresh_tokens;
begin
  if p_token is null or length(p_token) not between 20 and 200 then return query select false, null::text, null::timestamptz; return; end if;
  v_hash := private.future_atlas_token_hash(p_token);
  if left(p_token,7)='fa_atk_' then
    select a.* into v_access from private.future_atlas_access_tokens a join private.future_atlas_refresh_tokens r on r.id=a.refresh_token_id
      where a.token_hash=v_hash;
    return query select (v_access.id is not null and v_access.revoked_at is null and v_access.expires_at>now() and exists(select 1 from private.future_atlas_refresh_tokens r where r.id=v_access.refresh_token_id and r.revoked_at is null and r.expires_at>now())),
      'access'::text, v_access.expires_at;
    return;
  end if;
  if left(p_token,7)='fa_rtk_' then
    select * into v_refresh from private.future_atlas_refresh_tokens where token_hash=v_hash;
    return query select (v_refresh.id is not null and v_refresh.revoked_at is null and v_refresh.expires_at>now()), 'refresh'::text, v_refresh.expires_at;
    return;
  end if;
  return query select false, null::text, null::timestamptz;
end $$;

create or replace function public.future_atlas_revoke_api_tokens(p_access_token text default null, p_refresh_token text default null, p_all boolean default false)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_user uuid := (select auth.uid()); n integer := 0; v_count integer;
begin
  if p_all then
    if v_user is null then raise exception using errcode='28000',message='FA_AUTH_REQUIRED'; end if;
    update private.future_atlas_access_tokens set revoked_at=now() where user_id=v_user and revoked_at is null;
    get diagnostics v_count = row_count; n := n + v_count;
    update private.future_atlas_refresh_tokens set revoked_at=now() where user_id=v_user and revoked_at is null;
    get diagnostics v_count = row_count; n := n + v_count;
    return n > 0;
  end if;
  if coalesce(p_access_token,'') <> '' then
    update private.future_atlas_access_tokens set revoked_at=now()
      where token_hash=private.future_atlas_token_hash(p_access_token) and revoked_at is null and (v_user is null or user_id=v_user);
    get diagnostics v_count = row_count; n := n + v_count;
  end if;
  if coalesce(p_refresh_token,'') <> '' then
    update private.future_atlas_access_tokens a set revoked_at=now()
      from private.future_atlas_refresh_tokens r
      where a.refresh_token_id=r.id and r.token_hash=private.future_atlas_token_hash(p_refresh_token) and a.revoked_at is null and (v_user is null or r.user_id=v_user);
    update private.future_atlas_refresh_tokens set revoked_at=now()
      where token_hash=private.future_atlas_token_hash(p_refresh_token) and revoked_at is null and (v_user is null or user_id=v_user);
    get diagnostics v_count = row_count; n := n + v_count;
  end if;
  return n > 0;
end $$;

create or replace function public.future_atlas_api_token_status()
returns table(has_active_refresh boolean, access_expires_at timestamptz, refresh_expires_at timestamptz, access_prefix text, refresh_prefix text)
language plpgsql security definer set search_path=''
as $$
declare v_user uuid := private.future_atlas_acting_user_id();
begin
  if v_user is null then raise exception using errcode='28000',message='FA_AUTH_REQUIRED'; end if;
  return query
    select r.id is not null,
      a.expires_at,
      r.expires_at,
      case when a.id is null then null else 'fa_atk_' end,
      case when r.id is null then null else 'fa_rtk_' end
    from (select v_user as user_id) u
    left join lateral (
      select * from private.future_atlas_refresh_tokens t where t.user_id=u.user_id and t.revoked_at is null and t.expires_at>now() order by t.created_at desc limit 1
    ) r on true
    left join lateral (
      select * from private.future_atlas_access_tokens t where t.refresh_token_id=r.id and t.revoked_at is null and t.expires_at>now() order by t.created_at desc limit 1
    ) a on true;
end $$;

create or replace function public.future_atlas_resolve_access_token(p_token text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_user uuid;
begin
  if left(coalesce(p_token,''), 7) <> 'fa_atk_' then return null; end if;
  select a.user_id into v_user
  from private.future_atlas_access_tokens a
  join private.future_atlas_refresh_tokens r on r.id=a.refresh_token_id
  where a.token_hash=private.future_atlas_token_hash(p_token) and a.revoked_at is null and a.expires_at>now()
    and r.revoked_at is null and r.expires_at>now();
  return v_user;
end $$;

create or replace function public.future_atlas_delete_my_data() returns void
language plpgsql security definer set search_path=''
as $$ declare v_user uuid := (select auth.uid()); begin
  if v_user is null then raise exception using errcode='28000',message='FA_AUTH_REQUIRED'; end if;
  delete from private.future_atlas_access_tokens where user_id=v_user;
  delete from private.future_atlas_refresh_tokens where user_id=v_user;
  delete from public.future_atlas_history_backups where user_id=v_user;
  delete from public.future_atlas_consent_log where user_id=v_user;
  delete from public.future_atlas_events where user_id=v_user;
  delete from public.future_atlas_request_logs where user_id=v_user;
  delete from public.future_atlas_ai_usage where user_id=v_user;
  delete from private.future_atlas_ai_requests where user_id=v_user;
  delete from public.future_atlas_profiles where user_id=v_user;
end $$;

revoke all on function public.future_atlas_issue_api_tokens() from public,anon;
revoke all on function public.future_atlas_api_token_status() from public,anon;
grant execute on function public.future_atlas_issue_api_tokens() to authenticated;
grant execute on function public.future_atlas_api_token_status() to authenticated;
revoke all on function public.future_atlas_refresh_api_token(text), public.future_atlas_inspect_api_token(text), public.future_atlas_revoke_api_tokens(text,text,boolean) from public;
grant execute on function public.future_atlas_refresh_api_token(text), public.future_atlas_inspect_api_token(text), public.future_atlas_revoke_api_tokens(text,text,boolean) to anon, authenticated;
revoke all on function public.future_atlas_resolve_access_token(text) from public,anon,authenticated;
grant execute on function public.future_atlas_resolve_access_token(text) to service_role;
grant execute on function public.future_atlas_delete_my_data() to authenticated;
