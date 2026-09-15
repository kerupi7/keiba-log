// 各モデルの成績ページ（2026-09-15 ユーザー決定・mockup-168 ②）
// メニューの「成績」から開く。上に win-5 の6案、下に win-4 の五街道5案。
// データは data/plans.json だけ（plans＝win-4、plans_w5＝win-5）。行を押すとモデル詳細へ。
(function () {

function periodText(period, n) {
  return period && period.from
    ? `${period.from.slice(5)}〜${period.to.slice(5)}の${n}レース`
    : '';
}

function roiCell(p) {
  const cls = p.roi >= 1 ? 'pos' : (p.return ? 'neg' : 'zero');
  return `<td class="${cls}">${fmtPercent(p.roi, 1)}</td>`;
}

function groupTable(plans) {
  const rows = [...plans].sort((a, b) => b.roi - a.roi).map((p) => `
    <tr class="mrow" data-slug="${escapeHtml(p.slug || '')}">
      <td><a href="model.html?m=${escapeHtml(p.slug || '')}">${escapeHtml(p.name)}</a></td>
      ${roiCell(p)}
      <td class="sm">${p.hit_races}R</td>
      <td class="sm">${p.races}R / ${p.points}点</td>
      <td class="sm">›</td>
    </tr>`).join('');
  return `<table class="mt"><tr><th>案</th><th>回収率</th><th>的中</th><th>買った</th><th></th></tr>${rows}</table>`;
}

// 2026-09-15: win-5 の成績のうち、本番化の日に遡って計算したレースの件数と期間
function backfillNote(doc) {
  const n = doc.n_backfilled_w5 || 0;
  const p = doc.backfill_period_w5;
  if (!n || !p || !p.from) return '';
  return `<div class="mnote">うち${n}レース（${p.from.slice(5)}〜${p.to.slice(5)}）は、`
    + '本番化の日（9/15）に発走前のオッズで遡って計算した参考値です。当日は出していません。</div>';
}

function render(doc) {
  const el = document.getElementById('stats-content');
  const w5 = doc.plans_w5 || [];
  const w4 = doc.plans || [];
  const w5period = periodText(doc.period_w5, doc.n_races_w5);
  const w4period = periodText(doc.period, doc.n_races);
  el.innerHTML = `
    <div class="mhead"><div class="nm">各モデルの成績</div>
      <div class="ds">参考値。1点100円で買ったとして数えた</div></div>
    <div class="msec"><span class="mdlchip">win-5</span>${w5.length ? `${w5.length}案` : ''}
      <span class="msecnote">${escapeHtml(w5period || 'いまの本番の勝率')}</span></div>
    ${w5.length ? groupTable(w5)
      : '<div class="mnote">win-5 に切り替えた日から数え始めます。まだ結果の出たレースがありません。</div>'}
    ${backfillNote(doc)}
    <div class="msec"><span class="mdlchip w4">win-4</span>五街道${w4.length}案
      <span class="msecnote">${escapeHtml(w4period)}</span></div>
    ${w4.length ? groupTable(w4) : '<div class="mnote">記録がありません</div>'}
  `;
  // 行のどこを押してもモデル詳細へ（案名のリンクだけだと的が小さい）
  el.addEventListener('click', (ev) => {
    if (ev.target.closest('a')) return;
    const row = ev.target.closest('tr.mrow');
    if (row && row.dataset.slug) location.href = `model.html?m=${row.dataset.slug}`;
  });
}

async function main() {
  renderHeader('stats');
  let doc;
  try {
    doc = await getData('data/plans.json');
  } catch (e) {
    document.getElementById('stats-content').innerHTML =
      `<div class="error-box">データの読み込みに失敗しました: ${escapeHtml(e.message)}</div>`;
    return;
  }
  render(doc);
}

main();

})();
