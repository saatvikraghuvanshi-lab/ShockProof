-- ShockProof verified tariff seed: Rajasthan domestic DISCOMs.
-- Source:
-- RERC Tariff for Supply of Electricity 2025, LT-I Domestic, General Domestic.
-- Public source page: https://rerc.rajasthan.gov.in/rerc-user-files/tariff-orders
-- Public tariff summary:
-- https://energy.economictimes.indiatimes.com/news/power/rajasthan-announces-revised-power-tariff-modest-relief-for-small-consumers/124305880
-- Reference PDF mirror used during build verification:
-- https://cescrajasthan.co.in/kedl/pages/event/uploads/Tariff-2025%202.pdf
--
-- Notes:
-- - Rates are stored in INR/kWh.
-- - Fixed charge is bracket-level per connection per month for General Domestic:
--   up to 150 units: INR 150, up to 300: INR 300, up to 500: INR 500, above 500: INR 800.
-- - Rajasthan JVVNL, AVVNL, and JdVVNL use the same LT-I domestic tariff structure.
-- - This app stores only the energy slab and bracket fixed charge. It does not yet model
--   taxes, duties, fuel surcharge, subsidies, arrears, or special consumer categories.

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

delete from public.tariff_slabs
where state = 'Rajasthan'
  and discom in ('jvvnl', 'avvnl', 'jdvvnl')
  and consumer_category = 'domestic'
  and effective_from = '2025-10-03'::date;

with slabs(discom, slab_start, slab_end, rate, fixed_charge) as (
  values
    ('jvvnl', 0, 50, 4.75, 150),
    ('jvvnl', 50, 150, 6.00, 150),
    ('jvvnl', 150, 300, 6.95, 300),
    ('jvvnl', 300, 500, 7.00, 500),
    ('jvvnl', 500, null, 7.50, 800),
    ('avvnl', 0, 50, 4.75, 150),
    ('avvnl', 50, 150, 6.00, 150),
    ('avvnl', 150, 300, 6.95, 300),
    ('avvnl', 300, 500, 7.00, 500),
    ('avvnl', 500, null, 7.50, 800),
    ('jdvvnl', 0, 50, 4.75, 150),
    ('jdvvnl', 50, 150, 6.00, 150),
    ('jdvvnl', 150, 300, 6.95, 300),
    ('jdvvnl', 300, 500, 7.00, 500),
    ('jdvvnl', 500, null, 7.50, 800)
)
insert into public.tariff_slabs (
  state,
  discom,
  consumer_category,
  slab_start,
  slab_end,
  rate,
  fixed_charge,
  effective_from,
  source_url
)
select
  'Rajasthan',
  discom,
  'domestic',
  slab_start,
  slab_end,
  rate,
  fixed_charge,
  '2025-10-03'::date,
  'https://rerc.rajasthan.gov.in/rerc-user-files/tariff-orders'
from slabs
;
