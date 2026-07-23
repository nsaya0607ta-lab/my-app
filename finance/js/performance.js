// performance.js — 投資実績グラフのデータ層（実績履歴の期間絞り込み・集約・将来予測との連結）
// 方針: securities.js / futureSim.js と同じく「stateを受け取って結果を返す純粋関数」の集合。
// 実データ（performanceHistory）と将来予測（futureSim.project の系列）だけから描画用データを組み立てる。
// 過去の実績は一切書き換えない（将来予測の設定変更は今日以降の予測のみに影響する）。

import { pad, parseISO, toISO } from './utils.js?v=20260723t';
import { jstTodayISO } from './securities.js?v=20260723t';

// 表示対象タブ
export const PERF_TARGETS = [
  { key: 'total', label: '全体' },
  { key: 'nisa', label: 'NISA' },
  { key: 'stock', label: '個別株' },
];

// 表示期間（days: 実績をさかのぼる日数、grain: 集約粒度、fwd: 予測の前方月数。null=保有期間設定に従う）
export const PERF_PERIODS = [
  { key: '1w', label: '1週間', days: 7, grain: 'day', fwd: 1 },
  { key: '1m', label: '1か月', days: 31, grain: 'day', fwd: 3 },
  { key: '3m', label: '3か月', days: 92, grain: 'day', fwd: 6 },
  { key: '6m', label: '6か月', days: 183, grain: 'week', fwd: 12 },
  { key: '1y', label: '1年', days: 366, grain: 'week', fwd: 24 },
  { key: '3y', label: '3年', days: 1096, grain: 'month', fwd: 36 },
  { key: '5y', label: '5年', days: 1827, grain: 'month', fwd: 60 },
  { key: 'all', label: '全期間', days: Infinity, grain: 'month', fwd: null },
];

// 実績グラフに重ねられる系列（トグルで表示切替。secCashは全体タブのみ意味を持つ）
export const PERF_SERIES = [
  { key: 'valuation', label: '評価額', color: '#34c759', field: 'value' },
  { key: 'principal', label: '元本', color: '#ff9500', field: 'principal' },
  { key: 'profit', label: '評価損益', color: '#5ac8fa', field: 'profit' },
  { key: 'secCash', label: '証券口座現金', color: '#8e8e93', field: 'secCash', totalOnly: true },
];

const n = (v) => Number(v) || 0;

// 実績スナップショットから、選択タブ・現金含有設定に応じた指標を取り出す
function actualMetrics(snap, target, includeCash) {
  if (target === 'nisa') {
    const value = n(snap.nisaValue), principal = n(snap.nisaPrincipal);
    return { value, principal, profit: value - principal, secCash: null };
  }
  if (target === 'stock') {
    const value = n(snap.stockValue), principal = n(snap.stockPrincipal);
    return { value, principal, profit: value - principal, secCash: null };
  }
  const principal = n(snap.principal), val = n(snap.valuation), cash = n(snap.secCash);
  // 評価損益は現金を含めない（現金は投資利益ではない）
  return { value: val + (includeCash ? cash : 0), principal, profit: val - principal, secCash: cash };
}
// 将来予測の1点から、同じ指標を取り出す（futureSim.project のスナップショット）
function forecastMetrics(pt, target, includeCash) {
  if (target === 'nisa') {
    const value = n(pt.indexValuation), principal = n(pt.indexPrincipal);
    return { value, principal, profit: value - principal, secCash: null };
  }
  if (target === 'stock') {
    const value = n(pt.stockValuation), principal = n(pt.stockPrincipal);
    return { value, principal, profit: value - principal, secCash: null };
  }
  const principal = n(pt.principal), val = n(pt.valuation), cash = n(pt.secCash);
  return { value: val + (includeCash ? cash : 0), principal, profit: val - principal, secCash: cash };
}

