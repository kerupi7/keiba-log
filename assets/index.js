// トップページ描画

function groupByDate(races) {
  const groups = [];
  let lastDate = null;
  let current = null;
  for (const r of races) {
    if (r.date !== lastDate) {
      current = { date: r.date, races: [] };
      groups.push(current);
      lastDate = r.date;
    }
    current.races.push(r);
  }
  return groups;
}

function renderSummary(stats) {
  const el = document.getElementById('summary-section');
  if (!stats || stats.n_final === 0) {
    el.innerHTML = '';
    return;
  }
  const roi = stats.roi.total;
  const roiClass = roi.roi >= 0 ? 'positive' : 'negative';
  const insufficient = (stats.thresholds || []).filter((t) => t.status === 'insufficient');

  let html = `
    <h2>通算成績（${stats.n_final}レース）</h2>
    <div class="card">
      <div class="stat-roi ${roiClass}">回収率 ${fmtSignedPercent(roi.roi)}</div>
      <div class="stat-sub">${fmtYen(roi.return)} / ${fmtYen(roi.cost)}</div>
      <div class="stat-sub">的中 ${roi.hits}/${roi.bets}点 ・ ◎3着内 ${fmtPercent(stats.marks.honmei.top3_rate, 0)}</div>
    </div>
  `;
  if (insufficient.length > 0) {
    html += `<div class="alert">⚠ データ蓄積中（${stats.n_final}/${insufficient[0].min_races}レース）</div>`;
  }
  el.innerHTML = html;
}

function renderRaceCard(race) {
  const badge = statusBadge(race);
  let statLine = '';

  if (race.status === 'prediction') {
    if (race.stance === 'pass') {
      statLine = badge;
    } else {
      const pick = race.pick || {};
      statLine = `${badge}　発走${race.post_time || '—'}　◎${pick.honmei_number ?? '—'} ${escapeHtml(pick.honmei_name ?? '')}`;
    }
  } else if (race.status === 'final') {
    if (race.stance === 'pass') {
      statLine = badge;
    } else {
      const outcome = race.outcome || {};
      const net = (outcome.bets_return ?? 0) - (outcome.bets_cost ?? 0);
      const sign = net > 0 ? '+' : '';
      statLine = `${badge}　${outcome.bets_hit ? '的中' : '不的中'} ${sign}${net.toLocaleString('ja-JP')}円`;
      if (outcome.winner_number) {
        statLine += `<br>勝ち馬: ${outcome.winner_number}番(${outcome.winner_popularity}人気)`;
      }
    }
  } else if (race.status === 'cancelled') {
    statLine = badge;
  }

  return `
    <a class="card race-card" href="race.html?id=${race.race_id}">
      <div class="title">${escapeHtml(race.track)}${race.race_number}R ${escapeHtml(race.race_name)}${race.grade ? ' ' + escapeHtml(race.grade) : ''}</div>
      <div class="meta">${escapeHtml(race.surface)}${race.distance}・${race.field_size}頭</div>
      <div class="status-line">${statLine}</div>
    </a>
  `;
}

function renderRaces(races) {
  const el = document.getElementById('races-list');
  if (!races || races.length === 0) {
    el.innerHTML = '<div class="empty-state">まだレースがありません</div>';
    return;
  }
  const sorted = [...races].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.track !== b.track) return a.track < b.track ? -1 : 1;
    return a.race_number - b.race_number;
  });
  const groups = groupByDate(sorted);
  let html = '';
  for (const g of groups) {
    const d = new Date(g.date + 'T00:00:00');
    const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    html += `<div class="date-group">▾ ${g.date}（${dow}）</div>`;
    for (const r of g.races) {
      html += renderRaceCard(r);
    }
  }
  el.innerHTML = html;
}

async function main() {
  renderHeader('index');
  try {
    const manifest = await getData('data/manifest.json');
    renderSummary(manifest.stats);
    renderRaces(manifest.races);
  } catch (e) {
    document.getElementById('races-list').innerHTML =
      `<div class="error-box">データの読み込みに失敗しました: ${escapeHtml(e.message)}</div>`;
  }
}

main();
