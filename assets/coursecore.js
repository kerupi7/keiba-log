// コース別データの共有ロジック（60-course-data-spec.md）。
// 109-course-tab-spec.md T1: courses.js から courses.html/race.html 双方で使う部分を切り出し。
// window.CourseCore で公開する。DOM操作・fetch は持たない純関数群（courses.js / coursetab.js が呼ぶ）。
(function () {

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

function filterAxisLabel(filterKey) {
  if (filterKey.startsWith('cls:')) return `${filterKey.slice(4)}クラス`;
  if (filterKey.startsWith('year:')) return `${filterKey.slice(5)}年`;
  if (filterKey.startsWith('going:')) return `馬場:${filterKey.slice(6)}`;
  if (filterKey.startsWith('rail:')) {
    const v = filterKey.slice(5);
    return v === '不明' ? '仮柵:記録なし' : `仮柵:${v}コース`;
  }
  return '全クラス・全期間・全馬場';
}

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
// invert: 109-spec §3.3。既定 false（courses.html と同じ・値が大きいほど上）。
// コースタブ（コース詳細をレース詳細に重ねる109-spec）だけ true を渡し、回顧のラップ図
// （race.js lapLineChart・上にあるほど速い）と縦軸の向きを合わせる。
function renderLapSection(f, dist, lapFirstM, curPaceIn, invert) {
  invert = Boolean(invert);
  const PACES = [['all', '全体'], ['S', 'スロー'], ['M', '平均'], ['H', 'ハイ']];
  // 該当0レースのペースはボタンごと消さず disabled で存在を示す（省略すると「データが無い」に
  // 見えて誤解を招くため）。2026-07-30までここは「8R未満」だった。母数で伏せる方針をやめ、
  // 件数を併記して出すことにしたため（100-lap-compare-spec.md §4）。薄い母数の注記は LAP_PACE_LOW。
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
  const y = (v) => {
    const t = (v - lo) / (hi - lo);
    return PT + (H - PT - PB) * (invert ? t : 1 - t);
  };
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

// courses.js（コース一覧・詳細ページ）と coursetab.js（レース詳細のコースタブ・109-spec）が
// 共有する部分だけを公開する。DOM操作・fetchはここには置かない（呼び出し側の責務）。
window.CourseCore = {
  CLASSES, GOINGS, ENTITIES, METRICS, RATE_IDX, RUNS_THIN, LAP_PACE_LOW,
  tier, mmss, filterAxisLabel,
  renderFilterRow, renderKpis, renderLapSection, renderPaceTrend,
  tableHead, tableRow, rankedMap, renderTable,
  POP_TIERS, popTierKey, popTierStats, renderPopTiles,
  parsePrev, prevLabelHtml,
};

})();
