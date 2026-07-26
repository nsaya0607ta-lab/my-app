const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 120000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const REPORT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    reportDate: { type: 'STRING' },
    marketDate: { type: 'STRING' },
    executiveSummary: { type: 'STRING' },
    priceAnalysis: { type: 'STRING' },
    news: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          publishedAt: { type: 'STRING' },
          sourceName: { type: 'STRING' },
          sourceUrl: { type: 'STRING' },
          summary: { type: 'STRING' },
          impact: { type: 'STRING', enum: ['positive', 'negative', 'neutral'] },
          importance: { type: 'INTEGER' },
        },
        required: ['title', 'publishedAt', 'sourceName', 'sourceUrl', 'summary', 'impact', 'importance'],
      },
    },
    positiveFactors: { type: 'ARRAY', items: { type: 'STRING' } },
    negativeFactors: { type: 'ARRAY', items: { type: 'STRING' } },
    watchPoints: { type: 'ARRAY', items: { type: 'STRING' } },
    dataLimitations: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: [
    'title',
    'reportDate',
    'marketDate',
    'executiveSummary',
    'priceAnalysis',
    'news',
    'positiveFactors',
    'negativeFactors',
    'watchPoints',
    'dataLimitations',
  ],
};

function jstDate() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function callGemini(apiKey, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE}/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function requestWithRetry(apiKey, payload, label) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await callGemini(apiKey, payload);
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const error = new Error(`${label}: Gemini API error ${response.status}: ${text.slice(0, 500)}`);
        if (response.status !== 429 && response.status < 500) throw error;
        lastError = error;
      } else {
        return await response.json();
      }
    } catch (error) {
      lastError = error;
      if (String(error?.message || '').includes('Gemini API error 4') && !String(error?.message || '').includes('429')) {
        throw error;
      }
    }
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
  }
  throw lastError || new Error(`${label}: Gemini APIの呼び出しに失敗しました`);
}

function responseText(data) {
  return data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim() || '';
}

function groundingSources(data) {
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const seen = new Set();
  const sources = [];
  for (const chunk of chunks) {
    const web = chunk?.web;
    const url = typeof web?.uri === 'string' ? web.uri : '';
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push({
      title: typeof web?.title === 'string' && web.title ? web.title : '情報源',
      url,
    });
  }
  return sources;
}

async function searchNews(apiKey, stock) {
  const prompt = [
    `今日は日本時間で ${jstDate()} です。`,
    '米国上場企業 IonQ, Inc.（NASDAQ: IONQ）について、直近72時間を中心に最新ニュースを検索してください。',
    '同名の別企業・イオンキュー以外の量子企業のニュースを混同しないでください。',
    'IonQ公式Investor Relations、SEC提出書類、米政府機関、契約・提携先の公式発表、信頼できる報道機関を優先してください。',
    '決算、受注・契約、提携、買収、技術開発、政府案件、増資・株式発行、インサイダー取引、経営陣の変更を重点確認してください。',
    '同じ出来事を転載した記事は1件にまとめてください。公開日時が確認できないものは、その旨を明記してください。',
    '株価数値は検索結果から推測・引用せず、ニュースの事実確認だけを行ってください。株価は別の市場データAPIを使用します。',
    '',
    `参考として市場データAPIの対象日は ${stock.marketDate} です。`,
    '',
    '日本語で、各ニュースについて「タイトル／公開日時／媒体名／URL／確認できた事実／想定される影響（好材料・悪材料・中立）／不確実な点」を明確に書いてください。',
    '重要ニュースが確認できない場合は、無理に件数を作らず「重要な新規ニュースを確認できなかった」と記載してください。',
  ].join('\n');

  const data = await requestWithRetry(apiKey, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0.15,
      maxOutputTokens: 7000,
    },
  }, 'IONQニュース検索');

  const text = responseText(data);
  if (!text) throw new Error('GeminiのGoogle検索からニュース本文を取得できませんでした');
  return { text, sources: groundingSources(data) };
}

