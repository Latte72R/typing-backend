import type { Contest, ContestEntry } from './contest.js';
import { calculateTypingStats, compareReportedStats, type TypingStats } from './scoring.js';

const BACKSPACE_KEYS = new Set(['Backspace', 'BACKSPACE', 'BackspaceKey', 'KeyBackspace']);
const MAX_KEYSTROKES = 2000;

export interface KeylogEntry {
  t: number;
  k: string;
  ok?: boolean;
}

export interface ReplayResult {
  correct: number;
  mistakes: number;
  completed: boolean;
  durationMs: number;
  issues: string[];
  forbiddenBackspaceCount: number;
  processed: number;
}

export interface IntervalAnalysis {
  mean: number;
  stdev: number;
  cv: number;
  count: number;
}

export interface SessionFinishPayload {
  cpm: number;
  wpm: number;
  accuracy: number;
  score: number;
  errors?: number;
  keylog?: KeylogEntry[];
  clientFlags?: {
    defocus?: number;
    pasteBlocked?: boolean;
    anomalyScore?: number;
  };
}

export interface SessionFinishParams {
  contest: Contest;
  prompt: { typingTarget: string };
  payload: SessionFinishPayload;
  entry: ContestEntry | undefined;
  now?: Date;
}

export interface SessionFinishResult {
  status: 'finished' | 'expired' | 'dq';
  stats: TypingStats;
  issues: string[];
  anomaly: IntervalAnalysis;
  flags: {
    pasteBlocked: boolean;
    defocus: number;
    anomalyScore?: number;
  };
}

export function replayKeylog({ typingTarget, keylog, allowBackspace }: { typingTarget: string; keylog: KeylogEntry[]; allowBackspace: boolean; }): ReplayResult {
  if (typeof typingTarget !== 'string') {
    throw new Error('typingTarget は文字列である必要があります。');
  }
  if (!Array.isArray(keylog)) {
    throw new Error('keylog は配列である必要があります。');
  }
  let pointer = 0;
  let mistakes = 0;
  let forbiddenBackspaceCount = 0;
  let lastTime = 0;
  let firstTime: number | null = null;
  const issues: string[] = [];
  const targetLength = typingTarget.length;
  const processed = keylog.length;
  if (processed > MAX_KEYSTROKES) {
    issues.push('KEY_LIMIT_EXCEEDED');
  }

  for (let i = 0; i < keylog.length; i += 1) {
    const entry = keylog[i];
    if (!entry || typeof entry.t !== 'number' || !Number.isFinite(entry.t)) {
      issues.push('INVALID_TIMESTAMP');
      continue;
    }
    if (entry.t < 0) {
      issues.push('NEGATIVE_TIMESTAMP');
      continue;
    }
    if (firstTime === null) firstTime = entry.t;
    if (entry.t < lastTime) {
      issues.push('TIMESTAMP_NOT_SORTED');
    }
    lastTime = Math.max(lastTime, entry.t);
    const key = String(entry.k ?? '');
    if (BACKSPACE_KEYS.has(key)) {
      if (allowBackspace) {
        pointer = Math.max(0, pointer - 1);
      } else {
        forbiddenBackspaceCount += 1;
        mistakes += 1;
      }
      continue;
    }
    if (pointer >= targetLength) {
      mistakes += 1;
      continue;
    }
    const expected = typingTarget[pointer];
    if (key === expected) {
      pointer += 1;
    } else {
      mistakes += 1;
    }
  }
  const durationMs = keylog.length === 0 ? 0 : Math.max(0, lastTime - (firstTime ?? 0));
  const completed = pointer >= targetLength && targetLength > 0 ? true : pointer >= targetLength;
  const correct = pointer;
  return { correct, mistakes, completed, durationMs, issues, forbiddenBackspaceCount, processed };
}

export function analyseIntervals(keylog: KeylogEntry[]): IntervalAnalysis {
  if (!Array.isArray(keylog) || keylog.length < 2) {
    const count = Math.max(0, keylog ? keylog.length - 1 : 0);
    return { mean: 0, stdev: 0, cv: 0, count };
  }
  const intervals: number[] = [];
  let last = keylog[0].t;
  for (let i = 1; i < keylog.length; i += 1) {
    const current = keylog[i].t;
    if (typeof current !== 'number' || !Number.isFinite(current) || typeof last !== 'number') {
      continue;
    }
    const diff = current - last;
    if (diff >= 0) {
      intervals.push(diff);
    }
    last = current;
  }
  if (intervals.length === 0) {
    return { mean: 0, stdev: 0, cv: 0, count: 0 };
  }
  const mean = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  const variance = intervals.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / intervals.length;
  const stdev = Math.sqrt(variance);
  const cv = mean === 0 ? Infinity : stdev / mean;
  return { mean, stdev, cv, count: intervals.length };
}

export function evaluateSessionFinish({ contest, prompt, payload, entry, now = new Date() }: SessionFinishParams): SessionFinishResult {
  if (!contest || !prompt || !payload) {
    throw new Error('contest, prompt, payload は必須です。');
  }
  void now;
  const additionalIssues: string[] = [];
  if (!entry || typeof entry.attemptsUsed !== 'number') {
    additionalIssues.push('ENTRY_NOT_FOUND');
  }
  const flags = {
    pasteBlocked: payload?.clientFlags?.pasteBlocked ?? false,
    defocus: payload?.clientFlags?.defocus ?? 0,
    anomalyScore: payload?.clientFlags?.anomalyScore
  };
  const { correct, mistakes, completed, durationMs, issues, forbiddenBackspaceCount } = replayKeylog({
    typingTarget: prompt.typingTarget,
    keylog: payload.keylog ?? [],
    allowBackspace: contest.allowBackspace
  });
  const elapsedMs = Math.max(durationMs, 1);
  const stats = calculateTypingStats(correct, mistakes, elapsedMs);
  const comparison = compareReportedStats(stats, {
    cpm: payload.cpm,
    wpm: payload.wpm,
    accuracy: payload.accuracy,
    score: payload.score
  }, {
    cpm: 1.5,
    wpm: 1.5,
    accuracy: 0.05,
    score: 2
  });
  additionalIssues.push(...issues);
  if (typeof payload.errors === 'number' && Math.abs(payload.errors - mistakes) > 1) {
    additionalIssues.push('ERROR_COUNT_MISMATCH');
  }
  if (!comparison.ok) {
    additionalIssues.push('METRIC_MISMATCH');
  }
  if (!completed && prompt.typingTarget.length > 0) {
    additionalIssues.push('PROMPT_NOT_COMPLETED');
  }
  if (forbiddenBackspaceCount > 0) {
    additionalIssues.push('BACKSPACE_FORBIDDEN');
  }

  const timeLimitMs = contest.timeLimitSec * 1000;
  if (durationMs > timeLimitMs + 1000) {
    additionalIssues.push('TIME_LIMIT_EXCEEDED');
  }

  const anomaly = analyseIntervals(payload.keylog ?? []);
  if (anomaly.cv !== 0 && anomaly.cv < 0.1 && anomaly.count > 10) {
    additionalIssues.push('LOW_VARIANCE_TYPING');
  }

  let status: SessionFinishResult['status'] = 'finished';
  if (!completed) {
    status = 'expired';
  }
  const disqualifyingIssues = ['METRIC_MISMATCH', 'KEY_LIMIT_EXCEEDED', 'BACKSPACE_FORBIDDEN'];
  if (additionalIssues.some((issue) => disqualifyingIssues.includes(issue))) {
    status = 'dq';
  }
  return { status, stats, issues: additionalIssues, anomaly, flags };
}
