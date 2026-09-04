// WIN5のオッズ帯別おすすめ（122-spec）。data/win5.json だけを読む独立ページ。
// 対象5鞍の特定は 121-spec（金曜の一覧取得）で済んでいるので、ここでは判定をしない。

// 荒れ度の札。index.js の同名関数と同じ見た目（表示のみ・おすすめの選定には使わない）。
const W5_UPSET_CLS = { kata: 'u-kata', naka: 'u-naka', dai: 'u-dai' };

function w5UpsetChipHtml(upset) {
  if (!upset || !upset.name) return '';
  const cls = W5_UPSET_CLS[upset.key] || 'u-naka';
  const pct = upset.percent == null ? ''
    : `<span class="pv">${upset.percent}<small>%</small></span>`;
  return `<span class="uchip ${cls}">${escapeHtml(upset.name)}${pct}</span>`;
}

function w5PickHtml(p) {
  const mark = p.mark ? `<span class="mk">${escapeHtml(p.mark)}</span>` : '';
  const pop = p.popularity == null ? '' : `<span class="pop">${p.popularity}番人気</span>`;
  return `<div class="pk">${umaBox(p.number, p.gate, 'sm')}`
    + `<span class="nm">${escapeHtml(p.name)}</span>${mark}${pop}`
    + `<span class="pp">${fmtPercent(p.prob)}</span>`
    + `<span class="od${oddsHotClass(p.odds)}">${p.odds.toFixed(1)}倍</span></div>`;
}

// 0頭の帯も節ごと出す（122-spec §3 の決定4）。帯が空だったことが分かるようにするため。
function w5BandHtml(b) {
  const head = `<div class="bd"><span class="bl">${escapeHtml(b.label)}</span>`
    + `<span class="bn">${b.n}頭中 ${b.picks.length}頭</span></div>`;
  if (!b.picks.length) {
    return head + `<div class="none">${b.n ? '推せる馬なし' : 'この帯に馬がいない'}</div>`;
  }
  return head + b.picks.map(w5PickHtml).join('');
}

function w5LegHtml(lg) {
  const name = lg.race_name || '—';
  const head = `<div class="lh"><span class="w5b">WIN${lg.leg}</span>`
    + `<span class="lt">${escapeHtml(lg.post_time || '—')}</span>`
    + `<a class="lr" href="race.html?id=${encodeURIComponent(lg.race_id)}">`
    + `${escapeHtml(lg.track || '')}${lg.race_number || ''}R ${escapeHtml(name)}</a>`
    + w5UpsetChipHtml(lg.upset) + '</div>';
  // 公開前の鞍と、取得の対象外（新馬・障害・2歳未勝利）はどちらも帯が空になる。
  // 見分ける材料がここには無いので、両方に当てはまる書き方にする（122-spec §6-D）
  if (!lg.bands || !lg.bands.length) {
    return `<div class="leg">${head}<div class="none">`
      + 'このレースの予想はまだありません（新馬・障害・2歳未勝利は予想の対象外です）'
      + '</div></div>';
  }
  return `<div class="leg">${head}${lg.bands.map(w5BandHtml).join('')}</div>`;
}

function w5DayHtml(day) {
  const n = day.legs.reduce(
    (a, lg) => a + (lg.bands || []).reduce((b, x) => b + x.picks.length, 0), 0);
  return `<div class="w5box"><div class="w5t">${escapeHtml(day.date)}`
    + `<span class="w5d">締切 ${escapeHtml(day.deadline || '—')}（1鞍目の発走）`
    + ` ・ おすすめ計${n}頭</span></div>`
    + day.legs.map(w5LegHtml).join('') + '</div>';
}

function w5GateNote(gate) {
  const bands = (gate && gate.bands) || [];
  const parts = bands.map(b => `${b.label}は上位${b.top_pct}%`);
  return '<p class="w5note">同じレース・同じオッズ帯の中で、勝つ見込みが上位に入った馬だけを出しています'
    + `（${escapeHtml(parts.join(' / '))}・端数は切り上げ）。`
    + '荒れ度の札はレースの性格を見るためのもので、おすすめの選び方には使っていません。</p>';
}

// ===== 当週のWIN5対象レース（2026-09-04追加）=====
// win5.json の legs をそのまま並べるだけ。行をタップすると そのレースの詳細へ飛ぶ。
// 対象5鞍の特定は 121-spec（金曜）で済んでいるので、ここでは判定をしない。
function w5RaceRowHtml(lg) {
  const rc = `${escapeHtml(lg.track || '')}${lg.race_number || ''}R`;
  return `<a class="w5lrow" href="race.html?id=${encodeURIComponent(lg.race_id)}">`
    + `<img class="w5lb" src="assets/win5-${lg.leg}.png" alt="WIN${lg.leg}" width="188" height="74">`
    + `<span class="w5lt">${escapeHtml(lg.post_time || '—')}</span>`
    + `<span class="w5lc">${rc}</span>`
    + `<span class="w5ln">${escapeHtml(lg.race_name || '—')}</span>`
    + '<span class="w5lgo">›</span></a>';
}

function w5RaceListHtml(days) {
  if (!days || !days.length) return '';
  return days.map(day => {
    const d = fmtDateTab(day.date);
    const head = '<div class="w5lhead">'
      + `<span class="w5ldate">${d.label}<span class="${d.dowClass}">（${d.dow}）</span>の対象レース</span>`
      + `<span class="w5ldl">締切 ${escapeHtml(day.deadline || '—')}</span></div>`;
    return `<div class="w5list">${head}${(day.legs || []).map(w5RaceRowHtml).join('')}</div>`;
  }).join('');
}

// 2026-08-24: オッズ帯別おすすめの一覧（122-spec）は画面から外した。
// データ（data/win5.json）も組み立て（w5DayHtml / w5GateNote）も残してあるので、
// この関数を元に戻せば一覧はそのまま戻る。
async function render() {
  renderHeader('win5');
  const el = document.getElementById('win5-content');
  let days = [];
  try {
    days = (await getData('data/win5.json')).days || [];
  } catch (e) { /* 5鞍がまだ無い週。逆算の側だけ出す */ }
  el.innerHTML = w5RaceListHtml(days);
  renderPayoutAkinator(el, days);
}


