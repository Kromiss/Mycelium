-- M6 step 2: random events and the world boss of each forest's season (GDD §7).
alter table forests add column events jsonb not null default '[]';
