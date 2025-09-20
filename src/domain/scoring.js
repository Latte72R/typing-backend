/**
 * タイピング計測の数値を計算する純粋関数群。
 * ここでは e-typing 互換の初期仕様（CPM, WPM, Accuracy, Score）を実装する。
 */

/**
 * @typedef {Object} TypingStats
 * @property {number} cpm 1分あたりの正タイプ数
 * @property {number} wpm 1分あたりの単語数
 * @property {number} accuracy 正確率（0〜1）
 * @property {number} score スコア（整数）
 * @property {number} correct 正タイプ数
 * @property {number} mistakes ミスタイプ数
 * @property {number} elapsedMs 経過ミリ秒
 */

/**
 * 正タイプ・ミスタイプ・経過時間からスコア指標を算出する。
 * @param {number} correct 正タイプ数
 * @param {number} mistakes ミスタイプ数
 * @param {number} elapsedMs 経過ミリ秒
 * @returns {TypingStats}
 */
export function calculateTypingStats(correct, mistakes, elapsedMs) {
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

/**
 * クライアントの申告値とサーバ計算値の乖離を評価する。
 * 乖離が閾値を超える場合は不正またはバグの可能性がある。
 *
 * @param {TypingStats} expected サーバが再計算した値
 * @param {{cpm:number,wpm:number,accuracy:number,score:number}} reported クライアント申告値
 * @param {{cpm?:number,wpm?:number,accuracy?:number,score?:number}} [tolerance]
 * @returns {{ok:boolean, deltas:Record<string, number>}}
 */
export function compareReportedStats(expected, reported, tolerance = {}) {
  const delta = {};
  let ok = true;
  const keys = ['cpm', 'wpm', 'accuracy', 'score'];
  for (const key of keys) {
    const expectedValue = expected[key];
    const reportedValue = reported?.[key];
    if (typeof reportedValue !== 'number' || Number.isNaN(reportedValue)) {
      ok = false;
      delta[key] = Infinity;
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

/**
 * 精度表示のためのフォーマッタ。テスト容易性のため純粋関数で提供する。
 *
 * @param {TypingStats} stats
 * @returns {{cpm:string,wpm:string,accuracy:string,score:string}}
 */
export function formatStats(stats) {
  return {
    cpm: stats.cpm.toFixed(2),
    wpm: stats.wpm.toFixed(2),
    accuracy: (stats.accuracy * 100).toFixed(2) + '%',
    score: stats.score.toString()
  };
}
