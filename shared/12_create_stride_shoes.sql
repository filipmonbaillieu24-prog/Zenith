-- ==========================================================================
-- Stride: running shoes
-- ==========================================================================
--
-- Running shoes were the one Stride entity that never left the device. Runs
-- sync to stride_activities, but shoes lived only in localStorage, so mileage
-- didn't follow the user across devices and was lost whenever site data was
-- cleared - while the shoe-mileage tracker is one of the app's headline
-- features.
--
-- RLS mirrors stride_activities: a user can only ever see and write their own
-- rows, enforced at the database rather than relying on the client's filter.

create table if not exists public.stride_shoes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    brand text not null,
    model text not null,
    nickname text,
    total_distance_km numeric(8,2) not null default 0,
    max_distance_km numeric(8,2) not null default 700,
    retired boolean not null default false,
    purchase_date date,
    created_at timestamptz not null default now()
);

create index if not exists idx_stride_shoes_user_id on public.stride_shoes (user_id);

alter table public.stride_shoes enable row level security;

drop policy if exists "Users can manage their own stride shoes" on public.stride_shoes;
create policy "Users can manage their own stride shoes"
on public.stride_shoes for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
