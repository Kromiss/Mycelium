-- M7 step 1: forest chat, private messages, minimal moderation and browser notifications.

-- Every message of a forest: to everybody (forest), to a pact (pact) or to one player (dm).
create table chat_messages (
  id bigserial primary key,
  forest_id uuid not null references forests (id),
  channel text not null check (channel in ('forest', 'pact', 'dm')),
  -- Pact the message was sent to (pacts live in the forest's state, see M7 step 2).
  pact_id text,
  from_id uuid not null references players (id),
  to_id uuid references players (id),
  body text not null,
  sent_at timestamptz not null
);
create index chat_messages_forest_idx on chat_messages (forest_id, id desc);

-- A player hides another player's messages.
create table chat_mutes (
  player_id uuid not null references players (id),
  muted_id uuid not null references players (id),
  created_at timestamptz not null default now(),
  primary key (player_id, muted_id)
);

-- Reported messages, read by the owner for now.
create table chat_reports (
  message_id bigint not null references chat_messages (id),
  reporter_id uuid not null references players (id),
  created_at timestamptz not null default now(),
  primary key (message_id, reporter_id)
);

-- An admin cut the player's chat until then.
alter table players add column chat_silenced_until timestamptz;

-- Browser push subscriptions (Web Push), one per browser.
create table push_subscriptions (
  endpoint text primary key,
  player_id uuid not null references players (id),
  p256dh text not null,
  auth text not null,
  lang text not null,
  kinds jsonb not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_player_idx on push_subscriptions (player_id);

-- Server-wide settings kept across restarts (the Web Push keys when none are configured).
create table server_settings (
  key text primary key,
  value text not null
);
