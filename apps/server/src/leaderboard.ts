import type { Redis } from "ioredis";

/**
 * Global ranking across forests (GDD §8.1). Forest rankings are computed in memory by the forest
 * service; scores are mirrored here so that the global rank does not need every forest loaded,
 * and so that Redis keeps a live leaderboard when it is configured.
 */
export interface ScoreBoard {
  /** `season` is the season's start (Monday 00:00 Paris): each week has its own ranking. */
  publish(season: number, forestId: string, scores: ReadonlyArray<readonly [playerId: string, biomass: number]>): Promise<void>;
  /** 1-based global rank for the season, and the number of ranked players. */
  globalRank(season: number, playerId: string): Promise<{ rank: number; players: number }>;
}

export class MemoryScoreBoard implements ScoreBoard {
  private readonly seasons = new Map<number, { scores: Map<string, number>; sorted: string[] | null }>();

  async publish(season: number, _forestId: string, scores: ReadonlyArray<readonly [string, number]>): Promise<void> {
    let s = this.seasons.get(season);
    if (!s) {
      s = { scores: new Map(), sorted: null };
      this.seasons.set(season, s);
      // Keep the current and previous seasons only.
      for (const k of this.seasons.keys()) if (k < season - 8 * 86_400_000) this.seasons.delete(k);
    }
    for (const [id, biomass] of scores) s.scores.set(id, biomass);
    s.sorted = null;
  }

  async globalRank(season: number, playerId: string): Promise<{ rank: number; players: number }> {
    const s = this.seasons.get(season);
    if (!s) return { rank: 0, players: 0 };
    s.sorted ??= [...s.scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    return { rank: s.sorted.indexOf(playerId) + 1, players: s.sorted.length };
  }
}

/** Redis sorted sets per season: `lb:<season>:global` and `lb:<season>:forest:<id>`, kept two weeks. */
export class RedisScoreBoard implements ScoreBoard {
  constructor(private readonly redis: Redis) {}

  async publish(season: number, forestId: string, scores: ReadonlyArray<readonly [string, number]>): Promise<void> {
    if (scores.length === 0) return;
    const args = scores.flatMap(([id, biomass]) => [biomass, id]);
    const ttl = 14 * 86_400;
    await this.redis
      .multi()
      .zadd(`lb:${season}:global`, ...args)
      .expire(`lb:${season}:global`, ttl)
      .zadd(`lb:${season}:forest:${forestId}`, ...args)
      .expire(`lb:${season}:forest:${forestId}`, ttl)
      .exec();
  }

  async globalRank(season: number, playerId: string): Promise<{ rank: number; players: number }> {
    const key = `lb:${season}:global`;
    const [rank, players] = await Promise.all([this.redis.zrevrank(key, playerId), this.redis.zcard(key)]);
    return { rank: rank === null ? 0 : rank + 1, players };
  }
}
