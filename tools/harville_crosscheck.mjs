#!/usr/bin/env node
/**
 * Harville突合テスト（JS ↔ Python の数値一致を機械保証） — keiba-log
 *
 * assets/harville.js が正本 Kelpie.Inc shared/scripts/keiba_harville.py
 * （複勝は shared/scripts/keiba_select_bets.py::prob_fukusho）と数値一致することを検証する。
 * fixtureは shared/scripts/keiba_harville_fixture.py が生成する
 * （Kelpie.Incリポ・正本2ファイルをimportして全数計算。両正本は無変更）。
 *
 * 仕様: Kelpie.Inc docs/keiba-log-design/17-odds-master-spec.md §5.3-5.4
 *
 * 再実行手順:
 *   1. (Kelpie.Incリポのルートで) python3 shared/scripts/keiba_harville_fixture.py <race_id>
 *      → keiba-log tools/fixtures/harville_{race_id}.json を再生成
 *   2. (keiba-logリポのルートで) node tools/harville_crosscheck.mjs <race_id>
 *      （race_idの代わりに fixture JSON への相対/絶対パスを渡すことも可）
 *
 * 許容誤差: 絶対誤差 <= 1e-9。全点パスで `OK total=N max_abs_diff=…` を出力しexit 0。
 * 1点でも超過なら該当キー上位10件を表示しexit 1。
 * 依存パッケージなし（Node標準ライブラリのみ）。ズレた場合はJS側をPythonに寄せて直す
 * （逆は禁止。§5.4）。
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TOLERANCE = 1e-9;

function calc(Harville, betType, ids, probs, heads) {
  switch (betType) {
    case 'tansho': return Harville.probTansho(ids[0], probs);
    case 'fukusho': return Harville.probFukusho(ids[0], probs, heads);
    case 'wide': return Harville.probWide(ids[0], ids[1], probs, heads);
    case 'umaren': return Harville.probUmaren(ids[0], ids[1], probs);
    case 'umatan': return Harville.probUmatan(ids[0], ids[1], probs);
    case 'sanrenpuku': return Harville.probSanrenpuku(ids[0], ids[1], ids[2], probs);
    case 'sanrentan': return Harville.probSanrentan(ids[0], ids[1], ids[2], probs);
    default: throw new Error(`unknown bet_type: ${betType}`);
  }
}

function resolveFixturePath(arg) {
  if (arg.endsWith('.json') || arg.includes('/')) {
    return path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg);
  }
  return path.join(__dirname, 'fixtures', `harville_${arg}.json`);
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node tools/harville_crosscheck.mjs <race_id | fixture.json path>');
    process.exit(1);
  }
  const fixturePath = resolveFixturePath(arg);
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const Harville = require(path.join(__dirname, '..', 'assets', 'harville.js'));

  const probs = fixture.probs;
  const heads = fixture.heads;

  let total = 0;
  let maxAbsDiff = 0;
  const diffs = [];

  for (const betType of Object.keys(fixture.expected)) {
    const table = fixture.expected[betType];
    for (const key of Object.keys(table)) {
      const expectedValue = table[key];
      const ids = key.split('-').map(Number);
      const actual = calc(Harville, betType, ids, probs, heads);
      const diff = Math.abs(actual - expectedValue);
      total += 1;
      if (diff > maxAbsDiff) maxAbsDiff = diff;
      if (diff > TOLERANCE) {
        diffs.push({ betType, key, expected: expectedValue, actual, diff });
      }
    }
  }

  if (diffs.length > 0) {
    diffs.sort((a, b) => b.diff - a.diff);
    console.error(`NG total=${total} max_abs_diff=${maxAbsDiff} over_tolerance=${diffs.length}`);
    for (const d of diffs.slice(0, 10)) {
      console.error(`  ${d.betType} ${d.key}: expected=${d.expected} actual=${d.actual} diff=${d.diff}`);
    }
    process.exit(1);
  }

  console.log(`OK race_id=${fixture.race_id} total=${total} max_abs_diff=${maxAbsDiff} skipped=${JSON.stringify(fixture.skipped)}`);
  process.exit(0);
}

main();
