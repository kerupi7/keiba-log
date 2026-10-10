// 共通層: データ取得・フォーマッタ・共有ヘッダ
// 将来の有料化ではここ(getData)に認証を差し込む想定。

async function getData(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

function renderHeader(activePage) {
  const el = document.getElementById('site-header');
  if (!el) return;
  el.classList.add('site-header');
  el.innerHTML = `
    <a class="logo" href="index.html">Ans<span class="g">.</span></a>
    <nav>
      <a href="win5.html" class="w5nav ${activePage === 'win5' ? 'active' : ''}"><img src="assets/win5-5.png" alt="WIN5" width="188" height="74"></a>
      <a href="analysis.html" class="navstat navana ${activePage === 'analysis' ? 'active' : ''}">分析</a>
      <a href="stats.html" class="navstat ${activePage === 'stats' || activePage === 'model' ? 'active' : ''}">成績</a>
    </nav>
  `;
}

function fmtPercent(v, digits = 1) {
  if (v === null || v === undefined) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

function fmtSignedPercent(v, digits = 0) {
  if (v === null || v === undefined) return '—';
  const pct = v * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(digits)}%`.replace('-', '−');
}

function fmtYen(v) {
  if (v === null || v === undefined) return '—';
  return `${v.toLocaleString('ja-JP')}円`;
}

function fmtNum(v, digits = null) {
  if (v === null || v === undefined) return '—';
  return digits === null ? String(v) : v.toFixed(digits);
}

// 収支: +1,240円 / −700円 / ±0円。マイナス記号はU+2212「−」で統一（モック準拠）
function fmtNet(net) {
  if (net === null || net === undefined) return '—';
  const sign = net > 0 ? '+' : net < 0 ? '−' : '±';
  return `${sign}${Math.abs(net).toLocaleString('ja-JP')}円`;
}

// "2026-06-28" → {label:"6/28", dow:"日", dowClass:"sun"|"sat"|""}
function fmtDateTab(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  const cls = d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : '';
  return { label: `${d.getMonth() + 1}/${d.getDate()}`, dow, dowClass: cls };
}

// "2026-06-28T13:46:21" → "6/28 13:46"
// 区切りは 'T' でも半角スペースでもよく、時刻部が無い場合も許容する（LLM由来の表記ゆれ対策）
function fmtDateTimeShort(iso) {
  if (!iso) return '—';
  const [d, t] = String(iso).split(/[T ]/);
  const [, m, day] = d.split('-');
  if (m == null || day == null) return String(iso);
  const hm = t ? t.slice(0, 5) : '';
  return `${Number(m)}/${Number(day)}${hm ? ' ' + hm : ''}`;
}

const MARK_CLASS = { '◎': 'hon', '○': 'tai', '▲': 'tan', '△': 'oku' };
function markNameClass(mark) { return MARK_CLASS[mark] ? 'n-' + MARK_CLASS[mark] : ''; }
function markBadge(mark) { return MARK_CLASS[mark] ? `<span class="mkb m-${MARK_CLASS[mark]}">${mark}</span>` : ''; }
// 馬名セル先頭の印スロット。印なしでも同じ幅を確保し、馬番・馬名の左端を全行で揃える
function markSlot(mark) { return `<span class="mkslot">${MARK_CLASS[mark] ? mark : ''}</span>`; }

// mark-2.0: 役割チップ（軸/相手/穴）・地雷チップ・市場評価チップ（14-mark-redesign-spec.md §8.3）
const ROLE_CHIP_CLASS = { '軸': 'axis', '相手': 'aite', '穴': 'ana' };
function roleChip(role) {
  const cls = ROLE_CHIP_CLASS[role];
  return cls ? `<span class="chip-role r-${cls}">${role}</span>` : '';
}
function mineChip() { return '<span class="chip-mine">地雷</span>'; }
const MARKET_EVAL_CHIP_CLASS = { '妙味': 'good', '妥当': 'fair', '過剰': 'over' };
function marketEvalChip(marketEval) {
  const cls = MARKET_EVAL_CHIP_CLASS[marketEval];
  return cls ? `<span class="mchip ${cls}">${marketEval}</span>` : '';
}

function pillHtml(kind, label) {
  return `<span class="pill ${kind}">${label}</span>`;
}

// race: {status, stance, outcome} (TOP一覧) または詳細ヘッダ用に kind/label 直接指定
function statusBadge(race) {
  if (race.status === 'cancelled') return pillHtml('cancel', '中止');
  if (race.status === 'prediction') {
    if (race.stance === 'pass') return pillHtml('pass', '見送り');
    return pillHtml('pre', '発走前');
  }
  if (race.status === 'final') {
    if (race.stance === 'pass') return pillHtml('pass', '見送り');
    const hit = race.outcome && race.outcome.bets_hit;
    return hit ? pillHtml('hit', '的中') : pillHtml('miss', '不的中');
  }
  return '';
}

function renderMarkdown(md) {
  if (!md) return '';
  return marked.parse(md);
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// 評価バッジ（総合点→ランク）。元は race.js 内定義（23-fullpython-fe-spec.md T9〜T12）。
// 45-spec §2.8: 手動シミュレーターの馬行がこの表示に合わせるため共通層に移設。
function gradeClass(grade) {
  return { 'S': 'g-s', 'A+': 'g-ap', 'A': 'g-a', 'B+': 'g-bp', 'B': 'g-b', 'C+': 'g-cp', 'C': 'g-c', 'D': 'g-d', 'E': 'g-e' }[grade] ?? '';
}
function gradeDisp(grade) {
  return grade ? grade.replace('+', '＋') : '';
}

// 出馬表に出す点数と評価（2026-08-12）。勝率モデル win-1 の p_win を点数に換算した
// win_score を使う。それまでは8観点の合計（total）を出していたが、印は p_win 順に付くので
// 点数の並びと印の並びが食い違って見えていた（例: 点数1位の馬に○、3位の馬に◎）。
// 8観点は勝率を当てる係としては win-1 に負けている（決着済み171レース実測・
// 対数損失 2.2302 vs 2.0881）ため、表示を勝率側へ寄せた。
// win_score を持たないのは 2026-08-12 より前に公開したレースだけで、その場合は
// 従来どおり total と grade を出す（過去公開分は作り直さない）。
function dispScore(h) {
  return h.win_score ?? h.total;
}
function dispGrade(h) {
  return h.win_score != null ? h.win_grade : h.grade;
}

// 45-spec §3.2: 馬番の枠色ボックス（JRA標準色）。gate(1..8)→wk1..wk8。範囲外はプレーン数字にフォールバック
function frameClass(gate) {
  return (gate >= 1 && gate <= 8) ? `wk${gate}` : '';
}
function umaBox(number, gate, size) {
  const cls = frameClass(gate);
  const sizeCls = size ? ` ${size}` : '';
  if (!cls) return `<span class="hn plain${sizeCls}">${number}</span>`;
  return `<span class="hn ${cls}${sizeCls}">${number}</span>`;
}
function wakuBox(frameNo, size) {
  return umaBox(frameNo, frameNo, size);
}

// 10倍を切ったら赤オッズ（新聞・netkeibaと同じ表記。2026-08-05 ユーザー指定）。
// 境目は「10.0未満」で、9.9倍までが赤・10.0倍からは黒。
// 2026-08-26に race.js から app.js へ移した（WIN5の画面でも同じ境目を使うため。
// 境目が2か所にあるとずれる）
const ODDS_HOT = 10;

function oddsHotClass(odds) {
  return (odds != null && odds < ODDS_HOT) ? ' hot' : '';
}

// 45-spec §3.4: 買い目・払戻の組番を枠色ボックス連結にする。順序券種（馬単/3連単）は→、他は-。
// typeLabel には日本語ラベル（漢字/数字ゆれ両対応）またはローマ字を渡してよい。
// byNumber は 馬番→horse の辞書（gate参照用）。枠連は combination が枠番そのものなので wakuBox。
function comboBoxes(typeLabel, numbers, byNumber) {
  const t = String(typeLabel);
  const ordered = /馬単|[3三]連単|umatan|sanrentan/.test(t);
  const isWaku = /枠連|wakuren/.test(t);
  const sep = `<span class="cbsep">${ordered ? '→' : '-'}</span>`;
  return numbers.map((n) =>
    isWaku ? wakuBox(n, 'sm') : umaBox(n, (byNumber[n] || {}).gate, 'sm')
  ).join(sep);
}

// ============================================================
// 買いレース（2026-09-08）— 「このレースは買う」を自分で付ける。
// 付け外しはレース詳細ページだけ（ユーザー決定）。一覧は札を出すだけで触れない。
// パイプラインが出す stance:'pass'（見送り）はAIの判断で、これとは別物。
// 保存は localStorage の buyrace（レースIDの並び）。印・シートと同じで端末内・同期なし。
// ============================================================
const BUYRACE_KEY = 'buyrace';
const BUYRACE_SCHEMA = 1;

// localStorage が使えない環境（プライベートブラウズ等）では空として扱う。落とさない
function buyRaceIds() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const o = JSON.parse(localStorage.getItem(BUYRACE_KEY));
    if (!o || o.v !== BUYRACE_SCHEMA || !Array.isArray(o.ids)) return [];
    return o.ids.filter((x) => typeof x === 'string');
  } catch (e) { return []; }
}
function isBuyRace(raceId) {
  return !!raceId && buyRaceIds().indexOf(String(raceId)) !== -1;
}
// 付いていれば外す、無ければ付ける。返り値は付けた後の状態
function toggleBuyRace(raceId) {
  const id = String(raceId);
  const ids = buyRaceIds();
  const i = ids.indexOf(id);
  if (i === -1) ids.push(id); else ids.splice(i, 1);
  try {
    localStorage.setItem(BUYRACE_KEY, JSON.stringify({ v: BUYRACE_SCHEMA, ids }));
  } catch (e) { /* 保存しないだけ */ }
  return i === -1;
}

// ---------- 自分の激アツ（138-spec・2026-10-07 ユーザー決定・mockup-266 案2） ----------
// 絞り込み（yoso.js のランクの1ページ）で、気に入った馬に長押しで押す判子。記録は端末の中だけ（gekiatsu:{race_id} に馬番の一覧）。
// 判子の絵（天下布武の楕円・金の箔・朱の字・禅骨董・朱肉のかすれ）と記録の読み書きはここに1つだけ置き、race.js（出馬表の一覧）と yoso.js（絞り込み）が使う
const GEKI_SHU = '#C0302A';
const gekiKey = (raceId) => `gekiatsu:${raceId}`;
function gekiLoad(raceId) {
  try { return new Set((JSON.parse(localStorage.getItem(gekiKey(raceId))) || []).map(Number)); } catch (e) { return new Set(); }
}
function gekiSave(raceId, set) {
  try { localStorage.setItem(gekiKey(raceId), JSON.stringify([...set].sort((x, y) => x - y))); } catch (e) { /* 保存しないだけ */ }
}
// 金の箔の色と朱肉のかすれ。<use> と同じく id で呼ぶので、ページに1回だけ置く
function ensureGekiDefs() {
  if (document.getElementById('geki-defs')) return;
  document.body.insertAdjacentHTML('beforeend', '<svg id="geki-defs" width="0" height="0" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden"><defs>'
    + '<linearGradient id="geki-foil" gradientUnits="userSpaceOnUse" x1="8" y1="14" x2="94" y2="86">'
    + '<stop offset="0" stop-color="#9A6B12"/><stop offset=".22" stop-color="#E9C766"/><stop offset=".42" stop-color="#B8862B"/>'
    + '<stop offset=".62" stop-color="#F3D98A"/><stop offset=".82" stop-color="#A9781E"/><stop offset="1" stop-color="#D8B04E"/></linearGradient>'
    + '<filter id="geki-ink" x="-10%" y="-10%" width="120%" height="120%">'
    + '<feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="7" result="n"/>'
    + '<feDisplacementMap in="SourceGraphic" in2="n" scale="1.2" result="d"/>'
    + '<feTurbulence type="fractalNoise" baseFrequency=".55" numOctaves="2" seed="11" result="g"/>'
    + '<feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -14 10.6" result="hole"/>'
    + '<feComposite in="d" in2="hole" operator="in"/></filter></defs></svg>');
}
// 判子。右の列に「激」を大きく縦に伸ばし、左の列に「ア」「ツ」（判子の決まりどおり右から読む）
function gekiStampSvg(size, cls) {
  return `<svg class="geki-st${cls ? ` ${cls}` : ''}" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">`
    + '<g filter="url(#geki-ink)" transform="rotate(-8 50 50)">'
    + '<ellipse cx="50" cy="50" rx="41" ry="47" fill="none" stroke="url(#geki-foil)" stroke-width="4.2"/>'
    + '<ellipse cx="50" cy="50" rx="35.5" ry="41.5" fill="none" stroke="url(#geki-foil)" stroke-width="1.4"/>'
    + `<g class="geki-tx" fill="${GEKI_SHU}" stroke="${GEKI_SHU}" stroke-width="1.4" paint-order="stroke">`
    + '<text transform="translate(63 50) scale(1 1.86)" y="11" text-anchor="middle" font-size="31">激</text>'
    + '<text transform="translate(37 36) scale(1.05 1.12)" y="9" text-anchor="middle" font-size="25">ア</text>'
    + '<text transform="translate(37 64) scale(1.05 1.12)" y="9" text-anchor="middle" font-size="25">ツ</text></g></g></svg>';
}


// 下に払って閉じる（2026-10-10 ユーザー指示「閉じる系も全部下スワイプにしたい」）。閉じるボタンの代わり。
//   付け先 host の中で sel に当たる板を、指に1対1で付けて下げる。120px 以上下げるか速く払うと閉じ、足りなければ元へ戻す
//   （しきい値と速さは「1頭だけ見る」画面の下払い〔yoso.js〕と同じ）。scrim(板) が返す背景の幕は、下げるほど薄くする。
//   中身を上へ動かした後（scrollTop > 0）につかんだときは払わない（まず中身を戻す動きにする）。
//   最初の動きが下向きのときだけ板を動かす。iPhone は最初の動きを止めないと、後からは画面の縦の動きを止められないため
//   （横や上に動かし始めたら、表の横の動き・中身の縦の動きのまま）。パソコンは今までどおり背景を押す・Esc で閉じる
function swipeToClose(host, sel, close, scrim) {
  const EASE = 'cubic-bezier(.32,.72,0,1)';
  let p = null, s = null, sx = 0, sy = 0, dy = 0, mode = '', hist = [];
  host.addEventListener('touchstart', (e) => {
    p = e.touches.length === 1 && e.target.closest ? e.target.closest(sel) : null;
    if (!p || !host.contains(p)) { p = null; return; }
    for (let n = e.target; n && n !== p.parentNode; n = n.parentNode) {
      if (n.scrollTop > 0) { p = null; return; }
    }
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY; dy = 0; mode = ''; hist = [[e.timeStamp, sy]];
  }, { passive: true });
  host.addEventListener('touchmove', (e) => {
    if (!p || mode === 'no') return;
    const t = e.touches[0];
    const dx = t.clientX - sx;
    dy = t.clientY - sy;
    if (!mode) {
      if (!dx && !dy) return;
      mode = e.cancelable && dy > 0 && dy >= Math.abs(dx) ? 'drag' : 'no';
      if (mode === 'no') return;
      s = scrim ? scrim(p) : null;
      p.style.transition = 'none';
      if (s) s.style.transition = 'none';
    }
    e.preventDefault();
    hist.push([e.timeStamp, t.clientY]); if (hist.length > 6) hist.shift();
    const y = Math.max(0, dy);
    p.style.translate = `0 ${y.toFixed(1)}px`;
    if (s) s.style.opacity = Math.max(0.2, 1 - y / 500).toFixed(3);
  }, { passive: false });
  const end = () => {
    const el = p, sc = s;
    p = null; s = null;
    if (!el || mode !== 'drag') return;
    const h0 = hist[0], h1 = hist[hist.length - 1];
    const vy = (h1[1] - h0[1]) / Math.max(1, h1[0] - h0[0]);   // 点／ミリ秒（最後の数コマ）
    if (dy > 120 || (vy > 0.9 && dy > 30)) {
      el.style.transition = `translate .22s ${EASE}`;
      el.style.translate = `0 ${window.innerHeight}px`;
      if (sc) { sc.style.transition = 'opacity .22s'; sc.style.opacity = '0'; }
      setTimeout(() => {
        close();
        el.style.transition = ''; el.style.translate = '';
        if (sc) { sc.style.transition = ''; sc.style.opacity = ''; }
      }, 220);
    } else {
      el.style.transition = `translate .35s ${EASE}`;
      el.style.translate = '';
      if (sc) { sc.style.transition = 'opacity .35s'; sc.style.opacity = ''; }
    }
  };
  host.addEventListener('touchend', end);
  host.addEventListener('touchcancel', end);
}
