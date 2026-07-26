const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const usd = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });

function signedUsd(value) {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${usd.format(Math.abs(value))}`;
}

function signedPercent(value) {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

function impactLabel(impact) {
  return impact === 'positive' ? '好材料' : impact === 'negative' ? '悪材料' : '中立';
}

function impactClass(impact) {
  return impact === 'positive' ? 'positive' : impact === 'negative' ? 'negative' : 'neutral';
}

function list(items, emptyText = '特記事項なし') {
  if (!items?.length) return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function sparkline(days) {
  if (!Array.isArray(days) || days.length < 2) return '';
  const values = days.map((day) => Number(day.close)).filter(Number.isFinite);
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = 12 + (index / (values.length - 1)) * 276;
    const y = 68 - ((value - min) / range) * 48;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="spark" viewBox="0 0 300 82" role="img" aria-label="直近5営業日の終値推移">
    <line x1="12" y1="68" x2="288" y2="68" stroke="#d9e0e8" stroke-width="1"/>
    <polyline points="${points}" fill="none" stroke="#1f5d9c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${points.split(' ').map((point) => {
      const [x, y] = point.split(',');
      return `<circle cx="${x}" cy="${y}" r="3.5" fill="#fff" stroke="#1f5d9c" stroke-width="2"/>`;
    }).join('')}
  </svg>`;
}

