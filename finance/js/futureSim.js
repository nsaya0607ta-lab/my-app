// futureSim.js — 将来資産シミュレーション（投資予測）エンジン
// 方針: calc.js / cashflow.js / securities.js と同じく「stateを受け取って結果を返す純粋関数」の集合。
// 収支（固定収支・カード・振替・臨時収支）は cashflow.js の buildEvents をそのまま再利用し、
// 証券口座の現金・元本・評価額（インデックス／個別株）を月次で前進させて一元的な将来資産を計算する。
// ダミー値・外部APIは使わず、登録済みデータ（口座・保有銘柄・積立設定・購入予定・futureSim設定）のみから計算する。

import { pad, toISO, parseISO, addMonths, daysInMonth } from './utils.js?v=20260723s';
import { jstTodayISO } from './recurrence.js?v=20260723s';
import { buildEvents } from './cashflow.js?v=20260723s';
import {
  isSecurities, securitiesAccounts, accountHoldings, isIndex, contributionForDate,
  holdingCost, holdingValue,
} from './securities.js?v=20260723s';
import { SCENARIO_RATES } from './store.js?v=20260723s';

const n = (v) => Number(v) || 0;

export const YEAR_OPTIONS = [1, 3, 5, 10, 15, 20, 30];
export const RATE_CHIPS = [5, 7, 10, 15, 20, 30];
export const SCENARIO_DEFS = [
  { key: 'conservative', label: '保守', rate: SCENARIO_RATES.conservative, color: '#8e8e93' },
  { key: 'normal', label: '通常', rate: SCENARIO_RATES.normal, color: '#0a84ff' },
  { key: 'aggressive', label: '強気', rate: SCENARIO_RATES.aggressive, color: '#ff9500' },
];

// このシナリオ設定で現在有効な「想定年利」(%)。scenario==='custom' なら自由入力値を使う。
export function scenarioRate(fs) {
  if (!fs) return SCENARIO_RATES.normal;
  if (fs.scenario === 'custom') return n(fs.customReturn);
  return SCENARIO_RATES[fs.scenario] ?? SCENARIO_RATES.normal;
}

// ===== 内部ヘルパー =====

// 証券口座以外(現金・銀行・その他)の残高合計と、証券口座の現金合計
function initialCash(state) {
  let bank = 0, sec = 0;
  for (const a of state.accounts) {
    if (isSecurities(a)) sec += n(a.cash);
    else bank += n(a.balance);
  }
  return { bank, sec };
}

// 保有銘柄をシミュレーション用に複製(実データは一切書き換えない)
function cloneHoldingsState(state) {
  const indexLots = [];
  const stockLots = [];
  for (const acc of securitiesAccounts(state)) {
    for (const h of accountHoldings(acc)) {
      if (isIndex(h)) {
        const accums = (acc.accumulations || []).filter((a) => a.holdingId === h.id);
        indexLots.push({
          holdingId: h.id, name: h.name, principal: holdingCost(h), value: holdingValue(h),
          rate: n(h.simAnnualReturn) || 5, mode: h.returnMode || 'compound', accums,
        });
      } else {
        stockLots.push({
          holdingId: h.id, name: h.name, principal: holdingCost(h), value: holdingValue(h),
          rate: n(h.simAnnualReturn) || 7, mode: h.returnMode || 'compound',
          dividendYield: n(h.dividendYield), dividendReinvest: h.dividendReinvest !== false,
          plannedPurchases: (h.plannedPurchases || []).map((p) => ({ ...p })),
        });
      }
    }
  }
  return { indexLots, stockLots };
}

// 想定年利での評価額成長(1ヶ月分)。単利=元本にのみ利息、複利=評価額全体に利息。
function growLot(lot, ratePct, mode) {
  const mr = (Number(ratePct) || 0) / 100 / 12;
  if (mode === 'simple') lot.value += lot.principal * mr;
  else lot.value += lot.value * mr;
}

