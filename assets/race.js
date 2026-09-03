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

// 差分の表示（馬場ブロックの「前回比」「平年比」で使う）。0は符号を付けない
function signed(v) {
  if (v == null || Number.isNaN(Number(v))) return '';
  const n = Number(v);
  if (n === 0) return '±0';
  return (n > 0 ? '+' : '') + n.toFixed(n % 1 === 0 ? 0 : 1);
}

// ＋＝硬い方向／−＝軟らかい方向。良し悪しではなく向きなので中立色寄りにする
function deltaCls(v) {
  if (v == null) return '';
  const n = Number(v);
  if (Math.abs(n) < 0.25) return 'flat';
  return n > 0 ? 'up' : 'down';
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
      // mark-2.5（2026-08-19）で地雷と能力印は同居する。両方あるときは「◎/地雷」の形で
      // 並べ、能力印が当たっている側を優先して o 色にする（地雷を外したことは併記で分かる）。
      const jirai = h.bet_mark === '地雷';
      const base = v11
        ? (h.ability_mark || '') + (h.role ? '/' + h.role : '')
        : (h.ability_mark || '') + (h.bet_mark && h.bet_mark !== h.ability_mark && !jirai ? h.bet_mark : '');
      if (base) {
        markCell = base + (jirai ? '/地雷' : '');
        cls = 'o';
      } else if (jirai) {
        markCell = '地雷';
        cls = 'x';
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

// netkeibaのコーナー表記を [{sep, nums, lead}] に分解する。
// 記号（, - =）は前の馬との間隔だが、**横のすき間としては描かない**。
// 2026-08-31 の段7で「前の馬との距離は消す」を本人が選んだため、sep は順番を決めるためだけに使う。
// かたまり（1馬身未満・カッコ書き）は残す。
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

// 回顧の「コーナー通過順位」。デザイン部の正本（案4）をそのまま実装したもの。
//   businesses/design/dept/finish/data/2026-08-31_race-review-corner/adopted.html
//   決定メモは同フォルダの decision.md（2026-09-01 の段8で確定）
// ・段は**あるだけ全部**（1角〜4角）＋ゴールの1段。ゴールを足したのは、4角→ゴールで
//   51%の馬が3番手以上動くため（段2の実測）
// ・横は4区画。割り方は keiba_review.style_of と同じ（1番手＝逃げ、以降は
//   通過順÷出走頭数を 0.33 / 0.66 で切る）。同じ馬が段ごとに横へ平均25pxずれるのを止める形
// ・1〜3着はネイビーの太枠＋上に着順。他の馬も今までどおり馬番で読める
// ・上の帯＝最初のコーナーでその位置にいた馬の結果（最高着順と3着内の頭数）
const REVIEW_ZONE_LABELS = ['逃げ', '先行', '差し', '追込'];

function reviewZoneOf(rank, field) {
  if (!rank || !field) return null;
  if (rank === 1) return 0;
  const r = rank / field;
  return r <= 0.33 ? 1 : (r <= 0.66 ? 2 : 3);
}

// 1つの段の並びを4区画へ割る。かたまりが区画の境目をまたぐときは割って両側に置く
// （先頭の (*2,11) は順位1と2なので必ず割れる。割った側それぞれに丸背景を出す）
function reviewZonesOf(els, field) {
  const z = [[], [], [], []];
  let rank = 1;
  for (const el of els) {
    const buf = {};
    for (const t of el.nums) {
      const k = reviewZoneOf(rank, field);
      rank += 1;
      if (k === null) continue;
      (buf[k] = buf[k] || []).push({ num: Number(t), lead: el.lead === t });
    }
    for (const k of Object.keys(buf)) z[k].push({ members: buf[k], multi: el.nums.length > 1 });
  }
  return z;
}

function reviewCornerPiece(m, byNumber, top3, showFin) {
  const gate = (byNumber[m.num] || {}).gate;
  const fin = top3[m.num];
  const lead = m.lead ? '<i class="rc-lead">▸</i>' : '';
  const lbl = showFin && fin ? `${fin}着` : '';
  return `${lead}<span class="rc-pz${fin ? ' rc-top' : ''}"><span class="rc-fin">${escapeHtml(lbl)}</span>${umaBox(m.num, gate, 'sm')}</span>`;
}

function reviewCornerRow(label, els, field, byNumber, top3, showFin, cls) {
  const cells = reviewZonesOf(els, field).map((groups) => {
    const inner = groups.map((g) => {
      const boxes = g.members.map((m) => reviewCornerPiece(m, byNumber, top3, showFin)).join('');
      return g.multi ? `<span class="rc-grp">${boxes}</span>` : boxes;
    }).join('');
    return `<div class="rc-z"><div class="rc-hs">${inner}</div></div>`;
  }).join('');
  return `<div class="rc-row seq${cls ? ` ${cls}` : ''}">
    <div class="rc-lab">${escapeHtml(label)}</div>
    <div class="rc-zones">${cells}</div></div>`;
}

// 最初のコーナーでその区画にいた馬が、結局どうなったか
function reviewCornerHead(els, field, finishOf) {
  const cells = reviewZonesOf(els, field).map((groups, i) => {
    const ns = groups.flatMap((g) => g.members.map((m) => m.num))
      .filter((n) => finishOf[n]).sort((a, b) => finishOf[a] - finishOf[b]);
    const all = groups.flatMap((g) => g.members.map((m) => m.num));
    const best = ns.length ? finishOf[ns[0]] : null;
    const t3 = ns.filter((n) => finishOf[n] <= 3).length;
    const cls = best === 1 ? 'r-win' : (t3 ? 'r-top' : 'r-non');
    const val = all.length
      ? `<div class="rc-v"><span class="g${t3 ? '' : ' none'}">${best ? `<b>${best}</b><small>着</small>` : '<b>—</b>'}</span>
          <span class="p">3着内 ${t3}/${all.length}</span></div>`
      : '<div class="rc-v"><span class="g none"><b>—</b></span><span class="p">0頭</span></div>';
    return `<div class="rc-z ${cls}"><span class="rc-b">${REVIEW_ZONE_LABELS[i]}<span class="c">${all.length}</span></span>${val}</div>`;
  }).join('');
  return `<div class="rc-row head"><div class="rc-lab"></div><div class="rc-zones">${cells}</div></div>`;
}

function renderReviewCorners(site, byNumber, top3) {
  const review = site.review || {};
  const raw = (review.race && review.race.corners) || {};
  const keys = Object.keys(raw).sort();
  // コーナーが0段のレース（直線だけ）はブロックごと出さない。285件中7件（2%）
  if (!keys.length) return '';
  // 出走頭数。取消・除外を除いた頭数で、区画の切り方（0.33 / 0.66）の分母になる
  const runners = (site.horses || []).filter((h) => !h.scratched);
  const field = runners.length;
  if (!field) return '';
  const finishOf = {};
  for (const h of runners) if (h.finish) finishOf[h.number] = h.finish;

  const first = reviewParseCorner(raw[keys[0]]);
  const rows = keys.map((k) => reviewCornerRow(`${k[0]}角`, reviewParseCorner(raw[k]), field, byNumber, top3, true, '')).join('');
  // ゴールの段。着順順に並べ替えて同じ4区画へ流す。着順が無い馬（中止・失格）は載せない
  const goalEls = runners.filter((h) => h.finish).sort((a, b) => a.finish - b.finish)
    .map((h) => ({ sep: '', nums: [String(h.number)], lead: null }));
  const goal = goalEls.length ? reviewCornerRow('ゴール', goalEls, field, byNumber, top3, false, 'goal') : '';

  return `<div class="rv-corner"><div class="rv-cap">コーナー通過順位</div>
    <div class="rc-map"><div class="rc-field"><div class="rc-rail"></div>
      ${reviewCornerHead(first, field, finishOf)}${rows}${goal}</div></div>
    <details class="fold"><summary><span class="tri"></span>記号の見方</summary>
      <div class="fold-body"><table><tbody>
        <tr><th class="l">横の区画</th><td class="l">その段での位置。左が前。分け方は最初のコーナーと同じ式（1番手＝逃げ、あとは通過順÷出走頭数）</td></tr>
        <tr><th class="l">上の帯</th><td class="l">最初のコーナーでその位置にいた馬の結果。最高着順と3着内の頭数</td></tr>
        <tr><th class="l">かたまり</th><td class="l">1馬身未満で並んでいる馬群。内側の馬番から並べる</td></tr>
        <tr><th class="l">▸</th><td class="l">その馬群の中でいちばん前にいる馬</td></tr>
        <tr><th class="l">太い枠</th><td class="l">1〜3着の馬。上に着順を出す</td></tr>
      </tbody></table></div>
    </details></div>`;
}

// ラップ推移。縦軸は速いほど上（秒をそのまま上向きにすると直感と逆になる）
// ラップの折れ線グラフ（100-lap-compare-spec.md）。
// 1つのグラフに2本重ねる。紺＝今回、灰の破線＝同じコース・同じペースの平均。
// 目盛りは当然に共通で、**上にあるほど速いハロン**（91-specからの既定の向き）。
//
// 線だけをSVGで描き、文字（数値・軸・凡例）は全部HTMLに出す。SVGに文字を入れると
// viewBox の幅が画面幅に圧縮される分だけ文字も縮み、375pxの端末で実効5.2pxになって
// 読めなかった（2026-07-30に実測）。線は preserveAspectRatio="none" で伸ばし、
// vector-effect="non-scaling-stroke" で太さだけ一定に保つ。
const LAP_LINE_H = 104;   // 折れ線の描画高さ（px）
const LAP_Y0 = 13;        // 縦の使用範囲（％）。上下に数値ラベルの逃げを作る
const LAP_Y1 = 87;
const LAP_DENSE_N = 12;   // これ以上のハロン数は数値を小さめに詰める

// 距離が200の倍数でないコースは最初の区間だけ短い（例 1700m → 100m）。
// その1点を線に入れると縦の目盛りが引き伸ばされて残りの形が潰れるので、線からは外して
// 数値だけ注記に出す。コース別データページ（courses.js）と同じ扱い。
function lapLineChart(splits, avg, lapFirstM) {
  const n = splits.length;
  const skip = lapFirstM && lapFirstM !== 200 ? 1 : 0;
  const scaled = splits.slice(skip).concat(avg ? avg.slice(skip) : []);
  const lo = Math.min(...scaled) - 0.15;
  const hi = Math.max(...scaled) + 0.15;
  const span = (hi - lo) || 1;
  // 各ハロンは区間なので、点は区間の中央に置く（軸ラベル・差の行と桁がそろう）
  const xf = (i) => ((i + 0.5) / n) * 100;
  const yf = (v) => LAP_Y0 + ((v - lo) / span) * (LAP_Y1 - LAP_Y0);
  const pts = (vals) => vals.slice(skip)
    .map((v, k) => `${xf(k + skip).toFixed(2)},${yf(v).toFixed(2)}`).join(' ');

  const grid = splits.map((v, i) =>
    `<line x1="${xf(i).toFixed(2)}" y1="0" x2="${xf(i).toFixed(2)}" y2="100" class="rv-lgr"/>`).join('');
  const lines = (avg ? `<polyline points="${pts(avg)}" class="rv-lln avg"/>` : '')
    + `<polyline points="${pts(splits)}" class="rv-lln now"/>`;
  const dots = (vals, cls) => vals.slice(skip).map((v, k) =>
    `<i class="rv-ldt ${cls}" style="left:${xf(k + skip).toFixed(2)}%;top:${yf(v).toFixed(2)}%"></i>`).join('');
  // 数値は今回の線にだけ付ける。平均より速い（＝点が上）なら上に、遅いなら下に逃がす
  const vals = splits.slice(skip).map((v, k) => {
    const i = k + skip;
    const up = avg ? v <= avg[i] : true;
    return `<span class="rv-lvl ${up ? 'up' : 'dn'}" `
      + `style="left:${xf(i).toFixed(2)}%;top:${yf(v).toFixed(2)}%">${v.toFixed(1)}</span>`;
  }).join('');
  return `<div class="rv-lcw" style="height:${LAP_LINE_H}px">
      <svg class="rv-lcs" viewBox="0 0 100 100" preserveAspectRatio="none">${grid}${lines}</svg>
      ${avg ? dots(avg, 'avg') : ''}${dots(splits, 'now')}${vals}
    </div>
    <div class="rv-lbax">${splits.map((v, i) =>
    `<span${i < skip ? ' class="off"' : ''}>${i === 0 && skip ? `${lapFirstM}m` : i + 1}</span>`).join('')}</div>`;
}

function renderReviewLap(lap) {
  const splits = (lap && Array.isArray(lap.splits) ? lap.splits : [])
    .map(Number).filter((x) => !Number.isNaN(x));
  if (!lap || splits.length < 4) return '';
  const course = lap.course && Array.isArray(lap.course.lap)
    && lap.course.lap.length === splits.length ? lap.course : null;
  const avg = course ? course.lap.map(Number) : null;
  const dense = splits.length >= LAP_DENSE_N ? ' dense' : '';

  let legend = '<span class="rv-lgi now">今回</span>';
  if (avg) {
    const paceWord = { S: 'スロー', M: '平均', H: 'ハイ' }[course.pace] || null;
    const cname = `${escapeHtml(course.track)}${escapeHtml(course.surface)}${course.distance}m`;
    legend += `<span class="rv-lgi avg">コースの平均（${cname}・`
      + `${paceWord ? `${paceWord}ペースの` : ''}${course.races}レース）</span>`;
  }

  // 今回−平均。プラスは今回のほうが時間がかかった（遅い）ハロン
  const diffRow = avg ? `<div class="rv-ldf${dense}">${splits.map((v, i) => {
    const d = v - avg[i];
    return `<span>${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d).toFixed(1)}</span>`;
  }).join('')}</div>` : '';

  const firstM = course ? course.lap_first_m : null;
  const notes = [];
  if (firstM && firstM !== 200) {
    notes.push(`最初の${firstM}mは今回 ${splits[0].toFixed(1)}秒`
      + `${avg ? ` / 平均 ${avg[0].toFixed(1)}秒` : ''}。`
      + '区間の長さが他と違うので、線と縦の目盛りからは外しています');
  }
  notes.push(`前後半の差 ${lap.diff > 0 ? '+' : ''}${lap.diff.toFixed(1)}秒`
    + `（前半 ${lap.front.toFixed(1)}秒 / 後半 ${lap.back.toFixed(1)}秒）`);
  if (avg && course.races === 1) {
    notes.push('このコースのこのペースは今回の1レースだけなので、平均は今回とまったく同じ線になります');
  }
  if (!avg) {
    notes.push('コースの平均ラップは今回のコースを特定できないため出していません');
  }
  return `<div class="rv-lap${dense}">
    <div class="rv-lgd">${legend}</div>
    ${lapLineChart(splits, avg, course ? course.lap_first_m : null)}
    ${diffRow}
  </div>
  ${notes.map((t) => `<div class="rv-note">${t}</div>`).join('')}`;
}

// ===== 4.4a 着順表（95-finish-order-spec.md）=====
// netkeiba の結果表と同じ列・同じ順で並べる。1〜5着は常時、6着以下は折りたたみ。
// 値が1頭も無い列は列ごと落とす（"—"だけの列を作らない）。過去レースでは
// 厩舎（原簿に無い）や通過順（settle時にnetkeiba側が未記入）が落ちることがある。
const FO_TOP_N = 5;

const ABILITY_CLS = { '◎': 'm-hon', '○': 'm-tai', '▲': 'm-tan', '△': 'm-oku' };

// 出馬表の印列（markBadge20）と同じ並べ方。能力印を持つ地雷馬・穴馬は下に積む
function foMark(h) {
  const sub = h.bet_mark === '地雷'
    ? '<span class="mkb m-jir sub">地雷</span>'
    : (isAna(h) ? '<span class="mkb m-ana sub">穴</span>' : '');
  if (h.ability_mark) {
    const badge = `<span class="mkb ${ABILITY_CLS[h.ability_mark] || ''}">${escapeHtml(h.ability_mark)}</span>`;
    return sub ? `<span class="mkstack">${badge}${sub}</span>` : badge;
  }
  if (h.bet_mark === '地雷') return '<span class="mkb m-jir">地雷</span>';
  if (h.keshi) return '<span class="mkb m-kes">消</span>';   // mark-2.7（markBadge20 と同順）
  if (isAna(h)) return '<span class="mkb m-ana">穴</span>';
  return '';
}

// 1位=金 / 2位=銀 / 3位=銅。着順ボックス・勝率の配色（.ag.f1〜f3）と共通。
const MEDAL_CLS = { 1: 'f1', 2: 'f2', 3: 'f3' };

// "1:46.0" → 106.0 秒。"46.0"（1分未満・障害の "3:20.5" も同形）にも対応する。
// 数字以外が混じる値（中止・除外の行）は null を返して列から外す。
function timeToSec(text) {
  if (!text) return null;
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(String(text).trim());
  if (!m) return null;
  return (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2]);
}

// 着順表で使う人気。確定人気が正で、持っていない過去の公開分だけ予想時点の人気に戻す。
function foPop(h) {
  return h.final_popularity != null ? h.final_popularity : h.popularity;
}

// 各列 = { label, cls, has(h), cell(h, ctx) }。has を持たない列は常に出す。
const FO_COLS = [
  { label: '着', cls: 'fo-c1 num', cell: (h) => (h.finish != null ? h.finish : escapeHtml(h.finish_text || '—')) },
  // 枠番の列は持たない。枠の情報は馬番ボックスの色（frameClass）で示す。
  { label: '馬番', cls: 'fo-c2 num', cell: (h) => umaBox(h.number, h.gate, 'sm') },
  { label: '印', cls: 'fo-mk', has: (h) => !!h.ability_mark || h.bet_mark === '地雷' || isAna(h) || !!h.keshi, cell: foMark },
  { label: '馬名', cls: 'fo-nm', cell: (h) => escapeHtml(h.name) },
  { label: '性齢', cls: 'num sub', has: (h) => !!h.sex_age, cell: (h) => escapeHtml(h.sex_age || '—') },
  { label: '斤量', cls: 'num sub', has: (h) => h.weight_carried != null,
    cell: (h) => (h.weight_carried != null ? h.weight_carried.toFixed(1) : '—') },
  // 104-body-weight-live-spec.md §5.2: 当日馬体重＋前走比増減。位置は「斤量」の直後
  { label: '馬体重', cls: 'num sub', has: (h) => h.body_weight != null,
    cell: (h) => (h.body_weight == null ? '—'
      : `${h.body_weight}${h.body_weight_diff != null ? `(${h.body_weight_diff > 0 ? '+' : ''}${h.body_weight_diff})` : ''}`) },
  { label: '騎手', cls: 'sub', has: (h) => !!h.jockey, cell: (h) => escapeHtml(h.jockey || '—') },
  { label: 'タイム', cls: 'num fo-tm', has: (h) => !!h.finish_time,
    cell: (h) => escapeHtml(h.finish_time || '—') },
  { label: '着差', cls: 'num sub', has: (h) => !!h.margin,
    cell: (h) => (h.finish === 1 ? '' : escapeHtml(h.margin || '—')) },
  // 着差（netkeiba）は「1頭前との差」で単位も馬身。勝ち馬から何秒離れたかは自分で足し算
  // しないと分からないので、勝ち時計との差を秒で別列に出す（1着は空欄）。
  { label: '勝ち馬差', cls: 'num sub', has: (h, ctx) => ctx.winSec != null && !!h.finish_time,
    cell: (h, ctx) => {
      if (h.finish === 1) return '';
      const s = timeToSec(h.finish_time);
      if (s == null || ctx.winSec == null) return '—';
      const d = Math.round((s - ctx.winSec) * 10) / 10;
      return `<span title="勝ち馬とのタイム差">${d > 0 ? '+' : ''}${d.toFixed(1)}</span>`;
    } },
  // 人気は1・2・3番人気を金・銀・銅で塗る（セルの背景ではなく数字のボックス）
  // 隣の単勝が確定オッズなので、人気も確定人気（final_popularity）を出す。popularity は
  // 予想時点＝発走10分前のオッズ順で、並べると矛盾して見えていた（2026-08-01 中京3R:
  // 単勝10.1倍で6番人気）。final_popularity を持たない過去の公開分は popularity に戻す。
  { label: '人気', cls: 'num', has: (h) => foPop(h) != null,
    cell: (h) => (foPop(h) == null ? '—'
      : medalSpan(foPop(h), MEDAL_CLS[foPop(h)] || '', `${foPop(h)}番人気`)) },
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
  // 95-specの「馬体重」列（結果ページの文字列をそのまま出すもの）は 104-spec で
  // 斤量の直後の数値列に一本化した。settle が同じ int のキーへ埋めるので情報は失われない。
];

function renderFinishOrder(site) {
  const runners = (site.horses || []).filter((h) => !h.scratched && (h.finish != null || h.finish_text));
  if (!runners.length) return '';
  runners.sort((a, b) => (a.finish ?? 999) - (b.finish ?? 999) || a.number - b.number);

  const l3 = runners.map((h) => h.last_3f).filter((v) => typeof v === 'number');
  // 速い3タイム。同タイムが並んだ場合は1つの順位を分け合う（例: 37.7が2頭なら金2つ・次は銀）
  const ctx = { l3Top: [...new Set(l3)].sort((a, b) => a - b).slice(0, 3) };
  // 基準は勝ち時計だけ。1着のタイムが無いレースは他馬の時計を基準にせず、列ごと落とす
  const winner = runners.find((h) => h.finish === 1);
  ctx.winSec = winner ? timeToSec(winner.finish_time) : null;
  const cols = FO_COLS.filter((c) => !c.has || runners.some((h) => c.has(h, ctx)));

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

// 4タブの切り替え。描画は buildRace20Html が済ませてあるので、ここは表示の出し入れだけ。
//
// 呼ぶ順番が重要：この関数は main() の setup 群の最後に呼ぶ。それまで全パネルは
// 表示されたままで、.tabs-ready を付けた瞬間に初めて display:none が効き始める。
// これは setupFinishOrder() が着順表の1列目の幅を実測しており（上の関数・w1==0 だと
// 黙って諦める仕様）、隠れたパネルの中で走らせると固定2列がズレるため。
// JS がここまで到達しなかった場合は .tabs-ready が付かず、従来どおり縦一列で
// 全ブロックが読める状態に留まる（＝タブ化の失敗で情報が消えることはない）。
// 買い目タブのアキネーターを描き直す入口。setupAkinatorPanel が自分の rerender を入れる。
// 出馬表タブで自分の印を付けてから買い目タブへ来ると、アキネーターは前に描いたままなので、
// タブを開いた時に描き直して印を読み直させる（state は保つので、進んだところは戻らない）
let akRefresh = null;

function setupTabs20(site) {
  const root = document.querySelector('#race-content .race20');
  if (!root) return;
  const bar = root.querySelector('.tabbar');
  const panes = Array.from(root.querySelectorAll('.tabpane'));
  if (!bar || !panes.length) return;

  const show = (keyIn, pushHash) => {
    // #tab=course 等、実在しないパネルを指す場合は既定タブへ落とす（109-spec §2.2 縮退）
    const key = panes.some((p) => p.dataset.pane === keyIn) ? keyIn : RACE20_TAB_DEFAULT;
    for (const b of bar.querySelectorAll('.t20')) {
      const on = b.dataset.tab === key;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    for (const p of panes) p.classList.toggle('on', p.dataset.pane === key);
    // 回顧タブは開いた瞬間に初めて幅が確定するので測り直す（折りたたみと同じ理由）
    if (key === 'kaiko') setupFinishOrder();
    // 111-spec: 出馬表で付けた印をアキネーターにも出すため、開くたびに描き直す
    if (key === 'kaime' && akRefresh) akRefresh();
    if (pushHash) history.replaceState(null, '', `${location.pathname}${location.search}#tab=${key}`);
  };

  bar.addEventListener('click', (e) => {
    const b = e.target.closest('.t20');
    if (!b) return;
    show(b.dataset.tab, true);
    // タブより下まで読んでいたら、切り替え先の先頭に戻す（上には戻しすぎない）
    const y = bar.getBoundingClientRect().top + window.scrollY;
    if (window.scrollY > y) window.scrollTo(0, y);
  });
  // 共有リンクの #tab=... で直接そのタブを開く
  window.addEventListener('hashchange', () => show(race20TabFromHash(), false));

  root.classList.add('tabs-ready');
  show(race20TabFromHash(), false);
}

// 画面幅が変わると列幅も変わるので測り直す（縦横の切り替え・ウィンドウ幅の変更）
let foResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(foResizeTimer);
  foResizeTimer = setTimeout(setupFinishOrder, 150);
});

// 勝ち時計カードの2行目（91-race-review-spec.md §7-3）。
// 「この条件」＝ 競馬場・馬場・距離・クラス・馬場状態・季節に加えて、その日その場の
// 馬場の速さまで引いた後という意味。根拠の数字（基準タイム・馬場差）は画面に出さない。
function winningTimeNote(ev) {
  if (!ev || !ev.label) return '';
  // 評価語は1行目に独立させる。同じ行に続けると幅128pxのカードで数字の途中で折れる
  const d = Math.abs(ev.faster_by_sec);
  const word = `<b>${escapeHtml(ev.label)}</b><br>`;
  if (d < 0.05) return { html: `${word}この条件の平均どおり` };
  const dir = ev.faster_by_sec > 0 ? '速い' : '遅い';
  return { html: `${word}この条件の平均より<span class="rv-nw">${d.toFixed(1)}秒${dir}</span>` };
}

