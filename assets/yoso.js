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
    col.innerHTML = { swipe: vSwipe, view: vSwipe, ask: vAsk, duel: vDuel, marked: vMarked }[S.screen]();
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
  function fitPage(pe = document.getElementById('yf-page'), pg = pagesOf(Q[S.idx])[S.page]) {
    if (!pe) return;
    if (pg && pg.k === 'all') { pe.classList.remove('fit'); return; }
    pe.classList.add('fit');
    const inner = pe.firstElementChild;
    if (!inner) return;
    inner.style.zoom = '';
    const cs = getComputedStyle(pe);
    // 縮めると折り返しが変わって高さも変わるので、実際の下端を見ながら数回詰める（最小 0.6 倍）
    let z = 1;
    for (let k = 0; k < 5; k += 1) {
      const r = inner.getBoundingClientRect();
      const limit = pe.getBoundingClientRect().bottom - parseFloat(cs.paddingBottom);
      if (r.bottom <= limit + 0.5) break;
      z = Math.max(0.6, z * ((limit - r.top) / r.height) * 0.995);
      inner.style.zoom = z.toFixed(3);
    }
  }

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
    return [{ k: 'p1', label: '基本' }].concat(sum)
      .concat([{ k: 'tenkai', label: '展開' }])
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

  function pageHtml(h, pg) {
    if (pg.k === 'p1') return basicPage(h);
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
  const RT_PACE = [['S', 'スロー'], ['M', '平均'], ['H', 'ハイ']];
  const RT_SIDE = [['前残り', '前残り'], ['差し・追込', '差し追込']];
  const RT_CUE = { main: '本命', sub: '対抗', other: '3番手' };
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
    const careerTxt = (P0.career.replace(/<[^>]+>/g, '').match(/(\d+)戦\s*(\d+)-(\d+)-(\d+)-(\d+)/) || []);
    const car = careerTxt.length ? careerTxt.slice(2, 6).map(Number) : null;
    const carN = careerTxt.length ? Number(careerTxt[1]) : null;
    const kg = h.weight_carried != null ? String(h.weight_carried).replace(/\.0$/, '') : '—';
    const hdr = `<div class="h-card b-hd">
      <div class="b-hd1">${umaBox(h.number, h.gate)}<b class="b-nm" style="font-size:${nfs}px">${esc(h.name)}</b>${P0.badge}</div>
      <div class="b-hd2"><span>${esc(h.sex_age || '')}</span><span class="bt-num">${esc(kg)}kg</span><span>${esc(h.jockey || '')}</span></div>
      <div class="b-hd3">
        <div class="b-od"><i>オッズ</i><b class="bt-num">${h.odds != null ? h.odds.toFixed(1) : '—'}<small>倍</small></b></div>
        <div class="b-od"><i>人気</i><b class="bt-num">${esc(h.popularity ?? '—')}<small>番</small></b></div>
        <div class="b-car"><i>通算 ${carN ?? '—'}戦</i>${car ? recHtml(car) : '—'}${car ? `<span class="b-pct">3着内 <b class="bt-num">${top3Pct(car)}%</b></span>` : ''}</div>
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
    // レースの型：ペース×決着の3行×2列。地の濃さは本番と同じ（その馬の平常との差）。今日の見立ては札で
    const rt = h.race_type_record || {};
    const byCode = {};
    (rt.rows || []).forEach((r) => { byCode[r.code] = r; });
    const sc = ((site.prediction || {}).scenario) || {};
    const cue = {};
    const cueKey = {};
    ['main', 'sub', 'other'].forEach((k) => {
      const c = sc[k];
      if (!c || !c.code || !c.side) return;
      const code = `${c.code}_${c.side === '前' ? '前残り' : '差し・追込'}`;
      if (!cue[code]) { cue[code] = `${RT_CUE[k]}${Math.round((c.prob || 0) * 100)}%`; cueKey[code] = k; }
    });
    // レースの型べつ成績は、今日の見立ての順に並べる一覧（2026-09-17 決定・T3。マスの形 T1・濃淡 T2 は選ばなかった）
    const ov = rt.overall || {};
    const baseTxt = ov.n ? `平常 3着内 ${Math.round(ov.top3_pct)}%` : '';
    const cellOf = (pc, sd) => byCode[`${pc}_${sd}`] || { counts: [0, 0, 0, 0], n: 0, shade: 'z', label: '', top3_pct: null, delta_pt: null };
    const dTxt = (d) => (d == null ? '' : `${d > 0 ? '+' : ''}${Math.round(d)}pt`);
    const dCls = (d) => (d == null ? '' : d >= 5 ? 'up' : d <= -5 ? 'dn' : 'eq');
    // 本命→対抗→3番手→その他の順。ペースと決着は札、右に3着内率の棒と平常との差
    const order = [];
    ['main', 'sub', 'other'].forEach((k) => { const c = sc[k]; if (c && c.code && c.side) order.push(`${c.code}_${c.side === '前' ? '前残り' : '差し・追込'}`); });
    RT_PACE.forEach(([pc]) => RT_SIDE.forEach(([sd]) => { const code = `${pc}_${sd}`; if (!order.includes(code)) order.push(code); }));
    const paceName = { S: 'スロー', M: '平均', H: 'ハイ' };
    const rows = order.map((code) => {
      const [pc, sd] = code.split('_'); const r = cellOf(pc, sd); const cu = cue[code];
      return `<div class="t3-r${r.n ? '' : ' none'}${cu ? ' cue' : ''}">
        <span class="t3-cue ${cueKey[code] || ''}">${cu ? cu.replace(/(\d+%)/, '<b>$1</b>') : '<span class="t3-no">—</span>'}</span>
        <i class="t3-tag p">${paceName[pc]}</i><i class="t3-tag s">${sd === '前残り' ? '前残り' : '差し追込'}</i>
        <span class="t3-bar"><i style="width:${r.n ? r.top3_pct : 0}%"></i></span>
        <b class="bt-num t3-p">${r.n ? `${Math.round(r.top3_pct)}%` : '—'}</b>
        <span class="t3-d ${dCls(r.delta_pt)}">${r.n ? dTxt(r.delta_pt) : `${r.n}走`}</span></div>`;
    }).join('');
    // 列をそろえる（同日ユーザー指示「整列させて」）：見出しの行を付け、札は同じ幅、数字は右そろえ
    const rtHead = `<div class="t3-r t3-hd"><span>今日の見立て</span><span>ペース</span><span>決着</span><span>3着内率</span><span></span><span>平常比</span></div>`;
    const rtCard = `<div class="h-card b-rtd t3"><div class="h-top"><span class="h-t">レースの型べつ成績</span><span class="h-r">中央のみ・全走　${baseTxt}</span></div>${rtHead}${rows}</div>`;
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
      i, label: RUN_LABEL[i], fin, finTxt: r.finish ?? '—', finMd: md(fin),
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
      out.push(smCard1(summaryRun(h, r, i)));
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
    return tkDesign(h, tkParse(wrap));
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
  const tkChip = (c) => `<span class="tk-chip${c.me ? ' me' : ''}${c.nige ? ' nige' : ''}">${c.hn}${c.mark ? `<i class="${esc(c.mcls)}">${esc(c.mark)}</i>` : ''}</span>`;
  // 今週の馬場は、上の大きな札と同じ作りの色の札3枚（2026-09-17 決定・K2。上から見た図 K1・天秤の絵 K3 は選ばなかった）
  //   偏りの向きで色が変わる（偏りなし＝灰、内・前＝赤／青、外・後ろ＝緑／灰、時計が遅い＝橙・速い＝緑）
  function weekCards(D, ioP, fbP, clockCls) {
    const inP = ioP[1] || '—', outP = ioP[2] || '—';   // 表示は元の文字のまま（20.0 を 20 にしない）
    const fN = Number(fbP[1]) || 0, rN = Number(fbP[2]) || 0;
    const tone = (cls) => (cls === 't1' ? 'a' : cls === 'u1' ? 'b' : 'n');
    return `<div class="w2-week k2"><div class="w2-wh"><b>今週の馬場</b><span>${esc(D.wkScope)}</span></div><div class="k2-row">
      ${D.io ? `<div class="k2-card io-${tone(D.io.cls)}"><i>内と外</i><div class="k2-two"><span><em>内</em><b class="bt-num">${inP}</b><small>%</small></span><span><em>外</em><b class="bt-num">${outP}</b><small>%</small></span></div><small>3着以内に入った率</small><strong>${esc(D.io.word)}</strong></div>` : ''}
      ${D.fb ? `<div class="k2-card fb-${tone(D.fb.cls)}"><i>前と後ろ</i><div class="k2-two"><span><em>前</em><b class="bt-num">${fN}</b><small>頭</small></span><span><em>後ろ</em><b class="bt-num">${rN}</b><small>頭</small></span></div><small>3着内の馬の4角の位置</small><strong>${esc(D.fb.word)}</strong></div>` : ''}
      ${D.clock ? `<div class="k2-card ck-${clockCls}"><i>時計</i><div class="k2-big"><b class="bt-num">${esc(D.clock.v)}</b><span>秒</span></div><small>基準との差・${esc(D.clock.n)}</small><strong>${esc(D.clock.word)}</strong></div>` : ''}
    </div></div>`;
  }

  // 展開のページの形（2026-09-17 決定）：
  //   上＝今日の馬場の大きな札（W2。馬場の状態で色が変わる）／真ん中＝芝の地図（T2。ペースの帯・脚質の4区画・枠順の8枠）／下＝今週の馬場の色の札3枚（K2）
  //   選ばなかった案：並べ替えたカード T1・設定画面のような一覧 T3、上下の手直し V1〜V3、計器盤 W1・ものさし W3
  const LV5 = ['軟らかい', 'やや軟らかい', 'いつも通り', 'やや硬い', '硬い'];
  const LV5D = ['湿っている', 'やや湿っている', 'いつも通り', 'やや乾いている', '乾いている'];
  function tkDesign(h, D) {
    const paceSum = D.pace.reduce((a, r) => a + r.pp, 0);
    // 今回の馬の枠を目立たせる（2026-09-21 ユーザー指示・試作172 の案C）。脚質の4区画と同じ考え方で、
    //   今回の枠だけ白くくっきり・少し大きく、ほかの7つは緑の地に沈める（成績 S〜D は読める濃さに残す）。
    //   枠が分からない馬では has-me を付けず、全部が薄くならないようにする
    const myGate = Number(h.gate) || 0;
    const gateNo = (html) => Number(String(html).replace(/<[^>]+>/g, '').trim());
    const gatesRow = `<div class="tk-gates${myGate ? ' has-me' : ''}">${D.gates.map((g) => `<div class="tk-gate${myGate && gateNo(g.hn) === myGate ? ' me' : ''}">${g.hn}${tkG(g.grade)}</div>`).join('')}</div>`;
    const zones = D.zones.map((z) => `<div class="t2-zone${z.me ? ' me' : ''}">
      <span class="t2-st" style="background:${G_COLOR[z.grade] || '#4E5862'}">${esc(z.style)} ${esc(z.count)}</span>
      <div class="t2-gr">${tkG(z.grade)}<span class="bt-num">${esc(z.rate)}</span></div>
      <div class="t2-chips">${z.chips.map(tkChip).join('')}</div></div>`).join('');
    // ペースの帯。説明（上がり勝負・1000m 約62.1秒）は帯の中へ。3割未満の細い区切りは名前と割合だけ
    const paceBar = `<div class="tk-pbar big">${D.pace.map((r, i) => `<i class="p${i}${r.pp < 30 ? ' narrow' : ''}" style="flex:${r.pp}"><b>${esc(r.nm)}<em class="bt-num">${r.pp}%</em></b><span>${esc(r.sb)}・${esc(r.pt.replace('通過', ''))}</span></i>`).join('')}${paceSum < 100 ? `<i class="px" style="flex:${100 - paceSum}"><span>他${100 - paceSum}%</span></i>` : ''}</div>`;
    const clockCls = D.clock ? (D.clock.fast ? 'fast' : 'slow') : '';
    const isDirt = D.baba && LV5D.includes(D.baba.label) && D.baba.label !== 'いつも通り' ? true : String((site.race || {}).surface || '').startsWith('ダ');
    const lvIdx = D.baba ? Math.max(0, (isDirt ? LV5D : LV5).indexOf(D.baba.label)) : 2;
    const lvEnds = isDirt ? ['湿', '乾'] : ['軟', '硬'];
    const ioP = D.io ? (D.io.n.match(/内([\d.]+)% 外([\d.]+)%/) || []) : [];
    const fbP = D.fb ? (D.fb.n.match(/前(\d+) 後ろ(\d+)/) || []) : [];
    const sign = (v, cls) => `${cls === 'p1' ? '−' : '+'}${v}`;
    const tone = isDirt ? (lvIdx < 2 ? 'wet' : lvIdx > 2 ? 'dry' : 'norm') : (lvIdx < 2 ? 'soft' : lvIdx > 2 ? 'firm' : 'norm');
    const hero = `<div class="w2-hero ${tone}">
      <div class="w2-top"><span>今日の馬場</span><span>${esc((D.baba && D.baba.rail) || '')}</span></div>
      <div class="w2-big">${D.baba ? esc(D.baba.label) : '—'}</div>
      <div class="w2-dots">${[0, 1, 2, 3, 4].map((k) => `<i class="${k === lvIdx ? 'on' : ''}"></i>`).join('')}<span>${lvEnds[0]}</span><span>${lvEnds[1]}</span></div>
      <div class="w2-facts">
        ${D.time ? `<div><b class="bt-num">${sign(esc(D.time.v), D.time.cls)}<small>秒</small></b><span>勝ちタイム・${esc(D.time.word)}</span></div>` : ''}
        ${D.rise ? `<div><b class="bt-num">${esc(D.rise.v)}<small>m</small></b><span>高低差・${esc(D.rise.word)}</span></div>` : ''}
      </div>
      ${D.baba && D.baba.aim ? `<div class="w2-aim">${esc(D.baba.aim)}</div>` : ''}
    </div>`;
    const field = `<div class="t2-field">
      <div class="t2-sky">${paceBar}</div>
      <div class="t2-zones">${zones}</div>
      <div class="t2-gatehd"><span>枠順${D.gateScope ? `（${esc(D.gateScope)}）` : ''}</span>${D.tilt ? `<b>${esc(D.tilt.word)}</b>` : ''}</div>
      <div class="t2-gatebox">${gatesRow}</div>
    </div>`;
    const week = D.io || D.fb || D.clock ? weekCards(D, ioP, fbP, clockCls) : '';
    return `<div class="race20 rvC tk2 t2 t2-w2">${hero}${field}${week}</div>`;
  }

  // 全戦績のページ（2026-09-17 ユーザー指示）。1走＝2行の細い行。
  //   形は C「左の箱」（2026-09-18 決定・mockup-170。A 着差の列・B 1行目にまとめる は選ばなかった）：
  //   左＝着順とその下に着差の札（直近5走のページと同じ）／1行目＝距離と馬場・日付・場・クラスの札・レース名
  //   ／2行目＝タイム（金銀銅）・上がりと順位・通過順・人気／頭数・騎手と斤量。各項目は列の幅を決めて上下でそろえる
  //   地の色は直近5走と同じ（1着＝金・僅差＝銀）。行を押しても何も起きない（2026-09-21 ユーザー指示で飛び先を外した）
  //   sheet=true（比べる画面の戦績シート）は、行を押すとその走の中身が開く（2026-09-18 ユーザー指示）
  function allPage(h, from, to, sheet) {
    const all = allRuns(h);
    const out = [];
    for (let i = from; i < to; i += 1) {
      const r = all[i];
      const d = summaryRun(h, r, Math.min(i, 4));
      const go = sheet ? ` data-ex="${i}"` : '';
      out.push(`<div class="al-row al-c ${d.band ? `bd-${d.band}` : ''}${sheet ? ' al-go' : ''}"${go}>
        <div class="al-lb"><b class="al-fin bt-num ${d.finMd}">${esc(d.finTxt)}</b><span class="al-pill bt-num">${d.mgTxt}</span></div>
        <div class="al-m">
          <div class="al-r1"><b class="bt-num al-ds ${d.sf}">${esc(d.sfTxt)}${esc(d.dist)}<small>${esc(d.going)}</small></b>
            <span class="bt-num al-dt">${esc(d.date)}</span><span class="al-tk">${esc(d.track)}</span>
            <span class="al-nm">${d.clsHtml}<span class="al-rn">${esc(d.rn)}</span></span></div>
          <div class="al-r2"><b class="bt-num ${d.tg}">${esc(d.time)}</b>
            <span class="al-up"><b class="bt-num ${d.rkMd}">${esc(d.up)}</b><small>${d.rk != null ? `${d.rk}位` : ''}</small></span>
            <span class="bt-num al-cn">${esc(d.corners.join('-'))}</span>
            <span class="bt-num al-pop">${esc(d.pop)}<small>人/${d.field}</small></span>
            <span class="al-jk" style="font-size:${[...d.jockey].length >= 5 ? 9 : 10.5}px">${esc(d.jockey)}<small class="bt-num">${esc(d.weight)}</small></span></div>
        </div>
        ${sheet ? allDetail(d, r) : ''}
      </div>`);
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
  function runPage(h, i) {
    const r = h.past_runs[i];
    const prev = h.past_runs[i + 1];
    const race = site.race || {};
    const field = Number(r.field_size || r.runners) || null;
    const fin = Number(r.finish);
    const mg = marginSec(r.margin);
    // 1〜3着は金・銀・銅（2026-09-17 ユーザー指示）
    const finCls = fin === 1 ? 'w1' : fin === 2 ? 'w2' : fin === 3 ? 'w3' : '';

    // 間隔：前走は今回のレース日との差、それ以外は1つ前の走との差
    const gapNow = i === 0 ? days(toDate(race.date), toDate(r.date)) : null;
    // 5走前はひとつ前の走が past_runs に無いので、career_runs と合わせた一覧から間隔を取る
    // （色の判定 condOf と同じ一覧。2026-09-17 に表示「—」なのに色が付く食い違いを直した）
    const gapPrev = prev ? days(toDate(r.date), toDate(prev.date)) : (condOf(h).gapOf[r.race_id] ?? r.rest_days ?? null);
    const isFirst = i === 0;
    const going = race.going || '';

    // この走の脚質（位置の図・レースの流れの札の色に使う）。判定は本番と同じ
    // （keiba_review.style_of / race.js reviewZoneOf：最初のコーナーで1番手＝逃げ、以降は通過順÷頭数を 0.33 / 0.66 で切る）
    const c1st = Number(String(r.corners || '').split('-')[0]) || null;
    const runStyle = !c1st || !field ? null : c1st === 1 ? '逃げ' : c1st / field <= 0.33 ? '先行' : c1st / field <= 0.66 ? '差し' : '追込';
    const stColCls = { '逃げ': 'st-nige', '先行': 'st-sen', '差し': 'st-sashi', '追込': 'st-oi' }[runStyle] || 'st-none';
    const posBody = posFigure(r, field, stColCls);

    const memo = r.note_text || (r.note_labels || []).join('・');
    // 勝ち馬の最高成績（winner_best）とレースの強さ（level_grade）は本番の札と同じ見た目で出す
    const lvB = r.level_grade
      ? `<span class="lv lv-${esc(String(r.level_grade).toLowerCase())}" title="レースレベル（出走馬のその後180日・同じクラスの中での相対）"><i>Lv</i>${esc(r.level_grade)}</span>` : '';
    const wLab = fin === 1 ? '2着馬' : '勝ち馬';
    // 間隔は「N週」だけで出す（2026-09-17 ユーザー決定）
    const gapV = isFirst ? (gapNow != null ? wk(gapNow) : '—') : (gapPrev != null ? wk(gapPrev) : '—');
    const kg = r.weight ? `${esc(r.weight)}kg` : '—';
    const dist = `${esc(r.surface || '')}${esc(r.distance || '')}m`;
    const memoB = memo ? `<div class="yf-memo">${esc(memo)}</div>` : '';
    const bw = r.body_weight ? `${r.body_weight}kg` : '';

    // 見出しは付けても「●」は付けない（2026-09-17 ユーザー指示）
    const hc = (col, title, right, body, cls) => `<div class="h-card ${cls || ''}"><div class="h-top"><span class="h-t" style="color:${col}">${title}</span><span class="h-r">${right || ''}</span></div>${body}</div>`;
    // 横に並ぶ札は狭いので、今回との差を短く言う（同じ／今回 57kg・今回 稍重）
    const kgNow = h.weight_carried != null ? String(h.weight_carried).replace(/\.0$/, '') : null;
    const kgShort = isFirst && r.weight && kgNow
      ? `<span class="cp-pill${Number(kgNow) !== Number(r.weight) ? ' on' : ''}">${Number(kgNow) === Number(r.weight) ? '今回も同じ' : `今回 ${esc(kgNow)}kg`}</span>` : '';
    // 「稍重」と「稍」は同じもの。縮めてから比べる（2026-09-21。それまでは稍重・不良の日に
    // 前走が同じ馬場でも「今回 稍重」と出て、違う日のように見えていた）
    const goSame = ng(going) === ng(r.condition);
    const goShort = isFirst && going
      ? `<span class="cp-pill${goSame ? '' : ' on'}">${goSame ? '今回も同じ' : `今回 ${esc(going)}`}</span>` : '';

    // ---- 上：レースの札 → 着順｜人気｜タイム → 勝ち馬との差と勝ち馬 ----
    const ymd = String(r.date || '').split(/[/-]/);
    // 名前の末尾の「(GIII)」「(3勝クラス)」は、クラスの札と同じなので落とす
    const rname = stripClass(r.race_name) || '—';
    const cls = raceClass(r.grade, r.race_name);
    const raceCard = `<div class="h-card m-race">
      <div class="m-date"><small>${esc(ymd[0] || '')}</small><b>${esc(ymd[1] || '')}/${esc(ymd[2] || '')}</b><span>${esc(r.track || '')}</span></div>
      <div class="m-rmain">
        <div class="m-rn">${cls ? clsBadge(cls) : (JRA_TRACKS.includes(r.track) ? '' : '<span class="cb c-jusho">地方</span>')}<span>${esc(rname)}</span></div>
        <div class="m-cells">
          <div><i>距離</i><b class="${String(r.surface || '').startsWith('ダ') ? 'sf-dt' : String(r.surface || '').startsWith('芝') ? 'sf-tf' : ''}">${dist}</b></div>
          <div><i>頭数</i><b>${field ?? '—'}頭</b></div>
          <div><i>レベル</i><b>${lvB || '—'}</b></div>
        </div>
      </div>
    </div>`;
    const num = (k, v, u, c) => `<div class="h-card m-num ${c || ''}"><div class="h-t">${k}</div><div class="m-nv">${v}<small>${u}</small></div></div>`;
    // 勝ち馬：名前と最高成績（クラスの札＋着順）を左右に振る。馬名は折り返さず、長い名前ほど字を小さくする
    const bp = bestParts(r.winner_best);
    const bestHtml = bp
      ? `<span class="ft3-bst">${clsBadge(bp.cls)}<b class="${bp.fin === 1 ? 'f1' : bp.fin === 2 ? 'f2' : bp.fin === 3 ? 'f3' : ''}">${bp.fin}着</b></span>`
      : (r.winner_best ? `<b>${esc(r.winner_best)}</b>` : '');
    const nlen = [...String(r.winner || '')].length;
    const nfs = nlen <= 7 ? 15 : nlen <= 8 ? 14 : nlen <= 9 ? 12.5 : 11.5;
    const winnerBody = `<div class="ft3-win"><div class="ft3-wc"><i>${wLab}</i><b style="font-size:${nfs}px">${esc(r.winner || '—')}</b></div>${bestHtml ? `<div class="ft3-wr"><i>最高成績</i>${bestHtml}</div>` : ''}</div>`;
    // 着差の札の色は本番の戦績の札と同じ決まり（race.js runBandClass）：
    //   1着＝金／着差が芝0.4・ダート0.6（ほか0.5）秒以内の負け＝僅差（銀の地＋銀の枠）／それ以外は色なし
    const closeTh = { '芝': 0.4, 'ダート': 0.6 }[r.surface] ?? 0.5;
    const mgBand = fin === 1 ? 'mg-win' : (mg != null && Math.abs(mg) <= closeTh ? 'mg-close' : '');
    const mgTag = mgBand === 'mg-win' ? '<b class="mg-tag">勝ち</b>' : mgBand === 'mg-close' ? '<b class="mg-tag">僅差</b>' : '';
    const winSet = hc('var(--text)', fin === 1 ? '2着馬との差' : '勝ち馬との差', mgTag, `
      <div class="m-gap"><span class="m-nv">${mg == null ? '—' : Math.abs(mg).toFixed(1)}<small>秒</small></span></div>
      ${winnerBody}`, `m-win wide ${mgBand}`);
    // タイムは本番の time_grade（当日の馬場差を補正した基準との比べ）で金・銀・銅に塗る
    const tg = { f1: 'w1', f2: 'w2', f3: 'w3' }[r.time_grade] || '';
    const tgTitle = r.time_grade && r.time_resid != null ? ` title="基準比 ${r.time_resid > 0 ? '+' : ''}${esc(r.time_resid)}秒（当日の馬場差を補正後）"` : '';
    const timeTile = `<div class="h-card m-num ${tg}"${tgTitle}><div class="h-t">タイム</div><div class="m-nv">${esc(r.time || '—')}<small></small></div></div>`;
    const top = `${raceCard}<div class="m-row3">${num('着順', esc(r.finish ?? '—'), '着', finCls)}${num('人気', esc(r.popularity ?? '—'), '番')}${timeTile}</div>
      ${winSet}`;

    // ---- 中：コーナーごとの位置（脚質の色）＋上がり → レースの流れ ----
    // scenario は「ペース・決着」。後ろの「前／後」はその馬の位置ではなく、レースの決着（前残り／差し・追込）
    const [pace, settle] = String(r.scenario || '').split('・');
    const settleTxt = settle === '前' ? '前残り' : settle === '後' ? '差し・追込' : '';
    const rk = r.last3f_rank != null ? Number(r.last3f_rank) : null;
    // 上がりの1〜3位も金・銀・銅
    const rkCls = rk === 1 ? 'r1' : rk === 2 ? 'r2' : rk === 3 ? 'r3' : '';
    const scale = (opts, v) => `<span class="ft-scale">${opts.map((o) => `<i class="${o === v ? 'on' : ''}">${o}</i>`).join('')}</span>`;
    const upW = rk != null && field ? Math.max(4, 100 - ((rk - 1) / Math.max(field - 1, 1)) * 100) : 0;
    const posSub = `<div class="ft3">
      <div class="ft3-r"><span class="ft3-k">上がり</span><b class="ft3-up ${rkCls}">${esc(r.last_3f || '—')}秒</b>
        <span class="ft3-bar"><i class="${rkCls}" style="width:${upW}%"></i></span><span class="ft3-n ${rkCls}">${rk != null ? `${rk}位` : '—'}<small>／${field ?? '—'}頭</small></span></div>
    </div>`;
    // レースの流れの札は、この走の脚質の色で塗る（逃げ＝赤・先行＝黄・差し＝水色・追込＝青。脚質が出ない走は灰）
    const flowCard = hc('var(--st)', 'レースの流れ', '', `<div class="ft3-flow">
      <div class="fl-col fl-pc"><i class="fl-k">ペース</i>${scale(['スロー', '平均', 'ハイ'], pace)}</div>
      <div class="fl-col fl-se"><i class="fl-k">決着</i>${scale(['前残り', '差し追込'], settleTxt.replace('・', ''))}</div>
    </div>`, `st-card ${stColCls}`);
    const pos = hc('var(--st)', 'コーナーごとの位置', runStyle ? `<b class="ft3-style ${stColCls}">${runStyle}</b>` : '', `${posBody}${posSub}${memoB}`, `st-card ${stColCls}`) + flowCard;

    // ---- 下：間隔・斤量・馬場・騎手・馬体重の一覧。今回と同じ条件で好走した行は緑 ----
    const jk = `<span class="bt-jk" style="font-size:${jkFs(r.jockey) + 1}px">${esc(r.jockey || '—')}</span>`;
    const items = [
      { k: 'gap', lab: '間隔', val: `<span class="bt-num">${gapV}</span>`, sub: '' },
      { k: 'weight', lab: '斤量', val: `<span class="bt-num">${kg}</span>`, sub: kgShort },
      { k: 'going', lab: '馬場', val: `<span class="bt-num">${esc(r.condition || '—')}</span>`, sub: goShort },
      { k: 'jockey', lab: '騎手', val: jk, sub: '' },
      { k: null, lab: '馬体重', val: `<span class="bt-num">${esc(bw || '—')}</span>`, sub: '' },
    ];
    const isHit = (it) => it.k && hitOf(h, r, it.k);
    const hitMark = (it) => (isHit(it) ? `<b class="bt-hit" title="${esc(condOf(h).stat[it.k])}">同条件で好走</b>` : '');
    const bottom = `<div class="h-card bt1">${items.map((it) => `<div class="bt1-r${isHit(it) ? ' hit' : ''}">
      <span class="bt-lab">${it.lab}</span><span class="bt1-v">${it.val}</span><span class="bt1-s">${it.sub}${hitMark(it)}</span></div>`).join('')}</div>`;
    return `<div class="race20 rvC c3 mx hd-r3 bt-b1">${top}${pos}${bottom}</div>`;
  }

  // 説明文と下のボタン列（✕消・ひとつ戻る・✓残す）は外した（2026-09-17 ユーザー指示）。決めるのは払う動きだけ。
  // 払い間違えを戻す機能は置かない（同日ユーザー決定）
  // 1〜3ページ目（基本・直近5走・展開）の見出しの横に、今回の芝・ダートと距離を出す（2026-09-17 ユーザー指示）。
  //   過去走と見比べるときの基準なので、距離の色は過去走と同じ（芝＝緑・ダート＝橙）
  //   2026-09-21：距離の左にクラスの札も出す（ユーザー指示）。過去走の札と同じ分け方・同じ色
  const TODAY_PAGES = ['p1', 'sum', 'tenkai'];
  const todayTag = (() => {
    const r = site.race || {};
    if (!r.surface || !r.distance) return '';
    const sf = String(r.surface).startsWith('ダ') ? 'sf-dt' : String(r.surface).startsWith('芝') ? 'sf-tf' : '';
    return `<em class="yf-today ${sf}"><i>今回</i>${clsBadge(raceClass(r.grade, r.race_name))}${esc(r.surface)}<b class="bt-num">${esc(r.distance)}</b>m</em>`;
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

  // ---------- 印を決める：2頭を左右に並べて選ぶ（2026-09-17 作り直し。Facemash のような勝ち残り型） ----------
  //   1頭ぶんは上から ①馬の情報 ②直近5走（1走2行）③今回の適性4行 ④選ぶボタン。仕様書「印を決める画面の作り直し」
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
  function duelRuns(h) {
    const runs = (h.past_runs || []).slice(0, 5);
    if (!runs.length) return '<div class="dl-none">出走記録なし</div>';
    return runs.map((r, i) => {
      const d = summaryRun(h, r, i);
      return `<div class="dl-run ${d.band ? `bd-${d.band}` : ''}">
        <div class="dl-r1"><b class="bt-num dl-fin ${d.finMd}">${esc(d.finTxt)}</b><small>着</small>${d.clsHtml}
          <span class="bt-num ${d.sf}">${esc(d.sfTxt)}${esc(d.dist)}</span><span class="bt-num dl-mg">${d.mgTxt}</span></div>
        <div class="dl-r2"><span class="bt-num dl-cn ${d.stc}">${esc(d.corners.join('-') || '—')}</span><span class="bt-num dl-kg">${esc(d.weight)}<small>kg</small></span></div>
      </div>`;
    }).join('');
  }
  // 今回の適性（4つ）の中身を集める
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
  // 今回の適性：2×2の札（コース／今日の流れ／脚質と枠／同じ条件で好走）。押すと詳しい版が出る（aptSheet）
  function duelApt(h) {
    const A = aptData(h);
    const recLine = (lab, cc) => `<div class="a1-l"><span>${esc(lab)}</span><b class="bt-num">${rec(cc)}</b></div>`;
    const flowN = A.rt && A.rt.n;
    return `<div class="a1">
        <div class="a1-t" data-apt="course"><i>コース</i>${recLine(A.here.replace(/(芝|ダート)\d+m$/, ''), A.hereC)}${recLine('全場', A.allC)}<small>${esc(A.all.replace(/m$/, '').replace('全場', ''))}</small></div>
        <div class="a1-t a1-fl" data-apt="flow"><i>今日の流れ</i><small class="a1-fq">${esc(A.flowLab)}で</small><div class="a1-fv"><em>3着内</em>${flowN ? `<b class="bt-num a1-big">${Math.round(A.rt.top3_pct)}<small>%</small></b>` : '<b class="a1-big z">—</b>'}</div><small>${flowN ? `過去${A.rt.n}走 ${A.rt.counts.join('-')}` : 'この流れの走なし'}</small></div>
        <div class="a1-t" data-apt="fit"><i>脚質と枠</i><div class="a1-g"><span>${esc(A.style)}</span>${tkG(A.styleG)}</div><div class="a1-g"><span>${A.gate}枠</span>${tkG(A.gateG)}</div></div>
        <div class="a1-t" data-apt="hit"><i>同じ条件で好走</i><div class="a1-chips">${Object.keys(A.hitLab).map((k) => `<b class="${A.lit[k] ? 'on' : ''}" title="${esc(A.stat[k])}">${A.hitLab[k]}</b>`).join('')}</div></div>
      </div>`;
  }
  function duelSide(h, side) {
    const t = S.t;
    const champ = t.champ === h.number && t.streak > 0;
    const nlen = [...String(h.name || '')].length;
    const nfs = nlen <= 7 ? 16 : nlen <= 8 ? 14.5 : nlen <= 9 ? 13 : 12;
    const pop = h.popularity != null ? `${h.popularity}人気` : '';
    const moved = side === 'l' && t.shift;
    return `<div class="dl-side ${side}${t.fresh === side ? ' fresh' : ''}${moved ? ' shift' : ''}${champ ? ' champ' : ''}" data-side="${h.number}">
      ${champ ? `<span class="dl-streak${t.bump ? ' bump' : ''}">${t.streak}連勝中</span>` : '<span class="dl-streak z"></span>'}
      <div class="dl-head">
        <div class="dl-h1">${umaBox(h.number, h.gate)}<b class="dl-nm" data-hist="${h.number}" style="font-size:${nfs}px">${esc(h.name)}<i>›</i></b></div>
        <div class="dl-h2">${esc(h.sex_age || '')} ${esc(h.weight_carried ?? '')}kg ${esc(h.jockey || '')}</div>
        <div class="dl-h3"><b class="bt-num">${h.odds != null ? h.odds.toFixed(1) : '—'}</b><small>倍</small><span>${esc(pop)}</span><span class="race20">${P(h.number).badge}</span></div>
      </div>
      <div class="dl-sec dl-runsec"><i class="dl-cap">直近5走</i>${duelRuns(h)}</div>
      <div class="dl-sec">${duelApt(h)}</div>
      <button type="button" class="dl-go" data-pick="${h.number}">この馬を選ぶ</button>
    </div>`;
  }

  function vDuel() {
    const t = S.t;
    const mk = MARKS3[S.step];
    // 入ってくる馬・連勝の札・VS の動きは、選んだ直後の1回だけ（描き直しで繰り返さない）
    const fresh = t.fresh;
    const html = `${head('2 / 2　印を決める', `${mk} を決めよう`, Math.round((t.done / t.total) * 100))}
      <div class="yf-lead">どっちがいい？（${mk} まで あと${t.total - t.done}回）</div>
      <div class="dl-wrap mx" id="dl-wrap"><div class="dl-grid">${duelSide(byNum(t.left), 'l')}${duelSide(byNum(t.right), 'r')}<span class="dl-vs${fresh ? ' pop' : ''}">VS</span></div></div>
      <label class="yf-haptic" aria-hidden="true"><input type="checkbox" switch id="yf-hap" tabindex="-1"></label>`;
    t.fresh = null;
    t.bump = false;
    t.shift = false;
    return html;
  }

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
  // 戦績のシート（比べる画面で馬名を押したとき）。全戦績と同じ2行の一覧を、下から出る札の中で縦に動かして見る
  // 下から出るシート（比べる画面の上に重ねる。閉じるボタンか外側を押すと閉じる）
  function infoSheet(h, sub, body) {
    const rootEl = document.querySelector('.yf');
    if (!h || !rootEl || rootEl.querySelector('.yf-hist-bg:not(.out)')) return;
    rootEl.querySelectorAll('.yf-hist-bg.out').forEach((x) => x.remove());   // 閉じかけのシートは待たずに外す
    const bg = document.createElement('div');
    bg.className = 'yf-hist-bg';
    bg.innerHTML = `<div class="yf-hist">
      <div class="yf-hist-hd">${umaBox(h.number, h.gate)}<b>${esc(h.name)}</b><span>${esc(sub)}</span><button type="button" class="yf-hist-x" data-hx="1">閉じる</button></div>
      <div class="yf-hist-body">${body}</div>
    </div>`;
    rootEl.appendChild(bg);
    const shut = () => { bg.classList.add('out'); setTimeout(() => bg.remove(), 260); };
    bg.addEventListener('click', (e) => {
      if (e.target === bg || e.target.closest('[data-hx]')) { shut(); return; }
      // 戦績の行を押すと、その走の中身を開く。開くのは1走だけ（ほかの開いている行は閉じる）
      const row = e.target.closest('[data-ex]');
      if (!row) return;
      e.stopPropagation();
      const was = row.classList.contains('open');
      bg.querySelectorAll('[data-ex].open').forEach((x) => x.classList.remove('open'));
      if (!was) { row.classList.add('open'); haptic(); }
    });
  }
  function histSheet(h) {
    const n = allRuns(h).length;
    infoSheet(h, `戦績 ${n}走`, n ? allPage(h, 0, n, true) : '<p class="dl-none">出走記録なし</p>');
  }
  // 適性の札の詳しい版。コースと今日の流れは1ページ目（基本）の札を、脚質と枠は展開のページをそのまま使う
  const GAP_LAB = ['中2週まで', '中3〜5週', '中6〜9週', '中10週以上'];
  function pickCard(html, sel) {
    const w = document.createElement('div');
    w.innerHTML = html;
    const el = w.querySelector(sel);
    return el ? `<div class="race20 rvC c3 mx hd-r3 b-page yf-sheetpg">${el.outerHTML}</div>` : '';
  }
  function hitDetail(h) {
    const c = condOf(h);
    const A = aptData(h);
    const td = c.today;
    const nowTxt = {
      gap: td.gap == null ? '初出走' : GAP_LAB[td.gap],
      weight: td.weight == null ? '—' : `${String(td.weight).replace(/\.0$/, '')}kg`,
      // 比べるときは「稍」に縮めるが、画面には発表どおり「稍重」と出す（2026-09-21）
      going: (site.race || {}).going || td.going || '—',
      jockey: h.jockey || '—',
    };
    const tot = c.runs.length;
    const top = c.runs.filter((x) => finN(x.finish) <= 3).length;
    const rows = Object.keys(A.hitLab).map((k) => {
      const xs = c.runs.filter(c.same[k]);
      const t3 = xs.filter((x) => finN(x.finish) <= 3).length;
      const list = xs.slice(0, 6).map((x) => {
        const f = finN(x.finish);
        return `<div class="ht-run"><span class="bt-num">${esc(String(x.date).slice(2))}</span><span>${esc(x.track || '')}</span>
          <span class="ht-rn">${esc(stripClass(x.race_name))}</span><b class="bt-num ${f != null && f <= 3 ? `r${f}` : ''}">${esc(x.finish)}着</b></div>`;
      }).join('');
      return `<div class="ht-sec${c.lit[k] ? ' on' : ''}">
        <div class="ht-h"><b class="ht-k">${A.hitLab[k]}</b><span>今回 <b>${esc(nowTxt[k])}</b></span><em>${c.lit[k] ? '好走あり' : '当てはまらない'}</em></div>
        <div class="ht-s">同じ条件で <b class="bt-num">${xs.length}</b>走・3着内 <b class="bt-num">${t3}</b>回
          <small>（${xs.length ? Math.round((t3 / xs.length) * 100) : 0}%／全戦績 ${tot ? Math.round((top / tot) * 100) : 0}%）</small></div>
        ${list ? `<div class="ht-list">${list}${xs.length > 6 ? `<div class="ht-more">ほか${xs.length - 6}走</div>` : ''}</div>` : ''}
      </div>`;
    }).join('');
    return `<div class="ht-page"><p class="ht-note">同じ条件の走で、3着内に入った割合が全戦績と同じか上なら緑（2走以上・3着内1回以上）</p>${rows}</div>`;
  }
  function aptSheet(h, kind) {
    if (!h) return;
    if (kind === 'course') infoSheet(h, 'コース適性', pickCard(basicPage(h), '.b-crd'));
    else if (kind === 'flow') infoSheet(h, 'レースの型べつ成績', pickCard(basicPage(h), '.b-rtd'));
    else if (kind === 'fit') {
      // 展開のページから、馬場の2枚を外して「ペース・脚質・枠」の札だけ残す
      const w = document.createElement('div');
      w.innerHTML = tenkaiPage(h);
      w.querySelectorAll('.w2-hero, .w2-week').forEach((x) => x.remove());
      infoSheet(h, '脚質と枠', `<div class="yf-sheetpg">${w.innerHTML}</div>`);
    }
    else if (kind === 'hit') infoSheet(h, '同じ条件で好走', hitDetail(h));
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
      card.classList.add('press');
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
      if (!drag && !vdrag && !vscroll && dy > 8 && dy > Math.abs(dx) * 1.25) vdrag = true;
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
          // 1頭だけ見るときは払わない。横に払ったらページを送る（右へ払う＝前のページ）
          if (S.view) { springHome(); turn(dx > 0 ? -1 : 1); return; }
          decideApple(dx > 0 ? '✓' : '消', vx, vy, (dx / 18) * g, dy * 0.2); return;
        }
        springHome();
        return;
      }
      if (Math.abs(e.clientY - sy) > 10 || dt > 500) return;
      if (e.target.closest('button')) return;
      const rc = card.getBoundingClientRect();
      const x = (e.clientX - rc.left) / rc.width;
      if (x < 0.15) { turn(-1); return; }
      if (x > 0.85) { turn(1); return; }
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
    // 比べる画面で馬名を押したら、その馬の戦績を下から出す（選ぶ動作にはしない）
    const hist = e.target.closest('[data-hist]');
    if (hist) { e.stopPropagation(); histSheet(byNum(Number(hist.dataset.hist))); return; }
    // 比べる画面で適性の札を押したら、その中身の詳しい版を下から出す（選ぶ動作にはしない）
    const apt = e.target.closest('[data-apt]');
    if (apt && S.screen === 'duel') {
      const side = apt.closest('[data-side]');
      if (side) { e.stopPropagation(); aptSheet(byNum(Number(side.dataset.side)), apt.dataset.apt); }
      return;
    }
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
