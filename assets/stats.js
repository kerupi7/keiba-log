// 通算成績ページ描画
(function () {

function renderHero(stats) {
  const roi = stats.roi.total;
  const numClass = roi.roi >= 0 ? 'pos' : 'neg';
  return `
    <div class="eyebrow">通算回収率</div>
    <div class="roi">
      <div class="lab">回収率</div>
      <div class="num ${numClass}" style="font-size:46px">${fmtSignedPercent(roi.roi, 1)}</div>
      <div class="sub">払戻 ${fmtYen(roi.return)} ／ 投資 ${fmtYen(roi.cost)}</div>
      <div class="mini">
        <div><div class="k">対象レース</div><div class="v">${stats.n_final}</div></div>
        <div><div class="k">的中</div><div class="v">${roi.hits} / ${roi.bets}点</div></div>
        <div><div class="k">的中率</div><div class="v">${fmtPercent(roi.hits / Math.max(roi.bets, 1), 1)}</div></div>
      </div>
    </div>
  `;
}

const TICKET_ORDER = ['単勝', '複勝', 'ワイド', '馬連', '馬単', '三連複', '三連単', '枠連'];

function renderByType(byType) {
  const keys = Object.keys(byType || {});
  const ordered = TICKET_ORDER.filter((k) => keys.includes(k)).concat(keys.filter((k) => !TICKET_ORDER.includes(k)));
  const rows = ordered.map((type) => {
    const v = byType[type];
    const cls = v.roi >= 0 ? 'value-pos' : 'value-neg';
    return `<tr><td class="l">${escapeHtml(type)}</td><td>${v.bets}</td><td>${v.hits}</td><td class="sep ${cls}">${fmtSignedPercent(v.roi, 1)}</td></tr>`;
  }).join('');
  return `
    <div class="eyebrow">券種別ROI</div>
    <table>
      <thead><tr><th class="l">券種</th><th>点数</th><th>的中</th><th class="sep">回収率</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function fmtKpiValue(key, value) {
  if (value === null || value === undefined) return '—';
  return key.includes('roi') ? fmtSignedPercent(value, 1) : fmtPercent(value, 0);
}

function renderKpi(thresholds) {
  const rows = (thresholds || []).map((t) => {
    let statusHtml;
    if (t.status === 'ok') statusHtml = '<span class="chip ok">達成</span>';
    else if (t.status === 'warn') statusHtml = '<span class="chip ng">未達</span>';
    else statusHtml = `<span class="chip acc">蓄積中 ${t.n}/${t.min_races}</span>`;
    return `<tr><td class="l">${escapeHtml(t.label)}</td><td>${fmtKpiValue(t.key, t.value)}</td><td>${fmtKpiValue(t.key, t.min)}</td><td class="l sep">${statusHtml}</td></tr>`;
  }).join('');
  return `
    <div class="eyebrow">KPI（基準との対比）</div>
    <table>
      <thead><tr><th class="l">指標</th><th>実績</th><th>基準</th><th class="l sep">状態</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderMarks(marks) {
  const honmei = marks.honmei;
  const landmine = marks.landmine;
  const rows = [
    `<tr><td class="l mkcol" style="color:var(--mk-hon)">◎ 本命</td><td>${fmtPercent(honmei.top3_rate, 0)}</td><td>${fmtPercent(honmei.win / Math.max(honmei.n, 1), 0)}</td><td class="sep">${fmtNum(honmei.avg_finish, 1)}</td></tr>`,
    `<tr><td class="l mkcol" style="color:var(--live)">地雷</td><td style="color:var(--cap)">圏外率</td><td colspan="2" class="l sep"><b>${fmtPercent(landmine.out_rate, 0)}</b>（過剰人気を回避できた割合）</td></tr>`,
  ].join('');
  return `
    <div class="eyebrow">印の精度</div>
    <table>
      <thead><tr><th class="l">印</th><th>3着内率</th><th>勝率</th><th class="sep">平均着順</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderPace(pace) {
  return `
    <div class="eyebrow">ペース予想の的中</div>
    <div class="pace-line"><b>${fmtPercent(pace.rate, 0)}</b><span>（${pace.correct} / ${pace.n}レースで予想どおり）</span></div>
  `;
}

function renderCalibration(stats) {
  if (stats.n_final < 30 || !(stats.calibration && stats.calibration.length > 0)) return '';
  const rows = stats.calibration.map((c) => {
    const actPct = Math.min(100, c.actual * 100);
    const predPct = Math.min(100, c.pred_avg * 100);
    return `
      <div class="row">
        <span class="band">${escapeHtml(c.bucket)}</span>
        <div class="track"><div class="act" style="width:${actPct.toFixed(1)}%"></div><div class="pred" style="left:${predPct.toFixed(1)}%"></div></div>
        <span class="val">実 ${fmtPercent(c.actual, 1)}</span>
      </div>
    `;
  }).join('');
  return `
    <div class="eyebrow">確率の校正 <span class="note">予測勝率帯 → 実際の勝率</span></div>
    <div class="cal">${rows}</div>
    <div class="scrollnote">帯＝予測した勝率の範囲／バー＝実際の勝率／縦線＝予測の中心。近いほど予測が正確</div>
  `;
}

function renderFoot(nFinal) {
  const alert = nFinal < 30
    ? `<div class="alert">⚠ 蓄積 ${nFinal}レース。30レース未満の指標は参考値です。</div>`
    : '';
  return `
    ${alert}
    <div class="foot">馬券の購入は自己責任です。本サイトは予想の的中を保証しません。<br>
      30レース未満の期間は各指標に「蓄積中 n/基準」を表示し、参考値として扱います。</div>
  `;
}

function renderStatsPage(stats) {
  document.getElementById('stats-content').innerHTML = `
    ${renderHero(stats)}
    ${renderByType(stats.roi.by_type)}
    ${renderKpi(stats.thresholds)}
    ${renderMarks(stats.marks)}
    ${renderPace(stats.pace)}
    ${renderCalibration(stats)}
    ${renderFoot(stats.n_final)}
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

})();
