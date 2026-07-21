// app.js — ルーティング・画面描画・フォーム・操作の統合レイヤー
import * as S from './store.js?v=20260722b';
import * as C from './calc.js?v=20260722b';
import * as CF from './cashflow.js?v=20260722b';
import { lineChart, barChart, groupedBarChart, donutChart } from './charts.js?v=20260722b';
import { iconHtml, icon } from './icons.js?v=20260722b';
import {
  el, qs, yen, yenMasked, num, today, toISO, parseISO, ym, fmtDate, fmtDateLong,
  fmtMonth, addMonths, resolveDay, pad, weekdayName, haptic, escapeHtml, uid,
} from './utils.js?v=20260722b';

// ---- 画面ローカル状態（データではないUI状態） ----
const ui = {
  route: 'dashboard',
  simMonths: 12,           // 将来シミュレーションの表示期間
  cal: { y: new Date().getFullYear(), m: new Date().getMonth() },
  plYm: ym(new Date()),
  anaYm: ym(new Date()),
  filter: { q: '', type: 'all', cat: 'all', min: '', max: '', from: '', to: '' },
};

const app = () => qs('#view');
const M = (n) => yenMasked(n, S.getState().settings.secret);

// ============ ルーター ============
const ROUTES = {
  dashboard: renderDashboard,
  transactions: renderTransactions,
  cards: renderCards,
  simulate: renderSimulate,
  menu: renderMenu,
  accounts: renderAccounts,
  pl: renderPL,
  calendar: renderCalendar,
  analysis: renderAnalysis,
  data: renderData,
  categories: renderCategories,
  recurring: renderRecurring,
};

function go(route) {
  ui.route = route;
  haptic();
  render();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function render() {
  const fn = ROUTES[ui.route] || renderDashboard;
  const node = fn();
  const v = app();
  v.innerHTML = '';
  v.append(node);
  v.classList.remove('fc-fade'); void v.offsetWidth; v.classList.add('fc-fade');
  updateNav();
}

function updateNav() {
  qs('#fc-nav')?.querySelectorAll('.fc-nav-btn').forEach((b) => {
    const r = b.dataset.route;
    const active = r === ui.route || (r === 'menu' && ['accounts', 'pl', 'calendar', 'analysis', 'data', 'categories', 'recurring'].includes(ui.route));
    b.classList.toggle('active', active);
  });
}

// ============ 共通UI部品 ============
function card(...children) { return el('div', { class: 'fc-card' }, ...children); }
// アイコン付きボタン
function btnIcon(cls, iconName, label, onClick) {
  return el('button', { class: 'fc-btn ' + cls, type: 'button', onclick: onClick },
    el('span', { class: 'fc-btn-ic', html: iconHtml(iconName, { size: 17 }) }), el('span', { text: label }));
}
function sectionTitle(t, right) {
  return el('div', { class: 'fc-sec-head' }, el('h2', { class: 'fc-sec-title', text: t }), right || '');
}
function iconBtn(label, onClick, cls = '') {
  return el('button', { class: 'fc-icobtn ' + cls, type: 'button', onclick: onClick, text: label });
}
function pill(text, cls = '') { return el('span', { class: 'fc-pill ' + cls, text }); }

function toast(msg, iconName = 'check') {
  const t = el('div', { class: 'fc-toast' },
    el('span', { class: 'fc-toast-ic', html: iconHtml(iconName, { size: 18 }) }),
    el('span', { text: msg }));
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}

// モーダル（下からせり上がるシート）
function modal(title, bodyNode, { onSave, saveLabel = '保存', danger, wide } = {}) {
  const back = el('div', { class: 'fc-modal-back' });
  const closeAll = () => { back.classList.remove('show'); setTimeout(() => back.remove(), 260); };
  const foot = el('div', { class: 'fc-modal-foot' },
    el('button', { class: 'fc-btn ghost', type: 'button', text: 'キャンセル', onclick: closeAll }),
    onSave && el('button', {
      class: 'fc-btn ' + (danger ? 'danger' : 'primary'), type: 'button', text: saveLabel,
      onclick: () => { if (onSave(closeAll) !== false) { /* onSave が close を制御する場合あり */ } },
    }),
  );
  const sheet = el('div', { class: 'fc-modal-sheet' + (wide ? ' wide' : '') },
    el('div', { class: 'fc-modal-grip' }),
    el('div', { class: 'fc-modal-head' }, el('h3', { text: title }),
      el('button', { class: 'fc-modal-x', type: 'button', 'aria-label': '閉じる', html: iconHtml('x', { size: 16 }), onclick: closeAll })),
    el('div', { class: 'fc-modal-body' }, bodyNode),
    foot,
  );
  back.append(sheet);
  back.addEventListener('click', (e) => { if (e.target === back) closeAll(); });
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('show'));
  return { close: closeAll };
}

function confirmDialog(title, message, onYes, { yesLabel = '削除', danger = true } = {}) {
  modal(title, el('p', { class: 'fc-confirm-msg', text: message }), {
    saveLabel: yesLabel, danger,
    onSave: (close) => { onYes(); close(); },
  });
}

// フォーム部品
// 注意: <label> でラップするとセグメント等の内部ボタンをタップした際に
// ブラウザが最初のフォーム要素へクリックを転送し、収入/支出の切替が
// 効かなくなる不具合が起きる。そのため <div> でラップする。
function field(label, input) {
  return el('div', { class: 'fc-field' }, el('span', { class: 'fc-field-lab', text: label }), input);
}
function inputEl(attrs) { return el('input', { class: 'fc-input', ...attrs }); }
function selectEl(options, value) {
  const s = el('select', { class: 'fc-input' });
  for (const o of options) {
    const opt = el('option', { value: o.value, text: o.label });
    if (String(o.value) === String(value)) opt.selected = true;
    s.append(opt);
  }
  return s;
}
function accountOptions() { return S.getState().accounts.map((a) => ({ value: a.id, label: a.name })); }

