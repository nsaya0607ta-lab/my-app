// futureSim.js — 将来資産シミュレーション（投資予測）エンジン
// 方針: calc.js / cashflow.js / securities.js と同じく「stateを受け取って結果を返す純粋関数」の集合。
// 収支（固定収支・カード・振替・臨時収支）は cashflow.js の buildEvents をそのまま再利用し、
// 証券口座の現金・元本・評価額（インデックス／個別株）を月次で前進させて一元的な将来資産を計算する。
// ダミー値・外部APIは使わず、登録済みデータ（口座・保有銘柄・積立設定・購入予定・futureSim設定）のみから計算する。

import { pad, toISO, parseISO, addMonths, daysInMonth, resolveDay } from './utils.js?v=20260724f';
import { jstTodayISO } from './recurrence.js?v=20260724f';
import { buildEvents } from './cashflow.js?v=20260724f';
import {
  isSecurities, securitiesAccounts, accountHoldings, isIndex, contributionForDate,
  holdingCost, holdingValue,
} from './securities.js?v=20260724f';
import { SCENARIO_RATES } from './store.js?v=20260724f';

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

// ===== 証券口座への毎月入金（ユーザー設定）のヘルパー =====
// 有効・入金額>0・登録済み証券口座のみを「実際にシミュレーションへ反映する入金」として返す。
// 未設定・無効・0円・存在しない口座は対象外（＝入金なしとして扱う）。表示側とも判定を共有する。
export function validMonthlyBrokerageDeposits(state) {
  const out = [];
  for (const md of state.monthlyBrokerageDeposits || []) {
    if (!md || md.enabled === false) continue;
    const amount = n(md.amount);
    const day = Number(md.day);
    if (amount <= 0 || !(day >= 1 && day <= 31)) continue;
    const acc = (state.accounts || []).find((a) => a.id === md.accountId);
    if (!acc || !isSecurities(acc)) continue;
    out.push({ id: md.id, accountId: md.accountId, accountName: acc.name || '証券口座', day, amount });
  }
  return out;
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

// 積立設定に「毎日の積立額の仮変更（dailyOverride）」を適用したコピーを返す。
// 実データ(state)は書き換えず、シミュレーション内でのみ使う一時的な差し替え。
//   ・対象は「毎日」頻度の積立設定のみ（毎週・毎月は対象外＝「毎日の積立額」の変更のため）。
//   ・enabled/startDate/endDate/停止期間などの他条件はそのまま（無効な設定を勝手に有効化しない）。
function applyDailyOverride(a, override) {
  if (override == null) return a;
  if ((a.frequency || 'daily') !== 'daily') return a;
  return { ...a, dailyAmount: override };
}

// 保有銘柄をシミュレーション用に複製(実データは一切書き換えない)。
// dailyOverride が指定されると、毎日の積立設定の日額だけを仮の金額へ差し替える（実設定は不変）。
function cloneHoldingsState(state, dailyOverride = null) {
  const indexLots = [];
  const stockLots = [];
  for (const acc of securitiesAccounts(state)) {
    for (const h of accountHoldings(acc)) {
      if (isIndex(h)) {
        const accums = (acc.accumulations || []).filter((a) => a.holdingId === h.id)
          .map((a) => applyDailyOverride(a, dailyOverride));
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
// opts.extraMonthlyInvestment: 「積立を毎月+n円にしたら」という簡易What-Ifの追加投資額。
//   投資購入で銀行残高をマイナスにしない方針のため、銀行資金・証券口座現金は減らさず、
//   仮定の追加投資ぶん(合成枠 synth)を積み増して評価額・総資産の伸びだけを試算する。
// opts.logAccruals: 選択日内訳表示用に、NISA積立が発生した日の履歴(accrualLog)を1件ずつ記録する。
//
// 資金の流れ: 銀行口座 →(振替)→ 証券口座現金 →(NISA/個別株の購入)→ 投資元本。
// 証券口座現金は日付順に、同日内は次の順で処理する（入金→購入→出金）:
//   0) 証券口座への毎月入金（ユーザー設定）  1) 銀行→証券の振替入金  2) 証券口座へのその他入金
//   3) NISA積立購入  4) 個別株の購入予定  5) 証券→銀行の振替出金
// 毎月入金を最初に処理することで、入金日と積立日が同じ場合でも入金後の現金で積立購入できる。
// これにより「入金後の残高から購入」でき、現金が足りなければ購入を実行せず不足として記録する
// （証券口座現金はマイナスにしない）。実際の積立処理(securities.runAccrualForDate)と同じ資金判定。
//
// createProjection は「1日進める(stepDay)」「月末処理(stepMonthEnd)」「スナップショット(snapshot)」を
// 提供する内部エンジン。project(=月次系列)と snapshotAt(=選択日の精密計算)の両方がこのエンジンを共有し、
// 証券口座現金・元本・評価額の計算元を一本化する（表示側は口座の現在値を直接使わない）。
// opts.mode: 'reality'（既定）| 'ideal'
//   'reality': 証券口座現金を日付順に処理し、購入日時点で現金が不足していればその日の購入は実行せず不足として記録する。
//              現金はマイナスにしない。入金後は以降の積立を再開し、過去の未実行分を後日まとめて購入しない。
//   'ideal'  : 「もし毎日この金額を投資できたら」を確認するモード。証券口座現金・銀行残高による購入制限を行わず、
//              設定した積立額（＋購入予定）が全期間実行された前提で元本・評価額・累計積立額を計算する。
//              この2モードは同じ createProjection 内で ignoreCash で明確に分岐し、計算処理を混在させない。
// opts.dailyOverride: 「毎日の積立額を仮変更」する金額（円）。null なら実設定のまま。理想・現実どちらにも同じ値を適用する。
function createProjection(state, opts, from, to) {
  const fs = state.futureSim || {};
  const rateOverride = opts.rateOverride ?? null;
  const extra = n(opts.extraMonthlyInvestment);
  const useOverride = fs.useOverride !== false;
  const logAccruals = !!opts.logAccruals;
  const ignoreCash = opts.mode === 'ideal';                       // 理想モード: 現金不足でも購入を実行する
  const dailyOverride = opts.dailyOverride == null ? null : n(opts.dailyOverride);

  // 収支・振替・単発収支を「日付ごと」に、証券口座現金の入金/出金と銀行増減へ分解する。
  //   bank: 銀行残高の純増減 / binc: 銀行の収入 / bexp: 銀行の支出（内訳表示用に収入・支出を分離）
  //   xin: 銀行→証券の振替入金 / din: 証券口座へのその他入金 /
  //   xout: 証券→銀行の振替出金 / dout: 証券口座からのその他出金
  const byDay = new Map();
  const addDay = (date, o) => {
    const d = byDay.get(date) || { bank: 0, binc: 0, bexp: 0, xin: 0, din: 0, xout: 0, dout: 0 };
    d.bank += o.bank || 0; d.binc += o.binc || 0; d.bexp += o.bexp || 0;
    d.xin += o.xin || 0; d.din += o.din || 0; d.xout += o.xout || 0; d.dout += o.dout || 0;
    byDay.set(date, d);
  };
  for (const e of buildEvents(state, from, to)) {
    if (e.kind === 'transfer') {
      const moved = n(e.meta?.moved);
      const fromSec = isSecAcc(state, e.meta?.fromAccountId);
      const toSec = isSecAcc(state, e.meta?.toAccountId);
      if (!fromSec && toSec) addDay(e.date, { bank: -moved, xin: moved });   // 銀行→証券
      else if (fromSec && !toSec) addDay(e.date, { bank: moved, xout: moved }); // 証券→銀行
      // 銀行→銀行 / 証券→証券 は2口座バケットでは相殺されるため無視
    } else {
      const delta = eventBankSecDelta(state, e); // {bank, sec}
      const binc = delta.bank > 0 ? delta.bank : 0, bexp = delta.bank < 0 ? -delta.bank : 0;
      if (delta.sec >= 0) addDay(e.date, { bank: delta.bank, binc, bexp, din: delta.sec });
      else addDay(e.date, { bank: delta.bank, binc, bexp, dout: -delta.sec });
    }
  }
  // 将来イベント(住宅購入・旅行など)は銀行資金からの支出
  for (const ev of (fs.events || [])) {
    if (!ev.date || ev.date <= from || ev.date > to) continue;
    addDay(ev.date, { bank: -n(ev.amount), bexp: n(ev.amount) });
  }

  // 証券口座への毎月入金（ユーザー設定）。有効・入金額>0・登録済み証券口座のみを対象に前計算する。
  // 未設定（配列が空 / 無効 / 0円）の場合は何も加算しない（毎月1日などの自動補完はしない）。
  const monthlyDeposits = validMonthlyBrokerageDeposits(state);

  const { indexLots, stockLots } = cloneHoldingsState(state, dailyOverride);
  let { bank, sec } = initialCash(state);
  const secInitial = sec;
  const bankInitial = bank;
  // 仮想証券口座現金(vsec): 現金の有無に関わらず全予定購入を実行した前提の残高。
  // sec と同じ入金・出金を受けつつ、購入は「予定額」を必ず差し引く（現実モードでも実行判定に関係なく）。
  // その最小値 minVsec が最も深い不足を表し、必要な追加振替額 ＝ max(0, −最大不足額) を1円単位の整数で求める。
  // 年利計算の小数はここに一切混ぜない（資金不足判定・追加振替額は整数キャッシュフローのみで計算する）。
  let vsec = sec;
  let minVsec = vsec;
  const noteVsec = (delta) => { vsec += delta; if (vsec < minVsec) minVsec = vsec; };
  let synth = 0; // What-If追加投資の合成枠
  // 証券口座現金の内訳（累計）。secCash = 初期 + 振替入金 + その他入金 − NISA購入 − 個別株購入 − 振替出金 − その他出金
  let cumXferIn = 0, cumDepositIn = 0, cumNisaBuy = 0, cumStockBuy = 0, cumXferOut = 0, cumWithdraw = 0;
  // 積立・購入の「予定額（現金の有無に関わらず発生する額）」と「未実行額（現金不足で購入できなかった額）」の累計。
  //   理想モードでは全額が実行されるため missed は常に0・bought は planned と一致する。
  let cumNisaPlanned = 0, cumStockPlanned = 0, cumNisaMissed = 0, cumStockMissed = 0;
  let nisaExec = 0, nisaMiss = 0; // NISA積立の実行回数・未実行回数（毎日の積立の実績カウント）
  // 銀行残高の内訳（累計）。bankCash = 初期 + 収入 − 支出 − 証券への振替(cumXferIn) + 証券からの振替(cumXferOut)
  let cumBankIncome = 0, cumBankExpense = 0;
  const shortfalls = []; // 現金不足で実行できなかった購入 [{date, month, kind, name, amount, deficit}]
  const accrualLog = []; // 積立・振替の日次履歴（選択日内訳のタイムライン用）
  // 月別の集計（証券口座現金不足の警告表示用）。ym('YYYY-MM') ごとに
  //   deposit: 証券口座への入金予定額（銀行→証券の振替＋その他入金）
  //   invest : 投資購入予定額（NISA積立＋個別株購入、資金の有無に関わらず「予定額」を計上）
  const monthDeposit = new Map();
  const monthInvest = new Map();
  const addMonth = (map, ym, v) => { if (v) map.set(ym, (map.get(ym) || 0) + v); };

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
      // 銀行残高の内訳（タップで確認できるように保持）
      bankInitial: Math.round(bankInitial),
      bankIncome: Math.round(cumBankIncome), bankExpense: Math.round(cumBankExpense),
      bankXferToSec: Math.round(cumXferIn), bankXferFromSec: Math.round(cumXferOut),
      // 積立・購入の実績（理想・現実の比較用）
      plannedContrib: Math.round(cumNisaPlanned + cumStockPlanned), // 累計積立予定額（現金の有無に関わらず）
      boughtContrib: Math.round(cumNisaBuy + cumStockBuy),          // 実際に購入できた累計額
      missedContrib: Math.round(cumNisaMissed + cumStockMissed),    // 現金不足で購入できなかった累計額
      nisaExec, nisaMiss,                                           // NISA積立の実行回数・未実行回数
    };
  };

  // 1日分のキャッシュフローを反映（同日は 入金→積立→株購入→出金 の順）。呼び出し側で from<iso<=to を保証する。
  const stepDay = (iso) => {
    const dd = byDay.get(iso);
    const ym = iso.slice(0, 7);

    // 0) 証券口座への毎月入金（ユーザー設定）。同日内で最初に処理し、入金後の現金で積立購入できるようにする。
    //    29/30/31日を指定した月にその日が無い場合は、resolveDay がその月の最終日へ丸める（入金をスキップしない）。
    if (monthlyDeposits.length) {
      const y = Number(iso.slice(0, 4)), m0 = Number(iso.slice(5, 7)) - 1, dnum = Number(iso.slice(8, 10));
      for (const md of monthlyDeposits) {
        if (resolveDay(y, m0, md.day) !== dnum) continue;
        sec += md.amount; noteVsec(md.amount); cumDepositIn += md.amount; addMonth(monthDeposit, ym, md.amount);
        if (logAccruals) accrualLog.push({ date: iso, kind: 'deposit', name: `${md.accountName}への毎月入金`, amount: md.amount, secAfter: Math.round(sec) });
      }
    }

    // 1) 銀行→証券の振替入金 / 2) 証券口座へのその他入金
    if (dd) {
      if (dd.xin) { sec += dd.xin; noteVsec(dd.xin); cumXferIn += dd.xin; addMonth(monthDeposit, ym, dd.xin); if (logAccruals) accrualLog.push({ date: iso, kind: 'transfer', name: '銀行→証券の振替', amount: dd.xin, secAfter: Math.round(sec) }); }
      if (dd.din) { sec += dd.din; noteVsec(dd.din); cumDepositIn += dd.din; addMonth(monthDeposit, ym, dd.din); if (logAccruals) accrualLog.push({ date: iso, kind: 'deposit', name: '証券口座への入金', amount: dd.din, secAfter: Math.round(sec) }); }
    }

    // 3) NISA積立購入（1日あたりの積立額のみ証券口座現金から減額。現金不足なら実行せず記録）
    //    実行時は「証券口座現金を減らし」「NISA元本を同額増やし」「NISA評価額を更新」を同時に行う（資産は移動するだけ）。
    for (const l of indexLots) {
      for (const a of l.accums) {
        const amt = contributionForDate(a, iso);
        if (amt <= 0) continue;
        addMonth(monthInvest, ym, amt); // 資金の有無に関わらず「その月の投資予定額」として集計
        cumNisaPlanned += amt;          // 累計積立予定額（理想・現実共通）
        noteVsec(-amt);                 // 予定購入は仮想現金から必ず差し引き、最大不足額を測る
        // 理想モードは現金不足でも実行（ignoreCash）。現実モードは現金が足りる日のみ実行し、
        // 不足日は購入せず未実行として記録する（現金はマイナスにしない・後日まとめ買いもしない）。
        if (ignoreCash || sec >= amt) {
          sec -= amt; l.principal += amt; l.value += amt; cumNisaBuy += amt; nisaExec++;
          if (logAccruals) accrualLog.push({ date: iso, kind: 'accumulation', name: l.name, amount: -amt, secAfter: Math.round(sec) });
        } else {
          cumNisaMissed += amt; nisaMiss++;
          shortfalls.push({ date: iso, month: ym, kind: 'accumulation', name: l.name, amount: amt, deficit: Math.round(amt - sec) });
        }
      }
    }

    // 4) 個別株の購入予定（現金不足なら実行せず記録）
    for (const l of stockLots) {
      for (const p of l.plannedPurchases) {
        if (p._applied || !p.date || p.date !== iso || p.date <= from) continue;
        const amt = n(p.amount);
        if (amt <= 0) { p._applied = true; continue; }
        addMonth(monthInvest, ym, amt); // 資金の有無に関わらず「その月の投資予定額」として集計
        cumStockPlanned += amt;
        noteVsec(-amt);                 // 予定購入は仮想現金から必ず差し引き、最大不足額を測る
        if (ignoreCash || sec >= amt) {
          sec -= amt; l.principal += amt; l.value += amt; cumStockBuy += amt; p._applied = true;
          if (logAccruals) accrualLog.push({ date: iso, kind: 'purchase', name: l.name, amount: -amt, secAfter: Math.round(sec) });
        } else {
          cumStockMissed += amt;
          shortfalls.push({ date: iso, month: ym, kind: 'purchase', name: l.name, amount: amt, deficit: Math.round(amt - sec) });
        }
      }
    }

    // 5) 証券→銀行の振替出金 / 証券口座からのその他出金・銀行残高の増減
    if (dd) {
      if (dd.xout) { sec -= dd.xout; noteVsec(-dd.xout); cumXferOut += dd.xout; if (logAccruals) accrualLog.push({ date: iso, kind: 'transfer', name: '証券→銀行の振替', amount: -dd.xout, secAfter: Math.round(sec) }); }
      if (dd.dout) { sec -= dd.dout; noteVsec(-dd.dout); cumWithdraw += dd.dout; if (logAccruals) accrualLog.push({ date: iso, kind: 'withdraw', name: '証券口座からの出金', amount: -dd.dout, secAfter: Math.round(sec) }); }
      bank += dd.bank;
      cumBankIncome += dd.binc; cumBankExpense += dd.bexp;
    }
  };

  // 月末処理: 配当・What-If・評価額の成長
  const stepMonthEnd = () => {
    // 4') 個別株の配当金(毎月按分)。再投資ONは評価額へ、OFFは銀行資金へ現金化する想定。
    for (const l of stockLots) {
      if (l.dividendYield > 0) {
        const div = l.value * (l.dividendYield / 100 / 12);
        if (l.dividendReinvest) l.value += div; else bank += div;
      }
    }
    // 5') What-If 追加投資（任意）。「毎月これだけ多く積立できたら」という仮定の追加投資。
    //     投資購入で銀行残高をマイナスにしない方針のため、銀行・証券口座現金は減らさず、
    //     追加投資ぶん(合成枠 synth)だけを積み増して評価額・総資産の伸びを試算する。
    if (extra > 0) {
      synth += extra;
      synth += synth * (rateFor(scenarioRate(fs)) / 100 / 12);
    }
    // 6') 評価額の成長(想定年利・単利/複利)
    for (const l of indexLots) growLot(l, rateFor(l.rate), l.mode);
    for (const l of stockLots) growLot(l, rateFor(l.rate), l.mode);
  };

  // requiredExtra: これまでに歩いた期間で発生した「証券口座現金の最大不足額」（1円単位の整数）。
  // ＝ max(0, −minVsec)。日付順に計算した最大不足額そのもので、単純な月間合計ではない。
  const requiredExtra = () => Math.max(0, Math.round(-minVsec));
  return { snapshot, stepDay, stepMonthEnd, shortfalls, accrualLog, monthDeposit, monthInvest, requiredExtra };
}

export function project(state, opts = {}) {
  const fs = state.futureSim || {};
  const years = Math.max(1, opts.years ?? fs.years ?? 10);
  const from = jstTodayISO();
  const base = parseISO(from);
  const to = toISO(addMonths(base, years * 12));

  const sim = createProjection(state, opts, from, to);
  const series = [sim.snapshot(from)];
  const months = years * 12;

  // from の当月（部分月）の残り日を先に反映する。
  // 月次ループ(k=1..)は from の翌月から始まり当月の残り日を飛ばすため、ここで補う。
  // snapshotAt も同じく当月の残り日を反映しており、両者の日次キャッシュフローを完全に一致させる
  // （これが「現実シミュレーション結果」と「日付別の資産推移」で不足日がずれる不具合の原因だった）。
  // 当月末では成長を加えない（成長回数は from の翌月からに揃え、snapshotAt と一致させる）。
  {
    const y0 = base.getFullYear(), m0 = base.getMonth();
    const dim0 = daysInMonth(y0, m0);
    for (let day = base.getDate() + 1; day <= dim0; day++) {
      const iso = `${y0}-${pad(m0 + 1)}-${pad(day)}`;
      if (iso > to) break;
      sim.stepDay(iso);
    }
  }

  for (let k = 1; k <= months; k++) {
    const dcur = addMonths(base, k);
    const y = dcur.getFullYear(), mIdx = dcur.getMonth();
    const dim = daysInMonth(y, mIdx);
    const monthEndISO = toISO(new Date(y, mIdx + 1, 0));
    const pointISO = monthEndISO > to ? to : monthEndISO;

    // --- 日付順にキャッシュフローを反映 ---
    for (let day = 1; day <= dim; day++) {
      const iso = `${y}-${pad(mIdx + 1)}-${pad(day)}`;
      if (iso <= from || iso > to) continue;
      sim.stepDay(iso);
    }
    // --- 月末処理: 配当・What-If・評価額の成長 ---
    sim.stepMonthEnd();
    series.push(sim.snapshot(pointISO));
  }

  return {
    from, to, years, series, shortfalls: sim.shortfalls,
    requiredExtra: sim.requiredExtra(),
    monthDeposit: Object.fromEntries(sim.monthDeposit), monthInvest: Object.fromEntries(sim.monthInvest),
  };
}

// ===== 選択日の精密スナップショット（日次で証券口座現金・元本・評価額を計算） =====
// project() の月次系列（月末粒度）ではなく、選択された「その日」まで1日ずつ資金移動を反映して
// 証券口座現金・NISA元本・個別株元本・評価額・合計資産・利益率を再計算する。
// 表示側は口座の現在値を直接使わず、この計算結果で上書きする（日付変更で必ず再計算される）。
// 評価額の成長（想定年利）は project() と同じく月末に発生する。到達済みの月末ぶんのみ反映する。
// project() の月次ループは from を含む「途中の月」を飛ばして翌月から始まるため、成長の回数を合わせるべく
// snapshotAt でも from と同じ年月の月末では成長を加えない（＝最初の丸ごと1ヶ月ぶんから成長を数える）。
// これにより選択日がちょうど月末なら valuation・total・利益率が月次系列(project)と一致する。
// 一方で積立・振替・購入などの資金移動は、from の翌日から選択日当日まで1日ずつ反映する（近日の積立も必ず反映される）。
export function snapshotAt(state, targetISO, opts = {}) {
  const fs = state.futureSim || {};
  const years = Math.max(1, opts.years ?? Math.max(fs.years ?? 10, 30));
  const from = jstTodayISO();
  const base = parseISO(from);
  const to = toISO(addMonths(base, years * 12));
  const fromYM = from.slice(0, 7);
  // 範囲外は端へクランプ（過去日→現在、遠い未来→シミュレーション最終日）
  const target = targetISO < from ? from : (targetISO > to ? to : targetISO);

  const sim = createProjection(state, opts, from, to);
  if (target <= from) {
    return { ...sim.snapshot(from), from, to, shortfalls: sim.shortfalls, accrualLog: sim.accrualLog, requiredExtra: sim.requiredExtra() };
  }

  // from の翌日から target まで1日ずつ資金移動を反映。丸ごと通過した月末ごとに評価額の成長を適用する。
  const cur = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  let guard = 0;
  while (guard++ < 20000) {
    cur.setDate(cur.getDate() + 1);
    const iso = toISO(cur);
    if (iso > target) break;
    sim.stepDay(iso);
    const isMonthEnd = cur.getDate() === daysInMonth(cur.getFullYear(), cur.getMonth());
    // from と同じ月の月末は成長を数えない（project の月次ループ開始に合わせる）
    if (isMonthEnd && iso <= target && iso.slice(0, 7) !== fromYM) sim.stepMonthEnd();
  }

  return { ...sim.snapshot(target), from, to, shortfalls: sim.shortfalls, accrualLog: sim.accrualLog, requiredExtra: sim.requiredExtra() };
}

// ===== 証券口座現金の資金計画（毎月必要な振替額 vs 現在の振替設定額） =====
// requiredMonthly: 毎月の投資（NISA積立）に必要な概算額（毎日=日額×約30.4／毎週=日額×約4.35／毎月=月額）。
// currentMonthlyTransfer: 現在の「銀行→証券」固定振替の月合計。
// opts.dailyOverride: 「毎日の積立額を仮変更」した場合の必要額を計算する（毎日の積立設定のみ日額を置換）。
export function securitiesCashPlan(state, opts = {}) {
  const dailyOverride = opts.dailyOverride == null ? null : n(opts.dailyOverride);
  let currentMonthlyTransfer = 0;
  for (const rt of state.recurringTransfers || []) {
    if (isSecAcc(state, rt.toAccountId) && !isSecAcc(state, rt.fromAccountId)) currentMonthlyTransfer += n(rt.amount);
  }
  // 証券口座への毎月入金（ユーザー設定）も毎月の入金額として合算する。
  for (const md of validMonthlyBrokerageDeposits(state)) currentMonthlyTransfer += md.amount;
  let requiredMonthly = 0;
  for (const acc of securitiesAccounts(state)) {
    for (const a of acc.accumulations || []) {
      if (a.enabled === false) continue;
      const freq = a.frequency || 'daily';
      if (freq === 'monthly') { requiredMonthly += n(a.monthlyAmount); continue; }
      if (freq === 'weekly') { requiredMonthly += n(a.dailyAmount) * (52 / 12); continue; }
      // 毎日: 土日祝日を実行しない設定なら営業日ぶん(年約245日)、含める設定なら暦日ぶん(365日)で概算する。
      // 実際の日次シミュレーション(project)は営業日のみ積み立てるため、365/12 の暦日概算では
      // 「毎月の不足見込み」が過大に出て、日付順の結果(資金不足なし)と矛盾していた。営業日基準に合わせる。
      const amt = (dailyOverride != null ? dailyOverride : n(a.dailyAmount));
      const daysPerYear = a.includeHolidays === false ? 245 : 365;
      requiredMonthly += amt * (daysPerYear / 12);
    }
  }
  requiredMonthly = Math.round(requiredMonthly);
  currentMonthlyTransfer = Math.round(currentMonthlyTransfer);
  return { currentMonthlyTransfer, requiredMonthly, monthlyShortfall: Math.max(0, requiredMonthly - currentMonthlyTransfer) };
}

// 現在の「毎日の積立額」の合計（毎日頻度の有効な積立設定の日額合計）。
// 積立変更シミュレーションのスライダー初期値・「現在は毎日X円」の表示に使う。
export function currentDailyContribution(state) {
  let total = 0;
  for (const acc of securitiesAccounts(state)) {
    for (const a of acc.accumulations || []) {
      if (a.enabled === false) continue;
      if ((a.frequency || 'daily') === 'daily') total += n(a.dailyAmount);
    }
  }
  return Math.round(total);
}

// 「毎日の積立設定」があるか（積立変更シミュレーションが有効に機能するか）。
export function hasDailyAccumulation(state) {
  for (const acc of securitiesAccounts(state)) {
    for (const a of acc.accumulations || []) {
      if (a.enabled === false) continue;
      if ((a.frequency || 'daily') === 'daily') return true;
    }
  }
  return false;
}

// ===== 理想 vs 現実（同じ積立額・年利・保有期間で両モードを計算） =====
// dailyOverride を両モードへ同じ値で適用し、比較表・比較グラフのデータをまとめて返す。
export function idealVsReality(state, opts = {}) {
  const fs = state.futureSim || {};
  const years = Math.max(1, opts.years ?? fs.years ?? 10);
  const dailyOverride = opts.dailyOverride == null ? null : n(opts.dailyOverride);
  const common = { years, dailyOverride };
  const ideal = project(state, { ...common, mode: 'ideal' });
  const reality = project(state, { ...common, mode: 'reality' });
  return { years, dailyOverride, ideal, reality };
}

// 証券口座現金の不足（購入を実行できなかった最初の予定）。無ければ null。
export function firstSecShortfall(proj) {
  return proj && proj.shortfalls && proj.shortfalls.length ? proj.shortfalls[0] : null;
}

// 証券口座現金の不足レポート（警告表示用）。
// NISA積立・個別株購入が「購入直前の証券口座現金 ＜ 当日の購入予定額」で実行できなかった
// 最初の予定を、その月の入金予定額・投資購入予定額・必要な追加振替額とともに返す（無ければ null）。
// 資金不足の判定は銀行残高ではなく証券口座現金のみを参照する（proj.shortfalls と完全に一致）。
// 判定式・不足日・必要な追加振替額はすべて共通シミュレーション(project)の結果だけから求め、
// 画面ごとに別ロジックを持たせない。365/12 などの月間概算では判定・警告しない
// （概算に由来する根拠のない不足額の表示を防ぐ）。
export function securitiesShortfallReport(state, proj, opts = {}) {
  const list = (proj && proj.shortfalls) || [];
  if (!list.length) return null;
  // 実際に購入できなかった最初の予定（NISA積立・個別株購入のうち日付が最も早いもの）。
  // 種類による除外はしない（現金不足で実行できなかった時点で、すべての画面で不足として扱う）。
  const first = [...list].sort((a, b) => a.date.localeCompare(b.date))[0];
  const monthDeposit = n((proj.monthDeposit || {})[first.month]);
  const monthInvest = n((proj.monthInvest || {})[first.month]);
  // 必要な追加振替額 ＝ max(0, シミュレーション期間中に発生する最大不足額)。
  // 日付順に計算した証券口座現金の最大不足額(proj.requiredExtra)そのもので、月間合計の差ではない。
  const requiredExtraTransfer = Math.max(0, n(proj.requiredExtra));
  return {
    date: first.date, month: first.month, deficit: first.deficit,
    kind: first.kind, name: first.name,
    monthDeposit, monthInvest, requiredExtraTransfer,
    plan: securitiesCashPlan(state, { dailyOverride: opts.dailyOverride }),
  };
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
  const p = project(state, {
    years: 30, rateOverride: opts.rateOverride, extraMonthlyInvestment: opts.extraMonthlyInvestment,
    mode: opts.mode, dailyOverride: opts.dailyOverride,
  });
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
