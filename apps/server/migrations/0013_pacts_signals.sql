-- M7 step 2: pacts of symbiosis, chemical Signals, listening and Ruin relics (GDD §3, §6.3).

-- The forest's pacts (ended ones included, for the alliance leaderboard) and pending invitations.
alter table forests add column pacts jsonb not null default '[]';
alter table forests add column pact_invites jsonb not null default '[]';

-- "Réseau tâché" after a betrayal: until then.
alter table players add column tainted_until timestamptz;
alter table players add column signals double precision not null default 0;
alter table players add column signals_unlocked boolean not null default false;
-- Relics chosen this week, and relics earned but not chosen yet.
alter table players add column relics jsonb not null default '[]';
alter table players add column relic_picks integer not null default 0;
-- Networks the player listens to: {"<player id>": <until, ms since epoch>}.
alter table players add column listens jsonb not null default '{}';
