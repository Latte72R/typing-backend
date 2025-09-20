/**
 * タイピング計測の数値を計算する純粋関数群。
 * e-typing 相当の初期仕様（CPM, WPM, Accuracy, Score）をTypeScriptで実装する。
 */

export interface TypingStats {
  cpm: number;
  wpm: number;
  accuracy: number;
  score: number;
  correct: number;
  mistakes: number;
  elapsedMs: number;
}

export interface ReportedStats {
  cpm: number;
  wpm: number;
  accuracy: number;
  score: number;
}

export interface StatTolerance {
  cpm?: number;
  wpm?: number;
  accuracy?: number;
  score?: number;
}

export interface ComparisonResult {
  ok: boolean;
  deltas: Record<string, number>;
}

export interface FormattedStats {
  cpm: string;
  wpm: string;
  accuracy: string;
  score: string;
}

export function calculateTypingStats(correct: number, mistakes: number, elapsedMs: number): TypingStats {
  if (correct < 0 || mistakes < 0) {
    throw new Error('正タイプ数とミスタイプ数は0以上である必要があります。');
  }
  if (elapsedMs <= 0) {
    return {
      cpm: 0,
      wpm: 0,
      accuracy: mistakes === 0 ? 1 : 0,
      score: 0,
      correct,
      mistakes,
      elapsedMs
    };
  }
  const elapsedMinutes = elapsedMs / 60000;
  const total = correct + mistakes;
  const accuracy = total === 0 ? 1 : correct / total;
  const cpm = correct / elapsedMinutes;
  const wpm = cpm / 5;
  const score = Math.floor(cpm * (accuracy ** 2) / 2);
  return { cpm, wpm, accuracy, score, correct, mistakes, elapsedMs };
}

export function compareReportedStats(expected: TypingStats, reported: ReportedStats, tolerance: StatTolerance = {}): ComparisonResult {
  const delta: Record<string, number> = {};
  let ok = true;
  const keys: Array<keyof ReportedStats> = ['cpm', 'wpm', 'accuracy', 'score'];
  for (const key of keys) {
    const expectedValue = expected[key];
    const reportedValue = reported?.[key];
    if (typeof reportedValue !== 'number' || Number.isNaN(reportedValue)) {
      ok = false;
      delta[key] = Number.POSITIVE_INFINITY;
      continue;
    }
    const diff = Math.abs(expectedValue - reportedValue);
    delta[key] = diff;
    const tol = tolerance[key] ?? (key === 'accuracy' ? 0.02 : key === 'score' ? 1 : 1);
    if (diff > tol) {
      ok = false;
    }
  }
  return { ok, deltas: delta };
}

export function formatStats(stats: TypingStats): FormattedStats {
  return {
    cpm: stats.cpm.toFixed(2),
    wpm: stats.wpm.toFixed(2),
    accuracy: `${(stats.accuracy * 100).toFixed(2)}%`,
    score: stats.score.toString()
  };
}