function exactStockText(stock) {
  return JSON.stringify({
    symbol: stock.symbol,
    companyName: stock.companyName,
    currency: stock.currency,
    marketDate: stock.marketDate,
    open: stock.open,
    high: stock.high,
    low: stock.low,
    close: stock.close,
    previousClose: stock.previousClose,
    change: stock.change,
    changePercent: stock.changePercent,
    volume: stock.volume,
    fiveDays: stock.fiveDays,
    provider: stock.provider,
    fetchedAt: stock.fetchedAt,
  }, null, 2);
}

function sourceText(sources) {
  if (sources.length === 0) return '（Google検索の参照URLを取得できませんでした）';
  return sources.map((source, index) => `${index + 1}. ${source.title}\n${source.url}`).join('\n');
}

function sanitizeReport(report, sources, stock) {
  const byUrl = new Map(sources.map((source) => [source.url, source]));
  const normalizedNews = Array.isArray(report.news) ? report.news.slice(0, 6).map((item) => {
    const exact = byUrl.get(item.sourceUrl);
    const fallback = !exact
      ? sources.find((source) =>
          String(item.sourceName || '').toLowerCase().includes(source.title.toLowerCase()) ||
          source.title.toLowerCase().includes(String(item.sourceName || '').toLowerCase()))
      : undefined;
    const source = exact || fallback;
    return {
      title: String(item.title || 'タイトル未確認'),
      publishedAt: String(item.publishedAt || '確認できず'),
      sourceName: source?.title || String(item.sourceName || '情報源未確認'),
      sourceUrl: source?.url || '',
      summary: String(item.summary || ''),
      impact: ['positive', 'negative', 'neutral'].includes(item.impact) ? item.impact : 'neutral',
      importance: Math.max(1, Math.min(3, Math.round(Number(item.importance) || 1))),
    };
  }) : [];

  return {
    title: String(report.title || 'IONQ デイリーレポート'),
    reportDate: jstDate(),
    marketDate: stock.marketDate,
    executiveSummary: String(report.executiveSummary || ''),
    priceAnalysis: String(report.priceAnalysis || ''),
    news: normalizedNews,
    positiveFactors: Array.isArray(report.positiveFactors) ? report.positiveFactors.map(String).slice(0, 6) : [],
    negativeFactors: Array.isArray(report.negativeFactors) ? report.negativeFactors.map(String).slice(0, 6) : [],
    watchPoints: Array.isArray(report.watchPoints) ? report.watchPoints.map(String).slice(0, 8) : [],
    dataLimitations: Array.isArray(report.dataLimitations) ? report.dataLimitations.map(String).slice(0, 6) : [],
  };
}

async function structureReport(apiKey, stock, search) {
  const prompt = [
    '以下の「市場データAPIの正確な数値」と「Google検索で確認したニュース」を使い、IONQの日本語デイリーレポートを作成してください。',
    '',
    '【絶対条件】',
    '・株価、前日比、出来高、日付は市場データJSONの数値だけを使用し、計算し直す場合もその数値だけを使う。',
    '・存在しないニュース、数値、日付、URLを作らない。',
    '・事実と推測を分ける。投資判断を断定しない。',
    '・ニュースのsourceUrlは、下の「利用可能な情報源URL」に含まれるURLだけを使用する。該当URLが無ければ空文字にする。',
    '・重要ニュースが無い場合はnewsを空配列にしてよい。',
    '・impactはpositive / negative / neutralのいずれか。importanceは1〜3。',
    '・priceAnalysisでは終値、前日比、騰落率、日中高安、出来高、直近5営業日の方向感を簡潔に説明する。',
    '',
    '【市場データAPIの正確な数値】',
    exactStockText(stock),
    '',
    '【Google検索で確認したニュース】',
    search.text,
    '',
    '【利用可能な情報源URL】',
    sourceText(search.sources),
  ].join('\n');

  const data = await requestWithRetry(apiKey, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 7000,
      responseMimeType: 'application/json',
      responseSchema: REPORT_SCHEMA,
    },
  }, 'IONQレポート構造化');

  const text = responseText(data);
  if (!text) throw new Error('Geminiから構造化レポートを取得できませんでした');
  return sanitizeReport(JSON.parse(text), search.sources, stock);
}

export async function generateIonqReport(stock) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY が設定されていません');
  const search = await searchNews(apiKey, stock);
  const report = await structureReport(apiKey, stock, search);
  return { report, sources: search.sources };
}
