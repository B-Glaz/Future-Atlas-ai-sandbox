create table if not exists public.future_atlas_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  key_hash text not null unique,
  key_prefix text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  permissions text[] not null default array['ai:generate']
);

alter table public.future_atlas_api_keys enable row level security;
revoke all on public.future_atlas_api_keys from public, anon, authenticated;

create index if not exists future_atlas_api_keys_user_idx
  on public.future_atlas_api_keys (user_id, created_at desc);
