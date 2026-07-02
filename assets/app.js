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
  el.innerHTML = `
    <div class="logo">🏇 keiba-log</div>
    <nav>
      <a href="stats.html">通算成績→</a>
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
  return `${sign}${pct.toFixed(digits)}%`;
}

function fmtYen(v) {
  if (v === null || v === undefined) return '—';
  return `${v.toLocaleString('ja-JP')}円`;
}

function fmtNum(v, digits = null) {
  if (v === null || v === undefined) return '—';
  return digits === null ? String(v) : v.toFixed(digits);
}

function statusBadge(race) {
  // race: {status, stance, outcome}
  if (race.status === 'cancelled') {
    return `<span class="badge badge-cancelled">⚪中止</span>`;
  }
  if (race.status === 'prediction') {
    if (race.stance === 'pass') {
      return `<span class="badge badge-pass">◻見送り</span>`;
    }
    return `<span class="badge badge-prediction">🔵発走前</span>`;
  }
  if (race.status === 'final') {
    if (race.stance === 'pass') {
      return `<span class="badge badge-pass">◻見送り</span>`;
    }
    const hit = race.outcome && race.outcome.bets_hit;
    return hit
      ? `<span class="badge badge-hit">🟢的中</span>`
      : `<span class="badge badge-miss">⚫不的中</span>`;
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
