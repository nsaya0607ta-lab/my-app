// Midnight Voyage: 航路上の資産節目・画面名称・航海用アイコンと情報構成を追加する。
// 既存の計算ロジックやデータは変更せず、描画済みDOMと目的地設定を利用して表示を拡張する。

const GOAL_KEY = 'finance_voyage_goal_v1';
let scheduled = false;

const NAV_LABELS = {
  dashboard: '航海図',
  transactions: '航海記録',
  cards: '支払管理',
  simulate: '未来航路',
  menu: '航海設定',
};

const LABELS = new Map([
  ['資産シミュレーション', '未来航路'],
  ['収支シミュレーション', '資金航路'],
  ['投資将来予測', '投資航路'],
  ['今月の収支', '今月の航海記録'],
  ['次回引落予定', '次の支払予定'],
  ['投資状況', '投資航路の状況'],
  ['将来の資産予想', '目的地予測'],
  ['口座別の将来残高', '航海後の口座残高'],
  ['資産構成比', '積荷の構成'],
  ['資産推移', '航路の軌跡'],
  ['口座別推移', '口座別の航路'],
  ['資金不足警告', '航路上の注意'],
  ['資金不足の見込み', '航路上の注意'],
  ['前提条件', '航海条件'],
  ['これからの入出金', 'これからの資金航路'],
  ['日付別の詳細', '航路の日付別記録'],
  ['保存したシミュレーションプラン', '保存した航路プラン'],
  ['保存プランの比較（将来評価額）', '保存航路の比較（将来評価額）'],
]);

const ICON_BY_LABEL = {
  '口座': 'vault',
  '今月の航海記録': 'logbook',
  '投資航路の状況': 'telescope',
  '次の支払予定': 'card',
  '目的地予測': 'lighthouse',
  '航海後の口座残高': 'cargo',
  '積荷の構成': 'cargo',
  '航路の軌跡': 'route',
  '口座別の航路': 'route',
  '航路上の注意': 'beacon',
  '航海条件': 'compass',
  'これからの資金航路': 'waves',
  '航路の日付別記録': 'logbook',
  '保存した航路プラン': 'map',
  '未来航路': 'compass',
};

const svg = (name, size = 18) => {
  const attrs = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
  const paths = {
    compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1 5.1-2.1Z"/><circle cx="12" cy="12" r="1"/>',
    route: '<path d="M5 18.5c2.7-1.1 2.7-4.1 5.4-5.2 2.6-1.1 3.1 1.2 5.7-.1 1.4-.7 2.2-2 2.9-3.7"/><circle cx="5" cy="18.5" r="1.6"/><path d="M17.2 5.7h3.2v3.2"/><path d="m20.4 5.7-3.8 3.8"/>',
    lighthouse: '<path d="M9.3 20h5.4l-1-11h-3.4l-1 11Z"/><path d="M8 20h8"/><path d="M9.8 9h4.4l-.8-3h-2.8l-.8 3Z"/><path d="M4 7.5 8 6M20 7.5 16 6M5.5 11h3M18.5 11h-3"/>',
    vault: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="12" cy="12" r="3.2"/><path d="M12 8.8V12l2.2 1.4M6.5 8.2h1M6.5 15.8h1M17.5 8.2h-1M17.5 15.8h-1"/>',
    logbook: '<path d="M5 4.5h11.5A2.5 2.5 0 0 1 19 7v12H7.5A2.5 2.5 0 0 1 5 16.5v-12Z"/><path d="M5 16.5A2.5 2.5 0 0 1 7.5 14H19M9 8h6M9 11h4"/>',
    telescope: '<path d="m4.5 8.8 9.7-3.4 1.7 4.9-9.7 3.4-1.7-4.9Z"/><path d="m14.2 5.4 3.3-1.1 1.7 4.8-3.3 1.2M10.5 12.2 8 20M13 11.3l3.1 8.7M8.8 16h6.1"/>',
    cargo: '<path d="M4 8.5 12 4l8 4.5v8L12 21l-8-4.5v-8Z"/><path d="m4.3 8.7 7.7 4.2 7.7-4.2M12 12.9V21M8 6.2l8 4.4"/>',
    beacon: '<path d="M9.5 20h5l-1-9h-3l-1 9Z"/><path d="M8 20h8M12 3v3M5.5 6.2l2.1 1.5M18.5 6.2l-2.1 1.5M4 11h3M20 11h-3"/><path d="M10.2 11h3.6"/>',
    waves: '<path d="M3 8.5c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1"/><path d="M3 13c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1"/><path d="M3 17.5c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1"/>',
    card: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M3.5 9.5h17M7 14.5h4"/>',
    map: '<path d="m4 5 5-2 6 2 5-2v16l-5 2-6-2-5 2V5Z"/><path d="M9 3v16M15 5v16"/>',
    star: '<path d="m12 3 2.2 5.1 5.5.5-4.2 3.6 1.3 5.4-4.8-2.8-4.8 2.8 1.3-5.4-4.2-3.6 5.5-.5L12 3Z"/>',
  };
  return `<svg ${attrs}>${paths[name] || paths.compass}</svg>`;
};