// ============ ダッシュボード ============
function renderDashboard() {
  const st = S.getState();
  const secret = st.settings.secret;
  const total = C.totalAssets(st);
  const cur = ym(new Date());
  const pl = C.monthlyPL(st, cur);
  const byType = C.assetsByType(st);
  const typeLabel = { cash: '現金', bank: '預金', securities: '証券', other: 'その他' };
  const deltas = C.assetDeltas(st);
  const trend = C.assetTrendSeries(st, 12);
  const wrap = el('div', { class: 'fc-view' });

  // --- 合計資産ヒーロー ---
  const amountNode = el('div', { class: 'fc-hero-amount' + (secret ? ' masked' : ''), text: M(total) });
  const linkArrow = (route) => el('span', { class: 'fc-link-arrow', html: iconHtml('chevronRight', { size: 15 }) });
  const hero = el('div', { class: 'fc-hero tap', role: 'button', 'aria-label': '資産シミュレーションを開く', onclick: () => go('simulate') },
    el('div', { class: 'fc-hero-row' },
      el('span', { class: 'fc-hero-lab' }, el('span', { text: '合計資産' }), el('span', { class: 'fc-hero-sim', html: iconHtml('trending', { size: 13 }) + '<span>シミュレーション</span>' + iconHtml('chevronRight', { size: 13 }) })),
      el('button', {
        class: 'fc-secret', type: 'button', 'aria-label': 'シークレットモード',
        html: iconHtml(secret ? 'eyeOff' : 'eye', { size: 16 }) + `<span>${secret ? '表示' : '隠す'}</span>`,
        onclick: (e) => { e.stopPropagation(); S.update((s) => { s.settings.secret = !s.settings.secret; }); render(); },
      }),
    ),
    amountNode,
    // 資産増減（昨日比・今月比・前年比）
    el('div', { class: 'fc-delta-row' },
      deltaChip('昨日比', deltas.yesterday, secret),
      deltaChip('今月比', deltas.month, secret),
      deltaChip('前年比', deltas.year, secret),
    ),
    // 残高推移スパークライン
    !secret && trend.data.length > 1
      ? el('div', { class: 'fc-hero-spark', html: lineChart(trend.data, { color: '#7db8ff', height: 60, width: 640, spark: true }) })
      : '',
  );
  wrap.append(hero);
  if (!secret) animateCount(amountNode, total);

  // --- 資産構成チップ ---
  if (Object.keys(byType).length) {
    wrap.append(el('div', { class: 'fc-type-row' },
      ...Object.entries(byType).map(([k, v]) =>
        el('div', { class: 'fc-type-chip' }, el('span', { class: 'fc-type-lab', text: typeLabel[k] || k }), el('span', { class: 'fc-type-val', text: M(v) }))),
    ));
  }

  // --- 今月の可処分資金 ---
  const mom = C.momChange(st, cur);
  const sr = C.savingsRate(st, cur);
  wrap.append(card(
    el('div', { class: 'fc-disp-head' },
      el('span', { class: 'fc-disp-title', text: '今月の可処分資金' }),
      el('button', { class: 'fc-link', type: 'button', onclick: () => go('pl') }, '損益', linkArrow())),
    el('div', { class: 'fc-disp-mainrow' },
      el('div', { class: 'fc-disp-amount ' + (pl.disposable >= 0 ? 'pos' : 'neg'), text: secret ? '＊＊＊＊' : yen(pl.disposable, { sign: pl.disposable > 0 }) }),
      sr != null ? el('div', { class: 'fc-savings' },
        el('span', { class: 'fc-savings-lab', text: '貯蓄率' }),
        el('span', { class: 'fc-savings-val', text: sr + '%' })) : '',
    ),
    el('div', { class: 'fc-disp-bars' },
      miniBar('収入', pl.incomeTotal, Math.max(pl.incomeTotal, pl.expenseTotal, 1), 'var(--fc-pos)', mom.income.pct, secret),
      miniBar('支出', pl.expenseTotal, Math.max(pl.incomeTotal, pl.expenseTotal, 1), 'var(--fc-neg)', mom.expense.pct, secret),
    ),
  ));

  // --- 今月あと使える金額（予算ベース） ---
  const sp = C.spendableStatus(st, cur);
  if (sp.hasBudget) {
    wrap.append(card(
      el('div', { class: 'fc-spend-head' },
        el('span', { class: 'fc-sec-title', text: '今月あと使える金額' }),
        el('span', { class: 'fc-spend-days', text: `残り${sp.daysLeft}日` })),
      el('div', { class: 'fc-spend-amt ' + (sp.remaining >= 0 ? '' : 'neg'), text: secret ? '＊＊＊＊' : yen(sp.remaining, { sign: false }) }),
      el('div', { class: 'fc-progress' }, el('div', { class: 'fc-progress-fill' + (sp.ratio >= 1 ? ' over' : ''), style: `width:${Math.min(100, sp.ratio * 100)}%` })),
      el('div', { class: 'fc-spend-foot' },
        el('span', { text: secret ? '予算 ＊＊＊' : `予算 ${yen(sp.budget)}` }),
        sp.remaining > 0 ? el('span', { text: secret ? '' : `1日あたり約 ${yen(sp.perDay)}` }) : el('span', { class: 'neg', text: '予算オーバー' })),
    ));
  } else {
    wrap.append(card(
      el('div', { class: 'fc-spend-head' }, el('span', { class: 'fc-sec-title', text: '今月あと使える金額' })),
      el('button', { class: 'fc-btn ghost block', type: 'button', text: '月の予算を設定する', onclick: () => budgetForm() }),
    ));
  }

  // --- スマート指標タイル（固定費・今後7日引落） ---
  const fixed = C.fixedRemaining(st, cur);
  const within7 = C.settlementsWithinDays(st, 7);
  const within7Total = within7.reduce((s, u) => s + u.amount, 0);
  wrap.append(el('div', { class: 'fc-tile-row' },
    statTile('repeat', '固定費 残り', fixed.count > 0 ? `${fixed.count}件` : 'なし', fixed.count > 0 && !secret ? yen(fixed.total) : '', () => go('recurring')),
    statTile('card', '7日内の引落', within7.length > 0 ? `${within7.length}件` : 'なし', within7.length > 0 && !secret ? yen(within7Total) : '', () => go('cards')),
  ));

  // --- カード請求額との差額 ---
  const billDiffs = C.cardBillDiff(st).filter((b) => b.payISO);
  if (billDiffs.length) {
    wrap.append(card(
      sectionTitle('カード請求額との差額'),
      el('div', { class: 'fc-list' }, ...billDiffs.map((b) =>
        el('div', { class: 'fc-billdiff' },
          el('div', { class: 'fc-billdiff-head' },
            el('span', { class: 'fc-row-ic sm', style: `background:${b.card.color}22;color:${b.card.color}`, html: iconHtml('card', { size: 16 }) }),
            el('b', { text: b.card.name })),
          el('div', { class: 'fc-billdiff-grid' },
            billCol('請求予定', b.estimated, secret),
            billCol('登録済', b.recorded, secret),
            billCol(b.diff >= 0 ? '未登録' : '超過', Math.abs(b.diff), secret, b.diff >= 0 ? '' : 'neg'),
          )))),
    ));
  }

  // --- 今後7日以内の引落予定（詳細） ---
  const upcoming = C.upcomingSettlements(st);
  wrap.append(card(
    sectionTitle('次回引落予定', el('button', { class: 'fc-link', type: 'button', onclick: () => go('cards') }, 'カード', linkArrow())),
    upcoming.length
      ? el('div', { class: 'fc-list' }, ...upcoming.slice(0, 3).map((u) =>
          el('div', { class: 'fc-row' },
            el('div', { class: 'fc-row-ic', html: iconHtml('card', { size: 18 }), style: `background:${u.card.color || '#888'}22;color:${u.card.color || 'inherit'}` }),
            el('div', { class: 'fc-row-main' },
              el('div', { class: 'fc-row-title', text: u.card.name }),
              el('div', { class: 'fc-row-sub', text: `${fmtDate(u.payISO)} 引落・${u.count}件` })),
            el('div', { class: 'fc-row-amt neg', text: secret ? '＊＊＊' : yen(u.amount) })))
        )
      : el('p', { class: 'fc-empty', text: 'カード利用の登録がありません' }),
  ));

  // --- 今月の支出ランキング TOP3 ---
  const rank = C.expenseRankTop(st, cur, 3);
  if (rank.length) {
    const rankTotal = rank.reduce((s, g) => s + g.amount, 0);
    wrap.append(card(
      sectionTitle('今月の支出ランキング', el('button', { class: 'fc-link', type: 'button', onclick: () => go('analysis') }, '分析', linkArrow())),
      el('div', { class: 'fc-list' }, ...rank.map((g, i) =>
        el('div', { class: 'fc-rank-row' },
          el('span', { class: 'fc-rank-no', text: i + 1 }),
          el('span', { class: 'fc-rank-dot', style: `background:${g.color}` }),
          el('span', { class: 'fc-rank-name', text: g.name }),
          el('span', { class: 'fc-rank-amt', text: secret ? '＊＊＊' : yen(g.amount) }))),
    )));
  }

  // --- 最近の収支 ---
  const recent = C.recentTransactions(st, 3);
  if (recent.length) {
    wrap.append(card(
      sectionTitle('最近の収支', el('button', { class: 'fc-link', type: 'button', onclick: () => go('transactions') }, 'すべて', linkArrow())),
      el('div', { class: 'fc-list' }, ...recent.map((t) => {
        const catc = S.findCategory(t.categoryId);
        return el('div', { class: 'fc-row tap', onclick: () => txForm(t) },
          el('div', { class: 'fc-row-ic', style: `background:${catc.color}22;color:${catc.color}`, html: iconHtml(t.type === 'income' ? 'up' : 'down', { size: 18 }) }),
          el('div', { class: 'fc-row-main' },
            el('div', { class: 'fc-row-title', text: catc.name }),
            el('div', { class: 'fc-row-sub', text: `${fmtDate(t.date)}${t.memo ? '・' + t.memo : ''}` })),
          el('div', { class: 'fc-row-amt ' + (t.type === 'income' ? 'pos' : 'neg'), text: secret ? '＊＊＊' : yen(t.amount, { sign: t.type === 'income' }) }));
      })),
    ));
  }

  // --- 口座一覧サマリー ---
  wrap.append(card(
    sectionTitle('口座', el('button', { class: 'fc-link', type: 'button', onclick: () => go('accounts') }, '管理', linkArrow())),
    st.accounts.length === 0
      ? el('button', { class: 'fc-btn ghost block', type: 'button', text: '口座を追加して残高を登録', onclick: () => accountForm() })
      : el('div', { class: 'fc-list' }, ...st.accounts.map((a) =>
          el('div', { class: 'fc-row tap', onclick: () => accountForm(a) },
            el('div', { class: 'fc-row-ic', html: accIcon(a.type) }),
            el('div', { class: 'fc-row-main' }, el('div', { class: 'fc-row-title', text: a.name })),
            el('div', { class: 'fc-row-amt', text: M(a.balance) })))),
  ));

  // --- 資産のこれから（データ駆動の将来予測） ---
  const chartData = CF.chartSeries(st, 12);
  const shortage = CF.shortageAlert(st, 12);
  wrap.append(card(
    sectionTitle('資産のこれから', el('button', { class: 'fc-link', type: 'button', onclick: () => go('simulate') }, '詳細', linkArrow())),
    secret ? el('p', { class: 'fc-empty', text: 'シークレットモード中は非表示' })
      : el('div', { class: 'fc-chart', html: lineChart(chartData, { color: shortage ? 'var(--fc-neg)' : 'var(--fc-accent)', height: 180 }) }),
    shortage && !secret ? el('div', { class: 'fc-shortage-mini' }, el('span', { html: iconHtml('alert', { size: 14 }) }), el('span', { text: shortage.message })) : '',
  ));

  return wrap;
}

// 資産増減チップ
function deltaChip(label, value, secret) {
  if (value == null) return el('div', { class: 'fc-delta' }, el('span', { class: 'fc-delta-lab', text: label }), el('span', { class: 'fc-delta-val muted', text: '—' }));
  const up = value >= 0;
  return el('div', { class: 'fc-delta' },
    el('span', { class: 'fc-delta-lab', text: label }),
    el('span', { class: 'fc-delta-val ' + (value === 0 ? 'muted' : up ? 'pos' : 'neg') },
      value === 0 ? '' : el('span', { class: 'fc-delta-ic', html: iconHtml(up ? 'arrowUpRight' : 'arrowDownRight', { size: 13 }) }),
      el('span', { text: secret ? '＊＊' : yen(Math.abs(value)) })));
}

