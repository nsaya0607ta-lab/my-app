// cashflow.js — 将来資産シミュレーションエンジン（日次キャッシュフロー計算）
// 方針: ダミー計算は一切せず、登録済みデータ（口座残高・固定収支・カード・取引）だけから
// 「現在資産 → 収入 → 固定収入 → 固定支出 → カード引落 → その他支出 → 翌日へ」を
// 未来まで繰り返して現実に近い資産推移を求める。
// 最重要: クレジットカードは「利用日」ではなく「実際の引落日」に銀行口座から差し引く。
//
// すべての将来イベントは共通の「キャッシュフローイベント」として表現する（拡張しやすい設計）:
//   { date, amount(+/-), category, accountId, recurrence, description, priority, kind, meta }
// これにより 投資・配当・積立NISA・ローン返済・住宅/車購入 などは
// 新しい kind のイベント生成器を足すだけで追加できる。

import { toISO, parseISO, addMonths, daysInMonth } from './utils.js?v=20260724f';
import { settlements, settlementDate, totalAssets } from './calc.js?v=20260724f';
import { monthlyOccurrences, recurringActiveOn, jstTodayISO } from './recurrence.js?v=20260724f';
import { version as storeVersion } from './store.js?v=20260724f';

// 日次処理順（⑫）: 収入→固定収入→固定支出→カード引落→振替→その他支出
export const PRIORITY = { income: 1, 'fixed-income': 2, 'fixed-expense': 3, card: 4, transfer: 5, expense: 6 };
export const eventIcon = (kind) =>
  ({ income: 'up', 'fixed-income': 'coins', 'fixed-expense': 'file', card: 'card', transfer: 'swap', expense: 'down' }[kind] || 'file');
export const eventLabel = (kind) =>
  ({ income: '臨時収入', 'fixed-income': '固定収入', 'fixed-expense': '固定支出', card: 'カード引落', transfer: '固定振替', expense: '支出' }[kind] || 'イベント');
export const eventGroup = (kind) => (kind === 'income' || kind === 'fixed-income' ? 'income' : kind === 'transfer' ? 'transfer' : 'expense');

const monthEndISO = (y, m /*0-11*/) => toISO(new Date(y, m, daysInMonth(y, m)));
const todayISO = () => jstTodayISO(); // 将来シミュレーションの起点も日本時間の今日