function readGoal() {
  try {
    const parsed = JSON.parse(localStorage.getItem(GOAL_KEY) || 'null');
    const amount = Math.round(Number(parsed?.amount));
    return Number.isFinite(amount) && amount > 0 ? { ...parsed, amount } : null;
  } catch {
    return null;
  }
}

function parseYen(text) {
  const match = String(text || '').match(/¥\s*([\d,]+)/);
  return match ? Number(match[1].replaceAll(',', '')) : null;
}

function formatYen(value) {
  return `¥${Math.round(Number(value) || 0).toLocaleString('ja-JP')}`;
}

function compactYen(value) {
  const n = Math.round(Number(value) || 0);
  if (n >= 100000000) return `${(n / 100000000).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}億`;
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString('ja-JP')}万`;
  return n.toLocaleString('ja-JP');
}

function niceStep(goal) {
  const rough = Math.max(1, goal / 5);
  const steps = [100000, 250000, 500000, 1000000, 2000000, 5000000, 10000000, 20000000, 50000000, 100000000, 200000000, 500000000];
  return steps.find((step) => step >= rough) || Math.ceil(rough / 100000000) * 100000000;
}

function milestoneValues(goal) {
  const step = niceStep(goal);
  const values = [];
  for (let value = step; value < goal; value += step) values.push(value);
  if (values.length <= 5) return values;
  const sampled = [];
  const stride = (values.length - 1) / 4;
  for (let i = 0; i < 5; i += 1) sampled.push(values[Math.round(i * stride)]);
  return [...new Set(sampled)].sort((a, b) => a - b);
}

function currentAndFutureForMap(map) {
  const destinationCard = map.closest('.voyage-destination-card');
  if (destinationCard) {
    return {
      current: parseYen(document.querySelector('.fc-hero-amount')?.textContent),
      future: null,
    };
  }

  const forecast = map.closest('.voyage-forecast-route');
  if (forecast) {
    const simHero = document.querySelector('.fc-simhero');
    return {
      current: parseYen(simHero?.querySelector('.fc-simhero-amt')?.textContent),
      future: parseYen(simHero?.querySelector('.fc-simhero-foot b')?.textContent),
    };
  }

  return { current: null, future: null };
}

function decorateMilestones() {
  const goal = readGoal();
  document.querySelectorAll('.voyage-route-map').forEach((map) => {
    const host = map.closest('.voyage-destination-card, .voyage-forecast-route');
    if (!goal || map.classList.contains('unset')) {
      map.querySelector('.voyage-milestone-layer')?.remove();
      host?.querySelector('.voyage-next-milestone')?.remove();
      delete map.dataset.voyageMilestoneSignature;
      return;
    }

    const { current, future } = currentAndFutureForMap(map);
    const values = milestoneValues(goal.amount);
    const signature = JSON.stringify({ goal: goal.amount, current, future, values });
    if (map.dataset.voyageMilestoneSignature === signature && map.querySelector('.voyage-milestone-layer')) return;

    map.querySelector('.voyage-milestone-layer')?.remove();
    host?.querySelector('.voyage-next-milestone')?.remove();
    map.dataset.voyageMilestoneSignature = signature;
    if (!values.length) return;

    const layer = document.createElement('div');
    layer.className = 'voyage-milestone-layer';

    values.forEach((value, index) => {
      const marker = document.createElement('span');
      const reached = current != null && current >= value;
      const forecastReached = !reached && future != null && future >= value;
      marker.className = `voyage-milestone ${reached ? 'reached' : forecastReached ? 'forecast-reached' : 'pending'} ${index % 2 ? 'below' : 'above'}`;
      marker.style.left = `${Math.max(2, Math.min(98, (value / goal.amount) * 100))}%`;
      marker.title = `${formatYen(value)}${reached ? ' 達成済み' : forecastReached ? ' 予測期間内に到達見込み' : ''}`;
      marker.innerHTML = `<i></i><small>${compactYen(value)}</small>`;
      layer.append(marker);
    });

    map.append(layer);

    if (current == null) return;
    const next = values.find((value) => value > current) || (current < goal.amount ? goal.amount : null);
    if (!next) return;

    const info = document.createElement('div');
    info.className = 'voyage-next-milestone';
    const isDestination = next === goal.amount;
    info.innerHTML = `
      <span class="voyage-next-icon">${svg(isDestination ? 'lighthouse' : 'star', 18)}</span>
      <div><span>${isDestination ? '次の目的地' : '次の資産節目'}</span><b>${formatYen(next)}</b></div>
      <small>あと ${formatYen(Math.max(0, next - current))}</small>
    `;

    map.insertAdjacentElement('afterend', info);
  });
}

function renameNavigation() {
  document.querySelectorAll('.fc-nav-btn[data-route]').forEach((button) => {
    const label = NAV_LABELS[button.dataset.route];
    if (!label) return;
    const candidates = [...button.querySelectorAll('span')].filter((span) => !span.children.length && span.textContent.trim());
    const target = candidates.at(-1);
    if (target && target.textContent.trim() !== label) target.textContent = label;
    button.setAttribute('aria-label', label);
  });
}

function renameScreens() {
  const selectors = [
    '.fc-page-title', '.fc-sec-title', '.fc-disp-title', '.fc-seg-btn', '.fc-subhead',
    '.fc-simhero-lab', '.fc-chart-hint', '.fc-pl-cap', '.fc-field-sep',
  ];
  document.querySelectorAll(selectors.join(',')).forEach((node) => {
    if (node.querySelector('.voyage-heading-icon')) return;
    const before = node.textContent.trim();
    const after = LABELS.get(before);
    if (after) node.textContent = after;
  });

  document.querySelectorAll('.fc-hero-sim span').forEach((node) => {
    if (node.textContent.trim() === 'シミュレーション') node.textContent = '未来航路';
  });
}

function decorateHeadings() {
  document.querySelectorAll('.fc-sec-title, .fc-disp-title, .fc-page-title').forEach((heading) => {
    if (heading.dataset.voyageIcon === '1') return;
    const label = heading.textContent.trim();
    const iconName = ICON_BY_LABEL[label];
    if (!iconName) return;
    const icon = document.createElement('span');
    icon.className = 'voyage-heading-icon';
    icon.innerHTML = svg(iconName, heading.classList.contains('fc-page-title') ? 21 : 17);
    heading.prepend(icon);
    heading.dataset.voyageIcon = '1';
  });
}

function decorateDashboardBrand() {
  const hero = document.querySelector('.fc-hero');
  if (!hero || document.querySelector('.voyage-brand-head')) return;

  const head = document.createElement('header');
  head.className = 'voyage-brand-head';
  head.innerHTML = `
    <span class="voyage-brand-mark">${svg('compass', 25)}</span>
    <div>
      <span>MIDNIGHT VOYAGE</span>
      <h1>資産航海図</h1>
      <p>現在地から未来の目的地へ</p>
    </div>
  `;
  hero.insertAdjacentElement('beforebegin', head);
}

function decorateSimulationIntro() {
  const title = [...document.querySelectorAll('.fc-page-title')].find((node) => node.textContent.includes('未来航路'));
  if (!title || document.querySelector('.voyage-screen-intro')) return;
  const intro = document.createElement('div');
  intro.className = 'voyage-screen-intro';
  intro.innerHTML = `<span>${svg('route', 17)}</span><p>現在地から目的地まで、資金と投資の進み方を航路として確認します。</p>`;
  const titleRow = title.closest('.fc-head-title');
  if (titleRow) titleRow.insertAdjacentElement('afterend', intro);
  else title.insertAdjacentElement('afterend', intro);
}

function decorateLedger() {
  const head = document.querySelector('.fc-ledger-head');
  if (!head || head.dataset.voyageDecorated === '1') return;
  const kicker = document.createElement('div');
  kicker.className = 'voyage-ledger-kicker';
  kicker.innerHTML = `${svg('logbook', 15)}<span>VOYAGE LOG</span>`;
  head.prepend(kicker);
  head.dataset.voyageDecorated = '1';
}

function applyScreenClass() {
  const body = document.body;
  if (document.querySelector('.fc-hero')) body.dataset.voyageScreen = 'dashboard';
  else if (document.querySelector('.fc-simhero, .voyage-forecast-route')) body.dataset.voyageScreen = 'future';
  else if (document.querySelector('.fc-ledger-head')) body.dataset.voyageScreen = 'ledger';
  else body.dataset.voyageScreen = 'other';
}

function decorate() {
  renameNavigation();
  renameScreens();
  decorateHeadings();
  decorateDashboardBrand();
  decorateSimulationIntro();
  decorateLedger();
  decorateMilestones();
  applyScreenClass();
}

function scheduleDecorate() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    decorate();
  });
}

export function initVoyageExperience() {
  scheduleDecorate();
  const root = document.querySelector('#fc-root');
  if (!root) return;
  const observer = new MutationObserver(scheduleDecorate);
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  window.addEventListener('storage', (event) => {
    if (event.key === GOAL_KEY) scheduleDecorate();
  });
}
