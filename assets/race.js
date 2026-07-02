// レース詳細描画

function getQueryId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

function renderError(message) {
  document.getElementById('race-content').innerHTML =
    `<div class="error-box">${escapeHtml(message)}</div>`;
}

function markLabel(mark) {
  if (!mark) return '';
  return `<span class="mark">${escapeHtml(mark)}</span>`;
}

function renderHeaderBlock(site) {
  const r = site.race;
  const statusLabel = {
    prediction: '🔵発走前',
    final: '⚫結果確定',
    cancelled: '⚪中止',
  }[site.status] || site.status;

  let banner = '';
  if (site.status === 'cancelled') {
    banner = '<div class="alert">このレースは中止になりました</div>';
  }

  return `
    <div class="race-header">
      <div class="status-line">
        <span class="title" style="font-size:1.2rem">${escapeHtml(r.race_name)}${r.grade ? ' ' + escapeHtml(r.grade) : ''}</span>
        <span style="float:right">${statusLabel}</span>
      </div>
      <div class="meta">${r.date} ${escapeHtml(r.track)}${r.race_number}R ${escapeHtml(r.surface)}${r.distance}m${r.direction ? '(' + escapeHtml(r.direction) + ')' : ''}</div>
      <div class="meta">${r.going ? escapeHtml(r.going) + '・' : ''}${r.field_size}頭${r.weight_rule ? '・' + escapeHtml(r.weight_rule) : ''}${r.post_time ? '・発走' + r.post_time : ''}</div>
      <div class="meta">予想: ${site.prediction.predicted_at.replace('T', ' ')}（${escapeHtml(site.prediction.odds_basis)}）</div>
      ${banner}
    </div>
  `;
}

function renderConclusionCard(site) {
  const p = site.prediction;
  if (p.stance === 'pass') {
    return `
      <section>
        <div class="card conclusion-card">
          <p>◻ 今回は見送りレースです。</p>
          <p>${escapeHtml(p.conclusion)}</p>
        </div>
      </section>
    `;
  }
  const abilityMarks = site.horses
    .filter((h) => h.ability_mark)
    .sort((a, b) => '◎○▲△'.indexOf(a.ability_mark) - '◎○▲△'.indexOf(b.ability_mark))
    .map((h) => `${markLabel(h.ability_mark)}${h.number}${escapeHtml(h.name)}`)
    .join(' ');
  const betMarkOrder = ['★', '◎', '○', '▲', '△', '☆'];
  const betMarks = site.horses
    .filter((h) => h.bet_mark && h.bet_mark !== '地雷')
    .sort((a, b) => betMarkOrder.indexOf(a.bet_mark) - betMarkOrder.indexOf(b.bet_mark))
    .map((h) => `${markLabel(h.bet_mark)}${h.number}`)
    .join(' ');
  const landmines = site.horses
    .filter((h) => h.bet_mark === '地雷')
    .map((h) => h.number)
    .join(', ');

  return `
    <section>
      <div class="card conclusion-card">
        <p>${escapeHtml(p.conclusion)}</p>
        <div class="marks-line">展開: ${escapeHtml(p.pace)}・${escapeHtml(p.bias || '—')}</div>
        <div class="marks-line">${abilityMarks}</div>
        <div class="marks-line">買い: ${betMarks}</div>
        ${landmines ? `<div class="marks-line">地雷: ${escapeHtml(landmines)}</div>` : ''}
      </div>
    </section>
  `;
}

function renderBetsSection(site) {
  if (!site.bets || site.bets.length === 0) {
    return `<section><h2>買い目</h2><div class="card">見送り（買い目なし）</div></section>`;
  }
  const showResult = site.status === 'final';
  let rows = '';
  for (const b of site.bets) {
    const resultCell = showResult
      ? `<td>${b.hit ? '✅' : '❌'}</td><td>${fmtYen(b.payout)}</td>`
      : '';
    rows += `
      <tr>
        <td class="text-left">${escapeHtml(b.type)}</td>
        <td class="text-left">${b.combination.join('-')}</td>
        <td>${b.buy_line !== null ? b.buy_line.toFixed(1) + '倍〜' : '—'}</td>
        ${resultCell}
      </tr>
    `;
  }
  const header = showResult
    ? '<tr><th class="text-left">券種</th><th class="text-left">買い目</th><th>ライン</th><th>結果</th><th>払戻</th></tr>'
    : '<tr><th class="text-left">券種</th><th class="text-left">買い目</th><th>ライン</th></tr>';

  let totalLine = '';
  if (showResult && site.verification) {
    const v = site.verification;
    const icon = v.bets_hit ? '✅' : '❌';
    totalLine = `<div class="bets-total">合計: ${v.bets_cost / 100}点 ${fmtYen(v.bets_cost)} → 払戻${fmtYen(v.bets_return)} ${icon}</div>`;
  }

  return `
    <section>
      <h2>買い目</h2>
      <div class="card">
        <table><thead>${header}</thead><tbody>${rows}</tbody></table>
        ${totalLine}
      </div>
    </section>
  `;
}