// ===== 配当逆算アキネーター（125-spec）。data/win5_payout.json だけを読む =====
// 狙いたい配当と予算の2問で、各鞍の**オッズ帯**と「◯頭まで」を返す。
// 馬は決めない（上のおすすめ一覧から自分で選ぶ）。当たりやすさは一切見ていない。
const W5P_BAND = { L: '〜4.9倍', M: '5.0〜19.9倍', H: '20.0倍〜' };
const W5P_ORDER = ['L', 'M', 'H'];
let w5pData = null;
let w5pState = { mode: null, step: 0, bucket: null, budget: null, budgetText: '',
  day: 0, sel: null, showAll: false, openCompo: null, leg: 0 };
let w5pDays = [];          // render() が渡す当週の日（印から見る側で使う）

function w5pYen(v) {
  if (v == null) return '—';
  v = Math.round(v);
  if (v >= 100000000) return (v / 100000000).toFixed(2) + '億円';
  if (v >= 10000) return Math.round(v / 10000).toLocaleString() + '万円';
  return v.toLocaleString() + '円';
}

function w5pProg(step, sub, done, total) {
  return `<div class="ak-prog"><span class="ak-step">${escapeHtml(step)}</span>`
    + `<span class="ak-cand">${sub}</span></div>`
    + '<div class="ak-dots">'
    + Array.from({ length: total }, (_, i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('')
    + '</div>';
}

// 帯のキー。オッズだけで決める（人気は使わない）
function w5pBandOf(odds) {
  return odds < 5.0 ? 'L' : (odds < 20.0 ? 'M' : 'H');
}

// ===== 第0問: どちらの入り口か =====
function w5pQ0() {
  let h = w5pProg('はじめに', '2つの入り口', 1, 3);
  h += '<div class="ak-card"><div class="ak-q"><div class="qhead">'
    + '<span class="q">どちらから見ますか？</span></div>'
    + '</div>'
    + '<div class="ak-opts">'
    + '<button class="ak-opt" data-w5pmode="target"><span class="oi">1</span>'
    + '<span class="obody"><span class="ol">いくら狙うか決める</span></span></button>'
    + '<button class="ak-opt" data-w5pmode="marks"><span class="oi">2</span>'
    + '<span class="obody"><span class="ol">選んだ馬から配当を見る</span></span></button>'
    + '</div></div>';
  return h;
}

function w5pQ1() {
  let h = w5pProg('質問 1 / 2', `過去 <b>${w5pData.source.n_rounds}</b> 回から`, 2, 4);
  h += '<div class="ak-card"><div class="ak-q"><div class="qhead">'
    + '<span class="q">いくらくらいの配当を狙いますか？</span></div>'
    + '</div><div class="ak-opts">';
  w5pData.buckets.forEach((b, i) => {
    h += `<button class="ak-opt" data-w5pb="${i}"><span class="oi">${i + 1}</span>`
      + `<span class="obody"><span class="ol">${escapeHtml(b.label)}</span>`
      + `<span class="od">${w5pYen(b.min)}〜${b.max ? w5pYen(b.max) : '上限なし'}`
      + ` ・過去 ${b.n_rounds_in_bucket}回（全体の${Math.round(b.share_of_all * 100)}%）`
      + '</span></span></button>';
  });
  return h + '</div></div>';
}

function w5pQ2() {
  const b = w5pData.buckets[w5pState.bucket];
  let h = w5pProg('質問 2 / 2', `狙い <b>${escapeHtml(b.label)}</b>`, 3, 4);
  h += '<div class="ak-card"><div class="ak-q"><div class="qhead">'
    + '<span class="q">予算はいくらですか？</span></div>'
    + '</div><div class="ak-opts">';
  w5pData.budgets.forEach((v, i) => {
    h += `<button class="ak-opt" data-w5pbud="${v}"><span class="oi">${i + 1}</span>`
      + `<span class="obody"><span class="ol">${v.toLocaleString()}円</span>`
      + `<span class="od">${Math.floor(v / 100).toLocaleString()}点まで</span></span></button>`;
  });
  h += '</div>'
    + '<div class="ak-input"><input id="w5pbudin" type="text" inputmode="numeric"'
    + ' autocomplete="off" placeholder="上に無ければ金額を打つ（例 5000・1万2000）"'
    + ` value="${w5pState.budgetText || ''}">`
    + '<div class="parsed" id="w5pbudmsg"></div></div>'
    + '<div class="ak-foot"><span class="picked">'
    + '<button class="ak-mini" id="w5pback">1つ戻る</button></span>'
    + '<button class="ak-btn" id="w5pbudgo" disabled>この予算で見る</button></div></div>';
  return h;
}

function w5pPlanHtml(p, budget) {
  const a = p.budgets[String(budget)] || w5pAllocate(p.counts, Math.floor(budget / 100));
  let h = '<div class="w5p-res">'
    + `<div class="rh"><span class="rt">真ん中 ${w5pYen(p.median)}`
    + (a ? `<span class="rt2">${a.points}点・${a.yen.toLocaleString()}円</span>` : '')
    + '</span>'
    + `<span class="rn">4回に1回は ${w5pYen(p.q1)} を下回り、4回に1回は `
    + `${w5pYen(p.q3)} を超えます（過去${p.n}回）</span></div>`;

  const day = w5pCurrentDay();
  if (day && (day.legs || []).some(l => (l.horses || []).length)) {
    // 今週の5鞍が分かっているなら、帯をレースに割り当てて馬番で出す
    const band = w5pAssignLegs(day.legs, p.counts);
    // 同じ帯を割り当てた鞍が複数あるとき、頭数の多い（＝絞りにくい）鞍から多く配る
    const heads = [];
    W5P_ORDER.forEach(k => {
      const quota = ((a && a.heads_by_band[k]) || []).slice().sort((x, y) => y - x);
      day.legs.map((lg, i) => i).filter(i => band[i] === k)
        .sort((x, y) => w5pBandCount(day.legs[y], k) - w5pBandCount(day.legs[x], k))
        .forEach((i, j) => { heads[i] = quota[j] != null ? quota[j] : 1; });
    });
    h += day.legs.map((lg, i) => w5pLegCardHtml(lg, band[i], heads[i] || 1)).join('');
  } else {
    // 5鞍がまだ分からない週は、帯と頭数だけを出す（金曜の取得前）
    const legs = [];
    W5P_ORDER.forEach(k => ((a && a.heads_by_band[k]) || []).forEach(n => legs.push([k, n])));
    h += '<div class="legs">' + legs.map((x, i) =>
      `<div class="lg"><span class="no">WIN${i + 1}</span>`
      + `<span class="bl">${W5P_BAND[x[0]]} の中から</span>`
      + `<span class="hd">${x[1]}頭<small>まで</small></span></div>`).join('') + '</div>';
  }

  const tags = [escapeHtml(p.label), `${p.n}回中${p.n_in_bucket}回が狙いの額`];
  if (a && a.unused_yen > 0) tags.push(`${a.unused_yen.toLocaleString()}円あまり`);
  if (!p.median_in_bucket) tags.push('<span class="warn">真ん中は狙いの外</span>');
  if (p.n_capped) tags.push(`<span class="warn">上限に届いた回 ${p.n_capped}</span>`);
  h += `<div class="rf">${tags.join(' ・ ')}</div>`;
  return h + '</div></div>';
}

function w5pResult() {
  const b = w5pData.buckets[w5pState.bucket];
  let h = w5pProg('答え', `狙い <b>${escapeHtml(b.label)}</b>`
    + ` ／ 予算 <b>${w5pState.budget.toLocaleString()}円</b>`, 4, 4);
  if (!b.plans.length) {
    h += '<div class="w5p-res"><div class="rf">この配当帯に、'
      + `過去${w5pData.source.min_n_per_plan}回以上出ている帯の組み合わせがありませんでした。`
      + '件数が足りないので目安を出しません。</div></div>';
  } else if (w5pState.showAll) {
    b.plans.forEach(p => { h += w5pPlanHtml(p, w5pState.budget); });
  } else {
    // 既定は1案だけ出す。3案並べると読む側が選ばされるので、残りは押した時だけ出す
    h += w5pPlanHtml(b.plans[0], w5pState.budget);
    if (b.plans.length > 1) {
      h += `<div class="w5pmore"><button class="ak-mini" id="w5pmore">`
        + `他の組み立て方を見る（あと${b.plans.length - 1}つ）</button></div>`;
    }
  }
  return h + '<div class="w5pagain">'
    + '<button class="ak-btn ghost" id="w5pagain">はじめから</button></div>';
}

function w5pFoot() {
  const pop = W5P_ORDER.map(k => `${W5P_BAND[k]} ${w5pData.band_population[k]}頭`).join(' / ');
  return '<p class="w5pfoot">'
    + `材料は netkeiba の過去のWIN5 ${w5pData.source.n_rounds}回`
    + `（${w5pData.source.from}〜${w5pData.source.to}）。`
    + '帯は勝ち馬の確定した単勝オッズで切っています。'
    + '買うときのオッズは締切まで動きます。'
    + '<b>締切30分前の時点と確定オッズで帯が変わる馬は8頭に1頭</b>'
    + '（875頭中112頭・12.8%。2026-07-24以降にオッズを追えた360レースで実測）。'
    + `各鞍の頭数は、帯ごとの1レース平均頭数（${pop}）を重みにして割り振り、`
    + '〜4.9倍は3頭・5.0〜19.9倍は6頭・20.0倍〜は9頭を上限にしています。'
    + '<b>この道具は当たりやすさを一切見ていません。</b>'
    + '配当の狙いをオッズ帯の言葉に置き換えるだけのものです。'
    + '<br>どの鞍に高いオッズ帯を置くかは、荒れる見立ての強いレースから順に寄せているだけです。'
    + '<b>これは並べ方の規則であって、当たりやすさの根拠ではありません。</b>'
    + '荒れ度で買い目を変える案は2026-08-20に4方向すべて不合格になっています'
    + '（10,359レース・単勝は大荒れが100円あたり99円で堅い86円より上ですが、'
    + '10期のうち符号が揃ったのは6期・でたらめに選んだ場合でも30.8%の確率で起きる差でした）。</p>';
}

function w5pRender() {
  const box = document.getElementById('w5p-app');
  if (!box) return;
  if (w5pState.step === 0) box.innerHTML = w5pQ0();
  else if (w5pState.mode === 'marks') {
    box.innerHTML = w5pState.step === 1 ? w5pPickScreen() : w5pMarksResult();
  } else {
    box.innerHTML = w5pState.step === 1 ? w5pQ1() : (w5pState.step === 2 ? w5pQ2() : w5pResult());
  }
  box.querySelectorAll('[data-w5pb]').forEach(x => x.onclick = () => {
    w5pState.bucket = Number(x.dataset.w5pb); w5pState.step = 2;
    w5pState.showAll = false; w5pRender();
  });
  box.querySelectorAll('[data-w5pbud]').forEach(x => x.onclick = () => {
    w5pState.budget = Number(x.dataset.w5pbud); w5pState.step = 3; w5pRender();
  });
  const back = document.getElementById('w5pback');
  if (back) back.onclick = () => { w5pState.step = 1; w5pRender(); };
  box.querySelectorAll('[data-w5pmode]').forEach(x => x.onclick = () => {
    w5pState.mode = x.dataset.w5pmode;
    w5pState.step = 1;
    if (w5pState.mode === 'marks') w5pInitSel();
    w5pRender();
  });
  box.querySelectorAll('[data-w5pday]').forEach(x => x.onclick = () => {
    w5pState.day = Number(x.dataset.w5pday); w5pInitSel(); w5pRender();
  });
  box.querySelectorAll('[data-w5pleg]').forEach(x => x.onclick = () => {
    const lg = Number(x.dataset.w5pleg), n = Number(x.dataset.w5pnum);
    const set = w5pState.sel[lg];
    if (set.has(n)) set.delete(n); else set.add(n);
    w5pRender();
  });
  const inp = document.getElementById('w5pbudin');
  if (inp) {
    const msg = document.getElementById('w5pbudmsg');
    const btn = document.getElementById('w5pbudgo');
    const upd = () => {
      w5pState.budgetText = inp.value;
      const y = w5pParseYen(inp.value);
      if (!y) {
        msg.innerHTML = inp.value.trim() ? '<span class="dim">—</span>' : '';
        btn.disabled = true;
        return;
      }
      msg.innerHTML = `<b>${y.toLocaleString()}円</b> → ${Math.floor(y / 100).toLocaleString()}点まで`;
      btn.disabled = false;
    };
    inp.oninput = upd;
    inp.onkeydown = e => { if (e.key === 'Enter' && !btn.disabled) btn.click(); };
    upd();
    btn.onclick = () => {
      const y = w5pParseYen(inp.value);
      if (!y) return;
      w5pState.budget = y; w5pState.step = 3; w5pRender();
    };
  }
  box.querySelectorAll('[data-w5pgoleg]').forEach(x => x.onclick = () => {
    w5pState.leg = Number(x.dataset.w5pgoleg); w5pRender();
  });
  const next = document.getElementById('w5pnext');
  if (next) next.onclick = () => {
    const day = w5pCurrentDay();
    const last = !day || w5pState.leg >= day.legs.length - 1;
    if (last) w5pState.step = 2; else w5pState.leg += 1;
    w5pRender();
    if (!last) window.scrollTo(0, 0);
  };
  const prev = document.getElementById('w5pprev');
  if (prev) prev.onclick = () => {
    if (w5pState.leg > 0) w5pState.leg -= 1;
    else { w5pState.mode = null; w5pState.step = 0; }
    w5pRender();
  };
  const edit = document.getElementById('w5pedit');
  if (edit) edit.onclick = () => { w5pState.step = 1; w5pState.leg = 0; w5pRender(); };
  box.querySelectorAll('[data-w5popen]').forEach(x => x.onclick = () => {
    w5pState.openCompo = (w5pState.openCompo === x.dataset.w5popen)
      ? null : x.dataset.w5popen;
    w5pRender();
  });
  const more = document.getElementById('w5pmore');
  if (more) more.onclick = () => { w5pState.showAll = true; w5pRender(); };
  const again = document.getElementById('w5pagain');
  if (again) again.onclick = () => {
    w5pState = { mode: null, step: 0, bucket: null, budget: null, budgetText: '',
      day: 0, sel: null, showAll: false, openCompo: null, leg: 0 };
    w5pRender();
  };
}

// ===== 狙う帯を実際のレースに割り当てる（125-spec §13）=====
//
// **並べ方の規則であって、当たりやすさの根拠ではない。**
// 荒れ度で買い目を変える案は 2026-08-20 に4方向すべて不合格で終わっている
// （research/README-upsetbet3-2026-08-20.md・10,359レース）。
// ここでやっているのは「高いオッズ帯を、荒れる見立ての強いレースへ寄せる」という並べ替えだけ。

// 荒れる見立ての強い順。大荒れの見込み → 堅いの見込みが低い順 → 脚番号、の順で決める
function w5pLegOrderByUpset(legs) {
  return legs.map((lg, i) => i).sort((a, b) => {
    const ua = (legs[a].upset && legs[a].upset.probs) || {};
    const ub = (legs[b].upset && legs[b].upset.probs) || {};
    return (ub.dai || 0) - (ua.dai || 0)
      || (ua.kata || 0) - (ub.kata || 0)
      || a - b;
  });
}

function w5pBandCount(lg, key) {
  return (lg.horses || []).filter(h => w5pBandOf(h.odds) === key).length;
}

// counts（帯が何鞍ずつか）を、実際の5鞍に割り当てる。
// 割り当てた帯にその鞍の馬が1頭もいない場合は、両方が埋まる相手と入れ替える
function w5pAssignLegs(legs, counts) {
  const slots = [];
  ['H', 'M', 'L'].forEach(k => { for (let i = 0; i < (counts[k] || 0); i++) slots.push(k); });
  const order = w5pLegOrderByUpset(legs);
  const band = [];
  order.forEach((legIdx, i) => { band[legIdx] = slots[i]; });
  for (let i = 0; i < legs.length; i++) {
    if (w5pBandCount(legs[i], band[i])) continue;
    for (let j = 0; j < legs.length; j++) {
      if (i === j || band[i] === band[j]) continue;
      if (w5pBandCount(legs[i], band[j]) && w5pBandCount(legs[j], band[i])) {
        const t = band[i]; band[i] = band[j]; band[j] = t;
        break;
      }
    }
  }
  return band;
}

// その鞍・その帯の馬を馬番で出す。おすすめ（win5.jsonのpicks）に入っている馬は枠を濃くする
function w5pLegCardHtml(lg, key, heads) {
  const rec = new Set();
  (lg.bands || []).forEach(b => {
    if (b.label === W5P_BAND[key]) (b.picks || []).forEach(p => rec.add(p.number));
  });
  // 並びはオッズの安い順だけ。おすすめを先頭に寄せると数字が飛んで読みにくかった
  const inband = (lg.horses || [])
    .filter(h => w5pBandOf(h.odds) === key)
    .sort((a, b) => a.odds - b.odds);
  const u = lg.upset;
  const uchip = u && u.name
    ? `<span class="uchip ${W5_UPSET_CLS[u.key] || 'u-naka'}">${escapeHtml(u.name)}`
      + (u.percent == null ? '' : `<span class="pv">${u.percent}<small>%</small></span>`)
      + '</span>'
    : '';
  // レース名は出馬表（race.html）へのリンクにする。race_id が無い鞍だけ文字のまま
  const rcTxt = `${escapeHtml(lg.track || '')}${lg.race_number || ''}R `
    + `${escapeHtml(lg.race_name || '')}`;
  const rc = lg.race_id
    ? `<a class="w5rc" href="race.html?id=${encodeURIComponent(lg.race_id)}">${rcTxt}`
      + '<span class="go">›</span></a>'
    : `<span class="w5rc">${rcTxt}</span>`;
  let h = '<div class="w5leg"><div class="lgh">'
    + `<span class="no">WIN${lg.leg}</span>${rc}${uchip}</div>`
    + `<div class="band"><span class="bt b${key}">${W5P_BAND[key]}</span>`
    + `<span class="cap">${heads}頭<small>まで</small></span></div>`;
  if (!inband.length) {
    return h + '<div class="none">この帯に馬がいません。別の帯から選んでください</div></div>';
  }
  h += '<div class="unums">'
    + inband.map(x => `<span class="unum${rec.has(x.number) ? ' on' : ''}">`
      + umaBox(x.number, x.gate, 'sm')
      + `<span class="nm">${escapeHtml(x.name || '')}</span>`
      + `<span class="od${oddsHotClass(x.odds)}">${x.odds.toFixed(1)}</span></span>`).join('')
    + '</div>';
  return h + '</div>';
}

// 予算から各鞍の頭数を決める。shared/scripts/keiba_win5_payout_table.py の allocate_heads と
// **同じ手順**（頭数÷その帯の平均頭数 が一番小さい鞍から1頭ずつ増やす／帯ごとの上限で止める）。
// 決め打ちの予算は win5_payout.json に入っているが、自由入力ぶんはここで計算する。
// 手順が2か所にあるので、既定の予算で両者が一致するかを w5pAllocSelfTest() で確かめている。
function w5pAllocate(counts, maxPoints) {
  if (!(maxPoints >= 1)) return null;
  const pop = w5pData.band_population, cap = w5pData.max_heads;
  const legs = [];
  W5P_ORDER.forEach(k => { for (let i = 0; i < (counts[k] || 0); i++) legs.push(k); });
  const heads = legs.map(() => 1);
  for (;;) {
    const order = legs.map((k, i) => i)
      .sort((a, b) => (heads[a] / pop[legs[a]]) - (heads[b] / pop[legs[b]]));
    let grew = false;
    for (const i of order) {
      if (heads[i] >= cap[legs[i]]) continue;
      const trial = heads.slice();
      trial[i] += 1;
      if (trial.reduce((a, h) => a * h, 1) <= maxPoints) { heads[i] = trial[i]; grew = true; break; }
    }
    if (!grew) break;
  }
  const points = heads.reduce((a, h) => a * h, 1);
  const by = {};
  legs.forEach((k, i) => { (by[k] = by[k] || []).push(heads[i]); });
  Object.keys(by).forEach(k => by[k].sort((a, b) => b - a));
  return {
    heads_by_band: by, points: points, yen: points * 100,
    capped_by_band_size: heads.every((h, i) => h >= cap[legs[i]]),
    unused_yen: Math.max(0, maxPoints * 100 - points * 100),
  };
}

// 画面側とPython側がずれていないかを、決め打ちの予算で毎回確かめる。
// ずれたらコンソールに出す（画面は止めない。数字は win5_payout.json 側を正とする）
function w5pAllocSelfTest() {
  let bad = 0;
  (w5pData.buckets || []).forEach(b => (b.plans || []).forEach(p => {
    Object.keys(p.budgets || {}).forEach(bud => {
      const mine = w5pAllocate(p.counts, Math.floor(Number(bud) / 100));
      if (!mine || mine.points !== p.budgets[bud].points) {
        bad += 1;
        if (typeof console !== 'undefined') {
          console.warn('w5p: 頭数の割り振りが食い違いました', p.compo, bud,
            mine && mine.points, p.budgets[bud].points);
        }
      }
    });
  }));
  return bad;
}

// 「12000」「1万2千円」「1,2000」など。数字と「万」だけ拾って100円単位に切り下げる
function w5pParseYen(text) {
  if (!text) return null;
  const t = String(text).replace(/[，、\s円]/g, '').replace(/,/g, '')
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  let yen = null;
  const man = t.match(/^(\d+(?:\.\d+)?)万(\d*)$/);
  if (man) yen = Math.round(Number(man[1]) * 10000) + (man[2] ? Number(man[2]) : 0);
  else if (/^\d+$/.test(t)) yen = Number(t);
  if (yen == null || !isFinite(yen)) return null;
  return Math.floor(yen / 100) * 100;      // 100円ずつ買うので100円未満は切り捨てる
}

// ===== 印から配当を見る（順算）=====
// 印の正本は出馬表側（race.js の localStorage mymark:{race_id}）。ここでは**読むだけ**で、
// 書き戻さない。「消」は買わない印なので選択に入れない。
// ✓ も買う側の印なので初期選択に入れる（2026-09-02 追加。消だけが外れる）
const W5P_MY_OK = { '◎': 1, '○': 1, '▲': 1, '△': 1, '☆': 1, '✓': 1 };
// 印の濃さは買い目アキネーターと同じ（.ak-mk hon/tai/tan/oku）。◎が一番濃い
const W5P_MY_CLS = { '◎': 'hon', '○': 'tai', '▲': 'tan', '△': 'oku', '☆': 'oku', '✓': 'oku' };

function w5pMyMarks(raceId) {
  try {
    if (typeof localStorage === 'undefined') return {};
    return JSON.parse(localStorage.getItem('mymark:' + raceId)) || {};
  } catch (e) { return {}; }
}

function w5pCurrentDay() {
  return w5pDays[w5pState.day] || w5pDays[0] || null;
}

// 出馬表で付けた印を初期値にする。印が無い鞍は空のまま（勝手に馬を足さない）
function w5pInitSel() {
  const day = w5pCurrentDay();
  w5pState.sel = [0, 1, 2, 3, 4].map(() => new Set());
  w5pState.leg = 0;
  if (!day) return;
  day.legs.forEach((lg, i) => {
    const mk = w5pMyMarks(lg.race_id);
    (lg.horses || []).forEach(h => {
      if (W5P_MY_OK[mk[String(h.number)]]) w5pState.sel[i].add(h.number);
    });
  });
}

function w5pPoints() {
  return (w5pState.sel || []).reduce((a, s) => a * (s.size || 0), 1);
}

// まだ選んでいない鞍を1頭ぶんとして数えた点数。選んでいる途中でも0円にならないようにする
function w5pPointsSoFar() {
  return (w5pState.sel || []).reduce((a, s) => a * (s.size || 1), 1);
}

function w5pDayTabs() {
  if (w5pDays.length < 2) return '';
  return '<div class="ak-bar"><span class="lbl">日付</span>'
    + w5pDays.map((d, i) => `<button class="ak-mini${i === w5pState.day ? ' on' : ''}"`
      + ` data-w5pday="${i}">${escapeHtml(d.date)}</button>`).join('') + '</div>';
}

function w5pHorseRow(lg, i, h) {
  const on = w5pState.sel[i].has(h.number);
  const mk = w5pMyMarks(lg.race_id)[String(h.number)];
  const my = W5P_MY_OK[mk]
    ? `<span class="ak-mk ${W5P_MY_CLS[mk]}">${mk}</span>`
    : '<span class="ak-mk none">・</span>';
  return `<button class="ak-h${on ? ' sel' : ''}" data-w5pleg="${i}" data-w5pnum="${h.number}">`
    + umaBox(h.number, h.gate, 'sm') + my
    + `<span class="nmwrap"><span class="nm">${escapeHtml(h.name)}</span>`
    + `<span class="meta"><span class="od${oddsHotClass(h.odds)}">`
    + `${h.odds.toFixed(1)}倍</span>`
    + `<span class="pop">${h.popularity == null ? '' : h.popularity + '番人気'}</span>`
    + `<span class="pop">${W5P_BAND[w5pBandOf(h.odds)]}</span></span></span>`
    + '<span class="chk"></span></button>';
}

// ===== 選ぶたびに動く配当のものさし（2026-08-26・1鞍ずつ選ぶ画面で使う）=====
//
// **当たりやすさは一切見ていない。**当たった場合に過去いくら付いたかを引いているだけ。
// まだ選んでいない鞍は「3帯とも起こり得る」として残すので、鞍を決めるほど幅が狭くなる。

function w5pHasStat(r) {
  return r && r.n >= w5pData.source.min_n_per_plan && r.median != null;
}

// いまの選び方から、当たり得る帯の組み合わせを出す（最大でも 3^5 = 243通りの数え上げ）
function w5pReachableCompos() {
  const day = w5pCurrentDay();
  if (!day) return [];
  const allow = day.legs.map((lg, i) => {
    const set = new Set();
    (lg.horses || []).forEach(h => {
      if (w5pState.sel[i].has(h.number)) set.add(w5pBandOf(h.odds));
    });
    return set.size ? W5P_ORDER.filter(k => set.has(k)) : W5P_ORDER.slice();
  });
  let acc = [{ L: 0, M: 0, H: 0 }];
  allow.forEach(keys => {
    const next = [];
    acc.forEach(c => keys.forEach(k => {
      const x = { L: c.L, M: c.M, H: c.H };
      x[k] += 1;
      next.push(x);
    }));
    acc = next;
  });
  const stat = {};
  (w5pData.compositions || []).forEach(x => { stat[x.compo] = x; });
  const seen = {};
  acc.forEach(c => {
    seen[W5P_ORDER.filter(k => c[k]).map(k => k + c[k]).join('')] = true;
  });
  return Object.keys(seen).map(k => stat[k]).filter(Boolean);
}

// ものさしの端。過去に記録のある組み合わせ全体の幅を背景に敷いて、いまの幅を重ねる
let w5pSpanCache = null;
function w5pAllSpan() {
  if (w5pSpanCache) return w5pSpanCache;
  const m = (w5pData.compositions || []).filter(w5pHasStat).map(x => x.median);
  w5pSpanCache = { lo: Math.min.apply(null, m), hi: Math.max.apply(null, m) };
  return w5pSpanCache;
}

// 配当は2万円から4億円まで1万倍以上ひらくので、目盛りは桁で取る（対数目盛り）
function w5pMeterPos(v) {
  const s = w5pAllSpan();
  const r = (Math.log(v) - Math.log(s.lo)) / (Math.log(s.hi) - Math.log(s.lo));
  return Math.max(0, Math.min(100, r * 100));
}

function w5pMeterHtml() {
  const known = w5pReachableCompos().filter(w5pHasStat)
    .sort((a, b) => a.median - b.median);
  const left = 5 - (w5pState.sel || []).filter(s => s.size).length;
  const pts = w5pPointsSoFar();
  // まだ決めていない鞍は1頭として数えているので「最低」と断る
  const cost = (left ? '最低' : '') + `${pts.toLocaleString()}点・`
    + `${(pts * 100).toLocaleString()}円`;
  const tail = left === 5 ? '鞍を決めるほど狭まります'
    : (left ? `残り${left}鞍を決めると狭まります` : '5鞍そろいました');
  if (!known.length) {
    return '<div class="w5meter"><div class="mh">'
      + '<span class="ml">当たったときの配当</span>'
      + '<span class="mv dim">目安なし</span></div>'
      + `<div class="mf">${cost} ・ この帯の組み合わせは`
      + `過去${w5pData.source.n_rounds}回のうち`
      + `${w5pData.source.min_n_per_plan}回に届きません</div></div>`;
  }
  const lo = known[0], hi = known[known.length - 1];
  const a = w5pMeterPos(lo.median), b = w5pMeterPos(hi.median);
  const val = known.length === 1
    ? `${w5pYen(lo.median)}`
    : `${w5pYen(lo.median)} 〜 ${w5pYen(hi.median)}`;
  const note = known.length === 1
    ? `4回に1回は ${w5pYen(lo.q1)} を下回り、4回に1回は ${w5pYen(lo.q3)} を超えます`
    : `${tail} ・ 帯の組み合わせ ${known.length}通り`;
  return '<div class="w5meter"><div class="mh">'
    + '<span class="ml">当たったときの配当</span>'
    + `<span class="mv">${val}</span></div>`
    + `<div class="mbar"><i style="left:${a}%;width:${Math.max(1.5, b - a)}%"></i></div>`
    + `<div class="mf">${cost} ・ ${note}</div></div>`;
}

// 鞍の行き来。選んだ頭数が見えるので、戻る先を探さずに押せる
function w5pLegNav(day) {
  return '<div class="w5nav">' + day.legs.map((lg, i) => {
    const n = w5pState.sel[i].size;
    return `<button class="w5navb${i === w5pState.leg ? ' on' : ''}${n ? ' done' : ''}"`
      + ` data-w5pgoleg="${i}"><span class="l">WIN${lg.leg}</span>`
      + `<span class="n">${n ? n + '頭' : '—'}</span></button>`;
  }).join('') + '</div>';
}

// 1鞍ずつ選ぶ（2026-08-26・ユーザー指示で5鞍まとめ表示から変更）
function w5pPickScreen() {
  const day = w5pCurrentDay();
  if (!day) {
    return w5pProg('馬を選ぶ', '対象レース未取得', 2, 7)
      + w5pDayTabs()
      + '<div class="w5p-res"><div class="rf">'
      + '対象レースの記録がまだありません（金曜の取得後に出ます）。'
      + 'この入り口は今週の5鞍が決まってから使えます。</div></div>'
      + '<div class="w5pagain"><button class="ak-btn ghost" id="w5pagain">はじめから</button></div>';
  }
  const i = Math.max(0, Math.min(day.legs.length - 1, w5pState.leg));
  const lg = day.legs[i];
  const n = w5pState.sel[i].size;
  const last = i >= day.legs.length - 1;
  // 出馬表が無い鞍（新馬・障害・2歳未勝利）は選べないので、そこで止めない
  const empty = !(lg.horses || []).length;
  const done = (w5pState.sel || []).filter(s => s.size).length;

  let h = w5pProg(`WIN${lg.leg} の馬を選ぶ`, `決めた鞍 <b>${done}</b>/5`, i + 2, 7);
  h += w5pDayTabs();
  h += w5pLegNav(day);
  h += '<div class="ak-card"><div class="ak-q"><div class="qhead">'
    + `<span class="q" style="font-size:14px">`
    + `${escapeHtml(lg.track || '')}${lg.race_number || ''}R `
    + `${escapeHtml(lg.race_name || '')}</span>`
    + `<span class="qcount${n ? ' on' : ''}"><span class="cn">${n}</span>`
    + '<span class="cs">頭</span></span></div>'
    + '</div><div class="ak-hlist">';
  if (!(lg.horses || []).length) {
    h += '<div class="none" style="padding:10px 13px;font-size:12px">'
      + 'この鞍の出馬表がまだありません（新馬・障害・2歳未勝利は予想の対象外です）。</div>';
  } else {
    h += lg.horses.map(x => w5pHorseRow(lg, i, x)).join('');
  }
  h += '</div></div>';

  // ものさしと送りの button は画面の下に貼り付ける。馬を押すたびに額が動くのを見せるため
  h += '<div class="w5stick">' + w5pMeterHtml()
    + '<div class="w5btns">'
    + `<button class="ak-mini" id="w5pprev">${i ? `WIN${day.legs[i - 1].leg}へ戻る` : '入り口に戻る'}</button>`
    + `<button class="ak-btn" id="w5pnext"${n || empty ? '' : ' disabled'}>`
    + (n || empty ? (last ? '配当を見る' : `WIN${day.legs[i + 1].leg}へ`) : '1頭以上えらぶ')
    + '</button></div></div>';
  return h;
}

// 選んだ馬から、当たり得る帯構成を全部出す。
// 重みは「その構成になる馬の組み合わせが何通りあるか」。勝つ見込みは**使わない**
// （この道具は当たりやすさを見ない、という立場を順算側でも崩さないため）
let w5pPer = null;      // 鞍ごと・帯ごとに選んだ馬（開いた行の中身を作るのに使い回す）

function w5pCompositions() {
  const day = w5pCurrentDay();
  // 鞍ごと・帯ごとに、選んだ馬をオッズの安い順で持つ
  const per = day.legs.map((lg, i) => {
    const by = { L: [], M: [], H: [] };
    (lg.horses || []).forEach(h => {
      if (w5pState.sel[i].has(h.number)) by[w5pBandOf(h.odds)].push(h);
    });
    W5P_ORDER.forEach(k => by[k].sort((a, b) => a.odds - b.odds));
    return by;
  });
  w5pPer = per;
  // 帯の当て方（5鞍ぶん）を全部作る。最大でも 3^5 = 243通りしかない
  let acc = [{ band: [], ways: 1 }];
  per.forEach(by => {
    const next = [];
    acc.forEach(a => {
      W5P_ORDER.forEach(k => {
        if (!by[k].length) return;
        next.push({ band: a.band.concat([k]), ways: a.ways * by[k].length });
      });
    });
    acc = next;
  });
  const by = {};
  acc.forEach(a => {
    const counts = { L: 0, M: 0, H: 0 };
    a.band.forEach(k => { counts[k] += 1; });
    const key = W5P_ORDER.filter(k => counts[k]).map(k => k + counts[k]).join('');
    if (!by[key]) by[key] = { compo: key, counts: counts, ways: 0, assigns: [] };
    by[key].ways += a.ways;
    by[key].assigns.push(a);
  });
  const stat = {};
  (w5pData.compositions || []).forEach(c => { stat[c.compo] = c; });
  return Object.values(by).map(x => {
    // 代表の1本は「一番通り数の多い当て方で、各鞍のオッズが一番安い馬」
    const top = x.assigns.slice().sort((a, b) => b.ways - a.ways)[0];
    const sample = top ? top.band.map((k, i) => per[i][k][0]) : [];
    return Object.assign({}, x, stat[x.compo] || { n: 0 }, { sample: sample });
  }).sort((a, b) => b.ways - a.ways);
}

// ある帯構成にぶら下がる馬の組み合わせを、上限まで作る。
// 全部作ると数十万通りになりうるので、画面に出すぶんだけで打ち切る
const W5P_COMBO_MAX = 61;   // 代理指標（画面が長くなりすぎない件数）。先頭は行に出している1本なので
                            // 画面に増えるのは60本。目的は「他の通りを実際に見られること」

function w5pCombosOf(row) {
  const out = [];
  const assigns = row.assigns.slice().sort((a, b) => b.ways - a.ways);
  for (const asg of assigns) {
    const lists = asg.band.map((k, i) => w5pPer[i][k]);
    const idx = [0, 0, 0, 0, 0];
    for (;;) {
      out.push(idx.map((v, i) => lists[i][v]));
      if (out.length >= W5P_COMBO_MAX) return out;
      let i = lists.length - 1;
      while (i >= 0) {
        idx[i] += 1;
        if (idx[i] < lists[i].length) break;
        idx[i] = 0; i -= 1;
      }
      if (i < 0) break;
    }
  }
  return out;
}

function w5pComboRow(hs, cls) {
  return `<div class="w5combo${cls || ''}">`
    + hs.map((x, i) => (i ? '<span class="ar">→</span>' : '')
      + `<span class="unum">${umaBox(x.number, x.gate, 'sm')}`
      + `<span class="od${oddsHotClass(x.odds)}">${x.odds.toFixed(1)}</span></span>`).join('')
    + '</div>';
}

function w5pMarksResult() {
  // 出馬表の無い鞍を飛ばしてここまで来た場合。5鞍そろわないと帯の組み合わせが作れない
  const cur = w5pCurrentDay();
  const miss = (cur ? cur.legs : [])
    .filter((lg, i) => !w5pState.sel[i].size).map(lg => 'WIN' + lg.leg);
  if (miss.length) {
    return w5pProg('答え', '5鞍そろっていません', 7, 7)
      + `<div class="w5p-res"><div class="rf">${miss.join('・')} の馬が決まっていないので`
      + '、配当の目安が出せません（この鞍の出馬表がまだ出ていません）。</div></div>'
      + '<div class="w5pagain"><button class="ak-btn ghost" id="w5pedit">馬を選び直す</button> '
      + '<button class="ak-btn ghost" id="w5pagain">はじめから</button></div>';
  }
  const rows = w5pCompositions();
  const pts = w5pPoints();
  const known = rows.filter(r => r.n >= w5pData.source.min_n_per_plan && r.median != null);
  const wSum = rows.reduce((a, r) => a + r.ways, 0);
  const maxWays = rows.reduce((a, r) => Math.max(a, r.ways), 1);
  let h = w5pProg('答え', `${pts.toLocaleString()}点・${(pts * 100).toLocaleString()}円`, 7, 7);

  if (known.length) {
    const meds = known.map(r => r.median).sort((a, b) => a - b);
    const top = known[0];
    h += '<div class="w5hero">'
      + '<div class="lb">当たり方が一番多いのは</div>'
      + `<div class="big">${w5pYen(top.median)}</div>`
      + `<div class="sub">4回に1回は ${w5pYen(top.q1)} を下回り、`
      + `4回に1回は ${w5pYen(top.q3)} を超えます</div>`
      + `<div class="rng"><span>${w5pYen(meds[0])}</span>`
      + '<i></i>'
      + `<span>${w5pYen(meds[meds.length - 1])}</span></div>`
      + '</div>';
  }

  // 金額の安い順に並べる。通り数の多い順だと金額が飛んで読めない
  // 件数が足りず目安を出さない組み合わせは、金額を持っていても末尾に置く
  const key = r => (r.n >= w5pData.source.min_n_per_plan && r.median != null)
    ? r.median : Infinity;
  const sorted = rows.slice().sort((a, b) => key(a) - key(b) || b.ways - a.ways);
  h += '<div class="w5cmbs">';
  sorted.forEach(r => {
    const ok = r.n >= w5pData.source.min_n_per_plan && r.median != null;
    const isTop = r.ways === maxWays;
    const open_ = w5pState.openCompo === r.compo;
    h += `<div class="w5cmb${isTop ? ' top' : ''}">`
      + '<div class="l1">'
      + `<span class="pay">${ok ? w5pYen(r.median) : '—'}</span>`
      + '<span class="w">'
      + `<i style="width:${Math.round(r.ways / maxWays * 100)}%"></i>`
      + `</span><span class="wn">${r.ways.toLocaleString()}<small>/${wSum.toLocaleString()}</small></span>`
      + '</div>'
      + w5pComboRow(r.sample, ' l2')
      + '<div class="etc">'
      + (r.ways > 1
        ? `<button class="lnk" data-w5popen="${r.compo}">`
          + (open_ ? '閉じる' : `ほか${(r.ways - 1).toLocaleString()}通りを見る`)
          + '</button>'
        : '')
      + `<span class="n">${ok ? `過去${r.n}回` : `過去${r.n}回・目安なし`}</span></div>`;
    if (open_) {
      // 先頭は行にすでに出している1本なので、開いた側では出さない（「ほかN通り」と数を合わせる）
      const combos = w5pCombosOf(r).slice(1);
      h += '<div class="w5combos">'
        + combos.map(c => w5pComboRow(c)).join('')
        + (r.ways - 1 > combos.length
          ? `<div class="cut">この先 ${(r.ways - 1 - combos.length).toLocaleString()}通りは出していません</div>`
          : '')
        + '</div>';
    }
    h += '</div>';
  });
  h += '</div>';

  h += '<div class="w5pagain">'
    + '<button class="ak-btn ghost" id="w5pedit">馬を選び直す</button> '
    + '<button class="ak-btn ghost" id="w5pagain">はじめから</button></div>';
  return h;
}

// データが無ければ節ごと出さない（画面は止めない・122-specの縮退と同じ方針）
async function renderPayoutAkinator(el, days) {
  w5pDays = days || [];
  try {
    w5pData = await getData('data/win5_payout.json');
  } catch (e) {
    return;
  }
  if (!w5pData || !(w5pData.buckets || []).length) return;
  const sec = document.createElement('div');
  sec.className = 'w5p';
  sec.innerHTML = '<h1 class="w5ph">WIN5 配当</h1>'
    + '<div class="ak-wrap" id="w5p-app"></div>';
  el.appendChild(sec);
  w5pAllocSelfTest();   // 画面側とPython側の割り振りがずれたらコンソールに出す（画面は止めない）
  w5pRender();
}

render();
