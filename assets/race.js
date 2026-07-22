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
    wide: 'ワイド', umatan: '馬単', sanrenpuku: '3連複', sanrentan: '3連単',
  };
  return map[type] || type;
}

// 券種の表示順（単勝→複勝→ワイド→馬連→馬単→3連複→3連単）。bets[].type はデータ由来の日本語ラベル。
const BET_JA_ORDER = { '単勝': 0, '複勝': 1, 'ワイド': 2, '枠連': 2.5, '馬連': 3, '馬単': 4, '三連複': 5, '3連複': 5, '三連単': 6, '3連単': 6 };
function sortedBets(site) {
  return [...(site.bets || [])].sort((a, b) => (BET_JA_ORDER[a.type] ?? 99) - (BET_JA_ORDER[b.type] ?? 99));
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
    .map((h) => `<div class="marks-row">${markBadge(h.ability_mark)}${umaBox(h.number, h.gate, 'sm')} ${escapeHtml(h.name)}</div>`);
  if (oku.length) {
    const okuLine = `${markBadge('△')}${oku.map((h) => umaBox(h.number, h.gate, 'sm')).join('・')}`;
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
      const axisTxt = axis.map((h) => umaBox(h.number, h.gate, 'sm')).join('・');
      const restParts = [
        aite.length ? `相手${aite.map((h) => umaBox(h.number, h.gate, 'sm')).join('・')}` : '',
        ana.length ? `穴${ana.map((h) => umaBox(h.number, h.gate, 'sm')).join('・')}` : '',
      ].filter(Boolean).join(' ／ ');
      buyLine = `<div class="buyline"><span class="lead">買い</span>軸${axisTxt}${restParts ? ' → ' + restParts : ''}</div>`;
    }

    const landmineHorses = site.horses.filter((h) => h.bet_mark === '地雷');
    const landmineLine = landmineHorses.length
      ? `<div class="buyline"><span class="lead">地雷</span><span class="mine">${landmineHorses.map((h) => umaBox(h.number, h.gate, 'sm')).join(', ')}</span></div>`
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
      return `<div class="verdict-line">${badge}${umaBox(h.number, h.gate, 'sm')} ${escapeHtml(h.name)} — ${escapeHtml(h.verdict || '—')}</div>`;
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
        .map((h) => `${escapeHtml(h.bet_mark)}${umaBox(h.number, h.gate, 'sm')}`)
        .join(' ／ ');
      buyLine = `<div class="buyline"><span class="lead">買い</span><span class="star">★</span>${umaBox(star.number, star.gate, 'sm')} → ${rest}</div>`;
    } else {
      const line = betHorses.map((h) => `${escapeHtml(h.bet_mark)}${umaBox(h.number, h.gate, 'sm')}`).join(' ');
      buyLine = `<div class="buyline"><span class="lead">買い</span>${line}</div>`;
    }
  }

  const landmineHorses = site.horses.filter((h) => h.bet_mark === '地雷');
  const landmineLine = landmineHorses.length
    ? `<div class="buyline"><span class="lead">地雷</span><span class="mine">${landmineHorses.map((h) => umaBox(h.number, h.gate, 'sm')).join(', ')}</span></div>`
    : '';

  return `${marksHtml}${buyLine}${landmineLine}`;
}

