/**
 * Harville確率モデル & 買い目シミュレーター計算モジュール（keiba-log 買い目シミュレーター）
 *
 * 正本: Kelpie.Inc shared/scripts/keiba_harville.py
 *      （複勝のみ shared/scripts/keiba_select_bets.py の prob_fukusho 行44-58）
 * 本ファイルはその移植（写し）であり、JS側で式を改変・最適化・簡略化してはならない。
 * 式を変更する場合は 必ず 正本Pythonを修正 → shared/scripts/keiba_harville_fixture.py で
 * fixture再生成 → tools/harville_crosscheck.mjs で突合を再実行し一致を確認 → 本ファイルへ
 * 追随、の順でのみ行う（JS先行の修正は禁止）。
 *
 * 仕様書: Kelpie.Inc docs/keiba-log-design/17-odds-master-spec.md §3.3 / §3.4 / §4 / §5.1 / §5.2
 *
 * 契約: 純関数のみ。DOM・fetch・console禁止。ブラウザ(window.Harville)とNode(module.exports)の
 * 両方で同一オブジェクトを公開する。馬番などのid引数はすべて数値(Number)で渡すこと
 * （horses[].number 由来。文字列を渡すと内部の等価比較(===)が壊れる）。
 */
(function () {
  'use strict';

  // ---- §3.4 定数（正本: shared/keiba/bet_config.json の2026-07時点値のミラー。改訂時は手動同期） ----
  var EV_TARGET = 1.0;

  var P_MIN = {
    tansho: 0.05,
    fukusho: 0.10,
    wide: 0.05,
    umaren: 0.02,
    umatan: 0.015,
    sanrenpuku: 0.01,
    sanrentan: 0.005,
  };

  var ORDERED_TYPES = { umatan: true, sanrentan: true };
  var TYPE_ARITY = {
    tansho: 1, fukusho: 1, wide: 2, umaren: 2, umatan: 2, sanrenpuku: 3, sanrentan: 3,
  };
  var RECOMMEND_TYPE_ORDER = ['tansho', 'fukusho', 'wide', 'umaren', 'umatan', 'sanrenpuku', 'sanrentan'];

  // ---- 組み合わせ／順列（純ヘルパー・API非公開） ----
  function combinationsOf(arr, k) {
    var result = [];
    var combo = [];
    function helper(start) {
      if (combo.length === k) {
        result.push(combo.slice());
        return;
      }
      for (var i = start; i < arr.length; i++) {
        combo.push(arr[i]);
        helper(i + 1);
        combo.pop();
      }
    }
    helper(0);
    return result;
  }

  function permutationsOf(arr, k) {
    var result = [];
    var used = new Array(arr.length);
    var combo = [];
    function helper() {
      if (combo.length === k) {
        result.push(combo.slice());
        return;
      }
      for (var i = 0; i < arr.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        combo.push(arr[i]);
        helper();
        combo.pop();
        used[i] = false;
      }
    }
    helper();
    return result;
  }

  function sumOfProbs(probs) {
    var keys = Object.keys(probs);
    var total = 0;
    for (var i = 0; i < keys.length; i++) total += probs[keys[i]];
    return total;
  }

  // ---- §4.1 probs/heads構築 ----
  function buildProbs(horses) {
    var probs = {};
    for (var i = 0; i < horses.length; i++) {
      var h = horses[i];
      if (h.scratched) continue;
      if (h.estimated_prob === null || h.estimated_prob === undefined) continue;
      if (!(h.estimated_prob > 0)) continue;
      probs[h.number] = h.estimated_prob;
    }
    return { probs: probs, heads: Object.keys(probs).length };
  }

  // ---- §4.2 基本式（keiba_harville.py harville_ordered 行27-35 の写し） ----
  function harvilleOrdered(order, probs) {
    var p = 1.0;
    var remaining = sumOfProbs(probs);
    for (var i = 0; i < order.length; i++) {
      if (remaining <= 0) return 0;
      var h = order[i];
      var ph = probs[h];
      if (ph === undefined || ph === null) ph = 0;
      p *= ph / remaining;
      remaining -= ph;
    }
    return p;
  }

  // ---- 単勝（keiba_harville.py に専用関数なし。§4.2表: P = H([a]) = p_a / S） ----
  function probTansho(a, probs) {
    return harvilleOrdered([a], probs);
  }

  // ---- 複勝（keiba_select_bets.py prob_fukusho 行44-58 の写し） ----
  function probFukusho(a, probs, heads) {
    if (heads <= 4) return null;
    var others = [];
    var keys = Object.keys(probs);
    for (var i = 0; i < keys.length; i++) {
      var num = Number(keys[i]);
      if (num !== a) others.push(num);
    }
    var total = 0;
    if (heads <= 7) {
      for (var j = 0; j < others.length; j++) {
        var b = others[j];
        total += harvilleOrdered([a, b], probs) + harvilleOrdered([b, a], probs);
      }
      return total;
    }
    var pairs = combinationsOf(others, 2);
    for (var k = 0; k < pairs.length; k++) {
      var perms = permutationsOf([a, pairs[k][0], pairs[k][1]], 3);
      for (var m = 0; m < perms.length; m++) {
        total += harvilleOrdered(perms[m], probs);
      }
    }
    return total;
  }

  // ---- ワイド（keiba_harville.py prob_wide 行46-53 の写し。headsガードはJS版で追加） ----
  function probWide(a, b, probs, heads) {
    if (heads < 8) return null;
    var p = 0;
    var keys = Object.keys(probs);
    for (var i = 0; i < keys.length; i++) {
      var c = Number(keys[i]);
      if (c === a || c === b) continue;
      var perms = permutationsOf([a, b, c], 3);
      for (var j = 0; j < perms.length; j++) {
        p += harvilleOrdered(perms[j], probs);
      }
    }
    return p;
  }

  // ---- 馬連（keiba_harville.py prob_umaren 行38-39 の写し） ----
  function probUmaren(a, b, probs) {
    return harvilleOrdered([a, b], probs) + harvilleOrdered([b, a], probs);
  }

  // ---- 馬単（keiba_harville.py prob_umatan 行42-43 の写し） ----
  function probUmatan(a, b, probs) {
    return harvilleOrdered([a, b], probs);
  }

  // ---- 三連複（keiba_harville.py prob_sanrenpuku 行56-60 の写し） ----
  function probSanrenpuku(a, b, c, probs) {
    var p = 0;
    var perms = permutationsOf([a, b, c], 3);
    for (var i = 0; i < perms.length; i++) {
      p += harvilleOrdered(perms[i], probs);
    }
    return p;
  }

  // ---- 三連単（keiba_harville.py prob_sanrentan 行63-64 の写し） ----
  function probSanrentan(a, b, c, probs) {
    return harvilleOrdered([a, b, c], probs);
  }

  // ---- §3.3 オッズキー正規化 ----
  function normKey(type, ids) {
    var parts = ids.map(function (n) { return String(n); });
    if (!ORDERED_TYPES[type]) {
      parts.sort(function (x, y) { return Number(x) - Number(y); });
    }
    return parts.join('-');
  }

  // ---- §4.4 オッズ参照（複勝/ワイドは[0]=最低側。keiba_select_bets.py lookup_odds 行114-125と同じ保守則） ----
  function oddsUsed(oddsAll, type, ids) {
    if (!oddsAll || !oddsAll.odds || !oddsAll.odds[type]) return null;
    var value = oddsAll.odds[type][normKey(type, ids)];
    if (value === undefined || value === null) return null;
    if (Array.isArray(value)) return value[0];
    return value;
  }

  // ---- §4.3 買いライン ----
  function buyLine(p) {
    if (p === null || p === undefined || !(p > 0)) return null;
    return EV_TARGET / p;
  }

  // ---- §4.4 EV ----
  function ev(p, odds) {
    if (p === null || p === undefined || odds === null || odds === undefined) return null;
    return p * odds;
  }

  function calcProb(type, ids, probs, heads) {
    switch (type) {
      case 'tansho': return probTansho(ids[0], probs);
      case 'fukusho': return probFukusho(ids[0], probs, heads);
      case 'wide': return probWide(ids[0], ids[1], probs, heads);
      case 'umaren': return probUmaren(ids[0], ids[1], probs);
      case 'umatan': return probUmatan(ids[0], ids[1], probs);
      case 'sanrenpuku': return probSanrenpuku(ids[0], ids[1], ids[2], probs);
      case 'sanrentan': return probSanrentan(ids[0], ids[1], ids[2], probs);
      default: return null;
    }
  }

  // ---- §5.2 enumerate（機能1: 手動シミュレーターの組み合わせ列挙。state=sel={axis,partners,picked}） ----
  function enumerate(type, mode, sel, probs, heads) {
    sel = sel || {};
    var picked = sel.picked || [];
    var axis = sel.axis || [];
    var partners = sel.partners || [];
    var out = [];

    function push(ids) {
      out.push({ ids: ids, p: calcProb(type, ids, probs, heads) });
    }

    if (type === 'tansho' || type === 'fukusho') {
      for (var i = 0; i < picked.length; i++) push([picked[i]]);
      return out;
    }

    if (type === 'umaren' || type === 'wide') {
      if (mode === 'nagashi') {
        if (axis.length >= 1) {
          for (var j = 0; j < partners.length; j++) push([axis[0], partners[j]]);
        }
      } else {
        combinationsOf(picked, 2).forEach(push);
      }
      return out;
    }

    if (type === 'umatan') {
      if (mode === 'nagashi') {
        if (axis.length >= 1) {
          for (var j2 = 0; j2 < partners.length; j2++) push([axis[0], partners[j2]]);
        }
      } else {
        permutationsOf(picked, 2).forEach(push);
      }
      return out;
    }

    if (type === 'sanrenpuku') {
      if (mode === 'nagashi') {
        if (axis.length === 1) {
          combinationsOf(partners, 2).forEach(function (pair) {
            push([axis[0], pair[0], pair[1]]);
          });
        } else if (axis.length >= 2) {
          for (var j3 = 0; j3 < partners.length; j3++) push([axis[0], axis[1], partners[j3]]);
        }
      } else {
        combinationsOf(picked, 3).forEach(push);
      }
      return out;
    }

    if (type === 'sanrentan') {
      if (mode === 'nagashi') {
        if (axis.length === 1) {
          permutationsOf(partners, 2).forEach(function (pair) {
            push([axis[0], pair[0], pair[1]]);
          });
        } else if (axis.length >= 2) {
          for (var j4 = 0; j4 < partners.length; j4++) push([axis[0], axis[1], partners[j4]]);
        }
      } else {
        permutationsOf(picked, 3).forEach(push);
      }
      return out;
    }

    return out;
  }

  // ---- §5.2 recommend（機能2: 印馬総当たりのおすすめ。軸固定しない完全総当たり） ----
  function recommend(markedNums, probs, heads, oddsAll) {
    if (oddsAll === null || oddsAll === undefined) return [];
    var out = [];
    for (var t = 0; t < RECOMMEND_TYPE_ORDER.length; t++) {
      var type = RECOMMEND_TYPE_ORDER[t];
      var status = oddsAll.status ? oddsAll.status[type] : undefined;
      if (status !== 'result') continue;
      if (type === 'fukusho' && heads <= 4) continue;
      if (type === 'wide' && heads < 8) continue;

      var arity = TYPE_ARITY[type];
      var idsList = (type === 'umatan' || type === 'sanrentan')
        ? permutationsOf(markedNums, arity)
        : combinationsOf(markedNums, arity);

      for (var i = 0; i < idsList.length; i++) {
        var ids = idsList[i];
        var p = calcProb(type, ids, probs, heads);
        if (p === null || p === undefined || p < P_MIN[type]) continue;
        var o = oddsUsed(oddsAll, type, ids);
        if (o === null || o === undefined) continue;
        var e = p * o;
        if (e > 1.0) {
          out.push({ type: type, ids: ids, p: p, buyLine: buyLine(p), odds: o, ev: e });
        }
      }
    }
    out.sort(function (x, y) {
      if (y.ev !== x.ev) return y.ev - x.ev;
      if (y.p !== x.p) return y.p - x.p;
      var kx = normKey(x.type, x.ids);
      var ky = normKey(y.type, y.ids);
      if (kx < ky) return -1;
      if (kx > ky) return 1;
      return 0;
    });
    return out;
  }

  var Harville = {
    EV_TARGET: EV_TARGET,
    P_MIN: P_MIN,
    buildProbs: buildProbs,
    harvilleOrdered: harvilleOrdered,
    probTansho: probTansho,
    probFukusho: probFukusho,
    probWide: probWide,
    probUmaren: probUmaren,
    probUmatan: probUmatan,
    probSanrenpuku: probSanrenpuku,
    probSanrentan: probSanrentan,
    normKey: normKey,
    oddsUsed: oddsUsed,
    buyLine: buyLine,
    ev: ev,
    enumerate: enumerate,
    recommend: recommend,
  };

  if (typeof window !== 'undefined') {
    window.Harville = Harville;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Harville;
  }
})();
