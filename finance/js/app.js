// app.js — ルーティング・画面描画・フォーム・操作の統合レイヤー
import * as S from './store.js?v=20260724a';
import * as C from './calc.js?v=20260724a';
import * as CF from './cashflow.js?v=20260724a';
import { lineChart, barChart, groupedBarChart, donutChart } from './charts.js?v=20260724a';
import { iconHtml, icon } from './icons.js?v=20260724a';
import {
  el, qs, yen, yenMasked, num, today, toISO, parseISO, ym, fmtDate, fmtDateLong,
  fmtMonth, addMonths, resolveDay, pad, weekdayName, haptic, escapeHtml, uid,
} from './utils.js?v=20260724a';

// ---- 画面ローカル状態（データではないUI状態） ----
const ui = {
  route: 'dashboard',
  simMonths: 12,           // 将来シミュレーションの表示期間
  cal: { y: new Date().getFullYear(), m: new Date().getMonth() },
  plYm: ym(new Date()),
  anaYm: ym(new Date()),
  filter: { q: '', type: 'all', cat: 'all', min: '', max: '', from: '', to: '' },
  simOpen: new Set(), // 将来入出金で展開中の日付
  ledgerAcct: null,   // 収支画面で表示中の口座ID
  ledgerFilter: 'all', // すべて/収入/支出/振替
};

// 口座別の取引履歴（収支画面）を開く。ホームの口座カードから使用。
function openAccountLedger(id) { ui.ledgerAcct = id; ui.ledgerFilter = 'all'; go('transactions'); }

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
  transfers: renderTransfers,
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
    const active = r === ui.route || (r === 'menu' && ['accounts', 'pl', 'calendar', 'analysis', 'data', 'categories', 'recurring', 'transfers'].includes(ui.route));
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

// 振替: 資産の移動（総資産は不変、各口座残高のみ変更）
function applyTransfer(s, fromId, toId, amt) {
  const f = s.accounts.find((a) => a.id === fromId);
  const t = s.accounts.find((a) => a.id === toId);
  if (f) f.balance = (Number(f.balance) || 0) - amt;
  if (t) t.balance = (Number(t.balance) || 0) + amt;
}
function reverseTransfer(s, fromId, toId, amt) { applyTransfer(s, toId, fromId, amt); }

