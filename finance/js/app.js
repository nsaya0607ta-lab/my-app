// app.js — ルーティング・画面描画・フォーム・操作の統合レイヤー
import * as S from './store.js?v=20260721b';
import * as C from './calc.js?v=20260721b';
import { lineChart, barChart, groupedBarChart, donutChart } from './charts.js?v=20260721b';
import {
  el, qs, yen, yenMasked, num, today, toISO, parseISO, ym, fmtDate, fmtDateLong,
  fmtMonth, addMonths, resolveDay, pad, weekdayName, haptic, escapeHtml, uid,
} from './utils.js?v=20260721b';

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
function sectionTitle(t, right) {
  return el('div', { class: 'fc-sec-head' }, el('h2', { class: 'fc-sec-title', text: t }), right || '');
}
function iconBtn(label, onClick, cls = '') {
  return el('button', { class: 'fc-icobtn ' + cls, type: 'button', onclick: onClick, text: label });
}
function pill(text, cls = '') { return el('span', { class: 'fc-pill ' + cls, text }); }

function toast(msg, icon = '✅') {
  const t = el('div', { class: 'fc-toast' }, el('span', { text: icon }), el('span', { text: msg }));
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
      el('button', { class: 'fc-modal-x', type: 'button', text: '✕', onclick: closeAll })),
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
function field(label, input) {
  return el('label', { class: 'fc-field' }, el('span', { class: 'fc-field-lab', text: label }), input);
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
  const total = C.totalAssets(st);
  const cur = ym(new Date());
  const pl = C.monthlyPL(st, cur);
  const upcoming = C.upcomingSettlements(st);
  const byType = C.assetsByType(st);
  const typeLabel = { cash: '現金', bank: '預金', securities: '証券', other: 'その他' };

  const wrap = el('div', { class: 'fc-view' });

  // --- 合計資産ヒーロー ---
  const hero = el('div', { class: 'fc-hero' },
    el('div', { class: 'fc-hero-row' },
      el('span', { class: 'fc-hero-lab', text: '合計資産' }),
      el('button', {
        class: 'fc-secret', type: 'button', title: 'シークレットモード',
        html: st.settings.secret ? '🙈 表示' : '👁 隠す',
        onclick: () => { S.update((s) => { s.settings.secret = !s.settings.secret; }); toast(st.settings.secret ? '金額を隠しました' : '金額を表示しました', '🔒'); },
      }),
    ),
    el('div', { class: 'fc-hero-amount' + (st.settings.secret ? ' masked' : ''), text: M(total) }),
    el('div', { class: 'fc-hero-types' },
      ...Object.entries(byType).map(([k, v]) =>
        el('span', { class: 'fc-type-chip' }, el('i', { text: typeLabel[k] || k }), el('b', { text: M(v) }))),
    ),
  );
  wrap.append(hero);

  // --- 今月自由に使えるお金 ---
  const dispCard = card(
    el('div', { class: 'fc-disp-head' }, el('span', { text: `${fmtMonth(cur)}・自由に使えるお金` }),
      el('button', { class: 'fc-link', type: 'button', text: '損益 →', onclick: () => go('pl') })),
    el('div', { class: 'fc-disp-amount ' + (pl.disposable >= 0 ? 'pos' : 'neg'), text: yen(pl.disposable, { sign: pl.disposable > 0 }) }),
    el('div', { class: 'fc-disp-bars' },
      miniBar('収入', pl.incomeTotal, Math.max(pl.incomeTotal, pl.expenseTotal), '#34c759'),
      miniBar('支出', pl.expenseTotal, Math.max(pl.incomeTotal, pl.expenseTotal), '#ff453a'),
    ),
  );
  wrap.append(dispCard);

  // --- 次回引落予定 ---
  const settleCard = card(
    sectionTitle('次回引落予定', el('button', { class: 'fc-link', type: 'button', text: 'カード →', onclick: () => go('cards') })),
    upcoming.length
      ? el('div', { class: 'fc-list' }, ...upcoming.map((u) =>
          el('div', { class: 'fc-row' },
            el('div', { class: 'fc-row-ic', html: '💳', style: `background:${u.card.color || '#333'}22` }),
            el('div', { class: 'fc-row-main' },
              el('div', { class: 'fc-row-title', text: u.card.name }),
              el('div', { class: 'fc-row-sub', text: `${fmtDate(u.payISO)} 引落・${u.count}件` })),
            el('div', { class: 'fc-row-amt neg', text: yen(u.amount) })),
        ))
      : el('p', { class: 'fc-empty', text: 'カード利用の登録がありません' }),
  );
  wrap.append(settleCard);

  // --- 口座一覧サマリー ---
  const accCard = card(
    sectionTitle('口座', el('button', { class: 'fc-link', type: 'button', text: '管理 →', onclick: () => go('accounts') })),
    st.accounts.length === 0
      ? el('button', { class: 'fc-btn ghost block', type: 'button', text: '＋ 口座を追加して残高を登録', onclick: () => accountForm() })
      : el('div', { class: 'fc-list' }, ...st.accounts.map((a) =>
      el('div', { class: 'fc-row' },
        el('div', { class: 'fc-row-ic', html: accIcon(a.type) }),
        el('div', { class: 'fc-row-main' }, el('div', { class: 'fc-row-title', text: a.name })),
        el('div', { class: 'fc-row-amt', text: M(a.balance) })),
    )),
  );
  wrap.append(accCard);

  // --- ミニ資産推移（今後12ヶ月） ---
  const sim = C.simulate(st, 12);
  const chartData = sim.map((p) => ({ label: `${parseISO(p.date).getMonth() + 1}月`, value: p.total }));
  wrap.append(card(
    sectionTitle('資産のこれから', el('button', { class: 'fc-link', type: 'button', text: '詳細 →', onclick: () => go('simulate') })),
    el('div', { class: 'fc-chart', html: st.settings.secret ? '' : lineChart(chartData, { color: '#0a84ff', height: 180 }) }),
    st.settings.secret ? el('p', { class: 'fc-empty', text: 'シークレットモード中は非表示' }) : '',
  ));

  return wrap;
}

