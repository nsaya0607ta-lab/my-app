// store.js — 単一の状態ソース。localStorage永続化・購読・CRUD・初期データ。
// 設計方針: すべてのデータはこの1オブジェクトに集約し、mutate → save → emit。
// 将来の証券口座連携などは accounts の type と外部同期モジュールを足すだけで拡張可能。

import { uid, pad } from './utils.js?v=20260723s';
import { settlementDate } from './calc.js?v=20260723s';
import {
  recurringActiveOn, monthlyOccurrences, jstTodayISO, dedupeKey,
  nextRecurringDate, nextSettlementDate,
} from './recurrence.js?v=20260723s';
import { isSecurities, hasSecurities, recomputeAccount, performanceSnapshot, jstNowISO } from './securities.js?v=20260723s';

const KEY = 'finance_app_v2';
const SCHEMA = 1;
const todayISO = () => jstTodayISO(); // 「今日」は常に日本時間

// 定期取引に「次回実行予定日・次回引落予定日」を計算して保存する。
// 登録日・今日を実行予定日に流用せず、開始日と実行日から算出する（編集時も再計算）。
export function computeRecurringSchedule(s) {
  const ref = jstTodayISO();
  for (const r of s.recurring || []) {
    r.nextRun = nextRecurringDate(r, ref);
    if (r.type === 'expense' && r.paymentMethod === 'card' && r.cardId) {
      const card = (s.cards || []).find((c) => c.id === r.cardId);
      r.nextSettlement = card ? nextSettlementDate(r, card, ref) : null;
    } else {
      r.nextSettlement = null;
    }
  }
  for (const rt of s.recurringTransfers || []) rt.nextRun = nextRecurringDate(rt, ref);
}

const listeners = new Set();
let state = load();
// データ変更ごとに増える版数。将来資産シミュレーションのメモ化に使用し、
// 「編集した瞬間に再計算」を無駄なく実現する。
let _version = 0;
export const version = () => _version;

// ---- 初期（シード）データ ----
// 金額はすべて空/ゼロのまっさらな状態。口座・取引・カード・固定収支は未登録で、
// ユーザーが自分のデータを入力していく。カテゴリーだけは使い始めやすいよう
// よく使う項目をプリセットとして用意している（自由に追加・編集・削除可能）。
function seed() {
  const inc = { salary: uid('cat'), side: uid('cat'), dividend: uid('cat'), bonus: uid('cat') };
  const exp = {
    food: uid('cat'), rent: uid('cat'), utility: uid('cat'), gas: uid('cat'),
    comm: uid('cat'), subsc: uid('cat'), hobby: uid('cat'),
  };
  return {
    schema: SCHEMA,
    accounts: [],
    categories: {
      income: [
        { id: inc.salary, name: '給料', color: '#34c759' },
        { id: inc.side, name: '副業', color: '#30d158' },
        { id: inc.dividend, name: '配当金', color: '#5ac8fa' },
        { id: inc.bonus, name: '臨時収入', color: '#64d2ff' },
      ],
      expense: [
        { id: exp.food, name: '食費', color: '#ff9f0a' },
        { id: exp.rent, name: '家賃', color: '#ff375f' },
        { id: exp.utility, name: '光熱費', color: '#ff9500' },
        { id: exp.gas, name: 'ガソリン', color: '#ffd60a' },
        { id: exp.comm, name: '通信費', color: '#bf5af2' },
        { id: exp.subsc, name: 'サブスク', color: '#0a84ff' },
        { id: exp.hobby, name: '趣味', color: '#ff6482' },
      ],
    },
    transactions: [],
    recurring: [],
    cards: [],
    cardTransactions: [],
    transfers: [],
    recurringTransfers: [], // 固定振替（毎月の定期的な資産移動）
    simulation: {
      startAsset: null, // null の場合は総資産に連動
      monthlyIncome: 0,
      monthlyExpense: 0,
      monthlyInvestment: 0,
      annualReturn: 0, // 積立投資の想定年利(%)
      bonusAmount: 0,
      bonusMonths: [],
    },
    // 将来資産シミュレーション（投資予測）の設定。collections/config。
    futureSim: seedFutureSim(),
    settings: {
      secret: false,
      theme: 'auto', // 'auto' | 'light' | 'dark'
      monthlyBudget: 0,
      periodStartDay: 1, // 管理期間の開始日（1〜31）。例: 25 なら 7/25〜8/24 が1期間
      notifiedKeys: [],
    },
    // 総資産の日次スナップショット [{date:'YYYY-MM-DD', total:number}]。
    // 昨日比・今月比・前年比、残高推移ミニグラフに使用。口座残高を編集するたび記録。
    assetHistory: [],
    // 投資実績の日次スナップショット（実績グラフのもと）。評価額を更新するたび記録。
    // 同じ日は最新値で上書き。[{date, secCash, nisaPrincipal, nisaValue, stockPrincipal,
    //  stockValue, principal, valuation, profit, profitRate, holdings, updatedAt}]
    performanceHistory: [],
    // 日中を含む詳細履歴（将来の日中履歴表示用。更新日時つきで追記）。日次履歴とは別に保持。
    performanceLog: [],
  };
}

