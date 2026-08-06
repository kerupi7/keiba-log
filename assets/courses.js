// コース別データページ描画（60-course-data-spec.md）
// 109-course-tab-spec.md T1: フィルタ・KPI・ラップ・ペース・表など共有部分は coursecore.js へ
// 切り出し済み（window.CourseCore）。このファイルは courses.html 固有の画面（一覧・詳細）だけを持つ。
(function () {

const CourseCore = window.CourseCore;
const {
  CLASSES, GOINGS, ENTITIES, METRICS, RATE_IDX, RUNS_THIN, LAP_PACE_LOW,
  tier, mmss, filterAxisLabel,
  renderFilterRow, renderKpis, renderLapSection, renderPaceTrend,
  tableHead, tableRow, rankedMap, renderTable,
  POP_TIERS, popTierKey, popTierStats, renderPopTiles,
  parsePrev, prevLabelHtml,
} = CourseCore;

const TRACK_ORDER = ['札幌', '函館', '福島', '新潟', '東京', '中山', '中京', '京都', '阪神', '小倉'];

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

  // 仮柵（移動柵）。芝だけの概念なのでダートには行ごと出さない。選択肢はデータに
  // 実在するものだけを並べる（Dコースを使わないコースにDの空チップを出さない）。
  const railOrder = ['A', 'B', 'C', 'D', '不明'];
  const rails = railOrder.filter((v) => (data.filters[`rail:${v}`] || {}).n > 0);
  const railOptions = rails.length
    ? [['all', '全体'], ...rails.map((v) => [v, v === '不明' ? '記録なし' : `${v}コース`])]
    : [];

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
      ${railOptions.length ? renderFilterRow('仮柵', 'rail', railOptions, data, filterKey) : ''}
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
      <b>仮柵</b>は芝の内ラチの位置（Aが最も内・B以降は外へ動かす）で、芝のコースにのみ表示します。
      「記録なし」は柵の位置を採れていないレースです。<b>仮柵で絞ると1区分あたり数十レースまで減ります</b>。
      手元データで検定した範囲では、仮柵ごとの枠順の差は同じ数のレースをでたらめに分けた場合と区別がつきませんでした
      （全コースをまとめた傾きは仮柵1段あたり+0.63ポイント、対照の95%範囲±2.3ポイント）。傾向として読まず、内訳の確認に使ってください。
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
