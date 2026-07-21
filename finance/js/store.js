// store.js — 単一の状態ソース。localStorage永続化・購読・CRUD・初期データ。
// 設計方針: すべてのデータはこの1オブジェクトに集約し、mutate → save → emit。
// 将来の証券口座連携などは accounts の type と外部同期モジュールを足すだけで拡張可能。

import { uid, pad } from './utils.js';

const KEY = 'finance_app_v1';
const SCHEMA = 1;

// 当月の指定日をISO文字列で返す（デモ用カード利用を常に「次回引落予定」に載せるため）
function thisMonthDay(day) {
  const n = new Date();
  const d = Math.min(day, new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate());
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(d)}`;
}

const listeners = new Set();
let state = load();

// ---- 初期（シード）データ：仕様書の例をそのまま反映 ----
function seed() {
  const acc = {
    cash: uid('acc'), ufj: uid('acc'), rakuten: uid('acc'),
    paypay: uid('acc'), sbi: uid('acc'), rakutenSec: uid('acc'),
  };
  const inc = { salary: uid('cat'), side: uid('cat'), dividend: uid('cat'), bonus: uid('cat'), other: uid('cat') };
  const exp = {
    food: uid('cat'), rent: uid('cat'), utility: uid('cat'), gas: uid('cat'),
    comm: uid('cat'), subsc: uid('cat'), hobby: uid('cat'),
  };
  const cardRakuten = uid('card');
  return {
    schema: SCHEMA,
    accounts: [
      { id: acc.cash, name: '現金', type: 'cash', balance: 82000 },
      { id: acc.ufj, name: '三菱UFJ', type: 'bank', balance: 1250000 },
      { id: acc.rakuten, name: '楽天銀行', type: 'bank', balance: 640000 },
      { id: acc.paypay, name: 'PayPay銀行', type: 'bank', balance: 210000 },
      { id: acc.sbi, name: 'SBI証券', type: 'securities', balance: 980000 },
      { id: acc.rakutenSec, name: '楽天証券', type: 'securities', balance: 380000 },
    ],
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
    recurring: [
      { id: uid('rec'), type: 'income', name: '給料', day: 25, amount: 300000, categoryId: inc.salary, accountId: acc.ufj },
      { id: uid('rec'), type: 'expense', name: '家賃', day: 27, amount: 65000, categoryId: exp.rent, accountId: acc.ufj },
      { id: uid('rec'), type: 'expense', name: 'Netflix', day: 5, amount: 890, categoryId: exp.subsc, accountId: acc.rakuten },
      { id: uid('rec'), type: 'expense', name: '携帯代', day: 12, amount: 8000, categoryId: exp.comm, accountId: acc.rakuten },
    ],
    cards: [
      { id: cardRakuten, name: '楽天カード', closingDay: 'end', payDay: 27, payMonthOffset: 1, payAccountId: acc.rakuten, color: '#bf0000' },
    ],
    cardTransactions: [
      { id: uid('ctx'), cardId: cardRakuten, date: thisMonthDay(10), amount: 3000, memo: 'Amazon', categoryId: exp.hobby },
      { id: uid('ctx'), cardId: cardRakuten, date: thisMonthDay(18), amount: 600, memo: 'スターバックス', categoryId: exp.food },
      { id: uid('ctx'), cardId: cardRakuten, date: thisMonthDay(25), amount: 4000, memo: 'ガソリン', categoryId: exp.gas },
      { id: uid('ctx'), cardId: cardRakuten, date: thisMonthDay(3), amount: 12800, memo: 'スーパー', categoryId: exp.food },
      { id: uid('ctx'), cardId: cardRakuten, date: thisMonthDay(15), amount: 52140, memo: '家電', categoryId: exp.hobby },
    ],
    simulation: {
      startAsset: null, // null の場合は総資産を使う
      monthlyIncome: 300000,
      monthlyExpense: 180000,
      monthlyInvestment: 50000,
      annualReturn: 3, // 積立投資の想定年利(%)
      bonusAmount: 1000000,
      bonusMonths: [6, 12], // 6月・12月
    },
    settings: {
      secret: false,
      theme: 'auto', // 'auto' | 'light' | 'dark'
      monthlyBudget: 200000,
      notifiedKeys: [],
    },
    _meta: { catRef: { salary: inc.salary, food: exp.food } },
  };
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
  data.categories ||= { income: [], expense: [] };
  data.settings ||= { secret: false, theme: 'auto', monthlyBudget: 200000, notifiedKeys: [] };
  data.settings.notifiedKeys ||= [];
  data.simulation ||= seed().simulation;
  return data;
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
  persist();
  if (!silent) emit();
}

export function replaceState(next) {
  state = migrate(next);
  persist();
  emit();
}

export function resetAll() {
  state = seed();
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
