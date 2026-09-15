// モデル詳細ページ（130-spec §12）
// 一覧の札と「各モデルの成績」の行から model.html?m={slug} で開く。
// データは data/plans.json だけ（manifest.json は読まない。1レース見るのに390KBは重い）。
(function () {

const SLUG_NAME = { tokaido: '東海', koshu: '甲州', nakasendo: '中山',
                    oshu: '奥州', nikko: '日光' };
// 2026-09-15: win-5 の6案に単勝が入ったので先頭に足した（五街道5案には単勝が無いので行が出ないだけ）
const TYPE_ORDER = ['単勝', 'ワイド', '馬連', '馬単', '三連複', '三連単'];
const UPSET_ORDER = ['堅い', '中荒れ', '大荒れ'];

// 回収率の色は100円が戻るかどうかで分ける（100%＝ちょうど元手）
function roiCell(ret, cost) {
  const v = cost ? (ret / cost) : 0;
  const cls = v >= 1 ? 'pos' : (ret ? 'neg' : 'zero');
  return `<td class="${cls}">${fmtPercent(v, 1)}</td>`;
}

function table(head, rows) {
  if (!rows) return '';
  return `<table class="mt"><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows}</table>`;
}

function render(doc, slug) {
  const el = document.getElementById('model-content');
  // 2026-09-15: win-5 の6案（plans_w5・slug が w5- で始まる）も同じページで開く。
  // 順位・期間・ほかのモデルは、その案が属するまとまりの中で数える
  const isW5 = String(slug).startsWith('w5-');
  const plans = (isW5 ? doc.plans_w5 : doc.plans) || [];
  const name = SLUG_NAME[slug];
  const p = plans.find((x) => x.slug === slug) || plans.find((x) => x.name === name);
  if (!p) {
    el.innerHTML = `<div class="error-box">このモデルの成績はまだありません</div>`;
    return;
  }
  const ranked = [...plans].sort((a, b) => b.roi - a.roi);
  const rank = ranked.findIndex((x) => x.name === p.name) + 1;
  const per = isW5 ? doc.period_w5 : doc.period;
  const nr = isW5 ? doc.n_races_w5 : doc.n_races;
  const period = per && per.from
    ? `参考値・${per.from.slice(5)}〜${per.to.slice(5)}の${nr}レース`
    : '参考値';
  const chip = `<span class="mdlchip${isW5 ? '' : ' w4'}">${isW5 ? 'win-5' : 'win-4'}</span>`;

  const typeRows = TYPE_ORDER.map((ty) => {
    const x = p.by_type[ty];
    if (!x || !x.pt) return '';
    // 的中率は「点」あたり（買った点数のうち何点当たったか）。この表の的中・買った
    // はどちらも点数なので、同じ単位でそろえる。荒れ度べつはレース単位なので別物
    return `<tr><td>${ty}</td>${roiCell(x.ret, x.cost)}`
      + `<td class="sm">${fmtPercent(x.hits / x.pt, 1)}</td>`
      + `<td class="sm">${x.hits}点</td>`
      + `<td class="sm">${x.pt}点</td><td class="sm">${fmtYen(x.cost)}</td>`
      + `<td class="sm">${fmtYen(x.ret)}</td></tr>`;
  }).join('');

  // 週べつ（2026-09-14 追加）。新しい週が上。1週はトップページの開催週と同じ区切り
  const weekRows = (p.by_week || []).map((w) => {
    const [, m, d] = w.from.split('-');
    return `<tr><td>${+m}/${+d}週</td>${roiCell(w.ret, w.cost)}<td class="sm">${w.hitr}R</td>`
      + `<td class="sm">${w.r}R</td><td class="sm">${fmtYen(w.cost)}</td>`
      + `<td class="sm">${fmtYen(w.ret)}</td></tr>`;
  }).join('');

  const upsetRows = UPSET_ORDER.map((u) => {
    const x = p.by_upset[u];
    if (!x) return '';
    return `<tr><td>${u}</td>${roiCell(x.ret, x.cost)}<td class="sm">${x.hitr}R</td>`
      + `<td class="sm">${x.r}R</td><td class="sm">${fmtYen(x.cost)}</td>`
      + `<td class="sm">${fmtYen(x.ret)}</td></tr>`;
  }).join('');

  // 並びは回収率の高い順。レース名からそのレースのページへ飛ぶ
  const hitRows = (p.top_races || []).map((h) => `<tr>
      <td>${h.date.slice(5)} ${escapeHtml(h.track)}${h.race_number}R</td>
      <td class="nm"><a href="race.html?id=${h.race_id}">${escapeHtml(h.race_name)}</a></td>
      ${roiCell(h.ret, h.cost)}
      <td class="sm">${h.points}点</td><td class="sm">${fmtYen(h.ret)}</td></tr>`).join('');
  const rest = (p.n_paid_races || 0) - (p.top_races || []).length;

  const others = plans.filter((x) => x.name !== p.name)
    .map((x) => `<a class="mother" href="model.html?m=${x.slug}">${escapeHtml(x.name)}</a>`).join('');

  el.innerHTML = `
    <div class="mhead">
      <div class="nm">${chip}${escapeHtml(p.name)}<span class="rk">${plans.length}案中${rank}位</span></div>
      <div class="ds">何を見て買うか　<b>${escapeHtml((p.materials || []).join('・'))}</b></div>
      <div class="ds">選び方　${escapeHtml(p.desc || '')}</div>
    </div>
    <div class="mroi">
      <div class="v ${p.roi >= 1 ? 'pos' : 'neg'}">${fmtPercent(p.roi, 1)}</div>
      <div class="s">投資 ${fmtYen(p.cost)} → 払戻 ${fmtYen(p.return)}<br>
        買った ${p.races}レース / ${p.points}点 ・ 的中 ${p.hit_races}レース / ${p.hits}点</div>
    </div>
    <div class="mnote">${escapeHtml(period)}</div>
    <div class="msec">週べつ</div>
    ${table(['週', '回収率', '的中', '買った', '投資', '払戻'], weekRows)}
    <div class="msec">券種べつ</div>
    ${table(['券種', '回収率', '的中率', '的中', '買った', '投資', '払戻'], typeRows)}
    <div class="msec">荒れ度べつ</div>
    ${table(['荒れ度', '回収率', '的中', '買った', '投資', '払戻'], upsetRows)}
    <div class="msec">払戻があったレース</div>
    ${hitRows ? table(['レース', '', '回収率', '買った', '払戻'], hitRows)
      : '<div class="mnote">払戻のあったレースはありません</div>'}
    ${rest > 0 ? `<div class="mnote">ほか${rest}レースでも払戻あり（回収率の高い${(p.top_races || []).length}件だけ表示）</div>` : ''}
    <div class="msec">ほかのモデル</div>
    <div class="mothers">${others}</div>
  `;
}

async function main() {
  renderHeader('model');
  const slug = new URLSearchParams(location.search).get('m') || 'koshu';
  let doc;
  try {
    doc = await getData('data/plans.json');
  } catch (e) {
    document.getElementById('model-content').innerHTML =
      `<div class="error-box">データの読み込みに失敗しました: ${escapeHtml(e.message)}</div>`;
    return;
  }
  const all = [...(doc.plans || []), ...(doc.plans_w5 || [])];
  const hit = all.find((x) => x.slug === slug);
  document.title = `${(hit && hit.name) || SLUG_NAME[slug] || 'モデル'}の成績 — Ans.`;
  render(doc, slug);
}

main();

})();
