create table if not exists public.future_atlas_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.future_atlas_profiles enable row level security;
revoke all on public.future_atlas_profiles from anon, authenticated;

create table if not exists public.future_atlas_ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null unique,
  mode text not null,
  credit_quarters smallint not null default 4 check (credit_quarters between 1 and 4),
  used_at timestamptz not null default now()
);
alter table public.future_atlas_ai_usage enable row level security;
revoke all on public.future_atlas_ai_usage from anon, authenticated;
create index if not exists future_atlas_ai_usage_user_day_idx on public.future_atlas_ai_usage(user_id, used_at desc);

create table if not exists public.future_atlas_ai_reservations (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  api_key_hash text,
  idempotency_key text not null,
  request_hash text not null,
  mode text not null,
  credit_quarters smallint not null default 4 check (credit_quarters between 0 and 4),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  result_payload jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.future_atlas_ai_reservations enable row level security;
revoke all on public.future_atlas_ai_reservations from anon, authenticated;
create unique index if not exists future_atlas_ai_reservations_user_key_idx on public.future_atlas_ai_reservations(user_id, idempotency_key) where user_id is not null;
create unique index if not exists future_atlas_ai_reservations_key_hash_idx on public.future_atlas_ai_reservations(api_key_hash, idempotency_key) where user_id is null and api_key_hash is not null;
create index if not exists future_atlas_ai_reservations_recent_idx on public.future_atlas_ai_reservations(user_id, created_at desc);

create table if not exists public.future_atlas_api_tokens (
  jti text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_type text not null check (token_type in ('access', 'refresh')),
  token_hash text not null,
  expires_at timestamptz not null,
  version bigint not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.future_atlas_api_tokens enable row level security;
revoke all on public.future_atlas_api_tokens from anon, authenticated;
create index if not exists future_atlas_api_tokens_user_idx on public.future_atlas_api_tokens(user_id, token_type, revoked_at);

create table if not exists public.future_atlas_api_key_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  key_prefix text not null,
  key_hash text not null,
  path text not null,
  ip text,
  accessed_at timestamptz not null default now()
);
alter table public.future_atlas_api_key_access enable row level security;
revoke all on public.future_atlas_api_key_access from anon, authenticated;
create index if not exists future_atlas_api_key_access_user_idx on public.future_atlas_api_key_access(user_id, accessed_at desc);
create index if not exists future_atlas_api_key_access_hash_idx on public.future_atlas_api_key_access(key_hash, accessed_at desc);

create table if not exists public.future_atlas_consent_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  anonymous_id text not null check (length(anonymous_id) = 36),
  necessary_accepted boolean not null default true check (necessary_accepted),
  analytics_accepted boolean not null default false,
  advertising_accepted boolean not null default false,
  consented_at timestamptz not null default now()
);
alter table public.future_atlas_consent_log enable row level security;
revoke all on public.future_atlas_consent_log from anon, authenticated;

create table if not exists public.future_atlas_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  anonymous_id text not null check (length(anonymous_id) = 36),
  event_name text not null check (event_name in ('page_view', 'tool_result', 'guidance_open', 'forum_cta')),
  category text not null check (category in ('necessary', 'additional')),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
alter table public.future_atlas_events enable row level security;
revoke all on public.future_atlas_events from anon, authenticated;

create table if not exists public.future_atlas_history_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  history jsonb not null default '{}'::jsonb,
  consent text,
  updated_at timestamptz not null default now()
);
alter table public.future_atlas_history_backups enable row level security;
revoke all on public.future_atlas_history_backups from anon, authenticated;

create table if not exists public.future_atlas_request_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  auth_type text not null check (auth_type in ('user', 'api_key', 'anonymous')),
  method text not null,
  path text not null,
  status_code smallint not null,
  duration_ms integer,
  request_id uuid,
  origin text,
  ip text,
  created_at timestamptz not null default now()
);
alter table public.future_atlas_request_logs enable row level security;
revoke all on public.future_atlas_request_logs from anon, authenticated;

create table if not exists public.future_atlas_guidance_submissions (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  education_level text not null,
  school text not null default '',
  country text not null default '',
  university text not null default '',
  course text not null default '',
  created_at timestamptz not null default now()
);
alter table public.future_atlas_guidance_submissions enable row level security;
revoke all on public.future_atlas_guidance_submissions from anon, authenticated;

create or replace function public.future_atlas_handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.future_atlas_profiles (user_id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')), '')
  )
  on conflict (user_id) do update set
    email = excluded.email,
    full_name = coalesce(public.future_atlas_profiles.full_name, excluded.full_name),
    updated_at = now();
  return new;
end $$;

revoke all on function public.future_atlas_handle_new_user() from public, anon, authenticated;

drop trigger if exists future_atlas_auth_user_created on auth.users;
create trigger future_atlas_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.future_atlas_handle_new_user();

notify pgrst, 'reload schema';
