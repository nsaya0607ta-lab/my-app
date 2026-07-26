// accountSim.js — 口座別の将来資産シミュレーション
// 目的: 「3年後に合計でいくらか」だけでなく「どの口座が将来いくらになるか」を求める。
//
// 設計方針は cashflow.js / futureSim.js と同じで、state を受け取って結果を返す純粋関数の集合。
// 収支・カード引落・固定振替・臨時収支は cashflow.buildEvents をそのまま再利用し、
// 証券口座の現金・NISA元本/評価額・個別株元本/評価額を「口座ごとのバケツ」に分けて日次で前進させる。
// ダミー値・外部APIは使わず、登録済みデータ（口座・保有銘柄・積立設定・購入予定・futureSim設定）だけから計算する。
//
// 【二重計上しないための集計ルール】
//   合計資産 = Σ(非証券口座の残高) + Σ(証券口座の預り金) + Σ(NISA評価額) + Σ(個別株評価額)
//   ・投資元本は評価額の内訳（取得額）なので合計には足さない（＝元本と評価額の二重計上をしない）。
//   ・証券口座現金は「まだ投資していない現金」。積立で現金が減り同額が元本・評価額へ移るため、
//     現金と投資元本を別々に足しても二重にならない。
//   ・銀行→証券の振替は口座間の移動として扱い、収入・支出には一切数えない。
//   ・カード未払い（引落予定額）は合計資産から引かない。カード利用は実際の引落日に
//     銀行残高から差し引かれるため、未払い額を別途引くと支出の二重計上になる。参考値として別枠で表示する。
//   丸めは「口座ごとに1回だけ」行い、その丸め済みの値だけを足し上げる。
//   これにより 口座別内訳の合計 と 合計資産 が必ず1円単位で一致する。

import { pad, toISO, parseISO, addMonths, daysInMonth } from './utils.js?v=20260725b';
import { jstTodayISO, monthlyOccurrences, recurringActiveOn } from './recurrence.js?v=20260725b';
import { buildEvents } from './cashflow.js?v=20260725b';
import { settlementDate } from './calc.js?v=20260725b';
import {
  isSecurities, securitiesAccounts, accountHoldings, isIndex, contributionForDate,
  holdingCost, holdingValue, accountDeposit,
} from './securities.js?v=20260725b';
import { scenarioRate } from './futureSim.js?v=20260725b';
import { version as storeVersion } from './store.js?v=20260725b';

const n = (v) => Number(v) || 0;
const R = (v) => Math.round(v);

// ===== 資産種別（口座別内訳・資産構成比の共通定義） =====
// 合計資産＝この6区分の合計。どの区分にも重複して入らないよう、口座の種別と保有区分だけで振り分ける。
export const ASSET_GROUPS = [
  { key: 'bank', label: '銀行残高', short: '銀行', color: '#0a84ff', icon: 'bank' },
  { key: 'cash', label: '現金', short: '現金', color: '#34c759', icon: 'cash' },
  { key: 'secCash', label: '証券口座現金', short: '証券現金', color: '#5ac8fa', icon: 'wallet' },
  { key: 'nisa', label: 'NISA評価額', short: 'NISA', color: '#bf5af2', icon: 'trending' },
  { key: 'stock', label: '個別株評価額', short: '個別株', color: '#ff9500', icon: 'trending' },
  { key: 'other', label: 'その他資産', short: 'その他', color: '#8e8e93', icon: 'wallet' },
];
export const groupDef = (key) => ASSET_GROUPS.find((g) => g.key === key) || ASSET_GROUPS[5];
// 非証券口座の種別 → 資産種別
const groupOfType = (type) => (type === 'bank' ? 'bank' : type === 'cash' ? 'cash' : 'other');

// 口座IDを持たないイベント（引落口座未設定のカードなど）をまとめる仮想口座。
const UNASSIGNED = '__unassigned__';

