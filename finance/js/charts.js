// charts.js — 依存なしの軽量SVGチャート（折れ線・棒・ドーナツ）
// Apple純正アプリのような、余白の効いた見やすいデザインを目指す。
// 返り値はSVG文字列。UI側で innerHTML に流し込む。

const NS = 'http://www.w3.org/2000/svg';
const fmtShort = (n) => {
  const a = Math.abs(n);
  if (a >= 1e8) return (n / 1e8).toFixed(a % 1e8 === 0 ? 0 : 1) + '億';
  if (a >= 1e4) return Math.round(n / 1e4) + '万';
  return Math.round(n).toLocaleString();
};

// 現在の資産規模（absMax）に合わせて縦軸の単位を選び、目盛り間隔（range）に応じて小数桁を決める。
// ズームで範囲が狭いときも各目盛りが同じ値に潰れないよう桁を増やし、読みやすい金額表示にする。
function makeAxisFmt(min, max) {
  const range = Math.abs(max - min) || 1;
  const absMax = Math.max(Math.abs(min), Math.abs(max));
  if (absMax >= 1e8) {
    const dec = range < 1e7 ? 2 : range < 5e7 ? 1 : 0;
    return (v) => (v / 1e8).toFixed(dec) + '億';
  }
  if (absMax >= 1e4) {
    const dec = range < 1e4 ? 2 : range < 1e5 ? 1 : 0;
    return (v) => {
      const val = v / 1e4;
      return (dec === 0 ? Math.round(val).toLocaleString() : val.toFixed(dec)) + '万';
    };
  }
  return (v) => Math.round(v).toLocaleString();
}

// x軸ラベルを出すインデックス集合。等間隔に間引きつつ末尾も必ず表示するが、
// 末尾が直前の目盛りと近すぎる（間隔の半分未満）ときはその手前を落として文字の重なりを防ぐ。
function axisTicks(len, step) {
  const st = Math.max(1, Math.round(step) || 1);
  const keep = new Set();
  for (let i = 0; i < len; i += st) keep.add(i);
  const last = len - 1;
  if (last >= 0 && !keep.has(last)) {
    const prev = Math.floor(last / st) * st;
    if (last - prev < st / 2) keep.delete(prev);
    keep.add(last);
  }
  return keep;
}

// ===== 折れ線グラフ（資産推移・収支推移） =====
// data: [{label, value}] , opts: {height, color, fill, area}
export function lineChart(data, opts = {}) {
  const w = opts.width || 640;
  const h = opts.height || 220;
  const spark = opts.spark; // 軸・グリッド・目盛りを省いたミニ折れ線
  const pad = spark ? { t: 8, r: 6, b: 8, l: 6 } : { t: 16, r: 14, b: 26, l: 46 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  if (!data.length) return `<svg viewBox="0 0 ${w} ${h}"></svg>`;

  const vals = data.map((d) => d.value);
  let min = Math.min(...vals, 0);
  let max = Math.max(...vals);
  if (min === max) max = min + 1;
  const pxr = 0.06 * (max - min);
  max += pxr;
  const x = (i) => pad.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v) => pad.t + ih - ((v - min) / (max - min)) * ih;

  const color = opts.color || '#0a84ff';
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  const areaPath = `M ${x(0)},${y(data[0].value)} ` + data.map((d, i) => `L ${x(i)},${y(d.value)}`).join(' ') +
    ` L ${x(data.length - 1)},${pad.t + ih} L ${x(0)},${pad.t + ih} Z`;

  const gid = 'g' + Math.random().toString(36).slice(2, 6);
  // Y軸グリッド・軸ラベル・X軸ラベル・データ点（spark時は省略）
  let grid = '', xl = '', dots = '';
  if (!spark) {
    for (let k = 0; k <= 4; k++) {
      const v = min + ((max - min) * k) / 4;
      const yy = y(v);
      grid += `<line x1="${pad.l}" y1="${yy}" x2="${w - pad.r}" y2="${yy}" class="fc-grid"/>`;
      grid += `<text x="${pad.l - 6}" y="${yy + 3}" class="fc-axis" text-anchor="end">${fmtShort(v)}</text>`;
    }
    const step = Math.ceil(data.length / 6);
    // 末尾のラベルは必ず出すが、直前の目盛りと近すぎる場合は重なるので省く
    const keep = axisTicks(data.length, step);
    data.forEach((d, i) => {
      if (keep.has(i))
        xl += `<text x="${x(i)}" y="${h - 8}" class="fc-axis" text-anchor="middle">${d.label}</text>`;
    });
    if (data.length <= 14)
      dots = data.map((d, i) => `<circle cx="${x(i)}" cy="${y(d.value)}" r="3" fill="${color}"/>`).join('');
  }

  return `<svg viewBox="0 0 ${w} ${h}" class="fc-svg" preserveAspectRatio="none">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid}
    <path d="${areaPath}" fill="url(#${gid})"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}${xl}
  </svg>`;
}

