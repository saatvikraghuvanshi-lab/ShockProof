-- Run this after the minimal meter_readings table you already created.
-- It lets the browser upload to Storage, insert rows, and read the signed-in
-- user's own readings back for the dashboard.

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