// ===== 4.3 買い目 =====
function renderBetsSectionV11(site) {
  const bets = sortedBets(site);
  if (!bets.length) {
    return `<div class="eyebrow">買い目</div><div>見送り（買い目なし）</div>`;
  }
  const byNumberV11 = {};
  for (const h of site.horses) byNumberV11[h.number] = h;
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
        <td class="l">${escapeHtml(b.type.replace('三連', '3連'))}</td>
        <td>${comboBoxes(b.type, b.combination, byNumberV11)}</td>
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

  const bets = sortedBets(site);
  const totalPoints = bets.reduce((sum, b) => sum + b.tickets.length, 0);
  if (!bets.length) {
    return `<div class="eyebrow">買い目</div><div>見送り（買い目なし）</div>`;
  }
  const byNumberBets = {};
  for (const h of site.horses) byNumberBets[h.number] = h;
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
        <td class="l">${escapeHtml(b.type.replace('三連', '3連'))}</td>
        <td>${comboBoxes(b.type, b.combination, byNumberBets)}</td>
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
    return `<tr${rowCls}><td>${t.finish}</td><td class="l">${umaBox(t.number, h && h.gate, 'sm')} ${escapeHtml(t.name)}</td><td>${t.popularity}</td><td class="l sep markcell ${cls}">${markCell}</td></tr>`;
  }).join('');

  const paceMatchIcon = verification.pace_match === true ? '✓' : verification.pace_match === false ? '✕' : '—';
  const markFinishLine = Object.entries(verification.mark_finishes || {})
    .map(([k, v]) => `${k.replace(/[()]/g, '')}=${v}着`)
    .join('・');

  const landmineNumbers = Object.keys(verification.landmine_result || {}).sort((a, b) => Number(a) - Number(b));
  const landmineLine = landmineNumbers
    .map((n) => {
      const lr = verification.landmine_result[n];
      const h = byNumber[n];
      return `${umaBox(Number(n), h && h.gate, 'sm')}=${lr.finish}着 ${lr.ok ? '✓' : '✕'}`;
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
      const label = payoutTypeLabel(type);
      const line = list
        .map((p) => `${comboBoxes(label, p.combination, byNumber)} ${fmtYen(p.payout)}${p.popularity ? `（${p.popularity}人気）` : ''}`)
        .join(' / ');
      return `<tr><td class="l">${escapeHtml(label)}</td><td class="l">${line}</td></tr>`;
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
        return `<tr class="scratched"><td>${h.rank ?? '—'}</td><td>${umaBox(h.number, h.gate)}</td><td class="name">${escapeHtml(h.name)}</td><td colspan="4">取消</td></tr>`;
      }
      const rowCls = h.ability_mark ? ' class="pred"' : '';
      const extraChips = v11
        ? `${h.role ? roleChip(h.role) : ''}${h.bet_mark === '地雷' ? mineChip() : ''}${marketEvalChip(h.market_eval)}`
        : '';
      return `
        <tr${rowCls}>
          <td>${h.rank ?? '—'}</td>
          <td>${umaBox(h.number, h.gate)}</td>
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
        <td class="name ${markNameClass(h.ability_mark)}">${h.ability_mark || ''}${umaBox(h.number, h.gate, 'sm')} ${escapeHtml(h.name)}</td>
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
        ? `${markBadge(h.ability_mark)}${umaBox(b.number, h.gate, 'sm')} ${escapeHtml(b.name)} <span class="meta">${escapeHtml(b.meta)}</span><span class="sc">${fmtNum(h.total, 1)} / ${h.popularity ?? '—'}人気</span>`
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
// 表A（印馬のおすすめ）の表示順に使う券種インデックス（OM_TICKET_TYPESの並び＝単勝→…→3連単）
const OM_TYPE_ORDER = Object.fromEntries(OM_TICKET_TYPES.map((t, i) => [t.type, i]));
// 45-spec §2: 手動シミュレーター(Block B)のstate/列挙/描画は assets/simulator.js（window.Simulator）に移設。
// Block A（印馬のおすすめ・以下）はそのまま。OM_TICKET_TYPES/OM_TYPE_ORDERはBlock Aの表示順に使うため残す。

// omFmtBuyLine/Odds/Ev/Combo は Block A（印馬のおすすめ）で使用。omFmtProb/omJudgeCell/
// omFmtComboWithMarks は Block B 撤去に伴い未使用となったため削除（45-spec レビュー指摘③）。
function omFmtBuyLine(buyLine) {
  return buyLine === null || buyLine === undefined ? '—' : `${buyLine.toFixed(1)}倍`;
}

// 複勝・ワイドはmin側（最低オッズ）を表示。「〜」は付けない（最低倍率だけ載せる方針）
function omFmtOdds(type, odds) {
  if (odds === null || odds === undefined) return '—';
  return `${odds}`;
}

function omFmtEv(ev) {
  if (ev === null || ev === undefined) return '—';
  const txt = ev.toFixed(2);
  // 判定列の代替: 期待値プラス（>1.0）は緑で強調する
  return ev > 1.0 ? `<span class="om-ev-plus">${txt}</span>` : txt;
}

// 買い目表示: normKeyで並びを正規化し、馬番を枠色ボックスで表示する（買い目・払戻表と同じ見た目）。
// byNumber は 馬番→horse の辞書（gate参照用）。返り値はHTML。呼び出し側は escapeHtml しないこと。
function omFmtCombo(type, ids, byNumber) {
  const nums = Harville.normKey(type, ids).split('-').map(Number);
  return comboBoxes(type, nums, byNumber || {});
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

function omRenderRecommendRow(entry, byNumber) {
  return `
    <tr>
      <td class="l">${escapeHtml(payoutTypeLabel(entry.type))}</td>
      <td class="l om-combo">${omFmtCombo(entry.type, entry.ids, byNumber)}</td>
      <td>${omFmtBuyLine(entry.buyLine)}</td>
      <td class="sep">${omFmtOdds(entry.type, entry.odds)}</td>
      <td class="sep">${omFmtEv(entry.ev)}</td>
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

  const intro = `<div class="om-note">◎○▲△の全組み合わせ×全券種を試し、期待値が1.0倍を超えるものだけを券種順に表示（各券種内はEV順）</div>`;
  const entries = Harville.recommend(markedNums, probs, heads, oddsAll);
  if (entries.length === 0) {
    return `${heading}${intro}<div class="om-empty">現在のオッズでは、期待値が1.0倍を超える印馬の組み合わせはありません</div>`;
  }

  // 馬番→horse（枠色ボックスの gate 参照用）
  const byNumber = {};
  for (const h of site.horses) byNumber[h.number] = h;

  // 上位20点（EV順）を選んだうえで、表示は券種順（各券種内はEV降順）に並べ替える
  const shown = entries.slice(0, OM_RECOMMEND_LIMIT).sort((a, b) => {
    const ta = OM_TYPE_ORDER[a.type] ?? 99, tb = OM_TYPE_ORDER[b.type] ?? 99;
    if (ta !== tb) return ta - tb;
    return (b.ev ?? -Infinity) - (a.ev ?? -Infinity);
  });
  const restCount = entries.length - shown.length;
  const headerRow = `<tr><th class="l">券種</th><th class="l">買い目</th><th>買いライン</th><th class="sep">現在</th><th class="sep">EV</th></tr>`;
  const bodyRows = shown.map((r) => omRenderRecommendRow(r, byNumber)).join('');
  const moreLine = restCount > 0 ? `<div class="om-more">…他${restCount}点</div>` : '';
  const colgroupA = '<colgroup><col style="width:15%"><col style="width:37%"><col style="width:18%">' +
    '<col style="width:15%"><col style="width:15%"></colgroup>';

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

// 45-spec §2.12: 手動シミュレーター(Block B)の描画・stateは Simulator（assets/simulator.js）に一任。
// ここではDOM書き込みとイベント委譲のみ（クリック/change委譲は #om-panel-body に集約）。
function setupOddsMasterPanel(site, oddsAll) {
  const body = document.getElementById('om-panel-body');
  if (!body) return; // F1でセクション自体が無い場合はDOMも存在しない

  const built = Harville.buildProbs(site.horses);
  const probs = built.probs;
  const heads = built.heads;
  const state = Simulator.initialState();

  function rerender() {
    body.innerHTML = Simulator.renderBlockB(site, probs, heads, oddsAll, state);
  }

  body.addEventListener('click', (ev) => {
    if (Simulator.handleClick(state, ev.target)) rerender();
  });
  body.addEventListener('change', (ev) => {
    if (Simulator.handleChange(state, ev.target)) rerender();
  });

  rerender();
}

// ===== 完全Python化2.0（schema_version: keiba-log-2.0）描画パス =====
// T9〜T12。既存関数は一切呼ばない・変更しない（23-fullpython-fe-spec.md）。
// gradeClass/gradeDispは app.js（共通層）に移設（45-spec §2.8: 手動シミュレーターの評価バッジが
// 既存の評価体系に合わせて参照するため。呼び出しは従来どおりグローバル解決される）。

function ratioClass(ratio) {
  if (ratio >= 1.15) return 'b1';
  if (ratio >= 1.05) return 'b2';
  if (ratio > 0.95) return 'b3';
  if (ratio > 0.85) return 'b4';
  return 'b5';
}

// 内外バイアスの偏差バー: 1.00 を基準線に、上=有利 / 下=不利。
// 長さは |ratio-1| を 0.4 で頭打ちにして最大 16px。極端値でもレイアウトを壊さない。
const BIAS_BAR_MAX = 16;
function biasBar(ratio) {
  const d = Math.max(-1, Math.min(1, (ratio - 1) / 0.4));
  const h = Math.max(1, Math.round(Math.abs(d) * BIAS_BAR_MAX));
  const dir = d >= 0 ? 'up' : 'dn';
  return `<div class="bar"><i class="${dir} ${ratioClass(ratio)}" style="height:${h}px"></i></div>`;
}

function renderHeader20(site) {
  const r = site.race;
  const p = site.prediction;
  const cls = `${r.class}${r.grade ? '・' + r.grade : ''}・${r.surface}${r.distance}m`;
  const condParts = [
    `${r.date} ${r.track}${r.race_number}R`,
    `${r.surface}${r.distance}m・${r.direction}`,
    `${r.field_size}頭`,
  ];
  if (r.weight_rule) condParts.push(r.weight_rule);
  if (r.post_time) condParts.push(`発走 ${r.post_time}`);
  return `
    <div class="rhead">
      <div class="cls">${escapeHtml(cls)}</div>
      <div class="ttl">${escapeHtml(r.race_name)}</div>
      <div class="cond">${escapeHtml(condParts.join(' ／ '))}</div>
      <div class="pt">予想: ${fmtDateTimeShort(p.predicted_at)}（${escapeHtml(p.odds_basis)}基準）</div>
    </div>
  `;
}

function renderMarks20(site) {
  const horses = site.horses;
  const markCls = { '◎': 'm-hon', '○': 'm-tai', '▲': 'm-tan', '△': 'm-oku' };
  const rows = [];
  for (const mark of ['◎', '○', '▲', '△']) {
    horses.filter((h) => h.ability_mark === mark).sort((a, b) => a.number - b.number)
      .forEach((h) => rows.push({ cls: markCls[mark], label: mark, number: h.number, gate: h.gate, name: h.name }));
  }
  horses.filter((h) => h.role === '穴').sort((a, b) => a.number - b.number)
    .forEach((h) => rows.push({ cls: 'm-ana', label: '穴', number: h.number, gate: h.gate, name: h.name }));
  horses.filter((h) => h.bet_mark === '地雷').sort((a, b) => a.number - b.number)
    .forEach((h) => rows.push({ cls: 'm-jir', label: '地雷', number: h.number, gate: h.gate, name: h.name }));
  if (!rows.length) return '';
  const rowsHtml = rows.map((r) => `<div class="mrow"><span class="mkb ${r.cls}">${escapeHtml(r.label)}</span>${umaBox(r.number, r.gate)}<span class="nm">${escapeHtml(r.name)}</span></div>`).join('');
  return `
    <div class="secthead">印</div>
    <div class="marks">${rowsHtml}</div>
  `;
}

function renderAllHorses20(site) {
  const markCellCls = { '◎': 'mk-hon', '○': 'mk-tai', '▲': 'mk-tan', '△': 'mk-oku' };
  const horses = [...site.horses].sort((a, b) => {
    if (a.rank === null && b.rank === null) return a.number - b.number;
    if (a.rank === null) return 1;
    if (b.rank === null) return -1;
    return a.rank - b.rank;
  });
  const rows = horses.map((h) => {
    if (h.scratched) {
      return `<tr class="scratched"><td>—</td><td class="mkc"></td><td>${umaBox(h.number, h.gate)}</td><td class="name">${escapeHtml(h.name)}（取消）</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`;
    }
    const markLabel = h.ability_mark ?? (h.bet_mark === '地雷' ? '地雷' : '');
    const markCellClass = h.ability_mark ? (markCellCls[h.ability_mark] || '') : '';
    const gradeHtml = h.grade ? `<span class="grade ${gradeClass(h.grade)}">${gradeDisp(h.grade)}</span>` : '—';
    return `
      <tr${h.ability_mark ? ' class="pred"' : ''}>
        <td>${h.rank}</td>
        <td class="mkc ${markCellClass}">${escapeHtml(markLabel)}</td>
        <td>${umaBox(h.number, h.gate)}</td>
        <td class="name">${escapeHtml(h.name)}</td>
        <td>${fmtNum(h.total, 1)}</td>
        <td>${h.odds !== null && h.odds !== undefined ? h.odds.toFixed(1) : '—'}</td>
        <td>${h.popularity ?? '—'}</td>
        <td>${gradeHtml}</td>
      </tr>
    `;
  }).join('');
  return `
    <div class="secthead">全頭評価<span class="cnt">全${site.race.field_size}頭</span></div>
    <table class="fixed">
      <colgroup><col style="width:7%"><col style="width:8%"><col style="width:8%"><col style="width:35%">
        <col style="width:13%"><col style="width:12%"><col style="width:8%"><col style="width:9%"></colgroup>
      <thead><tr><th>順</th><th>印</th><th>番</th><th class="l">馬名</th><th>総合</th><th>オッズ</th><th>人気</th><th>評価</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// renderEvTable（既存・:386-436）の本体を丸ごとコピーし、secthead常時表示＋末尾注記のみ差し替え（23-spec §3-6）
function renderEv20(site) {
  if (site.prediction.odds_basis === 'オッズ未取得') {
    return `
      <div class="secthead">勝率・期待値</div>
      <div>オッズ未取得のため期待値なし</div>
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
        <td class="name ${markNameClass(h.ability_mark)}">${h.ability_mark || ''}${umaBox(h.number, h.gate, 'sm')} ${escapeHtml(h.name)}</td>
        <td>${fmtPercent(h.estimated_prob, 0)}</td>
        <td class="sep">${h.fair_odds !== null && h.fair_odds !== undefined ? h.fair_odds.toFixed(1) : '—'}</td>
        <td class="sep">${h.odds ?? '—'}</td>
        <td class="sep ${evCls}${hlCls}">${evText}</td>
        <td class="l sep">${evChip(h.ev)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="secthead">勝率・期待値<span class="cnt">${horses.length}頭</span></div>
    <table class="fixed" style="font-size:12px">
      <colgroup><col style="width:37%"><col style="width:8%"><col style="width:11%">
        <col style="width:11%"><col style="width:16%"><col style="width:17%"></colgroup>
      <thead><tr><th class="l">馬名</th><th>勝率</th><th class="sep">適正</th><th class="sep">現在</th>
        <th class="sep">期待値</th><th class="l sep">評価</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="conf">全${horses.length}頭を掲載（勝率順）</div>
  `;
}

// 買い目セルの組番整形・合計式は既存renderBetsSectionV11（:164-201）と同一ロジックをコピー（23-spec §3-9）
function renderBets20(site) {
  const bets = sortedBets(site);
  if (site.prediction.stance === 'pass' || !bets.length) {
    return `
      <div class="secthead">買い目</div>
      <div class="conf">本レースは見送り（買い目なし）</div>
    `;
  }
  const byNumberBets20 = {};
  for (const h of site.horses) byNumberBets20[h.number] = h;
  const totalPoints = bets.reduce((sum, b) => sum + b.tickets.length, 0);
  const totalCost = bets.reduce((sum, b) => sum + (b.stake ?? b.tickets.length * 100), 0);
  const showResult = site.status === 'final';
  const header = showResult
    ? '<tr><th class="l">券種</th><th>買い目</th><th>金額</th><th>結果</th><th>払戻</th></tr>'
    : '<tr><th class="l">券種</th><th>買い目</th><th>金額</th></tr>';
  const rows = bets.map((b) => {
    const resultCell = showResult
      ? `<td class="${b.hit ? 'o' : 'x'}">${b.hit ? '✓' : '✕'}</td><td>${fmtYen(b.payout)}</td>`
      : '';
    return `
      <tr>
        <td class="l">${escapeHtml(b.type.replace('三連', '3連'))}</td>
        <td>${comboBoxes(b.type, b.combination, byNumberBets20)}</td>
        <td>${fmtYen(b.stake ?? b.tickets.length * 100)}</td>
        ${resultCell}
      </tr>
    `;
  }).join('');

  let totalLine;
  if (showResult && site.verification) {
    const v = site.verification;
    const icon = v.bets_hit ? '✓' : '✕';
    const clsAttr = v.bets_hit ? ' class="hit"' : ' class="miss"';
    totalLine = `<div class="betsum">合計 ${totalPoints}点 ${fmtYen(totalCost)} → 払戻 <span${clsAttr}>${fmtYen(v.bets_return)} ${icon}</span></div>`;
  } else {
    totalLine = `<div class="betsum">合計 ${totalPoints}点 ${fmtYen(totalCost)}</div>`;
  }

  return `
    <div class="secthead">買い目</div>
    <table class="fixed">
      <thead>${header}</thead>
      <tbody>${rows}</tbody>
    </table>
    ${totalLine}
  `;
}

function buildRace20Html(site, oddsAll) {
  const banner = site.status === 'cancelled' ? '<div class="alert">このレースは中止になりました</div>' : '';
  return `
    <div class="race20">
      ${renderHeader20(site)}
      ${banner}
      ${renderMarks20(site)}
      ${renderAllHorses20(site)}
      ${renderEv20(site)}
      ${renderOverview20(site)}
      ${renderHorsesAccordion20(site)}
      ${renderBets20(site)}
      ${renderOddsMasterSection(site, oddsAll)}
      ${renderVerification20(site)}
    </div>
  `;
}

function renderOverview20(site) {
  const r = site.race;
  const p = site.prediction;
  const sections = [];
  const byNumberOv = {};
  for (const h of site.horses) byNumberOv[h.number] = h;

  // (a) 基本情報
  const babaLine = p.baba_detail?.going_weather ?? r.going ?? '—';
  sections.push(`
    <div class="info1">
      <div class="irow"><b>コース</b> ${escapeHtml(r.track)} ${escapeHtml(r.surface)}${r.distance}m・${escapeHtml(r.direction)}</div>
      <div class="irow"><b>馬場</b> ${escapeHtml(babaLine)}</div>
      <div class="irow"><b>頭数</b> ${r.field_size}頭</div>
      <div class="irow"><b>クラス</b> ${escapeHtml(r.class)}${r.weight_rule ? '・' + escapeHtml(r.weight_rule) : ''}</div>
    </div>
  `);

  // (b) 馬場踏み込み
  if (p.baba_detail) {
    const favs = p.baba_detail.favorites || [];
    const favHtml = favs.map((f) => `<span class="fav"><span class="nm">${umaBox(Number(f.number), (byNumberOv[f.number] || {}).gate, 'sm')} ${escapeHtml(f.name)}</span> <span class="rs">（${escapeHtml(f.reason)}）</span></span>`).join('');
    const l2Html = favs.length ? `<div class="l2"><span class="h">この馬場が得意:</span>${favHtml}</div>` : '';
    sections.push(`
      <div class="babadetail">
        <div class="l1">${escapeHtml(p.baba_detail.display_text)}</div>
        ${l2Html}
      </div>
    `);
  }

  // (c) 脚質傾向
  if (p.leg_bias && p.leg_bias.length) {
    const judgClass = { '有利': 'good', '不利': 'bad', '強く不利': 'vbad' };
    const rows = p.leg_bias.map((lb) => `
      <tr><td class="l">${escapeHtml(lb.style)}</td><td>${escapeHtml(lb.win_rate)}</td><td>${escapeHtml(lb.rentai_rate)}</td><td>${escapeHtml(lb.fukusho_rate)}</td><td>${lb.runs}走</td><td class="l sep"><span class="jw ${judgClass[lb.judgment] || ''}">${escapeHtml(lb.judgment)}</span></td></tr>
    `).join('');
    sections.push(`
      <div class="subh">脚質傾向</div>
      <table class="kg">
        <thead><tr><th class="l">脚質</th><th>勝率</th><th>連対</th><th>複勝</th><th>走数</th><th class="l sep">判定</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `);
  }

  // (d) 内外バイアス
  if (p.inner_outer_bias) {
    // 枠の識別は馬番と同じJRA枠色バッジ、有利不利は基準線からの偏差バーで表す
    const cellsHtml = p.inner_outer_bias.gates.map((g) => `
      <div class="cell">${wakuBox(g.gate, 'sm')}${biasBar(g.ratio)}<div class="v ${ratioClass(g.ratio)}">${g.ratio.toFixed(2)}</div></div>
    `).join('');
    sections.push(`
      <div class="biaslabel"><b>内外バイアス</b> ${escapeHtml(p.inner_outer_bias.label)}</div>
      <div class="strip">${cellsHtml}</div>
      <div class="striplegend">バーが基準線より上＝有利 / 下＝不利。長さ＝1.00からの差（1.00=標準）</div>
    `);
  }

  // (e) 逃げ候補・先行圧
  {
    const runners = p.front_runners || [];
    let tableHtml = '';
    if (runners.length) {
      const rows = runners.map((fr) => `<tr><td>${umaBox(Number(fr.number), (byNumberOv[fr.number] || {}).gate)}</td><td class="l">${escapeHtml(fr.name)}</td><td class="l">${escapeHtml(fr.type)}</td><td>${fr.front_rate.toFixed(2)}</td></tr>`).join('');
      tableHtml = `
        <table class="kg">
          <thead><tr><th>番</th><th class="l">馬名</th><th class="l">分類</th><th>先行率</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    }
    let statHtml = '';
    if (p.front_pressure) {
      const mainNige = p.front_pressure.main_nige || [];
      const nigeText = mainNige.length ? `（主逃げ=${mainNige.map((n) => escapeHtml(n)).join('・')}）` : '';
      statHtml = `<div class="statline">先行圧指数 <span class="big">${p.front_pressure.index.toFixed(2)}</span> → ${escapeHtml(p.front_pressure.label)}${nigeText}</div>`;
    }
    if (tableHtml || statHtml) {
      sections.push(`<div class="subh">逃げ候補・先行圧</div>${tableHtml}${statHtml}`);
    }
  }

  // (f) 展開シナリオ
  if (p.scenario) {
    const blocks = [
      { key: 'main', cls: '' },
      { key: 'sub', cls: ' sub' },
      { key: 'other', cls: ' etc' },
    ];
    const blocksHtml = blocks.map(({ key, cls }) => {
      const s = p.scenario[key];
      if (!s) return '';
      const favs = s.favorites || [];
      const favText = favs.length
        ? favs.map((f) => `<span class="nm">${umaBox(Number(f.number), (byNumberOv[f.number] || {}).gate, 'sm')} ${escapeHtml(f.name)}</span>`).join('・')
        : '該当薄';
      return `
        <div class="scn${cls}">
          <div class="hd"><span class="p">${Math.round(s.prob * 100)}%</span> ${escapeHtml(s.title)}</div>
          <div class="fav"><span class="tag">${escapeHtml(s.type_tag)}</span> ${favText}</div>
        </div>
      `;
    }).join('');
    sections.push(`<div class="subh">展開シナリオ</div>${blocksHtml}`);
  }

  return `
    <div class="secthead">展開・レース分析</div>
    ${sections.join('')}
  `;
}

