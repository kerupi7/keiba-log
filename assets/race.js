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

// 末脚ティア（狙い3頭の脇に出す語）。データ側は keiba_score_s2.py:kick_tier() が
// 抜群/上位/並/見劣り/不明 を入れてくる。
// 2026-07-27より前に生成した race JSON は ◎/○/空文字 の旧3段なので、ここで読み替える
// （旧データの空文字は「遅い」と「材料なし」を区別できないため、そのまま非表示に倒す）。
const KICK_TIER_LEGACY = { '◎': '抜群', '○': '上位' };
const KICK_TIER_CLASS = { '抜群': 'k-top', '上位': 'k-high', '並': 'k-mid', '見劣り': 'k-low', '不明': 'k-na' };
function kickTierLabel(tier) {
  return KICK_TIER_LEGACY[tier] || tier || '';
}
function kickTierClass(tier) {
  return KICK_TIER_CLASS[tier] || 'k-mid';
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
      // 地雷の理由文（87-spec §3.2: 「{odds}倍({pop}番人気)だが3着内を外す確率は{p_out}%
      // （オッズ相応なら{p_market}%）」）はp_out/p_marketの両方を読める文面で保持済みなので、
      // 一般ひとこと(verdict)より地雷理由を優先して表示する。
      const text = h.bet_mark === '地雷' ? (h.landmine_reason || h.verdict || '—') : (h.verdict || '—');
      return `<div class="verdict-line">${badge}${umaBox(h.number, h.gate, 'sm')} ${escapeHtml(h.name)} — ${escapeHtml(text)}</div>`;
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
    ? '<tr><th class="l">券種</th><th class="l">買い目</th><th>金額</th><th class="l">狙い</th><th>結果</th><th>払戻</th></tr>'
    : '<tr><th class="l">券種</th><th class="l">買い目</th><th>金額</th><th class="l">狙い</th></tr>';
  const rows = bets.map((b) => {
    const resultCell = showResult
      ? `<td class="${b.hit ? 'o' : 'x'}">${b.hit ? '✓' : '✕'}</td><td>${fmtYen(b.payout)}</td>`
      : '';
    return `
      <tr>
        <td class="l">${escapeHtml(b.type.replace('三連', '3連'))}</td>
        <td class="l">${comboBoxes(b.type, b.combination, byNumberV11)}</td>
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
    ? '<tr><th class="l">券種</th><th class="l">買い目</th><th>ライン</th><th>結果</th><th>払戻</th></tr>'
    : '<tr><th class="l">券種</th><th class="l">買い目</th><th>ライン</th></tr>';
  const rows = bets.map((b) => {
    const resultCell = showResult
      ? `<td class="${b.hit ? 'o' : 'x'}">${b.hit ? '✓' : '✕'}</td><td>${fmtYen(b.payout)}</td>`
      : '';
    return `
      <tr>
        <td class="l">${escapeHtml(b.type.replace('三連', '3連'))}</td>
        <td class="l">${comboBoxes(b.type, b.combination, byNumberBets)}</td>
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
  // 91-race-review-spec.md: 回顧が入っているレースは新しい3ブロックで描く。
  // 未処理の過去レースは従来の答え合わせにそのまま落ちる（バックフィルまでの互換）。
  if (site.review) return renderReviewSection(site);
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

// ===== 4.4b レース回顧（91-race-review-spec.md）=====
// 画面に出す数字は、それだけで意味が通じるものに限る（着順・人気・通過順・時計・払戻）。
// 判定の根拠（件数・有意差・該当率）は仕様書に置き、ここには出さない。

const REVIEW_CORNER_GAP = { '': 5, ',': 17, '-': 34, '=': 58 };

// netkeibaのコーナー表記を [{sep, nums, lead}] に分解する。
// 記号はすべて「前の馬との間隔」を表すので、記号のままではなく横のすき間で描く。
function reviewParseCorner(txt) {
  const out = [];
  let sep = '';
  let i = 0;
  while (i < txt.length) {
    const ch = txt[i];
    if (ch === ',' || ch === '-' || ch === '=') { sep = ch; i += 1; continue; }
    if (ch === '(') {
      const j = txt.indexOf(')', i);
      if (j < 0) break;
      let lead = null;
      const nums = [];
      for (let tok of txt.slice(i + 1, j).split(',')) {
        tok = tok.trim();
        if (tok.startsWith('*')) { tok = tok.slice(1); lead = tok; }
        if (/^\d+$/.test(tok)) nums.push(tok);
      }
      out.push({ sep, nums, lead });
      sep = ''; i = j + 1; continue;
    }
    const m = /^\*?(\d+)/.exec(txt.slice(i));
    if (m) { out.push({ sep, nums: [m[1]], lead: null }); sep = ''; i += m[0].length; continue; }
    i += 1;
  }
  return out;
}

function renderReviewCorners(review, byNumber, top3) {
  const raw = (review.race && review.race.corners) || {};
  const keys = Object.keys(raw).sort();
  if (!keys.length) return '';
  const rows = keys.map((k) => {
    const parts = reviewParseCorner(raw[k]).map((el, idx) => {
      const boxes = el.nums.map((t) => {
        const n = Number(t);
        const h = byNumber[n] || {};
        const cls = top3[n] ? ' rv-top' : '';
        return `${el.lead === t ? '<i class="rv-lead">▸</i>' : ''}<span class="rv-um${cls}">${umaBox(n, h.gate, 'sm')}</span>`;
      }).join('');
      const grp = `<span class="rv-grp${el.nums.length > 1 ? ' multi' : ''}">${boxes}</span>`;
      if (idx === 0) return grp;
      const w = REVIEW_CORNER_GAP[el.sep] ?? 5;
      return `<span class="rv-gap" style="width:${w}px"></span>${el.sep === '=' ? '<span class="rv-far"></span>' : ''}${grp}`;
    }).join('');
    return `<tr><th class="l">${escapeHtml(k[0])}コーナー</th><td class="l rv-seq">${parts}</td></tr>`;
  }).join('');
  return `<div class="rv-corner"><div class="rv-cap">コーナー通過順位</div>
    <table class="rv-ctbl"><tbody>${rows}</tbody></table>
    <details class="fold"><summary><span class="tri"></span>記号の見方</summary>
      <div class="fold-body"><table><tbody>
        <tr><th class="l">かたまり</th><td class="l">1馬身未満で並んでいる馬群。内側の馬番から並べる</td></tr>
        <tr><th class="l">▸</th><td class="l">その馬群の中でいちばん前にいる馬</td></tr>
        <tr><th class="l">すき間</th><td class="l">広いほど前の馬から離れている</td></tr>
        <tr><th class="l">太い枠</th><td class="l">1〜3着の馬</td></tr>
      </tbody></table></div>
    </details></div>`;
}

// ラップ推移。縦軸は速いほど上（秒をそのまま上向きにすると直感と逆になる）
function renderReviewLap(lap, splits) {
  if (!lap || !splits || splits.length < 4) return '';
  const n = splits.length;
  const half = Math.floor(n / 2);
  const mn = Math.min(...splits);
  const rng = (Math.max(...splits) - mn) || 1;
  const x0 = 34; const x1 = 612; const yTop = 20; const yBot = 96;
  const px = (i) => (n > 1 ? x0 + (x1 - x0) * (i / (n - 1)) : (x0 + x1) / 2);
  const py = (s) => yTop + ((s - mn) / rng) * (yBot - yTop);
  const pts = splits.map((s, i) => [px(i), py(s)]);
  const xmid = (px(half - 1) + px(half)) / 2;
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const dots = pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2" class="${i < half ? 'rv-pf' : 'rv-pb'}"/>`).join('');
  const vals = pts.map((p, i) => `<text x="${p[0].toFixed(1)}" y="${(p[1] - 9).toFixed(1)}" class="rv-vt">${splits[i].toFixed(1)}</text>`).join('');
  return `<div class="rv-lap"><svg viewBox="0 0 640 130" class="rv-lapsvg">
    <rect x="${x0 - 12}" y="${yTop - 12}" width="${xmid - x0 + 12}" height="${yBot - yTop + 22}" class="rv-bandf"/>
    <rect x="${xmid}" y="${yTop - 12}" width="${x1 - xmid + 12}" height="${yBot - yTop + 22}" class="rv-bandb"/>
    <polyline points="${line}" class="rv-lapline"/>${dots}${vals}
    <text x="${((x0 + xmid) / 2).toFixed(0)}" y="${yBot + 26}" class="rv-ht">前半 ${lap.front.toFixed(1)}秒</text>
    <text x="${((xmid + x1) / 2).toFixed(0)}" y="${yBot + 26}" class="rv-ht">後半 ${lap.back.toFixed(1)}秒</text>
  </svg></div>
  <div class="rv-note">上にあるほど速いハロン。前後半の差 ${lap.diff > 0 ? '+' : ''}${lap.diff.toFixed(1)}秒。</div>`;
}

// ===== 4.4a 着順表（95-finish-order-spec.md）=====
// netkeiba の結果表と同じ列・同じ順で並べる。1〜5着は常時、6着以下は折りたたみ。
// 値が1頭も無い列は列ごと落とす（"—"だけの列を作らない）。過去レースでは
// 厩舎（原簿に無い）や通過順（settle時にnetkeiba側が未記入）が落ちることがある。
const FO_TOP_N = 5;

function foMark(h) {
  if (h.ability_mark) {
    const cls = { '◎': 'm-hon', '○': 'm-tai', '▲': 'm-tan', '△': 'm-oku' }[h.ability_mark] || '';
    return `<span class="mkb ${cls}">${escapeHtml(h.ability_mark)}</span>`;
  }
  if (h.bet_mark === '地雷') return '<span class="mkb m-jir">地雷</span>';
  return '';
}

// 1位=金 / 2位=銀 / 3位=銅。着順ボックス・勝率の配色（.ag.f1〜f3）と共通。
const MEDAL_CLS = { 1: 'f1', 2: 'f2', 3: 'f3' };

// 各列 = { label, cls, has(h), cell(h, ctx) }。has を持たない列は常に出す。
const FO_COLS = [
  { label: '着', cls: 'fo-c1 num', cell: (h) => (h.finish != null ? h.finish : escapeHtml(h.finish_text || '—')) },
  // 枠番の列は持たない。枠の情報は馬番ボックスの色（frameClass）で示す。
  { label: '馬番', cls: 'fo-c2 num', cell: (h) => umaBox(h.number, h.gate, 'sm') },
  { label: '印', cls: 'fo-mk', has: (h) => !!h.ability_mark || h.bet_mark === '地雷', cell: foMark },
  { label: '馬名', cls: 'fo-nm', cell: (h) => escapeHtml(h.name) },
  { label: '性齢', cls: 'num sub', has: (h) => !!h.sex_age, cell: (h) => escapeHtml(h.sex_age || '—') },
  { label: '斤量', cls: 'num sub', has: (h) => h.weight_carried != null,
    cell: (h) => (h.weight_carried != null ? h.weight_carried.toFixed(1) : '—') },
  { label: '騎手', cls: 'sub', has: (h) => !!h.jockey, cell: (h) => escapeHtml(h.jockey || '—') },
  { label: 'タイム', cls: 'num fo-tm', has: (h) => !!h.finish_time,
    cell: (h) => escapeHtml(h.finish_time || '—') },
  { label: '着差', cls: 'num sub', has: (h) => !!h.margin,
    cell: (h) => (h.finish === 1 ? '' : escapeHtml(h.margin || '—')) },
  // 人気は1・2・3番人気を金・銀・銅で塗る（セルの背景ではなく数字のボックス）
  { label: '人気', cls: 'num', has: (h) => h.popularity != null,
    cell: (h) => (h.popularity == null ? '—'
      : medalSpan(h.popularity, MEDAL_CLS[h.popularity] || '', `${h.popularity}番人気`)) },
  { label: '単勝', cls: 'num', has: (h) => h.final_odds != null,
    cell: (h) => (h.final_odds != null ? h.final_odds.toFixed(1) : '—') },
  // 上り3Fは速い順に金・銀・銅。同タイムは同じ色（重複を除いた値で順位を決める）
  { label: '上り3F', cls: 'num', has: (h) => h.last_3f != null,
    cell: (h, ctx) => {
      if (h.last_3f == null) return '—';
      const i = ctx.l3Top.indexOf(h.last_3f);
      return medalSpan(h.last_3f.toFixed(1), MEDAL_CLS[i + 1] || '', i >= 0 ? `上り3F ${i + 1}位` : '');
    } },
  { label: '通過', cls: 'num sub', has: (h) => !!h.passing, cell: (h) => escapeHtml(h.passing || '—') },
  { label: '厩舎', cls: 'sub', has: (h) => !!h.trainer, cell: (h) => escapeHtml(h.trainer || '—') },
  { label: '馬体重', cls: 'num sub', has: (h) => !!h.body_weight, cell: (h) => escapeHtml(h.body_weight || '—') },
];

function renderFinishOrder(site) {
  const runners = (site.horses || []).filter((h) => !h.scratched && (h.finish != null || h.finish_text));
  if (!runners.length) return '';
  runners.sort((a, b) => (a.finish ?? 999) - (b.finish ?? 999) || a.number - b.number);

  const l3 = runners.map((h) => h.last_3f).filter((v) => typeof v === 'number');
  // 速い3タイム。同タイムが並んだ場合は1つの順位を分け合う（例: 37.7が2頭なら金2つ・次は銀）
  const ctx = { l3Top: [...new Set(l3)].sort((a, b) => a - b).slice(0, 3) };
  const cols = FO_COLS.filter((c) => !c.has || runners.some((h) => c.has(h)));

  const tr = (h) => {
    const cells = cols.map((c) => {
      const cls = `${c.cls || ''}${c.cellCls ? c.cellCls(h, ctx) : ''}`.trim();
      return `<td${cls ? ` class="${cls}"` : ''}>${c.cell(h, ctx)}</td>`;
    }).join('');
    return `<tr${h.finish === 1 ? ' class="fo-win"' : ''}>${cells}</tr>`;
  };
  const head = cols.map((c) => `<th>${c.label}</th>`).join('');
  const top = runners.slice(0, FO_TOP_N).map(tr).join('');
  const rest = runners.slice(FO_TOP_N);

  return `
    <div class="eyebrow">着順<span class="note">${site.race.field_size}頭立て</span></div>
    <div class="fo-scroll"><table class="fo">
      <thead><tr>${head}</tr></thead><tbody>${top}</tbody>
    </table></div>
    ${rest.length ? `<details class="fold fo-more"><summary><span class="tri"></span>${FO_TOP_N + 1}着以下も見る（${rest.length}頭）</summary>
      <div class="fold-body"><div class="fo-scroll"><table class="fo">
        <thead><tr>${head}</tr></thead><tbody>${rest.map(tr).join('')}</tbody></table></div></div>
    </details>` : ''}
  `;
}

// 固定2列（着・馬番）の left を実測で当てる。列幅は馬名や騎手名の長さで毎回変わるので、
// CSS に数値を書くと横スクロール時に隙間や重なりが出る（2026-07-28に実機で確認）。
// 折りたたみの中の表は開くまで幅0なので、開いたときにも呼ぶ。
function setupFinishOrder() {
  for (const table of document.querySelectorAll('table.fo')) {
    const row = table.querySelector('tbody tr');
    if (!row || row.cells.length < 2) continue;
    const w1 = row.cells[0].getBoundingClientRect().width;
    if (!w1) continue;
    table.style.setProperty('--fo-l2', `${w1}px`);
  }
  for (const d of document.querySelectorAll('details.fo-more')) {
    d.addEventListener('toggle', () => { if (d.open) setupFinishOrder(); }, { once: true });
  }
}

// 画面幅が変わると列幅も変わるので測り直す（縦横の切り替え・ウィンドウ幅の変更）
let foResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(foResizeTimer);
  foResizeTimer = setTimeout(setupFinishOrder, 150);
});

function renderReviewSection(site) {
  const review = site.review;
  const race = review.race || {};
  const result = site.result || {};
  const byNumber = {};
  for (const h of site.horses) byNumber[h.number] = h;
  const top3 = {};
  for (const t of (result.top3 || [])) top3[t.number] = t.finish;

  // ── 1. どんなレースだったか ──
  const facts = [
    ['ペース', race.pace && race.pace.act ? paceWord(race.pace.act) : '—',
      race.pace && race.pace.hit === false ? `${paceWord(race.pace.pred)}と読んでいた` : (race.pace && race.pace.hit ? '読みと一致' : ''),
      race.pace ? race.pace.hit : null],
    ['決着', race.bias && race.bias.act ? race.bias.act : '—',
      race.bias && race.bias.pred ? `${race.bias.pred}と読んでいた` : '',
      race.bias ? race.bias.hit : null],
    ['ラップ', race.lap ? race.lap.label : '—', '', null],
    ['勝ち時計', race.winning_time || '—', '', null],
  ].map(([lbl, val, sub, ok]) => `<div class="rv-fact${ok === false ? ' bad' : ''}">
      <div class="rv-fl">${escapeHtml(lbl)}</div><div class="rv-fv">${escapeHtml(String(val))}</div>
      <div class="rv-fs">${escapeHtml(sub)}</div></div>`).join('');

  // ── 2. 印と買い目 ──
  const miss = review.miss || {};
  const markCards = ['◎', '○', '▲', '△'].flatMap((mk) =>
    site.horses.filter((h) => h.ability_mark === mk && !h.scratched).map((h) => {
      const good = h.finish && h.finish <= 3;
      return `<div class="rv-mc${good ? ' hit' : ''}"><div class="rv-mk">${mk}</div>
        <div class="rv-mb">${umaBox(h.number, h.gate, 'sm')}${escapeHtml(h.name)}<br>
        <span class="rv-s">${h.popularity ?? '—'}人気</span></div>
        <div class="rv-mf">${h.finish ?? '—'}<span class="rv-u">着</span></div></div>`;
    })).join('');
  const land = (site.verification || {}).landmine_result || {};
  const landCards = Object.keys(land).sort((a, b) => Number(a) - Number(b)).map((num) => {
    const lr = land[num]; const h = byNumber[num] || {};
    return `<div class="rv-mc lm${lr.ok ? ' hit' : ' ng'}"><div class="rv-mk sm">地雷</div>
      <div class="rv-mb">${umaBox(Number(num), h.gate, 'sm')}${escapeHtml(h.name ?? '')}<br>
      <span class="rv-s">${h.popularity ?? '—'}人気　${lr.ok ? '読みどおり飛んだ' : '飛ばずに好走'}</span></div>
      <div class="rv-mf">${lr.finish}<span class="rv-u">着</span></div></div>`;
  }).join('');
  const bets = (site.bets || []).map((b) => {
    const combo = (b.combination || []).join('-');
    return `${escapeHtml(b.type)} ${combo}　${fmtYen(b.stake)} → ` +
      (b.hit ? `<b class="rv-ok">的中 ${fmtYen(b.payout)}</b>` : '<b class="rv-ng">外れ</b>');
  }).join('<br>');
  const payoutRows = Object.entries(result.payouts || {}).map(([type, val]) => {
    const list = Array.isArray(val) ? val : [val];
    const label = payoutTypeLabel(type);
    const line = list.map((p) => `${comboBoxes(label, p.combination, byNumber)} ${fmtYen(p.payout)}${p.popularity ? `（${p.popularity}人気）` : ''}`).join(' ／ ');
    return `<tr><th class="l">${escapeHtml(label)}</th><td class="l">${line}</td></tr>`;
  }).join('');
  const live = site.horses.filter((h) => !h.scratched && h.rank && h.finish);
  const under = live.filter((h) => h.rank >= 7 && h.finish <= 3).sort((a, b) => (b.rank - b.finish) - (a.rank - a.finish)).slice(0, 2);
  const over = live.filter((h) => h.rank <= 3 && h.finish >= 8).sort((a, b) => (b.finish - b.rank) - (a.finish - a.rank)).slice(0, 2);
  const gapList = (rs, word, cls) => (rs.length ? `<div class="rv-blk ${cls}"><div class="rv-bh">${word}</div><ul>${
    rs.map((h) => `<li>${umaBox(h.number, h.gate, 'sm')}${escapeHtml(h.name)}<span class="rv-ls">評価${h.rank}番手 → ${h.finish}着</span></li>`).join('')}</ul></div>` : '');

  // ── 3. 気になった馬 ──
  const notes = (review.horses || []).map((c) => {
    const detail = [];
    if (c.passing) detail.push(`通過 ${escapeHtml(c.passing)}`);
    if (c.last_3f_rank === 1) detail.push('上がりは最も速い');
    else if (c.last_3f_rank && c.last_3f_rank <= 5) detail.push(`上がりは${c.last_3f_rank}番目に速い`);
    const so = (c.notes || []).filter(Boolean).map((x) => `<div class="rv-so">${escapeHtml(x)}</div>`).join('');
    return `<div class="rv-nc"><div class="rv-nh">${umaBox(c.number, c.gate, 'sm')}<b>${escapeHtml(c.name)}</b>
      <span class="rv-nf">${escapeHtml(c.finish_text || `${c.finish}着`)}</span>
      <span class="rv-np">${c.popularity ?? '—'}人気</span></div>
      <div class="rv-nb">${escapeHtml((c.labels || []).join(' ／ '))}</div>
      ${detail.length ? `<div class="rv-note">${detail.join('　')}</div>` : ''}${so}</div>`;
  }).join('');

  return `
    ${renderFinishOrder(site)}

    <div class="eyebrow">どんなレースだったか</div>
    ${race.lead ? `<div class="rv-lead">${escapeHtml(race.lead)}</div>` : ''}
    <div class="rv-facts">${facts}</div>
    ${renderReviewLap(race.lap, ((result.lap || {}).splits || (site.result && site.result.lap ? site.result.lap.splits : []) || []).map(Number).filter((x) => !Number.isNaN(x)))}
    ${renderReviewCorners(review, byNumber, top3)}

    <div class="eyebrow">印と買い目</div>
    ${miss.marks_total ? `<div class="rv-summ">印をつけた${miss.marks_total}頭のうち、<b>3着以内は${miss.marks_in_top3}頭</b></div>` : ''}
    <div class="rv-mcs">${markCards}</div>
    ${landCards ? `<div class="rv-summ">危ないと見た馬</div><div class="rv-mcs">${landCards}</div>` : ''}
    ${bets ? `<div class="rv-betline">${bets}</div>` : '<div class="rv-betline">買い目なし（見送り）</div>'}
    ${payoutRows ? `<table class="rv-pay"><tbody>${payoutRows}</tbody></table>` : ''}
    ${gapList(under, '低く見ていたのに上位に来た馬', 'up')}
    ${gapList(over, '高く買っていたのに負けた馬', 'down')}

    ${notes ? `<div class="eyebrow">気になった馬</div>${notes}` : ''}
  `;
}

function paceWord(c) {
  return { H: 'ハイ', M: '平均', S: 'スロー' }[c] || (c ?? '—');
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
          <td class="name ${markNameClass(h.ability_mark)}">${markSlot(h.ability_mark)}${escapeHtml(h.name)}${extraChips}</td>
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
        <td class="name ${markNameClass(h.ability_mark)}">${markSlot(h.ability_mark)}${umaBox(h.number, h.gate, 'sm')} ${escapeHtml(h.name)}</td>
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

// ===== ⑥ 買い目シミュレーター（17-odds-master-spec.md §6）=====
// 計算はすべて Harville（assets/harville.js・T1）を呼ぶ。ここでは数式を書かない。
//
// 「A. 印馬のおすすめ（自動）」は撤去した（2026-07-27）。EV = 自前の確率 × オッズ だが、
// 自前の確率は市場オッズより当たらないと実測済み（期間外logloss 1.9928 vs 市場1.9594）。
// つまり「EV>1.0」は「自前の確率がオッズと食い違った」＝こちらの読み違いが大きい買い目を
// 選び出す逆選択になっており、単勝EV買いの実測ROIは0.653（全馬ベタ買いより悪い）。
// 加えて、下のアキネーターはEVを出さず当たる確率・払戻のはばで語る設計のため、同一画面で
// 矛盾していた。Harville.recommend() はこのブロック専用だったが harville.js は不変更契約の
// ため残置（未使用）。

function renderOddsMasterSection(site, oddsAll) {
  const built = Harville.buildProbs(site.horses);
  if (built.heads === 0) return ''; // F1: 全馬勝率null等 → セクションごと非表示

  const tsSource = oddsAll && (oddsAll.official_datetime || oddsAll.fetched_at);
  const tsLabel = tsSource ? `<span class="cnt">${fmtDateTimeShort(tsSource)}時点のオッズ</span>` : '';
  const openAttr = oddsAll ? ' open' : '';
  // 88-akinator-spec.md §7: schema_version odds_all-1.x かつ単勝以外に発売中オッズがある場合のみ表示
  const hasAki = (typeof Akinator !== 'undefined' && Akinator.eligible(oddsAll));
  // アキネーターが出せないレースではタブを出さず、手動シミュレーターだけを従来どおり表示する
  const panels = hasAki
    ? `<div class="om-tabs" role="tablist">
         <button type="button" class="om-tab active" data-om-tab="aki" role="tab" aria-selected="true">質問で決める</button>
         <button type="button" class="om-tab" data-om-tab="sim" role="tab" aria-selected="false">自分で組む</button>
       </div>
       <div id="ak-panel-body" class="om-pane active" role="tabpanel"></div>
       <div id="om-panel-body" class="om-pane" role="tabpanel" hidden></div>`
    : '<div id="om-panel-body"></div>';

  return `
    <details class="fold om-fold"${openAttr}>
      <summary><span class="tri"></span>買い目シミュレーター${tsLabel}</summary>
      <div class="fold-body">
        ${panels}
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
// 戻り値は買い目アキネーター（下のsetupAkinatorPanel）から本線を流し込むための橋渡し。
// F1相当でセクション自体が無い場合はnullを返す。
function setupOddsMasterPanel(site, oddsAll) {
  const body = document.getElementById('om-panel-body');
  if (!body) return null;

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

  return {
    applyPlan(plan) {
      Simulator.applyPlan(state, plan);
      rerender();
      body.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  };
}

// 88-akinator-spec.md T9: 買い目アキネーターのマウント・イベント委譲。描画・stateは
// Akinator（assets/akinator.js）に一任。テキスト入力(予算)とスライダーのドラッグ中だけは
// フォーカス/カーソル位置を保つため、全体rerenderせずピンポイントでDOMを更新する。
// タブ切替。中身は再描画せず表示だけ入れ替える（両方のstateを保つため）
function setupOddsMasterTabs() {
  const bar = document.querySelector('.om-tabs');
  if (!bar) return;
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-om-tab]');
    if (!btn) return;
    const key = btn.dataset.omTab;
    bar.querySelectorAll('.om-tab').forEach((b) => {
      const on = b.dataset.omTab === key;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const map = { aki: 'ak-panel-body', sim: 'om-panel-body' };
    Object.keys(map).forEach((k) => {
      const el = document.getElementById(map[k]);
      if (!el) return;
      el.hidden = (k !== key);
      el.classList.toggle('active', k === key);
    });
  });
}

// 買い目アキネーターの「シミュレーターに入れる」から呼ぶ。手動タブへ切り替える
function switchToSimulatorTab() {
  const btn = document.querySelector('[data-om-tab="sim"]');
  if (btn) btn.click();
}

function setupAkinatorPanel(site, oddsAll, simCtl) {
  const body = document.getElementById('ak-panel-body');
  if (!body) return; // §7の縮退条件を満たさない場合はDOM自体が無い

  const ctx = Akinator.init(site, oddsAll);
  const state = Akinator.initialState();

  function rerender() {
    body.innerHTML = Akinator.render(ctx, state);
    const bi = document.getElementById('ak-budget-input');
    if (bi) {
      bi.focus();
      bi.setSelectionRange(bi.value.length, bi.value.length);
    }
  }

  body.addEventListener('click', (ev) => {
    const result = Akinator.handleClick(ctx, state, ev.target);
    if (!result) return;
    if (result.plan && simCtl) { simCtl.applyPlan(result.plan); switchToSimulatorTab(); }
    rerender();
  });

  body.addEventListener('input', (ev) => {
    if (ev.target && ev.target.id === 'ak-budget-input') {
      Akinator.setInputRaw(state, ev.target.value);
      const parsed = document.getElementById('ak-budget-parsed');
      if (parsed) parsed.innerHTML = Akinator.budgetPreviewHtml(ctx, state);
      const goBtn = body.querySelector('[data-ak-go-input]');
      if (goBtn) goBtn.disabled = !Akinator.parseYen(state.inputRaw);
      return;
    }
    if (ev.target && ev.target.matches && ev.target.matches('[data-ak-w]')) {
      const lbl = document.getElementById('ak-w-' + ev.target.dataset.akW);
      if (lbl) lbl.textContent = ev.target.value;
    }
  });

  body.addEventListener('change', (ev) => {
    if (ev.target && ev.target.matches && ev.target.matches('[data-ak-w]')) {
      Akinator.setPkgW(state, ev.target.dataset.akW, Number(ev.target.value));
      rerender();
    }
  });

  body.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target && ev.target.id === 'ak-budget-input') {
      const goBtn = body.querySelector('[data-ak-go-input]');
      if (goBtn && !goBtn.disabled) goBtn.click();
    }
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

// 荒れ度ラベル（89-spec §3.1・案C-2）。upset が無いレースは何も出さない（§3.3 の縮退）。
// 文言も整数%も keiba_build_analysis.py が確定済み。ここでは組み立てるだけで計算しない。
function renderUpset20(upset) {
  if (!upset || !Array.isArray(upset.classes) || upset.classes.length !== 3) return '';
  // 2つの状態を混ぜないこと:
  //   .on      = モデルの見立て（selected）。タップしても動かない
  //   .viewing = いま下の表に出しているクラス。初期値は見立てと同じ
  // 色と枠だけに頼らず、表の見出しに必ずクラス名が入る（tendency_caption）。
  const cols = upset.classes.map((c) => `
      <button type="button" class="col${c.selected ? ' on' : ''}${c.selected ? ' viewing' : ''}"
              data-upset="${escapeHtml(c.key)}" aria-pressed="${c.selected ? 'true' : 'false'}">
        <span class="nm">${escapeHtml(c.name)}</span>
        <span class="pv">${c.percent}<small>%</small></span>
        <span class="dl">${escapeHtml(c.card)}</span>
      </button>`).join('');
  const bar = upset.classes.map((c, i) =>
    `<span class="s${i}" style="width:${c.percent}%"></span>`).join('');
  // 傾向表は「その決着になったレースの顔ぶれ」であってラベルの的中率ではない。
  // 3クラス分を先に書き出しておき、表示の切り替えだけを setupUpset20 が行う。
  const tables = upset.classes.map((c) => {
    if (!Array.isArray(c.tendencies) || !c.tendencies.length) return '';
    return `
    <table class="upCtend${c.selected ? ' show' : ''}" data-upsettend="${escapeHtml(c.key)}">
      <caption>${escapeHtml(c.tendency_caption || '')}</caption>
      <tbody>${c.tendencies.map((t) =>
      `<tr><th>${escapeHtml(t.label)}</th><td>${escapeHtml(t.value)}</td></tr>`).join('')}
      </tbody>
    </table>`;
  }).join('');
  const hint = upset.tendency_hint
    ? `<div class="upChint">${escapeHtml(upset.tendency_hint)}</div>` : '';
  return `
    <div class="upC">${cols}</div>
    <div class="upCbar">${bar}</div>
    <div class="upCnote">${escapeHtml(upset.line)}</div>
    ${tables}
    ${hint}
    <div class="upCfoot">${escapeHtml(upset.note)}</div>
  `;
}

// 荒れ度カードのタップで傾向表を差し替える。見立て(.on)は動かさない（89-spec §3.1）。
function setupUpset20() {
  const root = document.querySelector('.race20');
  if (!root) return;
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-upset]');
    if (!btn || !root.contains(btn)) return;
    const key = btn.dataset.upset;
    root.querySelectorAll('button[data-upset]').forEach((b) => {
      const isView = b.dataset.upset === key;
      b.classList.toggle('viewing', isView);
      b.setAttribute('aria-pressed', isView ? 'true' : 'false');
    });
    root.querySelectorAll('[data-upsettend]').forEach((t) => {
      t.classList.toggle('show', t.dataset.upsettend === key);
    });
  });
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
      ${renderUpset20(p.upset)}
      <div class="pt">予想: ${fmtDateTimeShort(p.predicted_at)}（${escapeHtml(p.odds_basis)}基準）</div>
    </div>
  `;
}

// ===== 97-spec: 出馬表（馬柱）=====
// 印・全頭評価・勝率期待値・個別評価の4セクションを、馬番順の1表＋行タップのパネルに統合する。
// 過去5走／コース適性は publish が site JSON に載せる（keiba_shutuba_columns.py）。
// 無いレース（旧データ）でも壊れないよう、各ブロックは存在チェックしてから描く（97-spec §7）。

const SHUTUBA_DIMS = [
  { key: 's1', sym: '①', label: '近走' },
  { key: 's2', sym: '②', label: '展開' },
  { key: 's34', sym: '③', label: '適性' },
  { key: 's5', sym: '⑤', label: '調教' },
  { key: 's6', sym: '⑥', label: '枠斤騎' },
  { key: 's7', sym: '⑦', label: '血統' },
  { key: 's8', sym: '⑧', label: 'ローテ' },
];
const SHUTUBA_TIERS = ['◎', '○', '○', '▲', '▲', '△', '△', '△'];
const LEG_ORDER = ['逃', '先', '差', '追'];
const CLASS_CSS = {
  '新馬': 'c-shin', '未勝利': 'c-mi', '1勝': 'c-w1', '2勝': 'c-w2', '3勝': 'c-w3',
  'OP': 'c-op', 'L': 'c-l', 'G3': 'c-g3', 'G2': 'c-g2', 'G1': 'c-g1',
  'Jpn1': 'c-jpn1', 'Jpn2': 'c-jpn2', 'Jpn3': 'c-jpn3', '重賞': 'c-jusho',
};

// 項目別の印。その項目の中央値より上の馬だけを対象に、点数の高い順（同点は総合順）で
// ◎/○○/▲▲/△△△ を配る。全馬同点の項目は印が1つも付かない（差がついていないため）。
function shutubaDimMarks(horses) {
  const live = horses.filter((h) => !h.scratched && h.scores);
  const out = {};
  horses.forEach((h) => { out[h.number] = {}; });
  SHUTUBA_DIMS.forEach(({ key }) => {
    const vals = live.map((h) => h.scores[key] ?? 0).sort((a, b) => a - b);
    if (!vals.length) return;
    const mid = vals.length % 2
      ? vals[(vals.length - 1) / 2]
      : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
    live.filter((h) => (h.scores[key] ?? 0) > mid)
      .sort((a, b) => ((b.scores[key] ?? 0) - (a.scores[key] ?? 0)) || (b.total - a.total))
      .forEach((h, i) => { out[h.number][key] = SHUTUBA_TIERS[i] || ''; });
  });
  return out;
}

function shutubaRaceClass(grade, name) {
  const g = (grade || '').trim();
  const n = name || '';
  if (g === 'JpnI') return 'Jpn1';
  if (g === 'JpnII') return 'Jpn2';
  if (g === 'JpnIII') return 'Jpn3';
  if (g === '重賞') return '重賞';
  if (g === 'GI' || g === 'G1' || n.includes('(GI)')) return 'G1';
  if (g === 'GII' || g === 'G2' || n.includes('(GII)')) return 'G2';
  if (g === 'GIII' || g === 'G3' || n.includes('(GIII)')) return 'G3';
  if (g === 'L' || n.includes('(L)')) return 'L';
  if (g === 'OP' || n.includes('(OP)') || n.includes('オープン')) return 'OP';
  for (const k of ['3勝', '2勝', '1勝']) {
    if (g === k || n.includes(`${k}クラス`)) return k;
  }
  if (n.includes('未勝利')) return '未勝利';
  if (n.includes('新馬')) return '新馬';
  return g || '';
}

function classBadge(grade, name) {
  const c = shutubaRaceClass(grade, name);
  if (!c) return '';
  return `<span class="cb ${CLASS_CSS[c] || ''}">${escapeHtml(c)}</span>`;
}

function stripClassSuffix(name) {
  return String(name || '').replace(/\((?:GI|GII|GIII|JpnI|JpnII|JpnIII|L|OP|[123]勝クラス|重賞)\)\s*$/, '').trim();
}

// 脚質バー。4マスの該当位置に ◀ を置き、右に文字を出す（netkeiba と同じ形）。
function legBar(style) {
  const s = String(style || '').trim().slice(0, 1);
  const idx = LEG_ORDER.indexOf(s);
  const cells = [0, 1, 2, 3]
    .map((i) => `<i class="${idx === i ? 'on' : ''}">${idx === i ? '◀' : ''}</i>`).join('');
  const label = idx >= 0
    ? `<span class="lbl">${escapeHtml(s)}</span>`
    : '<span class="lbl mut">—</span>';
  return `<span class="legbar"><span class="legcells">${cells}</span>${label}</span>`;
}

function medalSpan(text, cls, title) {
  if (!cls) return escapeHtml(text);
  const t = title ? ` title="${escapeHtml(title)}"` : '';
  return `<span class="ag ${cls}"${t}>${escapeHtml(text)}</span>`;
}

function shutubaFinBox(fin) {
  const n = parseInt(fin, 10);
  if (Number.isNaN(n)) return `<span class="fb x">${escapeHtml(fin ?? '—')}</span>`;
  const cls = { 1: 'f1', 2: 'f2', 3: 'f3' }[n] || 'fx';
  return `<span class="fb ${cls}">${n}</span>`;
}

function shutubaMd(dateText) {
  const d = String(dateText || '').split('/');
  return d.length === 3 ? `${d[1]}/${d[2]}` : escapeHtml(dateText);
}

// 過去5走の1行。上がりが1〜3位／タイムが基準より速い走を金・銀・銅にする（97-spec §3）。
function courseRecordTable(h) {
  const cr = h.course_record;
  if (!cr || !cr.rows || !cr.rows.length) return '';
  const rows = cr.rows.map((r) => {
    const zero = r.counts.reduce((a, b) => a + b, 0) === 0 ? ' class="zero"' : '';
    const tds = r.counts.map((v) => `<td class="${v === 0 ? 'c0' : ''}">${v}</td>`).join('');
    return `<tr${zero}><td class="l">${escapeHtml(r.label)}</td>${tds}</tr>`;
  }).join('');
  let note = '';
  if (!cr.central_starts) {
    note = `<div class="crn">中央での出走なし（地方 ${cr.local_starts}走）</div>`;
  } else if (!cr.rows.some((r) => r.counts.reduce((a, b) => a + b, 0))) {
    note = `<div class="crn">この条件での出走なし（中央 ${cr.central_starts}走・地方 ${cr.local_starts}走）</div>`;
  }
  return `
    <div class="crh">コース適性（中央のみ・全走）</div>
    ${note}
    <table class="crt">
      <thead><tr><th class="l">条件</th><th>1着</th><th>2着</th><th>3着</th><th>着外</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// 過去5走は表で出す（2026-07-28 ユーザー確認）。列は
// 日付／場・条件／レース／クラス／着／タイム／上り／頭数・人気／差／通過／騎手・斤量。
// 幅の狭い画面では横スクロールになるので、その旨を下に出す。
function pastRunRow(p) {
  const rankCls = { 1: 'f1', 2: 'f2', 3: 'f3' }[p.last3f_rank] || '';
  const agTitle = p.last3f_rank ? `このレースの上がり${p.last3f_rank}位` : '';
  const timeTitle = p.time_grade
    ? `基準比 ${p.time_resid > 0 ? '+' : ''}${p.time_resid}秒（当日の馬場差を補正後）・着差${p.margin}秒`
    : (p.time_note || '');
  const timeCell = p.time_grade
    ? medalSpan(p.time, p.time_grade, timeTitle)
    : (timeTitle ? `<span title="${escapeHtml(timeTitle)}">${escapeHtml(p.time ?? '—')}</span>`
      : escapeHtml(p.time ?? '—'));
  const margin = (p.margin === null || p.margin === undefined || p.margin === '')
    ? '—' : escapeHtml(p.margin);
  const band = p.margin_band ? ` class="pb-${p.margin_band}"` : '';
  return `<tr${band}>
    <td class="l">${shutubaMd(p.date)}</td>
    <td class="l">${escapeHtml(p.track ?? '')}<span class="mut"> ${escapeHtml(p.surface ?? '')}${escapeHtml(p.distance ?? '')}${escapeHtml(p.condition ?? '')}</span></td>
    <td class="l pname">${escapeHtml(stripClassSuffix(p.race_name))}</td>
    <td>${classBadge(p.grade, p.race_name)}</td>
    <td>${shutubaFinBox(p.finish)}</td>
    <td>${timeCell}</td>
    <td>${medalSpan(p.last_3f ?? '—', p.last_3f ? rankCls : '', agTitle)}</td>
    <td>${escapeHtml(p.runners ?? '—')}頭${escapeHtml(p.popularity ?? '—')}人</td>
    <td>${margin}</td>
    <td class="l">${escapeHtml(p.corners ?? '')}</td>
    <td class="l">${escapeHtml(p.jockey ?? '')} ${escapeHtml(p.weight ?? '')}</td>
  </tr>`;
}

function pastRunsTable(h) {
  const runs = h.past_runs;
  if (!runs || !runs.length) return '';
  return `<div class="prh">過去5走</div>
    <div class="ptwrap">
      <table class="pastt">
        <thead><tr><th class="l">日付</th><th class="l">場・条件</th><th class="l">レース</th>
          <th>クラス</th><th>着</th><th>タイム</th><th>上り</th><th>頭数・人気</th><th>差</th>
          <th class="l">通過</th><th class="l">騎手・斤量</th></tr></thead>
        <tbody>${runs.map(pastRunRow).join('')}</tbody>
      </table>
    </div>
    <div class="pthint">← 横にスクロールできます</div>`;
}

// レース戦績を全部見る。直近5走より前の走を、同じ表の形でそのまま続ける。
function careerRunsBlock(h) {
  const rest = h.career_runs;
  if (!rest || !rest.length) return '';
  return `<details class="arfold"><summary>レース戦績を全部見る（あと${rest.length}走）</summary>
    <div class="ptwrap">
      <table class="pastt">
        <thead><tr><th class="l">日付</th><th class="l">場・条件</th><th class="l">レース</th>
          <th>クラス</th><th>着</th><th>タイム</th><th>上り</th><th>頭数・人気</th><th>差</th>
          <th class="l">通過</th><th class="l">騎手・斤量</th></tr></thead>
        <tbody>${rest.map(pastRunRow).join('')}</tbody>
      </table>
    </div>
    <div class="pthint">← 横にスクロールできます</div>
  </details>`;
}

// 前走メモ（91-spec T7）。回顧で拾った馬だけ。予想の点数には反映していない。
function prevNoteBlock(h) {
  const p = h.prev_note;
  if (!p) return '';
  const chips = (p.labels || []).map((l) => `<span class="rv-chip">${escapeHtml(l)}</span>`).join('');
  const so = (p.notes || []).filter(Boolean).map((x) => `<div class="rv-so">${escapeHtml(x)}</div>`).join('');
  const src = `（${escapeHtml(p.date ?? '')} ${escapeHtml(p.track ?? '')}${p.race_no ?? ''}R ${escapeHtml(p.race_name ?? '')}）`;
  return `<div class="pnote"><span class="rv-ptag">前走メモ</span>${chips}
    <span class="rv-ptx">${escapeHtml(p.text ?? '')}</span>
    <span class="rv-psrc">${src}</span>${so}</div>`;
}

function factorsTable(h) {
  const factors = h.factors || [];
  if (!factors.length) return '';
  const rows = factors.map((f) => {
    const items = (f.items || []).length
      ? f.items.map((it) => {
          if (it.sign === '+') return `<div class="fac p">＋ ${escapeHtml(it.label)}</div>`;
          if (it.sign === '-') return `<div class="fac m">− ${escapeHtml(it.label)}</div>`;
          return `<div class="fac z">・ ${escapeHtml(it.label)}</div>`;
        }).join('')
      : '<div class="fac z">・ 標準</div>';
    return `<tr><td class="item">${escapeHtml(f.label)}</td><td class="pt">${f.score}</td><td>${items}</td></tr>`;
  }).join('');
  return `<table class="dim">${rows}
    <tr class="tot"><td class="item">総合</td><td class="pt">${fmtNum(h.total, 1)}</td>
      <td><span class="grade ${gradeClass(h.grade)}">${gradeDisp(h.grade)}</span></td></tr>
  </table>`;
}

// 97-spec §9（案A-1）: 診断欄。買える理由／消せる理由を2列に分け、見出しを塗る。
// 旧データ（diagnosis を持たないレース）では、従来の factors 表に落とす。
function diagRow(r) {
  const sub = r.sub ? `<span class="dsub">${escapeHtml(r.sub)}</span>` : '';
  return `<li><span class="dtag">${escapeHtml(r.dim)}</span>${escapeHtml(r.head)}${sub}</li>`;
}

function diagCol(rows, cls, title, mark) {
  const items = (rows && rows.length) ? rows.map(diagRow).join('') : '<li class="none">なし</li>';
  return `<div class="dcol ${cls}">
    <div class="dch"><span class="dchm">${mark}</span>${title}<span class="dcnum">${(rows || []).length}</span></div>
    <ul>${items}</ul></div>`;
}

function diagnosisBlock(h) {
  const d = h.diagnosis;
  if (!d) return factorsTable(h);   // 旧データはそのまま従来表示
  return `<div class="dcols">
    ${diagCol(d.plus, 'p', '買える理由', '＋')}
    ${diagCol(d.minus, 'm', '消せる理由', '−')}
  </div>`;
}

// 回顧メモ。タグの回数（クセ）を先に、次に直近の本文。点数には入っていない。
function noteTag(label, count) {
  const bad = /^(出遅れ|不利|ハイペース)/.test(label);
  const good = /^(上がり最速|着順以上)/.test(label);
  const cls = bad ? 'nt-bad' : good ? 'nt-good' : 'nt-mid';
  const c = count ? `<b>${count}</b>` : '';
  return `<span class="nt ${cls}">${escapeHtml(label)}${c}</span>`;
}

function noteRow(n) {
  const labels = (n.labels || []).map((l) => noteTag(l)).join('');
  const extra = (n.notes || []).filter(Boolean)
    .map((x) => `<div class="nb">${escapeHtml(x)}</div>`).join('');
  return `<div class="nrow">
    <div class="nmeta">${escapeHtml(n.date ?? '')} ${escapeHtml(n.track ?? '')}${n.race_no ?? ''}R ${escapeHtml(n.race_name ?? '')}
      <span class="nfin">${n.popularity ?? '—'}人気${n.finish ?? '—'}着</span></div>
    <div class="ntx">${labels}${escapeHtml(n.text ?? '')}</div>${extra}</div>`;
}

function noteHistoryBlock(h) {
  const nh = h.note_history;
  if (!nh) return prevNoteBlock(h);   // 旧データは前走メモだけ
  const tags = (nh.tags || []).map(([t, c]) => noteTag(t, c)).join('');
  const rows = (nh.recent || []).map(noteRow).join('');
  const shown = nh.shown != null ? nh.shown : (nh.recent || []).length;
  const cnt = shown === nh.count
    ? `${nh.count}件`
    : `直近5走で${shown}件<span class="nall">／保存は全${nh.count}件（${escapeHtml(nh.first_date ?? '')}〜）</span>`;
  const empty = shown ? '' : '<div class="nempty">直近5走ではメモなし</div>';
  return `<div class="nblock">
    <div class="nh">回顧メモ<span class="ncnt">${cnt}</span></div>${empty}
    <div class="ntags">${tags}</div>${rows}
    <div class="nfoot">メモは点数に入れていません</div></div>`;
}

function shutubaPanel(h, dm) {
  const chips = SHUTUBA_DIMS.map(({ key, sym, label }) => {
    const mark = (dm[h.number] || {})[key] || '';
    const cls = { '◎': 'mk-hon', '○': 'mk-tai', '▲': 'mk-tan', '△': 'mk-oku' }[mark] || 'off';
    return `<span class="dchip ${cls}"><i>${sym}${label}</i>${mark || '・'}</span>`;
  }).join('');
  return `
    <div class="pnl">
      <div class="dims">${chips}</div>
      ${diagnosisBlock(h)}
      ${noteHistoryBlock(h)}
      ${pastRunsTable(h)}
      ${careerRunsBlock(h)}
      ${courseRecordTable(h)}
    </div>
  `;
}

function renderShutuba20(site) {
  const all = site.horses;
  const live = all.filter((h) => !h.scratched);
  const dm = shutubaDimMarks(all);
  // 勝率の上位3頭に金・銀・銅（同率は馬番の若い方が上）
  const wr = {};
  [...live].sort((a, b) => ((b.estimated_prob ?? 0) - (a.estimated_prob ?? 0)) || (a.number - b.number))
    .forEach((h, i) => { wr[h.number] = { 0: 'f1', 1: 'f2', 2: 'f3' }[i] || ''; });

  const rows = [...all].sort((a, b) => a.number - b.number).map((h) => {
    if (h.scratched) {
      return `<tr class="hrow scratched" data-h="${h.number}">
        <td></td><td>${umaBox(h.number, h.gate, 'sm')}</td>
        <td class="l nm">${escapeHtml(h.name)}（取消）</td>
        <td>—</td><td>—</td><td>—</td></tr>
        <tr class="prow" data-p="${h.number}"><td colspan="6">${shutubaPanel(h, dm)}</td></tr>`;
    }
    const winTxt = fmtPercent(h.estimated_prob, 0);
    return `
      <tr class="hrow${h.ability_mark ? ' pred' : ''}" data-h="${h.number}">
        <td>${markBadge20(h)}</td>
        <td>${umaBox(h.number, h.gate, 'sm')}</td>
        <td class="l nm">${escapeHtml(h.name)}<span class="tri">▸</span>
          <div class="u prof"><span class="pa">${escapeHtml(h.sex_age ?? '')}</span><span class="pk">${h.weight_carried != null ? String(h.weight_carried).replace(/\.0$/, '') : '—'}</span><span class="pj">${escapeHtml(h.jockey && h.jockey !== 'N/A' ? h.jockey : '—')}</span>${legBar(h.running_style)}<span class="rot">${escapeHtml(h.rotation || '')}</span></div></td>
        <td>${fmtNum(h.total, 1)}<div class="u"><span class="grade ${gradeClass(h.grade)}">${gradeDisp(h.grade)}</span></div></td>
        <td>${medalSpan(winTxt, wr[h.number])}</td>
        <td>${h.odds != null ? h.odds.toFixed(1) : '—'}<div class="u pp">${h.popularity ?? '—'}人</div></td>
      </tr>
      <tr class="prow" data-p="${h.number}"><td colspan="6">${shutubaPanel(h, dm)}</td></tr>
    `;
  }).join('');

  // 脚質ごとの頭数。出走馬の running_style を数えるだけ（取消は除く）
  const styleCount = { '逃': 0, '先': 0, '差': 0, '追': 0 };
  live.forEach((h) => {
    const k = String(h.running_style || '').trim().slice(0, 1);
    if (k in styleCount) styleCount[k] += 1;
  });
  const unknown = live.length - Object.values(styleCount).reduce((a, b) => a + b, 0);
  const styleBand = ['逃', '先', '差', '追']
    .map((k) => `<span class="sc"><i>${k}</i>${styleCount[k]}</span>`).join('')
    + (unknown ? `<span class="sc none"><i>不明</i>${unknown}</span>` : '');

  return `
    <div class="secthead">出馬表<span class="cnt">全${site.race.field_size}頭・馬番順・タップで馬柱</span></div>
    <div class="shctl">
      <div class="stylecount">脚質${styleBand}</div>
      <div class="allbtn"><button type="button" data-shall="open">全部開く</button><button type="button" data-shall="close">全部閉じる</button></div>
    </div>
    <table class="unified">
      <colgroup><col style="width:9%"><col style="width:7%"><col style="width:50%">
        <col style="width:10%"><col style="width:9%"><col style="width:15%"></colgroup>
      <thead><tr>
        <th>印</th><th>番</th><th class="l">馬名・騎手</th>
        <th>総合</th><th>勝率</th><th>オッズ</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="conf">行をタップすると、項目別の評価・過去5走・コース適性が開きます</div>
  `;
}

// 印は 能力印 → 地雷 → 穴 の順で1つだけ（mark-2.4 の排他ルールと同じ）
function markBadge20(h) {
  const markCls = { '◎': 'm-hon', '○': 'm-tai', '▲': 'm-tan', '△': 'm-oku' };
  if (h.ability_mark) return `<span class="mkb ${markCls[h.ability_mark]}">${h.ability_mark}</span>`;
  if (h.bet_mark === '地雷') return '<span class="mkb m-jir">地雷</span>';
  if (h.role === '穴') return '<span class="mkb m-ana">穴</span>';
  return '';
}

function setupShutuba20() {
  const root = document.querySelector('.race20');
  if (!root) return;
  root.addEventListener('click', (e) => {
    const allBtn = e.target.closest('[data-shall]');
    if (allBtn) {
      const open = allBtn.dataset.shall === 'open';
      root.querySelectorAll('tr.prow').forEach((p) => p.classList.toggle('open', open));
      root.querySelectorAll('tr.hrow').forEach((r) => {
        r.classList.toggle('open', open);
        const t = r.querySelector('.tri');
        if (t) t.textContent = open ? '▾' : '▸';
      });
      return;
    }
    const row = e.target.closest('tr.hrow');
    if (!row) return;
    const panel = root.querySelector(`tr.prow[data-p="${row.dataset.h}"]`);
    if (!panel) return;
    const open = panel.classList.toggle('open');
    row.classList.toggle('open', open);
    const tri = row.querySelector('.tri');
    if (tri) tri.textContent = open ? '▾' : '▸';
  });
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
    ? '<tr><th class="l">券種</th><th class="l">買い目</th><th>金額</th><th>結果</th><th>払戻</th></tr>'
    : '<tr><th class="l">券種</th><th class="l">買い目</th><th>金額</th></tr>';
  const rows = bets.map((b) => {
    const resultCell = showResult
      ? `<td class="${b.hit ? 'o' : 'x'}">${b.hit ? '✓' : '✕'}</td><td>${fmtYen(b.payout)}</td>`
      : '';
    return `
      <tr>
        <td class="l">${escapeHtml(b.type.replace('三連', '3連'))}</td>
        <td class="l">${comboBoxes(b.type, b.combination, byNumberBets20)}</td>
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
      ${renderOverview20(site)}
      ${renderShutuba20(site)}
      ${renderBets20(site)}
      ${renderOddsMasterSection(site, oddsAll)}
      ${renderVerification20(site)}
    </div>
  `;
}

// 脚質マップ: leg_bias の4行（逃げ/先行/差し/追込）に、その脚質の出走馬を馬番ボックスで並べる。
// 行頭はコース別の実績（勝率・複勝率・走数）と有利不利の判定、行末は頭数。
const PACE_STYLE_KEY = { '逃げ': '逃', '先行': '先', '差し': '差', '追込': '追' };
// 判定は5段階。内外バイアスの帯と同じ発散スケール（緑=有利 / 灰=標準 / 赤=不利）を共有する。
// 色だけに意味を持たせないよう、判定の文字ラベルは必ず併記する。
const PACE_JUDG_CLASS = {
  '有利': 'j-p2', 'やや有利': 'j-p1', 'フラット': 'j-z0', '標準': 'j-z0', 'データ少': 'j-z0',
  'やや不利': 'j-m1', '不利': 'j-m2', '強く不利': 'j-m2',
};

// 脚質傾向の表で数値セルを塗る濃淡（C案）。同じ列の4脚質を比べた順位で決める。
// 行数が4とは限らない（データのある脚質だけ並ぶ）ので、行数に応じて段階を割り当てる。
function heatScale(n) {
  if (n <= 1) return ['h0'];
  if (n === 2) return ['h2', 'hm2'];
  if (n === 3) return ['h2', 'h0', 'hm2'];
  if (n === 4) return ['h2', 'h1', 'hm1', 'hm2'];
  return ['h2', 'h1', ...Array(n - 4).fill('h0'), 'hm1', 'hm2'];
}

// 同値は同じ濃さになる（indexOf が先頭の順位を返すため）
function heatClass(values, v) {
  if (v == null || !values.length) return 'h0';
  const scale = heatScale(values.length);
  const desc = [...values].sort((a, b) => b - a);
  return scale[desc.indexOf(v)] || 'h0';
}

function paceRate(s) {
  const n = parseFloat(String(s).replace('%', ''));
  return Number.isNaN(n) ? null : n;
}

function paceHorsePiece(h, isMainNige) {
  const cls = `pz${h.bet_mark === '地雷' ? ' jirai' : ''}${isMainNige ? ' nige' : ''}`;
  return `<span class="${cls}" title="${escapeHtml(h.name)}">${umaBox(h.number, h.gate, 'sm')}`
    + `<span class="mk ${markNameClass(h.ability_mark)}">${h.ability_mark || ''}</span></span>`;
}

function renderPaceMap20(site) {
  const p = site.prediction;
  const runners = site.horses.filter((h) => !h.scratched);
  // 主逃げは "18レーゼドラマ" のような文字列。先頭の数字を馬番として取り出す
  const mainNige = new Set((p.front_pressure?.main_nige || [])
    .map((s) => Number(String(s).match(/^\d+/)))
    .filter((n) => !Number.isNaN(n)));

  const used = new Set();
  const lanes = p.leg_bias.map((lb) => {
    const key = PACE_STYLE_KEY[lb.style];
    const hs = runners.filter((h) => h.running_style === key);
    hs.forEach((h) => used.add(h.number));
    const j = PACE_JUDG_CLASS[lb.judgment] || '';
    const body = hs.length
      ? hs.map((h) => paceHorsePiece(h, mainNige.has(h.number))).join('')
      : '<span class="none">該当なし</span>';
    return `
      <div class="lane ${j}">
        <div class="lb">
          <div class="nm">${escapeHtml(lb.style)}</div>
          <div class="rt">複勝 ${escapeHtml(lb.fukusho_rate)}</div>
          <span class="jw">${escapeHtml(lb.judgment)}</span>
        </div>
        <div class="horses">${body}</div>
        <div class="num">${hs.length}頭</div>
      </div>
    `;
  }).join('');

  // 脚質データのない馬（running_style が null など）は取りこぼさず最終行にまとめる
  const rest = runners.filter((h) => !used.has(h.number));
  const restLane = rest.length ? `
    <div class="lane">
      <div class="lb"><div class="nm">不明</div><div class="rt">脚質データなし</div></div>
      <div class="horses">${rest.map((h) => paceHorsePiece(h, mainNige.has(h.number))).join('')}</div>
      <div class="num">${rest.length}頭</div>
    </div>
  ` : '';

  return `
    <div class="subh">脚質マップ</div>
    <div class="pacemap">${lanes}${restLane}</div>
    <div class="pmlegend">複勝率はこのコースの脚質別実績（勝率・連対率は上の脚質傾向）。馬番の下は印、枠線は
      <span class="sw nige"></span>主逃げ候補 /
      <span class="sw jirai"></span>地雷</div>
  `;
}

// ── 展開シナリオ6マス化（93-pace-scenario-6cell-spec.md §6-0-1・案22採用） ──
//
// 【実装上の注意（仕様どおりに厳密再現できていない点）】93-spec §6-0は「並び順=本番の
// scenario_fit_score（末脚+ペース微傾斜）をそのまま呼ぶ」としているが、その計算に要る
// pace_role・kick_score は s2.json 止まりで analysis.json / 公開JSONまで運ばれておらず
// （§7の触るファイル一覧に keiba_publish.py が無いため本タスクでは配線していない）、
// フロント側では参照できない。そのため「脚質（running_style）でマスに振り分け、
// マス内は 印(◎○▲△) → 推定勝率 → 馬番 の順で並べる」で代替している。
// site.horses[].running_style は単一文字コード（逃/先/差/追。keiba_publish.py の
// normalize_running_style 出力・既存の PACE_STYLE_KEY と同じ表記）。フルラベルではない。
const SCENARIO_STYLE_FULL = { '逃': '逃げ', '先': '先行', '差': '差し', '追': '追込' };
const SCENARIO_BADGE_LABEL = { main: '本命', sub: '対抗', other: '3番手' };

// 93-spec §6-0-1: マスに入る馬と並び順は**バックエンドが決める**（cells[].horses）。
// keiba_score_s2.cell_horses() が pace_role で振り分け、本番の scenario_fit_score
// （末脚基礎点＋ペース微傾斜）降順・同点は馬番昇順で並べたものをそのまま出す。
// JS側で並べ替えない（採点式と表示がズレるため）。
// cells[].horses が無い過去公開分は空配列に縮退する（旧表示は renderScenarioLegacy20 が担当）。
function scenarioHorsesForCell(cell, byNumber) {
  return (cell.horses || [])
    .map((x) => byNumber[x.number])
    .filter((h) => h && !h.scratched);
}

function scenarioMainNigeSet(p) {
  return new Set((p.front_pressure?.main_nige || [])
    .map((s) => Number(String(s).match(/^\d+/)))
    .filter((n) => !Number.isNaN(n)));
}

function scenarioCellBadgeKey(cell, p) {
  for (const key of ['main', 'sub', 'other']) {
    const s = p.scenario && p.scenario[key];
    if (s && s.code === cell.code && s.side === cell.side) return key;
  }
  return null;
}

// 狙い（末脚順）: 6マス案でも旧3ブロック案でも共通（scenario.main.favoritesは93-spec §5で維持）
function renderScenarioFavorites20(p, byNumberOv) {
  const recoFavs = (p.scenario && p.scenario.main && p.scenario.main.favorites) || [];
  if (!recoFavs.length) return '';
  const recoItems = recoFavs.map((f) => {
    const tier = kickTierLabel(f.kick_tier);
    const kickHtml = tier
      ? `<span class="kick ${kickTierClass(tier)}">末脚 ${escapeHtml(tier)}</span>` : '';
    return `<span class="nm">${umaBox(Number(f.number), (byNumberOv[f.number] || {}).gate, 'sm')} ${escapeHtml(f.name)}${kickHtml}</span>`;
  }).join('');
  const legendHtml = '<div class="kicklegend">末脚＝ゴール前の伸び脚（過去5走の上がり3Fが、同じレースの出走馬の中でどのあたりだったか）。'
    + '<span class="kick k-top">抜群</span><span class="kick k-high">上位</span>'
    + '<span class="kick k-mid">並</span><span class="kick k-low">見劣り</span>の4段。'
    + '<span class="kick k-na">不明</span>は判定に足る過去走が無い馬。'
    + 'ペースが本命でも対抗でも、狙いは末脚の質で決める（展開で入れ替えない）。</div>';
  return `<div class="subh">狙い（末脚順）</div><div class="reco">${recoItems}</div>${legendHtml}`;
}

// 93-spec §6-0-1 案22: 本命マスを大きなカードにして馬名まで出し、残り5通りは1行ずつ。
// §6-1必須条件: 6マス全部に馬番／確率は断定にしない／basisがcourse以外なら注記／
// opacityで行ごと薄くしない（強弱は背景色と文字色だけで付ける）。
function renderScenarioGrid20(site) {
  const p = site.prediction;
  const grid = p.scenario_grid;
  const mainNige = scenarioMainNigeSet(p);
  const byNumberOv = {};
  for (const h of site.horses) byNumberOv[h.number] = h;

  const cells = [...grid.cells].sort((a, b) => a.rank - b.rank);
  const top = cells[0];
  const topHorses = scenarioHorsesForCell(top, byNumberOv).slice(0, 4);

  const passTimePart = (p.scenario?.main?.pass_time?.label)
    ? `${escapeHtml(p.scenario.main.pass_time.label)} ／ ` : '';
  const sidePct = Math.round((top.side_prob || 0) * 100);
  const subLine = `${passTimePart}このペースなら ${escapeHtml(top.side_label)} ${sidePct}%`;

  const bigItemsHtml = topHorses.map((h) => `
    <div class="it">${umaBox(h.number, h.gate)}<span class="mk">${escapeHtml(h.ability_mark || '')}</span>` +
    `<span class="nm">${escapeHtml(h.name)}</span><span class="st">${escapeHtml(SCENARIO_STYLE_FULL[h.running_style] || '')}</span></div>
  `).join('');

  const bigHtml = `
    <div class="c22">
      <div class="top">
        <span class="bdg b1" style="background:#fff;color:${'var(--navy)'}">本命</span>
        <span class="ttl">${escapeHtml(top.title)} × ${escapeHtml(top.side_label)}</span>
        <span class="v">${Math.round(top.prob * 100)}<small>%</small></span>
      </div>
      <div class="sub">${subLine}</div>
      <div class="hl">この展開で伸びる馬</div>
      <div class="list">${bigItemsHtml}</div>
    </div>
  `;

  const rowsHtml = cells.slice(1).map((c) => {
    const badgeKey = scenarioCellBadgeKey(c, p);
    const hs = scenarioHorsesForCell(c, byNumberOv);
    const shown = hs.slice(0, 6);
    const more = hs.length > 6 ? `<span class="more">＋${hs.length - 6}</span>` : '';
    const chipsHtml = shown.map((h) => paceHorsePiece(h, mainNige.has(h.number))).join('');
    const rowCls = `r${badgeKey ? ' on' : ' dim'}`;
    const badgeNum = badgeKey === 'main' ? 1 : badgeKey === 'sub' ? 2 : 3;
    const badgeHtml = badgeKey
      ? `<span class="bdg b${badgeNum}">${SCENARIO_BADGE_LABEL[badgeKey]}</span>` : '';
    return `
      <div class="${rowCls}"><span class="lb">${escapeHtml(c.title)} × ${escapeHtml(c.side_label)}</span>
        <div class="hs">${chipsHtml}${more}</div>${badgeHtml}
        <span class="vv">${Math.round(c.prob * 100)}%</span></div>
    `;
  }).join('');

  const basisNote = grid.basis && grid.basis !== 'course'
    ? '<div class="foldnote">このコースは実績が薄いため、同じ馬場・距離帯の平均で代用しています。</div>'
    : '';

  return `<div class="subh">展開シナリオ</div>${bigHtml}<div class="o22">${rowsHtml}</div>
    <div class="pmlegend">オレンジ枠<span class="sw nige"></span>＝主逃げ候補／馬番の下は印／
    確率は目安で「この展開になります」の断定ではありません</div>${basisNote}
    ${renderScenarioFavorites20(p, byNumberOv)}`;
}

// 旧3ブロック表示（本命＋対抗＋畳んだ3番手）。scenario_grid の無い過去公開分はこちらのまま
// 併存させる（93-spec §7「過去に公開済みのレースは再生成しない」・14-spec踏襲）。
function renderScenarioLegacy20(site) {
  const p = site.prediction;
  const byNumberOv = {};
  for (const h of site.horses) byNumberOv[h.number] = h;

  const blocks = [
    { key: 'main', cls: '' },
    { key: 'sub', cls: ' sub' },
    { key: 'other', cls: ' etc folded' },
  ];
  const roleBadgeHtml = (displayRole) => {
    if (displayRole === '本命') return '<span class="rolebadge hon">本命</span>';
    if (displayRole === '対抗') return '<span class="rolebadge tai">対抗</span>';
    return '';
  };
  let otherTitle = '';
  let hasPassTime = false;
  const blocksHtml = blocks.map(({ key, cls }) => {
    const s = p.scenario[key];
    if (!s) return '';
    const pctHtml = `<span class="p">${Math.round(s.prob * 100)}%</span>`;
    if (key === 'other') otherTitle = s.title;
    let passTimeHtml = '';
    if (key !== 'other' && s.pass_time && s.pass_time.label) {
      hasPassTime = true;
      passTimeHtml = `<span class="passtime">${escapeHtml(s.pass_time.label)}</span>`;
    }
    return `<div class="scn${cls}"><div class="hd">${roleBadgeHtml(s.display_role)}${escapeHtml(s.title)}${pctHtml}${passTimeHtml}</div></div>`;
  }).join('');
  const foldNoteHtml = otherTitle
    ? `<div class="foldnote">3つ目（${escapeHtml(otherTitle)}）は薄く畳む。可能性は残すが主役にしない。</div>`
    : '';
  const passTimeNoteHtml = hasPassTime
    ? '<div class="foldnote">過去の同コースの実績から出した目安。誤差はおおむね±1秒（実測で76%が±1秒以内）。</div>'
    : '';

  return `<div class="subh">展開シナリオ（本命＋対抗）</div>${blocksHtml}${foldNoteHtml}${passTimeNoteHtml}${renderScenarioFavorites20(p, byNumberOv)}`;
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

  // (c) 脚質傾向（コース別実績の内訳）＋ 脚質マップ（各脚質に出走馬を並べる）
  // 2026-07-27: マップ→傾向 だった並びを逆にした。先にこのコースの傾向を見て、
  // そのあと出走馬がどの脚質に入っているかを見る流れにする。
  if (p.leg_bias && p.leg_bias.length) {
    // 数値セルは列ごとに濃淡を付ける（同じ列の脚質どうしの比較。列をまたぐ比較ではない）。
    // 判定ピルは5段階の発散スケールで、マップ側と同じ色。
    const cols = { win_rate: [], rentai_rate: [], fukusho_rate: [] };
    for (const k of Object.keys(cols)) {
      cols[k] = p.leg_bias.map((lb) => paceRate(lb[k])).filter((v) => v !== null);
    }
    const cell = (lb, k) =>
      `<td class="hv ${heatClass(cols[k], paceRate(lb[k]))}">${escapeHtml(lb[k])}</td>`;
    const rows = p.leg_bias.map((lb) => `
      <tr class="${PACE_JUDG_CLASS[lb.judgment] || 'j-z0'}"><td class="l">${escapeHtml(lb.style)}</td>${cell(lb, 'win_rate')}${cell(lb, 'rentai_rate')}${cell(lb, 'fukusho_rate')}<td>${lb.runs}走</td><td class="l sep"><span class="jpill">${escapeHtml(lb.judgment)}</span></td></tr>
    `).join('');
    sections.push(`
      <div class="subh">脚質傾向</div>
      <table class="kg heat">
        <thead><tr><th class="l">脚質</th><th>勝率</th><th>連対</th><th>複勝</th><th>走数</th><th class="l sep">判定</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="pmlegend">数字のマスの濃さは、その列の中での順位（緑＝その列で強い / 赤＝弱い）。
        判定は複勝率と勝率から決めるので、マスの色とは一致しないことがあります</div>
    `);

    sections.push(renderPaceMap20(site));
  }

  // (d) 内外バイアス
  if (p.inner_outer_bias) {
    // 枠の識別は馬番と同じJRA枠色バッジ、有利不利はセルの背景色の濃淡で表す（C-1案）
    // ratio が null の枠＝コースの走数不足で比率を出せない枠。セルごと消すと
    // 「枠順が全部出ていない」ように見えるので、'—' のまま並べる
    const cellsHtml = p.inner_outer_bias.gates.map((g) => {
      if (g.ratio == null) {
        return `<div class="cell hnd" title="このコースの走数が足りず判定できません">`
          + `${wakuBox(g.gate, 'sm')}<span class="v nd">—</span></div>`;
      }
      const c = ratioClass(g.ratio);
      return `<div class="cell h${c}">${wakuBox(g.gate, 'sm')}<span class="v ${c}">${g.ratio.toFixed(2)}</span></div>`;
    }).join('');
    const hasNd = p.inner_outer_bias.gates.some((g) => g.ratio == null);
    // 内回り／外回りが混在するコース（京都芝1600/1400・新潟芝2000）では、どちらの
    // 数字を見ているのかを出す。混在しないコースでは scope が無く、何も足さない。
    const scopeHtml = p.inner_outer_bias.scope
      ? `<span class="scope">${escapeHtml(p.inner_outer_bias.scope)}の成績</span>` : '';
    sections.push(`
      <div class="biaslabel"><b>このコースの枠順成績</b> ${escapeHtml(p.inner_outer_bias.label)}${scopeHtml}</div>
      <div class="strip">${cellsHtml}</div>
      <div class="striplegend">過去数年の平均で、今日の馬場の傾向ではありません。緑=有利 / 赤=不利、濃いほど強い（1.00=標準）${hasNd ? ' / —=走数不足で判定なし' : ''}</div>
    `);
  }

  // (d-2) 今日の馬場（当日バイアス）
  // 上の帯がコースの過去平均なのに対し、こちらは「今日ここまでに終わったレース」だけを見る。
  // 2026-07-27の検証で、内外の偏りは実在する（同じ日の別の競馬場を予測子にすると
  // ゼロになる＝競馬場ごとの現象）ことを確認済み。ただし効果は採点に足す基準の1/5で、
  // 予想の当たり具合は作り方2通り・物差し2通りとも改善しなかったため点数には入れない。
  // 人が他の材料と合わせて見るための材料として出す。
  // 時計の傾向（time_trend）は芝の勝ちタイムから出す別系統。内外の偏りより持続が
  // はっきりしている（同じ開催の連続日で相関+0.406 / その日の前半→後半で+0.512）。
  // どちらか片方しか無い日もあるので、両方を同じ節にまとめて出し入れする。
  const hasBias = Boolean(p.day_bias && p.day_bias.surfaces
    && Object.keys(p.day_bias.surfaces).length);
  const tt = p.time_trend;
  if (hasBias || tt) {
    const rows = !hasBias ? '' : Object.entries(p.day_bias.surfaces).map(([surf, s]) => {
      const cls = s.label === '大きな偏りなし' ? 'flat' : 'lean';
      return `<tr>
        <td class="sf">${escapeHtml(surf)}</td>
        <td class="pct">内 ${s.inner_pct.toFixed(1)}%</td>
        <td class="pct">外 ${s.outer_pct.toFixed(1)}%</td>
        <td class="diff ${s.diff >= 0 ? 'in' : 'out'}">${s.diff >= 0 ? '+' : ''}${s.diff.toFixed(1)}pt</td>
        <td class="lab ${cls}">${escapeHtml(s.label)}</td>
        <td class="n">${s.n_races}R</td>
      </tr>`;
    }).join('');
    const ttRow = !tt ? '' : `<tr>
        <td class="sf">時計</td>
        <td class="pct" colspan="2">基準比 ${tt.value >= 0 ? '+' : ''}${tt.value.toFixed(2)}秒</td>
        <td class="diff ${tt.value <= 0 ? 'in' : 'out'}">${tt.value <= 0 ? '速い' : '遅い'}</td>
        <td class="lab lean">${escapeHtml(tt.label)}</td>
        <td class="n">${tt.n_races}R</td>
      </tr>`;

    const biasNote = !hasBias ? '' :
      `数字は3着内に入った割合（内＝1〜4枠 / 外＝5〜8枠）。前が残ったレース ${p.day_bias.front_wins || 0}`
      + ` / 差しが決まったレース ${p.day_bias.rear_wins || 0}`
      + (p.day_bias.pace_label ? `／ ペースは${escapeHtml(p.day_bias.pace_label)}` : '') + '。';
    const ttNote = !tt ? '' :
      `時計は芝の勝ちタイムを、コース・クラス・馬場状態・時期で補正した残差です`
      + `（当日${tt.today_races}R＋前日${tt.prev_races}R）。マイナスほど速い馬場。`;
    const scope = tt
      ? `当日＋前日の${tt.n_races}レース`
      : `ここまで${p.day_bias.n_races}レース`;

    sections.push(`
      <div class="biaslabel"><b>今日の馬場</b>
        <span class="scope">${escapeHtml(scope)}</span></div>
      <table class="daybias"><tbody>${rows}${ttRow}</tbody></table>
      <div class="striplegend">${biasNote}${ttNote}
        <b>${hasBias && tt ? 'どちらも点数には入れていません' : '点数には入れていません'}</b>。当たり具合を良くするほどの大きさは確認できていないためです。</div>
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
      statHtml = `<div class="statline">先行圧指数 <span class="big">${p.front_pressure.index.toFixed(2)}</span> → ${escapeHtml(p.front_pressure.label)}${nigeText}<span class="note">※前に行きたい馬が多め。逃げは「候補群」で見る（1頭の断定はしない）</span></div>`;
    }
    if (tableHtml || statHtml) {
      sections.push(`<div class="subh">逃げ候補・先行圧</div>${tableHtml}${statHtml}`);
    }
  }

  // (f) 展開シナリオ。93-pace-scenario-6cell-spec.md §6-0-1: 案22（6マス・主役カード）。
  // scenario_grid が無い過去公開分（§7「再生成しない」）は旧3ブロック表示のまま併存させる。
  if (p.scenario_grid && p.scenario_grid.cells && p.scenario_grid.cells.length === 6) {
    sections.push(renderScenarioGrid20(site));
  } else if (p.scenario) {
    sections.push(renderScenarioLegacy20(site));
  }

  return `
    <div class="secthead">展開・レース分析</div>
    ${sections.join('')}
  `;
}