function renderVerificationSection(site) {
  if (site.status !== 'final') {
    return `<section><h2>答え合わせ</h2><div class="card">結果はレース後に反映されます</div></section>`;
  }
  const result = site.result;
  const verification = site.verification;
  if (!result || !verification) return '';

  const byNumber = {};
  for (const h of site.horses) byNumber[h.number] = h;

  let topRows = '';
  for (const t of result.top3) {
    const h = byNumber[t.number];
    let markNote = '';
    if (h) {
      if (h.bet_mark === '地雷') {
        markNote = ` ←地雷判定${t.finish <= 3 ? '⚠' : '❌'}`;
      } else if (h.ability_mark || (h.bet_mark && h.bet_mark !== '地雷')) {
        markNote = ` ←${escapeHtml(h.ability_mark || '')}${escapeHtml(h.bet_mark || '')}✅`;
      }
    }
    topRows += `<div>${t.finish}着 ${t.number} ${escapeHtml(t.name)}(${t.popularity}人気)${markNote}</div>`;
  }

  const paceMatchIcon = verification.pace_match === true ? '✅' : verification.pace_match === false ? '❌' : '—';
  const markFinishLine = Object.entries(verification.mark_finishes || {})
    .map(([k, v]) => `${escapeHtml(k)}=${v}着`)
    .join(' ');

  const payoutRows = Object.entries(result.payouts || {})
    .map(([type, val]) => {
      const list = Array.isArray(val) ? val : [val];
      const line = list
        .map((p) => `${p.combination.join('-')} ${fmtYen(p.payout)}`)
        .join(' / ');
      return `<tr><td class="text-left">${escapeHtml(payoutTypeLabel(type))}</td><td class="text-left">${line}</td></tr>`;
    })
    .join('');

  return `
    <section>
      <h2>答え合わせ</h2>
      <div class="card">
        ${topRows}
        <div style="margin-top:8px">ペース: ${result.pace || '—'}（予想: ${escapeHtml(site.prediction.pace)} ${paceMatchIcon}）</div>
        <div>印の着順: ${markFinishLine}</div>
        <details>
          <summary>払戻表</summary>
          <table><tbody>${payoutRows}</tbody></table>
        </details>
        ${verification.summary ? `<div style="margin-top:8px">総括: ${escapeHtml(verification.summary)}</div>` : ''}
      </div>
    </section>
  `;
}

function payoutTypeLabel(type) {
  const map = {
    tansho: '単勝', fukusho: '複勝', wakuren: '枠連', umaren: '馬連',
    wide: 'ワイド', umatan: '馬単', sanrenpuku: '三連複', sanrentan: '三連単',
  };
  return map[type] || type;
}

function renderAllHorsesTable(site) {
  const rows = [...site.horses]
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    .map((h) => {
      const cls = h.scratched ? ' class="scratched"' : '';
      if (h.scratched) {
        return `<tr${cls}><td>${h.rank ?? '—'}</td><td>${h.number}</td><td class="text-left">${escapeHtml(h.name)}</td><td colspan="4">取消</td></tr>`;
      }
      return `
        <tr${cls}>
          <td>${h.rank ?? '—'}</td>
          <td>${h.number}</td>
          <td class="text-left">${escapeHtml(h.name)}</td>
          <td>${fmtNum(h.total, 1)}</td>
          <td>${h.odds ?? '—'}</td>
          <td>${h.popularity ?? '—'}</td>
          <td>${markLabel(h.ability_mark)}</td>
          <td>${escapeHtml(h.confidence || '—')}</td>
        </tr>
      `;
    })
    .join('');
  return `
    <details>
      <summary>全頭評価表</summary>
      <table>
        <thead><tr><th>順位</th><th>馬番</th><th class="text-left">馬名</th><th>総合</th><th>オッズ</th><th>人気</th><th>印</th><th>信頼度</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </details>
  `;
}

function renderEvTable(site) {
  if (site.prediction.odds_basis === 'オッズ未取得') {
    return `
      <details>
        <summary>勝率・期待値表</summary>
        <p>オッズ未取得のため期待値なし</p>
      </details>
    `;
  }
  const rows = [...site.horses]
    .filter((h) => !h.scratched)
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    .map((h) => {
      const evClass = h.ev === null ? '' : h.ev >= 0 ? 'value-pos' : 'value-neg';
      return `
        <tr>
          <td>${h.rank ?? '—'}</td>
          <td>${h.number}</td>
          <td class="text-left">${escapeHtml(h.name)}</td>
          <td>${fmtPercent(h.estimated_prob, 0)}</td>
          <td>${h.fair_odds ?? '—'}</td>
          <td>${h.odds ?? '—'}</td>
          <td class="${evClass}">${h.ev === null ? '—' : fmtSignedPercent(h.ev, 0)}</td>
        </tr>
      `;
    })
    .join('');
  return `
    <details>
      <summary>勝率・期待値表</summary>
      <table>
        <thead><tr><th>順位</th><th>馬番</th><th class="text-left">馬名</th><th>推定勝率</th><th>適正</th><th>現在</th><th>期待値</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </details>
  `;
}

function renderProseSection(title, md) {
  if (!md) return '';
  return `
    <details>
      <summary>${escapeHtml(title)}</summary>
      <div class="prose">${renderMarkdown(md)}</div>
    </details>
  `;
}

async function main() {
  renderHeader('race');
  const id = getQueryId();
  if (!id || !/^\d{12}$/.test(id)) {
    renderError('不正なレースIDです');
    return;
  }
  let site;
  try {
    site = await getData(`data/races/${id}.json`);
  } catch (e) {
    renderError(`レースデータの読み込みに失敗しました: ${e.message}`);
    return;
  }

  const sections = site.sections || {};
  const html = `
    ${renderHeaderBlock(site)}
    ${renderConclusionCard(site)}
    ${renderBetsSection(site)}
    ${renderVerificationSection(site)}
    <section>
      ${renderAllHorsesTable(site)}
      ${renderEvTable(site)}
      ${renderProseSection('展開・レース分析（全文）', sections.overview_md)}
      ${renderProseSection('個別評価（全文）', sections.horses_md)}
      ${renderProseSection('反証と感度分析（全文）', sections.counter_md)}
    </section>
  `;
  document.getElementById('race-content').innerHTML = html;
}

main();
