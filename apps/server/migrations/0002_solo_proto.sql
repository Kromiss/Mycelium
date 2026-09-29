-- M1 solo prototype: guest players, one generated map per player, player resources.

-- A generated hex map. Solo prototype: one world per player; shared forests arrive in M3.
create table worlds (
  id uuid primary key default gen_random_uuid(),
  seed bigint not null,
  radius integer not null,
  created_at timestamptz not null default now()
);

-- Guest identity: the browser keeps a random token, only its SHA-256 is stored.
alter table players add column token_hash text unique;
alter table players add column world_id uuid references worlds (id);
alter table players add column heart_q integer not null default 0;
alter table players add column heart_r integer not null default 0;
alter table players add column nutrients double precision not null default 0;
alter table players add column biomass double precision not null default 0;
alter table players add column upgrades jsonb not null default '{}'::jsonb;
-- Time up to which resources have been accrued.
alter table players add column updated_at timestamptz not null default now();

-- One row per hex of a world (GDD §12).
create table hex (
  world_id uuid not null references worlds (id),
  q integer not null,
  r integer not null,
  terrain text not null,
  owner_id uuid references players (id),
  reserve double precision not null,
  structure text,
  -- End of the hyphae growth while the owner is colonising the tile, null once colonised.
  growth_ends_at timestamptz,
  primary key (world_id, q, r)
);

create index hex_owner_idx on hex (owner_id) where owner_id is not null;
