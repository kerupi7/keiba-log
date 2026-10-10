/**
 * 手動シミュレーター（Block B）— JRA IPAT投票シート型UI（45-spec §2）
 *
 * 確率・オッズ・EVの計算は必ず window.Harville の公開関数を呼ぶ（harville.jsは1行も変更しない契約。
 * harville.js冒頭の契約コメント参照）。列挙・枠連確率合成・ライブ緑判定などUI固有のロジックのみここに置く。
 *
 * 契約: 純関数中心。DOM描画はHTML文字列を返すのみ（実際のDOM書き込み・イベント購読はrace.js側が行う）。
 * ブラウザ(window.Simulator)とNode(module.exports)の両方で同一オブジェクトを公開する（harville.js踏襲）。
 *
 * 依存（グローバル前提。script読み込み順は race.html: app.js → harville.js → simulator.js → race.js）:
 *   app.js:      umaBox, wakuBox, escapeHtml, MARK_CLASS（評価・点数は 2026-10-07 に表から外した）
 *   harville.js: window.Harville（probTansho/probFukusho/probWide/probUmaren/probUmatan/
 *                probSanrenpuku/probSanrentan/normKey/oddsUsed/buyLine/ev/P_MIN/buildProbs）
 *
 * AIの印（能力印＋穴／地雷／消し）を描く markBadge20 は race.js のIIFEの中にあってグローバルに
 * 出ていないので、**呼び手が opts.aiMark で渡す**（2026-09-07）。渡されなければ「—」を出す。
 * ここで同じ描き分けを書き写すと、印の定義が2か所になって必ずずれる。
 */
