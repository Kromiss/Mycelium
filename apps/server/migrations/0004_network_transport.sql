-- M2 network & transport: exhaustion, withering, expansion queue, movable Cœur, offline time.

alter table hex add column exhaustion double precision not null default 0;
-- When an owned tile lost its link to the Cœur; it withers after a while.
alter table hex add column disconnected_since timestamptz;

-- Expansion queue: ordered list of {q, r}.
alter table players add column queue jsonb not null default '[]'::jsonb;
alter table players add column heart_moved_at timestamptz;
-- When the player left (no client connected); null while playing.
alter table players add column last_seen_at timestamptz;
