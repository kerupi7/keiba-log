// 通算成績ページ描画

function renderStatsPage(stats) {
  const roi = stats.roi.total;
  const roiClass = roi.roi >= 0 ? 'positive' : 'negative';

  const byTypeRows = Object.entries(stats.roi.by_type || {})
    .map(([type, v]) => `
      <tr>
        <td class="text-left">${escapeHtml(type)}</td>
        <td>${v.bets}</td>
        <td>${v.hits}</td>
        <td class="${v.roi >= 0 ? 'value-pos' : 'value-neg'}">${fmtSignedPercent(v.roi, 1)}</td>
      </tr>
    `)
    .join('');

  const thresholdRows = (stats.thresholds || [])
    .map((t) => {
      const status = t.status === 'insufficient'
        ? `蓄積中 ${t.n}/${t.min_races}`
        : t.status === 'ok' ? '✅' : '⚠';
      return `
        <tr>
          <td class="text-left">${escapeHtml(t.label)}</td>
          <td>${fmtSignedPercent(t.value, 1)}</td>
          <td>${fmtSignedPercent(t.min, 1)}</td>
          <td>${status}</td>
        </tr>
      `;
    })
    .join('');

  const calibrationBlock = (stats.calibration && stats.calibration.length > 0)
    ? `
      <section>
        <h2>確率の校正（予測帯→実勝率）</h2>
        <div class="card">
          <table>
            <thead><tr><th class="text-left">予測帯</th><th>n</th><th>実勝率</th></tr></thead>
            <tbody>
              ${stats.calibration.map((c) => `<tr><td class="text-left">${escapeHtml(c.bucket)}</td><td>${c.n}</td><td>${fmtPercent(c.actual, 1)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `
    : '';

  const lowN = stats.n_final < 30
    ? `<div class="alert">⚠ 蓄積 ${stats.n_final}レース。30レース未満の指標は参考値です。</div>`
    : '';

  document.getElementById('stats-content').innerHTML = `
    <section>
      <h2>回収率</h2>
      <div class="card">
        <div class="stat-roi ${roiClass}">${fmtSignedPercent(roi.roi, 1)}</div>
        <div class="stat-sub">${fmtYen(roi.return)} / ${fmtYen(roi.cost)}</div>
      </div>
    </section>
    <section>
      <h2>券種別ROI</h2>
      <div class="card">
        <table>
          <thead><tr><th class="text-left">券種</th><th>点数</th><th>的中</th><th>回収率</th></tr></thead>
          <tbody>${byTypeRows}</tbody>
        </table>
      </div>
    </section>
    <section>
      <h2>KPI（thresholds対比）</h2>
      <div class="card">
        <table>
          <thead><tr><th class="text-left">指標</th><th>実績</th><th>基準</th><th>状態</th></tr></thead>
          <tbody>${thresholdRows}</tbody>
        </table>
      </div>
    </section>
    <section>
      <h2>印の精度</h2>
      <div class="card">
        <div>◎: 3着内${fmtPercent(stats.marks.honmei.top3_rate, 0)} 勝率${fmtPercent(stats.marks.honmei.win / Math.max(stats.marks.honmei.n, 1), 0)} 平均${fmtNum(stats.marks.honmei.avg_finish, 1)}着</div>
        <div>地雷: 圏外率${fmtPercent(stats.marks.landmine.out_rate, 0)}</div>
      </div>
    </section>
    <section>
      <h2>ペース予想</h2>
      <div class="card">${fmtPercent(stats.pace.rate, 0)} (${stats.pace.correct}/${stats.pace.n})</div>
    </section>
    ${calibrationBlock}
    ${lowN}
  `;
}

async function main() {
  renderHeader('stats');
  try {
    const manifest = await getData('data/manifest.json');
    if (!manifest.stats || manifest.stats.n_final === 0) {
      document.getElementById('stats-content').innerHTML = '<div class="empty-state">まだ確定したレースがありません</div>';
      return;
    }
    renderStatsPage(manifest.stats);
  } catch (e) {
    document.getElementById('stats-content').innerHTML =
      `<div class="error-box">データの読み込みに失敗しました: ${escapeHtml(e.message)}</div>`;
  }
}

main();