// 積立設定に「毎日の積立額の仮変更」を適用したコピー（実データは書き換えない）。
// 対象は「毎日」頻度のみ。enabled・開始/終了日・停止期間などの条件はそのまま。
function applyDailyOverride(a, override) {
  if (override == null) return a;
  if ((a.frequency || 'daily') !== 'daily') return a;
  return { ...a, dailyAmount: override };
}

// ===== カード未払い（引落予定額）のタイムライン =====
// 「利用日 ≦ その日 ＜ 引落日」のカード利用の合計＝その時点でまだ銀行から引かれていない金額。
// 未引落の実利用に加えて、カード払いの固定支出（将来分）も同じ引落日ルールで積む。
// buildEvents が作るカード引落イベントと同じ settlementDate を使うため、銀行側の予測と必ず整合する。
function cardUsageTimeline(state, fromISO, toISO_) {
  const items = [];
  for (const t of state.cardTransactions || []) {
    if (t.settled) continue; // 引落済みは既に残高へ反映済み
    const card = (state.cards || []).find((c) => c.id === t.cardId);
    if (!card) continue;
    items.push({ useDate: t.date, payDate: settlementDate(card, t.date), amount: n(t.amount), cardId: card.id });
  }
  for (const r of state.recurring || []) {
    if (r.type !== 'expense' || r.paymentMethod !== 'card' || !r.cardId) continue;
    const card = (state.cards || []).find((c) => c.id === r.cardId);
    if (!card) continue;
    for (const { date } of monthlyOccurrences(fromISO.slice(0, 7), toISO_.slice(0, 7), r.day)) {
      if (date > fromISO && recurringActiveOn(r, date))
        items.push({ useDate: date, payDate: settlementDate(card, date), amount: n(r.amount), cardId: card.id });
    }
  }
  return items;
}
const unpaidCardAt = (items, iso) =>
  items.reduce((s, i) => s + (i.useDate <= iso && i.payDate > iso ? i.amount : 0), 0);

