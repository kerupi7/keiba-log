/**
 * 買い目シート → 即PAT（141-ipat-bookmark-spec・2026-10-10）
 *
 * 2つの道:
 *   中継役あり（Mac mini・Tailscale を登録した端末）: 「IPAT投票」→ IPATログイン →「IPAT投票へすすむ」
 *     → 中継役が即PATに入って買い目を詰め、即PAT の「合計金額入力」が開く（netkeiba と同じ3回。アプリ内のブラウザでも動く）
 *   中継役なし（ブックマーク版）: 下の流れ
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
  var RELAY = 'ipat:relay';                  // {url, token}。iphone_link.py のリンクで一度だけ登録する
  var TAG = 'ANSIPAT1 ';                     // ipat-bookmarklet.js と同じ印
  var IPAT = 'https://www.ipat.jra.go.jp/sp/';
  var SIKI = { tansho: 1, fukusho: 2, wakuren: 3, umaren: 4, wide: 5, umatan: 6, sanrenpuku: 7, sanrentan: 8 };
  var MAX_POINTS = 255;                      // 即PAT が1回で受ける点数

  function relay() { try { var c = JSON.parse(localStorage.getItem(RELAY)); return c && c.url && c.token ? c : null; } catch (e) { return null; } }
  function ready() { try { return localStorage.getItem(FLAG) === '1' || !!relay(); } catch (e) { return false; } }

  // #ipat-setup=<中継役のURL>|<合言葉> を読み、端末に覚えてから URL から消す（合言葉を画面に残さない）。off で消す
  function takeSetup() {
    var m = /[#&]ipat-setup=([^&]+)/.exec(location.hash || '');
    if (!m) return;
    var raw = decodeURIComponent(m[1]), i = raw.indexOf('|');
    try {
      if (raw === 'off') localStorage.removeItem(RELAY);
      else if (i > 0) localStorage.setItem(RELAY, JSON.stringify({ url: raw.slice(0, i).replace(/\/+$/, ''), token: raw.slice(i + 1) }));
    } catch (e) { /* 覚えないだけ */ }
    history.replaceState(null, '', location.pathname + location.search);
  }
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
    if (relay()) { openLogin(raceId, ex, total); return; }
    var text = TAG + JSON.stringify({ r: String(raceId), t: Date.now(), b: ex.bets });
    copyText(text).then(function () {
      toast('買い目をコピーしました（' + ex.bets.length + '点・' + yen(total) + '円'
        + (ex.skipped ? '・' + ex.skipped + '点は外しました' : '') + '）');
      setTimeout(function () { location.href = IPAT; }, 900);
    }, function () {
      toast('コピーできませんでした。もう一度押してください');
    });
  }

  // ── 中継役あり: IPATログイン（netkeiba の「IPATログイン」と同じ並び） ─────────────
  var RELAY_DOWN = 'Mac mini の中継役につながりません。iPhone の Tailscale がつながっているか確かめてください';
  function openLogin(raceId, ex, total) {
    var cfg = relay();
    var old = document.getElementById('ipat-login');
    if (old) old.remove();
    var el = document.createElement('div');
    el.id = 'ipat-login';
    el.innerHTML = '<div class="ipl-scrim" data-ipl-close></div>'
      + '<form class="ipl-panel" autocomplete="off" novalidate>'
      + '<div class="ipl-head">IPATログイン<button type="button" class="ipl-x" data-ipl-close aria-label="閉じる">✕</button></div>'
      + '<div class="ipl-sum">' + ex.bets.length + '点　' + yen(total) + '円'
      + (ex.skipped ? '<span>（取消の馬・組めない枠連の' + ex.skipped + '点は外しました）</span>' : '') + '</div>'
      + '<div class="ipl-body">'
      + '<label class="ipl-f" data-ipl-full>加入者番号<input name="userid" inputmode="numeric" maxlength="8" pattern="[0-9]*"></label>'
      + '<label class="ipl-f">暗証番号<input name="pin" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]*"></label>'
      + '<label class="ipl-f" data-ipl-full>P-ARS番号<input name="pars" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]*"></label>'
      + '<label class="ipl-ck" data-ipl-full><input type="checkbox" name="remember" checked> 次回から暗証番号のみを入力</label>'
      + '<p class="ipl-err" hidden></p>'
      + '<button type="submit" class="ipl-go">IPAT投票へすすむ</button>'
      + '<p class="ipl-note">即PATの「合計金額入力」が開きます。合計金額を入れて「投票」を押すまで、馬券は買われません。</p>'
      + '</div></form>';
    document.body.appendChild(el);

    var form = el.querySelector('form'), err = el.querySelector('.ipl-err'), btn = el.querySelector('.ipl-go');
    var remembered = false;
    function fail(t) { err.textContent = t; err.hidden = false; btn.disabled = false; btn.textContent = 'IPAT投票へすすむ'; }
    el.addEventListener('click', function (e) { if (e.target.closest('[data-ipl-close]')) el.remove(); });

    // 中継役が加入者番号・P-ARS番号を覚えていれば、暗証番号だけを出す
    fetch(cfg.url + '/ipat/ping', { headers: { 'X-Relay-Token': cfg.token } })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) { fail(j.error || '中継役に断られました'); return; }
        remembered = !!j.remembered;
        if (remembered) el.querySelectorAll('[data-ipl-full]').forEach(function (f) { f.hidden = true; });
        var first = el.querySelector(remembered ? 'input[name=pin]' : 'input[name=userid]');
        if (first) first.focus();
      })
      .catch(function () { fail(RELAY_DOWN); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.hidden = true;
      var f = form.elements;
      var body = { race_id: String(raceId), pin: f.pin.value.trim(),
        bets: ex.bets.map(function (b) { return { siki: b[0], nums: b[1], units: b[2] }; }) };
      if (!remembered) { body.userid = f.userid.value.trim(); body.pars = f.pars.value.trim(); body.remember = f.remember.checked; }
      btn.disabled = true; btn.textContent = '即PATにつないでいます…';
      fetch(cfg.url + '/ipat/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Relay-Token': cfg.token },
        body: JSON.stringify(body),
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j.ok) { fail(j.error || '中継役で止まりました'); return; }
          f.pin.value = '';
          location.href = cfg.url + j.go;   // 中継役の受け渡しページ → 即PAT の合計金額入力
        })
        .catch(function () { fail(RELAY_DOWN); });
    });
  }

  // 貼り付けで登録する（ホーム画面の Ans. は他のアプリのリンクで開けないので、リンクの登録が届かない）。
  // 受け付ける形: 「https://…ts.net|合言葉」か、iphone_link.py が出すリンクそのもの
  function register(text) {
    var raw = String(text || '').trim();
    var m = /ipat-setup=([^&\s]+)/.exec(raw);
    if (m) raw = decodeURIComponent(m[1]);
    var i = raw.indexOf('|');
    if (i < 0 || !/^https:\/\/[^\s|]+$/.test(raw.slice(0, i)) || raw.length - i < 20) return null;
    var cfg = { url: raw.slice(0, i).replace(/\/+$/, ''), token: raw.slice(i + 1) };
    try { localStorage.setItem(RELAY, JSON.stringify(cfg)); } catch (e) { return null; }
    return cfg;
  }
  function ping(cfg) {
    return fetch(cfg.url + '/ipat/ping', { headers: { 'X-Relay-Token': cfg.token } }).then(function (r) { return r.json(); });
  }

  takeSetup();
  var IpatGo = { ready: ready, enable: enable, relay: relay, register: register, ping: ping, expand: expand, go: go, TAG: TAG };
  if (typeof window !== 'undefined') window.IpatGo = IpatGo;
  if (typeof module !== 'undefined' && module.exports) module.exports = IpatGo;
})();
