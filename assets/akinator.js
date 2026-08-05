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
  // 107 §7.5b: 「リスクとリターンに見合う」の下限。当たっても合計投資額のこの倍数に
  //   届かない買い方は本線にしない。「とにかく当てたい」は当てること自体が目的なので下限なし。
  //   値に実測の裏づけはない（複勝1.3倍を本線から外すために引いた線。ユーザー判断 2026-08-05）
  var MIN_MULT = { hit: 0, mid: 1.5, big: 2.5 };
  var MIN_MULT_JA = { hit: null, mid: '1.5倍', big: '2.5倍' };
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
  // 107-spec §4.2: axisReq = 軸に要求する集合 / slots = 相手に要求する枠の集合。
  //   W=1着枠に置ける / R=2着枠に置ける / P=3着枠に置ける（W ⊆ R ⊆ P）
  //   build() が受け取る S は sieveState() が作った代理で、S.partners は
  //   その買い方の枠を満たす馬だけ、S.slotPartners[i] は slots[i] ごとの集合。
  var CATALOG = [
    // --- 当てにいく ---
    { id: 'tan1', fam: 'hit', type: 'tansho', name: '単勝', axisN: 1, axisReq: ['W'], slots: [], ord: 'no',
      build: function (S) { return [[S.axis[0]]]; },
      memo: '80倍超は切る（実測0.402）。1.0〜1.5倍が最良帯0.893' },
    { id: 'fuku1', fam: 'hit', type: 'fukusho', name: '複勝', axisN: 1, axisReq: ['P'], slots: [], ord: 'no',
      build: function (S) { return [[S.axis[0]]]; },
      memo: '印だけで買う2320通りの総当たりで最良（的中52.4%・ROI 0.834）' },
    { id: 'widenag', fam: 'hit', type: 'wide', name: 'ワイド 軸1頭ながし', axisN: 1, axisReq: ['P'], slots: ['P'], ord: 'no',
      build: function (S) { return S.partners.map(function (p) { return [S.axis[0], p]; }); } },
    { id: 'widef', fam: 'hit', type: 'wide', name: 'ワイド 軸2頭ながし', axisN: 2, axisReq: ['P', 'P'], slots: ['P'], ord: 'no',
      build: function (S) {
        var o = [[S.axis[0], S.axis[1]]];
        S.partners.forEach(function (p) { o.push([S.axis[0], p]); o.push([S.axis[1], p]); });
        return o;
      },
      memo: '◎○2軸流し0.807。同点数の人気順対照0.796をわずかに上回る' },
    { id: 'widebox', fam: 'hit', type: 'wide', name: 'ワイド ボックス', axisN: 0, axisReq: [], slots: ['P', 'P', 'P'], ord: 'no',
      build: function (S) { return combos(S.partners, 2); },
      memo: '印5頭10点で的中71.1%・0.800。基準線0.775を超えた数少ない例' },
    // --- 中核 ---
    { id: 'urennag', fam: 'mid', type: 'umaren', name: '馬連 ながし', axisN: 1, axisReq: ['R'], slots: ['R'], ord: 'no',
      build: function (S) { return S.partners.map(function (p) { return [S.axis[0], p]; }); } },
    { id: 'urenf', fam: 'mid', type: 'umaren', name: '馬連 フォーメーション', axisN: 2, axisReq: ['R', 'R'], slots: ['R'], ord: 'no',
      build: function (S) {
        var o = [[S.axis[0], S.axis[1]]];
        S.partners.forEach(function (p) { o.push([S.axis[0], p]); o.push([S.axis[1], p]); });
        return o;
      } },
    { id: 'urenbox', fam: 'mid', type: 'umaren', name: '馬連 ボックス', axisN: 0, axisReq: [], slots: ['R', 'R', 'R'], ord: 'no',
      build: function (S) { return combos(S.partners, 2); },
      memo: '印3頭0.744。動画12/12本がボックスを否定' },
    { id: 'wakunag', fam: 'mid', type: 'wakuren', name: '枠連 ながし', axisN: 1, axisReq: ['R'], slots: ['R'], ord: 'no',
      build: function (S, BY) {
        var g = BY[S.axis[0]].gate;
        var set = [];
        S.partners.forEach(function (p) { var f = BY[p].gate; if (set.indexOf(f) === -1) set.push(f); });
        return set.map(function (f) { return [g, f]; });
      },
      memo: '枠連オッズは未取得のため払戻を出せない' },
    { id: 'utannag', fam: 'mid', type: 'umatan', name: '馬単 1着軸ながし', axisN: 1, axisReq: ['W'], slots: ['R'], ord: 'yes',
      build: function (S) { return S.partners.map(function (p) { return [S.axis[0], p]; }); },
      memo: '◎1着固定→印3頭 2点で0.853。印ベースで2番目に良い行' },
    { id: 'utannag2', fam: 'mid', type: 'umatan', name: '馬単 2着軸ながし', axisN: 1, axisReq: ['R'], slots: ['W'], ord: 'yes',
      build: function (S) { return S.partners.map(function (p) { return [p, S.axis[0]]; }); } },
    // マルチは順序を主張していないので、要求は馬連と同じ（107 §4.1）
    { id: 'utanmul', fam: 'mid', type: 'umatan', name: '馬単 ながしマルチ', axisN: 1, axisReq: ['R'], slots: ['R'], ord: 'multi',
      build: function (S) {
        var o = [];
        S.partners.forEach(function (p) { o.push([S.axis[0], p]); o.push([p, S.axis[0]]); });
        return o;
      },
      memo: '馬連に構造的に負ける。分岐点は着順正解率53.8%' },
    { id: 'utanbox', fam: 'mid', type: 'umatan', name: '馬単 ボックス', axisN: 0, axisReq: [], slots: ['R', 'R'], ord: 'yes',
      build: function (S) { return perms(S.partners, 2); } },
    // --- 一撃 ---
    { id: 'spkax1', fam: 'big', type: 'sanrenpuku', name: '3連複 軸1頭ながし', axisN: 1, axisReq: ['P'], slots: ['P', 'P'], ord: 'no',
      build: function (S) { return combos(S.partners, 2).map(function (pr) { return [S.axis[0], pr[0], pr[1]]; }); } },
    { id: 'spkax2', fam: 'big', type: 'sanrenpuku', name: '3連複 軸2頭ながし', axisN: 2, axisReq: ['P', 'P'], slots: ['P'], ord: 'no',
      build: function (S) { return S.partners.map(function (p) { return [S.axis[0], S.axis[1], p]; }); },
      memo: '◎○軸→印4頭 2点で0.838' },
    { id: 'spkbox', fam: 'big', type: 'sanrenpuku', name: '3連複 ボックス', axisN: 0, axisReq: [], slots: ['P', 'P', 'P'], ord: 'no',
      build: function (S) { return combos(S.partners, 3); },
      memo: '点数を絞るほどROIは上がる（110点0.653→1点0.776）。ただし1.0には届かない' },
    // 着順を指定する3連単ながしは、枠ごとにふるった2集合の直積（同一馬を除く）
    { id: 'stnax1', fam: 'big', type: 'sanrentan', name: '3連単 1着軸ながし', axisN: 1, axisReq: ['W'], slots: ['R', 'P'], ord: 'yes',
      build: function (S) {
        var o = [];
        S.slotPartners[0].forEach(function (b) {
          S.slotPartners[1].forEach(function (c) { if (b !== c) o.push([S.axis[0], b, c]); });
        });
        return o;
      } },
    { id: 'stnax2', fam: 'big', type: 'sanrentan', name: '3連単 2着軸ながし', axisN: 1, axisReq: ['R'], slots: ['W', 'P'], ord: 'yes',
      build: function (S) {
        var o = [];
        S.slotPartners[0].forEach(function (a) {
          S.slotPartners[1].forEach(function (c) { if (a !== c) o.push([a, S.axis[0], c]); });
        });
        return o;
      } },
    { id: 'stnax3', fam: 'big', type: 'sanrentan', name: '3連単 3着軸ながし', axisN: 1, axisReq: ['P'], slots: ['W', 'R'], ord: 'yes',
      build: function (S) {
        var o = [];
        S.slotPartners[0].forEach(function (a) {
          S.slotPartners[1].forEach(function (b) { if (a !== b) o.push([a, b, S.axis[0]]); });
        });
        return o;
      } },
    { id: 'stnax12', fam: 'big', type: 'sanrentan', name: '3連単 1・2着軸ながし', axisN: 2, axisReq: ['W', 'R'], slots: ['P'], ord: 'yes',
      build: function (S) { return S.partners.map(function (p) { return [S.axis[0], S.axis[1], p]; }); } },
    { id: 'stnmul', fam: 'big', type: 'sanrentan', name: '3連単 軸1頭ながしマルチ', axisN: 1, axisReq: ['P'], slots: ['P', 'P'], ord: 'multi',
      build: function (S) {
        var o = [];
        combos(S.partners, 2).forEach(function (pr) {
          o.push([S.axis[0], pr[0], pr[1]]); o.push([S.axis[0], pr[1], pr[0]]);
          o.push([pr[0], S.axis[0], pr[1]]); o.push([pr[1], S.axis[0], pr[0]]);
          o.push([pr[0], pr[1], S.axis[0]]); o.push([pr[1], pr[0], S.axis[0]]);
        });
        return o;
      },
      memo: '63.7%のケースで3連複に負ける（同じ狙いを難しい券種で表現している）' },
    { id: 'stnbox', fam: 'big', type: 'sanrentan', name: '3連単 ボックス', axisN: 0, axisReq: [], slots: ['P', 'P', 'P'], ord: 'yes',
      build: function (S) { return perms(S.partners, 3); },
      memo: '印3頭6点0.725。動画は全会一致で否定' },
    // stnf は 1着=軸[0]、2・3着=相手の順列（既存の build を意味ごと据え置く。107 実装時メモ）
    { id: 'stnf', fam: 'big', type: 'sanrentan', name: '3連単 フォーメーション', axisN: 2, axisReq: ['W', 'P'], slots: ['R', 'P'], ord: 'yes',
      build: function (S) {
        var o = [];
        S.slotPartners[0].forEach(function (p) {
          S.slotPartners[1].forEach(function (p2) {
            if (p === p2 || p === S.axis[0] || p2 === S.axis[0]) return;
            o.push([S.axis[0], p, p2]);
          });
        });
        return o;
      },
      memo: '◎○/◎○▲/印5 の12点で0.893（見た目は最良だが決着に56,674レース必要＝判定不能）' },
  ];


  // ===== 107 §1: 天井（ceiling）=====
  //  win/ren/place/out/unknown。買い目に入るのは win|ren|place だけ。
  //  out・unknown はどちらも確率を動かさない（107 §1.4。ボタン操作で的中確率が
  //  良く見えるのを避けるため、88-spec §4 の消しペナルティ ×0.25 は廃止）
  function inW(c) { return c === 'win'; }
  function inR(c) { return c === 'win' || c === 'ren'; }
  function inP(c) { return c === 'win' || c === 'ren' || c === 'place'; }
  var SET_FN = { W: inW, R: inR, P: inP };
  var SET_JA = { W: '1着まであると答えた馬', R: '2着まではあると答えた馬', P: '3着まではあると答えた馬' };
  var CEIL_LABEL = { win: '勝ち切ると思う', ren: '2着までなら', place: '3着までなら',
                     out: '3着にも来ない', unknown: 'わからない' };
  var DEPTH = { win: 0, ren: 1, place: 2 };

  function keptOf(ctx, S) {
    return ctx.HORSES.map(function (h) { return h.number; })
      .filter(function (n) { return inP(S.ceil[n]); });
  }
  // 107 §3.1: 軸候補＝残した馬のうち天井が最も浅い集合
  function axisPool(ctx, S) {
    var lv = ['win', 'ren', 'place'];
    for (var i = 0; i < lv.length; i++) {
      var g = keptOf(ctx, S).filter(function (n) { return S.ceil[n] === lv[i]; });
      if (g.length) return { level: lv[i], nums: g };
    }
    return { level: null, nums: [] };
  }
  // 107 §3.2 / §8.1: 天井 → 既存 state。下流（buildPlan・buildPackage・applyPlan）は無改造で動く
  function deriveLegacy(ctx, S) {
    var nums = ctx.HORSES.map(function (h) { return h.number; });
    S.kill = nums.filter(function (n) { return S.ceil[n] === 'out'; });
    S.partners = keptOf(ctx, S).filter(function (n) { return S.axis.indexOf(n) === -1; });
    S.target = S.axis.length
      ? S.axis.map(function (n) { return S.ceil[n]; })
          .sort(function (a, b) { return DEPTH[b] - DEPTH[a]; })[0]
      : null;
  }

  // ===== 107 §4: 成立条件と相手のふるい =====
  function sieveOf(S, set) {
    return S.partners.filter(function (n) { return SET_FN[set](S.ceil[n]); });
  }
  //  build() に渡す代理 state。S.partners はその買い方の枠を満たす馬だけに絞る（§4.1・U5）
  function sieveState(S, c) {
    var slots = c.slots || [];
    var slotP = slots.map(function (set) { return sieveOf(S, set); });
    var uniform = slots.every(function (x) { return x === slots[0]; });
    var union = [];
    slotP.forEach(function (a) { a.forEach(function (n) { if (union.indexOf(n) === -1) union.push(n); }); });
    var S2 = Object.create(S);
    S2.partners = slots.length ? (uniform ? slotP[0] : union) : [];
    S2.slotPartners = slotP;
    return S2;
  }
  //  成立しない理由を返す（成立するなら null）。W ⊆ R ⊆ P なので入れ子のホール条件で足りる
  function infeasibleReason(ctx, S, c) {
    if (c.type === 'wakuren') return 'オッズ未取得のため候補外';
    if (S.axisMode === null) return 'まだ査定の途中です';
    if (c.axisN !== S.axis.length) {
      return c.axisN === 0 ? '軸を決めた買い方ではありません'
        : ('軸' + c.axisN + '頭の買い方（いまは' + S.axis.length + '頭）');
    }
    for (var i = 0; i < c.axisN; i++) {
      if (!SET_FN[c.axisReq[i]](S.ceil[S.axis[i]])) {
        return '軸' + (c.axisN > 1 ? (i + 1) + '頭目' : '') + 'は' + SET_JA[c.axisReq[i]] + 'である必要があります';
      }
    }
    var nW = 0, nR = 0, nP = 0;
    S.partners.forEach(function (n) {
      var cc = S.ceil[n];
      if (inW(cc)) nW++;
      if (inR(cc)) nR++;
      if (inP(cc)) nP++;
    });
    var need = { W: 0, R: 0, P: 0 };
    (c.slots || []).forEach(function (x) { need[x]++; });
    if (need.W > nW) return SET_JA.W + 'が' + need.W + '頭必要（いまは' + nW + '頭）';
    if (need.W + need.R > nR) return SET_JA.R + 'が' + (need.W + need.R) + '頭必要（いまは' + nR + '頭）';
    if (need.W + need.R + need.P > nP) return SET_JA.P + 'が' + (need.W + need.R + need.P) + '頭必要（いまは' + nP + '頭）';
    return null;
  }

  // ===== T2: 質問エンジン（§3） =====
  // apply/qf/sf/optsf は明示的に S を受け取る（モックアップの module-global S をやめた差分）
  // 107 §5.1: 第1段（切り分け）と第2段（天井）は phase で持ち、
  //   ここに残すのは「軸・着順・予算・好み」の4問だけ
  var QUESTIONS = [
    {
      key: 'axisPick', kind: 'horse', max: 2, counter: true, always: true,
      q: 'この中で軸にするのはどれ？', s: '',
      listOf: function (ctx, S) { return axisPool(ctx, S).nums; },
      extra: [{ label: '差はつけられない', desc: '', value: 'none' }],
      apply: function (S, v) {
        if (v === 'none') { S.axisMode = 'none'; S.axis = []; } else { S.axisMode = 'pick'; S.axis = v; }
      },
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
    if (q.key === 'axisPick') return S.axisMode !== null;
    return S[q.key] !== null;
  }

  // ===== T1: 残り候補（§2 alive） =====
  function alive(ctx, S) {
    return CATALOG.filter(function (c) {
      // 107 §4.4: target による絞り込みは充足判定と役割が重なるので外した
      if (S.ordered === false && c.ord === 'yes') return false;
      if (S.ordered === true && c.ord === 'multi') return false;
      return infeasibleReason(ctx, S, c) === null;
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
      if (q.key === 'axisPick') return q;      // 軸候補2頭以上のときだけ未回答で残る
      if (splits(ctx, S, q.key)) return q;
    }
    return null;
  }

  // 107 §2.1: 第1段を抜けるとき。一度も見ていない馬も「保留」に寄せる
  //  （未設定のまま残すと第2段の保留リストから漏れ、二度と出てこない）
  function toCeil(ctx, S) {
    cutOrder(ctx).forEach(function (n) { if (!S.ceil[n]) S.ceil[n] = 'unknown'; });
    S.detail = null;
    if (!keptOf(ctx, S).length) { S.axisMode = 'none'; S.axis = []; deriveLegacy(ctx, S); S.phase = 'q'; return; }
    S.phase = 'ceil';
  }

  // 107 §3.1: 第2段を抜けたところで軸を決める。候補2頭以上のときだけ質問に回す
  function decideAxis(ctx, S) {
    var pool = axisPool(ctx, S);
    if (!pool.nums.length) { S.axisMode = 'none'; S.axis = []; }
    else if (pool.nums.length === 1) { S.axisMode = 'pick'; S.axis = pool.nums.slice(); }
    else { S.axisMode = null; S.axis = []; }
    deriveLegacy(ctx, S);
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
  // 107 §1.4（2026-08-05 改訂）
  //  q は Ans. の素の確率（estimated_prob）をそのまま正規化しただけ。
  //  88-spec §4 の「軸ブースト ×1.6」「消しペナルティ ×0.25」は両方とも廃止した。
  //  どちらも根拠が無く（仕様書にも決定の記録にも由来が無い）、ボタン操作だけで
  //  画面の「どれくらい当たる」が良く見える原因になっていたため。
  //  T は「堅い・荒れる」を将来効かせるためのフックとして残す（当面 1.0 固定＝素通し）。
  var T_EXP = 1.0;
  function qprobs(ctx, S) {
    var q = {}, sum = 0;
    ctx.HORSES.forEach(function (h) {
      var v = T_EXP === 1.0 ? ctx.P0[h.number] : Math.pow(ctx.P0[h.number], 1 / T_EXP);
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
    try { list = c.build(sieveState(S, c), ctx.BY); } catch (e) { return null; }
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
    try { list = c.build(sieveState(S, c), ctx.BY); } catch (e) { return null; }
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
      if (fam !== 'all' && c.fam !== fam) return;   // 107 §7.5: 'all' で全ファミリー横断
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
  // 107 §7.5（2026-08-05 改訂）
  //  推奨は「合計がプラスになるか」で選ぶ。脚を足すかどうかも、足した束のほうが
  //  プラスになりやすい／大きく返るときだけ。結果として1本になることもある。
  //  以前は最大3本まで機械的に足していたため、本線が当たっても合計に届かない
  //  （複勝1,400円→1,820円／合計2,000円）束を勧めてしまっていた。
  function buildPackage(ctx, S, fam, q, budget, w, outcomes) {
    var lam = TASTE_LAMBDA[S.taste || 'mid'];
    var outs = outcomes.outs, totP = outcomes.tot;
    var maskOf = function (leg) { return outs.map(function (o) { return legPayout(ctx, leg, o.t) > 0 ? 1 : 0; }); };
    var covP = function (mk) {
      return outs.reduce(function (a, o, i2) { return a + (mk[i2] ? o.p : 0); }, 0) / totP;
    };
    // 束のスコア＝プラスになる確率と、返るときの倍率の重みづけ（好みλ）
    // 本線が当たれば必ず合計を上回るか。
    //  保険だけ当たって元割れになるのは保険の役割なので、ここでは問わない（88-spec §6.6）
    function isClean(ev) { return !(ev.pMainLoss > 1e-9); }
    function evalOf(pkg) {
      var ev = evalPackage(ctx, pkg, outcomes);
      var sc = (ev.pPlus > 0) ? Math.pow(ev.pPlus, 1 - lam) * Math.pow((ev.med || 1) / pkg.stake, lam) : 0;
      return { ev: ev, sc: sc, clean: isClean(ev) };
    }
    // 本線から「当たっても合計に届かない点」を落とす。落とすと単価が上がるので収束まで繰り返す。
    //  ワイド軸2頭ながしのように点数が多く安い組が混じる買い方で、当たっているのに
    //  マイナスになる目を買わされるのを防ぐ（57レースの掃き出しで324枚に発生）
    function trimLosing(leg, yen) {
      // 全点が同じ単価なので、単価は打ち消し合う。オッズを高い順に並べ、
      // 「k番目に高いオッズ > k」を満たす最大のkが、当たればどれも合計を上回る点数になる。
      //   例）[8.5, 6.2, 4.4, 3.9, …] → k=3（4.4>3 は成立、3.9>4 は不成立）
      var withOdds = leg.rows.filter(function (r) { return r.odds !== null; });
      if (withOdds.length !== leg.rows.length) return leg;   // 枠連など払戻不明は触らない
      var sorted = leg.rows.slice().sort(function (a, b) { return b.odds - a.odds; });
      var k = 0;
      while (k < sorted.length && sorted[k].odds > k + 1) k++;
      // 1点も残らない＝どの組も当たって合計に届かない（複勝1.0倍など）。この買い方は使わない
      if (k === 0) return null;
      if (k === leg.rows.length) return leg;                  // 絞る必要なし
      var keepSet = {};
      sorted.slice(0, k).forEach(function (r) { keepSet[r.ids.join('-')] = true; });
      var dropped = leg.rows.length - k;
      leg.rows = leg.rows.filter(function (r) { return keepSet[r.ids.join('-')]; });
      leg.pts = leg.rows.length;
      leg.unit = Math.max(100, Math.floor(yen / leg.pts / 100) * 100);
      leg.yen = leg.unit * leg.pts;
      leg.pHit = leg.rows.reduce(function (a, r) { return a + r.p; }, 0);
      leg.droppedLosing = (leg.droppedLosing || 0) + dropped;
      return leg;
    }

    // 与えた本線＋追加脚で束を組み上げる（余りは単価に乗せて使い切る。点数は増やさない）
    function assemble(mainRaw, adds) {
      var useW = adds.length ? w : 1.0;
      var mainYen = Math.max(100, Math.floor(budget * useW / 100) * 100);
      var mLeg = fundLeg(mainRaw, mainYen);
      if (!mLeg) return null;
      mLeg = swapToSanrenpuku(ctx, mLeg, q);
      mLeg = trimLosing(mLeg, mainYen);
      if (!mLeg) return null;          // 当たっても合計に届く組が1つも無い買い方は使わない
      mLeg.role = 'main';
      var legs = [mLeg], rest = budget - mLeg.yen;
      adds.forEach(function (a, i2) {
        var share = Math.max(100, Math.floor(rest / (adds.length - i2) / 100) * 100);
        var lg = fundLeg(a.raw, Math.min(share, rest));
        if (!lg || lg.trimmedFrom) return;
        lg.role = a.role;
        legs.push(lg); rest -= lg.yen;
      });
      legs = [legs[0]].concat(
        legs.slice(1).filter(function (l) { return l.role === 'guard'; }),
        legs.slice(1).filter(function (l) { return l.role === 'boost'; }));
      var loop = 0;
      while (rest >= 100 && loop++ < 200) {
        var moved = false;
        legs.forEach(function (l) {
          if (rest >= l.pts * 100) { l.unit += 100; l.yen = l.unit * l.pts; rest -= l.pts * 100; moved = true; }
        });
        if (!moved) break;
      }
      // 余りを単価に乗せると合計が上がり、いったん残した組がまた合計に届かなくなることがある。
      // 最終の合計でもう一度ふるいにかける
      var stake0 = legs.reduce(function (a, l) { return a + l.yen; }, 0);
      var before = legs[0].pts;
      if (!trimLosing(legs[0], legs[0].yen)) return null;
      if (legs[0].pts !== before) {
        legs[0].droppedLosing = (legs[0].droppedLosing || 0);
        rest = budget - legs.reduce(function (a, l) { return a + l.yen; }, 0);
      }
      return { fam: fam, legs: legs, main: legs[0], hasGuards: legs.length > 1,
        stake: legs.reduce(function (a, l) { return a + l.yen; }, 0), leftover: rest };
    }

    var famCands = familyCandidates(ctx, S, fam, q);
    if (!famCands.length) return null;
    // 本線もこのスコアで選ぶ。単独で買ったときに元が取れない買い方を先頭に置かないため
    var solos = [];
    famCands.forEach(function (r) {
      var pkg = assemble(r, []);
      if (!pkg) return;
      var ev = evalPackage(ctx, pkg, outcomes);
      var mult = (ev.med || 0) / pkg.stake;
      var sc = (ev.pPlus > 0) ? Math.pow(ev.pPlus, 1 - lam) * Math.pow((ev.med || 1) / pkg.stake, lam) : 0;
      solos.push({ sc: sc, raw: r, pkg: pkg, mult: mult, clean: isClean(ev) });
    });
    if (!solos.length) return null;
    // ⑴ 当たっても元が取れない目を含む買い方は、含まないものがある限り選ばない。
    //    ワイド軸2頭ながしのように、点数が多く安い組が混じる買い方がこれに当たる
    //    （57レース×18通りの掃き出しで、元割れ326枚すべてに同じ枠内の代替があった）
    var cleanSolos = solos.filter(function (x) { return x.clean; });
    var base = cleanSolos.length ? cleanSolos : solos;
    // ⑵ §7.5b: 見合う下限。全部が下限割れなら下限を外す（買い目を消さない）
    var floor = MIN_MULT[S.taste || 'mid'] || 0;
    var passed = base.filter(function (x) { return x.mult >= floor; });
    var cut = floor > 0 && passed.length && passed.length < base.length ? base.length - passed.length : 0;
    var pool = passed.length ? passed : base;
    var best = null;
    pool.forEach(function (x) { if (!best || x.sc > best.sc) best = x; });
    if (!best) return null;
    var floorNote = cut
      ? ('「' + { hit: 'とにかく当てたい', mid: '半々', big: '大きく取りたい' }[S.taste || 'mid']
         + '」を選んだので、当たっても合計の' + MIN_MULT_JA[S.taste || 'mid'] + 'に届かない買い方 '
         + cut + '通りは本線にしていません。')
      : null;

    // 追加候補（同ファミリー → 他ファミリー）を貪欲に並べ、役割を決める
    var ladder = bestPerType(ctx, S, q);
    var mainLegForMask = best.pkg.legs[0];
    var cover = maskOf(mainLegForMask), masks = [cover.join('')];
    var sameFam = famCands.filter(function (r) { return r.c.id !== best.raw.c.id; })
      .sort(function (a, b) { return b.pHit - a.pHit; });
    var crossFam = ladder.filter(function (r) {
      return r.c.id !== best.raw.c.id && r.pHit > best.raw.pHit
        && !sameFam.some(function (x) { return x.c.id === r.c.id; });
    });
    var MIN_GAIN = 0.01, MAX_LEGS = 3;
    var adds = [];
    sameFam.concat(crossFam).forEach(function (r) {
      if (adds.length >= MAX_LEGS - 1) return;
      var probe = fundLeg(r, Math.max(100, Math.floor(budget * (1 - w) / 100) * 100));
      if (!probe || probe.trimmedFrom) return;
      var mk = maskOf(probe);
      if (!mk.some(function (x) { return x; })) return;
      // 当たる場面が既存の脚とまったく同じ脚は足さない（同じ出来事の二重買い）
      if (masks.indexOf(mk.join('')) !== -1) return;
      var merged = cover.map(function (c, j) { return c | mk[j]; });
      var role = (covP(merged) - covP(cover)) >= MIN_GAIN ? 'guard' : 'boost';
      cover = merged; masks.push(mk.join(''));
      adds.push({ raw: r, role: role });
    });

    // 0本・1本・2本…を組んで、束として最良のものを採る。改善しないなら足さない
    var chosen = best.pkg, chosenSc = best.sc, chosenClean = best.clean;
    chosen.floorNote = floorNote;
    for (var k = 1; k <= adds.length; k++) {
      var pkg2 = assemble(best.raw, adds.slice(0, k));
      if (!pkg2 || pkg2.legs.length !== k + 1) continue;
      var e2 = evalOf(pkg2);
      // 脚を足したせいで元割れが生まれるなら足さない（予算を分けると起きる）
      if (chosenClean && !e2.clean) continue;
      if ((!chosenClean && e2.clean) || e2.sc > chosenSc) {
        pkg2.floorNote = floorNote; chosen = pkg2; chosenSc = e2.sc; chosenClean = e2.clean;
      }
    }
    return chosen;
  }

  function evalPackage(ctx, pkg, outcomes) {    // 決着を全通り回して束全体の分布を出す
    var outs = outcomes.outs, tot = outcomes.tot;
    var pAny = 0, pPlus = 0, pMain = 0, pMainLoss = 0, maxPay = 0, minPay = Infinity, hits = [];
    outs.forEach(function (o) {
      var t = o.t, p = o.p;
      var pay = 0;
      pkg.legs.forEach(function (l) { pay += legPayout(ctx, l, t); });
      var mainPay = legPayout(ctx, pkg.legs[0], t);
      if (mainPay > 0) { pMain += p; if (pay <= pkg.stake) pMainLoss += p; }
      if (pay > 0) { pAny += p; hits.push([pay, p]); if (pay > maxPay) maxPay = pay; if (pay < minPay) minPay = pay; }
      if (pay > pkg.stake) pPlus += p;
    });
    hits.sort(function (a, b) { return a[0] - b[0]; });
    var ht = hits.reduce(function (a, x) { return a + x[1]; }, 0), acc = 0, med = null;
    for (var i = 0; i < hits.length; i++) { acc += hits[i][1]; if (acc >= ht / 2) { med = hits[i][0]; break; } }
    return {
      pAny: pAny / tot, pPlus: pPlus / tot, pMain: pMain / tot, pMainLoss: pMainLoss / tot,
      pGuardOnly: (pAny - pMain) / tot,
      pNone: 1 - pAny / tot, med: med, maxPay: maxPay, minPay: minPay === Infinity ? null : minPay,
    };
  }

  // 全券種×全買い方。答えで落ちたものも理由つきで残す（§6.5。結論に全部を含めるための担保）
  function excludeReason(ctx, S, c) {
    if (S.ordered === false && c.ord === 'yes') return '着順に自信なしと答えたため';
    if (S.ordered === true && c.ord === 'multi') return '着順に自信ありと答えたため';
    return infeasibleReason(ctx, S, c) || '';
  }

  function allPlans(ctx, S) {
    var q = qprobs(ctx, S);
    var al = {}; alive(ctx, S).forEach(function (c) { al[c.id] = true; });
    return CATALOG.map(function (c) {
      var pl = buildPlan(ctx, S, c, q);
      if (!pl) return { c: c, reason: al[c.id] ? 'この頭数・選択では組めない' : excludeReason(ctx, S, c) };
      if (pl.over) return { c: c, pl: pl, reason: '予算オーバー（' + pl.stake.toLocaleString('ja-JP') + '円）' };
      if (!al[c.id]) return { c: c, pl: pl, reason: excludeReason(ctx, S, c) };
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
      // 107: ceil が正本。axis/kill/partners/target は deriveLegacy() の導出値
      ceil: {}, memo: {}, phase: 'cut', idx: 0, pendOpen: false, detail: null,
      axis: [], axisMode: null, kill: [], target: null, ordered: null, partners: [], budget: null,
      taste: null, asked: [], done: false, killOpen: false,
      pick: [], inputRaw: '', pkgW: { hit: 0.7, mid: 0.7, big: 0.7, all: 0.6 },
    };
  }
  function setInputRaw(S, raw) { S.inputRaw = raw; }
  // 107 §2.4: ひとこと（任意・保存しない）
  function setMemo(ctx, S, v) { S.memo[cutOrder(ctx)[S.idx]] = v; }
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
      + '<div class="lh"><span class="lname">'
      + (l.role === 'main' || isMain ? '<span class="mainchip">本線</span>'
         : l.role === 'guard' ? '<span class="mainchip guard">保険</span>'
         : l.role === 'boost' ? '<span class="mainchip boost">上乗せ</span>' : '')
      + escapeHtml(TYPE_LABEL[l.c.type])
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
      var floorHtml = pkg.floorNote ? ('<div class="ctrl">' + escapeHtml(pkg.floorNote) + '</div>') : '';
      if (pkg.legs[0].droppedLosing) {
        floorHtml += '<div class="ctrl">当たっても合計に届かない組 ' + pkg.legs[0].droppedLosing
          + '点を外しました。残した ' + pkg.legs[0].pts + '点は、当たればどれも合計を上回ります。</div>';
      }
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
        + warn + floorHtml + memo
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

  function renderQuestion(ctx, S) {
    var Q = nextQuestion(ctx, S);
    if (!Q) return renderResults(ctx, S) + renderAlive(ctx, S); // computeDone()が既にS.doneをtrueにしている前提
    var askedIdx = -1;
    for (var i = 0; i < QUESTIONS.length; i++) { if (QUESTIONS[i].key === Q.key) { askedIdx = i; break; } }
    var dots = QUESTIONS.map(function (x, i2) { return '<i class="' + (i2 <= askedIdx ? 'on' : '') + '"></i>'; }).join('');
    var n = alive(ctx, S).length;

    var body = '';
    if (Q.kind === 'horse') {
      var allow = Q.listOf ? Q.listOf(ctx, S) : null;
      var list = ctx.HORSES.filter(function (h) {
        return allow ? allow.indexOf(h.number) !== -1 : S.kill.indexOf(h.number) === -1;
      }).sort(function (a, b) { return a.number - b.number; });
      body = '<div class="ak-hlist">' + list.map(function (h) {
        return horseRow(ctx, S, h, { selected: S.pick, radio: Q.max === 1, markAxis: false, maxP: maxProb(ctx) });
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
      var cnt = '';
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
    // 残り枠カウンター: 1頭でも選べば on（枠線が青）、上限に達したら max（塗りつぶし）。
    // 「あと何頭選べるか」を選んでいる最中も見えるようにする
    var countHtml = '';
    if (Q.counter) {
      var cCls = S.pick.length >= Q.max ? ' max' : (S.pick.length ? ' on' : '');
      countHtml = '<span class="qcount' + cCls + '"><span class="cn">' + S.pick.length
        + '</span><span class="cs">/' + Q.max + '頭</span></span>';
    }
    var headHtml = countHtml
      ? '<div class="qhead"><div class="q">' + escapeHtml(qText) + '</div>' + countHtml + '</div>'
      : '<div class="q">' + escapeHtml(qText) + '</div>';
    return '<div class="ak-prog"><span class="ak-step">質問 ' + (S.asked.length + 1) + '</span>'
      + '<span class="ak-cand">残っている買い方 <b>' + n + '</b> / ' + CATALOG.length + ' 通り</span></div>'
      + '<div class="ak-dots">' + dots + '</div>'
      + '<div class="ak-card"><div class="ak-q">' + headHtml
      + (sText ? '<div class="s">' + escapeHtml(sText) + '</div>' : '') + '</div>' + body + '</div>'
      + (S.asked.length ? '<div class="restart"><button type="button" class="ak-btn gray sm" data-ak-back>ひとつ戻る</button></div>' : '')
      + renderAlive(ctx, S);
  }

  // ===== 107 §2.1: 第1段 切り分け（全頭・1頭ずつ） =====
  var CUT_OPTS = [
    { v: 'keep', label: '残す', c: '#0b6b3a' },
    { v: 'cut', label: '切る', c: '#8a2020' },
    { v: 'unknown', label: 'わからない', c: '#999' },
  ];
  function cutOrder(ctx) {
    return ctx.HORSES.slice().sort(function (a, b) {
      return (a.popularity || 99) - (b.popularity || 99) || a.number - b.number;
    }).map(function (h) { return h.number; });
  }
  function keptCount(ctx, S) {
    return cutOrder(ctx).filter(function (n) { return S.ceil[n] && S.ceil[n] !== 'out' && S.ceil[n] !== 'unknown'; }).length;
  }

  // 107 §2.2b: 「わからない」を押したときだけ出す戦績。採点順位・評価・合計点・確率は出さない
  function materialPanel(ctx, h) {
    var runs = h.past_runs || [];
    var body;
    if (!runs.length) {
      body = '<div class="mt-none">この馬の戦績が取れませんでした。</div>';
    } else {
      body = '<div class="mtr">' + runs.map(function (r) {
        var f = Number(r.finish);
        var fin = r.finish_text || (r.finish != null && r.finish !== '' ? r.finish + '着' : '—');
        var cond = [r.track, (r.surface || '') + (r.distance || ''), r.condition].filter(Boolean).join(' ');
        var meta = [
          r.runners ? r.runners + '頭' : null,
          r.popularity ? r.popularity + '番人気' : null,
          (r.margin !== null && r.margin !== undefined && r.margin !== '') ? r.margin + '秒差' : null,
          r.last_3f ? '上り' + r.last_3f : null,
          r.corners ? '通過' + r.corners : null,
          r.jockey || null,
        ].filter(Boolean).join(' ／ ');
        return '<div class="mtr-row">'
          + '<div class="mtr-h"><span class="mtr-dt">' + escapeHtml(String(r.date || '').slice(2)) + '</span>'
          + '<span class="mtr-cd">' + escapeHtml(cond) + '</span>'
          + '<span class="mtr-nm">' + escapeHtml(r.race_name || '') + '</span>'
          + '<span class="mtr-fi' + (f >= 1 && f <= 3 ? ' in' : '') + '">' + escapeHtml(fin) + '</span></div>'
          + '<div class="mtr-m">' + escapeHtml(meta) + '</div></div>';
      }).join('') + '</div>';
    }
    return '<div class="mt"><div class="mt-t">戦績（近' + runs.length + '走）</div>' + body
      + '<div class="mt-q">これを見て、どうしますか？</div>'
      + '<div class="ak-opts">'
      + '<button type="button" class="ak-opt" data-ak-cut="keep"><span class="oi">›</span>'
      + '<span class="obody"><span class="ol">残す</span></span></button>'
      + '<button type="button" class="ak-opt" data-ak-cut="cut"><span class="oi">›</span>'
      + '<span class="obody"><span class="ol">切る</span></span></button>'
      + '<button type="button" class="ak-opt skip" data-ak-cut="unknown"><span class="oi">›</span>'
      + '<span class="obody"><span class="ol">それでも決められない</span></span></button>'
      + '</div>'
      + '<div class="mt-note">「それでも決められない」を選ぶと保留になります。'
      + '保留の馬は<b>次の画面でもう一度出ます</b>ので、そこで決め直せます。</div></div>';
  }

  function renderCut(ctx, S) {
    var order = cutOrder(ctx);
    var n = order[S.idx], h = ctx.BY[n];
    if (!h) return '';
    var dots = order.map(function (x, i) { return '<i class="' + (i <= S.idx ? 'on' : '') + '"></i>'; }).join('');
    var opts = S.detail === n ? '' : ('<div class="ak-opts">' + CUT_OPTS.map(function (o) {
      return '<button type="button" class="ak-opt' + (o.v === 'unknown' ? ' skip' : '')
        + '" data-ak-cut="' + o.v + '"><span class="oi">›</span>'
        + '<span class="obody"><span class="ol">' + o.label + '</span></span></button>';
    }).join('') + '</div>');
    var done = order.slice(0, S.idx);
    var stack = done.filter(function (x) { return S.ceil[x] && S.ceil[x] !== 'unknown'; }).map(function (x) {
      var lab = S.ceil[x] === 'out' ? '切る' : '残す';
      return '<span class="ak-st-row">' + umaBox(x, ctx.BY[x] ? ctx.BY[x].gate : undefined, 'sm')
        + '<span class="ak-st-tag ' + (S.ceil[x] === 'out' ? 'out' : 'keep') + '">' + lab + '</span>'
        + (S.memo[x] ? ('<span class="ak-st-m">─ ' + escapeHtml(S.memo[x]) + '</span>') : '') + '</span>';
    }).join('');
    var nUnk = done.filter(function (x) { return S.ceil[x] === 'unknown'; }).length;
    if (nUnk) stack += '<span class="ak-st-row"><span class="ak-st-m">ほか ' + nUnk + '頭は「わからない」</span></span>';

    return '<div class="ak-prog"><span class="ak-step">まず全頭を切り分けます</span>'
      + '<span class="ak-cand">' + (S.idx + 1) + ' / ' + order.length + '頭　残している <b>'
      + keptCount(ctx, S) + '</b>頭</span></div>'
      + '<div class="ak-dots">' + dots + '</div>'
      + '<div class="ak-card"><div class="ak-q">'
      + '<div class="ak-hh">' + umaBox(n, h.gate, 'md') + '<span class="nm">' + escapeHtml(h.name) + '</span>'
      + '<span class="pop">' + (h.popularity || '—') + '番人気 ' + (h.odds != null ? h.odds + '倍' : '—') + '</span></div>'
      + '<div class="s">' + escapeHtml([h.sex_age, h.jockey, h.running_style, h.gate + '枠'].filter(Boolean).join(' / '))
      + (h.ability_mark ? ' / 印 ' + escapeHtml(h.ability_mark) : '') + '</div>'
      + (h.landmine_reason ? ('<div class="ak-mine">⚠ Ans.は地雷と判定 — ' + escapeHtml(h.landmine_reason) + '</div>') : '')
      + '<div class="q" style="margin-top:10px">この馬、買い目に入れる？</div></div>'
      + opts
      + (S.detail === n ? materialPanel(ctx, h) : '')
      + '<div class="ak-memo"><input type="text" id="ak-memo-input" autocomplete="off" '
      + 'placeholder="ひとこと（任意）　例: 外枠だが展開が向く" value="' + escapeHtml(S.memo[n] || '') + '"></div>'
      + '</div>'
      + '<div class="restart">'
      + (S.idx > 0 ? '<button type="button" class="ak-btn gray sm" data-ak-cut-back>← 前の馬</button>' : '')
      + (keptCount(ctx, S) ? '<button type="button" class="ak-btn sm" data-ak-cut-finish style="margin-left:auto">ここまでで先へ →</button>' : '')
      + '</div>'
      + (stack ? '<div class="ak-stack">' + stack + '</div>' : '');
  }

  // ===== 107 §2.3 / §2.3b: 第2段 確認と天井＋保留リスト =====
  function renderCeil(ctx, S) {
    var order = cutOrder(ctx);
    var ks = order.filter(function (n) { return inP(S.ceil[n]); });
    var cuts = order.filter(function (n) { return S.ceil[n] === 'out'; });
    var unks = order.filter(function (n) { return S.ceil[n] === 'unknown'; });
    var maxP = maxProb(ctx);
    var rows = ks.map(function (n) {
      var h = ctx.BY[n];
      var seg = [['win', '勝ち切る'], ['ren', '2着まで'], ['place', '3着まで']].map(function (x) {
        return '<button type="button" class="ak-seg' + (S.ceil[n] === x[0] ? ' on' : '')
          + '" data-ak-ceil="' + n + ':' + x[0] + '">' + x[1] + '</button>';
      }).join('');
      return '<div class="ak-cl"><div class="ak-hh">' + umaBox(n, h.gate, 'sm')
        + '<span class="nm">' + escapeHtml(h.name) + '</span>'
        + '<span class="pop">' + (h.popularity || '—') + '番人気 ' + (h.odds != null ? h.odds + '倍' : '—') + '</span>'
        + probBar(h, maxP) + '</div>'
        + (S.memo[n] ? ('<div class="ak-cl-m">─ ' + escapeHtml(S.memo[n]) + '</div>') : '')
        + '<div class="ak-segs">' + seg + '</div>'
        + '<button type="button" class="ak-cl-x" data-ak-uncut="' + n + '">この馬はやっぱり切る</button></div>';
    }).join('');

    var pend = '';
    if (unks.length) {
      var need = '';
      if (ks.length === 1) need = '<div class="ak-need">もう1頭決まると、ワイド・馬連・馬単が組めます。</div>';
      else if (ks.length === 2) need = '<div class="ak-need">もう1頭決まると、3連複・3連単が組めます。</div>';
      var list = S.pendOpen ? ('<div class="ak-pd-list">' + unks.map(function (n) {
        var h = ctx.BY[n];
        return '<div class="ak-pd-row">' + umaBox(n, h.gate, 'sm')
          + '<span class="nm">' + escapeHtml(h.name) + '</span>'
          + '<span class="pop">' + (h.popularity || '—') + '番人気 ' + (h.odds != null ? h.odds + '倍' : '—') + '</span>'
          + '<span class="bt"><button type="button" data-ak-pend="' + n + ':keep">残す</button>'
          + '<button type="button" data-ak-pend="' + n + ':cut">切る</button></span></div>';
      }).join('') + '</div>'
        + '<div class="ak-pd-note">決めなくても先へ進めます。そのときは<b>買い目に入りません</b>。</div>') : '';
      pend = '<div class="ak-pd"><button type="button" class="ak-pd-h" data-ak-pend-toggle>'
        + (S.pendOpen ? '▾' : '▸') + ' 保留のまま ' + unks.length + '頭 — 決めますか？</button>'
        + (S.pendOpen ? need : '') + list + '</div>';
    }

    return '<div class="ak-prog"><span class="ak-step">残ったのはこの ' + ks.length + '頭です</span>'
      + '<span class="ak-cand">切った ' + cuts.length + '頭 ／ わからない ' + unks.length + '頭</span></div>'
      + '<div class="ak-card"><div class="ak-q"><div class="q">それぞれ、どこまで来ると思う？</div>'
      + '<div class="s">既定は「3着まで」です。上げた馬が軸の候補になります。</div></div>'
      + '<div class="ak-cls">' + rows + '</div>' + pend + '</div>'
      + '<div class="restart"><button type="button" class="ak-btn gray sm" data-ak-recut>← 切り分けに戻る</button>'
      + '<button type="button" class="ak-btn sm" data-ak-ceil-done style="margin-left:auto">この予想で進む →</button></div>';
  }

  // ===== 107 §6.1: 見送り =====
  function renderSkip(ctx, S) {
    var order = cutOrder(ctx), cnt = {};
    ['win', 'ren', 'place', 'out', 'unknown'].forEach(function (k) {
      cnt[k] = order.filter(function (n) { return S.ceil[n] === k; }).length;
    });
    return '<div class="ak-skip"><div class="t">このレースは見送りをおすすめします。</div>'
      + '<div class="b">買い目の形になる答えが揃っていません。<table>'
      + ['win', 'ren', 'place', 'out', 'unknown'].map(function (k) {
          return '<tr><td>' + CEIL_LABEL[k] + 'と答えた馬</td><td>' + cnt[k] + '頭</td></tr>'; }).join('')
      + '</table>買わないという判断も予想のうちです。控除率20.8%を払わずに済みます。</div></div>'
      + '<div class="restart"><button type="button" class="ak-btn gray sm" data-ak-recut>もう一度切り分ける</button></div>'
      + renderMine(ctx, S, true);
  }

  // ===== 107 §7.2 / §7.3: あなたの予想と、矛盾の指摘 =====
  function renderMine(ctx, S, skipped) {
    var order = cutOrder(ctx);
    var shown = order.filter(function (n) { return inP(S.ceil[n]) || S.ceil[n] === 'out'; });
    var unk = order.filter(function (n) { return S.ceil[n] === 'unknown'; }).length;
    var rows = shown.map(function (n) {
      return '<div class="row">' + umaBox(n, ctx.BY[n] ? ctx.BY[n].gate : undefined, 'sm')
        + '<span class="ak-st-tag ' + (S.ceil[n] === 'out' ? 'out' : 'keep') + '">' + CEIL_LABEL[S.ceil[n]] + '</span>'
        + (S.memo[n] ? ('<span class="ak-st-m">─ ' + escapeHtml(S.memo[n]) + '</span>') : '') + '</div>';
    }).join('');
    if (unk) rows += '<div class="row"><span class="ak-st-m">ほか ' + unk + '頭は「わからない」（買い目に入れていません）</span></div>';
    var hint = '';
    if (!skipped && S.axis.length) {
      var ap = Math.max.apply(null, S.axis.map(function (n) { return ctx.P0[n] || 0; }));
      var over = order.filter(function (n) { return (ctx.P0[n] || 0) > ap && S.ceil[n] === 'unknown'; });
      if (over.length) {
        hint = '<div class="cap">⚠ ' + umaBox(over[0], ctx.BY[over[0]].gate, 'sm') + '（'
          + ctx.BY[over[0]].popularity + '番人気）はまだ査定していません。相手に入れるか消すか決めますか？</div>';
      }
    }
    return '<div class="ak-mine">' + rows
      + (skipped ? '' : '<div class="cap">この買い目は上のとおりに組んであります。</div>') + hint + '</div>';
  }

  function render(ctx, S) {
    if (S.phase !== 'cut' && S.phase !== 'ceil') deriveLegacy(ctx, S);
    var body;
    if (S.phase === 'cut') {
      body = renderCut(ctx, S);
    } else if (S.phase === 'ceil') {
      body = renderCeil(ctx, S);
    } else if (S.axisMode === 'none' && !keptOf(ctx, S).length) {
      body = renderSkip(ctx, S);
    } else {
      computeDone(ctx, S);
      body = S.done
        ? (warnThin(ctx, S) + renderResults(ctx, S) + renderMine(ctx, S) + renderAlive(ctx, S))
        : renderQuestion(ctx, S);
    }
    // 107 §2.5: 常設の「消す」トグルは廃止（第1段の「切る」に統合）
    return '<div class="ak-wrap"><div class="ak-root">' + body + '</div></div>';
  }

  // 107 §6.2: 判断が薄いときの警告。人気上位5頭に絞って判定する
  //  （全頭を回すフローでは下位人気が unknown になるのが普通で、全体比だと出っぱなしになる）
  function warnThin(ctx, S) {
    var top5 = cutOrder(ctx).slice(0, 5);
    var u = top5.filter(function (n) { return !inP(S.ceil[n]) && S.ceil[n] !== 'out'; }).length;
    if (u < 3) return '';
    return '<div class="ak-thin">人気上位5頭のうち' + u
      + '頭を「わからない」のままにしています。買い目は下に出しますが、見送りも選択肢です。</div>';
  }

  // ===== T9: イベント処理（race.js側のイベント委譲から呼ばれる） =====
  // 戻り値: null=未処理（rerender不要） / {} = 状態変化のみ（rerender要） /
  //         {plan: {...}} = 状態変化＋Simulator.applyPlan(state, plan)へ渡してほしい
  function handleClick(ctx, S, target) {
    var el;

    // ===== 107 §2: 第1段（切り分け）=====
    el = target.closest('[data-ak-cut]');
    if (el) {
      var order = cutOrder(ctx), cn = order[S.idx];
      var cv = el.getAttribute('data-ak-cut');
      if (cv === 'unknown' && S.detail !== cn) { S.detail = cn; return {}; }  // 1回目は戦績を出す
      S.ceil[cn] = cv === 'keep' ? 'place' : (cv === 'cut' ? 'out' : 'unknown');
      S.detail = null;
      if (S.idx < order.length - 1) S.idx++; else toCeil(ctx, S);
      return {};
    }
    el = target.closest('[data-ak-cut-back]');
    if (el) { if (S.idx > 0) S.idx--; S.detail = null; return {}; }
    el = target.closest('[data-ak-cut-finish]');
    if (el) { toCeil(ctx, S); return {}; }

    // ===== 107 §2.3 / §2.3b: 第2段（確認と天井・保留）=====
    el = target.closest('[data-ak-ceil]');
    if (el) {
      var pr = el.getAttribute('data-ak-ceil').split(':');
      S.ceil[Number(pr[0])] = pr[1];
      return {};
    }
    el = target.closest('[data-ak-uncut]');
    if (el) { S.ceil[Number(el.getAttribute('data-ak-uncut'))] = 'out'; return {}; }
    el = target.closest('[data-ak-pend-toggle]');
    if (el) { S.pendOpen = !S.pendOpen; return {}; }
    el = target.closest('[data-ak-pend]');
    if (el) {
      var pp = el.getAttribute('data-ak-pend').split(':');
      S.ceil[Number(pp[0])] = pp[1] === 'keep' ? 'place' : 'out';
      S.pendOpen = true;
      return {};
    }
    el = target.closest('[data-ak-recut]');
    if (el) { S.phase = 'cut'; S.idx = 0; S.detail = null; return {}; }
    el = target.closest('[data-ak-ceil-done]');
    if (el) { decideAxis(ctx, S); S.phase = 'q'; return {}; }

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
      if (k === 'axisPick') { S.axis = []; S.axisMode = null; }
      else if (k === 'budget') { S.budget = null; S.inputRaw = ''; } else if (k) { S[k] = null; }
      S.pick = [];
      S.done = false;
      return {};
    }

    el = target.closest('[data-ak-restart]');
    if (el) {
      var fresh = initialState();
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
    setMemo: setMemo,
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
      deriveLegacy: deriveLegacy,
      infeasibleReason: infeasibleReason,
      sieveState: sieveState,
      axisPool: axisPool,
      decideAxis: decideAxis,
      toCeil: toCeil,
      cutOrder: cutOrder,
    },
  };

  if (typeof window !== 'undefined') {
    window.Akinator = Akinator;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Akinator;
  }
})();