function renderHorsesAccordion20(site) {
  const horses = [...site.horses].sort((a, b) => {
    if (a.scratched && b.scratched) return a.number - b.number;
    if (a.scratched) return 1;
    if (b.scratched) return -1;
    return b.total - a.total;
  });
  const itemsHtml = horses.map((h) => {
    if (h.scratched) {
      return `<div class="acchead">${umaBox(h.number, h.gate)} ${escapeHtml(h.name)}<span class="sc">取消</span></div>`;
    }
    const factorsRows = (h.factors || []).map((f) => {
      const items = f.items || [];
      const itemsHtml = items.length
        ? items.map((it) => it.sign === '+'
            ? `<div class="fac p">＋ ${escapeHtml(it.label)}</div>`
            : `<div class="fac m">− ${escapeHtml(it.label)}</div>`).join('')
        : `<div class="fac z">・ 標準</div>`;
      return `<tr><td class="item">${escapeHtml(f.label)}</td><td class="pt">${f.score}</td><td>${itemsHtml}</td></tr>`;
    }).join('');
    return `
      <div class="acchead" data-acc="${h.number}">
        ${umaBox(h.number, h.gate)} ${escapeHtml(h.name)}
        <span class="gr grade ${gradeClass(h.grade)}">${gradeDisp(h.grade)}</span>
        <span class="sc">${fmtNum(h.total, 1)}</span><span class="tri">▸</span>
      </div>
      <div class="accbody">
        <table class="dim">
          ${factorsRows}
          <tr class="tot"><td class="item">総合</td><td class="pt">${fmtNum(h.total, 1)}</td><td><span class="grade ${gradeClass(h.grade)}">${gradeDisp(h.grade)}</span></td></tr>
        </table>
      </div>
    `;
  }).join('');
  return `
    <div class="secthead">個別評価<span class="cnt">全${site.race.field_size}頭・タップで開閉</span></div>
    <div class="accctl"><button type="button" data-accall="open">全部開く</button><button type="button" data-accall="close">全部閉じる</button></div>
    <div class="acc">${itemsHtml}</div>
  `;
}

