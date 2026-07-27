/**
 * 買い目アキネーター（keiba-log 買い目アキネーター・88-akinator-spec.md）
 *
 * レース詳細ページ(race.html)の「買い目シミュレーター」フォールドに、質問に答えると
 * 買い目（券種＋買い方）が決まる対話UIを追加する。手動シミュレーター(assets/simulator.js)の
 * 前段として置くもので、出力は Simulator.applyPlan(state, plan) 経由で state に流し込むだけ。
 * 自動選定(Python)・予想成績には一切影響しない。
 *
 * 参照モックアップ: docs/keiba-log-design/mockup-10-akinator.tpl.html（動作確認済み）。
 * 本ファイルはそのロジック移植だが、以下の点を本番向けに変更している：
 *   - FIXTURE直読みではなく Akinator.init(site, oddsAll) でレースごとに初期化する
 *   - 確率計算は自前実装をやめ、必ず window.Harville の公開関数を呼ぶ（harville.jsは無改造）
 *   - qを画面に確率として出さない・選択肢に「残りN通り」を出さない・「あなたの予想との一致」を
 *     出さない、の3点は 2026-07-27 の決定により実装しない（モックアップの残骸コードも移植しない）
 *   - perms(nums,3)の決着列挙とHarville呼び出しは1回のrenderResults呼び出し内で使い回す（§8.3）
 *
 * 契約: 純関数中心。DOM描画はHTML文字列を返すのみ（実際のDOM書き込み・イベント購読はrace.js側が
 * 行う。テキスト入力・スライダーのドラッグ中プレビューだけは、フォーカス/カーソル位置を保つため
 * race.js側が個別のpure関数（budgetPreviewHtml等）を呼んでピンポイントにDOM更新する）。
 * ブラウザ(window.Akinator)とNode(module.exports)の両方で同一オブジェクトを公開する
 * （harville.js / simulator.js 踏襲）。馬番はすべて数値(Number)で扱う。
 *
 * 依存（グローバル前提。script読み込み順は race.html: app.js → harville.js → akinator.js →
 * simulator.js → race.js）:
 *   app.js:      umaBox, gradeClass, gradeDisp, escapeHtml, fmtYen, fmtPercent, MARK_CLASS
 *   harville.js: window.Harville（harvilleOrdered/probTansho/probFukusho/probWide/probUmaren/
 *                probUmatan/probSanrenpuku/probSanrentan/oddsUsed/buildProbs）
 */
