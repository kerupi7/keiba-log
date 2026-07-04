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
      <a href="index.html" class="${activePage === 'index' ? 'active' : ''}">TOP</a>
      <a href="stats.html" class="${activePage === 'stats' ? 'active' : ''}">成績</a>
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
