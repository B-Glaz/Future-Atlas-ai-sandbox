create table if not exists public.future_atlas_guidance_submissions (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (length(btrim(first_name)) between 1 and 100),
  last_name text not null check (length(btrim(last_name)) between 1 and 100),
  email text not null check (length(email) between 3 and 320),
  phone text not null check (length(btrim(phone)) between 3 and 40),
  education_level text not null check (length(btrim(education_level)) between 1 and 80),
  school text not null default '' check (length(school) <= 200),
  country text not null default '' check (length(country) <= 120),
  university text not null default '' check (length(university) <= 200),
  course text not null default '' check (length(course) <= 160),
  created_at timestamptz not null default now()
);
alter table public.future_atlas_guidance_submissions enable row level security;
revoke all on public.future_atlas_guidance_submissions from anon, authenticated;
create index if not exists future_atlas_guidance_email_idx on public.future_atlas_guidance_submissions(email, created_at desc);

create table if not exists private.future_atlas_otp_rate_limits (
  request_key text primary key,
  request_times timestamptz[] not null default '{}',
  updated_at timestamptz not null default now()
);
revoke all on private.future_atlas_otp_rate_limits from public, anon, authenticated;

create or replace function public.future_atlas_authorize_otp_request(p_key text, p_window_started_at timestamptz, p_max_requests integer)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_times timestamptz[]; v_recent timestamptz[];
begin
  select request_times into v_times from private.future_atlas_otp_rate_limits where request_key = p_key for update;
  select coalesce(array_agg(item order by item), '{}') into v_recent from unnest(coalesce(v_times, '{}')) item where item >= p_window_started_at;
  if coalesce(array_length(v_recent, 1), 0) >= p_max_requests then return false; end if;
  v_recent := array_append(v_recent, now());
  insert into private.future_atlas_otp_rate_limits(request_key, request_times) values (p_key, v_recent)
  on conflict(request_key) do update set request_times=excluded.request_times, updated_at=now();
  return true;
end $$;
revoke all on function public.future_atlas_authorize_otp_request(text, timestamptz, integer) from public, anon, authenticated;