(function () {
  'use strict';

  // ===== 定数 =====
  var TASTE_LAMBDA = { hit: 0.25, mid: 0.45, big: 0.70 };
  var ORDERED = { umatan: 1, sanrentan: 1 };
  var FAM_LABEL = { hit: '当てにいく', mid: '中核', big: '一撃' };
  var TYPE_LABEL = {
    tansho: '単勝', fukusho: '複勝', wakuren: '枠連', umaren: '馬連',
    wide: 'ワイド', umatan: '馬単', sanrenpuku: '3連複', sanrentan: '3連単',
  };
  // A: 買い方が「順番を指定していない部分」の並べ替え数。ここを割って買わない（§5.3規則A）
  var BLOCK = { stnmul: 6, stnbox: 6, stnax1: 2, stnax2: 2, stnax3: 2, utanmul: 2, utanbox: 2 };

  // ===== 組み合わせ／順列（純ヘルパー。harville.js/simulator.jsの非公開実装とは独立に保持） =====
  function combos(arr, k) {
    var out = [];
    (function rec(start, cur) {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (var i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); }
    })(0, []);
    return out;
  }
  function perms(arr, k) {
    var out = [];
    var used = new Array(arr.length);
    (function rec(cur) {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (var i = 0; i < arr.length; i++) {
        if (used[i]) continue;
        used[i] = true; cur.push(arr[i]); rec(cur); cur.pop(); used[i] = false;
      }
    })([]);
    return out;
  }

  // ===== T1: 買い方カタログ（§2）。answerが割れるまでの「答え」の全部。質問はここから逆算する =====
  // build(S, BY): S.axis / S.partners から買い目候補（ids配列の配列）を作る。BYはwakunagのみ使用。
  var CATALOG = [
    // --- 当てにいく ---
    { id: 'tan1', fam: 'hit', type: 'tansho', name: '単勝', axisN: 1, target: ['win'], ord: 'no',
      build: function (S) { return [[S.axis[0]]]; },
      memo: '80倍超は切る（実測0.402）。1.0〜1.5倍が最良帯0.893' },
    { id: 'fuku1', fam: 'hit', type: 'fukusho', name: '複勝', axisN: 1, target: ['place'], ord: 'no',
      build: function (S) { return [[S.axis[0]]]; },
      memo: '印だけで買う2320通りの総当たりで最良（的中52.4%・ROI 0.834）' },
    { id: 'widenag', fam: 'hit', type: 'wide', name: 'ワイド 軸1頭ながし', axisN: 1, target: ['place', 'ren'], ord: 'no',
      build: function (S) { return S.partners.map(function (p) { return [S.axis[0], p]; }); } },
    { id: 'widef', fam: 'hit', type: 'wide', name: 'ワイド 軸2頭ながし', axisN: 2, target: ['place', 'ren'], ord: 'no',
      build: function (S) {
        var o = [[S.axis[0], S.axis[1]]];
        S.partners.forEach(function (p) { o.push([S.axis[0], p]); o.push([S.axis[1], p]); });
        return o;
      },
      memo: '◎○2軸流し0.807。同点数の人気順対照0.796をわずかに上回る' },
    { id: 'widebox', fam: 'hit', type: 'wide', name: 'ワイド ボックス', axisN: 0, target: ['place', 'ren'], ord: 'no',
      build: function (S) { return combos(S.partners, 2); },
      memo: '印5頭10点で的中71.1%・0.800。基準線0.775を超えた数少ない例' },
    // --- 中核 ---
    { id: 'urennag', fam: 'mid', type: 'umaren', name: '馬連 ながし', axisN: 1, target: ['ren', 'win'], ord: 'no',
      build: function (S) { return S.partners.map(function (p) { return [S.axis[0], p]; }); } },
    { id: 'urenf', fam: 'mid', type: 'umaren', name: '馬連 フォーメーション', axisN: 2, target: ['ren', 'win'], ord: 'no',
      build: function (S) {
        var o = [[S.axis[0], S.axis[1]]];
        S.partners.forEach(function (p) { o.push([S.axis[0], p]); o.push([S.axis[1], p]); });
        return o;
      } },
    { id: 'urenbox', fam: 'mid', type: 'umaren', name: '馬連 ボックス', axisN: 0, target: ['ren', 'win'], ord: 'no',
      build: function (S) { return combos(S.partners, 2); },
      memo: '印3頭0.744。動画12/12本がボックスを否定' },
    { id: 'wakunag', fam: 'mid', type: 'wakuren', name: '枠連 ながし', axisN: 1, target: ['ren', 'win'], ord: 'no',
      build: function (S, BY) {
        var g = BY[S.axis[0]].gate;
        var set = [];
        S.partners.forEach(function (p) { var f = BY[p].gate; if (set.indexOf(f) === -1) set.push(f); });
        return set.map(function (f) { return [g, f]; });
      },
      memo: '枠連オッズは未取得のため払戻を出せない' },
    { id: 'utannag', fam: 'mid', type: 'umatan', name: '馬単 1着軸ながし', axisN: 1, target: ['win'], ord: 'yes',
      build: function (S) { return S.partners.map(function (p) { return [S.axis[0], p]; }); },
      memo: '◎1着固定→印3頭 2点で0.853。印ベースで2番目に良い行' },
    { id: 'utannag2', fam: 'mid', type: 'umatan', name: '馬単 2着軸ながし', axisN: 1, target: ['ren'], ord: 'yes',
      build: function (S) { return S.partners.map(function (p) { return [p, S.axis[0]]; }); } },
    { id: 'utanmul', fam: 'mid', type: 'umatan', name: '馬単 ながしマルチ', axisN: 1, target: ['ren', 'win'], ord: 'multi',
      build: function (S) {
        var o = [];
        S.partners.forEach(function (p) { o.push([S.axis[0], p]); o.push([p, S.axis[0]]); });
        return o;
      },
      memo: '馬連に構造的に負ける。分岐点は着順正解率53.8%' },
    { id: 'utanbox', fam: 'mid', type: 'umatan', name: '馬単 ボックス', axisN: 0, target: ['ren', 'win'], ord: 'yes',
      build: function (S) { return perms(S.partners, 2); } },
    // --- 一撃 ---
    { id: 'spkax1', fam: 'big', type: 'sanrenpuku', name: '3連複 軸1頭ながし', axisN: 1, target: ['place', 'ren', 'win'], ord: 'no',
      build: function (S) { return combos(S.partners, 2).map(function (pr) { return [S.axis[0], pr[0], pr[1]]; }); } },
    { id: 'spkax2', fam: 'big', type: 'sanrenpuku', name: '3連複 軸2頭ながし', axisN: 2, target: ['place', 'ren', 'win'], ord: 'no',
      build: function (S) { return S.partners.map(function (p) { return [S.axis[0], S.axis[1], p]; }); },
      memo: '◎○軸→印4頭 2点で0.838' },
    { id: 'spkbox', fam: 'big', type: 'sanrenpuku', name: '3連複 ボックス', axisN: 0, target: ['place', 'ren', 'win'], ord: 'no',
      build: function (S) { return combos(S.partners, 3); },
      memo: '点数を絞るほどROIは上がる（110点0.653→1点0.776）。ただし1.0には届かない' },
    { id: 'stnax1', fam: 'big', type: 'sanrentan', name: '3連単 1着軸ながし', axisN: 1, target: ['win'], ord: 'yes',
      build: function (S) { return perms(S.partners, 2).map(function (pr) { return [S.axis[0], pr[0], pr[1]]; }); } },
    { id: 'stnax2', fam: 'big', type: 'sanrentan', name: '3連単 2着軸ながし', axisN: 1, target: ['ren'], ord: 'yes',
      build: function (S) { return perms(S.partners, 2).map(function (pr) { return [pr[0], S.axis[0], pr[1]]; }); } },
    { id: 'stnax3', fam: 'big', type: 'sanrentan', name: '3連単 3着軸ながし', axisN: 1, target: ['place'], ord: 'yes',
      build: function (S) { return perms(S.partners, 2).map(function (pr) { return [pr[0], pr[1], S.axis[0]]; }); } },
    { id: 'stnax12', fam: 'big', type: 'sanrentan', name: '3連単 1・2着軸ながし', axisN: 2, target: ['win', 'ren'], ord: 'yes',
      build: function (S) { return S.partners.map(function (p) { return [S.axis[0], S.axis[1], p]; }); } },
    { id: 'stnmul', fam: 'big', type: 'sanrentan', name: '3連単 軸1頭ながしマルチ', axisN: 1, target: ['win', 'ren', 'place'], ord: 'multi',
      build: function (S) {
        var o = [];
        perms(S.partners, 2).forEach(function (pr) {
          o.push([S.axis[0], pr[0], pr[1]]); o.push([pr[0], S.axis[0], pr[1]]); o.push([pr[0], pr[1], S.axis[0]]);
        });
        return o;
      },
      memo: '63.7%のケースで3連複に負ける（同じ狙いを難しい券種で表現している）' },
    { id: 'stnbox', fam: 'big', type: 'sanrentan', name: '3連単 ボックス', axisN: 0, target: ['win', 'ren', 'place'], ord: 'yes',
      build: function (S) { return perms(S.partners, 3); },
      memo: '印3頭6点0.725。動画は全会一致で否定' },
    { id: 'stnf', fam: 'big', type: 'sanrentan', name: '3連単 フォーメーション', axisN: 2, target: ['win', 'ren'], ord: 'yes',
      build: function (S) {
        var o = [];
        S.partners.forEach(function (p) {
          S.partners.forEach(function (p2) {
            if (p === p2) return;
            o.push([S.axis[0], p, p2]);
          });
        });
        return o.filter(function (x) { return x[1] !== S.axis[0] && x[2] !== S.axis[0]; });
      },
      memo: '◎○/◎○▲/印5 の12点で0.893（見た目は最良だが決着に56,674レース必要＝判定不能）' },
  ];

  // ===== T2: 質問エンジン（§3） =====
  // apply/qf/sf/optsf は明示的に S を受け取る（モックアップの module-global S をやめた差分）
  var QUESTIONS = [
    {
      key: 'axis', kind: 'horse', max: 2, always: true,
      q: '軸にする馬は？',
      s: '「この馬から買う」と決めている馬を選んでください。2頭まで選べます。決めきれないなら下のボタンへ。',
      extra: [{ label: '決めきれない（何頭かに絞るだけ）', desc: '', value: 'none' }],
      apply: function (S, v) {
        if (v === 'none') { S.axisMode = 'none'; S.axis = []; } else { S.axisMode = 'pick'; S.axis = v; }
      },
    },
    {
      key: 'target', kind: 'opt',
      qf: function (S) {
        return S.axisMode === 'none' ? 'どこまで当てにいく？'
          : (S.axis.length === 2 ? 'その2頭、どこまで来ると思う？' : 'その馬、どこまで来ると思う？');
      },
      s: '',
      optsf: function (S) {
        var base = S.axisMode === 'none' ? [
          { value: 'win', label: '1着から当てにいく', desc: '' },
          { value: 'ren', label: '2着までの顔ぶれ', desc: '' },
          { value: 'place', label: '3着内の顔ぶれ', desc: '' },
        ] : [
          { value: 'win', label: '勝つと思う', desc: '' },
          { value: 'ren', label: '2着までには来る', desc: '' },
          { value: 'place', label: '3着内なら十分', desc: '' },
        ];
        return base.concat([{ value: 'any', label: 'わからない', desc: '', skip: true }]);
      },
      apply: function (S, v) { S.target = v; },
    },
    {
      key: 'ordered', kind: 'opt', q: '着順まで当てる自信は？', s: '',
      opts: [
        { value: true, label: 'ある', desc: '' },
        { value: false, label: 'ない', desc: '' },
        { value: 'any', label: 'わからない', desc: '', skip: true },
      ],
      apply: function (S, v) { S.ordered = v; },
    },
    {
      key: 'partners', kind: 'horse', max: 9,
      qf: function (S) { return S.axisMode === 'none' ? '何頭に絞れてる？' : '相手はどの馬？'; },
      sf: function (S) {
        return S.axisMode === 'none' ? 'ボックスに入れる馬を選んでください。' : '軸と組ませる馬を選んでください。選ぶ数で点数が変わります。';
      },
      apply: function (S, v) { S.partners = v.filter(function (n) { return S.axis.indexOf(n) === -1; }); },
    },
    {
      key: 'budget', kind: 'input', q: 'このレースの予算は？',
      s: 'だいたいで大丈夫です。「5000」「1万」「3千円くらい」のように書けます。',
      apply: function (S, v) { S.budget = v; },
    },
    {
      key: 'taste', kind: 'opt', q: '当てたい？大きく取りたい？',
      s: '同じ券種で複数の買い方が残っているとき、どちらを選ぶかが変わります。',
      opts: [
        { value: 'hit', label: 'とにかく当てたい', desc: '' },
        { value: 'mid', label: '半々', desc: '' },
        { value: 'big', label: '大きく取りたい', desc: '' },
      ],
      apply: function (S, v) { S.taste = v; },
    },
  ];

  function optsFor(S, q) { return q.optsf ? q.optsf(S) : (q.opts || []); }

  function answered(S, q) {
    if (q.key === 'axis') return S.axisMode !== null;
    if (q.key === 'partners') return S.partners.length > 0;
    return S[q.key] !== null;
  }

  // ===== T1: 残り候補（§2 alive） =====
  function alive(ctx, S) {
    return CATALOG.filter(function (c) {
      if (S.axisMode !== null) {
        if (S.axisMode === 'none' && c.axisN !== 0) return false;
        if (S.axisMode !== 'none' && c.axisN !== S.axis.length) return false;
      }
      if (S.target !== null && S.target !== 'any' && c.target.indexOf(S.target) === -1) return false;
      if (S.ordered === false && c.ord === 'yes') return false;
      if (S.ordered === true && c.ord === 'multi') return false;
      // 枠連はオッズ未取得＝払戻を出せないので推奨には出さない（§6.4。一覧にはヒントとして残す）
      if (c.type === 'wakuren') return false;
      return true;
    });
  }

  function cloneState(S) {
    var c = {};
    for (var k in S) { if (Object.prototype.hasOwnProperty.call(S, k)) c[k] = S[k]; }
    return c;
  }
  function aliveKey(ctx, S) { return alive(ctx, S).map(function (c) { return c.id; }).sort().join(','); }

  // splits()は候補「集合」を比較する（数が偶然一致するだけの分岐を取り逃さないため。§3.2）
  function splits(ctx, S, qk) {
    if (alive(ctx, S).length <= 1) return false;
    var q = null;
    for (var i = 0; i < QUESTIONS.length; i++) { if (QUESTIONS[i].key === qk) { q = QUESTIONS[i]; break; } }
    if (qk === 'budget' || qk === 'taste') {
      var byFam = {};
      alive(ctx, S).forEach(function (c) { (byFam[c.fam] = byFam[c.fam] || []).push(c); });
      return Object.keys(byFam).some(function (f) { return byFam[f].length > 1; });
    }
    var keys = optsFor(S, q).map(function (o) {
      var clone = cloneState(S);
      q.apply(clone, o.value);
      return aliveKey(ctx, clone);
    });
    return (new Set(keys)).size > 1;
  }

  function nextQuestion(ctx, S) {
    for (var i = 0; i < QUESTIONS.length; i++) {
      var q = QUESTIONS[i];
      if (answered(S, q)) continue;
      if (q.key === 'partners') {
        var al = alive(ctx, S);
        var beyondTanFuku = al.some(function (c) { return c.id !== 'tan1' && c.id !== 'fuku1'; });
        if (!beyondTanFuku) continue;
        return q;
      }
      if (q.always || splits(ctx, S, q.key)) return q;
    }
    return null;
  }

  // ===== T4: 予算の自由入力パーサ（§3.4） =====
  function parseYen(str) {
    if (str === null || str === undefined) return null;
    var t = String(str)
      .replace(/[０-９．]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[,、\s]/g, '');
    var total = 0, hit = false;
    var m = t.match(/(\d+(?:\.\d+)?)万/);
    if (m) { total += parseFloat(m[1]) * 10000; t = t.replace(m[0], ''); hit = true; }
    var k = t.match(/(\d+(?:\.\d+)?)千/);
    if (k) { total += parseFloat(k[1]) * 1000; t = t.replace(k[0], ''); hit = true; }
    var r = t.match(/(\d+)/);
    if (r) { total = hit ? total + parseInt(r[1], 10) : parseInt(r[1], 10); hit = true; }
    if (!hit) return null;
    return Math.max(100, Math.round(total / 100) * 100);
  }

  // ===== 確率q（§4） =====
  function qprobs(ctx, S) {
    var q = {}, sum = 0;
    ctx.HORSES.forEach(function (h) {
      var v = ctx.P0[h.number];
      if (S.axis.indexOf(h.number) !== -1) v *= 1.6;
      if (S.kill.indexOf(h.number) !== -1) v *= 0.25;
      q[h.number] = v; sum += v;
    });
    for (var k in q) { if (Object.prototype.hasOwnProperty.call(q, k)) q[k] = q[k] / sum; }
    return q;
  }

  // ===== 確率・オッズ（必ずHarvilleの公開関数を経由する。harville.jsは無改造） =====
  function probOf(ctx, type, ids, probs) {
    switch (type) {
      case 'tansho': return Harville.probTansho(ids[0], probs);
      case 'fukusho': return Harville.probFukusho(ids[0], probs, ctx.HEADS);
      case 'wide': return Harville.probWide(ids[0], ids[1], probs, ctx.HEADS);
      case 'umaren': return Harville.probUmaren(ids[0], ids[1], probs);
      case 'umatan': return Harville.probUmatan(ids[0], ids[1], probs);
      case 'sanrenpuku': return Harville.probSanrenpuku(ids[0], ids[1], ids[2], probs);
      case 'sanrentan': return Harville.probSanrentan(ids[0], ids[1], ids[2], probs);
      default: return null; // wakuren: Harvilleに公開関数がないため常にnull（枠連はallPlans()で除外理由のみ表示）
    }
  }
  function oddsOf(ctx, type, ids) {
    if (!ctx.oddsAll || !ctx.oddsAll.status || ctx.oddsAll.status[type] !== 'result') return null;
    // 複勝・ワイドは[min,max]配列。Harville.oddsUsedが[0](低い方)を採用する契約（§1）
    return Harville.oddsUsed(ctx.oddsAll, type, ids);
  }

  function medianWeighted(pairs) {
    var tot = pairs.reduce(function (a, x) { return a + x[1]; }, 0);
    if (tot <= 0) return null;
    var sorted = pairs.slice().sort(function (a, b) { return a[0] - b[0]; });
    var acc = 0;
    for (var i = 0; i < sorted.length; i++) { acc += sorted[i][1]; if (acc >= tot / 2) return sorted[i][0]; }
    return sorted[sorted.length - 1][0];
  }

  // buildPlan: 予算を反映した単一買い方の評価（allPlans()・budgetPreview()用）
  function buildPlan(ctx, S, c, q) {
    var list;
    try { list = c.build(S, ctx.BY); } catch (e) { return null; }
    if (!list || !list.length) return null;
    var seen = {}, uniq = [];
    list.forEach(function (ids) {
      if ((new Set(ids)).size !== ids.length) return;
      var k = (ORDERED[c.type] ? ids.slice() : ids.slice().sort(function (a, b) { return a - b; })).join('-');
      if (seen[k]) return;
      seen[k] = true;
      uniq.push(ids);
    });
    var rows = [];
    uniq.forEach(function (ids) {
      var p = probOf(ctx, c.type, ids, q);
      if (p === null || !(p > 0)) return;
      rows.push({ ids: ids, p: p, odds: oddsOf(ctx, c.type, ids) });
    });
    if (!rows.length) return null;
    rows.sort(function (a, b) { return b.p - a.p; });
    // 予算は「1点いくら」に効く。予算に入りきらないときは買い方ごと捨てず、確率の高い順に絞る（§5.4）
    var bud = (typeof S.budget === 'number' && S.budget > 0) ? S.budget : null;
    var maxPts = bud ? Math.floor(bud / 100) : Infinity;
    var over = !!(bud && maxPts < 1);
    var trimmedFrom = null;
    if (rows.length > maxPts) { trimmedFrom = rows.length; rows = rows.slice(0, maxPts); }
    var pts = rows.length;
    var unit = bud ? Math.max(100, Math.floor(bud / pts / 100) * 100) : 100;
    var stake = unit * pts;
    var pHit = rows.reduce(function (a, r) { return a + r.p; }, 0);
    var withOdds = rows.filter(function (r) { return r.odds !== null; });
    var payPairs = withOdds.map(function (r) { return [r.odds * unit, r.p]; });
    var med = payPairs.length ? medianWeighted(payPairs) : null;
    var pRecover = withOdds.length
      ? withOdds.filter(function (r) { return r.odds * unit > stake; }).reduce(function (a, r) { return a + r.p; }, 0)
      : null;
    var lam = TASTE_LAMBDA[S.taste || 'mid'];
    var score = Math.pow(pHit, 1 - lam) * Math.pow((med || unit) / stake, lam);
    return { c: c, rows: rows, pts: pts, unit: unit, stake: stake, over: over, trimmedFrom: trimmedFrom,
      pHit: pHit, med: med, pRecover: pRecover, score: score };
  }

  // ===== T5: buildRows / blocksOf / fundLeg / swapToSanrenpuku（§5） =====
  function buildRows(ctx, S, c, q) {           // 予算を見ない素の買い目（確率降順）
    var list;
    try { list = c.build(S, ctx.BY); } catch (e) { return null; }
    if (!list || !list.length) return null;
    var seen = {}, rows = [];
    list.forEach(function (ids) {
      if ((new Set(ids)).size !== ids.length) return;
      var k = (ORDERED[c.type] ? ids.slice() : ids.slice().sort(function (a, b) { return a - b; })).join('-');
      if (seen[k]) return;
      seen[k] = true;
      var p = probOf(ctx, c.type, ids, q);
      if (!(p > 0)) return;
      rows.push({ ids: ids, p: p, odds: oddsOf(ctx, c.type, ids) });
    });
    if (!rows.length) return null;
    rows.sort(function (a, b) { return b.p - a.p; });
    return { c: c, rows: rows, pHit: rows.reduce(function (a, r) { return a + r.p; }, 0) };
  }
  // 束の中央値払戻。好み（λ）で当てやすさと配当を天秤にかける
  function legScore(leg, lam) {
    var v = leg.rows.filter(function (r) { return r.odds != null; })
      .map(function (r) { return { pay: r.odds * leg.unit, p: r.p }; });
    if (!v.length) return 0;
    v.sort(function (a, b) { return a.pay - b.pay; });
    var tot = v.reduce(function (a, x) { return a + x.p; }, 0), acc = 0, med = v[0].pay;
    for (var i = 0; i < v.length; i++) { acc += v[i].p; if (acc >= tot / 2) { med = v[i].pay; break; } }
    var pHit = leg.rows.reduce(function (a, r) { return a + r.p; }, 0);
    return Math.pow(pHit, 1 - lam) * Math.pow(med / leg.yen, lam);
  }
  // そのファミリーで組めるものを全部返す（券種でまとめない）
  function familyCandidates(ctx, S, fam, q) {
    var out = [];
    alive(ctx, S).forEach(function (c) {
      if (c.fam !== fam) return;
      var r = buildRows(ctx, S, c, q);
      if (r) out.push(r);
    });
    return out;
  }
  function bestPerType(ctx, S, q) {             // 券種ごとに最良を1つ、当てやすい順に並べる（保険の候補用）
    var by = {};
    alive(ctx, S).forEach(function (c) {
      var r = buildRows(ctx, S, c, q);
      if (!r) return;
      if (!by[c.type] || r.pHit > by[c.type].pHit) by[c.type] = r;
    });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.pHit - a.pHit; });
  }
  function blocksOf(raw) {                      // 規則A：かたまり（並べ替え数）単位でグループ化
    var u = BLOCK[raw.c.id] || 1;
    var g = {};
    raw.rows.forEach(function (r) {
      var k = r.ids.slice().sort(function (a, b) { return a - b; }).join('-');
      (g[k] = g[k] || []).push(r);
    });
    return Object.keys(g).filter(function (k) { return g[k].length >= u; })
      .map(function (k) {
        var rows = g[k].slice(0, u);
        return { key: k, rows: rows, p: rows.reduce(function (a, r) { return a + r.p; }, 0) };
      })
      .sort(function (a, b) { return b.p - a.p; });
  }
  function fundLeg(raw, yen) {                  // 与えた金額で買えるところまで（かたまり単位・100円/点）
    var u = BLOCK[raw.c.id] || 1;
    var blocks = blocksOf(raw);
    if (!blocks.length) return null;
    var maxBlocks = Math.floor(Math.floor(yen / 100) / u);
    if (maxBlocks < 1) return null;
    var take = blocks.slice(0, maxBlocks);
    var rows = [];
    take.forEach(function (b) { rows = rows.concat(b.rows); });
    var pts = rows.length;
    var unit = Math.max(100, Math.floor(yen / pts / 100) * 100);
    return { c: raw.c, rows: rows, pts: pts, unit: unit, yen: unit * pts, blocks: take.length,
      trimmedFrom: blocks.length > take.length ? blocks.length * u : null,
      pHit: rows.reduce(function (a, r) { return a + r.p; }, 0) };
  }
  // 規則B：3連単が「1つの3頭の全順列」だけになったら、同じ出来事を安く買える3連複に振り替える
  function swapToSanrenpuku(ctx, leg, q) {
    if (leg.c.type !== 'sanrentan' || leg.blocks !== 1) return leg;
    if ((BLOCK[leg.c.id] || 1) !== 6) return leg;
    var ids = leg.rows[0].ids.slice().sort(function (a, b) { return a - b; });
    var p = probOf(ctx, 'sanrenpuku', ids, q);
    var o = oddsOf(ctx, 'sanrenpuku', ids);
    if (!(p > 0) || o === null) return leg;
    return {
      c: { type: 'sanrenpuku', name: '3連複', fam: leg.c.fam, id: '_swap',
        memo: '3連単の全順列と同じ出来事を、1点で安く買える形に置き換えました' },
      rows: [{ ids: ids, p: p, odds: o }], pts: 1, unit: leg.yen, yen: leg.yen, blocks: 1,
      trimmedFrom: null, pHit: p, swapped: true,
    };
  }

  // ===== T6: buildPackage / evalPackage（§5.1・§5.2・§8.3） =====
  function allOutcomes(q) {                     // §8.3: perms(16頭,3)の決着列挙は1回の描画内で使い回す
    var nums = Object.keys(q).map(Number);
    var outs = [], tot = 0;
    perms(nums, 3).forEach(function (t) {
      var p = Harville.harvilleOrdered(t, q);
      if (p > 0) { outs.push({ t: t, p: p }); tot += p; }
    });
    return { outs: outs, tot: tot };
  }
  function legPayout(ctx, leg, t) {             // 決着t（1〜3着の馬番）でこの脚がいくら返すか
    var s3 = {}; t.forEach(function (n) { s3[n] = true; });
    var s2 = {}; s2[t[0]] = true; s2[t[1]] = true;
    var pay = 0;
    leg.rows.forEach(function (r) {
      if (r.odds === null) return;
      var ids = r.ids, hit = false;
      switch (leg.c.type) {
        case 'tansho': hit = ids[0] === t[0]; break;
        case 'fukusho': hit = !!s3[ids[0]]; break;
        case 'umaren': hit = ids.every(function (n) { return !!s2[n]; }); break;
        case 'wide': hit = ids.every(function (n) { return !!s3[n]; }); break;
        case 'sanrenpuku': hit = ids.every(function (n) { return !!s3[n]; }); break;
        case 'umatan': hit = ids[0] === t[0] && ids[1] === t[1]; break;
        case 'sanrentan': hit = ids.every(function (n, i) { return n === t[i]; }); break;
        default: hit = false;
      }
      if (hit) pay += r.odds * leg.unit;
    });
    return pay;
  }
  function buildPackage(ctx, S, fam, q, budget, w, outcomes) {
    var ladder = bestPerType(ctx, S, q);
    // 本線は「好み」で選ぶ。的中確率だけで選ぶと 3連複が 3連単に、馬連が馬単に必ず勝ち、
    // 「大きく取りたい」と答えても券種が変わらなくなる
    var lam = TASTE_LAMBDA[S.taste || 'mid'];
    var mainYen = Math.max(100, Math.floor(budget * w / 100) * 100);
    var main = null, mainLeg = null, bestScore = -1;
    familyCandidates(ctx, S, fam, q).forEach(function (r) {
      var lg = fundLeg(r, mainYen);
      if (!lg) return;
      var sc = legScore(lg, lam);
      if (sc > bestScore) { bestScore = sc; main = r; mainLeg = lg; }
    });
    if (!mainLeg) return null;
    mainLeg = swapToSanrenpuku(ctx, mainLeg, q);
    var legs = [mainLeg];
    var rest = budget - mainLeg.yen;

    var outs = outcomes.outs, totP = outcomes.tot;
    var maskOf = function (leg) { return outs.map(function (o) { return legPayout(ctx, leg, o.t) > 0 ? 1 : 0; }); };
    var cover = maskOf(mainLeg);
    var covP = function (mk) {
      return outs.reduce(function (a, o, i2) { return a + (mk[i2] ? o.p : 0); }, 0) / totP;
    };
    // 保険＝本線より当てやすい脚。ただし「何か返ってくる場面」を実際に広げる脚だけ入れる（§5.2）
    var MIN_GAIN = 0.01;
    var guards = ladder.filter(function (r) { return r.c.id !== main.c.id && r.pHit > main.pHit; });
    for (var gi = 0; gi < guards.length; gi++) {
      if (rest < 100) break;
      var share = Math.max(100, Math.floor(rest / (guards.length - gi) / 100) * 100);
      var leg = fundLeg(guards[gi], Math.min(share, rest));
      if (!leg) continue;
      if (leg.trimmedFrom) continue;           // 中途半端に削れる保険は足さない
      var mk = maskOf(leg);
      var merged = cover.map(function (c, j) { return c | mk[j]; });
      if (covP(merged) - covP(cover) < MIN_GAIN) continue;
      cover = merged; legs.push(leg); rest -= leg.yen;
    }
    // 余った予算は各脚の単価に100円ずつ乗せて使い切る（本線優先。点数は増やさない）
    var guardLoop = 0;
    while (rest >= 100 && guardLoop++ < 200) {
      var moved = false;
      legs.forEach(function (l) {
        if (rest >= l.pts * 100) { l.unit += 100; l.yen = l.unit * l.pts; rest -= l.pts * 100; moved = true; }
      });
      if (!moved) break;
    }
    return { fam: fam, legs: legs, main: legs[0], hasGuards: guards.length > 0,
      stake: legs.reduce(function (a, l) { return a + l.yen; }, 0), leftover: rest };
  }
  function evalPackage(ctx, pkg, outcomes) {    // 決着を全通り回して束全体の分布を出す
    var outs = outcomes.outs, tot = outcomes.tot;
    var pAny = 0, pPlus = 0, pMain = 0, maxPay = 0, minPay = Infinity, hits = [];
    outs.forEach(function (o) {
      var t = o.t, p = o.p;
      var pay = 0;
      pkg.legs.forEach(function (l) { pay += legPayout(ctx, l, t); });
      var mainPay = legPayout(ctx, pkg.legs[0], t);
      if (mainPay > 0) pMain += p;
      if (pay > 0) { pAny += p; hits.push([pay, p]); if (pay > maxPay) maxPay = pay; if (pay < minPay) minPay = pay; }
      if (pay > pkg.stake) pPlus += p;
    });
    hits.sort(function (a, b) { return a[0] - b[0]; });
    var ht = hits.reduce(function (a, x) { return a + x[1]; }, 0), acc = 0, med = null;
    for (var i = 0; i < hits.length; i++) { acc += hits[i][1]; if (acc >= ht / 2) { med = hits[i][0]; break; } }
    return {
      pAny: pAny / tot, pPlus: pPlus / tot, pMain: pMain / tot, pGuardOnly: (pAny - pMain) / tot,
      pNone: 1 - pAny / tot, med: med, maxPay: maxPay, minPay: minPay === Infinity ? null : minPay,
    };
  }

  // 全券種×全買い方。答えで落ちたものも理由つきで残す（§6.5。結論に全部を含めるための担保）
  function excludeReason(S, c) {
    if (c.type === 'wakuren') return 'オッズ未取得のため候補外';
    if (S.axisMode === 'none' && c.axisN !== 0) return '軸を決めていないため';
    if (S.axisMode !== null && S.axisMode !== 'none' && c.axisN !== S.axis.length) {
      return '軸' + c.axisN + '頭の買い方（いまは' + S.axis.length + '頭）';
    }
    if (S.target !== null && S.target !== 'any' && c.target.indexOf(S.target) === -1) return '「どこまで来るか」の答えに合わない';
    if (S.ordered === false && c.ord === 'yes') return '着順に自信なしと答えたため';
    if (S.ordered === true && c.ord === 'multi') return '着順に自信ありと答えたため';
    return '条件に合わない';
  }
  function allPlans(ctx, S) {
    var q = qprobs(ctx, S);
    var al = {}; alive(ctx, S).forEach(function (c) { al[c.id] = true; });
    return CATALOG.map(function (c) {
      var pl = buildPlan(ctx, S, c, q);
      if (!pl) return { c: c, reason: al[c.id] ? 'この頭数・選択では組めない' : excludeReason(S, c) };
      if (pl.over) return { c: c, pl: pl, reason: '予算オーバー（' + pl.stake.toLocaleString('ja-JP') + '円）' };
      if (!al[c.id]) return { c: c, pl: pl, reason: excludeReason(S, c) };
      return { c: c, pl: pl, reason: null };
    });
  }

  // ===== T3: 初期化・state・eligible =====
  function init(site, oddsAll) {
    var HORSES = site.horses.filter(function (h) { return !h.scratched && h.estimated_prob > 0; });
    var BY = {}, P0 = {};
    HORSES.forEach(function (h) { BY[h.number] = h; P0[h.number] = h.estimated_prob; });
    return { site: site, oddsAll: oddsAll, HORSES: HORSES, HEADS: HORSES.length, BY: BY, P0: P0 };
  }

  // §7: schema_version が odds_all-1.x で、単勝以外に発売中(result)のオッズが1件でもある場合のみ表示
  function eligible(oddsAll) {
    if (!oddsAll) return false;
    if (typeof oddsAll.schema_version !== 'string' || oddsAll.schema_version.indexOf('odds_all-1.') !== 0) return false;
    var st = oddsAll.status || {};
    return Object.keys(st).some(function (k) { return k !== 'tansho' && st[k] === 'result'; });
  }

  function initialState() {
    return {
      axis: [], axisMode: null, kill: [], target: null, ordered: null, partners: [], budget: null,
      taste: null, asked: [], done: false, killOpen: false,
      pick: [], inputRaw: '', pkgW: { hit: 0.7, mid: 0.7, big: 0.7 },
    };
  }
  function setInputRaw(S, raw) { S.inputRaw = raw; }
  function setPkgW(S, fam, pct) { S.pkgW[fam] = Number(pct) / 100; }

  function computeDone(ctx, S) {
    if (S.done) return;
    if (nextQuestion(ctx, S) === null) S.done = true;
  }

  // ===== T3: 馬選択UI =====
  function maxProb(ctx) {
    var m = 0;
    ctx.HORSES.forEach(function (h) { if (h.estimated_prob > m) m = h.estimated_prob; });
    return m;
  }
  // Ans. の確率（estimated_prob）。軸ブースト後の主観確率 q ではない
  function probBar(h, maxP) {
    if (h.estimated_prob == null || !(h.estimated_prob > 0)) return '';
    var w = maxP > 0 ? Math.round(h.estimated_prob / maxP * 100) : 0;
    return '<span class="ak-pb"><span class="v">' + (h.estimated_prob * 100).toFixed(1) + '%</span>'
      + '<span class="bar"><i style="width:' + w + '%"></i></span></span>';
  }
  function horseRow(ctx, S, h, opts) {
    var sel = opts.selected.indexOf(h.number) !== -1;
    var killed = !opts.killMode && S.kill.indexOf(h.number) !== -1;
    var isAxis = !!opts.markAxis && S.axis.indexOf(h.number) !== -1;
    var landmine = !!(opts.killMode && h.landmine_reason);
    var mkCls = MARK_CLASS[h.ability_mark];
    var cls = ['ak-h'];
    if (sel) cls.push('sel');
    if (killed) cls.push('killed');
    if (isAxis) cls.push('axisrow');
    if (landmine) cls.push('landmine');
    var pickAttr = opts.pickAttr || 'data-ak-pick';
    var gradeHtml = h.grade ? '<span class="ak-grade ' + gradeClass(h.grade) + '">' + escapeHtml(gradeDisp(h.grade)) + '</span>' : '';
    var mkHtml = mkCls ? '<span class="ak-mk ' + mkCls + '">' + h.ability_mark + '</span>' : '<span class="ak-mk none">・</span>';
    var tailHtml = isAxis ? '<span class="axischip">軸</span>' : ('<span class="chk' + (opts.radio ? ' radio' : '') + '"></span>');
    var subline = [h.sex_age, h.jockey, h.running_style].filter(Boolean).join(' ');
    return '<button type="button" class="' + cls.join(' ') + '" ' + pickAttr + '="' + h.number + '"' + (isAxis ? ' disabled' : '') + '>'
      + umaBox(h.number, h.gate)
      + mkHtml
      + '<span class="nmwrap"><span class="nm">' + escapeHtml(h.name) + '</span>'
      + '<span class="meta">' + gradeHtml
      + '<span class="od">' + (h.odds != null ? h.odds.toFixed(1) + '倍' : '—') + '</span>'
      + '<span class="pop">' + (h.popularity ? h.popularity + '番人気' : '') + '</span>'
      + '<span>' + escapeHtml(subline) + '</span></span></span>'
      + probBar(h, opts.maxP)
      + tailHtml
      + '</button>';
  }

  function previewPoints(ctx, S) {
    var sel = S.pick;
    if (!sel.length) return '';
    var clone = cloneState(S);
    clone.partners = sel.filter(function (n) { return S.axis.indexOf(n) === -1; });
    var qq = qprobs(ctx, clone);
    var pts = [];
    alive(ctx, clone).forEach(function (c) {
      var pl = buildPlan(ctx, clone, c, qq);
      if (pl) pts.push(pl.pts);
    });
    if (!pts.length) return '';
    var lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts);
    return '<span style="color:var(--cap);font-size:10.5px;display:block;width:100%;margin-top:3px">'
      + '→ 買い目は ' + (lo === hi ? (lo + '点') : (lo + '〜' + hi + '点')) + ' になります</span>';
  }

  // ===== T4: 予算プレビュー（券種名を出さず「1点いくら」だけを見せる） =====
  function budgetPreview(ctx, S) {
    var v = parseYen(S.inputRaw);
    if (v === null) return '<span class="dim">金額を入れてください</span>';
    var q = qprobs(ctx, S);
    var units = [];
    alive(ctx, S).forEach(function (c) {
      var pl = buildPlan(ctx, S, c, q);
      if (!pl || pl.over) return;
      units.push(Math.max(100, Math.floor(v / pl.pts / 100) * 100));
    });
    var tail = '';
    if (units.length) {
      var lo = Math.min.apply(null, units), hi = Math.max.apply(null, units);
      tail = lo === hi
        ? ('　1点 ' + lo.toLocaleString('ja-JP') + '円')
        : ('　1点 ' + lo.toLocaleString('ja-JP') + '〜' + hi.toLocaleString('ja-JP') + '円（点数によって変わります）');
    }
    return '<b>' + v.toLocaleString('ja-JP') + '円</b> として計算します' + tail;
  }

  // ===== T7: カード描画（§6.1〜6.3・買い目の構造表記§6.2） =====
  function numList(ctx, ns) {
    return ns.map(function (n) { return umaBox(n, ctx.BY[n] ? ctx.BY[n].gate : undefined, 'sm'); }).join('<span class="nsep"></span>');
  }
  // 予算で絞って構造が壊れた脚・振替済みの脚は列挙にフォールバック（§6.2）
  function legNotation(ctx, S, leg) {
    if (leg.trimmedFrom || leg.swapped) return null;
    var A = S.axis.slice(), P = S.partners.slice();
    var ar = '<span class="cbsep">→</span>', da = '<span class="cbsep">-</span>', mu = '<span class="cbsep">⇄</span>';
    var box = function (ns) { return numList(ctx, ns) + '<span class="boxtag">BOX</span>'; };
    switch (leg.c.id) {
      case 'tan1': case 'fuku1': return numList(ctx, A);
      case 'widenag': case 'urennag': case 'spkax1': return numList(ctx, A) + da + numList(ctx, P);
      case 'widef': case 'urenf': return numList(ctx, A) + da + numList(ctx, A.concat(P));
      case 'spkax2': return numList(ctx, A) + da + numList(ctx, P);
      case 'widebox': case 'urenbox': case 'spkbox': case 'utanbox': case 'stnbox': return box(P);
      case 'utannag': return numList(ctx, A) + ar + numList(ctx, P);
      case 'utannag2': return numList(ctx, P) + ar + numList(ctx, A);
      case 'utanmul': case 'stnmul': return numList(ctx, A) + mu + numList(ctx, P);
      case 'stnax1': return numList(ctx, A) + ar + numList(ctx, P) + ar + numList(ctx, P);
      case 'stnax2': return numList(ctx, P) + ar + numList(ctx, A) + ar + numList(ctx, P);
      case 'stnax3': return numList(ctx, P) + ar + numList(ctx, P) + ar + numList(ctx, A);
      case 'stnax12': return numList(ctx, [A[0]]) + ar + numList(ctx, [A[1]]) + ar + numList(ctx, P);
      case 'stnf': return numList(ctx, [A[0]]) + ar + numList(ctx, P) + ar + numList(ctx, P);
      default: return null;
    }
  }
  function nameOf(ctx, n) { return n + '番' + (ctx.BY[n] ? ctx.BY[n].name : ''); }
  function joinNums(ns) { return ns.map(function (n) { return n + '番'; }).join('・'); }
  function winCondition(ctx, S, leg) {
    var A = S.axis.slice(), P = S.partners.slice();
    var a = A.map(function (n) { return nameOf(ctx, n); }).join('と');
    var a0 = A[0] != null ? nameOf(ctx, A[0]) : '';
    var a1 = A[1] != null ? nameOf(ctx, A[1]) : '';
    var p = joinNums(P);
    var T = {
      tan1: function () { return a + 'が1着'; },
      fuku1: function () { return a + 'が3着以内'; },
      widenag: function () { return a + 'と、' + p + 'のどれか1頭が、そろって3着以内'; },
      widef: function () { return a0 + 'か' + a1 + 'を含む2頭が3着以内（相手は' + p + '）'; },
      widebox: function () { return p + 'のうち2頭が3着以内'; },
      urennag: function () { return '1着2着が' + a + 'と、' + p + 'のどれか1頭'; },
      urenf: function () { return '1着2着の片方が' + a0 + 'か' + a1 + '、もう片方が' + p + 'かもう一方の軸'; },
      urenbox: function () { return '1着2着がそろって' + p + 'の中'; },
      utannag: function () { return a + 'が1着で、2着が' + p + 'のどれか'; },
      utannag2: function () { return a + 'が2着で、1着が' + p + 'のどれか'; },
      utanmul: function () { return '1着2着が' + a + 'と' + p + 'のどれか1頭（順番は問わない）'; },
      utanbox: function () { return '1着2着がそろって' + p + 'の中（順番は問わない）'; },
      spkax1: function () { return a + 'が3着以内で、残り2つを' + p + 'が占める'; },
      spkax2: function () { return a0 + 'と' + a1 + 'がそろって3着以内で、残り1つが' + p + 'のどれか'; },
      spkbox: function () { return '上位3頭がすべて' + p + 'の中'; },
      stnax1: function () { return a + 'が1着で、2着3着を' + p + 'が占める'; },
      stnax2: function () { return a + 'が2着で、1着3着を' + p + 'が占める'; },
      stnax3: function () { return a + 'が3着で、1着2着を' + p + 'が占める'; },
      stnax12: function () { return a0 + 'が1着、' + a1 + 'が2着、3着が' + p + 'のどれか'; },
      stnmul: function () { return a + 'と' + p + 'のうち2頭で上位3頭（着順は問わない）'; },
      stnbox: function () { return '上位3頭がすべて' + p + 'の中（着順は問わない）'; },
      stnf: function () { return a0 + 'が1着で、2着3着が' + p + 'のどれか2頭'; },
      _swap: function () { return '買った3頭が上位3着を占める（着順は問わない）'; },
    };
    var f = T[leg.c.id];
    if (!f) return '';
    return f() + (leg.trimmedFrom ? '（予算の都合で一部の組だけ）' : '');
  }

  // 1点しか出ない買い方は券種名だけで呼ぶ（実体は通常買い。§6.1）
  function wayLabel(c, pl) {
    if (pl.pts <= 1) return '';
    return c.name.replace(TYPE_LABEL[c.type], '').trim();
  }
  function legPayRange(l) {
    var v = l.rows.filter(function (r) { return r.odds != null; }).map(function (r) { return r.odds * l.unit; });
    if (!v.length) return null;
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
    return lo === hi
      ? ('当たれば <b>' + Math.round(lo).toLocaleString('ja-JP') + '円</b>')
      : ('当たれば <b>' + Math.round(lo).toLocaleString('ja-JP') + '〜' + Math.round(hi).toLocaleString('ja-JP') + '円</b>');
  }
  function legRow(ctx, S, l, isMain) {
    var note = legNotation(ctx, S, l);
    var seq = function (type, ids) {
      return ids.map(function (n) { return umaBox(n, ctx.BY[n] ? ctx.BY[n].gate : undefined, 'sm'); })
        .join('<span class="cbsep">' + (ORDERED[type] ? '→' : '-') + '</span>');
    };
    var bodyHtml;
    if (note) {
      bodyHtml = '<div class="lnote">' + note + '</div>';
    } else {
      var shown = l.rows.slice(0, 6);
      bodyHtml = '<div class="lcombos">' + shown.map(function (r) {
        return '<span class="cb">' + seq(l.c.type, r.ids) + '<span class="oz">' + (r.odds != null ? r.odds.toFixed(1) : '—') + '</span></span>';
      }).join('') + (l.rows.length > 6 ? ('<span class="lmore">…他' + (l.rows.length - 6) + '点</span>') : '') + '</div>';
    }
    var payRange = legPayRange(l);
    return '<div class="leg' + (isMain ? ' main' : '') + '">'
      + '<div class="lh"><span class="lname">' + (isMain ? '<span class="mainchip">本線</span>' : '') + escapeHtml(TYPE_LABEL[l.c.type])
      + (wayLabel(l.c, l) ? ('<span class="lway">' + escapeHtml(wayLabel(l.c, l)) + '</span>') : '') + '</span>'
      + '<span class="lamt">' + l.pts + '点 × ' + l.unit.toLocaleString('ja-JP') + '円 = <b>' + l.yen.toLocaleString('ja-JP') + '円</b></span></div>'
      + bodyHtml
      + (payRange ? ('<div class="lpay">' + payRange + '</div>') : '')
      + (l.trimmedFrom ? ('<div class="ltrim">本来' + l.trimmedFrom + '点の買い方を、予算内で確率の高い' + l.pts + '点に絞ったため、上は1点ずつの表示です</div>') : '')
      + '</div>';
  }

  function times(p) {
    if (!(p > 0)) return '—';
    var n = Math.round(1 / p);
    return n <= 1 ? 'ほぼ毎回' : (n + '回に1回');
  }
  function mainPayStats(pkg) {
    var l = pkg.legs[0];
    var v = l.rows.filter(function (r) { return r.odds != null; }).map(function (r) { return { pay: r.odds * l.unit, p: r.p }; });
    if (!v.length) return { med: null, lo: null, hi: null };
    v.sort(function (a, b) { return a.pay - b.pay; });
    var tot = v.reduce(function (a, x) { return a + x.p; }, 0), acc = 0, med = v[0].pay;
    for (var i = 0; i < v.length; i++) { acc += v[i].p; if (acc >= tot / 2) { med = v[i].pay; break; } }
    return { med: med, lo: v[0].pay, hi: v[v.length - 1].pay };
  }
  // §6.3: 数字は2つ＋1行。束のときの見出し金額は必ず本線基準にすること
  function statsBlock(ctx, S, ev, pkg, m) {
    var mp = mainPayStats(pkg);
    var tight = ev.pPlus < ev.pAny * 0.99;
    var line = tight
      ? ('<div class="say warn">プラスになるのは <b>' + times(ev.pPlus) + '</b>。当たっても元が取れないことが多い買い方です。</div>')
      : '<div class="say ok">当たればかならずプラスになります。</div>';
    var G = pkg.legs.length > 1;
    return '<div class="stats two">'
      + '<div class="st"><div class="k">' + (G ? '本線が当たる' : 'どれくらい当たる') + '</div>'
      + '<div class="v">' + times(G ? ev.pMain : ev.pAny) + '</div>'
      + '<div class="d">' + (G ? ('保険こみなら ' + times(ev.pAny)) : fmtPercent(ev.pAny)) + '</div></div>'
      + '<div class="st"><div class="k">' + (G ? '本線が当たると' : '当たるといくら') + '</div>'
      + '<div class="v">' + fmtYen(mp.med) + '</div>'
      + '<div class="d">' + (mp.lo === mp.hi ? '' : (fmtYen(mp.lo) + '〜' + fmtYen(mp.hi))) + '</div></div></div>'
      + line
      + '<details class="more"><summary>くわしい数字</summary><div class="mb">'
      + '<div class="mrow"><span>当たる確率</span><b>' + fmtPercent(ev.pAny) + '</b></div>'
      + '<div class="mrow"><span>プラスになる確率</span><b>' + fmtPercent(ev.pPlus) + '</b></div>'
      + '<div class="mrow"><span>払戻のはば（束ぜんぶ）</span><b>' + fmtYen(ev.minPay) + ' 〜 ' + fmtYen(ev.maxPay) + '</b></div>'
      + '<div class="mrow"><span>返るときの中央値（束ぜんぶ）</span><b>' + fmtYen(ev.med) + '</b></div>'
      + (G ? ('<div class="mrow"><span>本線だけが当たる</span><b>' + fmtPercent(ev.pMain) + '</b></div>'
        + '<div class="mrow"><span>保険だけで終わる</span><b>' + fmtPercent(ev.pGuardOnly) + '</b></div>') : '')
      + '<div class="mrow"><span>ぜんぶ外れる</span><b>' + fmtPercent(ev.pNone) + '</b></div>'
      + '<div class="mcond" style="color:var(--cap);font-size:10.5px">複勝とワイドの払戻は、幅のあるオッズの低い方で計算しています。</div>'
      + '<div class="mcond">' + (G ? '本線が当たる条件：' : '当たる条件：') + escapeHtml(winCondition(ctx, S, m)) + '</div>'
      + '</div></details>';
  }

  function warnFor(c, pl) {
    if (c.ord === 'multi' && c.type === 'umatan') {
      return '<div class="warn"><b>マルチは損になりやすい買い方です。</b>同じ狙いを馬連で買うと点数が半分。'
        + '着順を <b>53.8%</b> 以上当てられる自信がなければ馬連の方が有利です（実測）。</div>';
    }
    if (c.ord === 'multi' && c.type === 'sanrentan') {
      return '<div class="warn"><b>マルチは損になりやすい買い方です。</b>実測で <b>63.7%</b> のケースが3連複に負けています。'
        + '同じ3頭なら3連複の方が安く同じ事象を買えます。</div>';
    }
    if (c.name && c.name.indexOf('ボックス') !== -1) {
      return '<div class="warn">ボックスは<b>買う必要のない目まで自動的に買わされます</b>。'
        + '上の点数のうち、自分では要らないと思う組が混じっていないか確認してください。</div>';
    }
    if (c.type === 'wakuren') {
      return '<div class="warn">枠連のオッズは未取得のため払戻が出せません。'
        + '<b>同じ枠に2頭入る馬連を買うときは、枠連のオッズも見て高い方で買ってください</b>（実測 +5.0%。66本の研究で唯一残った利益）。</div>';
    }
    if (pl.pRecover != null && pl.pHit != null && pl.pRecover < pl.pHit * 0.999) {
      return '<div class="warn">当たっても<b>元が取れない目（トリガミ）</b>が混じっています。上の「元が取れる確率」を確認してください。</div>';
    }
    return '';
  }

  // ===== T8: 全券種一覧・枠連ヒント・注意書き（§6.4・§6.5・§6.6） =====
  function renderAllPlans(ctx, S, R) {
    var chosen = {};
    Object.keys(R).forEach(function (f) { if (R[f]) chosen[R[f].c.id] = true; });
    var rows = allPlans(ctx, S);
    var live = rows.filter(function (r) { return r.pl && !r.reason; }).sort(function (a, b) { return b.pl.score - a.pl.score; });
    var dead = rows.filter(function (r) { return !(r.pl && !r.reason); });
    var line = function (r) {
      var c = r.c, pl = r.pl;
      return '<tr class="' + (r.reason ? 'dim' : '') + '">'
        + '<td class="l">' + (chosen[c.id] ? '<span class="pick3">3選</span>' : '') + escapeHtml(c.name) + '</td>'
        + '<td>' + (pl ? (pl.trimmedFrom ? (pl.pts + '点<span class="tr">/' + pl.trimmedFrom + '</span>') : (pl.pts + '点')) : '—') + '</td>'
        + '<td>' + (pl ? (pl.unit > 100 ? (pl.unit.toLocaleString('ja-JP') + '円') : '100円') : '—') + '</td>'
        + '<td>' + (pl ? fmtPercent(pl.pHit) : '—') + '</td>'
        + '<td>' + (pl && pl.med != null ? fmtYen(pl.med) : '—') + '</td>'
        + '<td>' + (pl ? fmtPercent(pl.pRecover) : '—') + '</td>'
        + '<td class="l rz">' + (r.reason ? escapeHtml(r.reason) : '') + '</td></tr>';
    };
    return '<details class="ak-alive" style="margin-top:14px"><summary>全券種・全買い方の一覧（' + CATALOG.length + '通り）</summary>'
      + '<div class="alive-body" style="padding:0"><table class="alltbl">'
      + '<thead><tr><th class="l">買い方</th><th>点数</th><th>1点</th><th>当たる</th><th>払戻中央</th><th>元取れ</th><th class="l">除外理由</th></tr></thead>'
      + '<tbody>' + live.map(line).join('') + dead.map(line).join('') + '</tbody></table>'
      + '<div class="allnote">上段＝いまの答えで買える買い方（おすすめ順）。下段＝答えで落ちたもの。'
      + '点数の「5点/10」は、本来10点になる買い方を予算に合わせて確率上位5点に絞ったという意味です。'
      + 'マルチ系は残っていても採点で上位に来ません（馬単マルチは馬連に、3連単マルチは3連複に構造的に負けるため）。</div></div></details>';
  }
  // 同じ枠に2頭入る馬連があるときだけ、枠連との比較を促す（§6.4。66本の研究で唯一残った実利 +5.0%）
  function wakuHint(ctx, S) {
    if (!S.axis.length || !S.partners.length) return '';
    var axisHorse = ctx.BY[S.axis[0]];
    if (!axisHorse) return '';
    var g = axisHorse.gate;
    var same = S.partners.filter(function (n) { return ctx.BY[n] && ctx.BY[n].gate === g; });
    if (!same.length) return '';
    return '<div class="note" style="background:#FFF8E8"><b>枠連も見てください。</b>'
      + umaBox(S.axis[0], g, 'sm') + same.map(function (n) { return umaBox(n, ctx.BY[n].gate, 'sm'); }).join('')
      + 'は同じ' + g + '枠です。この組を馬連で買うときは<b>枠連のオッズも確認し、高い方で買ってください</b>（実測 +5.0%）。'
      + '当サイトは枠連のオッズを取得していないため、上の推奨には含めていません。</div>';
  }

  function renderResults(ctx, S) {
    var q = qprobs(ctx, S);
    var outcomes = allOutcomes(q);
    var budget = (typeof S.budget === 'number' && S.budget > 0) ? S.budget : 1000;
    var pkgs = {};
    ['hit', 'mid', 'big'].forEach(function (f) { pkgs[f] = buildPackage(ctx, S, f, q, budget, S.pkgW[f], outcomes); });
    var shown = ['hit', 'mid', 'big'].filter(function (f) { return !!pkgs[f]; });

    if (!shown.length) {
      return '<div class="res-head">おすすめの買い方 0選</div>'
        + '<div class="ak-empty">いまの条件では組める買い方がありません。ひとつ戻って条件を変えてください。</div>';
    }

    var cards = shown.map(function (f) {
      var pkg = pkgs[f];
      var ev = evalPackage(ctx, pkg, outcomes);
      var m = pkg.main;
      var legsHtml = pkg.legs.map(function (l, j) { return legRow(ctx, S, l, j === 0); }).join('');
      var warn = warnFor(m.c, m);
      var memo = m.c.memo ? ('<div class="ctrl">実測メモ：' + escapeHtml(m.c.memo) + '</div>') : '';
      var wPct = Math.round(S.pkgW[f] * 100);
      var bandType = m.c.type;
      return '<div class="rc">'
        + '<div class="band b-' + bandType + '">'
        + '<span class="bl"><span class="fam">' + FAM_LABEL[f] + '</span>'
        + '<span class="ttl">' + escapeHtml(TYPE_LABEL[bandType]) + (wayLabel(m.c, m) ? ('<span class="way">' + escapeHtml(wayLabel(m.c, m)) + '</span>') : '') + '</span></span>'
        + '<span class="pts">' + (pkg.legs.length > 1 ? (pkg.legs.length + '本立て<br>') : '')
        + '計 ' + pkg.stake.toLocaleString('ja-JP') + '円'
        + (pkg.leftover >= 100 ? ('<br><span class="unit">余り ' + pkg.leftover.toLocaleString('ja-JP') + '円</span>') : '')
        + '</span></div>'
        + '<div class="legs">' + legsHtml + '</div>'
        + statsBlock(ctx, S, ev, pkg, m)
        + (pkg.hasGuards ? (
          '<div class="slider"><div class="sl-lbl"><span>保険に厚く</span>'
          + '<span class="sl-val">本線 <b id="ak-w-' + f + '">' + wPct + '</b>%</span><span>本線に厚く</span></div>'
          + '<input type="range" min="30" max="100" step="10" value="' + wPct + '" data-ak-w="' + f + '"></div>'
        ) : '')
        + warn + memo
        + '<div class="act"><button type="button" class="ak-btn sm" data-ak-load="' + f + '">シミュレーターに入れる</button>'
        + '<button type="button" class="ak-btn ghost sm">他の案を見る</button></div>'
        + '</div>';
    }).join('');

    var R = {};
    shown.forEach(function (f) { R[f] = { c: pkgs[f].main.c }; });

    return '<div class="res-head">おすすめの買い方 ' + shown.length + '選</div>'
      + '<div class="res-sub">1枚が1本とはかぎりません。スライダーで保険の厚みを変えられます。</div>'
      + cards
      + renderAllPlans(ctx, S, R)
      + wakuHint(ctx, S)
      + '<div class="note"><b>勝てる買い目ではありません。</b>あなたの予想を買い目の形に直しただけです。<br>'
      + '<b>保険をつけても得はしません。</b>減るのは「何も返らない日」だけで、勝つ回数は増えません。'
      + '<details class="more" style="margin-top:6px"><summary>根拠</summary><div class="mb" style="padding-top:6px">'
      + '9,829レース×2,320通りを総当たりしても、回収率が1.0を超えた買い方はひとつもありませんでした（控除率20.8%）。'
      + '券種を混ぜた結果は必ず各成分の間の値になります。<br>もっとも損の浅い買い方は ◎複勝1点で、的中52.4%・回収率0.834でした。'
      + '</div></details></div>'
      + '<div class="restart"><button type="button" class="ak-btn gray" data-ak-restart>最初からやり直す</button></div>';
  }

  function renderAlive(ctx, S) {
    var al = {}; alive(ctx, S).forEach(function (c) { al[c.id] = true; });
    var grp = { hit: [], mid: [], big: [] };
    CATALOG.forEach(function (c) { grp[c.fam].push(c); });
    var body = ['hit', 'mid', 'big'].map(function (f) {
      return '<div class="alive-grp">' + FAM_LABEL[f] + '</div><div class="alive-chips">'
        + grp[f].map(function (c) { return '<span class="achip' + (al[c.id] ? '' : ' dead') + '">' + escapeHtml(c.name) + '</span>'; }).join('')
        + '</div>';
    }).join('');
    var n = Object.keys(al).length;
    return '<details class="ak-alive"><summary>残っている買い方を見る（' + n + '/' + CATALOG.length + '）</summary>'
      + '<div class="alive-body">' + body + '</div></details>';
  }

  function renderKillBar(ctx, S) {
    var listHtml = S.kill.length
      ? S.kill.map(function (n) {
        var h = ctx.BY[n];
        return h ? (umaBox(n, h.gate, 'sm') + '<span class="killnm">' + escapeHtml(h.name) + '</span>') : '';
      }).join('')
      : '<span class="hint">いつでも押せます（質問の途中でも結果を見たあとでも）</span>';
    var bar = '<div class="ak-bar"><span class="lbl">気に入らない馬を消す</span>'
      + '<span class="killed">' + listHtml + '</span>'
      + '<button type="button" class="ak-mini' + (S.killOpen ? ' on' : '') + '" data-ak-kill-toggle style="margin-left:auto">'
      + (S.killOpen ? '閉じる' : '消す馬を選ぶ') + '</button></div>';
    var panel = '';
    if (S.killOpen) {
      var rows = ctx.HORSES.slice().sort(function (a, b) { return a.number - b.number; })
        .map(function (h) { return horseRow(ctx, S, h, { selected: S.kill, killMode: true, pickAttr: 'data-ak-kill', maxP: maxProb(ctx) }); }).join('');
      panel = '<div class="ak-card" style="margin-bottom:12px"><div class="ak-q"><div class="q" style="font-size:14px">消す馬を選ぶ</div>'
        + '<div class="s">選んだ馬の確率を大きく下げ、買い目からも外します。Ans.が地雷と判定した馬は<b style="color:var(--live)">赤枠</b>で出します。</div></div>'
        + '<div class="ak-hlist">' + rows + '</div></div>';
    }
    return bar + panel;
  }

  function renderQuestion(ctx, S) {
    var Q = nextQuestion(ctx, S);
    if (!Q) return renderResults(ctx, S) + renderAlive(ctx, S); // computeDone()が既にS.doneをtrueにしている前提
    var askedIdx = -1;
    for (var i = 0; i < QUESTIONS.length; i++) { if (QUESTIONS[i].key === Q.key) { askedIdx = i; break; } }
    var dots = QUESTIONS.map(function (x, i2) { return '<i class="' + (i2 <= askedIdx ? 'on' : '') + '"></i>'; }).join('');
    var n = alive(ctx, S).length;

    var body = '';
    if (Q.kind === 'horse') {
      var list = ctx.HORSES.filter(function (h) { return S.kill.indexOf(h.number) === -1; })
        .sort(function (a, b) { return a.number - b.number; });
      body = '<div class="ak-hlist">' + list.map(function (h) {
        return horseRow(ctx, S, h, { selected: S.pick, radio: Q.max === 1, markAxis: Q.key === 'partners', maxP: maxProb(ctx) });
      }).join('') + '</div>';
      var extras = (Q.extra || []).map(function (e) {
        return '<button type="button" class="ak-opt" data-ak-extra="' + e.value + '" style="border-top:1px solid var(--rule)">'
          + '<span class="oi">›</span><span class="obody"><span class="ol">' + escapeHtml(e.label) + '</span>'
          + (e.desc ? ('<span class="od">' + escapeHtml(e.desc) + '</span>') : '') + '</span></button>';
      }).join('');
      body += extras;
      var pickedHtml = S.pick.length
        ? S.pick.map(function (n2) { return umaBox(n2, ctx.BY[n2] ? ctx.BY[n2].gate : undefined, 'sm') + '<b>' + escapeHtml(ctx.BY[n2] ? ctx.BY[n2].name : '') + '</b>'; }).join('　')
        : '<span style="color:var(--cap)">まだ選んでいません</span>';
      var cnt = Q.key === 'partners' ? previewPoints(ctx, S) : '';
      body += '<div class="ak-foot"><span class="picked">' + pickedHtml + cnt + '</span>'
        + '<button type="button" class="ak-btn" data-ak-go' + (S.pick.length ? '' : ' disabled') + '>次へ</button></div>';
    } else if (Q.kind === 'input') {
      body = '<div class="ak-input">'
        + '<input type="text" id="ak-budget-input" inputmode="numeric" autocomplete="off" '
        + 'placeholder="例）5000／1万／3千円くらい" value="' + escapeHtml(S.inputRaw) + '">'
        + '<div class="parsed" id="ak-budget-parsed">' + budgetPreview(ctx, S) + '</div></div>'
        + '<button type="button" class="ak-opt" data-ak-opt="0" style="border-top:1px solid var(--rule)">'
        + '<span class="oi">›</span><span class="obody"><span class="ol">決めていない</span></span></button>'
        + '<div class="ak-foot"><span class="picked"></span>'
        + '<button type="button" class="ak-btn" data-ak-go-input' + (parseYen(S.inputRaw) ? '' : ' disabled') + '>次へ</button></div>';
    } else {
      var opts = optsFor(S, Q);
      body = '<div class="ak-opts">' + opts.map(function (o) {
        return '<button type="button" class="ak-opt' + (o.skip ? ' skip' : '') + '" data-ak-opt="' + o.value + '">'
          + '<span class="oi">›</span><span class="obody"><span class="ol">' + escapeHtml(o.label) + '</span>'
          + (o.desc ? ('<span class="od">' + escapeHtml(o.desc) + '</span>') : '') + '</span></button>';
      }).join('') + '</div>';
    }

    var qText = Q.qf ? Q.qf(S) : Q.q;
    var sText = Q.sf ? Q.sf(S) : (Q.s || '');
    return '<div class="ak-prog"><span class="ak-step">質問 ' + (S.asked.length + 1) + '</span>'
      + '<span class="ak-cand">残っている買い方 <b>' + n + '</b> / ' + CATALOG.length + ' 通り</span></div>'
      + '<div class="ak-dots">' + dots + '</div>'
      + '<div class="ak-card"><div class="ak-q"><div class="q">' + escapeHtml(qText) + '</div><div class="s">' + escapeHtml(sText) + '</div></div>' + body + '</div>'
      + (S.asked.length ? '<div class="restart"><button type="button" class="ak-btn gray sm" data-ak-back>ひとつ戻る</button></div>' : '')
      + renderAlive(ctx, S);
  }

  function render(ctx, S) {
    computeDone(ctx, S);
    // 見出しはタブ側が担うので出さない
    var head = '<div class="om-note">質問に答えていくと、券種と買い方が自動で絞られます。'
      + '設問数は固定ではなく、答えによって変わります。数字はすべて実データ（確率＋オッズ）で計算しています。</div>';
    var body = S.done ? (renderResults(ctx, S) + renderAlive(ctx, S)) : renderQuestion(ctx, S);
    return '<div class="ak-wrap">' + head + renderKillBar(ctx, S) + '<div class="ak-root">' + body + '</div></div>';
  }

  // ===== T9: イベント処理（race.js側のイベント委譲から呼ばれる） =====
  // 戻り値: null=未処理（rerender不要） / {} = 状態変化のみ（rerender要） /
  //         {plan: {...}} = 状態変化＋Simulator.applyPlan(state, plan)へ渡してほしい
  function handleClick(ctx, S, target) {
    var el;

    el = target.closest('[data-ak-kill-toggle]');
    if (el) { S.killOpen = !S.killOpen; return {}; }

    el = target.closest('[data-ak-kill]');
    if (el) {
      var nk = Number(el.getAttribute('data-ak-kill'));
      S.kill = S.kill.indexOf(nk) !== -1 ? S.kill.filter(function (x) { return x !== nk; }) : S.kill.concat([nk]);
      S.axis = S.axis.filter(function (x) { return S.kill.indexOf(x) === -1; });
      S.partners = S.partners.filter(function (x) { return S.kill.indexOf(x) === -1; });
      return {};
    }

    el = target.closest('[data-ak-pick]');
    if (el) {
      if (el.hasAttribute('disabled')) return null;
      var Q = S.done ? null : nextQuestion(ctx, S);
      if (!Q) return null;
      var np = Number(el.getAttribute('data-ak-pick'));
      if (Q.max === 1) {
        S.pick = S.pick.indexOf(np) !== -1 ? [] : [np];
      } else if (S.pick.indexOf(np) !== -1) {
        S.pick = S.pick.filter(function (x) { return x !== np; });
      } else if (S.pick.length < Q.max) {
        S.pick = S.pick.concat([np]);
      }
      return {};
    }

    el = target.closest('[data-ak-extra]');
    if (el) {
      var Qe = nextQuestion(ctx, S);
      if (!Qe) return null;
      S.asked.push(Qe.key);
      Qe.apply(S, el.getAttribute('data-ak-extra'));
      S.pick = [];
      return {};
    }

    el = target.closest('[data-ak-go]');
    if (el) {
      var Qg = nextQuestion(ctx, S);
      if (!Qg || !S.pick.length) return null;
      S.asked.push(Qg.key);
      Qg.apply(S, S.pick.slice());
      S.pick = [];
      return {};
    }

    el = target.closest('[data-ak-opt]');
    if (el) {
      var Qo = nextQuestion(ctx, S);
      if (!Qo) return null;
      var raw = el.getAttribute('data-ak-opt');
      var v = raw === 'true' ? true : raw === 'false' ? false : (/^-?\d+$/.test(raw) ? Number(raw) : raw);
      S.asked.push(Qo.key);
      Qo.apply(S, v);
      S.pick = [];
      return {};
    }

    el = target.closest('[data-ak-go-input]');
    if (el) {
      var Qi = nextQuestion(ctx, S);
      if (!Qi) return null;
      var val = parseYen(S.inputRaw);
      if (!val) return null;
      S.asked.push(Qi.key);
      Qi.apply(S, val);
      S.inputRaw = '';
      return {};
    }

    el = target.closest('[data-ak-back]');
    if (el) {
      var k = S.asked.pop();
      if (k === 'axis') { S.axis = []; S.axisMode = null; } else if (k === 'partners') { S.partners = []; }
      else if (k === 'budget') { S.budget = null; S.inputRaw = ''; } else if (k) { S[k] = null; }
      S.pick = [];
      S.done = false;
      return {};
    }

    el = target.closest('[data-ak-restart]');
    if (el) {
      var kill = S.kill.slice();
      var fresh = initialState();
      fresh.kill = kill;
      Object.keys(S).forEach(function (kk) { delete S[kk]; });
      Object.keys(fresh).forEach(function (kk) { S[kk] = fresh[kk]; });
      return {};
    }

    el = target.closest('[data-ak-load]');
    if (el) {
      var fam = el.getAttribute('data-ak-load');
      var q = qprobs(ctx, S);
      var budget = (typeof S.budget === 'number' && S.budget > 0) ? S.budget : 1000;
      var outcomes = allOutcomes(q);
      var pkg = buildPackage(ctx, S, fam, q, budget, S.pkgW[fam] || 0.7, outcomes);
      if (!pkg) return null;
      var leg = pkg.legs[0];
      var plan = leg.swapped
        ? { catalogId: '_swap', axis: S.axis.slice(), partners: S.partners.slice(), swapIds: leg.rows[0].ids.slice() }
        : { catalogId: leg.c.id, axis: S.axis.slice(), partners: S.partners.slice() };
      return { plan: plan };
    }

    return null;
  }

  var Akinator = {
    init: init,
    eligible: eligible,
    initialState: initialState,
    setInputRaw: setInputRaw,
    setPkgW: setPkgW,
    parseYen: parseYen,
    budgetPreviewHtml: budgetPreview,
    render: render,
    handleClick: handleClick,
    // テスト用に内部関数も公開（Node crosscheck・単体確認向け。UIからは呼ばない）
    _internal: {
      CATALOG: CATALOG,
      QUESTIONS: QUESTIONS,
      alive: alive,
      splits: splits,
      nextQuestion: nextQuestion,
      qprobs: qprobs,
      buildPlan: buildPlan,
      buildPackage: buildPackage,
      evalPackage: evalPackage,
      allOutcomes: allOutcomes,
      blocksOf: blocksOf,
      fundLeg: fundLeg,
      swapToSanrenpuku: swapToSanrenpuku,
      allPlans: allPlans,
    },
  };

  if (typeof window !== 'undefined') {
    window.Akinator = Akinator;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Akinator;
  }
})();
