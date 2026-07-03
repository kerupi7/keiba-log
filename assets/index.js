// トップページ描画
(function () {

const TRACK_ORDER = ['札幌', '函館', '福島', '新潟', '東京', '中山', '中京', '京都', '阪神', '小倉'];

function renderSummary(stats) {
  const el = document.getElementById('summary-section');
  if (!stats || stats.n_final === 0) {
    el.innerHTML = '';
    return;
  }
  const roi = stats.roi.total;
  const numClass = roi.roi >= 0 ? 'pos' : 'neg';
  const accumLine = stats.n_final < 30
    ? `<div class="accum-line">${pillHtml('accum', 'データ蓄積中')}&nbsp; ${stats.n_final} / 30レース ・ 30到達までは参考値</div>`
    : '';

  el.innerHTML = `
    <div class="eyebrow">通算成績</div>
    <div class="roi">
      <div class="lab">回収率</div>
      <div class="num ${numClass}">${fmtSignedPercent(roi.roi, 1)}</div>
      <div class="sub">払戻 ${fmtYen(roi.return)} ／ 投資 ${fmtYen(roi.cost)}</div>
      ${accumLine}
      <div class="mini">
        <div><div class="k">的中</div><div class="v">${roi.hits} / ${roi.bets}点</div></div>
        <div><div class="k">◎3着内率</div><div class="v">${fmtPercent(stats.marks.honmei.top3_rate, 0)}</div></div>
        <div><div class="k">対象レース</div><div class="v">${stats.n_final}</div></div>
      </div>
    </div>
  `;
}

function initStateFromHash(races) {
  const dates = [...new Set(races.map((r) => r.date))].sort();
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  let activeDate = params.get('d');
  if (!activeDate || !dates.includes(activeDate)) activeDate = dates[dates.length - 1];

  const tracksForDate = (d) => {
    const set = new Set(races.filter((r) => r.date === d).map((r) => r.track));
    return TRACK_ORDER.filter((t) => set.has(t)).concat(
      [...set].filter((t) => !TRACK_ORDER.includes(t)).sort()
    );
  };

  let activeTrack = params.get('t');
  const tracks = tracksForDate(activeDate);
  if (!activeTrack || !tracks.includes(activeTrack)) activeTrack = tracks[0];

  return { dates, activeDate, activeTrack, tracksForDate };
}

function updateHash(state) {
  history.replaceState(null, '', `#d=${state.activeDate}&t=${state.activeTrack}`);
}

function renderDateTabs(state, rerender) {
  const el = document.getElementById('datetabs');
  const { dates, activeDate } = state;
  const i = dates.indexOf(activeDate);
  const window_ = dates.length <= 1 ? dates : dates.slice(Math.max(0, i - 1), Math.max(0, i - 1) + 2);

  const prevDisabled = i <= 0;
  const nextDisabled = i >= dates.length - 1;

  let html = `<span class="arw prev ${prevDisabled ? 'disabled' : ''}">‹</span>`;
  for (const d of window_) {
    const { label, dow, dowClass } = fmtDateTab(d);
    const active = d === activeDate ? ' active' : '';
    html += `<div class="dt${active}" data-date="${d}">${label}<span class="${dowClass}">(${dow})</span></div>`;
  }
  html += `<span class="arw next ${nextDisabled ? 'disabled' : ''}">›</span>`;
  el.innerHTML = `<div class="datetabs">${html}</div>`;

  el.querySelector('.arw.prev')?.addEventListener('click', () => {
    if (prevDisabled) return;
    state.activeDate = dates[i - 1];
    const tracks = state.tracksForDate(state.activeDate);
    if (!tracks.includes(state.activeTrack)) state.activeTrack = tracks[0];
    rerender();
  });
  el.querySelector('.arw.next')?.addEventListener('click', () => {
    if (nextDisabled) return;
    state.activeDate = dates[i + 1];
    const tracks = state.tracksForDate(state.activeDate);
    if (!tracks.includes(state.activeTrack)) state.activeTrack = tracks[0];
    rerender();
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

function renderTracks(state, rerender) {
  const el = document.getElementById('tracks');
  const tracks = state.tracksForDate(state.activeDate);
  el.innerHTML = `<div class="tracks">${tracks
    .map((t) => `<span class="trk ${t === state.activeTrack ? 'on' : ''}" data-track="${escapeHtml(t)}">${escapeHtml(t)}</span>`)
    .join('')}</div>`;
  el.querySelectorAll('.trk').forEach((trkEl) => {
    trkEl.addEventListener('click', () => {
      state.activeTrack = trkEl.dataset.track;
      rerender();
    });
  });
}

function renderLegend() {
  document.getElementById('legend').innerHTML = `
    <div class="legend">
      <span><span class="sw" style="background:var(--upcoming)"></span>発走前</span>
      <span><span class="sw" style="background:var(--finished)"></span>終了</span>
      <span><span class="sw" style="background:var(--navy);opacity:.2"></span>左線＝予想済み</span>
    </div>
  `;
}

function renderRaceRow(race) {
  const rnClass = race.status === 'prediction' ? 'up' : 'fin';
  let metaSurface;
  if (race.surface === '芝') {
    metaSurface = `<span class="t">芝${race.distance}m</span>`;
  } else {
    metaSurface = `<span class="d">ダ${race.distance}m</span>`;
  }
  const meta = `${metaSurface} ・ ${race.field_size}頭 ・ ${race.post_time || '—'}`;
  const badge = race.grade ? ` <span class="gbadge">${escapeHtml(race.grade)}</span>` : '';

  let pickHtml = '';
  if (race.status === 'prediction') {
    if (race.stance === 'pass') {
      pickHtml = `<div class="rpick">${pillHtml('pass', '見送り')}</div>`;
    } else {
      const pick = race.pick || {};
      pickHtml = `<div class="rpick">${pillHtml('pre', '発走前')}<span class="pk">◎${pick.honmei_number ?? '—'} ${escapeHtml(pick.honmei_name ?? '')}</span></div>`;
    }
  } else if (race.status === 'final') {
    if (race.stance === 'pass') {
      pickHtml = `<div class="rpick">${pillHtml('pass', '見送り')}</div>`;
    } else {
      const pick = race.pick || {};
      const outcome = race.outcome || {};
      const hit = outcome.bets_hit;
      const net = (outcome.bets_return ?? 0) - (outcome.bets_cost ?? 0);
      pickHtml = `<div class="rpick">${hit ? pillHtml('hit', '的中') : pillHtml('miss', '不的中')}<span class="pk">◎${pick.honmei_number ?? '—'} ${escapeHtml(pick.honmei_name ?? '')}</span><span class="amt ${hit ? 'hit' : 'miss'}">${fmtNet(net)}</span></div>`;
      if (!hit && outcome.winner_number) {
        pickHtml += `<div class="rmeta">勝ち馬: ${outcome.winner_number}番（${outcome.winner_popularity}人気）</div>`;
      }
    }
  } else if (race.status === 'cancelled') {
    pickHtml = `<div class="rpick">${pillHtml('cancel', '中止')}</div>`;
  }

  return `
    <a class="race pred" href="race.html?id=${race.race_id}">
      <div class="rn ${rnClass}">${race.race_number}R</div>
      <div class="rmain">
        <div class="rname">${escapeHtml(race.race_name)}${badge}</div>
        <div class="rmeta">${meta}</div>
        ${pickHtml}
      </div>
    </a>
  `;
}

function renderRaceList(state, races) {
  const el = document.getElementById('races-list');
  const filtered = races
    .filter((r) => r.date === state.activeDate && r.track === state.activeTrack)
    .sort((a, b) => a.race_number - b.race_number);
  el.innerHTML = filtered.map(renderRaceRow).join('');
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
  renderSummary(manifest.stats);
  const races = manifest.races || [];
  if (!races.length) {
    renderEmpty();
    return;
  }
  const state = initStateFromHash(races);
  const rerender = () => {
    renderDateTabs(state, rerender);
    renderTracks(state, rerender);
    renderLegend();
    renderRaceList(state, races);
    updateHash(state);
  };
  rerender();
}

main();

})();
