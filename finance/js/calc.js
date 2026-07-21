// calc.js — 家計・資産計算エンジン（アプリの心臓部）
// 最重要3機能: ①クレジットカード引落管理 ②将来資産シミュレーション ③可処分資金の自動計算
// 純粋関数の集合として実装し、UIから独立させることでテスト・拡張を容易にする。

import { ym, pad, resolveDay, addMonths, toISO, parseISO, daysInMonth } from './utils.js?v=20260722c';

// ===== 総資産 =====
export const totalAssets = (state) =>
  state.accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);

// ===== 可処分資金 = 「今すぐ自由に使える口座」の残高合計 =====
// 収入−支出の月次フローではなく、可処分対象口座（includeInDisposable=true）の
// 残高合計から算出する。銀行→NISA の振替をすると銀行残高が減るため自動的に減少する。
export const disposableAssets = (state) =>
  state.accounts.reduce((s, a) => s + (a.includeInDisposable !== false ? (Number(a.balance) || 0) : 0), 0);
// 可処分対象外（投資・NISA・iDeCo など）の残高合計
export const reservedAssets = (state) =>
  state.accounts.reduce((s, a) => s + (a.includeInDisposable === false ? (Number(a.balance) || 0) : 0), 0);

export const assetsByType = (state) => {
  const m = {};
  for (const a of state.accounts) m[a.type] = (m[a.type] || 0) + (Number(a.balance) || 0);
  return m;
};

// ===== ① クレジットカード引落 =====
// カード利用1件が「いつ銀行から引き落とされるか」を求める。
// closingDay: 'end' か 1..28 / payDay: 'end' か 1..31 / payMonthOffset: 締め月から何ヶ月後に引落か
export function settlementDate(card, txISO) {
  const d = parseISO(txISO);
  const y = d.getFullYear(), m = d.getMonth(), dd = d.getDate();
  const closeDay = resolveDay(y, m, card.closingDay);
  // 締日を過ぎた利用は翌月締めサイクルへ
  const closeMonth = dd <= closeDay ? new Date(y, m, 1) : new Date(y, m + 1, 1);
  const payMonth = addMonths(closeMonth, card.payMonthOffset ?? 1);
  const payD = resolveDay(payMonth.getFullYear(), payMonth.getMonth(), card.payDay);
  return toISO(new Date(payMonth.getFullYear(), payMonth.getMonth(), payD));
}

// カード別・引落日別に利用を集計。{ [cardId]: { [payISO]: {amount, items:[]} } }
export function settlements(state) {
  const out = {};
  for (const t of state.cardTransactions) {
    const card = state.cards.find((c) => c.id === t.cardId);
    if (!card) continue;
    const pay = settlementDate(card, t.date);
    (out[card.id] ||= {});
    (out[card.id][pay] ||= { amount: 0, items: [] });
    out[card.id][pay].amount += Number(t.amount) || 0;
    out[card.id][pay].items.push(t);
  }
  return out;
}

// ある年月(ym文字列)に引き落とされるカード支払総額（PL・可処分資金で使用）
export function cardSettlementForMonth(state, ymStr) {
  const s = settlements(state);
  let total = 0;
  const perCard = [];
  for (const card of state.cards) {
    const byDate = s[card.id] || {};
    let cardTotal = 0;
    for (const [payISO, v] of Object.entries(byDate)) {
      if (ym(parseISO(payISO)) === ymStr) cardTotal += v.amount;
    }
    if (cardTotal > 0) perCard.push({ card, amount: cardTotal });
    total += cardTotal;
  }
  return { total, perCard };
}

// 各カードの「次回引落予定」（今日以降で最も近い引落）
export function upcomingSettlements(state, fromISO) {
  const from = fromISO || toISO(new Date());
  const s = settlements(state);
  const list = [];
  for (const card of state.cards) {
    const byDate = s[card.id] || {};
    const future = Object.entries(byDate)
      .filter(([iso]) => iso >= from)
      .sort((a, b) => a[0].localeCompare(b[0]));
    if (future.length) {
      const [payISO, v] = future[0];
      list.push({ card, payISO, amount: v.amount, count: v.items.length });
    }
  }
  return list.sort((a, b) => a.payISO.localeCompare(b.payISO));
}

// ===== 固定収支の展開 =====
// 指定年月に発生する固定収入/支出を実日付付きで返す
export function recurringForMonth(state, ymStr) {
  const [y, m] = ymStr.split('-').map(Number);
  return state.recurring.map((r) => {
    const day = resolveDay(y, m - 1, r.day);
    return { ...r, date: `${y}-${pad(m)}-${pad(day)}` };
  });
}