// スマート指標タイル
function statTile(iconName, label, main, sub, onClick) {
  return el('button', { class: 'fc-stat-tile', type: 'button', onclick: onClick },
    el('span', { class: 'fc-stat-ic', html: iconHtml(iconName, { size: 18 }) }),
    el('span', { class: 'fc-stat-body' },
      el('span', { class: 'fc-stat-lab', text: label }),
      el('span', { class: 'fc-stat-main', text: main }),
      sub ? el('span', { class: 'fc-stat-sub', text: sub }) : ''));
}

function billCol(label, value, secret, cls = '') {
  return el('div', { class: 'fc-billcol' },
    el('span', { class: 'fc-billcol-lab', text: label }),
    el('span', { class: 'fc-billcol-val ' + cls, text: secret ? '＊＊＊' : yen(value) }));
}

function miniBar(label, val, max, color, momPct, secret) {
  const pct = max > 0 ? Math.max(2, (val / max) * 100) : 0;
  let momNode = '';
  if (momPct != null && isFinite(momPct) && Math.round(momPct) !== 0) {
    const up = momPct > 0;
    momNode = el('span', { class: 'fc-mom ' + (up ? 'up' : 'down') },
      el('span', { class: 'fc-mom-ic', html: iconHtml(up ? 'arrowUpRight' : 'arrowDownRight', { size: 11 }) }),
      el('span', { text: Math.abs(Math.round(momPct)) + '%' }));
  }
  return el('div', { class: 'fc-minibar' },
    el('span', { class: 'fc-minibar-lab', text: label }),
    el('div', { class: 'fc-minibar-track' }, el('div', { class: 'fc-minibar-fill', style: `width:${pct}%;background:${color}` })),
    momNode,
    el('span', { class: 'fc-minibar-val', text: secret ? '＊＊＊' : yen(val) }),
  );
}
function accIconName(type) {
  return { cash: 'cash', bank: 'bank', securities: 'trending', other: 'wallet' }[type] || 'wallet';
}
function accIcon(type) { return iconHtml(accIconName(type), { size: 20 }); }

