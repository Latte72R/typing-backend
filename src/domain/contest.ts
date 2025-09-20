/**
 * コンテストに関するドメインロジック。
 */

export type ContestVisibility = 'public' | 'private';
export type LeaderboardVisibility = 'during' | 'after' | 'hidden';
export type ContestStatus = 'scheduled' | 'running' | 'finished';

export interface Contest {
  id: string;
  title: string;
  visibility: ContestVisibility;
  startsAt: string;
  endsAt: string;
  timeLimitSec: number;
  maxAttempts: number;
  allowBackspace: boolean;
  leaderboardVisibility: LeaderboardVisibility;
}

export interface ContestEntry {
  attemptsUsed: number;
}

const STATUS: readonly ContestStatus[] = ['scheduled', 'running', 'finished'];

export function getContestStatus(contest: Contest, now: Date = new Date()): ContestStatus {
  const start = new Date(contest.startsAt);
  const end = new Date(contest.endsAt);
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) {
    throw new Error('startsAt が不正な日付です。');
  }
  if (!(end instanceof Date) || Number.isNaN(end.getTime())) {
    throw new Error('endsAt が不正な日付です。');
  }
  if (now < start) return STATUS[0];
  if (now >= end) return STATUS[2];
  return STATUS[1];
}

export function isLeaderboardVisible(contest: Contest, now: Date = new Date()): boolean {
  const visibility = contest.leaderboardVisibility;
  if (visibility === 'hidden') return false;
  if (visibility === 'during') return true;
  if (visibility === 'after') {
    return getContestStatus(contest, now) === 'finished';
  }
  return false;
}

export type SessionStartValidation = { ok: true } | { ok: false; reason: string };

export function validateSessionStart(contest: Contest, entry: ContestEntry | undefined, now: Date = new Date()): SessionStartValidation {
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

export function requiresJoinCode(contest: Contest): boolean {
  return contest.visibility === 'private';
}

export function remainingAttempts(contest: Contest, entry: ContestEntry | undefined): number {
  if (!entry) return contest.maxAttempts;
  return Math.max(0, contest.maxAttempts - entry.attemptsUsed);
}
