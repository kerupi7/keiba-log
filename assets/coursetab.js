// レース詳細「コース」タブ（109-course-tab-spec.md T3〜T5）
// ペース傾向まではcourses.jsと同じC案（CourseCoreを共有）、脚質別成績から下は
// 今日の出走馬を重ねるB案。タブを最初に開いた時だけ data/courses/{course_id}.json と
// data/courses/index.json を読む（遅延読み込み・V3）。
(function () {

const CourseCore = window.CourseCore;
const {
  CLASSES, GOINGS, ENTITIES,
  tier, renderFilterRow, renderKpis, renderLapSection, renderPaceTrend,
  tableHead, tableRow, rankedMap, renderTable,
  parsePrev, prevLabelHtml,
} = CourseCore;

const ENT_KEY = { jockey: 'jockey', sire: 'sire', trainer: 'trainer', damsire: 'damsire' };
// 2026-08-07改訂: 下半分の表は「前走コース＋人物・血統4次元」の5枚をボタンで切り替える。
// 脚質別・枠順別（展開タブに同じ話がある）と人気別は廃止した。
const DIMS = [['prev', '前走コース'], ...ENTITIES];
// §4.6: 次元ごとに文言を変える（前走／騎乗／産駒の出走／管理馬の出走／母父としての出走）
const MISS_TEXT = {
  prev: 'このコースでの前走データが少なく行なし',
  jockey: 'このコースでの騎乗が1度も無く行なし',
  sire: 'このコースでの産駒の出走が無く行なし',
  trainer: 'このコースでの管理馬の出走が無く行なし',
  damsire: 'このコースでの母父としての出走が無く行なし',
};

// §4.5: 調教師だけ所属を外して突合する（'栗東・友道' と '友道' を同じキーで引く）
function stripBelong(name) {
  if (!name) return name;
  const i = name.indexOf('・');
  return i >= 0 ? name.slice(i + 1) : name;
}

// 2026-08-27: 馬番を押すと馬名ポップアップ（#pop-N）が開くようにした。
// 開く仕組みは race.js の [data-pop] の1本だけで、こちらは属性を付けるだけ。
// 押すと今開いているコースのポップアップは閉じ、馬のポップアップに入れ替わる
// （同時に2枚は開かない作りをそのまま使う）。
function badges(hs) {
  return hs.map((h) => `<button type="button" class="hnb" data-pop="${h.number}">`
    + `${umaBox(h.number, h.gate, 'sm')}</button>`).join('');
}

// §4.6: 行が引けなかった馬は必ず1行でまとめて出す（黙って消さない）
function missRow(miss, word) {
  if (!miss.length) return '';
  return `<div class="ctab-miss"><span class="bl">${badges(miss)}</span><span class="mw">${escapeHtml(word)}</span></div>`;
}

// レース詳細ページは1レース1回読みなので、タブの状態はモジュールスコープで持つ。
const state = {
  loaded: false, loading: false,
  data: null, index: null,
  filterKey: 'all', pace: 'all', ent: 'prev', sort: {},
};

// §3.4: コース見出し（renderDetailの戻りリンク＋.cheadをタブ用に差し替えたもの）
// 2行目は「いま選んでいる条件」と「その条件のレース数」。ここを固定文言（全体／収録◯◯レース）に
// すると、クラスや馬場で絞ったあとも「全体・123レース」と出て、下の表の母数（未勝利なら28レース）と
// 食い違う。courses.html の .cmeta と同じく filterAxisLabel を通して選択中の条件を出す。
// 収録期間だけは全体の話なのでカッコ内に残す。
function renderChead(data, index, cid, filterKey) {
  const idxEntry = ((index && index.courses) || []).find((c) => c.id === cid) || {};
  const around = data.around ? `（${escapeHtml(data.around)}）` : '';
  const cur = data.filters[filterKey] ? filterKey : 'all';
  const label = cur === 'all' ? '全体' : CourseCore.filterAxisLabel(cur);
  const n = data.filters[cur].n.toLocaleString('ja-JP');
  const total = (idxEntry.n != null ? idxEntry.n : data.filters.all.n).toLocaleString('ja-JP');
  const scope = cur === 'all' ? `収録 ${n}レース` : `${n}レース（収録${total}レース中）`;
  const period = index && index.period ? `（${index.period.from}〜${index.period.to}）` : '';
  return `<div class="chead">
    <div class="ctitle">${escapeHtml(data.track)} ${escapeHtml(data.surface)}${data.distance}m${around}</div>
    <div class="cmeta">${escapeHtml(label)}／${scope}${period}</div>
  </div>`;
}

// courses.js renderDetail と同じ組み立て（年代・仮柵の選択肢はデータに実在するものだけ）
function buildFilterOptions(data) {
  const years = Object.keys(data.filters).filter((k) => k.startsWith('year:')).map((k) => k.slice(5)).sort();
  const yearOptions = [['all', '全期間'], ...years.map((y) => [y, `${y.slice(2)}年`])];
  const railOrder = ['A', 'B', 'C', 'D', '不明'];
  const rails = railOrder.filter((v) => (data.filters[`rail:${v}`] || {}).n > 0);
  const railOptions = rails.length
    ? [['all', '全体'], ...rails.map((v) => [v, v === '不明' ? '記録なし' : `${v}コース`])]
    : [];
  return { yearOptions, railOptions };
}

// §4.4: 出走馬の前走に当たる行だけを複勝率の高い順に出す（「その他」・折りたたみは出さない）
function buildPrevTable(f, data, horses, lowTier) {
  const same = `${data.track}${data.surface}${data.distance}`;
  const prevKeyOf = (h) => {
    const runs = h.past_runs || [];
    if (!runs.length) return '初出走';
    const p = runs[0];
    if (!(p && p.track && p.surface && p.distance)) return '初出走';
    return `${p.track}${p.surface}${p.distance}`;
  };
  const hit = {};
  const miss = [];
  horses.forEach((h) => {
    const k = prevKeyOf(h);
    const v = (f.prev || {})[k] || (f.prev_more || {})[k];
    if (v) { (hit[k] = hit[k] || []).push(h); } else miss.push(h);
  });
  const keys = Object.keys(hit).sort((a, b) => {
    const va = (f.prev || {})[a] || (f.prev_more || {})[a];
    const vb = (f.prev || {})[b] || (f.prev_more || {})[b];
    return vb[3] - va[3];
  });
  const entries = keys.map((k) => [k, (f.prev || {})[k] || (f.prev_more || {})[k]]);
  const fmtLabel = (k) => {
    const label = parsePrev(k) ? prevLabelHtml(k, data) : `<span class="pspecial">${escapeHtml(k)}</span>`;
    return `<span class="bn">${label}</span><span class="bl">${badges(hit[k])}</span>`;
  };
  const tbl = renderTable('tblCTPrev', entries, fmtLabel, state.sort, lowTier,
    { rowCls: (k) => (k === same ? 'prevsame' : '') });
  return { tbl, miss };
}

// §4.5: site.course_entities（出走馬ぶんだけの人物・血統）を引く。{course_id}.json の
// 上位20件ストアは使わない。
function entityGroup(ce, dim, horses) {
  const table = ce[dim] || {};
  const keyed = {};
  Object.keys(table).forEach((k) => { keyed[dim === 'trainer' ? stripBelong(k) : k] = k; });
  const hit = {};
  const miss = [];
  horses.forEach((h) => {
    let v = h[ENT_KEY[dim]];
    if (dim === 'trainer') v = stripBelong(v);
    if (v && keyed[v]) { (hit[keyed[v]] = hit[keyed[v]] || []).push(h); } else miss.push(h);
  });
  return { table, hit, miss };
}

function renderPanel(site) {
  const data = state.data;
  const index = state.index;
  const cid = site.course_entities.course_id;
  const horses = site.horses.filter((h) => !h.scratched);
  const n = horses.length;
  const f = data.filters[state.filterKey] || data.filters.all;
  const t = tier(f.n);
  const lowTier = t.k === 'low';
  const warnHtml = t.msg ? `<div class="warn ${t.k}">${escapeHtml(t.msg)}</div>` : '';
  const { yearOptions, railOptions } = buildFilterOptions(data);

  const filtersHtml = `<div class="filters">
    ${renderFilterRow('クラス', 'cls', CLASSES, data, state.filterKey)}
    ${renderFilterRow('年代', 'year', yearOptions, data, state.filterKey)}
    ${renderFilterRow('馬場', 'going', GOINGS, data, state.filterKey)}
    ${railOptions.length ? renderFilterRow('仮柵', 'rail', railOptions, data, state.filterKey) : ''}
  </div>`;

  // ── 出走馬を重ねる表（前走コース＋人物・血統4次元をボタンで切り替える） ──
  // 前走コースは data/courses/{cid}.json、人物・血統は site.course_entities と出どころが違うが、
  // 「今日の◯頭に当たる行だけを出す」形は同じなので1つの切替にまとめる（2026-08-07改訂）。
  const { tbl: prevTbl, miss: prevMiss } = buildPrevTable(f, data, horses, lowTier);
  const ce = ((site.course_entities.filters || {})[state.filterKey]) || {};
  const covByDim = { prev: n - prevMiss.length };
  const groupByDim = {};
  ENTITIES.forEach(([d]) => {
    const g = entityGroup(ce, d, horses);
    groupByDim[d] = g;
    covByDim[d] = n - g.miss.length;
  });
  // 選択中の次元が0/nでボタンを押せない状態になっていたら、押せる次元へ自動で戻す
  const dimKeys = DIMS.map(([d]) => d);
  const activeDim = covByDim[state.ent] > 0 ? state.ent : (dimKeys.find((d) => covByDim[d] > 0) || state.ent);

  let dimTbl;
  let dimMiss;
  if (activeDim === 'prev') {
    dimTbl = prevTbl;
    dimMiss = prevMiss;
  } else {
    const { table: entTable, hit: entHit, miss: entMiss } = groupByDim[activeDim];
    const entKeys = Object.keys(entHit).sort((a, b) => entTable[b][3] - entTable[a][3]);
    // 表のIDは4次元で共有する（並べ替えの状態を騎手↔種牡馬で持ち越す。前走だけ別ID）
    dimTbl = renderTable('tblCTEnt', entKeys.map((k) => [k, entTable[k]]),
      (k) => `<span class="bn">${escapeHtml(k)}</span><span class="bl">${badges(entHit[k])}</span>`,
      state.sort, lowTier);
    dimMiss = entMiss;
  }
  const entTabsHtml = DIMS.map(([d, label]) =>
    `<button type="button" data-ct-ent="${d}" class="${d === activeDim ? 'active' : ''}"`
    + `${covByDim[d] === 0 ? ' disabled' : ''}>${escapeHtml(label)} ${covByDim[d]}/${n}</button>`).join('');
  const activeLabel = DIMS.find((e) => e[0] === activeDim)[1];

  return `
    ${renderChead(data, index, cid, state.filterKey)}
    ${filtersHtml}
    ${warnHtml}
    <div class="eyebrow">サマリー</div>
    ${renderKpis(f)}
    ${renderLapSection(f, data.distance, data.lap_first_m, state.pace, true)}
    ${renderPaceTrend(f)}
    <div class="ctab-flag">ここから下は <b>今日の${n}頭を重ねた表</b></div>
    <div class="eyebrow">${escapeHtml(activeLabel)}別成績<span class="note">${covByDim[activeDim]}/${n}頭</span></div>
    <div class="enttabs ct5">${entTabsHtml}</div>
    ${dimTbl}
    ${missRow(dimMiss, MISS_TEXT[activeDim])}
    <a class="back-link" href="courses.html?c=${encodeURIComponent(cid)}">→ コース別データ（全項目）を見る</a>
  `;
}

function refresh(site) {
  const root = document.getElementById('coursetab-root');
  if (!root) return;
  root.innerHTML = renderPanel(site);
}

async function loadAndRender(site) {
  if (state.loaded || state.loading) return;
  state.loading = true;
  const cid = site.course_entities.course_id;
  try {
    const [data, index] = await Promise.all([
      getData(`data/courses/${cid}.json`),
      getData('data/courses/index.json'),
    ]);
    state.data = data;
    state.index = index;
    state.loaded = true;
  } catch (e) {
    const root = document.getElementById('coursetab-root');
    if (root) root.innerHTML = '<div class="error-box">コースデータの読み込みに失敗しました</div>';
    state.loading = false;
    return;
  }
  state.loading = false;
  refresh(site);
}

function setupCourseTab20(site) {
  const root = document.getElementById('coursetab-root');
  if (!root) return;
  root.addEventListener('click', (e) => {
    if (!state.loaded) return;
    const chip = e.target.closest('.filters .chips button[data-fkey]');
    if (chip) {
      state.filterKey = chip.dataset.fkey;
      state.pace = 'all';
      refresh(site);
      return;
    }
    const paceBtn = e.target.closest('.lappace button[data-pace]');
    if (paceBtn) {
      state.pace = paceBtn.dataset.pace;
      refresh(site);
      return;
    }
    const entBtn = e.target.closest('.enttabs button[data-ct-ent]');
    if (entBtn) {
      if (entBtn.disabled) return;
      state.ent = entBtn.dataset.ctEnt;
      refresh(site);
      return;
    }
    const th = e.target.closest('th.sortable[data-tbl]');
    if (th) {
      const tbl = th.dataset.tbl;
      const idx = +th.dataset.i;
      const cur = state.sort[tbl] || { idx: 3, on: false };
      state.sort[tbl] = (cur.idx === idx && cur.on) ? { idx, on: false } : { idx, on: true };
      refresh(site);
    }
  });
}

// race.js buildRace20Html から呼ぶ。course_entities が無いレースはタブ自体を落とす
// （race.js側の判断・§2.2）ので、ここでの空文字返却はその防御second-line。
function renderCourseTab20(site) {
  if (!site.course_entities) return '';
  return '<div class="cstats ctab" id="coursetab-root"><div class="empty-state">読み込み中…</div></div>';
}

window.CourseTab = {
  render: renderCourseTab20,
  setup: setupCourseTab20,
  // race.js setupTabs20 の show() から、'course' タブが最初に表示された時だけ呼ばれる
  onShow: loadAndRender,
};

})();
