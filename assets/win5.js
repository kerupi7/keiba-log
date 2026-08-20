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
    + `<span class="od">${p.odds.toFixed(1)}倍</span></div>`;
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

async function render() {
  renderHeader('win5');
  const el = document.getElementById('win5-content');
  let data;
  try {
    data = await getData('data/win5.json');
  } catch (e) {
    el.innerHTML = '<h1 class="w5h">WIN5予想</h1>'
      + '<p class="w5note">対象レースの記録がまだありません（金曜の取得後に出ます）。</p>';
    return;
  }
  const days = data.days || [];
  el.innerHTML = '<h1 class="w5h">WIN5予想</h1>' + w5GateNote(data.gate)
    + (days.length ? days.map(w5DayHtml).join('')
      : '<p class="w5note">対象レースがありません。</p>');
}

render();
