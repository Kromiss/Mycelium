-- M5 step 2: mutations and strains of the season (GDD §4.2, §4.3).
-- Strain chosen before the first tile of the season, null until then.
alter table players add column strain text;
-- Mutations taken this season, in order (a JSON array of ids).
alter table players add column mutations jsonb not null default '[]';
