-- M7 step 3: secondary leaderboards, leagues and the rewards kept after the wipe (GDD §8).

-- The account's league (0 = Bronze … 4 = Mycélium Primordial) and the cosmetics it shows.
alter table players add column league smallint not null default 0;
alter table players add column title text;
alter table players add column network_color text;
alter table players add column carpophore_skin text;
-- Season counters: tiles taken from other colonies, active play (ms).
alter table players add column conquests integer not null default 0;
alter table players add column active_ms double precision not null default 0;
-- Strains unlocked beyond the starter ones (Moisissure), copied into the season's game.
alter table players add column unlocked_strains jsonb not null default '[]';

-- A forest gathers players of one league as far as possible.
alter table forests add column league smallint not null default 0;

-- What else each colony did in a finished season, and its league before and after.
alter table season_results add column conquests integer not null default 0;
alter table season_results add column boss double precision not null default 0;
alter table season_results add column active_ms double precision not null default 0;
alter table season_results add column fruitings integer not null default 0;
alter table season_results add column league_before smallint not null default 0;
alter table season_results add column league_after smallint not null default 0;

-- Rewards kept after the wipe: titles, network colours, Carpophore skins, strains.
create table player_rewards (
  player_id uuid not null references players (id),
  kind text not null check (kind in ('title', 'color', 'skin', 'strain')),
  reward text not null,
  -- The season that gave it.
  season_start timestamptz not null,
  primary key (player_id, kind, reward)
);
