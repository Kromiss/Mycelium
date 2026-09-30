-- M4 seasons: forests belong to a week, are wiped on Monday 00:00 Paris, and their standings are kept.

-- Monday 00:00 (Europe/Paris) of the week the forest belongs to.
alter table forests add column season_start timestamptz;
update forests
  set season_start = (date_trunc('week', created_at at time zone 'Europe/Paris') at time zone 'Europe/Paris')
  where season_start is null;
alter table forests alter column season_start set not null;
-- Set when the season is over: the forest is no longer played, only kept for the history.
alter table forests add column ended_at timestamptz;
create index forests_active_idx on forests (season_start) where ended_at is null;

-- Monday production bonus earned by the previous season's rank (GDD §8.2).
alter table players add column monday_bonus double precision not null default 0;

-- Final standings of each finished forest (GDD §8.2 "Historique de saison").
create table season_results (
  season_start timestamptz not null,
  player_id uuid not null references players (id),
  forest_id uuid not null references forests (id),
  rank integer not null,
  players integer not null,
  biomass double precision not null,
  trophies integer not null,
  tiles integer not null,
  primary key (season_start, player_id)
);
create index season_results_player_idx on season_results (player_id, season_start desc);
