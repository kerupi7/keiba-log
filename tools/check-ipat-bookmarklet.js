// ブックマーク「Ans.の買い目」（assets/ipat-bookmarklet.js）の検算。
//   node tools/check-ipat-bookmarklet.js            … 作り物の即PAT の画面で動かす（ネットにつながない）
//   node tools/check-ipat-bookmarklet.js --ipat     … 上に加え、即PAT 自身の ConvBT を取ってきて全6,396通りを突き合わせる
// 即PAT の画面の部品は JRA のファイルなので、リポジトリには置かず、検算のたびに取ってくる。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'assets', 'ipat-bookmarklet.js'), 'utf8');

let fails = 0;
function eq(a, b, msg) { if (a !== b) { fails++; console.log('NG', msg, '\n  got ', a, '\n  want', b); } }

// ── 1. 書き方の関数を取り出す ──
const t = { __ANS_TEST__: {} };
vm.runInNewContext(SRC, { window: t });
const E = t.__ANS_TEST__.E;

// 中継役の版で即PAT と一致を確かめた値（単勝・東京・11R・5番・100円）
eq(E.line('A570403111', 11, 1, [5], 1), '10005B701080000000000000001', '単勝5番の1点');
eq(E.meet(['A570403111', 'B870403111', 'D510404000'], '202605040311'), 'A570403111', '開催の当て方（東京土）');
eq(E.meet(['A570403111', 'B870403111', 'D510404000'], '202605040411'), 'D510404000', '開催の当て方（東京日・前日発売）');
eq(E.meet(['A570403111'], '202606040311'), null, '発売していない開催');

// ── 2. 作り物の即PAT の画面で、押した時の動きを見る ──
function fakePage(clip, nbInit, answers) {
  const Nb = nbInit || Array(255).fill('0');
  const log = { alerts: [], sent: null };
  const ctx = {
    window: {}, location: { hostname: 'www.ipat.jra.go.jp', pathname: '/sp/pw_740_i.cgi' },
    Nb, Mg: ['A570403111', 'B870403111', 'D510404000'],
    ToSend() { log.sent = Nb.filter((x) => x !== '0'); },
    alert(m) { log.alerts.push(m); }, confirm() { return answers ? answers.shift() : true; },
    prompt() { return null; },
    navigator: { clipboard: { readText: () => Promise.resolve(clip) } },
    Date, JSON, Math, String, parseInt, Error, Promise,
  };
  vm.runInNewContext(SRC, ctx);
  return new Promise((r) => setTimeout(() => r(log), 10));
}
const clip = (o) => E.TAG + JSON.stringify(o);

(async () => {
  let log = await fakePage(clip({ r: '202605040303', t: Date.now(), b: [[1, [5], 4], [7, [1, 5, 8], 2], [6, [11, 5], 1]] }));
  eq(log.alerts.length, 0, '普通に押した時はお知らせを出さない');
  eq(log.sent && log.sent.length, 3, '3点を入れて送る');
  eq(log.sent && log.sent[0], E.line('A570403111', 3, 1, [5], 4), '1点目＝単勝5番400円');

  log = await fakePage(clip({ r: '202606040303', t: Date.now(), b: [[1, [5], 1]] }));
  eq(log.sent, null, '発売していないレースは送らない');
  eq(/発売していません/.test(log.alerts[0] || ''), true, '発売していないとお知らせ');

  log = await fakePage('こんにちは');
  eq(log.sent, null, '関係ないコピーは送らない（貼り付け欄に回す）');

  const pre = Array(255).fill('0'); pre[0] = '1000' + '5B7' + '01' + '80000000000000' + '0001';
  log = await fakePage(clip({ r: '202605040303', t: Date.now(), b: [[2, [3], 1]] }), pre, [false]);
  eq(log.sent, null, 'すでに入っていて「足さない」を選んだら送らない');

  log = await fakePage(clip({ r: '202605040303', t: Date.now() - 5 * 3600e3, b: [[2, [3], 1]] }), null, [false]);
  eq(log.sent, null, '5時間前のコピーで「進まない」を選んだら送らない');

  log = await fakePage(clip({ r: '202605040303', t: Date.now(), b: [[4, [3, 3], 1]] }));
  eq(log.sent, null, '馬連の同じ馬2頭は送らない');

  // ── 3. 即PAT 自身の ConvBT との突き合わせ（--ipat の時だけ） ──
  if (process.argv.includes('--ipat')) {
    const get = async (f) => Buffer.from(await (await fetch('https://www.ipat.jra.go.jp/sp/tmpl/' + f)).arrayBuffer());
    const dec = (b) => new TextDecoder('euc-jp').decode(b);
    const s740 = dec(await get('740_260206.js'));
    const s001 = dec(await get('001_260206.js'));
    const grab = (src, name) => {
      const st = src.indexOf('function ' + name + '('); let i = src.indexOf('{', st), d = 0;
      for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) break; } }
      return src.slice(st, i + 1);
    };
    const cur = { siki: 0 };
    const c = { $: (sel) => ({ data: () => (sel.includes('#siki') ? cur.siki : sel.includes('#hou') ? 0 : undefined), size: () => 0 }),
      ALERT: (m) => { throw new Error(m); }, g740_cMultiSet: '0' };
    vm.runInNewContext(grab(s001, 'SS') + grab(s740, 'CBT') + grab(s740, 'ConvBT') + ';this.ConvBT=ConvBT;', c);
    const z = (n) => (n < 10 ? '0' + n : '' + n);
    let n = 0, bad = 0;
    const one = (k, nums, up, mi, lo) => {
      cur.siki = k; n++;
      const want = c.ConvBT(up, mi, lo).slice(2);
      if (E.mark(k, nums) !== want) { bad++; if (bad < 4) console.log('NG', k, nums, E.mark(k, nums), want); }
    };
    for (let k = 1; k <= 8; k++) {
      if (k <= 2) for (let a = 1; a <= 18; a++) one(k, [a], z(a), '', '');
      if (k === 3) for (let a = 1; a <= 8; a++) for (let b = a; b <= 8; b++) one(k, [a, b], '' + a + b, '', '');
      if (k === 4 || k === 5) for (let a = 1; a <= 18; a++) for (let b = a + 1; b <= 18; b++) one(k, [a, b], z(a) + z(b), '', '');
      if (k === 6) for (let a = 1; a <= 18; a++) for (let b = 1; b <= 18; b++) if (a !== b) one(k, [a, b], z(a), z(b), '');
      if (k === 7) for (let a = 1; a <= 18; a++) for (let b = a + 1; b <= 18; b++) for (let d = b + 1; d <= 18; d++) one(k, [a, b, d], z(a) + z(b) + z(d), '', '');
      if (k === 8) for (let a = 1; a <= 18; a++) for (let b = 1; b <= 18; b++) for (let d = 1; d <= 18; d++) if (a !== b && b !== d && a !== d) one(k, [a, b, d], z(a), z(b), z(d));
    }
    console.log('即PAT の ConvBT と突き合わせ:', n, '通り・不一致', bad);
    fails += bad;
  }
  console.log(fails ? 'NG ' + fails : 'OK');
  process.exit(fails ? 1 : 0);
})();
