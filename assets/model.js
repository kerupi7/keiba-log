// モデル詳細ページ（130-spec §12）
// 一覧の札と「各モデルの成績」の行から model.html?m={slug} で開く。
// データは data/plans.json だけ（manifest.json は読まない。1レース見るのに390KBは重い）。
(function () {

const SLUG_NAME = { tokaido: '東海', koshu: '甲州', nakasendo: '中山',
                    oshu: '奥州', nikko: '日光' };
// 2026-09-15: win-5 の6案に単勝が入ったので先頭に足した（五街道5案には単勝が無いので行が出ないだけ）
// 2026-09-28: win-6 の16券種に複勝が入ったので足した
// 2026-10-07: win-6 のまとめ（w6-all）では100万フラグの3連単を別の行で出す
const TYPE_ORDER = ['単勝', '複勝', 'ワイド', '馬連', '馬単', '三連複', '三連単', '三連単（100万フラグ）'];
const UPSET_ORDER = ['堅い', '中荒れ', '大荒れ'];

// 回収率の色は100円が戻るかどうかで分ける（100%＝ちょうど元手）
function roiCls(ret, cost) {
  const v = cost ? (ret / cost) : 0;
  return v >= 1 ? 'pos' : (ret ? 'neg' : 'zero');
}

function roiCell(ret, cost) {
  return `<td class="${roiCls(ret, cost)}">${fmtPercent(cost ? ret / cost : 0, 1)}</td>`;
}

function yen(v) {
  return `${Number(v || 0).toLocaleString()}<small>円</small>`;
}

function md(iso) {
  const [, m, d] = String(iso).split('-');
  return `${+m}/${+d}`;
}

// 2026-10-07 ユーザー「ここのまとめも同じようなデザインにしてほしい」: 成績ページ（stats.html）と同じ部品。
// 塊ごとに白い角丸のカード、表は灰のタイルの中、数字は Futura（.st26 の指定を使う）
function card(title, body) {
  if (!body) return '';
  return `<section class="st26c"><div class="st26ch"><span class="st26ct">${title}</span></div>${body}</section>`;
}

function table(head, rows) {
  if (!rows) return '';
  return `<div class="st26tw md26"><table><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows}</table></div>`;
}

function render(doc, slug) {
  const el = document.getElementById('model-content');
  // 2026-09-15: win-5 の6案（plans_w5・slug が w5- で始まる）も同じページで開く。
  // 順位・期間・ほかのモデルは、その案が属するまとまりの中で数える
  const isW5 = String(slug).startsWith('w5-');
  // 2026-09-28: win-6 の16券種（案＝荒れ度・slug が w6- で始まる）
  const isW6 = String(slug).startsWith('w6-');
  // 2026-10-07 ユーザー「WIN6は一つにまとめたい」: win-6 は4案を足した1枚（plan_w6_all・w6-all）が表で、4案はその内訳
  const plans = (isW6 ? [doc.plan_w6_all, ...(doc.plans_w6 || [])].filter(Boolean)
    : (isW5 ? doc.plans_w5 : doc.plans)) || [];
  const name = SLUG_NAME[slug];
  const p = plans.find((x) => x.slug === slug) || plans.find((x) => x.name === name);
  if (!p) {
    el.innerHTML = `<div class="error-box">このモデルの成績はまだありません</div>`;
    return;
  }
  const ranked = [...plans].sort((a, b) => b.roi - a.roi);
  const rank = ranked.findIndex((x) => x.name === p.name) + 1;
  const per = isW6 ? doc.period_w6 : (isW5 ? doc.period_w5 : doc.period);
  const nr = isW6 ? doc.n_races_w6 : (isW5 ? doc.n_races_w5 : doc.n_races);
  const bfn = isW5 ? (doc.n_backfilled_w5 || 0) : 0;
  const period = (per && per.from
    ? `参考値・${md(per.from)}〜${md(per.to)}の${nr}レース`
    : '参考値')
    + (bfn ? `（うち${bfn}レースは本番化の日に遡って計算した参考値）` : '');
  const chipTx = isW6 ? 'win-6' : (isW5 ? 'win-5' : 'win-4');
  const label = (x) => (x.slug === 'w6-all' ? 'まとめ' : x.name);

  const typeRows = TYPE_ORDER.map((ty) => {
    const x = p.by_type[ty];
    if (!x || !x.pt) return '';
    // 的中率は「点」あたり（買った点数のうち何点当たったか）。この表の的中・買った
    // はどちらも点数なので、同じ単位でそろえる。荒れ度べつはレース単位なので別物
    // 「三連単（100万フラグ）」は長いので2行に分ける（スマホで表が横にはみ出さないように）
    const m = ty.match(/^(.+?)（(.+)）$/);
    const tyHtml = m ? `${escapeHtml(m[1].replace('三連', '3連'))}<i>${escapeHtml(m[2])}</i>`
      : escapeHtml(ty.replace('三連', '3連'));
    return `<tr><td class="up">${tyHtml}</td>${roiCell(x.ret, x.cost)}`
      + `<td>${fmtPercent(x.hits / x.pt, 1)}</td>`
      + `<td>${x.hits}<small>点</small></td>`
      + `<td>${x.pt}<small>点</small></td><td>${yen(x.cost)}</td>`
      + `<td>${yen(x.ret)}</td></tr>`;
  }).join('');

  // 週べつ（2026-09-14 追加）。新しい週が上。1週はトップページの開催週と同じ区切り
  const weekRows = (p.by_week || []).map((w) => `<tr><td class="up">${md(w.from)}週</td>${roiCell(w.ret, w.cost)}`
    + `<td>${w.hitr}<small>R</small></td><td>${w.r}<small>R</small></td>`
    + `<td>${yen(w.cost)}</td><td>${yen(w.ret)}</td></tr>`).join('');

  const upsetRows = UPSET_ORDER.map((u) => {
    const x = p.by_upset[u];
    if (!x) return '';
    return `<tr><td class="up">${u}</td>${roiCell(x.ret, x.cost)}<td>${x.hitr}<small>R</small></td>`
      + `<td>${x.r}<small>R</small></td><td>${yen(x.cost)}</td><td>${yen(x.ret)}</td></tr>`;
  }).join('');

  // 並びは回収率の高い順。レース名からそのレースのページへ飛ぶ
  const hitRows = (p.top_races || []).map((h) => `<tr>
      <td class="up"><a href="race.html?id=${h.race_id}">${md(h.date)} ${escapeHtml(h.track)}${h.race_number}R<i>${escapeHtml(h.race_name)}</i></a></td>
      ${roiCell(h.ret, h.cost)}
      <td>${h.points}<small>点</small></td><td>${yen(h.ret)}</td></tr>`).join('');
  const rest = (p.n_paid_races || 0) - (p.top_races || []).length;

  // ほかのモデル（win-6 はまとめと4案）：成績ページと同じ一覧の行
  const others = plans.filter((x) => x.name !== p.name).map((x) => `
    <a class="st26r" href="model.html?m=${escapeHtml(x.slug || '')}">
      <span class="l"><span class="nm">${escapeHtml(label(x))}</span>
        <span class="mi">的中 <b>${x.hit_races}</b>R ・ <b>${x.races}</b>R / <b>${x.points.toLocaleString()}</b>点</span></span>
      <span class="rv ${roiCls(x.return, x.cost)}">${(x.roi * 100).toFixed(1)}<small>%</small></span>
      <span class="cv" aria-hidden="true">›</span>
    </a>`).join('');

  el.innerHTML = `
    <section class="st26c">
      <div class="st26ch"><span class="st26chip${chipTx === 'win-4' ? ' w4' : ''}">${chipTx}</span>
        <span class="st26ct md26nm">${escapeHtml(label(p))}</span>
        ${isW6 ? '' : `<span class="md26rk">${plans.length}案中<b>${rank}</b>位</span>`}</div>
      ${(p.materials || []).length ? `<div class="st26per">何を見て買うか　<b>${escapeHtml(p.materials.join('・'))}</b></div>` : ''}
      <div class="st26per">選び方　${escapeHtml(p.desc || '')}</div>
      <div class="st26big">
        <span class="l"><span class="cap">回収率</span>
          <span class="rv ${roiCls(p.return, p.cost)}">${(p.roi * 100).toFixed(1)}<small>%</small></span></span>
        <span class="tiles">
          <span class="tl"><span class="cap">的中</span><b>${p.hit_races}</b>R / <b>${p.hits}</b>点</span>
          <span class="tl"><span class="cap">買った</span><b>${p.races}</b>R / <b>${p.points.toLocaleString()}</b>点</span>
          <span class="tl wide"><span class="cap">投資 → 払戻</span><b>${p.cost.toLocaleString()}</b>円 → <b>${p.return.toLocaleString()}</b>円</span>
        </span>
      </div>
      <div class="st26note">${escapeHtml(period)}</div>
    </section>
    ${card('週べつ', table(['週', '回収率', '的中', '買った', '投資', '払戻'], weekRows))}
    ${card('券種べつ', table(['券種', '回収率', '的中率', '的中', '買った', '投資', '払戻'], typeRows))}
    ${card('荒れ度べつ', table(['荒れ度', '回収率', '的中', '買った', '投資', '払戻'], upsetRows))}
    ${card('払戻があったレース', (hitRows ? table(['レース', '回収率', '買った', '払戻'], hitRows)
      : '<div class="st26note">払戻のあったレースはありません</div>')
      + (rest > 0 ? `<div class="st26note">ほか${rest}レースでも払戻あり（回収率の高い${(p.top_races || []).length}件だけ表示）</div>` : ''))}
    ${card(isW6 ? (slug === 'w6-all' ? '案ごとの内訳' : 'win-6 のまとめ・ほかの案') : 'ほかのモデル',
      others ? `<div class="st26list">${others}</div>` : '')}
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
  const all = [...(doc.plans || []), ...(doc.plans_w5 || []), ...(doc.plans_w6 || []), doc.plan_w6_all].filter(Boolean);
  const hit = all.find((x) => x.slug === slug);
  document.title = `${(hit && hit.name) || SLUG_NAME[slug] || 'モデル'}の成績 — Ans.`;
  render(doc, slug);
}

main();

})();