// ============ ダッシュボード ============
function renderDashboard() {
  const st = S.getState();
  const secret = st.settings.secret;
  const total = C.totalAssets(st);
  const disp = C.disposableAssets(st);
  const reserved = C.reservedAssets(st);
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
    // 可処分資金（今すぐ自由に使える口座の残高）／ 投資・その他
    st.accounts.length ? el('div', { class: 'fc-hero-split' },
      el('div', { class: 'fc-hsplit' }, el('span', { class: 'fc-hsplit-lab', text: '可処分資金' }), el('span', { class: 'fc-hsplit-val', text: secret ? '＊＊＊' : yen(disp) })),
      el('div', { class: 'fc-hsplit' }, el('span', { class: 'fc-hsplit-lab', text: '投資・その他' }), el('span', { class: 'fc-hsplit-val dim', text: secret ? '＊＊＊' : yen(reserved) })),
    ) : '',
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
      el('span', { class: 'fc-disp-title', text: '今月の収支' }),
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

  // --- 今月あと使える金額（予算ベース・管理期間で計算） ---
  const sp = C.spendableStatus(st);
  const periodLabel = `${fmtDate(sp.period.startISO).replace(/\(.\)/, '')}〜${fmtDate(sp.period.endISO).replace(/\(.\)/, '')}`;
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
      el('div', { class: 'fc-spend-period', onclick: () => periodForm() }, el('span', { html: iconHtml('calendar', { size: 12 }) }), el('span', { text: `管理期間 ${periodLabel}` })),
    ));
  } else {
    wrap.append(card(
      el('div', { class: 'fc-spend-head' }, el('span', { class: 'fc-sec-title', text: '今月あと使える金額' })),
      el('button', { class: 'fc-btn ghost block', type: 'button', text: '月の予算を設定する', onclick: () => budgetForm() }),
    ));
  }

  // --- 次回引落予定 ---
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
  const acctRow = (a) => el('div', { class: 'fc-row tap', onclick: () => openAccountLedger(a.id) },
    el('div', { class: 'fc-row-ic', html: accIcon(a.type) }),
    el('div', { class: 'fc-row-main' },
      el('div', { class: 'fc-row-title', text: a.name }),
      el('div', { class: 'fc-row-sub', text: '取引履歴を見る' })),
    el('div', { class: 'fc-row-amt', text: M(a.balance) }),
    el('span', { class: 'fc-link-arrow', html: iconHtml('chevronRight', { size: 16 }) }));
  wrap.append(card(
    sectionTitle('口座', el('button', { class: 'fc-link', type: 'button', onclick: () => go('accounts') }, '管理', linkArrow())),
    st.accounts.length === 0
      ? el('button', { class: 'fc-btn ghost block', type: 'button', text: '口座を追加して残高を登録', onclick: () => accountForm() })
      : el('div', { class: 'fc-list' }, ...st.accounts.map(acctRow)),
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
  const typeLabel = { cash: '現金', bank: '銀行口座', securities: '証券口座', other: 'その他' };
  const wrap = el('div', { class: 'fc-view' });
  wrap.append(pageHead('口座管理', '追加', () => accountForm()));
  // 合計資産 / 可処分資金 / 投資・その他 のサマリー
  wrap.append(card(
    el('div', { class: 'fc-total-line' }, el('span', { text: '合計資産' }), el('b', { text: M(C.totalAssets(st)) })),
    el('div', { class: 'fc-total-sub' },
      el('div', {}, el('span', { text: '可処分資金' }), el('b', { class: 'pos', text: M(C.disposableAssets(st)) })),
      el('div', {}, el('span', { text: '投資・その他' }), el('b', { text: M(C.reservedAssets(st)) }))),
  ));
  const list = el('div', { class: 'fc-list' });
  for (const a of st.accounts) {
    const include = a.includeInDisposable !== false;
    list.append(el('div', { class: 'fc-row tap', onclick: () => accountForm(a) },
      el('div', { class: 'fc-row-ic', html: accIcon(a.type) }),
      el('div', { class: 'fc-row-main' },
        el('div', { class: 'fc-row-title', text: a.name }),
        el('div', { class: 'fc-row-sub', text: `${typeLabel[a.type]}・${include ? '可処分資金に含める' : '可処分対象外'}` })),
      toggle(include, (e) => {
        e?.stopPropagation?.();
        S.update((s) => { const acc = s.accounts.find((x) => x.id === a.id); acc.includeInDisposable = !include; });
        render();
      }),
      el('div', { class: 'fc-row-amt', text: M(a.balance) }),
    ));
  }
  wrap.append(card(sectionTitle('口座一覧'),
    st.accounts.length ? list : el('button', { class: 'fc-btn ghost block', type: 'button', text: '口座を追加', onclick: () => accountForm() })));
  wrap.append(el('p', { class: 'fc-note', text: '「可処分資金に含める」をオフにすると、その口座（NISA・iDeCo・証券など）は可処分資金から除外されます。銀行→NISA などの振替をすると可処分資金だけが減り、合計資産は変わりません。' }));
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
  let include = acc ? acc.includeInDisposable !== false : true;
  const incRow = el('div', { class: 'fc-field-toggle' });
  const drawInc = () => {
    incRow.innerHTML = '';
    incRow.append(
      el('div', {}, el('div', { class: 'fc-field-lab', text: '可処分資金に含める' }), el('div', { class: 'fc-field-hint', text: 'NISA・iDeCo・証券などはオフ推奨' })),
      toggle(include, () => { include = !include; drawInc(); }));
  };
  drawInc();
  const body = el('div', {},
    field('口座名', name), field('種別', type), field('残高（円）', bal), incRow,
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
        if (isNew) s.accounts.push({ id: uid('acc'), name: name.value.trim(), type: type.value, balance: Number(bal.value) || 0, includeInDisposable: include });
        else { const a = s.accounts.find((x) => x.id === acc.id); a.name = name.value.trim(); a.type = type.value; a.balance = Number(bal.value) || 0; a.includeInDisposable = include; }
        S.recordAssetSnapshot(s);
      });
      render(); toast('保存しました'); close();
    },
  });
}

// ============ 収支（口座別の取引履歴） ============
function renderTransactions() {
  const st = S.getState();
  const wrap = el('div', { class: 'fc-view' });
  if (!st.accounts.length) {
    wrap.append(el('h1', { class: 'fc-page-title', text: '収支' }));
    wrap.append(card(
      el('p', { class: 'fc-empty', text: 'まず口座を追加してください。すべての取引（収入・支出・振替）は口座に紐付きます。' }),
      el('button', { class: 'fc-btn primary block', type: 'button', text: '口座を追加', onclick: () => accountForm() })));
    return wrap;
  }
  // 表示中口座を確定（無効なら先頭）
  if (!ui.ledgerAcct || !st.accounts.find((a) => a.id === ui.ledgerAcct)) ui.ledgerAcct = st.accounts[0].id;
  const acc = S.findAccount(ui.ledgerAcct);

  // 口座スイッチャー + 残高
  wrap.append(el('div', { class: 'fc-ledger-head' },
    el('button', { class: 'fc-acct-switch', type: 'button', onclick: () => accountPicker() },
      el('span', { class: 'fc-acct-switch-ic', html: accIcon(acc.type) }),
      el('span', { class: 'fc-acct-switch-name', text: acc.name }),
      el('span', { class: 'fc-acct-switch-chev', html: iconHtml('chevronDown', { size: 16 }) })),
    el('div', { class: 'fc-ledger-bal' }, el('span', { class: 'fc-ledger-bal-lab', text: '残高' }), el('b', { text: M(acc.balance) }))));

  // 種別フィルター
  const chips = el('div', { class: 'fc-typechips' });
  for (const [val, lab] of [['all', 'すべて'], ['income', '収入'], ['expense', '支出'], ['transfer', '振替']])
    chips.append(el('button', { class: 'fc-typechip' + (ui.ledgerFilter === val ? ' on' : ''), type: 'button', text: lab, onclick: () => { ui.ledgerFilter = val; render(); } }));
  wrap.append(chips);

  wrap.append(accountLedgerView(st, acc));
  // 新規登録 FAB（表示中口座を初期値に）
  wrap.append(fab(() => txForm(null, ui.ledgerFilter === 'transfer' || ui.ledgerFilter === 'income' ? ui.ledgerFilter : 'expense', acc.id)));
  return wrap;
}

