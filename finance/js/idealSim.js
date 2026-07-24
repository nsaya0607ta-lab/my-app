// idealSim.js — 理想シミュレーション専用の計算エンジン（自由に組み立てる資金計画）
// 方針:
//   ・実際の口座残高・積立設定・固定振替は一切参照・変更しない。プランオブジェクトだけを入力にする純粋関数。
//   ・証券口座現金は「初期証券口座現金＋自動入金−投資購入」を日付順に前進させて独立計算する。
//   ・毎月の入金日・投資日はユーザー設定の日付をそのまま使う（1日固定にしない）。
//     31日など存在しない日はその月の月末へ丸める（resolveDay）。
//   ・すべて日本時間(Asia/Tokyo)の暦日(YYYY-MM-DD)で計算し、UTC変換で前後にずらさない。
//   ・同じ日に入金と購入があれば「入金 → NISA積立 → 個別株購入」の順に処理する。
//
// プラン(plan)のデータ構造:
//   {
//     startDate: 'YYYY-MM-DD',   // シミュレーション開始日
//     initialSecCash: number,    // 初期証券口座現金
//     annualReturn: number,      // 想定年利(%)
//     returnMode: 'compound'|'simple',
//     years: number,             // 保有期間
//     shortageMode: 'strict'|'continue', // 現金不足時: 厳密に再現 / 不足を無視して継続
//     targetAmount: number,      // 目標金額（評価額。0なら未設定）
//     deposits: [                // 証券口座への自動入金（複数）
//       { id, amount, frequency:'monthly'|'weekly'|'daily', day:1..31, weekday:0..6,
//         startDate, endDate, enabled }
//     ],
//     investments: [             // 投資設定（複数）
//       { id, name, kind:'nisa'|'stock', nisaFrame:'growth'|'tsumitate',
//         frequency:'daily'|'weekly'|'monthly', amount, day:1..31, weekday:0..6,
//         startDate, endDate, includeHolidays, nonBusinessDay:'skip'|'carryover', enabled }
//     ],
//   }

import { pad, toISO, parseISO, addMonths, daysInMonth, resolveDay, uid } from './utils.js?v=20260724c';
import { isBusinessDay, prevISO } from './holidays.js?v=20260724c';

const n = (v) => Number(v) || 0;

// ===== 曜日（日本時間の暦日から。UTCゲッタで読んでズレを防ぐ） =====
const dowOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

// ===== 有効期間の判定（開始日以降・終了日以前。文字列比較） =====
const inRange = (item, iso) =>
  (!item.startDate || iso >= item.startDate) && (!item.endDate || iso <= item.endDate);

// ===== スケジュール上その日に発生する生の金額（土日祝日の判定は含めない） =====
// frequency: 'monthly'（day=1..31、存在しない日は月末へ丸め）｜'weekly'（weekday=0..6）｜'daily'
function scheduledRaw(item, iso, defaultFreq) {
  const freq = item.frequency || defaultFreq;
  if (freq === 'monthly') {
    const [y, m, d] = iso.split('-').map(Number);
    const target = resolveDay(y, m - 1, item.day == null ? 1 : item.day); // 月末丸め
    return d === target ? n(item.amount) : 0;
  }
  if (freq === 'weekly') {
    const wd = item.weekday == null ? 1 : Number(item.weekday); // 既定は月曜
    return dowOf(iso) === wd ? n(item.amount) : 0;
  }
  return n(item.amount); // daily
}

// ===== 指定日に実際に発生する金額（有効期間・土日祝日の扱いを反映） =====
// applyBusiness=true のとき、includeHolidays===false なら非営業日は実行しない。
//   nonBusinessDay==='carryover' は直前の連続する非営業日ぶんをこの営業日へ繰り越す（各予定日1回だけ）。
// 入金(deposit)は applyBusiness=false（暦日どおり・月末丸めのみ）、投資(investment)は applyBusiness=true。
export function occursAmount(item, iso, { applyBusiness = false, defaultFreq = 'monthly' } = {}) {
  if (item.enabled === false) return 0;
  if (!inRange(item, iso)) return 0;
  if (applyBusiness && item.includeHolidays === false) {
    if (!isBusinessDay(iso)) return 0;
    let total = scheduledRaw(item, iso, defaultFreq);
    if ((item.nonBusinessDay || 'skip') === 'carryover') {
      let cur = prevISO(iso), guard = 0;
      while (guard < 40 && !isBusinessDay(cur) && inRange(item, cur)) {
        total += scheduledRaw(item, cur, defaultFreq);
        cur = prevISO(cur); guard++;
      }
    }
    return total;
  }
  return scheduledRaw(item, iso, defaultFreq);
}

