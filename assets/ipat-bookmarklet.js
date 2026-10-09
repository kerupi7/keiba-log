/* Ans.の買い目 — 即PAT スマホ版の「通常投票」で押すブックマーク（141-ipat-bookmark-spec・2026-10-10）
 *
 * Ans. の「IPAT投票」でコピーした買い目（ANSIPAT1 で始まる1行）を読み、即PAT の投票内容（Nb）に入れて、
 * 即PAT 自身の「投票内容を送る」（ToSend）を呼ぶ。開くのは即PAT の「合計金額入力」まで。
 * 合計金額を入れて「投票」を押すのは本人。このブックマークは番号に触れない・投票ボタンを押さない。
 *
 * 1点の書き方は即PAT の 740_260206.js（BETIN2 / ConvBT / CBT）の方式0（通常）を写したもの。
 * 即PAT 自身の ConvBT と全6,396通りで一致を確かめた（keiba-log/tools/check-ipat-bookmarklet.js）。
 * このファイルは ipat-bookmark.html が読んでブックマークの中身に変える。行コメントは書かない。
 */
(function () {
  'use strict';
  var TAG = 'ANSIPAT1 ';
  var ARITY = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 2, 6: 2, 7: 3, 8: 3 };

  function hx(v, w) { var s = v.toString(16).slice(-w); while (s.length < w) s = '0' + s; return s; }
  function p2(n) { return Math.pow(2, n - 1); }

  function mark(k, n) {
    if (k === 1 || k === 2) return hx(0x80000 / p2(n[0]), 5) + '000000000';
    if (k === 3) return hx(0x80 / p2(n[0]), 2) + '00' + hx(0x200 / p2(n[1]), 3) + '0000000';
    var ab = hx(0x800000000 / p2(n[0]) + 0x20000 / p2(n[1]), 9);
    if (k <= 6) return ab + '00000';
    return ab + hx(0x80000 / p2(n[2]), 5);
  }

  function line(m, race, k, n, u) {
    return '1000' + m.charAt(1) + race.toString(16).toUpperCase() + m.charAt(2)
      + '0' + k + mark(k, n) + hx(u, 4).toUpperCase();
  }

  function meet(mg, rid) {
    var jyo = parseInt(rid.substr(4, 2), 10), kai = rid.substr(6, 2), nichi = rid.substr(8, 2);
    var hit = [];
    for (var i = 0; i < mg.length; i++) {
      var m = String(mg[i]);
      if (parseInt(m.charAt(1), 16) === jyo && m.substr(3, 2) === kai && m.substr(5, 2) === nichi) hit.push(m);
    }
    return hit.length === 1 ? hit[0] : null;
  }

  function parse(text) {
    text = String(text || '').trim();
    if (text.indexOf(TAG) !== 0) throw new Error('コピーの中身が Ans. の買い目ではありません。Ans. の「IPAT投票」を押し直してください');
    var o = JSON.parse(text.slice(TAG.length));
    if (!/^\d{12}$/.test(o.r) || !o.b || !o.b.length) throw new Error('買い目が読めません');
    var bets = o.b.map(function (x) {
      var k = x[0], n = x[1], u = x[2];
      var lim = k === 3 ? 8 : 18;
      var ok = ARITY[k] && n && n.length === ARITY[k] && u >= 1 && u <= 9999 && u === Math.floor(u)
        && n.every(function (v, i) { return v >= 1 && v <= lim && v === Math.floor(v) && (k === 3 || n.indexOf(v) === i); });
      if (!ok) throw new Error('読めない買い目があります: ' + JSON.stringify(x));
      if (k !== 6 && k !== 8) n = n.slice().sort(function (a, b) { return a - b; });
      return { k: k, n: n, u: u };
    });
    return { race: o.r, at: o.t || 0, bets: bets };
  }

  var E = { mark: mark, line: line, meet: meet, parse: parse, TAG: TAG };
  if (window.__ANS_TEST__) { window.__ANS_TEST__.E = E; return; }

  function say(t) { alert('Ans.の買い目\n\n' + t); }

  if (location.hostname !== 'www.ipat.jra.go.jp' || location.pathname.indexOf('pw_740_i.cgi') < 0
      || typeof Nb === 'undefined' || typeof Mg === 'undefined' || typeof ToSend !== 'function') {
    say('即PATにログインして、トップメニューの「通常投票」を開いてから押してください。');
    return;
  }

  function go(text) {
    var p;
    try { p = parse(text); } catch (e) { say(e.message); return; }
    var m = meet(Mg, p.race);
    var rno = parseInt(p.race.substr(10, 2), 10);
    if (!m) { say('このレース（' + p.race + '）は、いまの即PATで発売していません。日付とレースを確かめてください。'); return; }
    var hours = p.at ? (Date.now() - p.at) / 3600000 : 0;
    if (hours > 3 && !confirm('この買い目は約' + Math.round(hours) + '時間前にコピーしたものです。このまま進みますか？')) return;

    var free = [], used = 0;
    for (var i = 0; i < Nb.length; i++) { if (String(Nb[i]) === '0') free.push(i); else used++; }
    if (used && !confirm('即PATの投票内容に、すでに' + used + '件入っています。Ans.の' + p.bets.length + '点を足して進みますか？')) return;
    if (p.bets.length > free.length) { say('即PATに入れられるのはあと' + free.length + '点です（Ans.の買い目は' + p.bets.length + '点）。'); return; }

    p.bets.forEach(function (b, j) { Nb[free[j]] = line(m, rno, b.k, b.n, b.u); });
    ToSend();
  }

  function ask() {
    var t = prompt('Ans.の買い目を貼り付けてください（長押し→ペースト）', '');
    if (t) go(t);
  }

  if (navigator.clipboard && navigator.clipboard.readText) {
    navigator.clipboard.readText().then(function (t) {
      if (t && String(t).trim().indexOf(TAG) === 0) go(t); else ask();
    }, ask);
  } else {
    ask();
  }
})();