export function renderIonqHtml({ stock, report, sources }) {
  const priceTone = stock.change > 0 ? 'positive' : stock.change < 0 ? 'negative' : 'neutral';
  const sourceRows = (sources || []).slice(0, 12).map((source, index) =>
    `<li><span>${index + 1}.</span><a href="${escapeHtml(source.url)}">${escapeHtml(source.title)}</a></li>`
  ).join('');

  const newsHtml = report.news.length
    ? report.news.map((item) => `<article class="news-card">
        <div class="news-head">
          <span class="impact ${impactClass(item.impact)}">${impactLabel(item.impact)}</span>
          <span class="importance">重要度 ${'●'.repeat(item.importance)}${'○'.repeat(3 - item.importance)}</span>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p class="news-meta">${escapeHtml(item.publishedAt)} ／ ${escapeHtml(item.sourceName)}</p>
        <p>${escapeHtml(item.summary)}</p>
        ${item.sourceUrl ? `<p class="source-link"><a href="${escapeHtml(item.sourceUrl)}">情報源を開く</a></p>` : '<p class="muted small">参照URLを確認できませんでした</p>'}
      </article>`).join('')
    : '<div class="empty">直近72時間で、重要な新規ニュースを確認できませんでした。</div>';

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${escapeHtml(report.title)}</title>
<style>
  @page { size: A4; margin: 11mm 12mm 13mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #17202b; font-family: "Noto Sans CJK JP", "Yu Gothic", sans-serif; font-size: 9.2pt; line-height: 1.58; }
  a { color: #1f5d9c; text-decoration: none; overflow-wrap: anywhere; }
  header { border-bottom: 3px solid #1f5d9c; padding-bottom: 8px; margin-bottom: 12px; }
  .kicker { color: #1f5d9c; font-size: 8pt; font-weight: 800; letter-spacing: .16em; }
  h1 { margin: 2px 0 3px; font-size: 22pt; line-height: 1.2; }
  .date { color: #647184; font-size: 8.5pt; }
  .hero { display: grid; grid-template-columns: 1.15fr .85fr; gap: 10px; margin-bottom: 12px; }
  .panel { border: 1px solid #d9e0e8; border-radius: 10px; padding: 10px 12px; background: #fff; break-inside: avoid; }
  .price-label { color: #647184; font-size: 8pt; }
  .price { margin-top: 2px; font-size: 24pt; font-weight: 800; line-height: 1.1; }
  .change { margin-top: 4px; font-weight: 800; }
  .positive { color: #087647; }
  .negative { color: #b3261e; }
  .neutral { color: #586576; }
  .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-top: 9px; }
  .metric { border-radius: 7px; background: #f3f6f9; padding: 6px 7px; }
  .metric span { display: block; color: #647184; font-size: 7.4pt; }
  .metric b { font-size: 9pt; }
  .spark { width: 100%; height: 82px; display: block; }
  h2 { margin: 15px 0 7px; padding-left: 8px; border-left: 4px solid #1f5d9c; font-size: 13pt; line-height: 1.25; break-after: avoid; }
  h3 { margin: 5px 0 4px; font-size: 10.5pt; line-height: 1.38; }
  p { margin: 4px 0; }
  .summary { border-radius: 9px; background: #eef5fb; padding: 9px 11px; }
  table { width: 100%; border-collapse: collapse; font-size: 8.2pt; }
  th, td { border: 1px solid #d9e0e8; padding: 5px 6px; text-align: right; }
  th:first-child, td:first-child { text-align: left; }
  th { background: #eef2f6; }
  .news-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .news-card { border: 1px solid #d9e0e8; border-radius: 9px; padding: 9px 10px; break-inside: avoid; }
  .news-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .impact { border-radius: 999px; padding: 2px 7px; background: #eef2f6; font-size: 7.5pt; font-weight: 800; }
  .impact.positive { background: #e6f5ee; }
  .impact.negative { background: #fdeceb; }
  .importance { color: #647184; font-size: 7.2pt; }
  .news-meta { color: #647184; font-size: 7.5pt; }
  .source-link { margin-top: 6px; font-size: 8pt; font-weight: 700; }
  .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
  ul { margin: 4px 0 0; padding-left: 18px; }
  li { margin: 2px 0; }
  .sources { font-size: 7.5pt; padding-left: 0; list-style: none; }
  .sources li { display: grid; grid-template-columns: 18px 1fr; gap: 2px; margin-bottom: 3px; }
  .muted { color: #647184; }
  .small { font-size: 7.5pt; }
  .empty { padding: 12px; border: 1px dashed #b8c3cf; border-radius: 9px; color: #647184; text-align: center; }
  footer { margin-top: 13px; padding-top: 7px; border-top: 1px solid #d9e0e8; color: #647184; font-size: 7.2pt; }
</style>
</head>
<body>
<header>
  <div class="kicker">IONQ DAILY REPORT</div>
  <h1>${escapeHtml(report.title)}</h1>
  <div class="date">作成日：${escapeHtml(report.reportDate)} ／ 株価対象日：${escapeHtml(stock.marketDate)} ／ 通貨：USD</div>
</header>

<section class="hero">
  <div class="panel">
    <div class="price-label">IONQ 終値</div>
    <div class="price">${usd.format(stock.close)}</div>
    <div class="change ${priceTone}">${signedUsd(stock.change)}（${signedPercent(stock.changePercent)}）</div>
    <div class="metrics">
      <div class="metric"><span>始値</span><b>${usd.format(stock.open)}</b></div>
      <div class="metric"><span>高値</span><b>${usd.format(stock.high)}</b></div>
      <div class="metric"><span>安値</span><b>${usd.format(stock.low)}</b></div>
      <div class="metric"><span>出来高</span><b>${integer.format(stock.volume)}</b></div>
    </div>
  </div>
  <div class="panel">
    <div class="price-label">直近5営業日の終値</div>
    ${sparkline(stock.fiveDays)}
  </div>
</section>

<h2>本日の要点</h2>
<div class="summary">${escapeHtml(report.executiveSummary)}</div>

<h2>株価の確認</h2>
<p>${escapeHtml(report.priceAnalysis)}</p>
<table>
  <thead><tr><th>日付</th><th>始値</th><th>高値</th><th>安値</th><th>終値</th><th>出来高</th></tr></thead>
  <tbody>${stock.fiveDays.map((day) => `<tr><td>${escapeHtml(day.date)}</td><td>${usd.format(day.open)}</td><td>${usd.format(day.high)}</td><td>${usd.format(day.low)}</td><td>${usd.format(day.close)}</td><td>${integer.format(day.volume)}</td></tr>`).join('')}</tbody>
</table>

<h2>最新ニュース</h2>
<div class="news-grid">${newsHtml}</div>

<div class="columns">
  <section>
    <h2>好材料</h2>
    ${list(report.positiveFactors, '確認できた好材料はありません。')}
  </section>
  <section>
    <h2>悪材料・注意点</h2>
    ${list(report.negativeFactors, '確認できた悪材料はありません。')}
  </section>
</div>

<h2>次に確認する項目</h2>
${list(report.watchPoints)}

<h2>データ上の制約</h2>
${list(report.dataLimitations, '特記すべき制約はありません。')}

<h2>情報源</h2>
${sourceRows ? `<ol class="sources">${sourceRows}</ol>` : '<p class="muted">Google検索の参照URLを取得できませんでした。</p>'}

<footer>
  株価データ：${escapeHtml(stock.provider)}（取得日時 ${escapeHtml(stock.fetchedAt)}）。本資料は情報整理を目的とし、投資助言ではありません。市場価格は遅延・訂正される場合があるため、売買前に証券会社の画面で確認してください。
</footer>
</body>
</html>`;
}
