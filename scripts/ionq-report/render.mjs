const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const usd = new Intl.NumberFormat('ja-JP', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });

function signedUsd(value) {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${usd.format(Math.abs(value))}`;
}

function signedPercent(value) {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(Number(value || 0)).toFixed(2)}%`;
}

function impactLabel(impact) {
  return impact === 'positive' ? 'プラス' : impact === 'negative' ? 'マイナス' : '中立';
}

function impactClass(impact) {
  return impact === 'positive' ? 'positive' : impact === 'negative' ? 'negative' : 'neutral';
}

function list(items, emptyText = '特記事項なし') {
  if (!items?.length) return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function dateLabel(value) {
  return String(value || '').replaceAll('-', '/');
}

function sourceDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function categorizedSources(sources) {
  const rows = [];
  const seen = new Set();
  for (const source of sources || []) {
    const domain = sourceDomain(source.url);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    let category = '補助情報';
    if (domain.endsWith('ionq.com') || domain.endsWith('sec.gov') || domain.endsWith('.gov')) category = '公式情報';
    else if (domain.includes('nasdaq.com') || domain.includes('nyse.com')) category = '市場情報';
    rows.push({ category, domain, url: source.url });
    if (rows.length >= 6) break;
  }
  return rows;
}

function nextEventHtml(nextEvent) {
  if (!nextEvent?.title && !nextEvent?.date) {
    return '<p class="muted">現時点で、日付を確認できる重要イベントはありません。</p>';
  }
  return `<div class="event"><b>${escapeHtml(nextEvent.date || '日付未確認')}</b>　${escapeHtml(nextEvent.title || '')}${list(nextEvent.checkpoints, '確認項目は未整理です。')}</div>`;
}

export function renderIonqHtml({ stock, report, sources }) {
  const priceTone = stock.change > 0 ? 'positive' : stock.change < 0 ? 'negative' : 'neutral';
  const materials = report.newMaterials.length
    ? report.newMaterials.map((item) => `<tr>
        <td><span class="tag">${escapeHtml(item.type)}</span></td>
        <td><b>${escapeHtml(item.title)}</b><div class="meta">${escapeHtml(item.publishedAt)} ／ ${escapeHtml(item.sourceName)}</div><div>${escapeHtml(item.summary)}</div></td>
        <td class="${impactClass(item.impact)}">${impactLabel(item.impact)}</td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="empty-cell">過去24時間以内に、重要な新規材料は確認されませんでした。</td></tr>';

  const sourceRows = categorizedSources(sources);
  const sourceHtml = sourceRows.length
    ? sourceRows.map((source) => `<span><b>${escapeHtml(source.category)}：</b><a href="${escapeHtml(source.url)}">${escapeHtml(source.domain)}</a></span>`).join('　')
    : '<span class="muted">補助情報の参照URLは取得できませんでした。</span>';

  const dateNote = report.reportDate !== stock.marketDate
    ? '作成日と株価対象日が異なるため、直近取引日の米国市場終値を使用しています。'
    : '';
  const volumeText = stock.volumeVsAveragePercent >= 0 ? '上回る' : '下回る';
  const closePosition = stock.closePositionPercent <= 25
    ? '当日安値に近い'
    : stock.closePositionPercent >= 75 ? '当日高値に近い' : '高値・安値の中間付近';

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${escapeHtml(report.title)}</title>
<style>
  @page { size: A4; margin: 8mm 9mm 9mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { color: #17202b; font-family: "Noto Sans CJK JP", "Yu Gothic", sans-serif; font-size: 7.8pt; line-height: 1.4; }
  a { color: #1f5d9c; text-decoration: none; overflow-wrap: anywhere; }
  header { border-bottom: 2.5px solid #1f5d9c; padding-bottom: 5px; margin-bottom: 6px; }
  .kicker { color: #1f5d9c; font-size: 6.7pt; font-weight: 800; letter-spacing: .15em; }
  h1 { margin: 1px 0 3px; font-size: 16pt; line-height: 1.14; }
  .header-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; color: #586576; font-size: 7pt; }
  .notice { margin-top: 3px; color: #6b4f00; font-size: 6.8pt; }
  h2 { margin: 7px 0 3px; padding-left: 6px; border-left: 3px solid #1f5d9c; font-size: 9.8pt; line-height: 1.2; break-after: avoid; }
  h3 { margin: 0 0 2px; font-size: 8pt; }
  p { margin: 2px 0; }
  .conclusion { background: #eef5fb; border-radius: 7px; padding: 6px 8px; font-size: 8.2pt; }
  .price-grid { display: grid; grid-template-columns: 1.05fr .95fr; gap: 6px; }
  .card { border: 1px solid #d9e0e8; border-radius: 7px; padding: 5px 6px; break-inside: avoid; }
  .headline { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  .price { font-size: 16pt; font-weight: 800; line-height: 1; }
  .change { font-size: 8.8pt; font-weight: 800; }
  .positive { color: #087647; font-weight: 700; }
  .negative { color: #b3261e; font-weight: 700; }
  .neutral { color: #586576; font-weight: 700; }
  .metrics { width: 100%; border-collapse: collapse; }
  .metrics th, .metrics td { border: 1px solid #d9e0e8; padding: 3px 4px; }
  .metrics th { background: #f3f6f9; color: #586576; text-align: left; font-weight: 600; }
  .metrics td { text-align: right; font-weight: 700; }
  .submetrics { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; margin-top: 4px; }
  .submetric { background: #f6f8fa; border-radius: 5px; padding: 3px 5px; }
  .submetric span { display: block; color: #647184; font-size: 6.4pt; }
  .submetric b { font-size: 7.4pt; }
  .data-note { color: #586576; font-size: 6.8pt; }
  .materials { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .materials th, .materials td { border: 1px solid #d9e0e8; padding: 4px 5px; vertical-align: top; }
  .materials th { background: #eef2f6; text-align: left; }
  .materials th:first-child, .materials td:first-child { width: 13%; }
  .materials th:last-child, .materials td:last-child { width: 12%; text-align: center; }
  .tag { display: inline-block; border-radius: 999px; padding: 1px 5px; background: #eef2f6; font-size: 6.6pt; }
  .meta { color: #647184; font-size: 6.4pt; margin: 1px 0; }
  .empty-cell { color: #647184; text-align: center; padding: 7px !important; }
  .reason-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
  .watch-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
  ul { margin: 2px 0 0; padding-left: 14px; }
  li { margin: 1px 0; }
  .muted { color: #647184; }
  .event { background: #f6f8fa; border-radius: 6px; padding: 4px 5px; }
  .limitations { margin-top: 5px; padding-top: 4px; border-top: 1px solid #d9e0e8; font-size: 6.5pt; color: #647184; }
  .sources { margin-top: 2px; line-height: 1.45; }
  footer { margin-top: 3px; font-size: 6.2pt; color: #647184; }
</style>
</head>
<body>
<header>
  <div class="kicker">IONQ DAILY REPORT</div>
  <h1>${escapeHtml(report.title)}</h1>
  <div class="header-grid">
    <div>対象銘柄：IonQ, Inc.（NASDAQ: IONQ）</div>
    <div>株価対象日：${escapeHtml(dateLabel(stock.marketDate))} 米国市場終値</div>
    <div>レポート作成日：${escapeHtml(dateLabel(report.reportDate))}</div>
    <div>通貨：USD ／ 通常取引終了時点（時間外を含まない）</div>
  </div>
  ${dateNote ? `<div class="notice">${escapeHtml(dateNote)}</div>` : ''}
</header>

<h2>今日の結論</h2>
<div class="conclusion">${escapeHtml(report.conclusion)}</div>

<h2>本日の株価データ</h2>
<div class="price-grid">
  <section class="card">
    <div class="headline"><div class="price">${usd.format(stock.close)}</div><div class="change ${priceTone}">${signedUsd(stock.change)}（${signedPercent(stock.changePercent)}）</div></div>
    <table class="metrics">
      <tr><th>始値</th><td>${usd.format(stock.open)}</td><th>高値</th><td>${usd.format(stock.high)}</td></tr>
      <tr><th>安値</th><td>${usd.format(stock.low)}</td><th>出来高</th><td>${integer.format(stock.volume)}株</td></tr>
    </table>
    <div class="submetrics">
      <div class="submetric"><span>当日の値幅</span><b>${usd.format(stock.dayRange)}</b></div>
      <div class="submetric"><span>20日平均出来高比</span><b>${signedPercent(stock.volumeVsAveragePercent)}</b></div>
      <div class="submetric"><span>20日平均出来高</span><b>${integer.format(stock.averageVolume20)}株</b></div>
      <div class="submetric"><span>終値の高安内位置</span><b>${Number(stock.closePositionPercent || 0).toFixed(1)}%</b></div>
    </div>
  </section>
  <section class="card">
    <h3>当日の値動き</h3>
    <p>${escapeHtml(report.dailyMove)}</p>
    <p class="data-note">終値は${escapeHtml(closePosition)}水準です。出来高は20日平均を${escapeHtml(volumeText)}水準でした。</p>
    <p class="data-note">日中の時間帯別株価を取得していないため、始値・高値・安値・終値のみで確認しています。</p>
  </section>
</div>

<h2>今日新しく確認された材料</h2>
<table class="materials">
  <thead><tr><th>種別</th><th>内容</th><th>影響</th></tr></thead>
  <tbody>${materials}</tbody>
</table>

<h2>値動きの理由</h2>
<div class="reason-grid">
  <section class="card"><h3>確認できた事実</h3>${list(report.reasonFacts, '追加事実なし')}</section>
  <section class="card"><h3>関連する可能性</h3>${list(report.reasonPossibilities, '根拠のある関連情報なし')}</section>
  <section class="card"><h3>確認できないこと</h3>${list(report.reasonUnknowns, '特記事項なし')}</section>
</div>

<h2>保有者向けの確認ポイント</h2>
<div class="watch-grid">
  <section class="card"><h3>短期的な確認点</h3>${list(report.shortTermWatch, '具体的な確認点はありません。')}</section>
  <section class="card"><h3>次の重要イベント</h3>${nextEventHtml(report.nextEvent)}</section>
</div>

<div class="limitations">
  <b>情報の制約：</b>${escapeHtml(report.dataLimitations.join('／') || '株価変動の理由は、公式発表などで確認できない場合があります。')}
  <div class="sources"><b>情報源：</b>株価データ：${escapeHtml(stock.provider)}　${sourceHtml}</div>
</div>
<footer>株価データは米国市場の通常取引終値を使用し、ニュースは過去24時間を対象としています。株価変動の理由は公式発表等で確認できない場合があります。本資料は情報整理を目的とし、投資判断を推奨するものではありません。取得日時：${escapeHtml(stock.fetchedAt)}</footer>
</body>
</html>`;
}
