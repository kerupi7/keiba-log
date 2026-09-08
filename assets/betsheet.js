/**
 * 買い目シート（128-spec）— 組んだ買い目を残す。
 *
 * 保存するのは **券種・買い方・馬番・1点あたりの金額** だけ。
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
  var UNITS = [100, 200, 300, 500, 1000];   // ＋／− が刻む金額。IPATの最小単位が100円
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
      unit: (UNITS.indexOf(unit) !== -1) ? unit : UNITS[0],
    });
    save(raceId, lines);
    return { ok: true };
  }
  function remove(raceId, id) {
    save(raceId, load(raceId).filter(function (l) { return l.id !== id; }));
  }
  function stepUnit(raceId, id, dir) {
    var lines = load(raceId);
    lines.forEach(function (l) {
      if (l.id !== id) return;
      var i = UNITS.indexOf(l.unit);
      if (i === -1) i = 0;
      l.unit = UNITS[Math.min(UNITS.length - 1, Math.max(0, i + dir))];
    });
    save(raceId, lines);
  }
  function clear(raceId) { save(raceId, []); }

  // ── 集計（描くたびに今のオッズで組み直す） ──────────────
  // 返り値の rows は Simulator.rowsFor() のもの。ここでは点数と金額を足すだけ。
  function measure(line, site, probs, heads, oddsAll) {
    var rows = Simulator.rowsFor(line.state, site, probs, heads, oddsAll);
    var withOdds = rows.filter(function (r) { return r.odds !== null && r.odds !== undefined; })
      .map(function (r) { return r.odds; });
    return {
      rows: rows,
      points: rows.length,
      buy: line.unit * rows.length,
      lo: withOdds.length ? Math.min.apply(null, withOdds) : null,
      hi: withOdds.length ? Math.max.apply(null, withOdds) : null,
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
    var pos = d.cols.filter(function (c) { return c.ids.length; }).map(function (c) {
      var chips = c.ids.map(function (n) {
        return d.frame ? wakuBox(n) : umaBox(n, byNumber[n] ? byNumber[n].gate : undefined);
      }).join('');
      return '<div class="bs-pos"><span class="lb">' + escapeHtml(c.label) + '</span>' + chips + '</div>';
    }).join('');

    var rng = (m.lo === null) ? '<span class="bs-rng">オッズ未取得</span>'
      : '<div class="bs-rng n">' + odds1(m.lo) + '倍 〜 ' + odds1(m.hi) + '倍</div>';
    var pay = (m.lo === null) ? ''
      : '<div class="bs-pay"><span class="lb">想定払戻</span><span class="v n">'
        + yen(m.lo * line.unit) + ' 〜 ' + yen(m.hi * line.unit) + '<i>円</i></span></div>';

    var tbl = '';
    if (open) {
      tbl = '<div class="bs-tbl"><div class="bs-thead"><span>組み合わせ</span><span>オッズ</span></div>'
        + m.rows.map(function (r) {
          var ids = r.frame || r.ids;
          return '<div class="bs-trow"><span class="cmb">'
            + (r.frame ? ids.map(wakuBox).join('<span class="bs-sep">-</span>') : seq(ids, d.ordered, byNumber))
            + '</span><span class="od n">' + odds1(r.odds) + '<i>倍</i></span></div>';
        }).join('') + '</div>';
    }

    var title = escapeHtml(d.bandLabel + (d.methodLabel ? '　' + d.methodLabel : ''));
    return '<article class="bs-card" data-bs-line="' + line.id + '">'
      + '<div class="sim-band ' + d.band + '">' + title
      + '<button type="button" class="bs-del" data-bs-del="' + line.id + '" aria-label="この買い目を消す">✕</button></div>'
      + '<div class="bs-body"><div class="bs-left">' + pos + rng + '</div>'
      + '<div class="bs-amt"><div class="bs-stepper">'
      + '<button type="button" data-bs-step="-1" data-id="' + line.id + '" aria-label="金額を下げる">−</button>'
      + '<span class="v n">' + line.unit + '</span>'
      + '<button type="button" data-bs-step="1" data-id="' + line.id + '" aria-label="金額を上げる">＋</button></div>'
      + '<div class="bs-unit">円 ×<span class="n">' + m.points + '</span>点</div>'
      + '<div class="bs-buy n">' + yen(m.buy) + '<i>円</i></div></div></div>'
      + pay + tbl
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
      + lines.map(function (l) { return card(l, site, probs, heads, oddsAll, openIds); }).join('')
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
    load: load, add: add, remove: remove, stepUnit: stepUnit, clear: clear,
    totals: totals, measure: measure,
    renderList: renderList, renderBar: renderBar,
  };

  if (typeof window !== 'undefined') window.BetSheet = BetSheet;
  if (typeof module !== 'undefined' && module.exports) module.exports = BetSheet;
})();