// ---- 将来資産シミュレーション（投資予測）の初期設定 ----
function seedFutureSim() {
  return {
    years: 10,                 // 保有期間シミュレーション（1/3/5/10/15/20/30年）
    scenario: 'normal',        // 'conservative'|'normal'|'aggressive'|'custom'
    customReturn: 8,           // 自由入力の想定年利(%)
    useOverride: true,         // true: シナリオの年利を全銘柄へ一律適用／false: 銘柄ごとの想定年利を使用
    monteCarlo: { enabled: false, runs: 300, volatility: 15 }, // volatility: 年率リターンの標準偏差(%)
    chartVisible: { total: true, cash: true, secCash: false, principal: false, valuation: true, indexValuation: false, stockValuation: false },
    goals: [],   // 投資達成目標 {id, name, targetAmount, metric:'total'|'valuation', createdAt}
    events: [],  // 将来イベント {id, name, date, amount, memo}
    plans: [],   // 保存済みシミュレーションプラン {id, name, savedAt, config}
    // 投資実績グラフ（実績＋将来予測の連結表示）の設定
    perf: seedPerf(),
  };
}

// ---- 投資実績グラフの表示設定 ----
function seedPerf() {
  return {
    target: 'total',           // 表示対象タブ: 'total'(全体) | 'nisa' | 'stock'
    period: '1m',              // 表示期間: 1w|1m|3m|6m|1y|3y|5y|all
    includeCash: false,        // 全体タブで証券口座の未投資現金を評価額へ含めるか
    forecast: true,            // 今日以降の将来予測を連結表示するか
    byHolding: false,          // NISA/個別株タブで銘柄ごとに表示するか
    // 実績グラフに重ねる系列の表示切替
    visible: { valuation: true, principal: true, profit: false, secCash: false },
  };
}
export const SCENARIO_RATES = { conservative: 5, normal: 8, aggressive: 15 };

// 総資産のスナップショットを記録（同日は上書き、最大400件保持）
export function recordAssetSnapshot(s) {
  const total = s.accounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
  const d = new Date();
  const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  s.assetHistory ||= [];
  const last = s.assetHistory[s.assetHistory.length - 1];
  if (last && last.date === iso) last.total = total;
  else s.assetHistory.push({ date: iso, total });
  if (s.assetHistory.length > 400) s.assetHistory = s.assetHistory.slice(-400);
  // 総資産スナップショットと同じタイミングで投資実績も記録する。
  // これにより評価額・元本・現金が変わる全経路（保有銘柄の追加/編集/削除・株価更新・
  // 個別株購入・振替・毎晩の積立など）で実績履歴が最新化され、保存直後にグラフへ反映される。
  recordPerformanceSnapshot(s);
}

