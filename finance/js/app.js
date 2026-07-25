// app.js — ルーティング・画面描画・フォーム・操作の統合レイヤー
import * as S from './store.js?v=20260725a';
import * as C from './calc.js?v=20260725a';
import * as CF from './cashflow.js?v=20260725a';
import * as Sec from './securities.js?v=20260725a';
import * as FS from './futureSim.js?v=20260725a';
import * as IS from './idealSim.js?v=20260725a';
import * as Perf from './performance.js?v=20260725a';
import { lineChart, barChart, groupedBarChart, donutChart, multiLineChart, fanChart, perfChart, perfDeltaChart } from './charts.js?v=20260725a';
import { iconHtml, icon } from './icons.js?v=20260725a';
import {
  el, qs, qsa, yen, yenMasked, num, today, toISO, parseISO, ym, fmtDate, fmtDateLong,
  fmtMonth, addMonths, resolveDay, pad, weekdayName, haptic, escapeHtml, uid,
} from './utils.js?v=20260725a';
import { nextRecurringDate, nextSettlementDate, isMonthEndDay } from './recurrence.js?v=20260725a';

// ---- 画面ローカル状態（データではないUI状態） ----
const ui = {
  route: 'dashboard',
  simMonths: 12,           // 将来シミュレーションの表示期間
  simTab: 'cashflow',      // 「将来」タブ内の切替: 'cashflow'(収支) | 'invest'(投資将来予測)
  investTab: 'overview',   // 投資将来予測の3タブ: 'overview'(概要) | 'simulation' | 'detail'(詳細設定)
  futureCheckDate: null,   // 投資予測: 資産推移を確認する日付
  futureCompare: false,    // 投資予測: シナリオ比較を表示するか
  futureDailyOverride: null, // 投資予測: 毎日の積立額の仮変更(円/日、nullで実設定のまま)
  simDetailOpen: new Set(), // 投資予測シミュレーション: 折りたたみセクションの開閉状態(再描画で維持)
  simCheckDate: null,      // 投資シミュレーション: 日付別詳細を確認する日付
  planChartVisible: { valuation: true, principal: true, secCash: false, cumDeposit: false, profit: false, requiredExtra: false }, // 将来資産グラフの表示系列
  simDetailIndex: null,    // 投資シミュレーション: 長押しで選択中のグラフ位置（サンプルindex）
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
const navStack = []; // アプリ内ナビゲーション履歴（画面遷移の実体はこの配列で管理）
const scrollTop = () => window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

// 画面遷移をブラウザ履歴へ積む。ページ全体のURLは分割せず、状態としてルートを持つ。
function pushRoute(route) { try { history.pushState({ fcRoute: route }, ''); } catch {} }

function go(route) {
  const same = route === ui.route;
  // 同じ画面は履歴（navStack・ブラウザ履歴）へ連続して積まない
  if (!same) { navStack.push(ui.route); if (navStack.length > 30) navStack.shift(); }
  ui.route = route;
  haptic();
  render();
  scrollTop();
  if (!same) pushRoute(route); // 下部ナビ・画面内リンクのいずれもブラウザ履歴に追加
}

// 1つ前の画面へ戻る。ブラウザ履歴と連携するため history.back() 経由（popstate で処理）。
function goBack() { history.back(); }

// ブラウザバック / iPhoneのスワイプバックを受け取る。
// モーダル表示中は画面遷移せず、まずモーダルを閉じる。それ以外はアプリ内の前画面へ戻す。
function handlePopState() {
  if (_openModals.size) {
    closeAllModals();
    pushRoute(ui.route); // 消費した履歴を復元し、画面自体は変えない
    return;
  }
  const prev = navStack.pop();
  ui.route = prev || 'dashboard'; // 履歴が無ければホームへ
  haptic();
  render();
  scrollTop();
}

function render() {
  closeSimDetailSheet(); // 再描画で古いグラフ長押しシートが残らないよう閉じる
  const fn = ROUTES[ui.route] || renderDashboard;
  const node = fn();
  const v = app();
  v.innerHTML = '';
  v.append(node);
  enhanceTapAccessibility(v);
  v.classList.remove('fc-fade'); void v.offsetWidth; v.classList.add('fc-fade');
  updateNav();
}

// タップ可能な div（.tap など）を、キーボードでも操作できるよう role/tabindex/aria-label を補う。
// Enter/Space の発火はグローバル keydown ハンドラで処理する。デザインは変更しない。
function enhanceTapAccessibility(root) {
  for (const elm of root.querySelectorAll('.tap, .fc-dg-head')) {
    if (elm.tagName === 'BUTTON') continue;
    if (!elm.getAttribute('role')) elm.setAttribute('role', 'button');
    if (elm.getAttribute('tabindex') == null) elm.setAttribute('tabindex', '0');
    if (!elm.getAttribute('aria-label')) {
      const title = elm.querySelector('.fc-row-title, .fc-dg-date, .fc-menu-title');
      const label = title?.textContent?.trim();
      if (label) elm.setAttribute('aria-label', label);
    }
  }
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
// 開いているモーダルの close ハンドラ集合。直接 remove() する旧処理を廃止し、
// 常にここ経由で閉じることで unlockBodyScroll と _modalCount の整合を保つ。
const _openModals = new Set();
// すべての開いているモーダル（ネストした確認ダイアログ含む）を安全に閉じる。
// スクロール固定の解除・元位置への復帰・カウンタ更新を必ず通す（iOS/PWA/通常ブラウザ共通）。
function closeAllModals() { [..._openModals].forEach((m) => m.close()); }

function modal(title, bodyNode, { onSave, saveLabel = '保存', danger, wide, dirty, saveDisabled } = {}) {
  const back = el('div', { class: 'fc-modal-back' });
  let closed = false;
  const closeAll = () => {
    if (closed) return; closed = true;
    _openModals.delete(api); // レジストリから除去
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
  // 下方向スワイプで閉じる（iPhoneのシートUI風）。他の下部シート型モーダルにも共通で効く。
  enableSheetSwipeClose(sheet, { dirty, closeAll, attemptClose });
  lockBodyScroll();
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('show'));
  const api = {
    close: closeAll,
    saveBtn,
    setSaveDisabled: (d) => { if (saveBtn) saveBtn.disabled = !!d; },
  };
  _openModals.add(api); // レジストリへ登録（一括クローズ・ブラウザバック連携で使用）
  return api;
}

// 下からせり上がるシート型モーダル共通の「下スワイプで閉じる」挙動。
// 実装方針（要件どおり）:
//  - 開始位置を記録し、下方向ドラッグ中は translateY で指に追従させる
//  - グリップ／ヘッダーからのドラッグは常に有効。本文からは scrollTop<=0 のときだけ有効
//    にして、モーダル内部の縦スクロールを邪魔しない
//  - 指を離したとき、一定距離（画面比）または一定速度を超えていれば閉じ、
//    未満なら元の位置へスッと戻す
//  - 背景スクロール固定（body position:fixed）とは独立して動くため競合しない
// これは modal() 以外の下部シートでも再利用できるよう独立関数にしている。
function enableSheetSwipeClose(sheet, { dirty, closeAll, attemptClose }) {
  const grip = sheet.querySelector('.fc-modal-grip');
  const head = sheet.querySelector('.fc-modal-head');
  let startY = 0, lastY = 0, startScroll = 0, startTime = 0, fromHandle = false, dragging = false, decided = false;

  const reset = () => { sheet.style.transition = ''; sheet.style.transform = ''; };

  const onStart = (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    startY = lastY = t.clientY;
    startScroll = sheet.scrollTop;
    startTime = Date.now();
    fromHandle = (grip && grip.contains(e.target)) || (head && head.contains(e.target));
    dragging = false; decided = false;
  };

  const onMove = (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const dy = t.clientY - startY;
    lastY = t.clientY;
    if (!decided) {
      // 下方向へ引き始め、かつ「グリップ／ヘッダー」または「本文が最上部」ならドラッグ開始。
      if (dy > 4 && (fromHandle || startScroll <= 0)) { decided = true; dragging = true; sheet.style.transition = 'none'; }
      else if (Math.abs(dy) > 4) { decided = true; dragging = false; } // それ以外は内部スクロールへ委ねる
      else return;
    }
    if (!dragging) return;
    const offset = Math.max(0, dy); // 下方向のみ追従。上へ戻したら0でクランプ。
    sheet.style.transform = `translateY(${offset}px)`;
    e.preventDefault(); // ドラッグ中は背景・内部スクロールを抑止
  };

  const finish = () => {
    if (!dragging) { decided = false; return; }
    dragging = false; decided = false;
    const dy = Math.max(0, lastY - startY);
    const dt = Math.max(1, Date.now() - startTime);
    const velocity = dy / dt; // px/ms
    const threshold = Math.min(140, (sheet.offsetHeight || 400) * 0.28);
    if (dy > threshold || velocity > 0.6) {
      // 閾値超え → 閉じる。未保存があれば元位置へ戻してから破棄確認（×ボタンと同じ挙動）。
      if (dirty && dirty()) { reset(); attemptClose(); }
      else {
        sheet.style.transition = 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)';
        sheet.style.transform = 'translateY(100%)';
        closeAll();
      }
    } else {
      reset(); // 閾値未満 → 元位置へスッと戻す
    }
  };

  sheet.addEventListener('touchstart', onStart, { passive: true });
  sheet.addEventListener('touchmove', onMove, { passive: false });
  sheet.addEventListener('touchend', finish);
  sheet.addEventListener('touchcancel', () => { dragging = false; decided = false; reset(); });
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
// opts.allowNegative: マイナス入力を許可する（残高・将来イベントなど）。既定は不可。
function amountInput(initial, { allowNegative = false } = {}) {
  const n = Number(initial);
  const has = initial != null && initial !== '' && !Number.isNaN(n);
  const inp = inputEl({ type: 'text', inputmode: 'numeric', autocomplete: 'off',
    placeholder: '0', value: has ? n.toLocaleString('ja-JP') : '' });
  if (allowNegative) inp.dataset.allowNeg = '1';
  inp.addEventListener('input', () => {
    const neg = allowNegative && /-/.test(inp.value); // マイナス符号の有無（許可時のみ）
    const digits = inp.value.replace(/[^\d]/g, '');
    inp.value = (digits ? (neg ? '-' : '') + Number(digits).toLocaleString('ja-JP') : (neg ? '-' : ''));
  });
  return inp;
}
// 入力欄の円整数を読む。マイナス許可欄では先頭の符号を反映する。
const amountValue = (inp) => {
  const neg = inp.dataset?.allowNeg === '1' && /-/.test(inp.value);
  const v = Number(String(inp.value).replace(/[^\d]/g, '')) || 0;
  return neg ? -v : v;
};

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

  // バックアップの控えめな案内: 口座があり、未実施 or 30日以上経過のときのみ表示。
  const days = daysSinceBackup(st);
  if (st.accounts.length >= 1 && (days == null || days >= 30)) {
    wrap.append(el('div', { class: 'fc-backup-nudge' },
      el('span', { class: 'fc-backup-nudge-txt', text: '大切な資産データを保護するため、バックアップを作成してください。' }),
      el('button', { class: 'fc-btn ghost sm', type: 'button', text: 'バックアップを作成', onclick: exportBackup })));
  }

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
  // 円入力は3桁区切り表示に統一。残高はマイナス（当座借越等）も許可する。
  const bal = amountInput(acc?.balance, { allowNegative: true });
  // 証券口座は「残高」ではなく 現金 を管理（元本＝取得額合計、評価額は保有銘柄から自動計算）
  const cash = amountInput(acc?.cash);
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
      onclick: () => accountDeleteFlow(acc), // 関連データを確認してから削除・移行
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
            Object.assign(rec, { cash: amountValue(cash), holdings: [], accumulations: [], accumHistory: [], purchases: [], lastAccumDate: null, balance: 0 });
            Sec.recomputeAccount(rec);
          } else rec.balance = amountValue(bal);
          s.accounts.push(rec);
        } else {
          const a = s.accounts.find((x) => x.id === acc.id);
          a.name = name.value.trim(); a.type = type.value; a.includeInDisposable = include;
          if (isSec) {
            a.cash = amountValue(cash);
            a.holdings ||= []; a.accumulations ||= []; a.accumHistory ||= []; a.purchases ||= [];
            Sec.recomputeAccount(a);
          } else a.balance = amountValue(bal);
        }
        S.recordAssetSnapshot(s);
      });
      render(); toast('保存しました'); close();
    },
  });
}

// 口座に紐付く関連データ件数を数える（削除前の確認・移行に使用）。
function accountUsage(st, accId) {
  const tx = st.transactions.filter((t) => t.accountId === accId).length;
  const transfers = st.transfers.filter((t) => t.fromAccountId === accId || t.toAccountId === accId).length;
  const recurring = st.recurring.filter((r) => r.accountId === accId).length;
  const recTransfers = st.recurringTransfers.filter((r) => r.fromAccountId === accId || r.toAccountId === accId).length;
  const cards = st.cards.filter((c) => c.payAccountId === accId).length;
  return { tx, transfers, recurring, recTransfers, cards, total: tx + transfers + recurring + recTransfers + cards };
}

// 口座削除の入口。関連データが無ければ通常確認、あれば移行/削除の選択肢を提示する。
function accountDeleteFlow(acc) {
  const st = S.getState();
  const u = accountUsage(st, acc.id);
  if (u.total === 0) {
    confirmDialog('口座を削除', `「${acc.name}」を削除しますか？`, () => {
      S.update((s) => { s.accounts = s.accounts.filter((x) => x.id !== acc.id); S.recordAssetSnapshot(s); });
      render(); toast('削除しました', 'trash'); closeAllModals();
    });
    return;
  }
  accountDeleteOptions(acc, u);
}

