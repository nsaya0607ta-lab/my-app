// store.js — 単一の状態ソース。localStorage永続化・購読・CRUD・初期データ。
// 設計方針: すべてのデータはこの1オブジェクトに集約し、mutate → save → emit。
// 将来の証券口座連携などは accounts の type と外部同期モジュールを足すだけで拡張可能。

import { uid, pad } from './utils.js?v=20260723c';
import { settlementDate } from './calc.js?v=20260723c';

const KEY = 'finance_app_v2';
const SCHEMA = 1;
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

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
  };
}

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
  if (data.settings.periodStartDay === undefined) data.settings.periodStartDay = 1;
  data.simulation ||= seed().simulation;
  data.assetHistory ||= [];
  // 可処分資金に含めるフラグ（既定: 証券口座以外は含める）
  for (const a of data.accounts || []) {
    if (a.includeInDisposable === undefined) a.includeInDisposable = a.type !== 'securities';
  }
  // 口座ベース設計への移行: 口座未指定の既存取引を先頭口座へ割り当て（履歴が消えないように）
  const firstAcc = (data.accounts || [])[0]?.id || null;
  if (firstAcc) {
    for (const t of data.transactions) if (!t.accountId) t.accountId = firstAcc;
    for (const r of data.recurring) if (!r.accountId) r.accountId = firstAcc;
  }
  // カード利用の「引落済み」フラグ。既存データは、引落日が過ぎているものは
  // 済み（残高に反映済みとみなす）、未来のものは未引落として扱う（残高は変更しない）。
  const today = todayISO();
  for (const t of data.cardTransactions) {
    if (t.settled === undefined) {
      const card = (data.cards || []).find((c) => c.id === t.cardId);
      t.settled = card ? settlementDate(card, t.date) <= today : false;
    }
  }
  return data;
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
