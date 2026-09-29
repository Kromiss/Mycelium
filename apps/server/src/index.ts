import { Redis } from "ioredis";
import pg from "pg";
import { createApp } from "./app";
import { APP_VERSION, loadConfig } from "./config";
import { GameService } from "./game-service";
import { MemoryStore, PgStore } from "./store";

const config = loadConfig();

const pool = config.databaseUrl ? new pg.Pool({ connectionString: config.databaseUrl, max: 10 }) : undefined;
const redis = config.redisUrl ? new Redis(config.redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2 }) : undefined;

if (!pool) console.warn("[mycelium] DATABASE_URL not set: games are kept in memory and lost on restart");
const game = new GameService(pool ? new PgStore(pool) : new MemoryStore());
game.start();

const server = createApp({
  game,
  probes: {
    postgres: pool ? async () => void (await pool.query("select 1")) : undefined,
    redis: redis ? async () => void (await redis.ping()) : undefined,
  },
});

server.listen(config.port, () => {
  console.log(`[mycelium] server v${APP_VERSION} listening on :${config.port}`);
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
