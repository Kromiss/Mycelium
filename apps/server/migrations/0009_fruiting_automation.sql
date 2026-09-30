-- M5 step 3: fruiting, Spores and automations (GDD §5, §9).
alter table players add column spores double precision not null default 0;
-- Spore shop levels for the season (a JSON object of levels).
alter table players add column spore_upgrades jsonb not null default '{}';
alter table players add column fruitings integer not null default 0;
-- Automations switched on: {"colonize": terrain | "any" | null, "upgrades": boolean}.
alter table players add column automation jsonb not null default '{}';
