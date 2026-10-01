alter table public.future_atlas_api_keys
  add column if not exists allowed_origins text[] not null default '{}';

alter table public.future_atlas_api_keys
  add constraint future_atlas_api_keys_allowed_origins_limit
  check (cardinality(allowed_origins) <= 20) not valid;

alter table public.future_atlas_api_keys
  validate constraint future_atlas_api_keys_allowed_origins_limit;
