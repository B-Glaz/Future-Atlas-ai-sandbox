create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.future_atlas_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null, full_name text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.future_atlas_profiles enable row level security;
drop policy if exists future_atlas_profiles_own on public.future_atlas_profiles;
create policy future_atlas_profiles_own on public.future_atlas_profiles for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

create table if not exists public.future_atlas_ai_usage (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null unique, mode text not null, used_at timestamptz not null default now()
);
alter table public.future_atlas_ai_usage enable row level security;
revoke all on public.future_atlas_ai_usage from anon,authenticated;

create table if not exists private.future_atlas_tenants (
  id uuid primary key default gen_random_uuid(), public_id uuid not null unique default gen_random_uuid(),
  name text not null check(length(btrim(name)) between 2 and 120), slug text not null unique check(slug~'^[a-z0-9][a-z0-9-]{1,62}$'),
  environment text not null check(environment in ('sandbox','production')), status text not null default 'active' check(status in ('active','suspended','disabled')),
  daily_limit integer not null default 500 check(daily_limit between 1 and 100000), concurrency_limit integer not null default 5 check(concurrency_limit between 1 and 100),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists private.future_atlas_tenant_members (
  tenant_id uuid references private.future_atlas_tenants(id) on delete cascade, user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'owner' check(role in ('owner','admin','viewer')), created_at timestamptz not null default now(), primary key(tenant_id,user_id)
);
create table if not exists private.future_atlas_api_credentials (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references private.future_atlas_tenants(id) on delete cascade,
  name text not null check(length(btrim(name)) between 2 and 80), key_prefix text not null, secret_hash text not null unique,
  scopes text[] not null default array['ai:generate'], status text not null default 'active' check(status in ('active','revoked')),
  expires_at timestamptz,last_used_at timestamptz,created_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),revoked_at timestamptz
);
create table if not exists private.future_atlas_tenant_domains (
  id uuid primary key default gen_random_uuid(),tenant_id uuid not null references private.future_atlas_tenants(id) on delete cascade,
  origin text not null,verification_token text not null,verified_at timestamptz,created_at timestamptz not null default now(),unique(tenant_id,origin)
);
create table if not exists private.future_atlas_ai_requests (
  id uuid primary key,tenant_id uuid references private.future_atlas_tenants(id) on delete cascade,user_id uuid references auth.users(id) on delete cascade,
  credential_id uuid references private.future_atlas_api_credentials(id) on delete set null,idempotency_key text not null,request_hash text not null,tool text not null,
  status text not null default 'processing' check(status in ('processing','completed','failed')),result_payload jsonb,error_code text,provider text,duration_ms integer,
  created_at timestamptz not null default now(),completed_at timestamptz,
  check((tenant_id is null)<>(user_id is null))
);
create unique index if not exists future_atlas_tenant_idempotency on private.future_atlas_ai_requests(tenant_id,idempotency_key) where tenant_id is not null;
create unique index if not exists future_atlas_user_idempotency on private.future_atlas_ai_requests(user_id,idempotency_key) where user_id is not null;
alter table private.future_atlas_tenants enable row level security;
alter table private.future_atlas_tenant_members enable row level security;
alter table private.future_atlas_api_credentials enable row level security;
alter table private.future_atlas_tenant_domains enable row level security;
alter table private.future_atlas_ai_requests enable row level security;
revoke all on schema private from public,anon,authenticated;

create or replace function public.future_atlas_create_tenant(p_name text,p_slug text,p_environment text default 'sandbox')
returns table(id uuid,public_id uuid,name text,slug text,environment text,status text) language plpgsql security definer set search_path=''
as $$ declare v_user uuid:=(select auth.uid());v private.future_atlas_tenants;begin
if v_user is null then raise exception using errcode='28000',message='FA_AUTH_REQUIRED';end if;
if p_environment not in ('sandbox','production') then raise exception using errcode='22023',message='FA_INVALID_ENVIRONMENT';end if;
insert into private.future_atlas_tenants(name,slug,environment) values(btrim(p_name),lower(btrim(p_slug)),p_environment) returning * into v;
insert into private.future_atlas_tenant_members values(v.id,v_user,'owner',now());return query select v.id,v.public_id,v.name,v.slug,v.environment,v.status;end $$;

create or replace function public.future_atlas_list_tenants() returns table(id uuid,public_id uuid,name text,slug text,environment text,status text,role text,daily_limit integer,concurrency_limit integer)
language sql security definer set search_path='' as $$select t.id,t.public_id,t.name,t.slug,t.environment,t.status,m.role,t.daily_limit,t.concurrency_limit from private.future_atlas_tenant_members m join private.future_atlas_tenants t on t.id=m.tenant_id where m.user_id=(select auth.uid()) order by t.created_at$$;

