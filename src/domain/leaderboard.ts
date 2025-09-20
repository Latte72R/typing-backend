/**
 * リーダーボードの順位計算ロジック。
 */

export interface LeaderboardSession {
  sessionId: string;
  userId: string;
  username?: string;
  score: number;
  accuracy: number;
  cpm: number;
  endedAt: string;
}

export interface RankedSession extends LeaderboardSession {
  rank: number;
}

export interface LeaderboardSummary {
  top: RankedSession[];
  total: number;
}

export interface LeaderboardResult {
  ranked: RankedSession[];
  summary: LeaderboardSummary;
}

const compareSessions = (a: LeaderboardSession, b: LeaderboardSession): number => {
  if (a.score !== b.score) return b.score - a.score;
  if (a.accuracy !== b.accuracy) return b.accuracy - a.accuracy;
  if (a.cpm !== b.cpm) return b.cpm - a.cpm;
  const aTime = new Date(a.endedAt).getTime();
  const bTime = new Date(b.endedAt).getTime();
  return aTime - bTime;
};

export function buildLeaderboard(sessions: LeaderboardSession[]): LeaderboardResult {
  const sorted = [...sessions].sort(compareSessions);
  let lastRank = 0;
  let lastComparable: number[] | null = null;
  let index = 0;
  const ranked: RankedSession[] = sorted.map((session) => {
    index += 1;
    const comparable = [session.score, session.accuracy, session.cpm, new Date(session.endedAt).getTime()];
    const previous = lastComparable;
    const matchesLast = previous !== null && comparable.every((value, i) => value === previous[i]);
    if (!matchesLast) {
      lastRank = index;
      lastComparable = comparable;
    }
    return { ...session, rank: lastRank };
  });
  return {
    ranked,
    summary: {
      top: ranked.slice(0, 10),
      total: sessions.length
    }
  };
}

export function extractPersonalRank(ranked: RankedSession[], userId: string): RankedSession | null {
  return ranked.find((item) => item.userId === userId) ?? null;
}
