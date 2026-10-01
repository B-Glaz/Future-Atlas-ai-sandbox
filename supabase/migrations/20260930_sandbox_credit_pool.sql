-- One shared balance for the sandbox website. Refill by editing credits_remaining
-- on the single row (id = 1) in the Supabase table editor.
create table if not exists public.future_atlas_sandbox_credits (
  id smallint primary key default 1 check (id = 1),
  credits_remaining integer not null default 5000 check (credits_remaining >= 0),
  updated_at timestamptz not null default now()
);

insert into public.future_atlas_sandbox_credits (id, credits_remaining)
values (1, 5000)
on conflict (id) do nothing;

alter table public.future_atlas_sandbox_credits enable row level security;
revoke all on public.future_atlas_sandbox_credits from public, anon, authenticated;
grant select, update on public.future_atlas_sandbox_credits to service_role;