// 数字がふわっと変わるカウントアップ演出（シークレット時・reduce-motion時はスキップ）
function animateCount(node, to, { fmt = (v) => yen(v), dur = 620 } = {}) {
  if (!node) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (reduce) { node.textContent = fmt(to); return; }
  const start = performance.now();
  const from = 0;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    node.textContent = fmt(Math.round(from + (to - from) * ease(t)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ============ 口座管理 ============
function renderAccounts() {
  const st = S.getState();
  const wrap = el('div', { class: 'fc-view' });
  wrap.append(pageHead('口座管理', '追加', () => accountForm()));
  wrap.append(card(
    el('div', { class: 'fc-total-line' }, el('span', { text: '合計資産' }), el('b', { text: M(C.totalAssets(st)) })),
  ));
  const list = el('div', { class: 'fc-list' });
  for (const a of st.accounts) {
    list.append(el('div', { class: 'fc-row tap', onclick: () => accountForm(a) },
      el('div', { class: 'fc-row-ic', html: accIcon(a.type) }),
      el('div', { class: 'fc-row-main' },
        el('div', { class: 'fc-row-title', text: a.name }),
        el('div', { class: 'fc-row-sub', text: { cash: '現金', bank: '銀行口座', securities: '証券口座', other: 'その他' }[a.type] })),
      el('div', { class: 'fc-row-amt', text: M(a.balance) }),
    ));
  }
  wrap.append(card(sectionTitle('口座一覧'), list));
  return wrap;
}

function accountForm(acc) {
  const isNew = !acc;
  const name = inputEl({ placeholder: '例）三菱UFJ', value: acc?.name || '' });
  const type = selectEl([
    { value: 'cash', label: '現金' }, { value: 'bank', label: '銀行口座' },
    { value: 'securities', label: '証券口座' }, { value: 'other', label: 'その他' },
  ], acc?.type || 'bank');
  const bal = inputEl({ type: 'number', inputmode: 'numeric', placeholder: '0', value: acc?.balance ?? '' });
  const body = el('div', {},
    field('口座名', name), field('種別', type), field('残高（円）', bal),
    !isNew && el('button', {
      class: 'fc-btn danger block', type: 'button', text: 'この口座を削除',
      onclick: () => confirmDialog('口座を削除', `「${acc.name}」を削除しますか？`, () => {
        S.update((s) => { s.accounts = s.accounts.filter((x) => x.id !== acc.id); S.recordAssetSnapshot(s); });
        render(); toast('削除しました', 'trash');
        qs('.fc-modal-back')?.classList.remove('show');
        setTimeout(() => qs('.fc-modal-back')?.remove(), 260);
      }),
    }),
  );
  modal(isNew ? '口座を追加' : '口座を編集', body, {
    onSave: (close) => {
      if (!name.value.trim()) return toast('口座名を入力してください', 'alert');
      S.update((s) => {
        if (isNew) s.accounts.push({ id: uid('acc'), name: name.value.trim(), type: type.value, balance: Number(bal.value) || 0 });
        else { const a = s.accounts.find((x) => x.id === acc.id); a.name = name.value.trim(); a.type = type.value; a.balance = Number(bal.value) || 0; }
        S.recordAssetSnapshot(s);
      });
      render(); toast('保存しました'); close();
    },
  });
}

// ============ 取引（収入・支出） ============
function renderTransactions() {
  const st = S.getState();
  const wrap = el('div', { class: 'fc-view' });
  wrap.append(pageHead('収支の記録', '追加', () => txForm()));

  // 検索・フィルター
  const f = ui.filter;
  const q = inputEl({ placeholder: 'メモ・カテゴリーで検索', value: f.q });
  const qWrap = el('div', { class: 'fc-search' }, el('span', { class: 'fc-search-ic', html: iconHtml('search', { size: 17 }) }), q);
  q.addEventListener('input', () => { f.q = q.value; renderTxList(listBox); });
  const typeSel = selectEl([{ value: 'all', label: 'すべて' }, { value: 'income', label: '収入' }, { value: 'expense', label: '支出' }], f.type);
  typeSel.addEventListener('change', () => { f.type = typeSel.value; renderTxList(listBox); });
  const catSel = selectEl([{ value: 'all', label: 'カテゴリー：すべて' }, ...S.allCategories().map((c) => ({ value: c.id, label: c.name }))], f.cat);
  catSel.addEventListener('change', () => { f.cat = catSel.value; renderTxList(listBox); });

  const advBtn = el('button', { class: 'fc-chip', type: 'button', html: '<span>詳細条件</span>' + iconHtml('chevronDown', { size: 14 }) });
  const adv = el('div', { class: 'fc-adv' });
  const min = inputEl({ type: 'number', placeholder: '金額 下限', value: f.min });
  const max = inputEl({ type: 'number', placeholder: '金額 上限', value: f.max });
  const from = inputEl({ type: 'date', value: f.from });
  const to = inputEl({ type: 'date', value: f.to });
  [min, max, from, to].forEach((i) => i.addEventListener('input', () => { f.min = min.value; f.max = max.value; f.from = from.value; f.to = to.value; renderTxList(listBox); }));
  adv.append(field('下限', min), field('上限', max), field('開始日', from), field('終了日', to),
    el('button', { class: 'fc-btn ghost block', type: 'button', text: '条件クリア', onclick: () => { ui.filter = { q: '', type: 'all', cat: 'all', min: '', max: '', from: '', to: '' }; go('transactions'); } }));
  adv.style.display = 'none';
  advBtn.addEventListener('click', () => { adv.style.display = adv.style.display === 'none' ? 'grid' : 'none'; });

  wrap.append(card(
    el('div', { class: 'fc-filter' }, qWrap,
      el('div', { class: 'fc-filter-row' }, typeSel, catSel), advBtn, adv),
  ));

  const listBox = el('div', {});
  wrap.append(listBox);
  renderTxList(listBox);
  return wrap;
}

function filteredTx() {
  const st = S.getState();
  const f = ui.filter;
  let list = st.transactions.slice();
  if (f.type !== 'all') list = list.filter((t) => t.type === f.type);
  if (f.cat !== 'all') list = list.filter((t) => t.categoryId === f.cat);
  if (f.min) list = list.filter((t) => t.amount >= Number(f.min));
  if (f.max) list = list.filter((t) => t.amount <= Number(f.max));
  if (f.from) list = list.filter((t) => t.date >= f.from);
  if (f.to) list = list.filter((t) => t.date <= f.to);
  if (f.q.trim()) {
    const qq = f.q.trim().toLowerCase();
    list = list.filter((t) => (t.memo || '').toLowerCase().includes(qq) || S.findCategory(t.categoryId).name.toLowerCase().includes(qq));
  }
  return list.sort((a, b) => b.date.localeCompare(a.date));
}

function renderTxList(box) {
  const list = filteredTx();
  box.innerHTML = '';
  if (!list.length) { box.append(card(el('p', { class: 'fc-empty', text: '該当する取引がありません' }))); return; }
  // 日付でグルーピング
  const groups = {};
  for (const t of list) (groups[t.date] ||= []).push(t);
  const inc = list.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const exp = list.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  box.append(card(el('div', { class: 'fc-txsum' },
    el('span', {}, '収入 ', el('b', { class: 'pos', text: yen(inc) })),
    el('span', {}, '支出 ', el('b', { class: 'neg', text: yen(exp) })),
    el('span', {}, '計 ', el('b', { text: yen(inc - exp, { sign: inc - exp > 0 }) })),
  )));
  for (const date of Object.keys(groups).sort((a, b) => b.localeCompare(a))) {
    const rows = groups[date].map((t) => {
      const cat = S.findCategory(t.categoryId);
      return el('div', { class: 'fc-row tap', onclick: () => txForm(t) },
        el('div', { class: 'fc-row-ic', style: `background:${cat.color}22;color:${cat.color}`, html: iconHtml(t.type === 'income' ? 'up' : 'down', { size: 18 }) }),
        el('div', { class: 'fc-row-main' },
          el('div', { class: 'fc-row-title', text: cat.name }),
          t.memo ? el('div', { class: 'fc-row-sub', text: t.memo }) : ''),
        el('div', { class: 'fc-row-amt ' + (t.type === 'income' ? 'pos' : 'neg'), text: yen(t.amount, { sign: t.type === 'income' }) }));
    });
    box.append(card(el('div', { class: 'fc-date-head', text: fmtDate(date) }), el('div', { class: 'fc-list' }, ...rows)));
  }
}

function txForm(tx) {
  const isNew = !tx;
  const st = S.getState();
  let type = tx?.type || 'expense';
  const seg = el('div', { class: 'fc-seg' });
  const mkSeg = () => {
    seg.innerHTML = '';
    for (const [val, lab] of [['expense', '支出'], ['income', '収入']]) {
      seg.append(el('button', { class: 'fc-seg-btn' + (type === val ? ' on' : ''), type: 'button', text: lab, onclick: () => { type = val; mkSeg(); refreshCats(); } }));
    }
  };
  mkSeg();
  const date = inputEl({ type: 'date', value: tx?.date || today() });
  const amount = inputEl({ type: 'number', inputmode: 'numeric', placeholder: '0', value: tx?.amount ?? '' });
  const catWrap = el('div', {});
  const refreshCats = () => {
    const cats = type === 'income' ? st.categories.income : st.categories.expense;
    catWrap.innerHTML = '';
    catWrap.append(field('カテゴリー', selectEl(cats.map((c) => ({ value: c.id, label: c.name })), tx?.categoryId || cats[0]?.id)));
  };
  refreshCats();
  const memo = inputEl({ placeholder: 'メモ（任意）', value: tx?.memo || '' });
  const acc = selectEl([{ value: '', label: '（口座指定なし）' }, ...accountOptions()], tx?.accountId || '');

  const body = el('div', {},
    field('種別', seg), field('日付', date), field('金額（円）', amount), catWrap,
    field('口座（任意）', acc), field('メモ', memo),
    !isNew && el('button', {
      class: 'fc-btn danger block', type: 'button', text: 'この取引を削除',
      onclick: () => confirmDialog('取引を削除', '削除しますか？', () => {
        S.update((s) => { s.transactions = s.transactions.filter((x) => x.id !== tx.id); });
        render(); toast('削除しました', 'trash');
        qs('.fc-modal-back')?.classList.remove('show'); setTimeout(() => qs('.fc-modal-back')?.remove(), 260);
      }),
    }),
  );
  modal(isNew ? '収支を追加' : '収支を編集', body, {
    onSave: (close) => {
      const amt = Number(amount.value);
      if (!amt || amt <= 0) return toast('金額を入力してください', 'alert');
      const catId = catWrap.querySelector('select').value;
      S.update((s) => {
        const rec = { date: date.value, amount: amt, type, categoryId: catId, memo: memo.value.trim(), accountId: acc.value || null };
        if (isNew) s.transactions.push({ id: uid('tx'), ...rec });
        else Object.assign(s.transactions.find((x) => x.id === tx.id), rec);
      });
      render(); toast('保存しました'); close();
    },
  });
}

// ============ カード管理 ============
function renderCards() {
  const st = S.getState();
  const wrap = el('div', { class: 'fc-view' });
  wrap.append(pageHead('クレジットカード', 'カード追加', () => cardForm()));

  const upcoming = C.upcomingSettlements(st);
  wrap.append(card(
    sectionTitle('次回引落予定'),
    upcoming.length ? el('div', { class: 'fc-list' }, ...upcoming.map((u) =>
      el('div', { class: 'fc-row' },
        el('div', { class: 'fc-row-ic', style: `background:${u.card.color}22;color:${u.card.color}`, html: iconHtml('card', { size: 18 }) }),
        el('div', { class: 'fc-row-main' },
          el('div', { class: 'fc-row-title', text: u.card.name }),
          el('div', { class: 'fc-row-sub', text: `${fmtDateLong(u.payISO)}・${u.count}件` })),
        el('div', { class: 'fc-row-amt neg', text: yen(u.amount) }))))
      : el('p', { class: 'fc-empty', text: 'カード利用がありません' }),
  ));

  const settle = C.settlements(st);
  for (const c of st.cards) {
    const acc = S.findAccount(c.payAccountId);
    const byDate = settle[c.id] || {};
    const dates = Object.keys(byDate).sort();
    const detail = el('div', { class: 'fc-list' });
    for (const d of dates) {
      const grp = byDate[d];
      detail.append(el('div', { class: 'fc-settle-grp' },
        el('div', { class: 'fc-settle-head' }, el('b', { text: `${fmtDate(d)} 引落` }), el('span', { class: 'neg', text: yen(grp.amount) })),
        ...grp.items.sort((a, b) => a.date.localeCompare(b.date)).map((it) =>
          el('div', { class: 'fc-row tap', onclick: () => cardTxForm(c, it) },
            el('div', { class: 'fc-row-main' },
              el('div', { class: 'fc-row-title', text: it.memo || '利用' }),
              el('div', { class: 'fc-row-sub', text: fmtDate(it.date) })),
            el('div', { class: 'fc-row-amt', text: yen(it.amount) }))),
      ));
    }
    wrap.append(card(
      el('div', { class: 'fc-card-head', style: `--card-col:${c.color}` },
        el('div', { class: 'fc-card-chip' }),
        el('div', { class: 'fc-card-headmain' },
          el('div', { class: 'fc-card-name', text: c.name }),
          el('div', { class: 'fc-card-meta', text: `締め:${closeLabel(c.closingDay)}／引落:${payLabel(c)}／${acc?.name || '口座未設定'}` })),
        el('button', { class: 'fc-icobtn', type: 'button', 'aria-label': '設定', html: iconHtml('settings', { size: 18 }), onclick: () => cardForm(c) }),
      ),
      el('div', { class: 'fc-card-actions' }, btnIcon('primary block', 'plus', '利用を登録', () => cardTxForm(c))),
      dates.length ? detail : el('p', { class: 'fc-empty', text: 'まだ利用登録がありません' }),
    ));
  }
  return wrap;
}
const closeLabel = (d) => (d === 'end' ? '毎月末' : `毎月${d}日`);
const payLabel = (c) => `${c.payMonthOffset === 0 ? '当月' : c.payMonthOffset === 1 ? '翌月' : c.payMonthOffset + 'ヶ月後'}${c.payDay === 'end' ? '末' : c.payDay + '日'}`;

function cardForm(c) {
  const isNew = !c;
  const name = inputEl({ placeholder: '例）楽天カード', value: c?.name || '' });
  const closing = selectEl([{ value: 'end', label: '毎月末' }, ...Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `毎月${i + 1}日` }))], c?.closingDay ?? 'end');
  const offset = selectEl([{ value: 0, label: '当月' }, { value: 1, label: '翌月' }, { value: 2, label: '翌々月' }], c?.payMonthOffset ?? 1);
  const payDay = selectEl([{ value: 'end', label: '末日' }, ...Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `${i + 1}日` }))], c?.payDay ?? 27);
  const acc = selectEl([{ value: '', label: '（口座を先に追加してください）' }, ...accountOptions()], c?.payAccountId || S.getState().accounts[0]?.id || '');
  const color = inputEl({ type: 'color', value: c?.color || '#0a84ff' });
  const estBill = inputEl({ type: 'number', inputmode: 'numeric', placeholder: '任意（例）84200', value: c?.estimatedBill ?? '' });
  const body = el('div', {},
    field('カード名', name), field('締日', closing),
    field('引落タイミング', offset), field('引落日', payDay), field('引落口座', acc), field('カラー', color),
    field('今回の請求予定額（任意）', estBill),
    !isNew && el('button', {
      class: 'fc-btn danger block', type: 'button', text: 'このカードを削除',
      onclick: () => confirmDialog('カードを削除', `「${c.name}」と利用履歴を削除しますか？`, () => {
        S.update((s) => { s.cards = s.cards.filter((x) => x.id !== c.id); s.cardTransactions = s.cardTransactions.filter((x) => x.cardId !== c.id); });
        render(); toast('削除しました', 'trash');
        qs('.fc-modal-back')?.classList.remove('show'); setTimeout(() => qs('.fc-modal-back')?.remove(), 260);
      }),
    }),
  );
  modal(isNew ? 'カードを追加' : 'カード設定', body, {
    onSave: (close) => {
      if (!name.value.trim()) return toast('カード名を入力してください', 'alert');
      const cd = closing.value === 'end' ? 'end' : Number(closing.value);
      const pd = payDay.value === 'end' ? 'end' : Number(payDay.value);
      S.update((s) => {
        const rec = { name: name.value.trim(), closingDay: cd, payMonthOffset: Number(offset.value), payDay: pd, payAccountId: acc.value, color: color.value, estimatedBill: estBill.value === '' ? null : Number(estBill.value) };
        if (isNew) s.cards.push({ id: uid('card'), ...rec });
        else Object.assign(s.cards.find((x) => x.id === c.id), rec);
      });
      render(); toast('保存しました'); close();
    },
  });
}