// ===== ③ 可処分資金 / 損益計算書 =====
export function monthlyPL(state, ymStr) {
  const inMonth = (iso) => ym(parseISO(iso)) === ymStr;

  // 実績取引
  const txIncome = state.transactions.filter((t) => t.type === 'income' && inMonth(t.date));
  const txExpense = state.transactions.filter((t) => t.type === 'expense' && inMonth(t.date));

  // 固定収支
  const rec = recurringForMonth(state, ymStr);
  const recIncome = rec.filter((r) => r.type === 'income');
  const recExpense = rec.filter((r) => r.type === 'expense');

  // カード支払予定
  const card = cardSettlementForMonth(state, ymStr);

  // カテゴリー別に集約（収入）
  const incomeGroups = groupByCategory(state, [...txIncome, ...recIncome]);
  const incomeTotal = sum(incomeGroups);

  // カテゴリー別に集約（支出）＋ カード支払予定を1項目として追加
  const expenseGroups = groupByCategory(state, [...txExpense, ...recExpense]);
  if (card.total > 0) expenseGroups.push({ id: '__card__', name: 'カード支払予定', color: '#ff453a', amount: card.total });
  const expenseTotal = sum(expenseGroups);

  return {
    ym: ymStr,
    incomeGroups: incomeGroups.sort((a, b) => b.amount - a.amount),
    expenseGroups: expenseGroups.sort((a, b) => b.amount - a.amount),
    incomeTotal,
    expenseTotal,
    disposable: incomeTotal - expenseTotal,
    cardTotal: card.total,
    cardDetail: card.perCard,
  };
}

function groupByCategory(state, items) {
  const map = new Map();
  for (const it of items) {
    const cat = [...state.categories.income, ...state.categories.expense]
      .find((c) => c.id === it.categoryId) || { id: it.categoryId || 'none', name: '未分類', color: '#8e8e93' };
    const cur = map.get(cat.id) || { id: cat.id, name: cat.name, color: cat.color, amount: 0 };
    cur.amount += Number(it.amount) || 0;
    map.set(cat.id, cur);
  }
  return [...map.values()];
}
const sum = (groups) => groups.reduce((s, g) => s + g.amount, 0);

// ===== ② 将来資産シミュレーション =====
// liquid（現金性資産）と invested（投資資産）を分けて月次で前進させる。
// total の増分 = 収入 − 支出 + 投資リターン + ボーナス（積立自体は total 内の移動なので中立）
export function simulate(state, months) {
  const sim = state.simulation;
  const start = sim.startAsset != null ? Number(sim.startAsset) : totalAssets(state);
  // 開始時点の資産を、投資口座分を invested、それ以外を liquid として按分
  const invested0 = state.accounts
    .filter((a) => a.type === 'securities')
    .reduce((s, a) => s + (Number(a.balance) || 0), 0);
  let invested = sim.startAsset != null ? 0 : invested0;
  let liquid = start - invested;

  const mRate = (Number(sim.annualReturn) || 0) / 100 / 12;
  const series = [];
  const base = new Date();
  base.setDate(1);
  series.push({ i: 0, date: toISO(base), liquid, invested, total: liquid + invested });

  for (let i = 1; i <= months; i++) {
    const d = addMonths(base, i);
    const month = d.getMonth() + 1;
    // 通常月フロー
    liquid += (Number(sim.monthlyIncome) || 0) - (Number(sim.monthlyExpense) || 0) - (Number(sim.monthlyInvestment) || 0);
    invested += Number(sim.monthlyInvestment) || 0;
    invested += invested * mRate; // 投資リターン
    // ボーナス
    if ((sim.bonusMonths || []).includes(month)) liquid += Number(sim.bonusAmount) || 0;
    series.push({ i, date: toISO(d), liquid: Math.round(liquid), invested: Math.round(invested), total: Math.round(liquid + invested) });
  }
  return series;
}

// ===== 分析：カテゴリー別支出・収支推移 =====
export function expenseByCategory(state, ymStr) {
  const inMonth = (iso) => ym(parseISO(iso)) === ymStr;
  const txExpense = state.transactions.filter((t) => t.type === 'expense' && inMonth(t.date));
  const recExpense = recurringForMonth(state, ymStr).filter((r) => r.type === 'expense');
  const groups = groupByCategory(state, [...txExpense, ...recExpense]);
  return groups.sort((a, b) => b.amount - a.amount);
}

// 直近nヶ月の収入・支出推移
export function monthlyTrend(state, n = 6) {
  const out = [];
  const now = new Date(); now.setDate(1);
  for (let k = n - 1; k >= 0; k--) {
    const d = addMonths(now, -k);
    const yms = ym(d);
    const pl = monthlyPL(state, yms);
    out.push({ ym: yms, income: pl.incomeTotal, expense: pl.expenseTotal, disposable: pl.disposable });
  }
  return out;
}

