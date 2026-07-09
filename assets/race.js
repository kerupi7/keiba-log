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
        <td class="l wrap">${b.note ? escapeHtml(b.note) : '—'}</td>
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

// ===== ⑥ 買い目シミュレーター（17-odds-master-spec.md §6。T4: B.手動シミュレーターのみ。
//         A.印馬のおすすめ はT5で追加）=====
// 計算はすべて Harville（assets/harville.js・T1）を呼ぶ。ここでは数式を書かない。

const OM_TICKET_TYPES = [
  { type: 'tansho', label: '単勝' },
  { type: 'fukusho', label: '複勝' },
  { type: 'wide', label: 'ワイド' },
  { type: 'umaren', label: '馬連' },
  { type: 'umatan', label: '馬単' },
  { type: 'sanrenpuku', label: '3連複' },
  { type: 'sanrentan', label: '3連単' },
];
const OM_NAGASHI_TYPES = new Set(['umaren', 'wide', 'umatan', 'sanrenpuku', 'sanrentan']);
const OM_AXIS_MAX = { umaren: 1, wide: 1, umatan: 1, sanrenpuku: 2, sanrentan: 2 };

function omEligibility(type, heads) {
  if (type === 'fukusho' && heads <= 4) return { ok: false, reason: '5頭未満のため発売なし' };
  if (type === 'wide' && heads < 8) return { ok: false, reason: '8頭未満のため発売なし' };
  return { ok: true, reason: null };
}

function omInitialState() {
  return { betType: 'tansho', mode: 'box', picked: [], axis: [], partners: [] };
}

function omToggleChip(state, number) {
  if (state.mode === 'nagashi' && OM_NAGASHI_TYPES.has(state.betType)) {
    const axisMax = OM_AXIS_MAX[state.betType] || 1;
    if (state.axis.includes(number)) {
      state.axis = state.axis.filter((n) => n !== number);
      return;
    }
    if (state.partners.includes(number)) {
      state.partners = state.partners.filter((n) => n !== number);
      return;
    }
    if (state.axis.length < axisMax) {
      state.axis.push(number);
    } else {
      state.partners.push(number);
    }
    return;
  }
  if (state.picked.includes(number)) {
    state.picked = state.picked.filter((n) => n !== number);
  } else {
    state.picked.push(number);
  }
}

// §4.5: 勝率はp>=1%なら小数1桁%・p<1%なら小数2桁%
function omFmtProb(p) {
  if (p === null || p === undefined) return '—';
  const pct = p * 100;
  return pct >= 1 ? `${pct.toFixed(1)}%` : `${pct.toFixed(2)}%`;
}

function omFmtBuyLine(buyLine) {
  return buyLine === null || buyLine === undefined ? '—' : `${buyLine.toFixed(1)}倍〜`;
}

// 複勝・ワイドはmin側を表示（§3.2・§6.4）。幅がある旨を「〜」で示す
function omFmtOdds(type, odds) {
  if (odds === null || odds === undefined) return '—';
  const suffix = (type === 'fukusho' || type === 'wide') ? '〜' : '';
  return `${odds}${suffix}`;
}

function omFmtEv(ev) {
  return ev === null || ev === undefined ? '—' : ev.toFixed(2);
}

// 買い目表示: normKeyを整形（馬単/3連単は→区切り、他は-区切り。§6.4）。
// 区切りの直後に <wbr>（改行可能ポイント）を入れ、狭い列でも馬ごとに折り返せるようにする。
// 返り値はHTML（馬番は整数由来で安全）。呼び出し側は escapeHtml しないこと。
function omFmtCombo(type, ids) {
  const sep = (type === 'umatan' || type === 'sanrentan') ? '→' : '-';
  return Harville.normKey(type, ids).split('-').join(sep + '<wbr>');
}

// 判定セル: ev>1.0→買い(緑) / それ以外→見送り(灰)。p<P_MINの行は追加で「低確率」チップ（§4.5・§4.6）
function omJudgeCell(ev, lowP) {
  const parts = [];
  if (ev === null || ev === undefined) {
    parts.push('—');
  } else if (ev > 1.0) {
    parts.push('<span class="chip buy">買い</span>');
  } else {
    parts.push('<span class="chip pass">見送り</span>');
  }
  if (lowP) parts.push('<span class="chip lowp">低確率</span>');
  return parts.join(' ');
}