function setupAccordion20() {
  const root = document.querySelector('.race20');
  if (!root) return; // 1.xページでは対象DOM不在のため何もしない
  root.addEventListener('click', (e) => {
    const allBtn = e.target.closest('[data-accall]');
    if (allBtn) {
      const openAll = allBtn.dataset.accall === 'open';
      root.querySelectorAll('.accbody').forEach((body) => {
        body.classList.toggle('open', openAll);
        const tri = body.previousElementSibling && body.previousElementSibling.querySelector('.tri');
        if (tri) tri.textContent = openAll ? '▾' : '▸';
      });
      return;
    }
    const head = e.target.closest('.acchead[data-acc]');
    if (!head) return;
    const body = head.nextElementSibling;
    if (!body || !body.classList.contains('accbody')) return;
    body.classList.toggle('open');
    head.querySelector('.tri').textContent = body.classList.contains('open') ? '▾' : '▸';
  });
}

// result/verificationの契約は1.1と共通（22-spec T4）。着順表・払戻表ロジックは
// 既存renderVerificationSection（:245-333）をコピー元として参照（23-spec §3-10）
function renderVerification20(site) {
  if (site.status !== 'final') {
    return `<div class="secthead">答え合わせ</div><div class="kv">結果はレース後に反映されます</div>`;
  }
  const result = site.result;
  const verification = site.verification;
  if (!result || !verification) return '';

  const byNumber = {};
  for (const h of site.horses) byNumber[h.number] = h;

  const topRows = result.top3.map((t) => {
    const h = byNumber[t.number];
    const markCell = h ? (h.ability_mark ?? (h.bet_mark === '地雷' ? '地雷' : '—')) : '—';
    return `<tr><td>${t.finish}</td><td class="name">${umaBox(t.number, h && h.gate, 'sm')} ${escapeHtml(t.name)}</td><td>${t.popularity}</td><td>${t.odds}</td><td class="l">${escapeHtml(markCell)}</td></tr>`;
  }).join('');

  const paceMatch = verification.pace_match;
  const paceCls = paceMatch === true ? ' ok' : paceMatch === false ? ' ng' : '';
  const paceIcon = paceMatch === true ? ' ✓' : paceMatch === false ? ' ✕' : '';
  const paceExpected = site.prediction.pace_class ?? site.prediction.pace;
  const paceRow = `<div class="vrow"><span class="vlabel">ペース</span><span class="vchip${paceCls}">予想 ${escapeHtml(paceExpected)} → 実際 ${escapeHtml(result.pace)}${paceIcon}</span></div>`;

  const markOrder = { '◎': 0, '○': 1, '▲': 2, '△': 3 };
  const markClsMap = { '◎': 'm-hon', '○': 'm-tai', '▲': 'm-tan', '△': 'm-oku' };
  const markFinishEntries = Object.entries(verification.mark_finishes || {}).map(([k, finish]) => {
    const m = k.match(/^(.+)\((\d+)\)$/);
    return m ? { mark: m[1], number: m[2], finish } : null;
  }).filter(Boolean).sort((a, b) => {
    const ma = a.mark in markOrder ? markOrder[a.mark] : 9;
    const mb = b.mark in markOrder ? markOrder[b.mark] : 9;
    return ma - mb;
  });
  const markgridHtml = markFinishEntries.map((e) => {
    const hitCls = e.finish <= 3 ? ' hit' : '';
    const eh = byNumber[e.number];
    return `<div class="mg${hitCls}"><span class="mkb ${markClsMap[e.mark] || ''}">${escapeHtml(e.mark)}</span>${umaBox(Number(e.number), eh && eh.gate, 'sm')}<span class="pos">${e.finish}着</span></div>`;
  }).join('');
  const markSection = markFinishEntries.length
    ? `<div class="vsub">印別の着順（緑=馬券圏内）</div><div class="markgrid">${markgridHtml}</div>`
    : '';

  const landmineEntries = Object.entries(verification.landmine_result || {});
  const jgridHtml = landmineEntries.map(([number, lr]) => {
    const h = byNumber[number];
    const name = h ? escapeHtml(h.name) : '—';
    const box = umaBox(Number(number), h && h.gate, 'sm');
    const cls = lr.ok ? 'ok' : 'ng';
    const icon = lr.ok ? '✓' : '✕';
    const text = lr.ok
      ? `${icon} ${box} ${name} ${lr.finish}着 — 圏外に沈め成功`
      : `${icon} ${box} ${name} ${lr.finish}着 — 3着内に好走、判定ミス`;
    return `<span class="jchip ${cls}">${text}</span>`;
  }).join('');
  const landmineSection = landmineEntries.length
    ? `<div class="vsub">地雷判定</div><div class="jgrid">${jgridHtml}</div>`
    : '';

  const payoutRows = Object.entries(result.payouts || {})
    .map(([type, val]) => {
      const list = Array.isArray(val) ? val : [val];
      const label = payoutTypeLabel(type);
      const line = list
        .map((pv) => `${comboBoxes(label, pv.combination, byNumber)} ${fmtYen(pv.payout)}${pv.popularity ? `（${pv.popularity}人気）` : ''}`)
        .join(' / ');
      return `<tr><td class="l">${escapeHtml(label)}</td><td class="l">${line}</td></tr>`;
    })
    .join('');

  return `
    <div class="secthead">答え合わせ<span class="cnt">結果確定</span></div>
    <table class="fixed" style="font-size:12.5px">
      <colgroup><col style="width:12%"><col style="width:44%"><col style="width:14%"><col style="width:14%"><col style="width:16%"></colgroup>
      <thead><tr><th>着</th><th class="l">馬名</th><th>人気</th><th>オッズ</th><th class="l">印</th></tr></thead>
      <tbody>${topRows}</tbody>
    </table>
    <div class="vcard">
      ${paceRow}
      ${markSection}
      ${landmineSection}
    </div>
    <details class="fold"><summary><span class="tri"></span>払戻表</summary>
      <div class="fold-body"><table><tbody>${payoutRows}</tbody></table></div>
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

  const is20 = site.schema_version === 'keiba-log-2.0';
  const html = is20 ? buildRace20Html(site, oddsAll) : `
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
  if (is20) setupAccordion20();
}

main();

})();