function cardTxForm(cardObj, tx) {
  const isNew = !tx;
  const st = S.getState();
  const date = inputEl({ type: 'date', value: tx?.date || today() });
  const amount = inputEl({ type: 'number', inputmode: 'numeric', placeholder: '0', value: tx?.amount ?? '' });
  const cats = st.categories.expense;
  const cat = selectEl([{ value: '', label: '（カテゴリーなし）' }, ...cats.map((c) => ({ value: c.id, label: c.name }))], tx?.categoryId || '');
  const memo = inputEl({ placeholder: '例）Amazon', value: tx?.memo || '' });
  const preview = el('div', { class: 'fc-settle-preview' });
  const upd = () => {
    if (date.value) preview.textContent = `引落予定日：${fmtDateLong(C.settlementDate(cardObj, date.value))}`;
  };
  date.addEventListener('input', upd); upd();
  const body = el('div', {},
    field('利用日', date), field('金額（円）', amount), field('お店・メモ', memo), field('カテゴリー（任意）', cat),
    preview,
    !isNew && el('button', {
      class: 'fc-btn danger block', type: 'button', text: 'この利用を削除',
      onclick: () => confirmDialog('利用を削除', '削除しますか？', () => {
        S.update((s) => { s.cardTransactions = s.cardTransactions.filter((x) => x.id !== tx.id); });
        render(); toast('削除しました', 'trash');
        qs('.fc-modal-back')?.classList.remove('show'); setTimeout(() => qs('.fc-modal-back')?.remove(), 260);
      }),
    }),
  );
  modal(isNew ? `${cardObj.name}・利用登録` : 'カード利用を編集', body, {
    onSave: (close) => {
      const amt = Number(amount.value);
      if (!amt || amt <= 0) return toast('金額を入力してください', 'alert');
      S.update((s) => {
        const rec = { cardId: cardObj.id, date: date.value, amount: amt, memo: memo.value.trim(), categoryId: cat.value || null };
        if (isNew) s.cardTransactions.push({ id: uid('ctx'), ...rec });
        else Object.assign(s.cardTransactions.find((x) => x.id === tx.id), rec);
      });
      render(); toast('保存しました'); close();
    },
  });
}

// ============ 損益計算書（可処分資金） ============
function renderPL() {
  const st = S.getState();
  const wrap = el('div', { class: 'fc-view' });
  wrap.append(monthNav(ui.plYm, (v) => { ui.plYm = v; render(); }, '損益計算書'));
  const pl = C.monthlyPL(st, ui.plYm);

  const incRows = pl.incomeGroups.map((g) => plLine(g.name, g.amount, g.color));
  const expRows = pl.expenseGroups.map((g) => plLine(g.name, g.amount, g.color));

  wrap.append(card(
    el('div', { class: 'fc-pl-block' },
      el('div', { class: 'fc-pl-cap', text: '収入' }),
      ...(incRows.length ? incRows : [el('p', { class: 'fc-empty', text: '収入なし' })]),
      el('div', { class: 'fc-pl-total' }, el('span', { text: '収入合計' }), el('b', { class: 'pos', text: yen(pl.incomeTotal) }))),
  ));
  wrap.append(card(
    el('div', { class: 'fc-pl-block' },
      el('div', { class: 'fc-pl-cap', text: '支出' }),
      ...(expRows.length ? expRows : [el('p', { class: 'fc-empty', text: '支出なし' })]),
      el('div', { class: 'fc-pl-total' }, el('span', { text: '支出合計' }), el('b', { class: 'neg', text: yen(pl.expenseTotal) }))),
  ));
  wrap.append(el('div', { class: 'fc-disp-hero ' + (pl.disposable >= 0 ? 'pos' : 'neg') },
    el('span', { class: 'fc-disp-hero-lab', text: `${fmtMonth(ui.plYm)}の可処分資金` }),
    el('span', { class: 'fc-disp-hero-amt', text: M(pl.disposable) }),
  ));
  if (pl.cardTotal > 0) {
    wrap.append(card(sectionTitle('カード支払予定の内訳'),
      el('div', { class: 'fc-list' }, ...pl.cardDetail.map((d) =>
        el('div', { class: 'fc-row' }, el('div', { class: 'fc-row-ic', style: `background:${d.card.color}22;color:${d.card.color}`, html: iconHtml('card', { size: 18 }) }),
          el('div', { class: 'fc-row-main' }, el('div', { class: 'fc-row-title', text: d.card.name })),
          el('div', { class: 'fc-row-amt neg', text: yen(d.amount) }))))));
  }
  return wrap;
}
function plLine(name, amount, color) {
  return el('div', { class: 'fc-pl-line' },
    el('span', { class: 'fc-pl-dot', style: color ? `background:${color}` : 'display:none' }),
    el('span', { class: 'fc-pl-name', text: name }),
    el('span', { class: 'fc-pl-amt', text: num(amount) }));
}

// ============ 資産シミュレーション（データ駆動・日次キャッシュフロー） ============
function kv(k, v) { return el('div', { class: 'fc-kv-row' }, el('span', { text: k }), el('b', { text: v })); }

function renderSimulate() {
  const st = S.getState();
  const secret = st.settings.secret;
  const wrap = el('div', { class: 'fc-view' });
  wrap.append(el('h1', { class: 'fc-page-title', text: '資産シミュレーション' }));

  // 期間切替
  const periods = [[3, '3か月'], [6, '半年'], [12, '1年'], [24, '2年'], [36, '3年']];
  if (!periods.some((p) => p[0] === ui.simMonths)) ui.simMonths = 12;
  const seg = el('div', { class: 'fc-period' });
  for (const [mo, lab] of periods)
    seg.append(el('button', { class: 'fc-period-btn' + (ui.simMonths === mo ? ' on' : ''), type: 'button', text: lab, onclick: () => { ui.simMonths = mo; render(); } }));
  wrap.append(seg);

  const sim = CF.simulate(st, ui.simMonths);
  const chart = CF.chartSeries(st, ui.simMonths);
  const endTotal = chart[chart.length - 1].value;
  const diff = endTotal - sim.start;
  const shortage = CF.shortageAlert(st, ui.simMonths);
  const unpaid = CF.unpaidCards(st);

  // 現在資産ヒーロー
  wrap.append(el('div', { class: 'fc-simhero' + (shortage ? ' warn' : '') },
    el('span', { class: 'fc-simhero-lab', text: '現在資産' }),
    el('span', { class: 'fc-simhero-amt', text: M(sim.start) }),
    el('div', { class: 'fc-simhero-foot' },
      el('span', { text: `${periods.find((p) => p[0] === ui.simMonths)[1]}後の予想` }),
      el('b', { class: diff >= 0 ? 'pos' : 'neg', text: secret ? '＊＊＊' : M(endTotal) + `（${yen(diff, { sign: diff > 0 })}）` })),
  ));

  // 資産不足アラート（⑪）
  if (shortage) {
    wrap.append(el('div', { class: 'fc-shortage' },
      el('div', { class: 'fc-shortage-top' }, el('span', { class: 'fc-shortage-ic', html: iconHtml('alert', { size: 18 }) }), el('b', { text: shortage.message })),
      el('div', { class: 'fc-shortage-sub', text: `最低残高の見込み ${M(sim.minPoint.total)}（${fmtDate(sim.minPoint.date)}）` }),
      shortage.causes.length ? el('div', { class: 'fc-shortage-causes' },
        el('span', { class: 'fc-shortage-causes-lab', text: '主な要因' }),
        ...shortage.causes.map((c) => el('span', { class: 'fc-cause-chip' }, el('span', { class: 'fc-ico', html: iconHtml(CF.eventIcon(c.kind), { size: 13 }) }), el('span', { text: `${c.description || CF.eventLabel(c.kind)} ${yen(c.amount)}` })))) : '',
    ));
  }

  // 資産推移グラフ（⑧⑩）
  wrap.append(card(
    sectionTitle('資産推移', el('span', { class: 'fc-chart-hint', text: '下のタイムラインで詳細' })),
    secret ? el('p', { class: 'fc-empty', text: 'シークレットモード中は非表示' })
      : el('div', { class: 'fc-chart', html: lineChart(chart, { color: shortage ? 'var(--fc-neg)' : 'var(--fc-accent)', height: 230 }) }),
  ));

  // 未払いカード（⑦）
  if (st.cards.length) {
    wrap.append(el('div', { class: 'fc-unpaid tap', role: 'button', onclick: () => unpaidModal(unpaid) },
      el('div', { class: 'fc-unpaid-ic', html: iconHtml('card', { size: 20 }) }),
      el('div', { class: 'fc-unpaid-main' },
        el('span', { class: 'fc-unpaid-lab', text: '現在未払い（カード）' }),
        el('span', { class: 'fc-unpaid-sub', text: `${unpaid.items.length}件・タップで一覧` })),
      el('span', { class: 'fc-unpaid-amt', text: secret ? '＊＊＊' : yen(unpaid.total) }),
      el('span', { class: 'fc-link-arrow', html: iconHtml('chevronRight', { size: 16 }) }),
    ));
  }

  // 将来の可処分資金（⑧）
  const fc = CF.forecasts(st);
  wrap.append(card(sectionTitle('将来の資産予想'),
    el('div', { class: 'fc-fc-list' }, ...fc.map((f) =>
      el('div', { class: 'fc-fc-row' },
        el('span', { class: 'fc-fc-lab', text: f.label }),
        el('span', { class: 'fc-fc-amt' + (f.total < 0 ? ' neg' : ''), text: M(f.total) }),
        el('span', { class: 'fc-fc-delta ' + (f.delta >= 0 ? 'pos' : 'neg'), text: secret ? '' : yen(f.delta, { sign: f.delta > 0 }) }))),
  )));

  // 将来のイベント タイムライン（⑩）
  const events = CF.timeline(st, { days: ui.simMonths <= 6 ? 120 : 200, max: 24 });
  wrap.append(card(sectionTitle('これからの入出金'),
    events.length ? el('div', { class: 'fc-timeline' }, ...events.map((e) => timelineItem(e, sim, secret)))
      : el('p', { class: 'fc-empty', text: '固定収支やカード利用を登録すると、ここに将来の入出金が表示されます' })));

  wrap.append(el('p', { class: 'fc-note', text: '※ 登録済みの口座残高・固定収支・カード利用・将来日付の取引だけから、カードは実際の引落日に銀行から差し引いて計算しています。編集すると即座に再計算されます。' }));
  return wrap;
}