function bucketKey(date, grain) {
  if (grain === 'month') return date.slice(0, 7);
  if (grain === 'week') {
    const epochDay = Math.floor(parseISO(date).getTime() / 86400000);
    return 'w' + Math.floor(epochDay / 7);
  }
  return date;
}
// 集約: 同じバケットは「最後（最新）」の実績を代表値にする（元データは削除しない・値も作らない）
function aggregate(points, grain) {
  if (grain === 'day') return points;
  const map = new Map();
  for (const p of points) map.set(bucketKey(p.date, grain), p); // 昇順入力なので後勝ち＝各期間の最新
  return [...map.values()];
}

function labelFor(date, grain) {
  const d = parseISO(date);
  if (grain === 'month') return `${String(d.getFullYear()).slice(2)}/${d.getMonth() + 1}`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 銘柄別の実績系列（NISA/個別株タブで銘柄ごとの推移を出す。実績のみ・予測なし）
function buildHoldingSeries(snaps, target, grain) {
  const kind = target === 'nisa' ? 'index' : 'stock';
  const names = new Map();
  for (const s of snaps) for (const h of (s.holdings || [])) if (h.kind === kind) names.set(h.id, h.name);
  const out = [];
  for (const [id, name] of names) {
    const data = snaps.map((s) => {
      const h = (s.holdings || []).find((x) => x.id === id);
      return { date: s.date, label: labelFor(s.date, grain), value: h ? n(h.value) : null };
    });
    out.push({ id, name, data });
  }
  return out;
}

// ===== 実績＋予測グラフのデータを構築 =====
// project: futureSim.project(state) の結果（省略/予測OFFなら実績のみ）。
export function buildPerfView(state, project) {
  const fs = state.futureSim || {};
  const perf = fs.perf || {};
  const target = perf.target || 'total';
  const includeCash = target === 'total' && !!perf.includeCash;
  const periodDef = PERF_PERIODS.find((p) => p.key === perf.period) || PERF_PERIODS[1];
  const grain = periodDef.grain;
  const history = (state.performanceHistory || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const today = jstTodayISO();

  const actualAll = history.filter((r) => r.date <= today);
  // 期間ウィンドウ（今日からさかのぼる）
  let windowStart = '0000-00-00';
  if (periodDef.days !== Infinity) {
    const d = parseISO(today);
    d.setDate(d.getDate() - periodDef.days);
    windowStart = toISO(d);
  }
  let inWindow = actualAll.filter((r) => r.date >= windowStart);
  // ウィンドウ内に実績が無ければ、直近の実績1点をアンカーとして使う（予測と連結できるように）
  if (!inWindow.length && actualAll.length) inWindow = [actualAll[actualAll.length - 1]];

  const aggActual = aggregate(inWindow, grain);
  const actualPts = aggActual.map((snap) => ({
    date: snap.date, label: labelFor(snap.date, grain), kind: 'actual',
    ...actualMetrics(snap, target, includeCash), raw: snap,
  }));
  const lastActualDate = actualPts.length ? actualPts[actualPts.length - 1].date : today;

  // 予測（今日以降）を連結。実績の最終日より後の点のみ採用して重複を避ける。
  let forecastPts = [];
  if (perf.forecast !== false && project && project.series && project.series.length) {
    const fsYears = Math.max(1, fs.years || 10);
    const fwdMonths = periodDef.fwd == null ? fsYears * 12 : periodDef.fwd;
    forecastPts = project.series
      .slice(0, fwdMonths + 1)
      .filter((pt) => pt.date > lastActualDate)
      .map((pt) => ({
        date: pt.date, label: labelFor(pt.date, grain), kind: 'forecast',
        ...forecastMetrics(pt, target, includeCash), raw: pt,
      }));
  }

  const points = [...actualPts, ...forecastPts];
  const boundaryIndex = Math.max(0, actualPts.length - 1);
  const byHolding = !!perf.byHolding && (target === 'nisa' || target === 'stock');

  return {
    target, grain, includeCash,
    points, actualPts, forecastPts, boundaryIndex,
    actualTotalCount: actualAll.length,
    hasEnough: actualAll.length >= 2,
    latestSnap: actualAll.length ? actualAll[actualAll.length - 1] : null,
    holdingSeries: byHolding ? buildHoldingSeries(aggActual, target, grain) : null,
  };
}
