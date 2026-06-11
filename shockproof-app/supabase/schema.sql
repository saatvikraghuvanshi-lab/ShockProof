-- ShockProof Supabase setup
-- Run this in the Supabase SQL editor after creating your project.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  preferred_language text default 'English',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  household_name text,
  state text not null,
  discom text not null,
  billing_cycle_day int check (billing_cycle_day between 1 and 31),
  consumer_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meter_readings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  captured_by uuid not null references auth.users(id) on delete cascade,
  file_path text,
  file_type text check (file_type in ('image', 'video')),
  reading_kwh numeric,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  display_type text,
  status text not null default 'draft' check (status in ('draft', 'uploading', 'uploaded', 'processing', 'processed', 'failed')),
  captured_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text,
  ai_notes text
);

create table if not exists public.tariff_slabs (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  discom text not null,
  consumer_category text not null default 'domestic',
  slab_start numeric not null,
  slab_end numeric,
  rate numeric not null,
  fixed_charge numeric default 0,
  effective_from date not null,
  effective_to date,
  source_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.reading_projections (
  id uuid primary key default gen_random_uuid(),
  reading_id uuid not null references public.meter_readings(id) on delete cascade,
  current_usage numeric,
  projected_units numeric,
  next_slab_at numeric,
  units_to_next_slab numeric,
  estimated_bill numeric,
  estimated_delta numeric,
  bill_risk text check (bill_risk is null or bill_risk in ('low', 'medium', 'high')),
  advice_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists households_owner_id_idx on public.households(owner_id);
create index if not exists meter_readings_household_id_idx on public.meter_readings(household_id);
create index if not exists meter_readings_captured_by_idx on public.meter_readings(captured_by);
create index if not exists tariff_slabs_lookup_idx on public.tariff_slabs(state, discom, consumer_category, effective_from);
create index if not exists reading_projections_reading_id_idx on public.reading_projections(reading_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_households_updated_at on public.households;
create trigger set_households_updated_at
before update on public.households
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public)
values ('meter-captures', 'meter-captures', false)
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.meter_readings enable row level security;
alter table public.tariff_slabs enable row level security;
alter table public.reading_projections enable row level security;

drop policy if exists "Profiles are user-owned" on public.profiles;
create policy "Profiles are user-owned"
on public.profiles
for all
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Households are owner-owned" on public.households;
create policy "Households are owner-owned"
on public.households
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Readings visible through owned households" on public.meter_readings;
create policy "Readings visible through owned households"
on public.meter_readings
for select
to authenticated
using (
  exists (
    select 1 from public.households
    where households.id = meter_readings.household_id
      and households.owner_id = auth.uid()
  )
);

drop policy if exists "Readings insert through owned households" on public.meter_readings;
create policy "Readings insert through owned households"
on public.meter_readings
for insert
to authenticated
with check (
  captured_by = auth.uid()
  and exists (
    select 1 from public.households
    where households.id = meter_readings.household_id
      and households.owner_id = auth.uid()
  )
);

drop policy if exists "Readings update through owned households" on public.meter_readings;
create policy "Readings update through owned households"
on public.meter_readings
for update
to authenticated
using (
  exists (
    select 1 from public.households
    where households.id = meter_readings.household_id
      and households.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.households
    where households.id = meter_readings.household_id
      and households.owner_id = auth.uid()
  )
);

drop policy if exists "Tariff slabs readable by authenticated users" on public.tariff_slabs;
create policy "Tariff slabs readable by authenticated users"
on public.tariff_slabs
for select
to authenticated
using (true);

drop policy if exists "Projections readable through owned readings" on public.reading_projections;
create policy "Projections readable through owned readings"
on public.reading_projections
for select
to authenticated
using (
  exists (
    select 1
    from public.meter_readings mr
    join public.households h on h.id = mr.household_id
    where mr.id = reading_projections.reading_id
      and h.owner_id = auth.uid()
  )
);

drop policy if exists "Users can upload own meter captures" on storage.objects;
create policy "Users can upload own meter captures"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'meter-captures'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can read own meter captures" on storage.objects;
create policy "Users can read own meter captures"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'meter-captures'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own meter captures" on storage.objects;
create policy "Users can update own meter captures"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'meter-captures'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'meter-captures'
  and (storage.foldername(name))[1] = auth.uid()::text
);
