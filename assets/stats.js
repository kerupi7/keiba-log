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

// 144-spec「ランクの見どころ」（2026-10-18・見た目は mockup-314）。データは data/rank_record.json（keiba_rank_record.py が夜の settle で作る）。
// ランクのページの札と総合について、S と D で100頭あたり何頭が3着以内に来たかを背比べで出す。押すと S〜D ごとの表が開く。
// 数えた期間は全レース。調教が入るもの（調教の札・状態の段・総合の順位）だけ、調教の表を作った日より後のレース（rec.train）。
const RG_GROUPS = [['馬の力', 'g4'], ['条件', 'g1'], ['状態', 'g5'], ['人と血統', 'g2'], ['コースの傾向', 'g3']];   // yoso.js の M225_GROUPS・M225_GC
const RG_BIG = 25;
const RG_SMALL = 10;   // 差（100頭あたり・丸めた後）の段の境目
const RG_H_MAX = 60;   // 柱の物差し（0〜60頭）。全部の札で同じ
let rgOpen = null;

function rgDate(iso, withYear) {
  const [y, m, d] = String(iso).split('-');
  return withYear ? `${y}/${+m}/${+d}` : `${+m}/${+d}`;
}

function rgItems(rec) {
  const r0 = Math.round;
  const top3 = (g, k) => (g[k] ? g[k][3] : 0);
  const mk = (x) => { const s = top3(x.g, 'S'); const d = top3(x.g, 'D'); return { name: x.name, g: x.g, s, d, dif: r0(s) - r0(d), none: !x.g.S || !x.g.D }; };
  const total = rec.rows.find((x) => x.kind === '総合');
  const T = { name: '総合', label: '総合の順位', g: total.g, s: top3(total.g, '1位'), d: top3(total.g, '7位以下'), isTotal: true };
  T.dif = r0(T.s) - r0(T.d);
  T.none = !total.g['1位'] || !total.g['7位以下'];
  const secs = RG_GROUPS.map(([name, gc]) => {
    const i = rec.rows.findIndex((x) => x.kind === '段' && x.name === name);
    const cards = [];
    for (let j = i + 1; j < rec.rows.length && rec.rows[j].kind === '札'; j += 1) cards.push(mk(rec.rows[j]));
    return { name, gc, grp: mk(rec.rows[i]), cards };
  });
  return { T, secs };
}

// S か D の馬がまだいない札（調教の表を作り直した直後など）は差を出さず「—」で薄く
const rgTier = (it) => (it.none ? 'small' : it.dif < 0 ? 'rev' : it.dif >= RG_BIG ? 'big' : it.dif < RG_SMALL ? 'small' : '');
const rgDifTxt = (it) => (it.none ? '—' : it.dif < 0 ? '逆' : `+${it.dif}`);

