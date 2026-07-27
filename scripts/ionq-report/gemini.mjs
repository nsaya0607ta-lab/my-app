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
    conclusion: { type: 'STRING' },
    dailyMove: { type: 'STRING' },
    newMaterials: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING' },
          title: { type: 'STRING' },
          publishedAt: { type: 'STRING' },
          sourceName: { type: 'STRING' },
          sourceUrl: { type: 'STRING' },
          summary: { type: 'STRING' },
          impact: { type: 'STRING', enum: ['positive', 'negative', 'neutral'] },
        },
        required: ['type', 'title', 'publishedAt', 'sourceName', 'sourceUrl', 'summary', 'impact'],
      },
    },
    reasonFacts: { type: 'ARRAY', items: { type: 'STRING' } },
    reasonPossibilities: { type: 'ARRAY', items: { type: 'STRING' } },
    reasonUnknowns: { type: 'ARRAY', items: { type: 'STRING' } },
    shortTermWatch: { type: 'ARRAY', items: { type: 'STRING' } },
    nextEvent: {
      type: 'OBJECT',
      properties: {
        date: { type: 'STRING' },
        title: { type: 'STRING' },
        checkpoints: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['date', 'title', 'checkpoints'],
    },
    dataLimitations: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: [
    'title', 'reportDate', 'marketDate', 'conclusion', 'dailyMove', 'newMaterials',
    'reasonFacts', 'reasonPossibilities', 'reasonUnknowns', 'shortTermWatch',
    'nextEvent', 'dataLimitations',
  ],
};

function jstDate() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function jstDateTime() {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
}

async function callGemini(apiKey, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE}/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: controller.signal,
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
      if (String(error?.message || '').includes('Gemini API error 4') && !String(error?.message || '').includes('429')) throw error;
    }
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
  }
  throw lastError || new Error(`${label}: Gemini APIの呼び出しに失敗しました`);
}

function responseText(data) {
  return data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || '';
}

function groundingSources(data) {
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const seen = new Set();
  const sources = [];
  for (const chunk of chunks) {
    const url = typeof chunk?.web?.uri === 'string' ? chunk.web.uri : '';
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push({ title: chunk.web.title || '情報源', url });
  }
  return sources;
}

async function searchNews(apiKey, stock) {
  const prompt = [
    `現在は日本時間で ${jstDateTime()} です。`,
    '米国上場企業 IonQ, Inc.（NASDAQ: IONQ）について、現在時刻から過去24時間以内に新しく公開または更新された重要情報だけを検索してください。',
    'IonQ公式Investor Relations、SEC提出書類、米政府機関、契約・提携先の公式発表を最優先し、次に信頼できる主要金融メディアを使用してください。',
    '以前から公表済みの決算予定や継続中の話題は、過去24時間以内に新しい発表・変更がない限り新規材料に含めないでください。',
    '同じ出来事の転載は1件に統合し、公開日時を確認できない情報は新規材料として採用しないでください。',
    '株価数値や値動きの理由は検索結果から作らず、ニュースの事実確認だけを行ってください。',
    `市場データAPIの株価対象日は ${stock.marketDate} です。`,
    '各情報について、種別、タイトル、公開日時、媒体名、URL、確認できた事実、株価への影響、不確実な点を日本語で整理してください。',
    '該当情報がない場合は、件数を増やさず「過去24時間以内に重要な新規材料は確認できなかった」とだけ記載してください。',
  ].join('\n');

  const data = await requestWithRetry(apiKey, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 5000 },
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
    session: '米国市場の通常取引終了時点',
    afterHoursIncluded: false,
    open: stock.open,
    high: stock.high,
    low: stock.low,
    close: stock.close,
    previousClose: stock.previousClose,
    change: stock.change,
    changePercent: stock.changePercent,
    volume: stock.volume,
    averageVolume20: stock.averageVolume20,
    volumeVsAveragePercent: stock.volumeVsAveragePercent,
    dayRange: stock.dayRange,
    closePositionPercent: stock.closePositionPercent,
    provider: stock.provider,
    fetchedAt: stock.fetchedAt,
  }, null, 2);
}

function sourceText(sources) {
  if (!sources.length) return '（参照URLを取得できませんでした）';
  return sources.map((source, index) => `${index + 1}. ${source.title}\n${source.url}`).join('\n');
}