// §4.7 決定性: EV降順 → 確率降順 → normKey昇順（文字列比較）。EV無しの行はEVあり行より後ろ
function omSortRows(rows) {
  rows.sort((a, b) => {
    const hasA = a.ev !== null && a.ev !== undefined;
    const hasB = b.ev !== null && b.ev !== undefined;
    if (hasA && hasB && a.ev !== b.ev) return b.ev - a.ev;
    if (hasA !== hasB) return hasA ? -1 : 1;
    if (a.p !== b.p) return b.p - a.p;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

function omComputeRows(type, mode, state, probs, heads, oddsAll) {
  const sel = { picked: state.picked, axis: state.axis, partners: state.partners };
  const entries = Harville.enumerate(type, mode, sel, probs, heads);
  // F4: その券種の status が "result" でなければ（発売前・取得失敗=ng）オッズ列は「—」。
  // タブ自体は有効のまま（買いラインは表示）。status依存の判断はここに集約する。
  const oddsForType = (oddsAll && oddsAll.status && oddsAll.status[type] === 'result') ? oddsAll : null;
  const rows = [];
  for (const { ids, p } of entries) {
    if (p === null || p === undefined) continue; // p計算不能なら行自体を出さない（§6.4）
    const odds = oddsForType ? Harville.oddsUsed(oddsForType, type, ids) : null;
    const evVal = Harville.ev(p, odds);
    const buyLine = Harville.buyLine(p);
    const lowP = p < (Harville.P_MIN[type] ?? 0);
    rows.push({ type, ids, p, odds, ev: evVal, buyLine, lowP, key: Harville.normKey(type, ids) });
  }
  omSortRows(rows);
  return rows;
}

function omRenderTabs(state, heads) {
  return OM_TICKET_TYPES.map(({ type, label }) => {
    const elig = omEligibility(type, heads);
    const cls = ['om-tab'];
    if (state.betType === type) cls.push('active');
    const attrs = [`data-type="${type}"`];
    if (!elig.ok) {
      cls.push('disabled');
      attrs.push('disabled', `title="${escapeHtml(elig.reason)}"`);
    }
    return `<button type="button" class="${cls.join(' ')}" ${attrs.join(' ')}>${label}</button>`;
  }).join('');
}

function omRenderModes(state) {
  if (!OM_NAGASHI_TYPES.has(state.betType)) return '';
  return `
    <div class="om-modes">
      <button type="button" class="om-mode ${state.mode === 'box' ? 'active' : ''}" data-mode="box">ボックス</button>
      <button type="button" class="om-mode ${state.mode === 'nagashi' ? 'active' : ''}" data-mode="nagashi">流し</button>
    </div>
  `;
}

function omRenderChips(site, probs, state) {
  const horses = [...site.horses].sort((a, b) => a.number - b.number);
  const isNagashi = state.mode === 'nagashi' && OM_NAGASHI_TYPES.has(state.betType);

  function chip(h, selected) {
    const disabled = h.scratched || !(h.number in probs);
    const cls = ['om-chip'];
    if (selected) cls.push('sel');
    if (h.scratched) cls.push('scratched');
    const title = h.scratched ? '取消' : (disabled ? '勝率なし' : h.name);
    return `<button type="button" class="${cls.join(' ')}" data-number="${h.number}" ${disabled ? 'disabled' : ''} title="${escapeHtml(title)}">${h.number}</button>`;
  }

  if (isNagashi) {
    const axisRow = horses.map((h) => chip(h, state.axis.includes(h.number))).join('');
    const partnerRow = horses.map((h) => chip(h, state.partners.includes(h.number))).join('');
    return `
      <div class="om-chiprow"><span class="om-chiplabel">軸</span>${axisRow}</div>
      <div class="om-chiprow"><span class="om-chiplabel">相手</span>${partnerRow}</div>
    `;
  }
  const pickedRow = horses.map((h) => chip(h, state.picked.includes(h.number))).join('');
  return `<div class="om-chiprow"><span class="om-chiplabel">馬</span>${pickedRow}</div>`;
}

const OM_COLGROUP_B = '<colgroup><col style="width:22%"><col style="width:14%"><col style="width:18%">' +
  '<col style="width:13%"><col style="width:12%"><col style="width:21%"></colgroup>';

function omRenderTable(rows) {
  if (!rows.length) {
    return `<div class="om-empty">組み合わせを選んでください</div>`;
  }
  const headerRow = `<tr><th class="l">買い目</th><th>勝率</th><th>買いライン</th><th class="sep">現在</th><th class="sep">EV</th><th class="l sep">判定</th></tr>`;
  const bodyRows = rows.map((r) => `
    <tr>
      <td class="l om-combo">${omFmtCombo(r.type, r.ids)}</td>
      <td>${omFmtProb(r.p)}</td>
      <td>${omFmtBuyLine(r.buyLine)}</td>
      <td class="sep">${omFmtOdds(r.type, r.odds)}</td>
      <td class="sep">${omFmtEv(r.ev)}</td>
      <td class="l sep om-judge">${omJudgeCell(r.ev, r.lowP)}</td>
    </tr>
  `).join('');
  return `
    <div class="om-count">${rows.length}点</div>
    <table class="fixed om-table">${OM_COLGROUP_B}<thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table>
  `;
}

function omRenderBlockB(site, probs, heads, oddsAll, state) {
  const rows = omComputeRows(state.betType, state.mode, state, probs, heads, oddsAll);
  return `
    <div class="om-subhead">B. 手動シミュレーター</div>
    <div class="om-tabs">${omRenderTabs(state, heads)}</div>
    ${omRenderModes(state)}
    ${omRenderChips(site, probs, state)}
    ${omRenderTable(rows)}
  `;
}

// ===== §6.2 A. 印馬のおすすめ（自動・T5） =====
// ability_mark ∈ {◎,○,▲,△} かつ非取消かつ estimated_prob 有効な馬のみを候補にする（§6.5）。
// アルゴリズムは Harville.recommend()（T1・軸固定しない完全総当たり）に一任し、ここでは計算しない。

const OM_CANDIDATE_MARKS = new Set(['◎', '○', '▲', '△']);
const OM_RECOMMEND_LIMIT = 20;

function omMarkedNumbers(site, probs) {
  return site.horses
    .filter((h) => OM_CANDIDATE_MARKS.has(h.ability_mark) && !h.scratched && (h.number in probs))
    .map((h) => h.number);
}

// 買い目表示に印を添える（例 ◎5→○2。.mkb バッジ再利用。§6.5）。
// 区切りの直後に <wbr> を入れ、狭い列でも馬ごとに折り返せるようにする。
function omFmtComboWithMarks(type, ids, markByNumber) {
  const sep = (type === 'umatan' || type === 'sanrentan') ? '→' : '-';
  const key = Harville.normKey(type, ids);
  return key.split('-').map((numStr) => {
    const num = Number(numStr);
    return `${markBadge(markByNumber[num])}${num}`;
  }).join(sep + '<wbr>');
}

function omRenderRecommendRow(entry, markByNumber) {
  return `
    <tr>
      <td class="l">${escapeHtml(payoutTypeLabel(entry.type))}</td>
      <td class="l om-combo">${omFmtComboWithMarks(entry.type, entry.ids, markByNumber)}</td>
      <td>${omFmtProb(entry.p)}</td>
      <td>${omFmtBuyLine(entry.buyLine)}</td>
      <td class="sep">${omFmtOdds(entry.type, entry.odds)}</td>
      <td class="sep">${omFmtEv(entry.ev)}</td>
      <td class="l sep om-judge">${omJudgeCell(entry.ev, false)}</td>
    </tr>
  `;
}

function omRenderBlockA(site, probs, heads, oddsAll) {
  const heading = `<div class="om-subhead">A. 印馬のおすすめ（自動）</div>`;

  if (!oddsAll) {
    return `${heading}<div class="om-empty">オッズ未取得のため、おすすめは発売中のみ表示されます</div>`;
  }

  const markedNums = omMarkedNumbers(site, probs);
  if (markedNums.length === 0) {
    return `${heading}<div class="om-empty">印馬がありません</div>`;
  }

  const intro = `<div class="om-note">◎○▲△の全組み合わせ×全券種を試し、期待値が1.0倍を超えるものだけをEV順に表示</div>`;
  const entries = Harville.recommend(markedNums, probs, heads, oddsAll);
  if (entries.length === 0) {
    return `${heading}${intro}<div class="om-empty">現在のオッズでは、期待値が1.0倍を超える印馬の組み合わせはありません</div>`;
  }

  const markByNumber = {};
  for (const h of site.horses) markByNumber[h.number] = h.ability_mark;

  const shown = entries.slice(0, OM_RECOMMEND_LIMIT);
  const restCount = entries.length - shown.length;
  const headerRow = `<tr><th class="l">券種</th><th class="l">買い目</th><th>勝率</th><th>買いライン</th><th class="sep">現在</th><th class="sep">EV</th><th class="l sep">判定</th></tr>`;
  const bodyRows = shown.map((r) => omRenderRecommendRow(r, markByNumber)).join('');
  const moreLine = restCount > 0 ? `<div class="om-more">…他${restCount}点</div>` : '';
  const colgroupA = '<colgroup><col style="width:10%"><col style="width:26%"><col style="width:11%">' +
    '<col style="width:16%"><col style="width:12%"><col style="width:9%"><col style="width:16%"></colgroup>';

  return `
    ${heading}
    ${intro}
    <table class="fixed om-table">${colgroupA}<thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table>
    ${moreLine}
  `;
}

function renderOddsMasterSection(site, oddsAll) {
  const built = Harville.buildProbs(site.horses);
  if (built.heads === 0) return ''; // F1: 全馬勝率null等 → セクションごと非表示

  const tsSource = oddsAll && (oddsAll.official_datetime || oddsAll.fetched_at);
  const tsLabel = tsSource ? `<span class="cnt">${fmtDateTimeShort(tsSource)}時点のオッズ</span>` : '';
  const openAttr = oddsAll ? ' open' : '';

  return `
    <details class="fold om-fold"${openAttr}>
      <summary><span class="tri"></span>買い目シミュレーター${tsLabel}</summary>
      <div class="fold-body">
        ${omRenderBlockA(site, built.probs, built.heads, oddsAll)}
        <div id="om-panel-body"></div>
        <div class="om-footnote">
          <div>買いライン＝期待値がトントン（1.0倍）になるオッズ。それ以上なら理論上プラス</div>
          <div>複勝・ワイドは最低オッズ側で判定。オッズは取得時点のスナップショットで、発売中は変動します</div>
          <div>このシミュレーターは参考計算です。下の「買い目」セクション（当サイトの提供買い目）とは独立しています</div>
        </div>
      </div>
    </details>
  `;
}

function setupOddsMasterPanel(site, oddsAll) {
  const body = document.getElementById('om-panel-body');
  if (!body) return; // F1でセクション自体が無い場合はDOMも存在しない

  const built = Harville.buildProbs(site.horses);
  const probs = built.probs;
  const heads = built.heads;
  let state = omInitialState();

  function rerender() {
    body.innerHTML = omRenderBlockB(site, probs, heads, oddsAll, state);
  }

  body.addEventListener('click', (ev) => {
    const tab = ev.target.closest('.om-tab');
    if (tab && !tab.disabled) {
      state = omInitialState();
      state.betType = tab.dataset.type;
      rerender();
      return;
    }
    const modeBtn = ev.target.closest('.om-mode');
    if (modeBtn && !modeBtn.disabled) {
      state.mode = modeBtn.dataset.mode;
      state.picked = [];
      state.axis = [];
      state.partners = [];
      rerender();
      return;
    }
    const chipEl = ev.target.closest('.om-chip');
    if (chipEl && !chipEl.disabled) {
      omToggleChip(state, Number(chipEl.dataset.number));
      rerender();
    }
  });

  rerender();
}

async function main() {
  renderHeader('race');
  const id = getQueryId();
  if (!id || !/^\d{12}$/.test(id)) {
    renderError('不正なレースIDです');
    return;
  }
  let site, oddsAll;
  try {
    [site, oddsAll] = await Promise.all([
      getData(`data/races/${id}.json`),
      getData(`data/odds/${id}.json`).catch(() => null),
    ]);
  } catch (e) {
    renderError(`レースデータの読み込みに失敗しました: ${e.message}`);
    return;
  }

  // F10: odds_all の schema_version が "odds_all-1." で前方一致しなければ、安全側で
  // オッズ無し（F3）へ全体縮退する（想定外スキーマを誤って読まない）。
  if (oddsAll && !(typeof oddsAll.schema_version === 'string' && oddsAll.schema_version.indexOf('odds_all-1.') === 0)) {
    oddsAll = null;
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
    ${renderOddsMasterSection(site, oddsAll)}
    ${renderOverviewFold(site)}
    ${renderHorsesFold(site)}
    ${renderCounterFold(site)}
  `;
  document.getElementById('race-content').innerHTML = html;
  setupOddsMasterPanel(site, oddsAll);
}

main();

})();