function renderReviewSection(site) {
  const review = site.review;
  const race = review.race || {};
  const result = site.result || {};
  const byNumber = {};
  for (const h of site.horses) byNumber[h.number] = h;
  const top3 = {};
  for (const t of (result.top3 || [])) top3[t.number] = t.finish;

  // ── 1. どんなレースだったか ──
  // 「レースの型」は6マス（ペース × 勝ち馬の1コーナーの位置）で、馬名ポップアップの
  // 「レースの型べつ成績」と同じ呼び名・同じ切り方（keiba_review.race_type_result）。
  // **隣の「決着」とは別の見方**（あちらは上位3頭の4角平均位置）なので、
  // 「差し有利 × 前が楽に残る」のように食い違うことがある。注記を facts の下に出す。
  const rtype = race.race_type || {};
  const facts = [
    ['ペース', race.pace && race.pace.act ? paceWord(race.pace.act) : '—',
      race.pace && race.pace.hit === false ? `${paceWord(race.pace.pred)}と読んでいた` : (race.pace && race.pace.hit ? '読みと一致' : ''),
      race.pace ? race.pace.hit : null],
    ['決着', race.bias && race.bias.act ? race.bias.act : '—',
      race.bias && race.bias.pred ? `${race.bias.pred}と読んでいた` : '',
      race.bias ? race.bias.hit : null],
    // 型が無いのは 2026-09-01 より前に回顧を作ったページ。「—」のカードを出さず、
    // カードごと消す（93-spec §7「過去に公開済みのレースは再生成しない」）
    ...(rtype.act_label ? [['レースの型', rtype.act_label,
      rtype.hit === false && rtype.pred_label ? `${rtype.pred_label}と読んでいた`
        : (rtype.hit ? '読みと一致' : ''),
      rtype.hit, 'long']] : []),
    ['ラップ', race.lap ? race.lap.label : '—', '', null],
    ['勝ち時計', race.winning_time || '—', winningTimeNote(race.winning_time_eval), null],
  ].map(([lbl, val, sub, ok, cls]) => `<div class="rv-fact${ok === false ? ' bad' : ''}">
      <div class="rv-fl">${escapeHtml(lbl)}</div>
      <div class="rv-fv${cls ? ` ${cls}` : ''}">${escapeHtml(String(val))}</div>
      <div class="rv-fs">${sub && sub.html ? sub.html : escapeHtml(sub || '')}</div></div>`).join('');
  const factsNote = rtype.act_label
    ? '<div class="rv-fnote">レースの型は、ペースと勝ち馬が1コーナーを何番手で通ったかの'
      + '組み合わせです（6通り）。決着の欄は上位3頭の4角平均の位置で、別の見方です</div>'
    : '';

  // ── 2. 印と買い目 ──
  // 印をつけた馬を ◎○▲△ の順に1本の配列にする。サマリーのバッジ列と下のカードで
  // 同じ順序・同じ母数を使い、表示と件数がずれないようにする
  const marked = ['◎', '○', '▲', '△'].flatMap((mk) =>
    site.horses.filter((h) => h.ability_mark === mk && !h.scratched).map((h) => ({ mk, h })));
  const markInTop3 = marked.filter(({ h }) => h.finish && h.finish <= 3).length;
  const markCards = marked.map(({ mk, h }) => {
    const good = h.finish && h.finish <= 3;
    return `<div class="rv-mc${good ? ' hit' : ''}"><div class="rv-mk">${mk}</div>
      <div class="rv-mb">${umaBox(h.number, h.gate, 'sm')}${escapeHtml(h.name)}<br>
      <span class="rv-s">${foPop(h) ?? '—'}人気</span></div>
      <div class="rv-mf">${h.finish ?? '—'}<span class="rv-u">着</span></div></div>`;
  }).join('');
  // 印の的中サマリー。件数だけの1行だと「どの印が来たか」はカードを1枚ずつ読む
  // 必要があったので、印を横に並べて3着以内を緑で塗る
  const markBand = marked.map(({ mk, h }) => {
    const good = h.finish && h.finish <= 3;
    return `<div class="rv-sb${good ? ' ok' : ''}"><span class="m">${mk}</span>`
      + `<span class="f">${h.finish ? `${h.finish}着` : '—'}</span></div>`;
  }).join('');
  const land = (site.verification || {}).landmine_result || {};
  const landCards = Object.keys(land).sort((a, b) => Number(a) - Number(b)).map((num) => {
    const lr = land[num]; const h = byNumber[num] || {};
    return `<div class="rv-mc lm${lr.ok ? ' hit' : ' ng'}"><div class="rv-mk sm">地雷</div>
      <div class="rv-mb">${umaBox(Number(num), h.gate, 'sm')}${escapeHtml(h.name ?? '')}<br>
      <span class="rv-s">${foPop(h) ?? '—'}人気　${lr.ok ? '読みどおり飛んだ' : '飛ばずに好走'}</span></div>
      <div class="rv-mf">${lr.finish}<span class="rv-u">着</span></div></div>`;
  }).join('');
  // 穴は地雷の裏返しで、3着以内に来たら成功。「危ないと見た馬」と対になる枠として並べる
  const ana = (site.verification || {}).ana_result || {};
  const anaCards = Object.keys(ana).sort((a, b) => Number(a) - Number(b)).map((num) => {
    const ar = ana[num]; const h = byNumber[num] || {};
    return `<div class="rv-mc ana${ar.ok ? ' hit' : ' ng'}"><div class="rv-mk sm ana">穴</div>
      <div class="rv-mb">${umaBox(Number(num), h.gate, 'sm')}${escapeHtml(h.name ?? '')}<br>
      <span class="rv-s">${foPop(h) ?? '—'}人気　${ar.ok ? '読みどおり走った' : '走らなかった'}</span></div>
      <div class="rv-mf">${ar.finish != null ? ar.finish : '—'}<span class="rv-u">着</span></div></div>`;
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
    ${factsNote}
    ${renderReviewLap(race.lap)}
    ${renderReviewCorners(site, byNumber, top3)}

    <div class="eyebrow">印と買い目</div>
    ${marked.length ? `<div class="rv-msum"><div class="rv-sbs">${markBand}</div>
      <div class="rv-sres">3着以内 <b>${markInTop3}</b>/${marked.length}頭</div></div>` : ''}
    <div class="rv-mcs">${markCards}</div>
    ${landCards ? `<div class="rv-summ">危ないと見た馬</div><div class="rv-mcs">${landCards}</div>` : ''}
    ${anaCards ? `<div class="rv-summ">走ると見た人気薄</div><div class="rv-mcs">${anaCards}</div>` : ''}
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
          <td>${fmtNum(dispScore(h), 1)}</td>
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
        ? `${markBadge(h.ability_mark)}${umaBox(b.number, h.gate, 'sm')} ${escapeHtml(b.name)} <span class="meta">${escapeHtml(b.meta)}</span><span class="sc">${fmtNum(dispScore(h), 1)} / ${h.popularity ?? '—'}人気</span>`
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
    if (ev.target && ev.target.id === 'ak-memo-input') {
      Akinator.setMemo(ctx, state, ev.target.value);   // 107 §2.4: 再描画しない（入力を邪魔しない）
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

  // 買い目タブを開いた時に自分の印を読み直させる（setupTabs20 から呼ぶ）。
  // 文字入力中の再描画はここに含めない（タブ切替でしか呼ばれない）
  akRefresh = rerender;

  rerender();
}

// ===== 完全Python化2.0（schema_version: keiba-log-2.0）描画パス =====
// T9〜T12。既存関数は一切呼ばない・変更しない（23-fullpython-fe-spec.md）。
// gradeClass/gradeDispは app.js（共通層）に移設（45-spec §2.8: 手動シミュレーターの評価バッジが
// 既存の評価体系に合わせて参照するため。呼び出しは従来どおりグローバル解決される）。

// 枠順の等級（2026-08-27）。倍率＝その枠の複勝率 ÷ そのコースの全枠平均。
// 刻みは全国106コース×8枠のうち走数100以上の603件を5等分した値。
// 脚質は4つの範囲がずれていて刻みを分けたが、枠は8つとも同じ「1頭あたりの複勝率」
// なので共通の1本で足りる（最小0.30・最大2.00の1つの分布）。
const GATE_CUTS = [0.889, 0.974, 1.034, 1.106];
const GATE_GRADES = ['D', 'C', 'B', 'A', 'S'];

function gateGrade(ratio) {
  if (ratio == null) return null;
  for (let i = 0; i < GATE_CUTS.length; i += 1) {
    if (ratio < GATE_CUTS[i]) return GATE_GRADES[i];
  }
  return GATE_GRADES[GATE_GRADES.length - 1];
}

function ratioClass(ratio) {
  if (ratio >= 1.15) return 'b1';
  if (ratio >= 1.05) return 'b2';
  if (ratio > 0.95) return 'b3';
  if (ratio > 0.85) return 'b4';
  return 'b5';
}

// data/upset_bands.json（132-spec）。読めなかったときは null のまま動く
let BANDS = null;

// このレースの予想が過去どれだけ当たっていたかを引く（132-spec）。
// 帯の切り方は keiba_sitestats.UPSET_CONF_CUT が正本で、こちらは引くだけ。
function upsetConfidence(upset) {
  if (!BANDS || !upset || !upset.label) return null;
  const sel = (upset.classes || []).find((c) => c.selected);
  if (!sel || typeof sel.percent !== 'number') return null;
  const cut = (BANDS.upset.cuts || {})[upset.label];
  const side = (cut === undefined || cut === null) ? null : (sel.percent >= cut ? 'hi' : 'lo');
  const b = (BANDS.upset.bands || []).find((x) => x.label === upset.label && x.side === side);
  return (b && b.n && b.rate !== null) ? b : null;
}

// 荒れ度ラベル（132-spec・案C「当たった率を数字で」）。
// upset が無いレースは何も出さない（89-spec §3.3 の縮退）。
//
// 3行を1行にした理由（2026-08-27）は4つ。
//  1. 同じ%が見出しと行で2回出ていた
//  2. 比べ方が3種類（差・倍率・絶対値のバー）混ざっていた
//  3. 平均比の1行が3行の下にあるのに、中身は見立てクラス1つ分だけだった
//  4. しきい値で決まるラベルを3行で並べると「一番大きい数字が選ばれる」形に見えた
//     （大荒れ19% / 中荒れ77% でラベルは大荒れ、が起きる）
// 大きく出す数字を「見立てクラスの確率」から「その予想が当たった率」へ替えたのが要点。
// 前者はレースの性質、後者は予想の確からしさで、混ぜると 4 が起きる。
//
// 【2026-08-31・ユーザー決定】帯の数字は「見立てクラスの確率」へ戻した。
// 一覧のチップ（index.js upsetChipHtml）は確率を出しており、同じ見た目のチップが
// 一覧と詳細で別物を指していた（一覧「堅い65%」→詳細「堅い78%」→開くと内訳「堅い65%」）。
// 当たった率は札の中の .upconf に言葉つきで残す（そこでだけ意味が読める）。
// 上の 4（ラベルが確率最大とは限らない）は画面に説明が無いままになる。
// predict.json 側に threshold_line（例「大荒れが19%以上なので大荒れ」）はあるが、
// 2026-08-27 の作り直しで描画から落ちており、ここでも描いていない。
// 3クラスの内訳は折りたたみに残す（同じ大荒れでも堅いが0%か34%かで中身が違うため）。
//
// bigpayHtml（3連単100万超え・103-spec）は折りたたみの**上**に入れる（110-spec §2）。
// 呼び出し元 renderMitate20 が組み立てて渡す。
function renderUpset20(upset) {
  if (!upset || !Array.isArray(upset.classes) || upset.classes.length !== 3) return null;
  const sel = upset.classes.find((c) => c.selected) || upset.classes[0];
  const conf = upsetConfidence(upset);
  // 45%未満は「当てにならない帯」。帯を灰にして、強い予想と見た目で分ける
  // （2026-08-31以降、灰にする根拠は当たった率のまま。帯に出す数字だけ確率へ戻した）
  const low = conf && conf.rate < 45;

  // 折りたたみの中の3クラス。並びは 堅い → 中荒れ → 大荒れ で固定（確率順にしない）
  const rows = upset.classes.map((c, i) => `
      <button type="button" class="ucrow c${i}${c.selected ? ' hit viewing' : ''}"
              data-upset="${escapeHtml(c.key)}" aria-pressed="${c.selected ? 'true' : 'false'}">
        <span class="nm">${escapeHtml(c.name)}</span>
        <span class="track"><span class="fill" style="width:${c.percent}%"></span></span>
        <span class="pv">${c.percent}<small>%</small></span>
      </button>`).join('');
  // 傾向表は「その決着になったレースの顔ぶれ」であって予想の当たった率ではない
  const tables = upset.classes.map((c) => {
    if (!Array.isArray(c.tendencies) || !c.tendencies.length) return '';
    return `
      <table class="up2tend${c.selected ? ' show' : ''}" data-upsettend="${escapeHtml(c.key)}">
        <tbody>${c.tendencies.map((t) =>
      `<tr><th>${escapeHtml(t.label)}</th><td>${escapeHtml(t.value)}</td></tr>`).join('')}
        </tbody>
      </table>`;
  }).join('');

  // 実測が取れないとき（bands が読めない・公開直後で母数ゼロ）は率ごと出さない。
  // 「当たった率」を出せないのに枠だけ残すと、空欄が数字に見える
  const rate = conf ? `<span class="up${low ? ' low' : ''}">`
    + `<span class="nm">${escapeHtml(upset.label_name)}</span>`
    + `<span class="pv">${conf.rate}<small>%</small></span></span>`
    : `<span class="up"><span class="nm">${escapeHtml(upset.label_name)}</span></span>`;

  // 一言（4番人気以下が…）と3クラスの内訳は、帯を押して開く札の中へ入れた（2026-08-27）。
  // 帯の下に裸で置くと、左端が帯と9pxずれ、下の罫線で上下どちらの塊からも切れて浮いていた。
  // 札の開け閉めは馬名の札（#pop-N）と同じ仕組みをそのまま使う（[data-pop] → #pop-*）。
  // 見出しは行のタップで差し替わる（setupUpset20）。最初は見立てクラスのもの
  const tendCaption = `<div class="pcap pcap-tend">「${escapeHtml(sel.name)}」で決まったレースでは</div>`;
  return {
    // 帯の中に置く分（renderShutuba20 が差し込む）。押すと札が開く
    band: `<button type="button" class="up${low ? ' low' : ''}" data-pop="upset">`
      + `<span class="nm">${escapeHtml(upset.label_name)}</span>`
      + (typeof sel.percent === 'number'
        ? `<span class="pv">${sel.percent}<small>%</small></span>` : '')
      + `<i class="apop">▸</i></button>`,
    // 札の中身。renderShutuba20 が他の札と一緒に並べる
    popup: `
      <div class="popup" id="pop-upset">
        <div class="phead">
          <span class="pname k-${escapeHtml(sel.key)}">${escapeHtml(upset.label_name)}</span>
          <span class="pmeta">${escapeHtml(sel.card)}</span>
          <button type="button" class="pclose" data-close>閉じる</button>
        </div>
        <div class="pbody">
          ${conf ? `<div class="upconf">この予想がその通りになったのは、同じ判断をした過去
            <b>${conf.n}レース</b> 中 <b>${conf.ok}レース</b>（<b>${conf.rate}%</b>）</div>` : ''}
          <div class="pcap">3つの形の内訳</div>
          <div class="ucrows">${rows}</div>
          ${tendCaption}
          ${tables}
        </div>
      </div>`,
  };
}

// 3連単100万超え（103-sanrentan-1m-spec.md §3）。bigpay が無ければ何も出さない（§3.5 の縮退）。
// 文言(percent/ratio_line)は keiba_build_analysis.py が確定済み。ここでは組み立てるだけ。
//
// 【2026-08-06・ユーザー決定】人気番号の帯（.bpMap）は**やめた**。理由は2つ。
//  1. 何を表しているか画面から読み取れなかった。§3.4 で凡例を出さない決まりにしていて、
//     「番号列そのものが説明を兼ねる」という前提だったが、それが成り立っていなかった
//  2. 薄い帯（人気4位〜min(14,頭数)位）は**ほぼ全レースで同じ形**で、頭数によって右端が
//     変わるだけ。レースごとの情報がほとんど無い。しかも密度は1.12＝全馬を無選別に囲った
//     場合(1.00)より1割濃いだけで、絞り込みとして弱い（§2.5 の★）
// band_lo / band_hi / field_size はデータ契約（§4.2）に残るが、ここでは描画しない。
// 3段の出し分け（132-spec・2026-08-27）。それまでは全レースに同じ大きさで出していた。
//
//   6%以上  → 激アツ（215レース中11レース＝20レースに1回）
//   4〜6%   → 1行だけ
//   4%未満  → 出さない（73%のレースでこの枠が消える）
//
// 段の切り方は keiba_sitestats.BIGPAY_TIER_CUT が正本。ここは引くだけで判定しない。
// 見出しの「100万超え」は母数が少なく（215レース中6件）率にできないので、
// 激アツの中では中央値と10万超えの割合という**測れている数字**を並べる。
function bigpayTier(pct) {
  if (!BANDS || typeof pct !== 'number') return null;
  const c = BANDS.bigpay.cuts || {};
  if (pct >= c.hot) return 'hot';
  if (pct >= c.quiet) return 'quiet';
  return 'off';
}

function renderBigPay(bigpay) {
  if (!bigpay || !bigpay.field_size) return '';
  const pct = parseFloat(bigpay.percent);
  const tier = bigpayTier(pct);
  // bands が読めないときは従来どおり1行で出す（黙って消さない）
  if (tier === 'off') return '';
  const quiet = `
    <div class="bpQ">
      <span class="lb">3連単100万超え</span>
      <span class="pv">${escapeHtml(bigpay.percent)}<small>%</small></span>
      <span class="rt">${escapeHtml(bigpay.ratio_line)}</span>
    </div>`;
  if (tier !== 'hot') return quiet;

  const t = (BANDS.bigpay.tiers || {}).hot;
  const yen = t && t.median ? t.median.toLocaleString('ja-JP') : null;
  const oku = t && t.over_yen ? Math.round(t.over_yen / 10000) : 10;
  const sub = (t && t.n && yen) ? `
      <div class="s">同じ水準の過去<b>${t.n}レース</b>は3連単の真ん中の額が<b>${yen}円</b>、`
        + `<b>${t.over_rate}%</b>が${oku}万を超えた</div>` : '';
  return `
    <div class="bpHot">
      <div class="t">🔥🔥 激アツ ／ 20レースに1回の水準</div>
      <div class="m">
        <span class="nm">3連単100万超え</span>
        <span class="pv">${escapeHtml(bigpay.percent)}<small>%</small></span>
      </div>
      ${sub}
    </div>
  `;
}

// 札の中で荒れ度の行をタップすると、その下の傾向表が差し替わる。
// 見立て(.hit)は動かさない（89-spec §3.1）。2026-08-27 に折りたたみから札へ移したので、
// 見出しの差し替え先が .up2fold .sname から .pcap になった。
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
    // 表の見出しも一緒に変える。色や枠だけでなく必ず文字でどの形か分かるように
    const cap = root.querySelector('#pop-upset .pcap-tend');
    if (cap) cap.textContent = `「${btn.querySelector('.nm').textContent}」で決まったレースでは`;
  });
}

function renderHeader20(site) {
  const r = site.race;
  const p = site.prediction;
  // 108-spec §2: 基本情報4項目（コース／馬場／頭数／クラス）を展開タブから見出しへ移した。
  // 格はバッジにしてレース名の左へ。重複していた細字1行（オープン・GIII・芝1800m）は削除。
  // 4項目は等幅の列にそろえるので折り返さない（＝高さが毎回同じでタブ位置がぶれない）。
  const baba = (p.baba_detail || {}).going_weather || r.going || '—';
  const surfCls = r.surface === '芝' ? 'turf' : 'dirt';
  const specs = [
    ['コース', `<span class="sf ${surfCls}">${escapeHtml(r.surface)}</span>`
      + `${r.distance}m<span class="w">・${escapeHtml(r.direction)}</span>`],
    ['馬場', escapeHtml(baba)],
    ['頭数', `${r.field_size}<span class="w">頭</span>`],
    ['クラス', escapeHtml(r.class)
      + (r.weight_rule ? `<span class="w">・${escapeHtml(r.weight_rule)}</span>` : '')],
  ];
  const cells = specs.map(([k, v]) =>
    `<div class="sp"><span class="k">${escapeHtml(k)}</span><span class="v">${v}</span></div>`).join('');
  const meta = `${r.date} ${r.track}${r.race_number}R`
    + (r.post_time ? `<span class="dot">・</span>発走 ${escapeHtml(r.post_time)}` : '');
  return `
    <div class="rhead h2">
      <div class="ttlrow">${r.grade ? `<span class="gb2">${escapeHtml(r.grade)}</span>` : ''}<span class="ttl">${escapeHtml(r.race_name)}</span></div>
      <div class="meta">${meta}</div>
      <div class="specrow">${cells}</div>
      <div class="pt">予想: ${fmtDateTimeShort(p.predicted_at)}（${escapeHtml(p.odds_basis)}基準）</div>
    </div>
  `;
}

// 見立て。荒れ度（110-spec）と3連単100万超え（103-spec）を出す。
// 3連単100万は荒れ度パネルの**中**（折りたたみの上）に入る（110-spec §2）ので、
// 先に組み立てて renderUpset20 に渡す。荒れ度が無いレースは 3連単100万だけを単独で出す。
//
// 【2026-08-19・118-spec】置き場所を「買い目」タブの先頭から**「出馬表」タブの先頭**へ移した。
// 荒れ度は買い方ではなくレース全体の傾向で、出馬表を見ている最中に必要な情報だったため。
// 買い目タブからは消してある（同じものを2か所に出さない）。関数の中身は1文字も変えていない。
// 出馬表タブの先頭に出すのは3連単100万超えだけになった（2026-08-27・案A）。
// 荒れ度とメンバーレベルは下の出馬表の帯（renderShutuba20）の中へ移してある。
// 100万超えを帯に入れなかったのは、4%未満の73%のレースでは何も出さない＝
// 出たり消えたりする物なので、常にある帯の形を変えてしまうため。
function renderMitate20(site) {
  return renderBigPay(site.prediction.bigpay);
}

// 今回のレースのメンバーレベル（handoff_2026-08-19_member-level.md 決定#3/#4・v2.1）。
// 出走各馬の直近3走のレースレベルを「その走のクラスの中での順位」に直して平均し、
// 同じクラス×年齢条件（2歳／3歳限定／古馬）の中で5等分した段。
// 生の値のまま平均した初版は、オープンで「S＝格下から上がってきた顔ぶれ」を指していたので
// 作り直した（2026-08-19 の関門）。2歳戦は歪みが残ったため publish 側で出していない。
// 過去5走の Lv 列（.lv・そのレースが終わってみて濃かったか）とは**別の物差し**なので、
// 「メンバー」とラベルを付け、色も別に用意する（.mlv）。
// 新馬・2歳戦・段の基準が無いレースは publish がキーごと出さないので、ここでは何も描かない。
// 2026-08-27: 荒れ度の下から**出馬表の帯（.secthead）の中**へ移した。
// レース全体の話ではなく「この18頭がどういう顔ぶれか」なので、馬が並ぶ表の見出しに置く。
// 帯の中は横1行しか使えないため、入れ替えたものが2つある。
//   ・帯の「馬番順」を落とした。出馬表は3つの見え方すべてが馬番で並んでいて
//     （race.js の 2321 / 2591 / 2599 行）、並べ替える操作も無い＝レースによって変わらない
//   ・「（同じクラス・年齢の中）」は title の吹き出しへ。中身は消していない
// 「全N頭」は残した（頭数はレースごとに変わる）。
function memberLevelBand(p) {
  if (!p || !p.member_grade) return '';
  const t = 'メンバーレベル ' + p.member_grade
    + '（出走' + (p.member_horses || 0) + '頭の直近3走を、その走のクラスの中での順位に'
    + '直して平均。同じクラス・同じ年齢条件の中での相対）';
  // 「走ってきたレースの濃さ」の1行は 2026-08-27 に外した。中身は title の吹き出しに残る
  return `<span class="mlv" title="${escapeHtml(t)}">
      <span class="lb">メンバー</span>
      <span class="gr g-${p.member_grade.toLowerCase()}">${escapeHtml(p.member_grade)}</span>
    </span>`;
}

// ===== 97-spec: 出馬表（馬柱）=====
// 印・全頭評価・勝率期待値・個別評価の4セクションを、馬番順の1表＋行タップのパネルに統合する。
// 過去5走／コース適性は publish が site JSON に載せる（keiba_shutuba_columns.py）。
// 無いレース（旧データ）でも壊れないよう、各ブロックは存在チェックしてから描く（97-spec §7）。

const LEG_ORDER = ['逃', '先', '差', '追'];
const CLASS_CSS = {
  '新馬': 'c-shin', '未勝利': 'c-mi', '1勝': 'c-w1', '2勝': 'c-w2', '3勝': 'c-w3',
  'OP': 'c-op', 'L': 'c-l', 'G3': 'c-g3', 'G2': 'c-g2', 'G1': 'c-g1',
  'Jpn1': 'c-jpn1', 'Jpn2': 'c-jpn2', 'Jpn3': 'c-jpn3', '重賞': 'c-jusho',
};

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

