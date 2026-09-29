-- Initial schema. Migrations are forward-only and numbered NNNN_description.sql.
create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