function miniBar(label, val, max, color) {
  const pct = max > 0 ? Math.max(2, (val / max) * 100) : 0;
  return el('div', { class: 'fc-minibar' },
    el('span', { class: 'fc-minibar-lab', text: label }),
    el('div', { class: 'fc-minibar-track' }, el('div', { class: 'fc-minibar-fill', style: `width:${pct}%;background:${color}` })),
    el('span', { class: 'fc-minibar-val', text: yen(val) }),
  );
}
function accIcon(type) {
  return { cash: '💵', bank: '🏦', securities: '📈', other: '💼' }[type] || '💼';
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
        S.update((s) => { s.accounts = s.accounts.filter((x) => x.id !== acc.id); });
        render(); toast('削除しました', '🗑');
        qs('.fc-modal-back')?.classList.remove('show');
        setTimeout(() => qs('.fc-modal-back')?.remove(), 260);
      }),
    }),
  );
  modal(isNew ? '口座を追加' : '口座を編集', body, {
    onSave: (close) => {
      if (!name.value.trim()) return toast('口座名を入力してください', '⚠️');
      S.update((s) => {
        if (isNew) s.accounts.push({ id: uid('acc'), name: name.value.trim(), type: type.value, balance: Number(bal.value) || 0 });
        else { const a = s.accounts.find((x) => x.id === acc.id); a.name = name.value.trim(); a.type = type.value; a.balance = Number(bal.value) || 0; }
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
  const q = inputEl({ placeholder: '🔍 メモ・カテゴリーで検索', value: f.q });
  q.addEventListener('input', () => { f.q = q.value; renderTxList(listBox); });
  const typeSel = selectEl([{ value: 'all', label: 'すべて' }, { value: 'income', label: '収入' }, { value: 'expense', label: '支出' }], f.type);
  typeSel.addEventListener('change', () => { f.type = typeSel.value; renderTxList(listBox); });
  const catSel = selectEl([{ value: 'all', label: 'カテゴリー：すべて' }, ...S.allCategories().map((c) => ({ value: c.id, label: c.name }))], f.cat);
  catSel.addEventListener('change', () => { f.cat = catSel.value; renderTxList(listBox); });

  const advBtn = el('button', { class: 'fc-chip', type: 'button', text: '詳細条件 ▾' });
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
    el('div', { class: 'fc-filter' }, q,
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
        el('div', { class: 'fc-row-ic', style: `background:${cat.color}22;color:${cat.color}`, text: t.type === 'income' ? '＋' : '－' }),
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
        render(); toast('削除しました', '🗑');
        qs('.fc-modal-back')?.classList.remove('show'); setTimeout(() => qs('.fc-modal-back')?.remove(), 260);
      }),
    }),
  );
  modal(isNew ? '収支を追加' : '収支を編集', body, {
    onSave: (close) => {
      const amt = Number(amount.value);
      if (!amt || amt <= 0) return toast('金額を入力してください', '⚠️');
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
        el('div', { class: 'fc-row-ic', style: `background:${u.card.color}22`, html: '💳' }),
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
        el('button', { class: 'fc-icobtn', type: 'button', text: '⚙', onclick: () => cardForm(c) }),
      ),
      el('div', { class: 'fc-card-actions' },
        el('button', { class: 'fc-btn primary block', type: 'button', text: '＋ 利用を登録', onclick: () => cardTxForm(c) })),
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
  const color = inputEl({ type: 'color', value: c?.color || '#bf0000' });
  const body = el('div', {},
    field('カード名', name), field('締日', closing),
    field('引落タイミング', offset), field('引落日', payDay), field('引落口座', acc), field('カラー', color),
    !isNew && el('button', {
      class: 'fc-btn danger block', type: 'button', text: 'このカードを削除',
      onclick: () => confirmDialog('カードを削除', `「${c.name}」と利用履歴を削除しますか？`, () => {
        S.update((s) => { s.cards = s.cards.filter((x) => x.id !== c.id); s.cardTransactions = s.cardTransactions.filter((x) => x.cardId !== c.id); });
        render(); toast('削除しました', '🗑');
        qs('.fc-modal-back')?.classList.remove('show'); setTimeout(() => qs('.fc-modal-back')?.remove(), 260);
      }),
    }),
  );
  modal(isNew ? 'カードを追加' : 'カード設定', body, {
    onSave: (close) => {
      if (!name.value.trim()) return toast('カード名を入力してください', '⚠️');
      const cd = closing.value === 'end' ? 'end' : Number(closing.value);
      const pd = payDay.value === 'end' ? 'end' : Number(payDay.value);
      S.update((s) => {
        const rec = { name: name.value.trim(), closingDay: cd, payMonthOffset: Number(offset.value), payDay: pd, payAccountId: acc.value, color: color.value };
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
    if (date.value) preview.textContent = `→ ${fmtDateLong(C.settlementDate(cardObj, date.value))} 引落予定`;
  };
  date.addEventListener('input', upd); upd();
  const body = el('div', {},
    field('利用日', date), field('金額（円）', amount), field('お店・メモ', memo), field('カテゴリー（任意）', cat),
    preview,
    !isNew && el('button', {
      class: 'fc-btn danger block', type: 'button', text: 'この利用を削除',
      onclick: () => confirmDialog('利用を削除', '削除しますか？', () => {
        S.update((s) => { s.cardTransactions = s.cardTransactions.filter((x) => x.id !== tx.id); });
        render(); toast('削除しました', '🗑');
        qs('.fc-modal-back')?.classList.remove('show'); setTimeout(() => qs('.fc-modal-back')?.remove(), 260);
      }),
    }),
  );
  modal(isNew ? `${cardObj.name}・利用登録` : 'カード利用を編集', body, {
    onSave: (close) => {
      const amt = Number(amount.value);
      if (!amt || amt <= 0) return toast('金額を入力してください', '⚠️');
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
    el('span', { class: 'fc-disp-hero-lab', text: `${fmtMonth(ui.plYm)} 自由に使える金額` }),
    el('span', { class: 'fc-disp-hero-amt', text: yen(pl.disposable, { sign: pl.disposable > 0 }) }),
  ));
  if (pl.cardTotal > 0) {
    wrap.append(card(sectionTitle('カード支払予定の内訳'),
      el('div', { class: 'fc-list' }, ...pl.cardDetail.map((d) =>
        el('div', { class: 'fc-row' }, el('div', { class: 'fc-row-ic', style: `background:${d.card.color}22`, html: '💳' }),
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

// ============ 将来シミュレーション ============
function renderSimulate() {
  const st = S.getState();
  const wrap = el('div', { class: 'fc-view' });
  wrap.append(pageHead('将来シミュレーション', '設定', () => simForm()));

  const periods = [[3, '3か月'], [6, '半年'], [12, '1年'], [36, '3年'], [60, '5年'], [120, '10年']];
  const seg = el('div', { class: 'fc-period' });
  for (const [mo, lab] of periods)
    seg.append(el('button', { class: 'fc-period-btn' + (ui.simMonths === mo ? ' on' : ''), type: 'button', text: lab, onclick: () => { ui.simMonths = mo; render(); } }));
  wrap.append(seg);

  const sim = C.simulate(st, ui.simMonths);
  const last = sim[sim.length - 1];
  const start = sim[0].total;
  const diff = last.total - start;

  wrap.append(el('div', { class: 'fc-sim-hero' },
    el('div', { class: 'fc-sim-hero-col' }, el('span', { text: '現在' }), el('b', { text: M(start) })),
    el('div', { class: 'fc-sim-arrow', text: '→' }),
    el('div', { class: 'fc-sim-hero-col' }, el('span', { text: periods.find((p) => p[0] === ui.simMonths)[1] + '後' }), el('b', { class: diff >= 0 ? 'pos' : 'neg', text: M(last.total) })),
  ));
  wrap.append(el('div', { class: 'fc-sim-diff ' + (diff >= 0 ? 'pos' : 'neg'), text: `増減 ${yen(diff, { sign: diff > 0 })}（内 投資 ${yen(last.invested - sim[0].invested, { sign: true })}）` }));

  const labelFor = (p) => {
    const d = parseISO(p.date);
    return ui.simMonths <= 12 ? `${d.getMonth() + 1}月` : `${String(d.getFullYear()).slice(2)}/${d.getMonth() + 1}`;
  };
  const chartData = sim.map((p) => ({ label: labelFor(p), value: p.total }));
  wrap.append(card(sectionTitle('資産推移グラフ'),
    el('div', { class: 'fc-chart', html: lineChart(chartData, { color: '#0a84ff', height: 240 }) }),
    el('div', { class: 'fc-legend' },
      el('span', {}, el('i', { class: 'dot', style: 'background:#0a84ff' }), '総資産'))));

  // マイルストーン表
  const rows = [];
  const marks = ui.simMonths <= 12 ? sim.filter((_, i) => i % Math.max(1, Math.round(sim.length / 6)) === 0 || _ === last)
    : sim.filter((p) => parseISO(p.date).getMonth() === parseISO(sim[0].date).getMonth() || p === last);
  for (const p of marks) {
    const d = parseISO(p.date);
    rows.push(el('div', { class: 'fc-row' },
      el('div', { class: 'fc-row-main' }, el('div', { class: 'fc-row-title', text: `${d.getFullYear()}年${d.getMonth() + 1}月` }),
        el('div', { class: 'fc-row-sub', text: `投資 ${M(p.invested)}／現金 ${M(p.liquid)}` })),
      el('div', { class: 'fc-row-amt', text: M(p.total) })));
  }
  wrap.append(card(sectionTitle('推移の内訳'), el('div', { class: 'fc-list' }, ...rows)));

  // 前提条件
  const sm = st.simulation;
  wrap.append(card(sectionTitle('前提条件', el('button', { class: 'fc-link', type: 'button', text: '編集', onclick: () => simForm() })),
    el('div', { class: 'fc-kv' },
      kv('開始資産', sm.startAsset != null ? yen(sm.startAsset) : '総資産に連動'),
      kv('毎月の収入', yen(sm.monthlyIncome)),
      kv('毎月の支出', yen(sm.monthlyExpense)),
      kv('積立投資', `${yen(sm.monthlyInvestment)}／月（年利${sm.annualReturn}%）`),
      kv('ボーナス', `${yen(sm.bonusAmount)}（${(sm.bonusMonths || []).join('・')}月）`))));
  return wrap;
}
function kv(k, v) { return el('div', { class: 'fc-kv-row' }, el('span', { text: k }), el('b', { text: v })); }

function simForm() {
  const sm = S.getState().simulation;
  const startAsset = inputEl({ type: 'number', placeholder: '空欄=総資産に連動', value: sm.startAsset ?? '' });
  const income = inputEl({ type: 'number', value: sm.monthlyIncome });
  const expense = inputEl({ type: 'number', value: sm.monthlyExpense });
  const invest = inputEl({ type: 'number', value: sm.monthlyInvestment });
  const ret = inputEl({ type: 'number', step: '0.1', value: sm.annualReturn });
  const bonus = inputEl({ type: 'number', value: sm.bonusAmount });
  const bonusMonths = inputEl({ placeholder: '例）6,12', value: (sm.bonusMonths || []).join(',') });
  const body = el('div', {},
    field('開始資産（円）', startAsset), field('毎月の収入（給与など）', income),
    field('毎月の固定支出', expense), field('毎月の積立投資', invest),
    field('投資の想定年利（%）', ret), field('ボーナス（1回あたり）', bonus), field('ボーナス支給月（カンマ区切り）', bonusMonths));
  modal('シミュレーション設定', body, {
    onSave: (close) => {
      S.update((s) => {
        s.simulation = {
          startAsset: startAsset.value === '' ? null : Number(startAsset.value),
          monthlyIncome: Number(income.value) || 0, monthlyExpense: Number(expense.value) || 0,
          monthlyInvestment: Number(invest.value) || 0, annualReturn: Number(ret.value) || 0,
          bonusAmount: Number(bonus.value) || 0,
          bonusMonths: bonusMonths.value.split(',').map((x) => Number(x.trim())).filter((x) => x >= 1 && x <= 12),
        };
      });
      render(); toast('保存しました'); close();
    },
  });
}

// ============ カレンダー ============
function renderCalendar() {
  const st = S.getState();
  const wrap = el('div', { class: 'fc-view' });
  const { y, m } = ui.cal;
  const head = el('div', { class: 'fc-cal-nav' },
    el('button', { class: 'fc-icobtn', type: 'button', text: '‹', onclick: () => { ui.cal = stepMonth(y, m, -1); render(); } }),
    el('b', { text: `${y}年${m + 1}月` }),
    el('button', { class: 'fc-icobtn', type: 'button', text: '›', onclick: () => { ui.cal = stepMonth(y, m, 1); render(); } }));
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
      el('div', { class: 'fc-row-ic', html: e.kind === 'card' ? '💳' : e.type === 'income' ? '💰' : '📄' }),
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
  wrap.append(card(sectionTitle('自由に使えるお金の推移'),
    el('div', { class: 'fc-chart', html: lineChart(trend.map((t) => ({ label: `${Number(t.ym.split('-')[1])}月`, value: t.disposable })), { color: '#30d158', height: 190 }) })));

  // 資産推移（将来）
  const sim = C.simulate(st, 24);
  wrap.append(card(sectionTitle('資産推移（今後2年）'),
    el('div', { class: 'fc-chart', html: st.settings.secret ? '' : lineChart(sim.map((p) => ({ label: `${parseISO(p.date).getMonth() + 1}月`, value: p.total })), { color: '#0a84ff', height: 190 }) }),
    st.settings.secret ? el('p', { class: 'fc-empty', text: 'シークレットモード中は非表示' }) : ''));
  return wrap;
}

// ============ メニュー ============
function renderMenu() {
  const wrap = el('div', { class: 'fc-view' });
  wrap.append(el('h1', { class: 'fc-page-title', text: '各種機能' }));
  const items = [
    ['accounts', '🏦', '口座管理', '残高の追加・編集'],
    ['pl', '📊', '損益計算書', '自由に使えるお金'],
    ['calendar', '📅', 'カレンダー', '給料日・引落日'],
    ['analysis', '📈', '分析', '支出割合・推移'],
    ['recurring', '🔁', '固定収支', '毎月の収入・支出'],
    ['categories', '🏷', 'カテゴリー', '追加・編集・削除'],
    ['data', '💾', 'データ管理', 'バックアップ・CSV'],
  ];
  const grid = el('div', { class: 'fc-menu-grid' });
  for (const [route, ic, title, sub] of items)
    grid.append(el('button', { class: 'fc-menu-tile', type: 'button', onclick: () => go(route) },
      el('span', { class: 'fc-menu-ic', text: ic }),
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
      el('div', { class: 'fc-row-ic', style: `background:${cat.color}22`, text: r.type === 'income' ? '💰' : '📄' }),
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
    !isNew && el('button', { class: 'fc-btn danger block', type: 'button', text: '削除', onclick: () => confirmDialog('固定収支を削除', '削除しますか？', () => { S.update((s) => { s.recurring = s.recurring.filter((x) => x.id !== r.id); }); render(); toast('削除しました', '🗑'); qs('.fc-modal-back')?.remove(); }) }));
  modal(isNew ? '固定収支を追加' : '固定収支を編集', body, {
    onSave: (close) => {
      if (!name.value.trim() || !Number(amount.value)) return toast('名称と金額を入力してください', '⚠️');
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
    sectionTitle(label, el('button', { class: 'fc-link', type: 'button', text: '＋ 追加', onclick: () => categoryForm(kind) })),
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
    !isNew && el('button', { class: 'fc-btn danger block', type: 'button', text: '削除', onclick: () => confirmDialog('カテゴリーを削除', `「${c.name}」を削除しますか？関連取引は「未分類」になります。`, () => { S.update((s) => { s.categories[kind] = s.categories[kind].filter((x) => x.id !== c.id); }); render(); toast('削除しました', '🗑'); qs('.fc-modal-back')?.remove(); }) }));
  modal(isNew ? 'カテゴリーを追加' : 'カテゴリーを編集', body, {
    onSave: (close) => {
      if (!name.value.trim()) return toast('名称を入力してください', '⚠️');
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
    el('button', { class: 'fc-btn primary block', type: 'button', text: '⬇ バックアップを書き出す', onclick: exportBackup }),
    el('button', { class: 'fc-btn ghost block', type: 'button', text: '⬆ バックアップから復元', onclick: () => importFile('json') })));
  wrap.append(card(sectionTitle('CSV'),
    el('p', { class: 'fc-note', text: '取引履歴（収入・支出）をCSVで入出力できます。列: 日付,種別,金額,カテゴリー,メモ' }),
    el('button', { class: 'fc-btn ghost block', type: 'button', text: '⬇ 取引をCSVエクスポート', onclick: exportCSV }),
    el('button', { class: 'fc-btn ghost block', type: 'button', text: '⬆ CSVインポート', onclick: () => importFile('csv') })));
  wrap.append(card(sectionTitle('リセット'),
    el('button', { class: 'fc-btn danger block', type: 'button', text: 'すべてのデータを初期化', onclick: () => confirmDialog('初期化', '本当にすべてのデータを削除して初期状態に戻しますか？この操作は取り消せません。', () => { S.resetAll(); go('dashboard'); toast('初期化しました', '♻️'); }, { yesLabel: '初期化する' }) })));
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
  toast('バックアップを書き出しました', '💾');
}
function exportCSV() {
  const st = S.getState();
  const rows = [['日付', '種別', '金額', 'カテゴリー', 'メモ']];
  for (const t of st.transactions.slice().sort((a, b) => a.date.localeCompare(b.date)))
    rows.push([t.date, t.type === 'income' ? '収入' : '支出', t.amount, S.findCategory(t.categoryId).name, (t.memo || '').replace(/"/g, '""')]);
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  download(`finance-transactions-${today()}.csv`, csv, 'text/csv');
  toast('CSVを書き出しました', '📄');
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
    confirmDialog('復元', '現在のデータを、選択したバックアップで置き換えますか？', () => { S.replaceState(data); applyTheme(); go('dashboard'); toast('復元しました', '♻️'); }, { yesLabel: '復元する', danger: false });
  } catch (e) { toast('読み込みに失敗しました: ' + e.message, '⚠️'); }
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
    go('transactions'); toast(`${added}件をインポートしました`, '📥');
  } catch (e) { toast('CSVの読み込みに失敗しました', '⚠️'); }
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
    onAdd ? el('button', { class: 'fc-add-btn', type: 'button', onclick: onAdd }, '＋ ', addLabel) : '');
}
function monthNav(ymStr, onChange, title) {
  const [y, m] = ymStr.split('-').map(Number);
  const prev = () => onChange(ym(new Date(y, m - 2, 1)));
  const next = () => onChange(ym(new Date(y, m, 1)));
  return el('div', { class: 'fc-page-head' }, el('h1', { class: 'fc-page-title', text: title }),
    el('div', { class: 'fc-cal-nav' },
      el('button', { class: 'fc-icobtn', type: 'button', text: '‹', onclick: prev }),
      el('b', { text: `${y}年${m}月` }),
      el('button', { class: 'fc-icobtn', type: 'button', text: '›', onclick: next })));
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
    ['dashboard', 'ホーム', 'M3 11.5 12 4l9 7.5 M5.5 9.5V20a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1V9.5'],
    ['transactions', '収支', 'M12 4v16 M4 8h10 M4 16h10 M18 6l2 2-2 2 M20 8h-6'],
    ['cards', 'カード', 'RECT'],
    ['simulate', '将来', 'M4 18l5-6 4 3 6-8 M4 4v16h16'],
    ['menu', '各種', 'M4 6h16 M4 12h16 M4 18h16'],
  ];
  for (const [route, label, path] of items) {
    const svg = path === 'RECT'
      ? '<rect x="3" y="6" width="18" height="12" rx="2.5"></rect><path d="M3 10h18"></path>'
      : `<path d="${path}"></path>`;
    nav.append(el('button', {
      class: 'fc-nav-btn', type: 'button', dataset: { route }, onclick: () => go(route),
    }, el('span', { class: 'fc-nav-ic', html: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svg}</svg>` }),
       el('span', { class: 'fc-nav-lab', text: label })));
  }
  return nav;
}

export function init() {
  applyTheme();
  // ルート要素を用意
  const root = qs('#fc-root');
  root.append(el('div', { id: 'view', class: 'fc-content' }));
  root.append(buildNav());
  S.subscribe(() => { /* 状態変化は各操作で render を明示呼び出し */ });
  render();
  setTimeout(checkNotifications, 400);
  // OSテーマ変更に追随（auto時）
  window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', () => { if (S.getState().settings.theme === 'auto') render(); });
}
