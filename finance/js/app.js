// app.js — ルーティング・画面描画・フォーム・操作の統合レイヤー
import * as S from './store.js?v=20260723r';
import * as C from './calc.js?v=20260723r';
import * as CF from './cashflow.js?v=20260723r';
import * as Sec from './securities.js?v=20260723r';
import * as FS from './futureSim.js?v=20260723r';
import { lineChart, barChart, groupedBarChart, donutChart, multiLineChart, fanChart } from './charts.js?v=20260723r';
import { iconHtml, icon } from './icons.js?v=20260723r';
import {
  el, qs, yen, yenMasked, num, today, toISO, parseISO, ym, fmtDate, fmtDateLong,
  fmtMonth, addMonths, resolveDay, pad, weekdayName, haptic, escapeHtml, uid,
} from './utils.js?v=20260723r';
import { nextRecurringDate, nextSettlementDate, isMonthEndDay } from './recurrence.js?v=20260723r';

// ---- 画面ローカル状態（データではないUI状態） ----
const ui = {
  route: 'dashboard',
  simMonths: 12,           // 将来シミュレーションの表示期間
  simTab: 'cashflow',      // 「将来」タブ内の切替: 'cashflow'(収支) | 'invest'(投資将来予測)
  futureCheckDate: null,   // 投資予測: 資産推移を確認する日付
  futureCompare: false,    // 投資予測: シナリオ比較を表示するか
  futureExtra: 0,          // 投資予測: 積立変更シミュレーション(What-If、円/月)
  cal: { y: new Date().getFullYear(), m: new Date().getMonth() },
  plYm: ym(new Date()),
  anaYm: ym(new Date()),
  filter: { q: '', type: 'all', cat: 'all', min: '', max: '', from: '', to: '' },
  simOpen: new Set(), // 将来入出金で展開中の日付
  ledgerAcct: null,   // 収支画面で表示中の口座ID
  ledgerFilter: 'all', // すべて/収入/支出/振替
  acctReorder: false,  // 口座の並び替えモード
};

// 口座の並び替え（配列順を上下に移動）
function moveAccount(id, dir) {
  S.update((s) => {
    const i = s.accounts.findIndex((a) => a.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= s.accounts.length) return;
    [s.accounts[i], s.accounts[j]] = [s.accounts[j], s.accounts[i]];
  });
  render();
}

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
// 下部ナビにある主画面。これ以外（各種メニュー配下の詳細画面）には戻るボタンを出す。
const PRIMARY_ROUTES = ['dashboard', 'transactions', 'cards', 'simulate', 'menu'];
const isSecondaryRoute = (r) => !PRIMARY_ROUTES.includes(r);
const navStack = []; // アプリ内ナビゲーション履歴（ブラウザ履歴ではなく独自管理）