// ---- キャッシュフローイベントの生成（登録データのみから） ----
export function buildEvents(state, fromISO, toISO_) {
  const events = [];
  const push = (e) => { if (e.date > fromISO && e.date <= toISO_) events.push(e); };

  // 月次イベントの生成期間（実行日→実日付の変換は共通の monthlyOccurrences に一本化）
  const fromMonth = fromISO.slice(0, 7);
  const toMonth = toISO_.slice(0, 7);

  // ② 固定収入 / ③ 固定支出（毎月）
  for (const r of state.recurring) {
    // カード払いの固定支出は銀行から直接引かず、カード利用として引落日に反映する（後述）
    if (r.type === 'expense' && r.paymentMethod === 'card') continue;
    const income = r.type === 'income';
    for (const { date } of monthlyOccurrences(fromMonth, toMonth, r.day)) {
      if (!recurringActiveOn(r, date)) continue; // 開始日〜終了日の範囲外は生成しない
      push({
        date, amount: income ? +r.amount : -r.amount,
        kind: income ? 'fixed-income' : 'fixed-expense',
        category: r.categoryId, accountId: r.accountId || null,
        recurrence: 'monthly', description: r.name, priority: income ? 2 : 3,
      });
    }
  }

  // カード払いの固定支出（将来分）: 各月の発生日をカード利用とみなし、実際の引落日に
  // 引落口座から差し引く。今日以前の発生分は store が実カード利用に具体化済みのため対象外。
  for (const r of state.recurring) {
    if (r.type !== 'expense' || r.paymentMethod !== 'card' || !r.cardId) continue;
    const card = state.cards.find((c) => c.id === r.cardId);
    if (!card) continue;
    for (const { date: useDate } of monthlyOccurrences(fromMonth, toMonth, r.day)) {
      if (useDate > fromISO && recurringActiveOn(r, useDate)) { // 未来の利用のみ・有効期間内
        const pay = settlementDate(card, useDate);
        push({
          date: pay, amount: -(Number(r.amount) || 0), kind: 'card',
          category: r.categoryId, accountId: card.payAccountId || null,
          recurrence: 'monthly', description: `${card.name} 引落（${r.name}）`, priority: 4,
          meta: { cardId: card.id, count: 1, color: card.color, fromRecurring: r.id },
        });
      }
    }
  }

  // ⑤ カード引落（実際の引落日ベース）
  const s = settlements(state);
  for (const card of state.cards) {
    for (const [payISO, v] of Object.entries(s[card.id] || {})) {
      push({
        date: payISO, amount: -v.amount, kind: 'card',
        category: null, accountId: card.payAccountId || null,
        recurrence: 'none', description: `${card.name} 引落`, priority: 4,
        meta: { cardId: card.id, count: v.items.length, color: card.color },
      });
    }
  }

  // 固定振替（毎月の定期的な資産移動）。総資産は変えないので amount:0、移動額は meta.moved。
  for (const rt of state.recurringTransfers || []) {
    for (const { date } of monthlyOccurrences(fromMonth, toMonth, rt.day)) {
      if (!recurringActiveOn(rt, date)) continue; // 開始日〜終了日の範囲外は生成しない
      const fromA = state.accounts.find((a) => a.id === rt.fromAccountId);
      const toA = state.accounts.find((a) => a.id === rt.toAccountId);
      push({
        date, amount: 0, kind: 'transfer',
        category: null, accountId: rt.fromAccountId, recurrence: 'monthly',
        description: rt.memo || `${fromA?.name || '?'} → ${toA?.name || '?'}`, priority: 5,
        meta: { moved: Number(rt.amount) || 0, fromAccountId: rt.fromAccountId, toAccountId: rt.toAccountId, fromName: fromA?.name, toName: toA?.name },
      });
    }
  }

  // ④ 将来日付で登録された臨時の収支（過去分は現在残高に含まれるため対象外）
  for (const t of state.transactions) {
    const income = t.type === 'income';
    push({
      date: t.date, amount: income ? +t.amount : -t.amount,
      kind: income ? 'income' : 'expense',
      category: t.categoryId, accountId: t.accountId || null,
      recurrence: 'none', description: t.memo || '', priority: income ? 1 : 6,
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.priority - b.priority);
  return events;
}

// イベント1件の「可処分資金への影響額」（口座の可処分フラグを考慮）
export function disposableDelta(state, e) {
  const isDisp = (id) => { if (!id) return true; const a = state.accounts.find((x) => x.id === id); return !a || a.includeInDisposable !== false; };
  if (e.kind === 'card') return 0; // カードは利用時に可処分から控除済み
  if (e.kind === 'transfer') {
    const moved = e.meta?.moved || 0;
    return (isDisp(e.meta?.toAccountId) ? moved : 0) - (isDisp(e.meta?.fromAccountId) ? moved : 0);
  }
  return isDisp(e.accountId) ? e.amount : 0; // 収入(+)/支出(−)
}

// ---- 日次シミュレーション本体 ----
// 資産は「イベントのある日」だけ変化する区分定数なので、系列はイベント日のみ記録して高速化（⑥）。
const _cache = new Map();
export function simulate(state, months = 36) {
  const key = `${storeVersion()}:${months}`;
  const hit = _cache.get(key);
  if (hit) return hit;

  const from = todayISO();
  const to = toISO(addMonths(parseISO(from), months));
  const events = buildEvents(state, from, to);

  // 日付ごとにまとめる
  const byDate = new Map();
  for (const e of events) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }
  const dates = [...byDate.keys()].sort();

  const start = totalAssets(state);
  let running = start;
  const series = [{ date: from, total: start }];
  let minPoint = { date: from, total: start };
  let firstNegative = null;

  for (const date of dates) {
    const dayEvents = byDate.get(date); // すでに priority 順
    const causes = [];
    for (const ev of dayEvents) {
      running += ev.amount;
      if (ev.amount < 0) causes.push(ev);
    }
    series.push({ date, total: running });
    if (running < minPoint.total) minPoint = { date, total: running };
    if (running < 0 && !firstNegative) {
      causes.sort((a, b) => a.amount - b.amount); // 大きな支出から
      firstNegative = { date, total: running, causes };
    }
  }

  const result = { from, to, start, series, byDate, events, minPoint, firstNegative, months };
  _cache.set(key, result);
  if (_cache.size > 8) _cache.delete(_cache.keys().next().value);
  return result;
}

// 指定日時点の資産（区分定数系列から求める）
export function balanceAt(series, iso) {
  let val = series.length ? series[0].total : 0;
  for (const p of series) { if (p.date <= iso) val = p.total; else break; }
  return val;
}

// ---- グラフ用: 月次サンプリング系列 ----
export function chartSeries(state, months = 36) {
  const sim = simulate(state, months);
  const base = parseISO(sim.from);
  const out = [];
  for (let k = 0; k <= months; k++) {
    const d = addMonths(base, k);
    const iso = monthEndISO(d.getFullYear(), d.getMonth());
    const clamped = iso > sim.to ? sim.to : iso;
    out.push({
      iso: clamped,
      value: balanceAt(sim.series, clamped),
      label: k === 0 ? '今月' : k === 1 ? '来月' : k < 12 ? `${k}ヶ月` : k % 12 === 0 ? `${k / 12}年` : `${Math.floor(k / 12)}年${k % 12}ヶ月`,
    });
  }
  return out;
}

// ---- 将来の可処分資金カード（⑧）: 今月末・来月末・3か月後・半年後・1年後 ----
export function forecasts(state) {
  const sim = simulate(state, 12);
  const base = parseISO(sim.from);
  const defs = [
    ['今月末予想', 0], ['来月末予想', 1], ['3か月後', 3], ['半年後', 6], ['1年後', 12],
  ];
  return defs.map(([label, k]) => {
    const d = addMonths(base, k);
    const iso = monthEndISO(d.getFullYear(), d.getMonth());
    const total = balanceAt(sim.series, iso > sim.to ? sim.to : iso);
    return { label, iso, total, delta: total - sim.start };
  });
}

// ---- ⑦ 未払いカード残高（まだ銀行から引き落とされていないカード利用） ----
export function unpaidCards(state) {
  const items = [];
  for (const card of state.cards) {
    for (const t of state.cardTransactions) {
      if (t.cardId !== card.id || t.settled) continue; // 引落済みは未払いから除外
      const payISO = settlementDate(card, t.date);
      items.push({ card, txDate: t.date, payISO, amount: t.amount, memo: t.memo || '' });
    }
  }
  items.sort((a, b) => a.payISO.localeCompare(b.payISO) || a.txDate.localeCompare(b.txDate));
  return { total: items.reduce((s, i) => s + i.amount, 0), items };
}

// ---- 将来の入出金を日付単位でグループ化（展開可能なUI用） ----
export function dailyGroups(state, { days = 200, max = 40 } = {}) {
  const sim = simulate(state, Math.max(3, Math.ceil(days / 30)));
  const from = parseISO(sim.from);
  const until = toISO(new Date(from.getFullYear(), from.getMonth(), from.getDate() + days));
  const byDate = new Map();
  for (const e of sim.events) {
    if (e.date > until) break;
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }
  const groups = [];
  for (const [date, events] of byDate) {
    let net = 0, dispImpact = 0, incomeSum = 0, expenseSum = 0, transferSum = 0;
    for (const e of events) {
      if (e.kind === 'transfer') transferSum += e.meta?.moved || 0;
      else { net += e.amount; if (e.amount >= 0) incomeSum += e.amount; else expenseSum += -e.amount; }
      dispImpact += disposableDelta(state, e);
    }
    groups.push({
      date, events: events.map((e) => ({ ...e, icon: eventIcon(e.kind), kindLabel: eventLabel(e.kind), group: eventGroup(e.kind), disp: disposableDelta(state, e) })),
      net, dispImpact, incomeSum, expenseSum, transferSum,
    });
    if (groups.length >= max) break;
  }
  return groups;
}

// ---- ⑩ タイムライン用イベント（直近の将来イベント） ----
export function timeline(state, { days = 120, max = 20 } = {}) {
  const sim = simulate(state, Math.max(3, Math.ceil(days / 30)));
  const from = parseISO(sim.from);
  const until = toISO(new Date(from.getFullYear(), from.getMonth(), from.getDate() + days));
  return sim.events.filter((e) => e.date <= until).slice(0, max)
    .map((e) => ({ ...e, icon: eventIcon(e.kind), kindLabel: eventLabel(e.kind) }));
}

// ---- ⑪ 資産不足アラート ----
export function shortageAlert(state, months = 36) {
  const sim = simulate(state, months);
  if (!sim.firstNegative) return null;
  const d = parseISO(sim.firstNegative.date);
  const monthLabel = `${d.getMonth() + 1}月`;
  const cause = sim.firstNegative.causes[0];
  return {
    date: sim.firstNegative.date,
    monthLabel,
    total: sim.firstNegative.total,
    causes: sim.firstNegative.causes.slice(0, 3),
    message: `${d.getFullYear()}年${monthLabel}に資産が不足する可能性があります。`,
    mainCause: cause ? cause.description || eventLabel(cause.kind) : null,
  };
}