// 104-spec §5.1: 当日馬体重（発走の約50分前に発表）。null のときは<span>ごと出さない
// （'—'は出さない・空欄が並ぶと読みにくいため）。色は付けない（増減の大小はトッピングの仕事）。
function bwDisplay(h) {
  if (h.body_weight == null) return '';
  const diff = h.body_weight_diff;
  const txt = diff == null ? `${h.body_weight}` : `${h.body_weight}(${diff > 0 ? '+' : ''}${diff})`;
  return `<span class="pw">${escapeHtml(txt)}</span>`;
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
// ============================================================
// 126-spec §3: コース適性の「今回のコース」に横帯を付ける
//
// rows は7行あり、**2行目が「今回の場×面×距離」**。並びを決めているのは publish 側
// （keiba_shutuba_columns.py）で、ここは位置で決め打ちしている（126-spec §9-1 の未決）。
//   0 全場{面} / 1 {今回の場}{面} / 2 {今回の場}{面}{今回の距離}
//   3 全場{面}{距離-200} / 4 全場{面}{今回の距離} / 5 全場{面}{距離+200} / 6 重不{面}
//
// **これは当たりやすさの印ではない。**条件適性は予想の材料としては無効と実測済み
// （64-condition-dimension-findings.md・7,493レース102,404頭で20通り以上の作り直しが全滅）。
// 帯は「今日と同じ条件を走った実績がどこにあるか」を目で引くためのもので、
// 採点・印・買い目には一切干渉しない。
// ============================================================
const CR_TODAY_ROW = 2;

// 足切り（126-spec §3.2 条件A）: その行で「3着以内が1回以上」かつ「2走以上」。
// レース内の他の馬は見ない（順位ではないので、他が弱くても通らない）。
//
// **「2走以上」は母数1走の実績で帯が出るのを防ぐための代理指標。**守りたいのは
// 「1回走って1回来ただけの馬」と「何度も来ている馬」を同じ扱いにしないこと。
// 衝突したら（2走以上に絞ると帯がほとんど出ないと分かったら）2走以上のほうを捨てる。
// 実測（公開中215レース・2,979頭）: 該当11.8%・1レース平均1.63頭・帯が0本のレース38.6%。
// 落とした案は「出走1回以上」（1R平均5.22頭）と「3着内1回以上」（同2.84頭・最大11頭）で、
// どちらも付きすぎ（後者は1戦1勝の馬と5戦3勝の馬が同じ扱いになる）。
function aptPass(h) {
  const r = (((h || {}).course_record || {}).rows || [])[CR_TODAY_ROW];
  if (!r || !r.counts) return false;
  const c = r.counts;
  return (c[0] + c[1] + c[2]) >= 1 && (c[0] + c[1] + c[2] + c[3]) >= 2;
}

// bare=true のときは見出し（.crh）と注記（.crn）を出さず表だけ返す。
// 札と新聞の面では見出しを呼び出し側が出すため（126-spec §5）。
function courseRecordTable(h, bare) {
  const cr = h.course_record;
  if (!cr || !cr.rows || !cr.rows.length) return '';
  const band = aptPass(h);
  const rows = cr.rows.map((r, i) => {
    const cls = [];
    if (r.counts.reduce((a, b) => a + b, 0) === 0) cls.push('zero');
    if (band && i === CR_TODAY_ROW) cls.push('aptx');
    const tds = r.counts.map((v) => `<td class="${v === 0 ? 'c0' : ''}">${v}</td>`).join('');
    return `<tr${cls.length ? ` class="${cls.join(' ')}"` : ''}><td class="l">${escapeHtml(r.label)}</td>${tds}</tr>`;
  }).join('');
  let note = '';
  if (!cr.central_starts) {
    note = `<div class="crn">中央での出走なし（地方 ${cr.local_starts}走）</div>`;
  } else if (!cr.rows.some((r) => r.counts.reduce((a, b) => a + b, 0))) {
    note = `<div class="crn">この条件での出走なし（中央 ${cr.central_starts}走・地方 ${cr.local_starts}走）</div>`;
  }
  const table = `<table class="crt">
      <thead><tr><th class="l">条件</th><th>1着</th><th>2着</th><th>3着</th><th>着外</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  if (bare) return table;
  return `
    <div class="crh">コース適性（中央のみ・全走）</div>
    ${note}
    ${table}
  `;
}

// ============================================================
// レースレベル別の好走歴（handoff_2026-08-17_race-level.md の値を数え直したもの）
//
// 過去走の「クラス」列に出している Lv を、**全戦績ぶん段ごとに集計**する。
// コース適性が「今日と同じ条件をどれだけ走ったか」なのに対し、こちらは
// 「どれだけ中身の濃いレースで通用したか」。同じ3勝クラスでも、濃い回のほうで
// 3着に入った馬と、薄い回で勝った馬を見分けるための表。
//
// **当たりやすさの印ではない。**レベルは「そのレースの出走馬がその後180日で
// 3着以内に何回入ったか」＝レース後に確定する値で、モデル・印・買い目には
// 一切入っていない（入れた瞬間に未来の情報を使うことになるため）。
//
// レベルが付くのは中央の平地だけ。地方・海外・障害の走はここに出ないので、
// 表の合計は通算成績と一致しない。合わない走数は表の下に出す（黙って消さない）。
// ============================================================
const LEVEL_ORDER = ['S', 'A', 'B', 'C', 'D'];

function levelRecordTable(h) {
  const runs = (h.past_runs || []).concat(h.career_runs || []);
  if (!runs.length) return '';
  const cnt = {};
  LEVEL_ORDER.forEach((g) => { cnt[g] = [0, 0, 0, 0]; });
  let leveled = 0;
  runs.forEach((r) => {
    const c = cnt[r.level_grade];
    if (!c) return;
    const f = parseInt(r.finish, 10);
    c[(f >= 1 && f <= 3) ? f - 1 : 3] += 1;
    leveled += 1;
  });
  // ゼロの段も出す（コース適性と同じ。「その濃さのレースは走っていない」も情報のため）
  const rows = LEVEL_ORDER.map((g) => {
    const c = cnt[g];
    const zero = c.reduce((a, b) => a + b, 0) === 0;
    const tds = c.map((v) => `<td class="${v === 0 ? 'c0' : ''}">${v}</td>`).join('');
    return `<tr${zero ? ' class="zero"' : ''}><td class="l">`
      + `<span class="lv lv-${g.toLowerCase()}"><i>Lv</i>${g}</span></td>${tds}</tr>`;
  }).join('');
  const rest = runs.length - leveled;
  const note = leveled
    ? (rest ? `<div class="lvn">レベルが付かない ${rest}走（地方・海外・障害・レベルが取れなかった走）は入っていない</div>` : '')
    : `<div class="crn">レベルの付いた走なし（${rest}走すべてレベルが取れていない）</div>`;
  return `
    <div class="crh">レースレベル別の好走歴（中央の平地のみ・全走）</div>
    ${note}
    <table class="crt lvt">
      <thead><tr><th class="l">レベル</th><th>1着</th><th>2着</th><th>3着</th><th>着外</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ============================================================
// レースの型べつ成績（handoff_2026-08-31_race-type-per-horse.md）
//
// 93-spec の6マス（ペース S/M/H × 決着 前残り／差し・追込）に、その馬の過去走を
// 割り振ったもの。コース適性が「今日と同じ条件をどれだけ走ったか」なのに対し、
// こちらは「どういう流れのレースで走れているか」。
//
// **画面にペース記号（S/M/H）と「前残り／差し・追込」は出さない**（決定①）。
// 情景の言い切りだけを出す。並び順はデータ側で固定（消耗戦 → 一瞬勝負）。
// 走数0のマスも行を消さない（「そのレースは走っていない」も情報のため）。
//
// 濃淡はその馬の**平常**の3着内率との差。全馬平均ではない（決定④）。
// 平常が高い馬はどのマスも濃くなりようがないという穴は承知のうえで、
// 代わりにブロックの最後に「この馬の平常」を必ず出す（中央の出走110,652件のうち
// 平常8割以上は2,148件＝1.9%）。
// ============================================================
//
// 今日の予想がどのマスに当たるかは `prediction.scenario` の main/sub/other から引く
// （展開タブの renderScenarioGrid20 と同じ出どころ・同じ本命/対抗/3番手）。
// **確率は目安で「この展開になります」の断定ではない**（展開タブの注記と同じ扱い）。
// scenario_grid ではなく scenario を見るのは、6マス表示より前に公開したページにも
// main/sub/other は入っているため（公開済み285レースを見て grid が無いのは1レース）。
const RT_CUE_LABEL = { main: '本命', sub: '対抗', other: '3番手' };

function raceTypeCues(pred) {
  const sc = (pred || {}).scenario;
  if (!sc) return {};
  const out = {};
  for (const key of ['main', 'sub', 'other']) {
    const c = sc[key];
    if (!c || !c.code || !c.side) continue;
    const code = `${c.code}_${c.side === '前' ? '前残り' : '差し・追込'}`;
    if (out[code]) continue;   // 同じマスに2つ付かない（先に見た本命側を残す）
    out[code] = { key, label: RT_CUE_LABEL[key], pct: Math.round((c.prob || 0) * 100) };
  }
  return out;
}

function raceTypeTable(h, pred) {
  const rt = h.race_type_record;
  if (!rt || !rt.rows || !rt.rows.length) return '';
  const ov = rt.overall || {};
  const cues = raceTypeCues(pred);
  // 2026-09-01（mockup-163 案D-1・ユーザー決定）: すぐ上のコース適性と同じ表にする。
  // 列も並びも同じ 1着 / 2着 / 3着 / 着外 で、`table.crt` のCSSをそのまま使う。
  // 前の形（`4走 ／2勝 2着内`）は「着内」が略語で、勝ちが3着以内に含まれる入れ子なのも
  // 伝わらなかった。表にすると読み方を覚え直さなくて済み、2着と3着も分かれる。
  // 濃さ（その馬の平常との差）は**型の名前のセルだけ**に付ける。数字のセルは白のまま。
  const rows = rt.rows.map((r) => {
    const c = cues[r.code];
    const cls = [];
    if (!r.n) cls.push('zero');
    if (c) cls.push('aptx');   // 今日の3マス。コース適性の「今日の条件」と同じ帯
    const cue = c ? `<span class="tcue ${c.key}">${c.label}<b>${c.pct}%</b></span>` : '';
    const tds = (r.counts || [0, 0, 0, 0])
      .map((v) => `<td class="${v === 0 ? 'c0' : ''}">${v}</td>`).join('');
    return `<tr${cls.length ? ` class="${cls.join(' ')}"` : ''}>`
      + `<td class="l ${r.shade}">${escapeHtml(r.label)}${cue}</td>${tds}</tr>`;
  }).join('');
  // 見出しの下に1行。今日どの型を見ているかを言葉で出す（3番手は出さない。
  // 本命と対抗で7割前後を占め、3つ目まで並べると行が長くなるため）
  const byKey = {};
  rt.rows.forEach((r) => { if (cues[r.code]) byKey[cues[r.code].key] = { r, c: cues[r.code] }; });
  const todayLine = byKey.main
    ? `<div class="rtnow">今日の見立ては <b>${escapeHtml(byKey.main.r.label)}</b> ${byKey.main.c.pct}%`
      + (byKey.sub ? `／次点は ${escapeHtml(byKey.sub.r.label)} ${byKey.sub.c.pct}%` : '')
      + '<span class="rtnowc">確率は目安</span></div>'
    : '';
  // 型が付かない走は黙って消さない（2021年より前の走にはペースが入っていない）
  const rest = rt.unlabeled
    ? `<div class="lvn">型が付かない ${rt.unlabeled}走（ペースが取れていない走。2021年より前はほぼ全部）は入っていない</div>`
    : '';
  const base = ov.n
    ? `<div class="rtbase">この馬の平常 3着内 ${Math.round(ov.top3_pct)}%（${ov.n}走）</div>`
    : `<div class="crn">型の付いた走なし（中央 ${rt.central_starts}走）</div>`;
  return `
    <div class="crh">レースの型べつ成績（中央のみ・全走）</div>
    ${todayLine}
    ${rest}
    <table class="crt rtt">
      <thead><tr><th class="l">レースの型</th><th>1着</th><th>2着</th><th>3着</th><th>着外</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${base}
  `;
}

// 126-spec §5: 札と新聞の面に出すコース適性。見出しは自分で出す（表は bare で取る）
function courseBlock(h) {
  const t = courseRecordTable(h, true);
  if (!t) return '';
  return `<div class="acrow"><div class="lb">コース適性（中央のみ・全走）</div>${t}</div>`;
}

// 過去5走は表で出す（2026-07-28 ユーザー確認）。列は
// 日付／場・条件／レース／クラス／着／タイム／上り／頭数・人気／差／通過／騎手・斤量。
// 幅の狭い画面では横スクロールになるので、その旨を下に出す。
// 2026-08-23：過去走のAI評価は画面から全部消した（ユーザー指示）。
// 戦績5走の札に続いて、馬名ポップアップの全戦績の表からもAI列を外し、
// 描画していた aiGradeCell も消した（呼び出し元が無くなったため）。
// 経緯と元の仕様は handoff_2026-08-17_prev-grade.md にある。
// データ側の ai_grade / ai_miss / ai_rank は生成も配信も続いており、消したのは表示だけ。
// なお出馬表の「今回のレースのAI評価」（race.js の dispGrade）は別物で、残っている。

// 過去走のレースレベル（handoff_2026-08-17_race-level.md 決定#2/#3）。
// そのレースの出走馬が「その後180日で3着以内に何回入ったか」を、同じクラスの中で
// 相対にして5段（S/A/B/C/D）にしたもの。AI評価（隣の列）が「予想の時点でどう見えたか」
// なのに対し、こちらは「終わってみて中身が濃かったか」。プラス付きの段は作らない
// （AI列が A+/B+/C+ を持つので、プラスの有無で見分ける）。
// レベルが出ない走はここでは何も出さない（2026-08-23にAI列を消したので、
// 理由を出していた隣の列も無くなった。理由は表には出ない）。
function levelBadge(p) {
  if (!p.level_grade) return '';
  const t = 'レースレベル ' + p.level_grade + '（出走馬のその後180日・同じクラスの中での相対）';
  // 見出しの「Lv」を中に入れる（2026-08-18 ユーザー決定）。AI評価と同じ大きさの1文字が
  // 2つ並ぶと、どちらが何か画面から分からなかったため。
  return `<span class="lv lv-${p.level_grade.toLowerCase()}" title="${escapeHtml(t)}"><i>Lv</i>${escapeHtml(p.level_grade)}</span>`;
}

// 2026-08-23：枠・馬番の列を「頭数・人気」の左に足した（ユーザー指示）。
// 並びは札の3行目（.nmg）と同じ順にした。115-spec が「頭数の隣に置くと
// 『16頭 7枠13番』と続けて読めて、大外だったのかが分かる」と決めた順に合わせている。
// 表示は札と同じ runWakuText を使い回す（枠が取れない走は「13番」だけ出る）。
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
    <td class="l">${escapeHtml(p.track ?? '')} <span class="cd ${String(p.surface || '').startsWith('ダ') ? 'dt' : 'tf'}">${escapeHtml(p.surface ?? '')}${escapeHtml(p.distance ?? '')}${escapeHtml(p.condition ?? '')}</span></td>
    <td class="l pname">${escapeHtml(stripClassSuffix(p.race_name))}</td>
    <td>${classBadge(p.grade, p.race_name)}${levelBadge(p)}</td>
    <td>${shutubaFinBox(p.finish)}</td>
    <td>${timeCell}</td>
    <td>${medalSpan(p.last_3f ?? '—', p.last_3f ? rankCls : '', agTitle)}</td>
    <td class="wkcol">${runWakuText(p)}</td>
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
          <th>クラス</th><th>着</th><th>タイム</th><th>上り</th><th>枠・馬番</th><th>頭数・人気</th><th>差</th>
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
          <th>クラス</th><th>着</th><th>タイム</th><th>上り</th><th>枠・馬番</th><th>頭数・人気</th><th>差</th>
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

// 2026-08-12: ①〜⑧の点数を縦に並べ最後に総合点を出す `factorsTable(h)` を削除した。
// 出馬表の点数を win-1 の換算点（win_score）に替えたため、8観点の点数を足しても
// 画面の総合点にならず、残しておくと食い違いの元になる（ユーザー判断）。
// なお削除時点でこの関数はどこからも呼ばれておらず、画面には出ていなかった。
// 各項目の○×（item_marks / itemDots）は点数ではなく実データの理由文なので残す。

// 97-spec §9（案A-1）: 診断欄。買える理由／消せる理由を2列に分け、見出しを塗る。
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
  if (!d) return '';   // 旧データ（diagnosis なし）は何も出さない
  return `<div class="dcols">
    ${diagCol(d.plus, 'p', '買える理由', '＋')}
    ${diagCol(d.minus, 'm', '消せる理由', '−')}
  </div>`;
}

// 回顧メモ。タグの回数（クセ）を先に、次に直近の本文。点数には入っていない。
// 色は「この馬にとってプラスかマイナスか」で分ける（2026-07-31）。
//   赤 … その馬自身の失点。出遅れは癖として繰り返す
//   緑 … 着順に出ていない中身の良さ
//   灰 … レースの流れ・不利。着順の言い訳にはなるが、馬の評価を上げも下げもしない
const NOTE_TAG_BAD = /^(出遅れ)/;
const NOTE_TAG_GOOD = /^(上がり最速|着順以上|負けたが時計は速い)/;

function noteTag(label, count) {
  const bad = NOTE_TAG_BAD.test(label);
  const good = NOTE_TAG_GOOD.test(label);
  const cls = bad ? 'nt-bad' : good ? 'nt-good' : 'nt-mid';
  const c = count ? `<b>${count}</b>` : '';
  return `<span class="nt ${cls}">${escapeHtml(label)}${c}</span>`;
}

// 過去走のマスに出すメモ（2026-08-05）。ここだけ色を1つに揃える。
// マスには着順の金銀銅・クラスバッジ・見出しの帯が既にあり、赤緑を足すと色が多すぎるため。
// 馬名ポップアップの回顧メモ（noteTag）は3色のまま＝あちらは色が唯一の手掛かりなので残す。
//
// 「上がり最速」は上がり3Fの金（last3f_rank=1）を見れば分かるので、マスには出さない。
const RUN_NOTE_HIDE = new Set(['上がり最速']);

function runNoteTags(labels) {
  return (labels || [])
    .filter((l) => !RUN_NOTE_HIDE.has(l))
    .map((l) => `<span class="nt nt-one">${escapeHtml(l)}</span>`)
    .join('');
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

// 地雷・穴の理由文。どちらも「{odds}倍({pop}番人気)だが3着内を{外す/入る}確率は{p}%
// （オッズ相応なら{p_market}%）」の形で、オッズとのズレを言い切る（87-spec §3.2 / 94-spec §3.3）。
// 印列のバッジは記号だけなので、根拠の数字はここでしか読めない。
// 穴は能力印と同居しうるため、バッジが能力印に取られていてもこのブロックは必ず出す。
function markWhyBlock(h) {
  const rows = [];
  if (h.bet_mark === '地雷' && h.landmine_reason) {
    rows.push(`<div class="mkw jir"><span class="mkb m-jir">地雷</span>${escapeHtml(h.landmine_reason)}</div>`);
  }
  if (isAna(h) && h.ana_reason) {
    rows.push(`<div class="mkw ana"><span class="mkb m-ana">穴</span>${escapeHtml(h.ana_reason)}</div>`);
  }
  return rows.join('');
}

// mark-2.3（2026-07-28）で穴は role から bet_mark へ移った（94-ana-redesign-spec §3.2）。
// 移行前に公開したレースは role='穴' のまま残すので、両方を見る。
function isAna(h) {
  return h.bet_mark === '穴' || h.role === '穴';
}

// 能力印があれば必ず上段に出す。下段には地雷か穴を小さく積む（mockup-38 案B）。
// 2026-08-19（mark-2.5）で「地雷の馬には能力印を付けない」規則を廃止したので、地雷も
// 穴と同じ扱いにする。地雷は人気6位以内・穴は7位以下で重ならないため、下段は必ず一方だけ。
// 能力印が無いときだけ従来どおり 地雷 → 消 → 穴 の順で単独表示する。
// 横並びや列の拡幅は馬名列を削ることになるので採らない。積んでも行の高さは変わらない
// （実測48pxで同じ）。
function markBadge20(h) {
  const sub = h.bet_mark === '地雷'
    ? '<span class="mkb m-jir sub">地雷</span>'
    : (isAna(h) ? '<span class="mkb m-ana sub">穴</span>' : '');
  if (h.ability_mark) {
    const badge = `<span class="mkb ${ABILITY_CLS[h.ability_mark]}">${h.ability_mark}</span>`;
    return sub ? `<span class="mkstack">${badge}${sub}</span>` : badge;
  }
  if (h.bet_mark === '地雷') return '<span class="mkb m-jir">地雷</span>';
  // 消し（mark-2.7）: 3着以内の見込みが3%未満。◎○▲△と同じ場所・同じ大きさで色だけ灰。
  // 実データ166レースでは消しと地雷・穴・能力印が同時に立った例は1頭も無い。
  if (h.keshi) return '<span class="mkb m-kes">消</span>';
  if (isAna(h)) return '<span class="mkb m-ana">穴</span>';
  return '';
}

// ============================================================
// 105-spec: 出馬表ワンシート化＋買える／消せるの10項目
// ============================================================

// 106-spec §5.2: item_marks（10項目・順序固定・並べ替えない）を、札には
// 「項目名＋○×」の点だけ出す。理由文は札には入らないので馬名ポップアップへ（§5.4）。
// 2026-09-03 ユーザー指示で戦績の札からは外した（関数は残す）。
// ポップアップ側の itemWhyBlock も同日に外してあるので、**いまはどこにも出ていない**。
function itemDots(h) {
  const marks = h.item_marks;
  if (!marks) return '';                     // item_marks なし（取消・旧レース）→ 何も出さない
  const on = marks.filter((m) => m.mark === '○' || m.mark === '×');
  if (!on.length) return '<span class="idot">目立つ長所も短所もなし</span>';
  return on.map((m) => {
    const cls = m.mark === '○' ? 'd-o' : 'd-x';
    return `<span class="idot ${cls}">${escapeHtml(m.label)}<i>${m.mark}</i></span>`;
  }).join('');
}

// 6マス適性（handoff_2026-08-17_pace-fit.md）。**出すのは「向かない」側だけ。**
// 上位側は実測で中位より複勝率が低く（7番人気以下で −1.3pt・−3.8σ）、絞り込みを
// 18通り試しても人気3帯すべてでプラスになる条件が無かったため、良い側の印は作らない。
// 見た目は「消せる理由」チップ（.idot.d-x）と同じにする＝専用のCSSを足さない。
// 2026-09-03 ユーザー指示で戦績の札から外した（関数は残す）。**いまはどこにも出ていない。**
// itemDots（近走×／血統×／斤量○）と itemWhyBlock も同日に外してある。
function paceFitChip(h) {
  const pf = h.pace_fit;
  if (!pf || pf.flag !== 'poor') return '';
  const sec = Math.abs(pf.value).toFixed(2);
  return `<span class="idot d-x" title="今日の想定ペースで走ったときの平均着差が、`
    + `この馬の通算平均より${sec}秒悪い（ペースの分かる過去${pf.runs}走から）。`
    + `予測が当たるかは未検証です">展開が向かない<i>×</i></span>`;
}

// 106-spec §5.4: 札から追い出した理由文。ポップアップの中で全文を読ませる。
// 文言は 105-spec §5.3 のチップと同じ（1文字も減らさない）。
// 2026-09-03 ユーザー指示で、馬名ポップアップからは外した（関数は残す）。
// 「買える／消せる」の札は出馬表の札（.asub の itemDots）に出ているので、
// ポップアップで同じ話をもう一度出さない。
function itemWhyBlock(h) {
  const marks = h.item_marks;
  if (!marks) return '';
  const on = marks.filter((m) => m.mark === '○' || m.mark === '×');
  if (!on.length) return '';
  const rows = on.map((m) => {
    const cls = m.mark === '○' ? 'v-o' : 'v-x';
    return `<span class="chip2 ${cls}"><span class="c2h"><b>${escapeHtml(m.label)}</b><em>${m.mark}</em></span>` +
      `<span class="c2b">${escapeHtml(m.why || '')}</span></span>`;
  }).join('');
  return `<div class="ph">買える／消せる</div><div class="chips">${rows}</div>`;
}

// §5.2.5: 通過順の4マス。前・中・後の3段階の塗り分けは 2026-08-05 に廃止した
// （色が多すぎて読みにくいという指摘。位置は数字そのもので読む）。

// 106-spec: マスは走によらず必ず4つ出す。コーナーが2つしか無いレース（東京芝1600など）
// は手前の2マスを「-」の空マスにする。こうすると最後のコーナー（4角）が縦に揃い、
// 右隣の上がり3F・騎手・斤量・馬体重もずれない。数が足りない側は必ず手前（＝走り出し）で、
// 報告される通過順は常に4角で終わるため。5つ以上来た場合はゴールに近い4つを採る。
const CORNER_CELLS = 4;

function cornersHtml(corners) {
  const all = String(corners || '').split('-').filter(Boolean);
  const parts = all.slice(-CORNER_CELLS);
  const blanks = '<i class="none">-</i>'.repeat(Math.max(0, CORNER_CELLS - parts.length));
  const cells = blanks + parts.map((x) => `<i>${escapeHtml(x)}</i>`).join('');
  return `<span class="cor">${cells}</span>`;
}

// §5.2.3: 展開（6通りの文字。引けない走は「展開なし」・推測しない）
function scenarioHtml(scenario) {
  if (!scenario) {
    return '<span class="sc none" title="この走はレース結果をDBに取っていないため展開が出せない">展開なし</span>';
  }
  return `<span class="sc">${escapeHtml(scenario)}</span>`;
}

// §5.2.1: 休養の見出し
function restLabel(days) {
  const months = days / 30.4;
  const n = Math.trunc(months);
  const half = (months - n) >= 0.5 ? '半' : '';
  if (n >= 12) return `${Math.floor(n / 12)}年${(n % 12) >= 6 ? '半' : ''}休養`;
  return `${Math.max(n, 1)}ヵ月${half}休養`;
}

// 数値の末尾セル（走破タイム・上がり3F）。金銀銅が付く場合だけ .ag を足す。
// medalSpan と違い、色が無くても右寄せレイアウト用の <span class="val"> は必ず出す。
// extra は追加クラス（タイムだけ太字にするための .tm など）。金銀銅の .ag は cls 側。
function rankSpan(text, cls, title, extra) {
  const c = cls ? ` ag ${cls}` : '';
  const x = extra ? ` ${extra}` : '';
  const t = title ? ` title="${escapeHtml(title)}"` : '';
  return `<span class="val${x}${c}"${t}>${escapeHtml(text)}</span>`;
}

function marginText(p) {
  return (p.margin === null || p.margin === undefined || p.margin === '') ? '—' : escapeHtml(p.margin);
}

// §5.2.2: 僅差・勝ちの塗り。勝ち＝金（着差は問わない）／僅差で負け＝青。
// 本番の margin_band（1着が'win'に振られ僅差勝ちを拾えない）は使わず、着差の絶対値だけで判定する。
const CLOSE_MARGIN = { '芝': 0.4, 'ダート': 0.6 };
const CLOSE_MARGIN_DEFAULT = 0.5;

function runBandClass(p) {
  if (parseInt(p.finish, 10) === 1) return ' pb-win';
  const m = parseFloat(p.margin);
  if (Number.isNaN(m)) return '';
  const th = CLOSE_MARGIN[p.surface] ?? CLOSE_MARGIN_DEFAULT;
  return Math.abs(m) <= th ? ' pb-close' : '';
}

// 戦績欄の条件（芝2000重 など）を、芝とダートで色分けする（2026-08-27）。
// 白地での読みやすさ（4.5以上が要る）を測って色を決めた。
//   芝   #1F6B3A … 6.52（色の変数 --turf #2f8f4e は4.07で足りない）
//   ダート #A05A12 … 5.30（--dirt #D97A00 は3.12で足りない）
// 行の地の色が変わる場合（勝った走・僅差・休養）でも 4.69 以上を保つ。
function condHtml(p) {
  const cls = String(p.surface || '').startsWith('ダ') ? 'dt' : 'tf';
  return `<span class="cd ${cls}">${escapeHtml(surfShort(p.surface))}`
    + `${escapeHtml(p.distance || '')}${escapeHtml(goingShort(p.condition))}</span>`;
}

function surfShort(s) {
  return String(s || '').startsWith('ダ') ? 'ダ' : (s || '');
}
function goingShort(g) {
  return { '稍重': '稍', '不良': '不' }[g] || (g || '');
}

// レース名（mockup-52 案B）。1行目の余った幅に置き、入らない分は「…」で切る。
// クラス名は .rnm。.rn は一覧ページのレース番号チップ（幅44px固定）で使用済みのため使えない。
// 切れた名前は馬名ポップアップの「過去5走」表に全文が出る。
function runNameSpan(raceName) {
  const n = stripClassSuffix(raceName);
  if (!n) return '';
  return `<span class="rnm" title="${escapeHtml(n)}">${escapeHtml(n)}</span>`;
}

// 106-spec §5.3: 過去走1走。105-spec の6行マス（幅168px固定）を、画面幅を使い切る形に
// 組み替えたもの。**項目は12のままで1つも減らしていない**。
//   .vtab  走の見出し（前走・2走前…）。縦書き。横書きだと「3走前」で28px要るところが13pxで済む
//
// 2026-09-02: デザイン部の正本（見本H＋区切りB）どおりに、1走を上下2段へ作り直した。
//   .vr1（上段）  着順17px・「着」・着差・勝ち馬・相手の最高成績・レースレベル。地色を敷いて線で下と切る
//   .vr2（下段）  4行。.l1 いつ・どこ ／ .l2 走りの数字 ／ .l2 人と体 ／ .l3 回顧メモのタグ
// 直した3つ（デザイン部 decision.md §5）:
//   1. 走の高さの跳ね（60〜87px）が、3行目の折り返しから来ていた → タグを独立した行にした
//   2. 2行目が幅286pxを53走すべてで使い切っていた → 人と体を別の行へ移した
//   3. 2行目の7項目が全部10pxで見分けが付かない → 各行の右に102pxの欄を作り、線を1本引いた
// **幅は広げていない**（106-spec §2.1・横スクロールを0に保つ）。伸びるのは高さだけ。
//
// 着順は 2026-08-05 に行の先頭へ移し、箱を 19×16px→26×21px（文字10.5→14px）に拡げた。
// 左端で全走そろうので、5走ぶんの着順が縦一列に読める（新聞の着順柱と同じ読み方）。
//
// 115-spec: その走を何枠何番から走ったかを1行目（頭数の左）に出す。頭数の隣に置くと
// 「15頭 7枠15番」と続けて読めて、大外だったのかが1行で分かる（mockup-115 案B）。
// 枠色のボックスにせず文字で書くのは、色だけでは何枠か言えないため。
// 代償は1行目のレース名で、375px幅・18頭の実測で81走中39走が「…」になる。
// 切れた名前は馬名ポップアップの全戦績の表に全文が出る（mockup-52 案Bで決めた通り）。
// 着順を争った相手（勝ち馬。自分が勝った回は2着馬）の、**今の時点での**最高成績。
// 「出走した中でいちばん格の高いクラス × そのクラスでの最高着順」で、
// 例＝1勝クラスを勝って2勝クラスで7着なら「2勝クラス7着」（2026-09-02 決定）。
// 中央の平地だけを数える（地方・障害は入らない）。データは keiba_shutuba_columns.py が作る。
// 表示だけで、点数にも印にも買い目にも入っていない。
// compact=true（新聞の柱）はクラスの語を落として「3勝3着」にする。このページは
// クラスのバッジ自体が「3勝」「OP」「G3」表記（shutubaRaceClass）なので、語を落としても
// 同じ言葉のままになる。落とす理由は幅で、落とさないと柱214pxでは勝ち馬の名前が
// 58走中38走で「…」に縮む（2026-09-02 実測。落とせば5走）。札の側は幅に余裕があるので
// 「3勝クラス3着」と書ききる（同レースの札60走で名前が縮んだのは0走）。
function winnerBestSpan(p, compact) {
  if (!p.winner_best) return '';
  const t = `${p.winner || 'この相手'}の現時点の最高成績 ${p.winner_best}`
    + '（中央の平地・出走した中でいちばん上のクラスでの最高着順）';
  const txt = compact ? p.winner_best.replace('クラス', '') : p.winner_best;
  return `<span class="wb" title="${escapeHtml(t)}">${escapeHtml(txt)}</span>`;
}

function runWakuText(p) {
  // 旧い publish 済みページは馬番が `gate` という名前で入っている（中身は同じ）
  const uma = p.umaban ?? p.gate;
  if (uma == null) return '<span class="wkn">—</span>';
  const n = escapeHtml(String(uma));
  if (!p.waku) return `<span class="wkn" title="${n}番（枠番は出せない走）"><b>${n}</b>番</span>`;
  const w = escapeHtml(String(p.waku));
  return `<span class="wkn" title="${w}枠${n}番">${w}枠<b>${n}</b>番</span>`;
}

// 2026-08-23：1行目から過去走のAI評価（`<span class="aicol">`）を外した（ユーザー指示）。
// 評価そのものは馬名ポップアップの全戦績の表（popupRunsTable）に残っている。
// データ側の ai_grade / ai_miss は生成も配信も続けており、消したのは戦績欄の表示だけ。
function runLine3(p, label) {
  const cond = condHtml(p);
  // 単位を書く（58 → 58kg）。単位が無いと斤量58と馬体重492が同じ「ただの数字」に見える。
  // 値が無い走は「—」だけを出す（「—kg」にしない）
  const bw = p.body_weight != null ? `${escapeHtml(String(p.body_weight))}<i class="uu">kg</i>` : '—';
  const kg = p.weight != null ? `${escapeHtml(String(p.weight))}<i class="uu">kg</i>` : '—';
  const rankCls = { 1: 'f1', 2: 'f2', 3: 'f3' }[p.last3f_rank] || '';
  const agTitle = p.last3f_rank ? `このレースの上がり${p.last3f_rank}位` : '上がり3F';
  const timeTitle = p.time_grade
    ? `基準比 ${p.time_resid > 0 ? '+' : ''}${p.time_resid}秒（当日の馬場差を補正後）・着差${marginText(p)}秒`
    : (p.time_note || '');
  const notes = runNoteTags(p.note_labels);
  const noteTitle = notes && p.note_text ? ` title="${escapeHtml(p.note_text)}"` : '';
  return `<div class="vrun${runBandClass(p)}"><span class="vtab">${escapeHtml(label)}</span><div class="vrb vsplit">
    <div class="vr1">${shutubaFinBox(p.finish)}<span class="fu">着</span><span class="mg">(${marginText(p)})</span><span class="wn">${escapeHtml(p.winner || '')}</span>${winnerBestSpan(p)}${levelBadge(p)}</div>
    <div class="vr2">
      <div class="l1"><span class="dt">${shutubaMd(p.date)}</span><span class="tk">${escapeHtml(p.track || '')}</span>${classBadge(p.grade, p.race_name)}${runNameSpan(p.race_name)}</div>
      <div class="l2">${cond}${rankSpan(p.time ?? '—', p.time_grade || '', timeTitle, 'tm')}${cornersHtml(p.corners)}${rankSpan(p.last_3f ?? '—', rankCls, agTitle)}<span class="rgt">${scenarioHtml(p.scenario)}</span></div>
      <div class="l2"><span class="jk">${escapeHtml(p.jockey ?? '—')}</span><span class="kg">${kg}</span><span class="bw">${bw}</span><span class="rgt nmg">${runWakuText(p)}<span class="nm hd">${escapeHtml(p.runners ?? '—')}頭</span><span class="nm pp">${escapeHtml(p.popularity ?? '—')}人</span></span></div>
      <div class="l3"${noteTitle}>${notes}</div>
    </div>
  </div></div>`;
}

// §5.2.1: 90日以上の間隔（rest_days）を休養セルとして差し込み、常に5枚にする。
// rest_days は90日未満なら null（keiba_shutuba_columns.py 側で判定済み・FEでは暗算しない）。
function buildRunCells(runs) {
  const cells = [];
  for (const r of (runs || [])) {
    if (r.rest_days != null) cells.push({ kind: 'rest', days: r.rest_days });
    cells.push({ kind: 'run', run: r });
    if (cells.length >= 5) break;
  }
  while (cells.length < 5) cells.push({ kind: 'empty' });
  return cells.slice(0, 5);
}

// 走の見出しは「実際の走だけ」で数える。休養マスは枠を1つ使うが走ではないので、
// 休養を挟んでも次の走は 2走前 のまま（マスの位置で数えると1つずれる）。
function runsBlock(h) {
  let runIdx = 0;
  const html = buildRunCells(h.past_runs).map((c) => {
    if (c.kind === 'run') {
      const label = runIdx === 0 ? '前走' : `${runIdx + 1}走前`;
      runIdx += 1;
      return runLine3(c.run, label);
    }
    if (c.kind === 'rest') {
      return `<div class="vrun rest"><span class="vtab">休養</span><div class="vrb"><div class="l1">${escapeHtml(restLabel(c.days))}（${c.days}日）</div></div></div>`;
    }
    return '<div class="vrun empty"><span class="vtab"></span><div class="vrb"><div class="l1">—</div></div></div>';
  }).join('');
  return `<div class="aruns">${html}</div>`;
}

// 111-spec §3.8: 覆いが出ている間、後ろのページを動かさない。
//
// `overflow:hidden` だけでは iOS Safari で背後が指で動く（動かないのはPCのマウスだけ）。
// body を position:fixed にして、いま見ていた縦位置を top のマイナス値で保つ。
// 閉じたら外して同じ位置へ戻す＝閉じた瞬間にページが先頭へ飛ばない。
// 数を数えるのは、覆いが2つ重なった時に片方を閉じただけで解けないようにするため。
const PGLOCK = { n: 0, y: 0 };
function lockPageScroll() {
  if (PGLOCK.n === 0) {
    PGLOCK.y = window.scrollY || window.pageYOffset || 0;
    document.body.classList.add('noscroll');
    document.body.style.top = `-${PGLOCK.y}px`;
  }
  PGLOCK.n += 1;
}
function unlockPageScroll() {
  if (PGLOCK.n === 0) return;
  PGLOCK.n -= 1;
  if (PGLOCK.n > 0) return;
  document.body.classList.remove('noscroll');
  document.body.style.top = '';
  window.scrollTo(0, PGLOCK.y);
}

// §5.5: 馬名ポップアップ ― 通算成績・コース適性・レース戦績（全部）
function careerLine(h) {
  const runs = (h.past_runs || []).concat(h.career_runs || []);
  const cr = h.course_record || {};
  const loc = cr.local_starts ? `<span class="cl-loc">地方${cr.local_starts}走</span>` : '';
  if (!runs.length) return `<span class="cl">通算 —</span>${loc}`;
  const c = [0, 0, 0, 0];
  runs.forEach((r) => {
    const f = parseInt(r.finish, 10);
    c[(f >= 1 && f <= 3) ? f - 1 : 3] += 1;
  });
  return `<span class="cl">通算 ${runs.length}戦 <b>${c[0]}</b>-${c[1]}-${c[2]}-${c[3]}</span>${loc}`;
}

function popupRunsTable(h) {
  const runs = (h.past_runs || []).concat(h.career_runs || []);
  if (!runs.length) return '';
  return `<div class="ph">レース戦績（全${runs.length}走・新しい順）</div>
    <div class="ptwrap">
      <table class="pastt">
        <thead><tr><th class="l">日付</th><th class="l">場・条件</th><th class="l">レース</th>
          <th>クラス</th><th>着</th><th>タイム</th><th>上り</th><th>枠・馬番</th><th>頭数・人気</th><th>差</th>
          <th class="l">通過</th><th class="l">騎手・斤量</th></tr></thead>
        <tbody>${runs.map(pastRunRow).join('')}</tbody>
      </table>
    </div>
    <div class="pthint">← 横にスクロールできます</div>`;
}

// ── 条件べつの見立て（34枠） ─────────────────────────────────
// 正本: businesses/design/dept/finish/data/2026-09-02_horse-aptitude-visual/adopted.html
//       （Kelpie.Inc デザイン部 2026-09-02 段8完了・確定）
// データ: shared/scripts/keiba_shutuba_columns.py の build_aptitude_grid() / aptitude_meta()
//        （実装記録は shared/keiba/handoff_2026-09-03_sire-aptitude.md）
//
// 棒＝100回走って何回3着以内か。右端が100%で**どの馬も同じ物差し**。
// 走数が足りない枠は血統（父75%＋母父25%）で補ってあり、8走で実績と血統が半々になる。
// 右のマスはその馬の実際の着順。**古い順**で、7つ目から「+N」に畳む。
//
// 着順のマスの4段。1着 / 2〜3着 / 4〜5着 / 6着以下。中止・除外は「−」（着外あつかい）。
//
// 凡例の5つは .akw で1つずつ包む。正本の段8で「『未走』と『＝走っていない』が
// 行をまたいで割れる」が見つかり、実装側で詰める余地として残されていた（正本 §7-7）。
// 包まないと 375px 幅で実際に割れることを 2026-09-03 に実測して確認した。
function aptFinClass(f) {
  if (f == null) return 'g4';
  if (f === 1) return 'g1';
  if (f <= 3) return 'g2';
  if (f <= 5) return 'g3';
  return 'g4';
}

function aptitudeGrid(h, site) {
  const g = h.aptitude_grid;
  const m = (site || {}).aptitude_meta;
  if (!g || !m || !g.rows || !g.rows.length) return '';
  const label = {};
  const axis = {};
  m.buckets.forEach((b) => { label[b.key] = b.label; axis[b.key] = b.axis; });
  const tick = m.baseline_pct;
  // **今日のレースが当たる枠に帯を付ける。**色はコース適性の帯と同じ紺と淡い青
  // （--aptc / --aptbg）。緑は的中とプラス回収、赤は不的中と地雷で使用中なので使わない。
  // 流れだけは予想なので、軸の見出しを「流れ（予想）」にして区別する。
  // 濃さはレース前には出ないので、帯が1つも付かない。
  const today = new Set(m.today || []);
  const guess = new Set((m.today || []).filter((k) => k.startsWith('flow:')));
  let prev = null;
  const rows = g.rows.map((r) => {
    const ax = axis[r.key];
    const head = ax !== prev
      ? `<div class="axh">${escapeHtml(m.axis_labels[ax] || ax)}`
        + `${ax === 'flow' && guess.size ? '（予想）' : ''}</div>` : '';
    prev = ax;
    // 走っていない枠も行を消さない（棒は血統だけで立つ）。空白は「無い」と読まれるため
    const rec = r.n
      ? (r.finishes || []).map((f) =>
          `<span class="sq ${aptFinClass(f)}">${f == null ? '−' : f}</span>`).join('')
        + (r.more ? `<span class="more">+${r.more}</span>` : '')
      : '<span class="nr">未走</span>';
    const pct = r.pct == null ? 0 : r.pct;
    return `${head}<div class="ar${today.has(r.key) ? ' aptx' : ''}">
      <span class="nm">${escapeHtml(label[r.key] || r.key)}</span>
      <span class="bw"><span class="bf" style="width:${pct}%"></span>
        <span class="tk" style="left:${tick}%"></span></span>
      <span class="pv">${Math.round(pct)}%</span>
      <span class="rec">${rec}</span>
    </div>`;
  }).join('');
  const ped = [g.sire ? `父${escapeHtml(g.sire)}` : '', g.damsire ? `母父${escapeHtml(g.damsire)}` : '']
    .filter(Boolean).join('／') || '血統なし';
  // 枠が1つも付かなかった走は黙って消さない（2021年より前の走にはペースが入っていない）
  const rest = g.unlabeled
    ? `<div class="lvn">枠が付かない ${g.unlabeled}走は入っていない</div>` : '';
  const local = g.local_starts
    ? `／地方${g.local_starts}走は数えていない` : '';
  return `
    <div class="crh">条件べつの見立て（中央のみ・全走）</div>
    ${rest}
    <div class="agrid">${rows}</div>
    <div class="akey">着順<span class="akw"><span class="sq g1">1</span>1着</span><span class="akw"><span class="sq g2">2</span>2〜3着</span><span class="akw"><span class="sq g3">5</span>4〜5着</span><span class="akw"><span class="sq g4">9</span>6着以下</span><span class="akw"><span class="nr">未走</span>＝走っていない（棒は血統だけ）</span></div>
    <div class="afoot">血統＝${ped}の産駒（父75%＋母父25%）。中央${g.central_starts}走${local}。</div>
  `;
}

function popupBody(h, site) {
  const kg = h.weight_carried != null ? String(h.weight_carried).replace(/\.0$/, '') : '—';
  // 札の見出しと同じ赤オッズにする（片方だけ黒だと不具合に見えるため）
  const oddsTxt = h.odds != null
    ? `<span class="od${oddsHotClass(h.odds)}">${h.odds.toFixed(1)}倍</span>` : '—倍';
  return `
    <div class="phead">${markBadge20(h)}${umaBox(h.number, h.gate, 'sm')}
      <span class="pname">${escapeHtml(h.name)}</span>
      <span class="pmeta">${escapeHtml(h.sex_age ?? '')} ${escapeHtml(kg)}kg ${escapeHtml(h.jockey ?? '')}／${oddsTxt} ${escapeHtml(h.popularity ?? '—')}人気</span>
      <button type="button" class="pclose" data-close>閉じる</button>
    </div>
    <div class="pbody">
      ${mmInline(h)}
      <div class="pcareer">${careerLine(h)}</div>
      ${markWhyBlock(h)}
      ${panelButtons(h, site)}
      ${'' /* 入れ替わるのは3つの表だけ。印・通算・地雷の理由・レース戦績は
             どちらの面でも出したまま（2026-09-03 ユーザー指示） */}
      <div class="pmain">
        ${courseRecordTable(h)}
        ${raceTypeTable(h, (site || {}).prediction)}
        ${levelRecordTable(h)}
      </div>
      ${panelBodies(h, site)}
      ${popupRunsTable(h)}
    </div>`;
}

// ── 馬の格（％とランク） ───────────────────────────────────
// 正本: businesses/design/dept/finish/data/2026-09-02_horse-level-rank/adopted.html
//       （Kelpie.Inc デザイン部 2026-09-03 段8完了・確定）
// データ: shared/scripts/keiba_shutuba_columns.py の build_horse_grade()
//        ／ 数字の作り方は shared/scripts/keiba_horse_grade.py
//
// 棒1本を濃さ3段で「いま確かな分・まだ分からない分・まだ伸びる分」に割り、残りが届かない分。
// **線も枠も足さない。**足すと1本の図が「内訳の表」に変わる（基準の1枚 #14）。
// 出す数字は％とランクの2つだけ（依頼書 質問8）。
// 棒の下の目盛り。**足し上げた数**を2つだけ置く（2026-09-03 ユーザー決定）。
//   39 … ここまでは確か   ／   54 … ここまではあり得る（確か＋分からない＋伸びる）
// 途中の51（確か＋分からない）は出さない。そこで止まる意味が無く、
// 走の少ない馬では3つの数字が左に寄って重なるため（13%の馬で 13・27・30）。
//
// **棒の上に名前は置かない。**幅3%の段（まだ伸びる分）に文字が入らず、
// 隣の名前と詰まって読めなくなる。名前は下の凡例だけに出す。
//
// 「届かない」は凡例から外した（残りの余白そのもので、数えるものではない）。
// 「いま確かな分」の数字も外した——大きい数字と左の目盛りに同じ値が2回出るため。
function gaugeTicks(g) {
  const reach = Math.min(100, g.sure + g.unknown + g.growth);
  const t = [];
  // 0の位置は「0」の文字と重なるので、確かな分がごく短い馬では目盛りを出さない
  if (g.sure >= 5) {
    t.push(`<i style="left:${g.sure}%"></i>`
      + `<b style="left:${g.sure}%">${Math.round(g.sure)}</b>`);
  }
  // 右端は「能力の上限 100」と重なるので、そこへ寄った馬では出さない
  if (reach - g.sure >= 5 && reach <= 88) {
    t.push(`<i style="left:${reach}%"></i>`
      + `<b style="left:${reach}%">${Math.round(reach)}</b>`);
  }
  return `<div class="hgcum"><b class="l0">0</b>${t.join('')}`
    + `<s>能力の上限 100</s></div>`;
}

function horseGradeBody(h) {
  const g = h.horse_grade;
  if (!g) return '';
  const seg = (cls, v, label) => v > 0
    ? `<span class="hgs ${cls}" style="width:${v}%" title="${label} ${Math.round(v)}"></span>` : '';
  // ランクは星の数（半分刻みの10段）。**塗った星を重ねて幅で切る**——「★★☆」のように
  // 文字を並べると、☆が「半分」なのか「空」なのかが読めないため。
  // 文字の段（S〜E / A〜G）は使えない（既存の grade と見分けが付かない・依頼書 #1）。
  // 走数が足りない馬には出さない（既定は6走）。5走までは、いま出るランクが
  // 生涯のランクから中央値11ポイント以上ずれる。弱いのではなく固まっていないだけ。
  // 星は**今日のレースと同じクラスに出る馬の中での位置**。クラスを書かないと、
  // 未勝利で13%の馬が★★★★になる理由が読めない（未勝利の中では上位10%）。
  // 帯を馬ごとに決めていた頃は、同じレースで数字と星が逆を向く組が8.8%あった。
  const rank = g.stars != null
    ? `<span class="hgstars" title="${escapeHtml(g.band || '')}の中で上位${g.top_percent}％">`
      + `<span class="hgst">★★★★★</span>`
      + `<span class="hgsf" style="width:${g.stars / 5 * 100}%">★★★★★</span></span>`
      + `<span class="hgband">${escapeHtml(g.band || '')}クラスの中で</span>`
    : `<span class="hgr none">星は${g.min_runs || 3}走から</span>`;
  // 2026-09-03 ユーザー指示で、下の説明3行（濃さの読み方・母数と順位・地方や
  // クラスが読めない走の断り）は消した。**帯（「1勝クラスの中で」）と星は残る**ので、
  // 何と比べた位置かは札の横で分かる。数えていない走の断りは画面から消えている。
  return `
    <div class="crh">馬の能力値</div>
    <div class="hgnum"><b>${Math.round(g.pct)}</b><i>％</i>${rank}</div>
    <div class="hgbar">
      ${seg('s1', g.sure, 'いま確かな分')}
      ${seg('s2', g.unknown, 'まだ分からない分')}
      ${seg('s3', g.growth, 'まだ伸びる分')}
    </div>
    ${gaugeTicks(g)}
    <div class="hgkey">
      <span class="hgk"><i class="hgc s1"></i>いま確かな分</span>
      <span class="hgk"><i class="hgc s2"></i>まだ分からない分 ${Math.round(g.unknown)}</span>
      <span class="hgk"><i class="hgc s3"></i>まだ伸びる分 ${Math.round(g.growth)}</span>
    </div>
  `;
}

// ── ポップアップの中身を入れ替える別画面 ────────────────────
// 依頼書: businesses/design/dept/reception/data/briefs/2026-09-02_horse-level-rank.md
//   質問9「ボタンを置いて、押したところに別画面で見れるようにしたい」
//   質問10 ボタンはポップアップの中／質問11 重ねずに中身を入れ替える
//   質問12 出すのは押した1頭だけ／質問13 縦に伸ばしてよい
// 2026-09-03 ユーザー指示で「条件べつの見立て」もここへ移した（最初はふだんの面に
// 直接出していた）。**馬の格（％とランク）は未実装。**出来たらこの表に1行足すだけで
// ボタンが2つに増える。
//
// 閉じ方は既存のまま（「閉じる」ボタン・背景・Esc でポップアップごと閉じる）。
// **別画面から戻る手段は依頼書に書かれていないので実装側で決めた**（「← 戻る」）。
// 閉じるだけにすると、見るたびに馬名を押し直すことになるため。
// **1画面にまとめてある**（2026-09-03 ユーザー指示「馬の格と条件べつの見立てを
// ひとまとめに」）。最初はボタン2つ・別画面2つで作ったが、開いた先でさらに選ばせる形に
// なっていた。基準の1枚 #18「畳むのは1階層まで。開いた先でさらに押させない」に揃えた。
// 並びは 馬の格（この馬ぜんぶで1つの数）→ 条件べつの見立て（34枠の内訳）。全体 → 内訳の順。
const POPUP_PANELS = [
  {
    key: 'power',
    label: '馬の能力詳細',
    render: (h, site) => {
      const a = horseGradeBody(h);
      const b = aptitudeGrid(h, site);
      return (a || b) ? a + b : '';
    },
  },
];

function panelButtons(h, site) {
  const btns = POPUP_PANELS
    .filter((p) => p.render(h, site))
    .map((p) => `<button type="button" class="ppb" data-panel="${p.key}">`
      + `${escapeHtml(p.label)}<i class="apop">▸</i></button>`).join('');
  return btns ? `<div class="ppbrow">${btns}</div>` : '';
}

function panelBodies(h, site) {
  return POPUP_PANELS.map((p) => {
    const body = p.render(h, site);
    if (!body) return '';
    // 「← 戻る」は置かない。**同じボタンをもう一度押すと表に戻る**形にしたので、
    // 戻る手段が2つあると押しどころが分かれる。ボタンは表と入れ替わらない位置にある
    return `<div class="ppanel" data-panel-body="${p.key}" hidden>${body}</div>`;
  }).join('');
}

// 開いている面を切り替える。key が空なら「ふだんの面」へ戻る。
// ポップアップを開くたびに showPanel(p, '') で必ずふだんの面から始める。
function showPanel(popup, key) {
  const main = popup.querySelector('.pmain');
  if (!main) return;
  main.hidden = !!key;
  popup.querySelectorAll('[data-panel-body]').forEach((el) => {
    el.hidden = el.dataset.panelBody !== key;
  });
  // 同じボタンで行き来するので、いまどちらの面かをボタンの文字で示す
  popup.querySelectorAll('.ppb').forEach((b) => {
    const p = POPUP_PANELS.find((x) => x.key === b.dataset.panel);
    const on = b.dataset.panel === key;
    b.classList.toggle('on', on);
    b.innerHTML = on
      ? `<i class="apop">◂</i>${escapeHtml('表にもどす')}`
      : `${escapeHtml((p && p.label) || '')}<i class="apop">▸</i>`;
  });
  const body = popup.querySelector('.pbody');
  if (body) body.scrollTop = 0;     // 入れ替えたら必ず上から読ませる
}

// 赤オッズの境目（ODDS_HOT / oddsHotClass）は app.js に移した（2026-08-26）。
// WIN5の画面でも同じ境目を使うため。

// 106-spec §4: 柱（新聞の1頭ぶんの縦帯）。押すと馬名ポップアップが開く。
// 押しどころを縦書きの馬名（幅13px）だけにすると狭すぎるので、柱ごとボタンにする。
function spineHtml(h) {
  return `<button type="button" class="aspine" data-pop="${h.number}">
    ${markBadge20(h)}${umaBox(h.number, h.gate, 'sm')}
    <span class="vname">${escapeHtml(h.name)}</span><i class="apop">▸</i>
  </button>`;
}

// ============================================================
// 111-spec: 自分の印（印のマスを押す → 下からシートが上がる）
//
// AIの印（柱の ◎○▲△・穴・地雷）とは列を分ける。**左端が自分の印で押せる、
// その右の柱がAIの印で押せない。** 出馬表は「印を付ける」（1頭1行・全頭が1画面に
// 入る）と「戦績5走」（従来の札）を切り替えられる。既定は従来どおり戦績5走。
//
// クラスの接頭辞は mm-（my mark）。印のマス自体は札・1行の両方で同じ mmCell を使う。
// 重複ルール: ◎○▲は1頭まで（別の馬に付けると前の馬から自動で外れる）／△☆は複数可。
// 保存: localStorage の mymark:{race_id}。端末をまたぐ同期はしない。
// ============================================================
// 消（＝この馬は切る）と ー（＝見たうえで印なし）も印のひとつとして扱う。
// 印を取り消すのは「いま付いている印をもう一度押す」（2026-08-06 ユーザー決定で
// 「元に戻す」「閉じる」のボタンを外したため、消しゴム専用のボタンは持たない）。
// ✓（チェック）は 2026-09-02 追加。◎○▲△☆と同じ「買う側」の印で、頭数の上限は持たない
// （◎○▲は1頭まで＝MM_SINGLE。✓ はそこに入れない）。並びは ☆ の次・消 の手前。
const MM_MARKS = ['◎', '○', '▲', '△', '☆', '✓', '消'];
const MM_CLS = { '◎': 'm1', '○': 'm2', '▲': 'm3', '△': 'm4', '☆': 'm5', '✓': 'm7', '消': 'm6' };
const MM_SINGLE = new Set(['◎', '○', '▲']);   // 1頭までの印
const MM = { key: '', marks: {}, target: null, by: {}, sheet: null, shade: null };

function mmLoad(raceId) {
  MM.key = `mymark:${raceId}`;
  try { MM.marks = JSON.parse(localStorage.getItem(MM.key)) || {}; } catch (e) { MM.marks = {}; }
  // ー は 2026-08-07 に廃止。前に保存した ー は読み捨てる
  // （ボタンが無くなったので、残しても押して消せない印になるため）
  let dropped = false;
  for (const k of Object.keys(MM.marks)) {
    if (!MM_CLS[MM.marks[k]]) { delete MM.marks[k]; dropped = true; }
  }
  if (dropped) mmSave();
}
// localStorage が使えない環境（プライベートブラウズ等）でも印は付く。保存されないだけ。
function mmSave() {
  try { localStorage.setItem(MM.key, JSON.stringify(MM.marks)); } catch (e) { /* 保存しないだけ */ }
}
// 同じ印をもう一度押したら外す（＝印なしに戻す）。それが唯一の取り消し方法
function mmSet(n, mk) {
  if (mk === null || MM.marks[n] === mk) { delete MM.marks[n]; mmSave(); return; }
  if (MM_SINGLE.has(mk)) {
    for (const k of Object.keys(MM.marks)) {
      if (MM.marks[k] === mk && String(k) !== String(n)) delete MM.marks[k];
    }
  }
  MM.marks[n] = mk;
  mmSave();
}

// 印のマス。中身（記号・色）は mmPaint がまとめて書き込むので、ここでは空の器だけ作る
function mmCell(h) {
  return `<button type="button" class="mm-my" data-my="${h.number}"${h.scratched ? ' disabled' : ''}>`
    + '<span class="v e">—</span></button>';
}

// 「印を付ける」モードの1行。札から戦績5走を落とし、AIの点数・評価を残したもの
// 111-spec §3.6: 馬名は押せる（札の柱と同じ馬名ポップアップが開く）。戦績5走を落とした
// モードなので、戦績を見る道がここに無いと「印を付ける」から戻らないと確かめられない。
// ポップアップ（#pop-N）は renderShutuba20 が出走馬ぶん出しており、モードによらず同じものを開く。
function mmRow(h) {
  if (h.scratched) {
    // 取消馬にはポップアップそのものが無い（renderShutuba20 が live だけ作る）ので押せない
    return `<div class="mm-row scr" data-n="${h.number}">${mmCell(h)}
      <span class="mm-ai"><span class="none">—</span></span>
      <span class="mm-c">${umaBox(h.number, h.gate, 'sm')}<span class="nm"><span class="t">${escapeHtml(h.name)}</span></span>
        <span class="tot">（取消）</span><span class="od">—</span></span></div>`;
  }
  return `<div class="mm-row${h.ability_mark ? ' pred' : ''}" data-n="${h.number}">${mmCell(h)}
    <span class="mm-ai">${markBadge20(h) || '<span class="none">—</span>'}</span>
    <span class="mm-c">${umaBox(h.number, h.gate, 'sm')}<span class="mm-nmwrap"><button type="button" class="nm" data-pop="${h.number}"><span class="t">${escapeHtml(h.name)}</span><i class="apop">▸</i></button>${mmSub(h)}</span>
      <span class="tot">${fmtNum(dispScore(h), 1)}<i class="grade ${gradeClass(dispGrade(h))}">${gradeDisp(dispGrade(h))}</i></span>
      <span class="od${oddsHotClass(h.odds)}">${h.odds != null ? h.odds.toFixed(1) : '—'}<i>倍</i>
        <span class="pp">${h.popularity ?? '—'}人</span></span></span></div>`;
}

// 一覧の2行目（2026-09-03 ユーザー指示）。性齢・騎手・斤量・馬体重を出す。
// **1行に足せない。**375px幅の1行目は 印30 + AI30 + 馬番28 + 点数54 + オッズ52 で
// 埋まっており、馬名に残るのは180px前後しかない。名前の下に敷く。
function mmSub(h) {
  const kg = h.weight_carried != null ? String(h.weight_carried).replace(/\.0$/, '') : '—';
  const bw = h.body_weight != null
    ? `${h.body_weight}${h.body_weight_diff != null
      ? `(${h.body_weight_diff > 0 ? '+' : ''}${h.body_weight_diff})` : ''}` : '';
  const j = h.jockey && h.jockey !== 'N/A' ? h.jockey : '—';
  return `<span class="mm-sub"><span>${escapeHtml(h.sex_age ?? '')}</span>`
    + `<span>${escapeHtml(j)}</span><span>${escapeHtml(kg)}kg</span>`
    + (bw ? `<span>${escapeHtml(bw)}</span>` : '') + '</span>';
}

// 111-spec §3.4（mockup-86 案C）: 札（戦績5走）の中の印の1行。
// 一覧のマスと違い**シートは開かず、押した印がその場で付く**。
// 札は幅に余裕が無い（1行目の余りは最悪の馬で56px）ので、横に列を足さず縦に1行敷く。
// そのぶん札は1枚38px高くなる（14頭で 4,417px → 4,919px＝+11.4%・実測）。取消馬には出さない。
function mmInline(h) {
  if (h.scratched) return '';
  return `<div class="mm-in" data-n="${h.number}"><span class="lb">自分の印</span>`
    + MM_MARKS.map((m) => `<button type="button" class="${MM_CLS[m]}" data-mk="${m}">${m}</button>`).join('')
    + '</div>';
}

// ラベルを「印を付ける／戦績5走」から「印／戦績」へ縮めた（2026-08-27）。
// この行の右端にトッピングの2つ（掛け合わせ｜材料）を並べるため。3つで204px使っていて、
// それが行の58%だった。縮めると136pxになり、320px幅の端末でも27px余る。
// .tpctl は setupTopping がここ（.mm-tp）へ差し込む。
// 「コース」は 2026-08-27 にタブからここへ移した。押すとポップアップ（#pop-course）が開く。
// 印／戦績／新聞 と違って表示を切り替えるものではないので、3つの帯の中には入れない。
// course_entities が無いレース（コースが確定できなかったぶん）はボタンごと出さない。
function mmBar(site) {
  const crs = site && site.course_entities
    ? '<button type="button" class="crsb" data-pop="course">コース</button>' : '';
  return `<div class="mm-bar">
    <span class="mm-seg">
      <button type="button" data-view="mark" class="on">印</button>
      <button type="button" data-view="runs">戦績</button>
      <button type="button" data-view="paper">新聞</button>
    </span>
    ${crs}
    <span class="mm-tp"></span>
    <span class="mm-sum"></span>
  </div>`;
}

// 既定は「印を付ける」（2026-08-06 ユーザー決定）。従来の札は .shlist 側を off で始める
function mmList(site) {
  const rows = [...site.horses].sort((a, b) => a.number - b.number).map(mmRow).join('');
  return `<div class="mm-list">
      <div class="mm-hd"><span class="h-my">自分</span><span class="h-ai">AI</span>
        <span class="h-c"><span class="h-nm">馬</span><span class="h-tot">点数・評価</span>
          <span class="h-od">オッズ</span></span></div>
      ${rows}
    </div>`;
}

// 印のマスと要約行を、いまの MM.marks に合わせて塗り直す
function mmPaint() {
  document.querySelectorAll('.race20 [data-my]').forEach((b) => {
    const mk = MM.marks[b.dataset.my];
    const v = b.querySelector('.v');
    b.className = 'mm-my' + (mk ? ` set ${MM_CLS[mk]}` : '');
    v.className = mk ? 'v' : 'v e';
    v.textContent = mk || '—';
  });
  // 札の中の1行（.mm-in）も同じ印で塗る。一覧のマスと札は同じ MM.marks を見ている
  document.querySelectorAll('.race20 .mm-in').forEach((row) => {
    const mk = MM.marks[row.dataset.n];
    row.querySelectorAll('button').forEach((b) => b.classList.toggle('on', !!mk && b.dataset.mk === mk));
  });
  // 2026-08-27（155-spec 案2）: **自分の印**で行・札・柱の地を3つに塗り分ける。
  //   消    … 薄い灰。中身の文字を62%に落として沈める
  //   ◎○▲△☆ … 1段濃い青
  //   印なし … 白のまま
  // AIの印（h.ability_mark）とは連動させない。あちらは .pred が別に持っている。
  // 一度付けた印を外すと白へ戻るので、毎回3つとも外してから付け直す。
  document.querySelectorAll('.race20 .acard, .race20 .npcol, .race20 .mm-row').forEach((el) => {
    const n = el.dataset.h || el.dataset.n;
    const mk = MM.marks[n];
    el.classList.remove('my-keshi', 'my-mark');
    if (mk === '消') el.classList.add('my-keshi');
    else if (mk) el.classList.add('my-mark');
  });
  const sum = document.querySelector('.race20 .mm-sum');
  if (!sum) return;
  const by = {};
  Object.entries(MM.marks).forEach(([n, mk]) => { (by[mk] = by[mk] || []).push(Number(n)); });
  const parts = MM_MARKS.filter((mk) => by[mk])
    .map((mk) => `<b>${mk}</b>${by[mk].sort((a, b) => a - b).join('・')}`);
  sum.innerHTML = parts.length
    ? `自分の印　${parts.join('　')}`
    : '<span class="e">自分の印はまだありません</span>';
}

function mmOpenSheet(n) {
  const h = MM.by[n];
  if (!h || h.scratched) return;
  // シートもポップアップと同じ覆いなので、開いている間はページを止める（111-spec §3.8）。
  // 開いているシートをもう一度開くことはない（背景の覆いがマスを塞ぐ）が、
  // 二重に数えないように、いま閉じている時だけ数える
  if (!MM.sheet.classList.contains('on')) lockPageScroll();
  MM.target = String(n);
  const cur = MM.marks[MM.target];
  MM.sheet.querySelector('.sh').innerHTML =
    `${umaBox(h.number, h.gate, 'sm')}<b>${escapeHtml(h.name)}</b>`
    + `<span class="cur">${cur ? `いまの印<i>${cur}</i>` : '印なし'}</span>`;
  MM.sheet.querySelectorAll('.mks button').forEach((b) => {
    b.classList.toggle('on', !!cur && b.dataset.mk === cur);
  });
  MM.sheet.classList.add('on');
  MM.shade.classList.add('on');
}

// シートは .race20 の外（body直下）に置く。position:fixed を親の影響から切り離すため
function setupMyMarks(site) {
  const root = document.querySelector('.race20');
  if (!root || !root.querySelector('.mm-list')) return;

  site.horses.forEach((h) => { MM.by[String(h.number)] = h; });
  mmLoad(site.race.race_id);

  const shade = document.createElement('div');
  shade.className = 'mm-shade';
  const sheet = document.createElement('div');
  sheet.className = 'mm-sheet';
  // 2026-08-06 ユーザー決定: 「元に戻す」「閉じる」のボタンは置かない。
  // 閉じ方は 印を押す／背景タップ／Esc の3つ
  sheet.innerHTML = `<div class="grip"></div><div class="sh"></div>
    <div class="mks">${MM_MARKS.map((m) => `<button type="button" class="${MM_CLS[m]}" data-mk="${m}">${m}</button>`).join('')}</div>`;
  document.body.appendChild(shade);
  document.body.appendChild(sheet);
  MM.sheet = sheet;
  MM.shade = shade;

  const close = () => {
    if (!sheet.classList.contains('on')) return;   // 開いていない時の Esc では何もしない
    sheet.classList.remove('on');
    shade.classList.remove('on');
    MM.target = null;
    unlockPageScroll();                            // 111-spec §3.8
  };
  shade.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // 押した瞬間に閉じる。結果の説明文は出さない（1テンポ遅れて操作感が落ちるため。
  // 何が起きたかは、印のマスと上の要約行が即座に変わることで分かる）
  sheet.querySelectorAll('.mks button').forEach((b) => b.addEventListener('click', () => {
    if (MM.target == null) return;
    mmSet(MM.target, b.dataset.mk);
    mmPaint();
    close();
  }));

  // 印のマスは capture で拾って止める。同じ .race20 に馬名ポップアップの click が
  // 付いているので、拾ったクリックはそこへ流さない
  root.addEventListener('click', (e) => {
    // 札の中の1行はシートを開かず、その場で印が付く（111-spec §3.4）
    const ib = e.target.closest('.mm-in button');
    if (ib) {
      e.preventDefault();
      e.stopPropagation();
      mmSet(ib.closest('.mm-in').dataset.n, ib.dataset.mk);
      mmPaint();
      return;
    }
    const b = e.target.closest('[data-my]');
    if (!b || b.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    // 印が付いているマスも、付いていないマスと同じようにシートを開く。
    // 消すのはシートで「いま付いている印をもう一度押す」（2026-08-07 ユーザー決定で
    // 一押し即消しを取りやめ、付け替えを1回の操作に戻した）
    mmOpenSheet(b.dataset.my);
  }, true);

  // 126-spec §2.1: 「印を付ける／戦績5走／新聞」の3つ。既定は「印を付ける」のまま
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (!b) return;
    const v = b.dataset.view;
    root.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('on', x === b));
    root.querySelector('.shlist').classList.toggle('off', v !== 'runs');
    root.querySelector('.mm-list').classList.toggle('off', v !== 'mark');
    const paper = root.querySelector('.shpaper');
    if (paper) {
      paper.classList.toggle('off', v !== 'paper');
      if (v === 'paper') npSyncRail(root);   // 隠れている間は測れないので、出した直後に測る
    }
  });

  mmPaint();
}

