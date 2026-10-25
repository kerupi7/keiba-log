// トップページ描画
(function () {

const TRACK_ORDER = ['札幌', '函館', '福島', '新潟', '東京', '中山', '中京', '京都', '阪神', '小倉'];

// 130-spec §7: 通算成績の枠に「各モデルの成績」（五街道5案）を出す。
// 回収率の高い順・1位だけ塗りの順位・100円が戻るかどうかで色分け（2026-09-09 ユーザー決定）。
// 5案の数字が無い（plan_stats が空の）manifest では、従来の通算成績に落ちる。
const PLAN_STAKE_LABEL = '参考値';

function renderPlanTable(ps) {
  const plans = [...(ps.plans || [])].sort((a, b) => b.roi - a.roi);
  const period = ps.period && ps.period.from
    ? `${PLAN_STAKE_LABEL}・${ps.period.from.slice(5)}〜${ps.period.to.slice(5)}の${ps.n_races}レース`
    : PLAN_STAKE_LABEL;
  const rows = plans.map((p, i) => `
    <tr class="mrow" data-slug="${escapeHtml(p.slug || '')}">
      <td><span class="rk${i === 0 ? ' r1' : ''}">${i + 1}</span>
        <a href="model.html?m=${escapeHtml(p.slug || '')}">${escapeHtml(p.name)}</a></td>
      <td class="big ${p.roi >= 1 ? 'pos' : 'neg'}">${fmtPercent(p.roi, 1)}</td>
      <td class="sm">${p.hit_races}R</td>
      <td class="sm">${p.races}R / ${p.points}点</td>
      <td class="sm">${fmtYen(p.cost)}</td>
      <td class="sm">${fmtYen(p.return)}</td>
    </tr>`).join('');
  return `
    <div class="eyebrow">各モデルの成績 <span class="note">${escapeHtml(period)}</span></div>
    <div class="gkwrap"><table class="gk">
      <tr><th>案</th><th>回収率</th><th>的中</th><th>買った</th><th>投資</th><th>払戻</th></tr>
      ${rows}
    </table></div>
  `;
}

// 表の行のどこをタップしてもモデルのページへ（案名のリンクだけだと的が小さい）
function bindPlanRowClicks() {
  const el = document.getElementById('summary-section');
  if (!el || el.dataset.rowBound) return;
  el.dataset.rowBound = '1';
  el.addEventListener('click', (ev) => {
    if (ev.target.closest('a')) return;   // 案名のリンクはそのまま働かせる
    const row = ev.target.closest('tr.mrow');
    if (!row || !row.dataset.slug) return;
    location.href = `model.html?m=${row.dataset.slug}`;
  });
}

function renderSummary(stats) {
  const el = document.getElementById('summary-section');
  if (!stats || stats.n_final === 0) {
    el.innerHTML = '';
    return;
  }
  // 2026-09-15 ユーザー決定（mockup-168 ①）: TOP の「各モデルの成績」の表は外した。
  // モデルの成績はメニューの「成績」（stats.html）で見る。renderPlanTable は成績ページへ移すまで残す
  el.innerHTML = '';
  return;
  // 2026-09-09 ユーザー決定A: 旧買い目（EVセレクタ／bet-1）の通算成績は廃止した。
  // 成績ページ（stats.html）ごと消しており、ここに出す数字はもう作られない。
  el.innerHTML = '';
}

// 当日（実日付）に最も近い開催日を返す。同着の場合は未来側（これから開催）を優先。
// 例: 土曜に [6/28(日), 7/4(土)] → 7/4 / 金曜に [7/4(土)] → 7/4(1日先)
function pickDefaultDate(dates) {
  if (!dates.length) return undefined;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); // 当日0:00(ローカル)
  let best = dates[0];
  let bestScore = Infinity;
  for (const ds of dates) {
    const t = new Date(ds + 'T00:00:00').getTime();
    // 距離を主キー、同距離なら未来(t>=today)を優先するため過去に +1 のペナルティ
    const score = Math.abs(t - today) * 2 + (t < today ? 1 : 0);
    if (score < bestScore) { bestScore = score; best = ds; }
  }
  return best;
}

// 開催日を「開催週」単位にまとめる。間隔2日以内を同じ開催（土日／土日月の3日開催に対応）。
// 例: [7/11,7/12,7/18,7/19] → [[7/11,7/12],[7/18,7/19]]
function groupMeetings(dates) {
  const out = [];
  for (const ds of dates) {
    const last = out.length ? out[out.length - 1][out[out.length - 1].length - 1] : null;
    const gap = last
      ? (new Date(ds + 'T00:00:00') - new Date(last + 'T00:00:00')) / 86400000
      : Infinity;
    if (gap <= 2) out[out.length - 1].push(ds);
    else out.push([ds]);
  }
  return out;
}

function initState(races) {
  // URLハッシュは読まない。ブックマークや復元タブに古い #d= が残っていると
  // 過去の開催に固定されてしまうため、常に最新の開催週を既定にする。
  const dates = [...new Set(races.map((r) => r.date))].sort();
  const meetings = groupMeetings(dates);
  const activeDate = pickDefaultDate(dates);

  const tracksForDate = (d) => {
    const todays = races.filter((r) => r.date === d);
    const set = new Set(todays.map((r) => r.track));
    const base = TRACK_ORDER.filter((t) => set.has(t)).concat(
      [...set].filter((t) => !TRACK_ORDER.includes(t)).sort()
    );
    // 左から「その日の最初の掲載レースの発走時刻が早い順」（2026-08-27 ユーザー決定）。
    // post_time は全件 HH:MM の5桁なので文字列比較で足りる。同時刻・時刻無しは従来の場順。
    const firstPost = {};
    for (const r of todays) {
      if (!r.post_time) continue;
      if (!firstPost[r.track] || r.post_time < firstPost[r.track]) firstPost[r.track] = r.post_time;
    }
    return base
      .map((t, i) => ({ t, i, p: firstPost[t] || '99:99' }))
      .sort((a, b) => (a.p < b.p ? -1 : a.p > b.p ? 1 : a.i - b.i))
      .map((x) => x.t);
  };

  const activeTrack = tracksForDate(activeDate)[0];

  return { dates, meetings, activeDate, activeTrack, tracksForDate };
}

function renderDateTabs(state, rerender) {
  const el = document.getElementById('datetabs');
  const { meetings, activeDate } = state;
  // 開催週まるごとを常に表示する（土日が両方見える）。矢印は開催週ごとに移動。
  const mi = meetings.findIndex((m) => m.includes(activeDate));
  const window_ = mi >= 0 ? meetings[mi] : [activeDate];

  const prevDisabled = mi <= 0;
  const nextDisabled = mi < 0 || mi >= meetings.length - 1;

  let html = `<span class="arw prev ${prevDisabled ? 'disabled' : ''}">‹</span>`;
  for (const d of window_) {
    const { label, dow, dowClass } = fmtDateTab(d);
    const active = d === activeDate ? ' active' : '';
    html += `<div class="dt${active}" data-date="${d}">${label}<span class="${dowClass}">(${dow})</span></div>`;
  }
  html += `<span class="arw next ${nextDisabled ? 'disabled' : ''}">›</span>`;
  el.innerHTML = `<div class="datetabs">${html}</div>`;

  const goMeeting = (idx, pickLast) => {
    const m = meetings[idx];
    state.activeDate = pickLast ? m[m.length - 1] : m[0];
    const tracks = state.tracksForDate(state.activeDate);
    if (!tracks.includes(state.activeTrack)) state.activeTrack = tracks[0];
    rerender();
  };
  el.querySelector('.arw.prev')?.addEventListener('click', () => {
    if (prevDisabled) return;
    goMeeting(mi - 1, true); // 前の開催週へ（その週の最終日＝いま見ている日に近い側）
  });
  el.querySelector('.arw.next')?.addEventListener('click', () => {
    if (nextDisabled) return;
    goMeeting(mi + 1, false); // 次の開催週へ（初日から）
  });
  el.querySelectorAll('.dt').forEach((dtEl) => {
    dtEl.addEventListener('click', () => {
      state.activeDate = dtEl.dataset.date;
      const tracks = state.tracksForDate(state.activeDate);
      if (!tracks.includes(state.activeTrack)) state.activeTrack = tracks[0];
      rerender();
    });
  });
}

// 136-spec（2026-10-07 ユーザー決定・mockup-248）: 場の切り替えは灰色の切り替えボタン（絞り込み・印の画面と同じ部品）
// 136-spec §9（2026-10-19 ユーザー決定・mockup-339 案A）: 白いつまみ（.pill26）は1つの部品にして、一覧と同じ割合で滑らせる
function renderTracks(state, rerender) {
  const el = document.getElementById('tracks');
  const tracks = state.tracksForDate(state.activeDate);
  el.innerHTML = `<div class="tracks seg26" style="--n:${tracks.length}"><i class="pill26"></i>${tracks
    .map((t) => `<span class="trk ${t === state.activeTrack ? 'on' : ''}" data-track="${escapeHtml(t)}">${escapeHtml(t)}</span>`)
    .join('')}</div>`;
  el.querySelectorAll('.trk').forEach((trkEl, i) => {
    trkEl.addEventListener('click', () => {
      const sc = trackScroller();
      if (sc) sc.scrollTo({ left: i * sc.clientWidth, behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
    });
  });
}

// 一覧を横に払うと場が替わる（2026-10-18 ユーザー「横にスワイプしたら開催場が変わるように」）。
// 136-spec §9（2026-10-19 ユーザー決定「A（指に吸いつく）で本番に入れて」・mockup-339 案A）:
// その日の全部の場を横1列に並べ、一覧が指と同じ量だけ動いて隣の場がのぞく。白いつまみも同じ割合で動く。
// 2026-10-19 ユーザー「なんか残像が残る感じ。もっとぬるぬるでProMotionみたいにしたい」→ 指の動きを JS で追うのをやめ、
// ブラウザ自身の横スクロール（scroll-snap）に任せた。iPhone の写真アプリのページ送りと同じ仕組みで、
// 画面の描き換えの速さ（ProMotion なら120Hz）で動き、勢い・端のゴム・1場ずつ止まるのも本物の iOS の動きになる。
// 白いつまみは、対応ブラウザ（Safari 26 以降など）では CSS がスクロール位置に直接つなぐ（scroll-driven animations）。
// 対応しないブラウザは scroll イベントで動かす
const SWIPE = { busy: false, timer: 0 };
const REDUCE_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const PILL_BY_CSS = !!(window.CSS && CSS.supports('animation-timeline: --a') && CSS.supports('timeline-scope: --a'));
if (PILL_BY_CSS) document.documentElement.classList.add('pill-sda');

const trackScroller = () => document.querySelector('#races-list .vp26');

function placePill(sc) {
  if (PILL_BY_CSS || !sc) return;
  const pill = document.querySelector('#tracks .pill26');
  if (!pill) return;
  const n = sc.children.length;
  const q = Math.max(0, Math.min(n - 1, sc.scrollLeft / Math.max(1, sc.clientWidth)));
  pill.style.transform = `translate3d(${q * 100}%,0,0)`; // 100%＝つまみ1つぶんの幅
}

// 止まっている間は、見ている場の高さに窓を合わせる（場ごとにレース数が違うので、下に空白を作らない）。
// 払い始めたら一番高い場に合わせ、隣の場の下の方が切れないようにする
function fitTrackHeight(sc, moving) {
  const pages = [...sc.children];
  if (!pages.length) return;
  const i = Math.max(0, Math.min(pages.length - 1, Math.round(sc.scrollLeft / Math.max(1, sc.clientWidth))));
  const h = moving ? Math.max(...pages.map((pg) => pg.offsetHeight)) : pages[i].offsetHeight;
  sc.style.height = `${h}px`;
}

function attachTrackScroll(sc, state) {
  const settled = () => {
    clearTimeout(SWIPE.timer);
    SWIPE.busy = false;
    const tracks = state.tracksForDate(state.activeDate);
    const i = Math.max(0, Math.min(tracks.length - 1, Math.round(sc.scrollLeft / Math.max(1, sc.clientWidth))));
    if (tracks[i] !== state.activeTrack) {
      state.activeTrack = tracks[i];
      document.querySelectorAll('#tracks .trk').forEach((el, k) => el.classList.toggle('on', k === i));
    }
    fitTrackHeight(sc, false);
    placePill(sc);
  };
  const hasEnd = 'onscrollend' in window;
  sc.addEventListener('scroll', () => {
    if (!SWIPE.busy) { SWIPE.busy = true; fitTrackHeight(sc, true); }
    placePill(sc);
    // scrollend が無いブラウザは、スクロールが150ms止まったら止まったとみなす
    if (!hasEnd) { clearTimeout(SWIPE.timer); SWIPE.timer = setTimeout(settled, 150); }
  }, { passive: true });
  if (hasEnd) sc.addEventListener('scrollend', settled, { passive: true });
  // 書体の読み込みなどで場の高さが変わったら、窓の高さを合わせ直す
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => { if (!SWIPE.busy && sc.isConnected) fitTrackHeight(sc, false); });
    [...sc.children].forEach((pg) => ro.observe(pg));
  }
}

// 136-spec: 凡例（発走前＝紺／終了＝赤の箱）はやめた。R番号の色の箱を無くし、
// 終わったレースはカードを沈めて見分けるようにしたため。#legend は空にしておく
function renderLegend() {
  document.getElementById('legend').innerHTML = '';
}

// ── 一覧のカード（136-spec・mockup-248） ─────────────────────────────
// 1枚＝1レース。左の柱＝時刻と「6R」（＋WIN5）／1行目＝レース名・荒れ度の札／2行目＝芝ダ・頭数・WIN6 の札。
// 五街道5案の札と◎・収支は一覧から外した（予想は WIN6 だけ・2026-10-07 ユーザー指示）。

// 荒れ度の札（119-spec の値を、段のメーターで出す。％は出さない）。棒の数＝荒れ方の強さ
const UPSET_LEVEL = { kata: 1, naka: 2, dai: 3 };
function upsetChipHtml(upset) {
  if (!upset || !upset.name) return '';
  const key = UPSET_LEVEL[upset.key] ? upset.key : 'naka';
  const bars = [1, 2, 3].map((k) => `<i${k <= UPSET_LEVEL[key] ? ' class="on"' : ''}></i>`).join('');
  return `<span class="ub26 ${key}" title="荒れ度 ${escapeHtml(upset.name)}"><span class="bars">${bars}</span>${escapeHtml(upset.name)}</span>`;
}

// 121-spec: WIN5の脚番号（1〜5）の画像。左の柱の一番下に置く
function win5LabelHtml(win5) {
  const leg = win5 && win5.leg;
  if (!leg) return '';
  return `<div class="w5"><img src="assets/win5-${leg}.png" alt="WIN${leg}" title="WIN5の${leg}レース目" width="188" height="74"></div>`;
}

// WIN6 の札が始まった日（manifest の w6 が入っている一番古い日）。main() が入れる。
// これより前のレースは WIN6 が無いのが当たり前なので、札を出さない（「対象外」と誤読させない）
let W6_FROM = null;

// 2行目の右端の札1枚。馬番・馬名は出さない（2026-10-07 ユーザー指示）
function w6TagHtml(race) {
  if (race.status === 'cancelled') return '<span class="cp26">中止</span>';
  const w = race.w6;
  if (!w) {
    // 134-spec T4: 前日の先行公開はオッズの発売前で、買い目を出しようがないだけ
    if (race.odds_pending) return '<span class="cp26">オッズ待ち</span>';
    return (W6_FROM && race.date >= W6_FROM) ? '<span class="cp26">対象外</span>' : '';
  }
  if (w.skip) return '<span class="cp26">対象外</span>';
  if (!w.points) return '<span class="cp26">買い目なし</span>';
  if (race.status === 'final' && w.hit) {
    return `<span class="cp26 hit">WIN6 的中 <b>${fmtYen(w.ret)}</b></span>`;
  }
  if (race.status === 'final') return '<span class="cp26 miss">WIN6 外れ</span>';
  return `<span class="cp26 w6">WIN6 <b>${w.points}</b>点</span>`;
}

// 激アツ（3連単100万超えの見込みが6%以上）。判定は keiba_publish.bigpay_for_manifest が済ませている
const FLAME_SVG = '<svg class="fl26" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5c.6 3.4 4.8 5.6 4.8 11.2a4.8 4.8 0 0 1-9.6 0c0-2.7 1.4-4 2-6.3 1 1 1.7 2.3 1.9 3.9.6-2.8.9-5.4.9-8.8z" fill="#F0582A"/><path d="M12 11.5c.3 1.6 2.4 2.6 2.4 5.2a2.4 2.4 0 0 1-4.8 0c0-1.6.9-2.3 1.4-3.5.5.6.8 1 .9 1.9.2-1.3.1-2.4.1-3.6z" fill="#FFC23D"/></svg>';
const isHotRace = (race) => !!(race.bigpay && race.bigpay.hot);
// AIの評価Sの札の印（大小2つのきらめき）。馬番は keiba_publish.ai_s_for_manifest が manifest の ai_s に入れている
const SPARK_SVG = '<svg class="sp26" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 2.5c.7 4.6 2.4 6.3 7 7-4.6.7-6.3 2.4-7 7-.7-4.6-2.4-6.3-7-7 4.6-.7 6.3-2.4 7-7z" fill="#8C7CE6"/><path d="M18.5 13.5c.35 2.3 1.2 3.15 3.5 3.5-2.3.35-3.15 1.2-3.5 3.5-.35-2.3-1.2-3.15-3.5-3.5 2.3-.35 3.15-1.2 3.5-3.5z" fill="#7FB6EC"/></svg>';

// 日本時間の「今」（YYYY-MM-DD と HH:MM）。端末の時刻帯に左右されないよう Asia/Tokyo で出す
function nowJst() {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}

// 終わったレース＝確定・中止、または発走時刻を過ぎたレース（確定の取り込みは数分遅れるため時刻でも見る）。
// 前の日の開催は全部終わり、先の日の開催は全部これから
function isDoneRace(race, now) {
  if (race.status === 'final' || race.status === 'cancelled') return true;
  if (race.date < now.date) return true;
  if (race.date > now.date) return false;
  return !!race.post_time && race.post_time <= now.hm;
}

// 次のレースのカードを赤くする残り時間（10分）
const SOON_MS = 10 * 60 * 1000;

// 発走の瞬間（ミリ秒）。post_time は日本時間の HH:MM
function postAtMs(race) {
  if (!race.date || !/^\d{1,2}:\d{2}$/.test(race.post_time || '')) return null;
  const t = Date.parse(`${race.date}T${race.post_time.padStart(5, '0')}:00+09:00`);
  return Number.isFinite(t) ? t : null;
}

// 残り時間の文字。1時間以上は「1時間05分12秒」、それ未満は「12分34秒」
function countdownText(ms) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}時間${pad(m)}分${pad(s)}秒` : `${m}分${pad(s)}秒`;
}

function renderRaceRow(race, ctx) {
  const done = isDoneRace(race, ctx.now);
  const isNext = ctx.nextId === race.race_id;
  const hot = isHotRace(race);
  const surface = race.surface === '芝'
    ? `<span class="sf26 tf">芝<b>${race.distance}</b></span>`
    : `<span class="sf26 dt">ダ<b>${race.distance}</b></span>`;
  const badge = race.grade ? `<span class="gb26">${escapeHtml(race.grade)}</span>` : '';
  // 2026-09-08: 自分で付けた「買いレース」の札。付け外しは詳細ページだけで、ここは出すだけ
  const bchip = isBuyRace(race.race_id) ? '<span class="brtag">買い</span>' : '';
  // 2026-10-25 ユーザー「100万超えの文言は削除して」→ 札は「激アツ 8.3%」だけ
  const hotTab = hot
    ? `<span class="hot26">${FLAME_SVG}激アツ<b>${race.bigpay.pct.toFixed(1)}<small>%</small></b></span>` : '';
  // 2026-10-25 ユーザー「AIモデルのSランクの馬がいた場合も同じように表示」→ 激アツと同じ左上の札と縁（色は薄紫）。並ぶときは激アツが先。
  // 同じ日「Sがいるかどうかでいい」→ 馬番は出さず「✦ AI評価S」だけ（manifest の ai_s には馬番が入っているが、ここでは有無だけ見る）
  const aiS = Array.isArray(race.ai_s) && race.ai_s.length > 0;
  // 激アツと並ぶ時は右上の「発走まで」とぶつかるので、CSS で「AI評価」を隠して「✦S」だけにする（.ail）
  const aiTab = aiS ? `<span class="ai26">${SPARK_SVG}<span class="ail">AI評価</span>S</span>` : '';
  const leftTabs = hotTab || aiTab ? `<span class="tg26">${hotTab}${aiTab}</span>` : '';
  // 2026-10-10 ユーザー「次14:00発走じゃなくて、発走まで残り何分何秒か出して、カウントダウン式に」。
  // 残りの文字は tickCountdown が1秒ごとに書き換える（発走時刻は札の左にもう出ている）
  const postAt = postAtMs(race);
  const nextTab = isNext
    ? (postAt != null
      ? `<span class="next26"><i>発走まで</i><b class="cd26" data-post-at="${postAt}">${countdownText(postAt - Date.now())}</b></span>`
      : '<span class="next26">次のレース</span>')
    : '';
  // 2026-10-10 ユーザー「10分切ったら色が赤っぽい色に変わるように」→ mockup-287 案B（札・縁・影・発走時刻を全部赤）
  const soon = isNext && postAt != null && postAt - Date.now() < SOON_MS;
  const cls = ['rc26', done ? 'done' : '', hot ? 'hot' : '', aiS ? 'ais' : '', isNext ? 'next' : '', soon ? 'soon' : ''].filter(Boolean).join(' ');
  return `
    <a class="${cls}" href="race.html?id=${race.race_id}">
      ${leftTabs}${nextTab}
      <div class="c1">
        <b class="tm">${escapeHtml(race.post_time || '—')}</b>
        <span class="rno">${race.race_number}R</span>
        ${win5LabelHtml(race.win5)}
      </div>
      <div class="mn">
        <div class="nm"><span class="nmt">${escapeHtml(race.race_name)}${badge}</span>${bchip}${upsetChipHtml(race.upset)}</div>
        <div class="mt">${surface}<span class="hc26"><b>${race.field_size}</b>頭</span>${w6TagHtml(race)}</div>
      </div>
    </a>
  `;
}

// 136-spec §9: その日の全部の場を横1列の帯に並べ、見ている場の位置へ寄せて置く（払うと隣の場が指についてくる）
function renderRaceList(state, races) {
  const el = document.getElementById('races-list');
  const tracks = state.tracksForDate(state.activeDate);
  const now = nowJst();
  const lists = tracks.map((track) => {
    const filtered = races
      .filter((r) => r.date === state.activeDate && r.track === track)
      .sort((a, b) => a.race_number - b.race_number);
    // 次のレース＝今日の開催で、まだ終わっていない一番早いレース。今日以外の日には出さない
    const next = filtered.find((r) => r.date === now.date && !isDoneRace(r, now));
    const ctx = { now, nextId: next ? next.race_id : null };
    return `<div class="rl26" data-track="${escapeHtml(track)}">${filtered.map((r) => renderRaceRow(r, ctx)).join('')}</div>`;
  });
  el.innerHTML = `<div class="vp26">${lists.map((l) => `<div class="pg26">${l}</div>`).join('')}</div>`;
  const sc = trackScroller();
  sc.scrollLeft = Math.max(0, tracks.indexOf(state.activeTrack)) * sc.clientWidth;
  fitTrackHeight(sc, false);
  placePill(sc);
  attachTrackScroll(sc, state);
}

function renderEmpty() {
  document.getElementById('datetabs').innerHTML = '';
  document.getElementById('tracks').innerHTML = '';
  document.getElementById('legend').innerHTML = '';
  document.getElementById('races-list').innerHTML = '<div class="empty-state">まだレースがありません</div>';
}

async function main() {
  renderHeader('index');
  let manifest;
  try {
    manifest = await getData('data/manifest.json');
  } catch (e) {
    document.getElementById('races-list').innerHTML =
      `<div class="error-box">データの読み込みに失敗しました: ${escapeHtml(e.message)}</div>`;
    return;
  }
  // 136-spec: WIN6 の札が始まった日。これより前のレースには札を出さない
  W6_FROM = (manifest.races || []).filter((r) => r.w6).map((r) => r.date).sort()[0] || null;
  renderSummary(manifest.stats);
  const races = manifest.races || [];
  if (!races.length) {
    renderEmpty();
    return;
  }
  // 旧版が書き込んだ #d=&t= が残っていると紛らわしいので消す
  if (window.location.hash) history.replaceState(null, '', window.location.pathname);
  const state = initState(races);
  const rerender = () => {
    renderDateTabs(state, rerender);
    renderTracks(state, rerender);
    renderLegend();
    renderRaceList(state, races);
  };
  rerender();
  window.addEventListener('resize', () => { const sc = trackScroller(); if (sc) { fitTrackHeight(sc, false); placePill(sc); } });
  // 136-spec: 次のレース・終わったレースは時刻で動くので、1分ごとに一覧だけ描き直す
  // 横にスクロールしている途中は描き直さない（位置が跳ぶため）
  setInterval(() => { if (!SWIPE.busy) renderRaceList(state, races); }, 60000);
  // 「次」の札の残り時間は1秒ごと。0になったら一覧を描き直して、札を次のレースへ移す
  setInterval(() => {
    let passed = false;
    document.querySelectorAll('.cd26[data-post-at]').forEach((el) => {
      const left = Number(el.dataset.postAt) - Date.now();
      el.textContent = countdownText(left);
      const card = el.closest('.rc26');
      if (card) card.classList.toggle('soon', left < SOON_MS);
      if (left <= 0) passed = true;
    });
    if (passed && !SWIPE.busy) renderRaceList(state, races);
  }, 1000);
}

main();

})();
