/**
 * 毎朝の学習レポート PDF を生成する。
 *
 *   node scripts/daily-report/generate.mjs            通常実行
 *   node scripts/daily-report/generate.mjs --dry-run  Firestore/Gemini を使わずサンプルで生成
 *   node scripts/daily-report/generate.mjs --html     PDF に加えて HTML も残す（デザイン確認用）
 *
 * 出力先は pdf-manager/public/daily/ 。Vercel が静的配信し、
 * pdf-manager が起動時に index.json を見て取り込む。
 */
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

import { fetchYesterdayLearning, weakCommands } from './fetchLearning.mjs';
import { buildPrompt, generateReport } from './gemini.mjs';
import { describeQuestion, indexById, loadCertPools } from './questions.mjs';
import { renderHtml } from './render.mjs';
import { SAMPLE_REPORT } from './sample.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const OUT_DIR = path.join(REPO_ROOT, 'pdf-manager/public/daily');
const INDEX_PATH = path.join(OUT_DIR, 'index.json');

/** 保持する日数。これより古い PDF はリポジトリから削除する。 */
const RETENTION_DAYS = 60;
/** 1レポートに載せる復習問題の上限。プロンプトが長くなりすぎないようにする。 */
const MAX_WRONG_QUESTIONS = 12;

const argv = new Set(process.argv.slice(2));
const DRY_RUN = argv.has('--dry-run');
const KEEP_HTML = argv.has('--html');

/* ------------------------------------------------------------------ */

async function collectInput() {
  if (DRY_RUN) {
    return {
      dateLabel: SAMPLE_REPORT.dateLabel,
      certCode: SAMPLE_REPORT.certCode,
      report: SAMPLE_REPORT.report,
    };
  }

  const learning = await fetchYesterdayLearning({ uid: process.env.LEARNING_UID });
  if (!learning.hasActivity) {
    console.log(`${learning.label}: 学習記録がないためレポートは作成しません。`);
    return null;
  }

  // 前日にいちばん多く解いた資格を対象にする
  const pools = await loadCertPools();
  const target = learning.certs
    .slice()
    .sort((a, b) => b.sessions.length - a.sessions.length)[0];
  const pool = pools[target.certId];
  if (!pool) {
    console.log(`資格 ${target.certId} の問題データが見つからないため作成しません。`);
    return null;
  }

  const byId = indexById(pool.questions);
  const wrongQuestions = target.wrong
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map(describeQuestion)
    // 重要度の高い問題を優先する
    .sort((a, b) => b.importance - a.importance)
    .slice(0, MAX_WRONG_QUESTIONS);

  console.log(
    `${learning.label} / ${pool.code}: 演習${target.sessions.length}回、復習リスト${target.wrong.length}問（レポートには${wrongQuestions.length}問）`,
  );

  const prompt = buildPrompt({
    dateLabel: learning.label,
    certCode: pool.code,
    certName: pool.name,
    sessions: target.sessions,
    wrongQuestions,
    weak: weakCommands(target.cmdStats),
  });

  return {
    dateLabel: learning.label,
    certCode: pool.code,
    report: await generateReport(prompt),
  };
}

/* ------------------------------------------------------------------ */

async function htmlToPdf(html) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('print');

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });

    // ページ数はプロンプトで制御しているが、外れたときに気付けるよう記録する
    const pageCount = await page.evaluate(() => {
      // A4 縦から @page の上下余白を引いた本文高さ (px, 96dpi 換算)
      const contentHeightPx = (297 - 11 - 12) * (96 / 25.4);
      return Math.ceil(document.documentElement.scrollHeight / contentHeightPx);
    });
    return { pdf, pageCount };
  } finally {
    await browser.close();
  }
}

/* ------------------------------------------------------------------ */

async function readIndex() {
  try {
    const raw = await readFile(INDEX_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.reports) ? parsed.reports : [];
  } catch {
    return [];
  }
}

/** 保持期間を過ぎた PDF を削除し、index を整える。 */
async function pruneOld(reports) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const kept = reports.filter((entry) => entry.id >= cutoff);

  const keptFiles = new Set(kept.map((entry) => entry.file));
  const existing = await readdir(OUT_DIR).catch(() => []);
  for (const name of existing) {
    if (name.endsWith('.pdf') && !keptFiles.has(name)) {
      await unlink(path.join(OUT_DIR, name)).catch(() => {});
      console.log(`  古いレポートを削除: ${name}`);
    }
  }
  return kept;
}

/* ------------------------------------------------------------------ */

async function main() {
  const input = await collectInput();
  if (!input) return;

  const { dateLabel, certCode, report } = input;
  const html = await renderHtml(report, { dateLabel, certCode });

  await mkdir(OUT_DIR, { recursive: true });
  if (KEEP_HTML) {
    await writeFile(path.join(OUT_DIR, `${dateLabel}.html`), html, 'utf8');
    console.log(`  HTML: ${dateLabel}.html`);
  }

  const { pdf, pageCount } = await htmlToPdf(html);
  const fileName = `${dateLabel}.pdf`;
  await writeFile(path.join(OUT_DIR, fileName), pdf);
  console.log(`  PDF: ${fileName} (${Math.round(pdf.length / 1024)}KB, 約${pageCount}ページ)`);
  if (pageCount < 3 || pageCount > 6) {
    console.warn(`  警告: 目安の3〜6ページから外れています（約${pageCount}ページ）`);
  }

  /* index.json を更新 ------------------------------------------------ */
  const entry = {
    id: dateLabel,
    file: fileName,
    name: `${dateLabel} ${certCode} 学習レポート.pdf`,
    size: pdf.length,
    generatedAt: new Date().toISOString(),
  };

  const reports = await readIndex();
  const merged = [entry, ...reports.filter((r) => r.id !== entry.id)].sort((a, b) =>
    b.id.localeCompare(a.id),
  );
  const kept = await pruneOld(merged);

  await writeFile(INDEX_PATH, `${JSON.stringify({ reports: kept }, null, 2)}\n`, 'utf8');
  console.log(`  index.json を更新しました（${kept.length} 件）`);
}

await main();
