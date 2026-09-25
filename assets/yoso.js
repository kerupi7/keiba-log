// 自動生成：部署/競馬部/仕様/予測サイト/mockup-169-to-ans.py が mockup-169-yoso-swipe-flow.flow.js から書き出した。ここを直接直さず、試作を直してから書き出し直す。
// mockup-169: 「予想をはじめる」の流れ。本番のレース画面（race.js が組み立てたもの）の上に重ねる。
// 仕様: 部署/競馬部/過去の決定事項/未着手/2026-09-17_払う比べるだけで印が決まる画面.md
// 馬名ポップアップの印の札・通算成績の行と、出馬表の「展開」の面は、本番が描いた DOM から複製して使う。
(async function () {
  'use strict';
  const MARKS3 = ['◎', '○', '▲'];
  const KCLS = { '◎': '', '○': 'k2', '▲': 'k3' };
  const RUN_LABEL = ['前走', '2走前', '3走前', '4走前', '5走前'];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => escapeHtml(s == null ? '' : String(s));

  const raceId = new URLSearchParams(location.search).get('id');
  if (!raceId || typeof getData !== 'function') return;
  let site;
  try { site = await getData(`data/races/${raceId}.json`); } catch (e) { return; }
  if (!site || !Array.isArray(site.horses)) return;
  const H = [...site.horses].filter((h) => !h.scratched).sort((a, b) => a.number - b.number);
  const KEY = `mymark:${raceId}`;
  let S = null;
  let Q = H;         // この回にスワイプで出す馬（2026-09-18：未入力の馬だけ。全頭済みなら16頭やり直し）
  let root = null;   // 重ねる画面

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'yf-toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  // ---------- 印の保存（本番と同じ mymark:{race_id}） ----------
  let MOCK_M = null;   // 試作で状態を見せるときだけ使う（本番では常に null）
  function loadMarks() { if (MOCK_M) return MOCK_M; try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function saveMarks(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { /* 保存しないだけ */ } }

  // ---------- 本番の部品を借りる ----------
  // 馬名ポップアップ（#pop-N）から、印の札（穴・地雷など）・通算成績の行・穴や地雷の理由だけ借りる
  function parts(n) {
    const pop = document.querySelector(`.race20 #pop-${n}`);
    const out = { career: '', badge: '', why: '' };
    if (pop) {
      const b = pop.querySelector('.phead > .mkstack, .phead > .mkb');
      out.badge = b ? b.outerHTML : '';
      const body = pop.querySelector('.pbody');
      const c = body.querySelector('.pcareer');
      out.career = c ? c.outerHTML : '';
      out.why = [...body.children].filter((e) => e.classList.contains('mkw')).map((e) => e.outerHTML).join('');
    }
    return out;
  }
  const PARTS = {};
  const P = (n) => (PARTS[n] = PARTS[n] || parts(n));

  // ---------- 入口（印の一覧の一番上） ----------
  //   2026-09-18：押すと下からのシートで「絞り込み」「印」の2つを出す（3案から M1 に決定）。
  //   印は、絞り込みを全頭終えてからでないと選べない（同日ユーザー指示）

  // いまの自分の印から、2つのメニューの状態を数える。◎○▲の馬も✓を通った馬なので、印の候補に入れる
  function markState() {
    const m = loadMarks();
    const v = Object.values(m);
    const chk = v.filter((x) => x === '✓').length;
    const kesi = v.filter((x) => x === '消').length;
    const got = MARKS3.filter((k) => v.includes(k));
    // 全頭に ✓・消・◎○▲ のどれかが付いていれば、絞り込みは終わっている
    const fin = (x) => x === '✓' || x === '消' || MARKS3.includes(x);
    const n = H.filter((h) => fin(m[h.number])).length;
    const done = n === H.length;
    return { chk, kesi, got, cand: chk + got.length, swiped: n > 0, done, n, total: H.length };
  }
  const canMark = (st) => st.done && st.cand > 0;

  const MENU_ICON = {
    swipe: '<span class="yfm-ic sw"><i>✕</i><i>✓</i></span>',
    mark: '<span class="yfm-ic mk">◎</span>',
  };
  const MENU_TXT = {
    swipe: { t: '絞り込み', s: '1頭ずつスワイプして、残す馬（✓）と消す馬を決める' },
    mark: { t: '印', s: '✓の馬を2頭ずつ比べて、◎○▲を決める' },
  };
  // 行の右端の状態は文字でなく記号で出す（2026-09-18 ユーザー「まだ・先に消しとチェックは芸がない」）。
  //   3案から S2 に決定：絞り込みは何頭終えたかを輪と「3/16」で、済むと緑の✓。印は鍵 → ◎○▲ の丸が埋まっていく

  // 状態をひとつの言葉にまとめる（swipe: none/part/done、mark: lock/ready/part/done）
  function phase(st, which) {
    if (which === 'swipe') return st.done ? 'done' : st.swiped ? 'part' : 'none';
    if (!canMark(st)) return 'lock';
    if (!st.got.length) return 'ready';
    return st.got.length >= Math.min(3, st.cand) ? 'done' : 'part';
  }
  const LOCK = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const marks3 = (st) => `<span class="yfs-m3">${MARKS3.map((k) => `<i class="${st.got.includes(k) ? `on ${KCLS[k] || 'k1'}` : ''}">${k}</i>`).join('')}</span>`;
  const ring = (frac, done) => {
    const r = 10, c = 2 * Math.PI * r;
    return `<svg class="yfs-ring${done ? ' done' : ''}" viewBox="0 0 26 26" width="26" height="26" aria-hidden="true">
      <circle cx="13" cy="13" r="${r}" class="bg"/>
      <circle cx="13" cy="13" r="${r}" class="fg" stroke-dasharray="${(c * frac).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 13 13)"/>
      ${done ? `<circle cx="13" cy="13" r="${r + 1.5}" class="fill"/><g transform="translate(6.5 6.5)">${CHECK}</g>` : ''}</svg>`;
  };
  function statusHtml(st, which) {
    const ph = phase(st, which);
    if (which === 'swipe') {
      return `<span class="yfs-rw">${ring(st.n / st.total, ph === 'done')}<small>${ph === 'done' ? '' : `${st.n}/${st.total}`}</small></span>`;
    }
    if (ph === 'lock') return `<span class="yfs-lock">${LOCK}</span>`;
    return marks3(st);
  }

  function mountEntry() {
    const list = document.querySelector('.race20 .mm-list');
    if (!list || list.querySelector('.yf-entry')) return;
    const st = markState();
    const box = document.createElement('div');
    box.className = 'yf-entry';
    const line = st.swiped
      ? `いまの予想：✓${st.cand}・消${st.kesi}${st.got.length ? `・${st.got.join('')}` : '・印はまだ'}`
      : '絞り込み → 印 の順に決めます';
    box.innerHTML = `<button type="button" class="yf-btn" id="yf-go">予想をはじめる</button>
      <p>${line}</p>`;
    list.insertBefore(box, list.firstChild);
    box.querySelector('#yf-go').addEventListener('click', openMenu);
  }

  // 絞り込み：まだ印の無い馬だけを出す。済んだ馬の答えはそのまま持っていく（全頭済みなら16頭すべてやり直し）。
  //   ◎○▲ が付いた馬は✓として持っていく（印は絞り込みの後に決め直すため）
  function startSwipe() {
    const m = loadMarks();
    const fin = (x) => x === '✓' || x === '消' || MARKS3.includes(x);
    const all = markState().done;
    Q = all ? H : H.filter((h) => !fin(m[h.number]));
    open('none');
    if (!all) for (const h of H) { const x = m[h.number]; if (x === '消') S.my[h.number] = '消'; else if (fin(x)) S.my[h.number] = '✓'; }
    go('swipe');
  }

  // 印だけやり直す：いまの✓（と◎○▲）を候補にし、消はそのまま。前の◎○▲は、選び直さなければ✓に戻る
  function startMarkOnly() {
    const m = loadMarks();
    open('none');
    // 決まっている印は残し、まだの印から始める（◎が決まっていれば○から。2026-09-18 ユーザー指示）。
    //   3つとも決まっていれば、前と同じく◎から決め直す
    const all3 = MARKS3.every((k) => Object.values(m).includes(k));
    for (const h of H) {
      const x = m[h.number];
      if (MARKS3.includes(x) && !all3) S.my[h.number] = x;
      else if (x === '✓' || MARKS3.includes(x)) S.my[h.number] = '✓';
      else if (x === '消') S.my[h.number] = '消';
    }
    S.idx = H.length;
    startMark(nextStep(0));
  }

  function menuRow(st, which) {
    const dis = which === 'mark' && !canMark(st);
    const ph = phase(st, which);
    return `<button type="button" class="yfm-srow${dis ? ' dis' : ''}" data-menu="${which}" data-ph="${ph}"${dis ? ' aria-disabled="true"' : ''}>
      ${MENU_ICON[which]}
      <span class="yfm-tx"><b>${MENU_TXT[which].t}</b><small>${MENU_TXT[which].s}</small></span>
      <span class="yfm-st">${statusHtml(st, which)}</span>
    </button>`;
  }

  // 下からのシート：「予想をやめますか？」のシートと同じ作り。2行とキャンセル
  let MENU = null;
  function openMenu() {
    if (MENU) return;
    const st = markState();
    haptic();
    const bg = document.createElement('div');
    bg.className = 'yfm-bg';
    bg.innerHTML = `<div class="yfm-sheet">
      <div class="yfm-grp"><div class="yfm-hd">予想をはじめる</div>${menuRow(st, 'swipe')}${menuRow(st, 'mark')}</div>
      <button type="button" class="yfm-cancel" data-menu="cancel">キャンセル</button></div>`;
    document.body.appendChild(bg);
    document.body.style.overflow = 'hidden';
    MENU = bg;
    bg.addEventListener('click', onMenuClick);
  }
  function onMenuClick(e) {
    const b = e.target.closest('[data-menu]');
    if (!b) { if (e.target === MENU) closeMenu(); return; }
    if (b.dataset.menu === 'cancel') { closeMenu(); return; }
    if (b.classList.contains('dis')) {
      // 選べない行は小さく揺らす
      if (b.animate) b.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 260 });
      return;
    }
    closeMenu(true);
    if (b.dataset.menu === 'swipe') startSwipe(); else startMarkOnly();
  }
  function closeMenu(now) {
    if (!MENU) return;
    const el = MENU;
    MENU = null;
    document.body.style.overflow = '';
    if (now) { el.remove(); return; }
    el.classList.add('out');
    setTimeout(() => el.remove(), 240);
  }

  // ---------- 重ねる画面 ----------
  // first='view' は「1頭だけ見る」（2026-09-21 ユーザー指示）。出馬表などで馬名を押したときに開く。
  //   中身と並びは絞り込みの札と同じで、払って決める動きだけ無い（S.view で分かれる）
  let pageY = 0;   // この画面を開く前に見ていたページの高さ（閉じたときに戻す）
  function open(first = 'swipe', horse = null) {
    if (first === 'swipe') Q = H;
    if (first === 'view') Q = [horse];
    S = { screen: first === 'view' ? 'view' : 'swipe', idx: 0, page: 0, my: {}, step: 0,
          t: null, busy: false, view: first === 'view' };
    // 重ねている間は後ろのページを止める。閉じたときは、開く前に見ていた高さへ戻す
    //   （2026-09-21：閉じるとページの先頭に戻るという指摘。overflow:hidden だけでは位置が
    //    残らないので、本番の lockPageScroll と同じ「位置を覚えて戻す」に合わせた）
    pageY = window.scrollY || window.pageYOffset || 0;
    root = document.createElement('div');
    root.className = 'yf';
    root.innerHTML = '<div class="yf-col" id="yf-col"></div>';
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';
    document.body.classList.add('yf-open');
    root.addEventListener('click', onClick);
    if (first === 'swipe' || first === 'view') go(S.screen);
  }

  function close(apply) {
    if (apply) {
      const m = loadMarks();
      // 流れで決めたものだけ上書きする（消・✓・◎○▲）。◎○▲は1頭までなので他の馬からは外す
      for (const [n, mk] of Object.entries(S.my)) {
        if (MARKS3.includes(mk)) for (const k of Object.keys(m)) if (m[k] === mk) delete m[k];
        m[n] = mk;
      }
      saveMarks(m);
      try { sessionStorage.setItem('yf-back', '1'); } catch (e) { /* なくても動く */ }
      location.reload();   // 本番の一覧を印つきで描き直させる
      return;
    }
    root.remove(); root = null;
    document.body.style.overflow = '';
    document.body.classList.remove('yf-open');
    window.scrollTo(0, pageY);   // 開く前に見ていた高さへ戻す（2026-09-21）
  }

  function go(name) {
    S.screen = name;
    const col = document.getElementById('yf-col');
    col.classList.remove('enter'); void col.offsetWidth; col.classList.add('enter');
    render();
  }

  function render() {
    const col = document.getElementById('yf-col');
    // ページをめくっただけなら、後ろの札（次の馬）は描き直さずに残す
    const oldBack = document.getElementById('yf-back');
    const keepBack = S.screen === 'swipe' && oldBack && Number(oldBack.dataset.n) === (Q[S.idx + 1] || {}).number ? oldBack : null;
    const keepLater = S.screen === 'swipe' ? [...document.querySelectorAll('.yf-card.later')] : [];
    col.innerHTML = { swipe: vSwipe, view: vSwipe, ask: vAsk, duel: vCompare, marked: vMarked }[S.screen]();
    if (S.screen === 'swipe' || S.screen === 'view') {
      fitPage();
      const deck = document.getElementById('yf-deck');
      if (keepBack) deck.insertBefore(keepBack, document.getElementById('yf-card'));
      keepLater.forEach((x) => deck.insertBefore(x, deck.firstChild));
      bindCard();
      // 次の後ろの札は、切り替えが済んでから描く（1頭だけ見るときは後ろが無い）
      if (S.screen === 'swipe') fillBack();
    }
    if (S.screen === 'duel') fitDuel();
  }

  // 1ページを画面の高さに収める（2026-09-17 ユーザー「縦スクロールせずに1画面に収めたい」）。
  //   中身が札より長いときは、中身ごと縮めて収める（字の大きさの比は変えない）。全戦績だけは縦に動かして見る形のまま（同日決定・案B）
  // ---------- 金の枠（2026-09-24・試作 mockup-217） ----------
  //   ユーザー「自分がどこを見ていいと思ったのかを記録したい。タップすればその部分を金色の枠線で囲む」。
  //   絞り込みの札の部品を押すと金の枠が付き、もう一度押すと外れる。記録は gold:{race_id} に端末の中だけで残す。
  //   押せる単位（GOLD_UNIT）は輪1つ・マス1つ・過去走の1行などの小さいまとまり。コース適性の山（.ax-hit）は除く
  const GOLD_KEY = `gold:${raceId}`;
  const GOLD_UNIT = [
    // 基本：オッズ・人気／通算成績／コース適性の輪／右回り・道悪／型べつ成績の上の2つと6マス
    '.b-od', '.b-car', '.ax-u', '.ax-o', '.rt-ta', '.rt-m',
    // コース：点数のまとめ／表彰台の1段／前走コース・騎手・種牡馬・調教師・母父の各行
    '.e5s', '.e5-ps', '.e5-row',
    // 展開：上の3つ（馬場・勝ちタイム・逃げ）／ペース・脚質・内外の各行／枠の行／脚質の列（下の札）
    '.tk3-u', '.tk3-r', '.tk3-gt', '.tk3-zl > span',
    // 直近5走：1走ぶんの札
    '.s1-card',
    // 前走〜5走前：レースの札／着順の札／コーナーごとの位置の図／上がり／800m通過・決着／条件の列（馬場・間隔・騎手…）
    '.rp-race', '.rp-hero', '.pp-fig', '.pp-row', '.pp-flow > *', '.gd-col',
    // 全戦績：1走ぶんの行
    '.al-row',
  ].join(',');
  // 部品の外側を押したときに、どの部品として扱うか（押した場所 → 部品）
  //   ・展開の地図：押した位置の脚質の列 → 下の脚質の札
  //   ・過去走の条件の表：押したマスの列 → その列ぜんぶ（.gd-col）
  function goldAlias(target, pe) {
    const map = target.closest('.tk3-map');
    if (map) {
      const zb = [...map.querySelectorAll('.tk3-zb')];
      const x = goldAlias.x;
      const i = zb.findIndex((z) => { const r = z.getBoundingClientRect(); return x >= r.left && x < r.right; });
      const zl = pe.querySelectorAll('.tk3-zl > span');
      return i >= 0 ? zl[i] || null : null;
    }
    const grid = target.closest('.e-grid');
    if (grid) {
      const cell = target.closest('.e-grid > *');
      const col = cell && cell.style.gridColumnStart;
      return col ? grid.querySelector(`.gd-col[data-col="${col}"]`) : null;
    }
    return null;
  }
  // 過去走の条件の表は、列が1つの箱になっていない（マスが grid に直接並ぶ）ので、列ごとに透明な箱を敷く
  function goldCols(pe) {
    pe.querySelectorAll('.e-grid').forEach((grid) => {
      if (grid.querySelector('.gd-col')) return;
      const cells = [...grid.children];
      const cols = [...new Set(cells.map((c) => Number(c.style.gridColumnStart)).filter((n) => n >= 2))];
      // 下の端の線の番号（マスの行の終わりのうち一番下）。'auto' や空は数えない
      const last = Math.max(2, ...cells.flatMap((c) => [Number(c.style.gridRowStart) + 1, Number(c.style.gridRowEnd)]).filter(Number.isFinite));
      cols.forEach((n) => {
        const box = document.createElement('i');
        box.className = 'gd-col';
        box.dataset.col = String(n);
        box.style.cssText = `grid-row:1 / ${last};grid-column:${n}`;
        box.dataset.txt = cells.filter((c) => Number(c.style.gridColumnStart) === n && !c.classList.contains('e-hitbg'))
          .map((c) => (c.innerText || c.textContent || '').trim()).filter(Boolean).join(' ');
        grid.insertBefore(box, grid.firstChild);
      });
    });
  }
  // 展開の地図の列：下の脚質の札に金が付いていたら、その列にも薄く付ける
  function goldTwins(pe) {
    const zb = [...pe.querySelectorAll('.tk3-map .tk3-zb')];
    const zl = [...pe.querySelectorAll('.tk3-zl > span')];
    //   列の地（.tk3-zb）は薄く透かしてあるので、そこに枠を描くと枠まで薄くなる。同じ位置に別の箱を重ねて描く
    pe.querySelectorAll('.gd-zbox').forEach((x) => x.remove());
    zb.forEach((z, i) => {
      if (!(zl[i] && zl[i].classList.contains('gd-on'))) return;
      const box = document.createElement('i');
      box.className = 'gd-zbox';
      box.style.cssText = `left:${z.offsetLeft}px;top:${z.offsetTop}px;width:${z.offsetWidth}px;height:${z.offsetHeight}px`;
      z.parentElement.insertBefore(box, z.nextSibling);
    });
  }
  // 端末に保存できない画面（保存を禁じた枠の中など）では、開いている間だけ覚えておく（GOLD_MEM）
  let GOLD_MEM = null;
  function goldLoad() {
    if (GOLD_MEM) return JSON.parse(JSON.stringify(GOLD_MEM));
    try { return JSON.parse(localStorage.getItem(GOLD_KEY)) || {}; } catch (e) { return {}; }
  }
  function goldSave(g) {
    try { localStorage.setItem(GOLD_KEY, JSON.stringify(g)); GOLD_MEM = null; } catch (e) { GOLD_MEM = g; }
  }
  const pgKey = (pg) => (pg ? `${pg.k}${pg.i != null ? pg.i : ''}` : '');
  // ページの中の押せる部品。入れ子になったときは外側だけを数える（内側は外側の一部として扱う）
  function goldUnits(pe) {
    const all = [...pe.querySelectorAll(GOLD_UNIT)];
    return all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
  }
  // 表示している文字（後で印の画面や振り返りに並べるため）。空白を詰めて、長すぎるものは切る
  //   ・型べつ成績のマスは、行（スロー／平均／ハイ）と列（前残り／差し追込）の名前を前に付ける
  //   ・コーナーごとの位置の図は、数字が全部読まれてしまうので、この馬の位置だけを「4→4→5→5→3着」の形にする
  function goldText(el) {
    let t = el.dataset.txt || el.innerText || el.textContent || '';
    if (el.matches('.rt-m')) {
      const g = el.parentElement;
      const ch = [...g.querySelectorAll('.rt-ch')].map((x) => x.textContent.trim());
      const rh = [...g.querySelectorAll('.rt-rh')].map((x) => x.textContent.trim());
      const i = [...g.querySelectorAll('.rt-m')].indexOf(el);
      if (ch.length && i >= 0) t = `${rh[Math.floor(i / ch.length)] || ''}×${ch[i % ch.length] || ''} ${t}`;
    }
    if (el.matches('.pp-fig')) {
      const me = [...el.querySelectorAll('.pq-tm')].map((x) => x.textContent.trim()).filter(Boolean);
      if (me.length) t = `${me.join('→')}着`;
    }
    t = t.replace(/\s+/g, ' ').trim();
    return t.length > 80 ? `${t.slice(0, 80)}…` : t;
  }
  // そのページの見出し（例：コース適性・レースの型べつ成績）。見つからなければ空
  function goldHead(el) {
    const card = el.closest('.h-card, .card, section');
    const h = card && card.querySelector('.h-t, h2, h3, h4');
    return h && h !== el && !el.contains(h) ? goldText(h).slice(0, 20) : '';
  }
  // 描いたページに、その馬・そのページの金を付け直す（ページをめくる・後ろの札を作るたびに呼ばれる）
  function goldPaint(pe, pg) {
    const cardEl = pe.closest('.yf-card');
    const num = cardEl && cardEl.dataset.n ? Number(cardEl.dataset.n) : (Q[S.idx] || {}).number;
    if (S.view) return;
    goldCols(pe);
    const units = goldUnits(pe);
    units.forEach((u) => u.classList.add('gd-u'));
    const mine = (goldLoad()[num] || []).filter((x) => x.page === pgKey(pg));
    mine.forEach((x) => { const u = units[x.idx]; if (u) u.classList.add('gd-on'); });
    goldTwins(pe);
  }
  // 押された部品に金を付ける／外す。部品の外（余白）を押したときは何もしない
  function goldTap(target, clientX) {
    const pe = document.getElementById('yf-page');
    if (!pe || !pe.contains(target)) return;
    const units = goldUnits(pe);
    goldAlias.x = clientX;
    const u = goldAlias(target, pe) || units.find((x) => x.contains(target));
    if (!u || !units.includes(u)) return;
    const h = Q[S.idx];
    const pg = pagesOf(h)[S.page];
    const g = goldLoad();
    const list = g[h.number] || [];
    const idx = units.indexOf(u);
    const at = list.findIndex((x) => x.page === pgKey(pg) && x.idx === idx);
    if (at >= 0) {
      list.splice(at, 1);
      u.classList.remove('gd-on');
    } else {
      list.push({ page: pgKey(pg), label: pg.label, idx, head: goldHead(u), text: goldText(u), at: new Date().toISOString() });
      u.classList.remove('gd-pop'); void u.offsetWidth;
      u.classList.add('gd-on', 'gd-pop');
      haptic();
    }
    if (list.length) g[h.number] = list; else delete g[h.number];
    goldSave(g);
    goldTwins(pe);
    document.dispatchEvent(new CustomEvent('gold-change'));
  }

  function fitPage(pe = document.getElementById('yf-page'), pg = pagesOf(Q[S.idx])[S.page]) {
    if (!pe) return;
    goldPaint(pe, pg);
    if (pg && pg.k === 'all') { pe.classList.remove('fit'); return; }
    pe.classList.add('fit');
    const inner = pe.firstElementChild;
    if (!inner) return;
    inner.style.zoom = '';
    const cs = getComputedStyle(pe);
    // 縮めると折り返しが変わって高さも変わるので、実際の下端を見ながら数回詰める（最小 0.5 倍）。
    //   下限は 0.6 倍だったが、1ページ目の中身は縮めない状態で約924px（390px幅・2026-09-24 実測）あり、
    //   見える高さ620pxでは 0.6 倍でも13pxはみ出して縦に動いた。縦に動かないことを優先して 0.5 倍まで許す
    let z = 1;
    for (let k = 0; k < 5; k += 1) {
      const r = inner.getBoundingClientRect();
      const limit = pe.getBoundingClientRect().bottom - parseFloat(cs.paddingBottom);
      if (r.bottom <= limit + 0.5) break;
      z = Math.max(0.5, z * ((limit - r.top) / r.height) * 0.995);
      inner.style.zoom = z.toFixed(3);
    }
  }

  // 画面の高さが後から変わったら収め直す（2026-09-24 ユーザー指摘「スマホだと縦スクロールが発生する」）。
  //   スマホの Safari は下のツールバーの出し入れで見える高さが変わるのに、fitPage は描いたときに1回しか
  //   動いていなかった。高さが減ると中身がはみ出し、縦に指で動かせてしまう（390×844 で開いて 667 に
  //   縮めると、中身 756px に対して枠 592px になることを確認）。回転・文字の読み込み後も同じ扱い
  let refitTimer = null;
  const refit = () => {
    clearTimeout(refitTimer);
    refitTimer = setTimeout(() => {
      if (!S) return;                    // 1頭画面を開いていないときは何もしない
      if (S.screen === 'swipe' || S.screen === 'view') fitPage();
      if (S.screen === 'duel') fitDuel();
    }, 80);
  };
  window.addEventListener('resize', refit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', refit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);

  // 比べる画面も縦に動かさず、2頭ぶんを画面の高さに収める（最小 0.6 倍）
  function fitDuel() {
    const w = document.getElementById('dl-wrap');
    const g = w && w.firstElementChild;
    if (!g) return;
    g.style.zoom = '';
    let z = 1;
    for (let k = 0; k < 5; k += 1) {
      const r = g.getBoundingClientRect();
      const limit = w.getBoundingClientRect().bottom - 8;
      if (r.bottom <= limit + 0.5) break;
      z = Math.max(0.6, z * ((limit - r.top) / r.height) * 0.995);
      g.style.zoom = z.toFixed(3);
    }
  }

  function head(step, title, pct) {
    return `<div class="yf-head"><div><div class="st">${step}</div><div class="tt">${title}</div></div>
      <button type="button" class="x" data-act="quit">やめる</button></div>
      <div class="yf-bar"><i style="width:${pct}%"></i></div>`;
  }

  // 1頭ぶんのページ。1ページ目に表2つまで入れ、2ページ目は置かない（2026-09-17 ユーザー指示）。走っていない過去走は飛ばす（決定 #9）
  function pagesOf(h) {
    const runs = (h.past_runs || []).slice(0, 5);
    // 2ページ目に直近5走のまとめを置く（2026-09-17 ユーザー指示）。過去走の各ページはその後ろ
    const sum = runs.length ? [{ k: 'sum', label: `直近${runs.length}走` }] : [];
    // 5走ページの後ろに全戦績（2026-09-17 ユーザー指示）。5走以下の馬にも出す（2026-09-18 ユーザー指示。前日は出さない決めだった）
    // 見せ方は1ページにまとめて縦に動かす（2026-09-17 決定。14走ずつページを分ける案は選ばなかった）
    const all = allRuns(h);
    const allPages = all.length ? [{ k: 'all', from: 0, to: all.length, label: `全戦績 ${all.length}走` }] : [];
    // 出馬表の「展開」の中身（馬場・枠順・脚質と展開）を1ページ置く（2026-09-17 ユーザー指示）。
    // 場所は直近5走のすぐ後ろ（同日ユーザー指示で、全戦績の前から移した）。並び：基本→直近5走→展開→前走…5走前→全戦績
    // 2026-09-24 ユーザー指示で並びを 基本→展開→直近5走 に変えた（それまでは 基本→直近5走→展開）
    // 同日、基本と展開の間にコースのページ（前走コース・騎手・種牡馬・調教師・母父のこのコースでの成績）を足した（ユーザー指示）。
    //   並び：基本→コース→展開→直近5走→前走…5走前→全戦績。コースタブの無いレース（course_entities なし）では出さない
    const course = site.course_entities ? [{ k: 'course', label: 'コース' }] : [];
    return [{ k: 'p1', label: '基本' }].concat(course, [{ k: 'tenkai', label: '展開' }], sum)
      .concat(runs.map((run, i) => ({ k: 'run', label: RUN_LABEL[i], i })))
      .concat(allPages);
  }
  // 2026-09-21：直近5走の札・全戦績の行を押してその走のページへ飛ぶ動きはやめた（ユーザー指示）。
  //   行き先に使っていた前走のページの位置（RUN_PAGE0 = 3）も要らなくなったので外した
  // 着差（秒）。数字で読めないもの（'クビ' '1.1/4' など馬身の表記）は「—」にする。NaN を出さない（2026-09-18）
  const marginSec = (v) => { const n = v == null || v === '' ? NaN : Number(v); return Number.isFinite(n) ? n : null; };
  // 全戦績は新しい順。直近5走（past_runs）＋それより前（career_runs）。同じ走が両方にあれば1つにする
  function allRuns(h) {
    const seen = new Set();
    return (h.past_runs || []).concat(h.career_runs || []).filter((r) => {
      const k = r.race_id || `${r.date}${r.race_name}`;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
  }

  // ---------- コースのページ（2026-09-24・試作 mockup-192〜196） ----------
  //   出馬表のコースタブの表（前走コース・騎手・種牡馬・調教師・母父の、このコースでの成績）を、この馬の行だけで見る。
  //   数字は同じもの：前走コースは data/courses/{course_id}.json、ほかの4つは site.course_entities（どちらも全体・全期間）
  //   主役は複勝率（コースタブの表の並べ替えの初期値と同じ）。比べる相手は ①コース全体の複勝率 ②今日の出走馬の中の順位
  //   形：上から 点数と総合順位 → 表彰台（1〜3位に入った項目の絵を台に乗せる）→ 5行（項目の絵・名前・順位の杯／複勝率・走数／平均との差の棒）→ 注釈
  const E5_DIMS = [['prev', '前走コース'], ['jockey', '騎手'], ['sire', '種牡馬'], ['trainer', '調教師'], ['damsire', '母父']];
  const E5_SHORT = { prev: '前走', jockey: '騎手', sire: '種牡馬', trainer: '調教師', damsire: '母父' };
  // 走数30未満は薄く出し、順位を付けない（コースタブの表と同じ線・60-spec D4）。
  //   順位も走数30以上の馬どうしで付ける。1走で100%の馬が1位にならないように
  const E5_THIN = 30;
  let e5Course = null;   // null＝まだ／false＝読めなかった。コースのページを開いた時に1回だけ読む（110KBほど）
  let e5Loading = false;
  function e5Load() {
    const cid = site.course_entities && site.course_entities.course_id;
    if (!cid || e5Loading || e5Course != null) return;
    e5Loading = true;
    getData(`data/courses/${cid}.json`).then((d) => { e5Course = d; }).catch(() => { e5Course = false; })
      .then(() => {   // 読み終えた時にコースのページを開いていたら描き直す（前走コースの行が「読み込み中」のまま残らないように）
        const pe = document.getElementById('yf-page');
        if (pe && pe.querySelector('.e5-page')) render();
      });
  }
  const e5Strip = (s) => { if (!s) return s; const i = String(s).indexOf('・'); return i >= 0 ? String(s).slice(i + 1) : s; };
  const e5PrevKey = (h) => {
    const p = (h.past_runs || [])[0];
    return p && p.track && p.surface && p.distance ? `${p.track}${p.surface}${p.distance}` : null;
  };
  function e5Val(dim, h) {
    if (dim === 'prev') {
      const f = e5Course && e5Course.filters && e5Course.filters.all;
      const k = e5PrevKey(h);
      return { key: k, v: f && k ? ((f.prev || {})[k] || (f.prev_more || {})[k] || null) : null };
    }
    const t = (((site.course_entities || {}).filters || {}).all || {})[dim] || {};
    const name = h[dim];
    if (!name) return { key: null, v: null };
    // 調教師だけ所属を外して突合する（'栗東・友道' と '友道'。コースタブと同じ）
    const k = dim === 'trainer' ? Object.keys(t).find((x) => e5Strip(x) === e5Strip(name)) : name;
    return { key: name, v: (k && t[k]) || null };
  }
  // コース全体の複勝率。脚質別の行を走数で重み付けして出す（＝このコースに出た全馬の3着内率）
  function e5Avg() {
    const st = e5Course && e5Course.filters && e5Course.filters.all && e5Course.filters.all.style;
    if (!st) return null;
    let n = 0, s = 0;
    Object.values(st).forEach((v) => { n += v[0]; s += v[0] * v[3]; });
    return n ? s / n : null;
  }
  function e5Rows(h) {
    const avg = e5Avg();
    return E5_DIMS.map(([dim, label]) => {
      const me = e5Val(dim, h);
      const ok = H.map((x) => e5Val(dim, x).v).filter((v) => v && v[0] >= E5_THIN);
      const thin = Boolean(me.v && me.v[0] < E5_THIN);
      const rank = me.v && !thin ? 1 + ok.filter((v) => v[3] > me.v[3]).length : null;
      const d = me.v && avg != null ? me.v[3] - avg : null;
      // 色：コース全体より5ポイント以上高い＝緑・低い＝赤（コース適性の輪と同じ幅）
      const j = !me.v || thin || d == null ? 'eq' : d >= 5 ? 'up' : d <= -5 ? 'dn' : 'eq';
      return { dim, label, key: me.key, v: me.v, rank, of: ok.length, thin, d, j, wait: dim === 'prev' && e5Course == null };
    });
  }
  const e5Name = (r) => {
    if (r.dim === 'prev') {
      if (!r.key) return '<span class="e5-nm e5-z">前走なし</span>';
      const m = String(r.key).match(/^(.+?)(芝|ダート)(\d+)$/);
      if (!m) return `<span class="e5-nm">${esc(r.key)}</span>`;
      const race = site.race || {};
      const same = m[1] === race.track && m[3] === String(race.distance) && String(race.surface || '').startsWith(m[2][0]);
      return `<span class="e5-nm">${esc(m[1])}<i class="e5-sf ${m[2] === '芝' ? 'tf' : 'dt'}">${m[2] === '芝' ? '芝' : 'ダ'}</i>`
        + `<b class="e5-dg">${m[3]}</b>${same ? '<i class="e5-same">同じコース</i>' : ''}</span>`;
    }
    return `<span class="e5-nm">${esc(r.dim === 'trainer' ? e5Strip(r.key) : r.key || '—')}</span>`;
  };
  const e5None = (r) => `<span class="e5-z">${r.wait ? '読み込み中' : r.dim === 'prev' && !r.key ? '' : 'このコースで0走'}</span>`;
  // 5項目の絵。紺一色の平らな絵を角丸の四角に入れる
  const IC = 'currentColor';
  const E5_ICON = {
    prev: `<svg viewBox="0 0 32 32"><ellipse cx="16" cy="18" rx="12" ry="8" fill="none" stroke="${IC}" stroke-width="3.2"/><path d="M19 6.5 L25 10 L19 13.5" fill="none" stroke="${IC}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    jockey: `<svg viewBox="0 0 32 32"><path d="M5 21 A11 11 0 0 1 27 21 Z" fill="${IC}"/><rect x="3" y="21" width="27" height="4.2" rx="2.1" fill="${IC}"/><path d="M16 10.5 V21" stroke="#fff" stroke-width="2.2"/></svg>`,
    sire: `<svg viewBox="0 0 32 32"><path d="M5 27 C5 19 8 13 14 10 L16 5 L19 9 C23 9 27 13 28 17 C28.5 19 27 20.5 25 20 L21 18.5 C19 20 18 23 18 27 Z" fill="${IC}"/><circle cx="21.5" cy="13" r="1.3" fill="#fff"/></svg>`,
    // 調教師＝帽子の人（2026-09-24 mockup-199 T3。前はストップウォッチ）。騎手のヘルメットと分けるため、つばを前に出す
    trainer: `<svg viewBox="0 0 32 32"><circle cx="15" cy="13.5" r="5.2" fill="${IC}"/><path d="M9 11 A6 6 0 0 1 21 11 Z" fill="${IC}"/><path d="M8.5 11.6 H26" stroke="${IC}" stroke-width="2.4" stroke-linecap="round"/><path d="M9 11.2 H21" stroke="#fff" stroke-width="1.1"/><path d="M5 29 C5 22 9 19.5 15 19.5 C21 19.5 25 22 25 29 Z" fill="${IC}"/></svg>`,
    damsire: `<svg viewBox="0 0 32 32"><path d="M9 27 C9 19 12 13 18 10 L20 5 L23 9 C26 9.5 29 13 29.5 17 C30 19 28.5 20.5 26.5 20 L23 18.5 C21 20 20.5 23 20.5 27 Z" fill="${IC}"/><circle cx="25" cy="13" r="1.3" fill="#fff"/><circle cx="7.5" cy="9" r="6.5" fill="#D9557A"/><text x="7.5" y="12.2" text-anchor="middle" font-size="8.5" font-weight="900" fill="#fff">母</text></svg>`,
  };
  const e5Ic = (dim) => `<i class="e5-ic">${E5_ICON[dim]}</i>`;
  // 順位の杯：5項目の絵と同じ一色の平らな絵（光沢・影・リボンは付けない。2026-09-24 ユーザー「浮いてる」）。
  //   金銀銅は色だけで分け、数字は杯の中に白で抜く（mockup-196 F2 四角なし）。使うのは1〜3位だけ（e5RankMark）
  const E5_CUP_COL = { 1: '#B8860B', 2: '#7D8792', 3: '#A9642E', x: '#AEB4BC' };
  const E5_CUP_PATH = 'M7.5 3 H24.5 V11 A8.5 8.5 0 0 1 18 19.3 V23 H21.5 A1.5 1.5 0 0 1 23 24.5 V28 H9 V24.5 A1.5 1.5 0 0 1 10.5 23 H14 V19.3 A8.5 8.5 0 0 1 7.5 11 Z';
  function e5Cup(kind, size) {
    const n = typeof kind === 'number' ? kind : null;
    const col = E5_CUP_COL[n && n <= 3 ? n : 'x'];
    const dash = kind === 'thin' ? ' stroke-dasharray="2 1.8"' : '';
    const cup = kind === 'thin' ? `<path d="${E5_CUP_PATH}" fill="none" stroke="${col}" stroke-width="1.6"${dash}/>` : `<path d="${E5_CUP_PATH}" fill="${col}"/>`;
    const num = n == null ? '' : `<text x="16" y="${n >= 10 ? 14 : 15.2}" text-anchor="middle" font-size="${n >= 10 ? 9 : 12.5}" font-weight="900" fill="#fff" font-family="Futura,Jost,system-ui">${n}</text>`;
    return `<i class="e5-cup" style="width:${size}px;height:${size}px" aria-label="${n ? `${n}位` : '走数が少ない'}"><svg viewBox="0 0 32 32">`
      + `<path d="M7.5 6 C2.5 6 2.5 13 8.6 14 M24.5 6 C29.5 6 29.5 13 23.4 14" fill="none" stroke="${col}" stroke-width="2.4"${dash}/>${cup}${num}</svg></i>`;
  }
  // 順位の印：トロフィーは1〜3位だけ。4位より下は数字だけ、走数30未満は「走数少」の文字だけ
  //   （2026-09-24 ユーザー「トロフィーは1〜3位まででいい」。灰色・点線の杯は同日やめた）
  const e5RankMark = (rank, size) => (rank <= 3 ? e5Cup(rank, size)
    : `<span class="e5-rkn" style="font-size:${Math.round(size * 0.5)}px"><b class="e5-dg">${rank}</b>位</span>`);
  const e5Rank = (r) => {
    if (!r.v) return '';
    if (r.thin) return '<span class="e5-rkm"><small class="e5-of">走数少</small></span>';
    return `<span class="e5-rkm">${e5RankMark(r.rank, 30)}<small class="e5-of">/${r.of}頭</small></span>`;
  };
  // 平均との差の棒：真ん中の線＝コース全体、右＝上回る（緑）・左＝下回る（赤）。端＝±20ポイント
  function e5Bar(r) {
    const R = 20;
    const d = r.d == null ? 0 : Math.max(-R, Math.min(R, r.d));
    const w = `${(Math.abs(d) / R) * 50}%`;
    const bar = d >= 0 ? `left:50%;width:${w}` : `right:50%;width:${w}`;
    const sg = r.d == null ? '' : `${r.d >= 0 ? '+' : '−'}${Math.abs(r.d).toFixed(1)}`;
    // 棒が長いときは数字を棒の中（白字）に入れて、枠の外にはみ出さないようにする
    const lab = r.d == null ? '' : Math.abs(d) > R * 0.6
      ? `<b class="e5-dd e5-dg in" style="${d >= 0 ? `right:calc(50% - ${w} + 5px)` : `left:calc(50% - ${w} + 5px)`}">${sg}</b>`
      : `<b class="e5-dd e5-dg" style="${d >= 0 ? `left:calc(50% + ${w} + 4px)` : `right:calc(50% + ${w} + 4px)`}">${sg}</b>`;
    return `<div class="e5-dv"><i class="e5-mid"></i><i class="e5-bar" style="${bar}"></i>${lab}</div>`;
  }
  function e5Row(r) {
    if (!r.v) {
      return `<div class="e5-row none">${e5Ic(r.dim)}<div class="e5-body"><div class="e5-l1"><i class="e5-lb">${r.label}</i>${e5Name(r)}</div>${e5None(r)}</div></div>`;
    }
    return `<div class="e5-row ${r.j}${r.thin ? ' thin' : ''}">${e5Ic(r.dim)}
      <div class="e5-body"><div class="e5-l1"><i class="e5-lb">${r.label}</i>${e5Name(r)}${e5Rank(r)}</div>
      <div class="e5-l2"><div class="e5-big"><b class="e5-dg">${r.v[3].toFixed(1)}<small>%</small></b><span class="e5-n"><b class="e5-dg">${r.v[0]}</b>走</span></div>${e5Bar(r)}</div></div></div>`;
  }
  // 表彰台：1〜3位に入った項目の絵を台に乗せる。1つの台に3つ以上なら絵を小さくし、4つ以上は2段に折り返す
  //   （直近200レースで、1つの台に3つ乗る馬は50頭・4つは6頭・5つは0頭。2026-09-24 数えた）
  function e5Podium(rows) {
    const step = (k, hgt) => {
      const xs = rows.filter((r) => r.v && r.rank === k);
      return `<div class="e5-ps s${k}"><div class="e5-pon${xs.length >= 3 ? ' s3' : ''}${xs.length >= 4 ? ' s4' : ''}">`
        + `${xs.map((r) => `<i class="e5-pic">${E5_ICON[r.dim]}<small>${E5_SHORT[r.dim]}</small></i>`).join('') || '<span class="e5-pz">—</span>'}</div>`
        + `<div class="e5-pst" style="height:${hgt}px">${e5Cup(k, 28)}</div></div>`;
    };
    return `<div class="e5-pod">${step(2, 34)}${step(1, 46)}${step(3, 26)}</div>`;
  }
  // 点数と総合順位（2026-09-24・試作 mockup-197 S3）。見やすさのための点数で、予想が当たるかは測っていない
  //   ユーザー「全部1位だったら100点を基準に」「順位が付かない項目は真ん中の10点で」。
  //   1項目20点×5項目＝100点。点＝20×(出走頭数−順位)÷(出走頭数−1)。1位＝20点（順位は走数30以上の馬どうし）。
  //   順位が付かない項目（走数30未満・このコースで0走・前走なし）は10点。総合順位は今日の出走馬を点数で並べたもの
  const E5_PT_MISS = 10;
  function e5Points(h) {
    return E5_DIMS.map(([dim]) => {
      const me = e5Val(dim, h).v;
      if (!me || me[0] < E5_THIN) return { dim, p: E5_PT_MISS, miss: true };
      const ok = H.map((x) => e5Val(dim, x).v).filter((v) => v && v[0] >= E5_THIN);
      // 点は出走頭数で配る（順位が付いた馬の数で配ると、3頭中3位が0点になり、順位の付かない馬の10点より下になった。2026-09-24 ユーザー指摘）
      const N = H.length, r = 1 + ok.filter((v) => v[3] > me[3]).length;
      return { dim, p: N <= 1 ? 20 : (20 * (N - r)) / (N - 1), miss: false };
    });
  }
  const e5Total = (h) => e5Points(h).reduce((a, x) => a + x.p, 0);
  // 5本の柱（項目ごとの点 0〜20・下に項目の絵）＋右に合計点と総合順位。順位が付かない項目の柱は斜線
  function e5Score(h) {
    const pts = e5Points(h);
    const tot = pts.reduce((a, x) => a + x.p, 0);
    const rank = 1 + H.filter((x) => x.number !== h.number && e5Total(x) > tot + 1e-9).length;
    const cols = pts.map((x) => `<div class="e5s-col${x.miss ? ' miss' : ''}"><i class="e5s-cb"><i style="height:${(x.p / 20) * 100}%"></i></i>`
      + `<b class="e5-dg">${Math.round(x.p)}</b><i class="e5s-ci">${E5_ICON[x.dim]}</i></div>`).join('');
    // トロフィーは1〜3位だけ。4位より下は「総合 N位」の数字だけ
    const rk = `<span class="e5s-rk${rank > 3 ? ' low' : ''}">${rank <= 3 ? e5Cup(rank, 40) : ''}`
      + `<small><em>総合</em><b class="e5-dg">${rank}</b>位<i>/${H.length}頭</i></small></span>`;
    return `<div class="e5s"><div class="e5s-cols">${cols}</div>`
      + `<div class="e5s-r"><div class="e5s-big"><b class="e5-dg">${Math.round(tot)}</b><small>点</small></div>${rk}</div></div>`;
  }
  function coursePage(h) {
    e5Load();
    const rows = e5Rows(h);
    const avg = e5Avg();
    // 見出しと凡例はカードの一番下の注釈（2026-09-24 ユーザー「一番下が良い。注釈みたいな感じで」）
    const note = avg == null ? '' : '<div class="e5-note"><span>数字はこのコースの複勝率</span>'
      + `<span><i class="e5-kx"></i>真ん中の線＝コース全体 <b class="e5-dg">${avg.toFixed(1)}</b>%</span></div>`;
    return `<div class="race20 rvC c3 mx hd-r3 b-page e5-page">
      <div class="h-card e5-card">${e5Score(h)}${e5Podium(rows)}${rows.map(e5Row).join('')}${note}</div></div>`;
  }

  function pageHtml(h, pg) {
    if (pg.k === 'p1') return basicPage(h);
    if (pg.k === 'course') return coursePage(h);
    if (pg.k === 'sum') return summaryPage(h);
    if (pg.k === 'all') return allPage(h, pg.from, pg.to);
    if (pg.k === 'tenkai') return tenkaiPage(h);
    return runPage(h, pg.i);
  }

  // ---------- 過去走ページ（2026-09-17 作り直し・検討中） ----------
  // 見る順番（ユーザー）：着順・着差 → 間隔 → コーナーごとの位置 → 斤量 → 馬場。
  // 今回との差は前走のページにだけ添える。残りの10項目は全部出し、説明する相手の横に小さく添える（下の runPage）。
  const toDate = (s) => (s ? new Date(String(s).replace(/\//g, '-') + 'T00:00:00') : null);
  const days = (a, b) => (a && b ? Math.round((a - b) / 86400000) : null);
  // 間隔は「約N週」だけで出す（2026-09-17 ユーザー決定）。週は日数÷7の四捨五入
  // 「約」は付けない（2026-09-17 ユーザー指示）
  const wk = (d) => (d == null ? '—' : `${Math.max(1, Math.round(d / 7))}週`);

  // cls：線と点の色（脚質の色 st-*。2026-09-17）
  function posFigure(r, field, cls) {
    const cs = String(r.corners || '').split('-').map(Number).filter((x) => x > 0);
    const fin = Number(r.finish);
    if (!cs.length || !field) return '<div class="yf-posnone">コーナーの記録なし</div>';
    const pts = cs.map((v, i) => ({ v, lab: `${i + 1 + (4 - cs.length)}角` }));
    if (fin > 0) pts.push({ v: fin, lab: '着', fin: true });
    const W = 300, H = 74, L = 34, R = 14, T = 17, B = 17;
    const x = (i) => L + (pts.length === 1 ? 0 : (i * (W - L - R)) / (pts.length - 1));
    const y = (v) => T + ((Math.min(v, field) - 1) / Math.max(field - 1, 1)) * (H - T - B);
    const line = pts.filter((q) => !q.fin).map((q, i) => `${x(i)},${y(q.v)}`).join(' ');
    const last = pts.length - 1;
    const finSeg = pts[last].fin && last > 0
      ? `<line x1="${x(last - 1)}" y1="${y(pts[last - 1].v)}" x2="${x(last)}" y2="${y(pts[last].v)}" class="fl"/>` : '';
    const dots = pts.map((q, i) => `<circle cx="${x(i)}" cy="${y(q.v)}" r="${q.fin ? 5 : 4}" class="${q.fin ? 'fd' : 'd'}"/>
      <text x="${x(i)}" y="${y(q.v) - 8}" class="v">${q.v}</text>
      <text x="${x(i)}" y="${H - 5}" class="c">${q.lab}</text>`).join('');
    return `<svg class="yf-pos ${cls || ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="コーナーごとの位置 ${esc(r.corners)}（${field}頭立て）">
      <line x1="${L}" y1="${T}" x2="${W - R}" y2="${T}" class="g"/>
      <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" class="g"/>
      <text x="${L - 6}" y="${T + 4}" class="ax">先頭</text>
      <text x="${L - 6}" y="${H - B + 4}" class="ax">最後方</text>
      <polyline points="${line}" class="ln"/>${finSeg}${dots}
    </svg>`;
  }


  // ---------- 今回と同じ条件で好走していた札に色（2026-09-17 ユーザー決定・案C＋2行目の線） ----------
  // 条件は 間隔・斤量・馬場・騎手 の4つ。馬ごとに「今回と同じ条件の過去走」を数え、
  //   同じ条件で2走以上 かつ 3着内1回以上 かつ その条件の3着内率 ≥ 全戦績の3着内率
  // を満たした条件だけ、その条件で3着内だった走の札に色を付ける。
  // 過去走は past_runs と career_runs を race_id で合わせ、今回のレース日より前だけ使う。
  // 線の根拠：公開済み392レース・17,712組で、色あり今回3着内27.6%／同じ強さの色なし23.1%（+4.5pt）。
  const nj = (x) => String(x || '').normalize('NFKC').replace(/[\s.．・]/g, '');
  // 馬場状態の書き方をそろえる（2026-09-21）。今回のレースは「稍重」「不良」で入るのに、
  // 過去走は「稍」「不」の1文字で入っている。そのまま比べていたので、稍重と不良の日は
  // どの馬も「今回と同じ条件で0走」になっていた（良と重はたまたま同じ字なので合っていた）。
  const ng = (g) => ({ '稍重': '稍', '不良': '不' }[g] || g || '');
  const gapBand = (dd) => (dd == null ? null : dd / 7 <= 2.5 ? 0 : dd / 7 <= 5.5 ? 1 : dd / 7 <= 9.5 ? 2 : 3);
  const finN = (x) => { const v = parseInt(x, 10); return Number.isFinite(v) ? v : null; };
  const COND = {};
  function condOf(h) {
    if (COND[h.number]) return COND[h.number];
    const rd = toDate((site.race || {}).date);
    const map = {};
    [...(h.career_runs || []), ...(h.past_runs || [])].forEach((x) => { if (x.race_id && x.date) map[x.race_id] = x; });
    const runs = Object.values(map).filter((x) => toDate(x.date) < rd && finN(x.finish) != null)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const gapOf = {};
    runs.forEach((x, i) => { gapOf[x.race_id] = runs[i + 1] ? days(toDate(x.date), toDate(runs[i + 1].date)) : null; });
    const today = {
      gap: runs[0] ? gapBand(days(rd, toDate(runs[0].date))) : null,
      weight: h.weight_carried != null ? Number(h.weight_carried) : null,
      going: ng((site.race || {}).going) || null,
      jockey: nj(h.jockey),
    };
    const same = {
      gap: (x) => gapOf[x.race_id] != null && gapBand(gapOf[x.race_id]) === today.gap,
      weight: (x) => today.weight != null && Number(x.weight) === today.weight,
      going: (x) => today.going != null && ng(x.condition) === today.going,
      jockey: (x) => today.jockey && nj(x.jockey) === today.jockey,
    };
    const tot = runs.length;
    const top = runs.filter((x) => finN(x.finish) <= 3).length;
    const out = { same, lit: {}, stat: {} };
    for (const k of Object.keys(same)) {
      const xs = runs.filter(same[k]);
      const t = xs.filter((x) => finN(x.finish) <= 3).length;
      out.stat[k] = `今回と同じ条件で${xs.length}走・3着内${t}回（全戦績 ${tot}走・3着内${top}回）`;
      out.lit[k] = tot >= 2 && xs.length >= 2 && t >= 1 && t / xs.length >= top / tot;
    }
    // 過去走ページの走の間隔は、合わせた一覧の上での間隔で判定する
    out.gapOf = gapOf;
    out.runs = runs;
    out.today = today;
    return (COND[h.number] = out);
  }
  // この走のこの札に色を付けるか
  function hitOf(h, r, k) {
    const c = condOf(h);
    return c.lit[k] && finN(r.finish) != null && finN(r.finish) <= 3 && c.same[k](r);
  }


  // ---------- クラスの札（本番 race.js の shutubaRaceClass / CLASS_CSS と同じ分け方・同じ色） ----------
  const CLASS_CSS = {
    '新馬': 'c-shin', '未勝利': 'c-mi', '1勝': 'c-w1', '2勝': 'c-w2', '3勝': 'c-w3',
    'OP': 'c-op', 'L': 'c-l', 'G3': 'c-g3', 'G2': 'c-g2', 'G1': 'c-g1',
    'Jpn1': 'c-jpn1', 'Jpn2': 'c-jpn2', 'Jpn3': 'c-jpn3', '重賞': 'c-jusho',
  };
  function raceClass(grade, name) {
    const g = String(grade || '').trim();
    const n = String(name || '');
    if (g === 'JpnI') return 'Jpn1';
    if (g === 'JpnII') return 'Jpn2';
    if (g === 'JpnIII') return 'Jpn3';
    if (g === '重賞') return '重賞';
    if (g === 'GI' || g === 'G1' || n.includes('(GI)')) return 'G1';
    if (g === 'GII' || g === 'G2' || n.includes('(GII)')) return 'G2';
    if (g === 'GIII' || g === 'G3' || n.includes('(GIII)')) return 'G3';
    if (g === 'L' || n.includes('(L)')) return 'L';
    if (g === 'OP' || n.includes('(OP)') || n.includes('オープン')) return 'OP';
    for (const k of ['3勝', '2勝', '1勝']) if (g === k || n.includes(`${k}クラス`)) return k;
    if (n.includes('未勝利')) return '未勝利';
    if (n.includes('新馬')) return '新馬';
    return g;
  }
  // 中央の10場。これ以外で走った走は、中央のクラス分けが当てはまらないので「地方」の札にする
  const JRA_TRACKS = ['札幌', '函館', '福島', '新潟', '東京', '中山', '中京', '京都', '阪神', '小倉'];
  const clsBadge = (c) => (c ? `<span class="cb ${CLASS_CSS[c] || ''}">${esc(c)}</span>` : '');
  const stripClass = (name) => String(name || '').replace(/\((?:GI|GII|GIII|JpnI|JpnII|JpnIII|L|OP|[123]勝クラス|重賞)\)\s*$/, '').trim();
  // 最高成績「未勝利1着」「1勝クラス2着」「G3 6着」「L4着」を、クラスと着順に分ける
  function bestParts(b) {
    const m = String(b || '').match(/^(新馬|未勝利|[123]勝(?:クラス)?|OP|L|G[123]|Jpn[123]|重賞)\s*(\d+)着$/);
    if (!m) return null;
    return { cls: m[1].replace('クラス', ''), fin: Number(m[2]) };
  }

  // 騎手名は1行に収める。4枚並びの札は幅が狭いので、長い名前ほど字を小さくする（7字＝ハマーハンセン が 10px で収まる）
  const jkFs = (name) => { const n = [...String(name || '')].length; return n <= 4 ? 15 : n <= 5 ? 13 : n <= 6 ? 11.5 : 10; };

  // ---------- 1ページ目（基本）を過去走ページと同じ札の形に（2026-09-17 ユーザー指示） ----------
  // 中身は本番の馬名ポップアップと同じ：見出し（AIの印・馬番・馬名・性齢・斤量・騎手・オッズ・人気）、通算成績、地雷／穴の理由、
  // コース適性（h.course_record）、レースの型べつ成績（h.race_type_record ＋ 今日の見立て site.prediction.scenario）。
  // 通算成績とコース適性の着別度数は、1着・2着・3着を金銀銅に塗らない（2026-09-21 ユーザー指示）。
  //   0 の所だけ薄くして、走っていない条件が一目で分かるようにする
  const recHtml = (c) => `<span class="rec">${(c || [0, 0, 0, 0]).map((v) => `<b class="${v ? '' : 'zr'}">${v}</b>`).join('<i>-</i>')}</span>`;
  const top3Pct = (c) => { const n = c.reduce((a, b) => a + b, 0); return n ? Math.round(((c[0] + c[1] + c[2]) / n) * 100) : null; };
  // コース適性のカード（好走率の版）。**中身は race.js の aptCardHtml が正本。**
  //   2つに書き分けると決まりの数字がズレるので、ここでは呼ぶだけにする（2026-09-24）。
  const aptCard = (h) => (window.AptCard ? window.AptCard(h, site.race) : '');

  function basicPage(h) {
    const P0 = P(h.number);
    const race = site.race || {};
    const nlen = [...String(h.name || '')].length;
    const nfs = nlen <= 6 ? 22 : nlen <= 8 ? 19 : 17;
    // 通算の着順（1着-2着-3着-着外）は戦績のデータから直接数える（race.js の careerLine と同じ数え方）。
    //   前は馬名の札の「通算N戦 1-1-1-7」の文字から取り出していたが、その行から「通算N戦」を外した
    //   （2026-09-24）ら読めなくなり、全頭「—」になった。文字を読む作りはやめる
    const allRuns = (h.past_runs || []).concat(h.career_runs || []);
    const car = allRuns.length ? allRuns.reduce((c, r) => {
      const f = parseInt(r.finish, 10);
      c[(f >= 1 && f <= 3) ? f - 1 : 3] += 1;
      return c;
    }, [0, 0, 0, 0]) : null;
    const kg = h.weight_carried != null ? String(h.weight_carried).replace(/\.0$/, '') : '—';
    const hdr = `<div class="h-card b-hd">
      <div class="b-hd1">${umaBox(h.number, h.gate)}<b class="b-nm" style="font-size:${nfs}px">${esc(h.name)}</b>${P0.badge}</div>
      <div class="b-hd2"><span>${esc(h.sex_age || '')}</span><span class="bt-num">${esc(kg)}kg</span><span>${esc(h.jockey || '')}</span></div>
      <div class="b-hd3">
        <div class="b-od"><i>オッズ</i><b class="bt-num">${h.odds != null ? h.odds.toFixed(1) : '—'}<small>倍</small></b></div>
        <div class="b-od"><i>人気</i><b class="bt-num">${esc(h.popularity ?? '—')}<small>番</small></b></div>
        ${'' /* 「通算N戦」と「3着内N%」は出さない。着順の数字（1-1-1-7）だけ残す（2026-09-24 ユーザー指示） */}
        <div class="b-car">${car ? recHtml(car) : '—'}</div>
      </div>
      ${P0.why ? `<div class="b-why">${P0.why}</div>` : ''}
    </div>`;
    // コース適性：今回の競馬場の行は見出しを強め、足切りを通った今日の行（本番の aptPass）は緑
    const cr = h.course_record || {};
    const today = (cr.rows || [])[2];
    const aptOk = today && today.counts && (today.counts[0] + today.counts[1] + today.counts[2]) >= 1 && today.counts.reduce((a, b) => a + b, 0) >= 2;
    // 回りは今回のコースの回りの行だけ出す（2026-09-17 ユーザー指示）。回りが分からない（直線など）レースでは両方とも出さない
    const dirLab = race.direction === '右' ? '右回り' : race.direction === '左' ? '左回り' : null;
    // 重・不良の行は、今回の馬場が重か不良のときだけ出す（同日ユーザー指示）
    const heavyNow = ['重', '不良'].includes(race.going);
    // 今回と同じ条件の行（今回の場／今回の場×距離／全場の今回の距離／今回の回り）に、新聞と同じ帯（126-spec §3 条件A）を付ける
    const distLab = `全場${race.surface || ''}${race.distance || ''}m`;
    const isToday = (r, i) => i === 1 || i === 2 || r.label === distLab || r.label === dirLab;
    const bandA = (c) => (c[0] + c[1] + c[2]) >= 1 && c.reduce((a, b) => a + b, 0) >= 2;
    const crRows = (cr.rows || []).map((r, i) => {
      if (/^[右左]回り$/.test(r.label) && r.label !== dirLab) return '';
      if (/^重不/.test(r.label) && !heavyNow) return '';
      const n = r.counts.reduce((a, b) => a + b, 0);
      const pct = top3Pct(r.counts);
      const here = race.track && String(r.label).includes(race.track);
      // 母数の大きい「全場の今回の距離」「今回の回り」の2行は、3着内率が通算の3着内率以上のときだけ帯（同日ユーザー指示）
      const wide = r.label === distLab || r.label === dirLab;
      const carPct = car ? top3Pct(car) : null;
      const band = isToday(r, i) && bandA(r.counts) && (!wide || (carPct != null && pct != null && pct >= carPct));
      return `<div class="b-cr${n ? '' : ' zero'}${here ? ' here' : ''}${band ? ' band' : ''}">
        <span class="b-crl">${esc(r.label)}</span>${recHtml(r.counts)}
        <span class="b-bar"><i style="width:${pct ?? 0}%"></i></span><span class="b-crp bt-num">${pct == null ? '' : `${pct}%`}</span></div>`;
    }).join('');
    // 好走率の版（2026-09-24 決定）。publish が apt を載せていないレースだけ、下の着別度数の表に落ちる
    const crCard = aptCard(h) || `<div class="h-card b-crd"><div class="h-top"><span class="h-t">コース適性</span><span class="h-r">中央のみ・全走　右は3着内率</span></div>${crRows ||
      '<div class="b-none">記録なし</div>'}</div>`;
    // レースの型べつ成績のカード。**中身は race.js の raceTypeCardHtml が正本**（馬名の札と同じ形・2026-09-24）
    const rtCard = window.RtCard ? window.RtCard(h, site) : '';
    return `<div class="race20 rvC c3 mx hd-r3 b-page">${hdr}${crCard}${rtCard}</div>`;
  }


  // ---------- 2ページ目：直近5走のまとめ（2026-09-17） ----------
  // 1走＝1枚の横長の札。左の色の帯＝その走の脚質、着順・タイム・上がりは1〜3位を金銀銅、距離は芝緑・ダート橙。
  // 札を押すと、その走のページへ飛ぶ。
  function miniPos(r, field, cls) {
    const cs = String(r.corners || '').split('-').map(Number).filter((x) => x > 0);
    const fin = Number(r.finish);
    if (!cs.length || !field) return '<span class="sm-nopos">位置の記録なし</span>';
    const pts = cs.concat(fin > 0 ? [fin] : []);
    const W = 96, H = 26, P = 4;
    const x = (i) => P + (pts.length === 1 ? 0 : (i * (W - 2 * P)) / (pts.length - 1));
    const y = (v) => P + ((Math.min(v, field) - 1) / Math.max(field - 1, 1)) * (H - 2 * P);
    const lastIsFin = fin > 0;
    const line = pts.slice(0, lastIsFin ? -1 : undefined).map((v, i) => `${x(i)},${y(v)}`).join(' ');
    const n = pts.length - 1;
    return `<svg class="sm-pos yf-pos ${cls}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      <line x1="${P}" y1="${P}" x2="${W - P}" y2="${P}" class="g"/><line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" class="g"/>
      <polyline points="${line}" class="ln"/>
      ${lastIsFin && n > 0 ? `<line x1="${x(n - 1)}" y1="${y(pts[n - 1])}" x2="${x(n)}" y2="${y(pts[n])}" class="fl"/>` : ''}
      ${pts.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="${lastIsFin && i === n ? 3 : 2.2}" class="${lastIsFin && i === n ? 'fd' : 'd'}"/>`).join('')}
    </svg>`;
  }
  // 休養の見出し（本番 race.js restLabel と同じ言い方）
  const restLabel = (days) => {
    const months = days / 30.4; const n = Math.trunc(months); const half = (months - n) >= 0.5 ? '半' : '';
    if (n >= 12) return `${Math.floor(n / 12)}年${(n % 12) >= 6 ? '半' : ''}休養`;
    return `${Math.max(n, 1)}ヵ月${half}休養`;
  };
  // 2ページ目：直近5走のまとめ。本番の戦績の札（.vrun）に出ている項目をできるだけ入れる（2026-09-17 ユーザー指示）
  //   着順・着差・勝ち馬と最高成績・Lv／日付・場・クラス・レース名・距離と馬場／時計・通過順・上がり・展開／
  //   騎手・斤量・馬体重・枠番と馬番・頭数・人気／メモ（出遅れ など）／90日以上空いた所に休養の帯
  //   左の色の枠線は外した（同日ユーザー指示）
  const rnFs = (n) => { const k = [...n].length; return k <= 7 ? 12 : k <= 8 ? 11 : 9.5; };
  function summaryRun(h, r, i) {
    const race = site.race || {};
    const field = Number(r.field_size || r.runners) || null;
    const fin = Number(r.finish);
    const mg = marginSec(r.margin);
    const c1 = Number(String(r.corners || '').split('-')[0]) || null;
    const st = !c1 || !field ? null : c1 === 1 ? '逃げ' : c1 / field <= 0.33 ? '先行' : c1 / field <= 0.66 ? '差し' : '追込';
    const closeTh = { '芝': 0.4, 'ダート': 0.6 }[r.surface] ?? 0.5;
    const hitLab = { gap: '間隔', weight: '斤量', going: '馬場', jockey: '騎手' };
    const bp = bestParts(r.winner_best);
    const md = (v) => (v === 1 ? 'md1' : v === 2 ? 'md2' : v === 3 ? 'md3' : '');
    const cls = raceClass(r.grade, r.race_name);
    // 「4歳以上2勝クラス」はクラスの札と重なるので年齢だけ残す。長い名前は字を小さくして切れないようにする
    const rn = String(stripClass(r.race_name) || '').replace(/^(\d歳(?:以上)?)(?:未勝利|新馬|[123]勝クラス)$/, '$1').replace(/^JRA交流/, '').replace(/\(\d歳(?:以上)?\)$/, '');
    return {
      i, raw: r, label: RUN_LABEL[i], fin, finTxt: r.finish ?? '—', finMd: md(fin),
      date: String(r.date || '').slice(2).replace(/\//g, '.'), track: r.track || '',
      clsHtml: cls ? clsBadge(cls) : (JRA_TRACKS.includes(r.track) ? '' : '<span class="cb c-jusho">地方</span>'),
      rn, rnFs: rnFs(rn),
      sf: String(r.surface || '').startsWith('ダ') ? 'sf-dt' : String(r.surface || '').startsWith('芝') ? 'sf-tf' : '',
      sfTxt: r.surface ? r.surface.slice(0, 1) : '', dist: r.distance || '', going: r.condition || '',
      mg, mgTxt: mg == null ? '—' : `${mg < 0 ? '−' : mg > 0 ? '+' : ''}${Math.abs(mg).toFixed(1)}`,
      mgPlain: mg == null ? '—' : `${mg < 0 ? '−' : ''}${Math.abs(mg).toFixed(1)}`,
      band: fin === 1 ? 'win' : (mg != null && Math.abs(mg) <= closeTh ? 'close' : ''),
      winLab: fin === 1 ? '2着' : '勝ち', winner: r.winner || '—',
      bpHtml: bp ? `<span class="sm-bp">${clsBadge(bp.cls)}<b class="${md(bp.fin)}">${bp.fin}着</b></span>` : '',
      lv: r.level_grade ? `<span class="lv lv-${esc(String(r.level_grade).toLowerCase())}"><i>Lv</i>${esc(r.level_grade)}</span>` : '',
      time: r.time || '—', tg: { f1: 'md1', f2: 'md2', f3: 'md3' }[r.time_grade] || '',
      corners: String(r.corners || '').split('-').filter(Boolean),
      up: r.last_3f || '—', rk: r.last3f_rank != null ? Number(r.last3f_rank) : null,
      rkMd: r.last3f_rank != null ? md(Number(r.last3f_rank)) : '',
      st, stc: { '逃げ': 'st-nige', '先行': 'st-sen', '差し': 'st-sashi', '追込': 'st-oi' }[st] || 'st-none',
      sc: r.scenario || '', jockey: r.jockey || '', jkLong: [...String(r.jockey || '')].length >= 6,
      weight: r.weight || '—', bw: r.body_weight || '—', waku: r.waku ?? '—', umaban: r.umaban ?? '—',
      field: field ?? '—', pop: r.popularity ?? '—',
      notes: (r.note_labels || []).slice(0, 2),
      hits: ['gap', 'weight', 'going', 'jockey'].filter((k) => hitOf(h, r, k)).map((k) => hitLab[k]),
      race,
    };
  }
  const smCorners = (d) => d.corners.map((c) => `<i class="bt-num">${esc(c)}</i>`).join('');
  const smStyle = (d) => (d.st ? `<b class="sm-st ft3-style ${d.stc}">${d.st}</b>` : '');
  const smFoot = (d, cls) => (d.notes.length || d.hits.length
    ? `<div class="${cls}">${d.notes.map((n) => `<em>${esc(n)}</em>`).join('')}${d.hits.length ? `<b class="sm-hit">同条件で好走：${d.hits.join('・')}</b>` : ''}</div>` : '');
  // 1走＝強弱の3段の札（2026-09-17 決定・S1）：強＝着順・着差・レース名／中＝勝ち馬・時計・上がり・通過／弱＝騎手や斤量などは灰色の1行
  //   1段5行の形（S0）・列そろえ（S2）・ウィジェット（S3）と、色の案 C1〜C3 は選ばなかった
  //   地の色：1着＝金、僅差の負け＝銀の地＋銀の枠（sm-page の bc-b4。2026-09-17 決定）
  // 過去走ページ（3〜7ページ目）の僅差も銀の地＋銀の枠にそろえる（html の rc-frame。2026-09-17 決定）
  document.documentElement.classList.add('rc-frame');
  // 1走＝1枚の札（2026-09-24 作り直し・試作 mockup-210〜214 の A）。過去走のページと同じ決まりにそろえた：
  //   文字の見出しは紺一色の小さな絵、1〜3着・時計の優秀度・上がり1〜3位は金銀銅の杯、赤は使わない。
  //   各段は決まった幅の列に置き、5枚の札で縦の位置がそろう（ユーザー「各段を上下と合うように整列させてほしい」）
  //   ①日付｜場｜距離（芝・ダートの札）｜馬場｜馬番（枠の色の四角）｜頭数 ②クラス・レース名・Lv ③勝ち馬・最高成績・脚質の札
  //   ④タイム｜上がり｜通過順 ⑤騎手｜斤量｜馬体重｜展開（灰の札のペース＋王冠つきの前・差）⑥メモの札と同条件で好走（同じ大きさで左から）
  //   左の列：着順（杯）・着差の札・人気。上がりの順位の文字と前半の通過タイムは出さない（ユーザー指示）
  const smIc = (k) => `<i class="sv-ic">${R_ICON[k]}</i>`;
  const SM_CROWN = '<svg viewBox="0 0 20 16" class="sx-crown"><path d="M2 12 L3.5 4 L7.5 8 L10 2.5 L12.5 8 L16.5 4 L18 12 Z" fill="#E0A800"/><rect x="2" y="12.6" width="16" height="2.6" rx="1" fill="#E0A800"/></svg>';
  function smCardA(d) {
    const r = d.raw;
    const bg = d.band ? `bd-${d.band}` : '';
    const ub = Number(r.umaban), wk = Number(r.waku);
    const fin = `<div class="s1-l sv-l"><i>${d.label}</i>${d.fin >= 1 && d.fin <= 3 ? e5Cup(d.fin, 20) : ''}<b class="bt-num ${d.finMd}">${esc(d.finTxt)}<small>着</small></b>
      <span class="sv-mg bt-num ${d.band}">${d.mgPlain}<small>秒</small></span>
      <span class="sv-pop">${smIc('pop')}<b class="bt-num">${esc(d.pop)}</b>人気</span></div>`;
    const meta = `<div class="sva-meta"><span class="bt-num">${esc(d.date)}</span><span>${esc(d.track)}</span>
      <b class="sva-sf ${d.sf}">${esc(d.sfTxt)}<b class="bt-num">${esc(d.dist)}</b></b><span>${esc(d.going)}</span>
      ${ub ? `<span class="sw1">${umaBox(ub, wk, 'sm')}<small>番</small></span>` : '<span></span>'}
      <span class="sv-fp">${smIc('field')}<b class="bt-num">${d.field}</b>頭</span></div>`;
    const title = `<div class="s1-title">${d.clsHtml}<b style="font-size:${d.rnFs + 2}px">${esc(d.rn)}</b><span class="s1-sp"></span>${d.lv}</div>`;
    const win = `<div class="s1-win sva-win"><i>${d.winLab}</i><span>${esc(d.winner)}</span>${d.bpHtml}<span class="s1-sp"></span>${smStyle(d)}</div>`;
    const tm = `<span class="sv-tm">${d.tg ? e5Cup({ md1: 1, md2: 2, md3: 3 }[d.tg], 15) : smIc('time')}<b class="bt-num ${d.tg}">${esc(d.time)}</b></span>`;
    const up = `<span class="sv-up">${smIc('up')}<b class="bt-num ${d.rkMd}">${esc(d.up)}</b>${d.rk != null && d.rk <= 3 ? e5Cup(d.rk, 13) : ''}</span>`;
    const perf = `<div class="sva-perf">${tm}${up}<span class="sm-cn">${smCorners(d)}</span></div>`;
    // 展開：ペースは灰の札、決着は王冠つきの「前」か「差」（過去走のページの決着と同じ印）。「後」＝差し・追込で決まったレース
    const [scP, scS] = String(d.sc || '').split('・');
    const sc = d.sc ? `<span class="sx"><b class="sx-p">${esc(scP)}</b>${SM_CROWN}<b class="sx-s">${scS === '前' ? '前' : '差'}</b></span>` : '<span></span>';
    const cond = `<div class="sva-cond"><span>${smIc('jockey')}<b class="sv-jk">${esc(d.jockey)}</b></span><span>${smIc('kg')}<b class="bt-num">${esc(d.weight)}</b><small>kg</small></span>
      <span>${smIc('bw')}<b class="bt-num">${esc(d.bw)}</b><small>kg</small></span>${sc}</div>`;
    return `<div class="s1-card sv sva ${bg}">${fin}<div class="s1-m">${meta}${title}${win}${perf}${cond}${smFoot(d, 's1-foot')}</div></div>`;
  }

  function smCard1(d) {
    const bg = d.band ? `bd-${d.band}` : '';
    const upTag = d.rk != null ? `<small>${d.rk}位</small>` : '';
    // 2026-09-21：札を押してもその走のページへは飛ばさない（ユーザー指示）。その走を見るのはページ送りで
    return `<div class="s1-card ${bg}">
      <div class="s1-l"><i>${d.label}</i><b class="bt-num ${d.finMd}">${esc(d.finTxt)}<small>着</small></b>
        <span class="s1-mg bt-num">${d.mgTxt}</span></div>
      <div class="s1-m">
        <div class="s1-meta"><span class="bt-num">${esc(d.date)}</span><span>${esc(d.track)}</span>
          <b class="bt-num ${d.sf}">${esc(d.sfTxt)}${esc(d.dist)}</b><span>${esc(d.going)}</span>
          <span class="s1-sp"></span><span class="bt-num">${d.field}頭 ${esc(d.pop)}人気</span></div>
        <div class="s1-title">${d.clsHtml}<b style="font-size:${d.rnFs + 2}px">${esc(d.rn)}</b><span class="s1-sp"></span>${d.lv}</div>
        <div class="s1-win"><i>${d.winLab}</i><span>${esc(d.winner)}</span>${d.bpHtml}</div>
        <div class="s1-perf"><b class="bt-num s1-tm ${d.tg}">${esc(d.time)}</b>
          <span class="s1-up"><i>上がり</i><b class="bt-num ${d.rkMd}">${esc(d.up)}</b>${upTag}</span>
          <span class="sm-cn">${smCorners(d)}</span>${smStyle(d)}</div>
        <div class="s1-sub"><span class="s1-jk">${esc(d.jockey)}</span><span class="bt-num">${esc(d.weight)}kg</span>
          <span class="bt-num">${esc(d.bw)}kg</span><span class="bt-num">${esc(d.waku)}枠${esc(d.umaban)}番</span>
          <span class="s1-sc">${esc(d.sc)}</span></div>
        ${smFoot(d, 's1-foot')}
      </div></div>`;
  }

  // 2ページ目：直近5走のまとめ。本番の戦績の札（.vrun）に出ている項目をできるだけ入れる（2026-09-17 ユーザー指示）
  //   90日以上空いた所に休養の帯。左の色の枠線は外した（同日ユーザー指示）
  function summaryPage(h) {
    const runs = (h.past_runs || []).slice(0, 5);
    const race = site.race || {};
    const gapOf = condOf(h).gapOf;
    const restRow = (dd) => `<div class="sm-rest">${restLabel(dd)}（${dd}日）</div>`;
    const out = [];
    const nowGap = runs[0] ? days(toDate(race.date), toDate(runs[0].date)) : null;
    if (nowGap != null && nowGap >= 90) out.push(restRow(nowGap));
    runs.forEach((r, i) => {
      out.push(smCardA(summaryRun(h, r, i)));   // 2026-09-24 から smCardA（前の形 smCard1 は残してある）
      const g = gapOf[r.race_id];
      if (i < runs.length - 1 && g != null && g >= 90) out.push(restRow(g));
    });
    return `<div class="race20 rvC c3 mx hd-r3 sm-page sm-s1 bc-b4">${out.join('')}</div>`;
  }
  // 展開のページ（2026-09-17 ユーザー指示）。本番の出馬表「展開」（race.js renderOverview20 の出力）をそのまま使い、
  //   （出馬表の裏に描かれた .tenkaiview の中身を写す）。上の「コースの形」（コース図・距離の帯）だけ外す。残るのは 馬場の1本バー／今週の馬場／このコースの枠順成績／脚質と展開（ペース2行つき）。
  //   中身はレースで共通なので、どの馬でも同じ。その馬の馬番だけ脚質の区画で目立たせる。
  //   長いので、全戦績と同じく札の中を縦に動かして見る。枠や馬番を押して開く本番の札は、この画面では開かない
  // その馬の目立たせ方は、脚質の区画ごと明るくし、ほかの馬番を灰色にする（2026-09-17 決定・H3。黒い輪 H0・薄くする H1・一文 H2 は選ばなかった）
  let tenkaiCache = null;
  function tenkaiPage(h) {
    if (tenkaiCache == null) {
      const tmp = document.createElement('div');
      // race.js の関数は外から呼べないので、出馬表の裏に描かれている「展開」の面（.tenkaiview）の中身を写す
      const src = document.querySelector('.race20 .tenkaiview');
      tmp.innerHTML = src ? src.innerHTML : '<p>展開の面が見つかりませんでした</p>';
      tmp.querySelectorAll('.secthead').forEach((e) => e.remove());
      const bar = tmp.querySelector('.cbbar:not(.wk)');
      if (bar) { while (bar.previousSibling) bar.previousSibling.remove(); }
      tmp.querySelectorAll('[data-pop]').forEach((e) => { e.dataset.yfnum = e.dataset.pop; e.removeAttribute('data-pop'); });
      tenkaiCache = tmp.innerHTML;
    }
    const wrap = document.createElement('div');
    wrap.innerHTML = tenkaiCache;
    wrap.querySelectorAll(`.pz[data-yfnum="${h.number}"]`).forEach((e) => {   // 脚質の区画の馬番だけ（枠の札は枠ごとなので付けない）
      e.classList.add('yf-me');
      const z = e.closest('.lz'); if (z) z.classList.add('yf-mez');
    });
    return tkMap(h, tkParse(wrap));   // 2026-09-24 から上から見たレースの図（tkMap）。前の形（tkDesign）は同日に消した
  }

  // ---------- 展開のページ：数字は本番の展開の面から読み取り、並べ方と見た目だけ変える ----------
  const G_COLOR = { S: '#0B5E2E', A: '#1F6B3A', B: '#4E5862', C: '#8E4A36', D: '#A32B1F' };
  function tkParse(root) {
    const T = (el, sel) => (el && el.querySelector(sel) ? el.querySelector(sel).textContent.trim() : '');
    const bars = [...root.querySelectorAll('.cbbar')];
    const top = bars.find((b) => !b.classList.contains('wk'));
    const wk = bars.find((b) => b.classList.contains('wk'));
    const cell = (bar, k) => (bar ? [...bar.querySelectorAll('.cell')].find((c) => T(c, '.k') === k) : null);
    const wd = (c) => (c && c.querySelector('.bar .L') ? parseFloat(c.querySelector('.bar .L').style.width) : 50);
    const tick = (c) => (c && c.querySelector('.bar u') && c.querySelector('.bar u').style.left ? parseFloat(c.querySelector('.bar u').style.left) : 50);
    const wcls = (c) => (c && c.querySelector('.w') ? [...c.querySelector('.w').classList].find((x) => x !== 'w' && x !== 'aim') || '' : '');
    const c1 = cell(top, '枠の有利'), c2 = cell(top, '高低差'), c3 = cell(top, '今日の馬場'), c4 = cell(top, '勝ちタイム');
    const w1 = cell(wk, '内と外の3着内率'), w2 = cell(wk, '前と後ろ'), w3 = cell(wk, '時計');
    const lv = c3 && c3.querySelector('.lv');
    return {
      tilt: c1 && { L: wd(c1), word: T(c1, '.w'), cls: wcls(c1) },
      rise: c2 && { v: T(c2, '.v').replace('m', ''), word: T(c2, '.w') },
      baba: c3 && { rail: T(c3, '.rl'), label: lv ? lv.textContent.trim() : '', cls: lv ? [...lv.classList].find((x) => x !== 'lv') : '', aim: T(c3, '.w') },
      time: c4 && { v: T(c4, '.v').replace('秒', ''), word: T(c4, '.w'), cls: [...c4.classList].find((x) => x !== 'cell') || '' },
      wkScope: T(root, '.wkhead .sc'),
      io: w1 && { L: wd(w1), tick: tick(w1), word: T(w1, '.w'), cls: wcls(w1), n: T(w1, '.n') },
      fb: w2 && { L: wd(w2), tick: tick(w2), word: T(w2, '.w'), cls: wcls(w2), n: T(w2, '.n') },
      clock: w3 && { v: T(w3, '.v').replace('秒', ''), word: T(w3, '.w'), n: T(w3, '.n'), fast: w3.classList.contains('p1') },
      gateScope: T(root, '.subh .scope'),
      gates: [...root.querySelectorAll('.gz')].map((g) => ({ hn: g.querySelector('.hn').outerHTML, grade: T(g, '.g') })),
      zones: [...root.querySelectorAll('.lz')].map((z) => ({
        style: z.querySelector('.lb') ? z.querySelector('.lb').firstChild.textContent.trim() : '',
        count: T(z, '.lb .c'), grade: T(z, '.lgv .g'), rate: T(z, '.lgv .p').replace('複勝 ', ''),
        me: z.classList.contains('yf-mez'),
        chips: [...z.querySelectorAll('.pz')].map((c) => ({
          hn: c.querySelector('.hn').outerHTML, mark: T(c, '.mk'), mcls: (c.querySelector('.mk') || { className: '' }).className,
          nige: c.classList.contains('nige'), me: c.classList.contains('yf-me'),
        })),
      })),
      pace: [...root.querySelectorAll('.prow')].map((r) => ({ nm: T(r, '.nm'), sb: T(r, '.sb'), pt: T(r, '.pt'), pp: Number(T(r, '.pp').replace('%', '')) })),
    };
  }
  const tkG = (g, cls = '') => (g ? `<span class="tk-g ${cls}" style="background:${G_COLOR[g] || '#8E8E93'}">${esc(g)}</span>` : '');

  const LV5 = ['軟らかい', 'やや軟らかい', 'いつも通り', 'やや硬い', '硬い'];
  const LV5D = ['湿っている', 'やや湿っている', 'いつも通り', 'やや乾いている', '乾いている'];
  // 展開のページの形（2026-09-24 作り直し・試作 mockup-181〜188）：上から見たレースの図1枚にまとめる。
  //   地の色＝芝は緑・ダートは明るい砂色。上から ①今日の馬場の帯（しずく・勝ちタイムの時計・この馬場だと）
  //   ②スコアボード（ペース予想／今週の脚質／今週の枠）③隊列の図（左が先頭・上が内・右端に枠ごとの成績）④脚質ごとの成績。
  //   数字はこれまでと同じく本番の展開の面（tkParse）から読む。馬の位置は horses[].predicted_position（0＝先頭〜1＝最後方）と gate。
  //   選ばなかった案：縦・ゲートから／コーナーの絵（183）、3つの丸・図に書き込む（184 pw1/3）、白い札（184 sb=w）など。
  //   決めたこと：しずくは芝もダートも青／時計は速い＝左回りに緑・時計がかかる＝右回りに赤、0.3秒で1周の3分の1（185）
  //   ／この馬場だと＝主語の札＋矢印（186）／スコアボードの絵＝メーター・馬の頭・内外の札（187）／判定＝王冠（188）
  //   ／今回の馬の枠＝黄色／図の上端の白い線と下の説明の帯は外した
  const TK_GREEN = '#0F7A3D', TK_RED = '#C8352C', TK_BLUE = '#2F7FC1';
  const TK_GC = { S: '#0B5E2E', A: '#1F6B3A', B: '#4E5862', C: '#8E4A36', D: '#A32B1F' };
  function tkMap(h, D) {
    const race = site.race || {};
    const isDirt = String(race.surface || '').startsWith('ダ');
    const lvIdx = D.baba ? Math.max(0, (isDirt ? LV5D : LV5).indexOf(D.baba.label)) : 2;
    // 勝ちタイム：p1＝速い／m1＝時計がかかる／それ以外（±0.05秒未満）＝いつも通り。値が無い日は灰色の「—」
    const tFast = !!D.time && D.time.cls === 'p1';
    const tSlow = !!D.time && D.time.cls === 'm1';
    const tv = D.time ? Number(D.time.v) || 0 : 0;
    const timeTxt = !D.time ? '—' : tFast || tSlow ? `${tFast ? '−' : '+'}${esc(D.time.v)}` : '±0.0';
    const tCls = tFast ? 'fast' : tSlow ? 'slow' : '';
    const aim = D.baba && D.baba.aim ? D.baba.aim : '';
    const am = aim.match(/^(.*?)\s*([\d.]+)→([\d.]+)%/);
    const aimLab = am ? am[1] : aim, aFrom = am ? Number(am[2]) : null, aTo = am ? Number(am[3]) : null;
    const up = aTo != null && aTo > aFrom;
    // 通過タイムは「600m通過 約34.5秒」のように区切りの距離がレースで違う（短い距離は600m）。距離も読む
    const t1000 = (r) => { const m = String((r && r.pt) || '').match(/([\d.]+)秒/); return m ? m[1] : ''; };
    const tPoint = (r) => { const m = String((r && r.pt) || '').match(/(\d+)m通過/); return m ? m[1] : '1000'; };
    const PL = D.pace.filter((r) => r.pp > 0);
    const top = PL[0] || null;
    const ioP = D.io ? (D.io.n.match(/内([\d.]+)% 外([\d.]+)%/) || []) : [];
    const fbP = D.fb ? (D.fb.n.match(/前(\d+) 後ろ(\d+)/) || []) : [];
    const fN = Number(fbP[1] || 0), rN = Number(fbP[2] || 0), fTot = fN + rN;

    // ---------- ①今日の馬場の帯 ----------
    const DROP = 'M35 4 C35 4 10 34 10 48 A25 25 0 0 0 60 48 C60 34 35 4 35 4 Z';
    const wy = (73 - 69 * (0.12 + 0.76 * (4 - lvIdx) / 4)).toFixed(1);   // 湿っている（軟らかい）ほど、しずくの中の水が多い
    const drop = `<svg viewBox="0 0 70 76"><defs><clipPath id="tk-drop"><path d="${DROP}"/></clipPath></defs><path d="${DROP}" fill="#F2F2F6"/>
      <rect x="0" y="${wy}" width="70" height="76" fill="${TK_BLUE}" clip-path="url(#tk-drop)"/><path d="${DROP}" fill="none" stroke="${TK_BLUE}" stroke-width="3"/></svg>`;
    const wCol = tFast ? TK_GREEN : tSlow ? TK_RED : '#8E8E93';
    const wA = tFast || tSlow ? Math.min(Math.abs(tv), 0.3) / 0.3 * (2 * Math.PI / 3) : 0;
    const wx = (35 + 19 * Math.sin((tFast ? -1 : 1) * wA)).toFixed(1), wy2 = (39 - 19 * Math.cos(wA)).toFixed(1);
    const watch = `<svg viewBox="0 0 70 70"><circle cx="35" cy="39" r="25" fill="#fff" stroke="${wCol}" stroke-width="5"/><rect x="29" y="6" width="12" height="7" rx="2" fill="${wCol}"/>
      ${wA ? `<path d="M35 39 L35 20 A19 19 0 0 ${tFast ? 0 : 1} ${wx} ${wy2} Z" fill="${wCol}" opacity=".35"/>` : ''}
      <line x1="35" y1="14" x2="35" y2="19" stroke="#C7C7CC" stroke-width="2"/>
      <line x1="35" y1="39" x2="${wA ? wx : 35}" y2="${wA ? wy2 : 20}" stroke="#333" stroke-width="2.5" stroke-linecap="round"/><circle cx="35" cy="39" r="2.5" fill="#333"/></svg>`;
    const aimCol = up ? TK_GREEN : TK_RED;
    const aimSvg = am ? `<svg viewBox="0 0 70 56">${/^逃げ/.test(aimLab)
        ? '<rect x="4" y="14" width="38" height="26" rx="13" fill="#003E70"/><text x="23" y="32" text-anchor="middle" font-size="13" font-weight="800" fill="#fff">逃げ</text>'
        : '<rect x="8" y="10" width="30" height="30" rx="6" fill="#003E70"/><text x="23" y="31" text-anchor="middle" font-family="Jost,sans-serif" font-size="18" font-weight="600" fill="#fff">1</text><text x="23" y="52" text-anchor="middle" font-size="9" font-weight="700" fill="#6D6D72">人気</text>'}
        ${up ? `<path d="M56 12 L67 28 H60 V42 H52 V28 H45 Z" fill="${aimCol}"/>` : `<path d="M56 42 L67 26 H60 V12 H52 V26 H45 Z" fill="${aimCol}"/>`}</svg>`
      : '<svg viewBox="0 0 70 56"><rect x="15" y="12" width="40" height="30" rx="8" fill="#EDEDF1"/><text x="35" y="33" text-anchor="middle" font-size="16" font-weight="800" fill="#8E8E93">=</text></svg>';
    const sky = `<div class="tk3-sky">
      <div class="tk3-u">${drop}<b>${D.baba ? esc(D.baba.label) : '—'}</b><i>今日の馬場</i></div>
      <div class="tk3-u">${watch}<b class="bt-num ${tCls}">${timeTxt}<small>秒</small></b><i>勝ちタイム</i></div>
      <div class="tk3-u">${aimSvg}<b class="aim${am ? '' : ' flat'}">${esc(aimLab || aim || '—')}</b><i>${am ? `いつも ${aFrom}% → ${aTo}%` : 'この馬場だと'}</i></div></div>`;

    // ---------- ②スコアボード ----------
    const fPct = fTot ? Math.round(fN / fTot * 100) : 0;
    const wkS = esc(String(D.wkScope || '').replace(/（.*/, ''));
    // 判定＝王冠：「前・差」「内・外」の有利な側に金の王冠、偏りなしは「＝」。言葉は下に小さく
    const crown = (w, k) => {
      if (!w) return '';
      const L = k === 'io' ? ['内', '外'] : ['前', '差'];
      const win = { 前が残りやすい: 0, 内枠有利傾向: 0, 差しが決まりやすい: 1, 外枠有利傾向: 1 }[w];
      const hit = win === 0 || win === 1;
      const C = '<path d="M2 12 L3.5 4 L7.5 8 L10 2.5 L12.5 8 L16.5 4 L18 12 Z" fill="#E0A800"/><rect x="2" y="12.6" width="16" height="2.6" rx="1" fill="#E0A800"/>';
      return `<span class="tk3-cr"><svg viewBox="0 0 60 32">${L.map((x, i) => `<g transform="translate(${i * 32} 0)">${win === i ? `<g transform="translate(4 0)">${C}</g>` : ''}
        <text x="14" y="30" text-anchor="middle" font-size="12" font-weight="900" fill="currentColor" opacity="${win === i || !hit ? 1 : 0.4}">${x}</text></g>`).join('')}
        ${hit ? '' : '<text x="30" y="14" text-anchor="middle" font-size="14" font-weight="900" fill="currentColor" opacity=".55">＝</text>'}</svg><small>${esc(w)}</small></span>`;
    };
    const icPace = '<svg viewBox="0 0 28 28"><path d="M4 20 A10 10 0 0 1 24 20" fill="none" stroke="var(--tk-ic)" stroke-width="3"/><line x1="14" y1="20" x2="20" y2="12" stroke="var(--tk-ic)" stroke-width="2.5" stroke-linecap="round"/><circle cx="14" cy="20" r="2.5" fill="var(--tk-ic)"/></svg>';
    const icLegs = '<svg viewBox="0 0 32 32"><path d="M5 26 C5 18 8 12 14 9 L16 4 L19 8 C23 8 27 12 28 16 C28.5 18 27 19.5 25 19 L21 17.5 C19 19 18 22 18 26 Z" fill="var(--tk-ic)"/><circle cx="21.5" cy="12" r="1.3" fill="#fff"/></svg>';
    const icGate = '<svg viewBox="0 0 32 32"><rect x="1" y="7" width="14" height="18" rx="3" fill="var(--tk-ic)"/><text x="8" y="20" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">内</text>'
      + '<rect x="17" y="7" width="14" height="18" rx="3" fill="var(--tk-icf)"/><text x="24" y="20" text-anchor="middle" font-size="11" font-weight="800" fill="var(--tk-ic)">外</text></svg>';
    // 補足は文章をやめて小さな帯にする（2026-09-24 決定・mockup-189 案A）
    const pRest = Math.max(0, 100 - PL.slice(0, 2).reduce((a, r) => a + r.pp, 0));
    const paceMini = top ? `<span class="tk3-mb">${PL.slice(0, 2).map((r, i) => `<i class="p${i}" style="flex:${Math.max(r.pp, 12)}">${r.pp >= 15 ? `${esc(r.nm)}${i ? ` ${r.pp}` : ''}` : ''}</i>`).join('')}${pRest > 2 ? `<i class="px" style="flex:${pRest}"></i>` : ''}</span>` : '';
    const legsMini = `<span class="tk3-mb"><i class="p0" style="flex:${fN || 0.001}">${fN ? `${fN}頭` : ''}</i><i class="p1" style="flex:${rN || 0.001}">${rN ? `${rN}頭` : ''}</i></span>`;
    const gateMini = `<span class="tk3-gm"><small>内</small><span class="in">${[1, 2, 3, 4].map((g) => `<i class="hn wk${g}">${g}</i>`).join('')}</span><span>${[5, 6, 7, 8].map((g) => `<i class="hn wk${g}">${g}</i>`).join('')}</span><small>外</small></span>`;
    // ペースの行の「前が残る○%」（答え合わせで直した値）と、脚質の行の「いつも62%」は、同日に試してから外した（ユーザー指示）。
    //   前残り／差し展開の言い切りは、差し寄りと見立てたレースでも57%で前の馬が勝つので出さない（scenario_calib.json）
    const board = `<div class="tk3-board">
      <div class="tk3-r"><span class="ic">${icPace}</span><div class="n"><b>${top ? esc(top.nm) : '—'}${top ? `<em class="bt-num">${top.pp}%</em>` : ''}</b>${paceMini}</div>
        <div class="x one"><span class="tm"><b class="bt-num">${t1000(top) || '—'}<small>秒</small></b><i>${tPoint(top)}m通過</i></span></div></div>
      ${fTot || D.io ? `<div class="tk3-sep"><span>今週の結果${wkS ? `・${wkS}` : ''}</span></div>` : ''}
      ${fTot ? `<div class="tk3-r"><span class="ic">${icLegs}</span><div class="n"><b>逃げ・先行<em class="bt-num">${fPct}%</em></b>${legsMini}</div>
        <div class="x one">${crown(D.fb && D.fb.word, 'fb')}</div></div>` : ''}
      ${D.io ? `<div class="tk3-r"><span class="ic">${icGate}</span><div class="n"><b>内<em class="bt-num">${ioP[1] || '—'}%</em><span class="vs">外</span><em class="bt-num dim">${ioP[2] || '—'}%</em></b>${gateMini}</div>
        <div class="x one">${crown(D.io.word, 'io')}</div></div>` : ''}</div>`;

    // ---------- ③隊列の図 ----------
    const P = (x, W) => `${(x / W * 100).toFixed(2)}%`;
    const gch = (g) => (g ? `<i class="tk3-g" style="background:${TK_GC[g] || '#8E8E93'}">${esc(g)}</i>` : '');
    const zoneOf = {};
    D.zones.forEach((z, zi) => z.chips.forEach((c) => { const n = parseInt(String(c.hn).replace(/<[^>]+>/g, ''), 10); if (n) zoneOf[n] = zi; }));
    const RS = { 逃: 0, 先: 1, 差: 2, 追: 3 };
    const hs = (site.horses || []).filter((x) => !x.scratched && x.number != null).map((x) => ({
      n: x.number, g: x.gate || 1, p: typeof x.predicted_position === 'number' ? x.predicted_position : 0.5,
      z: zoneOf[x.number] != null ? zoneOf[x.number] : (RS[String(x.running_style || '').charAt(0)] ?? 2),
      mk: x.ability_mark || '', me: x.number === h.number,
    }));
    // 脚質の区画は4等分に固定（本番の脚質の並びとそろえる）。区画の中は、前からどのあたりを走るかの順で左右に散らす
    [0, 1, 2, 3].forEach((zi) => {
      const m = hs.filter((x) => x.z === zi).sort((a, b) => a.p - b.p);
      const lo = m.length ? m[0].p : 0, hi = m.length ? m[m.length - 1].p : 0;
      m.forEach((x) => { const f = hi > lo ? (x.p - lo) / (hi - lo) : 0.5; x.q = (zi + 0.2 + 0.6 * f) / 4; });
    });
    const TOP = 18;   // 上端の馬の印（右上の丸）が図の外に切れないための余白。印の場所を全馬そろえるため（2026-09-24）
    const W = 340, x0 = 20, x1 = 298, LH = 23, MH = LH * 8 + 6 + TOP;
    const X = (q) => x0 + 12 + q * (x1 - x0 - 24), Y = (g) => 3 + TOP + (g - 1) * LH + LH / 2;
    const pts = hs.map((x) => ({ h: x, x: X(x.q), y: Y(x.g) })).sort((a, b) => a.x - b.x || a.y - b.y);
    // 印（◎○▲△）は札の右上の丸（2026-09-24 決定・mockup-191 案A）。印も札の一部として場所を取り、
    //   札や印どうしが重なる馬は後ろへずらす（番号や他の馬と被らないように）。印の場所は全馬同じ右上
    const markOff = (x) => (x.mk ? (x.me ? 16 : 13) : 0);
    const boxes = (pt) => {
      const t = pt.h.me ? 13 : 10, b = [[pt.x - t, pt.y - t, pt.x + t, pt.y + t]], o = markOff(pt.h);
      if (o) b.push([pt.x + o - 7, pt.y - o - 7, pt.x + o + 7, pt.y - o + 7]);
      return b;
    };
    const hit = (A, B) => A.some((a) => B.some((b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]));
    const placed = [];
    pts.forEach((pt) => {
      for (let k = 0; k < 16 && placed.some((o) => hit(boxes(o), boxes(pt))); k += 1) pt.x += 7;
      placed.push(pt);
    });
    const meGate = Number(h.gate) || 0;
    const zx = (zi) => x0 + zi * (x1 - x0) / 4;
    const Z = D.zones.map((z) => ({ nm: z.style, c: z.count, g: z.grade, r: z.rate, me: z.me }));
    // 印の丸は札の外（兄弟）に置く。札の灰色のフィルターが印にかからないように。色はサイトの印の決まり（◎ 紺 → △ 薄い灰青）
    const MKC = { '◎': 'hon', '○': 'tai', '▲': 'tan', '△': 'oku' };
    const tok = (pt) => {
      const x = pt.h, o = markOff(x);
      return `<span class="hn wk${x.g} tk3-tk${x.me ? ' me' : ''}" style="left:${P(pt.x, W)};top:${pt.y}px">${x.n}</span>`
        + (x.mk ? `<b class="tk3-mka k-${MKC[x.mk] || 'oku'}" style="left:calc(${P(pt.x, W)} + ${o}px);top:${pt.y - o}px">${esc(x.mk)}</b>` : '');
    };
    const map = `<div class="tk3-map" style="height:${MH}px">
      ${[0, 1, 2, 3].map((zi) => `<div class="tk3-zb" style="left:${P(zx(zi), W)};width:${P((x1 - x0) / 4, W)};background:${Z[zi] ? TK_GC[Z[zi].g] || 'transparent' : 'transparent'}"></div>`).join('')}
      ${[0, 1, 2, 3].map((zi) => (Z[zi] && Z[zi].me ? `<div class="tk3-zme" style="left:${P(zx(zi), W)};width:${P((x1 - x0) / 4, W)}"></div>` : '')).join('')}
      <div class="tk3-ax" style="width:${P(x0, W)}"><span>内</span><i></i><span>外</span></div>
      ${(D.gates || []).slice(0, 8).map((gt, k) => `<div class="tk3-gt${k + 1 === meGate ? ' me' : ''}" style="top:${Y(k + 1) - 10}px">${gt.hn}${gch(gt.grade)}</div>`).join('')}
      ${pts.map(tok).join('')}
    </div>
    <div class="tk3-zl" style="margin-left:${P(x0, W)};margin-right:${P(W - x1, W)}">${Z.map((z) => `<span class="${z.me ? 'me' : ''}"><em>${esc(z.nm)}${esc(z.c)}</em>${gch(z.g)}<b class="bt-num">${esc(z.r)}</b></span>`).join('')}</div>`;
    return `<div class="race20 tk3 ${isDirt ? 'dirt' : 'turf'}">${sky}${board}${map}</div>`;
  }

  // 全戦績のページ（2026-09-17 ユーザー指示）。1走＝2行の細い行。
  //   形は C「左の箱」（2026-09-18 決定・mockup-170。A 着差の列・B 1行目にまとめる は選ばなかった）：
  //   左＝着順とその下に着差の札（直近5走のページと同じ）／1行目＝距離と馬場・日付・場・クラスの札・レース名
  //   ／2行目＝タイム（金銀銅）・上がりと順位・通過順・人気／頭数・騎手と斤量。各項目は列の幅を決めて上下でそろえる
  //   地の色は直近5走と同じ（1着＝金・僅差＝銀）。行を押しても何も起きない（2026-09-21 ユーザー指示で飛び先を外した）
  //   sheet=true（比べる画面の戦績シート）は、行を押すとその走の中身が開く（2026-09-18 ユーザー指示）
  // 全戦績の1行（2026-09-24 作り直し・試作 mockup-215〜216 の H1）。直近5走のまとめと同じ決まり：
  //   1〜3着・時計の優秀度・上がり1〜3位は金銀銅の杯、上がりの順位の文字は出さない、距離は芝・ダートの色の札、赤は使わない。
  //   左＝着順（杯）と着差の札／1段目＝距離（着順のすぐ右。ユーザー「距離は着順の近くに置きたい」）｜馬場｜日付｜場｜クラス・レース名
  //   ／2段目＝タイム｜上がり｜通過順｜人気/頭数｜騎手と斤量。各段は決まった幅の列で上下をそろえる
  //   名前は alx- で始める（サイト全体の .ag＝金銀銅の箱・白い字 とぶつかったため）
  function allRowH1(d, sheet, i, r) {
    const bg = d.band ? `bd-${d.band}` : '';
    const go = sheet ? ` data-ex="${i}"` : '';
    const lb = `<div class="alx-lb">${d.fin >= 1 && d.fin <= 3 ? e5Cup(d.fin, 14) : ''}<b class="bt-num alx-fin ${d.finMd}">${esc(d.finTxt)}</b><span class="alx-mg bt-num ${d.band}">${d.mgPlain}</span></div>`;
    const r1 = `<div class="alx-r alx-r1"><b class="alx-sf ${d.sf}">${esc(d.sfTxt)}<b class="bt-num">${esc(d.dist)}</b></b><span class="alx-go">${esc(d.going)}</span>
      <span class="bt-num alx-dt">${esc(d.date)}</span><span class="alx-tk">${esc(d.track)}</span><span class="alx-nm">${d.clsHtml}<span class="alx-rn">${esc(d.rn)}</span></span></div>`;
    const tm = `<span class="alx-tm">${d.tg ? e5Cup({ md1: 1, md2: 2, md3: 3 }[d.tg], 12) : ''}<b class="bt-num ${d.tg}">${esc(d.time)}</b></span>`;
    const up = `<span class="alx-up"><b class="bt-num ${d.rkMd}">${esc(d.up)}</b>${d.rk != null && d.rk <= 3 ? e5Cup(d.rk, 11) : ''}</span>`;
    const r2 = `<div class="alx-r alx-r2">${tm}${up}<span class="bt-num alx-cn">${esc(d.corners.join('-'))}</span>
      <span class="alx-pop"><b class="bt-num">${esc(d.pop)}</b><small>人/${d.field}</small></span>
      <span class="alx-jk"><span class="alx-jn">${esc(d.jockey)}</span><small class="bt-num">${esc(d.weight)}</small></span></div>`;
    return `<div class="al-row alx ${bg}${sheet ? ' al-go' : ''}"${go}>${lb}<div class="al-m alx-m">${r1}${r2}</div>${sheet ? allDetail(d, r) : ''}</div>`;
  }

  function allPage(h, from, to, sheet) {
    const all = allRuns(h);
    const out = [];
    for (let i = from; i < to; i += 1) {
      const r = all[i];
      const d = summaryRun(h, r, Math.min(i, 4));
      out.push(allRowH1(d, sheet, i, r));   // 2026-09-24 から H1 の行（前の形の組み立ては消した）
      // 休養の帯は全戦績には出さない（2026-09-17 ユーザー「ここに休養は不要」）。直近5走のページには残す
    }
    return `<div class="race20 rvC c3 mx hd-r3 sm-page al-page al-s bc-b4">${out.join('')}</div>`;
  }
  // 戦績シートで行を押すと開く中身（mockup-170 と同じ項目）
  function allDetail(d, r) {
    const cell = (lab, body, wide) => `<div class="al-dc${wide ? ' w' : ''}"><i>${lab}</i>${body}</div>`;
    const memo = [...(r.note_labels || []), r.note_text].filter(Boolean);
    const resid = r.time_resid != null ? `基準比 ${r.time_resid > 0 ? '+' : ''}${esc(r.time_resid)}秒` : esc(r.time_note || '');
    // 先頭の段に レースレベル・勝ち馬・勝ち馬の最高成績 の3つ（2026-09-18 ユーザー指示）。自分が勝った走は2着馬
    const who = d.winLab === '2着' ? '2着馬' : '勝ち馬';
    const lvMiss = { local: '地方', jump: '対象外' }[r.level_miss] || '—';
    const best = d.bpHtml || (r.winner_best ? `<b>${esc(r.winner_best)}</b>` : '<b>—</b>');
    return `<div class="al-det"><div class="al-top">
      ${cell('レースレベル', d.lv || `<b>${lvMiss}</b>`)}
      ${cell(who, `<b class="al-wn">${esc(d.winner)}</b>`)}
      ${cell(`${who}の最高成績`, best)}
    </div><div class="al-dg">
      ${cell('コーナーごとの位置', `<span class="al-dcn">${d.corners.map((c) => `<em class="bt-num">${esc(c)}</em>`).join('') || '—'}${smStyle(d)}</span>`)}
      ${cell('レースの流れ', `<b>${esc(d.sc || '—')}</b>`)}
      ${cell('タイム（当日の馬場を補正）', `<b class="bt-num ${d.tg}">${esc(d.time)}</b> <small>${resid}</small>`)}
      ${cell('上がり', `<b class="bt-num ${d.rkMd}">${esc(d.up)}</b> <small>${d.rk != null ? `${d.rk}位／${d.field}頭` : ''}</small>`)}
      ${cell('枠・馬番', `<b class="bt-num">${esc(d.waku)}枠${esc(d.umaban)}番</b> <small>${d.field}頭 ${esc(d.pop)}人気</small>`)}
      ${cell('騎手・斤量・馬体重', `<b>${esc(d.jockey || '—')}</b> <small class="bt-num">${esc(d.weight)}kg ${esc(d.bw)}kg</small>`)}
      ${cell('馬場', `<b class="bt-num ${d.sf}">${esc(d.sfTxt)}${esc(d.dist)}m</b> <b>${esc(d.going)}</b>`)}
      ${memo.length ? cell('メモ', `<div class="al-memo">${memo.map((m) => `<em>${esc(m)}</em>`).join('')}</div>`, true) : ''}
    </div></div>`;
  }

  // 過去走のページ（2026-09-17 決定の形）：
  //   上＝レースの札（日付と場の四角｜レース名・距離・頭数・レベル）→ 着順｜人気｜タイム → 勝ち馬との差と勝ち馬（R3）
  //   中＝コーナーごとの位置の図（脚質の色）＋上がりの棒（F3）→ レースの流れ（ペース・決着の目盛り）
  //   下＝間隔・斤量・馬場・騎手・馬体重の一覧（B1）。今回と同じ条件で好走した行は緑
  //   選ばなかった案：スコアボード A・新聞 B・設定画面 C／C1〜C3、M1・M2、上の段 R1・R2、勝ち馬と上がり F1・F2、下の段 B2・B3
  // ---------- 過去走のページ（2026-09-24 作り直し・試作 mockup-200〜209） ----------
  //   上から ①レースの札 ②結果の札（着順・人気・タイム・着差・勝ち馬）③コーナーごとの位置（番号の丸を線でつなぐ）＋上がり・通過タイム・決着
  //   ④条件の5つ（馬場・間隔・騎手・斤量・馬体重）を丸の絵＋「前走｜今回」の2段で。項目は前の形と同じで、メモの1行だけ外した（ユーザー「ここいらない」）
  //   色は紺・灰・緑と金銀銅だけ。条件の今回の段は、変わっても色を付けない（ユーザー「色変えなくていい」）。変わった項目は上の丸を紺で塗る
  const RI = 'currentColor';
  const R_ICON = {
    cal: `<svg viewBox="0 0 32 32"><rect x="4" y="7" width="24" height="21" rx="3.5" fill="${RI}"/><rect x="4" y="12" width="24" height="2" fill="#fff" opacity=".9"/><rect x="9" y="3.5" width="3" height="7" rx="1.5" fill="${RI}"/><rect x="20" y="3.5" width="3" height="7" rx="1.5" fill="${RI}"/><rect x="8" y="17" width="4" height="3.5" rx="1" fill="#fff"/><rect x="14" y="17" width="4" height="3.5" rx="1" fill="#fff"/><rect x="20" y="17" width="4" height="3.5" rx="1" fill="#fff"/></svg>`,
    kg: `<svg viewBox="0 0 32 32"><circle cx="16" cy="7.5" r="3.6" fill="none" stroke="${RI}" stroke-width="2.6"/><path d="M9 11.5 H23 L27.5 28 H4.5 Z" fill="${RI}"/><text x="16" y="24.2" text-anchor="middle" font-size="8" font-weight="900" fill="#fff" font-family="Futura,Jost,system-ui">kg</text></svg>`,
    sun: `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="6.5" fill="${RI}"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x="15" y="2.5" width="2.6" height="5" rx="1.3" fill="${RI}" transform="rotate(${a} 16 16)"/>`).join('')}</svg>`,
    drop: `<svg viewBox="0 0 32 32"><path d="M16 3 C16 3 6.5 14 6.5 20 A9.5 9.5 0 0 0 25.5 20 C25.5 14 16 3 16 3 Z" fill="${RI}"/><path d="M11.5 20.5 A4.5 4.5 0 0 0 15 25" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    jockey: `<svg viewBox="0 0 32 32"><path d="M5 21 A11 11 0 0 1 27 21 Z" fill="${RI}"/><rect x="3" y="21" width="27" height="4.2" rx="2.1" fill="${RI}"/><path d="M16 10.5 V21" stroke="#fff" stroke-width="2.2"/></svg>`,
    bw: `<svg viewBox="0 0 32 32"><rect x="4" y="5" width="24" height="23" rx="5" fill="${RI}"/><path d="M9.5 15 A6.5 6.5 0 0 1 22.5 15 Z" fill="#fff"/><path d="M16 15 L19 10.5" stroke="${RI}" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    time: `<svg viewBox="0 0 32 32"><circle cx="16" cy="18.5" r="10.5" fill="none" stroke="${RI}" stroke-width="3.2"/><rect x="12.5" y="3" width="7" height="4.2" rx="1.2" fill="${RI}"/><path d="M16 18.5 L20.5 13" stroke="${RI}" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="18.5" r="1.8" fill="${RI}"/></svg>`,
    pop: `<svg viewBox="0 0 32 32"><circle cx="11" cy="11" r="4.5" fill="${RI}"/><circle cx="22" cy="11" r="4.5" fill="${RI}"/><path d="M2.5 27 C2.5 20 6 17.5 11 17.5 C16 17.5 19.5 20 19.5 27 Z" fill="${RI}"/><path d="M13.5 27 C13.5 20 17 17.5 22 17.5 C27 17.5 30.5 20 30.5 27 Z" fill="${RI}" stroke="#fff" stroke-width="1.4"/></svg>`,
    field: `<svg viewBox="0 0 32 32"><path d="M5 27 C5 19 8 13 14 10 L16 5 L19 9 C23 9 27 13 28 17 C28.5 19 27 20.5 25 20 L21 18.5 C19 20 18 23 18 27 Z" fill="${RI}"/><circle cx="21.5" cy="13" r="1.3" fill="#fff"/></svg>`,
    up: `<svg viewBox="0 0 32 32"><path d="M8 4 V29" stroke="${RI}" stroke-width="2.6" stroke-linecap="round"/><path d="M9 5 H26 V17 H9 Z" fill="${RI}"/><rect x="9" y="5" width="4.25" height="4" fill="#fff"/><rect x="17.5" y="5" width="4.25" height="4" fill="#fff"/><rect x="13.25" y="9" width="4.25" height="4" fill="#fff"/><rect x="21.75" y="9" width="4.25" height="4" fill="#fff"/><rect x="9" y="13" width="4.25" height="4" fill="#fff"/><rect x="17.5" y="13" width="4.25" height="4" fill="#fff"/></svg>`,
  };
  const rIc = (k, cls) => `<i class="rp-ic ${cls || ''}">${R_ICON[k]}</i>`;
  const R_MEDAL = { 1: '#B8860B', 2: '#7D8792', 3: '#A9642E' };
  const rMedal = (n, size) => (n >= 1 && n <= 3 ? e5Cup(n, size) : '');

  // コーナーごとの位置：1段＝1コーナー。丸に1〜頭数の番号（左が先頭）。この馬の丸だけ脚質の色（ゴールの段は1〜3着なら金銀銅）、
  //   ほかの丸は色なし。この馬の丸を段から段へ線でつなぐ（試作 mockup-202 Q2）
  function runPosFig(r, field, fin, turf) {
    const cs = String(r.corners || '').split('-').map(Number).filter((x) => x > 0);
    const N = field || 0;
    if (!cs.length || !N) return '<div class="yf-posnone">コーナーの記録なし</div>';
    const pts = cs.map((v, i) => ({ v, lab: `${i + 1 + (4 - cs.length)}角` }));
    if (fin > 0) pts.push({ v: fin, lab: 'ゴール', fin: true });
    const W = 330, L = 44, R = 12, RH = 26, T = 16;
    const X = (p) => L + ((Math.min(p, N) - 1) / Math.max(N - 1, 1)) * (W - L - R);
    const step = (W - L - R) / Math.max(N - 1, 1);
    const rad = Math.max(5.5, Math.min(9.5, step / 2 - 0.8));
    const fs = rad >= 8 ? 10 : rad >= 7 ? 9 : 8;
    const Y = (i) => T + i * RH + RH / 2;
    const lanes = [];   // 帯 → この馬をつなぐ線 → 番号の丸 の順に描く（線が帯に隠れないように）
    const rows = pts.map((q, i) => {
      const y = Y(i);
      const mc = q.fin ? (R_MEDAL[q.v] || 'var(--st)') : 'var(--st)';
      const slots = Array.from({ length: N }, (_, k) => {
        const p = k + 1, x = X(p).toFixed(1), me = p === Math.min(q.v, N);
        return `<circle cx="${x}" cy="${y}" r="${me ? rad + 1.5 : rad}" class="${me ? 'pq-me' : 'pq-s'}"${me ? ` style="fill:${mc}"` : ''}/>`
          + `<text x="${x}" y="${(y + fs * 0.36).toFixed(1)}" class="${me ? 'pq-tm' : 'pq-t'}" style="font-size:${me ? fs + 1 : fs}px">${p}</text>`;
      }).join('');
      lanes.push(`<rect x="${L - rad - 4}" y="${y - RH / 2 + 2}" width="${W - L - R + rad * 2 + 8}" height="${RH - 4}" rx="${(RH - 4) / 2}" class="pp-lane${q.fin ? ' g' : ''}"/>`);
      return `<text x="${L - rad - 8}" y="${y + 4}" class="pp-rl">${q.lab}</text>${slots}`;
    }).join('');
    const path = `<polyline points="${pts.map((q, i) => `${X(q.v).toFixed(1)},${Y(i)}`).join(' ')}" fill="none" stroke="var(--st)" stroke-width="2.6" stroke-linejoin="round" opacity=".6"/>`;
    const H = T + pts.length * RH + 4;
    return `<svg class="pp-fig pp1 pq ${turf ? 'tf' : 'dt'}" viewBox="0 0 ${W} ${H}"><text x="${L - rad}" y="11" class="pp-ax">◀ 先頭</text>`
      + `<text x="${W - R + rad}" y="11" class="pp-ax" text-anchor="end">最後方</text>${lanes.join('')}${path}${rows}</svg>`;
  }

  function runPage(h, i) {
    const r = h.past_runs[i];
    const prev = h.past_runs[i + 1];
    const race = site.race || {};
    const field = Number(r.field_size || r.runners) || null;
    const fin = Number(r.finish);
    const pop = Number(r.popularity);
    const mg = marginSec(r.margin);
    const isFirst = i === 0;
    // 間隔：前走は今回のレース日との差、それ以外は1つ前の走との差（5走前は career_runs と合わせた一覧から）
    const gapNow = isFirst ? days(toDate(race.date), toDate(r.date)) : null;
    const gapPrev = prev ? days(toDate(r.date), toDate(prev.date)) : (condOf(h).gapOf[r.race_id] ?? r.rest_days ?? null);
    const gapV = isFirst ? (gapNow != null ? wk(gapNow) : '—') : (gapPrev != null ? wk(gapPrev) : '—');
    // この走の脚質（位置の図・札の色に使う）。判定は本番と同じ（keiba_review.style_of / race.js reviewZoneOf）
    const c1st = Number(String(r.corners || '').split('-')[0]) || null;
    const runStyle = !c1st || !field ? null : c1st === 1 ? '逃げ' : c1st / field <= 0.33 ? '先行' : c1st / field <= 0.66 ? '差し' : '追込';
    const stColCls = { '逃げ': 'st-nige', '先行': 'st-sen', '差し': 'st-sashi', '追込': 'st-oi' }[runStyle] || 'st-none';
    const turf = String(r.surface || '').startsWith('芝');
    const sfc = String(r.surface || '').startsWith('ダ') ? 'sf-dt' : turf ? 'sf-tf' : '';

    // ① レースの札（日付・場・クラス・レース名・距離・頭数・レベル）
    const ymd = String(r.date || '').split(/[/-]/);
    const rname = stripClass(r.race_name) || '—';
    const cls = raceClass(r.grade, r.race_name);
    const lvB = r.level_grade
      ? `<span class="lv lv-${esc(String(r.level_grade).toLowerCase())}" title="レースレベル（出走馬のその後180日・同じクラスの中での相対）"><i>Lv</i>${esc(r.level_grade)}</span>` : '';
    const raceCard = `<div class="h-card rp-race">
      <div class="m-date"><small>${esc(ymd[0] || '')}</small><b>${esc(ymd[1] || '')}/${esc(ymd[2] || '')}</b><span>${esc(r.track || '')}</span></div>
      <div class="rp-rm"><div class="m-rn">${cls ? clsBadge(cls) : (JRA_TRACKS.includes(r.track) ? '' : '<span class="cb c-jusho">地方</span>')}<span>${esc(rname)}</span></div>
        <div class="rp-rc"><span class="rp-dist ${sfc}">${esc(r.surface || '')}<b class="e5-dg">${esc(r.distance || '')}</b>m</span>
          <span class="rp-fld">${rIc('field', 'sm')}<b class="e5-dg">${field ?? '—'}</b>頭</span>${lvB ? `<span class="rp-lv">${lvB}</span>` : ''}</div></div></div>`;

    // ② 結果の札：左に着順（1〜3着は金銀銅の杯）、右に 人気（人気より上の着順なら▲・下なら▼）・タイム・着差・勝ち馬
    //   着差の札の色は本番の戦績の札と同じ決まり：1着＝金／芝0.4・ダート0.6（ほか0.5）秒以内の負け＝僅差（銀）
    const closeTh = { '芝': 0.4, 'ダート': 0.6 }[r.surface] ?? 0.5;
    const band = fin === 1 ? 'win' : (mg != null && Math.abs(mg) <= closeTh ? 'close' : '');
    const tg = { f1: 1, f2: 2, f3: 3 }[r.time_grade] || null;
    const tgTitle = r.time_grade && r.time_resid != null ? ` title="基準比 ${r.time_resid > 0 ? '+' : ''}${esc(r.time_resid)}秒（当日の馬場差を補正後）"` : '';
    const popArrow = pop && fin ? (fin < pop ? '<b class="rp-pa up">▲</b>' : fin > pop ? '<b class="rp-pa dn">▼</b>' : '<b class="rp-pa eq">＝</b>') : '';
    const bp = bestParts(r.winner_best);
    const wLab = fin === 1 ? '2着馬' : '勝ち馬';
    const winnerLine = `<div class="rp-wn"><i>${wLab}</i><b>${esc(r.winner || '—')}</b>${bp ? `<span class="ft3-bst">${clsBadge(bp.cls)}<b class="${bp.fin === 1 ? 'f1' : bp.fin === 2 ? 'f2' : bp.fin === 3 ? 'f3' : ''}">${bp.fin}着</b></span>` : (r.winner_best ? `<b>${esc(r.winner_best)}</b>` : '')}</div>`;
    const hero = `<div class="h-card rp-hero ${band}">
      <div class="rp-fin w${fin >= 1 && fin <= 3 ? fin : 0}">${rMedal(fin, 34)}<b class="e5-dg">${esc(r.finish ?? '—')}</b><small>着</small></div>
      <div class="rp-hr">
        <div class="rp-h1"><span class="rp-pp">${rIc('pop', 'xs')}<b class="e5-dg">${esc(r.popularity ?? '—')}</b>番人気</span>${popArrow}
          <span class="rp-tt${tg ? ` w${tg}` : ''}"${tgTitle}>${tg ? rMedal(tg, 18) : rIc('time', 'xs')}<b class="e5-dg">${esc(r.time || '—')}</b></span></div>
        <div class="rp-h2"><b class="e5-dg rp-gv">${mg == null ? '—' : Math.abs(mg).toFixed(1)}<small>秒</small></b>${band ? `<b class="rp-band ${band}">${band === 'win' ? '勝ち' : '僅差'}</b>` : ''}</div>
        ${winnerLine}</div></div>`;

    // ③ コーナーごとの位置 → 上がり → 前半の通過タイム｜決着（2枚は同じ並び：小さい見出し → 大きい中身 → 札）
    const rk = r.last3f_rank != null ? Number(r.last3f_rank) : null;
    const upB = `<span class="pp-up${rk && rk <= 3 ? ` r${rk}` : ''}">${rIc('up', 'xs')}上がり<b class="e5-dg">${esc(r.last_3f || '—')}</b>秒${rk != null ? `<em>${rk <= 3 ? e5Cup(rk, 16) : ''}<b class="e5-dg">${rk}</b>位</em>` : ''}</span>`;
    const [pace, settle] = String(r.scenario || '').split('・');
    const crown = '<svg viewBox="0 0 20 16" class="pp-crown"><path d="M2 12 L3.5 4 L7.5 8 L10 2.5 L12.5 8 L16.5 4 L18 12 Z" fill="#E0A800"/><rect x="2" y="12.6" width="16" height="2.6" rx="1" fill="#E0A800"/></svg>';
    const side = (lab, on) => `<span class="pp-sd${on ? ' on' : ''}">${on ? crown : ''}${lab}</span>`;
    const pt = r.pass_time;   // publish が DB のラップから出す（keiba_shutuba_columns.pass_time_for・2026-09-24〜）
    const flow = `<div class="pp-flow"><span class="pp-fi"><i class="pp-fk">${pt ? `${pt.point_m}m通過` : '通過'}</i><b class="pp-fv">${pt ? `<span class="e5-dg">${Number(pt.sec).toFixed(1)}</span><small>秒</small>` : '—'}</b>${pace ? `<em class="pp-pl">${esc(pace)}</em>` : ''}</span>
      <span class="pp-fi"><i class="pp-fk">決着</i><b class="pp-fv">${side('前', settle === '前')}${side('差', settle === '後')}</b></span></div>`;
    const posCard = `<div class="h-card st-card ${stColCls} pp"><div class="h-top"><span class="h-t" style="color:var(--st)">コーナーごとの位置</span>
      <span class="h-r">${runStyle ? `<b class="ft3-style ${stColCls}">${runStyle}</b>` : ''}</span></div>${runPosFig(r, field, fin, turf)}<div class="pp-row">${upB}</div>${flow}</div>`;

    // ④ 条件の5つ。並びは 馬場 → 間隔 → 騎手 → 斤量 → 馬体重（ユーザー指定）。上に項目の丸、下に「前走｜今回」の2段（今回は前走のページだけ）
    //   間隔の列は前走の段から今回の段へ縦の点線を引き、その上に「4週」。今回で変わった項目は丸を紺で塗る（値の色は変えない）
    //   今回と同じ条件で好走していた項目は、列ごと薄い緑にして「好走」の札（今回と同じ条件の決まりは condOf/hitOf）
    const wet = /稍|重|不/.test(String(r.condition || ''));
    const kgNow = h.weight_carried != null ? String(h.weight_carried).replace(/\.0$/, '') : null;
    const same = {
      weight: kgNow && r.weight ? Number(kgNow) === Number(r.weight) : null,
      going: race.going ? ng(race.going) === ng(r.condition) : null,
      jockey: h.jockey ? nj(h.jockey) === nj(r.jockey) : null,
    };
    const jkS = (n) => `<span style="font-size:${Math.min(13, jkFs(n) - 1)}px">${esc(n || '—')}</span>`;
    const conds = [
      { k: 'going', ic: wet ? 'drop' : 'sun', lab: '馬場', pv: esc(r.condition || '—'), nv: esc(race.going || '—') },
      { k: 'gap', ic: 'cal', lab: '間隔', pv: gapV },
      { k: 'jockey', ic: 'jockey', lab: '騎手', pv: jkS(r.jockey), nv: jkS(h.jockey) },
      { k: 'weight', ic: 'kg', lab: '斤量', pv: r.weight ? `${esc(r.weight)}<small>kg</small>` : '—', nv: kgNow ? `${esc(kgNow)}<small>kg</small>` : '—' },
      { k: null, ic: 'bw', lab: '馬体重', pv: r.body_weight ? `${esc(r.body_weight)}<small>kg</small>` : '—', nv: null },
    ];
    const hitOn = (c) => Boolean(c.k && hitOf(h, r, c.k));
    const at = (row, col, html, cl) => `<div class="e-c ${cl || ''}" style="grid-row:${row};grid-column:${col}">${html}</div>`;
    let cells = '';
    conds.forEach((c, n) => {
      const col = n + 2;
      const chg = isFirst && c.k && same[c.k] === false;
      if (hitOn(c)) cells += `<i class="e-hitbg" style="grid-row:1 / 6;grid-column:${col}"></i>`;
      cells += at(1, col, `<i class="d3o${chg ? ' on' : ''}${c.k === 'gap' ? ' gap' : ''}">${R_ICON[c.ic]}</i>`);
      cells += at(2, col, `<i class="m-l">${c.lab}</i>`);
      if (c.k === 'gap') {
        cells += `<div class="e-gap" style="grid-row:3 / 5;grid-column:${col}">${isFirst ? '<i class="e-gl"></i>' : ''}<b class="e5-dg">${c.pv}</b></div>`;
      } else {
        cells += at(3, col, `<b class="e-v e5-dg">${c.pv}</b>`);
        if (isFirst) cells += at(4, col, c.nv == null ? '<i class="e-dim">当日</i>' : `<b class="e-v e5-dg">${c.nv}</b>`);
      }
      if (hitOn(c)) cells += at(5, col, `<b class="rp-hit" title="${esc(condOf(h).stat[c.k] || '')}">好走</b>`);
    });
    const heads = at(3, 1, '<i class="e-rh">前走</i>') + (isFirst ? at(4, 1, '<i class="e-rh">今回</i>') : '');
    const condCard = `<div class="h-card e-grid${isFirst ? '' : ' solo'}">${heads}${cells}</div>`;

    return `<div class="race20 rvC c3 mx hd-r3 bt-b1 rp">${raceCard}${hero}${posCard}${condCard}</div>`;
  }

  // 説明文と下のボタン列（✕消・ひとつ戻る・✓残す）は外した（2026-09-17 ユーザー指示）。決めるのは払う動きだけ。
  // 払い間違えを戻す機能は置かない（同日ユーザー決定）
  // 基本・コース・展開・直近5走の見出しの横に、今回の芝・ダートと距離を出す（2026-09-17 ユーザー指示。コースは 2026-09-24 に足した）。
  //   過去走と見比べるときの基準なので、距離の色は過去走と同じ（芝＝緑・ダート＝橙）
  //   2026-09-21：距離の左にクラスの札も出す（ユーザー指示）。過去走の札と同じ分け方・同じ色
  const TODAY_PAGES = ['p1', 'course', 'sum', 'tenkai'];
  const todayTag = (() => {
    const r = site.race || {};
    if (!r.surface || !r.distance) return '';
    const sf = String(r.surface).startsWith('ダ') ? 'sf-dt' : String(r.surface).startsWith('芝') ? 'sf-tf' : '';
    // 「今回」と「芝／ダート」の文字は出さない。芝とダートは札の色（緑・茶）で分かる（2026-09-24 ユーザー指示・馬名が切れるため）
    return `<em class="yf-today ${sf}">${clsBadge(raceClass(r.grade, r.race_name))}<b class="bt-num">${esc(r.distance)}</b>m</em>`;
  })();
  function vSwipe() {
    const h = Q[S.idx];
    const pages = pagesOf(h);
    const pg = pages[S.page];
    const dots = pages.map((_, i) => `<i class="${i <= S.page ? 'on' : ''}"></i>`).join('');
    // カード上の見出し（段階・「残す？ 消す？」・やめる）も外した（同日ユーザー指示）。この画面から抜ける手段は今は無い
    // 1頭だけ見るとき（S.view）は、右側を「N / M頭」から馬番・馬名・閉じるに替える（2026-09-21）。
    //   ✓／消の札と色は CSS（.yf-deck.view）で隠すだけにして、動きの側のコードは分けない
    const right = S.view
      ? `<span class="yf-vw">${umaBox(h.number, h.gate, 'sm')}<b>${esc(h.name)}</b>`
        + '<button type="button" class="yf-x2" data-act="close">閉じる</button></span>'
      : `<span>${H.length - Q.length + S.idx + 1} / ${H.length}頭</span>`;
    return `<div class="yf-deck top apple${S.view ? ' view' : ''}" id="yf-deck">
        <div class="yf-card" id="yf-card">
          <div class="yf-tint" id="yf-tint"></div>
          <div class="yf-stamp ok" id="yf-ok"><i>✓</i>残す</div><div class="yf-stamp ng" id="yf-ng"><i>✕</i>消す</div>
          <div class="yf-dots">${dots}</div>
          <div class="yf-plab"><span class="yf-pl"><b>${esc(pg.label)}</b>${TODAY_PAGES.includes(pg.k) ? todayTag : ''}</span>${right}</div>
          <div class="yf-page" id="yf-page">${pageHtml(h, pg)}</div>
          ${S.page > 0 ? '<span class="yf-edge l">‹</span>' : ''}
          ${S.page < pages.length - 1 ? '<span class="yf-edge r">›</span>' : ''}
        </div>
      </div>
      <div class="yf-deck-foot"></div>
      <label class="yf-haptic" aria-hidden="true"><input type="checkbox" switch id="yf-hap" tabindex="-1"></label>`;
  }

  // 後ろの札には次の馬の1ページ目を描いておく（払った瞬間に中身がもう見えているように。2026-09-17 ユーザー指摘「後ろが白い」）。
  //   さらにその次の馬の札も、手が空いているうちに隠して作っておく（払った直後に組み立てると、iPhone で一瞬止まったため）
  function backHtml(i) {
    const h = Q[i];
    const pages = pagesOf(h);
    return `<div class="yf-dots">${pages.map((_, k) => `<i class="${k === 0 ? 'on' : ''}"></i>`).join('')}</div>
      <div class="yf-plab"><span class="yf-pl"><b>${esc(pages[0].label)}</b>${todayTag}</span><span>${H.length - Q.length + i + 1} / ${H.length}頭</span></div>
      <div class="yf-page">${pageHtml(h, pages[0])}</div>
      <div class="yf-shade"></div>`;
  }
  function buildBack(i, cls, html = backHtml(i)) {
    const deck = document.getElementById('yf-deck');
    const el = document.createElement('div');
    el.className = `yf-card back ${cls}`;
    el.dataset.n = Q[i].number;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = html;
    deck.insertBefore(el, deck.firstChild);
    fitPage(el.querySelector('.yf-page'), pagesOf(Q[i])[0]);
    return el;
  }
  function fillBack() {
    const deck = document.getElementById('yf-deck');
    const nx = Q[S.idx + 1];
    if (!deck || !nx || S.screen !== 'swipe') return;
    const arrive = S.promote;
    S.promote = false;
    if (!document.getElementById('yf-back')) {
      const later = [...deck.querySelectorAll('.yf-card.later')].find((x) => Number(x.dataset.n) === nx.number);
      let el;
      if (later) {
        el = later;                                   // 作っておいた札を使う（組み立て済みなので止まらない）
        el.classList.replace('later', arrive ? 'pre' : 'ready');
      } else {
        el = buildBack(S.idx + 1, arrive ? 'pre' : 'ready');
      }
      el.id = 'yf-back';
      if (arrive) {
        let done = false;
        const start = () => {
          if (done) return;
          done = true;
          el.classList.remove('pre');
          // 次の札は、奥から小さく浮かび上がって後ろの定位置に収まる
          springTo(el, (x) => ({
            transform: backTf(BACK_Y + 36 * (1 - x), 0.88 + (BACK_S - 0.88) * x),
            opacity: Math.min(1, x * 1.6),
          }), { response: 0.55, damping: 0.88 });
        };
        requestAnimationFrame(() => requestAnimationFrame(start));
        setTimeout(start, 80);   // 画面が裏にあって描画の合図が来ないときも、後ろの札が隠れたままにならないように
      }
    }
    // その先の2頭ぶんの札も、すぐに1枚ずつ作っておく（札の動きは描画の別の係が受け持つので、作っている間も止まらない）
    clearTimeout(S.prepT);
    S.prepT = setTimeout(prepNext, arrive ? 120 : 250);
  }
  function prepNext() {
    const deck = document.getElementById('yf-deck');
    if (!deck || S.screen !== 'swipe') return;
    const want = [S.idx + 2, S.idx + 3].filter((i) => Q[i]);
    const pool = [...deck.querySelectorAll('.yf-card.later')];
    pool.forEach((x) => { if (!want.some((i) => Q[i].number === Number(x.dataset.n))) x.remove(); });
    const i = want.find((k) => !pool.some((x) => x.isConnected && Number(x.dataset.n) === Q[k].number));
    if (i == null) return;
    // 中身の文字を作る仕事と、並べて大きさを合わせる仕事を分けて、1回の止まりを短くする
    const html = backHtml(i);
    S.prepT = setTimeout(() => {
      if (S.screen !== 'swipe' || !want.includes(i) || S.idx + 1 >= i) return;
      if ([...deck.querySelectorAll('.yf-card.later')].some((x) => Number(x.dataset.n) === Q[i].number)) return;
      buildBack(i, 'later', html);
      S.prepT = setTimeout(prepNext, 60);
    }, 30);
  }


  const checked = () => H.filter((h) => S.my[h.number] === '✓');
  const byNum = (n) => H.find((h) => h.number === n);

  function vAsk() {
    const c = checked().length;
    const k = H.filter((h) => S.my[h.number] === '消').length;
    return `${head('1 / 2　絞り込み', '絞り込みが終わりました', 100)}
      <div class="yf-mid">
        <div class="yf-big chk">✓</div>
        <div class="yf-cnt"><span class="c1">✓ ${c}頭</span><span class="c2">消 ${k}頭</span></div>
        <div class="q">${c ? '印を決めるに進みますか？' : '✓の馬がいません'}</div>
        <div class="s">${c === 0 ? '1頭以上を右にスワイプすると、印を決められます'
          : c === 1 ? '✓が1頭なので、比べずに◎になります'
            : `✓の${c}頭を2頭ずつ比べて◎を決めます（${c - 1}回）`}</div>
      </div>
      <div class="yf-foot">
        ${c ? '<button type="button" class="yf-btn" data-act="mark0">印を決める</button>'
          : '<button type="button" class="yf-btn" data-act="restart">絞り込みをやり直す</button>'}
        <button type="button" class="yf-btn text" data-act="done">ここで終える（消と✓だけ付ける）</button>
      </div>`;
  }

  // ---------- 印を決める：2頭を比べて選ぶ（勝ち残り型） ----------
  //   2026-09-25 から Apple の「モデルを比較する」の形（下の「印を決める画面を Apple の…」の節・試作 mockup-218）。
  //   前の形（2頭を左右の札に並べ、1頭ぶんを 馬の情報／直近5走1走2行／適性の札4枚 で見せる。2026-09-17）は外した
  const SURF_LAB = (s0) => (String(s0 || '').startsWith('ダ') ? 'ダート' : '芝');
  let TK_DATA = null;
  function tenkaiData() {
    if (TK_DATA) return TK_DATA;
    if (tenkaiCache == null) tenkaiPage(H[0]);
    const wrap = document.createElement('div');
    wrap.innerHTML = tenkaiCache;
    const D = tkParse(wrap);
    const numOf = (html) => Number(String(html).replace(/<[^>]+>/g, '').trim());
    const styleOf = {};
    D.zones.forEach((z) => z.chips.forEach((c) => { styleOf[numOf(c.hn)] = { style: z.style, grade: z.grade }; }));
    const gateOf = {};
    D.gates.forEach((g) => { gateOf[numOf(g.hn)] = g.grade; });
    return (TK_DATA = { styleOf, gateOf });
  }
  const rec = (c) => (c || [0, 0, 0, 0]).map((v, i) => `<b class="${i < 3 && v ? `r${i + 1}` : ''}">${v}</b>`).join('<i>-</i>');
  function aptData(h) {
    const race = site.race || {};
    const surf = SURF_LAB(race.surface);
    const rows = (h.course_record || {}).rows || [];
    const find = (lab) => (rows.find((r) => r.label === lab) || {}).counts || [0, 0, 0, 0];
    const here = `${race.track || ''}${surf}${race.distance || ''}m`;
    const all = `全場${surf}${race.distance || ''}m`;
    // 今日の展開の型：今日いちばんありそうな流れ（prediction.scenario.main）でのこの馬の成績
    const main = ((site.prediction || {}).scenario || {}).main || {};
    const code = main.code && main.side ? `${main.code}_${main.side === '前' ? '前残り' : '差し・追込'}` : '';
    const rt = ((h.race_type_record || {}).rows || []).find((r) => r.code === code) || null;
    const paceName = { S: 'スロー', M: '平均', H: 'ハイ' }[main.code] || '';
    const tk = tenkaiData();
    const st = tk.styleOf[h.number] || {};
    const c = condOf(h);
    const hitLab = { gap: '間隔', weight: '斤量', going: '馬場', jockey: '騎手' };
    return {
      here, all, hereC: find(here), allC: find(all),
      flowLab: `${paceName}・${main.side === '前' ? '前残り' : '差し追込'}`, rt,
      style: st.style || '—', styleG: st.grade || '', gate: h.gate, gateG: tk.gateOf[h.gate] || '',
      hitLab, lit: c.lit, stat: c.stat,
    };
  }
  // ---------- 印を決める画面を Apple の「モデルを比較する」の形に（mockup-218・2026-09-25） ----------
  //   ユーザー「こんな感じでAppleみたいに比較できるようにしたい」（apple.com/jp/iphone/compare の PDF）。
  //   Apple の決まり：2列を左右にそろえ、項目ごとに横で見比べる。節の見出しは大きく、下に細い線。
  //   各行は「絵 → 大きな数字 → 下に小さな説明」。無いものは「—」。行の名前は出さない（A 案・2026-09-25 ユーザー決定）。
  //   同日の直し（ユーザー）：大きい数字は Futura／絵を使う／直近5走は情報を増やす／「この馬を選ぶ」は常に下に出す。
  //   絞り込みで付けた金（gold:{race_id}）は「あなたが良いと思った所」の節に出す
  const cmpPct = (c) => {
    const n = (c || []).reduce((s, v) => s + v, 0);
    return n ? { p: Math.round(((c[0] + c[1] + c[2]) / n) * 100), top: c[0] + c[1] + c[2], n } : null;
  };
  // Apple の比較ページの絵（線の絵）。本番の絵（R_ICON・E5_ICON）で足りないものだけここで描く
  const AI = 'currentColor';
  const AP_ICON = {
    odds: `<svg viewBox="0 0 32 32"><rect x="4" y="8" width="24" height="16" rx="3" fill="none" stroke="${AI}" stroke-width="2.2"/><path d="M11 8 V24" stroke="${AI}" stroke-width="2" stroke-dasharray="2 2.4"/><path d="M16.5 13 L19 16.5 L21.5 13 M19 16.5 V21 M16.8 18 H21.2" fill="none" stroke="${AI}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    rec: `<svg viewBox="0 0 32 32"><path d="M10 5 H22 V12 A6 6 0 0 1 10 12 Z" fill="none" stroke="${AI}" stroke-width="2.2" stroke-linejoin="round"/><path d="M10 7.5 H6.5 A3.5 3.5 0 0 0 10 13 M22 7.5 H25.5 A3.5 3.5 0 0 1 22 13" fill="none" stroke="${AI}" stroke-width="2"/><path d="M16 18 V23 M11 27 H21 M12.5 27 L13.5 23 H18.5 L19.5 27" fill="none" stroke="${AI}" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
    pct: `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="none" stroke="${AI}" stroke-width="2.2" opacity=".25"/><path d="M16 5 A11 11 0 0 1 26.5 19.5" fill="none" stroke="${AI}" stroke-width="3" stroke-linecap="round"/></svg>`,
    course: `<svg viewBox="0 0 32 32"><ellipse cx="16" cy="17" rx="12.5" ry="8.5" fill="none" stroke="${AI}" stroke-width="2.2"/><ellipse cx="16" cy="17" rx="7" ry="3.8" fill="none" stroke="${AI}" stroke-width="1.6" opacity=".45"/><path d="M19 6 L24.5 8.6 L19 11.2" fill="none" stroke="${AI}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    flow: `<svg viewBox="0 0 32 32"><path d="M5 22 A11 11 0 0 1 27 22" fill="none" stroke="${AI}" stroke-width="2.2" stroke-linecap="round"/><path d="M16 22 L21.5 13.5" stroke="${AI}" stroke-width="2.4" stroke-linecap="round"/><circle cx="16" cy="22" r="2.2" fill="${AI}"/></svg>`,
    gate: `<svg viewBox="0 0 32 32"><rect x="4" y="8" width="24" height="17" rx="2" fill="none" stroke="${AI}" stroke-width="2.2"/><path d="M10 8 V25 M16 8 V25 M22 8 V25" stroke="${AI}" stroke-width="1.8"/><path d="M4 12 H28" stroke="${AI}" stroke-width="1.8"/></svg>`,
    style_old: `<svg viewBox="0 0 32 32"><path d="M4 22 H28" stroke="${AI}" stroke-width="2" stroke-linecap="round" opacity=".35"/><circle cx="23" cy="16" r="3.2" fill="${AI}"/><circle cx="14" cy="16" r="2.4" fill="none" stroke="${AI}" stroke-width="1.6"/><circle cx="7" cy="16" r="2.4" fill="none" stroke="${AI}" stroke-width="1.6"/><path d="M26.5 12.5 L29 16 L26.5 19.5" fill="none" stroke="${AI}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    hit: `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="none" stroke="${AI}" stroke-width="2.2"/><path d="M11 16.5 L14.5 20 L21.5 12.5" fill="none" stroke="${AI}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    gold: `<svg viewBox="0 0 32 32"><rect x="5" y="5" width="22" height="22" rx="6" fill="rgba(232,190,70,.18)" stroke="#C9961A" stroke-width="2.6"/><path d="M16 10.5 L17.6 14.2 L21.6 14.6 L18.6 17.3 L19.5 21.2 L16 19.2 L12.5 21.2 L13.4 17.3 L10.4 14.6 L14.4 14.2 Z" fill="#C9961A"/></svg>`,
  };
  // 脚質・通過順の絵の3案（2026-09-25 ユーザー「ここのイラストも別案にしたい」。前は ○○●＞ の並び＝style_old）
  //   i1 位置の移り変わり（コーナーごとの位置の図を小さくした折れ線）／i2 走る馬の横顔＋風の線／i3 コーナーのカーブ上の馬群
  AP_ICON.style_i1 = `<svg viewBox="0 0 32 32"><path d="M4 26 H28" stroke="${AI}" stroke-width="1.6" opacity=".3"/><path d="M5 8 L12 11 L19 17 L27 22" fill="none" stroke="${AI}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="5" cy="8" r="2.2" fill="#fff" stroke="${AI}" stroke-width="1.8"/><circle cx="12" cy="11" r="2.2" fill="#fff" stroke="${AI}" stroke-width="1.8"/><circle cx="19" cy="17" r="2.2" fill="#fff" stroke="${AI}" stroke-width="1.8"/><circle cx="27" cy="22" r="3.4" fill="${AI}"/></svg>`;
  AP_ICON.style_i2 = `<svg viewBox="0 0 32 32"><g transform="translate(5 2) scale(.85)"><path d="M5 27 C5 19 8 13 14 10 L16 5 L19 9 C23 9 27 13 28 17 C28.5 19 27 20.5 25 20 L21 18.5 C19 20 18 23 18 27 Z" fill="${AI}"/><circle cx="21.5" cy="13" r="1.3" fill="#fff"/></g><path d="M1.5 12 H7 M0.5 17 H6 M2 22 H7" stroke="${AI}" stroke-width="2" stroke-linecap="round"/></svg>`;
  AP_ICON.style_i3 = `<svg viewBox="0 0 32 32"><path d="M3 28 A24 24 0 0 1 28 4" fill="none" stroke="${AI}" stroke-width="1.8" opacity=".35"/><path d="M8 28 A19 19 0 0 1 28 9" fill="none" stroke="${AI}" stroke-width="1.2" opacity=".2"/><circle cx="8.5" cy="21" r="2.4" fill="none" stroke="${AI}" stroke-width="1.7"/><circle cx="13" cy="15.5" r="2.4" fill="none" stroke="${AI}" stroke-width="1.7"/><circle cx="18.5" cy="11" r="2.4" fill="none" stroke="${AI}" stroke-width="1.7"/><circle cx="25" cy="7.5" r="3.4" fill="${AI}"/></svg>`;
  const HEAD = 'M5 27 C5 19 8 13 14 10 L16 5 L19 9 C23 9 27 13 28 17 C28.5 19 27 20.5 25 20 L21 18.5 C19 20 18 23 18 27 Z';
  AP_ICON.turn = `<svg viewBox="0 0 32 32"><ellipse cx="16" cy="16" rx="12.5" ry="9" fill="none" stroke="${AI}" stroke-width="2.2" stroke-dasharray="46 8"/><path d="M22.5 5.2 L27.5 7.4 L23.5 11" fill="none" stroke="${AI}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  AP_ICON.style_j1 = `<svg viewBox="0 0 32 32"><path d="M1 27 H31" stroke="${AI}" stroke-width="1.4" opacity=".3"/><g transform="translate(-1.5 14) scale(.4)"><path d="${HEAD}" fill="none" stroke="${AI}" stroke-width="4.4" stroke-linejoin="round"/></g><g transform="translate(8 14) scale(.4)"><path d="${HEAD}" fill="none" stroke="${AI}" stroke-width="4.4" stroke-linejoin="round"/></g><g transform="translate(17 10.5) scale(.5)"><path d="${HEAD}" fill="${AI}"/></g></svg>`;
  AP_ICON.style_j2 = `<svg viewBox="0 0 32 32"><rect x="2.5" y="14" width="7" height="8" rx="1.8" fill="none" stroke="${AI}" stroke-width="1.8"/><rect x="11.5" y="14" width="7" height="8" rx="1.8" fill="none" stroke="${AI}" stroke-width="1.8"/><rect x="20.5" y="12.5" width="9" height="11" rx="2.2" fill="${AI}"/><path d="M5 9 H25 M21.5 5.8 L25 9 L21.5 12.2" fill="none" stroke="${AI}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/></svg>`;
  AP_ICON.style_j3 = `<svg viewBox="0 0 32 32"><path d="M3 27 C3 15 11 7 25 7" fill="none" stroke="${AI}" stroke-width="2.2" stroke-linecap="round"/><path d="M8 28 C8 19 14 13 26 13" fill="none" stroke="${AI}" stroke-width="1.4" stroke-linecap="round" opacity=".35"/><path d="M27 3 V15" stroke="${AI}" stroke-width="1.8"/><path d="M27 3.5 L31 5.5 L27 7.5 Z" fill="${AI}"/><circle cx="15.5" cy="12" r="3.2" fill="${AI}"/><circle cx="9" cy="18.5" r="2.2" fill="none" stroke="${AI}" stroke-width="1.6"/></svg>`;
  // 脚質の絵は A＝馬の隊列（style_j1）に決定（2026-09-25 ユーザー。折れ線・番号札・コーナーの旗・走る馬は選ばなかった）
  // 回りの絵は R1＝上から見たコースを走る馬（馬の向きで回る向き。左回りは左右反転）に決定（2026-09-25 ユーザー。
  //   時計・文字の札と、前の円の矢印・楕円の矢印・曲がる標識は選ばなかった）。
  //   同日、今日のコース・競馬場・距離の3行の絵は、案を出す前（course・pct）に戻した（ユーザー「変更前に戻して」）
  const TURN = {
    R1: (left) => `<g transform="${left ? 'translate(32 0) scale(-1 1)' : ''}"><ellipse cx="16" cy="18" rx="13" ry="9" fill="none" stroke="${AI}" stroke-width="1.8" opacity=".4"/><g transform="translate(9.5 1) scale(.5)"><path d="${HEAD}" fill="${AI}"/></g><path d="M5.5 11.5 L3 14.5" stroke="${AI}" stroke-width="1.6" stroke-linecap="round" opacity=".5"/></g>`,
    R2: (left) => `<circle cx="16" cy="16" r="10" fill="none" stroke="${AI}" stroke-width="2"/><path d="M16 10 V16 L${left ? 12 : 20} 19" fill="none" stroke="${AI}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><g transform="${left ? 'translate(32 0) scale(-1 1)' : ''}"><path d="M9 3.5 A13.5 13.5 0 0 1 27.5 8" fill="none" stroke="${AI}" stroke-width="2.2" stroke-linecap="round"/><path d="M24 4.2 L28 8.4 L22.6 9.6" fill="none" stroke="${AI}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>`,
    R3: (left) => `<rect x="4" y="4" width="24" height="24" rx="7" fill="${AI}"/><text x="16" y="21.6" text-anchor="middle" font-size="15" font-weight="800" fill="#fff" font-family="-apple-system,'Hiragino Sans',sans-serif">${left ? '左' : '右'}</text>`,
  };
  // 3行を別々の絵で描いた組（S1〜S3）は、どれも分かりづらいとのことで外した（2026-09-25）
  const cIcon = (k) => TURN.R1(k === 'c_turnL');
  const apIc = (k) => (k.startsWith('c_') ? `<i class="ap-ic"><svg viewBox="0 0 32 32">${cIcon(k)}</svg></i>` : apIc0(k));
  const apIc0 = (k) => `<i class="ap-ic">${(k === 'style' ? AP_ICON.style_j1 : AP_ICON[k]) || R_ICON[k] || E5_ICON[k] || ''}</i>`;
  // 1行ぶん。v は [左の中身, 右の中身]。ic は絵、cap は下の小さな説明（左右で違えば配列）
  // opt.k は行の名前（金の枠を付ける目印。例 odds・here・run0・e5-jockey）
  let CUR = { hs: [], fr: {} };   // いま比べている2頭と、馬ごとの金の枠の付いた行（vCompare が毎回作る）
  function cmpRow(v, opt = {}) {
    const cap = (i) => (Array.isArray(opt.cap) ? opt.cap[i] : opt.cap);
    const cell = (html, i) => {
      const h = CUR.hs[i];
      const on = opt.k && h && CUR.fr[h.number] && CUR.fr[h.number].has(opt.k);
      const k = opt.k && h ? ` data-k="${opt.k}" data-n="${h.number}"` : '';
      return `<div class="ap-c${on ? ' gd-on' : ''}"${k}>${opt.ic ? apIc(opt.ic) : ''}${html == null || html === '' ? '<span class="ap-dash">—</span>' : html}${cap(i) ? `<small class="ap-cap">${cap(i)}</small>` : ''}</div>`;
    };
    return `<div class="ap-row${opt.hero ? ' hero' : ''}">${v.map(cell).join('')}</div>`;
  }
  // 絞り込みで付けた金（gold の1件）が、この画面のどの行にあたるか。当たる行が無ければ null
  //   ページの中の部品の順番（idx）は、絞り込みの GOLD_UNIT の並び（本番 yoso.js）に合わせてある
  function goldKey(g, flowLab, here, all) {
    const head = g.head || '';
    const text = g.text || '';
    if (g.page === 'sum') return `run${g.idx}`;                               // 直近5走の札 → その走
    if (/^run\d$/.test(g.page)) return `run${g.page.slice(3)}`;              // 前走〜5走前のページ → その走
    if (g.page === 'course') return g.idx >= 4 ? `e5-${['prev', 'jockey', 'sire', 'trainer', 'damsire'][g.idx - 4]}` : null;
    if (g.page === 'tenkai') return g.idx >= 14 ? 'style' : g.idx >= 6 ? 'gate' : null;
    if (g.page === 'p1') {
      if (head === 'コース適性') {
        if (text.includes(here)) return 'here';
        if (text.includes(all)) return 'all';
        if (/[左右]回り/.test(text)) return 'turn';
        if (text.includes(here.replace(/\d+m$/, ''))) return 'track';
        return null;
      }
      if (head === 'レースの型べつ成績') return text.replace(/\s.*$/, '').replace('×', '・') === flowLab ? 'flow' : null;
      return ['odds', 'pop', 'car'][g.idx] || null;
    }
    return null;
  }
  function cmpSec(title, rows, note) {
    return `<section class="ap-sec"><h3>${esc(title)}</h3>${note ? `<p class="ap-note">${note}</p>` : ''}${rows.join('')}</section>`;
  }
  const bigNum = (n, u) => `<span class="ap-bn"><b class="ap-big">${n}</b>${u ? `<small class="ap-u">${u}</small>` : ''}</span>`;
  const midNum = (n, u, sub) => `<span class="ap-bn"><b class="ap-mid">${n}</b>${u ? `<small class="ap-u2">${u}</small>` : ''}${sub ? `<small class="ap-sub2">${sub}</small>` : ''}</span>`;
  // 直近5走の1走ぶん。本番の過去走のページの項目をまとめて出す（2026-09-25 ユーザー「もっと情報を入れたい」）
  function cmpRun(h, r, i) {
    const d = summaryRun(h, r, i);
    const cup = d.fin >= 1 && d.fin <= 3 ? e5Cup(d.fin, 18) : '';
    const up = `${esc(d.up)}${d.rk != null ? `<small>${d.rk}位</small>` : ''}`;
    // 勝ち馬の行は1行に収める（2026-09-25 ユーザー「ここ2段は嫌だ」）。名前と最高成績の長さで字を小さくする
    const wLen = [...String(d.winner || '')].length + (d.bpHtml ? 5 : 0) + 3;
    const wFs = wLen <= 13 ? 11.5 : wLen <= 16 ? 10.5 : 9.5;
    const li = (ic, html, cls = '') => `<span class="ap-ri ${cls}">${apIc(ic)}<span>${html}</span></span>`;
    return `<div class="ap-run ${d.band ? `bd-${d.band}` : ''}" data-run="${h.number}:${i}" role="button" tabindex="0" aria-label="${esc(h.name)} ${RUN_LABEL[i]}の詳しいページ">
        <div class="ap-r1">${cup}<b class="ap-fin ${d.finMd}">${esc(d.finTxt)}</b><small class="ap-u2">着</small>
          ${d.sc ? `<span class="ap-sc sc-a">${esc(d.sc)}</span>` : ''}<span class="ap-mg ${d.band}">${esc(d.mgTxt)}<small>秒</small></span></div>
        <div class="ap-r2"><span class="bt-num">${esc(d.date)}</span><span>${esc(d.track)}</span>
          <span class="ap-sf ${d.sf}">${esc(d.sfTxt)}<b>${esc(d.dist)}</b></span><span>${esc(d.going)}</span></div>
        <div class="ap-r3">${d.clsHtml}<span class="ap-rn">${esc(d.rn)}</span>${d.lv ? `<span class="race20 ap-lv">${d.lv}</span>` : ''}</div>
        <div class="ap-r4">
          ${li('pop', `<b>${esc(d.pop)}</b>人気<small>／${esc(d.field)}頭</small>`)}
          ${li('time', `<b class="${d.tg}">${esc(d.time)}</b>`)}
          ${li('up', `<b class="${d.rkMd}">${up}</b>`)}
          ${li('style', `<span class="ap-cn">${d.corners.map((c) => `<i>${esc(c)}</i>`).join('')}</span>${d.sc ? `<span class="ap-sc sc-b">${esc(d.sc)}</span>` : ''}${d.st ? `<small class="ap-st">${d.st}</small>` : ''}`)}
          ${li('jockey', `${esc(d.jockey)}<small>${esc(d.weight)}kg</small>`)}
          ${li('bw', `<b>${esc(d.bw)}</b><small>kg</small>`)}
        </div>
        <div class="ap-r5" style="font-size:${wFs}px"><small>${d.winLab}</small><span class="ap-wn">${esc(d.winner)}</span>${d.bpHtml ? `<span class="race20 mx">${d.bpHtml}</span>` : ''}</div>
      </div>`;
  }
  let cmpWait = null;
  function vCompare() {
    const t = S.t;
    const mk = MARKS3[S.step];
    const L = byNum(t.left), R = byNum(t.right);
    const HS = [L, R];
    const gold = goldLoad();
    const A0 = aptData(L);
    // 金の見せ方は G1：絞り込みで付けた金を、表の同じ項目に金の枠で出す（2026-09-25 ユーザー決定。
    //   この画面で押して付ける G2・両方の G3 は選ばなかった）
    const pick = (g) => g.page !== 'cmp';
    CUR = { hs: HS, fr: {} };
    const rest = {};
    HS.forEach((h) => {
      CUR.fr[h.number] = new Set();
      rest[h.number] = [];
      (gold[h.number] || []).filter(pick).forEach((g) => {
        const k = goldKey(g, A0.flowLab, A0.here, A0.all);
        if (k) CUR.fr[h.number].add(k); else rest[h.number].push(g);
      });
    });
    const car = (h) => {
      const all = (h.past_runs || []).concat(h.career_runs || []);
      return all.length ? all.reduce((c, r) => { const f = parseInt(r.finish, 10); c[(f >= 1 && f <= 3) ? f - 1 : 3] += 1; return c; }, [0, 0, 0, 0]) : null;
    };
    // ---- 上の2列（Apple の機種の欄） ----
    const top = HS.map((h, i) => `<div class="ap-top dl-side ${i ? 'r' : 'l'}" data-side="${h.number}">
        <div class="ap-tn" data-hist="${h.number}">${umaBox(h.number, h.gate)}<b>${esc(h.name)}</b><i class="ap-chev">›</i></div>
        <div class="ap-ts">${esc(h.sex_age || '')}・${esc(String(h.weight_carried ?? '').replace(/\.0$/, ''))}kg・${esc(h.jockey || '')}</div>
      </div>`).join('');
    // ---- あなたが良いと思った所（絞り込みの金） ----
    const cnt = HS.map((h) => CUR.fr[h.number].size + rest[h.number].length);
    const gCap = '絞り込みで金の枠を付けた所。下の表の中にも金の枠で出す';
    const gRows = [cmpRow(cnt.map((c) => bigNum(c, 'つ')), { hero: true, ic: 'gold', cap: gCap })];
    const gl = HS.map((h) => rest[h.number]);
    if (gl[0].length || gl[1].length) gRows.push('<div class="ap-rh">この画面に出ていない所</div>');
    for (let i = 0; i < Math.max(gl[0].length, gl[1].length); i += 1) {
      gRows.push(cmpRow(gl.map((g) => (g[i] ? `<span class="ap-gd"><i>${esc(g[i].label)}</i>${g[i].head ? `<small>${esc(g[i].head)}</small>` : ''}<span>${esc(g[i].text)}</span></span>` : null))));
    }
    const gSec = cmpSec('あなたが良いと思った所', gRows).replace('<section class="ap-sec">', '<section class="ap-sec ap-gsec">');
    // ---- 概要 ----
    const cars = HS.map(car);
    // 2026-09-25 ユーザー指示で「単勝オッズ」「通算（1着-2着-3着-着外）」の説明と、通算の3着内の割合の行を外した
    const over = cmpSec('概要', [
      cmpRow(HS.map((h) => (h.odds != null ? bigNum(h.odds.toFixed(1), '倍') : null)), { hero: true, ic: 'odds', k: 'odds' }),
      cmpRow(HS.map((h) => (h.popularity != null ? midNum(h.popularity, '番人気') : null)), { ic: 'pop', k: 'pop' }),
      cmpRow(cars.map((c) => (c ? `<span class="ap-rec">${rec(c)}</span>` : null)), { ic: 'rec', k: 'car' }),
    ]);
    // ---- コース適性 ----
    const A = HS.map(aptData);
    // コース適性は、基本のページの輪と同じ「好走」で数える（course_record.apt。2026-09-25：3着内で数えていたら、
    //   同じ馬で輪は「0%・0/1走」、この画面は「100%・1/1走」と食い違った＝サムシングニューの中山ダ1800m 2着）
    const AP = HS.map((h) => (h.course_record || {}).apt || {});
    const gp = (o) => (o && o.n ? { p: Math.round((o.good / o.n) * 100), top: o.good, n: o.n } : null);
    const tdy = (arr) => (arr || []).find((x) => x.today) || null;
    const here = AP.map((a) => gp(a.course));
    const trk = AP.map((a) => gp(a.track));
    const dst = AP.map((a) => gp(tdy(a.dist)));
    const trn = AP.map((a) => tdy(a.turn));
    const race0 = site.race || {};
    const trkLab = `${race0.track || ''}${SURF_LAB(race0.surface)}`;
    // 3行の絵は先頭の行だけ（下の2行は絵なし・Apple と同じ）に決定（2026-09-25 ユーザー。3行とも同じ絵・3行を別々の絵は選ばなかった）
    const sameIc = null;
    const gCnt = (x, lab) => `${lab}の好走${x ? `・${x.top}/${x.n}走` : '・走っていない'}`;
    const course = cmpSec('コース適性', [
      cmpRow(here.map((x) => (x ? bigNum(x.p, '%') : null)), { hero: true, ic: 'course', k: 'here', cap: here.map((x) => gCnt(x, esc(A[0].here))) }),
      cmpRow(trk.map((x) => (x ? midNum(x.p, '%', `${x.top}/${x.n}走`) : null)), { ic: sameIc, cap: `${esc(trkLab)}の好走`, k: 'track' }),
      cmpRow(dst.map((x) => (x ? midNum(x.p, '%', `${x.top}/${x.n}走`) : null)), { ic: sameIc, cap: `${esc(A[0].all)}の好走`, k: 'all' }),
      cmpRow(trn.map((t) => (t && t.n ? midNum(Math.round((t.good / t.n) * 100), '%', `${t.good}/${t.n}走`) : null)), { ic: String((trn[0] || {}).label || '').startsWith('左') ? 'c_turnL' : 'c_turn', cap: trn.map((t) => `${esc((t && t.label) || '今日の回り')}の好走`), k: 'turn' }),
    ], `好走＝1着か、勝ち馬と${SURF_LAB(race0.surface) === '芝' ? '0.4' : '0.6'}秒差以内`);   // 2026-09-25 ユーザー「もっと短く」
    // ---- 今日の流れ ----
    const rts = A.map((a) => a.rt);
    const flow = cmpSec('今日の流れ', [
      cmpRow(rts.map((r) => (r && r.n ? bigNum(Math.round(r.top3_pct), '%') : null)), { hero: true, ic: 'flow', k: 'flow', cap: rts.map((r) => `${esc(A[0].flowLab)}での3着内${r && r.n ? `・${r.top3}/${r.n}走` : '・走っていない'}`) }),
      cmpRow(A.map((a) => `<span class="ap-bn"><b class="ap-mid ap-jp">${esc(a.style)}</b>${tkG(a.styleG)}</span>`), { ic: 'style', cap: '脚質と今日の評価', k: 'style' }),
      cmpRow(A.map((a) => `<span class="ap-bn"><b class="ap-mid">${a.gate}</b><small class="ap-u2">枠</small>${tkG(a.gateG)}</span>`), { ic: 'gate', cap: '枠と今日の評価', k: 'gate' }),
      cmpRow(A.map((a) => {
        const on = Object.keys(a.hitLab).filter((k) => a.lit[k]).map((k) => `<b>${a.hitLab[k]}</b>`);
        return on.length ? `<span class="ap-chips">${on.join('')}</span>` : null;
      }), { ic: 'hit', cap: '今回と同じ条件で好走したもの', k: 'hit' }),
    ]);
    // ---- 騎手・血統（このコースでの3着内の割合） ----
    let blood = '';
    if (site.course_entities) {
      // 前走コースの行は data/courses/{course_id}.json を読んでから出す。本番はコースのページを開いた時だけ読むので、
      //   ここでも読み、読み終えたら描き直す（2026-09-25：読まないまま「このコースで0走」と出ていた）
      if (e5Course == null) {
        e5Load();
        clearInterval(cmpWait);
        cmpWait = setInterval(() => {
          if (e5Course == null) return;
          clearInterval(cmpWait);
          if (!S || S.screen !== 'duel') return;
          const b0 = document.getElementById('ap-body');
          const y = b0 ? b0.scrollTop : 0;
          render();
          const b1 = document.getElementById('ap-body');
          if (b1) b1.scrollTop = y;
        }, 150);
      }
      const E = HS.map(e5Rows);
      blood = cmpSec('騎手・血統', E[0].map((r0, k) => {
        const rr = [r0, E[1][k]];
        // 2026-09-25 ユーザー「騎手・血統部分も上位の数字は金銀銅にして」。順位はこのレースの出走馬の中で（本番のコースのページと同じ）
        const md = (r) => (r.rank >= 1 && r.rank <= 3 ? ` md${r.rank}` : '');
        return cmpRow(rr.map((r) => `<span class="ap-e5">${e5Name(r)}${r.v
          ? `<span class="ap-bn${md(r)}">${r.rank && r.rank <= 3 ? `<span class="ap-cup">${e5Cup(r.rank, 20)}</span>` : ''}<b class="ap-mid">${r.v[3].toFixed(1)}</b><small class="ap-u2">%</small><small class="ap-sub2">${r.v[0]}走${r.rank ? `・${r.rank}位/${r.of}頭` : r.thin ? '・走数少' : ''}</small></span>`
          : `<span class="ap-dash">${r.wait ? '読み込み中' : r.dim === 'prev' && !r.key ? '前走なし' : 'このコースで0走'}</span>`}</span>`), { ic: r0.dim, cap: `${E5_SHORT[r0.dim]}・このコースの3着内`, k: `e5-${r0.dim}` });
      }));
    }
    // ---- 直近5走 ----
    const runs = HS.map((h) => (h.past_runs || []).slice(0, 5));
    const rRows = [];
    for (let i = 0; i < 5; i += 1) {
      if (!runs[0][i] && !runs[1][i]) break;
      rRows.push(`<div class="ap-rh">${RUN_LABEL[i]}</div>`);
      rRows.push(cmpRow(HS.map((h, s) => (runs[s][i] ? cmpRun(h, runs[s][i], i) : null)), { k: `run${i}` }));
    }
    const recent = cmpSec('直近5走', rRows);
    return `<div class="ap">
        <div class="ap-bar"><div><small>2 / 2　印を決める</small><b>${mk} を決めよう</b></div><span class="ap-left">あと${t.total - t.done}回</span>
          <button type="button" class="ap-quit" data-act="quit">やめる</button></div>
        <div class="ap-body" id="ap-body">
          <div class="ap-tops">${top}</div>
          <div class="ap-stk">${HS.map((h) => `<div data-hist="${h.number}">${umaBox(h.number, h.gate, 'sm')}<b>${esc(h.name)}</b><i class="ap-chev">›</i></div>`).join('')}</div>
          ${gSec}${over}${course}${flow}${blood}${recent}
        </div>
        <div class="ap-pick">${HS.map((h) => `<button type="button" class="ap-go" data-pick="${h.number}"><span>${esc(h.name)}</span>この馬を選ぶ</button>`).join('')}</div>
      </div>`;
  }
  // 勝ち馬の行：名前が「…」で切れなくなるまで、その行の字を0.5pxずつ小さくする（下限8.5px）。
  //   字数だけで決めると、iPhone の幅で4頭が切れた（2026-09-25・390px で確認）
  function fitWin() {
    document.querySelectorAll('.ap-r5').forEach((r) => {
      const wn = r.querySelector('.ap-wn');
      if (!wn) return;
      r.classList.remove('nolab');   // 「勝ち」を出した状態で測り直す（外したまま測ると、入ったと見なして戻してしまう）
      let f = parseFloat(r.style.fontSize) || 11.5;
      while (wn.scrollWidth > wn.clientWidth && f > 8.5) { f -= 0.5; r.style.fontSize = `${f}px`; }
      // それでも切れるときは「勝ち」「2着」の文字を外して、名前を優先する（例：ビービークローサー＋最高成績）
      if (wn.scrollWidth > wn.clientWidth) r.classList.add('nolab');
    });
  }
  //   描画の合図（requestAnimationFrame）は画面が裏にあると止まるので、短い待ち時間でまとめて動かす
  let fitT = null;
  const fitSoon = () => { clearTimeout(fitT); fitT = setTimeout(fitWin, 60); };
  new MutationObserver(() => { if (document.querySelector('.ap-r5')) fitSoon(); })
    .observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', fitSoon);
  // 上の2列が画面から出たら、2頭の名前の帯を上に出す（Apple の比較ページと同じ）
  document.addEventListener('scroll', (e) => {
    const b = e.target;
    if (!b || b.id !== 'ap-body') return;
    const tops = b.querySelector('.ap-tops');
    b.classList.toggle('stuck', Boolean(tops) && b.scrollTop > tops.offsetTop + tops.offsetHeight - 8);
  }, true);

  // ---------- 馬名を押したら、その馬の詳しいページを上に重ねて開く（2026-09-25 ユーザー「馬名を押したら詳細が確認できるように」） ----------
  //   中身は絞り込みのカードと同じページ（基本・コース・展開・直近5走・前走〜5走前・全戦績）。上の札で切り替える。
  //   絞り込みで付けた金は、ここでも同じ部品に金の枠で出す（見るだけ。ここでは付け外ししない）。
  //   前は名前を押すと「全戦績」だけが下から出ていた（histSheet。2026-09-25 に外した）
  let DT = null;
  function detailPaint(pe, h, pg) {
    goldCols(pe);
    const units = goldUnits(pe);
    (goldLoad()[h.number] || []).filter((x) => x.page === pgKey(pg)).forEach((x) => { const u = units[x.idx]; if (u) u.classList.add('gd-u', 'gd-on'); });
    goldTwins(pe);
  }
  function detailRender() {
    const { h, i } = DT;
    const pages = pagesOf(h);
    const pg = pages[i];
    DT.el.innerHTML = `<div class="ap-dt-bar"><div class="ap-dt-nm">${umaBox(h.number, h.gate)}<b>${esc(h.name)}</b></div>
        <button type="button" class="ap-quit" data-dt="close">閉じる</button></div>
      <div class="ap-dt-tabs" role="tablist">${pages.map((p, k) => `<button type="button" role="tab" class="${k === i ? 'on' : ''}" data-dt="${k}">${esc(p.label)}</button>`).join('')}</div>
      <div class="ap-dt-body" id="ap-dt-body"><div class="ap-dt-page">${pageHtml(h, pg)}</div></div>
      <div class="ap-dt-nav"><button type="button" data-dt="prev"${i === 0 ? ' disabled' : ''}>‹ 前のページ</button><button type="button" data-dt="next"${i === pages.length - 1 ? ' disabled' : ''}>次のページ ›</button></div>`;
    detailPaint(DT.el.querySelector('.ap-dt-page'), h, pg);
    const on = DT.el.querySelector('.ap-dt-tabs .on');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  function openDetail(h, first = 0) {
    if (!root || !h) return;
    DT = { h, i: first, el: document.createElement('div') };
    DT.el.className = 'ap-dt';
    root.appendChild(DT.el);
    detailRender();
  }
  document.addEventListener('click', (e) => {
    // 比べる画面の馬名 → 詳細を開く（本番の「全戦績だけのシート」より先に受ける）
    const nm = e.target.closest && e.target.closest('.ap [data-hist]');
    if (nm && !DT) { e.stopPropagation(); e.preventDefault(); openDetail(byNum(Number(nm.dataset.hist))); return; }
    // 直近5走の札 → その馬の、その走のページ（前走〜5走前）を開く（2026-09-25 ユーザー「ここタップしたら詳細ページが開くように」）
    const rn = e.target.closest && e.target.closest('.ap .ap-run[data-run]');
    if (rn && !DT) {
      e.stopPropagation(); e.preventDefault();
      const [n, i] = rn.dataset.run.split(':').map(Number);
      const h = byNum(n);
      const at = pagesOf(h).findIndex((pg) => pg.k === 'run' && pg.i === i);
      openDetail(h, at >= 0 ? at : 0);
      return;
    }
    const b = DT && e.target.closest && e.target.closest('[data-dt]');
    if (!b) return;
    e.stopPropagation();
    const a = b.dataset.dt;
    if (a === 'close') { DT.el.remove(); DT = null; return; }
    const n = pagesOf(DT.h).length;
    const to = a === 'prev' ? DT.i - 1 : a === 'next' ? DT.i + 1 : Number(a);
    if (to < 0 || to >= n) return;
    DT.i = to;
    detailRender();
    const body = document.getElementById('ap-dt-body');
    if (body) body.scrollTop = 0;
  }, true);
  // 札はキーボードの Enter でも開く
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || DT) return;
    const rn = e.target.closest && e.target.closest('.ap .ap-run[data-run]');
    if (rn) rn.click();
  });

  function vMarked() {
    const mk = MARKS3[S.step];
    const h = byNum(S.lastWinner);
    const nx = nextStep(S.step + 1);
    const more = nx < MARKS3.length && pool().length > 0;
    return `${head('2 / 2　印を決める', `${mk} が決まりました`, 100)}
      <div class="yf-mid">
        <div class="yf-big ${KCLS[mk]}">${mk}</div>
        <div class="who">${umaBox(h.number, h.gate)}${esc(h.name)}</div>
        <div class="s">${esc(h.jockey)}／${h.odds != null ? h.odds.toFixed(1) : '—'}倍 ${esc(h.popularity ?? '—')}人気</div>
      </div>
      <div class="yf-foot">
        ${more ? `<button type="button" class="yf-btn" data-act="next">次の印へ（${MARKS3[nx]}）</button>` : ''}
        <button type="button" class="yf-btn ${more ? 'sub' : ''}" data-act="done">ここで終える</button>
      </div>`;
  }

  // ---------- 消し馬 ----------
  function turn(d) {
    const n = pagesOf(Q[S.idx]).length;
    const p = S.page + d;
    if (p < 0 || p >= n) {
      // 端のページでさらに押したときは、札を小さく揺らして「これ以上ない」を伝える（iPhoneの端で跳ね返る動きに寄せる）
      const c = document.getElementById('yf-card');
      if (c) { c.classList.remove('nudge-l', 'nudge-r'); void c.offsetWidth; c.classList.add(d > 0 ? 'nudge-r' : 'nudge-l'); }
      return;
    }
    goPage(p, d);
  }

  // ---------- Apple らしい動き（2026-09-17 ユーザー「もっと心地よいスワイプやタップ。Apple感がほしい」） ----------
  //   ・ページ送り：前のページが少し左へ下がり、次のページが右から滑り込む（iPhoneの画面遷移と同じ曲線）
  //   ・払う：指の位置を中心に傾く。払う量に合わせて✓／消の印が大きくなり、後ろの札がせり上がる
  //   ・離す：速さを引き継いで飛んでいく。足りなければバネのように少し行き過ぎて戻る
  //   ・しきい値を越えた瞬間と、決まった瞬間に、iPhone の軽い振動（iOS 18 の Safari の切り替えスイッチを使う。実機未確認）
  //   ・下に払う：札が下がり、確認は画面の下から出る iPhone の選択シートに
  const EASE_IOS = 'cubic-bezier(.32,.72,0,1)';
  // 後ろの札が休んでいる位置（少し下・少し小さい）。CSS の .yf-card.back と同じ値
  const BACK_Y = 12, BACK_S = 0.955;
  const backTf = (y, sc) => `translateY(${y.toFixed(2)}px) scale(${sc.toFixed(4)})`;
  // iPhone と同じ「ばね」の動き（UIKit の spring：response＝揺れの周期、damping＝減衰の強さ）。
  //   CSS の決まった曲線ではなく、ばねの式から途中の形を細かく作って Web Animations で動かす
  function springFrames(fn, { response = 0.42, damping = 0.86, v0 = 0 } = {}) {
    const w = (2 * Math.PI) / response;
    const zw = damping * w;
    const wd = w * Math.sqrt(1 - damping * damping);
    const dur = Math.min(1.2, (response * 4) / (damping * 2 * Math.PI) * 1.9);
    const N = 48;
    const frames = [];
    for (let i = 0; i <= N; i += 1) {
      const t = (dur * i) / N;
      // 0→1 へ向かう変位（初速 v0 は 1秒あたりの進み）
      const e = Math.exp(-zw * t);
      const x = 1 - e * (Math.cos(wd * t) + ((zw - v0) / wd) * Math.sin(wd * t));
      frames.push({ ...fn(i === N ? 1 : x), offset: i / N });
    }
    return { frames, dur: dur * 1000 };
  }
  function springTo(el, fn, opts, done) {
    const { frames, dur } = springFrames(fn, opts);
    const a = el.animate(frames, { duration: dur, easing: 'linear', fill: 'forwards' });
    a.onfinish = () => { if (done) done(); a.cancel(); };
    return a;
  }
  function haptic() {
    const i = document.getElementById('yf-hap');
    if (i && i.parentElement) { try { i.parentElement.click(); } catch (_) { /* 振動できない端末では何もしない */ } }
  }
  // 最後にページを送った時刻。送った直後の押し直しを、行の押し間違いとして扱わないために使う
  let lastTurnAt = 0;
  const TURN_GUARD_MS = 700;
  function goPage(p, d) {
    lastTurnAt = performance.now();
    const oldEl = document.getElementById('yf-page');
    const snap = oldEl ? oldEl.cloneNode(true) : null;
    const box = oldEl ? { top: oldEl.offsetTop, height: oldEl.offsetHeight, scroll: oldEl.scrollTop } : null;
    S.page = p;
    render();
    const card = document.getElementById('yf-card');
    const nu = document.getElementById('yf-page');
    if (!card || !nu || !snap) return;
    snap.removeAttribute('id');
    snap.classList.add('yf-old', d > 0 ? 'out-l' : 'out-r');
    snap.style.top = `${box.top}px`; snap.style.height = `${box.height}px`;
    card.appendChild(snap);
    snap.scrollTop = box.scroll;
    nu.classList.add(d > 0 ? 'in-r' : 'in-l');
    setTimeout(() => { snap.remove(); nu.classList.remove('in-r', 'in-l'); }, 420);
  }
  function decideApple(mark, vx, vy, rot, dy) {
    const card = document.getElementById('yf-card');
    if (!card || card.dataset.gone) return;
    card.dataset.gone = '1';
    const back = document.getElementById('yf-back');
    const dir = mark === '✓' ? 1 : -1;
    const w = window.innerWidth;
    const speed = Math.max(Math.abs(vx), 1.2);                 // 画面の点／ミリ秒
    const t = Math.max(0.16, Math.min(0.32, (w * 0.9) / speed / 1000));
    // 払った札は「抜け殻」にして飛ばす。指はもう次の札をつかめる（速く続けて払っても待たされない）
    card.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
    card.removeAttribute('id');
    card.style.pointerEvents = 'none';
    card.classList.remove('spring', 'press');
    card.style.transition = `transform ${t}s cubic-bezier(.2,.6,.35,1), opacity ${t}s linear`;
    card.style.transform = `translate(${dir * w * 1.25}px, ${dy + vy * t * 1000}px) rotate(${rot * 2.2}deg)`;
    card.style.opacity = '.4';
    setTimeout(() => card.remove(), t * 1000 + 30);
    haptic();
    S.my[Q[S.idx].number] = mark;
    S.idx += 1; S.page = 0;
    if (S.idx >= Q.length || !back) { setTimeout(() => go('ask'), t * 1000); return; }
    // 後ろの札は、払った札が抜けるのと同時に、ばねの動きで前へせり上がる。
    //   せり上がる札をそのまま「前の札」にする（作り直さないので、動きの途中で絵が替わらない）
    const p0 = Number(back.dataset.p || 0);
    back.getAnimations().forEach((a) => a.cancel());
    back.style.transition = 'none';
    back.style.transform = '';
    back.style.transformOrigin = '50% 100%';
    const v = Math.min(3, Math.abs(vx) * 2.2);          // 払った勢いを、せり上がりの初速に少し分ける
    springTo(back, (x) => {
      const q = p0 + (1 - p0) * x;
      return { transform: backTf(BACK_Y * (1 - q), BACK_S + (1 - BACK_S) * q) };
    }, { response: 0.5, damping: 0.8, v0: v }, () => { back.style.transformOrigin = ''; });
    const sh = back.querySelector('.yf-shade');
    if (sh) {
      const o0 = Number(getComputedStyle(sh).opacity);
      sh.style.transition = 'none';
      sh.animate([{ opacity: o0 }, { opacity: 0 }], { duration: 260, easing: 'ease-out', fill: 'forwards' }).onfinish = () => sh.remove();
    }
    promoteBack(back);
  }
  // 後ろの札を、その場で前の札に変える（中身・位置・動きはそのまま）
  function promoteBack(el) {
    el.id = 'yf-card';
    el.classList.remove('back', 'ready', 'pre', 'arrive');
    el.removeAttribute('aria-hidden');
    delete el.dataset.n;
    delete el.dataset.p;
    const pg = el.querySelector('.yf-page');
    if (pg) pg.id = 'yf-page';
    el.insertAdjacentHTML('afterbegin', '<div class="yf-tint" id="yf-tint"></div><div class="yf-stamp ok" id="yf-ok"><i>✓</i>残す</div><div class="yf-stamp ng" id="yf-ng"><i>✕</i>消す</div>');
    if (pagesOf(Q[S.idx]).length > 1) el.insertAdjacentHTML('beforeend', '<span class="yf-edge r">›</span>');
    // 飛んでいく抜け殻より手前に来ないよう、前の札は抜け殻の直前に置く（重なり順）
    const ghost = el.parentElement.querySelector('.yf-card[data-gone]');
    if (ghost) el.parentElement.insertBefore(el, ghost);
    bindCard();
    S.promote = true;
    fillBack();
  }
  function quitSheet(onCancel) {
    const root = document.querySelector('.yf');
    if (!root || root.querySelector('.yf-sheet-bg')) return;
    const bg = document.createElement('div');
    bg.className = 'yf-sheet-bg';
    bg.innerHTML = `<div class="yf-sheet"><div class="grp"><div class="t">予想をやめますか？</div><div class="s">ここまでの「残す」「消す」は消えます</div>
      <button type="button" class="danger" data-q="quit">やめる</button></div>
      <button type="button" class="cancel" data-q="keep">続ける</button></div>`;
    root.appendChild(bg);
    haptic();
    const shut = (fn) => { bg.classList.add('out'); setTimeout(() => { bg.remove(); if (fn) fn(); }, 260); };
    bg.addEventListener('click', (e) => {
      const q = e.target.closest('[data-q]');
      if (q && q.dataset.q === 'quit') { shut(() => close(false)); return; }
      if (q || e.target === bg) shut(onCancel);
    });
  }

  // 払う・端を押す。しきい値（100px・速さ0.6）は仮の値で、実機で決める（仕様書「未確定」）
  function bindCard() {
    const card = document.getElementById('yf-card');
    const backEl = () => document.getElementById('yf-back');
    const ok = document.getElementById('yf-ok');
    const ng = document.getElementById('yf-ng');
    const pageEl = document.getElementById('yf-page');
    const deck = card.parentElement;
    const TH = 100;
    let sx = 0, sy = 0, st = 0, dx = 0, dy = 0, g = 1, drag = false, vdrag = false, down = false, vscroll = false, top0 = 0, over = false;
    let hist = [];
    let base = '';
    const scrollable = () => pageEl && pageEl.scrollHeight > pageEl.clientHeight + 1;
    const tint = document.getElementById('yf-tint');
    const setBack = (p) => {
      const back = backEl();
      if (!back) return;
      if (back.getAnimations().length) back.getAnimations().forEach((a) => a.cancel());
      back.classList.remove('pre');
      back.style.transition = 'none';
      back.style.transform = backTf(BACK_Y * (1 - p), BACK_S + (1 - BACK_S) * p);
      back.dataset.p = p.toFixed(3);
      // 影は子の要素の透明度だけを変える（札全体の指定を変えると、中身ごと毎回計算し直しになり iPhone でかくついた）
      const sh = back.querySelector('.yf-shade');
      if (sh) { sh.style.transition = 'none'; sh.style.opacity = ((1 - p) * 0.55).toFixed(3); }
    };
    const springHome = () => {
      base = '';
      card.style.transformOrigin = '';
      card.classList.add('spring');
      card.style.transform = '';
      ok.style.opacity = 0; ng.style.opacity = 0; ok.style.transform = ''; ng.style.transform = '';
      if (tint) { tint.style.transition = 'opacity .35s'; tint.style.opacity = 0; }
      const back = backEl();
      if (back) {
        const p0 = Number(back.dataset.p || 0);
        back.style.transition = 'none';
        back.style.transform = '';
        back.dataset.p = '0';
        if (p0 > 0) springTo(back, (x) => { const q = p0 * (1 - x); return { transform: backTf(BACK_Y * (1 - q), BACK_S + (1 - BACK_S) * q) }; }, { response: 0.45, damping: 0.9 });
        const sh = back.querySelector('.yf-shade');
        if (sh) { sh.style.transition = `opacity .5s ${EASE_IOS}`; sh.style.opacity = ''; }
      }
      deck.style.setProperty('--dim', '0');
    };
    card.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || card.dataset.gone) return;
      // せり上がりの途中でつかんだら、その場の位置で止めて指に付ける（最後まで飛ばすと、かくっと跳ねたため）
      base = '';
      if (card.getAnimations().length) {
        const m = getComputedStyle(card).transform;
        card.getAnimations().forEach((a) => a.cancel());
        base = m && m !== 'none' ? ` ${m}` : '';
        card.style.transformOrigin = '50% 100%';
        card.style.transform = base.trim();
      }
      down = true; drag = false; vdrag = false; vscroll = false; over = false; dx = 0; dy = 0;
      sx = e.clientX; sy = e.clientY; st = performance.now(); hist = [[st, sx, sy]];
      top0 = pageEl ? pageEl.scrollTop : 0;
      const rc = card.getBoundingClientRect();
      g = (sy - rc.top) < rc.height / 2 ? 1 : -1;          // 上の方をつかんだら右に傾く、下の方なら逆（指で紙を払う感じ）
      card.classList.remove('spring', 'nudge-l', 'nudge-r');
      if (!S.view) card.classList.add('press');     // 1頭だけ見るときは押しても縮めない（カードは動かさない）
    });
    card.addEventListener('pointermove', (e) => {
      if (!down) return;
      const now = performance.now();
      dx = e.clientX - sx; dy = e.clientY - sy;
      hist.push([now, e.clientX, e.clientY]); if (hist.length > 6) hist.shift();
      // 向きの決め方（2026-09-21 に見直し）。前は「横と縦のどちらが1pxでも大きいか」で決めていたので、
      //   斜めの払いが縦に取られ、全戦績のページ（縦に動かせる）では、そのあと横へ大きく振っても払えなかった。
      //   実測：横20・縦21 で縦に決まり、そこから横150まで振っても払えない（9/21・試作169）。
      //   ・横は少し甘く（縦の 0.8 倍を超えたら横）、縦は少し辛く（横の 1.25 倍を超えたら縦）。
      //     その間（だいたい39°〜51°）はまだ決めない。指を動かし続ければどちらかに決まる
      //   ・縦に動かし始めた後でも、横がはっきり勝ったら払うほうへ乗り換える
      if (!drag && !vdrag && !vscroll && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 0.8) drag = true;
      if (!drag && !vdrag && !vscroll && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.25 && scrollable() && (dy < 0 || top0 > 0)) vscroll = true;
      // 1頭だけ見るときは下に払って閉じる操作をしない（2026-09-24 ユーザー決定。閉じるボタンで閉じる）
      if (!drag && !vdrag && !vscroll && !S.view && dy > 8 && dy > Math.abs(dx) * 1.25) vdrag = true;
      // 乗り換え。指の今いる所を始点に取り直すので、カードは跳ねずに0から付いてくる。
      //   縦に動かしている最中の小さな横ぶれで払ってしまわないよう、横40px以上・縦との差24px以上にしてある
      if (vscroll && Math.abs(dx) > 40 && Math.abs(dx) - Math.abs(dy) > 24) {
        vscroll = false; drag = true;
        sx = e.clientX; sy = e.clientY; st = now; dx = 0; dy = 0; hist = [[now, sx, sy]];
      }
      if (drag || vdrag || vscroll) card.classList.remove('press');
      if (vscroll) { pageEl.scrollTop = top0 - dy; return; }
      if ((drag || vdrag) && !card.hasPointerCapture?.(e.pointerId)) {
        try { card.setPointerCapture(e.pointerId); } catch (_) { /* 取れなくても動く */ }
      }
      // 1頭だけ見るときはカードを指に付けて動かさない（2026-09-24 ユーザー指示「予想を始めるとき以外は、
      //   カードをスワイプしてずらせないように」）。横に払った量だけ数えて、離したときにページを送る
      if (S.view) return;
      if (vdrag) {
        const y = Math.max(0, dy);
        const r = y < 160 ? y : 160 + (y - 160) * 0.35;      // 下げすぎると重くなる（ゴムのような手ごたえ）
        card.style.transform = `translateY(${r.toFixed(1)}px) scale(${(1 - Math.min(r, 240) / 1600).toFixed(4)})`;
        deck.style.setProperty('--dim', String(Math.min(1, r / 200).toFixed(3)));
        const o = r > 120;
        if (o !== over) { over = o; if (o) haptic(); }
        return;
      }
      if (!drag) return;
      const p = Math.min(1, Math.abs(dx) / TH);
      const rot = (dx / 18) * g;
      card.style.transform = `translate(${dx}px, ${(dy * 0.2).toFixed(1)}px) rotate(${rot.toFixed(2)}deg)${base}`;
      const sOk = dx > 0 ? p : 0, sNg = dx < 0 ? p : 0;
      // しきい値を越えたら札がぽんと大きくなる（越える前は控えめ）
      const pop = (v) => (v >= 1 ? 1.08 : 0.7 + 0.25 * v).toFixed(3);
      ok.style.opacity = sOk; ok.style.transform = `scale(${pop(sOk)})`;
      ng.style.opacity = sNg; ng.style.transform = `scale(${pop(sNg)})`;
      if (tint) {
        tint.style.transition = 'none';
        tint.style.background = dx > 0 ? 'var(--mk-chk)' : 'var(--keshi)';
        tint.style.opacity = (p * 0.14).toFixed(3);
      }
      setBack(p);
      const o = Math.abs(dx) > TH;
      if (o !== over) { over = o; if (o) haptic(); }
    });
    const end = (e, cancel) => {
      if (!down) return;
      down = false;
      card.classList.remove('press');
      const now = performance.now();
      const dt = now - st;
      const h0 = hist[0], h1 = hist[hist.length - 1];
      const span = Math.max(1, h1[0] - h0[0]);
      const vx = (h1[1] - h0[1]) / span, vy = (h1[2] - h0[2]) / span;   // 点／ミリ秒（最後の数コマ）
      if (vscroll) return;
      if (cancel) { springHome(); return; }
      if (vdrag) {
        if (dy > 120 || vy > 0.9) {
          // 1頭だけ見るときは、下に払ったらそのまま閉じる（やめるかの確認は要らない。2026-09-21）
          if (S.view) { close(false); return; }
          card.classList.add('spring'); card.style.transform = 'translateY(40px) scale(.97)';
          quitSheet(() => springHome());
        } else springHome();
        return;
      }
      if (drag) {
        const fling = Math.abs(dx) > 40 && Math.abs(vx) > 0.5 && Math.sign(vx) === Math.sign(dx);
        if (Math.abs(dx) > TH || fling) {
          // 1頭だけ見るときは払わない。横に払ったらページを送る（右へ払う＝前のページ）。カードは動かしていない
          if (S.view) { turn(dx > 0 ? -1 : 1); return; }
          decideApple(dx > 0 ? '✓' : '消', vx, vy, (dx / 18) * g, dy * 0.2); return;
        }
        springHome();
        return;
      }
      if (Math.abs(e.clientY - sy) > 10 || dt > 500) return;
      if (e.target.closest('button')) return;
      // コース適性の山は押すと距離が替わる部品。ボタンと同じく、押してもページを送らない
      //   （右半分の距離を押すと次のページへ進んでいた・2026-09-24 ユーザー指摘）
      if (e.target.closest('.ax-hit')) return;
      const rc = card.getBoundingClientRect();
      const x = (e.clientX - rc.left) / rc.width;
      if (x < 0.15) { turn(-1); return; }
      if (x > 0.85) { turn(1); return; }
      // 絞り込みでは、両端15%より内側を押すと金の枠を付ける／外す（ページはめくらない。2026-09-24 ユーザー決定）
      if (!S.view) { goldTap(e.target, e.clientX); return; }
      // ページを送った直後の押し直しは、行（直近5走の札・全戦績の行）に当たっても左右の送りとして扱う。
      //   左を続けて押すと、2回目が入れ替わった直近5走の札に当たって4走前へ飛んでいた（2026-09-18 ユーザー指摘）
      const go2 = now - lastTurnAt < TURN_GUARD_MS ? null : e.target.closest('[data-goto]');
      if (go2) { const to = Number(go2.dataset.goto); goPage(to, to >= S.page ? 1 : -1); return; }
      if (x < 0.3) turn(-1); else if (x > 0.7) turn(1);
    };
    card.addEventListener('pointerup', (e) => end(e, false));
    card.addEventListener('pointercancel', (e) => end(e, true));
  }

  // ---------- 印（勝ち残り型・毎回やり直す） ----------
  //   選んだ馬は画面に残り、負けた馬の側だけ次の馬（馬番の若い順）に入れ替わる（2026-09-17 決定。前は勝ち抜き戦）。
  //   ✓が8頭なら◎まで7回。○・▲は◎を外して最初からやり直す
  // from 番目以降で、まだどの馬にも付いていない印の位置。無ければ 3
  const nextStep = (from) => {
    const held = Object.values(S.my);
    for (let k = from; k < MARKS3.length; k += 1) if (!held.includes(MARKS3[k])) return k;
    return MARKS3.length;
  };
  const pool = () => checked().filter((h) => !MARKS3.includes(S.my[h.number])).map((h) => h.number);

  function startMark(step) {
    if (step >= MARKS3.length) { close(true); return; }
    S.step = step;
    const p = pool();
    if (p.length === 0) { close(true); return; }
    if (p.length === 1) { setWinner(p[0]); return; }
    S.t = { left: p[0], right: p[1], queue: p.slice(2), total: p.length - 1, done: 0, champ: null, streak: 0, fresh: null };
    go('duel');
  }

  function pickWinner(n) {
    const t = S.t;
    t.done += 1;
    if (t.champ === n) t.streak += 1; else { t.champ = n; t.streak = 1; }
    t.bump = true;
    if (!t.queue.length) { setWinner(n); return; }
    const next = t.queue.shift();
    // 選んだ馬はいつも左へ。右で選ばれたときは、右から左へ移る動きを付ける。次の馬はいつも右から入る
    t.shift = t.right === n;
    t.left = n;
    t.right = next;
    t.fresh = 'r';
    render();
  }

  // 選んだ瞬間の動き（Apple の写真アプリの「選ぶ」に近い手ざわり）
  //   押したボタン：✓ に変わる／選んだ馬：ふわっと持ち上がって戻る／もう一方：外側へ傾きながら抜けていく
  function duelPickMotion(n, btn) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    btn.classList.add('done');
    btn.innerHTML = '<span class="dl-ck">✓</span>選びました';
    root.querySelectorAll('.dl-side').forEach((c) => {
      const win = Number(c.dataset.side) === n;
      c.classList.add(win ? 'win' : 'lose');
      if (reduce || !c.animate) return;
      if (win) {
        c.animate([
          { transform: 'scale(1)' },
          { transform: 'scale(1.045) translateY(-4px)', offset: 0.35 },
          { transform: 'scale(1)' },
        ], { duration: 440, easing: 'cubic-bezier(.32,.72,0,1)' });
      } else {
        const dir = c.classList.contains('l') ? -1 : 1;
        c.animate([
          { transform: 'none', opacity: 1, filter: 'saturate(1)' },
          { transform: 'scale(.94)', opacity: 0.85, filter: 'saturate(.3)', offset: 0.3 },
          { transform: `translateX(${dir * 115}%) rotate(${dir * 8}deg) scale(.88)`, opacity: 0, filter: 'saturate(0)' },
        ], { duration: 420, delay: 60, easing: 'cubic-bezier(.55,0,.75,.2)', fill: 'forwards' });
      }
    });
    const vs = root.querySelector('.dl-vs');
    if (vs && vs.animate && !reduce) {
      vs.animate([{ transform: 'translate(-50%,-50%) scale(1)' }, { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }],
        { duration: 220, easing: 'ease-in', fill: 'forwards' });
    }
  }

  function setWinner(n) {
    S.my[n] = MARKS3[S.step];
    S.lastWinner = n;
    go('marked');
  }

  // ---------- 操作 ----------
  function onClick(e) {
    const more = e.target.closest('[data-more]');
    if (more) {
      e.stopPropagation();
      // 本番の馬名ポップアップをそのまま開く（流れの画面より上に出る）
      const btn = document.querySelector(`.race20 .mm-list [data-pop="${more.dataset.more}"]`);
      if (btn) btn.click();
      return;
    }
    // 馬名・直近5走の札を押したときは、比べる画面の側（openDetail）が先に受ける
    const pk = e.target.closest('[data-pick]');
    if (pk && S.screen === 'duel' && !S.busy) {
      S.busy = true;
      const n = Number(pk.dataset.pick);
      duelPickMotion(n, pk);
      haptic();
      setTimeout(() => { S.busy = false; pickWinner(n); }, 460);
      return;
    }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    switch (a.dataset.act) {
      case 'mark0': startMark(0); break;
      case 'next': startMark(nextStep(S.step + 1)); break;
      case 'restart': Q = H; S.idx = 0; S.page = 0; S.my = {}; go('swipe'); break;
      case 'done': close(true); break;
      case 'close': close(false); break;   // 1頭だけ見るときの「閉じる」（2026-09-21）
      case 'quit':
        if (window.confirm('予想をやめますか？ ここまでの答えは消えます')) close(false);
        break;
      default: break;
    }
  }
  // コース適性の山を押したら、上段の3つ目の輪をその距離に替える（2026-09-24 決定・mockup-176）
  document.addEventListener('click', (e) => {
    const hit = e.target.closest && e.target.closest('.ax .ax-hit');
    if (!hit) return;
    const box = hit.closest('.ax');
    if (!box) return;
    box.querySelectorAll('.ax-hit').forEach((x) => x.classList.toggle('on', x === hit));
    box.querySelectorAll('.ax-dw').forEach((x) => x.classList.toggle('on', x.dataset.k === hit.dataset.k));
  });

  document.addEventListener('keydown', (e) => {
    if (!root || (S.screen !== 'swipe' && S.screen !== 'view')) return;
    if (e.key === 'ArrowLeft') turn(-1);
    if (e.key === 'ArrowRight') turn(1);
  });

  // 出馬表・新聞・買い目などで馬名を押したときに、この画面を1頭だけ開く入口（2026-09-21 ユーザー指示）。
  //   本番の race.js が [data-pop]（馬番）でここを呼ぶ。開けたら true、その馬が居なければ false を返し、
  //   false のときは race.js が今までの札（#pop-N）を出す。
  window.YosoView = {
    open(number) {
      if (root) return false;                      // すでに何か開いているときは邪魔しない
      const h = H.find((x) => Number(x.number) === Number(number));
      if (!h) return false;
      open('view', h);
      return true;
    },
  };

  // ---------- 本番の組み立てを待つ ----------
  (async () => {
    for (let i = 0; i < 100 && !document.querySelector('.race20 .mm-list'); i++) await sleep(100);
    mountEntry();
    // 本番は印の一覧を描き直すことがあるので、消えたら付け直す
    new MutationObserver(mountEntry).observe(document.getElementById('race-content'), { childList: true, subtree: true });
    let back = false;
    try { back = sessionStorage.getItem('yf-back') === '1'; sessionStorage.removeItem('yf-back'); } catch (e) { /* なくても動く */ }
    if (back) {
      const bar = document.querySelector('.race20 .mm-bar');
      if (bar) bar.scrollIntoView({ block: 'start' });
      toast('印を付けました');
    }
  })();
})();