// 銀行 or 証券口座かを1件のキャッシュフローイベントから判定して振り分ける
function eventBankSecDelta(state, e) {
  const isSec = (id) => { if (!id) return false; const a = state.accounts.find((x) => x.id === id); return !!a && isSecurities(a); };
  if (e.kind === 'transfer') {
    const moved = n(e.meta?.moved);
    let bank = 0, sec = 0;
    if (isSec(e.meta?.fromAccountId)) sec -= moved; else bank -= moved;
    if (isSec(e.meta?.toAccountId)) sec += moved; else bank += moved;
    return { bank, sec };
  }
  const amt = n(e.amount);
  return isSec(e.accountId) ? { bank: 0, sec: amt } : { bank: amt, sec: 0 };
}

// 口座IDが証券口座かどうか
function isSecAcc(state, id) {
  if (!id) return false;
  const a = state.accounts.find((x) => x.id === id);
  return !!a && isSecurities(a);
}

// ===== ① 統合将来資産シミュレーション（日次キャッシュフロー） =====
// opts.rateOverride: 指定するとシナリオ設定に関わらず全銘柄へこの年利(%)を一律適用(シナリオ比較・感度分析・目標探索用)
// opts.extraMonthlyInvestment: 「積立を毎月+n円にしたら」という簡易What-Ifの追加投資額(証券口座現金の残高には影響させず、
//   銀行資金からその場で追加投資する想定で bankCash を減らし、評価額(合成枠)へ積み上げる)
//
// 資金の流れ: 銀行口座 →(振替)→ 証券口座現金 →(NISA/個別株の購入)→ 投資元本。
// 証券口座現金は日付順に、同日内は次の順で処理する（入金→購入→出金）:
//   1) 銀行→証券の振替入金  2) 証券口座へのその他入金  3) NISA積立購入
//   4) 個別株の購入予定      5) 証券→銀行の振替出金
// これにより「入金後の残高から購入」でき、現金が足りなければ購入を実行せず不足として記録する
// （証券口座現金はマイナスにしない）。実際の積立処理(securities.runAccrualForDate)と同じ資金判定。
export function project(state, opts = {}) {
  const fs = state.futureSim || {};
  const years = Math.max(1, opts.years ?? fs.years ?? 10);
  const rateOverride = opts.rateOverride ?? null;
  const extra = n(opts.extraMonthlyInvestment);
  const useOverride = fs.useOverride !== false;

  const from = jstTodayISO();
  const base = parseISO(from);
  const to = toISO(addMonths(base, years * 12));

  // 収支・振替・単発収支を「日付ごと」に、証券口座現金の入金/出金と銀行増減へ分解する。
  //   xin: 銀行→証券の振替入金 / din: 証券口座へのその他入金 /
  //   xout: 証券→銀行の振替出金 / dout: 証券口座からのその他出金 / bank: 銀行残高の増減
  const events = buildEvents(state, from, to);
  const byDay = new Map();
  const addDay = (date, o) => {
    const d = byDay.get(date) || { bank: 0, xin: 0, din: 0, xout: 0, dout: 0 };
    d.bank += o.bank || 0; d.xin += o.xin || 0; d.din += o.din || 0; d.xout += o.xout || 0; d.dout += o.dout || 0;
    byDay.set(date, d);
  };
  for (const e of events) {
    if (e.kind === 'transfer') {
      const moved = n(e.meta?.moved);
      const fromSec = isSecAcc(state, e.meta?.fromAccountId);
      const toSec = isSecAcc(state, e.meta?.toAccountId);
      if (!fromSec && toSec) addDay(e.date, { bank: -moved, xin: moved });   // 銀行→証券
      else if (fromSec && !toSec) addDay(e.date, { bank: moved, xout: moved }); // 証券→銀行
      // 銀行→銀行 / 証券→証券 は2口座バケットでは相殺されるため無視
    } else {
      const delta = eventBankSecDelta(state, e); // {bank, sec}
      if (delta.sec >= 0) addDay(e.date, { bank: delta.bank, din: delta.sec });
      else addDay(e.date, { bank: delta.bank, dout: -delta.sec });
    }
  }
  // 将来イベント(住宅購入・旅行など)は銀行資金からの支出
  for (const ev of (fs.events || [])) {
    if (!ev.date || ev.date <= from || ev.date > to) continue;
    addDay(ev.date, { bank: -n(ev.amount) });
  }

  const { indexLots, stockLots } = cloneHoldingsState(state);
  let { bank, sec } = initialCash(state);
  const secInitial = sec;
  let synth = 0; // What-If追加投資の合成枠
  // 証券口座現金の内訳（累計）。secCash = 初期 + 振替入金 + その他入金 − NISA購入 − 個別株購入 − 振替出金 − その他出金
  let cumXferIn = 0, cumDepositIn = 0, cumNisaBuy = 0, cumStockBuy = 0, cumXferOut = 0, cumWithdraw = 0;
  const shortfalls = []; // 現金不足で実行できなかった購入 [{date, kind, name, amount, deficit}]

  const rateFor = (holdingRate) => (rateOverride != null ? rateOverride : (useOverride ? scenarioRate(fs) : holdingRate));

  const snapshot = (dateISO) => {
    let indexValue = 0, stockValue = 0, indexPrincipal = 0, stockPrincipal = 0;
    for (const l of indexLots) { indexValue += l.value; indexPrincipal += l.principal; }
    for (const l of stockLots) { stockValue += l.value; stockPrincipal += l.principal; }
    const principal = indexPrincipal + stockPrincipal;
    const valuation = indexValue + stockValue + synth;
    return {
      date: dateISO,
      bankCash: Math.round(bank), secCash: Math.round(sec),
      principal: Math.round(principal), valuation: Math.round(valuation),
      indexPrincipal: Math.round(indexPrincipal), stockPrincipal: Math.round(stockPrincipal),
      indexValuation: Math.round(indexValue), stockValuation: Math.round(stockValue),
      total: Math.round(bank + sec + valuation),
      // 証券口座現金の内訳（タップで確認できるように保持）
      secCashInitial: Math.round(secInitial),
      secXferIn: Math.round(cumXferIn), secDepositIn: Math.round(cumDepositIn),
      secNisaBuy: Math.round(cumNisaBuy), secStockBuy: Math.round(cumStockBuy),
      secXferOut: Math.round(cumXferOut), secWithdraw: Math.round(cumWithdraw),
    };
  };

  const series = [snapshot(from)];
  const months = years * 12;
  for (let k = 1; k <= months; k++) {
    const dcur = addMonths(base, k);
    const y = dcur.getFullYear(), mIdx = dcur.getMonth();
    const dim = daysInMonth(y, mIdx);
    const monthEndISO = toISO(new Date(y, mIdx + 1, 0));
    const pointISO = monthEndISO > to ? to : monthEndISO;

    // --- 日付順にキャッシュフローを反映（同日は 入金→積立→株購入→出金 の順） ---
    for (let day = 1; day <= dim; day++) {
      const iso = `${y}-${pad(mIdx + 1)}-${pad(day)}`;
      if (iso <= from || iso > to) continue;
      const dd = byDay.get(iso);

      // 1) 銀行→証券の振替入金 / 2) 証券口座へのその他入金
      if (dd) {
        if (dd.xin) { sec += dd.xin; cumXferIn += dd.xin; }
        if (dd.din) { sec += dd.din; cumDepositIn += dd.din; }
      }

      // 3) NISA積立購入（1日あたりの積立額のみ証券口座現金から減額。現金不足なら実行せず記録）
      for (const l of indexLots) {
        for (const a of l.accums) {
          const amt = contributionForDate(a, iso);
          if (amt <= 0) continue;
          if (sec >= amt) { sec -= amt; l.principal += amt; l.value += amt; cumNisaBuy += amt; }
          else shortfalls.push({ date: iso, kind: 'accumulation', name: l.name, amount: amt, deficit: Math.round(amt - sec) });
        }
      }

      // 4) 個別株の購入予定（現金不足なら実行せず記録）
      for (const l of stockLots) {
        for (const p of l.plannedPurchases) {
          if (p._applied || !p.date || p.date !== iso || p.date <= from) continue;
          const amt = n(p.amount);
          if (amt <= 0) { p._applied = true; continue; }
          if (sec >= amt) { sec -= amt; l.principal += amt; l.value += amt; cumStockBuy += amt; p._applied = true; }
          else shortfalls.push({ date: iso, kind: 'purchase', name: l.name, amount: amt, deficit: Math.round(amt - sec) });
        }
      }

      // 5) 証券→銀行の振替出金 / 証券口座からのその他出金・銀行残高の増減
      if (dd) {
        if (dd.xout) { sec -= dd.xout; cumXferOut += dd.xout; }
        if (dd.dout) { sec -= dd.dout; cumWithdraw += dd.dout; }
        bank += dd.bank;
      }
    }

    // --- 月末処理: 配当・What-If・評価額の成長 ---
    // 4') 個別株の配当金(毎月按分)。再投資ONは評価額へ、OFFは銀行資金へ現金化する想定。
    for (const l of stockLots) {
      if (l.dividendYield > 0) {
        const div = l.value * (l.dividendYield / 100 / 12);
        if (l.dividendReinvest) l.value += div; else bank += div;
      }
    }
    // 5') What-If 追加投資(任意・銀行資金から合成枠へ)
    if (extra > 0) {
      bank -= extra; synth += extra;
      synth += synth * (rateFor(scenarioRate(fs)) / 100 / 12);
    }
    // 6') 評価額の成長(想定年利・単利/複利)
    for (const l of indexLots) growLot(l, rateFor(l.rate), l.mode);
    for (const l of stockLots) growLot(l, rateFor(l.rate), l.mode);

    series.push(snapshot(pointISO));
  }

  return { from, to, years, series, shortfalls };
}

