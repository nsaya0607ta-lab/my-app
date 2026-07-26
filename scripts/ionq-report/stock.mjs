const SYMBOL = 'IONQ';
const API_URL = 'https://www.alphavantage.co/query';
const TIMEOUT_MS = 30000;

function numberField(row, key, label) {
  const value = Number(row?.[key]);
  if (!Number.isFinite(value)) throw new Error(`Alpha Vantage の ${label} を取得できませんでした`);
  return value;
}

function parseDay(date, row) {
  return {
    date,
    open: numberField(row, '1. open', '始値'),
    high: numberField(row, '2. high', '高値'),
    low: numberField(row, '3. low', '安値'),
    close: numberField(row, '4. close', '終値'),
    volume: numberField(row, '5. volume', '出来高'),
  };
}

export async function fetchIonqStock() {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY || process.env.STOCK_API_KEY;
  if (!apiKey) {
    throw new Error('ALPHA_VANTAGE_API_KEY（または STOCK_API_KEY）が設定されていません');
  }

  const url = new URL(API_URL);
  url.searchParams.set('function', 'TIME_SERIES_DAILY');
  url.searchParams.set('symbol', SYMBOL);
  url.searchParams.set('outputsize', 'compact');
  url.searchParams.set('apikey', apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`Alpha Vantage API error ${response.status}`);

  const data = await response.json();
  const apiMessage = data?.['Error Message'] || data?.Note || data?.Information;
  if (apiMessage) throw new Error(`Alpha Vantage: ${String(apiMessage).slice(0, 300)}`);

  const series = data?.['Time Series (Daily)'];
  if (!series || typeof series !== 'object') {
    throw new Error('Alpha Vantage から日次株価データが返されませんでした');
  }

  const dates = Object.keys(series).sort((a, b) => b.localeCompare(a));
  if (dates.length < 2) throw new Error('前営業日との比較に必要な株価データが不足しています');

  const days = dates.slice(0, 6).map((date) => parseDay(date, series[date]));
  const latest = days[0];
  const previous = days[1];
  const change = latest.close - previous.close;
  const changePercent = previous.close === 0 ? 0 : (change / previous.close) * 100;

  return {
    symbol: SYMBOL,
    companyName: 'IonQ, Inc.',
    provider: 'Alpha Vantage',
    currency: 'USD',
    marketDate: latest.date,
    open: latest.open,
    high: latest.high,
    low: latest.low,
    close: latest.close,
    volume: latest.volume,
    previousClose: previous.close,
    change,
    changePercent,
    fiveDays: days.slice(0, 5).reverse(),
    fetchedAt: new Date().toISOString(),
  };
}
