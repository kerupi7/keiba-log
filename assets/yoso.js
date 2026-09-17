// 自動生成：部署/競馬部/仕様/予測サイト/mockup-169-to-ans.py が mockup-169-yoso-swipe-flow.flow.js から書き出した。ここを直接直さず、試作を直してから書き出し直す。
// mockup-169: 「予想をはじめる」の流れ。本番のレース画面（race.js が組み立てたもの）の上に重ねる。
// 仕様: 部署/競馬部/過去の決定事項/未着手/2026-09-17_払う比べるだけで印が決まる画面.md
// 画面の部品（馬名ポップアップの見出し・表、戦績の札の1走）は、本番が描いた DOM から複製して使う。
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
  let root = null;   // 重ねる画面

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'yf-toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  // ---------- 印の保存（本番と同じ mymark:{race_id}） ----------
  function loadMarks() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function saveMarks(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { /* 保存しないだけ */ } }

  // ---------- 本番の部品を借りる ----------
  function parts(n) {
    const pop = document.querySelector(`.race20 #pop-${n}`);
    const out = { head: '', career: '', why: '', main: '', badge: '', runs: [] };
    if (pop) {
      const head = pop.querySelector('.phead').cloneNode(true);
      const x = head.querySelector('.pclose'); if (x) x.remove();
      out.head = head.outerHTML;
      const b = head.querySelector(':scope > .mkstack, :scope > .mkb');
      out.badge = b ? b.outerHTML : '';
      const body = pop.querySelector('.pbody');
      const c = body.querySelector('.pcareer'); out.career = c ? c.outerHTML : '';
      out.why = [...body.children].filter((e) => e.classList.contains('mkw')).map((e) => e.outerHTML).join('');
      // 表はコース適性とレースの型べつ成績だけ。今日の見立ての1行とレースレベル別の好走歴は外す（2026-09-17 ユーザー指示）
      const m = body.querySelector('.pmain');
      if (m) {
        const mm = m.cloneNode(true);
        // 型べつ成績の下の「この馬の平常 3着内 N%」も外す（同日・1ページ目を画面に収めるため）
        mm.querySelectorAll('.rtnow, .rtbase').forEach((e) => e.remove());
        const lv = [...mm.querySelectorAll('.crh')].find((e) => e.textContent.includes('レースレベル別'));
        if (lv) {
          let e = lv;
          while (e) { const nx = e.nextElementSibling; e.remove(); e = nx && !nx.classList.contains('crh') ? nx : null; }
        }
        mm.querySelectorAll('table.lvt').forEach((e) => e.remove());
        out.main = mm.outerHTML;
      }
    }
    const spine = document.querySelector(`.race20 .acard .aspine[data-pop="${n}"]`);
    const card = spine && spine.closest('.acard');
    if (card) out.runs = [...card.querySelectorAll('.vrun')].map((v) => v.outerHTML);
    return out;
  }
  const PARTS = {};
  const P = (n) => (PARTS[n] = PARTS[n] || parts(n));

  // ---------- 入口（印の一覧の一番上） ----------
  function mountEntry() {
    const list = document.querySelector('.race20 .mm-list');
    if (!list || list.querySelector('.yf-entry')) return;
    const any = Object.keys(loadMarks()).length > 0;
    const box = document.createElement('div');
    box.className = 'yf-entry';
    box.innerHTML = `<button type="button" class="yf-btn" id="yf-go">${any ? '予想をやり直す' : '予想をはじめる'}</button>
      <p>1頭ずつ払って消す馬を決め、2頭ずつ比べて◎○▲を決めます</p>`;
    list.insertBefore(box, list.firstChild);
    box.querySelector('#yf-go').addEventListener('click', () => {
      if (Object.keys(loadMarks()).length && !window.confirm('付けた印を消して、はじめからやり直します')) return;
      open();
    });
  }

  // ---------- 重ねる画面 ----------
  function open() {
    S = { screen: 'swipe', idx: 0, page: 0, my: {}, step: 0, t: null, busy: false };
    root = document.createElement('div');
    root.className = 'yf';
    root.innerHTML = '<div class="yf-col" id="yf-col"></div>';
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';
    document.body.classList.add('yf-open');
    root.addEventListener('click', onClick);
    go('swipe');
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
  }

  function go(name) {
    S.screen = name;
    const col = document.getElementById('yf-col');
    col.classList.remove('enter'); void col.offsetWidth; col.classList.add('enter');
    render();
  }

  function render() {
    const col = document.getElementById('yf-col');
    col.innerHTML = { swipe: vSwipe, ask: vAsk, duel: vDuel, marked: vMarked }[S.screen]();
    if (S.screen === 'swipe') { fitPage(); bindCard(); }
  }

  // 1ページを画面の高さに収める（2026-09-17 ユーザー「縦スクロールせずに1画面に収めたい」）。
  //   中身が札より長いときは、中身ごと縮めて収める（字の大きさの比は変えない）。全戦績だけは縦に動かして見る形のまま（同日決定・案B）
  function fitPage() {
    const pe = document.getElementById('yf-page');
    if (!pe) return;
    const pg = pagesOf(H[S.idx])[S.page];
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

  function head(step, title, pct) {
    return `<div class="yf-head"><div><div class="st">${step}</div><div class="tt">${title}</div></div>
      <button type="button" class="x" data-act="quit">やめる</button></div>
      <div class="yf-bar"><i style="width:${pct}%"></i></div>`;
  }

  // 1頭ぶんのページ。1ページ目に表2つまで入れ、2ページ目は置かない（2026-09-17 ユーザー指示）。走っていない過去走は飛ばす（決定 #9）
  function pagesOf(h) {
    const runs = (h.past_runs || []).slice(0, 5);
    // 2ページ目に直近5走のまとめを置く（2026-09-17 ユーザー指示）。過去走の各ページはその後ろ
    const sum = RV === 'm3' && runs.length ? [{ k: 'sum', label: `直近${runs.length}走` }] : [];
    // 5走ページの後ろに全戦績（2026-09-17 ユーザー指示）。5走以下の馬は直近5走と同じなので出さない。
    // 見せ方は ?cr=s 1ページにまとめて縦に動かす（採用・既定）／?cr=p 14走ずつページを分ける（見比べ用に残す）
    const all = allRuns(h);
    const allPages = [];
    if (RV === 'm3' && all.length > 5) {
      if (CR === 's') allPages.push({ k: 'all', from: 0, to: all.length, label: `全戦績 ${all.length}走` });
      else {
        const n = Math.ceil(all.length / CR_PER);
        for (let j = 0; j < n; j += 1) {
          allPages.push({ k: 'all', from: j * CR_PER, to: Math.min(all.length, (j + 1) * CR_PER), label: `全戦績 ${all.length}走${n > 1 ? `（${j + 1}/${n}）` : ''}` });
        }
      }
    }
    // 出馬表の「展開」の中身（馬場・枠順・脚質と展開）を1ページ置く（2026-09-17 ユーザー指示）。
    // 場所は直近5走のすぐ後ろ（同日ユーザー指示で、全戦績の前から移した）。並び：基本→直近5走→展開→前走…5走前→全戦績
    return [{ k: 'p1', label: '基本' }].concat(sum)
      .concat(RV === 'm3' ? [{ k: 'tenkai', label: '展開' }] : [])
      .concat(runs.map((run, i) => ({ k: 'run', label: RUN_LABEL[i], i })))
      .concat(allPages);
  }
  // 前走のページの位置（基本・直近5走・展開の後ろ）。直近5走の札や全戦績の行を押したときの行き先に使う
  const RUN_PAGE0 = 3;
  const CR = 's';   // 2026-09-17 案B（縦に動かす）に決定
  const CR_PER = 14;   // 15走だと休養の帯が4本ある馬で最大27pxはみ出したため14走
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
    const p = P(h.number);
    if (pg.k === 'p1') {
      if (RV === 'm3') return basicPage(h);
      return `<div class="race20"><div class="popup yf-in">${p.head}<div class="pbody">${p.career}${p.why}${p.main}</div></div></div>`;
    }
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
  // 過去走ページの見た目の案。?rv=a|b|c（無ければ現行の形）
  // 無指定は M3（2026-09-17 ユーザー決定）
  const RV = 'm3';
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
      going: (site.race || {}).going || null,
      jockey: nj(h.jockey),
    };
    const same = {
      gap: (x) => gapOf[x.race_id] != null && gapBand(gapOf[x.race_id]) === today.gap,
      weight: (x) => today.weight != null && Number(x.weight) === today.weight,
      going: (x) => today.going != null && x.condition === today.going,
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
  const medal = (i) => ['md1', 'md2', 'md3', ''][i];
  const recHtml = (c) => `<span class="rec">${(c || [0, 0, 0, 0]).map((v, i) => `<b class="${v ? medal(i) : 'zr'}">${v}</b>`).join('<i>-</i>')}</span>`;
  const top3Pct = (c) => { const n = c.reduce((a, b) => a + b, 0); return n ? Math.round(((c[0] + c[1] + c[2]) / n) * 100) : null; };
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
    const crCard = `<div class="h-card b-crd"><div class="h-top"><span class="h-t">コース適性</span><span class="h-r">中央のみ・全走　右は3着内率</span></div>${crRows ||
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
    const grid = RT_PACE.map(([pc, pl]) => `<div class="b-rtl">${pl}</div>${RT_SIDE.map(([sd]) => {
      const r = byCode[`${pc}_${sd}`] || { counts: [0, 0, 0, 0], n: 0, shade: 'z', label: '' };
      return `<div class="b-rtc sh-${r.shade || 'z'}${cue[`${pc}_${sd}`] ? ' cue' : ''}" title="${esc(r.label)}">
        <div class="b-rtt">${esc(r.label)}</div><div class="b-rtr">${recHtml(r.counts)}${cue[`${pc}_${sd}`] ? `<b class="b-cue">${cue[`${pc}_${sd}`]}</b>` : ''}</div></div>`;
    }).join('')}`).join('');
    let rtCard = `<div class="h-card b-rtd"><div class="h-top"><span class="h-t">レースの型べつ成績</span><span class="h-r">中央のみ・全走</span></div>
      <div class="b-rtg"><div></div>${RT_SIDE.map(([, lab]) => `<div class="b-rth">${lab}</div>`).join('')}${grid}</div></div>`;
    // ---- レースの型べつ成績の見直し 3案（2026-09-17 ユーザー「デザイン見直して。色も含めて」）。?rt=t1|t2|t3 ----
    // 無指定は T3（2026-09-17 ユーザー決定）
    const RT = 't3';
    const ov = rt.overall || {};
    const baseTxt = ov.n ? `平常 3着内 ${Math.round(ov.top3_pct)}%` : '';
    const cellOf = (pc, sd) => byCode[`${pc}_${sd}`] || { counts: [0, 0, 0, 0], n: 0, shade: 'z', label: '', top3_pct: null, delta_pt: null };
    const dTxt = (d) => (d == null ? '' : `${d > 0 ? '+' : ''}${Math.round(d)}pt`);
    const dCls = (d) => (d == null ? '' : d >= 5 ? 'up' : d <= -5 ? 'dn' : 'eq');
    if (RT === 't1') {
      // T1 白いマス：平常より走れている型は緑、走れていない型は赤の数字。今日の見立ては左の橙の線と下の札
      const g = RT_PACE.map(([pc, pl]) => `<div class="t1-l">${pl}</div>${RT_SIDE.map(([sd]) => {
        const r = cellOf(pc, sd); const cu = cue[`${pc}_${sd}`];
        return `<div class="t1-c${r.n ? '' : ' none'}${cu ? ' cue' : ''} ${dCls(r.delta_pt)}">
          <div class="t1-t">${esc(r.label)}</div>
          <div class="t1-m">${r.n ? `<b class="bt-num">${Math.round(r.top3_pct)}<small>%</small></b><span class="t1-d">${dTxt(r.delta_pt)}</span>` : '<span class="t1-z">走っていない</span>'}</div>
          <div class="t1-b">${recHtml(r.counts)}${cu ? `<em>${cu}</em>` : ''}</div></div>`;
      }).join('')}`).join('');
      rtCard = `<div class="h-card b-rtd t1"><div class="h-top"><span class="h-t">レースの型べつ成績</span><span class="h-r">3着内率・${baseTxt}</span></div>
        <div class="t1-g"><div></div>${RT_SIDE.map(([, lab]) => `<div class="t1-h">${lab}</div>`).join('')}${g}</div></div>`;
    } else if (RT === 't2') {
      // T2 3着内率の濃淡：地の色は3着内率そのもの（0%＝白 → 100%＝濃い緑）。今日の見立ては上の札
      const g = RT_PACE.map(([pc, pl]) => `<div class="t2-l">${pl}</div>${RT_SIDE.map(([sd]) => {
        const r = cellOf(pc, sd); const cu = cue[`${pc}_${sd}`];
        const a = r.n ? (0.08 + (r.top3_pct / 100) * 0.82).toFixed(2) : 0;
        const dark = r.n && r.top3_pct >= 55;
        return `<div class="t2-c${r.n ? '' : ' none'}${dark ? ' dark' : ''}${cu ? ' cue' : ''}" style="${r.n ? `background:rgba(15,122,61,${a})` : ''}" title="${esc(r.label)}">
          ${cu ? `<em>${cu}</em>` : ''}
          <b class="bt-num">${r.n ? `${Math.round(r.top3_pct)}<small>%</small>` : '—'}</b>
          <span class="t2-s">${r.n ? `${r.n}走 ${(r.counts || []).join('-')}` : '走っていない'}</span></div>`;
      }).join('')}`).join('');
      rtCard = `<div class="h-card b-rtd t2"><div class="h-top"><span class="h-t">レースの型べつ成績</span><span class="h-r">3着内率・${baseTxt}</span></div>
        <div class="t2-g"><div></div>${RT_SIDE.map(([, lab]) => `<div class="t2-h">${lab}</div>`).join('')}${g}</div></div>`;
    } else if (RT === 't3') {
      // T3 今日の見立ての順に並べる一覧：本命→対抗→3番手→その他。ペースと決着は札、右に3着内率の棒と平常との差
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
      const head = `<div class="t3-r t3-hd"><span>今日の見立て</span><span>ペース</span><span>決着</span><span>3着内率</span><span></span><span>平常比</span></div>`;
      rtCard = `<div class="h-card b-rtd t3"><div class="h-top"><span class="h-t">レースの型べつ成績</span><span class="h-r">中央のみ・全走　${baseTxt}</span></div>${head}${rows}</div>`;
    }
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
  // 2ページ目のデザイン案（2026-09-17 ユーザー「さらに洗練されたデザイン案にしたら」）。?sm=s0（今の形）/s1/s2/s3
  const SM = 's1';
  function summaryRun(h, r, i) {
    const race = site.race || {};
    const field = Number(r.field_size || r.runners) || null;
    const fin = Number(r.finish);
    const mg = r.margin != null && r.margin !== '' ? Number(r.margin) : null;
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
  const smRaceLine = (d) => `<span class="sm-dt bt-num">${esc(d.date)}</span><span>${esc(d.track)}</span>${d.clsHtml}
      <span class="sm-rn" style="font-size:${d.rnFs}px">${esc(d.rn)}</span>
      <b class="bt-num sm-dist ${d.sf}">${esc(d.sfTxt)}${esc(d.dist)}<small>${esc(d.going)}</small></b>`;

  // s0：今の形（1走5行）
  function smCard0(d) {
    return `<div class="sm-card ${d.band ? `bd-${d.band}` : ''}" data-goto="${d.i + RUN_PAGE0}">
      <div class="sm-l"><i>${d.label}</i><b class="bt-num ${d.finMd}">${esc(d.finTxt)}</b><small>着</small></div>
      <div class="sm-m">
        <div class="sm-r1">${smRaceLine(d)}</div>
        <div class="sm-r2"><span class="sm-mg">${d.mgPlain}<small>秒</small></span>
          <span class="sm-wn"><i>${d.winLab}</i>${esc(d.winner)}</span>${d.bpHtml}${d.lv}</div>
        <div class="sm-r3"><b class="bt-num sm-tm ${d.tg}">${esc(d.time)}</b><span class="sm-cn">${smCorners(d)}</span>
          <b class="bt-num sm-up ${d.rkMd}">${esc(d.up)}<small>${d.rk != null ? `${d.rk}位` : ''}</small></b>
          ${smStyle(d)}<span class="sm-sc">${esc(d.sc)}</span></div>
        <div class="sm-r4"><span class="sm-jk" style="font-size:${d.jkLong ? 10.5 : 12}px">${esc(d.jockey)}</span>
          <span class="bt-num">${esc(d.weight)}<small>kg</small></span><span class="bt-num">${esc(d.bw)}<small>kg</small></span>
          <span class="bt-num sm-wk">${esc(d.waku)}<small>枠</small>${esc(d.umaban)}<small>番</small></span>
          <span class="bt-num">${d.field}<small>頭</small></span><span class="bt-num">${esc(d.pop)}<small>人</small></span></div>
        ${smFoot(d, 'sm-r5')}
      </div></div>`;
  }
  // S1 強弱の3段：強＝着順・着差・レース名／中＝勝ち馬・時計・上がり・通過／弱＝騎手や斤量などは灰色の1行
  // 直近5走の札の色の案（2026-09-17 ユーザー「ここの色がわかりづらい」）。?sc=c0（今）/c1/c2/c3
  //   今の問題：①同じ銅色が「着順3着」「時計の優秀度」「勝ち馬の最高成績」の3つの意味に使われている
  //   ②地の青と着差の青い丸が「僅差の負け」だと書いていない ③1枚に緑・銅・赤・黄・青・灰が混ざる
  const SC = 'c0';
  // 僅差の地の水色の案（2026-09-17 ユーザー「僅差だった時の水色が見づらい」）。?bc=b0（今）/b1/b2/b3
  //   今の水色 #EBF2FA はページの地 #F2F2F7 とほぼ同じ色で、札が背景に溶けていた
  const BC = 'b4';   // 2026-09-17 B4（銀の地＋銀の枠）に決定
  // 過去走ページ（3〜7ページ目）の僅差の色を見比べる（2026-09-17）。?rc=blue（今・本番と同じ）/line（銀・左の線）/frame（銀・B4と同じ枠）
  const RC = 'frame';   // 2026-09-17 銀・枠に決定
  document.documentElement.classList.add(`rc-${RC}`);
  const TG_MARK = { md1: '◎', md2: '○', md3: '▲' };
  function smCard1(d) {
    const bandWord = d.band === 'win' ? '勝ち' : d.band === 'close' ? '僅差' : '';
    let bg = d.band ? `bd-${d.band}` : '';
    let finCls = d.finMd, tmCls = d.tg, upCls = d.rkMd, tmTag = '', upTag = d.rk != null ? `<small>${d.rk}位</small>` : '';
    let mg = `<span class="s1-mg bt-num">${d.mgTxt}</span>`;
    let bp = d.bpHtml;
    const bpPlain = d.bpHtml.replace(/<b class="md\d">/, '<b>');
    if (SC === 'c1') {
      // C1 金銀銅は着順だけ。時計・上がりは黒にして、よかったときだけ灰色の札で言葉にする
      tmCls = ''; upCls = ''; bp = bpPlain;
      if (d.tg) tmTag = `<em class="c1-tag">速い</em>`;
      if (d.rkMd) upTag = `<em class="c1-tag">${d.rk}位</em>`;
    } else if (SC === 'c2') {
      // C2 色はそのまま、色の横に意味を書く（着差の丸に「僅差」「勝ち」、時計に◎○▲、上がり順位を色の札に）
      bp = bpPlain;
      mg = `<span class="s1-mg c2-mg bt-num">${bandWord ? `<i>${bandWord}</i>` : ''}${d.mgTxt}</span>`;
      if (d.tg) tmTag = `<em class="c2-tag ${d.tg}">時計${TG_MARK[d.tg]}</em>`;
      if (d.rkMd) { upTag = `<em class="c2-tag ${d.rkMd}">${d.rk}位</em>`; }
    } else if (SC === 'c3') {
      // C3 地の色をやめる。勝ち・僅差は着差の札の言葉で出し、よかった所（速い時計・上がり3位以内）は緑1色にそろえる
      bg = ''; bp = bpPlain;
      mg = `<span class="s1-mg c3-mg ${d.band ? `c3-${d.band}` : ''} bt-num">${bandWord ? `<i>${bandWord}</i>` : ''}${d.mgTxt}</span>`;
      tmCls = d.tg ? 'c3-good' : ''; upCls = d.rkMd ? 'c3-good' : '';
      if (d.rkMd) upTag = `<small class="c3-good">${d.rk}位</small>`;
    }
    // 色の案（c1〜c3）は札が増えるので、脚質の札を下の行（展開の横）へ移し、左の列を少し広げる
    const moveSt = SC !== 'c0';
    return `<div class="s1-card ${bg}${moveSt ? ' sc-alt' : ''}" data-goto="${d.i + RUN_PAGE0}">
      <div class="s1-l"><i>${d.label}</i><b class="bt-num ${finCls}">${esc(d.finTxt)}<small>着</small></b>
        ${mg}</div>
      <div class="s1-m">
        <div class="s1-meta"><span class="bt-num">${esc(d.date)}</span><span>${esc(d.track)}</span>
          <b class="bt-num ${d.sf}">${esc(d.sfTxt)}${esc(d.dist)}</b><span>${esc(d.going)}</span>
          <span class="s1-sp"></span><span class="bt-num">${d.field}頭 ${esc(d.pop)}人気</span></div>
        <div class="s1-title">${d.clsHtml}<b style="font-size:${d.rnFs + 2}px">${esc(d.rn)}</b><span class="s1-sp"></span>${d.lv}</div>
        <div class="s1-win"><i>${d.winLab}</i><span>${esc(d.winner)}</span>${bp}</div>
        <div class="s1-perf"><b class="bt-num s1-tm ${tmCls}">${esc(d.time)}</b>${tmTag}
          <span class="s1-up"><i>上がり</i><b class="bt-num ${upCls}">${esc(d.up)}</b>${upTag}</span>
          <span class="sm-cn">${smCorners(d)}</span>${moveSt ? '' : smStyle(d)}</div>
        <div class="s1-sub"><span class="s1-jk">${esc(d.jockey)}</span><span class="bt-num">${esc(d.weight)}kg</span>
          <span class="bt-num">${esc(d.bw)}kg</span><span class="bt-num">${esc(d.waku)}枠${esc(d.umaban)}番</span>
          <span class="s1-sc">${moveSt ? smStyle(d) : ''}${esc(d.sc)}</span></div>
        ${smFoot(d, 's1-foot')}
      </div></div>`;
  }
  // S2 列そろえ：数字を同じ縦の列に置き、上の見出し1本で単位を省く。5走を縦に見比べられる
  function smCard2(d) {
    return `<div class="s2-card ${d.band ? `bd-${d.band}` : ''}" data-goto="${d.i + RUN_PAGE0}">
      <div class="s2-top">${smRaceLine(d)}</div>
      <div class="s2-grid">
        <span class="s2-lab"><i>${d.label}</i></span>
        <b class="bt-num s2-fin ${d.finMd}">${esc(d.finTxt)}</b>
        <b class="bt-num s2-mg">${d.mgTxt}</b>
        <b class="bt-num ${d.tg}">${esc(d.time)}</b>
        <b class="bt-num ${d.rkMd}">${esc(d.up)}</b>
        <span class="sm-cn">${smCorners(d)}</span>
        <b class="bt-num">${esc(d.pop)}</b>
      </div>
      <div class="s2-win"><i>${d.winLab}</i><span class="s2-wn">${esc(d.winner)}</span>${d.bpHtml}${d.lv}</div>
      <div class="s2-sub">${smStyle(d)}<span class="s2-sc">${esc(d.sc)}</span><span class="s1-sp"></span>
        <span>${esc(d.jockey)}</span><span class="bt-num">${esc(d.weight)}kg</span><span class="bt-num">${esc(d.bw)}kg</span>
        <span class="bt-num">${esc(d.waku)}枠${esc(d.umaban)}番</span><span class="bt-num">${d.field}頭</span></div>
      ${smFoot(d, 's1-foot')}
    </div>`;
  }
  // S3 ウィジェット：レースを上の帯に、数字を小さな見出しつきの6マスに入れる
  function smCard3(d) {
    const cell = (lab, v, c = '') => `<div class="s3-c"><i>${lab}</i><b class="bt-num ${c}">${v}</b></div>`;
    return `<div class="s3-card ${d.band ? `bd-${d.band}` : ''}" data-goto="${d.i + RUN_PAGE0}">
      <div class="s3-head">${smRaceLine(d)}</div>
      <div class="s3-body">
        <div class="s3-l"><i>${d.label}</i><b class="bt-num ${d.finMd}">${esc(d.finTxt)}<small>着</small></b></div>
        <div class="s3-m">
          <div class="s3-win"><b class="bt-num s3-mg">${d.mgTxt}</b><i>${d.winLab}</i><span>${esc(d.winner)}</span>${d.bpHtml}${d.lv}</div>
          <div class="s3-grid">
            ${cell('タイム', esc(d.time), d.tg)}
            ${cell('上がり', `${esc(d.up)}<small>${d.rk != null ? d.rk : ''}</small>`, d.rkMd)}
            ${cell('通過', `<span class="s3-cn" style="font-size:${d.corners.join('-').length >= 10 ? 9.5 : 11}px">${esc(d.corners.join('-') || '—')}</span>`)}
            ${cell('斤量', esc(d.weight))}
            ${cell('体重', esc(d.bw))}
            ${cell('人気', `${esc(d.pop)}<small>/${d.field}</small>`)}
          </div>
          <div class="s3-sub">${smStyle(d)}<span>${esc(d.sc)}</span><span class="s1-sp"></span><span>${esc(d.jockey)}</span>
            <span class="bt-num">${esc(d.waku)}枠${esc(d.umaban)}番</span></div>
          ${smFoot(d, 's1-foot')}
        </div>
      </div></div>`;
  }

  // 2ページ目：直近5走のまとめ。本番の戦績の札（.vrun）に出ている項目をできるだけ入れる（2026-09-17 ユーザー指示）
  //   90日以上空いた所に休養の帯。左の色の枠線は外した（同日ユーザー指示）
  function summaryPage(h) {
    const runs = (h.past_runs || []).slice(0, 5);
    const race = site.race || {};
    const gapOf = condOf(h).gapOf;
    const card = { s0: smCard0, s1: smCard1, s2: smCard2, s3: smCard3 }[SM] || smCard0;
    const restRow = (dd) => `<div class="sm-rest">${restLabel(dd)}（${dd}日）</div>`;
    const out = [];
    if (SM === 's2') out.push(`<div class="s2-hd"><span></span><i>着順</i><i>着差</i><i>タイム</i><i>上がり</i><i>通過</i><i>人気</i></div>`);
    const nowGap = runs[0] ? days(toDate(race.date), toDate(runs[0].date)) : null;
    if (nowGap != null && nowGap >= 90) out.push(restRow(nowGap));
    runs.forEach((r, i) => {
      out.push(card(summaryRun(h, r, i)));
      const g = gapOf[r.race_id];
      if (i < runs.length - 1 && g != null && g >= 90) out.push(restRow(g));
    });
    return `<div class="race20 rvC c3 mx hd-r3 sm-page sm-${SM} bc-${BC}">${out.join('')}</div>`;
  }
  // 展開のページ（2026-09-17 ユーザー指示）。本番の出馬表「展開」（race.js renderOverview20 の出力）をそのまま使い、
  //   （出馬表の裏に描かれた .tenkaiview の中身を写す）。上の「コースの形」（コース図・距離の帯）だけ外す。残るのは 馬場の1本バー／今週の馬場／このコースの枠順成績／脚質と展開（ペース2行つき）。
  //   中身はレースで共通なので、どの馬でも同じ。その馬の馬番だけ脚質の区画で目立たせる。
  //   長いので、全戦績と同じく札の中を縦に動かして見る。枠や馬番を押して開く本番の札は、この画面では開かない
  // その馬の目立たせ方の案（2026-09-17 ユーザー「黒枠でくくるよりもっと良いデザイン案は」）。
  //   ?hl=h0 黒い輪（今）／h1 ほかの馬を薄くする／h2 地図の上に一文で書き、馬番を少し大きく／h3 その馬の脚質の区画ごと明るくする
  const HL = 'h3';   // 2026-09-17 H3（区画ごと明るく）に決定
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
      // h2：地図の上に「この馬は 追込（このコースの複勝 14.8%）」と一文で書く。吹き出しは上下どちらでも他の文字に重なったため
      const map = e.closest('.lmap');
      if (HL === 'h2' && z && map) {
        const lab = z.querySelector('.lb'); const st = lab ? lab.firstChild.textContent.trim() : '';
        const rate = (z.querySelector('.lgv .p') || {}).textContent || '';
        const g = (z.querySelector('.lgv .g') || {}).textContent || '';
        const line = document.createElement('div');
        line.className = 'tk-me';
        line.innerHTML = `${e.querySelector('.hn').outerHTML}<span>この馬は</span><b>${esc(st)}</b><span class="lgv"><span class="g g-${esc(g)}">${esc(g)}</span></span><small>このコースの${esc(rate)}</small>`;
        map.parentNode.insertBefore(line, map);
      }
    });
    if (TK !== 't0') return tkDesign(h, tkParse(wrap));
    return `<div class="race20 tk-page hl-${HL}">${wrap.innerHTML}</div>`;
  }

  // ---------- 展開のページのデザイン案（2026-09-17 ユーザー「展開のデザインももっと洗練したものに」） ----------
  //   ?tk=t0 今の形（本番の展開をそのまま）／t1 読む順に並べ替えたカード／t2 1枚の地図／t3 設定画面のような一覧
  //   数字は本番の展開の面から読み取る（中身は同じで、並べ方と見た目だけ変える）
  const TK = 't2';   // 2026-09-17 T2（1枚の地図）を軸にする
  const T2V = 'w2';   // 2026-09-17 W2（大きな札＋対決グラフ）を軸にする
  // W2 の「今週の馬場」の見せ方の案（同日ユーザー「W2を軸に今週の馬場のデザインを見直したい」）。?wk=k0 今のW2／k1 コースを上から見た図／k2 色の札3枚／k3 天秤・点・ストップウォッチの絵
  const WK = 'k2';   // 2026-09-17 K2（色の札3枚）に決定
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
  const tkSee = (L, tick, ends, cls = '') => `<span class="tk-see ${cls}"><span class="tk-bar"><i style="width:${L}%"></i><u style="left:${tick}%"></u></span><span class="tk-ends"><em>${ends[0]}</em><em>${ends[1]}</em></span></span>`;
  const STYLE_INK = { '逃げ': '#D8342C', '先行': '#B48A00', '差し': '#2A8FD0', '追込': '#1F4CA8' };
  // 今週の馬場の見せ方（W2 用）。io＝内と外の3着内率、fb＝3着内の馬が4角にいた位置の頭数、clock＝時計
  function weekAlt(D, ioP, fbP, clockCls) {
    const inP = ioP[1] || '—', outP = ioP[2] || '—';   // 表示は元の文字のまま（20.0 を 20 にしない）
    const inN = Number(ioP[1]) || 0, outN = Number(ioP[2]) || 0;
    const fN = Number(fbP[1]) || 0, rN = Number(fbP[2]) || 0;
    const head = `<div class="w2-wh"><b>今週の馬場</b><span>${esc(D.wkScope)}</span></div>`;
    const tone = (cls) => (cls === 't1' ? 'a' : cls === 'u1' ? 'b' : 'n');
    if (WK === 'k1') {
      // K1 コースを上から見た図：直線を上から見て、内の通り道と外の通り道を3着内率の濃さで塗る。
      //   その下に、3着以内に入った馬が4角でどこにいたかを「前」「後ろ」に分けて馬の点で置く
      const W = 330, a1 = Math.min(1, inN / 40), a2 = Math.min(1, outN / 40);
      const dots = (n, x0, x1, cls) => Array.from({ length: n }, (_, k) => {
        const cols = Math.ceil(n / 2); const col = k % cols; const row = Math.floor(k / cols);
        const x = x0 + (x1 - x0) * (col + 0.5) / cols; const y = 104 + row * 13;
        return `<circle cx="${x.toFixed(1)}" cy="${y}" r="5" class="${cls}"/>`;
      }).join('');
      return `<div class="w2-week k1">${head}
        <svg viewBox="0 0 ${W} 140" width="100%" class="k1-svg">
          <rect x="0" y="6" width="${W}" height="64" rx="10" class="turf"/>
          <rect x="6" y="12" width="${W - 12}" height="24" rx="6" fill="rgba(176,86,86,${(0.15 + a1 * 0.75).toFixed(2)})"/>
          <rect x="6" y="40" width="${W - 12}" height="24" rx="6" fill="rgba(31,107,58,${(0.15 + a2 * 0.75).toFixed(2)})"/>
          <line x1="4" y1="9" x2="${W - 4}" y2="9" class="rail"/>
          <text x="14" y="29" class="lane">内の通り道</text><text x="${W - 14}" y="29" class="pct" text-anchor="end">${inP}%</text>
          <text x="14" y="57" class="lane">外の通り道</text><text x="${W - 14}" y="57" class="pct" text-anchor="end">${outP}%</text>
          <text x="${W / 2}" y="86" class="cap" text-anchor="middle">3着以内に入った馬が4角にいた位置（${fN + rN}頭）</text>
          <rect x="6" y="94" width="${W / 2 - 10}" height="${Math.ceil(Math.max(fN, rN) / Math.ceil(Math.max(fN, 1) / 2)) * 13 + 8}" rx="8" class="zone f"/>
          <rect x="${W / 2 + 4}" y="94" width="${W / 2 - 10}" height="${Math.ceil(Math.max(fN, rN) / Math.ceil(Math.max(rN, 1) / 2)) * 13 + 8}" rx="8" class="zone r"/>
          ${dots(fN, 50, W / 2 - 10, 'df')}${dots(rN, W / 2 + 10, W - 50, 'dr')}
          <text x="16" y="110" class="zl">前</text><text x="${W - 16}" y="110" class="zl" text-anchor="end">後ろ</text>
        </svg>
        <div class="k1-words"><span><i>内と外</i><b class="${esc(D.io ? D.io.cls : '')}">${esc(D.io ? D.io.word : '—')}</b></span>
          <span><i>前と後ろ</i><b class="${esc(D.fb ? D.fb.cls : '')}">${esc(D.fb ? D.fb.word : '—')}</b></span>
          ${D.clock ? `<span class="${clockCls}"><i>時計</i><b><span class="bt-num">${esc(D.clock.v)}秒</span><br>${esc(D.clock.word)}</b></span>` : ''}</div>
      </div>`;
    }
    if (WK === 'k2') {
      // K2 色の札3枚：上の大きな札と同じ作りの小さな札を3枚。偏りの向きで色が変わる（偏りなし＝灰、内・前＝赤／青、外・後ろ＝緑／灰）
      return `<div class="w2-week k2">${head}<div class="k2-row">
          ${D.io ? `<div class="k2-card io-${tone(D.io.cls)}"><i>内と外</i><div class="k2-two"><span><em>内</em><b class="bt-num">${inP}</b><small>%</small></span><span><em>外</em><b class="bt-num">${outP}</b><small>%</small></span></div><small>3着以内に入った率</small><strong>${esc(D.io.word)}</strong></div>` : ''}
          ${D.fb ? `<div class="k2-card fb-${tone(D.fb.cls)}"><i>前と後ろ</i><div class="k2-two"><span><em>前</em><b class="bt-num">${fN}</b><small>頭</small></span><span><em>後ろ</em><b class="bt-num">${rN}</b><small>頭</small></span></div><small>3着内の馬の4角の位置</small><strong>${esc(D.fb.word)}</strong></div>` : ''}
          ${D.clock ? `<div class="k2-card ck-${clockCls}"><i>時計</i><div class="k2-big"><b class="bt-num">${esc(D.clock.v)}</b><span>秒</span></div><small>基準との差・${esc(D.clock.n)}</small><strong>${esc(D.clock.word)}</strong></div>` : ''}
        </div></div>`;
    }
    // K3 天秤・点・ストップウォッチ：内と外は傾く天秤、前と後ろは馬の点、時計は針の付いたストップウォッチで描く
    const diff = inN - outN;
    const ang = Math.max(-14, Math.min(14, -diff * 0.7));   // 内が多いほど左（内）が下がる
    const rad = ang * Math.PI / 180;
    const bx = 60, by = 34, L = 44;
    const lx = bx - L * Math.cos(rad), ly = by - L * Math.sin(rad), rx = bx + L * Math.cos(rad), ry = by + L * Math.sin(rad);
    const scale = `<svg viewBox="-14 0 148 86" width="136" height="80" class="k3-scale">
        <path d="M ${bx} ${by} L ${bx - 14} 76 L ${bx + 14} 76 Z" class="base"/>
        <line x1="${lx.toFixed(1)}" y1="${ly.toFixed(1)}" x2="${rx.toFixed(1)}" y2="${ry.toFixed(1)}" class="beam"/>
        <circle cx="${bx}" cy="${by}" r="3.5" class="pivot"/>
        <line x1="${lx.toFixed(1)}" y1="${ly.toFixed(1)}" x2="${lx.toFixed(1)}" y2="${(ly + 14).toFixed(1)}" class="str"/>
        <line x1="${rx.toFixed(1)}" y1="${ry.toFixed(1)}" x2="${rx.toFixed(1)}" y2="${(ry + 14).toFixed(1)}" class="str"/>
        <path d="M ${(lx - 15).toFixed(1)} ${(ly + 14).toFixed(1)} q 15 12 30 0 z" class="pan in"/>
        <path d="M ${(rx - 15).toFixed(1)} ${(ry + 14).toFixed(1)} q 15 12 30 0 z" class="pan out"/>
        <text x="${lx.toFixed(1)}" y="${(ly + 36).toFixed(1)}" text-anchor="middle" class="pv">内 ${inP}%</text>
        <text x="${rx.toFixed(1)}" y="${(ry + 36).toFixed(1)}" text-anchor="middle" class="pv">外 ${outP}%</text>
      </svg>`;
    const horses = (n, cls) => Array.from({ length: n }, () => `<i class="${cls}"></i>`).join('');
    const cv = D.clock ? Number(D.clock.v) : 0;
    const ca = Math.max(-90, Math.min(90, cv * 90));   // ±1秒で針が真横まで振れる
    const watch = `<svg viewBox="0 0 80 100" width="76" height="95" class="k3-watch ${clockCls}">
        <rect x="34" y="2" width="12" height="7" rx="2" class="btn"/>
        <circle cx="40" cy="48" r="32" class="face"/>
        <path d="M 40 48 L 40 16 A 32 32 0 0 ${ca >= 0 ? 1 : 0} ${(40 + 32 * Math.sin(ca * Math.PI / 180)).toFixed(1)} ${(48 - 32 * Math.cos(ca * Math.PI / 180)).toFixed(1)} Z" class="sweep"/>
        <line x1="40" y1="48" x2="${(40 + 26 * Math.sin(ca * Math.PI / 180)).toFixed(1)}" y2="${(48 - 26 * Math.cos(ca * Math.PI / 180)).toFixed(1)}" class="hand"/>
        <circle cx="40" cy="48" r="3" class="hub"/>
        <text x="40" y="97" text-anchor="middle" class="num">${esc(D.clock ? D.clock.v : '')}秒</text>
      </svg>`;
    return `<div class="w2-week k3">${head}
      <div class="k3-grid">
        ${D.io ? `<div class="k3-cell"><i>内と外</i>${scale}<b class="${esc(D.io.cls)}">${esc(D.io.word)}</b><small>3着以内に入った率</small></div>` : ''}
        ${D.clock ? `<div class="k3-cell"><i>時計</i>${watch}<b>${esc(D.clock.word)}</b><small>基準との差・${esc(D.clock.n)}</small></div>` : ''}
      </div>
      ${D.fb ? `<div class="k3-fb"><div class="k3-fbh"><i>前と後ろ</i><b class="${esc(D.fb.cls)}">${esc(D.fb.word)}</b><small>3着以内の馬が4角にいた位置</small></div>
        <div class="k3-horses"><div class="f"><span>前 ${fN}頭</span><div>${horses(fN, 'hf')}</div></div><div class="r"><span>後ろ ${rN}頭</span><div>${horses(rN, 'hr')}</div></div></div></div>` : ''}
    </div>`;
  }
  function tkDesign(h, D) {
    const me = D.zones.find((z) => z.me);
    const paceSum = D.pace.reduce((a, r) => a + r.pp, 0);
    const paceBar = `<div class="tk-pbar">${D.pace.map((r, i) => `<i class="p${i}" style="flex:${r.pp}"><b>${esc(r.nm)}</b><span>${r.pp}%</span></i>`).join('')}${paceSum < 100 ? `<i class="px" style="flex:${100 - paceSum}"><span>他${100 - paceSum}%</span></i>` : ''}</div>`;
    const paceRows = D.pace.map((r, i) => `<div class="tk-prow${i === 0 ? ' on' : ''}"><b>${esc(r.nm)}</b><span>${esc(r.sb)}</span><small>${esc(r.pt)}</small><em class="bt-num">${r.pp}<small>%</small></em></div>`).join('');
    const gatesRow = `<div class="tk-gates">${D.gates.map((g) => `<div class="tk-gate">${g.hn}${tkG(g.grade)}</div>`).join('')}</div>`;
    const timeCls = D.time && D.time.cls === 'p1' ? 'fast' : D.time && D.time.cls === 'm1' ? 'slow' : '';
    const T = TK;
    if (T === 't1') {
      // T1 読む順に並べ替えたカード：①ペース ②脚質 ③枠順 ④今日の馬場 ⑤今週の馬場。白いカードに同じ見出しの形でそろえる
      const legCols = D.zones.map((z) => `<div class="t1-col${z.me ? ' me' : ''}">
          <b class="t1-st" style="color:${STYLE_INK[z.style] || '#333'}">${esc(z.style)}<small>${esc(z.count)}頭</small></b>
          ${tkG(z.grade)}<span class="t1-rate bt-num">${esc(z.rate)}</span>
          <div class="t1-chips">${z.chips.map(tkChip).join('')}</div></div>`).join('');
      return `<div class="race20 rvC tk2 t1">
        <div class="tk-sec"><h4>ペースの見込み</h4>${paceBar}${paceRows}</div>
        <div class="tk-sec"><h4>脚質<small>このコースの複勝率と等級</small></h4><div class="t1-legs">${legCols}</div>
          ${me ? `<p class="t1-me">この馬は<b style="color:${STYLE_INK[me.style]}">${esc(me.style)}</b>。このコースの${esc(me.style)}は複勝${esc(me.rate)}（等級${esc(me.grade)}）</p>` : ''}</div>
        <div class="tk-sec"><h4>枠順<small>${esc(D.gateScope || 'このコースの成績')}</small>${D.tilt ? `<em class="t1-tilt ${esc(D.tilt.cls)}">${esc(D.tilt.word)}</em>` : ''}</h4>${gatesRow}</div>
        <div class="tk-sec"><h4>今日の馬場</h4><div class="t1-tiles">
          ${D.baba ? `<div class="t1-tile wide"><i>馬場${D.baba.rail ? `・${esc(D.baba.rail)}` : ''}</i><b class="t1-lv ${esc(D.baba.cls)}">${esc(D.baba.label)}</b><small>${esc(D.baba.aim)}</small></div>` : ''}
          ${D.time ? `<div class="t1-tile ${timeCls}"><i>勝ちタイム</i><b class="bt-num">${esc(D.time.v)}<small>秒</small></b><small>${esc(D.time.word)}</small></div>` : ''}
          ${D.rise ? `<div class="t1-tile"><i>高低差</i><b class="bt-num">${esc(D.rise.v)}<small>m</small></b><small>${esc(D.rise.word)}</small></div>` : ''}
        </div></div>
        ${D.io || D.fb || D.clock ? `<div class="tk-sec"><h4>今週の馬場<small>${esc(D.wkScope)}</small></h4>
          ${D.io ? `<div class="t1-wrow"><i>内と外</i>${tkSee(D.io.L, D.io.tick, ['内', '外'])}<b class="${esc(D.io.cls)}">${esc(D.io.word)}</b><small>${esc(D.io.n)}</small></div>` : ''}
          ${D.fb ? `<div class="t1-wrow"><i>前と後ろ</i>${tkSee(D.fb.L, D.fb.tick, ['前', '後ろ'], 'tkfb')}<b class="${esc(D.fb.cls)}">${esc(D.fb.word)}</b><small>${esc(D.fb.n)}</small></div>` : ''}
          ${D.clock ? `<div class="t1-wrow"><i>時計</i><span class="t1-clock bt-num${D.clock.fast ? ' fast' : ' slow'}">${esc(D.clock.v)}<small>秒</small></span><b>${esc(D.clock.word)}</b><small>${esc(D.clock.n)}</small></div>` : ''}
        </div>` : ''}
      </div>`;
    }
    if (T === 't2') {
      // T2 1枚の地図：上に馬場の要点を札で一列、芝の上にペースの帯と脚質の4区画、下にゲートの8枠、最後に今週の3つ
      const chips = [
        D.baba && `<span class="t2-chip lv ${esc(D.baba.cls)}">${esc(D.baba.label)}</span>`,
        D.baba && D.baba.rail && `<span class="t2-chip">${esc(D.baba.rail)}</span>`,
        D.time && `<span class="t2-chip ${timeCls}">勝ちタイム <b class="bt-num">${esc(D.time.v)}秒</b> ${esc(D.time.word)}</span>`,
        D.rise && `<span class="t2-chip">高低差 <b class="bt-num">${esc(D.rise.v)}m</b></span>`,
        D.baba && D.baba.aim && `<span class="t2-chip aim">${esc(D.baba.aim)}</span>`,
      ].filter(Boolean).join('');
      const zones = D.zones.map((z) => `<div class="t2-zone${z.me ? ' me' : ''}">
          <span class="t2-st" style="background:${G_COLOR[z.grade] || '#4E5862'}">${esc(z.style)} ${esc(z.count)}</span>
          <div class="t2-gr">${tkG(z.grade)}<span class="bt-num">${esc(z.rate)}</span></div>
          <div class="t2-chips">${z.chips.map(tkChip).join('')}</div></div>`).join('');
      // T2 の上（今日の馬場）と下（ペースの説明・今週の馬場）の見せ方の案（同日ユーザー「T2を軸にここをさらに洗練」）
      //   ?t2v=v0 最初のT2／v1 2×2の数字パネル／v2 一文の見出し＋小さな補足／v3 上下を同じ形の横長バーでそろえる
      const top = { v0: `<div class="t2-chiprow">${chips}</div>` };
      const wk = D.io || D.fb || D.clock;
      const clockCls = D.clock ? (D.clock.fast ? 'fast' : 'slow') : '';
      const timeSign = D.time ? (D.time.cls === 'p1' ? '−' : D.time.cls === 'm1' ? '+' : '') : '';
      // v1：2×2の数字パネル
      top.v1 = `<div class="v1-panel"><h4>今日の馬場</h4><div class="v1-grid">
          ${D.baba ? `<div class="v1-cell"><i>馬場</i><b class="v1-lv ${esc(D.baba.cls)}">${esc(D.baba.label)}</b><small>${esc(D.baba.rail)}</small></div>` : ''}
          ${D.time ? `<div class="v1-cell ${timeCls}"><i>勝ちタイム</i><b class="bt-num">${timeSign}${esc(D.time.v)}<small>秒</small></b><small>${esc(D.time.word)}</small></div>` : ''}
          ${D.rise ? `<div class="v1-cell"><i>高低差</i><b class="bt-num">${esc(D.rise.v)}<small>m</small></b><small>${esc(D.rise.word)}</small></div>` : ''}
          ${D.baba && D.baba.aim ? `<div class="v1-cell"><i>この馬場で変わること</i><b class="bt-num v1-aim">${esc(D.baba.aim)}</b><small>ふだん→今日の馬場</small></div>` : ''}
        </div></div>`;
      // v2：一文の見出し＋小さな補足
      top.v2 = `<div class="v2-head">
          <div class="v2-l1">${D.baba ? `<b class="v2-lv ${esc(D.baba.cls)}">${esc(D.baba.label)}</b>` : ''}${D.time ? `<span class="${timeCls}">時計は<b>${esc(D.time.word.replace('時計が', ''))}</b><em class="bt-num">${timeSign}${esc(D.time.v)}秒</em></span>` : ''}</div>
          <div class="v2-l2">${[D.baba && D.baba.rail, D.rise && `高低差 ${esc(D.rise.v)}m（${esc(D.rise.word)}）`, D.baba && D.baba.aim].filter(Boolean).map((x) => `<span>${x}</span>`).join('')}</div>
        </div>`;
      // v3：横長バー（今日と今週で同じ形）
      const seg = (k, v, w, cls = '') => `<div class="v3-seg ${cls}"><i>${k}</i><div class="v3-v">${v}</div>${w ? `<small>${w}</small>` : ''}</div>`;
      top.v3 = `<div class="v3-bar-wrap"><h4>今日の馬場${D.baba && D.baba.rail ? `<small>${esc(D.baba.rail)}</small>` : ''}</h4><div class="v3-bar">
          ${D.baba ? seg('馬場', `<b class="v3-lv ${esc(D.baba.cls)}">${esc(D.baba.label)}</b>`, esc(D.baba.aim), 'wide') : ''}
          ${D.time ? seg('勝ちタイム', `<b class="bt-num ${timeCls}">${timeSign}${esc(D.time.v)}<small>秒</small></b>`, esc(D.time.word)) : ''}
          ${D.rise ? seg('高低差', `<b class="bt-num">${esc(D.rise.v)}<small>m</small></b>`, esc(D.rise.word)) : ''}
        </div></div>`;

      const bottom = {
        v0: `<div class="t2-pt">${D.pace.map((r) => `<span><b>${esc(r.nm)}</b>${esc(r.sb)}・${esc(r.pt)}</span>`).join('')}</div>
          ${wk ? `<div class="t2-wk"><h4>今週の馬場<small>${esc(D.wkScope)}</small></h4><div class="t2-wkrow">
          ${D.io ? `<div><i>内と外</i>${tkSee(D.io.L, D.io.tick, ['内', '外'])}<b class="${esc(D.io.cls)}">${esc(D.io.word)}</b></div>` : ''}
          ${D.fb ? `<div><i>前と後ろ</i>${tkSee(D.fb.L, D.fb.tick, ['前', '後'], 'tkfb')}<b class="${esc(D.fb.cls)}">${esc(D.fb.word)}</b></div>` : ''}
          ${D.clock ? `<div><i>時計</i><span class="bt-num t2-clock">${esc(D.clock.v)}<small>秒</small></span><b>${esc(D.clock.word)}</b></div>` : ''}
          </div></div>` : ''}`,
      };
      // v1：今週も2列×…のパネル（ゲージを大きく、言葉を太く、件数を小さく）
      bottom.v1 = wk ? `<div class="v1-panel"><h4>今週の馬場<small>${esc(D.wkScope)}</small></h4><div class="v1-grid three">
          ${D.io ? `<div class="v1-cell"><i>内と外</i>${tkSee(D.io.L, D.io.tick, ['内', '外'], 'big')}<b class="v1-w ${esc(D.io.cls)}">${esc(D.io.word)}</b><small>${esc(D.io.n)}</small></div>` : ''}
          ${D.fb ? `<div class="v1-cell"><i>前と後ろ</i>${tkSee(D.fb.L, D.fb.tick, ['前', '後ろ'], 'tkfb big')}<b class="v1-w ${esc(D.fb.cls)}">${esc(D.fb.word)}</b><small>${esc(D.fb.n)}</small></div>` : ''}
          ${D.clock ? `<div class="v1-cell ${clockCls}"><i>時計</i><b class="bt-num">${esc(D.clock.v)}<small>秒</small></b><small>${esc(D.clock.word)}・${esc(D.clock.n)}</small></div>` : ''}
        </div></div>` : '';
      // v2：今週を行の一覧に（左に項目、真ん中にゲージ、右に言葉）
      bottom.v2 = wk ? `<div class="v2-list"><h4>今週の馬場<small>${esc(D.wkScope)}</small></h4>
          ${D.io ? `<div class="v2-row"><i>内と外</i>${tkSee(D.io.L, D.io.tick, ['内', '外'])}<b class="${esc(D.io.cls)}">${esc(D.io.word)}</b><small>${esc(D.io.n)}</small></div>` : ''}
          ${D.fb ? `<div class="v2-row"><i>前と後ろ</i>${tkSee(D.fb.L, D.fb.tick, ['前', '後ろ'], 'tkfb')}<b class="${esc(D.fb.cls)}">${esc(D.fb.word)}</b><small>${esc(D.fb.n)}</small></div>` : ''}
          ${D.clock ? `<div class="v2-row"><i>時計</i><span class="v2-clock bt-num ${clockCls}">${esc(D.clock.v)}<small>秒</small></span><b>${esc(D.clock.word)}</b><small>${esc(D.clock.n)}</small></div>` : ''}
        </div>` : '';
      // v3：今日と同じ横長バー
      bottom.v3 = wk ? `<div class="v3-bar-wrap"><h4>今週の馬場<small>${esc(D.wkScope)}</small></h4><div class="v3-bar">
          ${D.io ? seg('内と外', tkSee(D.io.L, D.io.tick, ['内', '外']), `<b class="${esc(D.io.cls)}">${esc(D.io.word)}</b>`) : ''}
          ${D.fb ? seg('前と後ろ', tkSee(D.fb.L, D.fb.tick, ['前', '後'], 'tkfb'), `<b class="${esc(D.fb.cls)}">${esc(D.fb.word)}</b>`) : ''}
          ${D.clock ? seg('時計', `<b class="bt-num ${clockCls}">${esc(D.clock.v)}<small>秒</small></b>`, esc(D.clock.word)) : ''}
        </div></div>` : '';
      // v1〜v3：ペースの説明は帯の中へ入れる（帯の下の2行をなくす）
      const paceBar2 = `<div class="tk-pbar big">${D.pace.map((r, i) => `<i class="p${i}${r.pp < 30 ? ' narrow' : ''}" style="flex:${r.pp}"><b>${esc(r.nm)}<em class="bt-num">${r.pp}%</em></b><span>${esc(r.sb)}・${esc(r.pt.replace('通過', ''))}</span></i>`).join('')}${paceSum < 100 ? `<i class="px" style="flex:${100 - paceSum}"><span>他${100 - paceSum}%</span></i>` : ''}</div>`;
      const V = T2V;
      // ---- 見せ方を丸ごと変える案（同日ユーザー「今とは全く違うデザインに」）。w1 計器盤／w2 大きな札＋左右の対決グラフ／w3 ものさし ----
      if (V === 'w1' || V === 'w2' || V === 'w3') {
        const LV5 = ['軟らかい', 'やや軟らかい', 'いつも通り', 'やや硬い', '硬い'];
        const LV5D = ['湿っている', 'やや湿っている', 'いつも通り', 'やや乾いている', '乾いている'];
        const isDirt = D.baba && LV5D.includes(D.baba.label) && D.baba.label !== 'いつも通り' ? true : String((site.race || {}).surface || '').startsWith('ダ');
        const lvIdx = D.baba ? Math.max(0, (isDirt ? LV5D : LV5).indexOf(D.baba.label)) : 2;
        const lvT = lvIdx / 4;
        const lvEnds = isDirt ? ['湿', '乾'] : ['軟', '硬'];
        const tSec = D.time ? Math.max(0, Math.min(1, 0.5 + (D.time.cls === 'p1' ? -1 : 1) * Number(D.time.v) / 1.0)) : 0.5;
        const tRise = D.rise ? Math.max(0, Math.min(1, Number(D.rise.v) / 5)) : 0;
        const ioP = D.io ? (D.io.n.match(/内([\d.]+)% 外([\d.]+)%/) || []) : [];
        const fbP = D.fb ? (D.fb.n.match(/前(\d+) 後ろ(\d+)/) || []) : [];
        const clockT = D.clock ? Math.max(0, Math.min(1, 0.5 + Number(D.clock.v) / 1.0)) : 0.5;
        const sign = (v, cls) => `${cls === 'p1' ? '−' : '+'}${v}`;
        const pbar = paceBar2;
        const field = `<div class="t2-field">
            <div class="t2-sky">${pbar}</div>
            <div class="t2-zones">${zones}</div>
            <div class="t2-gatehd"><span>枠順${D.gateScope ? `（${esc(D.gateScope)}）` : ''}</span>${D.tilt ? `<b>${esc(D.tilt.word)}</b>` : ''}</div>
            <div class="t2-gatebox">${gatesRow}</div>
          </div>`;
        if (V === 'w1') {
          // W1 計器盤：車のメーターのような半円の計器を並べる。針の位置で「どちら寄りか」を一目で見せる
          const gauge = (t, ends, big, small, tone) => {
            const R = 34, cx = 44, cy = 42;
            const ang = Math.PI * (1 - t);
            const x = cx + R * Math.cos(ang), y = cy - R * Math.sin(ang);
            const large = 0;
            return `<div class="w1-g ${tone || ''}"><svg viewBox="0 0 88 50" width="88" height="50">
                <path d="M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}" class="trk"/>
                <path d="M ${cx - R} ${cy} A ${R} ${R} 0 ${large} 1 ${x.toFixed(1)} ${y.toFixed(1)}" class="val"/>
                <line x1="${cx}" y1="${cy}" x2="${(cx + (R - 8) * Math.cos(ang)).toFixed(1)}" y2="${(cy - (R - 8) * Math.sin(ang)).toFixed(1)}" class="ndl"/>
                <circle cx="${cx}" cy="${cy}" r="3.5" class="hub"/>
                <text x="${cx - R}" y="${cy + 8}" class="end" text-anchor="middle">${ends[0]}</text>
                <text x="${cx + R}" y="${cy + 8}" class="end" text-anchor="middle">${ends[1]}</text>
              </svg><b>${big}</b><small>${small}</small></div>`;
          };
          const today = `<div class="w1-panel"><div class="w1-hd"><b>今日の馬場</b><span>${esc((D.baba && D.baba.rail) || '')}</span></div><div class="w1-row">
              ${D.baba ? gauge(lvT, lvEnds, esc(D.baba.label), isDirt ? 'ダートの湿り気' : '芝の硬さ', 'blue') : ''}
              ${D.time ? gauge(tSec, ['速', '遅'], `<span class="bt-num">${sign(esc(D.time.v), D.time.cls)}</span>秒`, esc(D.time.word), timeCls) : ''}
              ${D.rise ? gauge(tRise, ['平', '急'], `<span class="bt-num">${esc(D.rise.v)}</span>m`, `高低差・${esc(D.rise.word)}`, 'gray') : ''}
            </div>${D.baba && D.baba.aim ? `<div class="w1-foot">この馬場だと　<b>${esc(D.baba.aim)}</b></div>` : ''}</div>`;
          const week = wk ? `<div class="w1-panel dark"><div class="w1-hd"><b>今週の馬場</b><span>${esc(D.wkScope)}</span></div><div class="w1-row">
              ${D.io ? gauge(1 - D.io.L / 100, ['内', '外'], esc(D.io.word), `内${ioP[1] || '—'}%・外${ioP[2] || '—'}%`, 'red') : ''}
              ${D.fb ? gauge(1 - D.fb.L / 100, ['前', '後'], esc(D.fb.word), `前${fbP[1] || '—'}頭・後ろ${fbP[2] || '—'}頭`, 'blue') : ''}
              ${D.clock ? gauge(clockT, ['速', '遅'], `<span class="bt-num">${esc(D.clock.v)}</span>秒`, `${esc(D.clock.word)}・${esc(D.clock.n)}`, clockCls) : ''}
            </div></div>` : '';
          return `<div class="race20 rvC tk2 t2 t2-w1">${today}${field}${week}</div>`;
        }
        if (V === 'w2') {
          // W2 大きな札＋左右の対決グラフ：馬場は色の付いた大きな札1枚に。今週は内と外・前と後ろを左右に伸びる棒で向かい合わせる
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
          const vs = (lk, lv, rk, rv, unit, word, cls) => {
            const a = Number(lv) || 0, b = Number(rv) || 0, m = Math.max(a, b, 1);
            return `<div class="w2-vs"><div class="w2-side l"><b class="bt-num">${lv}<small>${unit}</small></b><i style="width:${(a / m * 100).toFixed(0)}%"></i><span>${lk}</span></div>
              <div class="w2-mid ${cls}">${word}</div>
              <div class="w2-side r"><span>${rk}</span><i style="width:${(b / m * 100).toFixed(0)}%"></i><b class="bt-num">${rv}<small>${unit}</small></b></div></div>`;
          };
          const week = wk ? `<div class="w2-week"><div class="w2-wh"><b>今週の馬場</b><span>${esc(D.wkScope)}</span></div>
              ${D.io ? `<div class="w2-cap">3着以内に入った率</div>${vs('内', ioP[1], '外', ioP[2], '%', esc(D.io.word), esc(D.io.cls))}` : ''}
              ${D.fb ? `<div class="w2-cap">3着以内の馬が4角にいた位置</div>${vs('前', fbP[1], '後ろ', fbP[2], '頭', esc(D.fb.word), esc(D.fb.cls)).replace('w2-vs"', 'w2-vs w2fb"')}` : ''}
              ${D.clock ? `<div class="w2-clock ${clockCls}"><span>時計</span><b class="bt-num">${esc(D.clock.v)}<small>秒</small></b><em>${esc(D.clock.word)}</em><small>${esc(D.clock.n)}</small></div>` : ''}
            </div>` : '';
          const alt = wk && WK !== 'k0' ? weekAlt(D, ioP, fbP, clockCls) : '';
          return `<div class="race20 rvC tk2 t2 t2-w2">${hero}${field}${alt || week}</div>`;
        }
        // W3 ものさし：どの項目も「端から端までの目盛りのどこにいるか」を丸い印で示す。上も下も同じ読み方
        const ruler = (k, t, ends, word, sub, tone) => `<div class="w3-r ${tone || ''}">
            <div class="w3-k"><b>${k}</b><span>${sub || ''}</span></div>
            <div class="w3-track"><i class="w3k0"></i><i class="w3k1"></i><i class="w3k2"></i><i class="w3k3"></i><i class="w3k4"></i>
              <em class="${t > 0.8 ? 'rt' : t < 0.2 ? 'lt' : ''}" style="left:${(t * 100).toFixed(1)}%"><u>${word}</u></em></div>
            <div class="w3-ends"><span>${ends[0]}</span><span>${ends[1]}</span></div></div>`;
        const today = `<div class="w3-card"><div class="w3-hd"><b>今日の馬場</b><span>${esc((D.baba && D.baba.rail) || '')}</span></div>
            ${D.baba ? ruler(isDirt ? '湿り気' : '硬さ', lvT, isDirt ? ['湿っている', '乾いている'] : ['軟らかい', '硬い'], esc(D.baba.label), esc(D.baba.aim), 'blue') : ''}
            ${D.time ? ruler('勝ちタイム', tSec, ['速い', 'かかる'], `${sign(esc(D.time.v), D.time.cls)}秒`, esc(D.time.word), timeCls) : ''}
            ${D.rise ? ruler('高低差', tRise, ['平坦 0m', '急 5m'], `${esc(D.rise.v)}m`, esc(D.rise.word), 'gray') : ''}
          </div>`;
        const week = wk ? `<div class="w3-card"><div class="w3-hd"><b>今週の馬場</b><span>${esc(D.wkScope)}</span></div>
            ${D.io ? ruler('内と外', 1 - D.io.L / 100, ['内が有利', '外が有利'], esc(D.io.word), `3着内 内${ioP[1] || '—'}%・外${ioP[2] || '—'}%`, 'red') : ''}
            ${D.fb ? ruler('前と後ろ', 1 - D.fb.L / 100, ['前が有利', '後ろが有利'], esc(D.fb.word), `3着内 前${fbP[1] || '—'}頭・後ろ${fbP[2] || '—'}頭`, 'blue') : ''}
            ${D.clock ? ruler('時計', clockT, ['速い', '遅い'], `${esc(D.clock.v)}秒`, `${esc(D.clock.word)}・${esc(D.clock.n)}`, clockCls) : ''}
          </div>` : '';
        return `<div class="race20 rvC tk2 t2 t2-w3">${today}${field}${week}</div>`;
      }
      return `<div class="race20 rvC tk2 t2 t2-${V}">
        ${top[V] || top.v0}
        <div class="t2-field">
          <div class="t2-sky">${V === 'v0' ? paceBar : paceBar2}</div>
          <div class="t2-zones">${zones}</div>
          <div class="t2-gatehd"><span>枠順${D.gateScope ? `（${esc(D.gateScope)}）` : ''}</span>${D.tilt ? `<b>${esc(D.tilt.word)}</b>` : ''}</div>
          <div class="t2-gatebox">${gatesRow}</div>
        </div>
        ${V === 'v0' ? bottom.v0 : (bottom[V] || '')}
      </div>`;
    }
    // T3 設定画面のような一覧：左に項目、右に答え。色は等級と馬場の札だけ
    const row = (k, v, sub = '', cls = '') => `<div class="t3-row ${cls}"><span class="k">${k}</span><span class="v">${v}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const legRows = D.zones.map((z) => `<div class="t3-leg${z.me ? ' me' : ''}">
        <span class="t3-st" style="color:${STYLE_INK[z.style] || '#333'}">${esc(z.style)}</span>${tkG(z.grade)}<span class="bt-num t3-rate">${esc(z.rate)}</span>
        <span class="t3-chips">${z.chips.map(tkChip).join('')}</span></div>`).join('');
    return `<div class="race20 rvC tk2 t3">
      <h4>ペースの見込み</h4><div class="t3-group">${paceBar}${D.pace.map((r, i) => row(`<b>${esc(r.nm)}</b> ${esc(r.sb)}`, `<b class="bt-num">${r.pp}%</b>`, esc(r.pt), i === 0 ? 'on' : '')).join('')}</div>
      <h4>脚質<small>このコースの複勝率</small></h4><div class="t3-group">${legRows}</div>
      <h4>枠順<small>${esc(D.gateScope || 'このコースの成績')}</small></h4><div class="t3-group">${gatesRow}${D.tilt ? row('枠の有利', `<b class="${esc(D.tilt.cls)}">${esc(D.tilt.word)}</b>`) : ''}</div>
      <h4>今日の馬場</h4><div class="t3-group">
        ${D.baba ? row('馬場', `<span class="t3-lv ${esc(D.baba.cls)}">${esc(D.baba.label)}</span>`, esc(D.baba.aim)) : ''}
        ${D.baba && D.baba.rail ? row('仮柵', esc(D.baba.rail)) : ''}
        ${D.time ? row('勝ちタイム', `<b class="bt-num ${timeCls}">${esc(D.time.v)}秒</b>`, esc(D.time.word)) : ''}
        ${D.rise ? row('高低差', `<b class="bt-num">${esc(D.rise.v)}m</b>`, esc(D.rise.word)) : ''}
      </div>
      ${D.io || D.fb || D.clock ? `<h4>今週の馬場<small>${esc(D.wkScope)}</small></h4><div class="t3-group">
        ${D.io ? row('内と外', `<b class="${esc(D.io.cls)}">${esc(D.io.word)}</b>`, esc(D.io.n)) : ''}
        ${D.fb ? row('前と後ろ', `<b class="${esc(D.fb.cls)}">${esc(D.fb.word)}</b>`, esc(D.fb.n)) : ''}
        ${D.clock ? row('時計', `<b class="bt-num ${D.clock.fast ? 'fast' : 'slow'}">${esc(D.clock.v)}秒</b>`, `${esc(D.clock.word)}・${esc(D.clock.n)}`) : ''}
      </div>` : ''}
    </div>`;
  }

  // 全戦績のページ（2026-09-17 ユーザー指示・試作中）。1走＝2行の細い行。
  //   1行目：着順・日付・場・クラスの札・レース名・距離と馬場
  //   2行目：着差・タイム（金銀銅）・上がりと順位（金銀銅）・通過順・人気／頭数・騎手と斤量
  //   地の色は直近5走と同じ（1着＝金・僅差＝青）。直近5走の行を押すとその走のページへ
  function allPage(h, from, to) {
    const all = allRuns(h);
    const out = [];
    for (let i = from; i < to; i += 1) {
      const r = all[i];
      const d = summaryRun(h, r, Math.min(i, 4));
      const go = i < 5 ? ` data-goto="${i + RUN_PAGE0}"` : '';
      out.push(`<div class="al-row ${d.band ? `bd-${d.band}` : ''}${i < 5 ? ' al-go' : ''}"${go}>
        <b class="al-fin bt-num ${d.finMd}">${esc(d.finTxt)}</b>
        <div class="al-m">
          <div class="al-r1"><span class="bt-num al-dt">${esc(d.date)}</span><span>${esc(d.track)}</span>${d.clsHtml}
            <span class="al-rn">${esc(d.rn)}</span>
            <b class="bt-num ${d.sf}">${esc(d.sfTxt)}${esc(d.dist)}<small>${esc(d.going)}</small></b></div>
          <div class="al-r2"><b class="bt-num al-mg">${d.mgTxt}</b><b class="bt-num ${d.tg}">${esc(d.time)}</b>
            <span class="al-up"><b class="bt-num ${d.rkMd}">${esc(d.up)}</b><small>${d.rk != null ? `${d.rk}位` : ''}</small></span>
            <span class="bt-num al-cn">${esc(d.corners.join('-'))}</span>
            <span class="bt-num al-pop">${esc(d.pop)}<small>人/${d.field}</small></span>
            <span class="al-jk" style="font-size:${[...d.jockey].length >= 5 ? 9 : 10.5}px">${esc(d.jockey)}<small class="bt-num">${esc(d.weight)}</small></span></div>
        </div>
      </div>`);
      // 休養の帯は全戦績には出さない（2026-09-17 ユーザー「ここに休養は不要」）。直近5走のページには残す
    }
    return `<div class="race20 rvC c3 mx hd-r3 sm-page al-page al-${CR} bc-${BC}">${out.join('')}</div>`;
  }

  function runPage(h, i) {
    const r = h.past_runs[i];
    const prev = h.past_runs[i + 1];
    const race = site.race || {};
    const field = Number(r.field_size || r.runners) || null;
    const fin = Number(r.finish);
    const mg = r.margin != null && r.margin !== '' ? Number(r.margin) : null;
    const mgTxt = mg == null ? '—' : fin === 1 ? `${Math.abs(mg).toFixed(1)}秒 離して勝ち` : `${mg.toFixed(1)}秒 差`;
    // 1〜3着は金・銀・銅（2026-09-17 ユーザー指示）。w2 を足した
    const finCls = fin === 1 ? 'w1' : fin === 2 ? 'w2' : fin === 3 ? 'w3' : '';

    // 間隔：前走は今回のレース日との差、それ以外は1つ前の走との差（5走前は1つ前が無いので出さない）
    const gapNow = i === 0 ? days(toDate(race.date), toDate(r.date)) : null;
    // 5走前はひとつ前の走が past_runs に無いので、career_runs と合わせた一覧から間隔を取る
    // （色の判定 condOf と同じ一覧。2026-09-17 に表示「—」なのに色が付く食い違いを直した）
    const gapPrev = prev ? days(toDate(r.date), toDate(prev.date)) : (condOf(h).gapOf[r.race_id] ?? r.rest_days ?? null);
    const isFirst = i === 0;
    const diff = (a, b, unit) => {
      if (a == null || b == null || a === '' || b === '') return '';
      const d = Number(b) - Number(a);
      return `<span class="yf-diff${d ? ' on' : ''}">今回 ${esc(b)}${unit}${d ? `（${d > 0 ? '+' : ''}${d}${unit}）` : '（同じ）'}</span>`;
    };
    const going = race.going || '';
    const goingDiff = isFirst && going
      ? `<span class="yf-diff${going !== r.condition ? ' on' : ''}">今回 ${esc(going)}${going === r.condition ? '（同じ）' : ''}</span>` : '';

    // 位置は図に決まった（2026-09-17 ユーザー決定。数字との見比べボタンは外した）
    // この走の脚質（位置の図・レースの流れの札の色に使う）。判定は本番と同じ
    // （keiba_review.style_of / race.js reviewZoneOf：最初のコーナーで1番手＝逃げ、以降は通過順÷頭数を 0.33 / 0.66 で切る）
    const c1st = Number(String(r.corners || '').split('-')[0]) || null;
    const runStyle = !c1st || !field ? null : c1st === 1 ? '逃げ' : c1st / field <= 0.33 ? '先行' : c1st / field <= 0.66 ? '差し' : '追込';
    const stColCls = { '逃げ': 'st-nige', '先行': 'st-sen', '差し': 'st-sashi', '追込': 'st-oi' }[runStyle] || 'st-none';
    const posBody = posFigure(r, field, stColCls);

    // 強弱は3段（2026-09-17 案）：
    //   大 … 着順・着差
    //   中 … 間隔・コーナーごとの位置・斤量・馬場（見る順番の4つ）
    //   小 … 残りの10個。別の欄にまとめず、どれを説明する材料かで主役の横に添える
    //        レース・距離 → いちばん上の帯（どのレースの話か）
    //        人気・勝ち馬・タイム → 着順の下（期待と結果・誰に負けたか）
    //        上がり・流れ・メモ → 位置の図の下（どう走ったか）
    //        騎手・馬体重 → 斤量の下（背負った条件・馬の状態。2026-09-17 案Aに決定）
    const sm = (k, v) => (v == null || v === '' ? '' : `<span class="yf-sm"><i>${k}</i>${esc(v)}</span>`);
    const up = r.last_3f ? `${r.last_3f}秒${r.last3f_rank ? `（${r.last3f_rank}位）` : ''}` : '';
    const upCls = r.last3f_rank === 1 ? ' top' : r.last3f_rank && r.last3f_rank <= 3 ? ' good' : '';
    const memo = r.note_text || (r.note_labels || []).join('・');
    // 勝ち馬の最高成績（winner_best）とレースの強さ（level_grade）は本番の札と同じ見た目で出す（2026-09-17 抜けを指摘されて追加）
    const lvB = r.level_grade
      ? `<span class="lv lv-${esc(String(r.level_grade).toLowerCase())}" title="レースレベル（出走馬のその後180日・同じクラスの中での相対）"><i>Lv</i>${esc(r.level_grade)}</span>` : '';
    const grB = r.grade ? `<b class="gr">${esc(r.grade)}</b>` : '';
    const wLab = fin === 1 ? '2着馬' : '勝ち馬';
    const wbB = r.winner_best ? `<b class="yf-wb">${esc(r.winner_best)}</b>` : '';
    const gapMain = isFirst ? (gapNow != null ? `今回まで ${wk(gapNow)}` : '—') : (gapPrev != null ? wk(gapPrev) : '—');
    const gapSub = isFirst ? (gapPrev != null ? `この走の前は ${wk(gapPrev)}空いていた` : '') : (gapPrev != null ? 'ひとつ前の走から' : 'ひとつ前の走は記録なし');
    const kg = r.weight ? `${esc(r.weight)}kg` : '—';
    const kgDiff = isFirst ? diff(r.weight, h.weight_carried != null ? String(h.weight_carried).replace(/\.0$/, '') : null, 'kg') : '';
    const baba = `${esc(r.surface || '')} ${esc(r.condition || '—')}`;
    const dist = `${esc(r.surface || '')}${esc(r.distance || '')}m`;
    const upB = up ? `<span class="yf-sm${upCls}"><i>上がり</i>${esc(up)}</span>` : '';
    const memoB = memo ? `<div class="yf-memo">${esc(memo)}</div>` : '';
    const fieldTxt = field ? `${field}頭立て` : '';
    const popTxt = r.popularity ? `${r.popularity}番人気` : '';
    const bw = r.body_weight ? `${r.body_weight}kg` : '';

    // ---- 3案（2026-09-17 ユーザー指示「デザイン案を3つ」）。?rv=a|b|c で切り替える ----
    // A スコアボード型：結果を紺の帯に白抜きで大きく。下は白い枠を順に積む
    if (RV === 'a') {
      return `<div class="race20 rvA">
        <div class="a-hero">
          <div class="a-meta"><span>${esc(String(r.date || '').slice(5))} ${esc(r.track || '')}</span>${grB}<span class="rn">${esc(r.race_name || '')}</span>${lvB}<span class="ds">${dist}</span></div>
          <div class="a-score">
            <div class="a-fin ${finCls}">${esc(r.finish ?? '—')}<small>着</small></div>
            <div class="a-right"><div class="a-mg">${esc(mgTxt)}</div><div class="a-f">${fieldTxt}・${esc(popTxt)}・${esc(r.time || '')}</div></div>
          </div>
          <div class="a-win"><i>${wLab}</i>${esc(r.winner || '—')}${wbB}</div>
        </div>
        <div class="a-gap"><i>間隔</i><b>${gapMain}</b><span>${gapSub}</span></div>
        <div class="a-box"><div class="a-h">コーナーごとの位置</div>${posBody}
          <div class="yf-sub in">${upB}${sm('流れ', r.scenario)}</div>${memoB}</div>
        <div class="a-two">
          <div class="a-box"><div class="a-h">斤量</div><div class="a-v">${kg}</div>${kgDiff}
            <div class="yf-sub in col">${sm('騎手', r.jockey)}${sm('馬体重', bw)}</div></div>
          <div class="a-box"><div class="a-h">馬場</div><div class="a-v">${baba}</div>${goingDiff}</div>
        </div>
      </div>`;
    }
    // B 新聞・罫線型：枠も地の色も使わず、罫線と文字の大きさだけで段を付ける
    if (RV === 'b') {
      const row = (k, v, sub) => `<div class="b-row"><div class="b-k">${k}</div><div class="b-v">${v}${sub ? `<div class="b-s">${sub}</div>` : ''}</div></div>`;
      return `<div class="race20 rvB">
        <div class="b-meta"><span>${esc(String(r.date || '').slice(5))}</span><span>${esc(r.track || '')}</span>${grB}<span class="rn">${esc(r.race_name || '')}</span>${lvB}<span class="ds">${dist}</span></div>
        <div class="b-top">
          <div class="b-fin ${finCls}">${esc(r.finish ?? '—')}<small>着</small></div>
          <div class="b-info">
            <div class="b-mg">${esc(mgTxt)}</div>
            <div class="b-l">${fieldTxt}　${esc(popTxt)}　${esc(r.time || '')}</div>
            <div class="b-l">${wLab} <b>${esc(r.winner || '—')}</b>${wbB}</div>
          </div>
        </div>
        ${row('間隔', `<b>${gapMain}</b>`, gapSub)}
        <div class="b-row col"><div class="b-k">位置</div><div class="b-v">${posBody}
          <div class="yf-sub in">${upB}${sm('流れ', r.scenario)}</div>${memoB}</div></div>
        ${row('斤量', `<b>${kg}</b>${kgDiff ? ` ${kgDiff}` : ''}`, `騎手 ${esc(r.jockey || '—')}　馬体重 ${esc(bw || '—')}`)}
        ${row('馬場', `<b>${baba}</b>${goingDiff ? ` ${goingDiff}` : ''}`, '')}
      </div>`;
    }
    // ---- C を土台にした3案（2026-09-17 ユーザー「Cが一番わかりやすい。Cを軸にさらに洗練」）。?rv=c1|c2|c3 ----
    const metaLine = `${esc(String(r.date || '').slice(5))} ${esc(r.track || '')} ${grB} <b>${esc(r.race_name || '')}</b> ${lvB} ${dist}`;
    const pill = (html) => html.replace('class="yf-diff on"', 'class="cp-pill on"').replace('class="yf-diff"', 'class="cp-pill"');
    // C1 設定アプリ改：見出しでまとまりを区切り、結果は白い角丸の中に。差分は丸い札に
    if (RV === 'c1') {
      const li = (k, v, sub) => `<div class="c-li"><span class="c-k">${k}</span><span class="c-v">${v}${sub ? `<em>${sub}</em>` : ''}</span></div>`;
      return `<div class="race20 rvC c1">
        <div class="c-meta">${metaLine}</div>
        <div class="c-grp c1-hero">
          <div class="c1-fin ${finCls}">${esc(r.finish ?? '—')}<small>着</small></div>
          <div class="c1-r"><div class="c1-mg">${esc(mgTxt)}</div><div class="c1-sub">${fieldTxt}</div></div>
        </div>
        <div class="c-grp">${li('人気', esc(popTxt || '—'))}${li(wLab, `${esc(r.winner || '—')}${wbB}`)}${li('タイム', esc(r.time || '—'))}</div>
        <div class="c-cap">間隔</div>
        <div class="c-grp">${li(isFirst ? '今回まで' : 'ひとつ前の走から', `<b>${gapMain.replace('今回まで ', '')}</b>`, isFirst ? gapSub : '')}</div>
        <div class="c-cap">コーナーごとの位置</div>
        <div class="c-grp c-pad">${posBody}<div class="yf-sub in">${upB}${sm('流れ', r.scenario)}</div>${memoB}</div>
        <div class="c-cap">条件</div>
        <div class="c-grp">${li('斤量', `<b>${kg}</b>${pill(kgDiff)}`)}${li('馬場', `<b>${baba}</b>${pill(goingDiff)}`)}${li('騎手', esc(r.jockey || '—'))}${li('馬体重', esc(bw || '—'))}</div>
      </div>`;
    }
    // C2 ウィジェット型：iPhoneのホーム画面のウィジェットのように、角丸の札を並べる
    if (RV === 'c2') {
      const tile = (k, v, sub, cls) => `<div class="w-t ${cls || ''}"><div class="w-k">${k}</div><div class="w-v">${v}</div>${sub ? `<div class="w-s">${sub}</div>` : ''}</div>`;
      return `<div class="race20 rvC c2">
        <div class="w-hero">
          <div class="w-meta">${metaLine}</div>
          <div class="w-main"><div class="w-fin ${finCls}">${esc(r.finish ?? '—')}<small>着</small></div>
            <div class="w-mg">${esc(mgTxt)}<span>${fieldTxt}</span></div></div>
          <div class="w-chips"><span>${esc(popTxt || '—')}</span><span>${esc(r.time || '—')}</span></div>
        </div>
        <div class="w-row2">
          ${tile(wLab, esc(r.winner || '—'), r.winner_best ? `最高 ${esc(r.winner_best)}` : '')}
          ${tile('間隔', gapMain.replace('今回まで ', ''), isFirst ? `今回まで／${gapSub}` : gapSub, 'accent')}
        </div>
        <div class="w-t w-pos"><div class="w-k">コーナーごとの位置</div>${posBody}<div class="yf-sub in">${upB}${sm('流れ', r.scenario)}</div>${memoB}</div>
        <div class="w-row3">
          ${tile('斤量', kg, pill(kgDiff))}
          ${tile('馬場', baba, pill(goingDiff))}
          ${tile('騎手', esc(r.jockey || '—'), esc(bw ? `馬体重 ${bw}` : ''), 'small')}
        </div>
      </div>`;
    }
    // C3 ヘルスケア型：iPhoneのヘルスケアアプリのように、1つのまとまり＝1枚。色つきの見出しと、左寄せの大きな値
    if (RV === 'c3') {
      const card = (col, title, right, body) => `<div class="h-card"><div class="h-top"><span class="h-t" style="color:${col}">${title}</span><span class="h-r">${right || ''}</span></div>${body}</div>`;
      return `<div class="race20 rvC c3">
        <div class="c-meta">${metaLine}</div>
        ${card('var(--navy)', '● 結果', esc(fieldTxt), `<div class="h-big ${finCls}">${esc(r.finish ?? '—')}<small>着</small><span class="h-mg">${esc(mgTxt)}</span></div>
          <div class="h-line">${esc(popTxt || '—')}　${esc(r.time || '')}</div>
          <div class="h-line">${wLab} <b>${esc(r.winner || '—')}</b>${wbB}</div>`)}
        ${card('var(--hit)', '● 間隔', esc(isFirst ? '今回まで' : (prev ? 'ひとつ前の走から' : '')), `<div class="h-big s">${gapMain.replace('今回まで ', '')}</div>${isFirst && gapSub ? `<div class="h-line">${gapSub}</div>` : ''}`)}
        ${card('var(--link)', '● コーナーごとの位置', '', `${posBody}<div class="yf-sub in">${upB}${sm('流れ', r.scenario)}</div>${memoB}`)}
        ${card('var(--orange)', '● 条件', '', `<div class="h-two"><div><div class="h-k">斤量</div><div class="h-big s">${kg}</div>${pill(kgDiff)}</div>
          <div><div class="h-k">馬場</div><div class="h-big s">${baba}</div>${pill(goingDiff)}</div></div>
          <div class="h-line">騎手 <b>${esc(r.jockey || '—')}</b>　馬体重 <b>${esc(bw || '—')}</b></div>`)}
      </div>`;
    }
    // ---- C3 を主に C2 の部品を足した3案（2026-09-17 ユーザー「C3をメインにC2の要素も」）。?rv=m1|m2|m3 ----
    //   m1 … 結果に人気・タイムの丸札＋「勝ち馬｜間隔（紺）」の横2枚
    //   m2 … 結果に丸札＋条件を「斤量｜馬場｜騎手」の横3枚
    //   m3 … m1 と m2 の両方
    if (RV === 'm1' || RV === 'm2' || RV === 'm3') {
      const two = RV !== 'm2';
      const three = RV !== 'm1';
      // 見出しの「●」は付けない（2026-09-17 ユーザー指示）
      const hc = (col, title, right, body, cls) => `<div class="h-card ${cls || ''}"><div class="h-top"><span class="h-t" style="color:${col}">${String(title).replace(/^● /, '')}</span><span class="h-r">${right || ''}</span></div>${body}</div>`;
      const ht = (k) => (hitOf(h, r, k) ? ' hit' : '');
      const hitTag = (k, short) => (hitOf(h, r, k)
        ? `<div class="m-hit" title="${esc(condOf(h).stat[k])}">${short ? '同条件で好走' : '今回と同じ条件で好走'}</div>` : '');
      const chips = `<div class="m-chips"><span>${esc(popTxt || '—')}</span><span>${esc(r.time || '—')}</span><span>${esc(fieldTxt)}</span></div>`;
      const result = hc('var(--navy)', '● 結果', '', `<div class="h-big ${finCls}">${esc(r.finish ?? '—')}<small>着</small><span class="h-mg">${esc(mgTxt)}</span></div>${chips}
        ${two ? '' : `<div class="h-line">${wLab} <b>${esc(r.winner || '—')}</b>${wbB}</div>`}`);
      const gapFrom = isFirst ? '今回まで' : (gapPrev != null ? 'ひとつ前の走から' : '');
      const gapCard = (cls) => (cls
        ? hc('var(--text)', '● 間隔', '', `<div class="h-big s">${gapMain.replace('今回まで ', '')}</div>${hitTag('gap')}`, cls + ht('gap'))
        : hc('var(--hit)', '● 間隔', esc(gapFrom), `<div class="h-big s">${gapMain.replace('今回まで ', '')}</div>${isFirst && gapSub ? `<div class="h-line">${gapSub.replace('空いていた', '')}</div>` : ''}`));
      // 横3枚の札は狭いので、今回との差を短く言う（同じ／今回 57kg・今回 稍重）
      const kgNow = h.weight_carried != null ? String(h.weight_carried).replace(/\.0$/, '') : null;
      const kgShort = isFirst && r.weight && kgNow
        ? `<span class="cp-pill${Number(kgNow) !== Number(r.weight) ? ' on' : ''}">${Number(kgNow) === Number(r.weight) ? '今回も同じ' : `今回 ${esc(kgNow)}kg`}</span>` : '';
      const goShort = isFirst && going
        ? `<span class="cp-pill${going !== r.condition ? ' on' : ''}">${going === r.condition ? '今回も同じ' : `今回 ${esc(going)}`}</span>` : '';
      const winCard = hc('var(--navy)', `● ${wLab}`, '', `<div class="h-big s wrap">${esc(r.winner || '—')}</div>${r.winner_best ? `<div class="h-line">最高 ${esc(r.winner_best)}</div>` : ''}`);
      // ---- 勝ち馬の段と「上がり・流れ」の見せ方 3案（2026-09-17）。?ft=f1|f2|f3 ----
      // 無指定は F3（2026-09-17 ユーザー決定）
      const FT = 'f3';
      // このレースでの脚質は runPage の頭で決めている（runStyle / stColCls）
      // scenario は「ペース・決着」。後ろの「前／後」はその馬の位置ではなく、レースの決着（前残り／差し・追込）
      // （race.js 93-spec の6マス。2026-09-17 に「位置」と誤って出していたのを直した）
      const [pace, settle] = String(r.scenario || '').split('・');
      const settleTxt = settle === '前' ? '前残り' : settle === '後' ? '差し・追込' : '';
      const rk = r.last3f_rank != null ? Number(r.last3f_rank) : null;
      // 上がりの1〜3位も金・銀・銅（2026-09-17 ユーザー指示。それまでは1位＝赤・2〜3位＝紺）
      const rkCls = rk === 1 ? 'r1' : rk === 2 ? 'r2' : rk === 3 ? 'r3' : '';
      const scale = (opts, v) => `<span class="ft-scale">${opts.map((o) => `<i class="${o === v ? 'on' : ''}">${o}</i>`).join('')}</span>`;
      let posSub = `<div class="yf-sub in">${upB}${sm('流れ', r.scenario)}</div>`;
      let flowCard = '';
      if (FT === 'f1') {
        // F1 小さな2枚：上がり｜流れ
        posSub = `<div class="ft1-row">
          <div class="ft1-t"><i>上がり3F</i><b>${esc(r.last_3f || '—')}<small>秒</small></b>${rk != null ? `<span class="ft-rk ${rkCls}">${rk}位</span>` : ''}</div>
          <div class="ft1-t"><i>流れ</i><b>${esc(pace || '—')}<small>ペース</small></b>${settleTxt ? `<span class="ft-rk">${esc(settleTxt)}の決着</span>` : ''}</div>
        </div>`;
      } else if (FT === 'f2') {
        // F2 丸い札：上がりの順位を色つきの札に、流れを「ペース」「位置」の2つの札に
        posSub = `<div class="ft2-row">
          <span class="ft2-k">上がり</span><b class="ft2-v">${esc(r.last_3f || '—')}秒</b>${rk != null ? `<span class="ft-rk ${rkCls}">${rk}位</span>` : ''}
          <span class="ft2-sep"></span>
          <span class="ft2-k">流れ</span>${pace ? `<span class="ft2-chip">${esc(pace)}ペース</span>` : ''}${settleTxt ? `<span class="ft2-chip">${esc(settleTxt)}</span>` : ''}
        </div>`;
      } else if (FT === 'f3') {
        // F3 目盛り：上がりは頭数の中の順位を棒で、流れは「スロー・平均・ハイ」「前残り・差し追込」の目盛りで
        const w = rk != null && field ? Math.max(4, 100 - ((rk - 1) / Math.max(field - 1, 1)) * 100) : 0;
        posSub = `<div class="ft3">
          <div class="ft3-r"><span class="ft3-k">上がり</span><b class="ft3-up ${rkCls}">${esc(r.last_3f || '—')}秒</b>
            <span class="ft3-bar"><i class="${rkCls}" style="width:${w}%"></i></span><span class="ft3-n ${rkCls}">${rk != null ? `${rk}位` : '—'}<small>／${field ?? '—'}頭</small></span></div>
        </div>`;
        // 脚質は位置の札の右上に出しているので、目盛りの段は外した（2026-09-17 ユーザー指示）。
        // ペースと決着は「レースの流れ」の札に分けて、左右に並べる
        // レースの流れの札は、この走の脚質の色で塗る（2026-09-17 ユーザー案「赤：逃げ、青：追い込み」）。
        // 前ほど暖かく後ろほど冷たく：逃げ＝赤・先行＝黄・差し＝水色・追込＝青。脚質が出ない走は灰
        const stCls = stColCls;
        flowCard = hc('var(--st)', '● レースの流れ', '', `<div class="ft3-flow">
          <div class="fl-col fl-pc"><i class="fl-k">ペース</i>${scale(['スロー', '平均', 'ハイ'], pace)}</div>
          <div class="fl-col fl-se"><i class="fl-k">決着</i>${scale(['前残り', '差し追込'], settleTxt.replace('・', ''))}</div>
        </div>`, `st-card ${stCls}`);
      }
      // 位置の札も脚質の色にそろえる（2026-09-17 ユーザー指示）
      const pos = hc(FT === 'f3' ? 'var(--st)' : 'var(--link)', '● コーナーごとの位置', FT === 'f3' && runStyle ? `<b class="ft3-style ${stColCls}">${runStyle}</b>` : '', `${posBody}${posSub}${memoB}`, FT === 'f3' ? `st-card ${stColCls}` : '') + flowCard;
      const cond = three
        ? `<div class="m-row3 m-row4">
            ${hc('var(--text)', '● 斤量', '', `<div class="h-big s">${kg}</div>${kgShort}${hitTag('weight', 1)}`, ht('weight'))}
            ${hc('var(--text)', '● 馬場', '', `<div class="h-big s baba">${esc(r.condition || '—')}</div>${goShort}${hitTag('going', 1)}`, ht('going'))}
            ${hc('var(--text)', '● 騎手', '', `<div class="h-big xs fit" style="font-size:${jkFs(r.jockey)}px">${esc(r.jockey || '—')}</div>${hitTag('jockey', 1)}`, ht('jockey'))}
            ${hc('var(--text)', '● 馬体重', '', `<div class="h-big s">${esc(bw || '—')}</div>`)}
          </div>`
        : hc('var(--orange)', '● 条件', '', `<div class="h-two"><div><div class="h-k">斤量</div><div class="h-big s">${kg}</div>${pill(kgDiff)}</div>
            <div><div class="h-k">馬場</div><div class="h-big s">${baba}</div>${pill(goingDiff)}</div></div>
            <div class="h-line">騎手 <b>${esc(r.jockey || '—')}</b>　馬体重 <b>${esc(bw || '—')}</b></div>`);
      // ---- 上の3つ（レース名の行・結果・勝ち馬）のカード化 3案（2026-09-17）。?hd=r1|r2|r3 ----
      // 無指定は R3（2026-09-17 ユーザー決定「R3をベース」）
      const HD = 'r3';
      if (RV === 'm3' && HD) {
        const rel = mg == null ? '' : fin === 1 ? `${Math.abs(mg).toFixed(1)}秒差で下した相手` : `${mg.toFixed(1)}秒差で負けた相手`;
        const wBest = r.winner_best ? `<span class="m-pl">最高 ${esc(r.winner_best)}</span>` : '';
        const winPlus = hc('var(--navy)', `● ${wLab}`, '', `<div class="h-big s wrap">${esc(r.winner || '—')}</div>
          <div class="m-pls">${wBest}</div><div class="h-line">${esc(rel)}</div>`);
        const chip = (t, cls) => (t ? `<span class="m-pl ${cls || ''}">${t}</span>` : '');
        const dateTrack = `${esc(String(r.date || '').slice(5))} ${esc(r.track || '')}`;
        let top = '';
        if (HD === 'r1') {
          // R1 レースの札を独立させる：レース → 結果 → 勝ち馬｜間隔
          const raceCard = hc('var(--sub)', '● レース', dateTrack, `<div class="m-rn">${esc(r.race_name || '—')}</div>
            <div class="m-pls">${grB}${lvB}${chip(dist)}${chip(fieldTxt)}</div>`);
          const res = hc('var(--navy)', '● 結果', '', `<div class="h-big ${finCls}">${esc(r.finish ?? '—')}<small>着</small><span class="h-mg">${esc(mgTxt)}</span></div>
            <div class="m-chips"><span>${esc(popTxt || '—')}</span><span>タイム ${esc(r.time || '—')}</span></div>`);
          top = `${raceCard}${res}<div class="m-row2">${winPlus}${gapCard('accent')}</div>`;
        } else if (HD === 'r2') {
          // R2 レースと結果と勝ち馬を1枚にまとめる：上の帯＝レース、中＝結果、下の帯＝勝ち馬
          const hero = `<div class="h-card m-hero">
            <div class="m-band"><div class="m-rn">${esc(r.race_name || '—')}</div><div class="m-pls">${chip(dateTrack)}${grB}${lvB}${chip(dist)}</div></div>
            <div class="m-body"><div class="h-big ${finCls}">${esc(r.finish ?? '—')}<small>着</small><span class="h-mg">${esc(mgTxt)}</span></div>
              <div class="m-chips"><span>${esc(popTxt || '—')}</span><span>タイム ${esc(r.time || '—')}</span><span>${esc(fieldTxt)}</span></div></div>
            <div class="m-foot"><i>${wLab}</i><b>${esc(r.winner || '—')}</b>${wBest}<span>${esc(rel.replace('相手', ''))}</span></div>
          </div>`;
          top = `${hero}${gapCard('accent wide')}`;
        } else if (HD === 'r3') {
          // R3（2026-09-17 改）：レースの札 → 着順｜人気｜タイム → 勝ち馬と勝ち馬との差｜間隔
          //   レースの札は、左に日付と場の四角、右にレース名と「距離・頭数・レベル」の3マス
          //   着差は勝ち馬とセットで見たい（ユーザー指示）ので、勝ち馬の札に大きく入れる
          const ymd = String(r.date || '').split(/[/-]/);
          // 名前の末尾の「(GIII)」「(3勝クラス)」は、クラスの札と同じなので落とす（2026-09-17）
          const rname = stripClass(r.race_name) || '—';
          const raceCard = `<div class="h-card m-race">
            <div class="m-date"><small>${esc(ymd[0] || '')}</small><b>${esc(ymd[1] || '')}/${esc(ymd[2] || '')}</b><span>${esc(r.track || '')}</span></div>
            <div class="m-rmain">
              <div class="m-rn">${raceClass(r.grade, r.race_name) ? clsBadge(raceClass(r.grade, r.race_name)) : (JRA_TRACKS.includes(r.track) ? '' : '<span class="cb c-jusho">地方</span>')}<span>${esc(rname)}</span></div>
              <div class="m-cells">
                <div><i>距離</i><b class="${String(r.surface || '').startsWith('ダ') ? 'sf-dt' : String(r.surface || '').startsWith('芝') ? 'sf-tf' : ''}">${dist}</b></div>
                <div><i>頭数</i><b>${field ?? '—'}頭</b></div>
                <div><i>レベル</i><b>${lvB || '—'}</b></div>
              </div>
            </div>
          </div>`;
          const num = (k, v, u, cls) => `<div class="h-card m-num ${cls || ''}"><div class="h-t">${k}</div><div class="m-nv">${v}<small>${u}</small></div></div>`;
          const mgN = mg == null ? '—' : Math.abs(mg).toFixed(1);
          const winnerBody = () => {
            const nm = esc(r.winner || '—');
            const best = r.winner_best ? esc(r.winner_best) : '';
            if (FT === 'f1') {
              // F1 灰色の小窓に「相手」と最高成績を入れる
              return `<div class="ft1-win"><i>${wLab}</i><b>${nm}</b>${best ? `<span>最高成績　${best}</span>` : ''}</div>`;
            }
            if (FT === 'f2') {
              // F2 名前の横に最高成績の枠つき札
              return `<div class="ft2-win"><span class="ft2-vs">${fin === 1 ? '2着' : '勝ち'}</span><b>${nm}</b></div>${best ? `<span class="ft2-best">最高 ${best}</span>` : ''}`;
            }
            if (FT === 'f3') {
              // F3 区切り線の下に、名前と最高成績を左右に振る
              // 最高成績はクラスの札＋着順（2026-09-17 ユーザー「未勝利やOPとかでわかりやすく区別」）
              const bp = bestParts(r.winner_best);
              const bestHtml = bp
                ? `<span class="ft3-bst">${clsBadge(bp.cls)}<b class="${bp.fin === 1 ? 'f1' : bp.fin === 2 ? 'f2' : bp.fin === 3 ? 'f3' : ''}">${bp.fin}着</b></span>`
                : (best ? `<b>${best}</b>` : '');
              // 馬名は折り返さない（2026-09-17 ユーザー指示）。見出しを上の行に出して幅を空け、長い名前ほど字を小さくする
              const nlen = [...String(r.winner || '')].length;
              const nfs = nlen <= 7 ? 15 : nlen <= 8 ? 14 : nlen <= 9 ? 12.5 : 11.5;
              return `<div class="ft3-win"><div class="ft3-wc"><i>${wLab}</i><b style="font-size:${nfs}px">${nm}</b></div>${bestHtml ? `<div class="ft3-wr"><i>最高成績</i>${bestHtml}</div>` : ''}</div>`;
            }
            return `<div class="m-wn"><i>${wLab}</i>${nm}</div>${wBest ? `<div class="m-pls">${wBest}</div>` : ''}`;
          };
          // 着差の札の色は本番の戦績の札と同じ決まり（race.js runBandClass）：
          //   1着＝金の地（着差は問わない）／着差が芝0.4・ダート0.6（ほか0.5）秒以内の負け＝青の地／それ以外は色なし
          const closeTh = { '芝': 0.4, 'ダート': 0.6 }[r.surface] ?? 0.5;
          const mgBand = fin === 1 ? 'mg-win' : (mg != null && Math.abs(mg) <= closeTh ? 'mg-close' : '');
          const mgTag = mgBand === 'mg-win' ? '<b class="mg-tag">勝ち</b>' : mgBand === 'mg-close' ? '<b class="mg-tag">僅差</b>' : '';
          // 文字はふだん黒（2026-09-17 ユーザー指示）
          const winSet = hc('var(--text)', fin === 1 ? '● 2着馬との差' : '● 勝ち馬との差', mgTag, `
            <div class="m-gap"><span class="m-nv">${mgN}<small>秒</small></span></div>
            ${winnerBody()}`, `m-win ${mgBand}`);
          // タイムは本番の time_grade（f1/f2/f3＝当日の馬場差を補正した基準との比べ。keiba_shutuba_columns._grade_time）で
          // 金・銀・銅に塗る（2026-09-17 ユーザー指示）。印が無い走は色なし
          const tg = { f1: 'w1', f2: 'w2', f3: 'w3' }[r.time_grade] || '';
          const tgTitle = r.time_grade && r.time_resid != null ? ` title="基準比 ${r.time_resid > 0 ? '+' : ''}${esc(r.time_resid)}秒（当日の馬場差を補正後）"` : '';
          const timeTile = `<div class="h-card m-num ${tg}"${tgTitle}><div class="h-t">タイム</div><div class="m-nv">${esc(r.time || '—')}<small></small></div></div>`;
          // 間隔は勝ち馬の札の横から外し、下の条件の段へ移す（2026-09-17 ユーザー「間隔ここにいらない」）。勝ち馬の札は横いっぱい
          top = `${raceCard}<div class="m-row3">${num('着順', esc(r.finish ?? '—'), '着', finCls)}${num('人気', esc(r.popularity ?? '—'), '番')}${timeTile}</div>
            ${winSet.replace('class="h-card m-win', 'class="h-card m-win wide')}`;
        }
        // ---- 下の条件の段（間隔・斤量・馬場・騎手・馬体重）の3案（2026-09-17）。?bt=b1|b2|b3 ----
        const BT = 'b1';
        const gapV = gapMain.replace('今回まで ', '');
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
        let bottom = cond;
        if (BT === 'b1') {
          // B1 一覧：1枚の札に5行。左に項目、右に値、その右に「今回」の札。好走の行は緑
          bottom = `<div class="h-card bt1">${items.map((it) => `<div class="bt1-r${isHit(it) ? ' hit' : ''}">
            <span class="bt-lab">${it.lab}</span><span class="bt1-v">${it.val}</span><span class="bt1-s">${it.sub}${hitMark(it)}</span></div>`).join('')}</div>`;
        } else if (BT === 'b2') {
          // B2 2段の札：上に「間隔｜斤量｜馬場」、下に「騎手（広め）｜馬体重」
          const tile = (it, cls) => `<div class="h-card bt2-t ${cls || ''}${isHit(it) ? ' hit' : ''}"><span class="bt-lab">${it.lab}</span>
            <div class="bt2-v">${it.val}</div>${it.sub || isHit(it) ? `<div class="bt2-s">${it.sub}${hitMark(it)}</div>` : ''}</div>`;
          bottom = `<div class="bt2">${tile(items[0])}${tile(items[1])}${tile(items[2])}${tile(items[3], 'jk')}${tile(items[4])}</div>`;
        } else if (BT === 'b3') {
          // B3 1本の帯：1枚の札を縦線で5つに区切る。好走のマスだけ緑
          bottom = `<div class="h-card bt3">${items.map((it) => `<div class="bt3-c${isHit(it) ? ' hit' : ''}">
            <span class="bt-lab">${it.lab}</span><div class="bt3-v">${it.val}</div><div class="bt3-s">${it.sub}${isHit(it) ? '<b class="bt-hit">好走</b>' : ''}</div></div>`).join('')}</div>`;
        }
        return `<div class="race20 rvC c3 mx hd-${HD} bt-${BT}">${top}${pos}${bottom}</div>`;
      }
      return `<div class="race20 rvC c3 mx">
        <div class="c-meta">${metaLine}</div>
        ${result}
        ${two ? `<div class="m-row2">${winCard}${gapCard('accent')}</div>` : gapCard('')}
        ${pos}
        ${cond}
      </div>`;
    }
    // C 設定画面型：iPhoneの設定アプリのように、灰色の地に白い角丸のまとまりを積む。左に項目、右に値
    if (RV === 'c') {
      const li = (k, v, sub) => `<div class="c-li"><span class="c-k">${k}</span><span class="c-v">${v}${sub ? `<em>${sub}</em>` : ''}</span></div>`;
      return `<div class="race20 rvC">
        <div class="c-hero">
          <div class="c-meta">${esc(String(r.date || '').slice(5))} ${esc(r.track || '')} ${grB} <b>${esc(r.race_name || '')}</b> ${lvB} ${dist}</div>
          <div class="c-fin ${finCls}">${esc(r.finish ?? '—')}<small>着</small></div>
          <div class="c-mg">${esc(mgTxt)}<span>／${fieldTxt}</span></div>
        </div>
        <div class="c-grp">
          ${li('人気', esc(popTxt || '—'))}${li(wLab, `${esc(r.winner || '—')}${wbB}`)}${li('タイム', esc(r.time || '—'))}
        </div>
        <div class="c-grp">${li('間隔', `<b>${gapMain}</b>`, gapSub)}</div>
        <div class="c-cap">コーナーごとの位置</div>
        <div class="c-grp c-pad">${posBody}<div class="yf-sub in">${upB}${sm('流れ', r.scenario)}</div>${memoB}</div>
        <div class="c-grp">
          ${li('斤量', `<b>${kg}</b>`, kgDiff)}${li('騎手', esc(r.jockey || '—'))}${li('馬体重', esc(bw || '—'))}${li('馬場', `<b>${baba}</b>`, goingDiff)}
        </div>
      </div>`;
    }
    return `<div class="race20 yf-rp">
      <div class="yf-rhd"><span>${esc(String(r.date || '').slice(5))}</span><span>${esc(r.track || '')}</span>
        ${grB}<span class="rn">${esc(r.race_name || '')}</span>
        ${lvB}
        <span class="ds">${dist}</span></div>
      <div class="yf-rp-top">
        <div class="yf-fin ${finCls}">${esc(r.finish ?? '—')}<small>着</small></div>
        <div class="yf-mg"><b>${esc(mgTxt)}</b><span>${fieldTxt}</span></div>
      </div>
      <div class="yf-sub">${sm('人気', popTxt)}${r.winner ? `<span class="yf-sm"><i>${wLab}</i>${esc(r.winner)}${wbB}</span>` : ''}${sm('タイム', r.time)}</div>
      <div class="yf-k yf-kgap"><dt>間隔</dt><dd>${gapMain}</dd><em>${gapSub}</em></div>
      <div class="yf-k yf-kpos"><dt>コーナーごとの位置</dt>
        ${posBody}
        <div class="yf-sub in">${upB}${sm('流れ', r.scenario)}</div>
        ${memoB}</div>
      <div class="yf-rp-grid">
        <div class="yf-k"><dt>斤量</dt><dd>${kg}</dd>
          ${kgDiff}
          <div class="yf-sub in col">${sm('騎手', r.jockey)}${sm('馬体重', bw)}</div></div>
        <div class="yf-k"><dt>馬場</dt><dd>${baba}</dd>${goingDiff}</div>
      </div>
    </div>`;
  }

  // 説明文と下のボタン列（✕消・ひとつ戻る・✓残す）は外した（2026-09-17 ユーザー指示）。決めるのは払う動きだけ。
  // 払い間違えを戻す機能は置かない（同日ユーザー決定）
  function vSwipe() {
    const h = H[S.idx];
    const pages = pagesOf(h);
    const pg = pages[S.page];
    const dots = pages.map((_, i) => `<i class="${i <= S.page ? 'on' : ''}"></i>`).join('');
    // カード上の見出し（段階・「残す？ 消す？」・やめる）も外した（同日ユーザー指示）。この画面から抜ける手段は今は無い
    const promoted = APPLE && S.promote;
    S.promote = false;
    return `<div class="yf-deck top${APPLE ? ' apple' : ''}">
        ${H[S.idx + 1] ? `<div class="yf-card back${promoted ? ' arrive' : ''}" id="yf-back"></div>` : ''}
        <div class="yf-card${promoted ? ' promoted' : ''}" id="yf-card">
          <div class="yf-stamp ok" id="yf-ok">✓</div><div class="yf-stamp ng" id="yf-ng">消</div>
          <div class="yf-dots">${dots}</div>
          <div class="yf-plab"><b>${esc(pg.label)}</b><span>${S.idx + 1} / ${H.length}頭</span></div>
          <div class="yf-page${APPLE ? '' : ' pop'}" id="yf-page">${pageHtml(h, pg)}</div>
          ${S.page > 0 ? '<span class="yf-edge l">‹</span>' : ''}
          ${S.page < pages.length - 1 ? '<span class="yf-edge r">›</span>' : ''}
        </div>
      </div>
      <div class="yf-deck-foot"></div>
      <label class="yf-haptic" aria-hidden="true"><input type="checkbox" switch id="yf-hap" tabindex="-1"></label>`;
  }

  const checked = () => H.filter((h) => S.my[h.number] === '✓');
  const byNum = (n) => H.find((h) => h.number === n);

  function vAsk() {
    const c = checked().length;
    const k = H.filter((h) => S.my[h.number] === '消').length;
    return `${head('1 / 2　消す馬を決める', '消す馬が決まりました', 100)}
      <div class="yf-mid">
        <div class="yf-big chk">✓</div>
        <div class="yf-cnt"><span class="c1">✓ ${c}頭</span><span class="c2">消 ${k}頭</span></div>
        <div class="q">${c ? '印を決めるに進みますか？' : '✓の馬がいません'}</div>
        <div class="s">${c === 0 ? '1頭以上を右に払うと、印を決められます'
          : c === 1 ? '✓が1頭なので、比べずに◎になります'
            : `✓の${c}頭を2頭ずつ比べて◎を決めます（${c - 1}回）`}</div>
      </div>
      <div class="yf-foot">
        ${c ? '<button type="button" class="yf-btn" data-act="mark0">印を決める</button>'
          : '<button type="button" class="yf-btn" data-act="restart">消す馬を決め直す</button>'}
        <button type="button" class="yf-btn text" data-act="done">ここで終える（消と✓だけ付ける）</button>
      </div>`;
  }

  function pickCard(h) {
    const runs = (h.past_runs || []).slice(0, 3);
    const fins = runs.map((r) => {
      const f = Number(r.finish);
      return `<b class="${f === 1 ? 't1' : f <= 3 ? 't3' : ''}">${esc(r.finish ?? '—')}</b>`;
    }).join('') || '—';
    const pop = h.popularity != null ? `${h.popularity}人気` : '';
    return `<button type="button" class="yf-pick" data-pick="${h.number}">
      <span class="l1">${umaBox(h.number, h.gate)}<span class="n">${esc(h.name)}</span><span class="race20">${P(h.number).badge}</span></span>
      <span class="l2">${esc(h.sex_age)} ${esc(h.weight_carried)}kg ${esc(h.jockey)}</span>
      <span class="l3"><span class="od">${h.odds != null ? h.odds.toFixed(1) : '—'}<small>倍 ${esc(pop)}</small></span>
        <span class="fins">近3走 ${fins}</span></span>
      <span class="more" data-more="${h.number}">詳しく見る ›</span>
    </button>`;
  }

  function vDuel() {
    const t = S.t;
    const [a, b] = t.pair.map(byNum);
    const mk = MARKS3[S.step];
    return `${head('2 / 2　印を決める', `${mk} を決めよう`, Math.round((t.done / t.total) * 100))}
      <div class="yf-lead">どっちがいい？（${mk} まで あと${t.total - t.done}回）</div>
      <div class="yf-duel">${pickCard(a)}<div class="yf-vs">VS</div>${pickCard(b)}</div>
      <div class="yf-foot"></div>`;
  }

  function vMarked() {
    const mk = MARKS3[S.step];
    const h = byNum(S.lastWinner);
    const more = S.step < 2 && pool().length > 0;
    return `${head('2 / 2　印を決める', `${mk} が決まりました`, 100)}
      <div class="yf-mid">
        <div class="yf-big ${KCLS[mk]}">${mk}</div>
        <div class="who">${umaBox(h.number, h.gate)}${esc(h.name)}</div>
        <div class="s">${esc(h.jockey)}／${h.odds != null ? h.odds.toFixed(1) : '—'}倍 ${esc(h.popularity ?? '—')}人気</div>
      </div>
      <div class="yf-foot">
        ${more ? `<button type="button" class="yf-btn" data-act="next">次の印へ（${MARKS3[S.step + 1]}）</button>` : ''}
        <button type="button" class="yf-btn ${more ? 'sub' : ''}" data-act="done">ここで終える</button>
      </div>`;
  }

  // ---------- 消し馬 ----------
  function decide(mark) {
    if (S.busy) return;
    S.busy = true;
    const card = document.getElementById('yf-card');
    const dir = mark === '✓' ? 1 : -1;
    const fly = Number(getComputedStyle(document.documentElement).getPropertyValue('--yf-fly')) || 1;
    card.classList.remove('snap'); card.classList.add('fly');
    card.style.transform = `translate(${dir * 130}vw, -20px) rotate(${dir * 16 * fly}deg)`;
    card.style.opacity = '0';
    setTimeout(() => {
      S.busy = false;
      S.my[H[S.idx].number] = mark;
      S.idx += 1; S.page = 0;
      if (S.idx >= H.length) go('ask'); else render();
    }, 220);
  }

  function turn(d) {
    const n = pagesOf(H[S.idx]).length;
    const p = S.page + d;
    if (p < 0 || p >= n) {
      // 端のページでさらに押したときは、札を小さく揺らして「これ以上ない」を伝える（iPhoneの端で跳ね返る動きに寄せる）
      if (APPLE) { const c = document.getElementById('yf-card'); if (c) { c.classList.remove('nudge-l', 'nudge-r'); void c.offsetWidth; c.classList.add(d > 0 ? 'nudge-r' : 'nudge-l'); } }
      return;
    }
    goPage(p, d);
  }

  // ---------- Apple らしい動き（2026-09-17 ユーザー「もっと心地よいスワイプやタップ。Apple感がほしい」）。?mo=old で前の動きに戻す ----------
  //   ・ページ送り：前のページが少し左へ下がり、次のページが右から滑り込む（iPhoneの画面遷移と同じ曲線）
  //   ・払う：指の位置を中心に傾く。払う量に合わせて✓／消の印が大きくなり、後ろの札がせり上がる
  //   ・離す：速さを引き継いで飛んでいく。足りなければバネのように少し行き過ぎて戻る
  //   ・しきい値を越えた瞬間と、決まった瞬間に、iPhone の軽い振動（iOS 18 の Safari の切り替えスイッチを使う。実機未確認）
  //   ・下に払う：札が下がり、確認は画面の下から出る iPhone の選択シートに
  const APPLE = true;
  const EASE_IOS = 'cubic-bezier(.32,.72,0,1)';
  function haptic() {
    const i = document.getElementById('yf-hap');
    if (i && i.parentElement) { try { i.parentElement.click(); } catch (_) { /* 振動できない端末では何もしない */ } }
  }
  function goPage(p, d) {
    if (!APPLE) { S.page = p; render(); return; }
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
    if (S.busy) return;
    S.busy = true;
    const card = document.getElementById('yf-card');
    const back = document.getElementById('yf-back');
    const dir = mark === '✓' ? 1 : -1;
    const w = window.innerWidth;
    const speed = Math.max(Math.abs(vx), 1.2);                 // 画面の点／ミリ秒
    const t = Math.max(0.16, Math.min(0.32, (w * 0.9) / speed / 1000));
    card.classList.remove('spring', 'press');
    card.style.transition = `transform ${t}s cubic-bezier(.2,.6,.35,1), opacity ${t}s linear`;
    card.style.transform = `translate(${dir * w * 1.25}px, ${dy + vy * t * 1000}px) rotate(${rot * 2.2}deg)`;
    card.style.opacity = '.4';
    if (back) { back.style.transition = `transform ${t}s ${EASE_IOS}, opacity ${t}s ${EASE_IOS}`; back.style.transform = 'none'; back.style.opacity = '1'; }
    haptic();
    setTimeout(() => {
      S.busy = false;
      S.my[H[S.idx].number] = mark;
      S.idx += 1; S.page = 0;
      if (S.idx >= H.length) go('ask'); else { S.promote = true; render(); }
    }, t * 1000);
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
    if (APPLE) { bindCardApple(); return; }
    const card = document.getElementById('yf-card');
    const ok = document.getElementById('yf-ok');
    const ng = document.getElementById('yf-ng');
    // 下に払う＝やめる（2026-09-17 ユーザー決定）。縦の動きは払う判定に使うので、ページの縦送りはさせない
    let sx = 0, sy = 0, st = 0, dx = 0, dy = 0, drag = false, vdrag = false, down = false;
    // 全戦績を1ページにまとめる案（?cr=s）：ページの中を指で縦に動かせる。一番上にいて下に払ったときだけ「やめる」
    const pageEl = document.getElementById('yf-page');
    let vscroll = false, top0 = 0;
    const scrollable = () => pageEl && pageEl.scrollHeight > pageEl.clientHeight + 1;
    card.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      down = true; drag = false; vdrag = false; vscroll = false; dx = 0; dy = 0; sx = e.clientX; sy = e.clientY; st = performance.now();
      top0 = pageEl ? pageEl.scrollTop : 0;
      card.classList.remove('snap');
    });
    card.addEventListener('pointermove', (e) => {
      if (!down) return;
      dx = e.clientX - sx;
      dy = e.clientY - sy;
      if (!drag && !vdrag && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) drag = true;
      if (!drag && !vdrag && !vscroll && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) && scrollable() && (dy < 0 || top0 > 0)) vscroll = true;
      if (vscroll) { pageEl.scrollTop = top0 - dy; return; }
      if (!drag && !vdrag && dy > 10 && dy > Math.abs(dx)) vdrag = true;
      if ((drag || vdrag) && !card.hasPointerCapture?.(e.pointerId)) {
        try { card.setPointerCapture(e.pointerId); } catch (_) { /* 取れなくても動く */ }
      }
      if (vdrag) {
        card.style.transform = `translateY(${Math.max(0, dy) * 0.6}px) scale(${1 - Math.min(Math.max(0, dy), 200) / 2000})`;
        return;
      }
      if (!drag) return;
      card.style.transform = `translateX(${dx}px) rotate(${dx / 24}deg)`;
      ok.style.opacity = Math.max(0, Math.min(1, dx / 90));
      ng.style.opacity = Math.max(0, Math.min(1, -dx / 90));
    });
    card.addEventListener('pointerup', (e) => {
      if (!down) return;
      down = false;
      const dt = performance.now() - st;
      if (vscroll) return;
      if (vdrag) {
        if (dy > 120 && window.confirm('予想をやめますか？ ここまでの答えは消えます')) { close(false); return; }
        card.classList.add('snap'); card.style.transform = '';
        return;
      }
      if (drag) {
        const v = Math.abs(dx) / Math.max(dt, 1);
        if (Math.abs(dx) > 100 || (Math.abs(dx) > 40 && v > 0.6)) { decide(dx > 0 ? '✓' : '消'); return; }
        card.classList.add('snap'); card.style.transform = '';
        ok.style.opacity = 0; ng.style.opacity = 0;
        return;
      }
      if (Math.abs(e.clientY - sy) > 10 || dt > 500) return;   // 縦に動かした・長押しは送らない
      if (e.target.closest('button')) return;                   // カードの中のボタンはページ送りにしない
      const rc = card.getBoundingClientRect();
      const x = (e.clientX - rc.left) / rc.width;
      // 端の15%は、札の上でも必ずページ送りにする（直近5走で左端を押すと、戻らずに札の走へ飛んでいたため）
      if (x < 0.15) { turn(-1); return; }
      if (x > 0.85) { turn(1); return; }
      const go = e.target.closest('[data-goto]');
      if (go) { S.page = Number(go.dataset.goto); render(); return; }   // 直近5走の札を押すと、その走のページへ
      if (x < 0.3) turn(-1); else if (x > 0.7) turn(1);
    });
    card.addEventListener('pointercancel', () => { down = false; card.classList.add('snap'); card.style.transform = ''; });
  }

  function bindCardApple() {
    const card = document.getElementById('yf-card');
    const back = document.getElementById('yf-back');
    const ok = document.getElementById('yf-ok');
    const ng = document.getElementById('yf-ng');
    const pageEl = document.getElementById('yf-page');
    const deck = card.parentElement;
    const TH = 100;
    let sx = 0, sy = 0, st = 0, dx = 0, dy = 0, g = 1, drag = false, vdrag = false, down = false, vscroll = false, top0 = 0, over = false;
    let hist = [];
    const scrollable = () => pageEl && pageEl.scrollHeight > pageEl.clientHeight + 1;
    const setBack = (p) => {
      if (!back) return;
      back.style.transition = 'none';
      back.style.transform = `translateY(${(8 - 8 * p).toFixed(1)}px) scale(${(0.96 + 0.04 * p).toFixed(4)})`;
      back.style.opacity = String(0.55 + 0.45 * p);
    };
    const springHome = () => {
      card.classList.add('spring');
      card.style.transform = '';
      ok.style.opacity = 0; ng.style.opacity = 0; ok.style.transform = ''; ng.style.transform = '';
      if (back) { back.style.transition = `transform .5s ${EASE_IOS}, opacity .5s ${EASE_IOS}`; back.style.transform = ''; back.style.opacity = ''; }
      deck.style.setProperty('--dim', '0');
    };
    card.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || S.busy) return;
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
      if (!drag && !vdrag && !vscroll && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) drag = true;
      if (!drag && !vdrag && !vscroll && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) && scrollable() && (dy < 0 || top0 > 0)) vscroll = true;
      if (!drag && !vdrag && !vscroll && dy > 8 && dy > Math.abs(dx)) vdrag = true;
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
      card.style.transform = `translate(${dx}px, ${(dy * 0.2).toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`;
      const sOk = dx > 0 ? p : 0, sNg = dx < 0 ? p : 0;
      ok.style.opacity = sOk; ok.style.transform = `rotate(-14deg) scale(${(0.6 + 0.4 * sOk).toFixed(3)})`;
      ng.style.opacity = sNg; ng.style.transform = `rotate(14deg) scale(${(0.6 + 0.4 * sNg).toFixed(3)})`;
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
          card.classList.add('spring'); card.style.transform = 'translateY(40px) scale(.97)';
          quitSheet(() => springHome());
        } else springHome();
        return;
      }
      if (drag) {
        const fling = Math.abs(dx) > 40 && Math.abs(vx) > 0.5 && Math.sign(vx) === Math.sign(dx);
        if (Math.abs(dx) > TH || fling) { decideApple(dx > 0 ? '✓' : '消', vx, vy, (dx / 18) * g, dy * 0.2); return; }
        springHome();
        return;
      }
      if (Math.abs(e.clientY - sy) > 10 || dt > 500) return;
      if (e.target.closest('button')) return;
      const rc = card.getBoundingClientRect();
      const x = (e.clientX - rc.left) / rc.width;
      if (x < 0.15) { turn(-1); return; }
      if (x > 0.85) { turn(1); return; }
      const go2 = e.target.closest('[data-goto]');
      if (go2) { const to = Number(go2.dataset.goto); goPage(to, to >= S.page ? 1 : -1); return; }
      if (x < 0.3) turn(-1); else if (x > 0.7) turn(1);
    };
    card.addEventListener('pointerup', (e) => end(e, false));
    card.addEventListener('pointercancel', (e) => end(e, true));
  }

  // ---------- 印（勝ち抜き戦・毎回やり直す） ----------
  const pool = () => checked().filter((h) => !MARKS3.includes(S.my[h.number])).map((h) => h.number);

  function startMark(step) {
    S.step = step;
    const p = pool();
    if (p.length === 0) { close(true); return; }
    if (p.length === 1) { setWinner(p[0]); return; }
    S.t = { round: p, next: [], i: 0, total: p.length - 1, done: 0, pair: null };
    advance();
    if (S.t.pair) go('duel');
  }

  function advance() {
    const t = S.t;
    for (;;) {
      if (t.i + 1 < t.round.length) { t.pair = [t.round[t.i], t.round[t.i + 1]]; return; }
      if (t.i < t.round.length) { t.next.push(t.round[t.i]); t.i += 1; }   // 奇数のときの不戦勝
      if (t.next.length === 1) { t.pair = null; setWinner(t.next[0]); return; }
      t.round = t.next; t.next = []; t.i = 0;
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
    const pk = e.target.closest('[data-pick]');
    if (pk && S.screen === 'duel' && !S.busy) {
      S.busy = true;
      const n = Number(pk.dataset.pick);
      root.querySelectorAll('.yf-pick').forEach((c) => c.classList.add(Number(c.dataset.pick) === n ? 'win' : 'lose'));
      setTimeout(() => {
        S.busy = false;
        const t = S.t;
        t.next.push(n); t.i += 2; t.done += 1;
        advance();
        if (t.pair) render();
      }, 360);
      return;
    }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    switch (a.dataset.act) {
      case 'kes': decide('消'); break;
      case 'chk': decide('✓'); break;
      case 'mark0': startMark(0); break;
      case 'next': startMark(S.step + 1); break;
      case 'restart': S.idx = 0; S.page = 0; S.my = {}; go('swipe'); break;
      case 'done': close(true); break;
      case 'quit':
        if (window.confirm('予想をやめますか？ ここまでの答えは消えます')) close(false);
        break;
      default: break;
    }
  }
  document.addEventListener('keydown', (e) => {
    if (!root || S.screen !== 'swipe') return;
    if (e.key === 'ArrowLeft') turn(-1);
    if (e.key === 'ArrowRight') turn(1);
  });

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