// ===== 証券口座現金の資金計画（毎月必要な振替額 vs 現在の振替設定額） =====
// requiredMonthly: 毎月の投資（NISA積立）に必要な概算額（毎日=日額×約30.4／毎週=日額×約4.35／毎月=月額）。
// currentMonthlyTransfer: 現在の「銀行→証券」固定振替の月合計。
export function securitiesCashPlan(state) {
  let currentMonthlyTransfer = 0;
  for (const rt of state.recurringTransfers || []) {
    if (isSecAcc(state, rt.toAccountId) && !isSecAcc(state, rt.fromAccountId)) currentMonthlyTransfer += n(rt.amount);
  }
  let requiredMonthly = 0;
  for (const acc of securitiesAccounts(state)) {
    for (const a of acc.accumulations || []) {
      if (a.enabled === false) continue;
      const freq = a.frequency || 'daily';
      if (freq === 'monthly') requiredMonthly += n(a.monthlyAmount);
      else if (freq === 'weekly') requiredMonthly += n(a.dailyAmount) * (365 / 7 / 12);
      else requiredMonthly += n(a.dailyAmount) * (365 / 12);
    }
  }
  requiredMonthly = Math.round(requiredMonthly);
  currentMonthlyTransfer = Math.round(currentMonthlyTransfer);
  return { currentMonthlyTransfer, requiredMonthly, monthlyShortfall: Math.max(0, requiredMonthly - currentMonthlyTransfer) };
}

