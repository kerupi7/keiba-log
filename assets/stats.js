// 各モデルの成績ページ（2026-09-15 ユーザー決定・mockup-168 ②）
// メニューの「成績」から開く。上から win-6（1枚にまとめた成績）、win-5 の6案、win-4 の五街道5案。
// 2026-10-07: TOP・レース詳細と同じ見た目（灰の地・白い角丸のカード・数字は Futura）にした（ユーザー「他の場所と同じように」）。
// データは data/plans.json（plans＝win-4、plans_w5＝win-5、plan_w6_all＝win-6 のまとめ）と data/w6_reference.json（参考）。行を押すとモデル詳細へ。
(function () {

function md(iso) {
  const [, m, d] = String(iso).split('-');
  return `${+m}/${+d}`;
}

function periodText(period, n) {
  return period && period.from
    ? `${md(period.from)}〜${md(period.to)}の${n}レース`
    : '';
}

// 回収率の色は100円が戻るかどうかで分ける（100%＝ちょうど元手）。払戻0は灰
function roiClass(p) {
  return p.roi >= 1 ? 'pos' : (p.return ? 'neg' : 'zero');
}

function roiNum(p) {
  return `<span class="rv ${roiClass(p)}">${(p.roi * 100).toFixed(1)}<small>%</small></span>`;
}

function card(chip, title, period, body, foot) {
  return `<section class="st26c">
    <div class="st26ch"><span class="st26chip${chip === 'win-4' ? ' w4' : ''}">${chip}</span>
      <span class="st26ct">${escapeHtml(title)}</span></div>
    ${period ? `<div class="st26per">${escapeHtml(period)}</div>` : ''}
    ${body}${foot || ''}
  </section>`;
}

// 案の一覧：左に名前と的中・買った、右に回収率（回収率の高い順）。行を押すとモデル詳細へ
function planList(plans) {
  const rows = [...plans].sort((a, b) => b.roi - a.roi).map((p) => `
    <a class="st26r" href="model.html?m=${escapeHtml(p.slug || '')}">
      <span class="l"><span class="nm">${escapeHtml(p.name)}</span>
        <span class="mi">的中 <b>${p.hit_races}</b>R ・ <b>${p.races}</b>R / <b>${p.points.toLocaleString()}</b>点</span></span>
      ${roiNum(p)}<span class="cv" aria-hidden="true">›</span>
    </a>`).join('');
  return `<div class="st26list">${rows}</div>`;
}

// 2026-10-07 ユーザー「WIN6は一つにまとめたい」: 荒れ度の3案＋100万フラグを足し合わせた1枚（plan_w6_all）
function w6Total(p) {
  return `<a class="st26big" href="model.html?m=${escapeHtml(p.slug || 'w6-all')}">
    <span class="l"><span class="cap">回収率</span>${roiNum(p)}</span>
    <span class="tiles">
      <span class="tl"><span class="cap">的中</span><b>${p.hit_races}</b>R</span>
      <span class="tl"><span class="cap">買った</span><b>${p.races}</b>R / <b>${p.points.toLocaleString()}</b>点</span>
      <span class="tl wide"><span class="cap">投資 → 払戻</span><b>${p.cost.toLocaleString()}</b>円 → <b>${p.return.toLocaleString()}</b>円</span>
    </span>
    <span class="cv" aria-hidden="true">›</span>
  </a>`;
}

// 2026-09-15: win-5 の成績のうち、本番化の日に遡って計算したレースの件数と期間
function backfillNote(doc) {
  const n = doc.n_backfilled_w5 || 0;
  const p = doc.backfill_period_w5;
  if (!n || !p || !p.from) return '';
  return `<div class="st26note">うち${n}レース（${md(p.from)}〜${md(p.to)}）は、`
    + '本番化の日（9/15）に発走前のオッズで遡って計算した参考値です。当日は出していません。</div>';
}

// 2026-09-28: win-6 の券種の「過去の答え合わせ」（09-30 から17券種）（参考・data/w6_reference.json）。
// 決め方を選ぶのに使った期間の数字なので、本番の記録（上の数字）とは混ぜない（handoff_2026-09-28_win6-betrule-ans.md 決定4）
function w6RefBox(ref) {
  if (!ref || !Array.isArray(ref.rows) || !ref.rows.length) return '';
  const ys = ref.years || [];
  const head = ['荒れ度', '券種', ...ys.map((y) => `${y}年`)].map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  let prev = '';
  const rows = ref.rows.map((r) => {
    const up = r.upset !== prev ? escapeHtml(r.upset) : '';
    prev = r.upset;
    const cells = ys.map((y) => {
      const v = (r.by_year || {})[y];
      if (!v || !v.cost) return '<td class="zero">-</td>';
      const cls = v.ret >= v.cost ? 'pos' : (v.ret ? 'neg' : 'zero');
      return `<td class="${cls}">${Math.round(v.ret / v.cost * 100)}円</td>`;
    }).join('');
    return `<tr${up ? ' class="g"' : ''}><td class="up">${up}</td><td class="ty">${escapeHtml(r.type.replace('三連', '3連'))}</td>${cells}</tr>`;
  }).join('');
  return `<details class="st26ref"><summary>参考：過去のレースでの答え合わせ<i>${escapeHtml(ref.period || '')}</i></summary>
    ${ref.note ? `<div class="st26note">${escapeHtml(ref.note)}</div>` : ''}
    <div class="st26tw"><table><tr>${head}</tr>${rows}</table></div></details>`;
}

function render(doc, ref) {
  const el = document.getElementById('stats-content');
  const w6 = doc.plan_w6_all;
  const w5 = doc.plans_w5 || [];
  const w4 = doc.plans || [];
  el.innerHTML = `
    <div class="st26h"><h1>各モデルの成績</h1><p>参考値。1点100円で買ったとして数えた</p></div>
    ${card('win-6', '荒れ度ごとの17券種＋100万フラグの3連単',
      periodText(doc.period_w6, doc.n_races_w6) || '載せた日から記録',
      w6 && w6.races ? w6Total(w6)
        : '<div class="st26note">載せた日から数え始めます。まだ結果の出たレースがありません。</div>',
      w6RefBox(ref))}
    ${card('win-5', w5.length ? `${w5.length}案` : '',
      periodText(doc.period_w5, doc.n_races_w5) || 'いまの本番の勝率',
      w5.length ? planList(w5)
        : '<div class="st26note">win-5 に切り替えた日から数え始めます。まだ結果の出たレースがありません。</div>',
      backfillNote(doc))}
    ${card('win-4', `五街道${w4.length}案`, periodText(doc.period, doc.n_races),
      w4.length ? planList(w4) : '<div class="st26note">記録がありません</div>')}
  `;
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
  // 過去の答え合わせは無くても成績ページは出す（参考の箱が出ないだけ）
  let ref = null;
  try {
    ref = await getData('data/w6_reference.json');
  } catch (e) {
    ref = null;
  }
  render(doc, ref);
}

main();

})();
