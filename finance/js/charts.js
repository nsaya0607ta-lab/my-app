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

// ===== 折れ線グラフ（資産推移・収支推移） =====
// data: [{label, value}] , opts: {height, color, fill, area}
export function lineChart(data, opts = {}) {
  const w = opts.width || 640;
  const h = opts.height || 220;
  const pad = { t: 16, r: 14, b: 26, l: 46 };
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

  // Y軸グリッド（4分割）
  let grid = '';
  const gid = 'g' + Math.random().toString(36).slice(2, 6);
  for (let k = 0; k <= 4; k++) {
    const v = min + ((max - min) * k) / 4;
    const yy = y(v);
    grid += `<line x1="${pad.l}" y1="${yy}" x2="${w - pad.r}" y2="${yy}" class="fc-grid"/>`;
    grid += `<text x="${pad.l - 6}" y="${yy + 3}" class="fc-axis" text-anchor="end">${fmtShort(v)}</text>`;
  }
  // X軸ラベル（間引き）
  let xl = '';
  const step = Math.ceil(data.length / 6);
  data.forEach((d, i) => {
    if (i % step === 0 || i === data.length - 1)
      xl += `<text x="${x(i)}" y="${h - 8}" class="fc-axis" text-anchor="middle">${d.label}</text>`;
  });
  // データ点（少数時のみ強調）
  let dots = '';
  if (data.length <= 14)
    dots = data.map((d, i) => `<circle cx="${x(i)}" cy="${y(d.value)}" r="3" fill="${color}"/>`).join('');

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

export { fmtShort };