// 口座に紐付く 収入 / 支出 / 振替 を表示（口座詳細と共通）
function accountLedgerView(st, acc) {
  const L = C.accountLedger(st, acc.id);
  const flt = ui.ledgerFilter;
  const box = el('div', {});

  const txRow = (t) => {
    const cat = S.findCategory(t.categoryId);
    return el('div', { class: 'fc-row tap', onclick: () => txForm(t) },
      el('div', { class: 'fc-row-ic', style: `background:${cat.color}22;color:${cat.color}`, html: iconHtml(t.type === 'income' ? 'up' : 'down', { size: 18 }) }),
      el('div', { class: 'fc-row-main' },
        el('div', { class: 'fc-row-title', text: cat.name }),
        el('div', { class: 'fc-row-sub', text: `${fmtDate(t.date)}${t.memo ? '・' + t.memo : ''}` })),
      el('div', { class: 'fc-row-amt ' + (t.type === 'income' ? 'pos' : 'neg'), text: yen(t.amount, { sign: t.type === 'income' }) }));
  };
  // 固定費（毎月の固定支出）の行。タップで固定収支を編集。
  const fixedRow = (r) => {
    const cat = S.findCategory(r.categoryId);
    return el('div', { class: 'fc-row tap', onclick: () => recurringForm(r) },
      el('div', { class: 'fc-row-ic', style: `background:${cat.color}22;color:${cat.color}`, html: iconHtml('repeat', { size: 18 }) }),
      el('div', { class: 'fc-row-main' },
        el('div', { class: 'fc-row-title', text: r.name }),
        el('div', { class: 'fc-row-sub', text: `毎月${r.day === 'end' ? '末' : r.day + '日'}・${cat.name}` })),
      el('div', { class: 'fc-row-amt neg', text: yen(-r.amount) }));
  };
  const trRow = (tr) => {
    const f = S.findAccount(tr.fromAccountId), to = S.findAccount(tr.toAccountId);
    const out = tr.direction === 'out';
    return el('div', { class: 'fc-row tap', onclick: () => transferForm(tr) },
      el('div', { class: 'fc-row-ic', html: iconHtml('swap', { size: 18 }) }),
      el('div', { class: 'fc-row-main' },
        el('div', { class: 'fc-row-title fc-tr-route' }, el('span', { text: f?.name || '削除済み' }), el('span', { class: 'fc-tr-arrow', html: iconHtml('arrowRight', { size: 14 }) }), el('span', { text: to?.name || '削除済み' })),
        el('div', { class: 'fc-row-sub', text: `${fmtDate(tr.date)}${tr.memo ? '・' + tr.memo : ''}` })),
      el('div', { class: 'fc-row-amt ' + (out ? 'neg' : 'pos'), text: yen(out ? -tr.amount : tr.amount, { sign: true }) }));
  };
  // showWhen: このセクションを表示するフィルター値（'income'|'expense'|'transfer'）
  const section = (showWhen, title, total, items, rowFn) => {
    if (flt !== 'all' && flt !== showWhen) return;
    box.append(card(
      el('div', { class: 'fc-ledger-sec' },
        el('span', { text: title }),
        total != null && items.length ? el('span', { class: 'fc-ledger-sec-total', text: M(total) }) : el('span', { class: 'fc-ledger-sec-n', text: `${items.length}件` })),
      items.length ? el('div', { class: 'fc-list' }, ...items.map(rowFn)) : el('p', { class: 'fc-empty', text: 'なし' })));
  };
  // 順番: 収入 → 固定費 → 変動費 → 振替
  section('income', '収入', L.incomeTotal, L.income, txRow);
  section('expense', '固定費', L.fixedExpenseTotal, L.fixedExpense, fixedRow);
  section('expense', '変動費', L.variableExpenseTotal, L.variableExpense, txRow);
  section('transfer', '振替', null, L.transfers, trRow);

  const totalItems = L.income.length + L.fixedExpense.length + L.variableExpense.length + L.transfers.length;
  if (totalItems === 0 && flt === 'all') {
    box.innerHTML = '';
    box.append(card(el('p', { class: 'fc-empty', text: 'この口座の取引はまだありません。右下の＋から登録できます。' })));
  }
  return box;
}

// 口座選択シート
function accountPicker() {
  const st = S.getState();
  let ref;
  const rows = st.accounts.map((a) => el('div', { class: 'fc-row tap' + (a.id === ui.ledgerAcct ? ' sel' : ''), onclick: () => { ui.ledgerAcct = a.id; ref?.close(); render(); } },
    el('div', { class: 'fc-row-ic', html: accIcon(a.type) }),
    el('div', { class: 'fc-row-main' }, el('div', { class: 'fc-row-title', text: a.name }),
      el('div', { class: 'fc-row-sub', text: { cash: '現金', bank: '銀行口座', securities: '証券口座', other: 'その他' }[a.type] })),
    a.id === ui.ledgerAcct ? el('span', { class: 'fc-acct-check', html: iconHtml('check', { size: 18 }) }) : el('div', { class: 'fc-row-amt', text: M(a.balance) })));
  ref = modal('口座を選択', el('div', { class: 'fc-list' }, ...rows), {});
}

