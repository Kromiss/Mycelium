import type { Redis } from "ioredis";

/**
 * Global ranking across forests (GDD §8.1). Forest rankings are computed in memory by the forest
 * service; scores are mirrored here so that the global rank does not need every forest loaded,
 * and so that Redis keeps a live leaderboard when it is configured.
 */
export interface ScoreBoard {
  publish(forestId: string, scores: ReadonlyArray<readonly [playerId: string, biomass: number]>): Promise<void>;
  /** 1-based global rank, and the number of ranked players. */
  globalRank(playerId: string): Promise<{ rank: number; players: number }>;
}

export class MemoryScoreBoard implements ScoreBoard {
  private readonly scores = new Map<string, number>();
  private sorted: string[] | null = null;

  async publish(_forestId: string, scores: ReadonlyArray<readonly [string, number]>): Promise<void> {
    for (const [id, biomass] of scores) this.scores.set(id, biomass);
    this.sorted = null;
  }

  async globalRank(playerId: string): Promise<{ rank: number; players: number }> {
    this.sorted ??= [...this.scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    return { rank: this.sorted.indexOf(playerId) + 1, players: this.sorted.length };
  }
}

/** Redis sorted sets: `lb:global` and `lb:forest:<id>`, scored by biomass. */
export class RedisScoreBoard implements ScoreBoard {
  constructor(private readonly redis: Redis) {}

  async publish(forestId: string, scores: ReadonlyArray<readonly [string, number]>): Promise<void> {
    if (scores.length === 0) return;
    const args = scores.flatMap(([id, biomass]) => [biomass, id]);
    await this.redis.multi().zadd("lb:global", ...args).zadd(`lb:forest:${forestId}`, ...args).exec();
  }

  async globalRank(playerId: string): Promise<{ rank: number; players: number }> {
    const [rank, players] = await Promise.all([this.redis.zrevrank("lb:global", playerId), this.redis.zcard("lb:global")]);
    return { rank: rank === null ? 0 : rank + 1, players };
  }
}
