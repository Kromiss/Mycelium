-- M6 step 1: active actions, Cœur capture (GDD §6.2, §6.4).
-- Timed effects on a tile: [{"kind": "assault" | "toxin" | "cut" | "siphon", "by": player id, "until": ms}].
alter table hex add column effects jsonb not null default '[]';
-- When each action can be used again: {"assault": ms, ...}.
alter table players add column cooldowns jsonb not null default '{}';
-- After losing the Cœur, it cannot be taken again until then.
alter table players add column heart_shield_until timestamptz;
