-- M9: reset and the end of wear (decided by the owner on 1 October 2026).
--
-- Everything starts again from zero with the new rules: accounts, sessions, forests, maps, standings,
-- rewards and chat are removed (the owner agreed; on production the deploy that runs this migration is
-- started by the owner). Server settings (browser notification keys) are kept.
truncate table player_rewards, season_results, chat_reports, chat_mutes, chat_messages, push_subscriptions, sessions, hex, players, forests, worlds restart identity cascade; -- allow-destructive

-- Wear is gone from the rules: no more exhaustion on the tiles.
alter table hex drop column exhaustion; -- allow-destructive

-- No strain to unlock any more (both strains are open to everyone): no strain reward either.
alter table players drop column unlocked_strains; -- allow-destructive
alter table player_rewards drop constraint player_rewards_kind_check; -- allow-destructive
alter table player_rewards add constraint player_rewards_kind_check check (kind in ('title', 'color', 'skin'));