// 投資実績スナップショットを記録（評価額・元本を更新するたびに呼ぶ）。
// ・日付は日本時間の暦日。同じ日は最新値で上書き（同日複数回更新は最新のみ日次に残す）。
// ・詳細履歴(performanceLog)には更新日時つきで毎回追記（将来の日中履歴表示用）。
// ・証券口座が無い場合は記録しない（架空の過去データを作らない）。
export function recordPerformanceSnapshot(s) {
  if (!hasSecurities(s)) return;
  const snap = performanceSnapshot(s);
  const date = jstTodayISO();
  const updatedAt = jstNowISO();
  const rec = { date, ...snap, updatedAt };
  s.performanceHistory ||= [];
  const idx = s.performanceHistory.findIndex((r) => r.date === date);
  if (idx >= 0) s.performanceHistory[idx] = rec;           // 同日は上書き
  else {
    // 日付昇順を保って挿入（通常は末尾だが、端末時刻のズレにも耐える）
    let at = s.performanceHistory.length;
    while (at > 0 && s.performanceHistory[at - 1].date > date) at--;
    s.performanceHistory.splice(at, 0, rec);
  }
  s.performanceLog ||= [];
  s.performanceLog.push({ ts: updatedAt, ...rec });        // 詳細履歴は毎回追記
  if (s.performanceHistory.length > 800) s.performanceHistory = s.performanceHistory.slice(-800);
  if (s.performanceLog.length > 2000) s.performanceLog = s.performanceLog.slice(-2000);
}

// 履歴の編集・削除後に、日次履歴の整合（日付昇順・同日重複排除）を取り直す。
export function normalizePerformanceHistory(s) {
  const map = new Map();
  for (const r of s.performanceHistory || []) map.set(r.date, r); // 同日は後勝ち
  s.performanceHistory = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    const data = JSON.parse(raw);
    return migrate(data);
  } catch (e) {
    console.warn('finance: load failed, reseeding', e);
    return seed();
  }
}

