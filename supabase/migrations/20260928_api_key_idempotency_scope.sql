drop index if exists public.future_atlas_ai_reservations_user_key_idx;
drop index if exists public.future_atlas_ai_reservations_key_hash_idx;

create unique index future_atlas_ai_reservations_user_key_idx
  on public.future_atlas_ai_reservations (user_id, idempotency_key)
  where user_id is not null and api_key_hash is null;

create unique index future_atlas_ai_reservations_key_hash_idx
  on public.future_atlas_ai_reservations (api_key_hash, idempotency_key)
  where api_key_hash is not null;