function timelineItem(e, sim, secret) {
  const income = e.amount >= 0;
  return el('div', { class: 'fc-tl-item tap', role: 'button', onclick: () => eventDetailModal(e, sim) },
    el('div', { class: 'fc-tl-date' }, el('b', { text: `${parseISO(e.date).getMonth() + 1}/${parseISO(e.date).getDate()}` }), el('span', { text: `${weekdayName(parseISO(e.date).getDay())}` })),
    el('div', { class: 'fc-tl-ic ' + (income ? 'pos' : 'neg'), html: iconHtml(e.icon, { size: 16 }) }),
    el('div', { class: 'fc-tl-main' },
      el('div', { class: 'fc-tl-title', text: e.description || e.kindLabel }),
      el('div', { class: 'fc-tl-sub', text: e.kindLabel })),
    el('div', { class: 'fc-tl-amt ' + (income ? 'pos' : 'neg'), text: secret ? '＊＊＊' : yen(e.amount, { sign: income }) }),
  );
}

function unpaidModal(unpaid) {
  const body = unpaid.items.length ? el('div', { class: 'fc-list' }, ...unpaid.items.map((i) =>
    el('div', { class: 'fc-row' },
      el('div', { class: 'fc-row-ic', style: `background:${i.card.color}22;color:${i.card.color}`, html: iconHtml('card', { size: 18 }) }),
      el('div', { class: 'fc-row-main' },
        el('div', { class: 'fc-row-title', text: `${i.card.name}${i.memo ? '・' + i.memo : ''}` }),
        el('div', { class: 'fc-row-sub', text: `利用 ${fmtDate(i.txDate)} → 引落予定 ${fmtDate(i.payISO)}` })),
      el('div', { class: 'fc-row-amt', text: yen(i.amount) })))) : el('p', { class: 'fc-empty', text: '未払いのカード利用はありません' });
  const head = el('div', { class: 'fc-modal-total' }, el('span', { text: '未払い合計' }), el('b', { text: yen(unpaid.total) }));
  modal('未払いカード一覧', el('div', {}, head, body), {});
}

function eventDetailModal(e, sim) {
  const income = e.amount >= 0;
  const balance = CF.balanceAt(sim.series, e.date);
  const body = el('div', {},
    el('div', { class: 'fc-evd-amt ' + (income ? 'pos' : 'neg'), text: yen(e.amount, { sign: income }) }),
    el('div', { class: 'fc-kv' },
      kv('種別', e.kindLabel),
      kv('内容', e.description || '—'),
      kv('日付', fmtDateLong(e.date)),
      e.meta?.count ? kv('内訳', `${e.meta.count}件のカード利用`) : '',
      kv('この日の資産見込み', M(balance)),
      e.recurrence === 'monthly' ? kv('繰り返し', '毎月') : ''),
  );
  modal('入出金の詳細', body, {});
}