// 証券口座現金の不足（購入を実行できなかった最初の予定）。無ければ null。
export function firstSecShortfall(proj) {
  return proj && proj.shortfalls && proj.shortfalls.length ? proj.shortfalls[0] : null;
}

// 系列から指定日以前で最も新しい点を取得(未来日付なら最終点)
export function pointAt(series, iso) {
  let pt = series[0];
  for (const p of series) { if (p.date <= iso) pt = p; else break; }
  return pt;
}

// ===== ② シナリオ比較（保守／通常／強気／自由設定） =====
export function scenarioComparison(state, opts = {}) {
  const fs = state.futureSim || {};
  const years = opts.years ?? fs.years ?? 10;
  const custom = { key: 'custom', label: '自由設定', rate: n(fs.customReturn) || SCENARIO_RATES.normal, color: '#bf5af2' };
  return [...SCENARIO_DEFS, custom].map((d) => ({ ...d, series: project(state, { years, rateOverride: d.rate }).series }));
}

// ===== ③ 年利感度分析（±n%で将来資産がどう変わるか） =====
export function sensitivityAnalysis(state, opts = {}) {
  const fs = state.futureSim || {};
  const years = opts.years ?? fs.years ?? 10;
  const baseRate = opts.baseRate ?? scenarioRate(fs);
  const deltas = opts.deltas ?? [-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10];
  return deltas.map((delta) => {
    const rate = baseRate + delta; // マイナス(下落局面)も許容する
    const end = project(state, { years, rateOverride: rate }).series.at(-1);
    return { delta, rate, total: end.total };
  });
}

// 系列上で銀行 or 証券口座の現金が初めてマイナスになる点（資金不足の警告に使用）
export function firstShortfall(series) {
  for (const p of series) if (p.bankCash < 0 || p.secCash < 0) return p;
  return null;
}