// 106-spec §3: 1頭1枚の札
function shutubaCard(h) {
  if (h.scratched) {
    return `<article class="acard scratched" data-h="${h.number}">
      <div class="aspine plain">${umaBox(h.number, h.gate, 'sm')}<span class="vname">${escapeHtml(h.name)}</span></div>
      <div class="abody"><div class="ahead">（取消）</div></div>
    </article>`;
  }
  const kg = h.weight_carried != null ? String(h.weight_carried).replace(/\.0$/, '') : '—';
  const bw = bwDisplay(h);
  const rot = h.rotation ? `<span class="rot">${escapeHtml(h.rotation)}</span>` : '';
  return `<article class="acard${h.ability_mark ? ' pred' : ''}" data-h="${h.number}">
    ${spineHtml(h)}
    <div class="abody">
      <div class="ahead">
        <span class="pa">${escapeHtml(h.sex_age ?? '')}</span><span class="pk">${kg}</span>
        <span class="pj">${escapeHtml(h.jockey && h.jockey !== 'N/A' ? h.jockey : '—')}</span>${legBar(h.running_style)}
        <span class="tot">${fmtNum(dispScore(h), 1)}<i class="grade ${gradeClass(dispGrade(h))}">${gradeDisp(dispGrade(h))}</i></span>
        <span class="od${oddsHotClass(h.odds)}">${h.odds != null ? h.odds.toFixed(1) : '—'}<i>倍</i><i>${h.popularity ?? '—'}人</i></span>
      </div>
      <div class="asub">${bw}${rot}</div>
      ${'' /* 2026-09-03 ユーザー指示:
             ・itemDots（近走×／血統×／斤量○）は戦績の札から外した
             ・自分の印を、コース適性の表より**上**に置いた（順番を入れ替えた） */}
      ${mmInline(h)}
      ${courseBlock(h)}
      ${runsBlock(h)}
    </div>
  </article>`;
}

