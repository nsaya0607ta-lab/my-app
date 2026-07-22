// icons.js — Lucide風の統一ラインアイコン集（絵文字を全廃し、SVGで統一）
// すべて viewBox 0 0 24 24 / fill:none / stroke:currentColor。サイズと太さは呼び出し側で指定。

const P = {
  home: '<path d="m3 10.5 9-7 9 7"/><path d="M5.5 9.5V20a1 1 0 0 0 1 1H9v-6h6v6h2.5a1 1 0 0 0 1-1V9.5"/>',
  swap: '<path d="M7 4.5v15"/><path d="m4 7.5 3-3 3 3"/><path d="M17 19.5v-15"/><path d="m14 16.5 3 3 3-3"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.6"/><path d="M2.5 9.5h19"/><path d="M6 15h3"/>',
  trending: '<path d="M3 17l6-6 4 4 7-7"/><path d="M17 7h4v4"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M9.9 4.5A9.6 9.6 0 0 1 12 4.3c6 0 9.5 7 9.5 7a15 15 0 0 1-2.3 3"/><path d="M6.6 6.7A14.6 14.6 0 0 0 2.5 12s3.5 7 9.5 7a9.2 9.2 0 0 0 4-.9"/><path d="M14.1 14.1A3 3 0 0 1 9.9 9.9"/><path d="m3 3 18 18"/>',
  bank: '<path d="M3 21h18"/><path d="M5 21V10.5"/><path d="M19 21V10.5"/><path d="M9.5 21v-5.5h5V21"/><path d="m3.5 10 8.5-6 8.5 6"/>',
  cash: '<rect x="2.5" y="6.5" width="19" height="11" rx="2.2"/><circle cx="12" cy="12" r="2.4"/><path d="M6 9.8v4.4M18 9.8v4.4"/>',
  wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v1.5"/><path d="M3 7.5V18a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 1 3 7.5Z"/><circle cx="16.5" cy="13" r="1.1" fill="currentColor" stroke="none"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 20v-6"/><path d="M13 20V9"/><path d="M18 20v-9"/>',
  pie: '<path d="M12 3a9 9 0 1 0 9 9h-9Z"/><path d="M14.5 3.4A9 9 0 0 1 20.6 9.5H14.5Z"/>',
  calendar: '<rect x="3.5" y="4.5" width="17" height="16" rx="2.4"/><path d="M3.5 9.5h17"/><path d="M8 3v3M16 3v3"/>',
  repeat: '<path d="m17 2.5 3.5 3.5-3.5 3.5"/><path d="M3.5 11V9.5a3.5 3.5 0 0 1 3.5-3.5h13.5"/><path d="m7 21.5-3.5-3.5 3.5-3.5"/><path d="M20.5 13v1.5a3.5 3.5 0 0 1-3.5 3.5H3.5"/>',
  tag: '<path d="M20.6 13.4 12.4 21.6a1.5 1.5 0 0 1-2.1 0L3 14.3V4a1 1 0 0 1 1-1h10.3l6.3 6.3a1.5 1.5 0 0 1 0 2.1Z"/><circle cx="7.8" cy="7.8" r="1.3"/>',
  database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-6"/><path d="M4.5 11.5v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-6"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  settings: '<circle cx="12" cy="12" r="2.7"/><path d="M12 3v2.4M12 18.6V21M4.2 7.5l2 1.2M17.8 15.3l2 1.2M19.8 7.5l-2 1.2M6.2 15.3l-2 1.2"/>',
  arrowRight: '<path d="M5 12h13"/><path d="m13 6 6 6-6 6"/>',
  arrowUpRight: '<path d="M7.5 16.5 16.5 7.5"/><path d="M8.5 7.5h8v8"/>',
  arrowDownRight: '<path d="M7.5 7.5 16.5 16.5"/><path d="M16.5 8.5v8h-8"/>',
  up: '<path d="M12 19V6"/><path d="m6 12 6-6 6 6"/>',
  down: '<path d="M12 5v13"/><path d="m6 12 6 6 6-6"/>',
  trash: '<path d="M3.5 6.5h17"/><path d="M8.5 6.5V4.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v2"/><path d="m6 6.5 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4"/>',
  bell: '<path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 8-2.5 8h17s-2.5-2-2.5-8"/><path d="M13.5 20.5a2 2 0 0 1-3 0"/>',
  check: '<path d="M20 6.5 9.5 17 4 11.5"/>',
  alert: '<path d="M10.3 3.9 2.3 18a1.5 1.5 0 0 0 1.3 2.2h16.8a1.5 1.5 0 0 0 1.3-2.2l-8-14.1a1.5 1.5 0 0 0-2.6 0Z"/><path d="M12 9.5v4.5M12 17.5h.01"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  receipt: '<path d="M5 21V4.5a1 1 0 0 1 1.4-.9l1.6.8 2-1 2 1 2-1 2 1 1.6-.8a1 1 0 0 1 1.4.9V21l-2.5-1.3-2 1-2-1-2 1-2-1L5 21Z"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4"/>',
  file: '<path d="M6.5 3h6l5 5v13h-11Z"/><path d="M12.5 3v5h5"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="7.5" cy="7.5" r="2"/><circle cx="16.5" cy="16.5" r="2"/>',
  piggy: '<path d="M4 12.5a6 6 0 0 1 6-6h3.5a5.5 5.5 0 0 1 5.4 4.5l1.1.4v3l-1.4.3a5.6 5.6 0 0 1-2 2.3V20h-3v-1.5H10V20H7v-2.2A6 6 0 0 1 4 12.5Z"/><path d="M4.5 11 2.8 9.5M14 6.5V4.5"/><circle cx="9" cy="11" r="0.6" fill="currentColor" stroke="none"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  coins: '<circle cx="9" cy="9" r="5.5"/><path d="M15 5a5.5 5.5 0 0 1 0 11"/><path d="M9 6.8v4.4M7.2 8.2h2.2a1 1 0 0 1 0 2H8.4a1 1 0 0 0 0 2h2"/>',
  arrowLeft: '<path d="M19 12H6"/><path d="m11 6-6 6 6 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h16"/>',
};

// SVG文字列を返す（innerHTML用）
export function iconHtml(name, { size = 20, sw = 2 } = {}) {
  const inner = P[name] || P.grid;
  return `<svg class="fc-ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

// DOM要素を返す
export function icon(name, opts) {
  const span = document.createElement('span');
  span.className = 'fc-ico' + (opts?.cls ? ' ' + opts.cls : '');
  span.innerHTML = iconHtml(name, opts);
  return span;
}

export const hasIcon = (name) => name in P;
