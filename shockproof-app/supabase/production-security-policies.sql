-- ShockProof production RLS and storage hardening.
-- Run after minimal-capture-next.sql and after creating the meter-captures bucket.

update storage.buckets
set public = false
where id = 'meter-captures';

alter table public.meter_readings enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.tariff_slabs enable row level security;

drop policy if exists "Allow authenticated inserts" on public.meter_readings;
drop policy if exists "Users can insert own readings" on public.meter_readings;
drop policy if exists "Users can read own readings" on public.meter_readings;
drop policy if exists "Users can update own readings" on public.meter_readings;
drop policy if exists "Users can delete own readings" on public.meter_readings;

create policy "Users can insert own readings"
on public.meter_readings
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can read own readings"
on public.meter_readings
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can update own readings"
on public.meter_readings
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

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

drop policy if exists "Tariff slabs readable by authenticated users" on public.tariff_slabs;
create policy "Tariff slabs readable by authenticated users"
on public.tariff_slabs
for select
to authenticated
using (true);

drop policy if exists "Users can upload own meter captures" on storage.objects;
drop policy if exists "Users can read own meter captures" on storage.objects;
drop policy if exists "Users can update own meter captures" on storage.objects;
drop policy if exists "Users can delete own meter captures" on storage.objects;

create policy "Users can upload own meter captures"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'meter-captures'
  and owner = auth.uid()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can read own meter captures"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'meter-captures'
  and owner = auth.uid()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update own meter captures"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'meter-captures'
  and owner = auth.uid()
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'meter-captures'
  and owner = auth.uid()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete own meter captures"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'meter-captures'
  and owner = auth.uid()
  and (storage.foldername(name))[1] = auth.uid()::text
);