create or replace function public.future_atlas_issue_credential(p_tenant_id uuid,p_name text,p_scopes text[] default array['ai:generate'],p_expires_at timestamptz default null)
returns table(credential_id uuid,api_key text,key_prefix text,scopes text[],expires_at timestamptz) language plpgsql security definer set search_path=''
as $$declare u uuid:=(select auth.uid());e text;token text;prefix text;cid uuid;begin
select t.environment into e from private.future_atlas_tenants t join private.future_atlas_tenant_members m on m.tenant_id=t.id where t.id=p_tenant_id and m.user_id=u and m.role in('owner','admin') and t.status='active';
if e is null then raise exception using errcode='42501',message='FA_TENANT_FORBIDDEN';end if;if not(p_scopes<@array['ai:generate']::text[]) then raise exception using errcode='22023',message='FA_INVALID_SCOPE';end if;
prefix:=case when e='production' then 'fa_live_' else 'fa_test_' end;token:=prefix||encode(extensions.gen_random_bytes(24),'hex');
insert into private.future_atlas_api_credentials(tenant_id,name,key_prefix,secret_hash,scopes,expires_at,created_by) values(p_tenant_id,btrim(p_name),left(token,16),encode(extensions.digest(token,'sha256'),'hex'),p_scopes,p_expires_at,u) returning id into cid;
return query select cid,token,left(token,16),p_scopes,p_expires_at;end $$;

create or replace function public.future_atlas_register_domain(p_tenant_id uuid,p_origin text)
returns table(domain_id uuid,origin text,verification_token text,verified boolean) language plpgsql security definer set search_path=''
as $$declare u uuid:=(select auth.uid());o text:=lower(rtrim(btrim(p_origin),'/'));r private.future_atlas_tenant_domains;begin
if not exists(select 1 from private.future_atlas_tenant_members where tenant_id=p_tenant_id and user_id=u and role in('owner','admin')) then raise exception using errcode='42501',message='FA_TENANT_FORBIDDEN';end if;
if o!~'^https://[a-z0-9.-]+(:[0-9]{1,5})?$' and o!~'^http://(localhost|127[.]0[.]0[.]1)(:[0-9]{1,5})?$' then raise exception using errcode='22023',message='FA_INVALID_ORIGIN';end if;
insert into private.future_atlas_tenant_domains(tenant_id,origin,verification_token) values(p_tenant_id,o,'future-atlas-verification='||encode(extensions.gen_random_bytes(18),'hex')) on conflict(tenant_id,origin) do update set verification_token=excluded.verification_token,verified_at=null returning * into r;
return query select r.id,r.origin,r.verification_token,r.verified_at is not null;end $$;

create or replace function public.future_atlas_authorize_embed(p_public_id uuid,p_origin text) returns table(tenant_id uuid,tenant_name text,environment text)
language sql security definer set search_path='' as $$select t.id,t.name,t.environment from private.future_atlas_tenants t join private.future_atlas_tenant_domains d on d.tenant_id=t.id where t.public_id=p_public_id and t.status='active' and d.verified_at is not null and d.origin=lower(rtrim(btrim(p_origin),'/')) limit 1$$;

create or replace function public.future_atlas_can_verify_domain(p_domain_id uuid,p_origin text,p_token text) returns boolean
language sql security definer set search_path='' as $$select exists(select 1 from private.future_atlas_tenant_domains d join private.future_atlas_tenant_members m on m.tenant_id=d.tenant_id where d.id=p_domain_id and d.origin=lower(rtrim(btrim(p_origin),'/')) and d.verification_token=p_token and m.user_id=(select auth.uid()) and m.role in('owner','admin'))$$;
create or replace function public.future_atlas_mark_domain_verified(p_domain_id uuid,p_origin text,p_token text) returns boolean
language plpgsql security definer set search_path='' as $$declare n integer;begin update private.future_atlas_tenant_domains set verified_at=now() where id=p_domain_id and origin=lower(rtrim(btrim(p_origin),'/')) and verification_token=p_token;get diagnostics n=row_count;return n=1;end$$;