// ===== ④ 投資達成予測（目標到達日） =====
// 目標は選択中の保有期間に関わらず最大30年先まで探索する。
export function goalPredictions(state, opts = {}) {
  const fs = state.futureSim || {};
  const p = project(state, { years: 30, rateOverride: opts.rateOverride, extraMonthlyInvestment: opts.extraMonthlyInvestment });
  return (fs.goals || []).map((g) => {
    const metric = g.metric === 'valuation' ? (pt) => pt.valuation : (pt) => pt.total;
    const target = n(g.targetAmount);
    const hit = p.series.find((pt) => metric(pt) >= target);
    return { goal: g, date: hit ? hit.date : null, reached: !!hit };
  });
}

// ===== ⑤ 配当金シミュレーション（再投資あり／なしの比較） =====
export function dividendComparison(state, opts = {}) {
  const fs = state.futureSim || {};
  const years = opts.years ?? fs.years ?? 10;
  const rateOverride = opts.rateOverride ?? null;
  const useOverride = fs.useOverride !== false;
  const { stockLots } = cloneHoldingsState(state);
  const eligible = stockLots.filter((l) => l.dividendYield > 0);
  if (!eligible.length) return null;

  const from = jstTodayISO();
  const base = parseISO(from);
  const clone = () => eligible.map((l) => ({ ...l, plannedPurchases: l.plannedPurchases.map((p) => ({ ...p })) }));
  const reinvestLots = clone();
  const flatLots = clone();
  const totalOf = (lots) => lots.reduce((s, l) => s + l.value, 0);
  const rateFor = (l) => (rateOverride != null ? rateOverride : (useOverride ? scenarioRate(fs) : l.rate));

  let cumReinvest = 0, cumFlat = 0;
  const series = [{ date: from, reinvestValue: Math.round(totalOf(reinvestLots)), flatValue: Math.round(totalOf(flatLots)), cumReinvestDividend: 0, cumFlatDividend: 0 }];

  for (let k = 1; k <= years * 12; k++) {
    const d = addMonths(base, k);
    const y = d.getFullYear(), mIdx = d.getMonth();
    const ymStr = `${y}-${pad(mIdx + 1)}`;
    const monthEndISO = toISO(new Date(y, mIdx + 1, 0));

    for (const lots of [reinvestLots, flatLots]) {
      for (const l of lots) {
        for (const p of l.plannedPurchases) {
          if (p._applied || !p.date) continue;
          if (p.date.slice(0, 7) === ymStr && p.date > from) { l.principal += n(p.amount); l.value += n(p.amount); p._applied = true; }
        }
      }
    }
    for (const l of reinvestLots) { const div = l.value * (l.dividendYield / 100 / 12); l.value += div; cumReinvest += div; }
    for (const l of flatLots) { const div = l.value * (l.dividendYield / 100 / 12); cumFlat += div; }
    for (const l of reinvestLots) growLot(l, rateFor(l), l.mode);
    for (const l of flatLots) growLot(l, rateFor(l), l.mode);

    series.push({
      date: monthEndISO, reinvestValue: Math.round(totalOf(reinvestLots)), flatValue: Math.round(totalOf(flatLots)),
      cumReinvestDividend: Math.round(cumReinvest), cumFlatDividend: Math.round(cumFlat),
    });
  }
  return { series, eligible: eligible.map((l) => ({ name: l.name, dividendYield: l.dividendYield })), end: series.at(-1) };
}

// 個別株の購入予定1件を、その想定年利・保有予定年数で複利運用した場合の予測評価額
export function plannedPurchaseProjection(p) {
  const amount = n(p.amount), rate = n(p.annualReturn), yrs = n(p.holdYears);
  return Math.round(amount * Math.pow(1 + rate / 100, yrs));
}

// ===== ⑥ モンテカルロシミュレーション（年ごとにランダムなリターン） =====
function randNormal(mean, sd) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * sd;
}
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))];

