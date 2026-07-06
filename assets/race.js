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

// ===== 印まとめ（項目3: 独立セクション。印+馬番+馬名のみ。mockup-4のフラット骨格） =====
function renderMarksSection(site) {
  const order = ['◎', '○', '▲', '△'];
  const rows = [];
  [...site.horses]
    .filter((h) => h.ability_mark)
    .sort((a, b) => order.indexOf(a.ability_mark) - order.indexOf(b.ability_mark))
    .forEach((h) => rows.push(`<div class="marks-row">${markBadge(h.ability_mark)}<span class="no">${h.number}</span><span class="nm">${escapeHtml(h.name)}</span></div>`));
  site.horses
    .filter((h) => h.role === '穴')
    .forEach((h) => rows.push(`<div class="marks-row"><span class="mkb m-ana">穴</span><span class="no">${h.number}</span><span class="nm">${escapeHtml(h.name)}</span></div>`));
  site.horses
    .filter((h) => h.bet_mark === '地雷')
    .forEach((h) => rows.push(`<div class="marks-row"><span class="mkb m-jir">地雷</span><span class="no">${h.number}</span><span class="nm">${escapeHtml(h.name)}</span></div>`));
  const body = rows.length ? rows.join('') : '<div class="marks-row">見送り（印なし）</div>';
  return `
    <details class="fold" open>
      <summary><span class="tri"></span>印</summary>
      <div class="fold-body"><div class="marks">${body}</div></div>
    </details>
  `;
}

// ===== 4.2 印まとめ（項目2/3: §7結論の文章・印まとめの説明文は廃止。印+馬番+馬名のみ） =====
function renderConclusionCard(site) {
  const p = site.prediction;
  if (p.stance === 'pass') {
    const abilityMarks = site.horses.filter((h) => h.ability_mark);
    const betMarks = site.horses.filter((h) => h.bet_mark);
    return `
      <div class="concl">
        <div class="h">結論</div>
        <p>今回は見送りレースです。</p>
        ${abilityMarks.length || betMarks.length ? renderMarksBlock(site) : ''}
      </div>
    `;
  }
  return `
    <div class="concl">
      <div class="h">結論</div>
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
    return `<div class="secthead">買い目</div><div>見送り（買い目なし）</div>`;
  }
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
        <td class="l">${escapeHtml(b.type)}</td>
        <td>${b.combination.join('-')}</td>
        <td>${fmtYen(b.stake ?? b.tickets.length * 100)}</td>
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
    <div class="secthead">買い目<span class="cnt">${totalPoints}点 ${fmtYen(totalCost)}</span></div>
    <table><thead>${header}</thead><tbody>${rows}</tbody></table>
    ${totalLine}
  `;
}

