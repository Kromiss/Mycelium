-- M8: tile enrichment levels and Bourgeons (GDD §4.4).

-- Enrichment level of each tile (0 on a wild tile).
alter table hex add column level integer not null default 0;

-- The player's Bourgeons waiting to be picked, and when the next one grows.
alter table players add column buds jsonb not null default '[]';
alter table players add column next_bud_at timestamptz;
