import { Redis } from "ioredis";
import pg from "pg";
import { createApp } from "./app";
import { APP_VERSION, loadConfig } from "./config";
import { ForestService } from "./forest-service";
import { MemoryScoreBoard, RedisScoreBoard } from "./leaderboard";
import { createWebPush } from "./push";
import { MemoryStore, PgStore } from "./store";

const config = loadConfig();

const pool = config.databaseUrl ? new pg.Pool({ connectionString: config.databaseUrl, max: 10 }) : undefined;
const redis = config.redisUrl ? new Redis(config.redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2 }) : undefined;

if (!pool) console.warn("[mycelium] DATABASE_URL not set: games are kept in memory and lost on restart");
const store = pool ? new PgStore(pool) : new MemoryStore();
let game: ForestService | undefined;
let server: ReturnType<typeof createApp> | undefined;

async function main(): Promise<void> {
  // Web Push keys come from the environment, or are generated once and kept in the database.
  const push = await createWebPush(store, config.vapid, (msg) => console.warn(`[push] ${msg}`));
  game = new ForestService(store, {
    scores: redis ? new RedisScoreBoard(redis) : new MemoryScoreBoard(),
    timeScale: config.timeScale,
    bots: config.bots,
    push,
    admins: config.admins,
    adminTools: config.adminTools,
  });
  if (config.adminTools) console.warn("[mycelium] admin tools (test forests) are on: local or staging only");
  if (config.timeScale > 1) console.warn(`[mycelium] TIME_SCALE=${config.timeScale}: game time runs ${config.timeScale}× faster`);
  server = createApp({
    game,
    probes: {
      postgres: pool ? async () => void (await pool.query("select 1")) : undefined,
      redis: redis ? async () => void (await redis.ping()) : undefined,
    },
  });
  await game.start();
  server.listen(config.port, () => {
    console.log(`[mycelium] server v${APP_VERSION} listening on :${config.port}`);
  });
}

main().catch((err: unknown) => {
  console.error("[mycelium] failed to start", err);
  process.exit(1);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[mycelium] ${signal} received, shutting down`);
  server?.close();
  await game?.stop();
  await Promise.allSettled([pool?.end(), redis?.quit()]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