// ===== 本体 =====
// opts.months: シミュレーション月数（既定12）
// opts.dailyOverride: 毎日の積立額の仮変更（円/日。null で実設定のまま）
// opts.rateOverride: 想定年利(%)を全銘柄へ一律適用（シナリオ比較用。null で設定どおり）
//
// 1日の処理順は futureSim.project と完全に同じにして、両画面の結果がずれないようにする:
//   1) 証券口座への入金（銀行→証券の振替・その他入金）
//   2) NISA積立の購入   3) 個別株の購入予定
//   4) 証券口座からの出金・銀行口座の増減・口座間のその他振替
// 証券口座現金はマイナスにしない。購入日に現金が足りなければその購入は実行せず「不足」として記録する
// （後日まとめ買いもしない）＝ 実際の積立処理 securities.runAccrualForDate と同じ資金判定。
const _cache = new Map();
export function projectAccounts(state, opts = {}) {
  const months = Math.max(1, Math.round(opts.months ?? 12));
  const dailyOverride = opts.dailyOverride == null ? null : n(opts.dailyOverride);
  const rateOverride = opts.rateOverride == null ? null : n(opts.rateOverride);
  const key = `${storeVersion()}:${months}:${dailyOverride}:${rateOverride}`;
  const hit = _cache.get(key);
  if (hit) return hit;

  const fs = state.futureSim || {};
  const useOverride = fs.useOverride !== false;
  const rateFor = (holdingRate) => (rateOverride != null ? rateOverride : (useOverride ? scenarioRate(fs) : holdingRate));

  const from = jstTodayISO();
  const base = parseISO(from);
  const to = toISO(addMonths(base, months));

  // ---- 口座ごとのバケツを用意（初期値は登録済みの残高・預り金・保有銘柄） ----
  const buckets = new Map();
  const mkBucket = (id, name, type) => {
    const b = {
      id, name, type, isSec: type === 'securities',
      cash: 0, cashInitial: 0,
      income: 0, expense: 0, card: 0,        // 累計: 収入 / 支出(カード以外) / カード引落
      xferIn: 0, xferOut: 0,                  // 累計: 他口座からの振替入金 / 他口座への振替出金
      depositIn: 0, withdraw: 0,              // 証券口座の累計: その他入金 / その他出金
      nisaBuy: 0, stockBuy: 0,                // 証券口座の累計: NISA積立購入 / 個別株購入
      nisaMissed: 0, stockMissed: 0,          // 現金不足で実行できなかった累計額
      nisaGrowth: 0, stockGrowth: 0,          // 想定年利による評価額の増加（累計）
      dividend: 0,                            // 受取配当（再投資しない設定のぶん）
      indexLots: [], stockLots: [],
      virtual: false,
      // 資金不足の記録
      negDate: null, negAmount: 0, negCause: null,   // 残高が初めてマイナスになった日
      minCash: 0, minCashDate: from,
      shortfalls: [],                          // 証券口座現金の不足で実行できなかった購入
      vsec: 0, minVsec: 0,                     // 仮想現金（不足額の測定用）
    };
    buckets.set(id, b);
    return b;
  };

  for (const a of state.accounts || []) {
    const b = mkBucket(a.id, a.name || '口座', a.type || 'other');
    if (b.isSec) {
      b.cash = accountDeposit(a); // 預り金（証券口座の残高＝預り金＋評価額）
      for (const h of accountHoldings(a)) {
        const lot = {
          holdingId: h.id, name: h.name || (isIndex(h) ? 'インデックス' : '個別株'),
          principal: holdingCost(h), value: holdingValue(h),
          rate: n(h.simAnnualReturn) || (isIndex(h) ? 5 : 7), mode: h.returnMode || 'compound',
        };
        if (isIndex(h)) {
          lot.accums = (a.accumulations || []).filter((x) => x.holdingId === h.id)
            .map((x) => applyDailyOverride(x, dailyOverride));
          b.indexLots.push(lot);
        } else {
          lot.dividendYield = n(h.dividendYield);
          lot.dividendReinvest = h.dividendReinvest !== false;
          lot.plannedPurchases = (h.plannedPurchases || []).map((p) => ({ ...p }));
          b.stockLots.push(lot);
        }
      }
    } else {
      b.cash = n(a.balance);
    }
    b.cashInitial = b.cash;
    b.minCash = b.cash;
    b.vsec = b.cash;
    b.minVsec = b.cash;
  }
  // 口座未指定のイベント用（実際に使われたときだけ一覧へ出す）
  const unassigned = mkBucket(UNASSIGNED, '口座未指定', 'other');
  unassigned.virtual = true;
  // 将来イベント（住宅購入・旅行など）の引落先。可処分対象の非証券口座を優先する。
  const primaryBank = (state.accounts || []).find((a) => !isSecurities(a) && a.includeInDisposable !== false)
    || (state.accounts || []).find((a) => !isSecurities(a));
  const eventBucket = primaryBank ? buckets.get(primaryBank.id) : unassigned;

  const bucketOf = (id) => (id && buckets.has(id) ? buckets.get(id) : unassigned);
  const isSecId = (id) => !!(id && buckets.has(id) && buckets.get(id).isSec);

  // ---- 日付ごとのイベント（転記のみ。金額の解釈は stepDay 側で行う） ----
  const dayEvents = new Map();
  const pushDay = (date, item) => {
    const arr = dayEvents.get(date) || [];
    arr.push(item);
    dayEvents.set(date, arr);
  };
  for (const e of buildEvents(state, from, to)) {
    if (e.kind === 'transfer') {
      const moved = n(e.meta?.moved);
      if (moved <= 0) continue;
      pushDay(e.date, { t: 'transfer', fromId: e.meta?.fromAccountId, toId: e.meta?.toAccountId, amount: moved, desc: e.description || '振替' });
    } else {
      pushDay(e.date, { t: 'flow', accId: e.accountId, amount: n(e.amount), kind: e.kind, desc: e.description || '' });
    }
  }
  for (const ev of (fs.events || [])) {
    if (!ev.date || ev.date <= from || ev.date > to) continue;
    pushDay(ev.date, { t: 'flow', accId: eventBucket.id, amount: -n(ev.amount), kind: 'expense', desc: ev.name || '将来イベント' });
  }

  const cardItems = cardUsageTimeline(state, from, to);

  // ---- 1日ぶんの処理 ----
  const dayDebits = new Map(); // その日の最大支出（マイナスになった原因の表示用）
  const noteDebit = (b, desc, amount) => {
    if (amount <= 0) return;
    const cur = dayDebits.get(b.id);
    if (!cur || amount > cur.amount) dayDebits.set(b.id, { desc: desc || '支出', amount });
  };
  const noteVsec = (b, delta) => { b.vsec += delta; if (b.vsec < b.minVsec) b.minVsec = b.vsec; };

  const applyTransfer = (it) => {
    const fromB = bucketOf(it.fromId), toB = bucketOf(it.toId);
    if (fromB === toB) return; // 同一口座内の振替は残高を変えない
    fromB.cash -= it.amount; fromB.xferOut += it.amount;
    toB.cash += it.amount; toB.xferIn += it.amount;
    if (fromB.isSec) noteVsec(fromB, -it.amount);
    if (toB.isSec) noteVsec(toB, it.amount);
    noteDebit(fromB, `${toB.name}への振替`, it.amount);
  };
  const applyFlow = (it) => {
    const b = bucketOf(it.accId);
    b.cash += it.amount;
    if (it.amount >= 0) {
      b.income += it.amount;
      if (b.isSec) { b.depositIn += it.amount; noteVsec(b, it.amount); }
    } else {
      const amt = -it.amount;
      if (it.kind === 'card') b.card += amt; else b.expense += amt;
      if (b.isSec) { b.withdraw += amt; noteVsec(b, -amt); }
      noteDebit(b, it.desc || (it.kind === 'card' ? 'カード引落' : '支出'), amt);
    }
  };

  const stepDay = (iso) => {
    dayDebits.clear();
    const list = dayEvents.get(iso) || [];

    // 1) 証券口座への入金（銀行→証券の振替・証券口座へのその他入金）
    for (const it of list) {
      if (it.t === 'transfer' && isSecId(it.toId)) applyTransfer(it);
      else if (it.t === 'flow' && it.amount > 0 && isSecId(it.accId)) applyFlow(it);
    }

    // 2) NISA（インデックス）の積立購入。証券口座現金を減らし、同額を元本・評価額へ移す。
    for (const b of buckets.values()) {
      if (!b.isSec) continue;
      for (const l of b.indexLots) {
        for (const a of l.accums || []) {
          const amt = contributionForDate(a, iso);
          if (amt <= 0) continue;
          noteVsec(b, -amt);
          if (b.cash >= amt) {
            b.cash -= amt; l.principal += amt; l.value += amt; b.nisaBuy += amt;
          } else {
            b.nisaMissed += amt;
            b.shortfalls.push({ date: iso, kind: 'accumulation', name: l.name, amount: amt, deficit: R(amt - b.cash) });
          }
        }
      }
    }

    // 3) 個別株の購入予定
    for (const b of buckets.values()) {
      if (!b.isSec) continue;
      for (const l of b.stockLots) {
        for (const p of l.plannedPurchases || []) {
          if (p._applied || !p.date || p.date !== iso || p.date <= from) continue;
          const amt = n(p.amount);
          if (amt <= 0) { p._applied = true; continue; }
          noteVsec(b, -amt);
          if (b.cash >= amt) {
            b.cash -= amt; l.principal += amt; l.value += amt; b.stockBuy += amt; p._applied = true;
          } else {
            b.stockMissed += amt;
            b.shortfalls.push({ date: iso, kind: 'purchase', name: l.name, amount: amt, deficit: R(amt - b.cash) });
          }
        }
      }
    }

    // 4) 証券口座からの出金・口座間のその他振替・銀行口座の増減
    for (const it of list) {
      if (it.t === 'transfer') { if (!isSecId(it.toId)) applyTransfer(it); }
      else if (!(it.amount > 0 && isSecId(it.accId))) applyFlow(it);
    }

    // 当日終了時点で残高がマイナスなら、その日と最大の支出を「資金不足」として記録する
    for (const b of buckets.values()) {
      if (b.cash < b.minCash) { b.minCash = b.cash; b.minCashDate = iso; }
      if (b.cash < 0 && !b.negDate) {
        b.negDate = iso; b.negAmount = b.cash;
        b.negCause = dayDebits.get(b.id)?.desc || null;
      }
    }
  };

  // ---- 月末処理: 配当・評価額の成長 ----
  // 配当（再投資しない設定）は futureSim.project と同じく銀行資金へ現金化する。
  // ここで証券口座の預り金へ入れてしまうと、その現金でさらに積立が実行できてしまい
  // 「投資将来予測」タブと合計資産がずれるため、入金先も揃える（銀行口座が無い場合のみ証券口座へ）。
  const grow = (b, l, isIdx) => {
    const mr = rateFor(l.rate) / 100 / 12;
    const add = l.mode === 'simple' ? l.principal * mr : l.value * mr;
    l.value += add;
    if (isIdx) b.nisaGrowth += add; else b.stockGrowth += add;
  };
  // 現金化した配当の入金先（可処分対象の銀行口座 → なければ受け取った証券口座）
  const dividendTarget = primaryBank ? buckets.get(primaryBank.id) : null;
  const stepMonthEnd = () => {
    for (const b of buckets.values()) {
      if (!b.isSec) continue;
      const dividendBucket = dividendTarget || b;
      for (const l of b.stockLots) {
        if (l.dividendYield > 0) {
          const div = l.value * (l.dividendYield / 100 / 12);
          if (l.dividendReinvest) l.value += div;
          else { dividendBucket.cash += div; dividendBucket.dividend += div; dividendBucket.income += div; }
        }
      }
      for (const l of b.indexLots) grow(b, l, true);
      for (const l of b.stockLots) grow(b, l, false);
    }
  };

  // ---- スナップショット（口座ごとに1回だけ丸め、その値だけを足し上げる） ----
  const snapshot = (dateISO, label) => {
    const accounts = {};
    const groups = { bank: 0, cash: 0, secCash: 0, nisa: 0, stock: 0, other: 0 };
    let total = 0, principal = 0, cardTotal = 0;
    for (const b of buckets.values()) {
      let iv = 0, ip = 0, sv = 0, sp = 0;
      for (const l of b.indexLots) { iv += l.value; ip += l.principal; }
      for (const l of b.stockLots) { sv += l.value; sp += l.principal; }
      const a = {
        id: b.id, name: b.name, type: b.type, isSec: b.isSec,
        cash: R(b.cash), indexValue: R(iv), indexPrincipal: R(ip), stockValue: R(sv), stockPrincipal: R(sp),
        income: R(b.income), expense: R(b.expense), card: R(b.card),
        xferIn: R(b.xferIn), xferOut: R(b.xferOut), depositIn: R(b.depositIn), withdraw: R(b.withdraw),
        nisaBuy: R(b.nisaBuy), stockBuy: R(b.stockBuy), dividend: R(b.dividend),
        nisaGrowth: R(b.nisaGrowth), stockGrowth: R(b.stockGrowth),
        nisaMissed: R(b.nisaMissed), stockMissed: R(b.stockMissed),
        cashInitial: R(b.cashInitial),
      };
      a.total = a.cash + a.indexValue + a.stockValue;
      accounts[b.id] = a;
      if (b.isSec) { groups.secCash += a.cash; groups.nisa += a.indexValue; groups.stock += a.stockValue; }
      else groups[groupOfType(b.type)] += a.cash;
      total += a.total;
      principal += a.indexPrincipal + a.stockPrincipal;
      cardTotal += a.card;
    }
    return {
      date: dateISO, label, accounts, groups, total, principal, cardTotal,
      unpaidCard: R(unpaidCardAt(cardItems, dateISO)),
    };
  };

  // ---- 現在（今日）の断面 ----
  const current = snapshot(from, '現在');

  // ---- 今月の残り日を反映してから「今月末」を1点目にする ----
  // 月次ループは翌月から始まるため、当月の残り日はここで補う。当月末では評価額の成長を加えない
  // （成長の回数を futureSim.project と揃え、両画面の予測を一致させる）。
  {
    const y0 = base.getFullYear(), m0 = base.getMonth();
    const dim0 = daysInMonth(y0, m0);
    for (let day = base.getDate() + 1; day <= dim0; day++) {
      const iso = `${y0}-${pad(m0 + 1)}-${pad(day)}`;
      if (iso > to) break;
      stepDay(iso);
    }
  }
  const monthLabel = (k) => (k === 0 ? '今月' : k === 1 ? '来月' : k < 12 ? `${k}ヶ月` : k % 12 === 0 ? `${k / 12}年` : `${Math.floor(k / 12)}年${k % 12}ヶ月`);
  const curMonthEnd = toISO(new Date(base.getFullYear(), base.getMonth() + 1, 0));
  const series = [snapshot(curMonthEnd > to ? to : curMonthEnd, monthLabel(0))];

  for (let k = 1; k <= months; k++) {
    const d = addMonths(base, k);
    const y = d.getFullYear(), mIdx = d.getMonth();
    const dim = daysInMonth(y, mIdx);
    const meISO = toISO(new Date(y, mIdx + 1, 0));
    for (let day = 1; day <= dim; day++) {
      const iso = `${y}-${pad(mIdx + 1)}-${pad(day)}`;
      if (iso <= from || iso > to) continue;
      stepDay(iso);
    }
    stepMonthEnd();
    series.push(snapshot(meISO > to ? to : meISO, monthLabel(k)));
  }

  // ---- 口座メタ情報（一覧・警告の生成に使う） ----
  const meta = [];
  for (const b of buckets.values()) {
    const used = !b.virtual || b.income || b.expense || b.card || b.xferIn || b.xferOut || b.cash;
    if (!used) continue;
    meta.push({
      id: b.id, name: b.name, type: b.type, isSec: b.isSec, virtual: b.virtual,
      hasIndex: b.indexLots.length > 0, hasStock: b.stockLots.length > 0,
      indexNames: b.indexLots.map((l) => l.name), stockNames: b.stockLots.map((l) => l.name),
      negDate: b.negDate, negAmount: R(b.negAmount), negCause: b.negCause,
      minCash: R(b.minCash), minCashDate: b.minCashDate,
      shortfalls: b.shortfalls,
      // 追加で必要な振替額 ＝ 期間中に発生した証券口座現金の最大不足額（1円単位の整数）
      requiredExtra: b.isSec ? Math.max(0, R(-b.minVsec)) : 0,
    });
  }

  const result = { from, to, months, current, series, accounts: meta, monthLabel };
  _cache.set(key, result);
  if (_cache.size > 6) _cache.delete(_cache.keys().next().value);
  return result;
}

