import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

import { fetchIonqStock } from './stock.mjs';
import { generateIonqReport } from './gemini.mjs';
import { renderIonqHtml } from './render.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const OUT_DIR = path.join(REPO_ROOT, 'pdf-manager/public/ionq');
const INDEX_PATH = path.join(OUT_DIR, 'index.json');
const RETENTION_DAYS = 90;
const KEEP_HTML = new Set(process.argv.slice(2)).has('--html');

function jstDate() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function compactDate(value) {
  return String(value || '').replaceAll('-', '');
}

function expectedReportFile(id) {
  const match = /^(\d{4})-(\d{2})-(\d{2})-ionq$/.exec(String(id || ''));
  if (!match) return null;
  return `投資_IQ_${match[1]}${match[2]}${match[3]}.pdf`;
}

function isCanonicalReport(entry) {
  const expected = expectedReportFile(entry?.id);
  if (!expected) return false;
  if (entry?.file !== expected) return false;
  return entry?.name === undefined || entry.name === expected;
}

async function htmlToPdf(html) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('print');
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
}

async function readIndex() {
  try {
    const parsed = JSON.parse(await readFile(INDEX_PATH, 'utf8'));
    const reports = Array.isArray(parsed?.reports) ? parsed.reports : [];
    // 旧形式・テスト用エントリーは次回生成時にも引き継がない。
    return reports.filter(isCanonicalReport);
  } catch {
    return [];
  }
}

async function pruneOld(reports) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
  const kept = reports
    .filter(isCanonicalReport)
    .filter((entry) => String(entry.id || '').slice(0, 10) >= cutoff);
  const keptFiles = new Set(kept.map((entry) => entry.file));
  const existing = await readdir(OUT_DIR).catch(() => []);
  for (const name of existing) {
    if ((name.endsWith('.pdf') || name.endsWith('.html')) && !keptFiles.has(name) && !keptFiles.has(name.replace(/\.html$/, '.pdf'))) {
      await unlink(path.join(OUT_DIR, name)).catch(() => undefined);
    }
  }
  return kept;
}

async function main() {
  const reportDate = jstDate();
  console.log(`${reportDate}: IONQレポートを生成します`);

  const stock = await fetchIonqStock();
  console.log(`  株価: ${stock.marketDate} close=${stock.close} USD`);

  const { report, sources } = await generateIonqReport(stock);
  const html = renderIonqHtml({ stock, report: { ...report, reportDate }, sources });

  await mkdir(OUT_DIR, { recursive: true });
  // ファイル名の日付は市場取引日ではなく、レポートを作成した日本日付にする。
  const fileName = `投資_IQ_${compactDate(reportDate)}.pdf`;
  if (KEEP_HTML) await writeFile(path.join(OUT_DIR, fileName.replace(/\.pdf$/, '.html')), html, 'utf8');

  const pdf = await htmlToPdf(html);
  await writeFile(path.join(OUT_DIR, fileName), pdf);
  console.log(`  PDF: ${fileName} (${Math.round(pdf.length / 1024)}KB)`);

  const entry = {
    id: `${reportDate}-ionq`,
    file: fileName,
    name: fileName,
    size: pdf.length,
    generatedAt: new Date().toISOString(),
    marketDate: stock.marketDate,
  };
  const reports = await readIndex();
  const merged = [entry, ...reports.filter((item) => item.id !== entry.id)].sort((a, b) => b.id.localeCompare(a.id));
  const kept = await pruneOld(merged);
  await writeFile(INDEX_PATH, `${JSON.stringify({ reports: kept }, null, 2)}\n`, 'utf8');
  console.log(`  index.json: ${kept.length}件`);
}

await main();