function migrate(data) {
  // 将来のスキーマ変更に備えた入れ物。今は欠損フィールドの補完のみ。
  const today = todayISO();
  data.schema ||= SCHEMA;
  data.transactions ||= [];
  data.recurring ||= [];
  data.cards ||= [];
  data.cardTransactions ||= [];
  data.transfers ||= []; // 振替履歴（資産の移動。収入・支出とは別概念）
  data.recurringTransfers ||= []; // 固定振替
  data.categories ||= { income: [], expense: [] };
  data.settings ||= { secret: false, theme: 'auto', monthlyBudget: 0, notifiedKeys: [] };
  data.settings.notifiedKeys ||= [];
  data.settings.lastUsed ||= {}; // 取引追加時に前回使用したカテゴリー・口座を記憶
  if (data.settings.periodStartDay === undefined) data.settings.periodStartDay = 1;
  data.simulation ||= seed().simulation;
  data.assetHistory ||= [];
  // 将来資産シミュレーション（投資予測）の設定を補完
  const fsDefault = seedFutureSim();
  data.futureSim ||= fsDefault;
  for (const k of Object.keys(fsDefault)) if (data.futureSim[k] === undefined) data.futureSim[k] = fsDefault[k];
  data.futureSim.monteCarlo ||= fsDefault.monteCarlo;
  for (const k of Object.keys(fsDefault.monteCarlo)) if (data.futureSim.monteCarlo[k] === undefined) data.futureSim.monteCarlo[k] = fsDefault.monteCarlo[k];
  data.futureSim.chartVisible ||= fsDefault.chartVisible;
  for (const k of Object.keys(fsDefault.chartVisible)) if (data.futureSim.chartVisible[k] === undefined) data.futureSim.chartVisible[k] = fsDefault.chartVisible[k];
  data.futureSim.goals ||= [];
  data.futureSim.events ||= [];
  data.futureSim.plans ||= [];
  // 投資実績グラフの設定を補完
  const perfDefault = seedPerf();
  data.futureSim.perf ||= perfDefault;
  for (const k of Object.keys(perfDefault)) if (data.futureSim.perf[k] === undefined) data.futureSim.perf[k] = perfDefault[k];
  data.futureSim.perf.visible ||= perfDefault.visible;
  for (const k of Object.keys(perfDefault.visible)) if (data.futureSim.perf.visible[k] === undefined) data.futureSim.perf.visible[k] = perfDefault.visible[k];
  // 投資実績履歴の入れ物を補完（既存ユーザーは空から開始し、次回の評価額更新時に記録される）
  data.performanceHistory ||= [];
  data.performanceLog ||= [];
  // 可処分資金に含めるフラグ（既定: 証券口座以外は含める）／評価額履歴
  for (const a of data.accounts || []) {
    if (a.includeInDisposable === undefined) a.includeInDisposable = a.type !== 'securities';
    a.valuations ||= []; // 証券口座の評価額履歴 [{date:'YYYY-MM-DD', value:number}]
    // 証券口座の新スキーマ（現金・元本・保有銘柄・積立）を補完。
    // 既存の証券口座は balance を「現金」として引き継ぎ、元本0・銘柄なしから開始する
    // （データを失わせない）。ユーザーが銘柄・元本を登録すると再計算される。
    if (isSecurities(a)) {
      if (a.cash === undefined) a.cash = Number(a.balance) || 0;
      a.holdings ||= [];        // 保有銘柄（個別株=USD建て / インデックス=円建て。kindで判別）
      a.accumulations ||= [];   // 積立設定 [{id,holdingId,dailyAmount,startDate,endDate,enabled}]
      a.accumHistory ||= [];    // 積立履歴 [{id,date,holdingId,holdingName,amount,status,reason}]
      a.purchases ||= [];       // 個別株の購入履歴
      if (a.lastAccumDate === undefined) a.lastAccumDate = null;
      // 保有銘柄を新スキーマへ補完（旧: quantity/avgPrice/price → 新: 個別株USD / インデックス円）
      for (const h of a.holdings) {
        if (h.kind === 'index') {
          if (h.nisaFrame === undefined) h.nisaFrame = 'growth';
          if (h.cost === undefined) h.cost = (Number(h.quantity) || 0) * (Number(h.avgPrice) || 0);
          if (h.value === undefined) h.value = (Number(h.quantity) || 0) * (Number(h.price) || Number(h.avgPrice) || 0);
          // 将来資産シミュレーション用の想定年利・計算方式（インデックス）
          if (h.simAnnualReturn === undefined) h.simAnnualReturn = 5;
          if (h.returnMode === undefined) h.returnMode = 'compound';
        } else {
          h.kind = 'stock';
          if (h.costUsd === undefined) h.costUsd = Number(h.avgPrice) || 0;
          if (h.priceUsd === undefined) h.priceUsd = Number(h.price) || Number(h.avgPrice) || 0;
          if (h.fxRate === undefined) h.fxRate = 0;
          if (h.quantity === undefined) h.quantity = 0;
          // 将来資産シミュレーション用の想定年利・計算方式・配当・購入予定（個別株）
          if (h.simAnnualReturn === undefined) h.simAnnualReturn = 7;
          if (h.returnMode === undefined) h.returnMode = 'compound';
          if (h.dividendYield === undefined) h.dividendYield = 0; // 年間配当利回り(%)
          if (h.dividendReinvest === undefined) h.dividendReinvest = true;
          h.plannedPurchases ||= []; // 今後の購入予定 {id,date,amount,shares,annualReturn,holdYears}
        }
      }
      // 積立設定に将来シミュレーション用の頻度・停止/再開日・毎月積立額を補完
      for (const acm of a.accumulations || []) {
        if (acm.frequency === undefined) acm.frequency = 'daily';
        if (acm.monthlyAmount === undefined) acm.monthlyAmount = Math.round((Number(acm.dailyAmount) || 0) * 30);
        if (acm.pauseStart === undefined) acm.pauseStart = null;
        if (acm.pauseEnd === undefined) acm.pauseEnd = null;
      }
      recomputeAccount(a);      // balance = 現金 + 評価額 に同期
    }
  }
  // 固定支出の支払方法（'bank' | 'card'）。既定は銀行口座。作成日は既存分を今日として
  // 過去分の遡及生成を防ぐ（現在残高に既に反映済みとみなす）。
  for (const r of data.recurring) {
    if (r.type === 'expense' && r.paymentMethod === undefined) r.paymentMethod = 'bank';
    if (r.createdAt === undefined) r.createdAt = today;
  }
  // 固定振替も作成日を補完（過去分の遡及生成を防ぐ基準）。
  for (const rt of data.recurringTransfers) {
    if (rt.createdAt === undefined) rt.createdAt = today;
  }
  // 既存データにも次回実行予定日・次回引落予定日を付与（画面表示・確認用）。
  computeRecurringSchedule(data);
  // 口座ベース設計への移行: 口座未指定の既存取引を先頭口座へ割り当て（履歴が消えないように）。
  // カード払いの固定支出は銀行口座に直接紐付かないため対象外。
  const firstAcc = (data.accounts || [])[0]?.id || null;
  if (firstAcc) {
    for (const t of data.transactions) if (!t.accountId) t.accountId = firstAcc;
    for (const r of data.recurring) if (!r.accountId && r.paymentMethod !== 'card') r.accountId = firstAcc;
  }
  // カード利用の「引落済み」フラグ。既存データは、引落日が過ぎているものは
  // 済み（残高に反映済みとみなす）、未来のものは未引落として扱う（残高は変更しない）。
  for (const t of data.cardTransactions) {
    if (t.settled === undefined) {
      const card = (data.cards || []).find((c) => c.id === t.cardId);
      t.settled = card ? settlementDate(card, t.date) <= today : false;
    }
  }
  return data;
}