// ============================================================
// 126-spec §4: 新聞（案A 馬柱）。1頭＝1本の柱を横に並べる。
//
// 札（.acard）が「1頭を縦に読む」ためのものなのに対し、こちらは
// **隣の馬と同じ行を横に見比べる**ためのもの。106-spec §9 の未決#2がこれ。
// 過去走の12項目は札と同じで、1つも減らしていない（並べ替えただけ）。
// ============================================================

// 126-spec §4.4b: 柱では**条件戦の名前を出さない**（2026-08-24 決定）。
// 「3歳未勝利」「4歳以上1勝クラス」は1行目のクラスバッジと同じことを書いており、
// 過去5走13,244走のうち **71.7%** がこれに当たる。そのぶんの幅を回顧メモのタグに回す
// （タグは31.0%が幅に入らず切れていた。「スローの流れを後方から」は11字ある）。
// 名前とタグの取り合いが実際に起きるのは 983走＝7.4% だけで、そこは名前のほうが縮む。
//
// **「障害4歳以上未勝利」は消さない。**クラスバッジは「未勝利」までしか出さないので、
// 消すと障害戦だったことが読めなくなる（過去5走に16走）。
// 地方のクラス（C1 など）も同じ理由で残す。
// 札（.vrun）と馬名ポップアップは今までどおり全部出す。
const RUN_CLASS_ONLY = /^[0-9０-９]*歳?(以上)?(新馬|未勝利|[123]勝クラス)$/;

function npRunName(raceName) {
  const n = stripClassSuffix(raceName);
  if (!n || RUN_CLASS_ONLY.test(n)) return '';
  return `<span class="rnm" title="${escapeHtml(n)}">${escapeHtml(n)}</span>`;
}

// 過去走1走。札の runLine3 を柱の幅174pxに組み替えたもの（札も 2026-09-02 に上下2段になった）。
// 2026-09-02: デザイン部の正本（上段＝見本C／下段＝見本E）どおりに作り直した。
//   上段（.np1）  着順・着差・勝ち馬・相手の最高成績。着順は10.5px→18pxで柱の中でいちばん大きい文字になる
//   下段（.np2）  5行。間隔は4pxの倍数（近い2行4px・遠い2行8px）
// 項目は1つも減らしていない。正本の見本には無かった**レース名（.rnm）だけ足してある**
// ＝正本の見本データは3歳未勝利で過去走の71.7%がクラス名だけの走だったため、
// 名前が出る28.3%の走が見本に1つも現れず、落ちたことが見えなかった。
// 置き場所は回顧メモのタグと同じ行（従来と同じ組み合わせ）。
function npRun(p) {
  const cond = condHtml(p);
  // 単位を書く（57 → 57kg）。単位が無いと斤量57と馬体重432が同じ「ただの数字」に見える。
  // 値が無い走は「—」だけを出す（「—kg」にしない）
  const bw = p.body_weight != null ? `${escapeHtml(String(p.body_weight))}<i class="uu">kg</i>` : '—';
  const kg = p.weight != null ? `${escapeHtml(String(p.weight))}<i class="uu">kg</i>` : '—';
  const rankCls = { 1: 'f1', 2: 'f2', 3: 'f3' }[p.last3f_rank] || '';
  const agTitle = p.last3f_rank ? `このレースの上がり${p.last3f_rank}位` : '上がり3F';
  const timeTitle = p.time_grade
    ? `基準比 ${p.time_resid > 0 ? '+' : ''}${p.time_resid}秒（当日の馬場差を補正後）・着差${marginText(p)}秒`
    : (p.time_note || '');
  // 回顧メモのタグは1本だけ。柱の幅174pxに2本入れると勝ち馬が押し出される。
  // 全部は馬名ポップアップの回顧メモに出ている（126-spec §4.4）
  const notes = runNoteTags((p.note_labels || []).slice(0, 1));
  const noteTitle = notes && p.note_text ? ` title="${escapeHtml(p.note_text)}"` : '';
  return `<div class="nprun${runBandClass(p)}">
    <div class="np1">${shutubaFinBox(p.finish)}<span class="fu">着</span><span class="mg">(${marginText(p)})</span><span class="wn">${escapeHtml(p.winner || '')}</span>${winnerBestSpan(p, true)}</div>
    <div class="np2">
      <div class="r1">${levelBadge(p)}<span class="dt">${shutubaMd(p.date)}</span><span class="tk">${escapeHtml(p.track || '')}</span>${classBadge(p.grade, p.race_name)}</div>
      <div class="r3">${cond}<span class="nm hd">${escapeHtml(p.runners ?? '—')}頭</span>${runWakuText(p)}<span class="nm pp">${escapeHtml(p.popularity ?? '—')}人</span></div>
      <div class="r4">${rankSpan(p.time ?? '—', p.time_grade || '', timeTitle, 'tm')}${cornersHtml(p.corners)}${rankSpan(p.last_3f ?? '—', rankCls, agTitle)}${scenarioHtml(p.scenario)}</div>
      <div class="r3"><span class="jk">${escapeHtml(p.jockey ?? '—')}</span><span class="kg">${kg}</span><span class="bw">${bw}</span></div>
      <div class="r2"${noteTitle}>${npRunName(p.race_name)}${notes}</div>
    </div>
  </div>`;
}

// 5枠ぶん。休養マス・空マスの入れ方は札と同じ（buildRunCells をそのまま使う）
function npRunsCells(h) {
  return buildRunCells(h.past_runs).map((c) => {
    if (c.kind === 'run') return npRun(c.run);
    if (c.kind === 'rest') {
      return `<div class="nprun rest">${escapeHtml(restLabel(c.days))}<br>（${c.days}日）</div>`;
    }
    return '<div class="nprun empty"></div>';
  }).join('');
}