function renderBetsSection(site) {
  if (site.schema_version === 'keiba-log-1.1') return renderBetsSectionV11(site);

  const bets = site.bets || [];
  const totalPoints = bets.reduce((sum, b) => sum + b.tickets.length, 0);
  if (!bets.length) {
    return `<div class="secthead">買い目</div><div>見送り（買い目なし）</div>`;
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
    <div class="secthead">買い目<span class="cnt">${totalPoints}点 ${totalPoints * 100}円</span></div>
    <table><thead>${header}</thead><tbody>${rows}</tbody></table>
    ${totalLine}
  `;
}

// ===== 4.4 答え合わせ =====
function renderVerificationSection(site) {
  if (site.status === 'cancelled') return '';
  if (site.status !== 'final') {
    return `<div class="secthead">答え合わせ</div><div class="kv">結果はレース後に反映されます</div>`;
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

  const paceChipCls = verification.pace_match === true ? 'ok' : verification.pace_match === false ? 'ng' : '';
  const paceChip = `<span class="vchip ${paceChipCls}">予想 ${escapeHtml(site.prediction.pace)} → 実際 ${escapeHtml(result.pace ?? '—')} ${paceMatchIconOf(verification.pace_match)}</span>`;

  const markChips = Object.entries(verification.mark_finishes || {})
    .map(([k, finish]) => {
      const inTop3 = typeof finish === 'number' && finish <= 3;
      return `<span class="mg${inTop3 ? ' hit' : ''}">${escapeHtml(k)} ${finish}着</span>`;
    })
    .join('');

  const landmineNumbers = Object.keys(verification.landmine_result || {}).sort((a, b) => Number(a) - Number(b));
  const landmineChips = landmineNumbers
    .map((n) => {
      const lr = verification.landmine_result[n];
      return `<span class="jchip ${lr.ok ? 'ok' : 'ng'}">${lr.ok ? '✓' : '✕'} ${n} ${lr.finish}着</span>`;
    })
    .join('');

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
    <div class="secthead">答え合わせ</div>
    <table>
      <thead><tr><th class="l">着</th><th class="l">馬</th><th>人気</th><th class="l sep">印</th></tr></thead>
      <tbody>${topRows}</tbody>
    </table>
    <div class="vcard">
      <div class="vrow">${paceChip}</div>
      ${markChips ? `<div class="vsub">印別の着順（緑=馬券圏内）</div><div class="markgrid">${markChips}</div>` : ''}
      ${landmineChips ? `<div class="vsub">地雷判定</div><div class="jgrid">${landmineChips}</div>` : ''}
    </div>
    ${biasLine}
    <details class="fold"><summary><span class="tri"></span>払戻表</summary>
      <div class="fold-body"><table><tbody>${payoutRows}</tbody></table></div>
    </details>
    ${summaryLines.join('')}
  `;
}

function paceMatchIconOf(v) {
  return v === true ? '✓' : v === false ? '✕' : '—';
}

// ===== ①全頭評価表（項目8: 印を独立列に分離・馬名フル幅／項目9: grade列／項目11: キャプション削除） =====
function renderAllHorsesTable(site) {
  const v11 = site.schema_version === 'keiba-log-1.1';
  const rows = [...site.horses]
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    .map((h) => {
      if (h.scratched) {
        return `<tr class="scratched"><td>${h.rank ?? '—'}</td><td class="mkc"></td><td>${h.number}</td><td class="name">${escapeHtml(h.name)}</td><td colspan="4">取消</td></tr>`;
      }
      const rowCls = h.ability_mark ? ' class="pred"' : '';
      const extraChips = v11
        ? `${h.role ? roleChip(h.role) : ''}${h.bet_mark === '地雷' ? mineChip() : ''}${marketEvalChip(h.market_eval)}`
        : '';
      return `
        <tr${rowCls}>
          <td>${h.rank ?? '—'}</td>
          <td class="mkc">${h.ability_mark ? markBadge(h.ability_mark) : ''}</td>
          <td>${h.number}</td>
          <td class="name">${escapeHtml(h.name)}${extraChips}</td>
          <td>${fmtNum(h.total, 1)}</td>
          <td>${h.odds ?? '—'}</td>
          <td>${h.popularity ?? '—'}</td>
          <td>${h.grade ? gradeBadge(h.grade) : '—'}</td>
        </tr>
      `;
    })
    .join('');
  return `
    <details class="fold" open>
      <summary><span class="tri"></span>全頭評価表<span class="cnt">${site.horses.length}頭</span></summary>
      <div class="fold-body">
        <table class="fixed">
          <colgroup><col style="width:7%"><col style="width:8%"><col style="width:7%"><col style="width:29%">
            <col style="width:13%"><col style="width:14%"><col style="width:9%"><col style="width:13%"></colgroup>
          <thead><tr><th>順</th><th>印</th><th>番</th><th class="l">馬名</th><th>総合</th><th>オッズ</th><th>人気</th><th>評価</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
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
    <details class="fold" open>
      <summary><span class="tri"></span>勝率・期待値表<span class="cnt">${horses.length}頭</span></summary>
      <div class="fold-body">
        <table class="fixed" style="font-size:12px">
          <colgroup><col style="width:37%"><col style="width:8%"><col style="width:11%">
            <col style="width:11%"><col style="width:16%"><col style="width:17%"></colgroup>
          <thead><tr><th class="l">馬名</th><th>勝率</th><th class="sep">適正</th><th class="sep">現在</th>
            <th class="sep">期待値</th><th class="l sep">評価</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </details>
  `;
}

// ===== 項目19: §2情報ブロック（1行ずつ改行） =====
function renderInfoBlock(site) {
  const r = site.race;
  const bd = site.prediction && site.prediction.baba_detail;
  const babaStr = (bd && bd.going_weather) ? escapeHtml(bd.going_weather) : (r.going ? escapeHtml(r.going) : '—');
  const rows = [
    ['コース', `${r.surface}${r.distance}m${r.direction ? '（' + escapeHtml(r.direction) + '）' : ''}`],
    ['馬場', babaStr],
    ['頭数', `${r.field_size}頭`],
    ['クラス', r.class ? escapeHtml(r.class) : '—'],
  ];
  return `<div class="info1">${rows.map(([k, v]) => `<div class="irow"><b>${k}</b> ${v}</div>`).join('')}</div>`;
}

// ===== 項目1/20: 馬場踏み込み表示＋この馬場が得意な馬 =====
function renderBabaDetailBlock(site) {
  const b = site.prediction.baba_detail;
  if (!b) return '';
  const favLine = b.favorites && b.favorites.length
    ? `<div class="l2"><span class="h">この馬場が得意</span>${b.favorites.map((f) => `<span class="fav"><span class="nm">${f.number} ${escapeHtml(f.name)}</span><span class="rs">${escapeHtml(f.reason || '')}</span></span>`).join('')}</div>`
    : '';
  return `<div class="babadetail"><div class="l1">${escapeHtml(b.display_text)}</div>${favLine}</div>`;
}

// ===== 項目6: 展開シナリオ（見出し＋確率＋有利馬3頭＋タイプ札） =====
function renderScenarioBlock(site) {
  const s = site.prediction.scenario;
  if (!s) return '';
  const rowHtml = (key, label) => {
    const v = s[key];
    if (!v) return '';
    const favs = v.favorites && v.favorites.length
      ? v.favorites.map((f) => `${f.number} ${escapeHtml(f.name)}`).join('・')
      : '該当薄';
    return `<div class="scn"><b>${label}（${Math.round(v.prob * 100)}%）: ${escapeHtml(v.title)}</b>
      <span class="tag">${escapeHtml(v.type_tag)}</span><div class="favs">${favs}</div></div>`;
  };
  return `<div class="scenario">${rowHtml('main', 'メイン展開')}${rowHtml('sub', 'サブ展開')}${rowHtml('other', 'その他')}</div>`;
}

// ===== 項目18: 内外バイアス（カラーストリップ） =====
function biasBand(ratio) {
  if (ratio >= 1.15) return 'b1';
  if (ratio >= 1.05) return 'b2';
  if (ratio >= 0.95) return 'b3';
  if (ratio >= 0.85) return 'b4';
  return 'b5';
}
function renderInnerOuterStrip(site) {
  const bias = site.prediction.inner_outer_bias;
  if (!bias || !bias.gates || !bias.gates.length) return '';
  const cells = bias.gates.map((g) =>
    `<div class="cell ${biasBand(g.ratio)}"><div class="g">${g.gate}枠</div><div class="v">${g.ratio.toFixed(2)}</div></div>`
  ).join('');
  return `<div class="biaslabel"><b>内外バイアス</b> ${escapeHtml(bias.label)}</div>
    <div class="strip">${cells}</div>
    <div class="striplegend">濃緑=有利 / 薄緑=やや有利 / 灰=標準 / 薄赤=やや不利 / 濃赤=不利（1.0=標準）</div>`;
}

// ===== 脚質傾向テーブル（mockup準拠。BE emit の leg_bias を描画） =====
function renderLegBiasTable(site) {
  const lb = site.prediction && site.prediction.leg_bias;
  if (!lb || !lb.length) return '';
  const jc = (j) => (j === '有利' || j === 'やや有利') ? 'good' : (j === '不利' ? 'vbad' : (j === 'やや不利' ? 'bad' : ''));
  const rows = lb.map((r) =>
    `<tr><td class="l">${escapeHtml(r.style)}</td><td>${r.win_rate}</td><td>${r.rentai_rate}</td><td>${r.fukusho_rate}</td><td>${r.runs}</td><td class="l sep"><span class="jw ${jc(r.judgment)}">${escapeHtml(r.judgment)}</span></td></tr>`
  ).join('');
  return `
    <div class="subh">脚質傾向（コースデータ）</div>
    <table class="fixed">
      <colgroup><col style="width:16%"><col style="width:14%"><col style="width:14%"><col style="width:14%"><col style="width:14%"><col style="width:28%"></colgroup>
      <thead><tr><th class="l">脚質</th><th>勝率</th><th>連対</th><th>複勝</th><th>走数</th><th class="l sep">判定</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ===== 項目21: 逃げ候補・先行圧（数値テーブル） =====
function renderFrontRunnersTable(site) {
  const fr = site.prediction.front_runners;
  if (!fr || !fr.length) return '';
  const rows = fr.map((f) => `<tr><td>${f.number}</td><td class="l">${escapeHtml(f.name)}</td><td class="l">${escapeHtml(f.type)}</td><td>${f.front_rate.toFixed(2)}</td></tr>`).join('');
  const fp = site.prediction.front_pressure;
  let statline = '';
  if (fp && fp.index != null) {
    const clause = fp.label === '高い' ? '。先行馬が多く楽な逃げにはなりにくい'
      : fp.label === '低い' ? '。ハナを主張する馬が少なく緩みやすい' : '';
    const nige = (fp.main_nige && fp.main_nige.length) ? `（主逃げ=${escapeHtml(fp.main_nige.join('・'))}）` : '（主逃げ不在）';
    statline = `<div class="statline"><b>先行圧指数</b><span class="big">${fp.index}</span>→ ${escapeHtml(fp.label)}${clause}${nige}</div>`;
  }
  return `
    <div class="subh">逃げ候補・先行圧</div>
    <table class="fixed">
      <colgroup><col style="width:12%"><col style="width:38%"><col style="width:30%"><col style="width:20%"></colgroup>
      <thead><tr><th>番</th><th class="l">馬名</th><th class="l">分類</th><th>先行率</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${statline}
  `;
}

// ===== ③展開・レース分析 =====
function renderOverviewFold(site) {
  const md = site.sections && site.sections.overview_md;
  return `
    <details class="fold" open>
      <summary><span class="tri"></span>展開・レース分析</summary>
      <div class="fold-body">
        ${renderInfoBlock(site)}
        ${renderBabaDetailBlock(site)}
        ${renderLegBiasTable(site)}
        ${renderInnerOuterStrip(site)}
        ${renderFrontRunnersTable(site)}
        ${renderScenarioBlock(site)}
      </div>
    </details>
  `;
}

// ===== ④個別評価（項目14/15/16: 全頭アコーディオン＋①〜⑧＋/−ラベル。加重列は出力しない） =====
function renderFactorsTable(factors, total) {
  if (!factors || !factors.length) return '<div class="prose">データなし</div>';
  const ptFmt = (v) => (v == null ? '—' : (Number.isInteger(v) ? String(v) : fmtNum(v, 1)));
  const rows = factors.map((f) => {
    const items = (f.items || [])
      .map((it) => `<span class="fac ${it.sign === '+' ? 'plus' : 'minus'}">${it.sign === '+' ? '＋' : '−'} ${escapeHtml(it.label)}</span>`)
      .join('');
    return `<tr><td class="item">${escapeHtml(f.label)}</td><td class="pt">${ptFmt(f.score)}</td><td class="l">${items || '—'}</td></tr>`;
  }).join('');
  const totalRow = (total != null)
    ? `<tr class="tot"><td class="item">総合</td><td class="pt">${fmtNum(total, 1)}</td><td class="l"></td></tr>`
    : '';
  return `<table class="dim"><tbody>${rows}${totalRow}</tbody></table>`;
}

function renderHorsesFold(site) {
  const horses = [...site.horses].filter((h) => !h.scratched).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const blocksHtml = horses.map((h) => {
    const heading = `${markBadge(h.ability_mark)}${h.number} ${escapeHtml(h.name)}${h.grade ? gradeBadge(h.grade) : ''}<span class="sc">${fmtNum(h.total, 1)}</span>`;
    const openAttr = h.ability_mark === '◎' ? ' open' : '';
    return `
      <details class="subfold"${openAttr}>
        <summary><span class="tri"></span>${heading}</summary>
        <div class="fold-body">${renderFactorsTable(h.factors, h.total)}</div>
      </details>
    `;
  }).join('');

  return `
    <details class="fold" open>
      <summary><span class="tri"></span>個別評価<span class="cnt">全${horses.length}頭・タップで開閉</span></summary>
      <div class="fold-body">${blocksHtml}</div>
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
    ${renderMarksSection(site)}
    ${renderAllHorsesTable(site)}
    ${renderEvTable(site)}
    ${renderOverviewFold(site)}
    ${renderHorsesFold(site)}
    ${renderBetsSection(site)}
    ${renderVerificationSection(site)}
  `;
  document.getElementById('race-content').innerHTML = html;
}

main();

})();
