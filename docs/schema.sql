-- Reselling Scaler – Datenbank einrichten
-- In Supabase: SQL Editor → New query → diesen Inhalt einfügen → Run

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
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Eigene Einstellungen" on public.user_settings;
create policy "Eigene Einstellungen" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