create or replace function public.future_atlas_authorize_request(p_api_key text,p_request_id uuid,p_idempotency_key text,p_tool text,p_request_hash text,p_origin text default null)
returns table(request_id uuid,cache_scope text,credits_remaining integer,replay_status text,replay_payload jsonb,environment text)
language plpgsql security definer set search_path='' as $$
declare c private.future_atlas_api_credentials;t private.future_atlas_tenants;r private.future_atlas_ai_requests;n integer;latest timestamptz;o text:=nullif(lower(rtrim(btrim(p_origin),'/')),'');
begin
if length(p_idempotency_key) not between 8 and 128 then raise exception using errcode='22023',message='FA_INVALID_IDEMPOTENCY_KEY';end if;
select * into c from private.future_atlas_api_credentials where secret_hash=encode(extensions.digest(p_api_key,'sha256'),'hex') and status='active' and(expires_at is null or expires_at>now());
if c.id is null or not('ai:generate'=any(c.scopes)) then raise exception using errcode='28000',message='FA_INVALID_API_KEY';end if;
select * into t from private.future_atlas_tenants where id=c.tenant_id and status='active';if t.id is null then raise exception using errcode='42501',message='FA_TENANT_DISABLED';end if;
if o is null or not exists(select 1 from private.future_atlas_tenant_domains where tenant_id=t.id and origin=o and verified_at is not null) then raise exception using errcode='42501',message='FA_ORIGIN_FORBIDDEN';end if;
perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(t.id::text,11));select * into r from private.future_atlas_ai_requests where tenant_id=t.id and idempotency_key=p_idempotency_key;
if r.id is not null then if r.request_hash<>p_request_hash then raise exception using errcode='23505',message='FA_IDEMPOTENCY_CONFLICT';end if;return query select r.id,'tenant:'||t.id::text,greatest(0,t.daily_limit-(select count(*)::integer from private.future_atlas_ai_requests where tenant_id=t.id and created_at>=now()-interval '24 hours')),r.status,r.result_payload,t.environment;return;end if;
select count(*)::integer,max(created_at) into n,latest from private.future_atlas_ai_requests where tenant_id=t.id and created_at>=now()-interval '24 hours';
if n>=t.daily_limit then raise exception using errcode='P0001',message='FA_DAILY_LIMIT';end if;if latest>now()-interval '1 second' then raise exception using errcode='P0001',message='FA_RATE_LIMIT';end if;
if(select count(*) from private.future_atlas_ai_requests where tenant_id=t.id and status='processing' and created_at>now()-interval '90 seconds')>=t.concurrency_limit then raise exception using errcode='P0001',message='FA_TENANT_BUSY';end if;
if(select count(*) from private.future_atlas_ai_requests where status='processing' and created_at>now()-interval '90 seconds')>=100 then raise exception using errcode='P0001',message='FA_GLOBAL_BUSY';end if;
insert into private.future_atlas_ai_requests(id,tenant_id,credential_id,idempotency_key,request_hash,tool) values(p_request_id,t.id,c.id,p_idempotency_key,p_request_hash,p_tool);update private.future_atlas_api_credentials set last_used_at=now() where id=c.id;
return query select p_request_id,'tenant:'||t.id::text,t.daily_limit-n-1,'new',null::jsonb,t.environment;end$$;

create or replace function public.future_atlas_complete_request(p_request_id uuid,p_api_key text,p_status text,p_result_payload jsonb default null,p_error_code text default null,p_provider text default null,p_duration_ms integer default null)
returns boolean language plpgsql security definer set search_path='' as $$declare h text:=encode(extensions.digest(p_api_key,'sha256'),'hex');n integer;begin
if p_status not in('completed','failed') then raise exception using errcode='22023',message='FA_INVALID_STATUS';end if;
update private.future_atlas_ai_requests r set status=p_status,result_payload=case when p_status='completed' then p_result_payload else null end,error_code=p_error_code,provider=p_provider,duration_ms=p_duration_ms,completed_at=now() where r.id=p_request_id and r.status='processing' and exists(select 1 from private.future_atlas_api_credentials c where c.id=r.credential_id and c.secret_hash=h);get diagnostics n=row_count;return n=1;end$$;

