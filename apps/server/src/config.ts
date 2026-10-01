declare const __APP_VERSION__: string | undefined;

/** Version injected at build time from package.json; "dev" when running from source. */
export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

export interface Config {
  port: number;
  databaseUrl: string | undefined;
  redisUrl: string | undefined;
  /** Local testing only: game time runs TIME_SCALE times faster. Refused in production. */
  timeScale: number;
  /** Local testing only: BOTS robots join the first forest. Refused in production. */
  bots: number;
  /** ADMIN_NAMES: comma-separated account names that may cut other players' chat (and run test forests). */
  admins: string[];
  /**
   * M9 hidden admin page (test forests): on in local development and on staging (DEPLOY_ENV=staging),
   * always off in production, whatever ADMIN_TOOLS says.
   */
  adminTools: boolean;
  /** Web Push keys; generated and kept in the database when not set. */
  vapid: { publicKey?: string; privateKey?: string; subject?: string };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid PORT: ${env.PORT}`);
  const timeScale = Number(env.TIME_SCALE ?? 1);
  const bots = Number(env.BOTS ?? 0);
  if (!(timeScale >= 1 && timeScale <= 3600)) throw new Error(`Invalid TIME_SCALE: ${env.TIME_SCALE}`);
  if (!Number.isInteger(bots) || bots < 0 || bots > 100) throw new Error(`Invalid BOTS: ${env.BOTS}`);
  if (env.NODE_ENV === "production" && (timeScale !== 1 || bots !== 0)) {
    throw new Error("TIME_SCALE and BOTS are for local testing only");
  }
  const production = env.NODE_ENV === "production" && env.DEPLOY_ENV !== "staging";
  const adminTools = !production && env.ADMIN_TOOLS !== "0";
  return {
    adminTools,
    port,
    databaseUrl: env.DATABASE_URL || undefined,
    redisUrl: env.REDIS_URL || undefined,
    timeScale,
    bots,
    admins: (env.ADMIN_NAMES ?? "")
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n.length > 0),
    vapid: {
      publicKey: env.VAPID_PUBLIC_KEY || undefined,
      privateKey: env.VAPID_PRIVATE_KEY || undefined,
      subject: env.VAPID_SUBJECT || undefined,
    },
  };
}
