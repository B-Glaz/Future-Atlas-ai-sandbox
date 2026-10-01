-- Sandbox API keys. The plaintext key is never stored.
-- Issue and revoke keys with: npm run sandbox:api-key
create table if not exists public.future_atlas_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  key_hash text not null unique,
  key_prefix text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  permissions text[] not null default array['ai:generate'],
  allowed_origins text[] not null default '{}' check (cardinality(allowed_origins) <= 20)
);

create index if not exists future_atlas_api_keys_user_idx
  on public.future_atlas_api_keys (user_id, created_at desc);

alter table public.future_atlas_api_keys enable row level security;
revoke all on public.future_atlas_api_keys from public, anon, authenticated;
grant select, insert, update on public.future_atlas_api_keys to service_role;
