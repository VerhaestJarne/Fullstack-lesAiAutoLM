-- WakkerWacht – Supabase schema
-- Plak dit in Supabase → SQL Editor → Run.
-- Er worden enkel getallen + een naam opgeslagen, nooit beelden.

create table if not exists public.sessions (
  id                bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  player            text    not null check (char_length(player) between 1 and 30),
  points            integer not null check (points between 0 and 100000),
  focus_sec         integer not null check (focus_sec >= 0),
  duration_sec      integer not null check (duration_sec >= 0),
  alarms            integer not null default 0,
  challenges_passed integer not null default 0,
  challenges_failed integer not null default 0,
  model_id          text    not null,
  threshold         real    not null,
  timeline          text    not null default '' check (char_length(timeline) <= 20000), -- 1 teken/seconde: o/d/u/g
  events            jsonb   not null default '[]'::jsonb                                 -- [{t, type, v?}]
);

-- Bestond de tabel al (oudere versie)? Dan worden de nieuwe kolommen toegevoegd:
alter table public.sessions add column if not exists timeline text  not null default '';
alter table public.sessions add column if not exists events   jsonb not null default '[]'::jsonb;

alter table public.sessions enable row level security;

-- Data API-toegang voor de app (nodig als "Grant API access to new tables
-- automatically" uit staat). RLS-policies hieronder beperken wat mag.
grant usage on schema public to anon;
grant select, insert on public.sessions to anon;

-- Iedereen (anon key) mag sessies toevoegen en lezen, maar niet wijzigen/verwijderen.
drop policy if exists "anon insert" on public.sessions;
create policy "anon insert" on public.sessions for insert to anon with check (true);

drop policy if exists "anon read" on public.sessions;
create policy "anon read" on public.sessions for select to anon using (true);

-- Scorebord (totaal per speler)
create or replace view public.leaderboard
with (security_invoker = true) as
select player,
       sum(points)::int    as total_points,
       count(*)::int       as sessions,
       sum(focus_sec)::int as total_focus_sec
from public.sessions
group by player
order by total_points desc;

grant select on public.leaderboard to anon;