// フローティング追加ボタン
function fab(onClick) {
  return el('button', { class: 'fc-fab', type: 'button', 'aria-label': '追加', onclick: onClick, html: iconHtml('plus', { size: 26 }) });
}

// 収入・支出・振替を1つの追加フォームで扱う（新規は3種、編集は収支のみ）
// defaultAccountId: 新規時の初期口座（収支画面/口座詳細の表示中口座）
function txForm(tx, initialType, defaultAccountId) {
  const isNew = !tx;
  const st = S.getState();
  let type = tx?.type || initialType || 'expense';
  const defAcc = defaultAccountId || st.accounts[0]?.id || '';
  const otherAcc = st.accounts.find((a) => a.id !== defAcc)?.id || defAcc;

  // 種別セグメント（新規のみ振替を含む）
  const seg = el('div', { class: 'fc-seg fc-seg3' });
  const opts = isNew ? [['expense', '支出'], ['income', '収入'], ['transfer', '振替']] : [['expense', '支出'], ['income', '収入']];
  const mkSeg = () => {
    seg.innerHTML = '';
    for (const [val, lab] of opts)
      seg.append(el('button', { class: 'fc-seg-btn' + (type === val ? ' on' : ''), type: 'button', text: lab, onclick: () => { type = val; mkSeg(); drawFields(); } }));
  };

  const date = inputEl({ type: 'date', value: tx?.date || today() });
  const amount = inputEl({ type: 'number', inputmode: 'numeric', placeholder: '0', value: tx?.amount ?? '' });
  const memo = inputEl({ placeholder: 'メモ（任意）', value: tx?.memo || '' });
  // 収支用（口座は必須）
  const catWrap = el('div', {});
  const acc = selectEl(accountOptions(), tx?.accountId || defAcc);
  const refreshCats = () => {
    const cats = type === 'income' ? st.categories.income : st.categories.expense;
    catWrap.innerHTML = '';
    catWrap.append(field('カテゴリー', selectEl(cats.map((c) => ({ value: c.id, label: c.name })), tx?.categoryId || cats[0]?.id)));
  };
  // 振替用（表示中口座を振替元の初期値に）
  const fromSel = selectEl(accountOptions(), defAcc);
  const toSel = selectEl(accountOptions(), otherAcc);

  const fieldsWrap = el('div', {});
  const drawFields = () => {
    fieldsWrap.innerHTML = '';
    if (type === 'transfer') {
      if (st.accounts.length < 2) {
        fieldsWrap.append(el('p', { class: 'fc-empty', text: '振替には2つ以上の口座が必要です。先に口座を追加してください。' }));
        return;
      }
      fieldsWrap.append(field('振替元口座', fromSel), field('振替先口座', toSel), field('金額（円）', amount), field('日付', date), field('メモ', memo),
        el('p', { class: 'fc-field-hint', text: '※ 振替は資産総額を変えず、口座間で資金を移動します。可処分対象口座から対象外へ動かすと可処分資金が減ります。' }));
    } else {
      refreshCats();
      fieldsWrap.append(field('日付', date), field('金額（円）', amount), catWrap, field(type === 'income' ? '入金先口座（必須）' : '支払口座（必須）', acc), field('メモ', memo));
    }
  };
  mkSeg(); drawFields();

  const body = el('div', {},
    field('種別', seg), fieldsWrap,
    !isNew && el('button', {
      class: 'fc-btn danger block', type: 'button', text: 'この取引を削除',
      onclick: () => confirmDialog('取引を削除', '削除しますか？', () => {
        S.update((s) => { s.transactions = s.transactions.filter((x) => x.id !== tx.id); });
        render(); toast('削除しました', 'trash');
        qs('.fc-modal-back')?.classList.remove('show'); setTimeout(() => qs('.fc-modal-back')?.remove(), 260);
      }),
    }),
  );
  modal(isNew ? '取引を追加' : '収支を編集', body, {
    onSave: (close) => {
      const amt = Number(amount.value);
      if (!amt || amt <= 0) return toast('金額を入力してください', 'alert');
      if (type === 'transfer') {
        if (st.accounts.length < 2) return toast('口座を2つ以上登録してください', 'alert');
        if (!fromSel.value || !toSel.value || fromSel.value === toSel.value) return toast('振替元と振替先を別々に選んでください', 'alert');
        S.update((s) => {
          s.transfers.push({ id: uid('tr'), date: date.value, fromAccountId: fromSel.value, toAccountId: toSel.value, amount: amt, memo: memo.value.trim() });
          applyTransfer(s, fromSel.value, toSel.value, amt);
          S.recordAssetSnapshot(s);
        });
        render(); toast('振替を保存しました', 'swap'); close(); return;
      }
      if (!acc.value) return toast(type === 'income' ? '入金先口座を選択してください' : '支払口座を選択してください', 'alert');
      const catId = catWrap.querySelector('select').value;
      S.update((s) => {
        const rec = { date: date.value, amount: amt, type, categoryId: catId, memo: memo.value.trim(), accountId: acc.value };
        if (isNew) s.transactions.push({ id: uid('tx'), ...rec });
        else Object.assign(s.transactions.find((x) => x.id === tx.id), rec);
      });
      render(); toast('保存しました'); close();
    },
  });
}

