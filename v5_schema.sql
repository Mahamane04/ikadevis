-- =============================================================
-- MicroOffice CostCalc V5.1 — Schéma Supabase Sécurisé
-- À coller dans : Supabase Dashboard → SQL Editor → New Query
-- =============================================================

-- 1. Table principale : une ligne par utilisateur
create table if not exists public.user_data (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid references auth.users(id) on delete cascade not null unique,
    org_name       text not null default 'Mon Organisation',
    company_info   jsonb,
    materials      jsonb default '[]'::jsonb,
    labor          jsonb default '[]'::jsonb,
    solutions      jsonb default '[]'::jsonb,
    recipes        jsonb default '[]'::jsonb,
    saved_quotes   jsonb default '[]'::jsonb,
    next_quote_seq integer default 1,
    schema_version integer default 9,
    created_at     timestamptz default now(),
    updated_at     timestamptz default now()
);

-- 2. Row Level Security — chaque utilisateur ne voit QUE ses données
alter table public.user_data enable row level security;

-- Politiques RLS avec validation stricte auth.uid()
drop policy if exists "user_can_select_own_data" on public.user_data;
create policy "user_can_select_own_data"
    on public.user_data for select
    to authenticated
    using (user_id = auth.uid());

drop policy if exists "user_can_insert_own_data" on public.user_data;
create policy "user_can_insert_own_data"
    on public.user_data for insert
    to authenticated
    with check (user_id = auth.uid());

drop policy if exists "user_can_update_own_data" on public.user_data;
create policy "user_can_update_own_data"
    on public.user_data for update
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

drop policy if exists "user_can_delete_own_data" on public.user_data;
create policy "user_can_delete_own_data"
    on public.user_data for delete
    to authenticated
    using (user_id = auth.uid());

-- 3. Trigger updated_at automatique
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_user_data_updated_at on public.user_data;
create trigger trg_user_data_updated_at
    before update on public.user_data
    for each row execute function public.set_updated_at();

-- 4. Privilèges stricts (Moindre privilège)
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.user_data to authenticated;
revoke all on schema public from anon;
revoke all on public.user_data from anon;

-- Verification propre sans erreur PostgreSQL
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'user_data';