create or replace function public.future_atlas_tenant_details(p_tenant_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
if not exists(select 1 from private.future_atlas_tenant_members where tenant_id=p_tenant_id and user_id=(select auth.uid())) then raise exception using errcode='42501',message='FA_TENANT_FORBIDDEN';end if;
return jsonb_build_object('credentials',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'keyPrefix',key_prefix,'scopes',scopes,'status',status,'lastUsedAt',last_used_at,'expiresAt',expires_at,'createdAt',created_at) order by created_at) from private.future_atlas_api_credentials where tenant_id=p_tenant_id),'[]'::jsonb),'domains',coalesce((select jsonb_agg(jsonb_build_object('id',id,'origin',origin,'verified',verified_at is not null,'verificationToken',case when verified_at is null then verification_token else null end,'createdAt',created_at) order by created_at) from private.future_atlas_tenant_domains where tenant_id=p_tenant_id),'[]'::jsonb),'usage',jsonb_build_object('last24Hours',(select count(*) from private.future_atlas_ai_requests where tenant_id=p_tenant_id and created_at>=now()-interval '24 hours'),'processing',(select count(*) from private.future_atlas_ai_requests where tenant_id=p_tenant_id and status='processing' and created_at>now()-interval '90 seconds'),'completed',(select count(*) from private.future_atlas_ai_requests where tenant_id=p_tenant_id and status='completed' and created_at>=now()-interval '24 hours'),'failed',(select count(*) from private.future_atlas_ai_requests where tenant_id=p_tenant_id and status='failed' and created_at>=now()-interval '24 hours')));end$$;

create or replace function public.future_atlas_revoke_credential(p_credential_id uuid) returns boolean language plpgsql security definer set search_path=''
as $$declare u uuid:=(select auth.uid());n integer;begin update private.future_atlas_api_credentials c set status='revoked',revoked_at=now() where c.id=p_credential_id and exists(select 1 from private.future_atlas_tenant_members m where m.tenant_id=c.tenant_id and m.user_id=u and m.role in('owner','admin'));get diagnostics n=row_count;return n=1;end$$;
create or replace function public.future_atlas_remove_domain(p_domain_id uuid) returns boolean language plpgsql security definer set search_path=''
as $$declare u uuid:=(select auth.uid());n integer;begin delete from private.future_atlas_tenant_domains d where d.id=p_domain_id and exists(select 1 from private.future_atlas_tenant_members m where m.tenant_id=d.tenant_id and m.user_id=u and m.role in('owner','admin'));get diagnostics n=row_count;return n=1;end$$;
create or replace function public.future_atlas_set_tenant_status(p_tenant_id uuid,p_status text) returns boolean language plpgsql security definer set search_path=''
as $$declare u uuid:=(select auth.uid());n integer;begin if p_status not in('active','suspended') then raise exception using errcode='22023',message='FA_INVALID_STATUS';end if;update private.future_atlas_tenants t set status=p_status where t.id=p_tenant_id and exists(select 1 from private.future_atlas_tenant_members m where m.tenant_id=t.id and m.user_id=u and m.role='owner');get diagnostics n=row_count;return n=1;end$$;

revoke all on function public.future_atlas_create_tenant(text,text,text) from public,anon;
revoke all on function public.future_atlas_list_tenants() from public,anon;
revoke all on function public.future_atlas_issue_credential(uuid,text,text[],timestamptz) from public,anon;
revoke all on function public.future_atlas_register_domain(uuid,text) from public,anon;
revoke all on function public.future_atlas_revoke_credential(uuid) from public,anon;
revoke all on function public.future_atlas_remove_domain(uuid) from public,anon;
revoke all on function public.future_atlas_set_tenant_status(uuid,text) from public,anon;
grant execute on function public.future_atlas_create_tenant(text,text,text),public.future_atlas_list_tenants(),public.future_atlas_issue_credential(uuid,text,text[],timestamptz),public.future_atlas_register_domain(uuid,text),public.future_atlas_revoke_credential(uuid),public.future_atlas_remove_domain(uuid),public.future_atlas_set_tenant_status(uuid,text) to authenticated;
revoke all on function public.future_atlas_can_verify_domain(uuid,text,text),public.future_atlas_tenant_details(uuid) from public,anon;
grant execute on function public.future_atlas_can_verify_domain(uuid,text,text),public.future_atlas_tenant_details(uuid) to authenticated;
revoke all on function public.future_atlas_authorize_request(text,uuid,text,text,text,text),public.future_atlas_complete_request(uuid,text,text,jsonb,text,text,integer),public.future_atlas_mark_domain_verified(uuid,text,text) from public,anon,authenticated;
grant execute on function public.future_atlas_authorize_request(text,uuid,text,text,text,text),public.future_atlas_complete_request(uuid,text,text,jsonb,text,text,integer) to anon,authenticated;
grant execute on function public.future_atlas_mark_domain_verified(uuid,text,text) to service_role;
revoke all on function public.future_atlas_authorize_embed(uuid,text) from public,authenticated;
grant execute on function public.future_atlas_authorize_embed(uuid,text) to anon;