// ===== 既定の理想プラン（新規作成時の初期値） =====
export function defaultIdealPlan(startISO) {
  const start = startISO || jstToday();
  return {
    startDate: start,
    initialSecCash: 0,
    annualReturn: 10,
    returnMode: 'compound',
    years: 5,
    shortageMode: 'strict',
    targetAmount: 0,
    deposits: [],
    investments: [],
  };
}
function jstToday() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// ===== 期間の重複検出（入金額・投資額の途中変更で期間が重なっていないか） =====
// 同種の設定どうしで [startDate,endDate] が重なるペアがあれば返す（空欄は無期限とみなす）。
// deposits は全体で、investments は同じ kind ごとに判定する。
export function findOverlaps(items, { byKind = false } = {}) {
  const pairs = [];
  const list = items.filter((x) => x.enabled !== false);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (byKind && (a.kind || 'nisa') !== (b.kind || 'nisa')) continue;
      const as = a.startDate || '0000-01-01', ae = a.endDate || '9999-12-31';
      const bs = b.startDate || '0000-01-01', be = b.endDate || '9999-12-31';
      if (as <= be && bs <= ae) pairs.push([a, b]);
    }
  }
  return pairs;
}

// ===== 投資設定の同日処理順（NISA積立 → 個別株購入） =====
const investOrder = (inv) => ((inv.kind || 'nisa') === 'stock' ? 1 : 0);