export function monteCarlo(state, opts = {}) {
  const fs = state.futureSim || {};
  const years = Math.max(1, opts.years ?? fs.years ?? 10);
  const runs = Math.max(50, Math.min(2000, Math.round(opts.runs ?? fs.monteCarlo?.runs ?? 300)));
  const volatility = Math.max(0, opts.volatility ?? fs.monteCarlo?.volatility ?? 15);
  const baseRate = opts.rateOverride ?? scenarioRate(fs);

  // 拠出(積立・購入予定)は年利に依存しないため、決定論的な系列を1回だけ計算して再利用する
  const det = project(state, { years, rateOverride: baseRate });
  const s = det.series;
  const idxOf = (yr) => Math.min(s.length - 1, yr * 12);
  const value0 = s[0].valuation;
  const contributions = [];
  for (let yr = 1; yr <= years; yr++) contributions.push(s[idxOf(yr)].principal - s[idxOf(yr - 1)].principal);

  const yearlyTotals = Array.from({ length: years + 1 }, () => []);
  for (let run = 0; run < runs; run++) {
    let value = value0;
    yearlyTotals[0].push(s[0].bankCash + s[0].secCash + value);
    for (let yr = 1; yr <= years; yr++) {
      const r = randNormal(baseRate, volatility) / 100;
      value = Math.max(0, (value + contributions[yr - 1]) * (1 + r));
      const idx = idxOf(yr);
      yearlyTotals[yr].push(s[idx].bankCash + s[idx].secCash + value);
    }
  }

  const years_ = [];
  for (let yr = 0; yr <= years; yr++) {
    const arr = yearlyTotals[yr].slice().sort((a, b) => a - b);
    years_.push({
      year: yr, date: s[idxOf(yr)].date,
      median: Math.round(percentile(arr, 50)), p5: Math.round(percentile(arr, 5)), p95: Math.round(percentile(arr, 95)),
      min: Math.round(arr[0]), max: Math.round(arr[arr.length - 1]),
    });
  }
  return { years: years_, runs, volatility, baseRate, end: years_.at(-1) };
}

// ===== ⑦ AI分析カード（ルールベースの参考情報。断定はしない） =====
function monthsBetween(isoA, isoB) {
  const [ay, am] = isoA.split('-').map(Number);
  const [by, bm] = isoB.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}
const money = (v) => `${Math.round(v).toLocaleString('ja-JP')}円`;

export function insights(state) {
  const fs = state.futureSim || {};
  const years = fs.years || 10;
  const out = [];

  const preds = goalPredictions(state);
  const reached = preds.filter((p) => p.reached).sort((a, b) => a.date.localeCompare(b.date));
  if (reached.length) {
    const nearest = reached[0];
    const d = parseISO(nearest.date);
    out.push(`現在の積立・想定年利（年${scenarioRate(fs).toFixed(1)}%目安）を継続すると、${d.getFullYear()}年${d.getMonth() + 1}月頃に目標「${nearest.goal.name}」（${money(nearest.goal.targetAmount)}）へ到達する見込みです。`);
    const withExtra = goalPredictions(state, { extraMonthlyInvestment: 20000 }).find((p) => p.goal.id === nearest.goal.id);
    if (withExtra?.reached && withExtra.date < nearest.date) {
      const monthsSaved = monthsBetween(withExtra.date, nearest.date);
      if (monthsSaved >= 1) out.push(`積立を毎月2万円増やすと、目標「${nearest.goal.name}」へ約${(monthsSaved / 12).toFixed(1)}年早く到達できる見込みです。`);
    }
  } else if ((fs.goals || []).length) {
    out.push('現在の設定では、登録した目標に今後30年以内に到達しない見込みです。積立額や想定年利の見直しを検討してもよいかもしれません。');
  }

  const p = project(state, { years });
  const end = p.series.at(-1);
  const cashRatio = end.total > 0 ? (end.bankCash + end.secCash) / end.total : 0;
  if (cashRatio > 0.4) {
    out.push('将来時点でも現金比率が高めの見込みです。投資に回す比率を増やすと資産成長の効率が上がる可能性があります。');
  } else if (end.principal > 0) {
    const rate = ((end.valuation - end.principal) / end.principal) * 100;
    if (rate > 20) out.push(`評価額が元本を${rate.toFixed(0)}%上回る見込みで、複利の効果が表れています。`);
  }

  if (!out.length) out.push('目標や積立設定を登録すると、達成予測などの分析がここに表示されます。');
  return out;
}
