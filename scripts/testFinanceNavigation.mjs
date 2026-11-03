// Isolated browser regression: no production data or external services are used.
// npm ci && node scripts/testFinanceNavigation.mjs
// FINANCE_BROWSER_EXECUTABLE_PATH may select an existing Chromium installation.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname) + (url.pathname.endsWith('/') ? 'index.html' : ''));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type }).end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: process.env.FINANCE_BROWSER_EXECUTABLE_PATH || undefined,
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.emulateTimezone('Asia/Tokyo');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', r => r.url().startsWith('http://127.0.0.1:') ? r.continue() : r.abort());
  const url = `http://127.0.0.1:${server.address().port}/finance/`;
  const wait = () => page.waitForFunction(() => !document.querySelector('.fc-modal-back:not(.show)'));
  const click = async (text, selector = 'button') => {
    const button = await page.evaluateHandle((text, selector) => [...document.querySelectorAll(selector)].find(e => (e.textContent.trim() === text || e.getAttribute('aria-label') === text) && e.getClientRects().length), text, selector);
    assert.ok(button.asElement(), `Visible control: ${text}`);
    await button.asElement().evaluate(e => e.scrollIntoView({ block: 'center' }));
    await new Promise(resolve => setTimeout(resolve, 300));
    await button.asElement().click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await button.dispose();
    await wait();
  };
  const field = async (label, value) => {
    await page.evaluate((label, value) => {
      const sheets = document.querySelectorAll('.fc-modal-back.show');
      const scope = sheets[sheets.length - 1] || document;
      const lab = [...scope.querySelectorAll('.fc-field-lab')].find(e => e.textContent === label);
      const input = lab?.parentElement.querySelector('input, select');
      if (!input) throw new Error(`Missing field: ${label}`);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, label, String(value));
  };
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('finance_app_v2')));
  await page.goto(url, { waitUntil: 'networkidle0' });
  assert.deepEqual(await page.$$eval('.fc-nav-lab', es => es.map(e => e.textContent)), ['ホーム', '履歴', '将来予測', 'メニュー']);
  await click('口座を登録する');
  await field('口座名', '銀行'); await field('残高（円）', 100000); await click('保存');
  assert.equal((await state()).accounts[0].balance, 100000);
  const bankId = (await state()).accounts[0].id;
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('finance_app_v2'));
    s.accounts.push({ id: 'wallet-test', name: '財布', type: 'cash', balance: 10000 });
    s.accounts.push({ id: 'securities-test', name: '証券口座', type: 'securities', cash: 50000, balance: 50000, includeInDisposable: false, holdings: [], accumulations: [], pending: [], settlements: [], accumHistory: [], purchases: [] });
    localStorage.setItem('finance_app_v2', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  const securitiesBalanceBefore = (await state()).accounts.find(a => a.id === 'securities-test').balance;
  await click('証券口座', '.fc-row-title');
  assert.equal(await page.$eval('.fc-disclosure', e => e.open), false);
  await click('保有銘柄・積立を管理評価額の更新・株式の購入・積立設定・投資履歴', 'summary');
  assert.ok(await page.$('.fc-disclosure-content .fc-sec-grid'));
  await click('ホーム', '.fc-nav-btn');
  await click('記録する'); await click('支出現金・口座から支払ったお金');
  await field('金額（円）', 1200); await click('保存');
  assert.equal((await state()).accounts[0].balance, 98800);
  await click('記録する'); await click('収入給料など、受け取ったお金');
  await field('金額（円）', 5000); await click('保存');
  assert.equal((await state()).accounts[0].balance, 103800);
  await click('記録する'); await click('口座間の移動銀行から財布・証券口座への振替');
  await field('金額（円）', 3000); await click('保存');
  let s = await state();
  assert.equal(s.accounts[0].balance, 100800); assert.equal(s.accounts[1].balance, 13000);
  assert.equal(s.transactions.length, 2); assert.equal(s.transfers.length, 1);
  // The selected account overrides last-used account in the record form.
  await click('財布取引履歴を見る¥13,000', '.fc-row');
  await click('記録する'); await click('支出現金・口座から支払ったお金');
  assert.equal(await page.$$eval('.fc-modal-back.show .fc-field', es => es.find(e => e.querySelector('.fc-field-lab')?.textContent === '支払口座（必須）').querySelector('select').value), 'wallet-test');
  await click('キャンセル');
  await click('ホーム', '.fc-nav-btn');
  await click('記録する'); await click('カード利用引落前のクレジットカードの支払い');
  assert.equal(await page.$eval('.fc-page-title', e => e.textContent), 'クレジットカード');
  assert.equal(await page.$eval('[aria-current="page"]', e => e.dataset.route), 'menu');
  await click('戻る', '[aria-label="戻る"]');
  await page.waitForFunction(() => document.querySelector('.fc-page-title')?.textContent === 'ホーム');
  await page.evaluate(bankId => {
    const s = JSON.parse(localStorage.getItem('finance_app_v2'));
    s.cards = ['カードA', 'カードB'].map((name, i) => ({ id: 'card-test-' + i, name, closingDay: 'end', payMonthOffset: 1, payDay: 27, payAccountId: bankId, color: '#0a84ff' }));
    localStorage.setItem('finance_app_v2', JSON.stringify(s));
  }, bankId);
  await page.reload({ waitUntil: 'networkidle0' });
  await click('記録する'); await click('カード利用引落前のクレジットカードの支払い');
  await click('カードB引落口座：銀行');
  await field('金額（円）', 2500); await click('保存');
  s = await state();
  assert.equal(s.cardTransactions[0].cardId, 'card-test-1');
  assert.equal(s.accounts[0].balance, 100800); // Card entry does not debit the bank immediately.
  await click('資産の内訳・投資状況口座の区分と投資の評価損益を見る', 'summary');
  await click('シークレットモード', '[aria-label="シークレットモード"]');
  assert.equal(await page.$eval('.fc-disclosure', e => e.open), true);
  assert.match(await page.$eval('.fc-hero-amount', e => e.textContent), /＊/);
  await click('シークレットモード', '[aria-label="シークレットモード"]');
  await click('将来予測', '.fc-nav-btn');
  await click('時期別・口座別に詳しく見る複数の時期の比較・資産構成比・口座別グラフ', 'summary');
  await page.waitForFunction(() => document.querySelector('.fc-disclosure-content .fc-chart'));
  await click('予測の条件を確認・変更固定収支・振替・積立など、計算に使う設定', 'summary');
  await click('投資の予測・試算'); await click('詳細設定');
  for (const text of await page.$$eval('summary', es => es.map(e => e.textContent.trim()))) await click(text, 'summary');
  await click('投資シミュレーション');
  await click('メニュー', '.fc-nav-btn');
  const routes = await page.$$eval('.fc-action-row', es => es.map(e => e.textContent.trim()));
  assert.equal(routes.length, 9);
  for (const label of routes) {
    await click(label, '.fc-action-row');
    await click('戻る', '[aria-label="戻る"]');
    await page.waitForFunction(() => document.querySelector('.fc-page-title')?.textContent === 'メニュー');
  }
  await click('表示・集計の設定テーマ・金額の表示・予算・管理期間', 'summary');
  await click('ダーク');
  assert.equal(await page.$eval('html', e => e.dataset.fcTheme), 'dark');
  assert.equal(await page.$eval('.fc-disclosure', e => e.open), true);
  // Narrow phone and desktop: content must fit without horizontal overflow.
  for (const width of [320, 390, 1280]) {
    await page.setViewport({ width, height: 844 });
    for (const route of ['dashboard', 'transactions', 'simulate', 'menu']) {
      await page.click(`[data-route="${route}"]`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} fits ${width}px`);
    }
  }
  await page.reload({ waitUntil: 'networkidle0' });
  s = await state();
  assert.equal(s.accounts[0].balance, 100800); assert.equal(s.accounts[1].balance, 13000);
  assert.equal(s.transactions.length, 2); assert.equal(s.transfers.length, 1); assert.equal(s.cardTransactions.length, 1);
  assert.equal(s.accounts.find(a => a.id === 'securities-test').balance, securitiesBalanceBefore);
  assert.deepEqual(errors, []);
  console.log('PASS: first account, expense/income/transfer, account defaults, card selection, balances, persistence, routes/back, investment controls, disclosures, secret mode, theme, 320/390/1280px layouts; no JS errors.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