// series 上の位置（0=今月末、k=kヶ月後の月末）。範囲外は末尾へクランプ。
export const pointAt = (proj, k) => proj.series[Math.max(0, Math.min(proj.series.length - 1, k))];

// ===== 口座別の将来残高（一覧・詳細の元データ） =====
// 1口座 = 1行ではなく「口座 × 資産種別」で1行にする。証券口座は 現金 / NISA評価額 / 個別株評価額 に分ける。
// 行の合計は必ず合計資産と一致する（証券口座の残高を口座単位でも重ねて数えない）。
export function accountRows(state, proj, k) {
  const cur = proj.current;
  const fut = pointAt(proj, k);
  const rows = [];
  const mk = (group, m, label, curVal, futVal, detail) => {
    const delta = futVal - curVal;
    rows.push({
      key: `${m.id}:${group}`, accountId: m.id, group, accountName: m.name, label,
      current: curVal, future: futVal, delta,
      rate: curVal !== 0 ? (delta / Math.abs(curVal)) * 100 : null,
      reason: mainReason(group, detail, delta),
      detail,
    });
  };
  for (const m of proj.accounts) {
    const c = cur.accounts[m.id], f = fut.accounts[m.id];
    if (!c || !f) continue;
    if (m.isSec) {
      mk('secCash', m, '証券口座現金', c.cash, f.cash, f);
      if (m.hasIndex || f.indexValue || f.nisaBuy) mk('nisa', m, 'NISA評価額', c.indexValue, f.indexValue, f);
      if (m.hasStock || f.stockValue || f.stockBuy) mk('stock', m, '個別株評価額', c.stockValue, f.stockValue, f);
    } else {
      const g = groupOfType(m.type);
      mk(g, m, groupDef(g).label, c.cash, f.cash, f);
    }
  }
  return rows;
}

