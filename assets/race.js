// レース詳細描画
(function () {

function getQueryId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

function renderError(message) {
  document.getElementById('race-content').innerHTML =
    `<div class="error-box">${escapeHtml(message)}</div>`;
}

function payoutTypeLabel(type) {
  const map = {
    tansho: '単勝', fukusho: '複勝', wakuren: '枠連', umaren: '馬連',
    wide: 'ワイド', umatan: '馬単', sanrenpuku: '三連複', sanrentan: '三連単',
  };
  return map[type] || type;
}

// ===== 4.1 ヘッダブロック =====
function renderHeaderBlock(site) {
  const r = site.race;
  const p = site.prediction;
  const pillMap = {
    prediction: pillHtml('pre', '発走前'),
    final: pillHtml('miss', '結果確定'),
    cancelled: pillHtml('cancel', '中止'),
  };
  const pill = pillMap[site.status] || '';
  const grade = r.grade ? `<span class="grade">${escapeHtml(r.grade)}</span>` : '';

  const meta1Parts = [`${r.surface}${r.distance}m${r.direction ? '(' + escapeHtml(r.direction) + ')' : ''}`];
  if (r.going) meta1Parts.push(escapeHtml(r.going));
  meta1Parts.push(`${r.field_size}頭`);
  if (r.weight_rule) meta1Parts.push(escapeHtml(r.weight_rule));
  if (r.post_time) meta1Parts.push(`発走${r.post_time}`);
  const meta1 = `${r.date} ${escapeHtml(r.track)}${r.race_number}R ／ ${meta1Parts.join('・')}`;

  const oddsBasisNote = p.odds_basis === 'オッズ未取得' ? '（オッズ未取得）' : `（${escapeHtml(p.odds_basis)}基準）`;
  const meta2 = `予想 ${fmtDateTimeShort(p.predicted_at)}${oddsBasisNote}`;

  return `
    <div class="dtitle">${escapeHtml(r.race_name)}${grade} ${pill}</div>
    <div class="dmeta">${meta1}
      <div class="row2">${meta2}</div>
    </div>
  `;
}

// ===== 4.2 結論カード =====
function renderConclusionCard(site) {
  const p = site.prediction;
  if (p.stance === 'pass') {
    const abilityMarks = site.horses.filter((h) => h.ability_mark);
    const betMarks = site.horses.filter((h) => h.bet_mark);
    return `
      <div class="concl">
        <div class="h">結論</div>
        <p>今回は見送りレースです。</p>
        <p>${escapeHtml(p.conclusion)}</p>
        ${abilityMarks.length || betMarks.length ? renderMarksBlock(site) : ''}
      </div>
    `;
  }
  return `
    <div class="concl">
      <div class="h">結論</div>
      <p>${escapeHtml(p.conclusion)}</p>
      <div class="kv">展開: ${escapeHtml(p.pace)} ・ ${escapeHtml(p.bias ?? '—')}</div>
      ${renderMarksBlock(site)}
    </div>
  `;
}

function renderMarksBlock(site) {
  const order = ['◎', '○', '▲', '△'];
  const abilityHorses = site.horses
    .filter((h) => h.ability_mark)
    .sort((a, b) => order.indexOf(a.ability_mark) - order.indexOf(b.ability_mark));
  const nonOku = abilityHorses.filter((h) => h.ability_mark !== '△');
  const oku = abilityHorses.filter((h) => h.ability_mark === '△');
  const marksRows = nonOku
    .map((h) => `<div class="marks-row">${markBadge(h.ability_mark)}${h.number} ${escapeHtml(h.name)}</div>`);
  if (oku.length) {
    const okuLine = `${markBadge('△')}${oku.map((h) => h.number).join('・')}`;
    marksRows.push(`<div class="marks-row">${okuLine}</div>`);
  }
  const marksHtml = marksRows.length ? `<div class="marks">${marksRows.join('')}</div>` : '';

  const v11 = site.schema_version === 'keiba-log-1.1';
  if (v11) {
    // mark-2.0: 買いラインは role（軸/相手/穴）から構成する（原因D）
    const axis = site.horses.filter((h) => h.role === '軸');
    const aite = site.horses.filter((h) => h.role === '相手');
    const ana = site.horses.filter((h) => h.role === '穴');
    let buyLine = '';
    if (axis.length || aite.length || ana.length) {
      const axisTxt = axis.map((h) => h.number).join('・');
      const restParts = [
        aite.length ? `相手${aite.map((h) => h.number).join('・')}` : '',
        ana.length ? `穴${ana.map((h) => h.number).join('・')}` : '',
      ].filter(Boolean).join(' ／ ');
      buyLine = `<div class="buyline"><span class="lead">買い</span>軸${axisTxt}${restParts ? ' → ' + restParts : ''}</div>`;
    }

    const landmines = site.horses.filter((h) => h.bet_mark === '地雷').map((h) => h.number);
    const landmineLine = landmines.length
      ? `<div class="buyline"><span class="lead">地雷</span><span class="mine">${landmines.join(', ')}</span></div>`
      : '';

    // ひとことリスト（能力印馬＋役割馬＋地雷馬。原因H）
    const roleOrder = { '軸': 0, '相手': 1, '穴': 2 };
    const verdictHorses = site.horses
      .filter((h) => h.ability_mark || h.role || h.bet_mark === '地雷')
      .sort((a, b) => {
        const ma = order.indexOf(a.ability_mark) === -1 ? 9 : order.indexOf(a.ability_mark);
        const mb = order.indexOf(b.ability_mark) === -1 ? 9 : order.indexOf(b.ability_mark);
        if (ma !== mb) return ma - mb;
        const ra = a.role in roleOrder ? roleOrder[a.role] : 9;
        const rb = b.role in roleOrder ? roleOrder[b.role] : 9;
        if (ra !== rb) return ra - rb;
        return (a.rank ?? 999) - (b.rank ?? 999);
      });
    const verdictLines = verdictHorses.map((h) => {
      const badge = h.ability_mark
        ? markBadge(h.ability_mark)
        : (h.role ? roleChip(h.role) : (h.bet_mark === '地雷' ? mineChip() : ''));
      return `<div class="verdict-line">${badge}${h.number} ${escapeHtml(h.name)} — ${escapeHtml(h.verdict || '—')}</div>`;
    }).join('');
    const verdictBlock = verdictLines ? `<div class="verdicts">${verdictLines}</div>` : '';

    return `${marksHtml}${buyLine}${landmineLine}${verdictBlock}`;
  }

  const betMarkOrder = ['★', '◎', '○', '▲', '△', '☆'];
  const betHorses = site.horses
    .filter((h) => h.bet_mark && h.bet_mark !== '地雷')
    .sort((a, b) => betMarkOrder.indexOf(a.bet_mark) - betMarkOrder.indexOf(b.bet_mark));
  let buyLine = '';
  if (betHorses.length) {
    const star = betHorses.find((h) => h.bet_mark === '★');
    if (star) {
      const rest = betHorses.filter((h) => h !== star)
        .map((h) => `${escapeHtml(h.bet_mark)}${h.number}`)
        .join(' ／ ');
      buyLine = `<div class="buyline"><span class="lead">買い</span><span class="star">★</span>${star.number} → ${rest}</div>`;
    } else {
      const line = betHorses.map((h) => `${escapeHtml(h.bet_mark)}${h.number}`).join(' ');
      buyLine = `<div class="buyline"><span class="lead">買い</span>${line}</div>`;
    }
  }

  const landmines = site.horses.filter((h) => h.bet_mark === '地雷').map((h) => h.number);
  const landmineLine = landmines.length
    ? `<div class="buyline"><span class="lead">地雷</span><span class="mine">${landmines.join(', ')}</span></div>`
    : '';

  return `${marksHtml}${buyLine}${landmineLine}`;
}

// ===== 4.3 買い目 =====
function renderBetsSectionV11(site) {
  const bets = site.bets || [];
  if (!bets.length) {
    return `<div class="eyebrow">買い目</div><div>見送り（買い目なし）</div>`;
  }
  const totalPoints = bets.reduce((sum, b) => sum + b.tickets.length, 0);
  const totalCost = bets.reduce((sum, b) => sum + (b.stake ?? b.tickets.length * 100), 0);
  const showResult = site.status === 'final';
  const header = showResult
    ? '<tr><th class="l">券種</th><th>買い目</th><th>金額</th><th class="l">狙い</th><th>結果</th><th>払戻</th></tr>'
    : '<tr><th class="l">券種</th><th>買い目</th><th>金額</th><th class="l">狙い</th></tr>';
  const rows = bets.map((b) => {
    const resultCell = showResult
      ? `<td class="${b.hit ? 'o' : 'x'}">${b.hit ? '✓' : '✕'}</td><td>${fmtYen(b.payout)}</td>`
      : '';
    return `
      <tr>
        <td class="l">${escapeHtml(b.type)}</td>
        <td>${b.combination.join('-')}</td>
        <td>${fmtYen(b.stake ?? b.tickets.length * 100)}</td>
        <td class="l">${b.note ? escapeHtml(b.note) : '—'}</td>
        ${resultCell}
      </tr>
    `;
  }).join('');
  let totalLine = '';
  if (showResult && site.verification) {
    const v = site.verification;
    const cls = v.bets_hit ? 'hit' : 'miss';
    const icon = v.bets_hit ? '✓' : '✕';
    totalLine = `<div class="total">合計 ${totalPoints}点 ${fmtYen(v.bets_cost)} → 払戻 <span class="${cls}">${fmtYen(v.bets_return)} ${icon}</span></div>`;
  }
  return `
    <div class="eyebrow">買い目 <span class="note">${totalPoints}点 ${fmtYen(totalCost)}</span></div>
    <table><thead>${header}</thead><tbody>${rows}</tbody></table>
    ${totalLine}
  `;
}

function renderBetsSection(site) {
  if (site.schema_version === 'keiba-log-1.1') return renderBetsSectionV11(site);

  const bets = site.bets || [];
  const totalPoints = bets.reduce((sum, b) => sum + b.tickets.length, 0);
  if (!bets.length) {
    return `<div class="eyebrow">買い目</div><div>見送り（買い目なし）</div>`;
  }
  const showResult = site.status === 'final';
  const header = showResult
    ? '<tr><th class="l">券種</th><th>買い目</th><th>ライン</th><th>結果</th><th>払戻</th></tr>'
    : '<tr><th class="l">券種</th><th>買い目</th><th>ライン</th></tr>';
  const rows = bets.map((b) => {
    const resultCell = showResult
      ? `<td class="${b.hit ? 'o' : 'x'}">${b.hit ? '✓' : '✕'}</td><td>${fmtYen(b.payout)}</td>`
      : '';
    return `
      <tr>
        <td class="l">${escapeHtml(b.type)}</td>
        <td>${b.combination.join('-')}</td>
        <td>${b.buy_line !== null ? b.buy_line.toFixed(1) + '倍〜' : '—'}</td>
        ${resultCell}
      </tr>
    `;
  }).join('');

  let totalLine = '';
  if (showResult && site.verification) {
    const v = site.verification;
    const cls = v.bets_hit ? 'hit' : 'miss';
    const icon = v.bets_hit ? '✓' : '✕';
    totalLine = `<div class="total">合計 ${v.bets_cost / 100}点 ${fmtYen(v.bets_cost)} → 払戻 <span class="${cls}">${fmtYen(v.bets_return)} ${icon}</span></div>`;
  }

  return `
    <div class="eyebrow">買い目 <span class="note">${totalPoints}点 ${totalPoints * 100}円</span></div>
    <table><thead>${header}</thead><tbody>${rows}</tbody></table>
    ${totalLine}
  `;
}

// ===== 4.4 答え合わせ =====
function renderVerificationSection(site) {
  if (site.status === 'cancelled') return '';
  if (site.status !== 'final') {
    return `<div class="eyebrow">答え合わせ</div><div class="kv">結果はレース後に反映されます</div>`;
  }
  const result = site.result;
  const verification = site.verification;
  if (!result || !verification) return '';

  const byNumber = {};
  for (const h of site.horses) byNumber[h.number] = h;
  const v11 = site.schema_version === 'keiba-log-1.1';

  const topRows = result.top3.map((t, idx) => {
    const h = byNumber[t.number];
    let markCell = '—';
    let cls = '';
    if (h) {
      if (h.bet_mark === '地雷') {
        markCell = '地雷';
        cls = 'x';
      } else if (v11) {
        const marks = (h.ability_mark || '') + (h.role ? '/' + h.role : '');
        if (marks) {
          markCell = marks;
          cls = 'o';
        }
      } else {
        const marks = (h.ability_mark || '') + (h.bet_mark && h.bet_mark !== h.ability_mark && h.bet_mark !== '地雷' ? h.bet_mark : '');
        if (marks) {
          markCell = marks;
          cls = 'o';
        }
      }
    }
    const rowCls = idx === 0 ? ' class="top1"' : '';
    return `<tr${rowCls}><td>${t.finish}</td><td class="l">${t.number} ${escapeHtml(t.name)}</td><td>${t.popularity}</td><td class="l sep markcell ${cls}">${markCell}</td></tr>`;
  }).join('');

  const paceMatchIcon = verification.pace_match === true ? '✓' : verification.pace_match === false ? '✕' : '—';
  const markFinishLine = Object.entries(verification.mark_finishes || {})
    .map(([k, v]) => `${k.replace(/[()]/g, '')}=${v}着`)
    .join('・');

  const landmineNumbers = Object.keys(verification.landmine_result || {}).sort((a, b) => Number(a) - Number(b));
  const landmineLine = landmineNumbers
    .map((n) => {
      const lr = verification.landmine_result[n];
      return `${n}=${lr.finish}着 ${lr.ok ? '✓' : '✕'}`;
    })
    .join(' ・ ');

  let biasLine = '';
  if (result.bias_actual !== null && result.bias_actual !== undefined) {
    const biasMatchIcon = verification.bias_match === true ? '✓' : verification.bias_match === false ? '✕' : '—';
    biasLine = `<div class="kv">バイアス ${escapeHtml(result.bias_actual)}（予想 ${escapeHtml(site.prediction.bias ?? '—')} ${biasMatchIcon}）${verification.bias_note ? ' ' + escapeHtml(verification.bias_note) : ''}</div>`;
  }

  const payoutRows = Object.entries(result.payouts || {})
    .map(([type, val]) => {
      const list = Array.isArray(val) ? val : [val];
      const line = list
        .map((p) => `${p.combination.join('-')} ${fmtYen(p.payout)}${p.popularity ? `（${p.popularity}人気）` : ''}`)
        .join(' / ');
      return `<tr><td class="l">${escapeHtml(payoutTypeLabel(type))}</td><td class="l">${line}</td></tr>`;
    })
    .join('');

  const summaryLines = [];
  if (verification.summary) summaryLines.push(`<div class="kv">総括: ${escapeHtml(verification.summary)}</div>`);
  if (verification.miss_cause) summaryLines.push(`<div class="kv">敗因: ${escapeHtml(verification.miss_cause)}</div>`);
  if (verification.biggest_miss) summaryLines.push(`<div class="kv">見落とし: ${escapeHtml(verification.biggest_miss)}</div>`);
  if (result.winning_style) summaryLines.push(`<div class="kv">勝ちパターン: ${escapeHtml(result.winning_style)}</div>`);

  return `
    <div class="eyebrow">答え合わせ</div>
    <table>
      <thead><tr><th class="l">着</th><th class="l">馬</th><th>人気</th><th class="l sep">印</th></tr></thead>
      <tbody>${topRows}</tbody>
    </table>
    <div class="kv">ペース ${escapeHtml(result.pace ?? '—')}（予想 ${escapeHtml(site.prediction.pace)} ${paceMatchIcon}）／ 印の着順 ${markFinishLine}</div>
    <div class="kv">地雷判定 ${landmineLine}</div>
    ${biasLine}
    <details class="fold"><summary><span class="tri"></span>払戻表</summary>
      <div class="fold-body"><table><tbody>${payoutRows}</tbody></table></div>
    </details>
    ${summaryLines.join('')}
  `;
}

// ===== ①全頭評価表 =====
function renderAllHorsesTable(site) {
  const v11 = site.schema_version === 'keiba-log-1.1';
  const rows = [...site.horses]
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    .map((h) => {
      if (h.scratched) {
        return `<tr class="scratched"><td>${h.rank ?? '—'}</td><td>${h.number}</td><td class="name">${escapeHtml(h.name)}</td><td colspan="4">取消</td></tr>`;
      }
      const rowCls = h.ability_mark ? ' class="pred"' : '';
      const extraChips = v11
        ? `${h.role ? roleChip(h.role) : ''}${h.bet_mark === '地雷' ? mineChip() : ''}${marketEvalChip(h.market_eval)}`
        : '';
      return `
        <tr${rowCls}>
          <td>${h.rank ?? '—'}</td>
          <td>${h.number}</td>
          <td class="name ${markNameClass(h.ability_mark)}">${h.ability_mark || ''}${escapeHtml(h.name)}${extraChips}</td>
          <td>${fmtNum(h.total, 1)}</td>
          <td>${h.odds ?? '—'}</td>
          <td>${h.popularity ?? '—'}</td>
          <td class="conf">${h.confidence ?? '—'}</td>
        </tr>
      `;
    })
    .join('');
  return `
    <details class="fold">
      <summary><span class="tri"></span>全頭評価表<span class="cnt">${site.horses.length}頭</span></summary>
      <div class="fold-body">
        <table class="fixed">
          <colgroup><col style="width:8%"><col style="width:8%"><col style="width:33%">
            <col style="width:13%"><col style="width:14%"><col style="width:9%"><col style="width:15%"></colgroup>
          <thead><tr><th>順</th><th>番</th><th class="l">馬名</th><th>総合</th><th>オッズ</th><th>人気</th><th>信頼</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="scrollnote">※ 印は馬名の色で判別（◎ネイビー→△薄グレー）。全${site.horses.length}頭を掲載（総合スコア順）</div>
      </div>
    </details>
  `;
}

// ===== ②勝率・期待値表 =====
function evChip(ev) {
  if (ev === null || ev === undefined) return '—';
  if (ev >= 3.00) return '<span class="chip under">大幅過小</span>';
  if (ev >= 0.10) return '<span class="chip under">過小</span>';
  if (ev > -0.10) return '<span class="chip fair">妥当</span>';
  return '<span class="chip over">過剰</span>';
}

function renderEvTable(site) {
  if (site.prediction.odds_basis === 'オッズ未取得') {
    return `
      <details class="fold">
        <summary><span class="tri"></span>勝率・期待値表</summary>
        <div class="fold-body">オッズ未取得のため期待値なし</div>
      </details>
    `;
  }
  const horses = [...site.horses]
    .filter((h) => !h.scratched)
    .sort((a, b) => {
      if (b.estimated_prob === a.estimated_prob) return (a.rank ?? 999) - (b.rank ?? 999);
      if (a.estimated_prob === null || a.estimated_prob === undefined) return 1;
      if (b.estimated_prob === null || b.estimated_prob === undefined) return -1;
      return b.estimated_prob - a.estimated_prob;
    });
  const maxEv = horses.reduce((max, h) => (h.ev !== null && h.ev !== undefined && (max === null || h.ev > max) ? h.ev : max), null);

  const rows = horses.map((h) => {
    const evCls = h.ev === null || h.ev === undefined ? '' : h.ev >= 0 ? 'value-pos' : 'value-neg';
    const hlCls = maxEv !== null && h.ev === maxEv ? ' cell-hl' : '';
    const evText = h.ev === null || h.ev === undefined ? '—' : fmtSignedPercent(h.ev, 0);
    return `
      <tr${h.ability_mark ? ' class="pred"' : ''}>
        <td class="name ${markNameClass(h.ability_mark)}">${h.ability_mark || ''}${h.number} ${escapeHtml(h.name)}</td>
        <td>${fmtPercent(h.estimated_prob, 0)}</td>
        <td class="sep">${h.fair_odds !== null && h.fair_odds !== undefined ? h.fair_odds.toFixed(1) : '—'}</td>
        <td class="sep">${h.odds ?? '—'}</td>
        <td class="sep ${evCls}${hlCls}">${evText}</td>
        <td class="l sep">${evChip(h.ev)}</td>
      </tr>
    `;
  }).join('');

  return `
    <details class="fold">
      <summary><span class="tri"></span>勝率・期待値表<span class="cnt">${horses.length}頭</span></summary>
      <div class="fold-body">
        <table class="fixed" style="font-size:12px">
          <colgroup><col style="width:37%"><col style="width:8%"><col style="width:11%">
            <col style="width:11%"><col style="width:16%"><col style="width:17%"></colgroup>
          <thead><tr><th class="l">馬名</th><th>勝率</th><th class="sep">適正</th><th class="sep">現在</th>
            <th class="sep">期待値</th><th class="l sep">評価</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="scrollnote">勝率＝推定勝率／適正・現在＝オッズ／期待値＝期待収益率。適正＜現在なら妙味（緑）。順位は勝率順のため省略</div>
      </div>
    </details>
  `;
}

// ===== ③展開・レース分析 =====
function renderOverviewFold(site) {
  const md = site.sections && site.sections.overview_md;
  return `
    <details class="fold">
      <summary><span class="tri"></span>展開・レース分析</summary>
      <div class="fold-body"><div class="prose">${renderMarkdown(md)}</div></div>
    </details>
  `;
}

// ===== ④個別評価 =====
function splitHorsesMd(md) {
  const idx = md.search(/^### /m);
  if (idx === -1) return { preamble: md, blocks: [] };
  const preamble = md.slice(0, idx);
  const blocks = md.slice(idx).split(/\n(?=### )/).map((chunk) => {
    const m = chunk.match(/^### (\d+)\.\s*([^（(\n]+)[（(]?([^）)\n]*)/);
    return {
      number: m ? Number(m[1]) : null,
      name: m ? m[2].trim() : '',
      meta: m ? m[3].trim() : '',
      body: chunk.replace(/^### .*\n?/, ''),
    };
  });
  return { preamble, blocks };
}

function renderHorsesFold(site) {
  const md = site.sections && site.sections.horses_md;
  const detailCount = site.horses.filter((h) => h.detail_target).length;
  if (!md) {
    return `
      <details class="fold">
        <summary><span class="tri"></span>個別評価<span class="cnt">詳細${detailCount}頭</span></summary>
        <div class="fold-body"></div>
      </details>
    `;
  }
  const { preamble, blocks } = splitHorsesMd(md);
  const byNumber = {};
  for (const h of site.horses) byNumber[h.number] = h;
  const v11 = site.schema_version === 'keiba-log-1.1';

  if (v11) {
    const markOrder = { '◎': 0, '○': 1, '▲': 2, '△': 3 };
    const roleOrder = { '軸': 0, '相手': 1, '穴': 2 };
    blocks.sort((a, b) => {
      const ha = byNumber[a.number] || {};
      const hb = byNumber[b.number] || {};
      const ma = ha.ability_mark in markOrder ? markOrder[ha.ability_mark] : 9;
      const mb = hb.ability_mark in markOrder ? markOrder[hb.ability_mark] : 9;
      if (ma !== mb) return ma - mb;
      const ra = ha.role in roleOrder ? roleOrder[ha.role] : 9;
      const rb = hb.role in roleOrder ? roleOrder[hb.role] : 9;
      if (ra !== rb) return ra - rb;
      return (ha.rank ?? 999) - (hb.rank ?? 999);
    });
  }

  let body;
  if (!blocks.length) {
    body = `<div class="prose">${renderMarkdown(md)}</div>`;
  } else {
    const preambleHtml = preamble.trim() ? `<div class="prose">${renderMarkdown(preamble)}</div>` : '';
    const blocksHtml = blocks.map((b) => {
      const h = byNumber[b.number];
      const heading = h
        ? `${markBadge(h.ability_mark)}${b.number} ${escapeHtml(b.name)} <span class="meta">${escapeHtml(b.meta)}</span><span class="sc">${fmtNum(h.total, 1)} / ${h.popularity ?? '—'}人気</span>`
        : escapeHtml(b.name);
      const bodyHtml = `<div class="prose">${renderMarkdown(b.body)}</div>`;
      if (v11) {
        return `
          <details class="subfold">
            <summary><span class="tri"></span>${heading}</summary>
            <div class="fold-body">${bodyHtml}</div>
          </details>
        `;
      }
      return `
        <details class="subfold">
          <summary><span class="tri"></span>${heading}</summary>
          <div class="fold-body">${bodyHtml}</div>
        </details>
      `;
    }).join('');
    body = preambleHtml + blocksHtml;
  }

  return `
    <details class="fold">
      <summary><span class="tri"></span>個別評価<span class="cnt">詳細${detailCount}頭</span></summary>
      <div class="fold-body">${body}</div>
    </details>
  `;
}

// ===== ⑤予想が外れるとしたら =====
function renderCounterFold(site) {
  const md = site.sections && site.sections.counter_md;
  return `
    <details class="fold">
      <summary><span class="tri"></span>予想が外れるとしたら<span class="cnt">弱点・崩れる条件</span></summary>
      <div class="fold-body"><div class="prose rev">${renderMarkdown(md)}</div></div>
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

  const banner = site.status === 'cancelled' ? '<div class="alert">このレースは中止になりました</div>' : '';

  const html = `
    ${renderHeaderBlock(site)}
    ${banner}
    ${renderConclusionCard(site)}
    ${renderBetsSection(site)}
    ${renderVerificationSection(site)}
    <div class="fold-intro">▼ ここから下はデータ・全文解説（タップで開く）</div>
    ${renderAllHorsesTable(site)}
    ${renderEvTable(site)}
    ${renderOverviewFold(site)}
    ${renderHorsesFold(site)}
    ${renderCounterFold(site)}
  `;
  document.getElementById('race-content').innerHTML = html;
}

main();

})();
