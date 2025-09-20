import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  Contest,
  LeaderboardSession,
  SessionFinishPayload
} from '../src/index.js';
import {
  analyseIntervals,
  buildLeaderboard,
  calculateTypingStats,
  compareReportedStats,
  evaluateSessionFinish,
  extractPersonalRank, 
  formatStats,
  getContestStatus,
  isLeaderboardVisible,
  remainingAttempts,
  replayKeylog,
  requiresJoinCode,
  validateSessionStart
} from '../src/index.js';

test('calculateTypingStats: 正確な計算が行われる', () => {
  const result = calculateTypingStats(120, 30, 60000);
  assert.equal(result.cpm, 120);
  assert.equal(result.wpm, 24);
  assert.equal(result.accuracy, 0.8);
  assert.equal(result.score, Math.floor(120 * (0.8 ** 2) / 2));
});

test('compareReportedStats: 乖離を検知する', () => {
  const expected = calculateTypingStats(100, 0, 60000);
  const match = compareReportedStats(expected, expected);
  assert.ok(match.ok);
  const mismatch = compareReportedStats(expected, { cpm: 50, wpm: 10, accuracy: 0.5, score: 10 });
  assert.ok(!mismatch.ok);
});

test('formatStats: 表示用文字列を生成する', () => {
  const formatted = formatStats(calculateTypingStats(50, 5, 30000));
  assert.equal(formatted.cpm.endsWith('00'), true);
  assert.equal(formatted.accuracy.endsWith('%'), true);
});

test('getContestStatus: 状態遷移を判定する', () => {
  const contest: Contest = {
    id: '1',
    title: '秋の腕試し',
    visibility: 'public',
    startsAt: '2025-10-01T09:00:00+09:00',
    endsAt: '2025-10-07T23:59:59+09:00',
    timeLimitSec: 60,
    maxAttempts: 3,
    allowBackspace: false,
    leaderboardVisibility: 'during'
  };
  const before = getContestStatus(contest, new Date('2025-09-30T10:00:00+09:00'));
  const during = getContestStatus(contest, new Date('2025-10-02T10:00:00+09:00'));
  const after = getContestStatus(contest, new Date('2025-10-08T00:00:00+09:00'));
  assert.equal(before, 'scheduled');
  assert.equal(during, 'running');
  assert.equal(after, 'finished');
});

test('isLeaderboardVisible respects visibility policy', () => {
  const baseContest: Contest = {
    id: '1',
    title: '秋の腕試し',
    visibility: 'public',
    startsAt: '2025-10-01T09:00:00+09:00',
    endsAt: '2025-10-07T23:59:59+09:00',
    timeLimitSec: 60,
    maxAttempts: 3,
    allowBackspace: false,
    leaderboardVisibility: 'during'
  };
  assert.equal(isLeaderboardVisible(baseContest, new Date('2025-10-03T10:00:00+09:00')), true);
  const afterContest: Contest = { ...baseContest, leaderboardVisibility: 'after' };
  assert.equal(isLeaderboardVisible(afterContest, new Date('2025-10-03T10:00:00+09:00')), false);
  assert.equal(isLeaderboardVisible(afterContest, new Date('2025-10-08T10:00:00+09:00')), true);
  const hiddenContest: Contest = { ...baseContest, leaderboardVisibility: 'hidden' };
  assert.equal(isLeaderboardVisible(hiddenContest, new Date('2025-10-08T10:00:00+09:00')), false);
});

test('validateSessionStart enforces attempt limits', () => {
  const contest: Contest = {
    id: '1',
    title: '秋の腕試し',
    visibility: 'public',
    startsAt: '2025-10-01T09:00:00+09:00',
    endsAt: '2025-10-07T23:59:59+09:00',
    timeLimitSec: 60,
    maxAttempts: 3,
    allowBackspace: false,
    leaderboardVisibility: 'during'
  };
  const ok = validateSessionStart(contest, { attemptsUsed: 2 }, new Date('2025-10-02T10:00:00+09:00'));
  assert.ok(ok.ok);
  const ng = validateSessionStart(contest, { attemptsUsed: 3 }, new Date('2025-10-02T10:00:00+09:00'));
  assert.ok(!ng.ok);
});

test('replayKeylog correctly counts mistakes and backspace usage', () => {
  const keylog = [
    { t: 0, k: 'a' },
    { t: 430, k: 'x' },
    { t: 870, k: 'b' },
    { t: 1150, k: 'Backspace' },
    { t: 1450, k: 'b' },
    { t: 1760, k: 'c' }
  ];
  const result = replayKeylog({ typingTarget: 'abc', keylog, allowBackspace: true });
  assert.equal(result.correct, 3);
  assert.equal(result.mistakes, 1);
  assert.equal(result.completed, true);
  assert.equal(result.durationMs, 1760);
});