// ===== カレンダー：ある月の日別イベント =====
export function calendarEvents(state, y, mIndex /*0-11*/) {
  const ymStr = `${y}-${pad(mIndex + 1)}`;
  const events = {}; // day -> [{type, label, amount, color}]
  const push = (day, ev) => { (events[day] ||= []).push(ev); };

  // 固定収支
  for (const r of recurringForMonth(state, ymStr)) {
    const day = Number(r.date.split('-')[2]);
    push(day, { kind: r.type === 'income' ? 'fixed-income' : 'fixed-expense', label: r.name, amount: r.amount, type: r.type });
  }
  // 実績取引
  for (const t of state.transactions) {
    const d = parseISO(t.date);
    if (d.getFullYear() === y && d.getMonth() === mIndex)
      push(d.getDate(), { kind: t.type, label: t.memo || '', amount: t.amount, type: t.type, categoryId: t.categoryId });
  }
  // カード引落
  const s = settlements(state);
  for (const card of state.cards) {
    for (const [payISO, v] of Object.entries(s[card.id] || {})) {
      const d = parseISO(payISO);
      if (d.getFullYear() === y && d.getMonth() === mIndex)
        push(d.getDate(), { kind: 'card', label: `${card.name} 引落`, amount: v.amount, type: 'expense', color: card.color });
    }
  }
  return events;
}

// ===== 通知の生成 =====
export function buildNotifications(state, refISO) {
  const ref = refISO || toISO(new Date());
  const refD = parseISO(ref);
  const tomorrow = toISO(new Date(refD.getFullYear(), refD.getMonth(), refD.getDate() + 1));
  const out = [];

  // 明日のカード引落
  for (const u of upcomingSettlements(state, ref)) {
    if (u.payISO === tomorrow) out.push({ id: 'card-' + u.card.id + tomorrow, icon: 'card', text: `明日 ${u.card.name} の引落があります（${u.amount.toLocaleString()}円）` });
    if (u.payISO === ref) out.push({ id: 'cardtoday-' + u.card.id + ref, icon: 'card', text: `今日は ${u.card.name} の引落日です` });
  }
  // 給料日など固定収入
  const ymStr = ym(refD);
  for (const r of recurringForMonth(state, ymStr)) {
    if (r.date === ref && r.type === 'income') out.push({ id: 'inc-' + r.id + ref, icon: 'coins', text: `今日は${r.name}日です（+${r.amount.toLocaleString()}円）` });
    if (r.date === ref && r.type === 'expense') out.push({ id: 'exp-' + r.id + ref, icon: 'file', text: `今日は${r.name}の支払日です` });
  }
  // 予算超過
  const pl = monthlyPL(state, ymStr);
  const budget = state.settings.monthlyBudget;
  if (budget && pl.expenseTotal > budget)
    out.push({ id: 'budget-' + ymStr, icon: 'alert', text: `今月の支出が予算（${budget.toLocaleString()}円）を超えました` });

  return out;
}

// ===================================================================
// ⑧ ホーム用スマート指標
// ===================================================================

const prevYm = (ymStr) => { const [y, m] = ymStr.split('-').map(Number); return ym(new Date(y, m - 2, 1)); };
const pctChange = (cur, prev) => (prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100);

// 前月比（収入・支出・可処分）
export function momChange(state, ymStr) {
  const cur = monthlyPL(state, ymStr);
  const prev = monthlyPL(state, prevYm(ymStr));
  return {
    income: { cur: cur.incomeTotal, prev: prev.incomeTotal, pct: pctChange(cur.incomeTotal, prev.incomeTotal) },
    expense: { cur: cur.expenseTotal, prev: prev.expenseTotal, pct: pctChange(cur.expenseTotal, prev.expenseTotal) },
    disposable: { cur: cur.disposable, prev: prev.disposable, pct: pctChange(cur.disposable, prev.disposable) },
  };
}

// 貯蓄率 = (収入 − 支出) / 収入。収入0なら null
export function savingsRate(state, ymStr) {
  const pl = monthlyPL(state, ymStr);
  if (pl.incomeTotal <= 0) return null;
  return Math.round(((pl.incomeTotal - pl.expenseTotal) / pl.incomeTotal) * 100);
}

