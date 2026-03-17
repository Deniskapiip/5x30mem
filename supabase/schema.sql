create extension if not exists "pgcrypto";

create table if not exists public.controllers (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 120),
  description text not null check (char_length(description) between 3 and 600),
  type text not null check (type in ('camera', 'sensor', 'gate', 'other')),
  status text not null check (status in ('online', 'offline', 'maintenance')),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists controllers_created_at_idx on public.controllers (created_at desc);
create index if not exists controllers_type_status_idx on public.controllers (type, status);

alter table public.controllers enable row level security;

create policy "Public read controllers"
  on public.controllers
  for select
  to anon, authenticated
  using (true);

create policy "Public insert controllers"
  on public.controllers
  for insert
  to anon, authenticated
  with check (true);

alter publication supabase_realtime add table public.controllers;
