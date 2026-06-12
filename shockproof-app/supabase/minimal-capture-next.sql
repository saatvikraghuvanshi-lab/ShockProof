-- Run this after creating the meter-captures bucket.
-- It is safe if meter_readings already exists with an older/different shape:
-- first it adds the columns the current app needs, then it adds RLS policies.

alter table public.meter_readings
add column if not exists created_at timestamptz not null default now(),
add column if not exists image_url text,
add column if not exists storage_path text,
add column if not exists status text not null default 'uploaded',
add column if not exists user_id uuid references auth.users(id) on delete set null,
add column if not exists reading_kwh numeric,
add column if not exists confidence numeric,
add column if not exists display_type text,
add column if not exists processed_at timestamptz,
add column if not exists error_message text,
add column if not exists ai_notes text,
add column if not exists current_usage numeric,
add column if not exists projected_units numeric,
add column if not exists next_slab_at numeric,
add column if not exists units_to_next_slab numeric,
add column if not exists estimated_bill numeric,
add column if not exists estimated_delta numeric,
add column if not exists bill_risk text,
add column if not exists advice_json jsonb;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'meter_readings'
      and column_name = 'household_id'
  ) then
    alter table public.meter_readings alter column household_id drop not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'meter_readings'
      and column_name = 'captured_by'
  ) then
    alter table public.meter_readings alter column captured_by drop not null;
  end if;
end $$;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.meter_readings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format(
      'alter table public.meter_readings drop constraint if exists %I',
      constraint_record.conname
    );
  end loop;
end $$;

alter table public.meter_readings
add constraint meter_readings_status_check
check (status in ('draft', 'uploading', 'uploaded', 'processing', 'processed', 'completed', 'failed'));

alter table public.meter_readings
drop constraint if exists meter_readings_confidence_check;

alter table public.meter_readings
add constraint meter_readings_confidence_check
check (confidence is null or (confidence >= 0 and confidence <= 1));

alter table public.meter_readings
drop constraint if exists meter_readings_bill_risk_check;

alter table public.meter_readings
add constraint meter_readings_bill_risk_check
check (bill_risk is null or bill_risk in ('low', 'medium', 'high'));

create table if not exists public.ai_usage_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete cascade,
  reading_id bigint,
  provider text not null default 'gemini',
  model text not null,
  purpose text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  estimated_cost_usd numeric not null default 0
);

create index if not exists ai_usage_events_user_id_idx
on public.ai_usage_events(user_id);

create index if not exists ai_usage_events_created_at_idx
on public.ai_usage_events(created_at);

create index if not exists meter_readings_user_id_idx
on public.meter_readings(user_id);

alter table public.meter_readings enable row level security;
alter table public.ai_usage_events enable row level security;

drop policy if exists "Allow authenticated inserts" on public.meter_readings;
create policy "Users can insert own readings"
on public.meter_readings
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can read own readings" on public.meter_readings;
create policy "Users can read own readings"
on public.meter_readings
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can update own readings" on public.meter_readings;
create policy "Users can update own readings"
on public.meter_readings
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own readings" on public.meter_readings;
create policy "Users can delete own readings"
on public.meter_readings
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can read own AI usage" on public.ai_usage_events;
create policy "Users can read own AI usage"
on public.ai_usage_events
for select
to authenticated
using (user_id = auth.uid());

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

drop policy if exists "Users can delete own meter captures" on storage.objects;
create policy "Users can delete own meter captures"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'meter-captures'
  and (storage.foldername(name))[1] = auth.uid()::text
);
