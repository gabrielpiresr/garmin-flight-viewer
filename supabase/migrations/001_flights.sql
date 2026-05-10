-- Rode este SQL no Supabase: SQL Editor → New query → Run
-- Ou use: supabase db push (CLI)

create table if not exists public.flights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  source_filename text not null,
  csv_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists flights_user_created_idx on public.flights (user_id, created_at desc);

alter table public.flights enable row level security;

create policy "flights_select_own"
  on public.flights for select
  using (auth.uid() = user_id);

create policy "flights_insert_own"
  on public.flights for insert
  with check (auth.uid() = user_id);

create policy "flights_update_own"
  on public.flights for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "flights_delete_own"
  on public.flights for delete
  using (auth.uid() = user_id);
