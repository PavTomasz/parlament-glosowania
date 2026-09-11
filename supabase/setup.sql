-- Run once in your project's SQL Editor. Safe to run again.
-- No database password or service key is embedded in this file.
begin;

create table if not exists public.parlament_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_type text not null check (account_type in ('private', 'company')),
  subscription_status text not null default 'inactive' check (subscription_status in ('inactive', 'active')),
  paid_until timestamptz,
  created_at timestamptz not null default now(),
  constraint parlament_paid_period check (subscription_status <> 'active' or paid_until is not null)
);

alter table public.parlament_accounts enable row level security;
revoke all on public.parlament_accounts from anon, authenticated;
grant select on public.parlament_accounts to authenticated;
grant insert (user_id, account_type) on public.parlament_accounts to authenticated;
grant all on public.parlament_accounts to service_role;

drop policy if exists parlament_read_own on public.parlament_accounts;
create policy parlament_read_own on public.parlament_accounts
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists parlament_create_own on public.parlament_accounts;
create policy parlament_create_own on public.parlament_accounts
for insert to authenticated with check (
  (select auth.uid()) = user_id
  and account_type in ('private', 'company')
  and subscription_status = 'inactive' and paid_until is null
  and coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false'
);

-- There is deliberately no user UPDATE policy: clients cannot change a
-- company's type to private, activate paid access or extend paid_until.
-- Paid activation belongs to a future verified billing integration.
commit;
