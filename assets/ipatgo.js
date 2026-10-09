/**
 * 買い目シート → 即PAT（ブックマーク版・141-ipat-bookmark-spec・2026-10-10）
 *
 * 「IPAT投票」を押すと、シートの買い目を1点ずつに開いて iPhone のコピーに入れ、即PAT スマホ版を開く。
 * 即PAT でログイン →「通常投票」→ ブックマーク「Ans.の買い目」（assets/ipat-bookmarklet.js）→「ペースト」
 * → 即PAT の「合計金額入力」。合計金額を入れて「投票」を押すのは本人。
 *
 * Ans. は即PAT の番号に触れない。ボタンは ipat-bookmark.html を開いた端末だけに出す（他の閲覧者には出さない）。
 * 依存: simulator.js（Simulator._internal.enumerate）・betsheet.js（BetSheet.load）
 */
(function () {
  'use strict';

  var FLAG = 'ipat:on';
  var TAG = 'ANSIPAT1 ';                     // ipat-bookmarklet.js と同じ印
  var IPAT = 'https://www.ipat.jra.go.jp/sp/';
  var SIKI = { tansho: 1, fukusho: 2, wakuren: 3, umaren: 4, wide: 5, umatan: 6, sanrenpuku: 7, sanrentan: 8 };
  var MAX_POINTS = 255;                      // 即PAT が1回で受ける点数

  function ready() { try { return localStorage.getItem(FLAG) === '1'; } catch (e) { return false; } }
  function enable(on) { try { if (on) localStorage.setItem(FLAG, '1'); else localStorage.removeItem(FLAG); } catch (e) { /* 覚えないだけ */ } }

  // シートの全行を1点ずつに開く。同じ券種・同じ組み合わせは金額を足して1点にまとめる。
  // 取消の馬を含む点と、走る馬が足りない枠の枠連は即PAT が受けないので外す
  function expand(raceId, site) {
    var scratched = {}, perGate = {};
    (site.horses || []).forEach(function (h) {
      if (h.scratched) { scratched[h.number] = true; return; }
      perGate[h.gate] = (perGate[h.gate] || 0) + 1;
    });
    var merged = {}, order = [], skipped = 0;
    BetSheet.load(raceId).forEach(function (l) {
      var st = l.state;
      var siki = st.betType === 'tansho' ? (st.tanFuku === 'fukusho' ? 2 : 1) : SIKI[st.betType];
      if (!siki) return;
      var units = Math.round((l.unit || 100) / 100);
      Simulator._internal.enumerate(st, site).forEach(function (it) {
        var frame = !Array.isArray(it);
        var nums = frame ? it.frame.slice() : it.slice();
        if (!frame && nums.some(function (n) { return scratched[n]; })) { skipped++; return; }
        if (frame && (nums[0] === nums[1] ? (perGate[nums[0]] || 0) < 2 : !perGate[nums[0]] || !perGate[nums[1]])) { skipped++; return; }
        if (siki !== 6 && siki !== 8) nums.sort(function (a, b) { return a - b; });
        var k = siki + ':' + nums.join('-');
        if (!merged[k]) { merged[k] = [siki, nums, 0]; order.push(k); }
        merged[k][2] += units;
      });
    });
    return { bets: order.map(function (k) { return merged[k]; }), skipped: skipped };
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }
  function legacyCopy(text) {
    return new Promise(function (ok, ng) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '-1000px';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      var done = false;
      try { done = document.execCommand('copy'); } catch (e) { done = false; }
      ta.remove();
      if (done) ok(); else ng(new Error('copy'));
    });
  }

  function yen(v) { return String(v).replace(/\B(?=(\d{3})+$)/g, ','); }

  // 「IPAT投票」。toast は race.js の bsToast を受け取る
  function go(raceId, site, toast) {
    var ex = expand(raceId, site);
    if (!ex.bets.length) { toast('シートに買い目がありません'); return; }
    if (ex.bets.length > MAX_POINTS) { toast('即PATへ1回で送れるのは' + MAX_POINTS + '点までです（いま' + ex.bets.length + '点）'); return; }
    var total = ex.bets.reduce(function (s, b) { return s + b[2] * 100; }, 0);
    var text = TAG + JSON.stringify({ r: String(raceId), t: Date.now(), b: ex.bets });
    copyText(text).then(function () {
      toast('買い目をコピーしました（' + ex.bets.length + '点・' + yen(total) + '円'
        + (ex.skipped ? '・' + ex.skipped + '点は外しました' : '') + '）');
      setTimeout(function () { location.href = IPAT; }, 900);
    }, function () {
      toast('コピーできませんでした。もう一度押してください');
    });
  }

  var IpatGo = { ready: ready, enable: enable, expand: expand, go: go, TAG: TAG };
  if (typeof window !== 'undefined') window.IpatGo = IpatGo;
  if (typeof module !== 'undefined' && module.exports) module.exports = IpatGo;
})();
