// コース別データページ描画（60-course-data-spec.md）
(function () {

const TRACK_ORDER = ['札幌', '函館', '福島', '新潟', '東京', '中山', '中京', '京都', '阪神', '小倉'];
const CLASSES = [['all', '全体'], ['未勝利', '未勝利'], ['1勝', '1勝'], ['2勝', '2勝'], ['3勝', '3勝'], ['OP', 'OP']];
const GOINGS = [['all', '全体'], ['良', '良'], ['稍重', '稍重'], ['重', '重'], ['不良', '不良']];
const ENTITIES = [['jockey', '騎手'], ['sire', '種牡馬'], ['trainer', '調教師'], ['damsire', '母父']];
const METRICS = { 1: '勝率', 2: '連対率', 3: '複勝率', 4: '単回収', 5: '複回収' };
const RATE_IDX = new Set([1, 2, 3]);   // ①②③バッジ・順位付けの対象は率3指標のみ（60-spec D5）

const RUNS_THIN = 30;    // これ未満の走数は率をグレー表示（60-spec D4）
const LAP_PACE_LOW = 20; // このペースの該当レース数がこれ未満なら注記を出す

// サンプル信頼度。閾値はコース別レース数の実分布（中央値67R・25%点38R）から設定（60-spec D4）。
function tier(n) {
  return n >= 50 ? { k: 'ok', l: '', msg: '' }
    : n >= 20 ? { k: 'mid', l: '標準', msg: `サンプル ${n}レース。全体傾向は読めますが、走数の少ない行は率が振れます。` }
    : { k: 'low', l: '少', msg: `サンプル ${n}レース。率は偶然の振れが支配的で、傾向としては読めません。着別度数だけを見てください。` };
}

function mmss(sec) {
  return sec == null ? '—' : `${Math.floor(sec / 60)}:${(sec % 60).toFixed(1).padStart(4, '0')}`;
}

function getQueryCourse() {
  const params = new URLSearchParams(window.location.search);
  return params.get('c');
}

// 一覧で選択中の競馬場は場コード2桁（course_idの先頭2桁と同じ体系）でURLに持つ。
// 詳細ページの「← コース一覧」もこれを付けて戻すため、選んだ場が保たれる。
function getQueryTrackCode() {
  const params = new URLSearchParams(window.location.search);
  return params.get('t');
}

function filterAxisLabel(filterKey) {
  if (filterKey.startsWith('cls:')) return `${filterKey.slice(4)}クラス`;
  if (filterKey.startsWith('year:')) return `${filterKey.slice(5)}年`;
  if (filterKey.startsWith('going:')) return `馬場:${filterKey.slice(6)}`;
  return '全クラス・全期間・全馬場';
}

/* ---------- 画面1: コース一覧 ---------- */

// 内回り・外回り・直線の表示。同じ距離でも走るコースが違うので必ず出す（無い場合は空）。
function aroundSuffix(around) {
  return around ? `<span class="carnd">${escapeHtml(around)}</span>` : '';
}

// 場コード（course_idの先頭2桁）→ 競馬場名。index.jsonの実データから作るので対応表を二重管理しない。
function trackCodeMap(index) {
  const map = {};
  index.courses.forEach((c) => { map[c.id.slice(0, 2)] = c.track; });
  return map;
}

function renderList(index, curTrack) {
  const byTrack = {};
  index.courses.forEach((c) => { (byTrack[c.track] = byTrack[c.track] || []).push(c); });

  const tabs = TRACK_ORDER.map((t) => {
    const courses = byTrack[t];
    if (!courses || !courses.length) return `<button type="button" disabled>${escapeHtml(t)}</button>`;
    return `<button type="button" data-track="${escapeHtml(t)}" class="${t === curTrack ? 'active' : ''}">${escapeHtml(t)}</button>`;
  }).join('');

  const rows = (byTrack[curTrack] || []).map((c) => `
    <a class="crow" href="courses.html?c=${encodeURIComponent(c.id)}">
      <div class="cl">
        <span class="sfc ${c.surface === '芝' ? 'turf' : 'dirt'}">${c.surface === '芝' ? '芝' : 'ダ'}</span>
        <span class="cn">${c.distance}m${aroundSuffix(c.around)}</span>
        ${c.grade !== 'high' ? `<span class="ctier ${c.grade}">${c.grade === 'mid' ? '標準' : '少'}</span>` : ''}
      </div>
      <span class="cm">${c.n}R ／ 勝ち ${mmss(c.wt)}</span>
      <span class="arw">›</span>
    </a>`).join('');

  const total = (byTrack[curTrack] || []).reduce((s, c) => s + c.n, 0);

  return `
    <div class="eyebrow">コース別データ<span class="note">収録 ${index.source_races.toLocaleString('ja-JP')}レース（${index.period.from}〜${index.period.to}）</span></div>
    <div class="picklab">競馬場を選ぶ</div>
    <div class="trackpick">${tabs}</div>
    <div class="picklab">距離を選ぶ<span class="sub">${escapeHtml(curTrack)}・${(byTrack[curTrack] || []).length}コース／${total.toLocaleString('ja-JP')}レース</span></div>
    ${rows}
    <div class="notebox">
      蓄積済み ${index.source_races.toLocaleString('ja-JP')} レースから集計した全 ${index.courses.length} コース。サンプルが薄いコースも除外せず、
      <span class="ctier mid">標準</span>（20〜49R）<span class="ctier low">少</span>（20R未満）のバッジで信頼度の目安を示す
      （バッジ無しは50R以上）。判定には表内の走数を見てください。
    </div>
    <div class="foot">Ans.収録レース（2023年〜・JRA平地）の自社集計です。netkeiba等の公表値とは集計範囲・期間が異なります。</div>`;
}

async function initList(container) {
  container.innerHTML = '<div class="empty-state">読み込み中…</div>';
  let index;
  try {
    index = await getData('data/courses/index.json');
  } catch (e) {
    renderError(container, 'コース一覧の読み込みに失敗しました');
    return;
  }

  const available = TRACK_ORDER.filter((t) => index.courses.some((c) => c.track === t));
  if (!available.length) {
    renderError(container, '表示できるコースがありません');
    return;
  }
  // 初期選択: URLの?t=（詳細から戻ってきた場合）→ 東京 → データのある先頭
  const fromUrl = trackCodeMap(index)[getQueryTrackCode()];
  let curTrack = available.includes(fromUrl) ? fromUrl : (available.includes('東京') ? '東京' : available[0]);

  const codeOf = (track) => (index.courses.find((c) => c.track === track) || {}).id.slice(0, 2);

  function refresh() {
    container.innerHTML = renderList(index, curTrack);
  }

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-track]');
    if (!btn) return;
    curTrack = btn.dataset.track;
    refresh();
    // リロード・詳細からの復帰で同じ場が開くようURLを同期（履歴は増やさない）
    history.replaceState(null, '', `courses.html?t=${codeOf(curTrack)}`);
  });

  refresh();
}