// ============ 振替履歴 ============
function renderTransfers() {
  const st = S.getState();
  const wrap = el('div', { class: 'fc-view' });
  wrap.append(pageHead('振替', '振替', () => txForm(null, 'transfer')));

  const routeRow = (from, to) => el('div', { class: 'fc-row-title fc-tr-route' },
    el('span', { text: from || '削除済み口座' }), el('span', { class: 'fc-tr-arrow', html: iconHtml('arrowRight', { size: 14 }) }), el('span', { text: to || '削除済み口座' }));

  // 固定振替
  const rts = (st.recurringTransfers || []).slice();
  wrap.append(card(
    sectionTitle('固定振替', el('button', { class: 'fc-link', type: 'button', onclick: () => recurringTransferForm() }, el('span', { class: 'fc-add-ic sm', html: iconHtml('plus', { size: 14 }) }), el('span', { text: '追加' }))),
    rts.length ? el('div', { class: 'fc-list' }, ...rts.map((rt) => {
      const f = S.findAccount(rt.fromAccountId), t = S.findAccount(rt.toAccountId);
      return el('div', { class: 'fc-row tap', onclick: () => recurringTransferForm(rt) },
        el('div', { class: 'fc-row-ic', html: iconHtml('repeat', { size: 18 }) }),
        el('div', { class: 'fc-row-main' },
          routeRow(f?.name, t?.name),
          el('div', { class: 'fc-row-sub', text: `毎月${rt.day === 'end' ? '末' : rt.day + '日'}${rt.memo ? '・' + rt.memo : ''}` })),
        el('div', { class: 'fc-row-amt', text: M(rt.amount) }));
    })) : el('p', { class: 'fc-empty', text: '毎月の積立（銀行→NISA など）を登録すると、将来シミュレーションに自動反映されます。' })));

  // 振替履歴
  const list = st.transfers.slice().sort((a, b) => b.date.localeCompare(a.date));
  wrap.append(card(sectionTitle('振替履歴'),
    list.length ? el('div', { class: 'fc-list' }, ...list.map((tr) => {
      const f = S.findAccount(tr.fromAccountId), t = S.findAccount(tr.toAccountId);
      return el('div', { class: 'fc-row tap', onclick: () => transferForm(tr) },
        el('div', { class: 'fc-row-ic', html: iconHtml('swap', { size: 18 }) }),
        el('div', { class: 'fc-row-main' },
          routeRow(f?.name, t?.name),
          el('div', { class: 'fc-row-sub', text: `${fmtDate(tr.date)}${tr.memo ? '・' + tr.memo : ''}` })),
        el('div', { class: 'fc-row-amt', text: M(tr.amount) }));
    })) : el('p', { class: 'fc-empty', text: 'まだ振替がありません。銀行→NISA・現金→PayPay などの資産移動を記録できます。' })));

  wrap.append(el('p', { class: 'fc-note', text: '振替は資産総額を変えず、口座残高のみを移動します。可処分資金は可処分対象口座の残高合計から自動算出されます。固定振替は将来シミュレーションに反映されます。' }));
  return wrap;
}

// 固定振替フォーム（通常振替と同じデータ構造＋繰り返し/開始日/終了日）
function recurringTransferForm(rt) {
  const isNew = !rt;
  const st = S.getState();
  if (st.accounts.length < 2) {
    modal('固定振替', el('p', { class: 'fc-empty', text: '固定振替には2つ以上の口座が必要です。先に口座を追加してください。' }), {});
    return;
  }
  const fromSel = selectEl(accountOptions(), rt?.fromAccountId || st.accounts[0]?.id);
  const toSel = selectEl(accountOptions(), rt?.toAccountId || st.accounts[1]?.id || st.accounts[0]?.id);
  const amount = inputEl({ type: 'number', inputmode: 'numeric', placeholder: '0', value: rt?.amount ?? '' });
  const day = selectEl([{ value: 'end', label: '毎月末' }, ...Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `毎月${i + 1}日` }))], rt?.day ?? 15);
  const startDate = inputEl({ type: 'date', value: rt?.startDate || '' });
  const endDate = inputEl({ type: 'date', value: rt?.endDate || '' });
  const memo = inputEl({ placeholder: '例）積立NISA', value: rt?.memo || '' });
  const body = el('div', {},
    field('振替元口座', fromSel), field('振替先口座', toSel), field('金額（円）', amount), field('実行日', day),
    field('開始日（任意）', startDate), field('終了日（任意）', endDate), field('メモ', memo),
    !isNew && el('button', {
      class: 'fc-btn danger block', type: 'button', text: 'この固定振替を削除',
      onclick: () => confirmDialog('固定振替を削除', '削除しますか？', () => {
        S.update((s) => { s.recurringTransfers = s.recurringTransfers.filter((x) => x.id !== rt.id); });
        render(); toast('削除しました', 'trash'); qs('.fc-modal-back')?.classList.remove('show'); setTimeout(() => qs('.fc-modal-back')?.remove(), 260);
      }),
    }),
  );
  modal(isNew ? '固定振替を追加' : '固定振替を編集', body, {
    onSave: (close) => {
      const amt = Number(amount.value);
      if (!amt || amt <= 0) return toast('金額を入力してください', 'alert');
      if (fromSel.value === toSel.value) return toast('振替元と振替先を別々に選んでください', 'alert');
      S.update((s) => {
        const rec = { fromAccountId: fromSel.value, toAccountId: toSel.value, amount: amt, day: day.value === 'end' ? 'end' : Number(day.value), startDate: startDate.value || null, endDate: endDate.value || null, memo: memo.value.trim() };
        if (isNew) s.recurringTransfers.push({ id: uid('rtr'), ...rec });
        else Object.assign(s.recurringTransfers.find((x) => x.id === rt.id), rec);
      });
      render(); toast('保存しました'); close();
    },
  });
}

