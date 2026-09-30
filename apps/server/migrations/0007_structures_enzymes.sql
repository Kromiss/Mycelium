-- M5 step 1: structures (hex.structure already exists since 0002) and Enzymes (GDD §3, §4.1).
alter table players add column enzymes double precision not null default 0;
-- Enzymes appear from the 15th tile or from Tuesday, and stay.
alter table players add column enzymes_unlocked boolean not null default false;
