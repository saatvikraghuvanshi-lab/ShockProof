-- Run this after creating the meter-captures bucket.
-- It is safe if meter_readings already exists with an older/different shape:
-- first it adds the columns the current app needs, then it adds RLS policies.

alter table public.meter_readings
add column if not exists image_url text,
add column if not exists storage_path text,
add column if not exists status text not null default 'uploaded',
add column if not exists user_id uuid references auth.users(id) on delete set null;

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

alter table public.meter_readings enable row level security;

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