function go(route) {
  if (route !== ui.route) { navStack.push(ui.route); if (navStack.length > 30) navStack.shift(); }
  ui.route = route;
  haptic();
  render();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

// 1つ前の画面へ戻る（履歴が無ければホームへ）。ブラウザバックは使わない。
function goBack() {
  const prev = navStack.pop();
  ui.route = prev || 'dashboard';
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

// iOS風の戻るボタン（画面タイトルの左に配置）
function backBtn() {
  return el('button', { class: 'fc-back', type: 'button', 'aria-label': '戻る', onclick: goBack },
    el('span', { class: 'fc-back-ic', html: iconHtml('chevronLeft', { size: 22, sw: 2.4 }) }));
}
// 画面タイトル。詳細画面（下部ナビに無い画面）では左に戻るボタンを付ける。
function headTitle(title) {
  const showBack = isSecondaryRoute(ui.route);
  return el('div', { class: 'fc-head-title' + (showBack ? ' has-back' : '') },
    showBack ? backBtn() : '', el('h1', { class: 'fc-page-title', text: title }));
}

// ---- モーダル表示中の背景スクロール固定（iOS Safari / PWA / Android 対応） ----
// body を position:fixed で固定し、スクロール量を top のマイナスで保持。閉じたら元の位置へ戻す。
// ネストしたモーダル（確認ダイアログ等）に対応するためカウンタで管理する。
let _modalCount = 0;
let _savedScrollY = 0;
function lockBodyScroll() {
  if (_modalCount === 0) {
    _savedScrollY = window.scrollY || window.pageYOffset || 0;
    const b = document.body;
    b.style.position = 'fixed';
    b.style.top = `-${_savedScrollY}px`;
    b.style.left = '0';
    b.style.right = '0';
    b.style.width = '100%';
    document.documentElement.classList.add('fc-modal-open');
  }
  _modalCount++;
}
function unlockBodyScroll() {
  _modalCount = Math.max(0, _modalCount - 1);
  if (_modalCount === 0) {
    const b = document.body;
    b.style.position = '';
    b.style.top = '';
    b.style.left = '';
    b.style.right = '';
    b.style.width = '';
    document.documentElement.classList.remove('fc-modal-open');
    window.scrollTo(0, _savedScrollY);
  }
}

function toast(msg, iconName = 'check') {
  const t = el('div', { class: 'fc-toast' },
    el('span', { class: 'fc-toast-ic', html: iconHtml(iconName, { size: 18 }) }),
    el('span', { text: msg }));
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}

// モーダル（下からせり上がるシート）
// options.dirty(): 未保存の入力があるか。true のとき閉じる操作で破棄確認を出す。
// options.saveDisabled: 保存ボタンの初期無効状態。返り値の setSaveDisabled で動的に切替可能。
function modal(title, bodyNode, { onSave, saveLabel = '保存', danger, wide, dirty, saveDisabled } = {}) {
  const back = el('div', { class: 'fc-modal-back' });
  let closed = false;
  const closeAll = () => {
    if (closed) return; closed = true;
    back.classList.remove('show');
    unlockBodyScroll();
    setTimeout(() => back.remove(), 260);
  };
  // ユーザー操作による閉じる（X・キャンセル・背景タップ）: 未保存があれば破棄確認。
  const attemptClose = () => {
    if (dirty && dirty()) {
      confirmDialog('入力を破棄しますか？', '入力した内容は保存されません。閉じてもよろしいですか？',
        () => closeAll(), { yesLabel: '破棄する', danger: true });
    } else closeAll();
  };
  const saveBtn = onSave ? el('button', {
    class: 'fc-btn ' + (danger ? 'danger' : 'primary'), type: 'button', text: saveLabel,
    disabled: saveDisabled ? '' : null,
    onclick: () => { onSave(closeAll); },
  }) : null;
  const foot = el('div', { class: 'fc-modal-foot' },
    el('button', { class: 'fc-btn ghost', type: 'button', text: 'キャンセル', onclick: attemptClose }),
    saveBtn || '',
  );
  const sheet = el('div', { class: 'fc-modal-sheet' + (wide ? ' wide' : '') },
    el('div', { class: 'fc-modal-grip' }),
    el('div', { class: 'fc-modal-head' }, el('h3', { text: title }),
      el('button', { class: 'fc-modal-x', type: 'button', 'aria-label': '閉じる', html: iconHtml('x', { size: 16 }), onclick: attemptClose })),
    el('div', { class: 'fc-modal-body' }, bodyNode),
    foot,
  );
  back.append(sheet);
  back.addEventListener('click', (e) => { if (e.target === back) attemptClose(); });
  lockBodyScroll();
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('show'));
  return {
    close: closeAll,
    saveBtn,
    setSaveDisabled: (d) => { if (saveBtn) saveBtn.disabled = !!d; },
  };
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
// 任意（空欄可）の日付フィールド。iOS Safariのネイティブ日付ピッカーに
// 内蔵の「リセット」ボタンは値を空にできないことがあるため、確実に
// 空へ戻せる独自の「クリア」ボタンを添える。
function optionalDateField(label, input) {
  const clearBtn = el('button', {
    class: 'fc-date-clear', type: 'button', text: 'クリア',
    onclick: () => { input.value = ''; input.dispatchEvent(new Event('change', { bubbles: true })); },
  });
  return el('div', { class: 'fc-field' }, el('span', { class: 'fc-field-lab', text: label }),
    el('div', { class: 'fc-date-row' }, input, clearBtn));
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

// 金額入力（3桁区切りで表示・数字キーボード）。value は円の整数。読み取りは amountValue()。
function amountInput(initial) {
  const has = initial != null && initial !== '' && !Number.isNaN(Number(initial));
  const inp = inputEl({ type: 'text', inputmode: 'numeric', autocomplete: 'off',
    placeholder: '0', value: has ? Number(initial).toLocaleString('ja-JP') : '' });
  inp.addEventListener('input', () => {
    const digits = inp.value.replace(/[^\d]/g, '');
    inp.value = digits ? Number(digits).toLocaleString('ja-JP') : '';
  });
  return inp;
}
const amountValue = (inp) => Number(String(inp.value).replace(/[^\d]/g, '')) || 0;

// 口座残高へ増減を反映するヘルパー。証券口座は「現金」を増減し、残高（現金＋評価額）を再計算する。
// これにより 銀行→証券 の振替は証券口座の現金へ入金され、株購入で現金が減る設計と整合する。
function adjustBalance(a, delta) {
  if (!a) return;
  if (Sec.isSecurities(a)) { a.cash = (Number(a.cash) || 0) + delta; Sec.recomputeAccount(a); }
  else a.balance = (Number(a.balance) || 0) + delta;
}

// 振替: 資産の移動（総資産は不変、各口座残高のみ変更）
function applyTransfer(s, fromId, toId, amt) {
  adjustBalance(s.accounts.find((a) => a.id === fromId), -amt);
  adjustBalance(s.accounts.find((a) => a.id === toId), amt);
}
function reverseTransfer(s, fromId, toId, amt) { applyTransfer(s, toId, fromId, amt); }

// 収入・支出: 口座残高への反映（収入は+、支出は-）
function applyTx(s, accountId, type, amt) {
  adjustBalance(s.accounts.find((x) => x.id === accountId), type === 'income' ? amt : -amt);
}
function reverseTx(s, accountId, type, amt) { applyTx(s, accountId, type === 'income' ? 'expense' : 'income', amt); }

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
    // 証券口座を保有している場合は「評価損益・利益率」を、なければ資産増減（昨日比・今月比・前年比）を表示
    Sec.hasSecurities(st) ? heroProfit(st, secret) : el('div', { class: 'fc-delta-row' },
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

  // ダッシュボードは 合計資産 / 口座一覧 / 今月の収支 / 次回引落予定 の4点に絞る。

  // --- 口座一覧（登録した口座名をそのまま表示。種別は内部データとして非表示） ---
  const acctRow = (a) => {
    let sub;
    if (a.type === 'securities') {
      const cost = Sec.accountCost(a);
      const profit = Sec.accountValuation(a) - cost;
      const rate = cost > 0 ? (profit / cost) * 100 : null;
      const cls = profit === 0 ? 'muted' : profit > 0 ? 'pos' : 'neg';
      sub = el('div', { class: 'fc-row-sub' }, el('span', { text: '評価損益 ' }),
        el('span', { class: 'fc-valchg ' + cls, text: `${secret ? '＊＊' : yen(profit, { sign: profit > 0 })}${rate != null ? ` (${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%)` : ''}` }));
    } else {
      sub = el('div', { class: 'fc-row-sub', text: '取引履歴を見る' });
    }
    return el('div', { class: 'fc-row tap', onclick: () => openAccountLedger(a.id) },
      el('div', { class: 'fc-row-ic', html: accIcon(a.type) }),
      el('div', { class: 'fc-row-main' },
        el('div', { class: 'fc-row-title', text: a.name }), sub),
      el('div', { class: 'fc-row-amt', text: M(a.balance) }),
      el('span', { class: 'fc-link-arrow', html: iconHtml('chevronRight', { size: 16 }) }));
  };
  wrap.append(card(
    sectionTitle('口座', el('button', { class: 'fc-link', type: 'button', onclick: () => go('accounts') }, '管理', linkArrow())),
    st.accounts.length === 0
      ? el('button', { class: 'fc-btn ghost block', type: 'button', text: '口座を追加して残高を登録', onclick: () => accountForm() })
      : el('div', { class: 'fc-list' }, ...st.accounts.map(acctRow)),
  ));

  // --- 今月の収支 ---
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

  // --- 投資状況（証券口座を保有している場合のみ表示） ---
  // 今月の収支（生活の収入・支出）とは明確に分けて表示する。投資の評価損益・利益率は
  // 収支には一切含めず、この投資状況カードと証券口座画面・合計資産の内訳にのみ反映する。
  if (Sec.hasSecurities(st)) wrap.append(renderInvestmentStatus(st, secret));

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

// ホームヒーローの証券サマリー（評価損益・利益率）。利益は緑、損失は赤で目立たせる。
function heroProfit(st, secret) {
  const p = Sec.portfolio(st);
  const up = p.profit >= 0;
  const cls = p.profit === 0 ? 'flat' : up ? 'pos' : 'neg';
  const rateText = p.profitRate == null ? '—' : `${p.profitRate >= 0 ? '+' : ''}${p.profitRate.toFixed(2)}%`;
  const profitText = secret ? '＊＊＊＊' : yen(p.profit, { sign: p.profit > 0 });
  return el('div', { class: 'fc-heroprofit' },
    el('div', { class: 'fc-hp-col' },
      el('span', { class: 'fc-hp-lab', text: '評価損益' }),
      el('span', { class: 'fc-hp-val ' + cls, text: profitText })),
    el('div', { class: 'fc-hp-col' },
      el('span', { class: 'fc-hp-lab', text: '利益率' }),
      el('span', { class: 'fc-hp-val ' + cls, text: secret ? '＊＊' : rateText })),
  );
}

// ホームの「投資状況」カード（元本 / 評価額 / 評価損益 / 利益率）。
// 今月の収支とは独立した指標で、株価やインデックスの評価額が変動しても収支には影響しない。
// 評価損益・利益率はこの投資状況・証券口座画面・合計資産の内訳にのみ反映する。
function renderInvestmentStatus(st, secret) {
  const p = Sec.portfolio(st);
  const cls = p.profit === 0 ? 'flat' : p.profit > 0 ? 'pos' : 'neg';
  const rateText = p.profitRate == null ? '—' : `${p.profitRate >= 0 ? '+' : ''}${p.profitRate.toFixed(2)}%`;
  const money = (v, opts) => (secret ? '＊＊＊' : yen(v, opts));
  const firstSec = Sec.securitiesAccounts(st)[0];
  const linkArrow = () => el('span', { class: 'fc-link-arrow', html: iconHtml('chevronRight', { size: 15 }) });
  return card(
    el('div', { class: 'fc-disp-head' },
      el('span', { class: 'fc-disp-title', text: '投資状況' }),
      firstSec ? el('button', { class: 'fc-link', type: 'button', onclick: () => openAccountLedger(firstSec.id) }, '証券', linkArrow()) : ''),
    el('div', { class: 'fc-sec-grid' },
      secBox('元本', money(p.principal)),
      secBox('評価額', money(p.valuation)),
    ),
    el('div', { class: 'fc-sec-profit ' + cls },
      el('div', { class: 'fc-sec-profit-col' },
        el('span', { class: 'fc-sec-profit-lab', text: '評価損益' }),
        el('span', { class: 'fc-sec-profit-val', text: money(p.profit, { sign: p.profit > 0 }) })),
      el('div', { class: 'fc-sec-profit-col' },
        el('span', { class: 'fc-sec-profit-lab', text: '利益率' }),
        el('span', { class: 'fc-sec-profit-val', text: secret ? '＊＊' : rateText }))),
    el('p', { class: 'fc-note', text: '投資の評価損益は今月の収支には含まれません。売却益・配当金は収入として登録した場合のみ収支へ反映されます。' }),
  );
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
  const reorder = ui.acctReorder && st.accounts.length > 1;
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
  st.accounts.forEach((a, idx) => {
    const include = a.includeInDisposable !== false;
    const row = el('div', { class: 'fc-row' + (reorder ? '' : ' tap'), onclick: reorder ? null : () => accountForm(a) },
      el('div', { class: 'fc-row-ic', html: accIcon(a.type) }),
      el('div', { class: 'fc-row-main' },
        el('div', { class: 'fc-row-title', text: a.name }),
        el('div', { class: 'fc-row-sub', text: `${typeLabel[a.type]}・${include ? '可処分資金に含める' : '可処分対象外'}` })));
    if (reorder) {
      row.append(el('div', { class: 'fc-reorder-btns' },
        el('button', { class: 'fc-icobtn', type: 'button', 'aria-label': '上へ', disabled: idx === 0 ? '' : null, html: iconHtml('up', { size: 16 }), onclick: () => moveAccount(a.id, -1) }),
        el('button', { class: 'fc-icobtn', type: 'button', 'aria-label': '下へ', disabled: idx === st.accounts.length - 1 ? '' : null, html: iconHtml('down', { size: 16 }), onclick: () => moveAccount(a.id, 1) })));
    } else {
      row.append(toggle(include, (e) => {
        e?.stopPropagation?.();
        S.update((s) => { const acc = s.accounts.find((x) => x.id === a.id); acc.includeInDisposable = !include; });
        render();
      }), el('div', { class: 'fc-row-amt', text: M(a.balance) }));
    }
    list.append(row);
  });
  const reorderBtn = st.accounts.length > 1
    ? el('button', { class: 'fc-link', type: 'button', text: reorder ? '完了' : '並び替え', onclick: () => { ui.acctReorder = !ui.acctReorder; render(); } })
    : '';
  wrap.append(card(sectionTitle('口座一覧', reorderBtn),
    st.accounts.length ? list : el('button', { class: 'fc-btn ghost block', type: 'button', text: '口座を追加', onclick: () => accountForm() })));
  wrap.append(el('p', { class: 'fc-note', text: reorder ? '↑↓で口座カードの表示順を並び替えできます。ホーム画面にもこの順で表示されます。' : '「可処分資金に含める」をオフにすると、その口座（NISA・iDeCo・証券など）は可処分資金から除外されます。銀行→NISA などの振替をすると可処分資金だけが減り、合計資産は変わりません。' }));
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
  // 証券口座は「残高」ではなく 現金 を管理（元本＝取得額合計、評価額は保有銘柄から自動計算）
  const cash = inputEl({ type: 'number', inputmode: 'numeric', placeholder: '0', value: acc?.cash ?? '' });
  let include = acc ? acc.includeInDisposable !== false : (acc?.type !== 'securities');

  // 種別に応じて金額入力欄を切り替える
  const amountWrap = el('div', {});
  const drawAmount = () => {
    amountWrap.innerHTML = '';
    if (type.value === 'securities') {
      amountWrap.append(
        field('現金（未投資・円）', cash),
        el('p', { class: 'fc-field-hint', text: '元本（取得額）と評価額は、登録した保有銘柄から自動計算されます。銀行→証券の振替は現金へ入金されます。' }));
    } else {
      amountWrap.append(field('残高（円）', bal));
    }
  };

  const incRow = el('div', { class: 'fc-field-toggle' });
  const drawInc = () => {
    incRow.innerHTML = '';
    incRow.append(
      el('div', {}, el('div', { class: 'fc-field-lab', text: '可処分資金に含める' }), el('div', { class: 'fc-field-hint', text: 'NISA・iDeCo・証券などはオフ推奨' })),
      toggle(include, () => { include = !include; drawInc(); }));
  };
  drawAmount(); drawInc();
  type.addEventListener('change', drawAmount);
  const body = el('div', {},
    field('口座名', name), field('種別', type), amountWrap, incRow,
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
      const isSec = type.value === 'securities';
      S.update((s) => {
        if (isNew) {
          const rec = { id: uid('acc'), name: name.value.trim(), type: type.value, includeInDisposable: include };
          if (isSec) {
            Object.assign(rec, { cash: Number(cash.value) || 0, holdings: [], accumulations: [], accumHistory: [], purchases: [], lastAccumDate: null, balance: 0 });
            Sec.recomputeAccount(rec);
          } else rec.balance = Number(bal.value) || 0;
          s.accounts.push(rec);
        } else {
          const a = s.accounts.find((x) => x.id === acc.id);
          a.name = name.value.trim(); a.type = type.value; a.includeInDisposable = include;
          if (isSec) {
            a.cash = Number(cash.value) || 0;
            a.holdings ||= []; a.accumulations ||= []; a.accumHistory ||= []; a.purchases ||= [];
            Sec.recomputeAccount(a);
          } else a.balance = Number(bal.value) || 0;
        }
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

  // 証券口座: 資産内訳・保有割合・保有銘柄一覧・積立・購入・履歴
  if (acc.type === 'securities') {
    renderSecuritiesPanel(wrap, st, acc);
  }

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

// ============ 証券口座パネル（資産内訳・保有割合・保有銘柄・積立・購入） ============
function renderSecuritiesPanel(wrap, st, acc) {
  const secret = st.settings.secret;
  const cash = Sec.accountCash(acc);
  const principal = Sec.accountCost(acc); // 元本＝取得額の合計（保有銘柄から自動計算）
  const kind = Sec.accountValuationByKind(acc);
  const valuation = kind.index + kind.stock;
  const profit = valuation - principal;
  const profitRate = principal > 0 ? (profit / principal) * 100 : null;
  const pcls = profit === 0 ? 'flat' : profit > 0 ? 'pos' : 'neg';
  const money = (v, opts) => (secret ? '＊＊＊' : yen(v, opts));

  // --- 資産内訳 ---
  const breakdown = card(
    sectionTitle('資産内訳'),
    el('div', { class: 'fc-sec-grid' },
      secBox('現金', money(cash)),
      secBox('元本', money(principal)),
      secBox('評価額', money(valuation)),
    ),
    el('div', { class: 'fc-sec-profit ' + pcls },
      el('div', { class: 'fc-sec-profit-col' },
        el('span', { class: 'fc-sec-profit-lab', text: '評価損益' }),
        el('span', { class: 'fc-sec-profit-val', text: secret ? '＊＊＊' : yen(profit, { sign: profit > 0 }) })),
      el('div', { class: 'fc-sec-profit-col' },
        el('span', { class: 'fc-sec-profit-lab', text: '利益率' }),
        el('span', { class: 'fc-sec-profit-val', text: profitRate == null ? '—' : `${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(2)}%` }))),
    el('div', { class: 'fc-sec-grid' },
      secBox('インデックス評価額', money(kind.index)),
      secBox('個別株評価額', money(kind.stock)),
    ),
  );
  wrap.append(breakdown);

  // --- 保有割合（インデックス / 個別株 / 現金） ---
  const base = kind.index + kind.stock + cash;
  const seg = (v) => (base > 0 ? (v / base) * 100 : 0);
  const parts = [
    { label: 'インデックス', value: kind.index, pct: seg(kind.index), color: 'var(--fc-accent)' },
    { label: '個別株', value: kind.stock, pct: seg(kind.stock), color: '#bf5af2' },
    { label: '現金', value: cash, pct: seg(cash), color: '#98a2b3' },
  ];
  wrap.append(card(
    sectionTitle('保有割合'),
    base > 0 ? el('div', {},
      el('div', { class: 'fc-alloc-bar' }, ...parts.filter((p) => p.pct > 0).map((p) =>
        el('span', { class: 'fc-alloc-seg', style: `width:${p.pct}%;background:${p.color}` }))),
      el('div', { class: 'fc-alloc-legend' }, ...parts.map((p) =>
        el('div', { class: 'fc-alloc-item' },
          el('i', { class: 'dot', style: `background:${p.color}` }),
          el('span', { class: 'fc-alloc-name', text: p.label }),
          el('span', { class: 'fc-alloc-pct', text: `${Math.round(p.pct)}%` }),
          el('span', { class: 'fc-alloc-amt', text: money(p.value) })))))
      : el('p', { class: 'fc-empty', text: '保有銘柄を登録すると保有割合が表示されます' }),
  ));

  // --- 操作ボタン ---
  wrap.append(el('div', { class: 'fc-sec-actions' },
    btnIcon('primary', 'plus', '銘柄を追加', () => holdingForm(acc)),
    btnIcon('ghost', 'coins', '個別株を購入', () => purchaseForm(acc)),
    btnIcon('ghost', 'repeat', '積立設定', () => accumulationForm(acc)),
    btnIcon('ghost', 'trending', '株価を更新', () => priceUpdateForm(acc)),
  ));

  // --- 保有銘柄一覧（個別株・インデックス） ---
  const holdings = Sec.accountHoldings(acc);
  const stocks = holdings.filter(Sec.isStock);
  const funds = holdings.filter(Sec.isIndex);
  const holdingsCard = card(
    sectionTitle('保有銘柄一覧'),
    holdings.length
      ? el('div', {}, stockGroup(st, acc, stocks), ...Sec.NISA_FRAMES.map((f) => indexGroup(st, acc, funds, f)))
      : el('p', { class: 'fc-empty', text: 'まだ保有銘柄がありません。「銘柄を追加」から登録してください。' }),
  );
  wrap.append(holdingsCard);

  // --- 積立設定・履歴 ---
  wrap.append(accumulationCard(st, acc));
}

function secBox(label, val) {
  return el('div', { class: 'fc-sec-box' },
    el('span', { class: 'fc-sec-box-lab', text: label }),
    el('span', { class: 'fc-sec-box-val', text: val }));
}
const plClass = (v) => (v === 0 ? 'muted' : v > 0 ? 'pos' : 'neg');
const plText = (pl, secret) => `${secret ? '＊＊' : yen(pl.diff, { sign: pl.diff > 0 })}${pl.rate != null ? ` ${pl.rate >= 0 ? '+' : ''}${pl.rate.toFixed(1)}%` : ''}`;

// 個別株グループ（米国株・USD）: ティッカー / 現在株価(USD) / ドル円 / 評価額(円) / 損益 / 損益率
function stockGroup(st, acc, stocks) {
  if (!stocks.length) return '';
  const secret = st.settings.secret;
  const usd = (v) => (secret ? '＊＊' : `$${(Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
  const rows = stocks.map((h) => {
    const pl = Sec.holdingPL(h);
    return el('div', { class: 'fc-row fc-holding tap', onclick: () => holdingForm(acc, h) },
      el('div', { class: 'fc-row-main' },
        el('div', { class: 'fc-holding-top' },
          el('span', { class: 'fc-holding-name', text: h.name }),
          h.ticker ? el('span', { class: 'fc-holding-ticker', text: h.ticker }) : ''),
        el('div', { class: 'fc-holding-meta' },
          el('span', { text: `現在株価 ${usd(h.priceUsd)}` }),
          el('span', { text: `ドル円 ${secret ? '＊＊' : num(Math.round((Number(h.fxRate) || 0) * 100) / 100)}` }))),
      el('div', { class: 'fc-holding-amt' },
        el('span', { class: 'fc-holding-val', text: secret ? '＊＊＊' : yen(pl.value) }),
        el('span', { class: 'fc-holding-pl ' + plClass(pl.diff), text: plText(pl, secret) })));
  });
  return el('div', { class: 'fc-holding-group' },
    el('div', { class: 'fc-holding-grouphead' }, el('span', { class: 'fc-kind-badge stock', text: '個別株（米国株）' }), el('span', { class: 'fc-holding-groupn', text: `${stocks.length}銘柄` })),
    el('div', { class: 'fc-list' }, ...rows));
}

// インデックスグループ（NISA区分ごと）: 取得価額 / 現在保有額 / 損益 / 損益率
function indexGroup(st, acc, funds, frame) {
  const items = funds.filter((h) => (h.nisaFrame || 'growth') === frame.value);
  if (!items.length) return '';
  const secret = st.settings.secret;
  const money = (v) => (secret ? '＊＊＊' : yen(v));
  const rows = items.map((h) => {
    const pl = Sec.holdingPL(h);
    return el('div', { class: 'fc-row fc-holding tap', onclick: () => holdingForm(acc, h) },
      el('div', { class: 'fc-row-main' },
        el('div', { class: 'fc-holding-top' }, el('span', { class: 'fc-holding-name', text: h.name })),
        el('div', { class: 'fc-holding-meta' },
          el('span', { text: `総元本 ${money(pl.cost)}` }),
          el('span', { text: `保有額 ${money(pl.value)}` }))),
      el('div', { class: 'fc-holding-amt' },
        el('span', { class: 'fc-holding-val', text: money(pl.value) }),
        el('span', { class: 'fc-holding-pl ' + plClass(pl.diff), text: plText(pl, secret) })));
  });
  return el('div', { class: 'fc-holding-group' },
    el('div', { class: 'fc-holding-grouphead' }, el('span', { class: 'fc-kind-badge index', text: frame.label }), el('span', { class: 'fc-holding-groupn', text: `${items.length}銘柄` })),
    el('div', { class: 'fc-list' }, ...rows));
}

// 積立設定＋積立履歴カード
function accumulationCard(st, acc) {
  const accums = acc.accumulations || [];
  const history = (acc.accumHistory || []).slice().sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)).slice(0, 12);
  const setRows = accums.length ? el('div', { class: 'fc-list' }, ...accums.map((a) => {
    const h = Sec.accountHoldings(acc).find((x) => x.id === a.holdingId);
    const range = `${a.startDate ? fmtDate(a.startDate).replace(/\(.\)/, '') : '開始日未設定'}${a.endDate ? '〜' + fmtDate(a.endDate).replace(/\(.\)/, '') : '〜'}`;
    const freqLabel = { daily: '毎日', weekly: '毎週', monthly: '毎月' }[a.frequency || 'daily'];
    const amt = a.frequency === 'monthly' ? a.monthlyAmount : a.dailyAmount;
    const td = today();
    const paused = !!(a.pauseStart && a.pauseStart <= td && (!a.pauseEnd || a.pauseEnd >= td));
    return el('div', { class: 'fc-row tap', onclick: () => accumulationForm(acc, a) },
      el('div', { class: 'fc-row-ic', html: iconHtml('repeat', { size: 18 }) }),
      el('div', { class: 'fc-row-main' },
        el('div', { class: 'fc-row-title', text: h ? h.name : '（対象銘柄なし）' }),
        el('div', { class: 'fc-row-sub', text: `${freqLabel} ${yen(amt)}・${range}${paused ? '・一時停止中' : ''}` })),
      el('span', { class: 'fc-accum-state ' + (a.enabled !== false && !paused ? 'on' : 'off'), text: a.enabled !== false ? (paused ? '停止中' : 'ON') : 'OFF' }));
  })) : el('p', { class: 'fc-empty', text: 'インデックスの積立を登録できます（日本時間23:00に自動実行）。' });

  const histRows = history.length ? el('div', { class: 'fc-list' }, ...history.map((h) =>
    el('div', { class: 'fc-row' },
      el('div', { class: 'fc-row-main' },
        el('div', { class: 'fc-row-title', text: h.holdingName || '積立' }),
        el('div', { class: 'fc-row-sub', text: `${fmtDate(h.date).replace(/\(.\)/, '')}・${yen(h.amount)}` })),
      el('span', { class: 'fc-accum-result ' + (h.status === 'success' ? 'ok' : 'ng'), text: h.status === 'success' ? '成功' : `失敗${h.reason ? '（' + h.reason + '）' : ''}` })))
  ) : el('p', { class: 'fc-empty', text: 'まだ積立履歴はありません' });

  return card(
    sectionTitle('インデックス積立', el('button', { class: 'fc-link', type: 'button', onclick: () => accumulationForm(acc) }, el('span', { class: 'fc-add-ic sm', html: iconHtml('plus', { size: 14 }) }), el('span', { text: '追加' }))),
    setRows,
    el('div', { class: 'fc-accum-histhead', text: '積立履歴' }),
    histRows,
  );
}

// 銘柄の追加・編集フォーム（個別株＝米国株USD / インデックス＝円建て＋NISA区分）
function holdingForm(acc, h) {
  const isNew = !h;
  let kindVal = h?.kind || 'stock';
  const kindSeg = el('div', { class: 'fc-seg' });

  // 個別株（米国株・USD）
  const name = inputEl({ placeholder: kindVal === 'stock' ? '例）IonQ' : '例）eMAXIS Slim 米国株式(S&P500)', value: h?.name || '' });
  const ticker = inputEl({ placeholder: '例）IONQ', value: h?.ticker || '' });
  const qty = inputEl({ type: 'number', inputmode: 'decimal', placeholder: '0', value: h?.quantity ?? '' });
  const costUsd = inputEl({ type: 'number', inputmode: 'decimal', placeholder: '0.00', value: h?.costUsd ?? '' });
  const priceUsd = inputEl({ type: 'number', inputmode: 'decimal', placeholder: '0.00', value: h?.priceUsd ?? '' });
  const fx = inputEl({ type: 'number', inputmode: 'decimal', placeholder: '例）157.5', value: h?.fxRate ?? '' });
  // インデックス（円建て）
  const nisaSel = selectEl(Sec.NISA_FRAMES, h?.nisaFrame || 'growth');
  const cost = inputEl({ type: 'number', inputmode: 'numeric', placeholder: '0', value: h?.cost ?? '' });
  const value = inputEl({ type: 'number', inputmode: 'numeric', placeholder: '0', value: h?.value ?? '' });
  const memo = inputEl({ placeholder: 'メモ（任意）', value: h?.memo || '' });
  // 将来資産シミュレーション用（想定年利・計算方式・配当）
  const simReturn = inputEl({ type: 'number', inputmode: 'decimal', placeholder: kindVal === 'index' ? '例）5' : '例）7', value: h?.simAnnualReturn ?? '' });
  const returnModeSel = selectEl([{ value: 'compound', label: '複利' }, { value: 'simple', label: '単利' }], h?.returnMode || 'compound');
  const divYield = inputEl({ type: 'number', inputmode: 'decimal', placeholder: '例）2.5', value: h?.dividendYield ?? '' });
  let divReinvest = h ? h.dividendReinvest !== false : true;
  const divReinvestRow = el('div', { class: 'fc-field-toggle' });
  const drawDivReinvest = () => {
    divReinvestRow.innerHTML = '';
    divReinvestRow.append(el('div', {}, el('div', { class: 'fc-field-lab', text: '配当を再投資する' }),
      el('div', { class: 'fc-field-hint', text: 'OFFにすると配当は現金として受け取る想定で将来シミュレーションへ反映します' })),
      toggle(divReinvest, () => { divReinvest = !divReinvest; drawDivReinvest(); }));
  };
  drawDivReinvest();

  const fieldsWrap = el('div', {});
  const drawFields = () => {
    fieldsWrap.innerHTML = '';
    if (kindVal === 'stock') {
      fieldsWrap.append(
        field('銘柄名', name), field('ティッカー', ticker), field('保有数量', qty),
        field('取得単価（USD）', costUsd), field('現在株価（USD）', priceUsd), field('ドル円レート（USD/JPY）', fx),
        field('メモ（任意）', memo),
        el('p', { class: 'fc-field-hint', text: '評価額 = 保有数量 × 現在株価(USD) × ドル円。現在株価は「株価を更新」からいつでも手入力できます。' }),
        el('p', { class: 'fc-field-sep', text: '将来資産シミュレーション用の設定' }),
        field('想定年利（%）', simReturn), field('年利の計算方式', returnModeSel),
        field('年間配当利回り（%・任意）', divYield), divReinvestRow);
    } else {
      fieldsWrap.append(
        field('ファンド名', name), field('NISA区分', nisaSel),
        field('総元本（円）', cost), field('現在保有額（円）', value),
        field('メモ（任意）', memo),
        el('p', { class: 'fc-field-hint', text: 'インデックスは数量・基準価額の管理は不要です。毎晩23時の積立額はこの総元本に積み上がります。総元本と現在保有額の差額から損益・損益率を計算します。' }),
        el('p', { class: 'fc-field-sep', text: '将来資産シミュレーション用の設定' }),
        field('想定年利（%）', simReturn), field('年利の計算方式', returnModeSel));
    }
  };
  const drawKindSeg = () => {
    kindSeg.innerHTML = '';
    for (const [v, l] of [['stock', '個別株（米国株）'], ['index', 'インデックス']])
      kindSeg.append(el('button', { class: 'fc-seg-btn' + (kindVal === v ? ' on' : ''), type: 'button', text: l, onclick: () => { kindVal = v; drawKindSeg(); drawFields(); } }));
  };
  drawKindSeg(); drawFields();

  const body = el('div', {},
    isNew ? field('区分', kindSeg) : '',
    fieldsWrap,
    !isNew && el('button', {
      class: 'fc-btn danger block', type: 'button', text: 'この銘柄を削除',
      onclick: () => confirmDialog('銘柄を削除', `「${h.name}」を削除しますか？`, () => {
        S.update((s) => { const a = s.accounts.find((x) => x.id === acc.id); a.holdings = a.holdings.filter((x) => x.id !== h.id); a.accumulations = (a.accumulations || []).filter((x) => x.holdingId !== h.id); Sec.recomputeAccount(a); S.recordAssetSnapshot(s); });
        render(); toast('削除しました', 'trash'); qs('.fc-modal-back')?.classList.remove('show'); setTimeout(() => qs('.fc-modal-back')?.remove(), 260);
      }),
    }),
  );
  modal(isNew ? '銘柄を追加' : '銘柄を編集', body, {
    onSave: (close) => {
      if (!name.value.trim()) return toast('銘柄名を入力してください', 'alert');
      S.update((s) => {
        const a = s.accounts.find((x) => x.id === acc.id);
        let rec;
        if (kindVal === 'stock') {
          rec = {
            kind: 'stock', name: name.value.trim(), ticker: ticker.value.trim().toUpperCase(), quantity: Number(qty.value) || 0, costUsd: Number(costUsd.value) || 0, priceUsd: Number(priceUsd.value) || 0, fxRate: Number(fx.value) || 0, memo: memo.value.trim(),
            simAnnualReturn: Number(simReturn.value) || 0, returnMode: returnModeSel.value,
            dividendYield: Number(divYield.value) || 0, dividendReinvest: divReinvest,
          };
          if (isNew) rec.plannedPurchases = [];
        } else {
          rec = {
            kind: 'index', name: name.value.trim(), nisaFrame: nisaSel.value, cost: Number(cost.value) || 0, value: Number(value.value) || 0, memo: memo.value.trim(),
            simAnnualReturn: Number(simReturn.value) || 0, returnMode: returnModeSel.value,
          };
        }
        if (isNew) a.holdings.push({ id: uid('hd'), ...rec });
        else Object.assign(a.holdings.find((x) => x.id === h.id), rec);
        Sec.recomputeAccount(a);
        S.recordAssetSnapshot(s);
      });
      render(); toast('保存しました'); close();
    },
  });
}

// 個別株（米国株）の購入フォーム。購入金額(円)=株数×購入単価USD×ドル円。現金を減らし元本(取得額)へ反映。
function purchaseForm(acc) {
  const stocks = Sec.accountHoldings(acc).filter(Sec.isStock);
  if (!stocks.length) { modal('個別株を購入', el('p', { class: 'fc-empty', text: '先に「銘柄を追加」で個別株（米国株）を登録してください。' }), {}); return; }
  const sel = selectEl(stocks.map((h) => ({ value: h.id, label: `${h.name}${h.ticker ? '（' + h.ticker + '）' : ''}` })), stocks[0].id);
  const shares = inputEl({ type: 'number', inputmode: 'decimal', placeholder: '0', value: '' });
  const price = inputEl({ type: 'number', inputmode: 'decimal', placeholder: '0.00', value: '' });
  const fx = inputEl({ type: 'number', inputmode: 'decimal', placeholder: '例）157.5', value: stocks[0]?.fxRate || '' });
  const date = inputEl({ type: 'date', value: today() });
  const preview = el('p', { class: 'fc-field-hint' });
  const upd = () => {
    const amt = Math.round((Number(shares.value) || 0) * (Number(price.value) || 0) * (Number(fx.value) || 0));
    preview.textContent = `購入金額 ${yen(amt)}（${num(Number(shares.value) || 0)}株 × $${num(Number(price.value) || 0)} × ${num(Number(fx.value) || 0)}）／購入後の現金 ${yen(Sec.accountCash(acc) - amt)}`;
  };
  // 選択銘柄が変わったらドル円の初期値を追従
  sel.addEventListener('change', () => { const h = stocks.find((x) => x.id === sel.value); if (h && !fx.value) fx.value = h.fxRate || ''; upd(); });
  shares.addEventListener('input', upd); price.addEventListener('input', upd); fx.addEventListener('input', upd); upd();
  const body = el('div', {},
    field('銘柄', sel), field('購入株数', shares), field('購入価格（USD）', price), field('ドル円レート（USD/JPY）', fx), field('購入日', date), preview,
    el('p', { class: 'fc-field-hint', text: '購入すると証券口座の現金が減り、購入金額が元本（取得額）へ反映されます。現金が不足している場合は購入できません。' }));
  modal('個別株を購入', body, {
    saveLabel: '購入する',
    onSave: (close) => {
      const sh = Number(shares.value), pr = Number(price.value), rate = Number(fx.value);
      if (!sh || sh <= 0 || !pr || pr <= 0) return toast('株数と価格を入力してください', 'alert');
      if (!rate || rate <= 0) return toast('ドル円レートを入力してください', 'alert');
      let result;
      S.update((s) => { result = Sec.purchaseStock(s, acc.id, sel.value, sh, pr, rate, date.value); if (result.ok) S.recordAssetSnapshot(s); });
      if (!result.ok) {
        if (result.reason === 'cash') return toast(`現金が不足しています（購入額 ${yen(result.amount)}）`, 'alert');
        return toast('購入できませんでした', 'alert');
      }
      render(); toast('購入しました', 'coins'); close();
    },
  });
}

// 「株価を更新」= 現在株価(USD)を手入力する画面（API取得ではない）。保存で評価額・損益・損益率が即時再計算。
function priceUpdateForm(acc) {
  const stocks = Sec.accountHoldings(acc).filter(Sec.isStock);
  if (!stocks.length) { modal('株価を更新', el('p', { class: 'fc-empty', text: '個別株（米国株）が登録されていません。「銘柄を追加」から登録してください。' }), {}); return; }
  const rows = stocks.map((h) => {
    const priceInp = inputEl({ type: 'number', inputmode: 'decimal', placeholder: '0.00', value: h.priceUsd ?? '' });
    const fxInp = inputEl({ type: 'number', inputmode: 'decimal', placeholder: '例）157.5', value: h.fxRate ?? '' });
    return { h, priceInp, fxInp, node: el('div', { class: 'fc-priceupd-row' },
      el('div', { class: 'fc-priceupd-head' },
        el('span', { class: 'fc-holding-name', text: h.name }),
        h.ticker ? el('span', { class: 'fc-holding-ticker', text: h.ticker }) : ''),
      el('div', { class: 'fc-priceupd-inputs' },
        field('現在株価（USD）', priceInp), field('ドル円', fxInp))) };
  });
  const body = el('div', {},
    el('p', { class: 'fc-field-hint', text: '各銘柄の現在株価（USD）とドル円を入力して保存すると、評価額・損益・損益率・保有割合が即時に再計算されます。' }),
    ...rows.map((r) => r.node));
  modal('株価を更新（現在株価を入力）', body, {
    onSave: (close) => {
      S.update((s) => {
        const a = s.accounts.find((x) => x.id === acc.id);
        for (const r of rows) {
          const hh = a.holdings.find((x) => x.id === r.h.id);
          if (!hh) continue;
          if (r.priceInp.value !== '') hh.priceUsd = Number(r.priceInp.value) || 0;
          if (r.fxInp.value !== '') hh.fxRate = Number(r.fxInp.value) || 0;
        }
        Sec.recomputeAccount(a);
        S.recordAssetSnapshot(s);
      });
      render(); toast('評価額を更新しました', 'trending'); close();
    },
  });
}

// 積立設定フォーム（対象・毎日の積立額・開始日・終了日・ON/OFF）
function accumulationForm(acc, a) {
  const isNew = !a;
  const indexHoldings = Sec.accountHoldings(acc).filter(Sec.isIndex);
  if (!indexHoldings.length) { modal('積立設定', el('p', { class: 'fc-empty', text: '先に「銘柄を追加」でインデックス銘柄を登録してください。' }), {}); return; }
  const sel = selectEl(indexHoldings.map((h) => ({ value: h.id, label: h.name })), a?.holdingId || indexHoldings[0].id);
  let freq = a?.frequency || 'daily';
  const freqSeg = el('div', { class: 'fc-seg' });
  const amount = inputEl({ type: 'number', inputmode: 'numeric', placeholder: '例）1000', value: a?.dailyAmount ?? '' });
  const monthlyAmount = inputEl({ type: 'number', inputmode: 'numeric', placeholder: '例）30000', value: a?.monthlyAmount ?? '' });
  const startDate = inputEl({ type: 'date', value: a?.startDate || today() });
  const endDate = inputEl({ type: 'date', value: a?.endDate || '' });
  const pauseStart = inputEl({ type: 'date', value: a?.pauseStart || '' });
  const pauseEnd = inputEl({ type: 'date', value: a?.pauseEnd || '' });
  let enabled = a ? a.enabled !== false : true;
  const enRow = el('div', { class: 'fc-field-toggle' });
  const drawEn = () => { enRow.innerHTML = ''; enRow.append(el('div', {}, el('div', { class: 'fc-field-lab', text: '積立 ON/OFF' }), el('div', { class: 'fc-field-hint', text: 'ONの設定のみ実行されます（実際の自動積立は日本時間23:00に処理されます）' })), toggle(enabled, () => { enabled = !enabled; drawEn(); })); };
  drawEn();

  const amountWrap = el('div', {});
  const drawAmount = () => {
    amountWrap.innerHTML = '';
    if (freq === 'monthly') amountWrap.append(field('毎月の積立金額（円）', monthlyAmount));
    else amountWrap.append(field(freq === 'weekly' ? '毎週の積立金額（円）' : '毎日の積立金額（円）', amount));
  };
  const drawFreqSeg = () => {
    freqSeg.innerHTML = '';
    for (const [v, l] of [['daily', '毎日'], ['weekly', '毎週'], ['monthly', '毎月']])
      freqSeg.append(el('button', { class: 'fc-seg-btn' + (freq === v ? ' on' : ''), type: 'button', text: l, onclick: () => { freq = v; drawFreqSeg(); drawAmount(); } }));
  };
  drawFreqSeg(); drawAmount();

  const body = el('div', {},
    field('積立対象（インデックス）', sel),
    field('積立頻度', freqSeg), amountWrap,
    field('積立開始日', startDate), optionalDateField('積立終了日（任意）', endDate),
    optionalDateField('積立停止日（任意）', pauseStart), optionalDateField('積立再開日（任意）', pauseEnd),
    el('p', { class: 'fc-field-hint', text: '積立停止日〜積立再開日の間は積立を一時停止します（積立再開日を空欄にすると停止日以降ずっと停止します）。' }),
    enRow,
    !isNew && el('button', {
      class: 'fc-btn danger block', type: 'button', text: 'この積立設定を削除',
      onclick: () => confirmDialog('積立設定を削除', '削除しますか？', () => {
        S.update((s) => { const ac = s.accounts.find((x) => x.id === acc.id); ac.accumulations = ac.accumulations.filter((x) => x.id !== a.id); });
        render(); toast('削除しました', 'trash'); qs('.fc-modal-back')?.classList.remove('show'); setTimeout(() => qs('.fc-modal-back')?.remove(), 260);
      }),
    }),
  );
  modal(isNew ? '積立設定を追加' : '積立設定を編集', body, {
    onSave: (close) => {
      const amt = freq === 'monthly' ? Number(monthlyAmount.value) : Number(amount.value);
      if (!amt || amt <= 0) return toast('積立金額を入力してください', 'alert');
      if (startDate.value && endDate.value && endDate.value < startDate.value) return toast('終了日は開始日より後にしてください', 'alert');
      if (pauseStart.value && pauseEnd.value && pauseEnd.value < pauseStart.value) return toast('積立再開日は積立停止日より後にしてください', 'alert');
      S.update((s) => {
        const ac = s.accounts.find((x) => x.id === acc.id);
        const rec = {
          holdingId: sel.value, frequency: freq,
          dailyAmount: freq === 'monthly' ? (Number(amount.value) || 0) : amt,
          monthlyAmount: freq === 'monthly' ? amt : (Number(monthlyAmount.value) || 0),
          startDate: startDate.value || null, endDate: endDate.value || null,
          pauseStart: pauseStart.value || null, pauseEnd: pauseEnd.value || null,
          enabled,
        };
        if (isNew) ac.accumulations.push({ id: uid('acm'), ...rec });
        else Object.assign(ac.accumulations.find((x) => x.id === a.id), rec);
      });
      render(); toast('保存しました'); close();
    },
  });
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
  const lu = st.settings.lastUsed || {}; // 前回使用したカテゴリー・口座
  let type = tx?.type || initialType || 'expense';
  // 支払/入金口座の初期値: 編集中の口座 > 前回使用 > 表示中口座 > 先頭
  const defAcc = tx?.accountId || lu.account || defaultAccountId || st.accounts[0]?.id || '';
  const otherAcc = st.accounts.find((a) => a.id !== defAcc)?.id || defAcc;

  // 種別セグメント（新規のみ振替を含む）
  const seg = el('div', { class: 'fc-seg fc-seg3' });
  const opts = isNew ? [['expense', '支出'], ['income', '収入'], ['transfer', '振替']] : [['expense', '支出'], ['income', '収入']];
  const mkSeg = () => {
    seg.innerHTML = '';
    for (const [val, lab] of opts)
      seg.append(el('button', { class: 'fc-seg-btn' + (type === val ? ' on' : ''), type: 'button', text: lab, onclick: () => { type = val; mkSeg(); drawFields(); validate(); } }));
  };

  const date = inputEl({ type: 'date', value: tx?.date || today() });
  const amount = amountInput(tx?.amount); // 3桁区切り＋数字キーボード
  const memo = inputEl({ placeholder: 'メモ（任意）', value: tx?.memo || '' });
  amount.addEventListener('input', () => validate());
  // 収支用（口座は必須）。前回使用したカテゴリー・口座を初期選択。
  const catWrap = el('div', {});
  const acc = selectEl(accountOptions(), defAcc);
  acc.addEventListener('change', () => validate());
  const refreshCats = () => {
    const cats = type === 'income' ? st.categories.income : st.categories.expense;
    const preferred = tx?.categoryId || lu[type + 'Cat'];
    catWrap.innerHTML = '';
    catWrap.append(field('カテゴリー', selectEl(cats.map((c) => ({ value: c.id, label: c.name })), preferred || cats[0]?.id)));
  };
  // 振替用（表示中口座を振替元の初期値に）
  const fromSel = selectEl(accountOptions(), defAcc);
  const toSel = selectEl(accountOptions(), otherAcc);
  fromSel.addEventListener('change', () => validate());
  toSel.addEventListener('change', () => validate());

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

  // 必須項目が揃っているか（保存ボタンの有効・無効に使用）
  const isValid = () => {
    if (amountValue(amount) <= 0) return false;
    if (type === 'transfer') return st.accounts.length >= 2 && fromSel.value && toSel.value && fromSel.value !== toSel.value;
    return !!acc.value;
  };
  const dirty = () => {
    if (isNew) return amountValue(amount) > 0 || !!memo.value.trim();
    return amountValue(amount) !== (Number(tx.amount) || 0) || memo.value.trim() !== (tx.memo || '') || date.value !== tx.date || type !== tx.type;
  };
  let ctrl;
  const validate = () => ctrl?.setSaveDisabled(!isValid());

  const body = el('div', {},
    field('種別', seg), fieldsWrap,
    !isNew && el('button', {
      class: 'fc-btn danger block', type: 'button', text: 'この取引を削除',
      onclick: () => confirmDialog('取引を削除', '削除して口座残高を元に戻しますか？', () => {
        S.update((s) => {
          reverseTx(s, tx.accountId, tx.type, Number(tx.amount) || 0);
          s.transactions = s.transactions.filter((x) => x.id !== tx.id);
          S.recordAssetSnapshot(s);
        });
        render(); toast('削除しました', 'trash');
        qs('.fc-modal-back')?.classList.remove('show'); setTimeout(() => qs('.fc-modal-back')?.remove(), 260);
      }),
    }),
  );
  ctrl = modal(isNew ? '取引を追加' : '収支を編集', body, {
    saveDisabled: true,
    dirty,
    onSave: (close) => {
      const amt = amountValue(amount);
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
        if (isNew) {
          s.transactions.push({ id: uid('tx'), ...rec });
        } else {
          reverseTx(s, tx.accountId, tx.type, Number(tx.amount) || 0);
          Object.assign(s.transactions.find((x) => x.id === tx.id), rec);
        }
        applyTx(s, acc.value, type, amt);
        // 次回のために使用したカテゴリー・口座を記録
        s.settings.lastUsed = { ...(s.settings.lastUsed || {}), [type + 'Cat']: catId, account: acc.value };
        S.recordAssetSnapshot(s);
      });
      render(); toast('保存しました'); close();
    },
  });
  validate(); // 初期状態の保存ボタン有効/無効を反映
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
      const run = rt.nextRun ?? nextRecurringDate(rt);
      return el('div', { class: 'fc-row tap', onclick: () => recurringTransferForm(rt) },
        el('div', { class: 'fc-row-ic', html: iconHtml('repeat', { size: 18 }) }),
        el('div', { class: 'fc-row-main' },
          routeRow(f?.name, t?.name),
          el('div', { class: 'fc-row-sub', text: `毎月${rt.day === 'end' ? '末' : rt.day + '日'}${rt.memo ? '・' + rt.memo : ''}` }),
          run ? el('div', { class: 'fc-row-sub fc-next-run', text: `次回実行日 ${fmtDate(run).replace(/\(.\)/, '')}` }) : null),
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
  // 次回振替予定日のプレビュー（登録日ではなく開始日＋実行日から算出）。
  const schedulePreview = el('p', { class: 'fc-field-hint fc-sched-preview' });
  const updatePreview = () => {
    const d = day.value === 'end' ? 'end' : Number(day.value);
    const run = nextRecurringDate({ day: d, startDate: startDate.value || null, endDate: endDate.value || null });
    schedulePreview.textContent = run ? `次回実行日：${fmtDateLong(run)}` : '終了日を過ぎているため実行予定はありません';
  };
  day.addEventListener('change', updatePreview);
  startDate.addEventListener('change', updatePreview);
  endDate.addEventListener('change', updatePreview);
  updatePreview();
  const body = el('div', {},
    field('振替元口座', fromSel), field('振替先口座', toSel), field('金額（円）', amount), field('実行日', day),
    optionalDateField('開始日（任意）', startDate), optionalDateField('終了日（任意）', endDate), field('メモ', memo),
    schedulePreview,
    el('p', { class: 'fc-field-hint', text: '29〜31日・毎月末を選ぶと、その日が無い月（例：2月）は自動的にその月の最終日に処理されます。' }),
    el('p', { class: 'fc-field-hint', text: '開始日は「この日以降から有効」。最初の実行日は開始日以降で、設定した実行日に一致する最初の日になります。' }),
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
        if (isNew) s.recurringTransfers.push({ id: uid('rtr'), createdAt: today(), ...rec });
        else { const ex = s.recurringTransfers.find((x) => x.id === rt.id); Object.assign(ex, rec); if (!ex.createdAt) ex.createdAt = today(); }
        S.computeRecurringSchedule(s); // 次回実行予定日を保存（編集時も再計算）
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

  // 収支シミュレーション / 投資将来予測 の切替(一元管理)
  const tabSeg = el('div', { class: 'fc-seg' });
  for (const [v, l] of [['cashflow', '収支シミュレーション'], ['invest', '投資将来予測']])
    tabSeg.append(el('button', { class: 'fc-seg-btn' + (ui.simTab === v ? ' on' : ''), type: 'button', text: l, onclick: () => { ui.simTab = v; render(); } }));
  wrap.append(tabSeg);

  if (ui.simTab === 'invest') { wrap.append(renderFutureSim()); return wrap; }

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

// ============ 投資将来予測（将来資産シミュレーションの投資予測タブ） ============
const FUTURE_SERIES_DEFS = [
  { key: 'total', label: '総資産', color: '#0a84ff', field: 'total' },
  { key: 'cash', label: '現金', color: '#8e8e93', field: 'bankCash' },
  { key: 'secCash', label: '証券口座現金', color: '#5ac8fa', field: 'secCash' },
  { key: 'principal', label: '元本', color: '#ff9500', field: 'principal' },
  { key: 'valuation', label: '評価額', color: '#34c759', field: 'valuation' },
  { key: 'indexValuation', label: 'インデックス評価額', color: '#bf5af2', field: 'indexValuation' },
  { key: 'stockValuation', label: '個別株評価額', color: '#ff375f', field: 'stockValuation' },
];
const FUTURE_EVENT_PRESETS = ['住宅購入', '車購入', '旅行', '結婚', '教育費', '大型家電'];

function renderFutureSim() {
  const st = S.getState();
  const fs = st.futureSim;
  const wrap = el('div', {});

  wrap.append(futurePeriodCard(fs));
  wrap.append(futureRateCard(fs));
  wrap.append(futureWhatIfCard());

  const proj = FS.project(st, { years: fs.years, extraMonthlyInvestment: ui.futureExtra || 0 });
  wrap.append(futureMainChartCard(st, fs, proj));
  wrap.append(futureSnapshotCard(fs, proj));
  wrap.append(futureDateLookupCard(st, fs));
  wrap.append(futureCompareCard(st, fs));
  wrap.append(futureSensitivityCard(st, fs));
  wrap.append(futureGoalsCard(st, fs));
  wrap.append(futureEventsCard(fs));
  wrap.append(futureDividendCard(st, fs));
  wrap.append(futureStockPlansCard(st));
  wrap.append(futureMonteCarloCard(st, fs));
  wrap.append(futureInsightsCard(st));
  wrap.append(futurePlansCard(st, fs));
  wrap.append(el('p', { class: 'fc-note', text: '※ 登録済みの証券口座・保有銘柄・積立設定・購入予定・将来イベントから計算しています。想定年利は将来の運用成果を保証するものではありません。' }));
  return wrap;
}

// ---- 保有期間シミュレーション（ワンタップ切替） ----
function futurePeriodCard(fs) {
  const seg = el('div', { class: 'fc-period' });
  for (const y of FS.YEAR_OPTIONS)
    seg.append(el('button', { class: 'fc-period-btn' + (fs.years === y ? ' on' : ''), type: 'button', text: `${y}年`, onclick: () => { S.update((s) => { s.futureSim.years = y; }); render(); } }));
  return card(sectionTitle('保有期間'), seg);
}

// ---- 年利シミュレーション（クイック選択＋スライダー＋一律適用トグル） ----
function futureRateCard(fs) {
  const rate = FS.scenarioRate(fs);
  const chips = el('div', { class: 'fc-period' });
  for (const r of FS.RATE_CHIPS) {
    chips.append(el('button', {
      class: 'fc-period-btn' + (fs.scenario === 'custom' && Math.abs((Number(fs.customReturn) || 0) - r) < 0.001 ? ' on' : ''),
      type: 'button', text: `${r}%`,
      onclick: () => { S.update((s) => { s.futureSim.scenario = 'custom'; s.futureSim.customReturn = r; }); render(); },
    }));
  }
  chips.append(el('button', { class: 'fc-period-btn', type: 'button', text: '自由入力', onclick: () => futureCustomRateForm(fs) }));

  const slider = el('input', { type: 'range', class: 'fc-slider', min: '0', max: '30', step: '0.5', value: String(rate) });
  const sliderLabel = el('span', { class: 'fc-slider-val', text: `年${rate.toFixed(1)}%` });
  slider.addEventListener('input', () => { sliderLabel.textContent = `年${Number(slider.value).toFixed(1)}%`; });
  slider.addEventListener('change', () => { S.update((s) => { s.futureSim.scenario = 'custom'; s.futureSim.customReturn = Number(slider.value); }); render(); });

  const useOverride = fs.useOverride !== false;
  const toggleRow = el('div', { class: 'fc-field-toggle' },
    el('div', {}, el('div', { class: 'fc-field-lab', text: '一律の想定年利を全銘柄へ適用' }),
      el('div', { class: 'fc-field-hint', text: 'OFFにすると銘柄ごとに設定した想定年利・計算方式を使用します' })),
    toggle(useOverride, () => { S.update((s) => { s.futureSim.useOverride = !useOverride; }); render(); }));

  return card(sectionTitle('年利シミュレーション'), chips, el('div', { class: 'fc-slider-row' }, slider, sliderLabel), toggleRow);
}
function futureCustomRateForm(fs) {
  const inp = inputEl({ type: 'number', inputmode: 'decimal', placeholder: '例）12', value: fs.scenario === 'custom' ? fs.customReturn : '' });
  modal('想定年利を自由入力', field('想定年利（%）', inp), {
    onSave: (close) => {
      const v = Number(inp.value);
      if (Number.isNaN(v)) return toast('数値を入力してください', 'alert');
      S.update((s) => { s.futureSim.scenario = 'custom'; s.futureSim.customReturn = v; });
      render(); close();
    },
  });
}

// ---- 積立変更シミュレーション（What-If・実データは変更しない） ----
function futureWhatIfCard() {
  const val = ui.futureExtra || 0;
  const slider = el('input', { type: 'range', class: 'fc-slider', min: '0', max: '300000', step: '5000', value: String(val) });
  const label = el('span', { class: 'fc-slider-val', text: `+${yen(val)}/月` });
  slider.addEventListener('input', () => { label.textContent = `+${yen(Number(slider.value))}/月`; });
  slider.addEventListener('change', () => { ui.futureExtra = Number(slider.value); render(); });
  return card(
    sectionTitle('積立変更シミュレーション'),
    el('p', { class: 'fc-field-hint', text: '実際の積立設定は変更せず、毎月の追加投資額を仮に変えた場合の効果だけをその場で試せます（下のグラフ・数値へ即反映）。' }),
    el('div', { class: 'fc-slider-row' }, slider, label),
  );
}

// ---- 将来資産グラフ（表示項目を切替） ----
function futureMainChartCard(state, fs, proj) {
  const secret = state.settings.secret;
  const visible = fs.chartVisible || {};
  const chips = el('div', { class: 'fc-chipwrap' });
  for (const d of FUTURE_SERIES_DEFS) {
    const on = !!visible[d.key];
    chips.append(el('button', {
      class: 'fc-serieschip' + (on ? ' on' : ''), type: 'button',
      style: on ? `background:${d.color}22;color:${d.color};border-color:${d.color}66` : '',
      onclick: () => { S.update((s) => { s.futureSim.chartVisible[d.key] = !s.futureSim.chartVisible[d.key]; }); render(); },
    }, el('i', { class: 'dot', style: `background:${d.color}` }), el('span', { text: d.label })));
  }

  const labelFor = (iso, i) => { if (i === 0) return '今'; const d = parseISO(iso); return `${d.getFullYear()}/${d.getMonth() + 1}`; };
  const step = Math.max(1, Math.floor(proj.series.length / 60));
  const sampled = proj.series.filter((_, i) => i % step === 0 || i === proj.series.length - 1);
  const seriesList = FUTURE_SERIES_DEFS.filter((d) => visible[d.key]).map((d) => ({
    label: d.label, color: d.color, data: sampled.map((p, i) => ({ label: labelFor(p.date, i), value: p[d.field] })),
  }));
  const shortfall = FS.firstShortfall(proj.series);

  return card(
    sectionTitle('将来資産グラフ'),
    chips,
    secret ? el('p', { class: 'fc-empty', text: 'シークレットモード中は非表示' })
      : (seriesList.length ? el('div', { class: 'fc-chart', html: multiLineChart(seriesList, { height: 240 }) })
        : el('p', { class: 'fc-empty', text: '表示する項目を選択してください' })),
    shortfall ? el('div', { class: 'fc-shortage' },
      el('div', { class: 'fc-shortage-top' }, el('span', { class: 'fc-shortage-ic', html: iconHtml('alert', { size: 18 }) }),
        el('b', { text: `${fmtDateLong(shortfall.date)}頃に資金がマイナスになる見込みです` })),
      el('div', { class: 'fc-shortage-sub', text: '積立額・購入予定・銀行⇔証券の振替設定を見直してください。' })) : '',
  );
}

// ---- 期間後スナップショット ----
function futureSnapshotCard(fs, proj) {
  const secret = S.getState().settings.secret;
  const money = (v) => (secret ? '＊＊＊' : yen(v));
  const start = proj.series[0], end = proj.series.at(-1);
  const profitRate = end.principal > 0 ? ((end.valuation - end.principal) / end.principal) * 100 : null;
  return card(
    sectionTitle(`${fs.years}年後の予測`),
    el('div', { class: 'fc-sec-grid' },
      secBox('総資産', money(end.total)), secBox('現金合計', money(end.bankCash + end.secCash)), secBox('評価額', money(end.valuation))),
    el('div', { class: 'fc-sec-grid' },
      secBox('元本', money(end.principal)), secBox('評価損益', money(end.valuation - end.principal)),
      secBox('利益率', profitRate == null ? '—' : `${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(1)}%`)),
    el('p', { class: 'fc-field-hint', text: `現在（${fmtDate(start.date)}）の総資産 ${money(start.total)} から ${fs.years}年後は ${money(end.total)}（${secret ? '＊＊＊' : yen(end.total - start.total, { sign: end.total - start.total > 0 })}）の見込みです。` }),
  );
}

// ---- 資産推移（任意の日付を選んで内訳を確認） ----
function futureDateLookupCard(state, fs) {
  const secret = state.settings.secret;
  const proj30 = FS.project(state, { years: Math.max(fs.years, 30) });
  const dateInp = inputEl({ type: 'date', value: ui.futureCheckDate || proj30.series[Math.min(12, proj30.series.length - 1)].date, min: proj30.from, max: proj30.to });
  const result = el('div', {});
  const draw = () => {
    const iso = dateInp.value || proj30.from;
    const pt = FS.pointAt(proj30.series, iso);
    const profitRate = pt.principal > 0 ? ((pt.valuation - pt.principal) / pt.principal) * 100 : null;
    result.innerHTML = '';
    result.append(el('div', { class: 'fc-kv' },
      kv('銀行残高', secret ? '＊＊＊' : yen(pt.bankCash)),
      kv('証券口座現金', secret ? '＊＊＊' : yen(pt.secCash)),
      kv('元本', secret ? '＊＊＊' : yen(pt.principal)),
      kv('評価額', secret ? '＊＊＊' : yen(pt.valuation)),
      kv('合計資産', secret ? '＊＊＊' : yen(pt.total)),
      kv('利益率', profitRate == null ? '—' : `${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(1)}%`)));
  };
  dateInp.addEventListener('change', () => { ui.futureCheckDate = dateInp.value; draw(); });
  draw();
  return card(sectionTitle('資産推移を確認'), field('日付を選択', dateInp), result);
}

// ---- シナリオ比較（保守・通常・強気・自由設定） ----
function futureCompareCard(state, fs) {
  const secret = state.settings.secret;
  const body = el('div', {});
  const draw = () => {
    body.innerHTML = '';
    if (!ui.futureCompare) { body.append(el('p', { class: 'fc-field-hint', text: 'タップすると保守・通常・強気・自由設定のシナリオを重ねて比較できます。' })); return; }
    const cmp = FS.scenarioComparison(state, { years: fs.years });
    const step = Math.max(1, Math.floor(cmp[0].series.length / 60));
    const seriesList = cmp.map((c) => ({
      label: `${c.label}（${c.rate.toFixed(1)}%）`, color: c.color,
      data: c.series.filter((_, i) => i % step === 0 || i === c.series.length - 1).map((p) => ({ label: '', value: p.total })),
    }));
    body.append(
      secret ? el('p', { class: 'fc-empty', text: 'シークレットモード中は非表示' }) : el('div', { class: 'fc-chart', html: multiLineChart(seriesList, { height: 220 }) }),
      el('div', { class: 'fc-legend-list' }, ...cmp.map((c) => el('div', { class: 'fc-legend-row' },
        el('i', { class: 'dot', style: `background:${c.color}` }),
        el('span', { class: 'fc-legend-name', text: `${c.label}（年${c.rate.toFixed(1)}%）` }),
        el('span', { class: 'fc-legend-amt', text: secret ? '＊＊＊' : yen(c.series.at(-1).total) })))),
    );
  };
  draw();
  return card(sectionTitle('シナリオ比較', el('button', { class: 'fc-link', type: 'button', text: ui.futureCompare ? '閉じる' : '表示する', onclick: () => { ui.futureCompare = !ui.futureCompare; render(); } })), body);
}

// ---- 年利感度分析 ----
function futureSensitivityCard(state, fs) {
  const secret = state.settings.secret;
  const base = FS.scenarioRate(fs);
  const rows = FS.sensitivityAnalysis(state, { years: fs.years, baseRate: base, deltas: [-4, -2, 0, 2, 4] });
  return card(
    sectionTitle('年利感度分析', el('span', { class: 'fc-chart-hint', text: `基準 年${base.toFixed(1)}%` })),
    el('div', { class: 'fc-sens-list' }, ...rows.map((r) => el('div', { class: 'fc-sens-row' + (r.delta === 0 ? ' base' : '') },
      el('span', { class: 'fc-sens-rate', text: `年利${r.rate.toFixed(1)}%` }),
      el('span', { class: 'fc-sens-amt', text: secret ? '＊＊＊' : yen(r.total) })))),
  );
}

// ---- 投資達成予測（目標） ----
function futureGoalsCard(state, fs) {
  const secret = state.settings.secret;
  const preds = FS.goalPredictions(state);
  const rows = preds.length ? el('div', { class: 'fc-list' }, ...preds.map(({ goal, date, reached }) =>
    el('div', { class: 'fc-row tap', onclick: () => futureGoalForm(goal) },
      el('div', { class: 'fc-row-ic', html: iconHtml('target', { size: 18 }) }),
      el('div', { class: 'fc-row-main' },
        el('div', { class: 'fc-row-title', text: goal.name }),
        el('div', { class: 'fc-row-sub', text: `${goal.metric === 'valuation' ? '評価額' : '総資産'} ${secret ? '＊＊＊' : yen(goal.targetAmount)}` })),
      el('span', { class: 'fc-goal-date' + (reached ? '' : ' na'), text: reached ? fmtMonth(date.slice(0, 7)) + '頃' : '30年以内未達成' }))))
    : el('p', { class: 'fc-empty', text: '目標を追加すると到達予定時期が表示されます（例: 資産1,000万円到達予定）。' });
  return card(sectionTitle('投資達成予測', el('button', { class: 'fc-link', type: 'button', onclick: () => futureGoalForm() },
    el('span', { class: 'fc-add-ic sm', html: iconHtml('plus', { size: 14 }) }), el('span', { text: '目標を追加' }))), rows);
}
function futureGoalForm(goal) {
  const isNew = !goal;
  const name = inputEl({ placeholder: '例）資産1,000万円 / FIRE目標', value: goal?.name || '' });
  const amount = amountInput(goal?.targetAmount);
  const metricSel = selectEl([{ value: 'total', label: '総資産' }, { value: 'valuation', label: '評価額（投資分のみ）' }], goal?.metric || 'total');
  const body = el('div', {},
    field('目標名', name), field('目標金額（円）', amount), field('対象指標', metricSel),
    !isNew && el('button', {
      class: 'fc-btn danger block', type: 'button', text: 'この目標を削除',
      onclick: () => confirmDialog('目標を削除', `「${goal.name}」を削除しますか？`, () => {
        S.update((s) => { s.futureSim.goals = s.futureSim.goals.filter((g) => g.id !== goal.id); });
        render(); toast('削除しました', 'trash'); qs('.fc-modal-back')?.classList.remove('show'); setTimeout(() => qs('.fc-modal-back')?.remove(), 260);
      }),
    }),
  );
  modal(isNew ? '目標を追加' : '目標を編集', body, {
    onSave: (close) => {
      if (!name.value.trim()) return toast('目標名を入力してください', 'alert');
      const amt = amountValue(amount);
      if (!amt || amt <= 0) return toast('目標金額を入力してください', 'alert');
      S.update((s) => {
        const rec = { name: name.value.trim(), targetAmount: amt, metric: metricSel.value };
        if (isNew) s.futureSim.goals.push({ id: uid('goal'), createdAt: today(), ...rec });
        else Object.assign(s.futureSim.goals.find((g) => g.id === goal.id), rec);
      });
      render(); toast('保存しました'); close();
    },
  });
}

// ---- 将来イベント ----
function futureEventsCard(fs) {
  const secret = S.getState().settings.secret;
  const events = (fs.events || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const rows = events.length ? el('div', { class: 'fc-list' }, ...events.map((e) =>
    el('div', { class: 'fc-row tap', onclick: () => futureEventForm(e) },
      el('div', { class: 'fc-row-ic', html: iconHtml('calendar', { size: 18 }) }),
      el('div', { class: 'fc-row-main' },
        el('div', { class: 'fc-row-title', text: e.name }),
        el('div', { class: 'fc-row-sub', text: fmtDate(e.date) })),
      el('span', { class: 'fc-row-amt neg', text: secret ? '＊＊＊' : yen(-e.amount) }))))
    : el('p', { class: 'fc-empty', text: '住宅購入・車購入・旅行などの将来イベントを登録すると、発生日に支出として反映します。' });
  return card(sectionTitle('将来イベント', el('button', { class: 'fc-link', type: 'button', onclick: () => futureEventForm() },
    el('span', { class: 'fc-add-ic sm', html: iconHtml('plus', { size: 14 }) }), el('span', { text: '追加' }))), rows);
}
function futureEventForm(ev) {
  const isNew = !ev;
  const name = inputEl({ placeholder: '例）住宅購入', value: ev?.name || '' });
  const presetRow = el('div', { class: 'fc-chipwrap' });
  for (const p of FUTURE_EVENT_PRESETS) presetRow.append(el('button', { class: 'fc-typechip', type: 'button', text: p, onclick: () => { name.value = p; } }));
  const amount = amountInput(ev?.amount);
  const date = inputEl({ type: 'date', value: ev?.date || today() });
  const memo = inputEl({ placeholder: 'メモ（任意）', value: ev?.memo || '' });
  const body = el('div', {},
    field('よく使う項目', presetRow), field('イベント名', name), field('金額（円）', amount), field('発生予定日', date), field('メモ（任意）', memo),
    !isNew && el('button', {
      class: 'fc-btn danger block', type: 'button', text: 'このイベントを削除',
      onclick: () => confirmDialog('イベントを削除', `「${ev.name}」を削除しますか？`, () => {
        S.update((s) => { s.futureSim.events = s.futureSim.events.filter((x) => x.id !== ev.id); });
        render(); toast('削除しました', 'trash'); qs('.fc-modal-back')?.classList.remove('show'); setTimeout(() => qs('.fc-modal-back')?.remove(), 260);
      }),
    }),
  );
  modal(isNew ? '将来イベントを追加' : '将来イベントを編集', body, {
    onSave: (close) => {
      if (!name.value.trim()) return toast('イベント名を入力してください', 'alert');
      const amt = amountValue(amount);
      if (!amt || amt <= 0) return toast('金額を入力してください', 'alert');
      if (!date.value) return toast('発生予定日を入力してください', 'alert');
      S.update((s) => {
        const rec = { name: name.value.trim(), amount: amt, date: date.value, memo: memo.value.trim() };
        if (isNew) s.futureSim.events.push({ id: uid('fev'), ...rec });
        else Object.assign(s.futureSim.events.find((x) => x.id === ev.id), rec);
      });
      render(); toast('保存しました'); close();
    },
  });
}

// ---- 配当金シミュレーション ----
function futureDividendCard(state, fs) {
  const secret = state.settings.secret;
  const div = FS.dividendComparison(state, { years: fs.years });
  if (!div) return card(sectionTitle('配当金シミュレーション'),
    el('p', { class: 'fc-empty', text: '個別株の編集画面で「年間配当利回り」を設定すると、配当の再投資あり/なしを比較できます。' }));
  const step = Math.max(1, Math.floor(div.series.length / 60));
  const sampled = div.series.filter((_, i) => i % step === 0 || i === div.series.length - 1);
  const seriesList = [
    { label: '評価額（再投資あり）', color: '#34c759', data: sampled.map((p) => ({ label: '', value: p.reinvestValue })) },
    { label: '評価額（再投資なし）', color: '#8e8e93', data: sampled.map((p) => ({ label: '', value: p.flatValue })) },
  ];
  return card(
    sectionTitle('配当金シミュレーション', el('span', { class: 'fc-chart-hint', text: `対象 ${div.eligible.length}銘柄` })),
    secret ? el('p', { class: 'fc-empty', text: 'シークレットモード中は非表示' }) : el('div', { class: 'fc-chart', html: multiLineChart(seriesList, { height: 220 }) }),
    el('div', { class: 'fc-sec-grid' },
      secBox('評価額（再投資あり）', secret ? '＊＊＊' : yen(div.end.reinvestValue)),
      secBox('評価額（再投資なし）', secret ? '＊＊＊' : yen(div.end.flatValue))),
    el('div', { class: 'fc-sec-grid' },
      secBox('累計配当（再投資分）', secret ? '＊＊＊' : yen(div.end.cumReinvestDividend)),
      secBox('累計配当（受取・再投資なし）', secret ? '＊＊＊' : yen(div.end.cumFlatDividend))),
  );
}

// ---- 個別株の購入予定 ----
function futureStockPlansCard(state) {
  const secret = state.settings.secret;
  const stocks = [];
  for (const acc of Sec.securitiesAccounts(state)) for (const h of Sec.accountHoldings(acc).filter(Sec.isStock)) stocks.push({ acc, h });
  if (!stocks.length) return card(sectionTitle('個別株の購入予定'), el('p', { class: 'fc-empty', text: '個別株を登録すると、今後の購入予定を追加できます。' }));

  const rows = [];
  for (const { acc, h } of stocks) for (const p of (h.plannedPurchases || [])) rows.push({ acc, h, p });
  rows.sort((a, b) => a.p.date.localeCompare(b.p.date));
  const list = rows.length ? el('div', { class: 'fc-list' }, ...rows.map(({ acc, h, p }) =>
    el('div', { class: 'fc-row tap', onclick: () => futureStockPlanForm(acc, h, p) },
      el('div', { class: 'fc-row-ic', html: iconHtml('coins', { size: 18 }) }),
      el('div', { class: 'fc-row-main' },
        el('div', { class: 'fc-row-title', text: `${h.name}${h.ticker ? '（' + h.ticker + '）' : ''}` }),
        el('div', { class: 'fc-row-sub', text: `${fmtDate(p.date)}・想定年利${p.annualReturn}%・${p.holdYears}年保有` })),
      el('span', { class: 'fc-row-amt', text: secret ? '＊＊＊' : yen(p.amount) }))))
    : el('p', { class: 'fc-empty', text: '購入予定はまだありません。' });

  return card(sectionTitle('個別株の購入予定', el('button', { class: 'fc-link', type: 'button', onclick: () => futureStockPlanPicker(stocks) },
    el('span', { class: 'fc-add-ic sm', html: iconHtml('plus', { size: 14 }) }), el('span', { text: '追加' }))), list,
    el('p', { class: 'fc-field-hint', text: '購入予定日に証券口座現金から元本・評価額へ自動反映してシミュレーションします。' }));
}
function futureStockPlanPicker(stocks) {
  if (stocks.length === 1) return futureStockPlanForm(stocks[0].acc, stocks[0].h);
  const closeCur = () => { qs('.fc-modal-back')?.classList.remove('show'); setTimeout(() => qs('.fc-modal-back')?.remove(), 260); };
  const body = el('div', { class: 'fc-list' }, ...stocks.map(({ acc, h }) =>
    el('div', { class: 'fc-row tap', onclick: () => { closeCur(); futureStockPlanForm(acc, h); } },
      el('div', { class: 'fc-row-main' }, el('div', { class: 'fc-row-title', text: `${h.name}${h.ticker ? '（' + h.ticker + '）' : ''}` })))));
  modal('銘柄を選択', body, {});
}
function futureStockPlanForm(acc, h, p) {
  const isNew = !p;
  const date = inputEl({ type: 'date', value: p?.date || today() });
  const amount = amountInput(p?.amount);
  const shares = inputEl({ type: 'number', inputmode: 'decimal', placeholder: '0', value: p?.shares ?? '' });
  const rate = inputEl({ type: 'number', inputmode: 'decimal', placeholder: '例）10', value: p?.annualReturn ?? h.simAnnualReturn ?? 7 });
  const holdYears = inputEl({ type: 'number', inputmode: 'numeric', placeholder: '例）5', value: p?.holdYears ?? 5 });
  const preview = el('p', { class: 'fc-field-hint' });
  const upd = () => {
    const proj = FS.plannedPurchaseProjection({ amount: amountValue(amount), annualReturn: Number(rate.value) || 0, holdYears: Number(holdYears.value) || 0 });
    preview.textContent = `${Number(holdYears.value) || 0}年後の予測評価額（複利概算）: ${yen(proj)}`;
  };
  amount.addEventListener('input', upd); rate.addEventListener('input', upd); holdYears.addEventListener('input', upd); upd();
  const body = el('div', {},
    el('p', { class: 'fc-field-hint', text: `対象銘柄: ${h.name}${h.ticker ? '（' + h.ticker + '）' : ''}` }),
    field('購入予定日', date), field('購入予定金額（円）', amount), field('購入予定株数', shares),
    field('想定年利（%）', rate), field('保有予定年数', holdYears), preview,
    !isNew && el('button', {
      class: 'fc-btn danger block', type: 'button', text: 'この購入予定を削除',
      onclick: () => confirmDialog('購入予定を削除', '削除しますか？', () => {
        S.update((s) => { const a = s.accounts.find((x) => x.id === acc.id); const hh = a.holdings.find((x) => x.id === h.id); hh.plannedPurchases = (hh.plannedPurchases || []).filter((x) => x.id !== p.id); });
        render(); toast('削除しました', 'trash'); qs('.fc-modal-back')?.classList.remove('show'); setTimeout(() => qs('.fc-modal-back')?.remove(), 260);
      }),
    }),
  );
  modal(isNew ? '購入予定を追加' : '購入予定を編集', body, {
    onSave: (close) => {
      if (!date.value) return toast('購入予定日を入力してください', 'alert');
      const amt = amountValue(amount);
      if (!amt || amt <= 0) return toast('購入予定金額を入力してください', 'alert');
      S.update((s) => {
        const a = s.accounts.find((x) => x.id === acc.id);
        const hh = a.holdings.find((x) => x.id === h.id);
        hh.plannedPurchases ||= [];
        const rec = { date: date.value, amount: amt, shares: Number(shares.value) || 0, annualReturn: Number(rate.value) || 0, holdYears: Number(holdYears.value) || 0 };
        if (isNew) hh.plannedPurchases.push({ id: uid('pp'), ...rec });
        else Object.assign(hh.plannedPurchases.find((x) => x.id === p.id), rec);
      });
      render(); toast('保存しました'); close();
    },
  });
}

// ---- モンテカルロシミュレーション（上級機能） ----
function futureMonteCarloCard(state, fs) {
  const secret = state.settings.secret;
  const mc = fs.monteCarlo || {};
  const enabled = mc.enabled === true;
  const toggleRow = el('div', { class: 'fc-field-toggle' },
    el('div', {}, el('div', { class: 'fc-field-lab', text: 'モンテカルロシミュレーション' }),
      el('div', { class: 'fc-field-hint', text: '年ごとにランダムなリターンを発生させ、資産の幅を確認します' })),
    toggle(enabled, () => { S.update((s) => { s.futureSim.monteCarlo.enabled = !enabled; }); render(); }));
  if (!enabled) return card(sectionTitle('モンテカルロシミュレーション', pill('上級機能')), toggleRow);

  const runsChips = el('div', { class: 'fc-period' });
  for (const r of [100, 300, 500, 1000]) runsChips.append(el('button', { class: 'fc-period-btn' + (mc.runs === r ? ' on' : ''), type: 'button', text: `${r}回`, onclick: () => { S.update((s) => { s.futureSim.monteCarlo.runs = r; }); render(); } }));

  const result = FS.monteCarlo(state, { years: fs.years, runs: mc.runs, volatility: mc.volatility });
  const fanData = result.years.map((y) => ({ label: y.year === 0 ? '今' : `${y.year}年`, median: y.median, p5: y.p5, p95: y.p95, min: y.min, max: y.max }));
  const money = (v) => (secret ? '＊＊＊' : yen(v));

  return card(
    sectionTitle('モンテカルロシミュレーション', el('span', { class: 'fc-chart-hint', text: `標準偏差 ±${mc.volatility}%` })),
    toggleRow, runsChips,
    secret ? el('p', { class: 'fc-empty', text: 'シークレットモード中は非表示' }) : el('div', { class: 'fc-chart', html: fanChart(fanData, { height: 240 }) }),
    el('div', { class: 'fc-sec-grid' },
      secBox('中央値', money(result.end.median)), secBox('90%範囲(下限)', money(result.end.p5)), secBox('90%範囲(上限)', money(result.end.p95))),
    el('div', { class: 'fc-sec-grid' },
      secBox('最悪ケース', money(result.end.min)), secBox('最高ケース', money(result.end.max))),
    el('p', { class: 'fc-note', text: `${result.runs}回のシミュレーション結果です。実際のリターンを保証するものではありません。` }),
  );
}

// ---- AI分析カード（ルールベースの参考情報） ----
function futureInsightsCard(state) {
  const lines = FS.insights(state);
  return card(
    sectionTitle('自動分析', pill('参考情報')),
    el('div', { class: 'fc-insight-list' }, ...lines.map((t) => el('div', { class: 'fc-insight-row' },
      el('span', { class: 'fc-insight-ic', html: iconHtml('trending', { size: 16 }) }), el('span', { text: t })))),
    el('p', { class: 'fc-note', text: '登録済みデータからのルールベースの参考情報であり、将来の成果を保証・断定するものではありません。' }),
  );
}

// ---- 保存プラン（あとから比較） ----
function futurePlansCard(state, fs) {
  const secret = state.settings.secret;
  const plans = fs.plans || [];
  const rows = plans.length ? el('div', { class: 'fc-list' }, ...plans.map((p) => {
    const end = FS.project(state, { years: p.config.years, rateOverride: FS.scenarioRate(p.config) }).series.at(-1);
    return el('div', { class: 'fc-row tap', onclick: () => futurePlanDetail(p) },
      el('div', { class: 'fc-row-ic', html: iconHtml('database', { size: 18 }) }),
      el('div', { class: 'fc-row-main' },
        el('div', { class: 'fc-row-title', text: p.name }),
        el('div', { class: 'fc-row-sub', text: `${p.config.years}年・年${FS.scenarioRate(p.config).toFixed(1)}%目安` })),
      el('span', { class: 'fc-row-amt', text: secret ? '＊＊＊' : yen(end.total) }));
  })) : el('p', { class: 'fc-empty', text: '現在の設定をプランとして保存すると、あとから比較できます（例: 通常プラン・積立強化プラン・FIREプラン）。' });
  return card(sectionTitle('保存プラン', el('button', { class: 'fc-link', type: 'button', onclick: () => futurePlanSaveForm() },
    el('span', { class: 'fc-add-ic sm', html: iconHtml('plus', { size: 14 }) }), el('span', { text: '現在の設定を保存' }))), rows);
}
function futurePlanSaveForm() {
  const name = inputEl({ placeholder: '例）通常プラン / 積立強化プラン / FIREプラン' });
  modal('プランを保存', field('プラン名', name), {
    onSave: (close) => {
      if (!name.value.trim()) return toast('プラン名を入力してください', 'alert');
      S.update((s) => {
        s.futureSim.plans.push({
          id: uid('plan'), name: name.value.trim(), savedAt: today(),
          config: { years: s.futureSim.years, scenario: s.futureSim.scenario, customReturn: s.futureSim.customReturn, useOverride: s.futureSim.useOverride, monteCarlo: { ...s.futureSim.monteCarlo } },
        });
      });
      render(); toast('保存しました'); close();
    },
  });
}
function futurePlanDetail(p) {
  const body = el('div', {},
    el('div', { class: 'fc-kv' },
      kv('保有期間', `${p.config.years}年`), kv('想定年利', `年${FS.scenarioRate(p.config).toFixed(1)}%`),
      kv('銘柄ごとの年利を使用', p.config.useOverride === false ? 'はい' : 'いいえ（一律適用）'), kv('保存日', fmtDateLong(p.savedAt))),
    el('button', {
      class: 'fc-btn primary block', type: 'button', text: 'この設定を読み込む',
      onclick: () => {
        S.update((s) => { Object.assign(s.futureSim, { years: p.config.years, scenario: p.config.scenario, customReturn: p.config.customReturn, useOverride: p.config.useOverride, monteCarlo: { ...p.config.monteCarlo } }); });
        render(); toast('読み込みました');
        qs('.fc-modal-back')?.classList.remove('show'); setTimeout(() => qs('.fc-modal-back')?.remove(), 260);
      },
    }),
    el('button', {
      class: 'fc-btn danger block', type: 'button', text: 'このプランを削除',
      onclick: () => confirmDialog('プランを削除', `「${p.name}」を削除しますか？`, () => {
        S.update((s) => { s.futureSim.plans = s.futureSim.plans.filter((x) => x.id !== p.id); });
        render(); toast('削除しました', 'trash'); qs('.fc-modal-back')?.classList.remove('show'); setTimeout(() => qs('.fc-modal-back')?.remove(), 260);
      }),
    }),
  );
  modal(p.name, body, {});
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
  wrap.append(el('div', { class: 'fc-page-head' }, headTitle('カレンダー'), head));

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
    const base = isCard ? `毎月${r.day === 'end' ? '末' : r.day + '日'}・${cardName}払い` : `毎月${r.day === 'end' ? '末' : r.day + '日'}・${cat.name}`;
    const period = r.endDate ? `・〜${fmtDate(r.endDate).replace(/\(.\)/, '')}まで` : '';
    const sub = base + period;
    // 次回実行日（カード払いは次回引落日も）。登録日ではなく開始日＋発生日から算出済み。
    const run = r.nextRun ?? nextRecurringDate(r);
    const nextParts = [];
    if (run) nextParts.push(`次回実行日 ${fmtDate(run).replace(/\(.\)/, '')}`);
    const pay = isCard ? (r.nextSettlement ?? nextSettlementDate(r, S.findCard(r.cardId))) : null;
    if (pay) nextParts.push(`次回引落日 ${fmtDate(pay).replace(/\(.\)/, '')}`);
    const nextLine = nextParts.length ? el('div', { class: 'fc-row-sub fc-next-run', text: nextParts.join('・') }) : null;
    return el('div', { class: 'fc-row tap', onclick: () => recurringForm(r) },
      el('div', { class: 'fc-row-ic', style: `background:${cat.color}22;color:${cat.color}`, html: iconHtml(r.type === 'income' ? 'coins' : isCard ? 'card' : 'file', { size: 18 }) }),
      el('div', { class: 'fc-row-main' }, el('div', { class: 'fc-row-title', text: r.name }),
        el('div', { class: 'fc-row-sub', text: sub }), nextLine),
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
  let updatePreview = () => {}; // 次回実行日プレビュー（後で本体を差し替え）
  const methodSeg = el('div', { class: 'fc-seg' });
  const drawMethodSeg = () => { methodSeg.innerHTML = ''; for (const [v, l] of [['bank', '銀行口座'], ['card', 'クレジットカード']]) methodSeg.append(el('button', { class: 'fc-seg-btn' + (method === v ? ' on' : ''), type: 'button', text: l, onclick: () => { method = v; drawMethodSeg(); drawPay(); updatePreview(); } })); };
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
  const mkSegWithPay = () => { seg.innerHTML = ''; for (const [val, lab] of [['expense', '支出'], ['income', '収入']]) seg.append(el('button', { class: 'fc-seg-btn' + (type === val ? ' on' : ''), type: 'button', text: lab, onclick: () => { type = val; mkSegWithPay(); refreshCats(); drawPay(); updatePreview(); } })); };
  mkSegWithPay(); refreshCats(); drawPay();
  const startDate = inputEl({ type: 'date', value: r?.startDate || '' });
  const endDate = inputEl({ type: 'date', value: r?.endDate || '' });

  // 次回実行日・次回引落日のプレビュー（登録日ではなく開始日＋実行日から算出）。
  const schedulePreview = el('p', { class: 'fc-field-hint fc-sched-preview' });
  updatePreview = () => {
    const d = day.value === 'end' ? 'end' : Number(day.value);
    const item = { day: d, startDate: startDate.value || null, endDate: endDate.value || null };
    const run = nextRecurringDate(item);
    let txt = run ? `次回実行日：${fmtDateLong(run)}` : '終了日を過ぎているため実行予定はありません';
    if (type === 'expense' && method === 'card') {
      const card = st.cards.find((c) => c.id === cardSel.value);
      const pay = card ? nextSettlementDate(item, card) : null;
      if (pay) txt += `　次回引落日：${fmtDateLong(pay)}`;
    }
    schedulePreview.textContent = txt;
  };
  day.addEventListener('change', updatePreview);
  startDate.addEventListener('change', updatePreview);
  endDate.addEventListener('change', updatePreview);
  cardSel.addEventListener('change', updatePreview);
  updatePreview();

  const body = el('div', {}, field('種別', seg), field('名称', name), field('毎月の発生日', day), field('金額（円）', amount), catWrap, payWrap,
    optionalDateField('開始日（任意）', startDate), optionalDateField('終了日（任意）', endDate),
    schedulePreview,
    el('p', { class: 'fc-field-hint', text: '29〜31日・毎月末を選ぶと、その日が無い月（例：2月）は自動的にその月の最終日に処理されます。' }),
    el('p', { class: 'fc-field-hint', text: '開始日は「この日以降から有効」。最初の実行日は開始日以降で、設定した発生日に一致する最初の日になります（登録日・今日は使いません）。' }),
    el('p', { class: 'fc-field-hint', text: '終了日を設定すると、その日を過ぎた月は固定収支・損益・可処分資金・将来シミュレーションから除外されます。未設定は無期限です。' }),
    !isNew && el('button', { class: 'fc-btn danger block', type: 'button', text: '削除', onclick: () => confirmDialog('固定収支を削除', '削除しますか？', () => { S.update((s) => { s.recurring = s.recurring.filter((x) => x.id !== r.id); }); render(); toast('削除しました', 'trash'); qs('.fc-modal-back')?.remove(); }) }));
  modal(isNew ? '固定収支を追加' : '固定収支を編集', body, {
    onSave: (close) => {
      if (!name.value.trim() || !Number(amount.value)) return toast('名称と金額を入力してください', 'alert');
      if (startDate.value && endDate.value && endDate.value < startDate.value) return toast('終了日は開始日より後にしてください', 'alert');
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
        const rec = { type, name: name.value.trim(), day: day.value === 'end' ? 'end' : Number(day.value), amount: Number(amount.value), categoryId: catId, accountId, paymentMethod: type === 'expense' ? pm : 'bank', cardId, startDate: startDate.value || null, endDate: endDate.value || null };
        if (isNew) s.recurring.push({ id: uid('rec'), createdAt: today(), ...rec });
        else { const ex = s.recurring.find((x) => x.id === r.id); Object.assign(ex, rec); if (!ex.createdAt) ex.createdAt = today(); }
        S.materializeRecurringCardUsage(s);
        S.settleDueCards(s);
        S.computeRecurringSchedule(s); // 次回実行予定日・次回引落予定日を保存（編集時も再計算）
      });
      render(); toast('保存しました'); close();
    },
  });
}

// ============ カテゴリー管理 ============
function renderCategories() {
  const st = S.getState();
  const wrap = el('div', { class: 'fc-view' });
  wrap.append(headTitle('カテゴリー'));
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
  wrap.append(headTitle('データ管理'));
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
  return el('div', { class: 'fc-page-head' }, headTitle(title),
    onAdd ? el('button', { class: 'fc-add-btn', type: 'button', onclick: onAdd },
      el('span', { class: 'fc-add-ic', html: iconHtml('plus', { size: 16 }) }), el('span', { text: addLabel })) : '');
}
function monthNav(ymStr, onChange, title) {
  const [y, m] = ymStr.split('-').map(Number);
  const prev = () => onChange(ym(new Date(y, m - 2, 1)));
  const next = () => onChange(ym(new Date(y, m, 1)));
  return el('div', { class: 'fc-page-head' }, headTitle(title),
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
  // あわせて、日本時間23:00の積立処理を前回処理日から追いかけて実行（キャッチアップ）。
  S.update((s) => {
    S.materializeRecurringCardUsage(s);
    const changed = S.settleDueCards(s);
    const accrued = Sec.runAccumulations(s);
    Sec.recomputeAll(s);
    S.computeRecurringSchedule(s); // 次回実行予定日・次回引落予定日を最新化（日付が進んでも正しく表示）
    if (changed || accrued) S.recordAssetSnapshot(s);
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
