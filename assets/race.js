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
  }).join('')}</div>
    <div class="rv-note">↑ 今回−平均（秒）。＋は平均より時間がかかったハロン</div>` : '';

  const firstM = course ? course.lap_first_m : null;
  const notes = ['上にあるほど速いハロン。縦軸は0秒から始めていません（差を見るため）'];
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

// 出馬表の印列（markBadge20）と同じ並べ方。能力印を持つ穴馬は穴を下に積む
function foMark(h) {
  if (h.bet_mark === '地雷') return '<span class="mkb m-jir">地雷</span>';
  const ana = isAna(h) ? '<span class="mkb m-ana sub">穴</span>' : '';
  if (h.ability_mark) {
    const badge = `<span class="mkb ${ABILITY_CLS[h.ability_mark] || ''}">${escapeHtml(h.ability_mark)}</span>`;
    return ana ? `<span class="mkstack">${badge}${ana}</span>` : badge;
  }
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
  { label: '印', cls: 'fo-mk', has: (h) => !!h.ability_mark || h.bet_mark === '地雷' || isAna(h), cell: foMark },
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
    // 109-spec §3.1: コースタブは最初に開いた時だけ data/courses/*.json を読む（遅延読み込み）
    if (key === 'course' && window.CourseTab) window.CourseTab.onShow(site);
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
  const facts = [
    ['ペース', race.pace && race.pace.act ? paceWord(race.pace.act) : '—',
      race.pace && race.pace.hit === false ? `${paceWord(race.pace.pred)}と読んでいた` : (race.pace && race.pace.hit ? '読みと一致' : ''),
      race.pace ? race.pace.hit : null],
    ['決着', race.bias && race.bias.act ? race.bias.act : '—',
      race.bias && race.bias.pred ? `${race.bias.pred}と読んでいた` : '',
      race.bias ? race.bias.hit : null],
    ['ラップ', race.lap ? race.lap.label : '—', '', null],
    ['勝ち時計', race.winning_time || '—', winningTimeNote(race.winning_time_eval), null],
  ].map(([lbl, val, sub, ok]) => `<div class="rv-fact${ok === false ? ' bad' : ''}">
      <div class="rv-fl">${escapeHtml(lbl)}</div><div class="rv-fv">${escapeHtml(String(val))}</div>
      <div class="rv-fs">${sub && sub.html ? sub.html : escapeHtml(sub || '')}</div></div>`).join('');

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
    ${renderReviewLap(race.lap)}
    ${renderReviewCorners(review, byNumber, top3)}

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
  // upCfoot（注記文）は103-spec §3.4（ユーザー指示・2026-07-31）で削除した。
  // upset.note 自体は analysis.json に残るが（89-spec の契約は無改修）、ここでは描画しない。
  return `
    <div class="upC">${cols}</div>
    <div class="upCbar">${bar}</div>
    <div class="upCnote">${escapeHtml(upset.line)}</div>
    ${tables}
    ${hint}
  `;
}

// 3連単100万超えの射程（103-sanrentan-1m-spec.md §3・案A）。bigpay が無ければ何も出さない
// （§3.5 の縮退）。文言(percent/ratio_line)は keiba_build_analysis.py が確定済み。
// 帯(band_lo〜band_hi)・頭数(field_size)もそのまま転記されたものをここでは組み立てるだけ。
// 凡例・注記は一切出さない（§3.4・ユーザー指示）。帯に人気番号が入るので番号列が説明を兼ねる。
function renderBigPay(bigpay, horses) {
  if (!bigpay || !bigpay.field_size) return '';
  const fs = bigpay.field_size;
  // §3.5: 頭数7以下は帯を出さず1行のみ（人気4位以上が3頭に満たず帯の意味がないため）
  let map = '';
  if (fs >= 8) {
    const finishByPop = {};
    (horses || []).forEach((h) => {
      if (h.finish != null && h.finish <= 3 && h.popularity != null) {
        finishByPop[h.popularity] = true;
      }
    });
    const cells = [];
    for (let i = 1; i <= fs; i += 1) {
      // came（確定後に実際に3着以内へ来た人気）は band より優先。§4.2: build_bigpay は
      // レース確定前にしか呼ばれないためサイト側で site.horses[].finish/popularity から出す
      const came = !!finishByPop[i];
      const inBand = i >= bigpay.band_lo && i <= bigpay.band_hi;
      const cls = came ? ' class="came"' : (inBand ? ' class="band"' : '');
      cells.push(`<i${cls}>${i}</i>`);
    }
    map = `<div class="bpMap">${cells.join('')}</div>`;
  }
  return `
    <div class="bpC${bigpay.highlight ? ' on' : ''}">
      <div class="r1">
        <span class="lb">3連単100万超え</span>
        <span class="pv">${escapeHtml(bigpay.percent)}<small>%</small></span>
        <span class="rt">${escapeHtml(bigpay.ratio_line)}</span>
      </div>
      ${map}
    </div>
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