// 柱1本。押しどころは頭（.nphead）で、押すと馬名ポップアップが開く（札の柱と同じ）
function npCol(h) {
  if (h.scratched) {
    return `<article class="npcol scratched" data-h="${h.number}">
      <div class="nphead"><div class="l1">${umaBox(h.number, h.gate, 'sm')}</div>
        <div class="nm">${escapeHtml(h.name)}</div>
        <div class="l3">（取消）</div></div>
    </article>`;
  }
  const kg = h.weight_carried != null ? String(h.weight_carried).replace(/\.0$/, '') : '—';
  // 柱の頭。押せるものが2つある（自分の印のマスと馬名）ので、頭ごとボタンにはできない。
  // 印は1マス（押すと下からシートが上がる）にした。札の7ボタン（mmInline）は
  // 幅174pxだと1つ20pxを切って押しにくいため、一覧と同じシート方式にしている。
  return `<article class="npcol${h.ability_mark ? ' pred' : ''}" data-h="${h.number}">
    <div class="nphead">
      <div class="l1">${mmCell(h)}${markBadge20(h)}${umaBox(h.number, h.gate, 'sm')}</div>
      <button type="button" class="npname" data-pop="${h.number}"><span class="nm">${escapeHtml(h.name)}</span><i class="apop">▸</i></button>
      <div class="l3">${escapeHtml(h.sex_age ?? '')}<span class="kg">${kg}</span>${escapeHtml(h.jockey && h.jockey !== 'N/A' ? h.jockey : '—')}${legBar(h.running_style)}</div>
      <div class="l4"><span class="tot">${fmtNum(dispScore(h), 1)}<i class="grade ${gradeClass(dispGrade(h))}">${gradeDisp(dispGrade(h))}</i></span><span class="od${oddsHotClass(h.odds)}">${h.odds != null ? h.odds.toFixed(1) : '—'}<i>倍</i><i>${h.popularity ?? '—'}人</i></span></div>
    </div>
    <div class="npcr">${courseRecordTable(h, true)}</div>
    ${npRunsCells(h)}
  </article>`;
}

// 目盛り列（左端）。柱を横に送っても「いま何走前を見ているか」が残るよう貼り付ける
function npRail() {
  const labels = ['前走', '2走前', '3走前', '4走前', '5走前']
    .map((t) => `<div class="rlb">${t}</div>`).join('');
  return `<div class="nprail"><div class="rhd"></div><div class="rcr">適性</div>${labels}</div>`;
}

// 目盛り列の「適性」の高さは、実際に描かれたマスに合わせる（設計値を書かない）。
// offsetHeight を使う。getBoundingClientRect はページを拡大表示していると拡大後の値を
// 返すので、それを height に入れるともう一度拡大がかかる。
// 隠れているあいだは高さが0で測れないため、表示に切り替えた直後にもう一度呼ぶ（§4.1）
function npSyncRail(root) {
  const wrap = root.querySelector('.shpaper');
  if (!wrap) return;
  const cell = wrap.querySelector('.npcr');
  const rail = wrap.querySelector('.nprail .rcr');
  if (!cell || !rail) return;
  const h = cell.offsetHeight;
  if (h > 0) rail.style.height = `${h}px`;
}

function renderPaper(site) {
  const cols = [...site.horses].sort((a, b) => a.number - b.number).map(npCol).join('');
  return `<div class="shpaper off"><div class="npgrid">${npRail()}${cols}</div></div>`;
}

// ── 新聞のピンチイン・アウト（2026-09-03 ユーザー指示） ─────────
// **106-spec §2.2 で一度やめた拡大縮小を、新聞の面にだけ戻す。**
// 当時やめた理由は「横スクロールが無くなり虫めがねで覗く必要が無くなった」だったが、
// **新聞の面には横スクロールが残っている**ので、その前提は新聞に当てはまらない。
// 印・戦績の面には付けない（横スクロールが無く、当時の判断がそのまま生きている）。
//
// ページ全体の拡大（viewport の user-scalable）は触らない。触ると出馬表も
// 馬名ポップアップも一緒に拡大され、押しどころがずれる。
const NP_ZOOM = { min: 0.6, max: 2.5 };   // 0.6は16頭が1画面に入る側、2.5は文字が読める上限。
                                          // 守りたいのは「拡げても縮めても操作が壊れない」こと

function setupPaperZoom(root) {
  const wrap = root.querySelector('.shpaper');
  const grid = wrap && wrap.querySelector('.npgrid');
  if (!wrap || !grid) return;
  let scale = 1, start = 0, base = 1;
  const apply = () => {
    grid.style.transform = scale === 1 ? '' : `scale(${scale})`;
    grid.style.transformOrigin = '0 0';
    // 縮めた分だけ入れ物の高さも詰める（余白が下に残らないように）
    wrap.style.height = scale === 1 ? '' : `${grid.offsetHeight * scale}px`;
  };
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  wrap.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 2) return;
    start = dist(e.touches); base = scale;
  }, { passive: true });
  wrap.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2 || !start) return;
    e.preventDefault();          // 2本指のときだけ止める。1本指の横スクロールは残す
    scale = Math.min(NP_ZOOM.max, Math.max(NP_ZOOM.min, base * (dist(e.touches) / start)));
    apply();
  }, { passive: false });
  wrap.addEventListener('touchend', (e) => { if (e.touches.length < 2) start = 0; });
  // 指が使えない環境（PC）向け。Ctrl+ホイールはブラウザ標準の拡大と同じ持ち方
  wrap.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    scale = Math.min(NP_ZOOM.max, Math.max(NP_ZOOM.min, scale * (e.deltaY < 0 ? 1.1 : 0.9)));
    apply();
  }, { passive: false });
}

function renderShutuba20(site) {
  const up = renderUpset20(site.prediction.upset);
  const all = site.horses;

  const cards = [...all].sort((a, b) => a.number - b.number).map(shutubaCard).join('');
  // .shctl は空でも残す。トッピングの操作パネルが setupTopping からここへ差し込まれる
  // 馬名ポップアップは 2026-08-27 にタブの外へ出した（renderPopups20）。
  // タブは display:none で切り替えるので、出馬表タブの中に置くと展開タブから
  // 馬番を押しても中身が組み上がらず、幅も高さも0のまま開いていた。
  return `
    <div class="secthead">出馬表${memberLevelBand(site.prediction)}${up ? up.band : ''}</div>
    <div class="shctl"></div>
    ${mmBar(site)}
    <div class="shlist off">${cards}</div>
    ${renderPaper(site)}
    ${mmList(site)}
  `;
}

// 馬名ポップアップと荒れ度の札。**どのタブからも開くのでタブの外に置く**（2026-08-27）。
function renderPopups20(site) {
  const up = renderUpset20(site.prediction.upset);
  // コース（2026-08-27）。中身は開いた時に読む（data/courses/*.json の遅延読み込みは
  // タブだった頃と同じ仕組みのまま）。
  const crs = site.course_entities && window.CourseTab
    ? `<div class="popup wide" id="pop-course">
        <div class="phead"><span class="pname">コースデータ</span>
          <button type="button" class="pclose" data-close>閉じる</button></div>
        <div class="pbody">${window.CourseTab.render(site)}</div>
      </div>` : '';
  return site.horses.filter((h) => !h.scratched)
    .map((h) => `<div class="popup" id="pop-${h.number}">${popupBody(h, site)}</div>`).join('')
    + (up ? up.popup : '') + crs;
}

function setupShutuba20(site) {
  const root = document.querySelector('.race20');
  if (!root) return;

  // 106-spec §2.2: ズーム操作（表の大きさ ±・ピンチ）は廃止した。横スクロールが
  // 無くなり、虫めがねで覗く必要そのものが無くなったため。
  // **2026-09-03 に新聞の面だけ戻した**（setupPaperZoom）。新聞には横スクロールが
  // 残っているので、当時の前提が当てはまらない。印・戦績の面には付けていない。
  // §5.4: 「買える／消せる」は札に常時出るので、開く／消すボタンも無い。
  setupPaperZoom(root);

  // 105-spec §5.5: 馬名ポップアップ。閉じ方は「閉じる」ボタン・背景クリック・Esc の3つ
  const bg = document.createElement('div');
  bg.className = 'pbg';
  root.appendChild(bg);
  let openPopup = null;
  // 2026-08-27: 戻り先を1つだけ覚える。コースのポップアップから馬番を押して
  // 馬の戦績へ移ったとき、閉じたらコースへ戻す（開き直す手間をなくす）。
  // 覚えるのは1段だけ。馬 → コース → 馬 と行き来しても積み上がらない。
  let backTo = null;
  const openPopupById = (id) => {
    const p = root.querySelector(`#pop-${id}`);
    if (!p) return;
    p.classList.add('on');
    bg.classList.add('on');
    openPopup = p;
    showPanel(p, '');                 // 開き直したら必ずふだんの面から
    lockPageScroll();
    // コースは最初に開いた時だけ data/courses/*.json を読む（タブだった頃と同じ仕組み）
    if (id === 'course' && window.CourseTab) window.CourseTab.onShow(site);
  };
  const closePopup = () => {
    if (!openPopup) return;             // 開いていない時の Esc・[data-close] では何もしない
    openPopup.classList.remove('on');
    openPopup = null;
    const back = backTo;
    backTo = null;
    // 戻り先があるなら閉じずに入れ替える。入れ替えでも「1つ閉じて1つ開く」なので、
    // 先に止めを外してから開き直す。外さずに開くと lock だけが1つ余り、
    // そのあと最後の覆いを閉じても body の noscroll が解けない（読み込み直すまで動かせない）
    if (back) { unlockPageScroll(); openPopupById(back); return; }
    bg.classList.remove('on');
    unlockPageScroll();                 // 111-spec §3.8
  };
  root.addEventListener('click', (e) => {
    // 別画面の出し入れ。ポップアップは開いたままで中身だけ入れ替える
    const pb = e.target.closest('[data-panel]');
    if (pb && openPopup) {
      const key = pb.dataset.panel || '';
      const cur = [...openPopup.querySelectorAll('[data-panel-body]')]
        .find((x) => !x.hidden);
      const now = cur ? cur.dataset.panelBody : '';
      showPanel(openPopup, now === key ? '' : key);   // 同じボタンをもう一度押すと戻る
      return;
    }
    const nb = e.target.closest('[data-pop]');
    if (nb) {
      // コースの中から馬番を押したときだけ、戻り先としてコースを覚える
      const from = openPopup && openPopup.id === 'pop-course' && nb.dataset.pop !== 'course'
        ? 'course' : null;
      backTo = null;                    // 閉じる処理に戻り先を拾わせない
      closePopup();
      backTo = from;
      openPopupById(nb.dataset.pop);
      return;
    }
    if (e.target.closest('[data-close]')) closePopup();
  });
  bg.addEventListener('click', closePopup);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePopup(); });

  setupMyMarks(site);   // 111-spec: 自分の印
}


// 信頼度（bet-1の期間外実績から付いたラベル）。旧EV方式の買い目には無いので、
// 値が無ければ何も描かない＝過去の公開分は見た目が一切変わらない。
const CONF_CLASS = { '高': 'ok', '中': 'fair', '低': 'ng' };

function confChip(b) {
  const c = b && b.confidence;
  if (!c) return '';
  return ` <span class="chip ${CONF_CLASS[c] || 'acc'}">${escapeHtml(c)}</span>`;
}

// 表の下に置く1行。「低」が何を意味するかを数字で示す（ラベルだけでは読めないため）。
function confNote(bets) {
  const seen = new Map();
  for (const b of bets) {
    if (!b.confidence || b.confidence_roi === null || b.confidence_roi === undefined) continue;
    const t = b.type.replace('三連', '3連');
    if (!seen.has(t)) seen.set(t, `${t} ${b.confidence} ${b.confidence_roi.toFixed(2)}`);
  }
  if (!seen.size) return '';
  return `<div class="conf">信頼度＝過去の検証で100円が何円で戻ったか（1.00でトントン）：`
    + `${[...seen.values()].join('／')}</div>`;
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
        <td class="l">${escapeHtml(b.type.replace('三連', '3連'))}${confChip(b)}</td>
        <td class="l">${comboBoxes(b.type, b.combination, byNumberBets20)}</td>
        <td>${fmtYen(b.stake ?? b.tickets.length * 100)}</td>
        ${resultCell}
      </tr>
    `;
  }).join('');

  // 合計は表の最下段（tfoot）に置く。金額・払戻が上の行と同じ列に縦に並ぶので目で足し算を追える。
  // 表の外に浮いた1行（旧.betsum）だと、上下の1px罫線に挟まれて表とシミュレーターのどちらに
  // 属するのか読めなかった（mockup-28 案1）。セル数はheaderと必ず一致させる。
  let footCells;
  if (showResult && site.verification) {
    const v = site.verification;
    const icon = v.bets_hit ? '✓' : '✕';
    const cls = v.bets_hit ? 'o' : 'x';
    footCells = `<td>${fmtYen(totalCost)}</td><td class="${cls}">${icon}</td><td>${fmtYen(v.bets_return)}</td>`;
  } else if (showResult) {
    // 確定済みだが verification が無い（想定外）→ 結果・払戻は空にして列数だけ合わせる
    footCells = `<td>${fmtYen(totalCost)}</td><td>—</td><td>—</td>`;
  } else {
    footCells = `<td>${fmtYen(totalCost)}</td>`;
  }
  const footRow = `<tr><td class="l">合計</td><td class="l">${totalPoints}点</td>${footCells}</tr>`;

  return `
    <div class="secthead">買い目</div>
    <table class="fixed betstbl">
      <thead>${header}</thead>
      <tbody>${rows}</tbody>
      <tfoot>${footRow}</tfoot>
    </table>
    ${confNote(bets)}
  `;
}

/* ============================================================
   4タブ構成（2026-08-03）
   縦8,000px超の1本を、読む目的ごとに4枚へ分ける。分けるのは表示だけで、
   描画関数は1つも増減させていない（renderOverview20 等をそのまま各パネルへ入れる）。
   タブの並び順と既定タブは mock-tabs.html で確定した形。
   ============================================================ */
const RACE20_TABS = [
  { key: 'shutuba', label: '出馬表' },
  { key: 'tenkai', label: '展開' },
  // コースは 2026-08-27 にタブをやめ、出馬表の「印／戦績／新聞」の右のボタンから
  // 開くポップアップ（#pop-course）へ移した。タブは5枚から4枚になる。
  { key: 'kaime', label: '買い目' },
  // 回顧タブの見出しは中身に合わせる。レース前は renderVerification20 が
  // 「答え合わせ／結果はレース後に反映されます」を出すので、タブ名も同じ言葉にする
  { key: 'kaiko', label: '回顧', labelPre: '答え合わせ' },
];
const RACE20_TAB_DEFAULT = 'shutuba';

function race20TabFromHash() {
  const m = /(?:^|&)tab=([a-z]+)/.exec(String(location.hash || '').replace(/^#/, ''));
  return m && RACE20_TABS.some((t) => t.key === m[1]) ? m[1] : RACE20_TAB_DEFAULT;
}

// ===== 新馬レースの注記（2026-08-27・handoff_2026-08-27_shinba-model.md 決定3） =====
// 新馬は本体の勝率モデル win-1 の材料100項目のうち80項目が死ぬ（全頭が過去走ゼロ）ので、
// 新馬だけで学習した shinba-1 で予想を出している。点数は出さない：7観点のうち
// ③④の20点ぶんが全馬同点になり（実測 13頭とも6.0）、順位を付ける意味が無いため。
// 公開側（keiba_publish.py の mask_shinba）が site.shinba を付けたレースだけこの札を出す。
function renderShinbaNote20(site) {
  const sh = site.shinba;
  if (!sh) return '';
  const lines = [];
  if (sh.scores_hidden) lines.push(escapeHtml(sh.scores_hidden_reason || '新馬のため点数なし'));
  if (sh.marks_available === false && sh.marks_hidden_reason) {
    lines.push(escapeHtml(sh.marks_hidden_reason));
  }
  if (sh.bets_hidden_reason) lines.push(escapeHtml(sh.bets_hidden_reason));
  const model = sh.model ? `<b>${escapeHtml(sh.model)}</b> で予想しています。` : '';
  return `<div class="shinba-note">
      <div class="h">新馬レース</div>
      <p>${model}${lines.join('／')}</p>
    </div>`;
}

function buildRace20Html(site, oddsAll) {
  const banner = site.status === 'cancelled' ? '<div class="alert">このレースは中止になりました</div>' : '';
  // 結果が出ているレースだけ「回顧」に赤ドットを出す（renderVerification20 と同じ判定）
  const settled = site.status === 'final';
  // 109-spec §2.2: course_entities（course_idが確定できたレースの人物・血統ぶん）が
  // 無いレースはコースタブ自体を配列から落とす（推測でコースJSONを引かない）
  const tabs = RACE20_TABS
    // 新馬は買い目を出さない（買い目モデル bet-1 は新馬を1レースも学習していない）。
    // 空のタブを残すと「押したのに何も無い」になるので、タブごと落とす
    .filter((t) => t.key !== 'kaime' || !site.shinba);
  const bar = tabs.map((t) => `<button type="button" class="t20" role="tab"`
    + ` data-tab="${t.key}" aria-controls="pane-${t.key}" aria-selected="false">`
    + `${!settled && t.labelPre ? t.labelPre : t.label}`
    + `${t.key === 'kaiko' && settled ? '<span class="dot" aria-hidden="true"></span>' : ''}`
    + `</button>`).join('');
  const pane = (key, body) => `<div class="tabpane" id="pane-${key}" data-pane="${key}"`
    + ` role="tabpanel">${body}</div>`;
  return `
    <div class="race20">
      ${renderHeader20(site)}
      ${banner}
      ${renderShinbaNote20(site)}
      <div class="tabbar" role="tablist">${bar}</div>
      ${pane('shutuba', renderMitate20(site) + renderShutuba20(site))}
      ${pane('tenkai', renderOverview20(site))}
      ${pane('kaime', renderBets20(site) + renderOddsMasterSection(site, oddsAll))}
      ${pane('kaiko', renderVerification20(site))}
      ${renderPopups20(site)}
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

// 2026-08-27: 馬番を押すと馬名ポップアップ（#pop-N）が開くようにした。
// それまでは名前が出るだけの札で、脚質マップから中身を見る手が無かった。
// span → button に変えただけで、見た目は変えていない（.pz の指定をそのまま当てる）。
function paceHorsePiece(h, isMainNige) {
  const cls = `pz${h.bet_mark === '地雷' ? ' jirai' : ''}${isMainNige ? ' nige' : ''}`;
  return `<button type="button" class="${cls}" data-pop="${h.number}" title="${escapeHtml(h.name)}">`
    + `${umaBox(h.number, h.gate, 'sm')}`
    + `<span class="mk ${markNameClass(h.ability_mark)}">${h.ability_mark || ''}</span></button>`;
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
    <div class="pmlegend">枠線は
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

// 狙い（末脚順）: 旧3ブロック表示（renderScenarioLegacy20）専用。
// 6マス表示は「この展開で伸びる馬」と各マスの馬番で同じ馬を出しており重複するため、
// そちらからは外した（2026-08-01 ユーザー判断）。旧3ブロック表示はここにしか馬名が
// 出ないので残す。scenario.main.favorites 自体は93-spec §5で維持。
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
    確率は目安で「この展開になります」の断定ではありません</div>${basisNote}`;
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
  let hasPassTime = false;
  const blocksHtml = blocks.map(({ key, cls }) => {
    const s = p.scenario[key];
    if (!s) return '';
    // 93-spec 以降、シナリオ名（title）はペース区分だけを表し、決着型は side_label に分かれた。
    // titleだけ出すと「ハイ」の前残りマスと差し・追込マスが同じ名前になり、3本中2本が
    // 見分けられなくなる（2026-08-01 修正）。side_label が無い旧公開分は title のみのまま。
    const nameText = s.side_label ? `${s.title} × ${s.side_label}` : s.title;
    const pctHtml = `<span class="p">${Math.round(s.prob * 100)}%</span>`;
    let passTimeHtml = '';
    if (key !== 'other' && s.pass_time && s.pass_time.label) {
      hasPassTime = true;
      passTimeHtml = `<span class="passtime">${escapeHtml(s.pass_time.label)}</span>`;
    }
    return `<div class="scn${cls}"><div class="hd">${roleBadgeHtml(s.display_role)}${escapeHtml(nameText)}${pctHtml}${passTimeHtml}</div></div>`;
  }).join('');
  const passTimeNoteHtml = hasPassTime
    ? '<div class="foldnote">過去の同コースの実績から出した目安。誤差はおおむね±1秒（実測で76%が±1秒以内）。</div>'
    : '';

  return `<div class="subh">展開シナリオ（本命＋対抗）</div>${blocksHtml}${passTimeNoteHtml}${renderScenarioFavorites20(p, byNumberOv)}`;
}

/* ══════════════════════════════════════════════════════════════════
   展開タブ 作り直し（docs/keiba-log-design/108-tenkai-tab-redesign-spec.md）
   2026-08-05。判定を全場共通のしきい値ではなく **実測の表** から引く形にした。
   表は publish が引いて site.prediction.display に載せている（108-spec §9）。
   display が無い（＝旧データの）レースは、下の各関数が null を返して
   renderOverview20 が旧ブロックへ落ちる。
   ══════════════════════════════════════════════════════════════════ */

const PACE_LABEL_108 = { S: 'スロー', M: '平均', H: 'ハイ' };
const PACE_SUB_108 = { S: '上がり勝負', M: '一定ペース', H: '前半飛ばす消耗戦' };
const TOP_PACE_108 = 2;          // §8.1 上位いくつのペースをマスにするか

// §3 コースの形（C案・mockup-79）─────────────────────────────
// 楕円の中心線は rect(25,26,286,106,rx=53)。下の直線＝ホームストレッチ。
// 直線部は x=78〜258 ／ 上辺 y=26 ／ 下辺 y=132。
//
// **回りで左右が入れ替わる。** 右回り＝ホームストレッチを右→左に走るので4角は右端、
// 左回り＝左→右なので4角は左端。進行順は必ず 4角 → スタート → ゴール → 1角。
// 2026-08-05 まで4角を右端に固定しており、左回り7コース（新潟・東京・中京／33距離）で
// 図が左右反転していた。
const CS_XL = 78, CS_XR = 258;
const CS_CY = 79, CS_R = 53;            // 楕円の中心の高さと、両端の半円の半径
const CS_ARC = Math.PI * CS_R;          // 半円1つぶんの描画長（≒166.5）
const CS_STRAIGHT_U = CS_XR - CS_XL;    // 直線区間1本ぶんの描画長（180）

function courseLayout(g) {
  const right = g.direction === '右';
  const xC4 = right ? CS_XR : CS_XL;      // 最終コーナーの出口
  const xC1 = right ? CS_XL : CS_XR;      // 1コーナーの入口
  const sgn = right ? -1 : 1;             // ホームストレッチの進行方向（xの増減）
  const lap = g.lap_m, straight = g.straight_m;
  // ゴール〜スタートの公開値は無い。走る距離 − 1周 で出す
  const over = g.distance - lap * Math.floor(g.distance / lap);
  const goalToC1 = g.to_c1_m ? Math.max(g.to_c1_m - over, 5) : straight * 0.08;
  const span = straight + goalToC1;       // 直線区間1本ぶん（ゴールの前後を合わせた長さ）
  const ppm = CS_STRAIGHT_U / span;
  const xGoal = xC4 + sgn * straight * ppm;
  return { right, sgn, xC4, xC1, xGoal, ppm, span,
           over, curve: (lap - span * 2) / 2 };
}

// ゴールから **走ってきた方向へ距離 d だけさかのぼった点** を返す。
// スタートはホームストレッチ上にあるとは限らない（105距離のうち78距離は
// コーナーか向正面から出る）。楕円1周のどこにでも置けるようにする。
// 返すのは中心線上の点と、そこでの外向きの法線。
function courseWalkBack(g, L, d) {
  if (!(L.curve > 0) || d < 0) return null;
  // ① ホームストレッチのゴール〜4角
  if (d <= g.straight_m) {
    return { x: L.xGoal - L.sgn * d * L.ppm, y: 132, nx: 0, ny: 1 };
  }
  let r = d - g.straight_m;
  // ② 4角のあるコーナー（半円）。4角の側の端から、上の直線へ向かって回る
  if (r <= L.curve) {
    const t = Math.PI * (r / L.curve);
    const sx = L.right ? 1 : -1;          // 右回りは右の半円、左回りは左の半円
    const nx = sx * Math.sin(t), ny = Math.cos(t);
    return { x: L.xC4 + CS_R * nx, y: CS_CY + CS_R * ny, nx, ny };
  }
  r -= L.curve;
  // ③ 向正面（上の直線）。**上の直線はホームストレッチと逆向きに走る**ので、
  //    さかのぼる向き（x の増減）はホームストレッチと同じ sgn になる
  if (r <= L.span) {
    return { x: L.xC4 + L.sgn * r * L.ppm, y: 26, nx: 0, ny: -1 };
  }
  r -= L.span;
  // ④ 1〜2角のあるコーナー。ここまで戻るのは1周を大きく超える距離だけ
  if (r <= L.curve) {
    const t = Math.PI * (r / L.curve);
    const sx = L.right ? -1 : 1;
    const nx = sx * Math.sin(t), ny = -Math.cos(t);
    return { x: L.xC1 + CS_R * nx, y: CS_CY + CS_R * ny, nx, ny };
  }
  return null;
}

const CS_DEFS = '<defs><marker id="a108" markerWidth="7" markerHeight="7" refX="6"'
  + ' refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 z" fill="#5C5C5C"/></marker></defs>';

function courseShapeSvg(g, innerTone, outerTone) {
  if (g.straight_only) {
    // 新潟芝1000mのような直線競走。コーナーが無いので楕円では描けない
    return `<svg class="tk2" viewBox="0 0 336 84" role="img"
      aria-label="${escapeHtml(g.distance)}mの直線競走。コーナーなし。">
      <rect x="24" y="40" width="288" height="22" rx="3" fill="#E6E6E2"/>
      <rect x="309.75" y="36" width="2.5" height="30" class="tk gl"/>
      <rect x="23.75" y="36" width="2.5" height="30" class="tk st"/>
      <text x="27" y="31" class="tkl st">スタート</text>
      <text x="309" y="31" class="tkl gl">ゴール</text>
      <path d="M150 51 L186 51" class="arw2" marker-end="url(#a108)"/>
      <text x="168" y="79" class="c2">コーナーなし・${g.distance.toLocaleString()}m 一直線</text>
      ${CS_DEFS}
    </svg>`;
  }
  const L = courseLayout(g);
  // 目盛りはコース上のどこにでも置けるように、点と法線から引く。
  // 線は中心線をまたいで外へ14・内へ14、ラベルはさらに内側（インフィールド側）へ
  const mark = (p, label, cls, lab) => {
    if (!p) return '';
    const len = 14;
    return `<path d="M${(p.x - p.nx * len).toFixed(1)} ${(p.y - p.ny * len).toFixed(1)}`
      + ` L${(p.x + p.nx * len).toFixed(1)} ${(p.y + p.ny * len).toFixed(1)}"`
      + ` class="tkm ${cls}"/>`
      + `<text x="${(p.x - p.nx * lab).toFixed(1)}" y="${(p.y - p.ny * lab + 3.4).toFixed(1)}"`
      + ` class="tkl ${cls}">${label}</text>`;
  };
  const pGoal = { x: L.xGoal, y: 132, nx: 0, ny: 1 };
  const pStart = courseWalkBack(g, L, L.over);
  // 走る距離が1周をわずかに下回る4距離（東京芝2000m など）では、スタートがゴールの
  // すぐ隣に来てラベルが重なる。そのときだけスタートを1段内側へ下げる
  let startLab = 20;
  if (pStart) {
    const dx = (pStart.x - pStart.nx * 20) - pGoal.x;
    const dy = (pStart.y - pStart.ny * 20) - (pGoal.y - 20);
    if (Math.abs(dx) < 40 && Math.abs(dy) < 12) startLab = 36;
  }
  // 回りは上辺と下辺の2本の矢印で示す。1本だけだと読み違える
  const arrows = L.right
    ? '<path d="M150 26 L186 26" class="arw2" marker-end="url(#a108)"/>'
      + '<path d="M186 132 L150 132" class="arw2" marker-end="url(#a108)"/>'
    : '<path d="M186 26 L150 26" class="arw2" marker-end="url(#a108)"/>'
      + '<path d="M150 132 L186 132" class="arw2" marker-end="url(#a108)"/>';
  // 4角のラベルは**コースの外側**（直線の端の真下）に置く。ゴールとスタートのラベルは
  // 内側（インフィールド側）なので、トラックをはさんで反対になり、
  // スタートが4角のすぐ近くのコーナーから出る距離でも重ならない。
  return `<svg class="tk2" viewBox="0 0 336 158" role="img"
      aria-label="${escapeHtml(g.distance)}mの俯瞰図。${escapeHtml(g.direction)}回り。">
      <rect x="18.5" y="19.5" width="299" height="119" rx="59.5" fill="none"
        stroke="${outerTone}" stroke-width="13"/>
      <rect x="31.5" y="32.5" width="273" height="93" rx="46.5" fill="none"
        stroke="${innerTone}" stroke-width="13"/>
      <rect x="25" y="26" width="286" height="106" rx="53" fill="none" stroke="#fff" stroke-width="1"/>
      ${arrows}
      <text x="${L.xC4}" y="155.4" class="tkl cn">4角</text>
      ${mark(pGoal, 'ゴール', 'gl', 20)}
      ${mark(pStart, 'スタート', 'st', startLab)}
      <text x="168" y="86" class="lp">${escapeHtml(g.direction)}回り</text>
      ${CS_DEFS}
    </svg>`;
}