// ===== 理想プランのシミュレーション本体 =====
// opts.logDays: true なら日次の入出金履歴(dailyLog)を全期間ぶん記録する（日付別詳細・タイムライン用）。
//   件数が多くなるため、既定(false)では最初の資金不足の周辺のみ最小限に記録する。
export function runIdealPlan(plan, opts = {}) {
  const p = normalizePlan(plan);
  const from = p.startDate;
  const years = Math.max(1, p.years);
  const to = toISO(addMonths(parseISO(from), years * 12));
  const monthlyRate = p.annualReturn / 100 / 12;
  const logDays = !!opts.logDays;

  const investments = [...p.investments].sort((a, b) => investOrder(a) - investOrder(b));

  // ---- 状態 ----
  let sec = p.initialSecCash;      // 証券口座現金（選択モードに従う。厳密モードでは0未満にしない）
  let vsec = p.initialSecCash;     // 仮想現金（全投資を実行した前提。不足額の算出に使う）
  let principal = 0, valuation = 0;
  let cumDeposit = 0, cumInvestPlanned = 0, cumInvestExec = 0, cumMissed = 0;
  let execCount = 0, missCount = 0;
  let minVsec = vsec;              // 仮想現金の最小値（負なら不足）
  let peakDeficit = 0, peakMonthIndex = 0; // 最大不足額と、その時点の経過月数
  let monthsElapsed = 0;          // 開始からの経過月数（月末ごとに+1）
  let firstShortageDate = null, firstShortageDeficit = 0, firstShortageName = '';
  let targetReachDate = null;
  const target = n(p.targetAmount);
  const dailyLog = [];
  const shortfalls = [];
  const series = [];

  const pushLog = (date, kind, name, amount) => {
    if (logDays) dailyLog.push({ date, kind, name, amount, secAfter: Math.round(sec) });
  };
  const runningRequiredExtra = () => Math.max(0, Math.round(-minVsec));

  const snapshot = (date) => ({
    date,
    secCash: Math.round(sec),
    cumDeposit: Math.round(cumDeposit),
    principal: Math.round(principal),
    valuation: Math.round(valuation),
    profit: Math.round(valuation - principal),
    requiredExtra: runningRequiredExtra(),
  });

  // 1日分のキャッシュフロー（入金 → NISA積立 → 個別株購入 の順）
  const stepDay = (iso) => {
    // 1) 証券口座への自動入金
    for (const dep of p.deposits) {
      const amt = occursAmount(dep, iso, { applyBusiness: false, defaultFreq: 'monthly' });
      if (amt <= 0) continue;
      sec += amt; vsec += amt; cumDeposit += amt;
      pushLog(iso, 'deposit', dep.memo || '証券口座への入金', amt);
    }
    // 2) 投資（NISA積立 → 個別株購入）
    for (const inv of investments) {
      const amt = occursAmount(inv, iso, { applyBusiness: true, defaultFreq: 'daily' });
      if (amt <= 0) continue;
      cumInvestPlanned += amt;
      vsec -= amt;
      if (vsec < minVsec) { minVsec = vsec; if (-vsec > peakDeficit) { peakDeficit = -vsec; peakMonthIndex = monthsElapsed; } }
      const label = inv.name || ((inv.kind || 'nisa') === 'stock' ? '個別株購入' : 'NISA積立');
      if (p.shortageMode === 'continue' || sec >= amt) {
        // 継続モード（現金不足でも実行。現金はマイナスを許容）／厳密モードで現金が足りる日
        sec -= amt; principal += amt; valuation += amt; cumInvestExec += amt; execCount++;
        pushLog(iso, (inv.kind || 'nisa') === 'stock' ? 'purchase' : 'accumulation', label, -amt);
      } else {
        // 厳密モードで現金不足 → その日の購入は未実行として記録（元本・評価額へ加算しない）
        cumMissed += amt; missCount++;
        if (!firstShortageDate) { firstShortageDate = iso; firstShortageDeficit = Math.round(amt - sec); firstShortageName = label; }
        shortfalls.push({ date: iso, month: iso.slice(0, 7), name: label, amount: Math.round(amt), deficit: Math.round(amt - sec) });
      }
      // 目標評価額への到達
      if (target > 0 && !targetReachDate && valuation >= target) targetReachDate = iso;
    }
  };

  // 月末処理: 評価額の成長（想定年利・複利/単利）
  const stepMonthEnd = (monthEndISO) => {
    if (p.returnMode === 'simple') valuation += principal * monthlyRate;
    else valuation += valuation * monthlyRate;
    monthsElapsed++;
    // 評価額の成長だけで目標へ達した場合も、その月末を到達日とみなす
    if (target > 0 && !targetReachDate && valuation >= target) targetReachDate = monthEndISO;
  };

  // ---- 開始日の初期スナップショット（純粋に初期証券口座現金だけ） ----
  series.push(snapshot(from));

  // ---- 日付順に前進（from 当日から to まで。月末で成長＋スナップショット） ----
  const cur = parseISO(from);
  let guard = 0;
  while (guard++ < 20000) {
    const iso = toISO(cur);
    if (iso > to) break;
    stepDay(iso);
    const next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
    const isMonthEnd = next.getMonth() !== cur.getMonth();
    if (isMonthEnd) { stepMonthEnd(iso); series.push(snapshot(iso)); }
    cur.setTime(next.getTime());
  }
  // 末尾が月末でなければ最終日のスナップショットを追加
  if (series[series.length - 1].date !== to) series.push(snapshot(to));

  const months = Math.max(1, years * 12);
  const currentMonthly = Math.round(cumDeposit / months);         // 毎月の平均入金額
  const requiredExtra = Math.max(0, Math.round(-minVsec));         // 必要な追加資金（全投資を実行するための最大不足額）
  // 不足を解消するために現状へ上乗せすべき毎月の入金額（最大不足を、その時点までの月数で割った概算）
  const extraMonthly = requiredExtra > 0 ? Math.ceil(requiredExtra / Math.max(1, peakMonthIndex)) : 0;
  const requiredMonthly = currentMonthly + extraMonthly;
  const profit = Math.round(valuation - principal);
  const profitRate = principal > 0 ? (profit / principal) * 100 : null;

  return {
    from, to, years, shortageMode: p.shortageMode,
    series, dailyLog, shortfalls,
    summary: {
      initialSecCash: Math.round(p.initialSecCash),
      cumDeposit: Math.round(cumDeposit),
      cumInvestPlanned: Math.round(cumInvestPlanned),
      cumInvestExec: Math.round(cumInvestExec),
      cumMissed: Math.round(cumMissed),
      execCount, missCount,
      finalSecCash: Math.round(sec),
      principal: Math.round(principal),
      valuation: Math.round(valuation),
      profit, profitRate,
      requiredExtra,
      currentMonthly, requiredMonthly, extraMonthly,
      firstShortageDate, firstShortageDeficit, firstShortageName,
      targetAmount: target, targetReachDate,
      annualReturn: p.annualReturn,
    },
  };
}