// 見立て。旧構成では .rhead の中にあった荒れ度カードと3連単100万を、そのまま
// 「買い目」タブの先頭に出す。描画関数は renderUpset20 / renderBigPay を再利用し、
// 中身・順番・クラス名は一切変えない（CSSは .race20 スコープなので移動しても効く）。
function renderMitate20(site) {
  const p = site.prediction;
  return `${renderUpset20(p.upset)}${renderBigPay(p.bigpay, site.horses)}`;
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

// 印は 地雷 → 能力印(＋穴) → 穴 の順。地雷は能力印と排他（mark-2.4）だが、穴は
// 「人気7位以下なのに走る」で能力印とは別基準なので同居する（2026-08-01 時点で42頭中10頭）。
// 同居分は能力印の下に穴を小さく積んで併記する（mockup-38 案B）。横並びや列の拡幅は
// 馬名列を削ることになるので採らない。積んでも行の高さは変わらない（実測48pxで同じ）。
function markBadge20(h) {
  if (h.bet_mark === '地雷') return '<span class="mkb m-jir">地雷</span>';
  const ana = isAna(h) ? '<span class="mkb m-ana sub">穴</span>' : '';
  if (h.ability_mark) {
    const badge = `<span class="mkb ${ABILITY_CLS[h.ability_mark]}">${h.ability_mark}</span>`;
    return ana ? `<span class="mkstack">${badge}${ana}</span>` : badge;
  }
  if (isAna(h)) return '<span class="mkb m-ana">穴</span>';
  return '';
}

// ============================================================
// 105-spec: 出馬表ワンシート化＋買える／消せるの10項目
// ============================================================

// 106-spec §5.2: item_marks（10項目・順序固定・並べ替えない）を、札には
// 「項目名＋○×」の点だけ出す。理由文は札には入らないので馬名ポップアップへ（§5.4）。
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

// 106-spec §5.4: 札から追い出した理由文。ポップアップの中で全文を読ませる。
// 文言は 105-spec §5.3 のチップと同じ（1文字も減らさない）。
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

// 106-spec §5.3: 過去走1走（横3行）。105-spec の6行マス（幅168px固定）を、画面幅を
// 使い切る横3行に組み替えたもの。**項目は12のままで1つも減らしていない**。
//   .vtab  走の見出し（前走・2走前…）。縦書き。横書きだと「3走前」で28px要るところが13pxで済む
//   .l1    着順・日付・場・クラス・レース名・頭数・人気
//   .l2    条件・タイム・通過順4マス・上がり3F・騎手・斤量・馬体重
//   .l3    展開・勝ち馬・着差・回顧メモ
//
// 着順は 2026-08-05 に行の先頭へ移し、箱を 19×16px→26×21px（文字10.5→14px）に拡げた。
// 左端で全走そろうので、5走ぶんの着順が縦一列に読める（新聞の着順柱と同じ読み方）。
function runLine3(p, label) {
  const cond = `${escapeHtml(surfShort(p.surface))}${escapeHtml(p.distance || '')}${escapeHtml(goingShort(p.condition))}`;
  const bw = p.body_weight != null ? String(p.body_weight) : '—';
  const kg = p.weight != null ? escapeHtml(String(p.weight)) : '—';
  const rankCls = { 1: 'f1', 2: 'f2', 3: 'f3' }[p.last3f_rank] || '';
  const agTitle = p.last3f_rank ? `このレースの上がり${p.last3f_rank}位` : '上がり3F';
  const timeTitle = p.time_grade
    ? `基準比 ${p.time_resid > 0 ? '+' : ''}${p.time_resid}秒（当日の馬場差を補正後）・着差${marginText(p)}秒`
    : (p.time_note || '');
  const notes = runNoteTags(p.note_labels);
  const noteTitle = notes && p.note_text ? ` title="${escapeHtml(p.note_text)}"` : '';
  return `<div class="vrun${runBandClass(p)}"><span class="vtab">${escapeHtml(label)}</span><div class="vrb">
    <div class="l1">${shutubaFinBox(p.finish)}<span class="dt">${shutubaMd(p.date)}</span><span class="tk">${escapeHtml(p.track || '')}</span>${classBadge(p.grade, p.race_name)}${runNameSpan(p.race_name)}<span class="nm hd">${escapeHtml(p.runners ?? '—')}頭</span><span class="nm pp">${escapeHtml(p.popularity ?? '—')}人</span></div>
    <div class="l2"><span class="cd">${cond}</span>${rankSpan(p.time ?? '—', p.time_grade || '', timeTitle, 'tm')}${cornersHtml(p.corners)}${rankSpan(p.last_3f ?? '—', rankCls, agTitle)}<span class="jk">${escapeHtml(p.jockey ?? '—')}</span><span class="kg">${kg}</span><span class="bw">${bw}</span></div>
    <div class="l3"${noteTitle}>${scenarioHtml(p.scenario)}<span class="wn">${escapeHtml(p.winner || '')}</span><span class="mg">(${marginText(p)})</span>${notes}</div>
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
          <th>クラス</th><th>着</th><th>タイム</th><th>上り</th><th>頭数・人気</th><th>差</th>
          <th class="l">通過</th><th class="l">騎手・斤量</th></tr></thead>
        <tbody>${runs.map(pastRunRow).join('')}</tbody>
      </table>
    </div>
    <div class="pthint">← 横にスクロールできます</div>`;
}

function popupBody(h) {
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
      <div class="pcareer">${careerLine(h)}</div>
      ${markWhyBlock(h)}
      ${itemWhyBlock(h)}
      ${courseRecordTable(h)}
      ${popupRunsTable(h)}
    </div>`;
}

// 10倍を切ったら赤オッズ（新聞・netkeibaと同じ表記。2026-08-05 ユーザー指定）。
// 境目は「10.0未満」で、9.9倍までが赤・10.0倍からは黒。
const ODDS_HOT = 10;

function oddsHotClass(odds) {
  return (odds != null && odds < ODDS_HOT) ? ' hot' : '';
}

// 106-spec §4: 柱（新聞の1頭ぶんの縦帯）。押すと馬名ポップアップが開く。
// 押しどころを縦書きの馬名（幅13px）だけにすると狭すぎるので、柱ごとボタンにする。
function spineHtml(h) {
  return `<button type="button" class="aspine" data-pop="${h.number}">
    ${markBadge20(h)}${umaBox(h.number, h.gate, 'sm')}
    <span class="vname">${escapeHtml(h.name)}</span><i class="apop">▸</i>
  </button>`;
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
        <span class="tot">${fmtNum(h.total, 1)}<i class="grade ${gradeClass(h.grade)}">${gradeDisp(h.grade)}</i></span>
        <span class="od${oddsHotClass(h.odds)}">${h.odds != null ? h.odds.toFixed(1) : '—'}<i>倍</i><i>${h.popularity ?? '—'}人</i></span>
      </div>
      <div class="asub">${bw}${rot}${itemDots(h)}</div>
      ${runsBlock(h)}
    </div>
  </article>`;
}

function renderShutuba20(site) {
  const all = site.horses;
  const live = all.filter((h) => !h.scratched);

  const cards = [...all].sort((a, b) => a.number - b.number).map(shutubaCard).join('');
  const popups = live.map((h) => `<div class="popup" id="pop-${h.number}">${popupBody(h)}</div>`).join('');

  // .shctl は空でも残す。トッピングの操作パネルが setupTopping からここへ差し込まれる
  return `
    <div class="secthead">出馬表<span class="cnt">全${site.race.field_size}頭・馬番順</span></div>
    <div class="shctl"></div>
    <div class="shlist">${cards}</div>
    ${popups}
  `;
}

function setupShutuba20() {
  const root = document.querySelector('.race20');
  if (!root) return;

  // 106-spec §2.2: ズーム操作（表の大きさ ±・ピンチ）は廃止した。横スクロールが
  // 無くなり、虫めがねで覗く必要そのものが無くなったため。
  // §5.4: 「買える／消せる」は札に常時出るので、開く／消すボタンも無い。

  // 105-spec §5.5: 馬名ポップアップ。閉じ方は「閉じる」ボタン・背景クリック・Esc の3つ
  const bg = document.createElement('div');
  bg.className = 'pbg';
  root.appendChild(bg);
  let openPopup = null;
  const closePopup = () => {
    if (openPopup) { openPopup.classList.remove('on'); openPopup = null; }
    bg.classList.remove('on');
  };
  root.addEventListener('click', (e) => {
    const nb = e.target.closest('[data-pop]');
    if (nb) {
      closePopup();
      const p = root.querySelector(`#pop-${nb.dataset.pop}`);
      if (p) { p.classList.add('on'); bg.classList.add('on'); openPopup = p; }
      return;
    }
    if (e.target.closest('[data-close]')) closePopup();
  });
  bg.addEventListener('click', closePopup);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePopup(); });
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
  { key: 'kaime', label: '買い目' },
  { key: 'course', label: 'コース' },   // 109-spec: course_entities が無いレースは落とす（§2.2）
  // 回顧タブの見出しは中身に合わせる。レース前は renderVerification20 が
  // 「答え合わせ／結果はレース後に反映されます」を出すので、タブ名も同じ言葉にする
  { key: 'kaiko', label: '回顧', labelPre: '答え合わせ' },
];
const RACE20_TAB_DEFAULT = 'shutuba';

