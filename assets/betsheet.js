/**
 * 買い目シート（128-spec）— 組んだ買い目を残す。
 *
 * 保存するのは **券種・買い方・馬番・1点あたりの金額**（点ごとに変えたものは amts）だけ。
 * 点数・オッズ・想定払戻は保存せず、描くたびに Simulator.rowsFor() でその時のオッズから組み直す。
 * 発走前に組んだ古いオッズが残って読み違えるのを防ぐため（ユーザー決定 2026-09-08）。
 *
 * 契約: 純関数中心。DOM描画はHTML文字列を返すのみ（DOM書き込み・イベント購読は race.js 側）。
 * 計算は1つも持たない。組み合わせ・確率・オッズは Simulator / Harville の結果をそのまま使う。
 *
 * 依存（グローバル前提。読み込み順は race.html: app.js → harville.js → simulator.js → betsheet.js → race.js）:
 *   app.js:      umaBox, wakuBox, escapeHtml
 *   simulator.js: window.Simulator（rowsFor / describe / snapshot）
 */
(function () {
  'use strict';

  var SCHEMA = 1;
  var UNITS = [100, 200, 300, 500, 1000];   // 前の刻み。外から読まれる名前なので残す（今は ＋／− は100円ずつ）
  // 1点あたりの金額は100円単位（IPATの最小単位）。＋／− は100円ずつ動き、数字を押せば直接入れられる
  //   （2026-10-18 ユーザー「100円単位で上下できるかつ入力できるようにしてほしい」）。
  //   上限は6桁に収まる999,900円（1点あたり。入力欄が6桁で切れないように）
  var STEP = 100;
  var MAX_UNIT = 999900;
  function normUnit(v) {
    // 端数は切り捨てる（入れた額より多く買わないように。1,250円 → 1,200円）
    var n = Math.floor(Number(v) / STEP) * STEP;
    if (!isFinite(n) || n < STEP) return null;
    return Math.min(MAX_UNIT, n);
  }
  // 券種の並び（2026-10-18 ユーザー「券種順に上から表示されるようにしてほしい」）。
  //   券種を選ぶボタンと同じ並び。同じ券種どうしは入れた順のまま
  var TYPE_ORDER = ['tansho', 'fukusho', 'wakuren', 'umaren', 'wide', 'umatan', 'sanrenpuku', 'sanrentan'];
  function typeRank(line) {
    var st = line.state || {};
    var t = st.betType === 'tansho' && st.tanFuku === 'fukusho' ? 'fukusho' : st.betType;
    var i = TYPE_ORDER.indexOf(t);
    return i === -1 ? TYPE_ORDER.length : i;
  }
  function byType(lines) {
    return lines.map(function (l, i) { return { l: l, i: i }; })
      .sort(function (a, b) { return (typeRank(a.l) - typeRank(b.l)) || (a.i - b.i); })
      .map(function (x) { return x.l; });
  }
  var MAX_LINES = 20;                        // 1レースに残せる本数。これ以上は画面で読めない

  function key(raceId) { return 'bets:' + raceId; }

  // ── 保存・読み出し ────────────────────────────────
  // localStorage が使えない環境（プライベートブラウズ等）でも組めるだけは組める。保存されないだけ。
  function load(raceId) {
    try {
      if (!raceId || typeof localStorage === 'undefined') return [];
      var o = JSON.parse(localStorage.getItem(key(raceId)));
      if (!o || o.v !== SCHEMA || !Array.isArray(o.lines)) return [];
      // 知らない形が混ざっていたら、その行だけ捨てる（全部を捨てない）
      return o.lines.filter(function (l) {
        return l && l.state && typeof l.state.betType === 'string' && l.state.cols;
      }).slice(0, MAX_LINES);
    } catch (e) { return []; }
  }
  function save(raceId, lines) {
    try {
      if (!raceId || typeof localStorage === 'undefined') return;
      localStorage.setItem(key(raceId), JSON.stringify({ v: SCHEMA, lines: lines }));
    } catch (e) { /* 保存しないだけ */ }
  }

  function add(raceId, state, unit) {
    var lines = load(raceId);
    if (lines.length >= MAX_LINES) return { ok: false, reason: MAX_LINES + '本まで' };
    lines.push({
      id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      state: Simulator.snapshot(state),
      unit: normUnit(unit) || STEP,
    });
    save(raceId, lines);
    return { ok: true };
  }
  function remove(raceId, id) {
    save(raceId, load(raceId).filter(function (l) { return l.id !== id; }));
  }
  // ── 1点ごとの金額（2026-10-29 mockup-362。ユーザー「ボックスで入れた後、個別の買い目に金額を調整できない」）
  //   line.amts = { 点の名前（Simulator.itemKey）: 金額 }。名前の無い点は line.unit。
  //   全部の点が同じ額になったら amts を消して unit だけに戻す（前からの保存の形のまま読める）
  function itemUnit(line, item) {
    var a = line.amts;
    return (a && a[Simulator.itemKey(item)]) || normUnit(line.unit) || STEP;
  }
  function itemsOf(line, site) {
    return Simulator._internal.enumerate(line.state, site).filter(function (it) { return keep(line, it); });
  }
  function putUnits(line, items, units) {
    if (!units.length || units.every(function (u) { return u === units[0]; })) {
      if (units.length) line.unit = units[0];
      delete line.amts;
      return;
    }
    line.amts = {};
    items.forEach(function (it, i) { line.amts[Simulator.itemKey(it)] = units[i]; });
  }
  // total を weights の比で100円単位に配る。どの点も最低100円。端数の100円は、切り捨てで削られた分の大きい点から順に足す
  function spread(total, weights) {
    var n = weights.length, u = Math.max(n, Math.floor(total / STEP)), ws = 0;
    weights.forEach(function (w) { ws += w; });
    var raw = weights.map(function (w) { return ws > 0 ? u * w / ws : u / n; });
    var fl = raw.map(function (x) { return Math.max(1, Math.floor(x)); });
    var left = u; fl.forEach(function (x) { left -= x; });
    var ord = raw.map(function (x, i) { return i; })
      .sort(function (a, b) { return (raw[b] - Math.floor(raw[b])) - (raw[a] - Math.floor(raw[a])) || a - b; });
    for (var k = 0; left > 0; k++, left--) fl[ord[k % n]]++;
    // 最低100円を守ったぶん多すぎたら、多い点から戻す
    for (var j = 0; left < 0 && j < 1000; j++) {
      var big = fl.indexOf(Math.max.apply(null, fl));
      if (fl[big] <= 1) break;
      fl[big]--; left++;
    }
    return fl.map(function (x) { return Math.min(MAX_UNIT, x * STEP); });
  }
  function edit(raceId, id, fn) {
    var lines = load(raceId);
    lines.forEach(function (l) { if (l.id === id) fn(l); });
    save(raceId, lines);
  }

  // 上の −／＋：全部の点を100円ずつ動かす（どの点も100円より下げない）
  function stepUnit(raceId, id, dir) {
    edit(raceId, id, function (l) {
      var mv = function (u) { return normUnit((normUnit(u) || STEP) + dir * STEP) || STEP; };
      l.unit = mv(l.unit);
      if (l.amts) Object.keys(l.amts).forEach(function (k) { l.amts[k] = mv(l.amts[k]); });
    });
  }
  // 上の欄に数字を直接入れたとき。入れた額は「この1本の合計」。今の金額の比のまま100円単位で配り直す。
  //   100円 × 点数 に届かない額・数字でないものは入れない（前の金額のまま）
  function setUnit(raceId, id, v, site) {
    // 日本語のキーボードで入れた全角の数字（８００）も読む。カンマ・円などの数字以外は捨てる
    var half = String(v).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    var total = normUnit(half.replace(/[^\d]/g, ''));
    if (total === null) return false;
    var ok = false;
    edit(raceId, id, function (l) {
      var items = itemsOf(l, site);
      if (!items.length || total < items.length * STEP) return;
      putUnits(l, items, spread(total, items.map(function (it) { return itemUnit(l, it); })));
      ok = true;
    });
    return ok;
  }
  // 展開した表の1行の −／＋（100円ずつ）
  function stepItem(raceId, id, k, dir, site) {
    edit(raceId, id, function (l) {
      var items = itemsOf(l, site);
      putUnits(l, items, items.map(function (it) {
        var u = itemUnit(l, it);
        return Simulator.itemKey(it) === k ? (normUnit(u + dir * STEP) || STEP) : u;
      }));
    });
  }
  // 「均等に」「払戻をそろえる」で、この1本の合計はそのままに配り直した金額（点の並びは rows と同じ）。
  //   払戻をそろえる＝オッズの逆数の比で配る。オッズの無い点が1つでもあれば null（そろえられない）
  function shapeOf(line, rows, way) {
    var total = 0;
    rows.forEach(function (r) { total += itemUnit(line, r); });
    if (way === 'pay') {
      if (rows.some(function (r) { return !r.odds; })) return null;
      return spread(total, rows.map(function (r) { return 1 / r.odds; }));
    }
    return spread(total, rows.map(function () { return 1; }));
  }
  function reshape(raceId, id, way, site, probs, heads, oddsAll) {
    edit(raceId, id, function (l) {
      var rows = measure(l, site, probs, heads, oddsAll).rows;
      var us = shapeOf(l, rows, way);
      if (us) putUnits(l, rows, us);
    });
  }
  function clear(raceId) { save(raceId, []); }
  // 展開した表で1点だけ外す（2026-10-13 ユーザー「個別に買い目を消せるようにしたい」）。
  //   買い方（フォーメーション等）はそのまま残し、外した点の名前を skip に足す。全部外れたらその1本ごと消す
  function skipItem(raceId, id, k, site) {
    var lines = load(raceId), gone = false;
    lines.forEach(function (l) {
      if (l.id !== id) return;
      l.skip = (l.skip || []).filter(function (x) { return x !== k; }).concat([k]);
      var left = itemsOf(l, site);
      if (!left.length) gone = true;
      else if (l.amts) putUnits(l, left, left.map(function (it) { return itemUnit(l, it); }));
    });
    if (gone) lines = lines.filter(function (l) { return l.id !== id; });
    save(raceId, lines);
  }
  function keep(line, item) {
    return !line.skip || line.skip.indexOf(Simulator.itemKey(item)) === -1;
  }

  // ── 集計（描くたびに今のオッズで組み直す） ──────────────
  // 返り値の rows は Simulator.rowsFor() のもの。ここでは点数と金額を足すだけ。
  function measure(line, site, probs, heads, oddsAll) {
    var rows = Simulator.rowsFor(line.state, site, probs, heads, oddsAll)
      .filter(function (r) { return keep(line, r); });
    var units = rows.map(function (r) { return itemUnit(line, r); });
    var buy = 0;
    units.forEach(function (u) { buy += u; });
    var withOdds = rows.filter(function (r) { return r.odds !== null && r.odds !== undefined; });
    var odds = withOdds.map(function (r) { return r.odds; });
    var pays = withOdds.map(function (r) { return r.odds * itemUnit(line, r); });
    return {
      rows: rows,
      units: units,
      points: rows.length,
      buy: buy,
      lo: odds.length ? Math.min.apply(null, odds) : null,
      hi: odds.length ? Math.max.apply(null, odds) : null,
      payLo: pays.length ? Math.min.apply(null, pays) : null,
      payHi: pays.length ? Math.max.apply(null, pays) : null,
    };
  }
  function totals(lines, site, probs, heads, oddsAll) {
    var points = 0, buy = 0;
    lines.forEach(function (l) {
      var m = measure(l, site, probs, heads, oddsAll);
      points += m.points; buy += m.buy;
    });
    return { lines: lines.length, points: points, buy: buy };
  }

  // ── 描画 ────────────────────────────────────
  function yen(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+$)/g, ','); }
  function odds1(v) { return (v === null || v === undefined) ? '—' : v.toFixed(1); }

  function seq(ids, ordered, byNumber) {
    return ids.map(function (n, i) {
      var sep = i > 0 ? '<span class="bs-sep">' + (ordered ? '→' : '-') + '</span>' : '';
      var h = byNumber[n];
      return sep + umaBox(n, h ? h.gate : undefined)
        + '<span class="bs-ab">' + escapeHtml(h ? h.name.slice(0, 3) : '') + '</span>';
    }).join('');
  }

  function card(line, site, probs, heads, oddsAll, openIds) {
    var d = Simulator.describe(line.state);
    var m = measure(line, site, probs, heads, oddsAll);
    var byNumber = {};
    site.horses.forEach(function (h) { byNumber[h.number] = h; });
    var open = openIds.indexOf(line.id) !== -1;

    // ポジション行（馬1 ▸ 14 / 馬2 ▸ 6 10）。空の列は出さない
    // 馬番は選んだ順でなく小さい順に並べる（2026-10-18 ユーザー「相手のところが馬番の順番になるように」）
    var pos = d.cols.filter(function (c) { return c.ids.length; }).map(function (c) {
      var chips = c.ids.slice().sort(function (a, b) { return Number(a) - Number(b); }).map(function (n) {
        return d.frame ? wakuBox(n) : umaBox(n, byNumber[n] ? byNumber[n].gate : undefined);
      }).join('');
      return '<div class="bs-pos"><span class="lb">' + escapeHtml(c.label) + '</span>' + chips + '</div>';
    }).join('');

    var rng = (m.lo === null) ? '<span class="bs-rng">オッズ未取得</span>'
      : '<div class="bs-rng n">' + odds1(m.lo) + '倍 〜 ' + odds1(m.hi) + '倍</div>';
    var pay = (m.payLo === null) ? ''
      : '<div class="bs-pay"><span class="lb">想定払戻</span><span class="v n">'
        + yen(m.payLo) + ' 〜 ' + yen(m.payHi) + '<i>円</i></span></div>';

    var tbl = '', alloc = '';
    if (open) {
      // 配り直すボタン（mockup-362 見た目2）。押すとこうなる、の棒と金額をボタンの中に出す。2点以上のときだけ
      if (m.points >= 2) {
        alloc = '<div class="bs-alloc">' + [['even', '均等に'], ['pay', '払戻をそろえる']].map(function (w) {
          var s = shapeOf(line, m.rows, w[0]);
          if (!s) {
            return '<button type="button" class="bs-shape" disabled><span class="t"><b>' + w[1]
              + '</b><span>オッズが出たら使えます</span></span></button>';
          }
          var mx = Math.max.apply(null, s);
          var now = s.every(function (u, i) { return u === m.units[i]; });
          var mn = Math.min.apply(null, s);
          var amt = s.length <= 4 ? s.map(yen).join('・') + '円'
            : mn === mx ? '各' + yen(mx) + '円' : yen(mn) + '〜' + yen(mx) + '円';
          return '<button type="button" class="bs-shape' + (now ? ' on' : '') + '" data-bs-alloc="' + w[0]
            + '" data-id="' + line.id + '"><span class="bars ' + w[0] + '">'
            + s.map(function (u) { return '<i style="height:' + Math.max(3, Math.round(u / mx * 26)) + 'px"></i>'; }).join('')
            + '</span><span class="t"><b>' + w[1] + '</b><span class="n">' + amt + '</span></span></button>';
        }).join('') + '</div>';
      }
      tbl = '<div class="bs-tbl"><div class="bs-thead"><span>組み合わせ</span><span>オッズ</span><span>金額</span><span></span></div>'
        + m.rows.map(function (r, i) {
          var ids = r.frame || r.ids, k = Simulator.itemKey(r), u = m.units[i];
          return '<div class="bs-trow"><span class="cmb">'
            + (r.frame ? ids.map(wakuBox).join('<span class="bs-sep">-</span>') : seq(ids, d.ordered, byNumber))
            + '</span><span class="od n">' + odds1(r.odds) + '<i>倍</i>'
            + (r.odds ? '<small>払戻 ' + yen(r.odds * u) + '</small>' : '') + '</span>'
            + '<span class="bs-istep">'
            + '<button type="button" data-bs-istep="-1" data-k="' + k + '" data-id="' + line.id + '" aria-label="この組み合わせを100円下げる">−</button>'
            + '<span class="v n">' + yen(u) + '</span>'
            + '<button type="button" data-bs-istep="1" data-k="' + k + '" data-id="' + line.id + '" aria-label="この組み合わせを100円上げる">＋</button></span>'
            + '<button type="button" class="bs-xrow" data-bs-skip="' + k + '" data-id="' + line.id
            + '" aria-label="この組み合わせを消す">✕</button></div>';
        }).join('') + '</div>';
    }

    var title = escapeHtml(d.bandLabel + (d.methodLabel ? '　' + d.methodLabel : ''));
    return '<article class="bs-card" data-bs-line="' + line.id + '">'
      + '<div class="sim-band ' + d.band + '">' + title
      + '<button type="button" class="bs-del" data-bs-del="' + line.id + '" aria-label="この買い目を消す">✕</button></div>'
      + '<div class="bs-body"><div class="bs-left">' + pos + rng + '</div>'
      // 上の欄はこの1本の合計（2026-10-29 mockup-362。下の「円 ×N点」と合計の行は「ここいらない」で外した）。
      //   −／＋ は全部の点を100円ずつ。数字を入れると、今の比のまま配り直す
      + '<div class="bs-amt"><div class="bs-stepper">'
      + '<button type="button" data-bs-step="-1" data-id="' + line.id + '" aria-label="全部の組み合わせを100円ずつ下げる">−</button>'
      + '<input class="v n" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="9" enterkeyhint="done"'
      + ' value="' + yen(m.buy) + '" data-bs-amt="' + line.id + '" aria-label="この買い目の合計金額（100円単位）">'
      + '<button type="button" data-bs-step="1" data-id="' + line.id + '" aria-label="全部の組み合わせを100円ずつ上げる">＋</button></div>'
      + '</div></div>'
      + pay + alloc + tbl
      + '<button type="button" class="bs-toggle" data-bs-open="' + line.id + '">'
      + (open ? '展開を閉じる ∧' : '展開する ∨') + '</button></article>';
  }

  // シートの中身（ドロワーの中に入る）
  function renderList(raceId, site, probs, heads, oddsAll, openIds) {
    var lines = load(raceId);
    if (!lines.length) {
      return '<div class="bs-empty">まだ1本もありません。<br>'
        + '「自分で組む」で券種と馬を選んで、<b>シートに入れる</b>を押すとここに残ります。</div>';
    }
    var t = totals(lines, site, probs, heads, oddsAll);
    return '<div class="bs-list">'
      + byType(lines).map(function (l) { return card(l, site, probs, heads, oddsAll, openIds); }).join('')
      + '</div>'
      + '<div class="bs-foot"><span>' + t.lines + '本 <span class="n">' + t.points + '</span>点</span>'
      + '<button type="button" class="bs-clear" data-bs-clear>すべて消す</button></div>';
  }

  // 下に貼り付く要約バー（案C）。1本も無いときは出さない
  function renderBar(raceId, site, probs, heads, oddsAll) {
    var lines = load(raceId);
    if (!lines.length) return '';
    var t = totals(lines, site, probs, heads, oddsAll);
    return '<button type="button" class="bsbar" data-bs-bar>'
      + '<span class="lb">買い目シート</span>'
      + '<span class="n">' + t.points + '<i>点</i>　' + yen(t.buy) + '<i>円</i></span>'
      + '<span class="ar" aria-hidden="true">›</span></button>';
  }

  var BetSheet = {
    UNITS: UNITS,
    MAX_LINES: MAX_LINES,
    STEP: STEP, MAX_UNIT: MAX_UNIT,
    load: load, add: add, remove: remove, stepUnit: stepUnit, setUnit: setUnit, clear: clear, skipItem: skipItem, keep: keep,
    itemUnit: itemUnit, stepItem: stepItem, reshape: reshape, _spread: spread,
    totals: totals, measure: measure,
    renderList: renderList, renderBar: renderBar,
  };

  if (typeof window !== 'undefined') window.BetSheet = BetSheet;
  if (typeof module !== 'undefined' && module.exports) module.exports = BetSheet;
})();
