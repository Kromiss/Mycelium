-- M3 multiplayer: accounts with passwords, sessions, shared forests, border captures.

-- Pseudo + password (scrypt). Null for guest accounts created in M1–M2, which are asked to set one.
alter table players add column password_hash text;
-- Test robots (BOTS=n in local development).
alter table players add column is_bot boolean not null default false;

-- One row per signed-in browser; the browser keeps the token, only its SHA-256 is stored.
create table sessions (
  token_hash text primary key,
  player_id uuid not null references players (id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
create index sessions_player_idx on sessions (player_id);

-- 'solo' maps of M1–M2, or 'forest' maps shared by up to `capacity` players (GDD §2.1, §2.5).
alter table worlds add column layout text not null default 'solo';
alter table worlds add column capacity integer not null default 1;

create table forests (
  id uuid primary key default gen_random_uuid(),
  number serial unique,
  world_id uuid not null unique references worlds (id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table players add column forest_id uuid references forests (id);
alter table players add column spawn_q integer;
alter table players add column spawn_r integer;
alter table players add column joined_at timestamptz;
alter table players add column trophies integer not null default 0;
create index players_forest_idx on players (forest_id) where forest_id is not null;

-- A neighbour taking the tile over by pressure (GDD §6.1).
alter table hex add column capture_by uuid references players (id);
alter table hex add column capture_progress double precision;
