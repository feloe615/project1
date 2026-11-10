-- Resell Scaler – Datenbank einrichten
-- Supabase → SQL Editor → New query → alles einfügen → Run

-- Artikel (Einkäufe und Verkäufe)
create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  cat         text,
  src         text,
  buy         numeric(12,2) not null default 0,
  buy_date    date,
  plat        text,
  sell        numeric(12,2),
  sell_date   date,
  ship        numeric(12,2) not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists items_user_idx on public.items(user_id);

-- Einstellungen pro Konto (Plattform-Gebühren, Fixkosten, Checkliste)
create table if not exists public.user_settings (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  platforms   jsonb,
  settings    jsonb,
  checks      jsonb,
  updated_at  timestamptz not null default now()
);

-- Jede Person sieht und ändert nur ihre eigenen Daten
alter table public.items enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "Eigene Artikel" on public.items;
create policy "Eigene Artikel" on public.items
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Eigene Einstellungen" on public.user_settings;
create policy "Eigene Einstellungen" on public.user_settings
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Konto löschen aus der App heraus (Pflicht für den App Store).
-- Löscht den Login; Artikel und Einstellungen werden per "on delete cascade" mitgelöscht.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
