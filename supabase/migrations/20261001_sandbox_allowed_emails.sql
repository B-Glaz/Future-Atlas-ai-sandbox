-- Emails allowed to use the sandbox website. Add a row in the table editor.
-- credits_used is a count only. Spending still comes from future_atlas_sandbox_credits.
create table if not exists public.future_atlas_sandbox_allowed_emails (
  email text primary key check (
    email = lower(email)
    and position('@' in email) > 1
    and char_length(email) <= 254
  ),
  credits_used integer not null default 0 check (credits_used >= 0),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.future_atlas_sandbox_allowed_emails enable row level security;
revoke all on public.future_atlas_sandbox_allowed_emails from public, anon, authenticated;
grant select, insert, update, delete on public.future_atlas_sandbox_allowed_emails to service_role;
