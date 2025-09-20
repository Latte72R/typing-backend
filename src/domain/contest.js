/**
 * コンテストに関するドメインロジック。
 */

/**
 * @typedef {Object} Contest
 * @property {string} id
 * @property {string} title
 * @property {string} visibility
 * @property {string} startsAt ISO8601 文字列
 * @property {string} endsAt ISO8601 文字列
 * @property {number} timeLimitSec
 * @property {number} maxAttempts
 * @property {boolean} allowBackspace
 * @property {string} leaderboardVisibility
 */

const STATUS = /** @type {const} */ (['scheduled', 'running', 'finished']);

/**
 * 現在時刻からコンテスト状態を判定する。
 * @param {Contest} contest
 * @param {Date} now
 * @returns {typeof STATUS[number]}
 */
export function getContestStatus(contest, now = new Date()) {
  const start = new Date(contest.startsAt);
  const end = new Date(contest.endsAt);
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) {
    throw new Error('startsAt が不正な日付です。');
  }
  if (!(end instanceof Date) || Number.isNaN(end.getTime())) {
    throw new Error('endsAt が不正な日付です。');
  }
  if (now < start) return 'scheduled';
  if (now >= end) return 'finished';
  return 'running';
}

/**
 * ランキングが閲覧可能かどうかを判定する。
 *
 * @param {Contest} contest
 * @param {Date} now
 * @returns {boolean}
 */
export function isLeaderboardVisible(contest, now = new Date()) {
  const visibility = contest.leaderboardVisibility;
  if (visibility === 'hidden') return false;
  if (visibility === 'during') return true;
  if (visibility === 'after') {
    return getContestStatus(contest, now) === 'finished';
  }
  return false;
}

/**
 * セッション開始が許可されるか検証する。
 *
 * @param {Contest} contest
 * @param {{attemptsUsed:number}} entry エントリー情報
 * @param {Date} now
 * @returns {{ok:true} | {ok:false, reason:string}}
 */
export function validateSessionStart(contest, entry, now = new Date()) {
  const status = getContestStatus(contest, now);
  if (status === 'scheduled') {
    return { ok: false, reason: 'コンテストはまだ開始されていません。' };
  }
  if (status === 'finished') {
    return { ok: false, reason: 'コンテストは終了しています。' };
  }
  if (!entry) {
    return { ok: false, reason: 'エントリーが必要です。' };
  }
  if (entry.attemptsUsed >= contest.maxAttempts) {
    return { ok: false, reason: '試行回数の上限に達しました。' };
  }
  return { ok: true };
}

/**
 * 参加コードが必要かどうか。
 * @param {Contest} contest
 * @returns {boolean}
 */
export function requiresJoinCode(contest) {
  return contest.visibility === 'private';
}

/**
 * 指定ユーザーの残り試行回数を計算する。
 *
 * @param {Contest} contest
 * @param {{attemptsUsed:number}|undefined} entry
 * @returns {number}
 */
export function remainingAttempts(contest, entry) {
  if (!entry) return contest.maxAttempts;
  return Math.max(0, contest.maxAttempts - entry.attemptsUsed);
}