// ===== 棒グラフ（収入・支出推移／カテゴリー別） =====
// data: [{label, value, color?}] , opts:{height, twoTone:{income,expense}}
export function barChart(data, opts = {}) {
  const w = opts.width || 640;
  const h = opts.height || 220;
  const pad = { t: 16, r: 14, b: 30, l: 46 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  if (!data.length) return `<svg viewBox="0 0 ${w} ${h}"></svg>`;
  const max = Math.max(...data.map((d) => d.value), 1);
  const y = (v) => pad.t + ih - (v / max) * ih;
  const bw = (iw / data.length) * 0.56;
  const gap = iw / data.length;

  let grid = '';
  for (let k = 0; k <= 4; k++) {
    const v = (max * k) / 4;
    const yy = y(v);
    grid += `<line x1="${pad.l}" y1="${yy}" x2="${w - pad.r}" y2="${yy}" class="fc-grid"/>`;
    grid += `<text x="${pad.l - 6}" y="${yy + 3}" class="fc-axis" text-anchor="end">${fmtShort(v)}</text>`;
  }
  let bars = '';
  data.forEach((d, i) => {
    const cx = pad.l + gap * i + gap / 2;
    const bh = Math.max(0, pad.t + ih - y(d.value));
    const col = d.color || opts.color || '#0a84ff';
    bars += `<rect x="${cx - bw / 2}" y="${y(d.value)}" width="${bw}" height="${bh}" rx="5" fill="${col}"/>`;
    bars += `<text x="${cx}" y="${h - 10}" class="fc-axis" text-anchor="middle">${d.label}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" class="fc-svg" preserveAspectRatio="none">${grid}${bars}</svg>`;
}

// 収入・支出のグループ棒（2系列）
export function groupedBarChart(data, opts = {}) {
  const w = opts.width || 640, h = opts.height || 230;
  const pad = { t: 16, r: 14, b: 30, l: 46 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  if (!data.length) return `<svg viewBox="0 0 ${w} ${h}"></svg>`;
  const max = Math.max(...data.flatMap((d) => [d.income, d.expense]), 1);
  const y = (v) => pad.t + ih - (v / max) * ih;
  const gap = iw / data.length;
  const bw = Math.min(18, (gap * 0.7) / 2);
  let grid = '';
  for (let k = 0; k <= 4; k++) {
    const v = (max * k) / 4, yy = y(v);
    grid += `<line x1="${pad.l}" y1="${yy}" x2="${w - pad.r}" y2="${yy}" class="fc-grid"/>`;
    grid += `<text x="${pad.l - 6}" y="${yy + 3}" class="fc-axis" text-anchor="end">${fmtShort(v)}</text>`;
  }
  let bars = '';
  data.forEach((d, i) => {
    const cx = pad.l + gap * i + gap / 2;
    const yi = y(d.income), ye = y(d.expense);
    bars += `<rect x="${cx - bw - 2}" y="${yi}" width="${bw}" height="${pad.t + ih - yi}" rx="4" fill="#34c759"/>`;
    bars += `<rect x="${cx + 2}" y="${ye}" width="${bw}" height="${pad.t + ih - ye}" rx="4" fill="#ff453a"/>`;
    bars += `<text x="${cx}" y="${h - 10}" class="fc-axis" text-anchor="middle">${d.label}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" class="fc-svg" preserveAspectRatio="none">${grid}${bars}</svg>`;
}

// ===== ドーナツグラフ（支出割合） =====
// data: [{label, value, color}]
export function donutChart(data, opts = {}) {
  const size = opts.size || 200;
  const r = size / 2;
  const thick = opts.thick || 30;
  const cx = r, cy = r;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return `<svg viewBox="0 0 ${size} ${size}"><circle cx="${cx}" cy="${cy}" r="${r - thick / 2}" fill="none" stroke="var(--fc-line)" stroke-width="${thick}"/></svg>`;
  let a0 = -Math.PI / 2;
  const rr = r - thick / 2;
  let arcs = '';
  for (const d of data) {
    const frac = d.value / total;
    const a1 = a0 + frac * Math.PI * 2;
    const large = frac > 0.5 ? 1 : 0;
    const x0 = cx + rr * Math.cos(a0), y0 = cy + rr * Math.sin(a0);
    const x1 = cx + rr * Math.cos(a1), y1 = cy + rr * Math.sin(a1);
    if (frac >= 0.999) {
      arcs += `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="${d.color}" stroke-width="${thick}"/>`;
    } else {
      arcs += `<path d="M ${x0} ${y0} A ${rr} ${rr} 0 ${large} 1 ${x1} ${y1}" fill="none" stroke="${d.color}" stroke-width="${thick}" stroke-linecap="butt"/>`;
    }
    a0 = a1;
  }
  const center = opts.centerLabel
    ? `<text x="${cx}" y="${cy - 4}" text-anchor="middle" class="fc-donut-sub">${opts.centerLabel}</text>
       <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="fc-donut-main">${fmtShort(total)}</text>`
    : '';
  return `<svg viewBox="0 0 ${size} ${size}" class="fc-donut">${arcs}${center}</svg>`;
}

// ===== 複数系列の折れ線グラフ（将来資産シミュレーション：総資産・現金・元本・評価額などの重ね表示） =====
// seriesList: [{label, color, data:[{label,value}], dashed?}]（表示するものだけ渡す）
export function multiLineChart(seriesList, opts = {}) {
  const w = opts.width || 640;
  const h = opts.height || 240;
  const pad = { t: 16, r: 14, b: 26, l: 50 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const visible = seriesList.filter((s) => s.data && s.data.length);
  if (!visible.length) return `<svg viewBox="0 0 ${w} ${h}"></svg>`;

  const allVals = visible.flatMap((s) => s.data.map((d) => d.value));
  let min = Math.min(...allVals, 0);
  let max = Math.max(...allVals);
  if (min === max) max = min + 1;
  const pxr = 0.08 * (max - min);
  max += pxr;
  if (min < 0) min -= pxr;
  const first = visible[0].data;
  const x = (i) => pad.l + (first.length === 1 ? iw / 2 : (i / (first.length - 1)) * iw);
  const y = (v) => pad.t + ih - ((v - min) / (max - min)) * ih;

  let grid = '';
  for (let k = 0; k <= 4; k++) {
    const v = min + ((max - min) * k) / 4;
    const yy = y(v);
    grid += `<line x1="${pad.l}" y1="${yy}" x2="${w - pad.r}" y2="${yy}" class="fc-grid"/>`;
    grid += `<text x="${pad.l - 6}" y="${yy + 3}" class="fc-axis" text-anchor="end">${fmtShort(v)}</text>`;
  }
  let xl = '';
  const step = Math.ceil(first.length / 6);
  const keep = axisTicks(first.length, step);
  first.forEach((d, i) => {
    if (keep.has(i))
      xl += `<text x="${x(i)}" y="${h - 8}" class="fc-axis" text-anchor="middle">${d.label}</text>`;
  });
  const zeroLine = (min < 0 && max > 0)
    ? `<line x1="${pad.l}" y1="${y(0)}" x2="${w - pad.r}" y2="${y(0)}" class="fc-grid" stroke-dasharray="3 3"/>` : '';

  let lines = '';
  for (const s of visible) {
    const pts = s.data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
    lines += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.5}" stroke-linecap="round" stroke-linejoin="round"${s.dashed ? ' stroke-dasharray="5 4"' : ''}/>`;
  }

  // 選択位置のマーカー（長押しで日付別詳細を表示するとき、選択中の点を縦線で示す）
  let marker = '';
  if (opts.markerIndex != null && opts.markerIndex >= 0 && opts.markerIndex < first.length) {
    const mx = x(opts.markerIndex);
    marker = `<line x1="${mx}" y1="${pad.t}" x2="${mx}" y2="${pad.t + ih}" class="fc-ml-marker"/>`;
    for (const s of visible) {
      const v = s.data[opts.markerIndex];
      if (v && v.value != null) marker += `<circle cx="${mx}" cy="${y(v.value)}" r="3.6" fill="${s.color}"/>`;
    }
  }
  // 長押し・タップ判定用の透明な当たり領域（各サンプル点にdata-i）。最前面に置く。
  let hits = '';
  if (opts.hit) {
    const bw = first.length > 1 ? iw / (first.length - 1) : iw;
    for (let i = 0; i < first.length; i++) {
      const cx = x(i);
      hits += `<rect class="fc-ml-hit" data-i="${i}" x="${cx - bw / 2}" y="${pad.t}" width="${bw}" height="${ih}" fill="transparent"/>`;
    }
  }
  return `<svg viewBox="0 0 ${w} ${h}" class="fc-svg fc-multiline" preserveAspectRatio="none">${grid}${zeroLine}${marker}${lines}${xl}${hits}</svg>`;
}

// ===== モンテカルロ用ファンチャート（中央値・90%範囲・最悪/最高ケース） =====
// data: [{label, median, p5, p95, min, max}]
export function fanChart(data, opts = {}) {
  const w = opts.width || 640;
  const h = opts.height || 240;
  const pad = { t: 16, r: 14, b: 26, l: 50 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  if (!data.length) return `<svg viewBox="0 0 ${w} ${h}"></svg>`;

  const allVals = data.flatMap((d) => [d.min, d.max]);
  let min = Math.min(...allVals, 0);
  let max = Math.max(...allVals);
  if (min === max) max = min + 1;
  const pxr = 0.08 * (max - min);
  max += pxr;
  if (min < 0) min -= pxr;
  const x = (i) => pad.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v) => pad.t + ih - ((v - min) / (max - min)) * ih;
  const color = opts.color || '#0a84ff';

  let grid = '';
  for (let k = 0; k <= 4; k++) {
    const v = min + ((max - min) * k) / 4;
    const yy = y(v);
    grid += `<line x1="${pad.l}" y1="${yy}" x2="${w - pad.r}" y2="${yy}" class="fc-grid"/>`;
    grid += `<text x="${pad.l - 6}" y="${yy + 3}" class="fc-axis" text-anchor="end">${fmtShort(v)}</text>`;
  }
  let xl = '';
  const step = Math.ceil(data.length / 6);
  data.forEach((d, i) => {
    if (i % step === 0 || i === data.length - 1)
      xl += `<text x="${x(i)}" y="${h - 8}" class="fc-axis" text-anchor="middle">${d.label}</text>`;
  });

  const top = data.map((d, i) => `${x(i)},${y(d.p95)}`);
  const bottom = data.map((d, i) => `${x(i)},${y(d.p5)}`).reverse();
  const bandPath = `M ${top.join(' L ')} L ${bottom.join(' L ')} Z`;
  const medianPts = data.map((d, i) => `${x(i)},${y(d.median)}`).join(' ');
  const minPts = data.map((d, i) => `${x(i)},${y(d.min)}`).join(' ');
  const maxPts = data.map((d, i) => `${x(i)},${y(d.max)}`).join(' ');

  return `<svg viewBox="0 0 ${w} ${h}" class="fc-svg fc-fan" preserveAspectRatio="none">
    ${grid}
    <path d="${bandPath}" fill="${color}" opacity="0.16"/>
    <polyline points="${maxPts}" fill="none" stroke="${color}" stroke-width="1.4" stroke-dasharray="3 4" opacity="0.55"/>
    <polyline points="${minPts}" fill="none" stroke="${color}" stroke-width="1.4" stroke-dasharray="3 4" opacity="0.55"/>
    <polyline points="${medianPts}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    ${xl}
  </svg>`;
}

// ===== 投資実績＋将来予測グラフ =====
// 過去の実績（実線）と今日以降の予測（破線）を1本の時間軸で連続表示する。
// points: [{label}]（x軸・タップ判定用）、series: [{label,color,values:[n|null...],width?}]
// opts.boundaryIndex: 実績と予測の境界（この点までが実績＝実線、以降は予測＝破線）
export function perfChart(points, series, opts = {}) {
  const w = opts.width || 640;
  const h = opts.height || 240;
  const pad = { t: 18, r: 14, b: 26, l: 52 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const N = points.length;
  const drawn = series.filter((s) => s.values.some((v) => v != null));
  if (!N || !drawn.length) return `<svg viewBox="0 0 ${w} ${h}"></svg>`;
  const boundary = Math.max(0, Math.min(N - 1, opts.boundaryIndex == null ? N - 1 : opts.boundaryIndex));

  const allVals = drawn.flatMap((s) => s.values.filter((v) => v != null));
  let dataMin = Math.min(...allVals);
  let dataMax = Math.max(...allVals);
  if (!isFinite(dataMin) || !isFinite(dataMax)) { dataMin = 0; dataMax = 1; }
  if (dataMin === dataMax) { dataMin -= 1; dataMax += 1; } // 全点同値でも高さゼロにしない
  const origMin = dataMin, origMax = dataMax;
  // 変動幅が小さくても最低20,000円ぶんの表示幅を確保する（中心を保ったまま上下に広げる）。
  const MIN_SPAN = opts.minSpan || 20000;
  if (dataMax - dataMin < MIN_SPAN) {
    const mid = (dataMax + dataMin) / 2;
    dataMin = mid - MIN_SPAN / 2;
    dataMax = mid + MIN_SPAN / 2;
  }
  // 縦軸は0起点固定にせず、実データの範囲にズームする。上下に変動幅の約15%の余白を付ける。
  const span = dataMax - dataMin;
  const padV = 0.15 * span;
  let min = dataMin - padV;
  let max = dataMax + padV;
  // 元データが全て0以上なら下辺は0未満にしない（マイナスを含む系列＝評価損益などは0を基準線として残す）。
  if (origMin >= 0 && min < 0) min = 0;
  if (origMax <= 0 && max > 0) max = 0;
  const x = (i) => pad.l + (N === 1 ? iw / 2 : (i / (N - 1)) * iw);
  const y = (v) => pad.t + ih - ((v - min) / (max - min)) * ih;

  // 縦軸ラベル。資産規模に応じた単位（万・億）と、目盛り間隔に応じた小数桁で読みやすく表示する。
  const axisFmt = makeAxisFmt(min, max);
  let grid = '';
  for (let k = 0; k <= 4; k++) {
    const v = min + ((max - min) * k) / 4;
    const yy = y(v);
    grid += `<line x1="${pad.l}" y1="${yy}" x2="${w - pad.r}" y2="${yy}" class="fc-grid"/>`;
    grid += `<text x="${pad.l - 6}" y="${yy + 3}" class="fc-axis" text-anchor="end">${axisFmt(v)}</text>`;
  }
  const zeroLine = (min < 0 && max > 0)
    ? `<line x1="${pad.l}" y1="${y(0)}" x2="${w - pad.r}" y2="${y(0)}" class="fc-grid" stroke-dasharray="3 3"/>` : '';

  // 予測エリアの背景と「今日」の区切り線（実績と予測を明確に区別）
  let fcBg = '', divider = '';
  if (boundary < N - 1) {
    const bx = x(boundary);
    fcBg = `<rect x="${bx}" y="${pad.t}" width="${w - pad.r - bx}" height="${ih}" class="fc-perf-fcbg"/>`;
    divider = `<line x1="${bx}" y1="${pad.t}" x2="${bx}" y2="${pad.t + ih}" class="fc-perf-divider"/>` +
      `<text x="${bx}" y="${pad.t - 6}" class="fc-perf-todaylab" text-anchor="middle">今日</text>`;
  }

  // x軸ラベル（長期は間引き）
  let xl = '';
  const step = Math.max(1, Math.ceil(N / 6));
  const keep = axisTicks(N, step);
  points.forEach((p, i) => {
    if (keep.has(i))
      xl += `<text x="${x(i)}" y="${h - 8}" class="fc-axis" text-anchor="middle">${p.label}</text>`;
  });

  // null を挟んだら線を切る（欠損は補間しない＝架空の値を作らない）
  const segPath = (vals, lo, hi) => {
    let d = '', pen = false;
    for (let i = lo; i <= hi; i++) {
      const v = vals[i];
      if (v == null) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'} ${x(i)},${y(v)} `;
      pen = true;
    }
    return d.trim();
  };
  let lines = '';
  for (const s of drawn) {
    const solid = segPath(s.values, 0, boundary);
    if (solid) lines += `<path d="${solid}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.4}" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (boundary < N - 1) {
      const dash = segPath(s.values, boundary, N - 1);
      if (dash) lines += `<path d="${dash}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.4}" stroke-dasharray="5 4" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>`;
    }
  }

  // 各データ点の丸プロット（どの日がどの地点か分かるように）。点が密集すると潰れるため一定数以下でのみ表示。
  // 実績は塗りつぶし、予測（今日以降）は白抜きの丸で区別する。
  let dots = '';
  const showDots = opts.dots !== false && N <= 45;
  if (showDots) {
    for (const s of drawn) {
      for (let i = 0; i < N; i++) {
        const v = s.values[i];
        if (v == null) continue;
        const cx = x(i), cy = y(v);
        dots += i > boundary
          ? `<circle cx="${cx}" cy="${cy}" r="3.4" fill="var(--fc-surface)" stroke="${s.color}" stroke-width="1.8" opacity="0.92"/>`
          : `<circle cx="${cx}" cy="${cy}" r="3.4" fill="${s.color}"/>`;
      }
    }
  }

  // 選択中の点のマーカー（縦線）
  let marker = '';
  if (opts.markerIndex != null && opts.markerIndex >= 0 && opts.markerIndex < N) {
    const mx = x(opts.markerIndex);
    marker = `<line x1="${mx}" y1="${pad.t}" x2="${mx}" y2="${pad.t + ih}" class="fc-perf-marker"/>`;
  }

  // タップ判定用の透明な当たり領域（各点にdata-i）。最前面に置く。
  let hits = '';
  if (opts.hit !== false) {
    const bw = N > 1 ? iw / (N - 1) : iw;
    for (let i = 0; i < N; i++) {
      const cx = x(i);
      hits += `<rect class="fc-perf-hit" data-i="${i}" x="${cx - bw / 2}" y="${pad.t}" width="${bw}" height="${ih}" fill="transparent"/>`;
    }
  }

  return `<svg viewBox="0 0 ${w} ${h}" class="fc-svg fc-perf-svg" preserveAspectRatio="none">${grid}${fcBg}${zeroLine}${divider}${marker}${lines}${dots}${xl}${hits}</svg>`;
}

// ===== 日々の変動グラフ（前日からの評価額の増減額を棒で表示） =====
// 0円を基準線として、プラスは上向き（緑）・マイナスは下向き（赤）の棒で描く。
// data: [{label, delta, kind?}]（kind:'forecast' なら予測ぶんとして淡色表示）
export function perfDeltaChart(data, opts = {}) {
  const w = opts.width || 640;
  const h = opts.height || 240;
  const pad = { t: 18, r: 14, b: 26, l: 52 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const N = data.length;
  if (!N) return `<svg viewBox="0 0 ${w} ${h}"></svg>`;

  const vals = data.map((d) => d.delta);
  // 縦軸は必ず0を含める（0円が基準線）。上下は変動幅の約15%を余白に。最低20,000円ぶんの幅を確保。
  let dataMin = Math.min(...vals, 0);
  let dataMax = Math.max(...vals, 0);
  const MIN_SPAN = opts.minSpan || 20000;
  if (dataMax - dataMin < MIN_SPAN) {
    // 0を基準に対称に広げる（増減0付近でも読みやすく）
    const half = MIN_SPAN / 2;
    dataMin = Math.min(dataMin, -half);
    dataMax = Math.max(dataMax, half);
  }
  const span = dataMax - dataMin;
  const padV = 0.15 * span;
  const min = dataMin - padV;
  const max = dataMax + padV;
  const gap = iw / N;
  const bw = Math.min(26, gap * 0.6);
  const x = (i) => pad.l + gap * i + gap / 2;
  const y = (v) => pad.t + ih - ((v - min) / (max - min)) * ih;

  const axisFmt = makeAxisFmt(min, max);
  let grid = '';
  for (let k = 0; k <= 4; k++) {
    const v = min + ((max - min) * k) / 4;
    const yy = y(v);
    grid += `<line x1="${pad.l}" y1="${yy}" x2="${w - pad.r}" y2="${yy}" class="fc-grid"/>`;
    grid += `<text x="${pad.l - 6}" y="${yy + 3}" class="fc-axis" text-anchor="end">${axisFmt(v)}</text>`;
  }
  // 0円の基準線（強調）
  const y0 = y(0);
  const zeroLine = `<line x1="${pad.l}" y1="${y0}" x2="${w - pad.r}" y2="${y0}" class="fc-perf-zero"/>`;

  const posColor = opts.posColor || '#34c759';
  const negColor = opts.negColor || '#ff453a';
  let bars = '';
  data.forEach((d, i) => {
    const cx = x(i);
    const v = d.delta;
    const yv = y(v);
    const top = Math.min(yv, y0);
    const bh = Math.max(1, Math.abs(yv - y0));
    const col = v >= 0 ? posColor : negColor;
    const op = d.kind === 'forecast' ? '0.42' : '1';
    bars += `<rect class="fc-perf-hit" data-i="${i}" x="${cx - bw / 2}" y="${top}" width="${bw}" height="${bh}" rx="3" fill="${col}" opacity="${op}"/>`;
  });

  // x軸ラベル（点が多いときは間引き）
  let xl = '';
  const step = Math.max(1, Math.ceil(N / 6));
  data.forEach((d, i) => {
    if (i % step === 0 || i === N - 1)
      xl += `<text x="${x(i)}" y="${h - 8}" class="fc-axis" text-anchor="middle">${d.label}</text>`;
  });

  // 選択中の棒のマーカー
  let marker = '';
  if (opts.markerIndex != null && opts.markerIndex >= 0 && opts.markerIndex < N) {
    const mx = x(opts.markerIndex);
    marker = `<line x1="${mx}" y1="${pad.t}" x2="${mx}" y2="${pad.t + ih}" class="fc-perf-marker"/>`;
  }

  return `<svg viewBox="0 0 ${w} ${h}" class="fc-svg fc-perf-svg" preserveAspectRatio="none">${grid}${zeroLine}${marker}${bars}${xl}</svg>`;
}

export { fmtShort };