test('evaluateSessionFinish flags illegal backspace when not allowed', () => {
  const contest: Contest = {
    id: '1',
    title: '本番',
    visibility: 'public',
    startsAt: '2025-10-01T09:00:00+09:00',
    endsAt: '2025-10-07T23:59:59+09:00',
    timeLimitSec: 60,
    maxAttempts: 3,
    allowBackspace: false,
    leaderboardVisibility: 'during'
  };
  const keylog = [
    { t: 0, k: 'a' },
    { t: 300, k: 'Backspace' },
    { t: 600, k: 'a' },
    { t: 900, k: 'b' }
  ];
  const replay = replayKeylog({ typingTarget: 'ab', keylog, allowBackspace: false });
  const stats = calculateTypingStats(replay.correct, replay.mistakes, Math.max(replay.durationMs, 1));
  const payload: SessionFinishPayload = {
    cpm: stats.cpm,
    wpm: stats.wpm,
    accuracy: stats.accuracy,
    score: stats.score,
    errors: replay.mistakes,
    keylog,
    clientFlags: { pasteBlocked: true, defocus: 0 }
  };
  const result = evaluateSessionFinish({ contest, prompt: { typingTarget: 'ab' }, payload, entry: { attemptsUsed: 1 } });
  assert.equal(result.status, 'dq');
  assert.ok(result.issues.includes('BACKSPACE_FORBIDDEN'));
});

test('evaluateSessionFinish accepts valid run', () => {
  const contest: Contest = {
    id: '1',
    title: '練習会',
    visibility: 'public',
    startsAt: '2025-10-01T09:00:00+09:00',
    endsAt: '2025-10-07T23:59:59+09:00',
    timeLimitSec: 60,
    maxAttempts: 5,
    allowBackspace: true,
    leaderboardVisibility: 'during'
  };
  const keylog = [
    { t: 0, k: 'r' },
    { t: 310, k: 'o' },
    { t: 660, k: 'm' },
    { t: 1000, k: 'a' },
    { t: 1500, k: 'j' },
    { t: 2150, k: 'i' }
  ];
  const replay = replayKeylog({ typingTarget: 'romaji', keylog, allowBackspace: true });
  const stats = calculateTypingStats(replay.correct, replay.mistakes, Math.max(replay.durationMs, 1));
  const payload: SessionFinishPayload = {
    cpm: stats.cpm,
    wpm: stats.wpm,
    accuracy: stats.accuracy,
    score: stats.score,
    errors: replay.mistakes,
    keylog,
    clientFlags: { pasteBlocked: true, defocus: 0 }
  };
  const result = evaluateSessionFinish({ contest, prompt: { typingTarget: 'romaji' }, payload, entry: { attemptsUsed: 2 } });
  assert.equal(result.status, 'finished');
  assert.ok(result.issues.length === 0);
  assert.ok(result.anomaly.cv >= 0);
});

test('analyseIntervals detects low variance typing', () => {
  const keylog = Array.from({ length: 12 }, (_, i) => ({ t: i * 100, k: 'a' }));
  const anomaly = analyseIntervals(keylog);
  assert.equal(anomaly.cv, 0);
});

test('buildLeaderboard sorts and assigns ranks', () => {
  const sessions: LeaderboardSession[] = [
    { sessionId: 's1', userId: 'u1', username: 'Alice', score: 500, accuracy: 0.95, cpm: 400, endedAt: '2025-10-01T10:00:00Z' },
    { sessionId: 's2', userId: 'u2', username: 'Bob', score: 520, accuracy: 0.92, cpm: 390, endedAt: '2025-10-01T09:50:00Z' },
    { sessionId: 's3', userId: 'u3', username: 'Carol', score: 500, accuracy: 0.97, cpm: 410, endedAt: '2025-10-01T09:55:00Z' }
  ];
  const { ranked, summary } = buildLeaderboard(sessions);
  assert.equal(ranked[0].sessionId, 's2');
  assert.equal(ranked[1].sessionId, 's3');
  assert.equal(ranked[2].sessionId, 's1');
  assert.equal(ranked[1].rank, 2);
  assert.equal(summary.total, 3);
  const me = extractPersonalRank(ranked, 'u3');
  assert.equal(me?.rank, 2);
});

test('remainingAttempts calculates remaining tries', () => {
  const contest = { maxAttempts: 5 } as Contest;
  const entry = { attemptsUsed: 2 };
  assert.equal(remainingAttempts(contest, entry), 3);
  assert.equal(remainingAttempts(contest, undefined), 5);
});

test('requiresJoinCode returns true for private contests', () => {
  assert.equal(requiresJoinCode({ visibility: 'private' } as Contest), true);
  assert.equal(requiresJoinCode({ visibility: 'public' } as Contest), false);
});
