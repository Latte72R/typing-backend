#!/usr/bin/env node
import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';

function collectJsFiles(dir) {
  const result = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      result.push(...collectJsFiles(full));
    } else if (stats.isFile() && extname(full) === '.js') {
      result.push(full);
    }
  }
  return result;
}

const roots = ['src', 'tests'];
let files = [];
for (const root of roots) {
  try {
    files = files.concat(collectJsFiles(root));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`ディレクトリ ${root} の走査中にエラー:`, error);
      process.exitCode = 1;
    }
  }
}

if (files.length === 0) {
  console.log('チェック対象の JavaScript ファイルが見つかりません。');
  process.exit(0);
}

for (const file of files) {
  const res = spawnSync(process.execPath, ['--check', file], {
    stdio: 'inherit'
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

console.log('Lint (構文チェック) 完了');