// 帯の色は枠順成績。1.00 が標準で、離れるほど濃い（.strip の色分けと同じ考え）
const GATE_TONE_108 = { b1: '#CBE5D6', b2: '#E3F0E7', b3: '#EDEDEA', b4: '#F7DEDE', b5: '#F0C9C9' };
const CS_NEUTRAL = '#E6E6E2';

// このレースの距離を、分かっている区間の実長比で横に展開する。
// スタート〜1角 と 最後の直線 は実測値。あいだは引き算で出るので、3区間とも本当の長さで置ける。
//
// **帯の中には文字を入れない。** 1区間目は距離の 5.0%（東京芝2000m）まで細くなり、
// そこには「1角まで」も「100m」も入らないため。区間名と距離は下のチップへ回し、
// 色で帯と対応させる。こうすると帯の幅に文字が縛られない。
const CS_SEGS = [['1角まで', 'sa'], ['コーナーと向正面', 'sb'], ['最後の直線', 'sc']];

function courseSegs(g) {
  if (g.straight_only || !g.to_c1_m) return null;
  const mid = g.distance - g.to_c1_m - g.straight_m;
  if (!(mid > 0)) return null;
  return [g.to_c1_m, mid, g.straight_m];
}

// 帯の中に文字を置けるかは幅で決まる。名前(8.5px)と距離(12px太字)を2段で置くには
// 46px ほど要る。375px の端末で帯に使えるのは 331px なので、区間が全体の 13.9% 以上あれば入る。
// 入らない区間は帯の下に色見本つきで出す（全105距離のうち26距離で1区間だけ出る）。
const CS_BAR_PX = 331, CS_FIT_PX = 46;

function courseDistBar(g) {
  const v = courseSegs(g);
  if (!v) return '';
  const tot = v[0] + v[1] + v[2];
  const txt = [`${Math.round(v[0]).toLocaleString()}m`,
               `${Math.round(v[1]).toLocaleString()}m`,
               `${g.straight_m.toFixed(1)}m`];
  const fits = v.map((m) => m / tot * CS_BAR_PX >= CS_FIT_PX);
  const cells = v.map((m, i) => {
    const inner = fits[i]
      ? `<span class="sl">${escapeHtml(CS_SEGS[i][0])}</span><span class="sv">${txt[i]}</span>`
      : '';
    return `<div class="sg ${CS_SEGS[i][1]}" style="flex:${(m / tot).toFixed(4)}">${inner}</div>`;
  }).join('');
  // 帯に入らなかった区間だけ、下に色見本つきで出す。全部入れば行ごと消える
  const rest = CS_SEGS.map(([name, cls], i) => (fits[i] ? '' :
    `<span class="dl ${cls}"><i></i>${escapeHtml(name)}<b>${txt[i]}</b></span>`)).join('');
  return `<div class="dwrap"><div class="dbar" role="img"
    aria-label="${g.distance}mの内訳。1角まで約${Math.round(g.to_c1_m)}m、
    コーナーと向正面 約${Math.round(v[1])}m、最後の直線${g.straight_m.toFixed(1)}m。">${cells}</div>`
    + (rest ? `<div class="dlgd">${rest}</div>` : '') + '</div>';
}