// result/verificationの契約は1.1と共通（22-spec T4）。着順表・払戻表ロジックは
// 既存renderVerificationSection（:245-333）をコピー元として参照（23-spec §3-10）
function renderVerification20(site) {
  if (site.status !== 'final') {
    return `<div class="secthead">答え合わせ</div><div class="kv">結果はレース後に反映されます</div>`;
  }
  // 91-race-review-spec.md: 回顧が入っているレースは新しい3ブロックで描く。
  // 未処理の過去レースは従来の答え合わせに落ちる（バックフィルまでの互換）。
  if (site.review) {
    return `<div class="secthead">レース回顧</div>${renderReviewSection(site)}`;
  }
  const result = site.result;
  const verification = site.verification;
  if (!result || !verification) return '';

  const byNumber = {};
  for (const h of site.horses) byNumber[h.number] = h;

  // ---- 成績タイル（買い目・印・ペース）----
  const paceMatch = verification.pace_match;
  const paceExpected = site.prediction.pace_class ?? site.prediction.pace;

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
  const markInTop3 = markFinishEntries.filter((e) => e.finish <= 3).length;
  const landmineEntries = Object.entries(verification.landmine_result || {});
  const landmineOk = landmineEntries.filter(([, lr]) => lr.ok).length;

  const betCost = verification.bets_cost;
  const betReturn = verification.bets_return;
  const hasBets = betCost !== null && betCost !== undefined && betCost > 0;
  const betTile = hasBets
    ? `<div class="vtile wide ${verification.bets_hit ? 'hit' : 'miss'}">
        <div class="cap">買い目</div>
        <div class="val">${verification.bets_hit ? '的中' : '不的中'}　${fmtYen(betCost)} → ${fmtYen(betReturn)}</div>
        <div class="sub">回収率 ${Math.round((betReturn / betCost) * 100)}%</div>
      </div>`
    : `<div class="vtile wide"><div class="cap">買い目</div><div class="val">見送り</div>
        <div class="sub">このレースは買っていません</div></div>`;
  const markTile = markFinishEntries.length
    ? `<div class="vtile ${markInTop3 ? 'hit' : 'miss'}"><div class="cap">印</div>
        <div class="val">${markInTop3} / ${markFinishEntries.length}</div><div class="sub">が馬券圏内</div></div>`
    : `<div class="vtile"><div class="cap">印</div><div class="val">—</div><div class="sub">印なし</div></div>`;
  const paceTile = `
    <div class="vtile ${paceMatch === true ? 'hit' : paceMatch === false ? 'miss' : ''}">
      <div class="cap">ペース</div>
      <div class="val">${paceMatch === true ? '的中' : paceMatch === false ? '外れ' : '—'}</div>
      <div class="sub">${escapeHtml(paceExpected)} → ${escapeHtml(result.pace ?? '—')}</div>
    </div>`;
  const tilesHtml = `<div class="vtiles">${betTile}${markTile}${paceTile}</div>`;

  // ---- 「予想 → 結果」リスト（結果／印／地雷の3グループ。緑は的中の意味だけに使う）----
  const vrow = (left, right, note, inCls, arrow) => `
    <div class="vcr${inCls ? ' in' : ''}">
      <div class="yo">${left}</div>
      ${arrow ? '<span class="arw">→</span>' : ''}
      <span class="re">${right}</span>
      <span class="note">${note}</span>
    </div>`;

  const resultRows = result.top3.map((t) => {
    const h = byNumber[t.number];
    const mark = h && h.ability_mark ? `<span class="mkb ${markClsMap[h.ability_mark] || ''}">${escapeHtml(h.ability_mark)}</span>` : '';
    return vrow(`${mark}${umaBox(t.number, h && h.gate, 'sm')}<span class="nm">${escapeHtml(t.name)}</span>`,
      `${t.finish}着`, `${t.popularity}人気`, false, false);
  }).join('');
  const resultGroup = `<div class="vgh">結果<span class="s">（1〜3着）</span></div><div class="g-res">${resultRows}</div>`;

  const markRows = markFinishEntries.map((e) => {
    const h = byNumber[e.number];
    return vrow(`<span class="mkb ${markClsMap[e.mark] || ''}">${escapeHtml(e.mark)}</span>`
      + `${umaBox(Number(e.number), h && h.gate, 'sm')}<span class="nm">${h ? escapeHtml(h.name) : '—'}</span>`,
      `${e.finish}着`, h && h.popularity ? `${h.popularity}人気` : '', e.finish <= 3, true);
  }).join('');
  const markGroup = markFinishEntries.length
    ? `<div class="vgh">印 → 着順<span class="s">（${markInTop3}/${markFinishEntries.length} が馬券圏内）</span></div><div class="g-mark">${markRows}</div>`
    : '';

  const landmineRows = landmineEntries.map(([number, lr]) => {
    const h = byNumber[number];
    return vrow(`<span class="jm ${lr.ok ? 'ok' : 'ng'}">地雷</span>`
      + `${umaBox(Number(number), h && h.gate, 'sm')}<span class="nm">${h ? escapeHtml(h.name) : '—'}</span>`,
      `${lr.finish}着`, lr.ok ? '沈め成功' : '判定ミス', lr.ok, true);
  }).join('');
  const landmineGroup = landmineEntries.length
    ? `<div class="vgh">地雷 → 着順<span class="s">（${landmineOk}/${landmineEntries.length} 成功）</span></div><div class="g-mine">${landmineRows}</div>`
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
    ${tilesHtml}
    <div class="vlist">
      ${resultGroup}
      ${markGroup}
      ${landmineGroup}
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
  const simCtl = setupOddsMasterPanel(site, oddsAll);
  setupAkinatorPanel(site, oddsAll, simCtl);
  setupOddsMasterTabs();
  if (is20) setupShutuba20();
  if (is20) setupUpset20();
  setupFinishOrder();
}

main();

})();