// 「なぜその金額になったのか」を一言で。累計の内訳のうち、変化の向きに最も効いた項目を選ぶ。
function mainReason(group, f, delta) {
  const inc = [], dec = [];
  if (group === 'secCash') {
    inc.push(['銀行からの振替入金', f.xferIn], ['証券口座へのその他入金', f.depositIn], ['配当金の受取', f.dividend]);
    dec.push(['NISAの積立購入', f.nisaBuy], ['個別株の購入', f.stockBuy], ['銀行への振替出金', f.xferOut], ['証券口座からの出金', f.withdraw]);
  } else if (group === 'nisa') {
    inc.push(['積立の継続', f.nisaBuy], ['想定年利による運用益', f.nisaGrowth]);
    dec.push(['想定年利のマイナス', -f.nisaGrowth]);
  } else if (group === 'stock') {
    inc.push(['購入予定の実行', f.stockBuy], ['想定年利による運用益', f.stockGrowth]);
    dec.push(['想定年利のマイナス', -f.stockGrowth]);
  } else {
    inc.push(['毎月の固定収入', f.income], ['他口座からの振替入金', f.xferIn]);
    dec.push(['固定費・支出の累積', f.expense], ['カード引落の累積', f.card], ['証券口座などへの振替', f.xferOut]);
  }
  const pool = delta >= 0 ? inc : dec;
  const best = pool.filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1])[0];
  if (best) return best[0];
  return delta === 0 ? '期間中の入出金の予定なし' : null;
}