function renderCourseShape20(site) {
  const g = (site.prediction.display || {}).course;
  if (!g) return '';
  // 帯は枠順成績（内=1〜4枠の平均 / 外=5〜8枠の平均）。無ければ無彩色
  const gates = (site.prediction.inner_outer_bias || {}).gates || [];
  const avg = (list) => {
    const v = list.filter((x) => x.ratio != null).map((x) => x.ratio);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const iv = avg(gates.filter((x) => x.gate <= 4));
  const ov = avg(gates.filter((x) => x.gate >= 5));
  const innerTone = iv != null ? GATE_TONE_108[ratioClass(iv)] : CS_NEUTRAL;
  const outerTone = ov != null ? GATE_TONE_108[ratioClass(ov)] : CS_NEUTRAL;

  // 図の上に出していた「平均ペース 1000m通過 約35.2秒」は 2026-08-27 に削除した。
  // 同じ話を下の「脚質と展開」のペース2行が持っている（平均 一定ペース 600m通過 約35.2秒 72%）。
  // あちらは2つのペースと確率まで出すので、こちらは重複していた。

  // 帯のすぐ下に帯の凡例（3区間）が来るように並べる。枠の内外はそのあと
  const chips = [];
  if (g.straight_only) {
    chips.push(['コース', '直線競走・コーナーなし', '']);
    chips.push(['距離', `${g.distance.toLocaleString()}m`, '']);
  } else {
    // 3区間は距離バーの凡例に出ている。帯を出せないときだけチップで補う
    if (!courseSegs(g)) {
      chips.push(['直線', `${g.straight_m.toFixed(1)}m`, '']);
      if (g.to_c1_m) chips.push(['スタート〜1角', `約${Math.round(g.to_c1_m)}m`, '']);
    }
  }
  // 内めの枠・外めの枠・高低差は 2026-08-27 に下の1本バー（renderCourseBabaBar20）へ移した。
  // 「1周」と「回り」は同日に削除した。1周の距離はこのレースの走る距離と
  // 別物で判断に使わず、回りは上のコース図の矢印が既に示している。
  const chipHtml = chips.map(([k, v, cls]) =>
    `<span class="gc ${cls}"><span class="k">${escapeHtml(k)}</span>${escapeHtml(v)}</span>`).join('');
  return `<div class="subh">コースの形</div>`
    + courseShapeSvg(g, innerTone, outerTone)
    + courseDistBar(g)
    + (chipHtml ? `<div class="geochips">${chipHtml}</div>` : '')
    + renderCourseBabaBar20(site, g, iv, ov);
}

// コースの形と馬場を1本にまとめた横バー（144-spec / 2026-08-27）。
//
// それまでは灰色のチップ3つ（内めの枠・外めの枠・高低差）と、
// 左に紺の線が入った青い枠（今日の馬場・勝ちタイム）に分かれていた。
// 地の色も枠の作りも違うので2つのかたまりに見えていた。
//
// 内めの枠0.80・外めの枠1.21という倍率をそのまま出すのはやめ、
// 内と外のどちらへ傾いているかをシーソーで出す（144-spec 案B）。
// すぐ下の発馬機マップが1枠D〜8枠Sの等級を出しているので、
// ここで同じ等級を出すと同じ話が3か所に並ぶため、言い方を変えてある。

// 傾きの段。外めの枠 − 内めの枠 の差で切る。
// ±0.05 は「差と呼べない幅」の線、±0.15 は「はっきり差がある」の線。
// どちらも数字で置いた目安で、守りたいのは**言葉と傾きが食い違わないこと**。
// 公開済み208レースで数えると、この切り方なら食い違いは0件。
// 全レースを5等分する切り方（-0.092/+0.058/+0.145/+0.203）だと段ごとの数はそろうが、
// 差が+0.10あるのに「互角」と出るなど55件が食い違ったので捨てた。
// 段ごとの数のそろいと食い違いが衝突したら、**そろいのほうを捨てる**。
const TILT_CUTS = [-0.15, -0.05, 0.05, 0.15];
const TILT_WORDS = ['内が有利', 'やや内', '互角', 'やや外', '外が有利'];
const TILT_CLS = ['t2', 't1', 't0', 'u1', 'u2'];
// シーソーの傾きは差そのものを写す。0.30以上は端で止める（それ以上傾けても読めない）
const TILT_FULL = 0.30;

function renderCourseBabaBar20(site, g, iv, ov) {
  const cells = [];

  // (1) 枠の有利
  if (iv != null && ov != null) {
    const d = ov - iv;
    let k = 0;
    for (let i = 0; i < TILT_CUTS.length; i += 1) if (d >= TILT_CUTS[i]) k = i + 1;
    const pull = Math.max(-1, Math.min(1, d / TILT_FULL)) * 40;   // 中心からの寄り（%）
    const L = (50 - pull).toFixed(1);
    cells.push(`<div class="cell"><span class="k">枠の有利</span>`
      + `<span class="ss"><span class="bar"><i class="L" style="width:${L}%"></i>`
      + `<i class="R" style="width:${(100 - Number(L)).toFixed(1)}%"></i><u></u></span>`
      + `<span class="ends"><b>内</b><b>外</b></span></span>`
      + `<span class="w ${TILT_CLS[k]}">${TILT_WORDS[k]}</span></div>`);
  }

  // (2) 高低差
  if (!g.straight_only && g.rise_m != null) {
    cells.push(`<div class="cell"><span class="k">高低差</span>`
      + `<span class="v">${g.rise_m}<small>m</small></span>`
      + `<span class="w">${escapeHtml(g.flat_label || '')}</span></div>`);
  }

  // (3) 今日の馬場 ＋ (4)(5) 実測の見込み。元データは prediction.baba_detail。
  const p = site.prediction;
  const bd = p.baba_detail || {};
  const disp = (p.display || {}).baba;
  const isTurf = String(site.race.surface || '').startsWith('芝');
  const src = (isTurf ? bd.cushion_detail : bd.moisture_detail) || {};
  const lv = src.level;
  const norm = isTurf ? src.normal : null;
  const delta = isTurf ? (norm || {}).delta : src.normal_delta;
  if (lv && delta != null) {
    const sign = `${delta > 0 ? '+' : ''}${Number(delta).toFixed(1)}`;
    // 仮柵は「今日の馬場」のマスの先頭に入れる（2026-08-27・ユーザー決定）。
    // それまでは下に青い枠を作って1行だけ置いていたが、クッション値を消したことで
    // 枠の中身が1行だけになり浮いていた。マスを6つに増やすと 351px を分け合う関係で
    // 1マスが63px→53pxになり、高低差・今日の馬場・上がり3F・仮柵の4つで
    // 文字が2行に折り返す（実測。バーは69px→82px）。5マスのままにする理由はそれ。
    const rail = bd.rail;
    const railHtml = rail && rail.course
      ? `<span class="rl">${escapeHtml(rail.course)}`
        + (rail.weeks ? `・${rail.weeks}週目` : '') + '</span>'
      : '';
    cells.push(`<div class="cell wide"><span class="k">今日の馬場</span>${railHtml}`
      + `<span class="lv ${lv.cls || 'z0'}">${escapeHtml(lv.label)}</span>`
      + `<span class="w">${escapeHtml(site.race.track)}の平年より ${sign}</span></div>`);
  }
  if (disp) {
    // 上がり3F（勝ち馬のゴール前3ハロン）のマスは 2026-08-27 に削除した。
    // 出るのは公開済み215レース中111レースだけで、出る日と出ない日でマスの数が
    // 5つ・4つと変わっていた。勝ちタイムと同じ display.baba の値で、
    // どちらも「この馬場だと時計がどう出るか」の話。マスは常に4つにする。
    cells.push(babaOutlookCell('勝ちタイム', disp.time));
  }

  if (cells.length < 2) return '';
  return `<div class="cbbar">${cells.join('')}</div>`;
}

// 1本バーの中の「勝ちタイム」。上がり3F用の分岐は 2026-08-27 にマスごと消えた。
// ±0.05秒は「差と呼べない幅」の線。守りたいのは差でないものを差と言わないことで、
// 帯の刻みが変わってここが真ん中でなくなったら、この数字のほうを引き直す。
function babaOutlookCell(title, v) {
  let val = '—', word = '—', cls = 'z0';
  if (v != null) {
    if (Math.abs(v) < 0.05) { val = '±0.0'; word = '基準どおり'; }
    else {
      val = Math.abs(v).toFixed(2);
      const fast = v < 0;
      word = fast ? '速い' : '時計がかかる';
      cls = fast ? 'p1' : 'm1';
    }
  }
  return `<div class="cell ${cls}"><span class="k">${escapeHtml(title)}</span>`
    + `<span class="v">${escapeHtml(val)}<small>秒</small></span>`
    + `<span class="w">${escapeHtml(word)}</span></div>`;
}

// §4 馬場 ────────────────────────────────────────────────
// babaOutlookTile は 2026-08-27 に削除した。「この馬場だと、こうなりやすい」の枠ごと
// 1本バーへ移り、呼ぶ所が無くなったため。文言は babaOutlookCell が引き継いでいる。
// 今週の馬場（3マスの1本バー。2026-08-27 に3枚のカードから差し替え・146-spec 案1）
//
// 上の renderCourseBabaBar20 が「このコースの過去の平均」、こちらが
// 「今週この競馬場で終わったレース」。対になっているので同じ作りで並べる。
// 2026-08-26 までは白い角丸カード3枚で、枠の作りも文字の大きさも上と違っていた。
//
// 元の値の出どころ（変えていない）:
//   内と外  … day_bias.surfaces[馬場] の3着以内率。2026-07-27 に「同じ日の別の競馬場を
//             予測子にするとゼロになる＝競馬場ごとの現象」と確認済み。ただし採点には入れない。
//   前と後ろ… day_bias.legs。3着以内に入った馬を1頭ずつ最終コーナーの位置で振り分けた頭数。
//             2026-08-26 追加で、通過順を集め始めたのが同日のため今週末から出る。
//   時計    … time_trend。勝ちタイムから出す別系統で、内外の偏りより持続がはっきりしている
//             （同じ開催の連続日で相関+0.406 ／ その日の前半→後半で+0.512）。

// 内と外のシーソーが端に届く差（内%−外%）。公開済み46件のうち20ptを超えるのは2件だけ。
// 守りたいのは「ふだんの範囲が真ん中あたりに見えること」。
// 端に張り付く回が増えたらこの数字のほうを広げる。
const WK_IO_FULL = 20;

function seesawHtml(leftPct, tickPct, ends, cls) {
  const L = Math.max(0, Math.min(100, leftPct));
  return `<span class="ss${cls ? ' ' + cls : ''}"><span class="bar">`
    + `<i class="L" style="width:${L.toFixed(1)}%"></i>`
    + `<i class="R" style="width:${(100 - L).toFixed(1)}%"></i>`
    + `<u style="left:${tickPct}%"></u></span>`
    + `<span class="ends"><b>${ends[0]}</b><b>${ends[1]}</b></span></span>`;
}

function renderWeekTrend20(site) {
  const p = site.prediction;
  const db = p.day_bias;
  const tt = p.time_trend;
  if (!db && !tt) return '';
  // そのレースと同じ馬場だけ見る。新しいデータは day_bias.surface が入っており集計時点で
  // 絞ってある。2026-08-26 より前に公開したぶんは芝とダートの両方が入っているので、
  // ここでそのレースの馬場を選ぶ（作り直しはしない）。
  const raceSurf = String((site.race || {}).surface || '').startsWith('芝') ? '芝' : 'ダート';
  const io = db && db.surfaces ? (db.surfaces[raceSurf] || null) : null;
  const legs = (db && db.legs) || null;
  if (!io && !legs && !tt) return '';

  const cells = [];
  if (io) {
    const L = 50 + Math.max(-1, Math.min(1, io.diff / WK_IO_FULL)) * 40;
    const cls = io.label === '大きな偏りなし' ? 't0' : (io.diff >= 0 ? 't1' : 'u1');
    cells.push(`<div class="cell"><span class="k">内と外</span>`
      + seesawHtml(L, 50, ['内', '外'])
      + `<span class="w ${cls}">${escapeHtml(io.label)}</span>`
      + `<span class="n">内${io.inner_pct.toFixed(1)} 外${io.outer_pct.toFixed(1)}</span></div>`);
  }
  if (legs) {
    // 白い目盛りは50%ではなく平年値（前62.2%）に置く。前と後ろは半々が中立ではないため。
    const base = legs.base_pct != null ? legs.base_pct : 62.2;
    const word = legs.label || `前${legs.front_pct.toFixed(0)}%`;
    const cls = !legs.label || legs.label === '大きな偏りなし'
      ? 't0' : (legs.label === '前が残りやすい' ? 't1' : 'u1');
    const miss = legs.no_data_races ? `・${legs.no_data_races}R除外` : '';
    cells.push(`<div class="cell"><span class="k">前と後ろ</span>`
      + seesawHtml(legs.front_pct, base, ['前', '後ろ'], 'zg')
      + `<span class="w ${cls}">${escapeHtml(word)}</span>`
      + `<span class="n">前${legs.front} 後ろ${legs.rear}頭${miss}</span></div>`);
  }
  if (tt) {
    const cls = tt.value <= 0 ? 'p1' : '';
    const n = (tt.today_races || 0) + (tt.prev_races || 0);
    cells.push(`<div class="cell ${cls}"><span class="k">時計</span>`
      + `<span class="v">${tt.value >= 0 ? '+' : ''}${tt.value.toFixed(2)}<small>秒</small></span>`
      + `<span class="w">${escapeHtml(tt.label)}</span>`
      + `<span class="n">${n}レース</span></div>`);
  }
  if (!cells.length) return '';

  // 見出しの母数。3レースで出た偏りと14レースで出た偏りは重みが違うので必ず添える。
  let scope = '';
  if (db && db.n_races) {
    scope = db.prev_races
      ? `${raceSurf}・${db.n_races}レース（前日まで${db.prev_races}＋本日${db.today_races}）`
      : `${raceSurf}・本日${db.n_races}レース`;
  } else if (io) {
    scope = `${raceSurf}・${io.n_races}レース`;
  }
  return `<div class="wkhead"><b>今週の馬場</b>`
    + (scope ? `<span class="sc">${escapeHtml(scope)}</span>` : '') + '</div>'
    + `<div class="cbbar wk">${cells.join('')}</div>`;
}

// renderBaba20 は 2026-09-02 に削除した。呼ぶ所が無くなったため。中身の行き先は次のとおり。
//   今日の馬場・平年との差・時計の一言 → 1本バー（renderCourseBabaBar20）
//   勝ちタイム・上がり3F             → 同じく1本バー
//   含水率の生の値・クッション値・目盛り → 削除（バーの1行が同じ話を読み下している）
//   仮柵                             → 1本バーの「今日の馬場」のマスの先頭

// §5 脚質 ────────────────────────────────────────────────
// 判定の文言（2026-08-06）。旧「効きにくい／効く」は、そのコースでの複勝率が4脚質のうち
// 上位でも「その脚質がダメ」と読めてしまうので、何と比べて高い・低いのかを文言に入れる。
// 公開済みレースの JSON には旧文言が焼き込まれているため、保存された label ではなく
// cls（m2/m1/z0/p1/p2）から引き直す。過去のレースもこの表示になる。
const LEG_WORD = {
  m2: ['▼', '全コース平均より低い'], m1: ['▼', '全コース平均よりやや低い'],
  z0: ['＝', '全コース平均なみ'],
  p1: ['▲', '全コース平均よりやや高い'], p2: ['▲', '全コース平均より高い'],
};

// 脚質マップ（2026-08-27・案3＋案B）。4枚のカードを縦に積むのをやめ、
// 芝の地面の上に4区画を置く「地図」にした。上のタブの隊列マップと同じ向き（左が前）。
//
// 区画は**白いカードで塗らない**。塗ると芝が隠れて、コース図ではなく白いカードが
// 4枚並んだ表になる。区画の切れ目は白い破線1本だけ。芝の上に置く文字は
// 地の緑（#7FBF7F）に対して4.5以上の濃さにする（CSS側のコメントに実測値）。
//
// 真ん中の数字は「差（pt）」をやめて**等級＋このコースの複勝率**にした。
// ptは差の単位で読み手が持っている単位ではなく、しかも脚質をまたぐと意味が変わる
// （先行の+3ptは上位、追込の+3ptは真ん中）。等級は脚質ごとの境目で切ってあるので、
// 逃げのSと追込のSが同じ「上位2割」を指す。境目の正本は
// shared/keiba/leg_bias_baseline.json の grade_bands。
//
// 等級を持たない過去のレース（grade が無い）は、これまでどおり差を出す。
function renderLeg20(site) {
  const p = site.prediction;
  const disp = (p.display || {}).leg;
  if (!disp || !disp.length || !p.leg_bias) return '';
  const runners = site.horses.filter((h) => !h.scratched);
  const nige = scenarioMainNigeSet(p);
  const zones = disp.map((d) => {
    const key = PACE_STYLE_KEY[d.style];
    const hs = runners.filter((h) => h.running_style === key);
    const chips = hs.map((h) => paceHorsePiece(h, nige.has(h.number))).join('');
    // 等級があれば等級＋複勝率、無ければ従来どおり差を出す（過去の公開分の縮退）
    const val = d.grade
      ? `<div class="lgv"><span class="g g-${escapeHtml(d.grade)}">${escapeHtml(d.grade)}</span>`
        + `<span class="p">複勝 ${d.fukusho_rate}%</span></div>`
      : `<div class="lgd ${d.delta > 0.5 ? 'up' : d.delta < -0.5 ? 'dn' : ''}">`
        + `${d.delta > 0.5 ? '▲' : d.delta < -0.5 ? '▼' : '＝'}`
        + `${d.delta > 0 ? '+' : ''}${d.delta.toFixed(1)}<small>%</small></div>`;
    return `<div class="lz g-${escapeHtml(d.grade || d.cls)}">
      <span class="lb">${escapeHtml(d.style)}<span class="c">${hs.length}</span></span>
      ${val}
      <div class="hs">${chips}</div>
    </div>`;
  }).join('');
  // 上の見出し帯（.lhd）と下の説明（.lft）は 2026-08-27 に削除した。
  // コース名は画面の上（レースヘッダの基本情報4項目）に既にあり、
  // 等級の意味は札の色と S〜D の並びが持っている。
  // 先行圧とハイペース率は 2026-08-27 に見出しから消した（同日に入れて同日に外した）。
  //
  // 消した理由は当たらなかったから。公開済み214レース（8/1〜8/23・当日に保存された
  // 値だけ）で、実際にハイペースだったのは65レース（30.4%）。
  //   先行圧の表（ここに出していた47%側）… 外し具合 0.6028
  //   展開シナリオ（ハイ24%側）           … 0.4045
  //   レースを見ずに毎回30%と答えるだけ    … 0.6140
  // 先行圧の表は「毎回30%」とほとんど変わらない。1レースずつ見ても
  // 214レース中165レース（77%）で展開シナリオのほうが実際に近かった。
  // どちらのモデルかを1レースずつ入れ替えて2万回試して、これ以上の差が出たのは0回。
  //
  // ハイペースの見込みは展開シナリオのカードが持っている。ここでは出さない。
  // 元の値（front_pressure / display.front）は公開JSONに残っているので、
  // 出し直したくなったら拾える。

  // 2026-08-27: 下にあった「◀ 先頭 / 後方 ▶」を削除した。逃げ→先行→差し→追込の並び自体が
  // 前から後ろの順で、区画の名前がそれを示しているため。
  return `<div class="subh">脚質と展開</div>
    <div class="lmap">
      <div class="lfield">
        <div class="lrail"></div>
        <div class="lzones">${zones}</div>
      </div>
    </div>${renderPaceRows20(site)}`;
}

// 展開シナリオを2行に畳んだもの（2026-08-27・151-spec 案A ＋ 152-spec）。
//
// それまでは「展開シナリオ」という別ブロックに大きなカードが2枚あった。
// 1枚に ペース名・通過タイム・確率・前残りの帯・前後の馬 が入っていたが、
// **2枚のカードに出る馬は公開済み214レース全部で同じ顔ぶれ**だった
// （並び順まで同じが104レース・並び順だけ違うが110レース）。
// 馬のチップが1枚159pxのうち99pxを占めていて、そこが丸ごと重複していた。
// 馬は上の脚質マップが持っているので、ここでは出さない。
//
// 「前残り 81% ／ 差し・追込 19%」の帯も落とした（2026-08-27 ユーザー決定）。
// あれは「勝ち馬が4コーナーを先頭1/3以内で通過する確率」で、
// scenario_calib.json の実測3,353レースには
// 「実績に合わせて直しても『毎回前と答える』68.9%を大きくは超えない。
//  5段の実測も単調ではない。数字を出すなら直した値を使い、断定はしないこと」
// と書かれている。81%と71%の差10ポイントを判断に使いにくい。
// 空いたところにはペースの説明（一定ペース 等）を入れて行の両端をそろえた。
function renderPaceRows20(site) {
  const p = site.prediction;
  const grid = p.scenario_grid;
  if (!grid || !grid.cells || !grid.cells.length) return '';
  const paceProb = {};
  grid.cells.forEach((c) => { paceProb[c.code] = c.pace_prob; });
  const keep = Object.keys(paceProb).sort((a, b) => paceProb[b] - paceProb[a]).slice(0, TOP_PACE_108);
  if (!keep.length) return '';
  // 通過タイムはペースごとに違う。main/sub/other が持っているものを符号で引く
  const pts = {};
  ['main', 'sub', 'other'].forEach((key) => {
    const s = (p.scenario || {})[key] || {};
    if (s.code && s.pass_time && s.pass_time.sec != null && !pts[s.code]) pts[s.code] = s.pass_time;
  });
  const rows = keep.map((k, i) => {
    const pt = pts[k];
    return `<div class="prow${i === 0 ? ' on' : ''}">`
      + `<span class="nm">${PACE_LABEL_108[k]}</span>`
      + `<span class="sb">${PACE_SUB_108[k]}</span>`
      + (pt ? `<span class="pt">${pt.point_m}m通過 約${pt.sec}秒</span>` : '')
      + `<span class="pp">${Math.round(paceProb[k] * 100)}<small>%</small></span></div>`;
  }).join('');
  return `<div class="pwrap">${rows}</div>`;
}

// §7 逃げ候補・先行圧 ───────────────────────────────────────
// renderFront20 は 2026-08-27 に削除した。呼ぶ所が無くなったため。
// 先行圧の言葉とハイペース率は renderLeg20（脚質の見出し）が引き継いでいる。

// §8 展開シナリオ ───────────────────────────────────────────
// renderScenarioCards20 は 2026-08-27 に削除した。呼ぶ所が無くなったため。
// 中身の行き先は renderPaceRows20 のコメントを見ること。

function renderOverview20(site) {
  const r = site.race;
  const p = site.prediction;
  const sections = [];

  // (a) 108-spec §2/T3: 基本情報4行（.info1）は renderHeader20 へ移した。ここでは出さない。
  //     代わりに先頭へ「コースの形」を置く（§3）。display が無い旧データでは空文字が返る。
  sections.push(renderCourseShape20(site));

  // (b) 馬場の青い枠は 2026-09-02 に完全に削除した（ユーザー決定）。
  // 2026-08-27 に廃止したはずだったが、平年（その競馬場のいつもの含水率）を出せない
  // レースだけ旧ブロックへ落ちて生き残っていた。実測で 8/1〜8/30 の29レースが該当
  // （札幌・中京のダート稍重など。同じ競馬場・同じ馬場状態の過去測定が20日に満たない日）。
  // 中身の行き先は renderCourseBabaBar20 の (3) を見ること。平年が出ない日は
  // 1本バーの「今日の馬場」のマスも出ないので、その日は馬場の行が1本も出ない。

  // (b-2) 今週の馬場。上の1本バーが「このコースの過去の平均」で、こちらが「今週の実測」。
  // 対になっているので隣に置く（2026-08-27 に枠順マップの下から移動）。
  sections.push(renderWeekTrend20(site));

  // (c) 内外バイアス → 発馬機のマップ（2026-08-27）
  //
  // 2026-08-27 に脚質より前へ移した（ユーザー決定）。上のコースの形にある
  // 「枠の有利」のシーソーと同じ話を8つの枠に割ったものなので、間に脚質をはさまない。
  //
  // 8つの数字を横に並べるだけだったのを、**発馬機（ゲート）の絵**に置き換えた。
  // 「枠」という言葉そのものの絵なので、何の並びかを説明なしで示せる。
  //
  // 脚質マップ（芝の地面・左が前）とは背景を分けている。脚質は走る向きの話、
  // 枠順は幅の話で軸が違うのに、同じ緑を敷くと2つの地図が読み分けられないため。
  //
  // 数字（0.86 など）は出さない。中身は「その枠の複勝率 ÷ コースの全枠平均」の倍率で、
  // 単位が無く読み手の単位ではない。等級（S〜D）に置き換えた。刻みは
  // 全国106コース×8枠のうち走数100以上の603件を5等分して決めてある（GATE_CUTS）。
  // 脚質と違って枠は8つとも同じ「1頭あたりの複勝率」なので、共通の刻み1本で足りる。
  //
  // 馬番は置かない（2026-08-27 ユーザー決定）。どの馬がどの枠かは出馬表そのものが持つ。
  if (p.inner_outer_bias) {
    const cellsHtml = p.inner_outer_bias.gates.map((g) => {
      // ratio が null の枠＝コースの走数不足で比率を出せない枠。セルごと消すと
      // 「枠順が全部出ていない」ように見えるので、'—' のまま並べる
      const grade = gateGrade(g.ratio);
      return `<div class="gz${grade ? ` g-${grade}` : ' nd'}"${
        grade ? '' : ' title="このコースの走数が足りず判定できません"'}>
        ${wakuBox(g.gate, 'sm')}
        <div><span class="g">${grade || '—'}</span></div>
      </div>`;
    }).join('');
    // 内回り／外回りが混在するコース（京都芝1600/1400・新潟芝2000）では、どちらの
    // 数字を見ているのかを出す。混在しないコースでは scope が無く、何も足さない。
    const scopeHtml = p.inner_outer_bias.scope
      ? `<span class="scope">${escapeHtml(p.inner_outer_bias.scope)}の成績</span>` : '';
    // 2026-08-27: 見出しの色をコースの形・脚質と展開にそろえた（.biaslabel → .subh）。
    // 同日、下にあった「◀ 内 / 外 ▶」も削除した。1枠から8枠へ並んでいる絵で、
    // 発馬機の形そのものが内から外の順を示しているため。
    // 「外枠有利」の言葉は同日に削除。8つの枠の等級（S〜D）が同じことを示していて、
    // 内外の傾きは上のコースの形の「枠の有利」のシーソーにも出ているため。
    sections.push(`
      <div class="subh">このコースの枠順成績${scopeHtml}</div>
      <div class="gmap">
        <div class="gbar"></div>
        <div class="gzones">${cellsHtml}</div>
      </div>
    `);
  }

  // (d) 脚質傾向（コース別実績の内訳）＋ 脚質マップ（各脚質に出走馬を並べる）
  // 2026-07-27: マップ→傾向 だった並びを逆にした。先にこのコースの傾向を見て、
  // そのあと出走馬がどの脚質に入っているかを見る流れにする。
  // 108-spec §5/T6: 傾向の表と脚質マップを1ブロックに統合し、判定を全コース平均との差に。
  // display が無ければ下の旧2ブロックへ落ちる。
  const leg108 = renderLeg20(site);
  if (leg108) {
    sections.push(leg108);
  } else if (p.leg_bias && p.leg_bias.length) {
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
    `);

    sections.push(renderPaceMap20(site));
  }

  // (d-2) 今週の馬場は 2026-08-27 にコースの形の直後へ移した（renderWeekTrend20）。
  // 上の1本バーが「このコースの過去の平均」、こちらが「今週ここで終わったレース」で
  // 対になっているため、離して置く理由が無かった。

  // (e) 「逃げ候補・先行圧」のブロックは 2026-08-27 に廃止した。
  // 中身の行き先は次のとおり。
  //   先行圧の言葉・ハイペース率 → 脚質の見出しの右（renderLeg20）
  //   10段のゲージ・目盛り       → 削除。先行圧の順位とハイペース率の順位は
  //                               +0.948でほぼ同じ並びで、率だけで足りる
  //   主逃げ・先行の馬番         → 削除。脚質マップの逃げ・先行の区画と75%重なり、
  //                               主逃げはマップでオレンジ枠が付いている
  // 旧データ用の表（馬名・分類・先行率）も一緒に落とした。

  // (f) 「展開シナリオ」の独立ブロックは 2026-08-27 に廃止した。
  // ペース2つの名前・説明・通過タイム・確率は脚質のブロックへ移した（renderPaceRows20）。
  // 前後の馬と前残りの帯は落とした。理由は renderPaceRows20 のコメントに書いてある。
  //
  // 脚質のブロックが出せない旧データ（display.leg が無いぶん）だけ、
  // 従来どおり6マスか旧3ブロックへ落とす。
  if (!renderLeg20(site)) {
    if (p.scenario_grid && p.scenario_grid.cells && p.scenario_grid.cells.length === 6) {
      sections.push(renderScenarioGrid20(site));
    } else if (p.scenario) {
      sections.push(renderScenarioLegacy20(site));
    }
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
  // 穴は地雷と逆向きで、3着以内に来たら成功（94-spec §3.1）
  const anaEntries = Object.entries(verification.ana_result || {});
  const anaOk = anaEntries.filter(([, ar]) => ar.ok).length;

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
      `${e.finish}着`, h && foPop(h) ? `${foPop(h)}人気` : '', e.finish <= 3, true);
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

  const anaRows = anaEntries.map(([number, ar]) => {
    const h = byNumber[number];
    return vrow(`<span class="jm ${ar.ok ? 'ok' : 'ng'}">穴</span>`
      + `${umaBox(Number(number), h && h.gate, 'sm')}<span class="nm">${h ? escapeHtml(h.name) : '—'}</span>`,
      ar.finish != null ? `${ar.finish}着` : '—', ar.ok ? '激走成功' : '判定ミス', ar.ok, true);
  }).join('');
  const anaGroup = anaEntries.length
    ? `<div class="vgh">穴 → 着順<span class="s">（${anaOk}/${anaEntries.length} 成功）</span></div><div class="g-ana">${anaRows}</div>`
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
      ${anaGroup}
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
  let site, oddsAll, bands;
  try {
    [site, oddsAll, bands] = await Promise.all([
      getData(`data/races/${id}.json`),
      getData(`data/odds/${id}.json`).catch(() => null),
      // 132-spec: 荒れ度の「その通りに決まった率」と100万超えの段。1KB程度。
      // 取れなくてもレースは出す（率の行だけ消える）
      getData('data/upset_bands.json').catch(() => null),
    ]);
  } catch (e) {
    renderError(`レースデータの読み込みに失敗しました: ${e.message}`);
    return;
  }
  BANDS = (bands && bands.schema_version === 'keiba-log-bands-1.0') ? bands : null;

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
  if (is20) setupShutuba20(site);
  if (is20) setupTopping(site);   // 102-spec: トッピング（データが無ければ何もしない）
  if (is20) setupUpset20();
  // 109-spec T6: コースタブのクリック配線（読み込み自体はタブが最初に開かれた時・setupTabs20内）
  if (is20 && site.course_entities && window.CourseTab) window.CourseTab.setup(site);
  setupFinishOrder();
  // タブ化は必ず最後。ここまでは全パネルが表示されたまま（.tabs-ready が付くまで
  // CSS が display:none にしない）なので、setupFinishOrder の幅実測が正しい幅で走る。
  if (is20) setupTabs20(site);
}

main();

})();

/* ============================================================
   102-spec: トッピング（19軸の単体 ＋ 掛け合わせ条件）
   既存38関数は1文字も変更しない。ここから下は追加のみ。
   データは horses[].topping（keiba_topping_apply.py が公開時に埋める）。
   ============================================================ */
// cross（掛け合わせ条件）は既定で外す。開いた直後は「なにも乗せていない」＝今までの出馬表と同じ
const TP = { sel: new Set(), cross: false, open: false, site: null };

function tpOn(site) {
  return !!(site && site.topping_meta && (site.horses || []).some((h) => h.topping));
}
function tpJp(key) {
  const a = ((TP.site && TP.site.topping_meta && TP.site.topping_meta.axes) || [])
    .find((x) => x.key === key);
  return a ? a.jp : key;
}
// 実÷期待 を記号にする。％も倍率も画面に出さない。
// 言葉（よく来る 等）だと判定の列が33pxしかなく1文字ずつ縦に割れるため、
// 2026-07-31 に記号へ変更した。読み方は表の下の凡例（tpLegend）に出す。
// しきい値は変更前とまったく同じ（>= と > の違いも含めてそのまま写す）
const TP_MARKS = [
  { hit: (v) => v >= 1.10, sym: '◉', cls: 'up', word: 'よく来る' },
  { hit: (v) => v >= 1.03, sym: '○', cls: 'up', word: 'やや上' },
  { hit: (v) => v > 0.97, sym: 'ー', cls: 'mid', word: '人気どおり' },
  { hit: (v) => v > 0.90, sym: '△', cls: 'dn', word: 'やや下' },
  { hit: () => true, sym: '✕', cls: 'dn', word: '来ない' },
];

function tpVerdict(lift) {
  if (lift == null) return '<span class="tp-mid tpsym">—</span>';
  const m = TP_MARKS.find((x) => x.hit(lift));
  return `<span class="tp-${m.cls} tpsym" title="${m.word}">${m.sym}</span>`;
}

function tpLegend() {
  return `<div class="tplgd">${TP_MARKS.map((m) =>
    `<span><i class="tp-${m.cls} tpsym">${m.sym}</i>${m.word}</span>`).join('')}</div>`;
}
function tpPct(v) { return v == null ? '—' : `${(v * 100).toFixed(1)}%`; }

// 値の配列 → 1位=1.0 〜 最下位=0.0 の位置。同点は同じ値
function tpRankPos(vals) {
  return vals.map((v) => {
    const above = vals.filter((x) => x > v).length;
    const tie = vals.filter((x) => x === v).length;
    const mid = above + (tie - 1) / 2;
    return vals.length > 1 ? 1 - mid / (vals.length - 1) : 0.5;
  });
}

// 選んだ材料それぞれのレース内順位を平均し、10段階に割り当てる
function tpSteps(site) {
  const live = (site.horses || []).filter((h) => !h.scratched && h.topping);
  const out = {};
  if (!live.length) return out;
  const parts = [];
  TP.sel.forEach((key) => {
    parts.push(tpRankPos(live.map((h) => {
      const lv = (h.topping.levels || {})[key];
      return lv && lv.lift != null ? lv.lift : 1.0;
    })));
  });
  if (TP.cross) parts.push(tpRankPos(live.map((h) => h.topping.net || 0)));
  if (!parts.length) return out;
  const sc = live.map((_, i) => parts.reduce((s, p) => s + p[i], 0) / parts.length);
  live.forEach((h, i) => {
    const above = sc.filter((v) => v > sc[i]).length;
    const tie = sc.filter((v) => v === sc[i]).length;
    const mid = above + (tie - 1) / 2;
    out[h.number] = 10 - Math.min(9, Math.floor((mid * 10) / sc.length));
  });
  return out;
}

// 104-spec §6.3: 体3軸（bweight/bwdelta/wratio）は当日体重が発表されるまで使えない。
// 軸ごとに判定する（3軸まとめてではない・新馬戦はbwdeltaだけ'?'のまま残るため）。
const TP_BODY_AXES = ['bweight', 'bwdelta', 'wratio'];
function tpAxisHasData(site, axisKey) {
  const live = (site.horses || []).filter((h) => !h.scratched && h.topping);
  return live.some((h) => {
    const lv = (h.topping.levels || {})[axisKey];
    return lv && lv.level != null && lv.level !== '?';
  });
}

// 「材料」で全部オンにする対象。馬体重の3つは発走の約50分前まで値が無く、
// 混ぜると19分の3が中立値（1.0）で埋まって残りの材料の差が薄まるので、
// 値が来ていない材料は最初から外す（旧デザインでチップを押せなくしていたのと同じ考え）。
function tpUsableAxes(site) {
  const groups = ((site.topping_meta || {}).groups) || [];
  return groups.reduce((acc, g) => acc.concat(g.axes), [])
    .filter((a) => !TP_BODY_AXES.includes(a) || tpAxisHasData(site, a));
}

// 出馬表の帯の下、「印／戦績／新聞」と同じ行の右端に置く2つのボタン（2026-08-27）。
//   好走条件 … このコースだけで見つけた条件をまとめて当てはめる（TP.cross）
//   材料     … 19種類を全部オンにして当てはめる（TP.sel が全部入り／空で往復）
// どちらも押すと色が付き、もう一度押すと消える。
//
// それまでは大きな箱2つ（.tpmain 82px ＋ .tpsum 31px ＝ 118px）が縦に積んでいて、
// 馬が1頭も見えないまま画面を118px使っていた。
// 繋げた1組にしたのは要素の間の隙間を1つ減らすため。離して2つ置くと375pxでも折り返した。
//
// 材料を1つずつ選ぶ札（旧 #pop-topping）は入口が無くなったので外した。
// 選ぶ仕組み自体は TP.sel と [data-tpax] / [data-tpgrp] の処理に残っているので、
// 入口を足せば戻る。
function tpCtl(site) {
  const meta = site.topping_meta || {};
  const first = (site.horses || []).find((h) => h.topping) || {};
  const course = (first.topping || {}).course || '';
  const zero = !(site.horses || []).some((h) => h.topping && h.topping.conds_total);
  const allAxes = tpUsableAxes(site);
  const allSel = allAxes.length > 0 && allAxes.every((a) => TP.sel.has(a));
  return `<span class="tpctl" id="tpctl">
    <span class="tpseg">
      <button type="button" class="tpb${TP.cross ? ' on' : ''}" id="tpx"${zero ? ' disabled' : ''}
        title="${escapeHtml(zero ? 'このコースでは条件が見つかっていません'
          : `${course} だけで見つけた条件を全部まとめて当てはめる`)}">好走条件</button>
      <button type="button" class="tpb${allSel ? ' on' : ''}" id="tpall"
        title="${escapeHtml(`${allAxes.length}種類の材料を全部使って、`
          + '人気より走る条件 − 走らない条件 の数で10段階に分ける')}">材料</button>
    </span>
  </span>`;
}

// 行を開いたときに出す「この馬の色の理由」
function tpWhy(site, h, step, total) {
  if (!h.topping || !step) return '';
  const axRows = [...TP.sel].map((key) => {
    const lv = (h.topping.levels || {})[key];
    if (!lv) return `<tr><td class="l">${escapeHtml(tpJp(key))}</td><td class="l">—</td><td colspan="3">材料なし</td></tr>`;
    if (lv.lift == null) return `<tr><td class="l">${escapeHtml(tpJp(key))}</td><td class="l">${escapeHtml(lv.level)}</td><td colspan="3">このコースではデータ不足</td></tr>`;
    return `<tr><td class="l">${escapeHtml(tpJp(key))}</td><td class="l">${escapeHtml(lv.level)}</td>
      <td><b>${tpPct(lv.rate)}</b></td><td>${tpPct(lv.exp)}</td><td class="vd">${tpVerdict(lv.lift)}</td></tr>`;
  }).join('');
  const cRows = (h.topping.conds || []).map((c) => `<tr>
    <td class="l"><span class="${c.sign > 0 ? 'tp-up' : 'tp-dn'}">${c.sign > 0 ? '＋' : '−'}</span>
      ${c.c.map(([a, v]) => `${escapeHtml(tpJp(a))}:${escapeHtml(v)}`).join(' × ')}</td>
    <td><b>${tpPct(c.rate)}</b></td><td>${tpPct(c.exp)}</td><td class="vd">${tpVerdict(c.lift)}</td>
    <td>${c.n}走</td></tr>`).join('');
  const more = (h.topping.conds_total || 0) - (h.topping.conds || []).length;
  return `<div class="hd"><span class="sw" style="background:var(--tp${step})"></span>
      この馬は <b>${step}段目</b>（${total}頭中）</div>
    ${TP.sel.size ? `<table class="tpt"><thead><tr><th class="l">材料</th><th class="l">この馬</th>
      <th>3着内率</th><th>同じ人気なら</th><th class="vh">判定</th></tr></thead><tbody>${axRows}</tbody></table>` : ''}
    ${TP.cross && h.topping.conds_total ? `<table class="tpt"><thead><tr>
      <th class="l">当てはまった条件</th>
      <th>3着内率</th><th>同じ人気なら</th><th class="vh">判定</th><th>母数</th></tr></thead>
      <tbody>${cRows}${more > 0 ? `<tr><td class="l" colspan="5" style="color:var(--cap)">ほか ${more} 件</td></tr>` : ''}</tbody></table>` : ''}
    ${TP.sel.size || (TP.cross && h.topping.conds_total) ? tpLegend() : ''}`;
}

// 色と説明を貼り直す（チップを押すたびに呼ぶ。表そのものは作り直さない）
function tpRefresh() {
  const site = TP.site;
  if (!site) return;
  const root = document.querySelector('.race20');
  if (!root) return;
  const steps = tpSteps(site);
  const total = (site.horses || []).filter((h) => !h.scratched && h.topping).length;
  // 106-spec §6.1: 表組みをやめたので拾う先は tr.hrow ではなく札（.acard）。
  // data-h は同じ属性名を札にも付けてあるので、読み方は変えていない。
  // 126-spec §6.1: 新聞の柱（.npcol）にも同じ data-h を付けてあるので、まとめて拾う。
  root.querySelectorAll('.acard, .npcol').forEach((card) => {
    for (let i = 1; i <= 10; i += 1) card.classList.remove(`tp${i}`);
    const s = steps[Number(card.dataset.h)];
    if (s) card.classList.add(`tp${s}`);
  });
  // 111-spec §3.7: 「印を付ける」モードの1行にも同じ色を付ける。札は柱（.aspine）が
  // 色を持つが、1行には柱が無いので .mm-c（馬番・馬名・点数・オッズ）を塗る。
  // 拾う先は data-h ではなく data-n（.mm-row 側の属性名）。段（tp1〜tp10）は札と同じ steps。
  root.querySelectorAll('.mm-row').forEach((row) => {
    for (let i = 1; i <= 10; i += 1) row.classList.remove(`tp${i}`);
    const s = steps[Number(row.dataset.n)];
    if (s) row.classList.add(`tp${s}`);
  });
  const byNumber = {};
  (site.horses || []).forEach((h) => { byNumber[h.number] = h; });
  root.querySelectorAll('.tpwhy').forEach((el) => {
    const h = byNumber[Number(el.dataset.w)];
    el.innerHTML = h ? tpWhy(site, h, steps[h.number], total) : '';
  });
  const ctl = document.getElementById('tpctl');
  if (ctl) ctl.outerHTML = tpCtl(site);
}

function setupTopping(site) {
  if (!tpOn(site)) return;
  TP.site = site;
  const root = document.querySelector('.race20');
  if (!root) return;
  // 差し込み先は「印／戦績／新聞」の行の中（2026-08-27）。空の .shctl は残す
  const slot = root.querySelector('.mm-tp');
  if (slot) slot.innerHTML = tpCtl(site);
  root.addEventListener('click', (e) => {
    if (e.target.closest('#tpx')) { TP.cross = !TP.cross; tpRefresh(); return; }
    // 材料は「全部オン ⇄ 全部オフ」の往復。押している材料が1つでもあれば消す側に回る
    if (e.target.closest('#tpall')) {
      const axes = tpUsableAxes(site);
      const full = axes.length > 0 && axes.every((a) => TP.sel.has(a));
      TP.sel.clear();
      if (!full) axes.forEach((a) => TP.sel.add(a));
      tpRefresh(); return;
    }
    const grp = e.target.closest('[data-tpgrp]');
    if (grp) {
      const g = ((site.topping_meta || {}).groups || []).find((x) => x.name === grp.dataset.tpgrp);
      if (g) {
        const full = g.axes.every((a) => TP.sel.has(a));
        g.axes.forEach((a) => (full ? TP.sel.delete(a) : TP.sel.add(a)));
      }
      tpRefresh(); return;
    }
    const chip = e.target.closest('[data-tpax]');
    if (chip) {
      const k = chip.dataset.tpax;
      TP.sel.has(k) ? TP.sel.delete(k) : TP.sel.add(k);
      tpRefresh(); return;
    }
  }, true);
  tpRefresh();
}