/* ---------- 画面2: コース詳細（renderDetailは純関数。DOM操作はinitDetail側で行う） ---------- */

function renderFilterRow(label, axisPrefix, options, data, filterKey) {
  const chips = options.map(([v, l]) => {
    const key = v === 'all' ? 'all' : `${axisPrefix}:${v}`;
    const f = data.filters[key];
    if (!f) return `<button type="button" disabled>${escapeHtml(l)}<i>0R</i></button>`;
    const t = tier(f.n);
    const active = filterKey === key;
    return `<button type="button" data-fkey="${key}" class="${active ? 'active' : ''} t-${t.k}">${escapeHtml(l)}<i>${f.n}R</i></button>`;
  }).join('');
  return `<div class="frow"><span class="flab">${escapeHtml(label)}</span><div class="chips">${chips}</div></div>`;
}

function renderKpis(f) {
  return `<div class="kpis">
    <div class="kpi"><div class="k">勝ちタイム平均</div><div class="v">${mmss(f.wt)}</div></div>
    <div class="kpi"><div class="k">同 最速</div><div class="v">${mmss(f.wtb)}</div></div>
    <div class="kpi"><div class="k">勝ち馬 上がり3F</div><div class="v">${f.l3 != null ? f.l3.toFixed(1) : '—'}<span class="u">秒</span></div></div>
    <div class="kpi"><div class="k">平均出走頭数</div><div class="v">${f.field}<span class="u">頭</span></div></div>
  </div>`;
}