// ===== 資産構成比（将来時点） =====
// 各区分の金額 ÷ プラスの区分の合計。マイナス残高の区分は割合を持たせず一覧にだけ残す
// （円グラフの面積として表現できないため。合計資産の内訳としては金額をそのまま表示する）。
export function composition(proj, k) {
  const g = pointAt(proj, k).groups;
  const items = ASSET_GROUPS.map((d) => ({ ...d, value: g[d.key] || 0 })).filter((x) => x.value !== 0);
  const positive = items.filter((x) => x.value > 0).reduce((s, x) => s + x.value, 0);
  return {
    base: positive,
    total: items.reduce((s, x) => s + x.value, 0),
    items: items.map((x) => ({ ...x, pct: positive > 0 && x.value > 0 ? (x.value / positive) * 100 : 0 }))
      .sort((a, b) => b.value - a.value),
  };
}

// ===== 資金不足の警告（口座単位） =====
// ① 口座残高がマイナスになる見込み ② 証券口座現金が足りず積立・購入を実行できない見込み
// のどちらも「対象口座・不足日・不足額・原因・改善案」を添えて返す。日付の早い順。
export function accountShortages(proj) {
  const out = [];
  for (const m of proj.accounts) {
    if (m.negDate) {
      out.push({
        type: 'balance', accountId: m.id, accountName: m.name,
        date: m.negDate, amount: Math.abs(m.negAmount),
        cause: m.negCause ? `${m.negCause}（この日の最大の出金）により残高が不足します` : 'この口座からの支出が収入を上回ります',
        advice: `${m.name}へ ${Math.abs(m.negAmount).toLocaleString('ja-JP')}円以上を入金するか、他口座からの振替・固定費の見直しを検討してください。`,
      });
    }
    if (m.isSec && m.shortfalls.length) {
      const first = m.shortfalls[0];
      out.push({
        type: 'secCash', accountId: m.id, accountName: m.name,
        date: first.date, amount: first.deficit,
        cause: `${first.name}の${first.kind === 'accumulation' ? '積立' : '購入'}（${first.amount.toLocaleString('ja-JP')}円）に対して証券口座現金が不足します`,
        advice: m.requiredExtra > 0
          ? `銀行→証券の振替を合計 ${m.requiredExtra.toLocaleString('ja-JP')}円 増やすか、積立額を見直すと不足を解消できます。`
          : '積立額または入金日の見直しを検討してください。',
        requiredExtra: m.requiredExtra,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ===== シミュレーションの前提条件 =====
// 「なぜこの結果になっているか」を画面上で確認できるよう、計算に使った設定値をそのまま並べる。
export function assumptions(state, proj) {
  const fs = state.futureSim || {};
  const months = proj.months;
  const yen = (v) => `${Math.round(v).toLocaleString('ja-JP')}円`;
  const out = [];
  out.push({ label: '対象期間', value: months % 12 === 0 ? `${months / 12}年（${months}か月）` : `${months}か月` });
  out.push({
    label: '想定年利',
    value: fs.useOverride !== false
      ? `${scenarioRate(fs).toFixed(1)}%（全銘柄へ一律適用）`
      : '銘柄ごとに設定した年利を使用',
  });

  const accums = [];
  for (const acc of securitiesAccounts(state)) {
    for (const a of acc.accumulations || []) {
      if (a.enabled === false) continue;
      const freq = a.frequency || 'daily';
      const amt = freq === 'monthly' ? n(a.monthlyAmount) : n(a.dailyAmount);
      if (amt <= 0) continue;
      accums.push(`${freq === 'monthly' ? '毎月' : freq === 'weekly' ? '毎週' : '毎日'}${yen(amt)}`);
    }
  }
  out.push({ label: '積立設定', value: accums.length ? accums.join('・') : '未設定' });

  let toSec = 0;
  for (const rt of state.recurringTransfers || []) {
    const fromSec = isSecAccountId(state, rt.fromAccountId), toS = isSecAccountId(state, rt.toAccountId);
    if (toS && !fromSec) toSec += n(rt.amount);
  }
  out.push({ label: '銀行→証券の振替', value: toSec > 0 ? `毎月${yen(toSec)}` : '設定なし' });

  let fixIn = 0, fixOut = 0, fixCard = 0;
  for (const r of state.recurring || []) {
    if (r.type === 'income') fixIn += n(r.amount);
    else if (r.paymentMethod === 'card') fixCard += n(r.amount);
    else fixOut += n(r.amount);
  }
  out.push({ label: '固定収入', value: fixIn > 0 ? `毎月${yen(fixIn)}` : '未登録' });
  out.push({ label: '固定支出（口座引落）', value: fixOut > 0 ? `毎月${yen(fixOut)}` : '未登録' });
  out.push({ label: '固定支出（カード払い）', value: fixCard > 0 ? `毎月${yen(fixCard)}` : '未登録' });

  const y1 = pointAt(proj, Math.min(12, proj.series.length - 1));
  if (y1.cardTotal > 0) {
    const mo = Math.min(12, proj.series.length - 1) || 1;
    out.push({ label: 'カード引落予定', value: `今後${mo}か月で${yen(y1.cardTotal)}（月平均${yen(y1.cardTotal / mo)}）` });
  }
  const evs = (fs.events || []).filter((e) => e.date && e.date > proj.from && e.date <= proj.to);
  if (evs.length) out.push({ label: '将来イベント', value: `${evs.length}件・合計${yen(evs.reduce((s, e) => s + n(e.amount), 0))}` });
  return out;
}
const isSecAccountId = (state, id) => {
  if (!id) return false;
  const a = (state.accounts || []).find((x) => x.id === id);
  return !!a && isSecurities(a);
};