// ============ カレンダー ============
function renderCalendar() {
  const st = S.getState();
  const wrap = el('div', { class: 'fc-view' });
  const { y, m } = ui.cal;
  const head = el('div', { class: 'fc-cal-nav' },
    el('button', { class: 'fc-icobtn', type: 'button', 'aria-label': '前の月', html: iconHtml('arrowLeft', { size: 18 }), onclick: () => { ui.cal = stepMonth(y, m, -1); render(); } }),
    el('b', { text: `${y}年${m + 1}月` }),
    el('button', { class: 'fc-icobtn', type: 'button', 'aria-label': '次の月', html: iconHtml('arrowRight', { size: 18 }), onclick: () => { ui.cal = stepMonth(y, m, 1); render(); } }));
  wrap.append(el('div', { class: 'fc-page-head' }, el('h1', { class: 'fc-page-title', text: 'カレンダー' }), head));

  const events = C.calendarEvents(st, y, m);
  const first = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const grid = el('div', { class: 'fc-cal-grid' });
  ['日', '月', '火', '水', '木', '金', '土'].forEach((w, i) =>
    grid.append(el('div', { class: 'fc-cal-wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : ''), text: w })));
  for (let i = 0; i < first; i++) grid.append(el('div', { class: 'fc-cal-cell empty' }));
  const todayISO = today();
  for (let d = 1; d <= dim; d++) {
    const evs = events[d] || [];
    const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
    const dots = el('div', { class: 'fc-cal-dots' });
    const kinds = new Set(evs.map((e) => e.type === 'income' ? 'inc' : 'exp'));
    if (evs.some((e) => e.kind === 'card')) dots.append(el('i', { class: 'dot card' }));
    if (kinds.has('inc')) dots.append(el('i', { class: 'dot inc' }));
    if (kinds.has('exp')) dots.append(el('i', { class: 'dot exp' }));
    grid.append(el('div', {
      class: 'fc-cal-cell' + (iso === todayISO ? ' today' : '') + (evs.length ? ' has' : ''),
      onclick: () => dayDetail(iso, evs),
    }, el('span', { class: 'fc-cal-day', text: d }), dots));
  }
  wrap.append(card(grid, el('div', { class: 'fc-cal-legend' },
    lg('inc', '収入'), lg('exp', '支出'), lg('card', 'カード引落'))));
  return wrap;
}
function lg(cls, label) { return el('span', { class: 'fc-cal-lgitem' }, el('i', { class: 'dot ' + cls }), label); }
function stepMonth(y, m, d) { const nd = new Date(y, m + d, 1); return { y: nd.getFullYear(), m: nd.getMonth() }; }
function dayDetail(iso, evs) {
  const body = evs.length ? el('div', { class: 'fc-list' }, ...evs.map((e) =>
    el('div', { class: 'fc-row' },
      el('div', { class: 'fc-row-ic', style: e.kind === 'card' && e.color ? `background:${e.color}22;color:${e.color}` : '', html: iconHtml(e.kind === 'card' ? 'card' : e.type === 'income' ? 'coins' : 'file', { size: 18 }) }),
      el('div', { class: 'fc-row-main' }, el('div', { class: 'fc-row-title', text: e.label || (e.type === 'income' ? '収入' : '支出') })),
      el('div', { class: 'fc-row-amt ' + (e.type === 'income' ? 'pos' : 'neg'), text: yen(e.amount, { sign: e.type === 'income' }) }))))
    : el('p', { class: 'fc-empty', text: '予定はありません' });
  modal(fmtDateLong(iso), body, {});
}

// ============ 分析 ============
function renderAnalysis() {
  const st = S.getState();
  const wrap = el('div', { class: 'fc-view' });
  wrap.append(monthNav(ui.anaYm, (v) => { ui.anaYm = v; render(); }, '分析'));

  // 支出割合ドーナツ
  const byCat = C.expenseByCategory(st, ui.anaYm);
  const total = byCat.reduce((s, g) => s + g.amount, 0);
  wrap.append(card(sectionTitle('カテゴリー別支出'),
    total > 0 ? el('div', { class: 'fc-donut-wrap' },
      el('div', { class: 'fc-donut-box', html: donutChart(byCat.map((g) => ({ label: g.name, value: g.amount, color: g.color })), { size: 190, centerLabel: '支出合計' }) }),
      el('div', { class: 'fc-legend-list' }, ...byCat.map((g) =>
        el('div', { class: 'fc-legend-row' },
          el('i', { class: 'dot', style: `background:${g.color}` }),
          el('span', { class: 'fc-legend-name', text: g.name }),
          el('span', { class: 'fc-legend-pct', text: `${Math.round((g.amount / total) * 100)}%` }),
          el('span', { class: 'fc-legend-amt', text: yen(g.amount) })))))
      : el('p', { class: 'fc-empty', text: 'この月の支出データがありません' })));

  // 収入・支出推移（棒）
  const trend = C.monthlyTrend(st, 6);
  wrap.append(card(sectionTitle('収入・支出の推移（6ヶ月）'),
    el('div', { class: 'fc-chart', html: groupedBarChart(trend.map((t) => ({ label: `${Number(t.ym.split('-')[1])}月`, income: t.income, expense: t.expense })), { height: 220 }) }),
    el('div', { class: 'fc-legend' }, el('span', {}, el('i', { class: 'dot', style: 'background:#34c759' }), '収入'),
      el('span', {}, el('i', { class: 'dot', style: 'background:#ff453a' }), '支出'))));

  // 可処分資金の推移（折れ線）
  wrap.append(card(sectionTitle('可処分資金の推移'),
    el('div', { class: 'fc-chart', html: lineChart(trend.map((t) => ({ label: `${Number(t.ym.split('-')[1])}月`, value: t.disposable })), { color: '#30d158', height: 190 }) })));

  // 資産推移（将来・データ駆動）
  wrap.append(card(sectionTitle('資産推移（今後2年）', el('button', { class: 'fc-link', type: 'button', onclick: () => go('simulate') }, '詳細', el('span', { class: 'fc-link-arrow', html: iconHtml('chevronRight', { size: 15 }) }))),
    st.settings.secret ? el('p', { class: 'fc-empty', text: 'シークレットモード中は非表示' })
      : el('div', { class: 'fc-chart', html: lineChart(CF.chartSeries(st, 24), { color: '#0a84ff', height: 190 }) })));
  return wrap;
}

// ============ メニュー ============
function renderMenu() {
  const wrap = el('div', { class: 'fc-view' });
  wrap.append(el('h1', { class: 'fc-page-title', text: '各種機能' }));
  const items = [
    ['accounts', 'bank', '口座管理', '残高の追加・編集'],
    ['pl', 'receipt', '損益計算書', '今月の可処分資金'],
    ['calendar', 'calendar', 'カレンダー', '給料日・引落日'],
    ['analysis', 'pie', '分析', '支出割合・推移'],
    ['recurring', 'repeat', '固定収支', '毎月の収入・支出'],
    ['categories', 'tag', 'カテゴリー', '追加・編集・削除'],
    ['data', 'database', 'データ管理', 'バックアップ・CSV'],
  ];
  const grid = el('div', { class: 'fc-menu-grid' });
  for (const [route, ic, title, sub] of items)
    grid.append(el('button', { class: 'fc-menu-tile', type: 'button', onclick: () => go(route) },
      el('span', { class: 'fc-menu-ic', html: iconHtml(ic, { size: 22 }) }),
      el('span', { class: 'fc-menu-title', text: title }),
      el('span', { class: 'fc-menu-sub', text: sub })));
  wrap.append(grid);

  // 設定
  const st = S.getState();
  wrap.append(card(sectionTitle('設定'),
    el('div', { class: 'fc-set-row' }, el('span', { text: '月の予算' }),
      el('button', { class: 'fc-link', type: 'button', text: yen(st.settings.monthlyBudget), onclick: () => budgetForm() })),
    el('div', { class: 'fc-set-row' }, el('span', { text: 'テーマ' }), themeSeg()),
    el('div', { class: 'fc-set-row' }, el('span', { text: 'シークレットモード' }),
      toggle(st.settings.secret, () => { S.update((s) => { s.settings.secret = !s.settings.secret; }); render(); })),
  ));
  wrap.append(el('p', { class: 'fc-appfoot', text: '資産管理アプリ・データはこの端末内に保存されます' }));
  return wrap;
}
function themeSeg() {
  const st = S.getState();
  const seg = el('div', { class: 'fc-seg small' });
  for (const [v, l] of [['auto', '自動'], ['light', 'ライト'], ['dark', 'ダーク']])
    seg.append(el('button', { class: 'fc-seg-btn' + (st.settings.theme === v ? ' on' : ''), type: 'button', text: l, onclick: () => { S.update((s) => { s.settings.theme = v; }); applyTheme(); render(); } }));
  return seg;
}
function toggle(on, onClick) {
  return el('button', { class: 'fc-toggle' + (on ? ' on' : ''), type: 'button', onclick: onClick }, el('span', { class: 'fc-toggle-knob' }));
}
function budgetForm() {
  const b = inputEl({ type: 'number', value: S.getState().settings.monthlyBudget });
  modal('月の予算', field('予算（円）', b), { onSave: (close) => { S.update((s) => { s.settings.monthlyBudget = Number(b.value) || 0; }); render(); toast('保存しました'); close(); } });
}

// ============ 固定収支 ============
function renderRecurring() {
  const st = S.getState();
  const wrap = el('div', { class: 'fc-view' });
  wrap.append(pageHead('固定収入・固定支出', '追加', () => recurringForm()));
  const incomes = st.recurring.filter((r) => r.type === 'income');
  const expenses = st.recurring.filter((r) => r.type === 'expense');
  const mkList = (arr) => el('div', { class: 'fc-list' }, ...arr.map((r) => {
    const cat = S.findCategory(r.categoryId);
    return el('div', { class: 'fc-row tap', onclick: () => recurringForm(r) },
      el('div', { class: 'fc-row-ic', style: `background:${cat.color}22;color:${cat.color}`, html: iconHtml(r.type === 'income' ? 'coins' : 'file', { size: 18 }) }),
      el('div', { class: 'fc-row-main' }, el('div', { class: 'fc-row-title', text: r.name }),
        el('div', { class: 'fc-row-sub', text: `毎月${r.day === 'end' ? '末' : r.day + '日'}・${cat.name}` })),
      el('div', { class: 'fc-row-amt ' + (r.type === 'income' ? 'pos' : 'neg'), text: yen(r.amount, { sign: r.type === 'income' }) }));
  }));
  wrap.append(card(sectionTitle('固定収入'), incomes.length ? mkList(incomes) : el('p', { class: 'fc-empty', text: 'なし' })));
  wrap.append(card(sectionTitle('固定支出'), expenses.length ? mkList(expenses) : el('p', { class: 'fc-empty', text: 'なし' })));
  wrap.append(el('p', { class: 'fc-note', text: '固定収支は毎月自動で損益計算・カレンダー・可処分資金に反映されます。' }));
  return wrap;
}
function recurringForm(r) {
  const isNew = !r;
  const st = S.getState();
  let type = r?.type || 'expense';
  const seg = el('div', { class: 'fc-seg' });
  const catWrap = el('div', {});
  const refreshCats = () => {
    const cats = type === 'income' ? st.categories.income : st.categories.expense;
    catWrap.innerHTML = ''; catWrap.append(field('カテゴリー', selectEl(cats.map((c) => ({ value: c.id, label: c.name })), r?.categoryId || cats[0]?.id)));
  };
  const mkSeg = () => { seg.innerHTML = ''; for (const [val, lab] of [['expense', '支出'], ['income', '収入']]) seg.append(el('button', { class: 'fc-seg-btn' + (type === val ? ' on' : ''), type: 'button', text: lab, onclick: () => { type = val; mkSeg(); refreshCats(); } })); };
  mkSeg(); refreshCats();
  const name = inputEl({ placeholder: '例）家賃', value: r?.name || '' });
  const day = selectEl([{ value: 'end', label: '毎月末' }, ...Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `毎月${i + 1}日` }))], r?.day ?? 25);
  const amount = inputEl({ type: 'number', value: r?.amount ?? '' });
  const acc = selectEl([{ value: '', label: '（口座指定なし）' }, ...accountOptions()], r?.accountId || '');
  const body = el('div', {}, field('種別', seg), field('名称', name), field('毎月の発生日', day), field('金額（円）', amount), catWrap, field('口座（任意）', acc),
    !isNew && el('button', { class: 'fc-btn danger block', type: 'button', text: '削除', onclick: () => confirmDialog('固定収支を削除', '削除しますか？', () => { S.update((s) => { s.recurring = s.recurring.filter((x) => x.id !== r.id); }); render(); toast('削除しました', 'trash'); qs('.fc-modal-back')?.remove(); }) }));
  modal(isNew ? '固定収支を追加' : '固定収支を編集', body, {
    onSave: (close) => {
      if (!name.value.trim() || !Number(amount.value)) return toast('名称と金額を入力してください', 'alert');
      const catId = catWrap.querySelector('select').value;
      S.update((s) => {
        const rec = { type, name: name.value.trim(), day: day.value === 'end' ? 'end' : Number(day.value), amount: Number(amount.value), categoryId: catId, accountId: acc.value || null };
        if (isNew) s.recurring.push({ id: uid('rec'), ...rec }); else Object.assign(s.recurring.find((x) => x.id === r.id), rec);
      });
      render(); toast('保存しました'); close();
    },
  });
}

// ============ カテゴリー管理 ============
function renderCategories() {
  const st = S.getState();
  const wrap = el('div', { class: 'fc-view' });
  wrap.append(el('h1', { class: 'fc-page-title', text: 'カテゴリー' }));
  const block = (label, kind, arr) => card(
    sectionTitle(label, el('button', { class: 'fc-link', type: 'button', onclick: () => categoryForm(kind) }, el('span', { class: 'fc-add-ic sm', html: iconHtml('plus', { size: 14 }) }), el('span', { text: '追加' }))),
    el('div', { class: 'fc-cat-wrap' }, ...arr.map((c) =>
      el('button', { class: 'fc-cat-chip', type: 'button', style: `--c:${c.color}`, onclick: () => categoryForm(kind, c) },
        el('i', { class: 'dot', style: `background:${c.color}` }), c.name))));
  wrap.append(block('収入カテゴリー', 'income', st.categories.income));
  wrap.append(block('支出カテゴリー', 'expense', st.categories.expense));
  return wrap;
}
function categoryForm(kind, c) {
  const isNew = !c;
  const palette = ['#ff375f', '#ff453a', '#ff9500', '#ffd60a', '#34c759', '#30d158', '#5ac8fa', '#0a84ff', '#5e5ce6', '#bf5af2', '#ff6482', '#8e8e93'];
  const name = inputEl({ placeholder: '例）食費', value: c?.name || '' });
  let color = c?.color || palette[0];
  const sw = el('div', { class: 'fc-swatches' });
  const draw = () => { sw.innerHTML = ''; palette.forEach((p) => sw.append(el('button', { class: 'fc-swatch' + (p === color ? ' on' : ''), type: 'button', style: `background:${p}`, onclick: () => { color = p; draw(); } }))); };
  draw();
  const body = el('div', {}, field('名称', name), field('カラー', sw),
    !isNew && el('button', { class: 'fc-btn danger block', type: 'button', text: '削除', onclick: () => confirmDialog('カテゴリーを削除', `「${c.name}」を削除しますか？関連取引は「未分類」になります。`, () => { S.update((s) => { s.categories[kind] = s.categories[kind].filter((x) => x.id !== c.id); }); render(); toast('削除しました', 'trash'); qs('.fc-modal-back')?.remove(); }) }));
  modal(isNew ? 'カテゴリーを追加' : 'カテゴリーを編集', body, {
    onSave: (close) => {
      if (!name.value.trim()) return toast('名称を入力してください', 'alert');
      S.update((s) => {
        if (isNew) s.categories[kind].push({ id: uid('cat'), name: name.value.trim(), color });
        else { const cc = s.categories[kind].find((x) => x.id === c.id); cc.name = name.value.trim(); cc.color = color; }
      });
      render(); toast('保存しました'); close();
    },
  });
}

// ============ データ管理 ============
function renderData() {
  const wrap = el('div', { class: 'fc-view' });
  wrap.append(el('h1', { class: 'fc-page-title', text: 'データ管理' }));
  wrap.append(card(sectionTitle('バックアップ・復元'),
    el('p', { class: 'fc-note', text: 'すべてのデータをJSONファイルとして書き出し／読み込みできます。' }),
    btnIcon('primary block', 'down', 'バックアップを書き出す', exportBackup),
    btnIcon('ghost block', 'up', 'バックアップから復元', () => importFile('json'))));
  wrap.append(card(sectionTitle('CSV'),
    el('p', { class: 'fc-note', text: '取引履歴（収入・支出）をCSVで入出力できます。列: 日付,種別,金額,カテゴリー,メモ' }),
    btnIcon('ghost block', 'down', '取引をCSVエクスポート', exportCSV),
    btnIcon('ghost block', 'up', 'CSVインポート', () => importFile('csv'))));
  wrap.append(card(sectionTitle('リセット'),
    el('button', { class: 'fc-btn danger block', type: 'button', text: 'すべてのデータを初期化', onclick: () => confirmDialog('初期化', '本当にすべてのデータを削除して初期状態に戻しますか？この操作は取り消せません。', () => { S.resetAll(); go('dashboard'); toast('初期化しました', 'repeat'); }, { yesLabel: '初期化する' }) })));
  return wrap;
}
function download(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportBackup() {
  download(`finance-backup-${today()}.json`, JSON.stringify(S.getState(), null, 2));
  toast('バックアップを書き出しました', 'database');
}
function exportCSV() {
  const st = S.getState();
  const rows = [['日付', '種別', '金額', 'カテゴリー', 'メモ']];
  for (const t of st.transactions.slice().sort((a, b) => a.date.localeCompare(b.date)))
    rows.push([t.date, t.type === 'income' ? '収入' : '支出', t.amount, S.findCategory(t.categoryId).name, (t.memo || '').replace(/"/g, '""')]);
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  download(`finance-transactions-${today()}.csv`, csv, 'text/csv');
  toast('CSVを書き出しました', 'file');
}
function importFile(kind) {
  const inp = el('input', { type: 'file', accept: kind === 'json' ? '.json,application/json' : '.csv,text/csv' });
  inp.addEventListener('change', () => {
    const file = inp.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { kind === 'json' ? doImportJSON(reader.result) : doImportCSV(reader.result); };
    reader.readAsText(file);
  });
  inp.click();
}
function doImportJSON(text) {
  try {
    const data = JSON.parse(text);
    if (!data.accounts || !data.categories) throw new Error('形式が不正です');
    confirmDialog('復元', '現在のデータを、選択したバックアップで置き換えますか？', () => { S.replaceState(data); applyTheme(); go('dashboard'); toast('復元しました', 'repeat'); }, { yesLabel: '復元する', danger: false });
  } catch (e) { toast('読み込みに失敗しました: ' + e.message, 'alert'); }
}
function doImportCSV(text) {
  try {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
    let added = 0;
    S.update((s) => {
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        if (cols.length < 3) continue;
        const [date, typeJa, amount, catName, memo] = cols;
        const type = typeJa.includes('収') ? 'income' : 'expense';
        let cat = s.categories[type].find((c) => c.name === catName);
        if (!cat && catName) { cat = { id: uid('cat'), name: catName, color: '#8e8e93' }; s.categories[type].push(cat); }
        s.transactions.push({ id: uid('tx'), date: (date || today()).slice(0, 10), amount: Number(String(amount).replace(/[^\d.-]/g, '')) || 0, type, categoryId: cat?.id || null, memo: memo || '' });
        added++;
      }
    });
    go('transactions'); toast(`${added}件をインポートしました`, 'down');
  } catch (e) { toast('CSVの読み込みに失敗しました', 'alert'); }
}
function parseCsvLine(line) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
    else { if (ch === '"') inQ = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; }
  }
  out.push(cur); return out;
}

// ============ 共通ヘッダー・月ナビ ============
function pageHead(title, addLabel, onAdd) {
  return el('div', { class: 'fc-page-head' }, el('h1', { class: 'fc-page-title', text: title }),
    onAdd ? el('button', { class: 'fc-add-btn', type: 'button', onclick: onAdd },
      el('span', { class: 'fc-add-ic', html: iconHtml('plus', { size: 16 }) }), el('span', { text: addLabel })) : '');
}
function monthNav(ymStr, onChange, title) {
  const [y, m] = ymStr.split('-').map(Number);
  const prev = () => onChange(ym(new Date(y, m - 2, 1)));
  const next = () => onChange(ym(new Date(y, m, 1)));
  return el('div', { class: 'fc-page-head' }, el('h1', { class: 'fc-page-title', text: title }),
    el('div', { class: 'fc-cal-nav' },
      el('button', { class: 'fc-icobtn', type: 'button', 'aria-label': '前の月', html: iconHtml('arrowLeft', { size: 18 }), onclick: prev }),
      el('b', { text: `${y}年${m}月` }),
      el('button', { class: 'fc-icobtn', type: 'button', 'aria-label': '次の月', html: iconHtml('arrowRight', { size: 18 }), onclick: next })));
}

// ============ テーマ・通知・初期化 ============
function applyTheme() {
  const t = S.getState().settings.theme;
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-fc-theme');
  else root.setAttribute('data-fc-theme', t);
}

function checkNotifications() {
  const st = S.getState();
  const notes = C.buildNotifications(st);
  const fresh = notes.filter((n) => !st.settings.notifiedKeys.includes(n.id));
  if (!fresh.length) return;
  let delay = 600;
  for (const n of fresh) { setTimeout(() => toast(n.text, n.icon), delay); delay += 1500; }
  S.update((s) => { s.settings.notifiedKeys = [...new Set([...s.settings.notifiedKeys, ...fresh.map((n) => n.id)])].slice(-100); }, { silent: true });
}

function buildNav() {
  const nav = el('nav', { id: 'fc-nav', class: 'fc-nav' });
  const items = [
    ['dashboard', 'ホーム', 'home'],
    ['transactions', '収支', 'swap'],
    ['cards', 'カード', 'card'],
    ['simulate', '将来', 'trending'],
    ['menu', '各種', 'grid'],
  ];
  for (const [route, label, iconName] of items) {
    nav.append(el('button', {
      class: 'fc-nav-btn', type: 'button', dataset: { route }, onclick: () => go(route),
    }, el('span', { class: 'fc-nav-ic', html: iconHtml(iconName, { size: 23, sw: 2 }) }),
       el('span', { class: 'fc-nav-lab', text: label })));
  }
  return nav;
}

export function init() {
  applyTheme();
  // 起動時に資産スナップショットのベースラインを記録（口座があり履歴が無い場合）
  const st0 = S.getState();
  if ((st0.assetHistory || []).length === 0 && st0.accounts.length > 0) {
    S.update((s) => S.recordAssetSnapshot(s), { silent: true });
  }
  // ルート要素を用意
  const root = qs('#fc-root');
  root.append(el('div', { id: 'view', class: 'fc-content' }));
  root.append(buildNav());
  render();
  setTimeout(checkNotifications, 400);
  // OSテーマ変更に追随（auto時）
  window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', () => { if (S.getState().settings.theme === 'auto') render(); });
}