// カード払いの固定支出を、実際のカード利用（cardTransactions）として具体化する。
// 作成日より後・今日以前の各月の発生日について、未生成のものだけカード利用を1件作る。
// これにより 未引落残高・可処分資金・カード請求・引落 の各処理と自動的に整合する。冪等。
export function materializeRecurringCardUsage(s) {
  const today = todayISO();
  let changed = false;
  for (const r of s.recurring) {
    if (r.type !== 'expense' || r.paymentMethod !== 'card' || !r.cardId) continue;
    if (!s.cards.find((c) => c.id === r.cardId)) continue;
    const since = r.createdAt || today;
    // since の月〜今日の月までの各月の発生日を走査（実日付変換は共通関数に一本化）。
    for (const { y, m, date } of monthlyOccurrences(since.slice(0, 7), today.slice(0, 7), r.day)) {
      const occYm = `${y}-${pad(m + 1)}`;
      // 登録日より後・今日以前・有効期間内のみ具体化（過去分の勝手な遡及生成を防ぐ）。
      if (date > since && date <= today && recurringActiveOn(r, date)) {
        // 二重処理防止: (定期取引ID・本来の実行予定日・種別) で一意判定。
        const key = dedupeKey(r.id, date, 'card-usage');
        const exists = s.cardTransactions.some(
          (t) => t.dedupeKey === key || (t.sourceRecurringId === r.id && t.occYm === occYm));
        if (!exists) {
          s.cardTransactions.push({
            id: uid('ctx'), cardId: r.cardId, date, amount: Number(r.amount) || 0,
            memo: r.name, categoryId: r.categoryId || null, settled: false,
            sourceRecurringId: r.id, occYm, dedupeKey: key,
          });
          changed = true;
        }
      }
    }
  }
  return changed;
}

// 引落日を過ぎた未引落カード利用を確定する（銀行残高を減額し settled にする）。
// 二重減算を防ぐため settled 済みは対象外。冪等。
export function settleDueCards(s) {
  const today = todayISO();
  let changed = false;
  for (const t of s.cardTransactions) {
    if (t.settled) continue;
    const card = s.cards.find((c) => c.id === t.cardId);
    if (!card) continue;
    if (settlementDate(card, t.date) <= today) {
      const acc = s.accounts.find((a) => a.id === card.payAccountId);
      if (acc) acc.balance = (Number(acc.balance) || 0) - (Number(t.amount) || 0);
      t.settled = true;
      t.settledDate = today;
      changed = true;
    }
  }
  return changed;
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.error('finance: save failed', e); }
}

function emit() { listeners.forEach((fn) => fn(state)); }

// ---- 公開API ----
export const getState = () => state;
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

// mutator: 関数で state を書き換え、保存して通知
export function update(mutator, { silent = false } = {}) {
  mutator(state);
  _version++;
  persist();
  if (!silent) emit();
}

export function replaceState(next) {
  state = migrate(next);
  _version++;
  persist();
  emit();
}

export function resetAll() {
  state = seed();
  _version++;
  persist();
  emit();
}

// ---- ルックアップヘルパー ----
export const findAccount = (id) => state.accounts.find((a) => a.id === id);
export const findCard = (id) => state.cards.find((c) => c.id === id);
export const allCategories = () => [...state.categories.income, ...state.categories.expense];
export const findCategory = (id) =>
  allCategories().find((c) => c.id === id) || { name: '未分類', color: '#8e8e93' };
export const catColor = (id) => findCategory(id).color;

export { uid };