function transferForm(tr) {
  const st = S.getState();
  const fromSel = selectEl(accountOptions(), tr.fromAccountId);
  const toSel = selectEl(accountOptions(), tr.toAccountId);
  const amount = inputEl({ type: 'number', inputmode: 'numeric', value: tr.amount });
  const date = inputEl({ type: 'date', value: tr.date });
  const memo = inputEl({ placeholder: 'メモ（任意）', value: tr.memo || '' });
  const body = el('div', {},
    field('振替元口座', fromSel), field('振替先口座', toSel), field('金額（円）', amount), field('日付', date), field('メモ', memo),
    el('button', {
      class: 'fc-btn danger block', type: 'button', text: 'この振替を削除',
      onclick: () => confirmDialog('振替を削除', '削除して口座残高を元に戻しますか？', () => {
        S.update((s) => { reverseTransfer(s, tr.fromAccountId, tr.toAccountId, tr.amount); s.transfers = s.transfers.filter((x) => x.id !== tr.id); S.recordAssetSnapshot(s); });
        render(); toast('削除しました', 'trash'); qs('.fc-modal-back')?.classList.remove('show'); setTimeout(() => qs('.fc-modal-back')?.remove(), 260);
      }),
    }),
  );
  modal('振替を編集', body, {
    onSave: (close) => {
      const amt = Number(amount.value);
      if (!amt || amt <= 0) return toast('金額を入力してください', 'alert');
      if (fromSel.value === toSel.value) return toast('振替元と振替先を別々に選んでください', 'alert');
      S.update((s) => {
        reverseTransfer(s, tr.fromAccountId, tr.toAccountId, tr.amount); // 旧効果を戻す
        applyTransfer(s, fromSel.value, toSel.value, amt); // 新効果を適用
        Object.assign(s.transfers.find((x) => x.id === tr.id), { date: date.value, fromAccountId: fromSel.value, toAccountId: toSel.value, amount: amt, memo: memo.value.trim() });
        S.recordAssetSnapshot(s);
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
  const unpaidBy = C.unpaidByCard(st);
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
      el('div', { class: 'fc-card-unpaid' },
        el('span', { text: '未引落残高' }),
        el('b', { class: (unpaidBy[c.id] || 0) > 0 ? 'neg' : 'muted', text: M(unpaidBy[c.id] || 0) })),
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
    el('span', { class: 'fc-disp-hero-lab', text: `${fmtMonth(ui.plYm)}の収支（黒字/赤字）` }),
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
    el('div', { class: 'fc-simhero-split' },
      el('span', { text: `可処分 ${secret ? '＊＊＊' : yen(C.disposableAssets(st))}` }),
      el('span', { text: `投資・その他 ${secret ? '＊＊＊' : yen(C.reservedAssets(st))}` })),
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

  // 将来のイベント: 同じ日付を1つのカードにまとめ、タップで展開（⑩・2）
  const groups = CF.dailyGroups(st, { days: ui.simMonths <= 6 ? 150 : 240, max: 60 });
  wrap.append(card(sectionTitle('これからの入出金'),
    groups.length ? el('div', { class: 'fc-daygroups' }, ...groups.map((g) => dayGroupItem(g, secret)))
      : el('p', { class: 'fc-empty', text: '固定収支・カード利用・固定振替を登録すると、ここに将来の入出金が表示されます' })));

  wrap.append(el('p', { class: 'fc-note', text: '※ 登録済みの口座残高・固定収支・固定振替・カード利用・将来日付の取引だけから、カードは実際の引落日に銀行から差し引いて計算しています。編集すると即座に再計算されます。' }));
  return wrap;
}

// 日付グループ（概要 + タップで詳細展開）
function dayGroupItem(g, secret) {
  const d = parseISO(g.date);
  const open = ui.simOpen.has(g.date);
  const kinds = new Set(g.events.map((e) => e.group));
  const summaryDots = el('div', { class: 'fc-dg-dots' },
    ...(kinds.has('income') ? [el('i', { class: 'dot inc' })] : []),
    ...(kinds.has('expense') ? [el('i', { class: 'dot exp' })] : []),
    ...(kinds.has('transfer') ? [el('i', { class: 'dot tr' })] : []));
  const head = el('div', { class: 'fc-dg-head', role: 'button', onclick: () => { open ? ui.simOpen.delete(g.date) : ui.simOpen.add(g.date); render(); } },
    el('div', { class: 'fc-dg-date' }, el('b', { text: `${d.getMonth() + 1}/${d.getDate()}` }), el('span', { text: weekdayName(d.getDay()) })),
    el('div', { class: 'fc-dg-mid' },
      el('div', { class: 'fc-dg-count', text: `${g.events.length}件の予定` }),
      summaryDots),
    el('div', { class: 'fc-dg-net ' + (g.net >= 0 ? 'pos' : 'neg'), text: g.net === 0 ? (g.transferSum > 0 ? '振替' : '±0') : (secret ? '＊＊＊' : yen(g.net, { sign: g.net > 0 })) }),
    el('span', { class: 'fc-dg-chev' + (open ? ' open' : ''), html: iconHtml('chevronDown', { size: 16 }) }),
  );
  const children = [head];
  if (open) {
    const detail = el('div', { class: 'fc-dg-detail' },
      ...g.events.map((e) => el('div', { class: 'fc-dg-ev' },
        el('span', { class: 'fc-dg-ev-ic ' + e.group, html: iconHtml(e.icon, { size: 14 }) }),
        el('div', { class: 'fc-dg-ev-main' },
          el('div', { class: 'fc-dg-ev-title', text: e.description || e.kindLabel }),
          el('div', { class: 'fc-dg-ev-badge', text: e.kindLabel })),
        el('div', { class: 'fc-dg-ev-amt ' + e.group, text: e.kind === 'transfer' ? (secret ? '＊＊＊' : yen(e.meta?.moved || 0)) : (secret ? '＊＊＊' : yen(e.amount, { sign: e.amount > 0 })) }))),
      el('div', { class: 'fc-dg-foot' },
        el('div', {}, el('span', { text: '当日の収支' }), el('b', { class: g.net >= 0 ? 'pos' : 'neg', text: secret ? '＊＊＊' : yen(g.net, { sign: g.net > 0 }) })),
        el('div', {}, el('span', { text: '可処分資金への影響' }), el('b', { class: g.dispImpact >= 0 ? 'pos' : 'neg', text: secret ? '＊＊＊' : yen(g.dispImpact, { sign: g.dispImpact > 0 }) }))),
    );
    children.push(detail);
  }
  return el('div', { class: 'fc-dg' + (open ? ' open' : '') }, ...children);
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
    ['accounts', 'bank', '口座管理', '残高・可処分設定'],
    ['transfers', 'swap', '振替履歴', '口座間の資産移動'],
    ['pl', 'receipt', '損益計算書', '今月の収支'],
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
  const per = C.currentPeriod(st);
  wrap.append(card(sectionTitle('設定'),
    el('div', { class: 'fc-set-row' }, el('span', { text: '月の予算' }),
      el('button', { class: 'fc-link', type: 'button', text: yen(st.settings.monthlyBudget), onclick: () => budgetForm() })),
    el('div', { class: 'fc-set-row' }, el('span', {}, el('div', { text: '管理期間の開始日' }), el('div', { class: 'fc-set-sub', text: `${per.startDay}日始まり（${fmtDate(per.startISO).replace(/\(.\)/, '')}〜${fmtDate(per.endISO).replace(/\(.\)/, '')}）` })),
      el('button', { class: 'fc-link', type: 'button', text: `${st.settings.periodStartDay}日`, onclick: () => periodForm() })),
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
function periodForm() {
  const st = S.getState();
  const day = selectEl(Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `${i + 1}日` })), st.settings.periodStartDay || 1);
  const preview = el('p', { class: 'fc-field-hint' });
  const upd = () => {
    const tmp = { settings: { periodStartDay: Number(day.value) } };
    const p = C.currentPeriod(tmp);
    preview.textContent = `今の管理期間: ${fmtDateLong(p.startISO)} 〜 ${fmtDateLong(p.endISO)}`;
  };
  day.addEventListener('change', upd); upd();
  const body = el('div', {},
    field('管理期間の開始日', day), preview,
    el('p', { class: 'fc-note', text: '例）25日にすると「7/25〜8/24」を1期間として、今月あと使える金額を計算します。29〜31日は各月末に合わせて調整されます。' }));
  modal('管理期間の開始日', body, {
    onSave: (close) => { S.update((s) => { s.settings.periodStartDay = Number(day.value) || 1; }); render(); toast('保存しました'); close(); },
  });
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
    const isCard = r.type === 'expense' && r.paymentMethod === 'card';
    const cardName = isCard ? (S.findCard(r.cardId)?.name || 'カード') : '';
    const sub = isCard ? `毎月${r.day === 'end' ? '末' : r.day + '日'}・${cardName}払い` : `毎月${r.day === 'end' ? '末' : r.day + '日'}・${cat.name}`;
    return el('div', { class: 'fc-row tap', onclick: () => recurringForm(r) },
      el('div', { class: 'fc-row-ic', style: `background:${cat.color}22;color:${cat.color}`, html: iconHtml(r.type === 'income' ? 'coins' : isCard ? 'card' : 'file', { size: 18 }) }),
      el('div', { class: 'fc-row-main' }, el('div', { class: 'fc-row-title', text: r.name }),
        el('div', { class: 'fc-row-sub', text: sub })),
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
  const name = inputEl({ placeholder: '例）家賃', value: r?.name || '' });
  const day = selectEl([{ value: 'end', label: '毎月末' }, ...Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `毎月${i + 1}日` }))], r?.day ?? 25);
  const amount = inputEl({ type: 'number', value: r?.amount ?? '' });
  const acc = st.accounts.length
    ? selectEl(accountOptions(), r?.accountId || st.accounts[0]?.id)
    : selectEl([{ value: '', label: '（先に口座を追加）' }], '');
  const cardSel = st.cards.length
    ? selectEl(st.cards.map((c) => ({ value: c.id, label: c.name })), r?.cardId || st.cards[0]?.id)
    : selectEl([{ value: '', label: '（先にカードを追加）' }], '');

  // 支払方法（固定支出のみ）: 銀行口座 / クレジットカード
  let method = r?.paymentMethod || 'bank';
  const methodSeg = el('div', { class: 'fc-seg' });
  const drawMethodSeg = () => { methodSeg.innerHTML = ''; for (const [v, l] of [['bank', '銀行口座'], ['card', 'クレジットカード']]) methodSeg.append(el('button', { class: 'fc-seg-btn' + (method === v ? ' on' : ''), type: 'button', text: l, onclick: () => { method = v; drawMethodSeg(); drawPay(); } })); };
  const payWrap = el('div', {});
  const drawPay = () => {
    payWrap.innerHTML = '';
    if (type === 'income') { payWrap.append(field('入金先口座（必須）', acc)); return; }
    payWrap.append(field('支払方法', methodSeg));
    if (method === 'card') payWrap.append(field('カード（必須）', cardSel), el('p', { class: 'fc-field-hint', text: 'カード払いは銀行残高を即時に減らさず、カード利用額として管理し、引落日に引落口座から差し引きます。' }));
    else payWrap.append(field('支払口座（必須）', acc));
  };
  drawMethodSeg();
  // 種別セグメント変更時に支払UIも更新
  const mkSegWithPay = () => { seg.innerHTML = ''; for (const [val, lab] of [['expense', '支出'], ['income', '収入']]) seg.append(el('button', { class: 'fc-seg-btn' + (type === val ? ' on' : ''), type: 'button', text: lab, onclick: () => { type = val; mkSegWithPay(); refreshCats(); drawPay(); } })); };
  mkSegWithPay(); refreshCats(); drawPay();

  const body = el('div', {}, field('種別', seg), field('名称', name), field('毎月の発生日', day), field('金額（円）', amount), catWrap, payWrap,
    !isNew && el('button', { class: 'fc-btn danger block', type: 'button', text: '削除', onclick: () => confirmDialog('固定収支を削除', '削除しますか？', () => { S.update((s) => { s.recurring = s.recurring.filter((x) => x.id !== r.id); }); render(); toast('削除しました', 'trash'); qs('.fc-modal-back')?.remove(); }) }));
  modal(isNew ? '固定収支を追加' : '固定収支を編集', body, {
    onSave: (close) => {
      if (!name.value.trim() || !Number(amount.value)) return toast('名称と金額を入力してください', 'alert');
      let accountId = null, cardId = null, pm = 'bank';
      if (type === 'income') {
        if (!acc.value) return toast('入金先口座を選択してください', 'alert');
        accountId = acc.value;
      } else if (method === 'card') {
        if (!cardSel.value) return toast('カードを選択してください（先にカードを追加）', 'alert');
        pm = 'card'; cardId = cardSel.value; accountId = null;
      } else {
        if (!acc.value) return toast('支払口座を選択してください', 'alert');
        accountId = acc.value;
      }
      const catId = catWrap.querySelector('select').value;
      S.update((s) => {
        const rec = { type, name: name.value.trim(), day: day.value === 'end' ? 'end' : Number(day.value), amount: Number(amount.value), categoryId: catId, accountId, paymentMethod: type === 'expense' ? pm : 'bank', cardId };
        if (isNew) s.recurring.push({ id: uid('rec'), createdAt: today(), ...rec });
        else { const ex = s.recurring.find((x) => x.id === r.id); Object.assign(ex, rec); if (!ex.createdAt) ex.createdAt = today(); }
        S.materializeRecurringCardUsage(s);
        S.settleDueCards(s);
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
  // 起動時: カード払いの固定支出を実カード利用に具体化 → 引落日を過ぎた分を確定（銀行減額）。
  S.update((s) => {
    S.materializeRecurringCardUsage(s);
    const changed = S.settleDueCards(s);
    if (changed) S.recordAssetSnapshot(s);
  }, { silent: true });
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
