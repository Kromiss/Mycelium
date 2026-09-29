import { Redis } from "ioredis";
import pg from "pg";
import { createApp } from "./app";
import { APP_VERSION, loadConfig } from "./config";
import { ForestService } from "./forest-service";
import { MemoryScoreBoard, RedisScoreBoard } from "./leaderboard";
import { MemoryStore, PgStore } from "./store";

const config = loadConfig();

const pool = config.databaseUrl ? new pg.Pool({ connectionString: config.databaseUrl, max: 10 }) : undefined;
const redis = config.redisUrl ? new Redis(config.redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2 }) : undefined;

if (!pool) console.warn("[mycelium] DATABASE_URL not set: games are kept in memory and lost on restart");
const game = new ForestService(pool ? new PgStore(pool) : new MemoryStore(), {
  scores: redis ? new RedisScoreBoard(redis) : new MemoryScoreBoard(),
  timeScale: config.timeScale,
  bots: config.bots,
});
if (config.timeScale > 1) console.warn(`[mycelium] TIME_SCALE=${config.timeScale}: game time runs ${config.timeScale}× faster`);

const server = createApp({
  game,
  probes: {
    postgres: pool ? async () => void (await pool.query("select 1")) : undefined,
    redis: redis ? async () => void (await redis.ping()) : undefined,
  },
});

game
  .start()
  .then(() =>
    server.listen(config.port, () => {
      console.log(`[mycelium] server v${APP_VERSION} listening on :${config.port}`);
    }),
  )
  .catch((err: unknown) => {
    console.error("[mycelium] failed to start", err);
    process.exit(1);
  });

async function shutdown(signal: string): Promise<void> {
  console.log(`[mycelium] ${signal} received, shutting down`);
  server.close();
  await game.stop();
  await Promise.allSettled([pool?.end(), redis?.quit()]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