// 区間は原則200mだが、先頭区間だけ lap_first_m（100/150m等）になりうる（60-spec §3-3-6）。
function renderLapSection(f, dist, lapFirstM, curPaceIn) {
  const PACES = [['all', '全体'], ['S', 'スロー'], ['M', '平均'], ['H', 'ハイ']];
  // 8R未満のペースはボタンごと消さず disabled で存在を示す（省略すると「データが無い」に見えて誤解を招くため）
  const hasP = (p) => p === 'all' || Boolean((f.lapP || {})[p]);
  const curPace = hasP(curPaceIn) ? curPaceIn : 'all';

  const paceButtons = PACES.map(([p, l]) => {
    const n = p === 'all' ? f.n : (f.paceN[p] || 0);
    if (!hasP(p)) return `<button type="button" disabled class="p-${p}">${l}<i>${n}R</i></button>`;
    return `<button type="button" data-pace="${p}" class="${p === curPace ? 'active' : ''} p-${p}">${l}<i>${n}R</i></button>`;
  }).join('');

  const sel = curPace === 'all' ? { lap: f.lap || [], races: f.n } : f.lapP[curPace];
  const lap = sel.lap || [];
  if (!lap.length) {
    return `<div class="eyebrow">平均ラップ</div><div class="lapbox"><div class="lappace">${paceButtons}</div>
      <div class="lapnote">ラップデータなし</div></div>`;
  }

  const segs = [lapFirstM, ...Array(lap.length - 1).fill(200)];
  const irregular = segs[0] !== 200;
  const paceLab = curPace === 'all' ? '' : { S: 'スローペース時', M: '平均ペース時', H: 'ハイペース時' }[curPace] + '・';
  const unitNote = `（${paceLab}${sel.races}レース平均・200m区間）`;

  const from = irregular ? 1 : 0;
  const pts = lap.slice(from);
  const ref = (curPace !== 'all' && (f.lap || []).length === lap.length) ? f.lap.slice(from) : null;
  const W = 366, H = 96, PL = 26, PR = 6, PT = 10, PB = 16;
  const allV = ref ? pts.concat(ref) : pts;
  const min = Math.min(...pts), max = Math.max(...pts);
  const lmin = Math.min(...allV), lmax = Math.max(...allV);
  const pad = Math.max(0.35, (lmax - lmin) * 0.18);
  const lo = lmin - pad, hi = lmax + pad;
  const x = (i) => PL + (pts.length === 1 ? 0 : (W - PL - PR) * i / (pts.length - 1));
  const y = (v) => PT + (H - PT - PB) * (1 - (v - lo) / (hi - lo));
  const line = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const fastest = pts.indexOf(min), slowest = pts.indexOf(max);

  const svg = `<svg viewBox="0 0 ${W} ${H}" class="lapsvg">
    ${[lo, (lo + hi) / 2, hi].map((v) =>
      `<line x1="${PL}" y1="${y(v).toFixed(1)}" x2="${W - PR}" y2="${y(v).toFixed(1)}" class="gl"/>
       <text x="${PL - 4}" y="${(y(v) + 3).toFixed(1)}" class="ax">${v.toFixed(1)}</text>`).join('')}
    ${ref ? `<polyline points="${ref.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" class="lapref"/>` : ''}
    <polyline points="${line}" class="lapline"/>
    ${pts.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${i === fastest || i === slowest ? 3.6 : 2.4}"
      class="dot ${i === fastest ? 'fast' : i === slowest ? 'slow' : ''}"/>`).join('')}
    <text x="${PL}" y="${H - 4}" class="ax l">${irregular ? `${segs[0]}m通過後` : 'スタート'}</text>
    <text x="${W - PR}" y="${H - 4}" class="ax r">ゴール</text>
  </svg>`;

  const strip = lap.map((v, i) => {
    const cls = i < from ? 'head' : (i - from === fastest ? 'fast' : i - from === slowest ? 'slow' : '');
    return `<span class="lv ${cls}">${v.toFixed(1)}${i < from ? `<i>${segs[i]}m</i>` : ''}</span>`;
  }).join('<em>-</em>');

  // 序盤の平均通過タイム。距離帯で計測地点を変える（〜1400m:600m / 1500〜1700m:800m / 1800m〜:1000m）
  const target = dist <= 1400 ? 600 : dist <= 1700 ? 800 : 1000;
  let cum = 0, best = null;
  segs.forEach((m, i) => {
    cum += m;
    const gap = Math.abs(cum - target);
    if (!best || gap < best.gap) best = { gap, at: cum, idx: i };
  });
  const passing = lap.slice(0, best.idx + 1).reduce((s, v) => s + v, 0);
  const exact = best.at === target;
  const last3 = lap.slice(-3).reduce((s, v) => s + v, 0);

  const kpi = [
    [`${best.at}m通過`, passing.toFixed(1), exact ? `目標${target}m` : `目標${target}m→最寄り`, exact ? '' : 'approx'],
    ['後半3F', last3.toFixed(1), '600m', ''],
    ['最速区間', min.toFixed(1), `${fastest + 1 + from}区間目`, ''],
    ['最遅区間', max.toFixed(1), `${slowest + 1 + from}区間目`, ''],
  ];
  const kpiHtml = kpi.map(([k, v, u, cls]) =>
    `<div class="${cls}"><div class="k">${k}</div><div class="v">${v}<span class="u">秒</span></div><div class="u2">${u}</div></div>`).join('');

  const notes = [];
  if (ref) {
    const dt = lap.reduce((s, v) => s + v, 0) - f.lap.reduce((s, v) => s + v, 0);
    notes.push(`薄い線は全体平均。走破時計は全体比 <b>${dt >= 0 ? '+' : ''}${dt.toFixed(1)}秒</b>。`);
  }
  if (curPace !== 'all' && sel.races < LAP_PACE_LOW) {
    notes.push(`<b>このペースの該当は${sel.races}レース</b>のみで、ラップの形は数レースで変わります。`);
  }
  if (irregular) {
    notes.push(`このコースは先頭区間が<b>${segs[0]}m</b>（${lap[0].toFixed(1)}秒）で他と長さが違うため、折れ線からは除外し数値のみグレーで表示しています。`);
  }
  if (!exact) {
    notes.push(`区間の境目が${target}mに来ないため、通過タイムは<b>${best.at}m地点</b>の実測値です（補間はしていません）。${target}m地点の他コースとは直接比較できません。`);
  }

  return `
    <div class="eyebrow">平均ラップ<span class="note">${escapeHtml(unitNote)}</span></div>
    <div class="lapbox">
      <div class="lappace">${paceButtons}</div>
      ${svg}
      <div class="lapstrip">${strip}</div>
      <div class="lapkpi">${kpiHtml}</div>
      <div class="lapnote">${notes.join(' ')}</div>
    </div>`;
}

function renderPaceTrend(f) {
  const order = ['S', 'M', 'H'], name = { S: 'スロー', M: '平均', H: 'ハイ' };
  const bar = order.filter((p) => f.pace[p]).map((p) =>
    `<div class="${p.toLowerCase()}" style="width:${f.pace[p]}%">${f.pace[p] >= 12 ? f.pace[p] + '%' : ''}</div>`).join('');
  const top = order.filter((p) => f.pace[p]).sort((a, b) => f.pace[b] - f.pace[a])[0];
  const t = tier(f.n);

  let note;
  if (!top) {
    note = 'ペースデータなし';
  } else if (t.k === 'low') {
    note = `内訳は ${order.filter((p) => f.paceN[p]).map((p) => `${name[p]} ${f.paceN[p]}R`).join('／')}（計 ${f.n}R）。` +
      `<b>この母数では傾向を断定できません。</b>`;
  } else {
    note = `最も多いのは <b>${name[top]}ペース（${f.pace[top]}%・${f.paceN[top]}R）</b>。`;
    // 最有利脚質の断定は、走数30以上の脚質行が1つもなければ出さない（60-spec §5-2 点4）
    const eligible = Object.entries(f.style).filter(([, v]) => v[0] >= RUNS_THIN);
    const styleTop = eligible.sort((a, b) => b[1][3] - a[1][3])[0];
    if (styleTop) {
      note += `この条件で最も3着内に来やすい脚質は <b>${escapeHtml(styleTop[0])}（複勝率 ${styleTop[1][3]}%）</b>。`;
    }
  }

  return `
    <div class="eyebrow">ペース傾向</div>
    <div class="pacebox">
      <div class="pacebar">${bar}</div>
      <div class="pacekey">
        <span><i class="sw s"></i>スロー</span><span><i class="sw m"></i>平均</span><span><i class="sw h"></i>ハイ</span>
      </div>
      <div class="pacenote">${note}</div>
    </div>`;
}

function tableHead(tblKey, sortState) {
  const s = sortState[tblKey] || { idx: 3, on: false };
  const cols = Object.entries(METRICS).map(([i, l]) =>
    `<th class="sortable${+i === s.idx ? ' on' : ''}" data-tbl="${tblKey}" data-i="${i}">${l}</th>`).join('');
  return `<thead><tr><th>区分</th><th>走数</th>${cols}</tr></thead>`;
}

function tableRow(label, v, rank, sortIdx, lowTier, rowCls) {
  const dim = lowTier || v[0] < RUNS_THIN;
  // バッジの有無でラベルの左端がずれないよう、順位なしの行も同じ幅のスロットを置く
  const badge = `<span class="rkslot">${rank ? `<span class="rk r${rank}">${rank}</span>` : ''}</span>`;
  const cell = (i) => {
    const val = v[i];
    const isRoi = i === 4 || i === 5;
    const txt = isRoi ? `${val.toFixed(0)}%` : `${val.toFixed(1)}%`;
    // 単回収・複回収は常時無彩色（着色は率3指標にも付けない。60-spec D5）
    const bar = i === 3 ? `<span class="bar" style="width:${Math.min(72, v[3] * 1.15)}%"></span>` : '';
    return `<td class="${isRoi ? 'roi' : ''}${i === 3 ? ' fk' : ''}${i === sortIdx ? ' sorted' : ''}">${txt}${bar}</td>`;
  };
  return `<tr class="${rank ? 'rank' + rank : ''}${dim ? ' dim' : ''}${rowCls ? ' ' + rowCls : ''}">
    <td>${badge}${label}</td>
    <td class="${v[0] < RUNS_THIN ? 'thin' : ''}">${v[0]}</td>
    ${[1, 2, 3, 4, 5].map(cell).join('')}
  </tr>`;
}

// ①②③の順位付け（走数30以上・率3指標のみ・上位3件）。カード表示とも同じ規則を使うため関数に切り出す。
function rankedMap(entries, sortIdx, lowTier) {
  if (!RATE_IDX.has(sortIdx) || lowTier) return new Map();
  const eligible = entries.filter(([, v]) => v[0] >= RUNS_THIN);
  return new Map([...eligible].sort((a, b) => b[1][sortIdx] - a[1][sortIdx]).slice(0, 3).map(([k], n) => [k, n + 1]));
}

// opts.rowCls(key) … 行に足すクラス（人気表の層バンド用）
// opts.skip     … 表から除く区分名のSet（人物タブでカードに出した上位3件）
function renderTable(tblKey, entries, fmtLabel, sortState, lowTier, opts) {
  opts = opts || {};
  const s = sortState[tblKey] || { idx: 3, on: false };
  const ranked = rankedMap(entries, s.idx, lowTier);
  const shown = (s.on ? [...entries].sort((a, b) => b[1][s.idx] - a[1][s.idx]) : entries)
    .filter(([k]) => !(opts.skip && opts.skip.has(k)));
  const rows = shown.map(([k, v]) =>
    tableRow(fmtLabel(k), v, ranked.get(k), s.idx, lowTier, opts.rowCls ? opts.rowCls(k) : '')).join('');
  // 7列(区分/走数/勝率/連対率/複勝率/単回収/複回収)はモバイル幅に収まらないため横スクロール容器で包む
  return `<div class="tblwrap"><table class="st" data-tbl="${tblKey}">${tableHead(tblKey, sortState)}<tbody>${rows}</tbody></table></div>`;
}

/* ---------- 人気別: 層タイル（B-2） ---------- */
// 層は順序尺度（本命→大穴）なので、色は navy 1色の濃→淡で示す。色相は増やさない。
const POP_TIERS = [
  { key: 'tier1', label: '本命サイド', range: '1〜3番人気', keys: ['1', '2', '3'] },
  { key: 'tier2', label: '中穴', range: '4〜6番人気', keys: ['4', '5', '6'] },
  { key: 'tier3', label: '大穴', range: '7番人気〜', keys: ['7', '8', '9', '10', '11+'] },
];
function popTierKey(k) {
  const t = POP_TIERS.find((x) => x.keys.includes(k));
  return t ? t.key : '';
}
// 層ごとの加重平均（率は走数で重み付け）と、3着内に来た延べ頭数のシェア
function popTierStats(pop) {
  const inTop3 = (v) => v[0] * v[3] / 100;
  const total = Object.values(pop).reduce((s, v) => s + inTop3(v), 0);
  return POP_TIERS.map((t) => {
    const vs = t.keys.filter((k) => pop[k]).map((k) => pop[k]);
    const n = vs.reduce((s, v) => s + v[0], 0);
    const w = (i) => (n ? vs.reduce((s, v) => s + v[0] * v[i], 0) / n : 0);
    return { ...t, n, fuku: w(3), win: w(1), roi: w(4), share: total ? vs.reduce((s, v) => s + inTop3(v), 0) / total * 100 : 0 };
  }).filter((t) => t.n > 0);
}
function renderPopTiles(pop, lowTier) {
  const stats = popTierStats(pop);
  if (lowTier || stats.length < 2) return '';   // 母数が少ない条件では層のまとめを断定しない
  const tiles = stats.map((t) => `
    <div class="tile ${t.key}">
      <div class="lb">${t.label}<br>${t.range}</div>
      <div class="vv">${t.fuku.toFixed(1)}<span>%</span></div>
      <div class="sub">3着内の${t.share.toFixed(1)}%／単回収 ${t.roi.toFixed(0)}%</div>
      <div class="track"><i style="width:${t.share.toFixed(1)}%"></i></div>
    </div>`).join('');
  return `<div class="poptiles">${tiles}</div>
    <div class="tilenote">数字は各層の複勝率（走数で重み付けした平均）。「3着内の◯%」は、3着内に来た延べ頭数のうちその層が占める割合。</div>`;
}

/* ---------- 人物・血統: 上位3件のカード（B-2） ---------- */
// 順位の規則は表と共通（rankedMap）。並び替え中の指標をそのままカードの主数値に出す。
function renderEntityCards(entries, ranked, sortIdx) {
  if (!ranked.size) return '';
  const map = new Map(entries);
  const max = Math.max(...entries.filter(([, v]) => v[0] >= RUNS_THIN).map(([, v]) => v[sortIdx]));
  const cards = [...ranked.entries()].sort((a, b) => a[1] - b[1]).map(([k, n]) => {
    const v = map.get(k);
    return `
      <div class="entcard${n === 1 ? ' c1' : ''}">
        <span class="rkc r${n}">${n}</span>
        <div class="nm">${escapeHtml(k)}</div>
        <div class="runs">${v[0]}走</div>
        <div class="lb">${METRICS[sortIdx]}</div>
        <div class="big">${v[sortIdx].toFixed(1)}%</div>
        <div class="track"><i style="width:${(v[sortIdx] / max * 100).toFixed(1)}%"></i></div>
        <div class="croi"><span>単回収 ${v[4].toFixed(0)}%</span><span>複回収 ${v[5].toFixed(0)}%</span></div>
      </div>`;
  }).join('');
  return `<div class="entcards">${cards}</div>`;
}

function renderEntitySection(f, ent, sortState, lowTier) {
  const entLabel = ENTITIES.find((e) => e[0] === ent)[1];
  const tabs = ENTITIES.map(([v, l]) =>
    `<button type="button" data-ent="${v}" class="${v === ent ? 'active' : ''}">${escapeHtml(l)}</button>`).join('');
  const entries = Object.entries(f[ent] || {});
  let body, note;
  if (!entries.length) {
    body = '';
    note = `この母数（${f.n}レース）では${entLabel}別の集計を出していません。1人あたりの走数が数走にしかならず、率が意味を持たないためです。`;
  } else {
    const s = sortState.tblEnt || { idx: 3, on: false };
    const ranked = rankedMap(entries, s.idx, lowTier);
    const cards = renderEntityCards(entries, ranked, s.idx);
    // カードに出した3件は表からは省く（同じ行が上下に二重に出るのを避ける）
    body = cards + renderTable('tblEnt', entries, (k) => escapeHtml(k), sortState, lowTier, { skip: new Set(ranked.keys()) });
    note = `${entLabel}別・走数上位${entries.length}件（4走以上）。名前は出馬表の表記のまま（例: ルメー／美浦・宮田）。`
      + (ranked.size ? `上のカードは${METRICS[s.idx]}の上位${ranked.size}件（走数30以上）で、下の表からは省いています。` : '');
  }
  return `
    <div class="eyebrow">人物・血統別成績</div>
    <div class="enttabs">${tabs}</div>
    ${body}
    <div class="entnote">${note}</div>`;
}

/* ---------- 前走コース別（tblPrev・競馬場×馬場×距離） ---------- */
// キーは '中山ダート1800' 形式。競馬場名は長さが可変（地方は3文字もある）ため、
// 面(芝|ダート)と末尾の距離を固定パターンで切り出し、残りを競馬場名とする。
function parsePrev(k) {
  const m = k.match(/^(.+?)(芝|ダート)(\d+)$/);
  return m ? { track: m[1], surface: m[2], dist: +m[3] } : null;
}

function prevLabelHtml(k, data) {
  const p = parsePrev(k);
  if (!p) return escapeHtml(k);
  const same = p.track === data.track && p.surface === data.surface && p.dist === data.distance;
  const sf = `<span class="psfc ${p.surface === '芝' ? 'turf' : 'dirt'}">${p.surface === '芝' ? '芝' : 'ダ'}</span>`;
  return `<span class="ptrk">${escapeHtml(p.track)}</span>${sf}<span class="pdist">${p.dist}</span>${same ? '<span class="psame">同コース</span>' : ''}`;
}

// 前走テーブル。tableRow/tableHeadを流用しつつ、①「その他」を常に末尾・順位対象外に固定、
// ②前走が当該コースと一致する行を強調、③「その他」をクリックで開くと走数30未満の内訳
// （prev_more・走数上位）を薄字で展開、の3点だけ独自に扱う。
function renderPrevSection(f, data, sortState, lowTier, prevOpen) {
  const all = Object.entries(f.prev || {});
  if (!all.length) return '';
  const s = sortState.tblPrev || { idx: 3, on: false };
  const other = all.find(([k]) => k === 'その他');
  const main = all.filter(([k]) => k !== 'その他');
  // 順位は実在の前走コースのみ（初出走・その他は除外）
  const ranked = rankedMap(main.filter(([k]) => k !== '初出走'), s.idx, lowTier);
  const ordered = s.on
    ? [...main].sort((a, b) => b[1][s.idx] - a[1][s.idx])
    : [...main].sort((a, b) => b[1][0] - a[1][0]);
  const rowFor = ([k, v]) => {
    const p = parsePrev(k);
    const same = p && p.track === data.track && p.surface === data.surface && p.dist === data.distance;
    const label = p ? prevLabelHtml(k, data) : `<span class="pspecial">${escapeHtml(k)}</span>`;
    return tableRow(label, v, ranked.get(k), s.idx, lowTier, same ? 'prevsame' : '');
  };

  const moreEntries = Object.entries(f.prev_more || {}).sort((a, b) => b[1][0] - a[1][0]);
  const canOpen = Boolean(other) && moreEntries.length > 0;
  let otherRow = '';
  if (other) {
    const caret = canOpen ? `<b class="pcaret">${prevOpen ? '▾' : '▸'}</b>` : '';
    const tail = canOpen ? `<i>${prevOpen ? '内訳を閉じる' : `内訳を見る（${moreEntries.length}件）`}</i>`
      : '<i>走数30未満をまとめ</i>';
    otherRow = tableRow(`<span class="pother">その他${caret}${tail}</span>`,
      other[1], null, s.idx, lowTier, canOpen ? 'prevother prevtoggle' : 'prevother');
  }
  const moreRows = (canOpen && prevOpen)
    ? moreEntries.map(([k, v]) => {
        const p = parsePrev(k);
        const label = p ? prevLabelHtml(k, data) : `<span class="pspecial">${escapeHtml(k)}</span>`;
        return tableRow(label, v, null, s.idx, lowTier, 'prevmore');
      }).join('')
    : '';

  const body = ordered.map(rowFor).join('') + otherRow + moreRows;
  const moreNote = canOpen
    ? '「その他」をタップすると走数30未満の前走コースを走数の多い順に開けます（各行とも母数が少なく参考値）。'
    : '';
  return `
    <div class="eyebrow">前走コース別成績<span class="note">前走の競馬場×馬場×距離</span></div>
    <div class="tblwrap"><table class="st" data-tbl="tblPrev">${tableHead('tblPrev', sortState)}<tbody>${body}</tbody></table></div>
    <div class="entnote">前走が同じ組み合わせだった馬の、このコースでの成績。<b>青い行＝前走が当該コースそのもの（コース経験あり）</b>。走数30以上の前走コースだけ個別に並べ、残りは「その他」にまとめています。前走データの無い初出走は別行。${moreNote}</div>`;
}

// renderDetail: 純関数。data(コースJSON)とfilterKeyだけで完全なHTML文字列を返す。
// opts省略時は pace='all' / ent='jockey' / sort={} の既定値で描画できる（QA全数走査用）。
function renderDetail(data, filterKey, opts) {
  opts = opts || {};
  const pace = opts.pace || 'all';
  const ent = opts.ent || 'jockey';
  const sortState = opts.sort || {};
  const prevOpen = Boolean(opts.prevOpen);

  const f = data.filters[filterKey] || data.filters.all;
  const t = tier(f.n);
  const lowTier = t.k === 'low';
  const years = Object.keys(data.filters)
    .filter((k) => k.startsWith('year:')).map((k) => k.slice(5)).sort();
  const yearOptions = [['all', '全期間'], ...years.map((y) => [y, `${y.slice(2)}年`])];

  const label = filterAxisLabel(data.filters[filterKey] ? filterKey : 'all');
  const totalRuns = Object.values(f.gate).reduce((s, v) => s + v[0], 0);
  const warnHtml = t.msg ? `<div class="warn ${t.k}">${escapeHtml(t.msg)}</div>` : '';

  const styleEntries = ['逃', '先', '差', '追'].filter((s) => f.style[s]).map((s) => [s, f.style[s]]);
  const gateEntries = Object.entries(f.gate).sort((a, b) => +a[0] - +b[0]);
  const popEntries = Object.entries(f.pop)
    .sort((a, b) => (a[0] === '11+' ? 99 : +a[0]) - (b[0] === '11+' ? 99 : +b[0]));

  return `
    <a class="back-link" href="courses.html?t=${encodeURIComponent(data.id.slice(0, 2))}">← ${escapeHtml(data.track)}のコース一覧</a>
    <div class="chead">
      <div class="ctitle">${escapeHtml(data.track)} ${escapeHtml(data.surface)} ${data.distance}m${data.around ? `（${escapeHtml(data.around)}）` : ''}</div>
      <div class="cmeta">${escapeHtml(label)}／${f.n}レース・延べ${totalRuns}頭</div>
    </div>
    <div class="filters">
      ${renderFilterRow('クラス', 'cls', CLASSES, data, filterKey)}
      ${renderFilterRow('年代', 'year', yearOptions, data, filterKey)}
      ${renderFilterRow('馬場', 'going', GOINGS, data, filterKey)}
    </div>
    ${warnHtml}
    <div class="eyebrow">サマリー</div>
    ${renderKpis(f)}
    ${renderLapSection(f, data.distance, data.lap_first_m, pace)}
    ${renderPaceTrend(f)}
    <div class="eyebrow">脚質別成績</div>
    ${renderTable('tblStyle', styleEntries, (k) => escapeHtml(k), sortState, lowTier)}
    <div class="eyebrow">枠順別成績</div>
    ${renderTable('tblGate', gateEntries, (k) => `${wakuBox(+k, 'sm')}枠`, sortState, lowTier)}
    <div class="eyebrow">人気別成績</div>
    ${renderPopTiles(f.pop, lowTier)}
    ${renderTable('tblPop', popEntries, (k) => k === '11+' ? '11番人気〜' : `${k}番人気`, sortState, lowTier,
        { rowCls: popTierKey })}
    ${renderPrevSection(f, data, sortState, lowTier, prevOpen)}
    ${renderEntitySection(f, ent, sortState, lowTier)}
    <div class="notebox">
      勝率・連対率・複勝率は該当区分の全出走馬ベース。単回収・複回収は単勝／複勝100円購入時の回収率（100%＝収支トントン）。
      平均タイムは1着馬のみ、上がりは1着馬の上がり3F平均。ペースは各レースの確定ラップ判定（S/M/H）。
      脚質は最終コーナー通過順を頭数で正規化して判定。
      <b>走数30未満の行は率をグレー表示</b>（複勝率の標準誤差が約8ポイント以上になり、1〜2着分の偶然で数値が動く水準のため）。
      <span class="rk r1">1</span><span class="rk r2">2</span><span class="rk r3">3</span>
      は各表で数字が良い順の上位3件（勝率・連対率・複勝率のみが対象）。
      <b>指標名をタップすると、その数字の良い順に並べ替わります</b>（もう一度タップで元の並びに戻る）。
      順位付けは走数30以上の行のみが対象です。<b>単回収・複回収は参考情報として無着色で表示</b>しています。
      サンプル量では最大配当1〜2本で結果が反転しうるため、買い判断には使わず勝率・複勝率を見てください。
    </div>
    <div class="foot">Ans.収録レース（2023年〜・JRA平地）の自社集計です。netkeiba等の公表値とは集計範囲・期間が異なります。率がグレーの行は走数30未満で参考値です。</div>`;
}

async function initDetail(container, courseId) {
  container.innerHTML = '<div class="empty-state">読み込み中…</div>';
  let data;
  try {
    data = await getData(`data/courses/${courseId}.json`);
  } catch (e) {
    renderError(container, 'コースデータが見つかりません');
    return;
  }

  const state = { filterKey: 'all', pace: 'all', ent: 'jockey', sort: {}, prevOpen: false };

  function refresh() {
    container.innerHTML = renderDetail(data, state.filterKey,
      { pace: state.pace, ent: state.ent, sort: state.sort, prevOpen: state.prevOpen });
  }

  container.addEventListener('click', (e) => {
    const chip = e.target.closest('.chips button[data-fkey]');
    if (chip) {
      state.filterKey = chip.dataset.fkey;
      state.pace = 'all';
      state.prevOpen = false;   // フィルタが変われば前走の内訳も別物なので畳み直す
      refresh();
      window.scrollTo(0, 0);
      return;
    }
    // 「その他」行をタップ→走数30未満の内訳を開閉（スクロール位置は保つ）
    const prevToggle = e.target.closest('tr.prevtoggle');
    if (prevToggle) {
      state.prevOpen = !state.prevOpen;
      refresh();
      return;
    }
    const paceBtn = e.target.closest('.lappace button[data-pace]');
    if (paceBtn) {
      state.pace = paceBtn.dataset.pace;
      refresh();
      return;
    }
    const entBtn = e.target.closest('.enttabs button[data-ent]');
    if (entBtn) {
      state.ent = entBtn.dataset.ent;
      refresh();
      return;
    }
    const th = e.target.closest('th.sortable[data-tbl]');
    if (th) {
      const tbl = th.dataset.tbl, idx = +th.dataset.i;
      const cur = state.sort[tbl] || { idx: 3, on: false };
      state.sort[tbl] = (cur.idx === idx && cur.on) ? { idx, on: false } : { idx, on: true };
      refresh();
      return;
    }
  });

  refresh();
}

function renderError(container, message) {
  container.innerHTML = `<div class="error-box">${escapeHtml(message)}</div>`;
}

function main() {
  renderHeader('courses');
  const container = document.getElementById('courses-content');
  const cid = getQueryCourse();
  if (cid) initDetail(container, cid); else initList(container);
}

// QA(60-spec §7 A6)から直接呼べるように公開しておく。
window.CourseStats = { renderDetail };

main();
})();
