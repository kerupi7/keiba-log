// 分析ページ：自分の印の傾向（mockup-276 磨き1・2026-10-08 ユーザー「磨き1で実装」）
//
// 何を出すか
//   ・見出しの一文：残す馬を何で決めているか（重く見ている札の上位2つ）
//   ・3行：ほとんど見ていない／もっと見ていい／見すぎかも
//   ・段ごとのカード：▼＝あなたが残した馬の平均、◆＝3着内に来た馬の平均（全レース）
//
// 材料
//   ・自分の印：この端末の localStorage の mymark:{race_id}（race.js の 111-spec）。端末をまたぐ同期はしない
//     ◎○▲△☆✓＝残した、消＝消した。印の無い馬は数えない
//   ・馬ごとの段：data/mymark_grades.json（keiba_mymark_grades.py が夜の一括処理で書き出す。
//     段の付け方は yoso.js の画面と同じ）。レース1件の JSON は約0.8MB あり、印のレースを全部読むと重すぎるため
//
// 物差し（S=5・A=4・B=3・C=2・D=1。「初」と札の無い馬は数えない）
//   あなたの見方の強さ＝残した馬の平均 − 消した馬の平均
//   実際に着順を分けた強さ＝3着内に来た馬の平均 − 4着以下の平均（印と関係なく全レース）
(function () {
  const KEEP = new Set(['◎', '○', '▲', '△', '☆', '✓']);
  const KILL = '消';
  const PT = { S: 5, A: 4, B: 3, C: 2, D: 1 };
  const AI = { S: 5, 'A+': 4.5, A: 4, 'B+': 3.5, B: 3, 'C+': 2.5, C: 2, D: 1, E: 0 };
  // 順位を付ける札の下限。残した・消したの両方がこの頭数に届かない札は順位に入れない
  // （1〜2頭の偏りで「一番重く見ている」が入れ替わらないようにするための代理）
  const MIN_N = 10;
  // 目盛り：[左端の値, 右端の値, 目盛り]。左ほど良い
  const SCALE_SD = [5, 1, [[5, 'S'], [4, 'A'], [3, 'B'], [2, 'C'], [1, 'D']]];
  const SCALES = {
    人気: [1, 13, [[1, '1'], [4, '4'], [7, '7'], [10, '10'], [13, '13〜']]],
    AIの評価: [5, 0, [[5, 'S'], [4, 'A'], [3, 'B'], [2, 'C'], [1, 'D'], [0, 'E']]],
    馬の格: [5, 0.5, [[5, '★5'], [4, '★4'], [3, '★3'], [2, '★2'], [1, '★1']]],
  };
  const EXTRA = ['人気', 'AIの評価', '馬の格'];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const join = (xs) => xs.map(esc).join('・');

  // この端末の印をすべて集める。{race_id: {馬番: 印}}
  function readMarks() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('mymark:')) continue;
        let m = null;
        try { m = JSON.parse(localStorage.getItem(k)); } catch (e) { m = null; }
        if (m && typeof m === 'object' && Object.keys(m).length) out[k.slice(7)] = m;
      }
    } catch (e) { /* 保存が使えない環境では印なし扱い */ }
    return out;
  }

  // 1頭の各項目の値。items の順の段＋人気・AI・★
  function values(row, items) {
    const [s, pop, ai, stars] = row;
    const v = {};
    items.forEach((name, i) => { const p = PT[s[i]]; if (p != null) v[name] = p; });
    if (pop) v['人気'] = Math.min(pop, 13);
    if (AI[ai] != null) v['AIの評価'] = AI[ai];
    if (stars != null) v['馬の格'] = stars;
    return v;
  }

  function collect(data, marks) {
    const recs = [];
    const used = new Set();
    let waiting = 0;
    const dates = [];
    for (const [rid, m] of Object.entries(marks)) {
      const race = data.races[rid];
      if (!race) { waiting += 1; continue; }   // まだ集計に入っていないレース（夜の一括処理で入る）
      let any = false;
      for (const [num, mk] of Object.entries(m)) {
        const kept = KEEP.has(mk) ? true : mk === KILL ? false : null;
        const row = race.h[String(num)];
        if (kept == null || !row) continue;
        recs.push({ kept, v: values(row, data.items) });
        any = true;
      }
      if (any) { used.add(rid); if (race.d) dates.push(race.d); }
    }
    dates.sort();
    return { recs, races: used.size, waiting, d0: dates[0], d1: dates[dates.length - 1] };
  }

  function stats(recs, names) {
    const st = {};
    for (const name of names) {
      const k = [], x = [];
      for (const r of recs) {
        const v = r.v[name];
        if (v == null) continue;
        (r.kept ? k : x).push(v);
      }
      st[name] = { k: mean(k), x: mean(x), nk: k.length, nx: x.length };
    }
    return st;
  }

  // 重く見ている・軽く見ている・もっと見ていい・見すぎかも（札22枚の中で比べる）
  function insight(data, st) {
    const cards = data.cards.map((c) => c[1]).filter((c) =>
      st[c].nk >= MIN_N && st[c].nx >= MIN_N && data.effect[c]);
    const N = cards.length;
    const res = { heavy: [], light: [], more: [], over: [], tag: {}, N };
    if (N < 4) return res;
    const my = Object.fromEntries(cards.map((c) => [c, st[c].k - st[c].x]));
    const ef = Object.fromEntries(cards.map((c) => [c, data.effect[c].top - data.effect[c].oth]));
    const myr = {}, efr = {};
    [...cards].sort((a, b) => my[b] - my[a]).forEach((c, i) => { myr[c] = i + 1; });
    [...cards].sort((a, b) => ef[b] - ef[a]).forEach((c, i) => { efr[c] = i + 1; });
    const gap = Math.max(2, Math.round(N * 5 / 22));       // 順位がこれだけ離れたら「ずれ」とみなす（22札で5つ）
    const k3 = Math.min(3, Math.floor(N / 3));
    res.heavy = [...cards].sort((a, b) => my[b] - my[a]).slice(0, k3);
    res.light = [...cards].sort((a, b) => my[a] - my[b]).filter((c) => !res.heavy.includes(c)).slice(0, k3);
    // もっと見ていい：実際は上半分なのに、あなたの順位が gap 以上低い札。
    //   ただし▼がすでに◆より厳しい側にある札は外す（画面の▼◆と言っていることが食い違うため・mockup-276 で確認）
    res.more = cards.filter((c) => efr[c] <= Math.ceil(N / 2) && myr[c] - efr[c] >= gap && st[c].k < data.effect[c].top + 0.1)
      .sort((a, b) => (efr[a] - myr[a]) - (efr[b] - myr[b])).slice(0, 3);
    // 見すぎかも：あなたは上位なのに、実際は gap 以上低い札で、▼が◆より厳しい側にあるもの
    res.over = cards.filter((c) => myr[c] <= Math.ceil(N * 8 / 22) && efr[c] - myr[c] >= gap && st[c].k > data.effect[c].top)
      .sort((a, b) => (myr[a] - efr[a]) - (myr[b] - efr[b])).slice(0, 3);
    for (const c of res.heavy) res.tag[c] = ['heavy', '重視'];
    for (const c of res.light) res.tag[c] = ['light', '軽視'];
    for (const c of res.over) res.tag[c] = ['over', '見すぎ'];
    for (const c of res.more) res.tag[c] = ['more', 'もっと'];
    return res;
  }

  const scaleOf = (name) => SCALES[name] || SCALE_SD;
  function pos(name, v) {
    const [lo, hi] = scaleOf(name);
    return Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));
  }
  // 平均を言葉にする。S〜Dは A− のように、人気は 4.3番人気、★は ★2.8
  function label(name, v) {
    if (v == null) return '–';
    if (name === '人気') return `${v.toFixed(1)}<i>番人気</i>`;
    if (name === '馬の格') return `★${v.toFixed(1)}`;
    const NM = { 5: 'S', 4: 'A', 3: 'B', 2: 'C', 1: 'D', 0: 'E' };
    const r = Math.round(v * 3) / 3;
    const b = Math.round(r);
    const d = r - b;
    return (NM[b] || 'D') + (d > 0.1 ? '+' : d < -0.1 ? '−' : '');
  }

  function track(name, s, top, big) {
    const tk = EXTRA.includes(name)
      ? scaleOf(name)[2].map(([v, l]) => `<span class="tk" style="left:${pos(name, v).toFixed(1)}%">${l}</span>`).join('') : '';
    const me = s.k != null ? `<span class="me" style="left:${pos(name, s.k).toFixed(1)}%"></span>` : '';
    const ac = top != null ? `<span class="ac" style="left:${pos(name, top).toFixed(1)}%"></span>` : '';
    return `<div class="an-trk${big ? ' big' : ''}"><div class="bar"></div>${me}${ac}${tk}</div>`;
  }
  const AXIS = '<div class="an-ax"><span>S</span><span>A</span><span>B</span><span>C</span><span>D</span></div>';

  function row(data, st, ins, name, isCard) {
    const s = st[name];
    const top = (data.effect[name] || {}).top;
    const t = isCard ? ins.tag[name] : null;
    const chip = t ? `<span class="an-chip ${t[0]}">${t[1]}</span>` : '';
    return `<div class="an-rw${s.k == null ? ' nd' : ''}"><div class="rl"><span class="nm">${esc(name)}</span>${chip}</div>`
      + `${track(name, s, top, false)}<span class="vl n">${label(name, s.k)}</span></div>`;
  }

  function render(el, data, marks) {
    const c = collect(data, marks);
    if (!c.recs.length) {
      el.innerHTML = `<div class="an-hero an-empty"><div class="an-ey">あなたの見方</div><h1 class="sm">まだ数えられる印がありません。</h1>
<p>レースの画面で馬に✓（残す）や消を付けると、ここに「何を見て残しているか」が出ます。</p>
<p>印はこの端末の中だけに保存されています。別の端末で付けた印は数えられません。</p>
${c.waiting ? `<p class="an-note">印を付けたレースが ${c.waiting} 件あります。夜の集計のあとに数えられるようになります。</p>` : ''}</div>`;
      return;
    }
    const names = [...data.items, ...EXTRA];
    const st = stats(c.recs, names);
    const ins = insight(data, st);
    const nk = c.recs.filter((r) => r.kept).length, nx = c.recs.length - nk;
    const head = ins.heavy.length >= 2
      ? `<h1>残す馬は<em class="c-heavy">${join(ins.heavy.slice(0, 2))}</em>で決めています。</h1>`
      : '<h1 class="sm">印がもう少したまると、何を見て残しているかが出ます。</h1>';
    const dl = ins.heavy.length >= 2 ? `<dl>
<div><dt class="c-light">ほとんど見ていない</dt><dd>${join(ins.light)}</dd></div>
<div><dt class="c-more">もっと見ていい</dt>${ins.more.length ? `<dd>${join(ins.more)}</dd>` : '<dd class="none">今はありません</dd>'}</div>
${ins.over.length ? `<div><dt class="c-over">見すぎかも</dt><dd>${join(ins.over)}</dd></div>` : ''}</dl>` : '';
    const span = c.d0 ? `<span class="sep">｜</span>${c.d0.slice(5).replace('-', '/')}〜${c.d1.slice(5).replace('-', '/')}` : '';
    const meta = `<div class="an-meta"><span class="n">${c.races}</span>レース・残した <span class="n">${nk}</span>頭・消した <span class="n">${nx}</span>頭${span}</div>`;
    const wait = c.waiting ? `<p class="an-note">ほかに印を付けたレースが ${c.waiting} 件あります。夜の集計のあとに数えられるようになります。</p>` : '';
    const out = [`<div class="an-hero"><div class="an-ey">あなたの見方</div>${head}${dl}${meta}${wait}</div>`,
      '<div class="an-lg"><span><i class="me"></i>あなたが残した馬の平均</span><span><i class="ac"></i>3着内に来た馬の平均</span></div>'];
    data.groups.forEach((g, gi) => {
      const s = st[g];
      const top = (data.effect[g] || {}).top;
      const rows = data.cards.filter((x) => x[0] === g).map((x) => row(data, st, ins, x[1], true)).join('');
      out.push(`<details class="an-cd"${gi === 0 ? ' open' : ''}><summary><div class="an-ct"><b>${esc(g)}</b><span class="big n">${label(g, s.k)}</span></div>`
        + `${track(g, s, top, true)}${AXIS}</summary><div class="an-cin">${rows}</div></details>`);
    });
    out.push(`<details class="an-cd"><summary><div class="an-ct"><b>人気・AI</b><span class="sub">参考</span></div></summary>`
      + `<div class="an-cin">${EXTRA.map((n) => row(data, st, ins, n, false)).join('')}</div></details>`);
    out.push(`<p class="an-foot">◆と「もっと見ていい」は、印と関係なく結果の出た ${data.effect_races} レースの着順から出しています（払い戻しの額は見ていません）。`
      + `人気・AIは、重く見ている・もっと見ていいの判定に入れていません。印はこの端末の中だけを数えています。</p>`);
    el.innerHTML = out.join('');
  }

  async function main() {
    renderHeader('analysis');
    const el = document.getElementById('an-content');
    try {
      const data = await getData('data/mymark_grades.json');
      render(el, data, readMarks());
    } catch (e) {
      el.innerHTML = '<p class="an-err">データを読み込めませんでした。時間をおいて開き直してください。</p>';
    }
  }
  main();
})();