// 今月あと使える金額（予算ベース）: 月予算 − 今月の変動支出。残り日数と1日あたり目安も返す。
export function spendableStatus(state, ymStr, refISO) {
  const ref = refISO || toISO(new Date());
  const refD = parseISO(ref);
  const [y, m] = ymStr.split('-').map(Number);
  const isCurrentMonth = y === refD.getFullYear() && m === refD.getMonth() + 1;
  const lastDay = daysInMonth(y, m - 1);
  const daysLeft = isCurrentMonth ? Math.max(1, lastDay - refD.getDate() + 1) : lastDay;

  // 変動支出＝実績の支出取引（固定費・カードは別勘定）
  const variableSpent = state.transactions
    .filter((t) => t.type === 'expense' && ym(parseISO(t.date)) === ymStr)
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const budget = Number(state.settings.monthlyBudget) || 0;
  const remaining = budget - variableSpent;
  return {
    hasBudget: budget > 0,
    budget, variableSpent, remaining, daysLeft,
    perDay: remaining > 0 ? Math.floor(remaining / daysLeft) : 0,
    ratio: budget > 0 ? Math.min(1, variableSpent / budget) : 0,
  };
}

// 最近追加した収支
export function recentTransactions(state, n = 3) {
  return state.transactions.slice().sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)).slice(0, n);
}

// 今月の固定費の残り（今日以降に発生予定の固定支出）
export function fixedRemaining(state, ymStr, refISO) {
  const ref = refISO || toISO(new Date());
  const rec = recurringForMonth(state, ymStr).filter((r) => r.type === 'expense' && r.date >= ref);
  return { count: rec.length, total: rec.reduce((s, r) => s + (Number(r.amount) || 0), 0), items: rec };
}

// 今月の支出ランキング TOP n
export function expenseRankTop(state, ymStr, n = 3) {
  return expenseByCategory(state, ymStr).slice(0, n);
}

// 今後 days 日以内の引落予定
export function settlementsWithinDays(state, days = 7, refISO) {
  const ref = refISO || toISO(new Date());
  const refD = parseISO(ref);
  const until = toISO(new Date(refD.getFullYear(), refD.getMonth(), refD.getDate() + days));
  const s = settlements(state);
  const out = [];
  for (const card of state.cards) {
    for (const [payISO, v] of Object.entries(s[card.id] || {})) {
      if (payISO >= ref && payISO <= until) out.push({ card, payISO, amount: v.amount, count: v.items.length });
    }
  }
  return out.sort((a, b) => a.payISO.localeCompare(b.payISO));
}

// 資産増減（昨日比・今月比・前年比）: assetHistory から算出。基準が無ければ null。
export function assetDeltas(state) {
  const h = (state.assetHistory || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (!h.length) return { yesterday: null, month: null, year: null, current: totalAssets(state) };
  const current = totalAssets(state);
  const today = toISO(new Date());
  const d = parseISO(today);
  const before = (iso) => { const arr = h.filter((p) => p.date <= iso); return arr.length ? arr[arr.length - 1].total : null; };
  const yesterdayISO = toISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
  const monthStartISO = toISO(new Date(d.getFullYear(), d.getMonth(), 0)); // 前月末＝今月頭の基準
  const yearAgoISO = toISO(new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()));
  const mk = (base) => (base == null ? null : current - base);
  return {
    current,
    yesterday: mk(before(yesterdayISO)),
    month: mk(before(monthStartISO)),
    year: mk(before(yearAgoISO)),
  };
}

// 残高推移ミニグラフ用の系列。履歴が2点以上あれば実績、無ければ将来予測で代替。
export function assetTrendSeries(state, points = 12) {
  const h = (state.assetHistory || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (h.length >= 2) {
    const tail = h.slice(-points);
    return { mode: 'history', data: tail.map((p) => ({ label: `${parseISO(p.date).getMonth() + 1}/${parseISO(p.date).getDate()}`, value: p.total })) };
  }
  const sim = simulate(state, points);
  return { mode: 'forecast', data: sim.map((p) => ({ label: `${parseISO(p.date).getMonth() + 1}月`, value: p.total })) };
}

// カード請求額との差額（カードに予定請求額 estimatedBill が設定されている場合）
export function cardBillDiff(state, refISO) {
  const ref = refISO || toISO(new Date());
  const s = settlements(state);
  const out = [];
  for (const card of state.cards) {
    const est = Number(card.estimatedBill) || 0;
    if (est <= 0) continue;
    // 直近（今日以降で最も近い）引落サイクルの登録済み金額
    const future = Object.entries(s[card.id] || {}).filter(([iso]) => iso >= ref).sort((a, b) => a[0].localeCompare(b[0]));
    const recorded = future.length ? future[0][1].amount : 0;
    const payISO = future.length ? future[0][0] : null;
    out.push({ card, estimated: est, recorded, diff: est - recorded, payISO });
  }
  return out;
}