function rgDetail(it) {
  const keys = it.isTotal ? ['1位', '2位', '3位', '4〜6位', '7位以下'] : ['S', 'A', 'B', 'C', 'D', '初'];
  const rows = keys.filter((k) => it.g[k]).map((k) => {
    const v = it.g[k];
    const lab = it.isTotal ? `<span class="pl">${k}</span>` : `<span class="rk ${k === '初' ? 'N' : k}">${k}</span>`;
    return `<tr><td>${lab}</td><td class="n">${v[0].toLocaleString('ja-JP')}</td><td>${v[1].toFixed(1)}%</td><td>${v[2].toFixed(1)}%</td><td>${v[3].toFixed(1)}%</td></tr>`;
  }).join('');
  return `<div class="det"><div class="dh">${escapeHtml(it.label || it.name)}<small>×</small></div>
    <table class="rt"><thead><tr><th>${it.isTotal ? '順位' : 'ランク'}</th><th>頭数</th><th>勝率<small>1着</small></th><th>連対率<small>2着以内</small></th><th>3着内率<small>3着以内</small></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

// S と D の柱。D の柱の上に、S の高さまでの点線の箱（＝差）。逆の札は S の柱の上に D までの箱
function rgCols(it) {
  const hs = Math.min(it.s, RG_H_MAX) / RG_H_MAX * 100;
  const hd = Math.min(it.d, RG_H_MAX) / RG_H_MAX * 100;
  const lo = Math.min(hs, hd);
  const hi = Math.max(hs, hd);
  const gapOn = it.dif < 0 ? 's' : 'd';
  const gap = `<i class="gap" style="bottom:${lo}%;height:${hi - lo}%"></i>`;
  return `<div class="cols">
    <span class="c s">${gapOn === 's' ? gap : ''}<em>${Math.round(it.s)}</em><i class="b" style="height:${hs}%"></i></span>
    <span class="c d">${gapOn === 'd' ? gap : ''}<em>${Math.round(it.d)}</em><i class="b" style="height:${hd}%"></i></span></div>`;
}

// 4枚並びの段では、押した札の段（横の4枚）の後ろに表を開く
function rgGrid(cards, n, cell) {
  const oi = cards.findIndex((x) => x.name === rgOpen);
  const after = oi < 0 ? -1 : Math.min(oi - (oi % n) + n - 1, cards.length - 1);
  return cards.map((it, i) => cell(it) + (i === after ? rgDetail(cards[oi]) : '')).join('');
}

function rgDraw(el, rec) {
  const { T, secs } = rgItems(rec);
  const hero = `<div class="hero" data-n="総合"><div class="t">総合の順位<span class="dv">${rgDifTxt(T)}</span></div>
    <div class="colsw">${rgCols(T)}<div class="lab"><span>1位</span><span>7位以下</span></div></div><span class="chev">${rgOpen === '総合' ? '×' : '›'}</span></div>`
    + (rgOpen === '総合' ? rgDetail(T) : '');
  const cell = (it) => `<div class="tw ${rgTier(it)}${rgOpen === it.name ? ' on' : ''}" data-n="${escapeHtml(it.name)}">
    <span class="dv">${rgDifTxt(it)}</span>${rgCols(it)}<span class="nm">${escapeHtml(it.name)}</span></div>`;
  const secHead = (s) => `<div class="sec-h ${s.gc}" data-n="${escapeHtml(s.name)}"><i class="bar"></i><b>${escapeHtml(s.name)}</b>
    <span class="rt2"><span class="pill ${rgTier(s.grp)}">${rgDifTxt(s.grp)}</span><span class="chev">${rgOpen === s.name ? '×' : '›'}</span></span></div>`
    + (rgOpen === s.name ? rgDetail({ ...s.grp, label: `${s.name}（段のランク）` }) : '');
  const tr = rec.train || {};
  el.innerHTML =
    `<div class="top"><span class="ttl">ランクの見どころ</span><span class="meta">${rgDate(rec.from, true)}〜${rgDate(rec.to)}・${rec.horses.toLocaleString('ja-JP')}頭</span></div>
    ${tr.from ? `<div class="per">調教・状態・総合は ${rgDate(tr.from)}〜・${tr.horses.toLocaleString('ja-JP')}頭</div>` : ''}
    <div class="key"><span><i style="background:var(--rS)"></i>S</span><span><i style="background:var(--rD)"></i>D</span><span><i class="gp"></i>差</span><span>100頭あたり3着以内</span></div>`
    + hero + secs.map((s) => `<div class="sec">${secHead(s)}<div class="tgrid">${rgGrid(s.cards, 4, cell)}</div></div>`).join('');
  el.querySelectorAll('[data-n]').forEach((c) => c.addEventListener('click', () => {
    rgOpen = rgOpen === c.dataset.n ? null : c.dataset.n;
    rgDraw(el, rec);
  }));
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
  // ランクの見どころは今のカードの下（144-spec 決め残し イ は仮置き）。表が無い・読めない日はカードごと出さない
  try {
    const rec = await getData('data/rank_record.json');
    if (rec && rec.rows && rec.rows.length) {
      const sec = document.createElement('section');
      sec.className = 'st26c rg26';
      document.getElementById('stats-content').appendChild(sec);
      rgDraw(sec, rec);
    }
  } catch (e) {
    // 無い日は出さないだけ
  }
}

main();

})();