function trimText(value, maxLength) {
  const text = String(value || '').trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trim()}…`;
}

function normalizeList(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const text = trimText(item, maxLength);
    const key = text.replace(/\s+/g, '').toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= maxItems) break;
  }
  return result;
}

function sanitizeReport(report, sources, stock) {
  const byUrl = new Map(sources.map((source) => [source.url, source]));
  const materials = [];
  const seen = new Set();
  for (const item of Array.isArray(report.newMaterials) ? report.newMaterials : []) {
    const source = byUrl.get(item.sourceUrl);
    const title = trimText(item.title || 'タイトル未確認', 90);
    const key = `${title.replace(/\s+/g, '').toLowerCase()}|${source?.url || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    materials.push({
      type: trimText(item.type || 'その他', 18),
      title,
      publishedAt: trimText(item.publishedAt || '確認できず', 30),
      sourceName: trimText(source?.title || item.sourceName || '情報源未確認', 45),
      sourceUrl: source?.url || '',
      summary: trimText(item.summary || '', 180),
      impact: ['positive', 'negative', 'neutral'].includes(item.impact) ? item.impact : 'neutral',
    });
    if (materials.length >= 3) break;
  }

  const nextEvent = report.nextEvent && typeof report.nextEvent === 'object' ? report.nextEvent : {};
  return {
    title: trimText(report.title || 'IonQ（IONQ）日次株式レポート', 80),
    reportDate: jstDate(),
    marketDate: stock.marketDate,
    conclusion: trimText(report.conclusion, 330),
    dailyMove: trimText(report.dailyMove, 300),
    newMaterials: materials,
    reasonFacts: normalizeList(report.reasonFacts, 2, 150),
    reasonPossibilities: normalizeList(report.reasonPossibilities, 2, 150),
    reasonUnknowns: normalizeList(report.reasonUnknowns, 2, 150),
    shortTermWatch: normalizeList(report.shortTermWatch, 4, 100),
    nextEvent: {
      date: trimText(nextEvent.date, 30),
      title: trimText(nextEvent.title, 100),
      checkpoints: normalizeList(nextEvent.checkpoints, 4, 80),
    },
    dataLimitations: normalizeList(report.dataLimitations, 3, 130),
  };
}

async function structureReport(apiKey, stock, search) {
  const prompt = [
    '以下の市場データと過去24時間の検索結果だけを使い、IonQの日次株式レポートを作成してください。',
    '目的は「今日何が変わったか／なぜ動いた可能性があるか／次に何を見るか」を1ページで把握できることです。',
    '',
    '【絶対条件】',
    '・株価、前日比、出来高、日付は市場データJSONの数値だけを使い、存在しない情報を作らない。',
    '・通常取引のデータだけを使用し、時間外取引を取得していないことを明示する。',
    '・日中足は無いため、午前中や終盤など時間帯別の動きを推測しない。OHLCから確認できる範囲だけを書く。',
    '・過去24時間以内の新規情報だけをnewMaterialsへ入れ、以前から公表済みの決算予定や継続材料を再掲しない。',
    '・同一内容を複数欄で繰り返さない。特に決算予定はnextEventだけに記載する。',
    '・新規材料がない場合はnewMaterialsを空配列にし、内容を水増ししない。',
    '・値動きの理由は、確認できた事実／関連する可能性／確認できないことに分け、因果関係を断定しない。',
    '・直近5営業日の総括や中長期の一般論を書かず、文章量を抑えて1ページに収める。',
    '',
    '【フィールドの役割】',
    '・conclusion：2〜3文。株価変化と新規材料の有無だけ。次のイベントは書かない。',
    '・dailyMove：OHLC、値幅、終値の高安内位置、出来高と20日平均の比較を使った一言分析。',
    '・newMaterials：過去24時間の新規情報を最大3件。無ければ空配列。',
    '・reasonFacts／reasonPossibilities／reasonUnknowns：各最大2件。',
    '・shortTermWatch：次の取引日に確認する具体項目を最大4件。',
    '・nextEvent：既に公表されている次の重要イベントを1件だけ。無ければ空文字。',
    '・dataLimitations：取得していない日中足・時間外取引・理由特定の限界を最大3件。',
    '',
    '【市場データAPIの正確な数値】',
    exactStockText(stock),
    '',
    '【過去24時間の検索結果】',
    search.text,
    '',
    '【利用可能な情報源URL】',
    sourceText(search.sources),
  ].join('\n');

  const data = await requestWithRetry(apiKey, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 5000,
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
