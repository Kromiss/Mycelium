-- Start of the hyphae growth, so the client can show a progress that does not move backwards
-- when Croissance des hyphes is bought during a growth. Null once colonised (and for growths
-- started before this migration).
alter table hex add column growth_started_at timestamptz;
