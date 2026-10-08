// 分析ページの「馬券」：買い目シートの当たりと回収率（mockup-280・2026-10-08 ユーザー「実装して」）
//
// 何を出すか
//   ・濃紺の札：見出しの一文／ここまでの収支（円）／回収率（%）／1本ごとに足した累計の回収率の線
//   ・3行：よく戻る／当たっていない（または落としている）／多い外れ方
//   ・券種の表：単勝・複勝・ワイド・枠連・馬連・馬単・3連複・3連単 の順で固定（買っていない券種も行を残す）
//   ・外れ方：ながし（当たり／軸は来たが相手が抜けた／軸が来なかった）、ボックス（当たり／1頭足りない／2頭以上）
//
// 数え方（handoff_2026-10-08_betsheet-analysis.md の決定）
//   ・シートに入れた本は全部買った扱い。当たりは点で数える
//   ・取消・除外の馬を含む点は返還（買った額から引く）。競走中止は外れ。同着は払戻を両方数える
//   ・枠連は、その枠の馬が全部取消・除外のときだけ返還
//
// 材料
//   ・買い目シート：この端末の localStorage の bets:{race_id}（betsheet.js）。端末をまたぐ同期はしない
//   ・結果：data/bet_results.json（keiba_bet_results.py が夜の一括処理で書き出す）
//   ・組み合わせの開き方は simulator.js の enumerate をそのまま使う（ここで書き写すと券種の決まりが2か所になる）
(function () {
  'use strict';

  var ORDER = ['tansho', 'fukusho', 'wide', 'wakuren', 'umaren', 'umatan', 'sanrenpuku', 'sanrentan'];
  var LABEL = { tansho: '単勝', fukusho: '複勝', wide: 'ワイド', wakuren: '枠連', umaren: '馬連', umatan: '馬単',
    sanrenpuku: '3連複', sanrentan: '3連単' };
  var ORDERED = { umatan: true, sanrentan: true };
  // 点がこれに届かない券種は「参考」として薄く出し、一文に使わない（数点の当たり外れで一文が入れ替わらないための代理）
  var FEW = 20;
  // 累計の回収率の線の上限（%）。序盤の大当たりで跳ねると後半が平らに見えるため、超えた所は最大値を文字で出す
  var CAP = 300;

  function Sim() { return (typeof window !== 'undefined' && window.Simulator) || (typeof require !== 'undefined' ? require('./simulator.js') : null); }

  // この端末の買い目シートをすべて集める。{race_id: [line, ...]}
  function readSheets() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf('bets:') !== 0) continue;
        var o = null;
        try { o = JSON.parse(localStorage.getItem(k)); } catch (e) { o = null; }
        if (!o || !Array.isArray(o.lines)) continue;
        var lines = o.lines.filter(function (l) { return l && l.state && typeof l.state.betType === 'string' && l.state.cols; });
        if (lines.length) out[k.slice(5)] = lines;
      }
    } catch (e) { /* 保存が使えない環境ではシートなし扱い */ }
    return out;
  }

  function kindOf(state) {
    if (state.betType === 'tansho') return state.tanFuku === 'fukusho' ? 'fukusho' : 'tansho';
    return state.betType;
  }
  function sameComb(bt, a, b) {
    if (a.length !== b.length) return false;
    if (!ORDERED[bt]) { a = a.slice().sort(function (x, y) { return x - y; }); b = b.slice().sort(function (x, y) { return x - y; }); }
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // 外れ方。ながし・ボックスだけ（単勝・複勝・フォーメーションは null）
  function howMissed(state, bt, hit, fin, gateOf) {
    if (state.method !== 'nagashi' && state.method !== 'box') return null;
    if (bt === 'tansho' || bt === 'fukusho') return null;
    var C = state.cols, m = state.method;
    if (hit) return { m: m, k: 'hit' };
    var top = function (n, k) { var f = fin[n]; return f != null && f <= k; };
    if (bt === 'wakuren') {
      // 1・2着に来た馬の枠
      var topFrames = Object.keys(fin).filter(function (n) { return fin[n] != null && fin[n] <= 2; })
        .map(function (n) { return gateOf[n]; });
      if (m === 'nagashi') {
        var ax = (C.axis || [])[0];
        return { m: m, k: topFrames.indexOf(ax) !== -1 ? 'aite' : 'jiku' };
      }
      var inBox = topFrames.filter(function (g) { return (C.box || []).indexOf(g) !== -1; }).length;
      return { m: m, k: Math.max(0, 2 - inBox) <= 1 ? 'near' : 'far' };
    }
    if (m === 'nagashi') {
      var came;
      if (bt === 'sanrentan') {
        var pos = { p1: 1, p2: 2, p3: 3 };
        var fixed = ['p1', 'p2', 'p3'].filter(function (k) { return (C[k] || []).length && state.axisPos.indexOf(k.slice(1)) !== -1; });
        came = fixed.length > 0 && fixed.every(function (k) {
          var n = C[k][0];
          return state.multi ? top(n, 3) : fin[n] === pos[k];
        });
      } else if (bt === 'sanrenpuku') {
        var axes = [(C.axis1 || [])[0], (C.axis2 || [])[0]].filter(function (x) { return x != null; });
        came = axes.length > 0 && axes.every(function (n) { return top(n, 3); });
      } else {
        var a = (C.axis || [])[0];
        if (bt === 'umatan') came = state.multi ? top(a, 2) : fin[a] === 1;
        else came = top(a, bt === 'wide' ? 3 : 2);
      }
      return { m: m, k: came ? 'aite' : 'jiku' };
    }
    // ボックス：来た馬のうち、箱に入っていなかった頭数
    var arity = (bt === 'sanrenpuku' || bt === 'sanrentan') ? 3 : 2;
    var need = arity, within = bt === 'wide' ? 3 : arity;
    var got = (C.box || []).filter(function (n) { return top(n, within); }).length;
    var miss = Math.max(0, need - got);
    return { m: m, k: miss <= 1 ? 'near' : 'far' };
  }

  // 1本を結果に当てる
  function settleLine(line, race) {
    var S = Sim();
    var site = { horses: race.h.map(function (x) { return { number: x[0], gate: x[1], scratched: false }; }) };
    var bt = kindOf(line.state);
    var items = S._internal.enumerate(line.state, site, race.h.length);
    var out = {}, fin = {}, gateOf = {}, frameAllOut = {};
    race.h.forEach(function (x) {
      fin[x[0]] = x[2]; gateOf[x[0]] = x[1];
      if (x[3]) out[x[0]] = true;
      if (frameAllOut[x[1]] === undefined) frameAllOut[x[1]] = true;
      if (!x[3]) frameAllOut[x[1]] = false;
    });
    var pays = race.p[bt] || [];
    var unit = line.unit || 100;
    var r = { bt: bt, pts: items.length, hit: 0, buy: unit * items.length, refund: 0, ret: 0 };
    items.forEach(function (it) {
      var ids = it.frame || it;
      var refunded = it.frame
        ? ids.some(function (g) { return frameAllOut[g]; })
        : ids.some(function (n) { return out[n]; });
      if (refunded) { r.refund += unit; return; }
      for (var i = 0; i < pays.length; i++) {
        if (sameComb(bt, ids, pays[i][0])) { r.hit += 1; r.ret += pays[i][1] * unit / 100; break; }
      }
    });
    r.how = r.pts > 0 && r.refund < r.buy ? howMissed(line.state, bt, r.hit > 0, fin, gateOf) : null;
    return r;
  }

  // シート全部を数える
  function tally(data, sheets) {
    var recs = [], waiting = 0, used = {};
    Object.keys(sheets).sort().forEach(function (rid) {
      var race = data.races[rid];
      if (!race) { waiting += sheets[rid].length; return; }   // まだ結果の出ていないレース（夜の一括処理で入る）
      sheets[rid].forEach(function (l) {
        var r = settleLine(l, race);
        if (!r.pts) return;
        r.d = race.d; r.rid = rid;
        recs.push(r); used[rid] = true;
      });
    });
    recs.sort(function (a, b) { return (a.d || '').localeCompare(b.d || '') || a.rid.localeCompare(b.rid); });
    var tot = { pts: 0, hit: 0, buy: 0, refund: 0, ret: 0 };
    var by = {};
    ORDER.forEach(function (k) { by[k] = { lines: 0, pts: 0, hit: 0, buy: 0, refund: 0, ret: 0, cum: [0] }; });
    var how = { nagashi: { hit: 0, aite: 0, jiku: 0 }, box: { hit: 0, near: 0, far: 0 } };
    var rate = [], cr = 0, cn = 0;
    recs.forEach(function (r) {
      ['pts', 'hit', 'buy', 'refund', 'ret'].forEach(function (k) { tot[k] += r[k]; by[r.bt][k] += r[k]; });
      var b = by[r.bt];
      b.lines += 1;
      b.cum.push(b.cum[b.cum.length - 1] + r.ret - (r.buy - r.refund));
      if (r.how) how[r.how.m][r.how.k] += 1;
      cr += r.ret; cn += r.buy - r.refund;
      rate.push(cn > 0 ? cr * 100 / cn : 0);
    });
    var dates = recs.map(function (r) { return r.d; }).filter(Boolean);
    return { recs: recs, tot: tot, by: by, how: how, rate: rate, races: Object.keys(used).length, waiting: waiting,
      d0: dates[0], d1: dates[dates.length - 1] };
  }

  var BetAnalysis = { tally: tally, settleLine: settleLine, ORDER: ORDER, LABEL: LABEL, FEW: FEW, CAP: CAP };
  if (typeof module !== 'undefined' && module.exports) module.exports = BetAnalysis;
  if (typeof document === 'undefined') return;
  window.BetAnalysis = BetAnalysis;

  // ── 描画 ────────────────────────────────────
  var yen = function (v) { return String(Math.round(Math.abs(v))).replace(/\B(?=(\d{3})+$)/g, ','); };
  var signed = function (v) { return (v >= 0 ? '+' : '−') + yen(v); };
  var pct = function (ret, net) { return net > 0 ? Math.round(ret * 100 / net) : 0; };
  var md = function (d) { return d ? (+d.slice(5, 7)) + '/' + (+d.slice(8, 10)) : ''; };

  function rateChart(c) {
    var W = 323, H = 140, pt = 24, pb = 18, v = c.rate;
    if (v.length < 2) return '';
    var X = function (i) { return 2 + i * (W - 44) / (v.length - 1); };
    var Y = function (x) { return pt + (CAP - Math.min(x, CAP)) * (H - pt - pb) / CAP; };
    var tc = 'rgba(255,255,255,.6)';
    var s = '<svg class="bt-rate" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="累計の回収率">';
    [100, 200, 300].forEach(function (g) {
      s += '<line x1="0" x2="' + (W - 38) + '" y1="' + Y(g).toFixed(1) + '" y2="' + Y(g).toFixed(1) + '" stroke="#fff" stroke-opacity="'
        + (g === 100 ? '.55' : '.22') + '" stroke-width="1" stroke-dasharray="' + (g === 100 ? '2 3' : '1 4') + '"/>'
        + '<text x="' + W + '" y="' + (Y(g) + 3.5).toFixed(1) + '" text-anchor="end" font-size="9.5" fill="' + tc + '">' + g + '%</text>';
    });
    var path = v.map(function (x, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(x).toFixed(1); }).join(' ');
    s += '<path d="' + path + ' L' + X(v.length - 1).toFixed(1) + ',' + Y(0).toFixed(1) + ' L' + X(0).toFixed(1) + ',' + Y(0).toFixed(1) + ' Z" fill="#fff" opacity=".10"/>';
    s += '<path d="' + path + '" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>';
    var mi = 0;
    v.forEach(function (x, i) { if (x > v[mi]) mi = i; });
    if (v[mi] > CAP) {
      var rm = c.recs[mi];
      s += '<circle cx="' + X(mi).toFixed(1) + '" cy="' + Y(v[mi]).toFixed(1) + '" r="3.5" fill="#7FD1A0"/>'
        + '<text x="' + Math.min(X(mi) + 8, W - 150).toFixed(1) + '" y="' + (pt - 8) + '" font-size="10" fill="#7FD1A0">'
        + md(rm.d) + ' ' + LABEL[rm.bt] + 'で最大' + yen(v[mi]) + '%</text>';
    }
    s += '<circle cx="' + X(v.length - 1).toFixed(1) + '" cy="' + Y(v[v.length - 1]).toFixed(1) + '" r="3" fill="#fff"/>';
    var seen = {};
    c.recs.forEach(function (r, i) {
      var m = (r.d || '').slice(0, 7);
      if (!m || seen[m]) return;
      seen[m] = true;
      s += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 4) + '" font-size="9.5" fill="' + tc + '" text-anchor="' + (i === 0 ? 'start' : 'middle') + '">' + md(r.d) + '</text>';
    });
    return s + '</svg>';
  }

  function spark(cum) {
    if (cum.length < 2) return '';
    var W = 64, H = 24;
    var lo = Math.min.apply(null, cum.concat([0])), hi = Math.max.apply(null, cum.concat([0]));
    var span = (hi - lo) || 1;
    var X = function (i) { return 1 + i * (W - 2) / (cum.length - 1); };
    var Y = function (x) { return 2 + (hi - x) * (H - 4) / span; };
    var path = cum.map(function (x, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(x).toFixed(1); }).join(' ');
    var col = cum[cum.length - 1] >= 0 ? '#0B5E2E' : '#003E70';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '"><line x1="0" x2="' + W + '" y1="' + Y(0).toFixed(1) + '" y2="' + Y(0).toFixed(1)
      + '" stroke="#D1D1D6" stroke-width="1"/><path d="' + path + '" fill="none" stroke="' + col + '" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  }

  // 一文と3行。参考の券種（FEW点未満）は使わない
  function insight(c) {
    var rows = ORDER.map(function (k) {
      var b = c.by[k];
      return { k: k, lb: LABEL[k], b: b, p: pct(b.ret, b.buy - b.refund), few: b.pts < FEW };
    });
    var main = rows.filter(function (r) { return r.b.lines && !r.few; });
    var res = { rows: rows, head: null, best: null, worst: null, most: null };
    if (main.length) {
      res.best = main.reduce(function (a, r) { return r.p > a.p ? r : a; });
      res.worst = main.reduce(function (a, r) { return (r.p < a.p || (r.p === a.p && r.b.pts > a.b.pts)) ? r : a; });
      if (main.length === 1) res.head = res.best.lb + 'の回収率は' + res.best.p + '%です。';
      else if (res.best.p >= 100) res.head = res.best.lb + 'で取り戻し、' + res.worst.lb + 'で落としています。';
      else res.head = 'いちばん戻るのは' + res.best.lb + '、いちばん落としているのは' + res.worst.lb + 'です。';
    }
    var H = c.how;
    var ng = H.nagashi.hit + H.nagashi.aite + H.nagashi.jiku, bx = H.box.hit + H.box.near + H.box.far;
    var cands = [['ながしの軸が来ない', H.nagashi.jiku, ng], ['ながしの相手が抜ける', H.nagashi.aite, ng],
      ['ボックスに1頭足りない', H.box.near, bx], ['ボックスに2頭以上足りない', H.box.far, bx]];
    var most = cands.reduce(function (a, x) { return x[1] > a[1] ? x : a; });
    if (most[1] > 0) res.most = most;
    return res;
  }

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); };

  function stack(label, n, parts) {
    if (!n) return '';
    var bar = parts.filter(function (p) { return p[0]; }).map(function (p) {
      return '<span class="bg-' + p[1] + '" style="width:' + (p[0] * 100 / n).toFixed(1) + '%">' + p[0] + '</span>';
    }).join('');
    return '<div class="bt-sbh"><span>' + label + '</span><span class="n">' + n + '本</span></div><div class="bt-sb">' + bar + '</div>';
  }

  function render(el, data, sheets) {
    var c = tally(data, sheets);
    if (!c.recs.length) {
      el.innerHTML = '<div class="an-hero an-empty"><div class="an-ey">あなたの馬券</div><h1 class="sm">まだ数えられる買い目がありません。</h1>'
        + '<p>レースの画面の「自分で組む」で買い目を組み、<b>シートに入れる</b>を押すと、結果が出たあとにここで当たりと回収率が出ます。</p>'
        + '<p>シートはこの端末の中だけに保存されています。別の端末で入れた買い目は数えられません。</p>'
        + (c.waiting ? '<p class="an-note">結果を待っている買い目が ' + c.waiting + ' 本あります。夜の集計のあとに数えられるようになります。</p>' : '')
        + '</div>';
      return;
    }
    var ins = insight(c);
    var T = c.tot, net = T.buy - T.refund, bal = T.ret - net;
    var hero = '<div class="bt-hero"><div class="an-ey">あなたの馬券</div>'
      + (ins.head ? '<h1>' + esc(ins.head) + '</h1>' : '<h1 class="sm">点がもう少したまると、どの券種で戻っているかが出ます。</h1>')
      + '<dl class="bt-kv"><div><dt>ここまでの収支</dt><dd class="n">' + signed(bal) + '<i class="u">円</i></dd></div>'
      + '<div><dt>回収率</dt><dd class="n">' + pct(T.ret, net) + '<i class="u">%</i></dd></div></dl>'
      + rateChart(c) + '</div>';
    var span = c.d0 ? '<span class="sep">｜</span>' + md(c.d0) + (c.d1 !== c.d0 ? '〜' + md(c.d1) : '') : '';
    var meta = '<div class="an-meta bt-meta"><span class="n">' + c.races + '</span>レース・<span class="n">' + T.pts + '</span>点' + span + '</div>';
    var three = '';
    if (ins.best) {
      var w = ins.worst;
      three = '<dl class="bt-three">'
        + '<div><dt class="c-good">よく戻る</dt><dd>' + ins.best.lb + '　<span class="n">回収率' + ins.best.p + '%</span></dd></div>'
        + (w !== ins.best ? (w.b.hit === 0
          ? '<div><dt class="c-over">当たっていない</dt><dd>' + w.lb + '　<span class="n">' + w.b.pts + '点で0点</span></dd></div>'
          : '<div><dt class="c-over">落としている</dt><dd>' + w.lb + '　<span class="n">回収率' + w.p + '%</span></dd></div>') : '')
        + (ins.most ? '<div><dt class="c-more">多い外れ方</dt><dd>' + ins.most[0] + '　<span class="n">' + ins.most[2] + '本中' + ins.most[1] + '本</span></dd></div>' : '')
        + '</dl>';
    }
    var tb = '<table class="bt-tb"><tr><th>券種</th><th></th><th>当たり</th><th>回収率</th></tr>' + ins.rows.map(function (r) {
      var b = r.b;
      if (!b.lines) {
        return '<tr class="few"><td>' + r.lb + '<span class="s">まだ買っていない</span></td><td class="sp"></td><td class="n">—</td><td class="p n">—</td></tr>';
      }
      var up = r.p >= 100 && !r.few ? ' up' : '';
      return '<tr class="' + (r.few ? 'few' : '') + '"><td>' + r.lb + '<span class="s">' + b.lines + '本・' + yen(b.buy - b.refund) + '円</span></td>'
        + '<td class="sp">' + spark(b.cum) + '</td>'
        + '<td class="n">' + b.hit + '<span class="s">/ ' + b.pts + '点</span></td>'
        + '<td class="p n' + up + '">' + r.p + '<i class="u">%</i></td></tr>';
    }).join('') + '</table>';
    var H = c.how;
    var ng = H.nagashi.hit + H.nagashi.aite + H.nagashi.jiku, bx = H.box.hit + H.box.near + H.box.far;
    var howHtml = (ng || bx)
      ? stack('ながし', ng, [[H.nagashi.hit, 'hit'], [H.nagashi.aite, 'near'], [H.nagashi.jiku, 'miss']])
        + stack('ボックス', bx, [[H.box.hit, 'hit'], [H.box.near, 'near'], [H.box.far, 'miss']])
        + '<div class="bt-lg"><span><i class="bg-hit"></i>当たり</span><span><i class="bg-near"></i>あと少し（相手が抜けた／1頭足りない）</span>'
        + '<span><i class="bg-miss"></i>遠い（軸が来ない／2頭以上）</span></div>'
      : '<p class="bt-none">ながし・ボックスの買い目がまだありません。</p>';
    var wait = c.waiting ? '<p class="an-note">結果を待っている買い目が ' + c.waiting + ' 本あります。夜の集計のあとに数えられるようになります。</p>' : '';
    el.innerHTML = hero + meta + wait + three
      + '<h2 class="bt-h">券種ごと<small>線は券種ごとの収支</small></h2>' + tb
      + '<h2 class="bt-h">外れ方<small>買い方ごと</small></h2>' + howHtml
      + '<p class="an-foot">シートに入れた本は全部買った扱いで数えています（買わなかった本は発走前に消してください）。'
      + '取消・除外の馬を含む点は返還として買った額から引き、競走中止は外れです。'
      + '点が' + FEW + '点に届かない券種は薄く出し、一文には使いません。外れ方は、ながしとボックスだけを数えています。'
      + 'シートはこの端末の中だけを数えています。</p>';
  }

  // 「印の見方｜馬券」の切り替え。馬券を初めて開いた時に結果の表を読む
  var loaded = false;
  async function show(which) {
    var marks = document.getElementById('an-content'), bets = document.getElementById('an-bets');
    if (!marks || !bets) return;
    document.querySelectorAll('.an-seg button').forEach(function (b) {
      var on = b.dataset.seg === which;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    marks.hidden = which !== 'marks';
    bets.hidden = which !== 'bets';
    if (which !== 'bets' || loaded) return;
    loaded = true;
    try {
      var data = await getData('data/bet_results.json');
      render(bets, data, readSheets());
    } catch (e) {
      loaded = false;
      bets.innerHTML = '<p class="an-err">データを読み込めませんでした。時間をおいて開き直してください。</p>';
    }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.an-seg button');
    if (!b) return;
    var which = b.dataset.seg;
    try { history.replaceState(null, '', which === 'bets' ? '#bets' : location.pathname + location.search); } catch (err) { /* そのまま */ }
    show(which);
  });
  show(location.hash === '#bets' ? 'bets' : 'marks');
})();