(function () {
  'use strict';

  // ===== §2.4 券種定義 =====
  var TYPES = [
    { type: 'tansho', label: '単勝・複勝', band: 'tansho', bandLabel: '単勝', arity: 1, ordered: false, frame: false },
    { type: 'wakuren', label: '枠連', band: 'wakuren', bandLabel: '枠連', arity: 2, ordered: false, frame: true },
    { type: 'umaren', label: '馬連', band: 'umaren', bandLabel: '馬連', arity: 2, ordered: false, frame: false },
    { type: 'wide', label: 'ワイド', band: 'wide', bandLabel: 'ワイド', arity: 2, ordered: false, frame: false },
    { type: 'umatan', label: '馬単', band: 'umatan', bandLabel: '馬単', arity: 2, ordered: true, frame: false },
    { type: 'sanrenpuku', label: '3連複', band: 'sanrenpuku', bandLabel: '3連複', arity: 3, ordered: false, frame: false },
    { type: 'sanrentan', label: '3連単', band: 'sanrentan', bandLabel: '3連単', arity: 3, ordered: true, frame: false },
  ];
  var AXISPOS = [
    { k: '1', label: '1着' }, { k: '2', label: '2着' }, { k: '3', label: '3着' },
    { k: '12', label: '1・2着' }, { k: '13', label: '1・3着' }, { k: '23', label: '2・3着' },
  ];
  var MAX_CONFIRM_ROWS = 200;
  // 確かめる欄の目盛りの右端（EV）。買いライン（EV 1）は棒の 2/3 の所に来る（mockup-287 案C）
  var CONFIRM_GAUGE_MAX = 1.5;

  function typeOf(betType) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].type === betType) return TYPES[i];
    return TYPES[0];
  }

  // ===== §2.7 発売なし・無効条件（現行omEligibility踏襲＋枠連・3頭系を追加） =====
  function eligibility(type, heads) {
    if (type === 'fukusho' && heads <= 4) return { ok: false, reason: '5頭未満のため発売なし' };
    if (type === 'wide' && heads <= 4) return { ok: false, reason: '5頭未満のため発売なし' };
    if (type === 'wakuren' && heads < 9) return { ok: false, reason: '9頭未満のため発売なし' };
    if ((type === 'sanrenpuku' || type === 'sanrentan') && heads < 3) return { ok: false, reason: '3頭未満のため組成不可' };
    return { ok: true, reason: null };
  }

  // ===== §2.3 stateモデル =====
  function initialState() {
    return { betType: 'tansho', tanFuku: 'tansho', method: 'normal', axisPos: '1', multi: false, cols: {} };
  }
  function resetStateForType(state, newType) {
    state.betType = newType;
    state.method = 'normal';
    state.tanFuku = 'tansho';
    state.axisPos = '1';
    state.multi = false;
    state.cols = {};
  }
  function resetCols(state) {
    state.cols = {};
  }

  // ===== 88-akinator-spec.md T9: 買い目アキネーターの推奨(本線)をstateに流し込む =====
  // plan = { catalogId, axis:[軸馬番...], partners:[相手馬番...], swapIds?:[3頭。catalogId==='_swap'のみ] }
  // catalogIdはAkinator側のCATALOG(assets/akinator.js)のidと1:1対応。ここではstate.betType/method/
  // cols等への変換のみ行う（確率・オッズ計算やAkinatorのカタログ自体には一切触れない）。
  var AKINATOR_PLAN_MAP = {
    tan1: function (axis) { return { betType: 'tansho', tanFuku: 'tansho', method: 'normal', cols: { c0: [axis[0]] } }; },
    fuku1: function (axis) { return { betType: 'tansho', tanFuku: 'fukusho', method: 'normal', cols: { c0: [axis[0]] } }; },
    widenag: function (axis, p) { return { betType: 'wide', method: 'nagashi', cols: { axis: [axis[0]], partners: p.slice() } }; },
    widef: function (axis, p) { return { betType: 'wide', method: 'normal', cols: { c0: axis.slice(), c1: axis.concat(p) } }; },
    widebox: function (axis, p) { return { betType: 'wide', method: 'box', cols: { box: p.slice() } }; },
    urennag: function (axis, p) { return { betType: 'umaren', method: 'nagashi', cols: { axis: [axis[0]], partners: p.slice() } }; },
    urenf: function (axis, p) { return { betType: 'umaren', method: 'normal', cols: { c0: axis.slice(), c1: axis.concat(p) } }; },
    urenbox: function (axis, p) { return { betType: 'umaren', method: 'box', cols: { box: p.slice() } }; },
    utannag: function (axis, p) { return { betType: 'umatan', method: 'nagashi', cols: { axis: [axis[0]], partners: p.slice() }, multi: false }; },
    utannag2: function (axis, p) { return { betType: 'umatan', method: 'normal', cols: { c0: p.slice(), c1: [axis[0]] } }; },
    utanmul: function (axis, p) { return { betType: 'umatan', method: 'nagashi', cols: { axis: [axis[0]], partners: p.slice() }, multi: true }; },
    utanbox: function (axis, p) { return { betType: 'umatan', method: 'box', cols: { box: p.slice() } }; },
    spkax1: function (axis, p) { return { betType: 'sanrenpuku', method: 'nagashi', cols: { axis1: [axis[0]], axis2: [], partners: p.slice() } }; },
    spkax2: function (axis, p) { return { betType: 'sanrenpuku', method: 'nagashi', cols: { axis1: [axis[0]], axis2: [axis[1]], partners: p.slice() } }; },
    spkbox: function (axis, p) { return { betType: 'sanrenpuku', method: 'box', cols: { box: p.slice() } }; },
    stnax1: function (axis, p) { return { betType: 'sanrentan', method: 'nagashi', axisPos: '1', cols: { p1: [axis[0]], partners: p.slice() }, multi: false }; },
    stnax2: function (axis, p) { return { betType: 'sanrentan', method: 'nagashi', axisPos: '2', cols: { p2: [axis[0]], partners: p.slice() }, multi: false }; },
    stnax3: function (axis, p) { return { betType: 'sanrentan', method: 'nagashi', axisPos: '3', cols: { p3: [axis[0]], partners: p.slice() }, multi: false }; },
    stnax12: function (axis, p) { return { betType: 'sanrentan', method: 'nagashi', axisPos: '12', cols: { p1: [axis[0]], p2: [axis[1]], partners: p.slice() }, multi: false }; },
    stnmul: function (axis, p) { return { betType: 'sanrentan', method: 'nagashi', axisPos: '1', cols: { p1: [axis[0]], partners: p.slice() }, multi: true }; },
    stnbox: function (axis, p) { return { betType: 'sanrentan', method: 'box', cols: { box: p.slice() } }; },
    stnf: function (axis, p) { return { betType: 'sanrentan', method: 'normal', cols: { c0: [axis[0]], c1: p.slice(), c2: p.slice() } }; },
    _swap: function (axis, p, swapIds) { return { betType: 'sanrenpuku', method: 'box', cols: { box: swapIds.slice() } }; },
  };
  function applyPlan(state, plan) {
    if (!plan || !plan.catalogId) return state;
    var fn = AKINATOR_PLAN_MAP[plan.catalogId];
    if (!fn) return state;
    var out = fn(plan.axis || [], plan.partners || [], plan.swapIds || []);
    state.betType = out.betType;
    state.method = out.method || 'normal';
    state.tanFuku = out.tanFuku || 'tansho';
    state.axisPos = out.axisPos || '1';
    state.multi = !!out.multi;
    state.cols = out.cols || {};
    return state;
  }

  function methodsFor(t) {
    return [
      { m: 'normal', label: '通常・フォーメーション' },
      { m: 'box', label: 'ボックス' },
      { m: 'nagashi', label: 'ながし' },
    ];
  }

  // ===== §2.4 列定義（券種×買い方→列） =====
  function columns(state) {
    var t = typeOf(state.betType);
    if (t.arity === 1) return [{ key: 'c0', label: '選択', type: 'chk' }];
    if (state.method === 'box') return [{ key: 'box', label: '選択', type: 'chk' }];
    if (state.method === 'nagashi') {
      if (t.type === 'sanrenpuku') {
        return [
          { key: 'axis1', label: '軸1', type: 'radio' },
          { key: 'axis2', label: '軸2', type: 'radio' },
          { key: 'partners', label: '相手', type: 'chk' },
        ];
      }
      if (t.type === 'sanrentan') {
        var cols = [];
        if (state.axisPos.indexOf('1') !== -1) cols.push({ key: 'p1', label: '1着軸', type: 'radio' });
        if (state.axisPos.indexOf('2') !== -1) cols.push({ key: 'p2', label: '2着軸', type: 'radio' });
        if (state.axisPos.indexOf('3') !== -1) cols.push({ key: 'p3', label: '3着軸', type: 'radio' });
        cols.push({ key: 'partners', label: '相手', type: 'chk' });
        return cols;
      }
      return [{ key: 'axis', label: '軸', type: 'radio' }, { key: 'partners', label: '相手', type: 'chk' }];
    }
    // method === 'normal'（通常・フォーメーション）
    if (t.frame) return [{ key: 'f0', label: '枠1', type: 'chk' }, { key: 'f1', label: '枠2', type: 'chk' }];
    if (t.arity === 2) {
      var l2 = t.ordered ? ['1着', '2着'] : ['馬1', '馬2'];
      return [{ key: 'c0', label: l2[0], type: 'chk' }, { key: 'c1', label: l2[1], type: 'chk' }];
    }
    var l3 = t.ordered ? ['1着', '2着', '3着'] : ['馬1', '馬2', '馬3'];
    return [
      { key: 'c0', label: l3[0], type: 'chk' },
      { key: 'c1', label: l3[1], type: 'chk' },
      { key: 'c2', label: l3[2], type: 'chk' },
    ];
  }

  function getCol(state, key) {
    if (!state.cols[key]) state.cols[key] = [];
    return state.cols[key];
  }
  // 軸系(radio)は1頭/1枠だけ選択可。相手・馬N・選択(chk)は複数選択可
  function toggle(state, key, id, isRadio) {
    var arr = getCol(state, key);
    var idx = arr.indexOf(id);
    if (isRadio) {
      state.cols[key] = (idx >= 0) ? [] : [id];
      return;
    }
    if (idx >= 0) arr.splice(idx, 1); else arr.push(id);
  }

  // ===== 組み合わせ／順列（純ヘルパー。harville.jsの非公開実装とは独立に保持） =====
  function combosOf(arr, k) {
    var out = [];
    (function go(start, cur) {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (var i = start; i < arr.length; i++) { cur.push(arr[i]); go(i + 1, cur); cur.pop(); }
    })(0, []);
    return out;
  }
  function permsOf(arr, k) {
    var out = [];
    var used = new Array(arr.length);
    (function go(cur) {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (var i = 0; i < arr.length; i++) {
        if (used[i]) continue;
        used[i] = true; cur.push(arr[i]); go(cur); cur.pop(); used[i] = false;
      }
    })([]);
    return out;
  }
  function cartesian(arrs) {
    return arrs.reduce(function (acc, arr) {
      var out = [];
      acc.forEach(function (c) { arr.forEach(function (v) { out.push(c.concat([v])); }); });
      return out;
    }, [[]]);
  }

  function frameGroups(horses) {
    var g = {};
    horses.forEach(function (h) {
      if (h.scratched) return;
      if (!g[h.gate]) g[h.gate] = [];
      g[h.gate].push(h.number);
    });
    return g;
  }

  // ===== §2.5 列挙: state → 買い目リスト（frame型は{frame:[i,j]}、他は ids配列） =====
  function enumerate(state, site, heads) {
    var t = typeOf(state.betType);
    var cols = columns(state);
    var C = state.cols;
    var out = [];
    var seen = {};

    function add(ids) {
      var key = t.ordered ? ids.join('>') : ids.slice().sort(function (a, b) { return a - b; }).join('-');
      if (seen[key]) return;
      seen[key] = true;
      out.push(ids);
    }

    if (t.arity === 1) {
      (C.c0 || []).forEach(function (n) { add([n]); });
      return out;
    }

    if (t.frame) {
      var groups = frameGroups(site.horses);
      var pairs = [];
      var seenPair = {};
      function pushPair(i, j) {
        var lo = Math.min(i, j), hi = Math.max(i, j);
        var k = lo + '-' + hi;
        if (seenPair[k]) return;
        seenPair[k] = true;
        pairs.push([lo, hi]);
      }
      if (state.method === 'box') {
        var sel = (C.box || []).slice().sort(function (a, b) { return a - b; });
        for (var i = 0; i < sel.length; i++) {
          for (var j = i; j < sel.length; j++) pushPair(sel[i], sel[j]);
        }
      } else if (state.method === 'nagashi') {
        (C.axis || []).forEach(function (a) { (C.partners || []).forEach(function (p) { pushPair(a, p); }); });
      } else {
        (C.f0 || []).forEach(function (a) { (C.f1 || []).forEach(function (b) { pushPair(a, b); }); });
      }
      // 組成可否（対象枠に2頭以上いるか等）は rowDataFor 側の probWakuren が null を返して弾く
      return pairs.map(function (pr) { return { frame: pr }; });
    }

    if (state.method === 'box') {
      var box = C.box || [];
      (t.ordered ? permsOf(box, t.arity) : combosOf(box, t.arity)).forEach(add);
      return out;
    }

    if (state.method === 'nagashi') {
      if (t.type === 'sanrentan') {
        var partners3 = C.partners || [];
        var posOf = { p1: 0, p2: 1, p3: 2 };
        var fixed = ['p1', 'p2', 'p3'].filter(function (k) {
          return cols.some(function (c) { return c.key === k; }) && (C[k] || []).length;
        }).map(function (k) { return { k: k, id: C[k][0] }; });
        if (!fixed.length || !partners3.length) return out;
        var usedAxis = {};
        fixed.forEach(function (f) { usedAxis[f.id] = true; });
        var base = [null, null, null];
        fixed.forEach(function (f) { base[posOf[f.k]] = f.id; });
        var freePos = [0, 1, 2].filter(function (p) { return base[p] === null; });
        var remaining = partners3.filter(function (p) { return !usedAxis[p]; });
        permsOf(remaining, freePos.length).forEach(function (pp) {
          var ids = base.slice();
          freePos.forEach(function (p, i) { ids[p] = pp[i]; });
          if (ids.indexOf(null) !== -1) return;
          if (new Set(ids).size !== 3) return;
          if (state.multi) { permsOf(ids, 3).forEach(add); } else { add(ids); }
        });
        return out;
      }
      if (t.type === 'sanrenpuku') {
        var a1 = C.axis1 || [], a2 = C.axis2 || [], partnersS = C.partners || [];
        if (a1.length && a2.length) {
          partnersS.forEach(function (p) {
            if (new Set([a1[0], a2[0], p]).size === 3) add([a1[0], a2[0], p]);
          });
        } else if (a1.length) {
          combosOf(partnersS.filter(function (p) { return p !== a1[0]; }), 2).forEach(function (pr) {
            add([a1[0], pr[0], pr[1]]);
          });
        }
        return out;
      }
      // umaren / wide / umatan
      var axisN = C.axis || [], partnersN = C.partners || [];
      if (axisN.length) {
        partnersN.filter(function (p) { return p !== axisN[0]; }).forEach(function (p) {
          add([axisN[0], p]);
          if (t.ordered && state.multi) add([p, axisN[0]]);
        });
      }
      return out;
    }

    // method === 'normal'（フォーメーション）: 各列の直積、同一馬重複を除外
    var arrs = cols.map(function (c) { return C[c.key] || []; });
    if (arrs.some(function (a) { return a.length === 0; })) return out;
    cartesian(arrs).forEach(function (ids) {
      if (new Set(ids).size === ids.length) add(ids);
    });
    return out;
  }

  // ===== 確率計算ディスパッチ（harville.jsの非公開calcProbと同じ分岐。公開関数のみ呼ぶ） =====
  function calcP(type, ids, probs, heads) {
    switch (type) {
      case 'tansho': return Harville.probTansho(ids[0], probs);
      case 'fukusho': return Harville.probFukusho(ids[0], probs, heads);
      case 'wide': return Harville.probWide(ids[0], ids[1], probs, heads);
      case 'umaren': return Harville.probUmaren(ids[0], ids[1], probs);
      case 'umatan': return Harville.probUmatan(ids[0], ids[1], probs);
      case 'sanrenpuku': return Harville.probSanrenpuku(ids[0], ids[1], ids[2], probs);
      case 'sanrentan': return Harville.probSanrentan(ids[0], ids[1], ids[2], probs);
      default: return null;
    }
  }

  // ===== §2.6 枠連の確率合成（Harville.probUmarenを枠内・枠間で合成） =====
  function probWakuren(i, j, groups, probs) {
    var Fi = groups[i] || [], Fj = groups[j] || [];
    if (i === j) {
      if (Fi.length < 2) return null;
      var p1 = 0;
      combosOf(Fi, 2).forEach(function (pair) { p1 += Harville.probUmaren(pair[0], pair[1], probs); });
      return p1;
    }
    if (!Fi.length || !Fj.length) return null;
    var p2 = 0;
    Fi.forEach(function (a) { Fj.forEach(function (b) { p2 += Harville.probUmaren(a, b, probs); }); });
    return p2;
  }

  function oddsForType(oddsAll, type) {
    return (oddsAll && oddsAll.status && oddsAll.status[type] === 'result') ? oddsAll : null;
  }

  // 1件分の行データ（買いライン・現在オッズ・EV・低確率フラグ・ソートキー）を作る
  function rowDataFor(state, item, probs, heads, oddsAll, groups) {
    var t = typeOf(state.betType);
    if (item.frame) {
      var p = probWakuren(item.frame[0], item.frame[1], groups, probs);
      if (p === null || p === undefined) return null;
      var buyLine = Harville.buyLine(p);
      var odds = null, ev = null;
      var oa = oddsForType(oddsAll, 'wakuren');
      // B7（枠連オッズ取得）未実施の間は常にnull。実装後もodds_all-1.x互換のまま拾える設計（45-spec §2.6）
      if (oa && oa.odds && oa.odds.wakuren) {
        var key = Math.min(item.frame[0], item.frame[1]) + '-' + Math.max(item.frame[0], item.frame[1]);
        var raw = oa.odds.wakuren[key];
        if (raw !== null && raw !== undefined) {
          odds = Array.isArray(raw) ? raw[0] : raw;
          ev = Harville.ev(p, odds);
        }
      }
      return { frame: item.frame, p: p, buyLine: buyLine, odds: odds, ev: ev, lowP: false, key: 'f' + item.frame.join('-') };
    }
    var ids = item;
    var p2 = calcP(t.type, ids, probs, heads);
    if (p2 === null || p2 === undefined) return null;
    var buyLine2 = Harville.buyLine(p2);
    var odds2 = null, ev2 = null;
    var oa2 = oddsForType(oddsAll, t.type);
    if (oa2) {
      var o = Harville.oddsUsed(oa2, t.type, ids);
      if (o !== null && o !== undefined) { odds2 = o; ev2 = Harville.ev(p2, o); }
    }
    var pMin = (Harville.P_MIN[t.type] !== undefined) ? Harville.P_MIN[t.type] : 0;
    var lowP2 = p2 < pMin;
    return { ids: ids, p: p2, buyLine: buyLine2, odds: odds2, ev: ev2, lowP: lowP2, key: Harville.normKey(t.type, ids) };
  }

  // §4.7踏襲: EV降順 → 確率降順 → key昇順（EV無し行はEVあり行より後ろ）
  function sortRows(rows) {
    rows.sort(function (a, b) {
      var hasA = a.ev !== null && a.ev !== undefined;
      var hasB = b.ev !== null && b.ev !== undefined;
      if (hasA && hasB && a.ev !== b.ev) return b.ev - a.ev;
      if (hasA !== hasB) return hasA ? -1 : 1;
      if (a.p !== b.p) return b.p - a.p;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
  }

  // ===== §2.9 EV緑ハイライト（買える馬の色示） =====
  function evForIds(type, ids, probs, heads, oddsAll) {
    var p = calcP(type, ids, probs, heads);
    if (p === null || p === undefined) return null;
    var oa = oddsForType(oddsAll, type);
    if (!oa) return null;
    var odds = Harville.oddsUsed(oa, type, ids);
    if (odds === null || odds === undefined) return null;
    return Harville.ev(p, odds);
  }
  function bestOrderingEv(t, ids, probs, heads, oddsAll) {
    if (!t.ordered) return evForIds(t.type, ids, probs, heads, oddsAll);
    var best = null;
    permsOf(ids, ids.length).forEach(function (perm) {
      var e = evForIds(t.type, perm, probs, heads, oddsAll);
      if (e !== null && (best === null || e > best)) best = e;
    });
    return best;
  }
  // ながしの軸列（軸／軸1+軸2／p1+p2+p3）＝すべて併用した1シナリオとして試す
  function anchorScenarios(state, t) {
    if (state.method === 'nagashi') {
      var combined;
      if (t.type === 'sanrenpuku') combined = (state.cols.axis1 || []).concat(state.cols.axis2 || []);
      else if (t.type === 'sanrentan') combined = (state.cols.p1 || []).concat(state.cols.p2 || []).concat(state.cols.p3 || []);
      else combined = state.cols.axis || [];
      return combined.length ? [combined] : [];
    }
    return [];
  }
  // 候補馬hを加えたとき、残りスロットを全馬で総当たりしてEV>1のチケットが作れるかを探索（45-spec §2.9:
  // 「残り1枠を全馬で総当たり」。value源の3頭目が人気薄でも取りこぼさない。heads≤18で計算量は許容範囲）
  function scenarioEv(t, anchors, h, probs, heads, oddsAll, pool) {
    var open = t.arity - anchors.length - 1;
    if (open < 0) return 0;
    var base = anchors.concat([h]);
    if (open === 0) {
      var e = bestOrderingEv(t, base, probs, heads, oddsAll);
      return e === null ? 0 : e;
    }
    var used = {};
    base.forEach(function (n) { used[n] = true; });
    var candidates = pool.filter(function (n) { return !used[n]; });
    var best = 0;
    combosOf(candidates, open).forEach(function (extra) {
      var e = bestOrderingEv(t, base.concat(extra), probs, heads, oddsAll);
      if (e !== null && e > best) best = e;
    });
    return best;
  }

  // slots: 長さ arity の配列。数値=確定した馬、null=未定（残り全馬で総当たりする）。
  // 順序券種は slots の並びがそのまま着順なので、埋める組み合わせも順列で試す。
  function bestEvForSlots(t, slots, probs, heads, oddsAll, pool) {
    var open = [];
    var used = {};
    slots.forEach(function (v, i) {
      if (v === null || v === undefined) open.push(i); else used[v] = true;
    });
    if (!open.length) {
      var e0 = evForIds(t.type, slots.slice(), probs, heads, oddsAll);
      return e0 === null ? 0 : e0;
    }
    var candidates = pool.filter(function (n) { return !used[n]; });
    var fills = t.ordered ? permsOf(candidates, open.length) : combosOf(candidates, open.length);
    var best = 0;
    fills.forEach(function (fill) {
      var ids = slots.slice();
      open.forEach(function (p, i) { ids[p] = fill[i]; });
      var e = evForIds(t.type, ids, probs, heads, oddsAll);
      if (e !== null && e > best) best = e;
    });
    return best;
  }

  // 通常・フォーメーションの緑判定プラン。
  // すでに選んだ列を確定スロットに置き、「次に選ぶ列」を候補スロットにする。
  // 例) 3連複で 馬1=1 → 「1と組んでEV>1になる馬」が緑。さらに 馬2=4 を選ぶと
  //     → 「1-4と組んでEV>1になる3頭目」が緑に変わる。
  // 複数選択されている列は組み合わせを総当たりし、どれか1つでもEV>1なら緑にする。
  function normalSlotPlans(state, t) {
    var keys = columns(state).map(function (c) { return c.key; });
    var sel = keys.map(function (k) { return (state.cols[k] || []).slice(); });
    var any = sel.some(function (a) { return a.length > 0; });
    if (!any) return []; // 1頭も選んでいなければ緑なし（従来どおり）

    var target = -1;
    for (var i = 0; i < sel.length; i++) { if (!sel[i].length) { target = i; break; } }
    if (target === -1) target = sel.length - 1; // 全列が埋まっていれば最終列を対象にする

    var anchorPos = [];
    for (var j = 0; j < sel.length; j++) { if (j !== target && sel[j].length) anchorPos.push(j); }
    var combos = anchorPos.length ? cartesian(anchorPos.map(function (p) { return sel[p]; })) : [[]];

    return combos.map(function (ids) {
      var slots = [];
      for (var k = 0; k < t.arity; k++) slots.push(null);
      anchorPos.forEach(function (p, idx) { slots[p] = ids[idx]; });
      return { slots: slots, target: target };
    }).filter(function (pl) {
      // 同じ馬を2スロットに置くシナリオは買い目として成立しないので捨てる
      var seen = {}, ok = true;
      pl.slots.forEach(function (v) {
        if (v === null) return;
        if (seen[v]) ok = false;
        seen[v] = true;
      });
      return ok;
    });
  }
  function greenSet(state, site, probs, heads, oddsAll) {
    var t = typeOf(state.betType);
    var g = {};
    if (t.arity === 1) {
      var type1 = state.tanFuku === 'fukusho' ? 'fukusho' : 'tansho';
      site.horses.forEach(function (h) {
        if (h.scratched || !(h.number in probs)) return;
        var e = evForIds(type1, [h.number], probs, heads, oddsAll);
        if (e !== null && e > 1.0) g[h.number] = true;
      });
      return g;
    }
    if (t.frame || state.method === 'box') return g; // 枠連・ボックスは対象外（45-spec §2.9）
    var pool = Object.keys(probs).map(Number).sort(function (a, b) { return (probs[b] || 0) - (probs[a] || 0); });

    // 通常・フォーメーション: 選択済みの列すべてを踏まえ、次に選ぶ列の候補を緑にする
    if (state.method === 'normal') {
      var plans = normalSlotPlans(state, t);
      if (!plans.length) return g;
      var chosen = {};
      Object.keys(state.cols).forEach(function (k) {
        (state.cols[k] || []).forEach(function (n) { chosen[n] = true; });
      });
      site.horses.forEach(function (h) {
        if (h.scratched || !(h.number in probs) || chosen[h.number]) return;
        var bestN = 0;
        plans.forEach(function (pl) {
          var slots = pl.slots.slice();
          slots[pl.target] = h.number;
          var e = bestEvForSlots(t, slots, probs, heads, oddsAll, pool);
          if (e > bestN) bestN = e;
        });
        if (bestN > 1.0) g[h.number] = true;
      });
      return g;
    }

    var scenarios = anchorScenarios(state, t);
    if (!scenarios.length) return g;
    var anchorSet = {};
    scenarios.forEach(function (sc) { sc.forEach(function (n) { anchorSet[n] = true; }); });
    site.horses.forEach(function (h) {
      if (h.scratched || !(h.number in probs) || anchorSet[h.number]) return;
      var best = 0;
      scenarios.forEach(function (sc) {
        var e = scenarioEv(t, sc, h.number, probs, heads, oddsAll, pool);
        if (e > best) best = e;
      });
      if (best > 1.0) g[h.number] = true;
    });
    return g;
  }

  function fukushoOddsFor(h, oddsAll) {
    var oa = oddsForType(oddsAll, 'fukusho');
    if (!oa || !oa.odds || !oa.odds.fukusho) return null;
    var v = oa.odds.fukusho[h.number];
    if (v === null || v === undefined) return null;
    return Array.isArray(v) ? v[0] : v;
  }

  // ===== 描画 =====
  function renderTypes(state, heads) {
    return TYPES.map(function (t) {
      var elig = eligibility(t.type, heads);
      var cls = ['sim-type'];
      if (t.type === 'tansho') cls.push('wide2');
      if (state.betType === t.type) cls.push('active');
      var attrs = ['data-sim-type="' + t.type + '"'];
      if (!elig.ok) {
        cls.push('disabled');
        attrs.push('disabled', 'title="' + escapeHtml(elig.reason) + '"');
      }
      return '<button type="button" class="' + cls.join(' ') + '" ' + attrs.join(' ') + '>' + t.label + '</button>';
    }).join('');
  }

  // 2026-10-07（mockup-271・ユーザー決定）: 単勝／複勝の切り替えは色の帯の中（renderBand）へ移した。
  // 単勝・複勝のときは買い方の段そのものを出さない（renderBlockB が空なら器ごと省く）
  function renderMethods(state) {
    var t = typeOf(state.betType);
    if (t.arity === 1) return '';
    return methodsFor(t).map(function (m) {
      var active = state.method === m.m ? ' active' : '';
      return '<button type="button" class="sim-method' + active + '" data-sim-method="' + m.m + '">' + m.label + '</button>';
    }).join('');
  }

  function renderAxisPosAndMulti(state) {
    var t = typeOf(state.betType);
    if (t.type === 'sanrentan' && state.method === 'nagashi') {
      var posHtml = AXISPOS.map(function (a) {
        return '<button type="button" class="' + (state.axisPos === a.k ? 'active' : '') + '" data-sim-axispos="' + a.k + '">' + a.label + '</button>';
      }).join('');
      return '<div class="sim-axispos">' + posHtml + '</div>' + multiSwitch(state);
    }
    if (t.type === 'umatan' && state.method === 'nagashi') {
      return multiSwitch(state);
    }
    return '';
  }
  // 2026-10-07（ユーザー「ながしのボタンとマルチもそろえて」）: マルチは切り替えスイッチの形。
  // 中身は今までどおりのチェックボックス（data-sim-multi の change を handleChange が受ける）
  function multiSwitch(state) {
    return '<label class="sim-multi' + (state.multi ? ' on' : '') + '"><span>マルチ</span>'
      + '<input type="checkbox" role="switch" data-sim-multi' + (state.multi ? ' checked' : '') + '></label>';
  }

  function bandLabel(state) {
    var t = typeOf(state.betType);
    if (t.arity === 1) return state.tanFuku === 'fukusho' ? '複勝' : '単勝';
    return t.bandLabel;
  }
  // 2026-10-07（mockup-271）: 帯は「券種＋買い方」（例: 3連単 フォーメーション）。
  // .sim-band は買い目シートのカードも使うので、表の上の帯だけ .sim-hd を足して見た目を分ける
  function renderBand(state) {
    var t = typeOf(state.betType);
    var label = bandLabel(state) + (t.arity === 1 ? '' : ' ' + methodLabel(state));
    var tf = '';
    if (t.arity === 1) {
      tf = '<span class="sim-tf">' + ['tansho', 'fukusho'].map(function (k) {
        return '<button type="button" class="' + (state.tanFuku === k ? 'active' : '') + '" data-sim-tf="' + k + '">'
          + (k === 'tansho' ? '単勝' : '複勝') + '</button>';
      }).join('') + '</span>';
    }
    return '<div class="sim-band sim-hd ' + t.band + '"><span>' + escapeHtml(label) + '</span>' + tf + '</div>';
  }

  // ===== 印の2列（2026-09-07 ユーザー決定・111-spec §3.5 と同じ読み方） =====
  // 自分の印の正本は出馬表側（race.js の MM ＝ localStorage の mymark:{race_id}）。
  // ここでは**読むだけ**で、押すと出馬表タブのその馬へ飛ぶ（飛ばすのは race.js 側）。
  // 付け替えの仕組みを二重に持たないための形で、確率にも買い方の計算にも一切入らない。
  // 寸法は隣タブ（アキネーター）の .ak-my と同じ16px幅。出馬表と同じ32px幅にすると
  // 3連単フォーメーション（選択3列）で表が容器から24pxはみ出し、ページに横スクロールが出る
  // （375px・16頭で実測。16px幅なら +4px に収まる）。
  var MY_CLS = { '◎': 'm1', '○': 'm2', '▲': 'm3', '△': 'm4', '☆': 'm5', '✓': 'm7', '消': 'm6' };
  function loadMyMarks(site) {
    var out = {};
    try {
      var id = site && site.race ? site.race.race_id : null;
      if (!id || typeof localStorage === 'undefined') return out;
      var o = JSON.parse(localStorage.getItem('mymark:' + id)) || {};
      // 知らない印（廃止した ー・壊れた値）は出さない。読み捨ては出馬表側 mmLoad の仕事
      Object.keys(o).forEach(function (k) { if (MY_CLS[o[k]]) out[String(k)] = o[k]; });
    } catch (e) { /* localStorage が使えない環境では印なしで描く */ }
    return out;
  }
  // 2026-10-07（mockup-271）: 印の列は「自分＝色つきの記号」の下に「AI＝札」を重ねる。
  // 印が無い馬には何も出さない（「—」は置かない。列の幅は器 .sim-mk が持つので縦は揃う）。
  // 2026-09-08: 押すと出馬表へ飛ぶ導線をやめ、読むだけの札にした（ユーザー決定）。
  // 押す先は馬名（戦績のポップアップ）に一本化してある。
  function myCell(h, myMarks) {
    var mk = myMarks[String(h.number)];
    return mk ? '<span class="sim-my ' + MY_CLS[mk] + '">' + escapeHtml(mk) + '</span>' : '';
  }
  // AIの印は出馬表に揃える（能力印の塗りチップ＋穴／地雷／消し）。描くのは呼び手が渡す関数
  function aiCell(h, aiMark) {
    var inner = (typeof aiMark === 'function') ? aiMark(h) : '';
    return inner ? '<span class="sim-ai">' + inner + '</span>' : '';
  }
  // 選ぶ欄の中の字。列が1つ（単勝・ボックス）は ✓ だけ。列が複数あるときは押す前に
  // どの列か分かるよう、1着→1・馬2→2・枠1→1・軸系→軸・相手→相 を入れる
  function pickLabel(c, nCols) {
    if (nCols === 1) return '';
    var m = c.label.match(/^(\d)着$/) || c.label.match(/^(?:馬|枠)(\d)$/);
    if (m) return m[1];
    if (c.label.indexOf('軸') !== -1) return '軸';
    if (c.label === '相手') return '相';
    return c.label.charAt(0);
  }

  // 2026-10-07（mockup-271 案3・ユーザー決定）: 表を「1頭ずつの白い帯」にした。
  // 評価・点数は出さない（ユーザー「点数は消して」「ランクもいらない」）。
  // 1行目＝馬名、2行目＝（買い）騎手・斤量、右にオッズと人気。「買い」は帯ごと薄い緑＋2行目の頭の文字。
  // 幅は 375px の画面で表が 335px（実測）。選ぶ列が3つの時も馬名9文字が切れないよう、
  // 列が2つ以上なら選ぶ欄とオッズ欄を詰める（.sim-list.multi。.wide はワイドの券種色なので使わない）。
  function renderHorseTable(site, state, probs, heads, oddsAll, opts) {
    var t = typeOf(state.betType);
    if (t.arity === 1 && state.tanFuku === 'fukusho' && heads <= 4) {
      return '<div class="om-empty">5頭未満のため複勝は発売されません</div>';
    }
    var cols = columns(state);
    var wide = cols.length > 1;
    var g = greenSet(state, site, probs, heads, oddsAll);
    var horses = site.horses.slice().sort(function (a, b) { return a.number - b.number; });
    var myMarks = loadMyMarks(site);   // 描画のたびに読み直す（出馬表で付け替えて戻る動きに追いつく）
    // 発走前は race.js が更新ボタン（opts.oddsBtn）を渡すので、見出しの「オッズ」をそれに替える（2026-10-10・142-spec §6）
    var rf = (opts && opts.oddsBtn) || '';
    var head = '<div class="sim-lh"><span class="c">印</span><span></span><span>馬名・騎手</span>'
      + (rf ? '<span class="r has-rf">' + rf + '</span>' : '<span class="r">オッズ</span>')
      + cols.map(function (c) { return '<span class="c">' + escapeHtml(wide ? c.label : '選ぶ') + '</span>'; }).join('') + '</div>';
    var body = horses.map(function (h) {
      var id = t.frame ? h.gate : h.number;
      var disabled = h.scratched || !(h.number in probs);
      // 2026-09-08（案C・ユーザー決定）: 自分の印が「消」の馬は行を沈め、緑と「買い」を出さない。
      // 自分で切った馬に「買い」と出続けるのは矛盾なので、自分の判断を勝たせる。
      // 緑判定そのもの（greenSet）は変えていない。他の馬の緑は今までどおり出る。
      var isKeshi = myMarks[String(h.number)] === '消';
      var isGreen = !isKeshi && !!g[h.number];
      var oddsVal = (t.arity === 1 && state.tanFuku === 'fukusho') ? fukushoOddsFor(h, oddsAll) : h.odds;
      var hot = (oddsVal !== null && oddsVal !== undefined && oddsVal < 10) ? ' class="hot"' : '';
      var oddsHtml = '<span class="sim-od"><b' + hot + '>'
        + ((oddsVal !== null && oddsVal !== undefined) ? oddsVal.toFixed(1) : '—') + '</b>'
        + (h.popularity ? '<small>' + h.popularity + '人気</small>' : '') + '</span>';
      // 取消馬にはポップアップそのものが無い（renderPopups が live だけ作る）ので押せない
      var nameHtml = h.scratched
        ? '<span class="sim-nm">' + escapeHtml(h.name) + '</span>'
        : '<button type="button" class="sim-nm" data-pop="' + h.number + '">'
          + '<span class="t">' + escapeHtml(h.name) + '</span><i class="apop">▸</i></button>';
      var meta = (isGreen ? '<b class="sim-buy">買い</b>' : '')
        + (h.jockey ? escapeHtml(h.jockey) : '')
        + ((h.weight_carried !== null && h.weight_carried !== undefined) ? '<span class="kg">' + h.weight_carried.toFixed(1) + '</span>' : '');
      var cells = cols.map(function (c) {
        var arr = state.cols[c.key] || [];
        var on = arr.indexOf(id) !== -1;
        var lb = pickLabel(c, cols.length);
        var cls = 'sim-pick' + (c.type === 'radio' ? ' radio' : '') + (lb ? ' lbl' : '') + (on ? ' on' : '');
        return '<button type="button" class="' + cls + '" data-sim-pick data-col="' + c.key + '" data-id="' + id + '" data-radio="' + (c.type === 'radio' ? '1' : '0') + '"'
          + (disabled ? ' disabled' : '') + ' aria-label="' + escapeHtml(c.label) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + lb + '</button>';
      }).join('');
      var rCls = 'sim-r' + (isGreen ? ' green' : '') + (isKeshi ? ' my-keshi' : '') + (h.scratched ? ' scr' : '');
      return '<div class="' + rCls + '"><span class="sim-mk">' + myCell(h, myMarks) + aiCell(h, opts && opts.aiMark) + '</span>'
        + umaBox(h.number, h.gate)
        + '<div class="sim-hbody"><div class="sim-hname">' + nameHtml + '</div><div class="sim-hmeta">' + meta + '</div></div>'
        + oddsHtml + cells + '</div>';
    }).join('');
    return '<div class="sim-list ' + t.band + (wide ? ' multi' : '') + '" style="--sim-n:' + cols.length + '">'
      + head + '<div class="sim-rows">' + body + '</div></div>';
  }

  function methodLabel(state) {
    var t = typeOf(state.betType);
    if (t.arity === 1) return '';
    if (state.method === 'box') return 'ボックス';
    if (state.method === 'nagashi') {
      if (t.type === 'sanrentan') {
        var a = AXISPOS.filter(function (x) { return x.k === state.axisPos; })[0];
        return (a ? a.label : '') + 'ながし' + (state.multi ? 'マルチ' : '');
      }
      return 'ながし' + (state.multi ? 'マルチ' : '');
    }
    return 'フォーメーション';
  }

  function renderConfirm(state, site, probs, heads, oddsAll) {
    var t = typeOf(state.betType);
    if (t.arity === 1 && state.tanFuku === 'fukusho' && heads <= 4) return '';
    var byNumber = {};
    site.horses.forEach(function (h) { byNumber[h.number] = h; });
    var groups = frameGroups(site.horses);
    var items = enumerate(state, site, heads);
    var rows = items.map(function (item) { return rowDataFor(state, item, probs, heads, oddsAll, groups); }).filter(Boolean);
    sortRows(rows);

    // 2026-10-10（mockup-287 案C・ユーザー決定「元のCで本番実装して」）: 確かめる欄を馬の表と同じ
    // 「灰の地に1点ずつの白い帯」にした。真ん中は目盛り＝今のオッズが買いラインのどこまで来たか
    // （棒は EV 0〜CONFIRM_GAUGE_MAX。黒い線が EV 1＝買いライン。越えたら緑）。
    // 上にあった「組み合わせ：N点 ／ 選択済：N件」の行はやめ、点数は色の帯へ、選んだ数は列の見出しへ移した。
    // 選んだ数は「件」（列ごとの延べ数）ではなく、重ならない馬（枠連は枠）の数にした
    var picked = {};
    Object.keys(state.cols).forEach(function (k) { (state.cols[k] || []).forEach(function (n) { picked[n] = true; }); });
    var selCount = Object.keys(picked).length;

    if (!rows.length) {
      return '<div class="sim-cf-empty">ポジションに馬を選ぶと、ここに買い目・買いライン・EVが出ます</div>';
    }

    var shown = rows.slice(0, MAX_CONFIRM_ROWS);
    var restCount = rows.length - shown.length;

    var bodyHtml = shown.map(function (r) {
      var ids = r.frame || r.ids;
      var seq = ids.map(function (n, i) {
        var sep = i > 0 ? '<span class="sim-cf-sep">' + (t.ordered ? '→' : '-') + '</span>' : '';
        if (r.frame) return sep + wakuBox(n);
        var h = byNumber[n];
        return sep + umaBox(n, h ? h.gate : undefined);
      }).join('');
      // 1頭なら馬名を全部。2頭以上は馬の表の「馬名／騎手」と同じ2段で、下に頭の数文字（2頭は4文字・3頭は3文字）
      var who = '<div class="sim-cf-seq">' + seq;
      if (r.frame) {
        who += '</div>';
      } else if (ids.length === 1) {
        who += '<span class="sim-cf-nm">' + escapeHtml(byNumber[ids[0]] ? byNumber[ids[0]].name : '') + '</span></div>';
      } else {
        var len = ids.length > 2 ? 3 : 4;
        who += '</div><span class="sim-cf-sub">' + ids.map(function (n) {
          return escapeHtml(byNumber[n] ? byNumber[n].name.slice(0, len) : '');
        }).join('・') + '</span>';
      }
      var hasEv = r.ev !== null && r.ev !== undefined;
      var isBuy = hasEv && r.ev > 1.0;
      var w = hasEv ? Math.min(r.ev, CONFIRM_GAUGE_MAX) / CONFIRM_GAUGE_MAX * 100 : 0;
      var oddsTxt = (r.odds !== null && r.odds !== undefined) ? r.odds.toFixed(1) : '—';
      var buyLineTxt = (r.buyLine !== null && r.buyLine !== undefined) ? r.buyLine.toFixed(1) + '倍' : '—';
      return '<div class="sim-cf-r"><div class="sim-cf-who">' + who + '</div>'
        + '<div class="sim-cf-g"><div class="sim-cf-trk"><div class="sim-cf-fill' + (isBuy ? ' sim-cf-up' : '') + '" style="width:' + w.toFixed(1) + '%"></div>'
        + '<div class="sim-cf-tick" style="left:calc(' + (100 / CONFIRM_GAUGE_MAX).toFixed(1) + '% - 1px)"></div></div>'
        + '<div class="sim-cf-txt"><span class="sim-cf-od">' + oddsTxt + '</span><span>' + buyLineTxt + '</span></div></div>'
        + '<div class="sim-cf-ev"><b' + (isBuy ? ' class="sim-cf-up"' : '') + '>' + (hasEv ? r.ev.toFixed(2) : '—') + '</b>'
        + (r.lowP ? '<span class="sim-cf-low">低確率</span>' : '') + '</div></div>';
    }).join('');

    var withOdds = rows.filter(function (r) { return r.odds !== null && r.odds !== undefined; }).map(function (r) { return r.odds; });
    var lo = withOdds.length ? Math.min.apply(null, withOdds) : null;
    var hi = withOdds.length ? Math.max.apply(null, withOdds) : null;
    var range = lo === null ? '' : (lo === hi ? lo.toFixed(1) + '倍' : lo.toFixed(1) + '〜' + hi.toFixed(1) + '倍');
    var moreLine = restCount > 0 ? '<div class="sim-more">…他' + restCount + '点</div>' : '';

    // 128-spec: 組んだものをシートに残す。押した時の state を betsheet.js が写し取る
    var addBtn = '<button type="button" class="sim-add" data-sim-add>シートに入れる</button>';

    var name = (bandLabel(state) + ' ' + methodLabel(state)).trim();
    return '<div class="sim-band sim-cf-band ' + t.band + '"><span class="sim-cf-l">' + escapeHtml(name)
      + ' <span class="sim-cf-n">' + rows.length + '<i>点</i></span></span><span class="sim-cf-rng">' + range + '</span></div>'
      + '<div class="sim-cf"><div class="sim-cf-lh"><span>買い目（' + selCount + (t.frame ? '枠' : '頭') + 'から）</span>'
      + '<span class="sim-cf-lg"><span>オッズ</span><span>| 買いライン</span></span><span class="sim-cf-lr">EV</span></div>'
      + '<div class="sim-cf-rows">' + bodyHtml + '</div></div>' + moreLine + addBtn;
  }

  // opts = { aiMark: 馬 → AIの印のHTML }（race.js の markBadge20。無ければAI印は「—」）
  function renderBlockB(site, probs, heads, oddsAll, state, opts) {
    return '<div class="sim-types">' + renderTypes(state, heads) + '</div>'
      + (function (m) { return m ? '<div class="sim-methods">' + m + '</div>' : ''; })(renderMethods(state))
      + renderAxisPosAndMulti(state)
      + renderBand(state)
      + renderHorseTable(site, state, probs, heads, oddsAll, opts)
      + renderConfirm(state, site, probs, heads, oddsAll);
  }

  // ===== イベント処理（race.js側のイベント委譲から呼ばれる。state変更時はtrueを返す） =====
  function handleClick(state, target) {
    var el;
    el = target.closest('[data-sim-type]');
    if (el) { if (el.disabled) return true; resetStateForType(state, el.dataset.simType); return true; }
    el = target.closest('[data-sim-tf]');
    if (el) { state.tanFuku = el.dataset.simTf; return true; }
    el = target.closest('[data-sim-method]');
    if (el) { if (el.disabled) return true; state.method = el.dataset.simMethod; resetCols(state); return true; }
    el = target.closest('[data-sim-axispos]');
    if (el) { state.axisPos = el.dataset.simAxispos; resetCols(state); return true; }
    el = target.closest('[data-sim-pick]');
    if (el) { if (el.disabled) return true; toggle(state, el.dataset.col, Number(el.dataset.id), el.dataset.radio === '1'); return true; }
    return false;
  }
  function handleChange(state, target) {
    if (target.matches && target.matches('[data-sim-multi]')) { state.multi = target.checked; return true; }
    return false;
  }

  // ===== 128-spec: 買い目シート（betsheet.js）へ渡す取り出し口 =====
  // シートは組み合わせ・確率・オッズの計算を一切持たない。ここで作った結果だけを描く。
  // 保存したstateからその時のオッズで組み直すので、古いオッズが残ることがない。
  function rowsFor(state, site, probs, heads, oddsAll) {
    var groups = frameGroups(site.horses);
    var items = enumerate(state, site, heads);
    var rows = items.map(function (item) {
      return rowDataFor(state, item, probs, heads, oddsAll, groups);
    }).filter(Boolean);
    sortRows(rows);
    return rows;
  }
  // シートのカード見出しとポジション行に要る材料。state の読み替えはここに集約する
  function describe(state) {
    var t = typeOf(state.betType);
    return {
      band: t.band,
      bandLabel: bandLabel(state),
      methodLabel: methodLabel(state),
      ordered: t.ordered,
      frame: t.frame,
      cols: columns(state).map(function (c) {
        return { key: c.key, label: c.label, ids: (state.cols[c.key] || []).slice() };
      }),
    };
  }
  // 保存する形。cols は参照を渡すと後から書き換わるので必ず写しを取る
  function snapshot(state) {
    var cols = {};
    Object.keys(state.cols).forEach(function (k) { cols[k] = (state.cols[k] || []).slice(); });
    return {
      betType: state.betType, tanFuku: state.tanFuku, method: state.method,
      axisPos: state.axisPos, multi: !!state.multi, cols: cols,
    };
  }

  var Simulator = {
    initialState: initialState,
    renderBlockB: renderBlockB,
    rowsFor: rowsFor,
    describe: describe,
    snapshot: snapshot,
    handleClick: handleClick,
    handleChange: handleChange,
    applyPlan: applyPlan,
    // テスト用に内部関数も公開（Node crosscheck・単体確認向け。UIからは呼ばない）
    _internal: {
      enumerate: enumerate,
      probWakuren: probWakuren,
      greenSet: greenSet,
      columns: columns,
      typeOf: typeOf,
      eligibility: eligibility,
    },
  };

  if (typeof window !== 'undefined') {
    window.Simulator = Simulator;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Simulator;
  }
})();