// 関連データがある口座の削除確認（移行 / 関連データごと削除 / キャンセル）。
function accountDeleteOptions(acc, u) {
  const st = S.getState();
  const others = st.accounts.filter((a) => a.id !== acc.id);

  // 移行: 参照先の口座IDを一括で付け替える。既定では残高を加算しない（二重計上防止）。
  const doMigrate = (targetId, mergeBalance) => {
    S.update((s) => {
      const del = s.accounts.find((a) => a.id === acc.id);
      const target = s.accounts.find((a) => a.id === targetId);
      for (const t of s.transactions) if (t.accountId === acc.id) t.accountId = targetId;
      for (const r of s.recurring) if (r.accountId === acc.id) r.accountId = targetId;
      for (const t of s.transfers) { if (t.fromAccountId === acc.id) t.fromAccountId = targetId; if (t.toAccountId === acc.id) t.toAccountId = targetId; }
      for (const r of s.recurringTransfers) { if (r.fromAccountId === acc.id) r.fromAccountId = targetId; if (r.toAccountId === acc.id) r.toAccountId = targetId; }
      for (const c of s.cards) if (c.payAccountId === acc.id) c.payAccountId = targetId;
      // 残高は「統合する」を選んだ場合のみ削除口座の残高を移行先へ加算する。
      if (mergeBalance) adjustBalance(target, Number(del.balance) || 0);
      // 移行により振替元＝振替先となった自己振替を除去（実効ゼロの履歴を残さない）。
      s.transfers = s.transfers.filter((t) => t.fromAccountId !== t.toAccountId);
      s.recurringTransfers = s.recurringTransfers.filter((t) => t.fromAccountId !== t.toAccountId);
      s.accounts = s.accounts.filter((a) => a.id !== acc.id);
      S.recordAssetSnapshot(s);
    });
    render(); toast('移行して削除しました', 'trash'); closeAllModals();
  };

  // 関連データごと削除: 口座に紐付く履歴・設定・カード（と利用履歴）をすべて削除する。
  const doDeleteWithData = () => {
    S.update((s) => {
      const cardIds = s.cards.filter((c) => c.payAccountId === acc.id).map((c) => c.id);
      s.transactions = s.transactions.filter((t) => t.accountId !== acc.id);
      s.recurring = s.recurring.filter((r) => r.accountId !== acc.id);
      s.transfers = s.transfers.filter((t) => t.fromAccountId !== acc.id && t.toAccountId !== acc.id);
      s.recurringTransfers = s.recurringTransfers.filter((t) => t.fromAccountId !== acc.id && t.toAccountId !== acc.id);
      s.cards = s.cards.filter((c) => c.payAccountId !== acc.id);
      s.cardTransactions = s.cardTransactions.filter((t) => !cardIds.includes(t.cardId));
      s.accounts = s.accounts.filter((a) => a.id !== acc.id);
      S.recordAssetSnapshot(s);
    });
    render(); toast('口座と関連データを削除しました', 'trash'); closeAllModals();
  };

  const body = el('div', {});
  body.append(el('p', { class: 'fc-field-hint', text: `「${acc.name}」は以下のデータで使用されています。` }));
  const lines = [];
  const addLine = (label, n) => { if (n > 0) lines.push(el('div', { class: 'fc-kv-row' }, el('span', { text: label }), el('b', { text: `${n}件` }))); };
  addLine('取引履歴', u.tx); addLine('振替履歴', u.transfers); addLine('固定収支', u.recurring);
  addLine('固定振替', u.recTransfers); addLine('カード引落口座', u.cards);
  body.append(el('div', { class: 'fc-kv' }, ...lines));

  // 選択肢1: 別の口座へ移行する
  if (others.length) {
    const target = selectEl(others.map((a) => ({ value: a.id, label: a.name })), others[0].id);
    let mergeBalance = false;
    const mergeRow = el('div', { class: 'fc-field-toggle' });
    const drawMerge = () => {
      mergeRow.innerHTML = '';
      mergeRow.append(
        el('div', {}, el('div', { class: 'fc-field-lab', text: '残高も統合する' }),
          el('div', { class: 'fc-field-hint', text: mergeBalance
            ? `削除する口座の残高（${yen(Number(acc.balance) || 0)}）を移行先へ加算します。`
            : '履歴の参照先のみ移し、残高は加算しません（二重計上を防ぎます）。' })),
        toggle(mergeBalance, () => { mergeBalance = !mergeBalance; drawMerge(); }));
    };
    drawMerge();
    body.append(el('div', { class: 'fc-optblock' },
      el('h3', { class: 'fc-subhead', text: '別の口座へ移行する' }),
      field('移行先口座', target), mergeRow,
      el('button', { class: 'fc-btn primary block', type: 'button', text: '移行して口座を削除', onclick: () => doMigrate(target.value, mergeBalance) })));
  }

  // 選択肢2: 関連データも削除する（強い確認）
  body.append(el('div', { class: 'fc-optblock' },
    el('h3', { class: 'fc-subhead', text: '関連データも削除する' }),
    el('p', { class: 'fc-field-hint', text: '取引履歴・振替・固定収支・カードなど、この口座に紐付くデータもすべて削除します。' }),
    el('button', {
      class: 'fc-btn danger block', type: 'button', text: '関連データごと削除する',
      onclick: () => confirmDialog('本当に削除しますか？',
        'この操作では口座だけでなく、関連する取引履歴や設定も削除されます。この操作は元に戻せません。',
        doDeleteWithData, { yesLabel: '口座と関連データを削除する' }),
    })));

  // 選択肢3: キャンセル（モーダル既定の「キャンセル」ボタンで何も変更せず閉じる）
  modal('口座の削除', body, {});
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
  const accums = (acc.accumulations || []).slice()
    .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || '')); // 期間を時系列で一覧表示
  const frameOf = (holdingId) => { const h = Sec.accountHoldings(acc).find((x) => x.id === holdingId); return h ? Sec.nisaLabel(h.nisaFrame || 'growth') : ''; };
  const history = (acc.accumHistory || []).slice().sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)).slice(0, 12);
  const setRows = accums.length ? el('div', { class: 'fc-list' }, ...accums.map((a) => {
    const h = Sec.accountHoldings(acc).find((x) => x.id === a.holdingId);
    const range = `${a.startDate ? fmtDate(a.startDate).replace(/\(.\)/, '') : '開始日未設定'}${a.endDate ? '〜' + fmtDate(a.endDate).replace(/\(.\)/, '') : '〜'}`;
    const freqLabel = { daily: '毎日', weekly: '毎週', monthly: '毎月' }[a.frequency || 'daily'];
    const amt = a.frequency === 'monthly' ? a.monthlyAmount : a.dailyAmount;
    const holInfo = a.includeHolidays === false ? (a.nonBusinessDay === 'carryover' ? '土日祝は翌営業日' : '土日祝は除く') : '土日祝も実行';
    const td = today();
    const paused = !!(a.pauseStart && a.pauseStart <= td && (!a.pauseEnd || a.pauseEnd >= td));
    return el('div', { class: 'fc-row tap', onclick: () => accumulationForm(acc, a) },
      el('div', { class: 'fc-row-ic', html: iconHtml('repeat', { size: 18 }) }),
      el('div', { class: 'fc-row-main' },
        el('div', { class: 'fc-row-title' },
          el('span', { text: h ? h.name : '（対象銘柄なし）' }),
          h ? el('span', { class: 'fc-frame-tag', text: frameOf(a.holdingId) }) : ''),
        el('div', { class: 'fc-row-sub', text: `${freqLabel} ${yen(amt)}・${range}` }),
        el('div', { class: 'fc-row-sub', text: `${holInfo}${paused ? '・一時停止中' : ''}` })),
      el('span', { class: 'fc-accum-state ' + (a.enabled !== false && !paused ? 'on' : 'off'), text: a.enabled !== false ? (paused ? '停止中' : 'ON') : 'OFF' }));
  })) : el('p', { class: 'fc-empty', text: 'インデックスの積立を登録できます（日本時間23:00に自動実行）。' });

  const histRows = history.length ? el('div', { class: 'fc-list' }, ...history.map((h) =>
    el('div', { class: 'fc-row' },
      el('div', { class: 'fc-row-main' },
        el('div', { class: 'fc-row-title' },
          el('span', { text: h.holdingName || '積立' }),
          frameOf(h.holdingId) ? el('span', { class: 'fc-frame-tag', text: frameOf(h.holdingId) }) : ''),
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
  const cost = amountInput(h?.cost);   // 取得額（円・3桁区切り）
  const value = amountInput(h?.value); // 評価額（円・3桁区切り）
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
        render(); toast('削除しました', 'trash'); closeAllModals();
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
            kind: 'index', name: name.value.trim(), nisaFrame: nisaSel.value, cost: amountValue(cost), value: amountValue(value), memo: memo.value.trim(),
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

// 「株価を更新」= 現在株価(USD)・インデックスの現在保有額(円)を手入力する画面（API取得ではない）。
// 保存で評価額・損益・損益率・保有割合が即時再計算。個別株とインデックス（成長投資枠／つみたて投資枠）を分けて入力できる。
function priceUpdateForm(acc) {
  const stocks = Sec.accountHoldings(acc).filter(Sec.isStock);
  const indexes = Sec.accountHoldings(acc).filter(Sec.isIndex);
  if (!stocks.length && !indexes.length) {
    modal('株価を更新', el('p', { class: 'fc-empty', text: '保有銘柄が登録されていません。「銘柄を追加」から登録してください。' }), {});
    return;
  }
  const rows = [];
  const sections = [];
  const groupHead = (badgeClass, label, count) => el('div', { class: 'fc-holding-grouphead' },
    el('span', { class: 'fc-kind-badge ' + badgeClass, text: label }),
    el('span', { class: 'fc-holding-groupn', text: `${count}銘柄` }));

  // 個別株（米国株・USD）: 現在株価(USD)・ドル円
  if (stocks.length) {
    sections.push(groupHead('stock', '個別株（米国株）', stocks.length));
    for (const h of stocks) {
      const priceInp = inputEl({ type: 'number', inputmode: 'decimal', placeholder: '0.00', value: h.priceUsd ?? '' });
      const fxInp = inputEl({ type: 'number', inputmode: 'decimal', placeholder: '例）157.5', value: h.fxRate ?? '' });
      rows.push({ h, kind: 'stock', priceInp, fxInp });
      sections.push(el('div', { class: 'fc-priceupd-row' },
        el('div', { class: 'fc-priceupd-head' },
          el('span', { class: 'fc-holding-name', text: h.name }),
          h.ticker ? el('span', { class: 'fc-holding-ticker', text: h.ticker }) : ''),
        el('div', { class: 'fc-priceupd-inputs' },
          field('現在株価（USD）', priceInp), field('ドル円', fxInp))));
    }
  }

  // インデックス（円建て）: 現在保有額(円)。成長投資枠／つみたて投資枠で分けて表示。
  for (const frame of Sec.NISA_FRAMES) {
    const items = indexes.filter((h) => (h.nisaFrame || 'growth') === frame.value);
    if (!items.length) continue;
    sections.push(groupHead('index', frame.label, items.length));
    for (const h of items) {
      const valueInp = amountInput(h.value); // 現在保有額（円・3桁区切り）
      rows.push({ h, kind: 'index', valueInp });
      sections.push(el('div', { class: 'fc-priceupd-row' },
        el('div', { class: 'fc-priceupd-head' },
          el('span', { class: 'fc-holding-name', text: h.name })),
        field('現在保有額（円）', valueInp)));
    }
  }

  const body = el('div', {},
    el('p', { class: 'fc-field-hint', text: '個別株は現在株価（USD）とドル円、インデックスは現在保有額（円）を入力して保存すると、評価額・損益・損益率・保有割合が即時に再計算されます。' }),
    ...sections);
  modal('保有状況を更新（現在の株価・保有額を入力）', body, {
    onSave: (close) => {
      S.update((s) => {
        const a = s.accounts.find((x) => x.id === acc.id);
        for (const r of rows) {
          const hh = a.holdings.find((x) => x.id === r.h.id);
          if (!hh) continue;
          if (r.kind === 'stock') {
            if (r.priceInp.value !== '') hh.priceUsd = Number(r.priceInp.value) || 0;
            if (r.fxInp.value !== '') hh.fxRate = Number(r.fxInp.value) || 0;
          } else if (r.valueInp.value !== '') {
            hh.value = amountValue(r.valueInp);
          }
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
  // 同じ銘柄でも投資枠が違えば別銘柄として管理するため、ファンド名に投資枠を併記する。
  const sel = selectEl(indexHoldings.map((h) => ({ value: h.id, label: `${h.name}（${Sec.nisaLabel(h.nisaFrame || 'growth')}）` })), a?.holdingId || indexHoldings[0].id);
  let freq = a?.frequency || 'daily';
  const freqSeg = el('div', { class: 'fc-seg' });
  const amount = amountInput(a?.dailyAmount);          // 毎日の積立額（円・3桁区切り）
  const monthlyAmount = amountInput(a?.monthlyAmount); // 毎月の積立額（円・3桁区切り）
  const startDate = inputEl({ type: 'date', value: a?.startDate || today() });
  const endDate = inputEl({ type: 'date', value: a?.endDate || '' });
  const pauseStart = inputEl({ type: 'date', value: a?.pauseStart || '' });
  const pauseEnd = inputEl({ type: 'date', value: a?.pauseEnd || '' });
  let enabled = a ? a.enabled !== false : true;
  const enRow = el('div', { class: 'fc-field-toggle' });
  const drawEn = () => { enRow.innerHTML = ''; enRow.append(el('div', {}, el('div', { class: 'fc-field-lab', text: '積立 ON/OFF' }), el('div', { class: 'fc-field-hint', text: 'ONの設定のみ実行されます（実際の自動積立は日本時間23:00に処理されます）' })), toggle(enabled, () => { enabled = !enabled; drawEn(); })); };
  drawEn();

  // 土日祝日の実行設定（新規は既定OFF＝土日祝日は積立しない。既存は保存値を尊重）。
  let includeHolidays = a ? a.includeHolidays !== false : false;
  let nonBiz = a?.nonBusinessDay || 'skip';
  const holRow = el('div', { class: 'fc-field-toggle' });
  const nonBizSeg = el('div', { class: 'fc-seg' });
  const nonBizWrap = el('div', {});
  const drawNonBizSeg = () => {
    nonBizSeg.innerHTML = '';
    for (const [v, l] of [['skip', 'スキップ'], ['carryover', '翌営業日に繰り越す']])
      nonBizSeg.append(el('button', { class: 'fc-seg-btn' + (nonBiz === v ? ' on' : ''), type: 'button', text: l, onclick: () => { nonBiz = v; drawNonBizSeg(); } }));
  };
  const drawNonBizWrap = () => {
    nonBizWrap.innerHTML = '';
    if (!includeHolidays) nonBizWrap.append(field('非営業日（土日祝日）の扱い', nonBizSeg));
  };
  const drawHol = () => {
    holRow.innerHTML = '';
    holRow.append(el('div', {}, el('div', { class: 'fc-field-lab', text: '土日祝日も積立を実行する' }),
      el('div', { class: 'fc-field-hint', text: 'OFFにすると土曜・日曜・日本の祝日（年末年始を含む）は積立しません' })),
      toggle(includeHolidays, () => { includeHolidays = !includeHolidays; drawHol(); drawNonBizWrap(); }));
  };
  drawNonBizSeg(); drawHol(); drawNonBizWrap();

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
    field('適用開始日', startDate), optionalDateField('適用終了日（任意）', endDate),
    holRow, nonBizWrap,
    optionalDateField('積立停止日（任意）', pauseStart), optionalDateField('積立再開日（任意）', pauseEnd),
    el('p', { class: 'fc-field-hint', text: '積立停止日〜積立再開日の間は積立を一時停止します（積立再開日を空欄にすると停止日以降ずっと停止します）。' }),
    el('p', { class: 'fc-field-hint', text: '同じ銘柄で期間を分けて登録すると、期間ごとに積立金額を変更できます（期間の重複はできません）。' }),
    enRow,
    !isNew && el('button', {
      class: 'fc-btn danger block', type: 'button', text: 'この積立設定を削除',
      onclick: () => confirmDialog('積立設定を削除', '削除しますか？', () => {
        S.update((s) => { const ac = s.accounts.find((x) => x.id === acc.id); ac.accumulations = ac.accumulations.filter((x) => x.id !== a.id); });
        render(); toast('削除しました', 'trash'); closeAllModals();
      }),
    }),
  );
  modal(isNew ? '積立設定を追加' : '積立設定を編集', body, {
    onSave: (close) => {
      const amt = freq === 'monthly' ? amountValue(monthlyAmount) : amountValue(amount);
      if (!amt || amt <= 0) return toast('積立金額を入力してください', 'alert');
      if (startDate.value && endDate.value && endDate.value < startDate.value) return toast('終了日は開始日より後にしてください', 'alert');
      if (pauseStart.value && pauseEnd.value && pauseEnd.value < pauseStart.value) return toast('積立再開日は積立停止日より後にしてください', 'alert');
      // 同じ銘柄で日付範囲が重複する積立設定を禁止（期間ごとに1つ）。空欄は無期限とみなす。
      const s0 = startDate.value || '0000-01-01', e0 = endDate.value || '9999-12-31';
      const overlap = (acc.accumulations || []).some((x) => {
        if (x.id === a?.id || x.holdingId !== sel.value) return false;
        const s1 = x.startDate || '0000-01-01', e1 = x.endDate || '9999-12-31';
        return s0 <= e1 && s1 <= e0; // 期間が重なる
      });
      if (overlap) return toast('同じ銘柄で期間が重複する積立設定があります', 'alert');
      S.update((s) => {
        const ac = s.accounts.find((x) => x.id === acc.id);
        const rec = {
          holdingId: sel.value, frequency: freq,
          dailyAmount: freq === 'monthly' ? amountValue(amount) : amt,
          monthlyAmount: freq === 'monthly' ? amt : amountValue(monthlyAmount),
          startDate: startDate.value || null, endDate: endDate.value || null,
          pauseStart: pauseStart.value || null, pauseEnd: pauseEnd.value || null,
          includeHolidays, nonBusinessDay: nonBiz,
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
        closeAllModals();
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
  const amount = amountInput(rt?.amount); // 固定振替金額（円・3桁区切り）
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
        render(); toast('削除しました', 'trash'); closeAllModals();
      }),
    }),
  );
  modal(isNew ? '固定振替を追加' : '固定振替を編集', body, {
    onSave: (close) => {
      const amt = amountValue(amount);
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
  const amount = amountInput(tr.amount); // 振替金額（円・3桁区切り）
  const date = inputEl({ type: 'date', value: tr.date });
  const memo = inputEl({ placeholder: 'メモ（任意）', value: tr.memo || '' });
  const body = el('div', {},
    field('振替元口座', fromSel), field('振替先口座', toSel), field('金額（円）', amount), field('日付', date), field('メモ', memo),
    el('button', {
      class: 'fc-btn danger block', type: 'button', text: 'この振替を削除',
      onclick: () => confirmDialog('振替を削除', '削除して口座残高を元に戻しますか？', () => {
        S.update((s) => { reverseTransfer(s, tr.fromAccountId, tr.toAccountId, tr.amount); s.transfers = s.transfers.filter((x) => x.id !== tr.id); S.recordAssetSnapshot(s); });
        render(); toast('削除しました', 'trash'); closeAllModals();
      }),
    }),
  );
  modal('振替を編集', body, {
    onSave: (close) => {
      const amt = amountValue(amount);
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
  const estBill = amountInput(c?.estimatedBill); // 請求予定額（円・3桁区切り・任意）
  const body = el('div', {},
    field('カード名', name), field('締日', closing),
    field('引落タイミング', offset), field('引落日', payDay), field('引落口座', acc), field('カラー', color),
    field('今回の請求予定額（任意）', estBill),
    !isNew && el('button', {
      class: 'fc-btn danger block', type: 'button', text: 'このカードを削除',
      onclick: () => confirmDialog('カードを削除', `「${c.name}」と利用履歴を削除しますか？`, () => {
        S.update((s) => { s.cards = s.cards.filter((x) => x.id !== c.id); s.cardTransactions = s.cardTransactions.filter((x) => x.cardId !== c.id); });
        render(); toast('削除しました', 'trash');
        closeAllModals();
      }),
    }),
  );
  modal(isNew ? 'カードを追加' : 'カード設定', body, {
    onSave: (close) => {
      if (!name.value.trim()) return toast('カード名を入力してください', 'alert');
      const cd = closing.value === 'end' ? 'end' : Number(closing.value);
      const pd = payDay.value === 'end' ? 'end' : Number(payDay.value);
      S.update((s) => {
        const rec = { name: name.value.trim(), closingDay: cd, payMonthOffset: Number(offset.value), payDay: pd, payAccountId: acc.value, color: color.value, estimatedBill: estBill.value.trim() === '' ? null : amountValue(estBill) };
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
  const amount = amountInput(tx?.amount); // カード利用額（円・3桁区切り）
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
        closeAllModals();
      }),
    }),
  );
  modal(isNew ? `${cardObj.name}・利用登録` : 'カード利用を編集', body, {
    onSave: (close) => {
      const amt = amountValue(amount);
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

// ============ 投資実績グラフ（実績＋将来予測の連結表示） ============
// 過去の実績（保存済みの評価額履歴）を実線、今日以降の予測を破線で1本の軸に連続表示する。
// 対象（全体/NISA/個別株）・期間・表示系列をその場で切り替えられ、タップで日別詳細を表示する。
function futurePerformanceCard(state, fs) {
  const perf = fs.perf;
  const secret = state.settings.secret;

  // 予測はWhat-If（積立変更）とは独立に、登録済み設定のみから計算する
  const forecast = perf.forecast !== false;
  const proj = forecast ? FS.project(state, { years: fs.years }) : null;
  const view = Perf.buildPerfView(state, proj);

  // --- 対象タブ（全体 / NISA / 個別株） ---
  const tabSeg = el('div', { class: 'fc-seg' });
  for (const t of Perf.PERF_TARGETS)
    tabSeg.append(el('button', {
      class: 'fc-seg-btn' + (perf.target === t.key ? ' on' : ''), type: 'button', text: t.label,
      onclick: () => { S.update((s) => { s.futureSim.perf.target = t.key; }); render(); },
    }));

  // --- 期間切替（1週間〜全期間） ---
  const periodSeg = el('div', { class: 'fc-period' });
  for (const p of Perf.PERF_PERIODS)
    periodSeg.append(el('button', {
      class: 'fc-period-btn' + (perf.period === p.key ? ' on' : ''), type: 'button', text: p.label,
      onclick: () => { S.update((s) => { s.futureSim.perf.period = p.key; }); render(); },
    }));

  // --- 表示切替（資産全体＝折れ線 / 日々の変動＝棒） ---
  const mode = perf.chartMode === 'daily' ? 'daily' : 'assets';
  const modeSeg = el('div', { class: 'fc-seg fc-perf-modeseg' });
  for (const m of [{ key: 'assets', label: '資産全体' }, { key: 'daily', label: '日々の変動' }])
    modeSeg.append(el('button', {
      class: 'fc-seg-btn' + (mode === m.key ? ' on' : ''), type: 'button', text: m.label,
      onclick: () => { S.update((s) => { s.futureSim.perf.chartMode = m.key; }); render(); },
    }));

  const body = el('div', {});

  if (!view.hasEnough) {
    // 履歴が0〜1件のときは架空データを作らず、案内メッセージのみ表示する
    body.append(el('p', { class: 'fc-perf-empty', text: '評価額を更新すると、ここに資産推移が表示されます' }));
  } else if (secret) {
    body.append(el('p', { class: 'fc-empty', text: 'シークレットモード中は非表示' }));
  } else if (mode === 'daily') {
    body.append(perfDeltaBlock(state, fs, view));
  } else {
    body.append(perfChartBlock(state, fs, view));
  }

  // --- 最新値（グラフ下） ---
  const latest = view.latestSnap;
  const latestBox = latest ? perfLatestBox(state, latest) : '';

  // --- 表示オプション ---
  const opts = perfOptionRows(fs, view);

  return card(
    sectionTitle('投資実績', latest
      ? el('button', { class: 'fc-link', type: 'button', text: '履歴を編集', onclick: () => perfHistoryModal(state) })
      : ''),
    tabSeg,
    periodSeg,
    modeSeg,
    body,
    view.hasEnough && !secret && mode === 'assets' ? perfSeriesChips(fs, view) : '',
    opts,
    latestBox,
    el('p', { class: 'fc-note', text: mode === 'daily'
      ? '前回の記録からの評価額の増減を、0円を基準に表示します。プラスは緑（上向き）、マイナスは赤（下向き）です。日々の変動は保存済みの実績のみを対象とします。'
      : '実線は保存済みの実績、破線は今日以降の予測です。予測は最新の実績評価額を起点に、設定した年利・積立・購入予定から計算します。過去の実績は設定を変えても書き換わりません。' }),
  );
}

// 実績グラフ本体（チャート＋タップで日別詳細）
function perfChartBlock(state, fs, view) {
  const perf = fs.perf;
  const series = [];
  // メイン系列（選択タブの評価額・元本・評価損益・証券口座現金）
  for (const def of Perf.PERF_SERIES) {
    if (def.totalOnly && perf.target !== 'total') continue;
    if (!perf.visible[def.key]) continue;
    series.push({
      label: def.label, color: def.color,
      values: view.points.map((p) => (p[def.field] == null ? null : p[def.field])),
    });
  }
  // 銘柄別（NISA/個別株タブ・実績のみ）
  const holdingColors = ['#0a84ff', '#bf5af2', '#ff375f', '#34c759', '#ff9500', '#5ac8fa', '#ffd60a', '#64d2ff'];
  if (view.holdingSeries) {
    view.holdingSeries.forEach((hs, i) => {
      // 銘柄別データは実績点のみ。予測点ぶんは null で埋める。
      const map = new Map(hs.data.map((d) => [d.date, d.value]));
      series.push({
        label: hs.name, color: holdingColors[i % holdingColors.length], width: 1.8,
        values: view.points.map((p) => (p.kind === 'actual' && map.has(p.date) ? map.get(p.date) : null)),
      });
    });
  }

  const chart = el('div', { class: 'fc-chart fc-perf-chart', html: perfChart(view.points, series, { height: 240, boundaryIndex: view.boundaryIndex }) });
  // タップで該当日の詳細を表示（当たり領域のdata-iから点を特定）
  chart.addEventListener('click', (e) => {
    const hit = e.target.closest ? e.target.closest('.fc-perf-hit') : null;
    const idx = hit ? Number(hit.getAttribute('data-i')) : NaN;
    if (Number.isInteger(idx) && view.points[idx]) perfDayDetailModal(view.points[idx], view.target);
  });

  const wrap = el('div', {});
  wrap.append(chart);
  if (view.holdingSeries && view.holdingSeries.length) {
    wrap.append(el('div', { class: 'fc-legend-list' }, ...view.holdingSeries.map((hs, i) =>
      el('div', { class: 'fc-legend-row' },
        el('i', { class: 'dot', style: `background:${holdingColors[i % holdingColors.length]}` }),
        el('span', { class: 'fc-legend-name', text: hs.name })))));
  }
  wrap.append(el('p', { class: 'fc-perf-taphint', text: 'グラフをタップすると、その日の詳細を表示します' }));
  return wrap;
}

// 日々の変動（前日からの評価額の増減額を棒グラフで表示。0円を基準にプラス＝緑・マイナス＝赤）
function perfDeltaBlock(state, fs, view) {
  const wrap = el('div', {});
  const deltas = view.deltaPts || [];
  if (deltas.length < 1) {
    wrap.append(el('p', { class: 'fc-perf-empty', text: 'この期間には増減を計算できるデータがまだありません' }));
    return wrap;
  }
  const chart = el('div', {
    class: 'fc-chart fc-perf-chart',
    html: perfDeltaChart(deltas, { height: 240 }),
  });
  // タップで該当日の詳細を表示（実績・予測スナップショットがある点のみ）
  chart.addEventListener('click', (e) => {
    const hit = e.target.closest ? e.target.closest('.fc-perf-hit') : null;
    const idx = hit ? Number(hit.getAttribute('data-i')) : NaN;
    const d = Number.isInteger(idx) ? deltas[idx] : null;
    if (d) perfDeltaDetailModal(d, view.target);
  });
  wrap.append(chart);

  // 凡例（増加＝緑 / 減少＝赤）
  wrap.append(el('div', { class: 'fc-legend-list' },
    el('div', { class: 'fc-legend-row' },
      el('i', { class: 'dot', style: 'background:#34c759' }), el('span', { class: 'fc-legend-name', text: '増加' })),
    el('div', { class: 'fc-legend-row' },
      el('i', { class: 'dot', style: 'background:#ff453a' }), el('span', { class: 'fc-legend-name', text: '減少' }))));
  wrap.append(el('p', { class: 'fc-perf-taphint', text: '棒をタップすると、その日の詳細を表示します' }));
  return wrap;
}

// 日々の変動の1日ぶんの詳細（増減額と、その日の内訳）
function perfDeltaDetailModal(d, target) {
  const secret = S.getState().settings.secret;
  const up = d.delta >= 0;
  const body = el('div', {},
    d.kind === 'forecast' ? el('div', { class: 'fc-perf-detail-badge', text: '将来予測（今日以降）' }) : '',
    el('div', { class: 'fc-evd-amt ' + (up ? 'pos' : 'neg'), text: secret ? '＊＊＊' : yen(d.delta, { sign: true }) }),
    el('div', { class: 'fc-kv' },
      el('div', { class: 'fc-kv-row' }, el('span', { text: '前回からの増減' }),
        el('b', { text: secret ? '＊＊＊' : yen(d.delta, { sign: true }) }))));
  modal(fmtDateLong(d.date) + ' の変動', body, {});
}

// 表示系列トグル（評価額・元本・評価損益・証券口座現金）
function perfSeriesChips(fs, view) {
  const perf = fs.perf;
  const wrap = el('div', { class: 'fc-chipwrap' });
  for (const def of Perf.PERF_SERIES) {
    if (def.totalOnly && perf.target !== 'total') continue;
    const on = !!perf.visible[def.key];
    wrap.append(el('button', {
      class: 'fc-serieschip' + (on ? ' on' : ''), type: 'button',
      style: on ? `background:${def.color}22;color:${def.color};border-color:${def.color}66` : '',
      onclick: () => { S.update((s) => { s.futureSim.perf.visible[def.key] = !s.futureSim.perf.visible[def.key]; }); render(); },
    }, el('i', { class: 'dot', style: `background:${def.color}` }), el('span', { text: def.label })));
  }
  return wrap;
}

// 表示オプション（現金含有・銘柄別・予測表示）
function perfOptionRows(fs, view) {
  const perf = fs.perf;
  const rows = el('div', { class: 'fc-perf-opts' });
  const optRow = (label, on, onToggle) => el('div', { class: 'fc-field-toggle' },
    el('div', {}, el('div', { class: 'fc-field-lab', text: label })), toggle(on, onToggle));

  if (perf.target === 'total') {
    rows.append(optRow('証券口座の未投資現金を含める', !!perf.includeCash,
      () => { S.update((s) => { s.futureSim.perf.includeCash = !s.futureSim.perf.includeCash; }); render(); }));
  } else {
    rows.append(optRow('銘柄ごとに表示する', !!perf.byHolding,
      () => { S.update((s) => { s.futureSim.perf.byHolding = !s.futureSim.perf.byHolding; }); render(); }));
  }
  rows.append(optRow('将来予測を連結表示する', perf.forecast !== false,
    () => { S.update((s) => { s.futureSim.perf.forecast = !(s.futureSim.perf.forecast !== false); }); render(); }));
  return rows;
}

// 最新値（グラフの下に表示）
function perfLatestBox(state, snap) {
  const secret = state.settings.secret;
  const money = (v) => (secret ? '＊＊＊' : yen(v));
  const rate = snap.profitRate;
  const pcls = snap.profit === 0 ? 'flat' : snap.profit > 0 ? 'pos' : 'neg';
  return el('div', { class: 'fc-perf-latest' },
    el('div', { class: 'fc-perf-latest-head' },
      el('span', { class: 'fc-perf-latest-lab', text: '最新の実績' }),
      el('span', { class: 'fc-perf-latest-date', text: fmtDateLong(snap.date) })),
    el('div', { class: 'fc-sec-grid' },
      secBox('評価額', money(snap.valuation)),
      secBox('元本', money(snap.principal)),
      secBox('評価損益', secret ? '＊＊＊' : yen(snap.profit, { sign: snap.profit > 0 }))),
    el('div', { class: 'fc-perf-latest-rate ' + pcls },
      el('span', { text: '利益率' }),
      el('b', { text: rate == null ? '—' : `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%` })));
}

// 日別詳細モーダル（グラフのタップで表示）。表示例に沿った内訳を並べる。
function perfDayDetailModal(point, target) {
  const secret = S.getState().settings.secret;
  const money = (v) => (secret ? '＊＊＊' : yen(v));
  const r = point.raw || {};
  const isForecast = point.kind === 'forecast';
  // 実績スナップショットと予測スナップショットで内訳フィールド名が異なるため吸収する
  const nisaPrincipal = isForecast ? r.indexPrincipal : r.nisaPrincipal;
  const nisaValue = isForecast ? r.indexValuation : r.nisaValue;
  const stockPrincipal = isForecast ? r.stockPrincipal : r.stockPrincipal;
  const stockValue = isForecast ? r.stockValuation : r.stockValue;
  const principal = r.principal;
  const valuation = r.valuation;
  const profit = (valuation != null && principal != null) ? valuation - principal : point.profit;
  const rate = principal > 0 ? (profit / principal) * 100 : null;

  const rowKV = (k, v) => el('div', { class: 'fc-kv-row' }, el('span', { text: k }), el('b', { text: v }));
  const body = el('div', {},
    isForecast ? el('div', { class: 'fc-perf-detail-badge', text: '将来予測（今日以降）' }) : '',
    el('div', { class: 'fc-kv' },
      rowKV('NISA元本', money(nisaPrincipal)),
      rowKV('NISA評価額', money(nisaValue)),
      rowKV('個別株元本', money(stockPrincipal)),
      rowKV('個別株評価額', money(stockValue)),
      rowKV('投資元本合計', money(principal)),
      rowKV('投資評価額合計', money(valuation)),
      rowKV('評価損益', secret ? '＊＊＊' : yen(profit, { sign: profit > 0 })),
      rowKV('利益率', rate == null ? '—' : `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%`),
      point.secCash != null && target === 'total' ? rowKV('証券口座現金', money(point.secCash)) : ''),
  );
  modal(fmtDateLong(point.date), body, {});
}

// 履歴の編集・削除（誤登録の修正用）。変更後はグラフ・損益が再計算される。
function perfHistoryModal(state) {
  const hist = (state.performanceHistory || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const body = el('div', {});
  if (!hist.length) {
    body.append(el('p', { class: 'fc-empty', text: 'まだ実績履歴がありません' }));
  } else {
    body.append(el('div', { class: 'fc-list' }, ...hist.map((rec) =>
      el('div', { class: 'fc-row tap', onclick: () => perfHistoryEditForm(state, rec) },
        el('div', { class: 'fc-row-main' },
          el('div', { class: 'fc-row-title', text: fmtDateLong(rec.date) }),
          el('div', { class: 'fc-row-sub', text: `評価額 ${yen(rec.valuation)}・元本 ${yen(rec.principal)}・損益 ${yen(rec.profit, { sign: rec.profit > 0 })}` })),
        el('span', { class: 'fc-link-arrow', html: iconHtml('chevronRight', { size: 16 }) })))));
  }
  modal('実績履歴の編集', body, {});
}

// 1件の実績履歴を編集（評価額・元本・現金）。保存で損益・利益率を再計算。
function perfHistoryEditForm(state, rec) {
  const nisaVal = amountInput(rec.nisaValue);       // NISA評価額（円）
  const nisaPri = amountInput(rec.nisaPrincipal);   // NISA元本（円）
  const stockVal = amountInput(rec.stockValue);     // 個別株評価額（円）
  const stockPri = amountInput(rec.stockPrincipal); // 個別株元本（円）
  const secCash = amountInput(rec.secCash);         // 証券口座現金（円）
  const body = el('div', {},
    el('p', { class: 'fc-field-hint', text: `${fmtDateLong(rec.date)} の実績を修正します。元本・評価額を直すと損益・利益率とグラフが再計算されます。` }),
    field('NISA評価額（円）', nisaVal), field('NISA元本（円）', nisaPri),
    field('個別株評価額（円）', stockVal), field('個別株元本（円）', stockPri),
    field('証券口座現金（円）', secCash),
    el('button', {
      class: 'fc-btn danger block', type: 'button', text: 'この履歴を削除',
      onclick: () => confirmDialog('履歴を削除', `${fmtDateLong(rec.date)} の実績履歴を削除しますか？この操作は元に戻せません。`, () => {
        S.update((s) => {
          s.performanceHistory = (s.performanceHistory || []).filter((r) => r.date !== rec.date);
          S.normalizePerformanceHistory(s);
        });
        render();
        toast('削除しました', 'trash');
        closeAllModals();
      }),
    }),
  );
  modal('実績を編集', body, {
    onSave: (close) => {
      S.update((s) => {
        const r = (s.performanceHistory || []).find((x) => x.date === rec.date);
        if (!r) return;
        r.nisaValue = amountValue(nisaVal);
        r.nisaPrincipal = amountValue(nisaPri);
        r.stockValue = amountValue(stockVal);
        r.stockPrincipal = amountValue(stockPri);
        r.secCash = amountValue(secCash);
        r.valuation = r.nisaValue + r.stockValue;
        r.principal = r.nisaPrincipal + r.stockPrincipal;
        r.profit = r.valuation - r.principal;
        r.profitRate = r.principal > 0 ? (r.profit / r.principal) * 100 : null;
        r.edited = true;
        S.normalizePerformanceHistory(s);
      });
      render();
      toast('保存しました');
      close();
    },
  });
}

// ============ 投資将来予測（将来資産シミュレーションの投資予測タブ） ============
const FUTURE_EVENT_PRESETS = ['住宅購入', '車購入', '旅行', '結婚', '教育費', '大型家電'];

// ---- 折りたたみ（初見の情報量を減らす。開閉状態は ui に保持し、再描画でも維持する） ----
function collapsible(key, summaryText, ...children) {
  const d = el('details', { class: 'fc-collapse' },
    el('summary', { class: 'fc-collapse-sum' },
      el('span', { class: 'fc-collapse-label', text: summaryText }),
      el('span', { class: 'fc-collapse-chev', html: iconHtml('chevronRight', { size: 16 }) })),
    el('div', { class: 'fc-collapse-body' }, ...children.flat()));
  if (ui.simDetailOpen.has(key)) d.setAttribute('open', '');
  d.addEventListener('toggle', () => { if (d.open) ui.simDetailOpen.add(key); else ui.simDetailOpen.delete(key); });
  return d;
}

// 投資将来予測を3タブ（概要／投資シミュレーション／詳細設定）に整理して表示する。
//   概要・詳細設定 = 登録済みの実際の設定に基づく「実績＋予測」。
//   投資シミュレーション = シミュレーション画面で入力した条件だけで計算する1種類のシミュレーション。
function renderFutureSim() {
  const st = S.getState();
  const fs = st.futureSim;
  const wrap = el('div', { class: 'fc-futuresim' });

  const tab = ['overview', 'simulation', 'detail'].includes(ui.investTab) ? ui.investTab : 'overview';
  // タブ切替（画面上部に固定せず通常フロー。切替時は先頭へスクロールし、選択状態を明確化）
  const tabBar = el('div', { class: 'fc-seg fc-invest-tabs' });
  for (const [v, l] of [['overview', '概要'], ['simulation', '投資シミュレーション'], ['detail', '詳細設定']])
    tabBar.append(el('button', {
      class: 'fc-seg-btn' + (tab === v ? ' on' : ''), type: 'button', text: l,
      'aria-pressed': tab === v ? 'true' : 'false',
      onclick: () => { ui.investTab = v; render(); scrollTop(); },
    }));
  wrap.append(tabBar);

  if (tab === 'overview') {
    // 概要: 現在の実績と将来予測が一目で分かる。主要指標＋実績と予測を連結したメイングラフ。
    wrap.append(futureOverviewCard(st, fs));
    wrap.append(futurePerformanceCard(st, fs));
  } else if (tab === 'simulation') {
    // 投資シミュレーション（1種類に統一）: シミュレーション画面で入力した条件だけで計算する。
    // 実際の固定振替・NISA積立設定・将来振替予定・個別株購入予定は加算しない（二重計上しない）。
    for (const c of renderSimulationPlan(st, fs)) wrap.append(c);
  } else {
    // 詳細設定: 実際の設定に基づく将来予測（実績＋予測）の前提・分析ツール。
    wrap.append(futureConditionsCard(fs));
    wrap.append(futureGoalsCard(st, fs));
    wrap.append(futureEventsCard(fs));
    wrap.append(futureDividendCard(st, fs));
    wrap.append(futureStockPlansCard(st));
    wrap.append(collapsible('sensitivity', '年利の感度分析', futureSensitivityCard(st, fs)));
    wrap.append(collapsible('scenario', 'シナリオ（プラン）比較', futureCompareCard(st, fs)));
    wrap.append(collapsible('datelookup', '資産推移を日付で確認', futureDateLookupCard(st, fs)));
    wrap.append(futureMonteCarloCard(st, fs));
    wrap.append(futurePlansCard(st, fs));
    wrap.append(futureInsightsCard(st));
    wrap.append(perfHistoryEntryCard(st)); // 投資実績履歴の編集への入口
  }

  wrap.append(el('p', { class: 'fc-note', text: '※「概要」「詳細設定」は登録済みの口座・保有銘柄・積立設定・購入予定から計算した実績と予測です。「投資シミュレーション」はシミュレーション画面で入力した条件だけで計算し、実際の残高・設定は変更しません。' }));
  return wrap;
}

// 概要タブ: 現在の元本・評価額・評価損益・利益率と、設定期間後の予想評価額・目標達成状況・資金不足警告。
// 予測は登録済みの実際の設定（口座・積立設定・固定振替・購入予定）だけから計算する（＝実績の延長）。
function futureOverviewCard(st, fs) {
  const secret = st.settings.secret;
  const money = (v) => (secret ? '＊＊＊' : yen(v));
  const p = Sec.portfolio(st); // 現在の元本・評価額・評価損益・利益率
  const proj = FS.project(st, { years: fs.years }); // 実データに基づく将来予測
  const end = proj.series.at(-1) || {};
  const endVal = end.valuation || 0;
  const rateText = p.profitRate == null ? '—' : `${p.profitRate >= 0 ? '+' : ''}${p.profitRate.toFixed(2)}%`;
  const cls = p.profit === 0 ? 'flat' : p.profit > 0 ? 'pos' : 'neg';

  // 目標達成状況（設定されていれば、将来予想評価額に対する達成度を表示）
  const goals = (fs.goals || []);
  const goalBlocks = goals.map((g) => {
    const cur = g.metric === 'total' ? (end.total || 0) : endVal;
    const pct = g.targetAmount > 0 ? Math.min(100, Math.round((cur / g.targetAmount) * 100)) : 0;
    return el('div', { class: 'fc-kv-row' }, el('span', { text: `目標「${g.name}」` }),
      el('b', { text: secret ? '＊＊＊' : `${pct}%（${yen(g.targetAmount)}）` }));
  });

  // 資金不足の警告（実際の設定に基づく予測で証券口座現金が不足する見込みのとき）
  const secShort = FS.securitiesShortfallReport(st, proj);

  return card(
    sectionTitle('概要'),
    el('div', { class: 'fc-sec-grid' },
      secBox('現在の投資元本', money(p.principal)),
      secBox('現在の評価額', money(p.valuation)),
      secBox('評価損益', secret ? '＊＊＊' : yen(p.profit, { sign: p.profit > 0 }))),
    el('div', { class: 'fc-sec-grid' },
      secBox('利益率', secret ? '＊＊' : rateText),
      secBox(`${fs.years}年後の予想評価額`, money(endVal))),
    goalBlocks.length ? el('div', {}, el('h3', { class: 'fc-subhead', text: '目標達成状況' }), el('div', { class: 'fc-kv' }, ...goalBlocks)) : '',
    secShort ? el('div', { class: 'fc-shortage' },
      el('div', { class: 'fc-shortage-top' }, el('span', { class: 'fc-shortage-ic', html: iconHtml('alert', { size: 18 }) }),
        el('b', { text: `${fmtDateLong(secShort.date)}頃に証券口座現金が不足する見込みです` })),
      el('div', { class: 'fc-shortage-sub', text: '詳細設定タブで積立・振替・購入予定を確認できます。' })) : '',
    el('p', { class: 'fc-field-hint', text: '下のグラフは、これまでの実績と今後の予測を1本につないだ資産推移です。' }),
  );
}

// 詳細設定タブ: 投資実績履歴の編集への入口カード。
function perfHistoryEntryCard(st) {
  return card(
    sectionTitle('投資実績履歴'),
    el('p', { class: 'fc-field-hint', text: '過去の評価額・元本の記録を修正できます（誤登録の訂正用）。' }),
    btnIcon('ghost block', 'file', '投資実績履歴を編集', () => perfHistoryModal(st)),
  );
}

// ============================================================================
// 投資シミュレーション（InvestmentSimulationPlan・1種類に統一）
// 実際の資産管理設定（口座残高・NISA積立設定・固定振替・将来振替予定・個別株購入予定）とは
// 完全に分離した、シミュレーション画面で入力した条件だけで計算する資金計画。
// すべての編集は s.futureSim.simPlan に対して行い、その場で再計算する（実データは変更しない）。
// ============================================================================
const IDEAL_YEAR_OPTIONS = [1, 3, 5, 10, 15, 20, 30];
const WEEKDAY_OPTS = [['0', '日'], ['1', '月'], ['2', '火'], ['3', '水'], ['4', '木'], ['5', '金'], ['6', '土']];

// シミュレーションプランを書き換えて即時再計算（実データには触れない）
function updateSimPlan(mutator) {
  S.update((s) => { mutator(s.futureSim.simPlan); });
  render();
}
// 頻度・日付から人が読める説明を作る（例: 毎月15日 / 毎週月曜 / 毎営業日）
function scheduleLabel(item, forInvest) {
  const freq = item.frequency || (forInvest ? 'daily' : 'monthly');
  if (freq === 'monthly') return `毎月${Number(item.day) || 1}日`;
  if (freq === 'weekly') return `毎週${(WEEKDAY_OPTS.find((w) => w[0] === String(item.weekday ?? 1)) || ['1', '月'])[1]}曜`;
  return forInvest && item.includeHolidays !== true ? '毎営業日' : '毎日';
}
function periodLabel(item) {
  const s = item.startDate ? fmtDate(item.startDate) : '開始日';
  const e = item.endDate ? fmtDate(item.endDate) : '無期限';
  return `${s}〜${e}`;
}

function renderSimulationPlan(st, fs) {
  const plan = fs.simPlan;
  const secret = st.settings.secret;
  const res = IS.runIdealPlan(plan);
  return [
    simIntroCard(),
    idealBasicsCard(plan),
    idealDepositsCard(plan),
    idealInvestmentsCard(plan),
    idealResultCard(plan, res, secret),
    idealChartCard(plan, res, secret),
    idealDateLookupCard(plan, secret),
    idealPlansCard(st, fs, plan),
  ];
}

// 画面名と、実際の設定を加算しないことの明示（統一後の「投資シミュレーション」）
function simIntroCard() {
  return card(
    sectionTitle('投資シミュレーション'),
    el('p', { class: 'fc-field-hint', text: 'このシミュレーションは、ここで入力した条件だけで将来資産を計算します。実際の銀行→証券の固定振替・NISA積立設定・将来振替予定・個別株購入予定は加算しません（二重計上しません）。実際の残高や設定を書き換えることもありません。' }),
  );
}

// ---- 基本設定（開始日・初期証券口座現金・想定年利・保有期間・現金不足時の処理） ----
function idealBasicsCard(plan) {
  const startInp = inputEl({ type: 'date', value: plan.startDate });
  startInp.addEventListener('change', () => updateSimPlan((p) => { p.startDate = startInp.value || p.startDate; }));

  const cashInp = amountInput(plan.initialSecCash); // 初期証券口座現金（円・3桁区切り）
  cashInp.addEventListener('change', () => updateSimPlan((p) => { p.initialSecCash = amountValue(cashInp); }));

  const rateInp = inputEl({ type: 'number', inputmode: 'decimal', placeholder: '例）10', value: plan.annualReturn ?? '' });
  rateInp.addEventListener('change', () => updateSimPlan((p) => { p.annualReturn = Number(rateInp.value) || 0; }));

  // 保有期間チップ
  const yearSeg = el('div', { class: 'fc-period' });
  for (const y of IDEAL_YEAR_OPTIONS)
    yearSeg.append(el('button', { class: 'fc-period-btn' + (plan.years === y ? ' on' : ''), type: 'button', text: `${y}年`, onclick: () => updateSimPlan((p) => { p.years = y; }) }));

  // 計算方式（複利/単利）
  const modeSeg = el('div', { class: 'fc-seg' });
  for (const [v, l] of [['compound', '複利'], ['simple', '単利']])
    modeSeg.append(el('button', { class: 'fc-seg-btn' + ((plan.returnMode || 'compound') === v ? ' on' : ''), type: 'button', text: l, onclick: () => updateSimPlan((p) => { p.returnMode = v; }) }));

  // 現金不足時の処理
  const shortSeg = el('div', { class: 'fc-seg' });
  for (const [v, l] of [['strict', '資金計画を厳密に再現'], ['continue', '不足を無視して継続']])
    shortSeg.append(el('button', { class: 'fc-seg-btn' + ((plan.shortageMode || 'strict') === v ? ' on' : ''), type: 'button', text: l, onclick: () => updateSimPlan((p) => { p.shortageMode = v; }) }));

  const targetInp = amountInput(plan.targetAmount); // 目標金額（円・3桁区切り・任意）
  targetInp.addEventListener('change', () => updateSimPlan((p) => { p.targetAmount = amountValue(targetInp); }));

  return card(
    sectionTitle('シミュレーションの条件'),
    el('p', { class: 'fc-field-hint', text: 'シミュレーション開始時の証券口座現金・想定年利・保有期間などを設定します。ここでの変更は実データを一切変更しません。入力するとその場で結果とグラフが更新されます。' }),
    field('シミュレーション開始日', startInp),
    field('初期証券口座現金（円）', cashInp),
    field('想定年利（%）', rateInp),
    field('利回りの計算方式', modeSeg),
    field('保有期間', yearSeg),
    field('現金不足時の処理', shortSeg),
    el('p', { class: 'fc-field-hint', text: (plan.shortageMode || 'strict') === 'strict' ? '「厳密に再現」: 証券口座現金が不足した日の購入は未実行にします（元本・評価額へ加算しません）。' : '「不足を無視して継続」: 現金が不足しても全投資を実行したものとして評価額を計算し、不足分は「必要な追加資金」として集計します。' }),
    field('目標金額（評価額・任意）', targetInp),
  );
}

// ---- 証券口座への自動入金（複数登録・途中変更） ----
function idealDepositsCard(plan) {
  const deposits = plan.deposits || [];
  const overlaps = IS.findOverlaps(deposits);
  const rows = deposits.length ? el('div', { class: 'fc-list' }, ...deposits.map((d) => {
    const off = d.enabled === false;
    return el('div', { class: 'fc-row tap' + (off ? ' fc-row-off' : ''), onclick: () => idealDepositForm(plan, d) },
      el('div', { class: 'fc-row-ic', html: iconHtml('coins', { size: 18 }) }),
      el('div', { class: 'fc-row-main' },
        el('div', { class: 'fc-row-title', text: `${scheduleLabel(d, false)} ${yen(d.amount)}` }),
        el('div', { class: 'fc-row-sub', text: `${periodLabel(d)}${off ? '・無効' : ''}${d.memo ? '・' + d.memo : ''}` })),
      el('span', { class: 'fc-link-arrow', html: iconHtml('chevronRight', { size: 16 }) }));
  })) : el('p', { class: 'fc-empty', text: '銀行などから証券口座現金へ定期的に入金する設定を追加できます（例: 毎月15日に70,000円）。複数登録でき、期間を分ければ途中から入金額を変更できます。' });
  return card(
    sectionTitle('証券口座への自動入金', el('button', { class: 'fc-link', type: 'button', onclick: () => idealDepositForm(plan, null) },
      el('span', { class: 'fc-add-ic sm', html: iconHtml('plus', { size: 14 }) }), el('span', { text: '入金を追加' }))),
    overlaps.length ? el('p', { class: 'fc-field-hint fc-warn', text: '⚠ 期間が重複する入金設定があります。金額を途中変更する場合は期間が重ならないようにしてください。' }) : '',
    rows,
  );
}
function idealDepositForm(plan, dep) {
  const isNew = !dep;
  const d = dep || {};
  const amount = amountInput(d.amount); // 入金額（円・3桁区切り）
  let freq = d.frequency || 'monthly';
  const freqSeg = el('div', { class: 'fc-seg' });
  const day = selectEl(Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `${i + 1}日` })), d.day ?? 15);
  const weekday = selectEl(WEEKDAY_OPTS.map(([v, l]) => ({ value: v, label: `${l}曜` })), String(d.weekday ?? 1));
  const startDate = inputEl({ type: 'date', value: d.startDate || plan.startDate });
  const endDate = inputEl({ type: 'date', value: d.endDate || '' });
  const memo = inputEl({ placeholder: '例）給与から積立（任意）', value: d.memo || '' });
  let enabled = dep ? dep.enabled !== false : true;
  const enRow = el('div', { class: 'fc-field-toggle' });
  const drawEn = () => { enRow.innerHTML = ''; enRow.append(el('div', {}, el('div', { class: 'fc-field-lab', text: '有効 / 無効' })), toggle(enabled, () => { enabled = !enabled; drawEn(); })); };
  drawEn();

  const dayWrap = el('div', {});
  const drawDay = () => {
    dayWrap.innerHTML = '';
    if (freq === 'monthly') dayWrap.append(field('毎月の入金日', day));
    else if (freq === 'weekly') dayWrap.append(field('入金する曜日', weekday));
  };
  const drawFreq = () => {
    freqSeg.innerHTML = '';
    for (const [v, l] of [['monthly', '毎月'], ['weekly', '毎週'], ['daily', '毎日']])
      freqSeg.append(el('button', { class: 'fc-seg-btn' + (freq === v ? ' on' : ''), type: 'button', text: l, onclick: () => { freq = v; drawFreq(); drawDay(); } }));
  };
  drawFreq(); drawDay();

  const body = el('div', {},
    field('入金金額（円）', amount),
    field('入金頻度', freqSeg), dayWrap,
    field('入金開始日', startDate), optionalDateField('入金終了日（任意）', endDate),
    field('メモ（任意）', memo),
    el('p', { class: 'fc-field-hint', text: '31日を指定した月に31日がない場合は、その月の月末日に入金します。' }),
    el('p', { class: 'fc-field-hint', text: '入金額を途中から変えるには、期間を分けて複数登録します（例: 8月〜翌3月は7万円、翌4月から10万円）。期間の重複はできません。' }),
    enRow,
    !isNew && el('button', { class: 'fc-btn danger block', type: 'button', text: 'この入金設定を削除', onclick: () => confirmDialog('入金設定を削除', '削除しますか？', () => { updateSimPlan((p) => { p.deposits = p.deposits.filter((x) => x.id !== dep.id); }); closeModal(); }) }),
  );
  modal(isNew ? '自動入金を追加' : '自動入金を編集', body, {
    onSave: (close) => {
      const amt = amountValue(amount);
      if (!amt || amt <= 0) return toast('入金金額を入力してください', 'alert');
      if (startDate.value && endDate.value && endDate.value < startDate.value) return toast('終了日は開始日より後にしてください', 'alert');
      const rec = {
        amount: amt, frequency: freq,
        day: freq === 'monthly' ? Number(day.value) : (d.day ?? 15),
        weekday: freq === 'weekly' ? Number(weekday.value) : (d.weekday ?? 1),
        startDate: startDate.value || null, endDate: endDate.value || null, memo: memo.value.trim(), enabled,
      };
      // 期間の重複を保存前に警告（有効な設定どうし。空欄は無期限とみなす）
      const s0 = rec.startDate || '0000-01-01', e0 = rec.endDate || '9999-12-31';
      const overlap = enabled && (plan.deposits || []).some((x) => {
        if (x.id === dep?.id || x.enabled === false) return false;
        const s1 = x.startDate || '0000-01-01', e1 = x.endDate || '9999-12-31';
        return s0 <= e1 && s1 <= e0;
      });
      if (overlap) return toast('期間が重複する入金設定があります', 'alert');
      updateSimPlan((p) => {
        if (isNew) (p.deposits ||= []).push({ id: uid('dep'), ...rec });
        else Object.assign(p.deposits.find((x) => x.id === dep.id), rec);
      });
      toast('保存しました'); close();
    },
  });
}

// ---- 投資設定（複数登録・毎日/毎週/毎月・投資日は自由に指定） ----
function idealInvestmentsCard(plan) {
  const invs = plan.investments || [];
  const overlaps = IS.findOverlaps(invs, { byKind: true });
  const rows = invs.length ? el('div', { class: 'fc-list' }, ...invs.map((v) => {
    const off = v.enabled === false;
    const kindLabel = (v.kind || 'nisa') === 'stock' ? '個別株' : `NISA・${Sec.nisaLabel(v.nisaFrame || 'growth')}`;
    return el('div', { class: 'fc-row tap' + (off ? ' fc-row-off' : ''), onclick: () => idealInvestmentForm(plan, v) },
      el('div', { class: 'fc-row-ic', html: iconHtml('trending', { size: 18 }) }),
      el('div', { class: 'fc-row-main' },
        el('div', { class: 'fc-row-title', text: `${scheduleLabel(v, true)} ${yen(v.amount)}` }),
        el('div', { class: 'fc-row-sub', text: `${v.name ? v.name + '・' : ''}${kindLabel}・${periodLabel(v)}${off ? '・無効' : ''}` })),
      el('span', { class: 'fc-link-arrow', html: iconHtml('chevronRight', { size: 16 }) }));
  })) : el('p', { class: 'fc-empty', text: '投資設定を追加できます（例: 毎営業日に3,000円 / 毎週月曜に20,000円 / 毎月15日に70,000円）。入金日とは別に投資日を設定できます。' });
  return card(
    sectionTitle('投資設定', el('button', { class: 'fc-link', type: 'button', onclick: () => idealInvestmentForm(plan, null) },
      el('span', { class: 'fc-add-ic sm', html: iconHtml('plus', { size: 14 }) }), el('span', { text: '投資を追加' }))),
    overlaps.length ? el('p', { class: 'fc-field-hint fc-warn', text: '⚠ 期間が重複する投資設定があります。投資額を途中変更する場合は期間が重ならないようにしてください。' }) : '',
    rows,
  );
}
function idealInvestmentForm(plan, inv) {
  const isNew = !inv;
  const v = inv || {};
  const name = inputEl({ placeholder: '例）eMAXIS Slim S&P500（任意）', value: v.name || '' });
  let kind = v.kind === 'stock' ? 'stock' : 'nisa';
  let nisaFrame = v.nisaFrame === 'tsumitate' ? 'tsumitate' : 'growth';
  let freq = v.frequency || 'daily';
  const amount = amountInput(v.amount); // 投資額（円・3桁区切り）
  const day = selectEl(Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `${i + 1}日` })), v.day ?? 15);
  const weekday = selectEl(WEEKDAY_OPTS.map(([wv, l]) => ({ value: wv, label: `${l}曜` })), String(v.weekday ?? 1));
  const startDate = inputEl({ type: 'date', value: v.startDate || plan.startDate });
  const endDate = inputEl({ type: 'date', value: v.endDate || '' });
  let includeHolidays = inv ? v.includeHolidays === true : false;
  let nonBiz = v.nonBusinessDay === 'carryover' ? 'carryover' : 'skip';
  let enabled = inv ? inv.enabled !== false : true;

  const kindSeg = el('div', { class: 'fc-seg' });
  const frameWrap = el('div', {});
  const drawKind = () => {
    kindSeg.innerHTML = '';
    for (const [kv, l] of [['nisa', 'NISA積立'], ['stock', '個別株']])
      kindSeg.append(el('button', { class: 'fc-seg-btn' + (kind === kv ? ' on' : ''), type: 'button', text: l, onclick: () => { kind = kv; drawKind(); drawFrame(); } }));
  };
  const frameSeg = el('div', { class: 'fc-seg' });
  const drawFrame = () => {
    frameWrap.innerHTML = '';
    if (kind !== 'nisa') return;
    frameSeg.innerHTML = '';
    for (const f of Sec.NISA_FRAMES)
      frameSeg.append(el('button', { class: 'fc-seg-btn' + (nisaFrame === f.value ? ' on' : ''), type: 'button', text: f.label, onclick: () => { nisaFrame = f.value; drawFrame(); } }));
    frameWrap.append(field('NISAの投資枠', frameSeg));
  };
  drawKind(); drawFrame();

  const freqSeg = el('div', { class: 'fc-seg' });
  const dayWrap = el('div', {});
  const drawDay = () => {
    dayWrap.innerHTML = '';
    if (freq === 'monthly') dayWrap.append(field('毎月の投資日', day));
    else if (freq === 'weekly') dayWrap.append(field('投資する曜日', weekday));
  };
  const drawFreq = () => {
    freqSeg.innerHTML = '';
    for (const [fv, l] of [['daily', '毎日'], ['weekly', '毎週'], ['monthly', '毎月']])
      freqSeg.append(el('button', { class: 'fc-seg-btn' + (freq === fv ? ' on' : ''), type: 'button', text: l, onclick: () => { freq = fv; drawFreq(); drawDay(); drawHol(); } }));
  };
  drawFreq(); drawDay();

  const holRow = el('div', { class: 'fc-field-toggle' });
  const nonBizWrap = el('div', {});
  const nonBizSeg = el('div', { class: 'fc-seg' });
  const drawNonBizSeg = () => { nonBizSeg.innerHTML = ''; for (const [nv, l] of [['skip', 'スキップ'], ['carryover', '翌営業日に繰り越す']]) nonBizSeg.append(el('button', { class: 'fc-seg-btn' + (nonBiz === nv ? ' on' : ''), type: 'button', text: l, onclick: () => { nonBiz = nv; drawNonBizSeg(); } })); };
  const drawNonBizWrap = () => { nonBizWrap.innerHTML = ''; if (!includeHolidays) nonBizWrap.append(field('非営業日（土日祝日）の扱い', nonBizSeg)); };
  const drawHol = () => {
    holRow.innerHTML = '';
    holRow.append(el('div', {}, el('div', { class: 'fc-field-lab', text: '土日祝日も投資する' }),
      el('div', { class: 'fc-field-hint', text: 'OFFにすると土曜・日曜・日本の祝日（年末年始を含む）は投資しません' })),
      toggle(includeHolidays, () => { includeHolidays = !includeHolidays; drawHol(); drawNonBizWrap(); }));
  };
  drawNonBizSeg(); drawHol(); drawNonBizWrap();

  const enRow = el('div', { class: 'fc-field-toggle' });
  const drawEn = () => { enRow.innerHTML = ''; enRow.append(el('div', {}, el('div', { class: 'fc-field-lab', text: '有効 / 無効' })), toggle(enabled, () => { enabled = !enabled; drawEn(); })); };
  drawEn();

  const body = el('div', {},
    field('投資対象の名称（任意）', name),
    field('投資の種類', kindSeg), frameWrap,
    field('投資頻度', freqSeg), dayWrap,
    field('1回あたりの投資金額（円）', amount),
    field('投資開始日', startDate), optionalDateField('投資終了日（任意）', endDate),
    holRow, nonBizWrap,
    el('p', { class: 'fc-field-hint', text: '入金日と投資日は別々に設定・保存されます。投資額を途中から変えるには期間を分けて複数登録します。' }),
    enRow,
    !isNew && el('button', { class: 'fc-btn danger block', type: 'button', text: 'この投資設定を削除', onclick: () => confirmDialog('投資設定を削除', '削除しますか？', () => { updateSimPlan((p) => { p.investments = p.investments.filter((x) => x.id !== inv.id); }); closeModal(); }) }),
  );
  modal(isNew ? '投資設定を追加' : '投資設定を編集', body, {
    onSave: (close) => {
      const amt = amountValue(amount);
      if (!amt || amt <= 0) return toast('投資金額を入力してください', 'alert');
      if (startDate.value && endDate.value && endDate.value < startDate.value) return toast('終了日は開始日より後にしてください', 'alert');
      const rec = {
        name: name.value.trim(), kind, nisaFrame, frequency: freq, amount: amt,
        day: freq === 'monthly' ? Number(day.value) : (v.day ?? 15),
        weekday: freq === 'weekly' ? Number(weekday.value) : (v.weekday ?? 1),
        startDate: startDate.value || null, endDate: endDate.value || null,
        includeHolidays, nonBusinessDay: nonBiz, enabled,
      };
      // 同じ種類（NISA/個別株）で期間が重複する投資設定を警告
      const s0 = rec.startDate || '0000-01-01', e0 = rec.endDate || '9999-12-31';
      const overlap = enabled && (plan.investments || []).some((x) => {
        if (x.id === inv?.id || x.enabled === false || (x.kind || 'nisa') !== kind) return false;
        const s1 = x.startDate || '0000-01-01', e1 = x.endDate || '9999-12-31';
        return s0 <= e1 && s1 <= e0;
      });
      if (overlap) return toast('同じ種類で期間が重複する投資設定があります', 'alert');
      updateSimPlan((p) => {
        if (isNew) (p.investments ||= []).push({ id: uid('inv'), ...rec });
        else Object.assign(p.investments.find((x) => x.id === inv.id), rec);
      });
      toast('保存しました'); close();
    },
  });
}

// ---- 結果表示 ----
function idealResultCard(plan, res, secret) {
  const money = (v) => (secret ? '＊＊＊' : yen(v));
  const s = res.summary;
  const strict = res.shortageMode === 'strict';
  const grids = [
    el('div', { class: 'fc-sec-grid' }, secBox('初期証券口座現金', money(s.initialSecCash)), secBox('入金累計額', money(s.cumDeposit)), secBox('投資予定累計額', money(s.cumInvestPlanned))),
    el('div', { class: 'fc-sec-grid' }, secBox('実際に投資できた累計額', money(s.cumInvestExec)), secBox('必要な追加資金', money(s.requiredExtra)), secBox('最終的な証券口座現金', money(s.finalSecCash))),
    el('div', { class: 'fc-sec-grid' }, secBox('将来元本', money(s.principal)), secBox('将来評価額', money(s.valuation)), secBox('評価損益', money(s.profit))),
    el('div', { class: 'fc-sec-grid' }, secBox('利益率', s.profitRate == null ? '—' : `${s.profitRate >= 0 ? '+' : ''}${s.profitRate.toFixed(1)}%`), secBox('積立実行回数', `${s.execCount.toLocaleString('ja-JP')}回`), secBox('積立未実行回数', `${s.missCount.toLocaleString('ja-JP')}回`)),
  ];
  // 資金不足の内訳（購入日時点で証券口座現金が不足する最初の予定）。仕様§5の各項目を表示する。
  // 必要な追加入金額は、重複した実際の振替額を含めず、このプランのみの最大不足額(requiredExtra)で計算する。
  const sf = (res.shortfalls || [])[0] || null;
  const shortageBlock = sf
    ? el('div', { class: 'fc-shortage' },
      el('div', { class: 'fc-shortage-top' }, el('span', { class: 'fc-shortage-ic', html: iconHtml('alert', { size: 18 }) }),
        el('b', { text: `${fmtDateLong(sf.date)}に証券口座現金が不足します` })),
      el('div', { class: 'fc-kv fc-shortage-plan' },
        kv('最初に不足する日', fmtDateLong(sf.date)),
        kv('不足の原因', sf.name),
        kv('購入予定額', money(sf.amount)),
        kv('購入直前の証券口座現金', money(sf.amount - sf.deficit)),
        kv('不足額', money(sf.deficit)),
        kv('その月の入金予定額', money(Number((res.monthDeposit || {})[sf.month]) || 0)),
        kv('その月の購入予定額', money(Number((res.monthInvest || {})[sf.month]) || 0)),
        kv('必要な追加入金額', money(s.requiredExtra))))
    : el('div', { class: 'fc-kv' },
      kv('資金不足', 'なし'),
      kv('必要な追加入金額', money(s.requiredExtra)));

  return card(
    sectionTitle(`シミュレーション結果（${res.years}年後）`, pill(strict ? '厳密に再現' : '不足を無視')),
    ...grids,
    s.targetAmount > 0 ? el('div', { class: 'fc-kv' }, kv('目標金額', money(s.targetAmount)), kv('目標金額への到達予定日', s.targetReachDate ? fmtDateLong(s.targetReachDate) : '期間内に到達しません')) : '',
    el('h3', { class: 'fc-subhead', text: '資金繰りの内訳' }),
    el('p', { class: 'fc-field-hint', text: strict ? '証券口座現金が不足した日の購入は未実行にします（元本・評価額へ加算しません）。' : '現金が不足しても全投資を実行したものとして計算し、不足分を「必要な追加入金額」として集計します。' }),
    shortageBlock,
    !sf ? '' : el('div', { class: 'fc-kv' },
      kv('未実行となった回数', `${s.missCount.toLocaleString('ja-JP')}回`),
      kv('未実行となった累計額', money(s.cumMissed))),
    el('p', { class: 'fc-note', text: '証券口座現金＝開始時の証券口座現金＋シミュレーション専用の入金−NISA購入−個別株購入。同じ日は「入金 → NISA積立 → 個別株購入」の順に日付順で処理します。実際の残高・固定振替・積立設定は途中で加算しません。' }),
  );
}

// ---- グラフ（証券口座現金・入金累計・元本・評価額・評価損益・必要な追加資金） ----
const IDEAL_SERIES_DEFS = [
  { key: 'valuation', label: '評価額', color: '#34c759' },
  { key: 'principal', label: '元本', color: '#ffd60a', dashed: true },
  { key: 'secCash', label: '証券口座現金', color: '#5ac8fa' },
  { key: 'cumDeposit', label: '入金累計額', color: '#0a84ff', dashed: true },
  { key: 'profit', label: '評価損益', color: '#ff9500' },
  { key: 'requiredExtra', label: '必要な追加資金', color: '#ff375f' },
];
// 将来資産グラフのジオメトリ（multiLineChart の viewBox・padding と一致させる）
const SIM_CHART_GEO = { w: 640, h: 240, padT: 16, padR: 14, padB: 26, padL: 50 };
function idealChartCard(plan, res, secret) {
  const visible = ui.planChartVisible;
  const chips = el('div', { class: 'fc-chipwrap' });
  for (const d of IDEAL_SERIES_DEFS) {
    const on = !!visible[d.key];
    chips.append(el('button', {
      class: 'fc-serieschip' + (on ? ' on' : ''), type: 'button',
      style: on ? `background:${d.color}22;color:${d.color};border-color:${d.color}66` : '',
      onclick: () => { visible[d.key] = !visible[d.key]; render(); },
    }, el('i', { class: 'dot', style: `background:${d.color}` }), el('span', { text: d.label })));
  }
  const src = res.series;
  const step = Math.max(1, Math.floor(src.length / 60));
  const sampled = src.filter((_, i) => i % step === 0 || i === src.length - 1);
  const labelFor = (iso, i) => { if (i === 0) return '開始'; const dt = parseISO(iso); return `${dt.getFullYear()}/${dt.getMonth() + 1}`; };
  const seriesList = IDEAL_SERIES_DEFS.filter((d) => visible[d.key]).map((d) => ({
    label: d.label, color: d.color, dashed: d.dashed,
    data: sampled.map((p, i) => ({ label: labelFor(p.date, i), value: p[d.key] })),
  }));

  let chartNode;
  if (secret) chartNode = el('p', { class: 'fc-empty', text: 'シークレットモード中は非表示' });
  else if (!seriesList.length) chartNode = el('p', { class: 'fc-empty', text: '表示する系列を選択してください' });
  else {
    // 長押しで日付別詳細を表示できる、操作可能なグラフ（位置マーカー付き）
    chartNode = el('div', { class: 'fc-chart fc-sim-chart' });
    chartNode.innerHTML = multiLineChart(seriesList, { height: 240, hit: true });
    chartNode.append(el('div', { class: 'fc-sim-marker' })); // 選択位置を示す縦線（初期は非表示）
    attachSimChartLongPress(chartNode, plan, sampled, secret);
  }

  return card(
    sectionTitle('将来資産グラフ'),
    chips,
    chartNode,
    el('p', { class: 'fc-sim-taphint', text: 'グラフを長押しすると、日付ごとの詳細を確認できます' }),
    el('p', { class: 'fc-field-hint', text: '毎月の入金日に証券口座現金が増え、投資日に減る動きを反映します。長押し中は指を左右に動かすと日付を切り替えられます。' }),
  );
}

// ---- 将来資産グラフの長押し操作（日付別詳細の表示・スライドで日付切替） ----
// スマホ: 約500ms以上の長押しで詳細を表示。PC: クリックでも表示（マウス長押しも可）。
// 長押し中はページをスクロールさせず、iPhoneの文字選択メニュー・拡大も抑止する。
function attachSimChartLongPress(container, plan, sampled, secret) {
  const svg = container.querySelector('svg');
  const marker = container.querySelector('.fc-sim-marker');
  const n = sampled.length;
  if (!svg || !n) return;
  const geo = SIM_CHART_GEO;
  const iw = geo.w - geo.padL - geo.padR;
  const ih = geo.h - geo.padT - geo.padB;

  let pressTimer = null, active = false, startX = 0, startY = 0, longPressed = false, pointerId = null, lastIdx = -1;

  // クライアントX座標 → 最も近いサンプルindex（viewBoxは preserveAspectRatio="none" で横に線形伸縮）
  const indexFromClientX = (clientX) => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return 0;
    const svgX = ((clientX - rect.left) / rect.width) * geo.w;
    let i = Math.round(((svgX - geo.padL) / iw) * (n - 1));
    return Math.max(0, Math.min(n - 1, i));
  };
  // 選択位置マーカー（縦線）を該当indexへ移動して表示
  const showMarker = (idx) => {
    const rect = svg.getBoundingClientRect();
    const px = (geo.padL + (n === 1 ? iw / 2 : (idx / (n - 1)) * iw)) / geo.w * rect.width;
    marker.style.left = `${px}px`;
    marker.style.top = `${(geo.padT / geo.h) * rect.height}px`;
    marker.style.height = `${(ih / geo.h) * rect.height}px`;
    marker.classList.add('on');
  };
  const hideMarker = () => { marker.classList.remove('on'); };

  // 詳細を表示（該当日のスナップショットをボトムシートで表示）。同じ位置なら再計算しない（スライド時の負荷軽減）。
  const selectIndex = (idx) => {
    if (idx === lastIdx && _simDetailSheet) { showMarker(idx); return; }
    lastIdx = idx;
    showMarker(idx);
    const pt = sampled[idx];
    openSimDetailSheet(plan, pt.date, secret, {
      onClose: hideMarker,
      onStep: (dir) => { // シートの前後ボタン（キーボード・ボタン操作用）
        const ni = Math.max(0, Math.min(n - 1, idx + dir));
        if (ni !== idx) selectIndex(ni);
      },
    });
  };

  const clearTimer = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
  const activate = (clientX) => { active = true; longPressed = true; container.style.touchAction = 'none'; selectIndex(indexFromClientX(clientX)); haptic?.(); };

  const onDown = (e) => {
    if (secret) return;
    const isMouse = e.pointerType === 'mouse';
    pointerId = e.pointerId;
    startX = e.clientX; startY = e.clientY; longPressed = false; active = false;
    clearTimer();
    // スマホ: 約500msの長押しで起動。PC(マウス): 長押しでも起動（クリックはupで判定）
    pressTimer = setTimeout(() => activate(e.clientX), 500);
    if (isMouse) { try { container.setPointerCapture(e.pointerId); } catch {} }
  };
  const onMove = (e) => {
    if (e.pointerId !== pointerId) return;
    if (!active) {
      // 長押し前に大きく動いたらスクロール意図とみなしタイマー解除（＝通常スクロールを許可）
      if (Math.abs(e.clientX - startX) > 12 || Math.abs(e.clientY - startY) > 12) clearTimer();
      return;
    }
    // 長押し確定後: 指を左右に動かして日付を切り替える。ページはスクロールさせない。
    e.preventDefault();
    selectIndex(indexFromClientX(e.clientX));
  };
  const onUp = (e) => {
    if (e.pointerId !== pointerId) return;
    clearTimer();
    container.style.touchAction = '';
    const isMouse = e.pointerType === 'mouse';
    const moved = Math.abs(e.clientX - startX) > 12 || Math.abs(e.clientY - startY) > 12;
    // PCのクリック（短押し・ほぼ静止）でも詳細を表示する
    if (!longPressed && isMouse && !moved) selectIndex(indexFromClientX(e.clientX));
    active = false; pointerId = null;
  };
  const onCancel = () => { clearTimer(); container.style.touchAction = ''; active = false; pointerId = null; };

  container.addEventListener('pointerdown', onDown);
  container.addEventListener('pointermove', onMove, { passive: false });
  container.addEventListener('pointerup', onUp);
  container.addEventListener('pointercancel', onCancel);
  container.addEventListener('pointerleave', onCancel);
  // iOSでは長押し確定後のスクロールを touchmove の preventDefault で確実に止める（ページを動かさない）
  container.addEventListener('touchmove', (e) => { if (active) e.preventDefault(); }, { passive: false });
  // iPhoneの文字選択メニュー・コンテキストメニュー・長押し拡大を抑止
  container.addEventListener('contextmenu', (e) => e.preventDefault());
}

// 現在開いている詳細シート（同時に1つだけ）
let _simDetailSheet = null;
function closeSimDetailSheet() {
  if (!_simDetailSheet) return;
  const { root, onDocPointer, onClose } = _simDetailSheet;
  document.removeEventListener('pointerdown', onDocPointer, true);
  root.remove();
  _simDetailSheet = null;
  onClose?.();
}

// 日付別詳細のボトムシート（グラフ長押しで表示）。仕様§6の項目を表示する。
function openSimDetailSheet(plan, dateISO, secret, { onClose, onStep } = {}) {
  const pt = IS.idealSnapshotAt(plan, dateISO);
  const money = (v) => (secret ? '＊＊＊' : yen(v));
  const signMoney = (v) => (secret ? '＊＊＊' : (v > 0 ? '+' : '') + yen(v));

  // 既存シートがあれば中身だけ差し替え（スライドで日付を変えても再生成しない）
  let root, body;
  if (_simDetailSheet) {
    root = _simDetailSheet.root;
    body = root.querySelector('.fc-sim-sheet-body');
    _simDetailSheet.onClose = onClose; // 最新のマーカー消去コールバックへ更新
    body.innerHTML = '';
  } else {
    root = el('div', { class: 'fc-sim-sheet-wrap' });
    const sheet = el('div', { class: 'fc-sim-sheet' });
    const header = el('div', { class: 'fc-sim-sheet-head' },
      el('b', { class: 'fc-sim-sheet-date' }),
      el('button', { class: 'fc-sim-sheet-close', type: 'button', 'aria-label': '閉じる', html: iconHtml('x', { size: 18 }), onclick: () => closeSimDetailSheet() }));
    body = el('div', { class: 'fc-sim-sheet-body' });
    const nav = el('div', { class: 'fc-sim-sheet-nav' },
      el('button', { class: 'fc-btn ghost', type: 'button', text: '← 前の日付', onclick: () => onStepRef.fn?.(-1) }),
      el('button', { class: 'fc-btn ghost', type: 'button', text: '次の日付 →', onclick: () => onStepRef.fn?.(1) }));
    sheet.append(header, body, nav);
    root.append(sheet);
    document.body.append(root);
    // グラフ外（シート外）をタップすると閉じる
    const onDocPointer = (e) => { if (!sheet.contains(e.target) && !e.target.closest('.fc-sim-chart')) closeSimDetailSheet(); };
    setTimeout(() => document.addEventListener('pointerdown', onDocPointer, true), 0);
    _simDetailSheet = { root, onDocPointer, onClose, onStepRef: { fn: onStep } };
  }
  // onStep を毎回更新（indexが変わるたび差し替え）
  const onStepRef = _simDetailSheet.onStepRef;
  onStepRef.fn = onStep;

  root.querySelector('.fc-sim-sheet-date').textContent = fmtDateLong(pt.date);
  const shortBadge = pt.shortfall
    ? el('span', { class: 'fc-pill neg', text: '資金不足あり' })
    : el('span', { class: 'fc-pill', text: '資金不足なし' });
  body.append(
    el('div', { class: 'fc-kv' },
      kv('証券口座現金', money(pt.secCash)),
      kv('当日の入金額', signMoney(pt.dayDeposit)),
      kv('当日のNISA購入額', pt.dayNisa ? '−' + money(pt.dayNisa) : money(0)),
      kv('当日の個別株購入額', pt.dayStock ? '−' + money(pt.dayStock) : money(0)),
      kv('元本', money(pt.principal)),
      kv('評価額', money(pt.valuation)),
      kv('評価損益', signMoney(pt.profit)),
      kv('利益率', pt.profitRate == null ? '—' : `${pt.profitRate >= 0 ? '+' : ''}${pt.profitRate.toFixed(1)}%`),
      kv('合計資産', money(pt.total))),
    el('div', { class: 'fc-sim-sheet-badge' }, el('span', { text: 'その日の資金不足' }), shortBadge),
  );
}

// ---- 日付別の詳細（どの日にいくら入金・投資したか） ----
function idealDateLookupCard(plan, secret) {
  const meta = IS.runIdealPlan(plan);
  const from = meta.from, to = meta.to;
  const [fy, fm, fd] = from.split('-');
  const oneYear = `${Number(fy) + 1}-${fm}-${fd}`;
  const defaultDate = oneYear <= to ? oneYear : to;
  const dateInp = inputEl({ type: 'date', value: ui.simCheckDate || defaultDate, min: from, max: to });
  const result = el('div', {});
  const draw = () => {
    const iso = dateInp.value || from;
    const pt = IS.idealSnapshotAt(plan, iso);
    const profitRate = pt.principal > 0 ? ((pt.valuation - pt.principal) / pt.principal) * 100 : null;
    const money = (v) => (secret ? '＊＊＊' : yen(v));
    result.innerHTML = '';
    result.append(el('div', { class: 'fc-kv' },
      kv('証券口座現金', money(pt.secCash)),
      kv('入金累計額', money(pt.cumDeposit)),
      kv('元本', money(pt.principal)),
      kv('評価額', money(pt.valuation)),
      kv('評価損益', money(pt.profit)),
      kv('必要な追加資金', money(pt.requiredExtra)),
      kv('利益率', profitRate == null ? '—' : `${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(1)}%`)));
    // その日までの入出金タイムライン（直近を優先）
    const log = pt.log || [];
    const MAX = 60;
    const shown = log.length > MAX ? log.slice(-MAX) : log;
    result.append(shown.length
      ? el('div', {}, el('p', { class: 'fc-field-hint', text: log.length > MAX ? `入金・投資の履歴（直近${MAX}件／全${log.length}件）` : '入金・投資の履歴' }),
        el('div', { class: 'fc-kv' }, ...shown.map((r) => el('div', { class: 'fc-kv-row' },
          el('span', { text: `${fmtDate(r.date)}  ${r.name}` }),
          el('b', { class: r.amount < 0 ? 'neg' : '', text: secret ? '＊＊＊' : (r.amount < 0 ? '−' : '+') + yen(Math.abs(r.amount)) + `（残高 ${yen(r.secAfter)}）` })))))
      : el('p', { class: 'fc-field-hint', text: '選択日までに発生した入金・投資はありません。' }));
  };
  dateInp.addEventListener('change', () => { ui.simCheckDate = dateInp.value; draw(); });
  draw();
  return card(sectionTitle('日付別の詳細'), field('日付を選択', dateInp), result);
}

// ---- 保存プラン（複数保存・比較・実際の設定へ反映） ----
function idealPlansCard(st, fs, plan) {
  const secret = st.settings.secret;
  const plans = fs.simPlans || [];
  const rows = plans.length ? el('div', { class: 'fc-list' }, ...plans.map((pl) => {
    const end = IS.runIdealPlan(pl.plan).summary;
    return el('div', { class: 'fc-row tap', onclick: () => idealPlanDetail(pl) },
      el('div', { class: 'fc-row-ic', html: iconHtml('database', { size: 18 }) }),
      el('div', { class: 'fc-row-main' },
        el('div', { class: 'fc-row-title', text: pl.name }),
        el('div', { class: 'fc-row-sub', text: `${pl.plan.years}年・年${(Number(pl.plan.annualReturn) || 0).toFixed(1)}%・評価額 ${secret ? '＊＊＊' : yen(end.valuation)}` })),
      el('span', { class: 'fc-link-arrow', html: iconHtml('chevronRight', { size: 16 }) }));
  })) : el('p', { class: 'fc-empty', text: '作成したシミュレーションプランを保存すると、あとから読み込み・比較できます（例: 毎月7万円入金プラン / 毎日3,000円積立プラン）。' });

  const compare = plans.length >= 2 ? idealCompareBlock(plans, secret) : '';

  return card(
    sectionTitle('保存したシミュレーションプラン', el('button', { class: 'fc-link', type: 'button', onclick: () => idealPlanSaveForm(plan) },
      el('span', { class: 'fc-add-ic sm', html: iconHtml('plus', { size: 14 }) }), el('span', { text: '現在のプランを保存' }))),
    rows,
    compare,
    el('button', { class: 'fc-btn primary block', type: 'button', text: '現在のプランを実際の設定へ反映', onclick: () => idealApplyToReal(plan) }),
    el('p', { class: 'fc-note', text: '保存したシミュレーションプランは実際の証券口座データとは分離されています。「実際の設定へ反映」を押したときだけ、確認のうえ実際の積立設定へ反映します。' }),
  );
}
// 複数プランの将来評価額を重ねて比較
function idealCompareBlock(plans, secret) {
  if (secret) return '';
  const palette = ['#34c759', '#0a84ff', '#ff9500', '#bf5af2', '#ff375f', '#5ac8fa'];
  const seriesList = plans.slice(0, 6).map((pl, idx) => {
    const src = IS.runIdealPlan(pl.plan).series;
    const step = Math.max(1, Math.floor(src.length / 48));
    const sampled = src.filter((_, i) => i % step === 0 || i === src.length - 1);
    return { label: pl.name, color: palette[idx % palette.length], data: sampled.map((p, i) => ({ label: i === 0 ? '開始' : `${parseISO(p.date).getFullYear()}`, value: p.valuation })) };
  });
  return el('div', {}, el('h3', { class: 'fc-subhead', text: '保存プランの比較（将来評価額）' }),
    el('div', { class: 'fc-chart', html: multiLineChart(seriesList, { height: 220 }) }),
    el('div', { class: 'fc-chipwrap' }, ...seriesList.map((s) => el('span', { class: 'fc-serieschip on', style: `background:${s.color}22;color:${s.color};border-color:${s.color}66` }, el('i', { class: 'dot', style: `background:${s.color}` }), el('span', { text: s.label })))));
}
function idealPlanSaveForm(plan) {
  const name = inputEl({ placeholder: '例）毎月7万円入金プラン / 毎日3,000円積立プラン' });
  modal('シミュレーションプランを保存', field('プラン名', name), {
    onSave: (close) => {
      if (!name.value.trim()) return toast('プラン名を入力してください', 'alert');
      S.update((s) => {
        (s.futureSim.simPlans ||= []).push({ id: uid('iplan'), name: name.value.trim(), savedAt: today(), plan: JSON.parse(JSON.stringify(s.futureSim.simPlan)) });
      });
      render(); toast('保存しました'); close();
    },
  });
}
function idealPlanDetail(pl) {
  const s = IS.runIdealPlan(pl.plan).summary;
  const secret = S.getState().settings.secret;
  const money = (v) => (secret ? '＊＊＊' : yen(v));
  const body = el('div', {},
    el('div', { class: 'fc-kv' },
      kv('保有期間', `${pl.plan.years}年`), kv('想定年利', `年${(Number(pl.plan.annualReturn) || 0).toFixed(1)}%`),
      kv('初期証券口座現金', money(pl.plan.initialSecCash)), kv('入金設定', `${(pl.plan.deposits || []).length}件`),
      kv('投資設定', `${(pl.plan.investments || []).length}件`), kv('将来評価額', money(s.valuation)),
      kv('現金不足時の処理', pl.plan.shortageMode === 'continue' ? '不足を無視して継続' : '厳密に再現'), kv('保存日', fmtDateLong(pl.savedAt))),
    el('button', { class: 'fc-btn primary block', type: 'button', text: 'このプランを編集用に読み込む', onclick: () => {
      S.update((s) => { s.futureSim.simPlan = JSON.parse(JSON.stringify(pl.plan)); });
      render(); toast('読み込みました'); closeModal();
    } }),
    el('button', { class: 'fc-btn danger block', type: 'button', text: 'このプランを削除', onclick: () => confirmDialog('プランを削除', `「${pl.name}」を削除しますか？`, () => {
      S.update((s) => { s.futureSim.simPlans = s.futureSim.simPlans.filter((x) => x.id !== pl.id); });
      render(); toast('削除しました', 'trash'); closeModal();
    }) }),
  );
  modal(pl.name, body, {});
}

// 現在のシミュレーションプランを実際の積立設定へ反映（明示操作＋確認後のみ・best-effort）
function idealApplyToReal(plan) {
  const st = S.getState();
  const secAccs = Sec.securitiesAccounts(st);
  if (!secAccs.length) return toast('先に証券口座を登録してください', 'alert');
  const secAcc = secAccs[0];
  const indexHoldings = Sec.accountHoldings(secAcc).filter(Sec.isIndex);
  const bankAcc = st.accounts.find((a) => !Sec.isSecurities(a));
  const monthlyDeposits = (plan.deposits || []).filter((d) => d.enabled !== false && (d.frequency || 'monthly') === 'monthly');
  const nisaInvestments = (plan.investments || []).filter((v) => v.enabled !== false && (v.kind || 'nisa') !== 'stock');

  const willTransfer = bankAcc ? monthlyDeposits.length : 0;
  const willAccum = indexHoldings.length ? nisaInvestments.length : 0;
  const notes = [];
  notes.push(`証券口座「${secAcc.name}」へ反映します。`);
  notes.push(willTransfer ? `・毎月の入金 ${willTransfer}件 → 固定振替（${bankAcc.name} → ${secAcc.name}）を新規作成` : '・毎月の入金: 反映対象なし（銀行口座または毎月入金の設定が必要です）');
  notes.push(willAccum ? `・NISA投資 ${willAccum}件 → 積立設定（対象: ${indexHoldings[0].name}）を新規作成` : '・NISA投資: 反映対象なし（インデックス銘柄の登録が必要です）');
  notes.push('※ 既存の残高・積立実績・取引履歴は変更しません。個別株の購入予定・毎週/毎日の入金は反映対象外です。');

  if (!willTransfer && !willAccum) return toast('反映できる設定がありません（銀行口座・インデックス銘柄を登録してください）', 'alert');

  const body = el('div', {}, ...notes.map((t) => el('p', { class: 'fc-field-hint', text: t })));
  modal('実際の設定へ反映', body, {
    saveLabel: '反映する',
    onSave: (close) => {
      S.update((s) => {
        const acc = s.accounts.find((a) => a.id === secAcc.id);
        const bank = s.accounts.find((a) => !Sec.isSecurities(a));
        const holding = (acc.holdings || []).filter(Sec.isIndex)[0];
        if (bank) for (const d of monthlyDeposits) {
          (s.recurringTransfers ||= []).push({ id: uid('rtr'), createdAt: today(), fromAccountId: bank.id, toAccountId: acc.id, amount: Number(d.amount) || 0, day: Number(d.day) || 15, startDate: d.startDate || null, endDate: d.endDate || null, memo: d.memo || 'シミュレーションプランから反映' });
        }
        if (holding) for (const v of nisaInvestments) {
          const freq = v.frequency || 'daily';
          (acc.accumulations ||= []).push({
            id: uid('acm'), holdingId: holding.id, frequency: freq,
            dailyAmount: freq === 'monthly' ? 0 : (Number(v.amount) || 0),
            monthlyAmount: freq === 'monthly' ? (Number(v.amount) || 0) : 0,
            startDate: v.startDate || null, endDate: v.endDate || null,
            pauseStart: null, pauseEnd: null,
            includeHolidays: v.includeHolidays === true, nonBusinessDay: v.nonBusinessDay || 'skip',
            enabled: true,
          });
        }
        S.computeRecurringSchedule(s);
      });
      render(); toast('実際の設定へ反映しました'); close();
    },
  });
}

// モーダルを閉じる共通ヘルパー。直接DOM削除を廃止し、必ず安全な一括クローズを通す
// （unlockBodyScroll・スクロール位置復帰・カウンタ整合を保証）。
function closeModal() { closeAllModals(); }

// ---- STEP1: 条件を決める（保有期間＋想定年利を1枚にまとめる） ----
// 保有期間と想定年利を近い場所に置き、まず何を決めればよいかを分かりやすくする。
// 詳細設定感のある「全銘柄へ一律適用」は折りたたみに入れて初期の情報量を抑える。
function futureConditionsCard(fs) {
  // 保有期間（ワンタップ切替）
  const periodSeg = el('div', { class: 'fc-period' });
  for (const y of FS.YEAR_OPTIONS)
    periodSeg.append(el('button', { class: 'fc-period-btn' + (fs.years === y ? ' on' : ''), type: 'button', text: `${y}年`, onclick: () => { S.update((s) => { s.futureSim.years = y; }); render(); } }));

  // 想定年利（クイックチップ＋スライダー）
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

  // 全銘柄へ一律適用（詳細設定）: 折りたたみ内に格納
  const useOverride = fs.useOverride !== false;
  const toggleRow = el('div', { class: 'fc-field-toggle' },
    el('div', {}, el('div', { class: 'fc-field-lab', text: '一律の想定年利を全銘柄へ適用' }),
      el('div', { class: 'fc-field-hint', text: 'OFFにすると銘柄ごとに設定した想定年利・計算方式を使います。' })),
    toggle(useOverride, () => { S.update((s) => { s.futureSim.useOverride = !useOverride; }); render(); }));

  return card(
    el('h3', { class: 'fc-subhead first', text: '① 保有期間' }),
    periodSeg,
    el('h3', { class: 'fc-subhead', text: '② 想定年利' }),
    chips,
    el('div', { class: 'fc-slider-row' }, slider, sliderLabel),
    el('p', { class: 'fc-field-hint', text: 'チップかスライダーで、1年あたり何％で増える想定かを選びます。' }),
    collapsible('rateOverride', '詳細設定：全銘柄へ一律適用', toggleRow),
  );
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

// ---- 資産推移（任意の日付を選んで内訳を確認） ----
// 選択日ごとに snapshotAt() で証券口座現金・元本・評価額・合計資産・利益率を日次で再計算する。
// 口座の現在値をそのまま表示せず、選択日までの資金移動（振替・積立・購入・出金）を反映した結果で上書きする。
function futureDateLookupCard(state, fs) {
  const secret = state.settings.secret;
  const years = Math.max(fs.years, 30);
  // 実際の設定に基づく予測。証券口座現金の内訳を確認するため日次で精密計算する。
  const snapOpts = { years, mode: 'reality' };
  // 1回計算して from（現在）/to（最終日）を取得し、日付入力の範囲・既定日を決める（空文字はクランプで現在日になる）。
  const meta = FS.snapshotAt(state, '', snapOpts);
  const from = meta.from, to = meta.to;
  // 既定は現在から1年後（範囲内にクランプ）
  const [fy, fm, fd] = from.split('-');
  const oneYear = `${Number(fy) + 1}-${fm}-${fd}`;
  const defaultDate = oneYear <= to ? oneYear : to;
  const dateInp = inputEl({ type: 'date', value: ui.futureCheckDate || defaultDate, min: from, max: to });
  const result = el('div', {});
  const draw = () => {
    const iso = dateInp.value || from;
    // 選択日まで日次で再計算した精密スナップショット（積立履歴つき）
    const pt = FS.snapshotAt(state, iso, { ...snapOpts, logAccruals: true });
    const profitRate = pt.principal > 0 ? ((pt.valuation - pt.principal) / pt.principal) * 100 : null;
    result.innerHTML = '';
    const dateLabel = fmtDateLong(pt.date);
    // タップで内訳を表示できる行（銀行残高・証券口座現金・元本・評価額・合計資産）
    const tapRow = (label, val, onTap) => {
      const row = kv(label, secret ? '＊＊＊' : yen(val));
      row.classList.add('tap');
      row.append(el('span', { class: 'fc-kv-chev', html: iconHtml('chevronRight', { size: 14 }) }));
      row.addEventListener('click', onTap);
      return row;
    };
    result.append(el('div', { class: 'fc-kv' },
      tapRow('銀行残高', pt.bankCash, () => bankBreakdownModal(pt, dateLabel)),
      tapRow('証券口座現金', pt.secCash, () => secCashBreakdownModal(pt, dateLabel)),
      tapRow('元本', pt.principal, () => principalBreakdownModal(pt, dateLabel)),
      tapRow('評価額', pt.valuation, () => valuationBreakdownModal(pt, dateLabel)),
      tapRow('合計資産', pt.total, () => totalBreakdownModal(pt, dateLabel)),
      kv('利益率', profitRate == null ? '—' : `${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(1)}%`)));
  };
  dateInp.addEventListener('change', () => { ui.futureCheckDate = dateInp.value; draw(); });
  draw();
  return card(sectionTitle('資産推移を確認'), field('日付を選択', dateInp), result);
}

// 残高内訳モーダルの共通描画（現在残高＋増減の累計＝選択日残高）。
// rows: [ラベル, 符号付き金額, negフラグ]。hint: 補足説明。resultLabel/resultVal: 選択日残高。
function balanceBreakdownModal(title, resultLabel, resultVal, hint, rows) {
  const secret = S.getState().settings.secret;
  const money = (v) => (secret ? '＊＊＊' : yen(Math.abs(v)));
  const shown = rows.filter(([, v]) => Math.abs(Number(v) || 0) > 0);
  const body = el('div', {},
    el('div', { class: 'fc-perf-latest-rate' }, el('span', { text: resultLabel }),
      el('b', { class: resultVal < 0 ? 'neg' : '', text: secret ? '＊＊＊' : yen(resultVal) })),
    hint ? el('p', { class: 'fc-field-hint', text: hint }) : '',
    el('div', { class: 'fc-kv' }, ...shown.map(([label, v, neg]) =>
      el('div', { class: 'fc-kv-row' }, el('span', { text: label }),
        el('b', { class: neg ? 'neg' : '', text: secret ? '＊＊＊' : (v < 0 ? '−' : '') + money(v) })))),
  );
  modal(title, body, {});
}

// 銀行残高の内訳（現在残高＋収入−支出−証券への振替＋証券からの振替＝選択日残高）
function bankBreakdownModal(pt, dateLabel) {
  balanceBreakdownModal(`銀行残高の内訳（${dateLabel}）`, '選択日の銀行残高', pt.bankCash,
    '銀行残高は収入で増え、支出で減ります。証券口座への振替は銀行残高のみを減らし、同額が証券口座現金へ移ります。投資の評価益や投資元本は銀行残高には含めません。', [
    ['現在残高', pt.bankInitial, false],
    ['収入累計', pt.bankIncome, false],
    ['支出累計', -pt.bankExpense, true],
    ['証券口座への振替累計', -pt.bankXferToSec, true],
    ['証券口座からの振替累計', pt.bankXferFromSec, false],
  ]);
}

// 証券口座現金の内訳（初期残高＋振替入金＋その他入金−NISA購入−個別株購入−振替出金）＋積立日ごとの履歴
function secCashBreakdownModal(pt, dateLabel) {
  const secret = S.getState().settings.secret;
  const money = (v) => (secret ? '＊＊＊' : yen(Math.abs(v)));
  const rows = [
    ['現在残高', pt.secCashInitial, false],
    ['銀行からの振替累計', pt.secXferIn, false],
    ['その他の入金累計', pt.secDepositIn, false],
    ['NISA購入累計', -pt.secNisaBuy, true],
    ['個別株購入累計', -pt.secStockBuy, true],
    ['証券→銀行の振替累計', -pt.secXferOut, true],
    ['その他の出金累計', -pt.secWithdraw, true],
  ];
  const shown = rows.filter(([, v]) => Math.abs(Number(v) || 0) > 0);
  const hint = '銀行→証券の振替で入金し、NISA積立・個別株購入で投資元本へ移動します。振替や購入は資産間の移動のため合計資産は変わりません。';
  // 積立日ごとの履歴（選択日までの発生順。件数が多い場合は直近を優先表示）
  const log = pt.accrualLog || [];
  const MAX = 60;
  const shownLog = log.length > MAX ? log.slice(-MAX) : log;
  const timeline = shownLog.length
    ? el('div', {},
        el('p', { class: 'fc-field-hint', text: log.length > MAX ? `積立・入出金の履歴（直近${MAX}件／全${log.length}件）` : '積立・入出金の履歴' }),
        el('div', { class: 'fc-kv' }, ...shownLog.map((r) =>
          el('div', { class: 'fc-kv-row' },
            el('span', { text: `${fmtDate(r.date)}  ${r.name}` }),
            el('b', { class: r.amount < 0 ? 'neg' : '', text: secret ? '＊＊＊' : (r.amount < 0 ? '−' : '+') + money(r.amount) + `（残高 ${money(r.secAfter)}）` })))))
    : el('p', { class: 'fc-field-hint', text: '選択日までに発生した積立・入出金はありません。' });
  const body = el('div', {},
    el('div', { class: 'fc-perf-latest-rate' }, el('span', { text: '選択日の証券口座現金' }),
      el('b', { class: pt.secCash < 0 ? 'neg' : '', text: secret ? '＊＊＊' : yen(pt.secCash) })),
    el('p', { class: 'fc-field-hint', text: hint }),
    el('div', { class: 'fc-kv' }, ...shown.map(([label, v, neg]) =>
      el('div', { class: 'fc-kv-row' }, el('span', { text: label }),
        el('b', { class: neg ? 'neg' : '', text: secret ? '＊＊＊' : (v < 0 ? '−' : '') + money(v) })))),
    timeline,
  );
  modal(`証券口座現金の内訳（${dateLabel}）`, body, {});
}

// 元本の内訳（NISA元本＋個別株元本）。元本は評価額とは別の参考情報で、合計資産へは加算しない。
function principalBreakdownModal(pt, dateLabel) {
  balanceBreakdownModal(`元本の内訳（${dateLabel}）`, '選択日の投資元本', pt.principal,
    '元本は購入時に証券口座現金から移動した投資額の累計です。評価額とは別の参考値で、二重計上を避けるため合計資産には加算しません。', [
    ['NISA元本', pt.indexPrincipal, false],
    ['個別株元本', pt.stockPrincipal, false],
  ]);
}

// 評価額の内訳（NISA評価額＋個別株評価額）
function valuationBreakdownModal(pt, dateLabel) {
  balanceBreakdownModal(`評価額の内訳（${dateLabel}）`, '選択日の投資評価額', pt.valuation,
    '評価額は保有銘柄の時価合計です。合計資産にはこの評価額を加算します（元本は加算しません）。', [
    ['NISA評価額', pt.indexValuation, false],
    ['個別株評価額', pt.stockValuation, false],
  ]);
}

// 合計資産の内訳（銀行残高＋証券口座現金＋評価額。元本は二重計上を避けるため含めない）
function totalBreakdownModal(pt, dateLabel) {
  balanceBreakdownModal(`合計資産の内訳（${dateLabel}）`, '選択日の合計資産', pt.total,
    '合計資産＝銀行残高＋証券口座現金＋投資評価額。投資元本は評価額と重複するため合計資産へは加算しません。', [
    ['銀行残高', pt.bankCash, false],
    ['証券口座現金', pt.secCash, false],
    ['投資評価額', pt.valuation, false],
  ]);
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
        render(); toast('削除しました', 'trash'); closeAllModals();
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
        render(); toast('削除しました', 'trash'); closeAllModals();
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
  const closeCur = () => closeAllModals(); // 選択モーダルを安全に閉じてから編集フォームを開く
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
        render(); toast('削除しました', 'trash'); closeAllModals();
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
        closeAllModals();
      },
    }),
    el('button', {
      class: 'fc-btn danger block', type: 'button', text: 'このプランを削除',
      onclick: () => confirmDialog('プランを削除', `「${p.name}」を削除しますか？`, () => {
        S.update((s) => { s.futureSim.plans = s.futureSim.plans.filter((x) => x.id !== p.id); });
        render(); toast('削除しました', 'trash'); closeAllModals();
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
  const b = amountInput(S.getState().settings.monthlyBudget); // 月の予算（円・3桁区切り）
  modal('月の予算', field('予算（円）', b), { onSave: (close) => { S.update((s) => { s.settings.monthlyBudget = amountValue(b); }); render(); toast('保存しました'); close(); } });
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
  const amount = amountInput(r?.amount); // 固定収支金額（円・3桁区切り）
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
    !isNew && el('button', { class: 'fc-btn danger block', type: 'button', text: '削除', onclick: () => confirmDialog('固定収支を削除', '削除しますか？', () => { S.update((s) => { s.recurring = s.recurring.filter((x) => x.id !== r.id); }); render(); toast('削除しました', 'trash'); closeAllModals(); }) }));
  modal(isNew ? '固定収支を追加' : '固定収支を編集', body, {
    onSave: (close) => {
      if (!name.value.trim() || !amountValue(amount)) return toast('名称と金額を入力してください', 'alert');
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
        const rec = { type, name: name.value.trim(), day: day.value === 'end' ? 'end' : Number(day.value), amount: amountValue(amount), categoryId: catId, accountId, paymentMethod: type === 'expense' ? pm : 'bank', cardId, startDate: startDate.value || null, endDate: endDate.value || null };
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
    !isNew && el('button', { class: 'fc-btn danger block', type: 'button', text: '削除', onclick: () => confirmDialog('カテゴリーを削除', `「${c.name}」を削除しますか？関連取引は「未分類」になります。`, () => { S.update((s) => { s.categories[kind] = s.categories[kind].filter((x) => x.id !== c.id); }); render(); toast('削除しました', 'trash'); closeAllModals(); }) }));
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
  const st = S.getState();
  const wrap = el('div', { class: 'fc-view' });
  wrap.append(headTitle('データ管理'));
  // 最終バックアップ日時（データ管理の上部に表示）
  const backupAt = fmtBackupTime(st.settings.lastBackupAt);
  wrap.append(el('div', { class: 'fc-backup-status' },
    el('span', { class: 'fc-backup-lab', text: '最終バックアップ' }),
    el('span', { class: 'fc-backup-val' + (backupAt ? '' : ' none'), text: backupAt || 'バックアップが作成されていません' })));
  wrap.append(card(sectionTitle('バックアップ・復元'),
    el('p', { class: 'fc-note', text: 'すべてのデータをJSONファイルとして書き出し／読み込みできます。' }),
    btnIcon('primary block', 'down', 'バックアップを書き出す', exportBackup),
    btnIcon('ghost block', 'up', 'バックアップから復元', () => importFile('json'))));
  wrap.append(card(sectionTitle('CSV'),
    el('p', { class: 'fc-note', text: '取引履歴（収入・支出）をCSVで入出力できます。列: 日付,種別,金額,カテゴリー,口座,メモ（旧形式の口座なしCSVも取り込めます）' }),
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
  // 最終バックアップ日時（日本時間ISO）を設定に記録してから書き出す。
  S.update((s) => { s.settings.lastBackupAt = Sec.jstNowISO(); }, { silent: true });
  download(`finance-backup-${today()}.json`, JSON.stringify(S.getState(), null, 2));
  render(); // 「最終バックアップ」表示・ホームの案内を更新
  toast('バックアップを書き出しました', 'database');
}

// 保存済みのISO(例 2026-07-24T21:30:00+09:00)を「2026年7月24日 21:30」形式で表示する。
function fmtBackupTime(iso) {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return `${Number(y)}年${Number(mo)}月${Number(d)}日 ${h}:${mi}`;
}
// 最終バックアップからの経過日数（未実施なら null）。ホームの案内表示に使用。
function daysSinceBackup(st) {
  const iso = st.settings?.lastBackupAt;
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return (Date.now() - then) / 86400000;
}
function exportCSV() {
  // 口座ベース設計に合わせ、各取引の口座名も出力する（列: 日付,種別,金額,カテゴリー,口座,メモ）
  const st = S.getState();
  const rows = [['日付', '種別', '金額', 'カテゴリー', '口座', 'メモ']];
  for (const t of st.transactions.slice().sort((a, b) => a.date.localeCompare(b.date)))
    rows.push([t.date, t.type === 'income' ? '収入' : '支出', t.amount,
      S.findCategory(t.categoryId).name, S.findAccount(t.accountId)?.name || '',
      (t.memo || '').replace(/"/g, '""')]);
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
// CSV解析: 新形式(日付,種別,金額,カテゴリー,口座,メモ)と旧形式(日付,種別,金額,カテゴリー,メモ)の両対応。
// すぐには保存せず、確認画面のための構造化データ（行・エラー行番号・形式）を返す。
function parseCsvTransactions(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  let hi = 0;
  while (hi < lines.length && !lines[hi].trim()) hi++;
  const header = parseCsvLine(lines[hi] || '').map((h) => h.trim());
  const hasAccountCol = header.includes('口座'); // 口座列の有無で新旧を判定
  const rows = [], errorLines = [];
  for (let i = hi + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCsvLine(lines[i]);
    const lineNo = i + 1; // 1始まりの行番号
    if (cols.length < (hasAccountCol ? 4 : 3)) { errorLines.push(lineNo); continue; }
    const date = (cols[0] || '').trim().slice(0, 10);
    const typeJa = (cols[1] || '').trim();
    const amount = Math.round(Number(String(cols[2] ?? '').replace(/[^\d.-]/g, '')) || 0);
    const catName = (cols[3] || '').trim();
    const accName = hasAccountCol ? (cols[4] || '').trim() : null;
    const memo = hasAccountCol ? (cols[5] || '') : (cols[4] || '');
    const type = typeJa.includes('収') ? 'income' : (typeJa.includes('支') ? 'expense' : null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !type || !amount) { errorLines.push(lineNo); continue; }
    rows.push({ lineNo, date, type, amount, catName, accName, memo });
  }
  return { format: hasAccountCol ? 'new' : 'old', rows, errorLines };
}

function doImportCSV(text) {
  let parsed;
  try { parsed = parseCsvTransactions(text); }
  catch (e) { toast('CSVの読み込みに失敗しました', 'alert'); return; }
  if (!parsed.rows.length && !parsed.errorLines.length) { toast('取り込める取引がありません', 'alert'); return; }
  csvImportModal(parsed);
}

// インポート確認画面。件数・収支合計・口座ごとの残高増減・不明カテゴリー/口座・エラー行を表示し、
// 口座の割り当て（登録済みへ割当／除外／新規作成）を選んでから確定する。
function csvImportModal(parsed) {
  const st = S.getState();
  const accByName = new Map(st.accounts.map((a) => [a.name, a.id]));
  const knownCats = new Set(S.allCategories().map((c) => c.name));

  // 旧形式: すべての取引を割り当てる登録先口座を1つ選ぶ
  let oldTargetId = st.accounts[0]?.id || '';
  // 新形式: 不明な口座名 → 'exclude' | 'create' | <accountId>
  const distinctAcc = [...new Set(parsed.rows.map((r) => r.accName ?? ''))];
  const unknownNames = parsed.format === 'new'
    ? distinctAcc.filter((n) => !accByName.has(n)) : [];
  const resolution = new Map(); // accName -> 'exclude'|'create'|accountId
  for (const n of unknownNames) resolution.set(n, 'exclude'); // 既定は誤登録防止のため除外

  // 現在の設定から「実際にインポートされる行＋割当先口座ID」を算出
  const computePlan = () => {
    const items = []; // {row, accountId}
    for (const r of parsed.rows) {
      let accountId;
      if (parsed.format === 'old') { if (!oldTargetId) continue; accountId = oldTargetId; }
      else if (accByName.has(r.accName ?? '')) accountId = accByName.get(r.accName ?? '');
      else {
        const res = resolution.get(r.accName ?? '');
        if (res === 'exclude' || res == null) continue;      // 除外
        if (res === 'create') { accountId = '__create__:' + (r.accName ?? ''); }
        else accountId = res;                                 // 既存口座へ割当
      }
      items.push({ row: r, accountId });
    }
    return items;
  };

  const body = el('div', {});
  const rebuild = () => {
    body.innerHTML = '';
    const items = computePlan();
    const incomeTotal = items.filter((i) => i.row.type === 'income').reduce((s, i) => s + i.row.amount, 0);
    const expenseTotal = items.filter((i) => i.row.type === 'expense').reduce((s, i) => s + i.row.amount, 0);
    // 口座ごとの残高増減
    const deltaByAcc = new Map();
    for (const i of items) {
      const d = (i.row.type === 'income' ? 1 : -1) * i.row.amount;
      deltaByAcc.set(i.accountId, (deltaByAcc.get(i.accountId) || 0) + d);
    }
    const newCats = new Set(parsed.rows.map((r) => r.catName).filter((c) => c && !knownCats.has(c)));

    // 形式の案内
    body.append(el('p', { class: 'fc-field-hint', text: parsed.format === 'new'
      ? '新形式（口座列あり）のCSVです。' : '旧形式（口座列なし）のCSVです。すべての取引を1つの口座へ割り当てます。' }));

    // 旧形式: 登録先口座の選択
    if (parsed.format === 'old') {
      if (!st.accounts.length) {
        body.append(el('p', { class: 'fc-empty', text: '先に口座を登録してください。' }));
      } else {
        const sel = selectEl(accountOptions(), oldTargetId);
        sel.addEventListener('change', () => { oldTargetId = sel.value; rebuild(); });
        body.append(field('登録先口座', sel));
      }
    }

    // 新形式: 不明な口座の割り当て
    if (parsed.format === 'new' && unknownNames.length) {
      body.append(el('h3', { class: 'fc-subhead', text: `未登録の口座（${unknownNames.length}件）の扱い` }));
      for (const n of unknownNames) {
        const opts = [
          { value: 'exclude', label: '取り込まない（除外）' },
          ...st.accounts.map((a) => ({ value: a.id, label: `→ ${a.name} へ割り当て` })),
        ];
        if (n) opts.push({ value: 'create', label: `新規口座「${n}」を作成` });
        const sel = selectEl(opts, resolution.get(n));
        sel.addEventListener('change', () => { resolution.set(n, sel.value); rebuild(); });
        body.append(field(n ? `「${n}」` : '（口座名なし）', sel));
      }
    }

    // 集計プレビュー
    const kv = (k, v) => el('div', { class: 'fc-kv-row' }, el('span', { text: k }), el('b', { text: v }));
    const deltaRows = [...deltaByAcc.entries()].map(([id, d]) => {
      const name = id.startsWith('__create__:') ? `${id.slice(11) || '（口座名なし）'}（新規）` : (S.findAccount(id)?.name || id);
      return kv(name, yen(d, { sign: d > 0 }));
    });
    body.append(el('div', { class: 'fc-kv' },
      kv('読み込む取引件数', `${items.length}件`),
      kv('収入合計', yen(incomeTotal)),
      kv('支出合計', yen(expenseTotal)),
      kv('存在しないカテゴリー', `${newCats.size}件（自動作成）`),
      kv('存在しない口座', `${unknownNames.length}件`),
      kv('読み込みエラーの行', parsed.errorLines.length ? parsed.errorLines.join(', ') + ' 行目' : 'なし')));
    if (deltaRows.length) {
      body.append(el('h3', { class: 'fc-subhead', text: '口座ごとの残高増減' }));
      body.append(el('div', { class: 'fc-kv' }, ...deltaRows));
    }
    if (!items.length) body.append(el('p', { class: 'fc-empty', text: 'このままでは取り込む取引がありません。上の割り当てを見直してください。' }));
    ctrl?.setSaveDisabled(!items.length);
  };

  // 確定処理（一括・アトミック）: 取引追加＋accountId設定＋残高反映＋資産/実績履歴更新を同時に行う。
  const applyImport = (close) => {
    const items = computePlan();
    if (!items.length) return;
    const needCreate = parsed.format === 'new' && [...resolution.values()].includes('create');
    const run = () => {
      S.update((s) => {
        // 事前に新規作成する口座を用意し、名前→IDを確定
        const nameToId = new Map(s.accounts.map((a) => [a.name, a.id]));
        for (const [n, res] of resolution.entries()) {
          if (res === 'create') {
            const rec = { id: uid('acc'), name: n, type: 'bank', includeInDisposable: true, balance: 0 };
            s.accounts.push(rec); nameToId.set(n, rec.id);
          }
        }
        for (const it of items) {
          const r = it.row;
          let accountId = it.accountId;
          if (accountId.startsWith('__create__:')) accountId = nameToId.get(accountId.slice(11)) || null;
          // カテゴリー: 無ければ自動作成
          let cat = s.categories[r.type].find((c) => c.name === r.catName);
          if (!cat && r.catName) { cat = { id: uid('cat'), name: r.catName, color: '#8e8e93' }; s.categories[r.type].push(cat); }
          s.transactions.push({ id: uid('tx'), date: r.date, amount: r.amount, type: r.type, categoryId: cat?.id || null, accountId, memo: r.memo || '' });
          // 残高反映（収入は+、支出は-。証券口座は adjustBalance が現金を増減し再計算する）
          adjustBalance(s.accounts.find((a) => a.id === accountId), r.type === 'income' ? r.amount : -r.amount);
        }
        S.recordAssetSnapshot(s); // 資産履歴・投資実績履歴を更新
      });
      close(); go('transactions'); toast(`${items.length}件をインポートしました`, 'down');
    };
    if (needCreate) {
      // 口座の自動作成は誤作成を防ぐため確認する
      confirmDialog('口座を自動作成', 'CSV内の未登録口座を新しい口座として作成します。よろしいですか？', run, { yesLabel: '作成して取り込む', danger: false });
    } else run();
  };

  const ctrl = modal('CSVインポートの確認', body, {
    saveLabel: 'この内容で取り込む', danger: false, onSave: applyImport, wide: true,
  });
  rebuild();
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
    // 起動時に当日の投資実績スナップショットを記録（証券口座があれば。同日は上書き）。
    // これで毎日の推移が残り、積立が実行された日も履歴・グラフへ反映される。
    S.recordPerformanceSnapshot(s);
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
  // ブラウザ履歴との連携: 起点状態を用意し、戻る操作(popstate)を受け取る。
  // 再読み込み後はホームから始まる（URLを画面ごとに分割しないため）。
  try { history.replaceState({ fcRoute: ui.route }, ''); } catch {}
  window.addEventListener('popstate', handlePopState);
  // アクセシビリティ: role="button" の要素を Enter / Space でも操作可能にする。
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    const t = e.target;
    if (t && t.getAttribute && t.getAttribute('role') === 'button' && t.tagName !== 'BUTTON') {
      e.preventDefault(); // Space によるスクロールを抑止
      t.click();
    }
  });
  // OSテーマ変更に追随（auto時）
  window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', () => { if (S.getState().settings.theme === 'auto') render(); });
}