function race20TabFromHash() {
  const m = /(?:^|&)tab=([a-z]+)/.exec(String(location.hash || '').replace(/^#/, ''));
  return m && RACE20_TABS.some((t) => t.key === m[1]) ? m[1] : RACE20_TAB_DEFAULT;
}

function buildRace20Html(site, oddsAll) {
  const banner = site.status === 'cancelled' ? '<div class="alert">このレースは中止になりました</div>' : '';
  // 結果が出ているレースだけ「回顧」に赤ドットを出す（renderVerification20 と同じ判定）
  const settled = site.status === 'final';
  // 109-spec §2.2: course_entities（course_idが確定できたレースの人物・血統ぶん）が
  // 無いレースはコースタブ自体を配列から落とす（推測でコースJSONを引かない）
  const tabs = RACE20_TABS.filter((t) => t.key !== 'course' || site.course_entities);
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
      <div class="tabbar" role="tablist">${bar}</div>
      ${pane('shutuba', renderShutuba20(site))}
      ${pane('tenkai', renderOverview20(site))}
      ${pane('kaime', renderMitate20(site) + renderBets20(site) + renderOddsMasterSection(site, oddsAll))}
      ${site.course_entities ? pane('course', window.CourseTab.render(site)) : ''}
      ${pane('kaiko', renderVerification20(site))}
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

  const grid = site.prediction.scenario_grid;
  const top = grid && grid.cells ? [...grid.cells].sort((a, b) => a.rank - b.rank)[0] : null;
  const pt = ((site.prediction.scenario || {}).main || {}).pass_time || {};
  const pace = top
    ? `<div class="paceline"><b>${PACE_LABEL_108[top.code]}ペース</b>`
      + (pt.sec != null ? `<span>1000m通過 約${pt.sec}秒</span>` : '') + '</div>'
    : '';

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
  // 内外の枠は**値で色を決める**。内が緑・外が赤という固定はしない
  if (iv != null && ov != null) {
    chips.push(['内めの枠', iv.toFixed(2), 'g' + ratioClass(iv)]);
    chips.push(['外めの枠', ov.toFixed(2), 'g' + ratioClass(ov)]);
  }
  if (!g.straight_only) {
    chips.push(['1周', `${g.lap_m.toLocaleString(undefined, { minimumFractionDigits: 1 })}m`, '']);
    chips.push(['高低差', `${g.rise_m}m・${g.flat_label}`, '']);
    chips.push(['回り', g.direction + (g.loop ? `・${g.loop}回り` : ''), 'gdir']);
  }
  const chipHtml = chips.map(([k, v, cls]) =>
    `<span class="gc ${cls}"><span class="k">${escapeHtml(k)}</span>${escapeHtml(v)}</span>`).join('');
  return `<div class="subh">コースの形</div>${pace}`
    + courseShapeSvg(g, innerTone, outerTone)
    + courseDistBar(g)
    + `<div class="geochips">${chipHtml}</div>`;
}

// §4 馬場 ────────────────────────────────────────────────
function babaOutlookTile(title, v, kind) {
  let val = '—', word = '—', cls = 'z0';
  if (v != null) {
    if (Math.abs(v) < 0.05) { val = '±0.0秒'; word = kind === 'time' ? '基準どおり' : 'いつも通り'; }
    else {
      val = `${Math.abs(v).toFixed(2)}秒`;
      const fast = v < 0;
      word = kind === 'time' ? (fast ? '速い' : '時計がかかる')
                             : (fast ? '速い脚が出る' : '上がりがかかる');
      cls = fast ? 'p1' : 'm1';
    }
  }
  return `<div class="ot ${cls}"><span class="ttl">${escapeHtml(title)}</span>`
    + `<span class="v">${escapeHtml(val)}</span><span class="w">${escapeHtml(word)}</span></div>`;
}

function renderBaba20(site) {
  const p = site.prediction;
  const bd = p.baba_detail;
  const disp = (p.display || {}).baba;
  const cu = (bd || {}).cushion_detail || {};
  const mo = (bd || {}).moisture_detail || {};
  const isTurf = String(site.race.surface || '').startsWith('芝');
  // 芝はクッション値、ダートは含水率が軸（§4 / §7.4）
  const lv = isTurf ? cu.level : mo.level;
  const norm = isTurf ? cu.normal : mo.normal;
  if (!lv || !norm) return '';           // 旧データ → 呼び出し側が旧ブロックへ落とす

  const delta = isTurf ? norm.delta : mo.normal_delta;
  const sign = `${delta > 0 ? '+' : ''}${Number(delta).toFixed(1)}`;
  const tail = lv.cls === 'z0' || lv.label === 'いつも通り' ? ''
    : (delta < 0 ? (isTurf ? '時計はかかりやすい' : '時計はかかりやすい')
                 : (isTurf ? '時計は速くなりやすい' : '時計は速くなりやすい'));
  const head = `<div class="l1"><span class="lv ${lv.cls || 'z0'}">${escapeHtml(lv.label)}</span>`
    + `<span class="hd">${escapeHtml(site.race.track)}の平年より <b>${sign}</b></span>`
    + (tail ? `<span class="tl">${escapeHtml(tail)}</span>` : '') + '</div>';

  const rows = [];
  if (isTurf && cu.value != null) {
    rows.push(`<div class="mrow"><span class="k">クッション値</span>`
      + `<span class="v">${cu.value}</span>`
      + `<span class="t">${escapeHtml(cu.measured_label || '')}</span></div>`);
  }
  if (mo.goal != null) {
    rows.push(`<div class="mrow"><span class="k">含水率 ${escapeHtml(mo.surface || '')}</span>`
      + `<span class="v">G前 ${mo.goal}% ／ 4C ${mo.corner4}%</span>`
      + `<span class="t">${escapeHtml(mo.measured_label || '')}</span></div>`);
  }

  // 目盛り。芝だけ（クッション値の実測はばが要る）
  let scale = '';
  if (isTurf && cu.range && cu.value != null) {
    const lo = cu.range.min, hi = cu.range.max, span = Math.max(hi - lo, 0.1);
    const pos = (v) => Math.max(0, Math.min(100, (v - lo) / span * 100));
    const bl = pos(norm.mean - 0.3), bh = pos(norm.mean + 0.3);
    const prev = cu.prev && cu.prev.value != null ? cu.prev.value : null;
    scale = `<div class="cscale">
      <div class="lbl"><span class="soft">軟らかい</span><span class="hard">硬い</span></div>
      <div class="tr">
        <i class="band" style="left:${bl.toFixed(1)}%;width:${Math.max(bh - bl, 1).toFixed(1)}%"></i>
        <i class="nm" style="left:${pos(norm.mean).toFixed(1)}%"></i>
        <i class="td ${lv.cls || 'z0'}" style="left:${pos(cu.value).toFixed(1)}%"></i>
        <span class="tdl" style="left:${pos(cu.value).toFixed(1)}%">今日 ${cu.value}</span>
      </div>
      ${prev != null ? `<div class="below"><i class="pv" style="left:${pos(prev).toFixed(1)}%"></i>
        <span class="pvl" style="left:${pos(prev).toFixed(1)}%">前回 ${prev}</span></div>` : ''}
      <div class="ends"><span>${lo}</span>
        <span class="nml" style="left:${pos(norm.mean).toFixed(1)}%">平年 ${norm.mean}</span>
        <span>${hi}</span></div>
    </div>`;
  }

  // §4.3 実測の見込み。対照を超えた材料だけ載っている
  let outlook = '';
  if (disp) {
    let tiles = babaOutlookTile('勝ちタイム', disp.time, 'time');
    if (disp.last3f !== undefined) tiles += babaOutlookTile('勝ち馬の上がり3F', disp.last3f, 'l3');
    outlook = `<div class="outlook"><div class="oh">この馬場だと、こうなりやすい</div>`
      + `<div class="ots">${tiles}</div></div>`;
  }
  return `<div class="babadetail v2">${head}`
    + (rows.length ? `<div class="l3">${rows.join('')}</div>` : '')
    + scale + outlook + '</div>';
}

// §5 脚質 ────────────────────────────────────────────────
function renderLeg20(site) {
  const p = site.prediction;
  const disp = (p.display || {}).leg;
  if (!disp || !disp.length || !p.leg_bias) return '';
  const byStyle = {};
  p.leg_bias.forEach((lb) => { byStyle[lb.style] = lb; });
  const runners = site.horses.filter((h) => !h.scratched);
  const nige = scenarioMainNigeSet(p);
  const best = Math.max(...disp.map((d) => d.delta));
  const cards = disp.map((d) => {
    const lb = byStyle[d.style] || {};
    const key = PACE_STYLE_KEY[d.style];
    const hs = runners.filter((h) => h.running_style === key);
    const chips = hs.map((h) => paceHorsePiece(h, nige.has(h.number))).join('')
      || '<span class="none">—</span>';
    const cells = [['win_rate', d.baseline.win_rate], ['rentai_rate', d.baseline.rentai_rate],
                   ['fukusho_rate', d.baseline.fukusho_rate]];
    const cur = cells.map(([k, b]) => {
      const v = parseFloat(String(lb[k] || '').replace('%', ''));
      const cls = isNaN(v) ? '' : (v > b ? 'up' : v < b ? 'dn' : '');
      return `<td class="${cls}">${isNaN(v) ? '—' : v.toFixed(1) + '%'}</td>`;
    }).join('');
    const avg = cells.map(([, b]) => `<td>${b.toFixed(1)}%</td>`).join('');
    return `<div class="rk2 ${d.cls}${d.delta === best ? ' top' : ''}">
      <div class="r1"><span class="st">${escapeHtml(d.style)}</span>
        <span class="cnt">${hs.length}頭</span>
        <span class="jd">${escapeHtml(d.label)}</span>
        <span class="dt">${d.delta > 0 ? '+' : ''}${d.delta.toFixed(1)}pt</span></div>
      <table class="rt3"><thead><tr><th class="l"></th>
        <th>勝率</th><th>連対</th><th>複勝</th></tr></thead>
        <tbody><tr class="cur"><th class="l">このコース</th>${cur}</tr>
          <tr class="avg"><th class="l">全コース平均</th>${avg}</tr></tbody></table>
      <div class="hs">${chips}</div>
    </div>`;
  }).join('');
  return `<div class="subh">脚質</div><div class="rank2">${cards}</div>`;
}

// §7 逃げ候補・先行圧 ───────────────────────────────────────
function renderFront20(site) {
  const p = site.prediction;
  const d = (p.display || {}).front;
  const fp = p.front_pressure;
  if (!d || !fp) return '';
  const max = d.ppi_max || 1;
  const pos = (v) => Math.max(0, Math.min(100, v / max * 100));
  const lo = Math.min(...d.bands), hi = Math.max(...d.bands);
  const segs = d.bands.map((h, i) => {
    const w = 100 / d.bands.length;
    const t = (h - lo) / Math.max(hi - lo, 0.001);
    return `<i class="sg" style="left:${(i * w).toFixed(1)}%;width:${w.toFixed(1)}%;`
      + `background:rgba(192,72,58,${(0.10 + t * 0.62).toFixed(2)})"></i>`;
  }).join('');
  const ticks = d.bands.map((h, i) => (i % 2 === 1
    ? `<span class="tk" style="left:${((i + 1) * 100 / d.bands.length).toFixed(1)}%">${Math.round(h * 100)}</span>`
    : '')).join('');
  const byNumber = {};
  site.horses.forEach((h) => { byNumber[h.number] = h; });
  const nige = scenarioMainNigeSet(p);
  const mainChips = (fp.main_nige || []).map((s) => {
    const n = Number(String(s).match(/^\d+/));
    const h = byNumber[n];
    return h ? paceHorsePiece(h, true) : '';
  }).join('');
  const others = (p.front_runners || [])
    .filter((fr) => !String(fr.type).startsWith('逃げ'))
    .map((fr) => byNumber[Number(fr.number)])
    .filter(Boolean)
    .map((h) => paceHorsePiece(h, nige.has(h.number))).join('');
  const lead = d.how === 'cross' ? 'この先行圧と主逃げの頭数だと' : 'この先行圧だと';
  return `<div class="subh">逃げ候補・先行圧</div>
    <div class="mt">
      <div class="m1">${lead}<b>${Math.round(d.h * 100)}%</b>がハイペースだった</div>
      <div class="mtr">${segs}<i class="pin" style="left:${pos(d.ppi).toFixed(1)}%"></i>
        <span class="pv" style="left:${pos(d.ppi).toFixed(1)}%">${d.ppi.toFixed(2)}</span></div>
      <div class="mtk">${ticks}</div>
      <div class="mlb"><span>先行圧 低い</span><span>高い</span></div>
    </div>
    <div class="fh2">
      <div class="row"><span class="k">主逃げ</span><span class="cnt">${d.nige_n}頭</span>
        <span class="hs">${mainChips || '<i class="none">—</i>'}</span></div>
      <div class="row"><span class="k">先行</span>
        <span class="cnt">${(p.front_runners || []).length - d.nige_n}頭</span>
        <span class="hs">${others || '<i class="none">—</i>'}</span></div>
    </div>`;
}

// §8 展開シナリオ ───────────────────────────────────────────
function renderScenarioCards20(site) {
  const p = site.prediction;
  const grid = p.scenario_grid;
  const cal = (p.display || {}).scenario;
  if (!grid || !grid.cells || !grid.cells.length || !cal) return '';
  const byNumber = {};
  site.horses.forEach((h) => { byNumber[h.number] = h; });
  const nige = scenarioMainNigeSet(p);
  const paceProb = {};
  grid.cells.forEach((c) => { paceProb[c.code] = c.pace_prob; });
  // §8.1 ペースは確率の高い上位2つだけ。落としたぶんは出さない
  const keep = Object.keys(paceProb).sort((a, b) => paceProb[b] - paceProb[a]).slice(0, TOP_PACE_108);
  // §8.3 前後は実測で較正した値を使う
  const front = cal.front_by_pace || {};
  const cellOf = (code, side) => grid.cells.find((c) => c.code === code && c.side === side);
  const probOf = (code, side) => {
    const f = front[code] != null ? front[code] : (cellOf(code, '前') || {}).side_prob;
    return paceProb[code] * (side === '前' ? f : 1 - f);
  };
  let topKey = null, topVal = -1;
  keep.forEach((k) => ['前', '後'].forEach((sd) => {
    const v = probOf(k, sd);
    if (v > topVal) { topVal = v; topKey = `${k}|${sd}`; }
  }));
  // 通過タイムはペースごとに違う。main/sub/other が持っているものを符号で引く
  const pts = {};
  ['main', 'sub', 'other'].forEach((key) => {
    const s = (p.scenario || {})[key] || {};
    if (s.code && s.pass_time && s.pass_time.sec != null && !pts[s.code]) pts[s.code] = s.pass_time;
  });

  const cards = keep.map((k) => {
    const f = front[k] != null ? front[k] : (cellOf(k, '前') || {}).side_prob;
    const chips = (side) => {
      const c = cellOf(k, side) || {};
      const hs = (c.horses || []).map((x) => byNumber[x.number]).filter((h) => h && !h.scratched);
      const shown = hs.slice(0, 6).map((h) => paceHorsePiece(h, nige.has(h.number))).join('');
      return shown + (hs.length > 6 ? `<span class="more">＋${hs.length - 6}</span>` : '');
    };
    const pt = pts[k];
    const on = (sd) => (topKey === `${k}|${sd}` ? ' on' : '');
    return `<div class="pc${topKey && topKey.startsWith(`${k}|`) ? ' on' : ''}">
      <div class="pch"><span class="nm">${PACE_LABEL_108[k]}</span>
        <span class="sb">${PACE_SUB_108[k]}</span>
        ${pt ? `<span class="pt">${pt.point_m}m通過 約${pt.sec}秒</span>` : ''}
        <span class="pp">${Math.round(paceProb[k] * 100)}%</span></div>
      <div class="split"><i class="f" style="width:${(f * 100).toFixed(1)}%">
          前残り ${Math.round(f * 100)}%</i>
        <i class="r" style="width:${((1 - f) * 100).toFixed(1)}%">
          差し・追込 ${Math.round((1 - f) * 100)}%</i></div>
      <div class="pcb">
        <div class="side f${on('前')}"><span class="v">${Math.round(probOf(k, '前') * 100)}%</span>
          <div class="hs">${chips('前')}</div></div>
        <div class="side r${on('後')}"><span class="v">${Math.round(probOf(k, '後') * 100)}%</span>
          <div class="hs">${chips('後')}</div></div>
      </div>
    </div>`;
  }).join('');
  return `<div class="subh">展開シナリオ</div><div class="pcwrap p1">${cards}</div>`;
}

function renderOverview20(site) {
  const r = site.race;
  const p = site.prediction;
  const sections = [];
  const byNumberOv = {};
  for (const h of site.horses) byNumberOv[h.number] = h;

  // (a) 108-spec §2/T3: 基本情報4行（.info1）は renderHeader20 へ移した。ここでは出さない。
  //     代わりに先頭へ「コースの形」を置く（§3）。display が無い旧データでは空文字が返る。
  sections.push(renderCourseShape20(site));

  // (b) 馬場踏み込み
  // 2026-08-01: クッション値をJRA公式から測定時刻つきで取れるようになり、過去4年ぶんも
  // 揃ったので「前日からの変化」「その競馬場の平年比」まで出す。いずれも観測された事実で、
  // どの馬が有利かの主張はしない（馬場適性は予測力ゼロと確定しているため）。
  // 108-spec §4/T5: display と新しい baba_detail がそろえば新ブロック。
  // 無ければ下の旧ブロックへ落ちる（93-spec §7 と同じ縮退）。
  const baba108 = renderBaba20(site);
  if (baba108) {
    sections.push(baba108);
  } else if (p.baba_detail) {
    const bd = p.baba_detail;
    const favs = bd.favorites || [];
    const favHtml = favs.map((f) => `<span class="fav"><span class="nm">${umaBox(Number(f.number), (byNumberOv[f.number] || {}).gate, 'sm')} ${escapeHtml(f.name)}</span> <span class="rs">（${escapeHtml(f.reason)}）</span></span>`).join('');
    const l2Html = favs.length ? `<div class="l2"><span class="h">この馬場が得意:</span>${favHtml}</div>` : '';

    // 見出し行。headline が無い旧データは display_text をそのまま出す（後方互換）
    const headHtml = bd.headline
      ? `<div class="l1">${escapeHtml(bd.headline)}</div>`
      : `<div class="l1">${escapeHtml(bd.display_text || '')}</div>`;

    const rows = [];
    const cu = bd.cushion_detail;
    if (cu && cu.value != null) {
      const staleHtml = cu.stale ? '<span class="stale">前日以前の値</span>' : '';
      rows.push(`<div class="mrow">
        <span class="k">クッション値</span>
        <span class="v">${escapeHtml(String(cu.value))}</span>
        <span class="t">${escapeHtml(cu.measured_label || '')}</span>${staleHtml}
      </div>`);
      const sub = [];
      if (cu.prev && cu.prev.value != null) {
        sub.push(`<span class="k">前回 ${escapeHtml(cu.prev.label || '')}</span>
          <span class="v">${escapeHtml(String(cu.prev.value))}</span>
          <span class="d ${deltaCls(cu.prev.delta)}">${signed(cu.prev.delta)}</span>
          <span class="w">${escapeHtml(cu.prev.trend || '')}</span>`);
      }
      if (cu.normal && cu.normal.mean != null) {
        sub.push(`<span class="k">${escapeHtml(cu.normal.scope || '')}の平年</span>
          <span class="v">${escapeHtml(String(cu.normal.mean))}</span>
          <span class="d ${deltaCls(cu.normal.delta)}">${signed(cu.normal.delta)}</span>
          <span class="w">${escapeHtml(cu.normal.label || '')}</span>
          <span class="n">${cu.normal.n}回ぶん</span>`);
      }
      for (const s of sub) rows.push(`<div class="mrow sub">${s}</div>`);
    }
    const mo = bd.moisture_detail;
    if (mo && mo.goal != null) {
      rows.push(`<div class="mrow">
        <span class="k">含水率 ${escapeHtml(mo.surface || '')}</span>
        <span class="v">G前 ${escapeHtml(String(mo.goal))}% ／ 4C ${escapeHtml(String(mo.corner4))}%</span>
        <span class="t">${escapeHtml(mo.measured_label || '')}</span>
      </div>`);
    }
    const measureHtml = rows.length ? `<div class="l3">${rows.join('')}</div>` : '';

    sections.push(`
      <div class="babadetail">
        ${headHtml}
        ${measureHtml}
        ${l2Html}
      </div>
    `);
  }

  // (c) 脚質傾向（コース別実績の内訳）＋ 脚質マップ（各脚質に出走馬を並べる）
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
      <div class="striplegend">緑=有利 / 赤=不利、濃いほど強い（1.00=標準）${hasNd ? ' / —=走数不足で判定なし' : ''}</div>
    `);
  }

  // (d-2) 今日の馬場（当日バイアス）
  // 上の帯がコースの過去平均なのに対し、こちらは「今日ここまでに終わったレース」だけを見る。
  // 2026-07-27の検証で、内外の偏りは実在する（同じ日の別の競馬場を予測子にすると
  // ゼロになる＝競馬場ごとの現象）ことを確認済み。ただし効果は採点に足す基準の1/5で、
  // 予想の当たり具合は作り方2通り・物差し2通りとも改善しなかったため点数には入れない。
  // 人が他の材料と合わせて見るための材料として出す。
  // 時計の傾向（time_trend）は勝ちタイムから出す別系統（2026-07-30までは芝だけ、
  // 以降はそのレースと同じ馬場種別）。内外の偏りより持続が
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
      `時計はこのレースと同じ馬場（芝／ダート）の勝ちタイムを、コース・クラス・馬場状態・時期で補正した残差です`
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
  // 108-spec §7/T7: 3分割ラベルをやめ、実測のハイペース率に置き換える。
  const front108 = renderFront20(site);
  if (front108) {
    sections.push(front108);
  } else {
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

  // (f) 展開シナリオ。93-pace-scenario-6cell-spec.md §6-0-1: 案22（6マス・主役カード）。
  // scenario_grid が無い過去公開分（§7「再生成しない」）は旧3ブロック表示のまま併存させる。
  // 108-spec §8: 上位2ペースの2枚カード（配色P1・前後は実測で較正）。
  // 較正表が引けない旧データは6マス、6マスも無ければ旧3ブロック。
  const scn108 = renderScenarioCards20(site);
  if (scn108) {
    sections.push(scn108);
  } else if (p.scenario_grid && p.scenario_grid.cells && p.scenario_grid.cells.length === 6) {
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

function tpCtl(site) {
  const meta = site.topping_meta || {};
  const first = (site.horses || []).find((h) => h.topping) || {};
  const ncond = (site.horses || []).reduce(
    (m, h) => Math.max(m, (h.topping && h.topping.conds_total) || 0), 0);
  const course = (first.topping || {}).course || '';
  const zero = !(site.horses || []).some((h) => h.topping && h.topping.conds_total);
  const on = [];
  if (TP.cross) on.push('<b>掛け合わせ</b>');
  if (TP.sel.size) on.push(`単体 <b>${[...TP.sel].map(tpJp).join('・')}</b>`);
  const grid = (meta.groups || []).map((g) => {
    const n = g.axes.filter((a) => TP.sel.has(a)).length;
    const gi = n === g.axes.length ? '全部選択中・押すと外す'
      : n ? `${n}/${g.axes.length}選択中・押すと全部選ぶ` : '押すとまとめて選ぶ';
    // 104-spec §6.3: 「体」グループを開いたときだけ、発表タイミングの注記を1行出す
    const bwNote = g.name === '体'
      ? '<p class="tpbwnote">馬体重は発走の約50分前に発表されます。それまでは体の3つは選べません。</p>' : '';
    return `<button type="button" class="tpgl" data-tpgrp="${escapeHtml(g.name)}">${escapeHtml(g.name)}<span class="gi">${gi}</span></button>`
      + g.axes.map((a) => {
        const disabled = TP_BODY_AXES.includes(a) && !tpAxisHasData(site, a);
        return `<button type="button" class="tpchip${TP.sel.has(a) ? ' on' : ''}" data-tpax="${a}"${disabled ? ' disabled' : ''}>${escapeHtml(tpJp(a))}</button>`;
      }).join('')
      + bwNote;
  }).join('');
  // 選ぶ／外すは1つのボタンで往復する
  const allAxes = (meta.groups || []).reduce((s, g) => s.concat(g.axes), []);
  const allSel = allAxes.length > 0 && allAxes.every((a) => TP.sel.has(a));
  return `<div class="tpctl" id="tpctl">
    <div class="tpmain">
      <button type="button" class="tpbig${TP.cross ? ' on' : ''}" id="tpx"${zero ? ' disabled' : ''}>掛け合わせ条件</button>
      <div class="tx">${zero ? 'このコースでは条件が見つかっていません'
        : `<b>${escapeHtml(course)} だけで見つけた条件</b>を当てはめ、<br>人気より走る条件 − 走らない条件 の数で10段階に分ける`}</div>
    </div>
    <button type="button" class="tpsum" id="tpsum">材料を1つずつ選ぶ（${(meta.axes || []).length}種類）
      ${TP.sel.size ? `<span style="color:var(--cta)">・${TP.sel.size}個</span>` : ''}
      <span class="ar">${TP.open ? '▾' : '▸'}</span></button>
    <div class="tpbody${TP.open ? ' open' : ''}">
      <div class="tpall"><button type="button" data-tpall="${allSel ? 'off' : 'on'}">${allSel ? '全部外す' : '全部選ぶ'}</button></div>
      <div class="tpgrid">${grid}</div>
    </div>
    <p class="tpstate">${on.length ? `乗せているもの：${on.join('　＋　')}`
      : 'なにも乗せていない（＝いまの出馬表と同じ）'}</p>
  </div>`;
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
  root.querySelectorAll('.acard').forEach((card) => {
    for (let i = 1; i <= 10; i += 1) card.classList.remove(`tp${i}`);
    const s = steps[Number(card.dataset.h)];
    if (s) card.classList.add(`tp${s}`);
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
  const shctl = root.querySelector('.shctl');
  if (shctl) shctl.insertAdjacentHTML('afterbegin', tpCtl(site));
  root.addEventListener('click', (e) => {
    if (e.target.closest('#tpx')) { TP.cross = !TP.cross; tpRefresh(); return; }
    if (e.target.closest('#tpsum')) { TP.open = !TP.open; tpRefresh(); return; }
    const all = e.target.closest('[data-tpall]');
    if (all) {
      TP.sel.clear();
      if (all.dataset.tpall === 'on') {
        ((site.topping_meta || {}).groups || []).forEach((g) => g.axes.forEach((a) => TP.sel.add(a)));
      }
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