// ===== プランの欠損値を補完した安全なコピーを返す（実データは触らない） =====
export function normalizePlan(plan) {
  const base = defaultIdealPlan(plan && plan.startDate);
  const p = { ...base, ...(plan || {}) };
  p.initialSecCash = n(p.initialSecCash);
  p.annualReturn = n(p.annualReturn);
  p.years = Math.max(1, Math.round(n(p.years) || 5));
  p.returnMode = p.returnMode === 'simple' ? 'simple' : 'compound';
  p.shortageMode = p.shortageMode === 'continue' ? 'continue' : 'strict';
  p.targetAmount = n(p.targetAmount);
  p.deposits = Array.isArray(p.deposits) ? p.deposits.map(normalizeDeposit) : [];
  p.investments = Array.isArray(p.investments) ? p.investments.map(normalizeInvestment) : [];
  return p;
}
function normalizeDeposit(d) {
  return {
    id: d.id || uid('dep'),
    amount: n(d.amount),
    frequency: ['daily', 'weekly', 'monthly'].includes(d.frequency) ? d.frequency : 'monthly',
    day: d.day == null ? 15 : Number(d.day),
    weekday: d.weekday == null ? 1 : Number(d.weekday),
    startDate: d.startDate || null,
    endDate: d.endDate || null,
    enabled: d.enabled !== false,
    memo: d.memo || '',
  };
}
function normalizeInvestment(v) {
  return {
    id: v.id || uid('inv'),
    name: v.name || '',
    kind: v.kind === 'stock' ? 'stock' : 'nisa',
    nisaFrame: v.nisaFrame === 'tsumitate' ? 'tsumitate' : 'growth',
    frequency: ['daily', 'weekly', 'monthly'].includes(v.frequency) ? v.frequency : 'daily',
    amount: n(v.amount),
    day: v.day == null ? 15 : Number(v.day),
    weekday: v.weekday == null ? 1 : Number(v.weekday),
    startDate: v.startDate || null,
    endDate: v.endDate || null,
    includeHolidays: v.includeHolidays === true, // 既定は土日祝日を実行しない
    nonBusinessDay: v.nonBusinessDay === 'carryover' ? 'carryover' : 'skip',
    enabled: v.enabled !== false,
  };
}

// ===== 目標到達日（購入で評価額が目標へ達した最初の日） =====
// runIdealPlan の summary.targetReachDate をそのまま使う簡易ラッパ。
export function idealGoalDate(plan) {
  return runIdealPlan(plan).summary.targetReachDate;
}

// ===== 選択日までの日次詳細（証券口座現金の内訳・入出金タイムライン） =====
// 指定日 targetISO までのスナップショット＋その日までの dailyLog を返す。
export function idealSnapshotAt(plan, targetISO) {
  const res = runIdealPlan(plan, { logDays: true });
  const target = targetISO < res.from ? res.from : (targetISO > res.to ? res.to : targetISO);
  // series から target 以前で最も新しい点
  let pt = res.series[0];
  for (const s of res.series) { if (s.date <= target) pt = s; else break; }
  const log = res.dailyLog.filter((r) => r.date <= target);
  return { ...pt, target, from: res.from, to: res.to, log };
}
