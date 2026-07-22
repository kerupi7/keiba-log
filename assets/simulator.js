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
 *   app.js:      umaBox, wakuBox, gradeClass, gradeDisp, escapeHtml, fmtNum, MARK_CLASS
 *   harville.js: window.Harville（probTansho/probFukusho/probWide/probUmaren/probUmatan/
 *                probSanrenpuku/probSanrentan/normKey/oddsUsed/buyLine/ev/P_MIN/buildProbs）
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

  function typeOf(betType) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].type === betType) return TYPES[i];
    return TYPES[0];
  }

  // ===== §2.7 発売なし・無効条件（現行omEligibility踏襲＋枠連・3頭系を追加） =====
  function eligibility(type, heads) {
    if (type === 'fukusho' && heads <= 4) return { ok: false, reason: '5頭未満のため発売なし' };
    if (type === 'wide' && heads < 8) return { ok: false, reason: '8頭未満のため発売なし' };
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

  function renderMethods(state) {
    var t = typeOf(state.betType);
    if (t.arity === 1) {
      return ['tansho', 'fukusho'].map(function (k) {
        var active = state.tanFuku === k ? ' active' : '';
        return '<button type="button" class="sim-method sub' + active + '" data-sim-tf="' + k + '">'
          + (k === 'tansho' ? '単勝' : '複勝') + '</button>';
      }).join('');
    }
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
      return '<div class="sim-axispos">' + posHtml + '</div>'
        + '<label class="sim-multi"><input type="checkbox" data-sim-multi' + (state.multi ? ' checked' : '') + '>マルチ</label>';
    }
    if (t.type === 'umatan' && state.method === 'nagashi') {
      return '<label class="sim-multi"><input type="checkbox" data-sim-multi' + (state.multi ? ' checked' : '') + '>マルチ</label>';
    }
    return '';
  }

  function bandLabel(state) {
    var t = typeOf(state.betType);
    if (t.arity === 1) return state.tanFuku === 'fukusho' ? '複勝' : '単勝';
    return t.bandLabel;
  }
  function renderBand(state) {
    var t = typeOf(state.betType);
    return '<div class="sim-band ' + t.band + '">' + escapeHtml(bandLabel(state)) + '</div>';
  }

  function renderHorseTable(site, state, probs, heads, oddsAll) {
    var t = typeOf(state.betType);
    if (t.arity === 1 && state.tanFuku === 'fukusho' && heads <= 4) {
      return '<div class="om-empty">5頭未満のため複勝は発売されません</div>';
    }
    var cols = columns(state);
    var g = greenSet(state, site, probs, heads, oddsAll);
    var horses = site.horses.slice().sort(function (a, b) { return a.number - b.number; });
    var head = '<tr><th class="l">馬番 / 印 / 馬名・騎手・評価</th>'
      + cols.map(function (c) { return '<th>' + escapeHtml(c.label) + '</th>'; }).join('') + '</tr>';
    var body = horses.map(function (h) {
      var id = t.frame ? h.gate : h.number;
      var disabled = h.scratched || !(h.number in probs);
      var isGreen = !!g[h.number];
      var mkCls = MARK_CLASS[h.ability_mark];
      var mkHtml = mkCls ? '<span class="sim-mk ' + mkCls + '">' + h.ability_mark + '</span>' : '<span class="sim-mk none">–</span>';
      var oddsVal = (t.arity === 1 && state.tanFuku === 'fukusho') ? fukushoOddsFor(h, oddsAll) : h.odds;
      var hot = (oddsVal !== null && oddsVal !== undefined && oddsVal < 10) ? ' hot' : '';
      var gradeHtml = h.grade ? ' <span class="sim-grade ' + gradeClass(h.grade) + '">' + escapeHtml(gradeDisp(h.grade)) + '</span>' : '';
      var gflag = isGreen ? ' <span class="sim-gflag">買い</span>' : '';
      var oddsHtml = (oddsVal !== null && oddsVal !== undefined)
        ? '<span class="' + hot.trim() + '">' + oddsVal.toFixed(1) + '</span>' : '—';
      var popHtml = h.popularity ? ' (' + h.popularity + '人気)' : '';
      var metaHtml = h.jockey
        ? '<div class="sim-hmeta">' + escapeHtml(h.jockey) + (h.weight_carried !== null && h.weight_carried !== undefined ? ' ・ ' + h.weight_carried.toFixed(1) + 'kg' : '') + '</div>'
        : '';
      var nameCell = '<td class="l"><div style="display:flex;align-items:center;gap:5px">'
        + umaBox(h.number, h.gate) + mkHtml
        + '<div><div class="sim-hname">' + escapeHtml(h.name) + gradeHtml + ' ' + fmtNum(h.total, 1) + gflag + '</div>'
        + '<div class="sim-hodds">' + oddsHtml + popHtml + '</div>'
        + metaHtml + '</div></div></td>';
      var cells = cols.map(function (c) {
        var arr = state.cols[c.key] || [];
        var on = arr.indexOf(id) !== -1;
        var shape = c.type === 'radio' ? ' radio' : '';
        return '<td><button type="button" class="sim-pick' + shape + (on ? ' on' : '') + '" data-sim-pick data-col="' + c.key + '" data-id="' + id + '" data-radio="' + (c.type === 'radio' ? '1' : '0') + '"' + (disabled ? ' disabled' : '') + '></button></td>';
      }).join('');
      return '<tr class="' + (isGreen ? 'green' : '') + '">' + nameCell + cells + '</tr>';
    }).join('');
    return '<table class="sim-sel"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
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

    var selCount = 0;
    Object.keys(state.cols).forEach(function (k) { selCount += (state.cols[k] || []).length; });
    var summary = '<div class="sim-summary">組み合わせ：<b>' + rows.length + '</b>点　／　選択済：<b>' + selCount + '</b>件</div>';

    if (!rows.length) {
      return summary + '<div class="sim-confirm"><div class="om-empty">ポジションに馬を選ぶと、ここに買い目・買いライン・EVが出ます</div></div>';
    }

    var shown = rows.slice(0, MAX_CONFIRM_ROWS);
    var restCount = rows.length - shown.length;

    var bodyHtml = shown.map(function (r) {
      var ids = r.frame || r.ids;
      var seq = ids.map(function (n, i) {
        var sep = i > 0 ? '<span class="cbsep">' + (t.ordered ? '→' : '-') + '</span>' : '';
        if (r.frame) return sep + wakuBox(n);
        var h = byNumber[n];
        return sep + umaBox(n, h ? h.gate : undefined) + '<span class="abbr">' + escapeHtml(h ? h.name.slice(0, 3) : '') + '</span>';
      }).join('');
      var buyLineTxt = (r.buyLine !== null && r.buyLine !== undefined) ? r.buyLine.toFixed(1) + '倍' : '—';
      var oddsTxt = (r.odds !== null && r.odds !== undefined) ? r.odds.toFixed(1) + '倍' : '—';
      var hasEv = r.ev !== null && r.ev !== undefined;
      var isBuy = hasEv && r.ev > 1.0;
      var evTxt = hasEv ? r.ev.toFixed(2) : '—';
      var lowChip = r.lowP ? ' <span class="chip lowp">低確率</span>' : '';
      return '<div class="sim-combo' + (isBuy ? ' buy' : '') + '"><div class="seq">' + seq + '</div>'
        + '<div class="nums"><span>買いライン <b>' + buyLineTxt + '</b></span>'
        + '<span>現在 <b>' + oddsTxt + '</b></span>'
        + '<span>EV <b class="' + (isBuy ? 'om-ev-plus' : '') + '">' + evTxt + '</b></span>' + lowChip + '</div></div>';
    }).join('');

    var withOdds = rows.filter(function (r) { return r.odds !== null && r.odds !== undefined; }).map(function (r) { return r.odds; });
    var range = withOdds.length
      ? Math.min.apply(null, withOdds).toFixed(1) + '倍 〜 ' + Math.max.apply(null, withOdds).toFixed(1) + '倍'
      : '';
    var moreLine = restCount > 0 ? '<div class="sim-more">…他' + restCount + '点</div>' : '';

    return summary
      + '<div class="sim-confirm"><div class="ch"><span>' + escapeHtml(bandLabel(state) + ' ' + methodLabel(state) + ' ' + rows.length + '点') + '</span>'
      + '<span class="rng">' + range + '</span></div>' + bodyHtml + '</div>' + moreLine;
  }

  function renderBlockB(site, probs, heads, oddsAll, state) {
    return '<div class="om-subhead">B. 手動シミュレーター</div>'
      + '<div class="sim-types">' + renderTypes(state, heads) + '</div>'
      + '<div class="sim-methods">' + renderMethods(state) + '</div>'
      + renderAxisPosAndMulti(state)
      + renderBand(state)
      + renderHorseTable(site, state, probs, heads, oddsAll)
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

  var Simulator = {
    initialState: initialState,
    renderBlockB: renderBlockB,
    handleClick: handleClick,
    handleChange: handleChange,
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
