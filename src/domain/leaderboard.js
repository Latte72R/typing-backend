/**
 * リーダーボードの順位計算ロジック。
 */

const compareSessions = (a, b) => {
  if (a.score !== b.score) return b.score - a.score;
  if (a.accuracy !== b.accuracy) return b.accuracy - a.accuracy;
  if (a.cpm !== b.cpm) return b.cpm - a.cpm;
  const aTime = new Date(a.endedAt).getTime();
  const bTime = new Date(b.endedAt).getTime();
  return aTime - bTime;
};

/**
 * @param {Array<{sessionId:string,userId:string,username?:string,score:number,accuracy:number,cpm:number,endedAt:string}>} sessions
 * @returns {{ranked:Array<{rank:number,sessionId:string,userId:string,username?:string,score:number,accuracy:number,cpm:number,endedAt:string}>, summary:{top:Array, total:number}}}
 */
export function buildLeaderboard(sessions) {
  const sorted = [...sessions].sort(compareSessions);
  let lastRank = 0;
  let lastComparable = null;
  let index = 0;
  const ranked = sorted.map((session) => {
    index += 1;
    const comparable = [session.score, session.accuracy, session.cpm, new Date(session.endedAt).getTime()];
    if (!lastComparable || comparable.some((value, i) => value !== lastComparable[i])) {
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

/**
 * 自分の順位情報を抽出するヘルパー。
 *
 * @param {ReturnType<typeof buildLeaderboard>['ranked']} ranked
 * @param {string} userId
 */
export function extractPersonalRank(ranked, userId) {
  return ranked.find((item) => item.userId === userId) ?? null;
}
