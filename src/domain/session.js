import { calculateTypingStats, compareReportedStats } from './scoring.js';

const BACKSPACE_KEYS = new Set(['Backspace', 'BACKSPACE', 'BackspaceKey', 'KeyBackspace']);
const MAX_KEYSTROKES = 2000;

/**
 * @typedef {Object} KeylogEntry
 * @property {number} t セッション開始からの相対ミリ秒
 * @property {string} k 押下キー
 */

/**
 * キーログから正タイプ数・ミス数・完了状況を復元する。
 *
 * @param {{typingTarget:string,keylog:KeylogEntry[],allowBackspace:boolean}} params
 * @returns {{correct:number,mistakes:number,completed:boolean,durationMs:number,issues:string[],forbiddenBackspaceCount:number,processed:number}}
 */
export function replayKeylog({ typingTarget, keylog, allowBackspace }) {
  if (typeof typingTarget !== 'string') {
    throw new Error('typingTarget は文字列である必要があります。');
  }
  if (!Array.isArray(keylog)) {
    throw new Error('keylog は配列である必要があります。');
  }
  let pointer = 0; // 正しく確定した文字数
  let mistakes = 0;
  let forbiddenBackspaceCount = 0;
  let lastTime = 0;
  let firstTime = null;
  const issues = [];
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

/**
 * キー間隔の統計値を計算する。
 * @param {KeylogEntry[]} keylog
 * @returns {{mean:number,stdev:number,cv:number,count:number}}
 */
export function analyseIntervals(keylog) {
  if (!Array.isArray(keylog) || keylog.length < 2) {
    return { mean: 0, stdev: 0, cv: 0, count: Math.max(0, keylog ? keylog.length - 1 : 0) };
  }
  const intervals = [];
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

/**
 * セッション完了リクエストを検証・再計算する。
 *
 * @param {Object} params
 * @param {Object} params.contest
 * @param {Object} params.prompt
 * @param {Object} params.payload クライアント申告値
 * @param {{attemptsUsed:number}} params.entry
 * @param {Date} [params.now]
 * @returns {{status:'finished'|'expired'|'dq', stats:ReturnType<typeof calculateTypingStats>, issues:string[], anomaly:{mean:number,stdev:number,cv:number,count:number},flags:Object}}
 */
export function evaluateSessionFinish({ contest, prompt, payload, entry, now = new Date() }) {
  if (!contest || !prompt || !payload) {
    throw new Error('contest, prompt, payload は必須です。');
  }
  const additionalIssues = [];
  if (!entry || typeof entry.attemptsUsed !== 'number') {
    additionalIssues.push('ENTRY_NOT_FOUND');
  }
  const flags = {
    pasteBlocked: payload?.clientFlags?.pasteBlocked ?? false,
    defocus: payload?.clientFlags?.defocus ?? 0
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
  if (payload.errors !== undefined && Math.abs(payload.errors - mistakes) > 1) {
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
  if (durationMs > timeLimitMs + 1000) { // 許容1秒の通信誤差
    additionalIssues.push('TIME_LIMIT_EXCEEDED');
  }

  const anomaly = analyseIntervals(payload.keylog ?? []);
  if (anomaly.cv !== 0 && anomaly.cv < 0.1 && anomaly.count > 10) {
    additionalIssues.push('LOW_VARIANCE_TYPING');
  }

  let status = 'finished';
  if (!completed) {
    status = 'expired';
  }
  const disqualifyingIssues = ['METRIC_MISMATCH', 'KEY_LIMIT_EXCEEDED', 'BACKSPACE_FORBIDDEN'];
  if (additionalIssues.some((issue) => disqualifyingIssues.includes(issue))) {
    status = 'dq';
  }
  return { status, stats, issues: additionalIssues, anomaly, flags };
}
