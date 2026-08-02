const { createHash } = require("node:crypto");
const { FieldValue } = require("firebase-admin/firestore");

const CATEGORY_KEYS = ["japan", "world", "stocks"];
const DEFAULT_FEEDS = {
  japan: "https://news.google.com/rss/search?q=%E6%97%A5%E6%9C%AC%20%E7%B5%8C%E6%B8%88&hl=ja&gl=JP&ceid=JP:ja",
  world: "https://news.google.com/rss/headlines/section/topic/WORLD?hl=ja&gl=JP&ceid=JP:ja",
  stocks: "https://news.google.com/rss/search?q=%E6%A0%AA%E5%BC%8F%20OR%20%E6%A0%AA%E4%BE%A1%20OR%20%E8%A8%BC%E5%88%B8%E5%B8%82%E5%A0%B4&hl=ja&gl=JP&ceid=JP:ja",
};
const CATEGORY_THUMBNAILS = {
  japan: "/assets/icon/quickmenu/news-jp.png",
  world: "/assets/icon/quickmenu/news-world.png",
  stocks: "/assets/icon/quickmenu/stock.png",
};
const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  provider: "rss",
  frequency: "daily",
  time: "07:00",
  timeZone: "Asia/Tokyo",
  maxPerCategory: 12,
  feeds: DEFAULT_FEEDS,
});
const FREQUENCY_MS = { hourly: 60 * 60_000, every3h: 3 * 60 * 60_000, every6h: 6 * 60 * 60_000 };
const LOCK_MS = 10 * 60_000;

function cleanText(value) {
  return decodeXml(String(value || ""))
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)));
}

function extractTag(block, names) {
  for (const name of names) {
    const escaped = name.replace(":", "\\:");
    const match = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i").exec(block);
    if (match) return match[1];
  }
  return "";
}

function extractUrlAttribute(block, tagNames) {
  for (const name of tagNames) {
    const escaped = name.replace(":", "\\:");
    const match = new RegExp(`<${escaped}\\b[^>]*(?:url|href)=["']([^"']+)["'][^>]*>`, "i").exec(block);
    if (match) return decodeXml(match[1]);
  }
  return "";
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.toString();
  } catch (_) { return ""; }
}

function canonicalUrl(value) {
  try {
    const url = new URL(safeHttpUrl(value));
    url.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"]
      .forEach((key) => url.searchParams.delete(key));
    return url.toString();
  } catch (_) { return ""; }
}

function parseFeed(xml, category, { limit = 12, fetchedAt = new Date().toISOString() } = {}) {
  const source = String(xml || "");
  const rssBlocks = source.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const atomBlocks = rssBlocks.length ? [] : (source.match(/<entry\b[\s\S]*?<\/entry>/gi) || []);
  return [...rssBlocks, ...atomBlocks].slice(0, limit).map((block) => {
    const title = cleanText(extractTag(block, ["title"]));
    const summary = cleanText(extractTag(block, ["description", "summary", "content:encoded", "content"]));
    const rawLink = cleanText(extractTag(block, ["link"])) || extractUrlAttribute(block, ["link"]);
    const publishedRaw = cleanText(extractTag(block, ["pubDate", "published", "updated", "dc:date"]));
    const sourceName = cleanText(extractTag(block, ["source", "author", "dc:creator"]));
    const thumbnailUrl = safeHttpUrl(extractUrlAttribute(block, ["media:content", "media:thumbnail", "enclosure"]));
    const date = new Date(publishedRaw);
    return {
      category,
      title,
      summary: summary && summary !== title ? summary.slice(0, 600) : "",
      content: summary && summary !== title ? summary.slice(0, 2000) : title,
      publishedAt: Number.isFinite(date.getTime()) ? date.toISOString() : fetchedAt,
      sourceName,
      url: canonicalUrl(rawLink),
      thumbnailUrl: thumbnailUrl || CATEGORY_THUMBNAILS[category],
      fetchedAt,
    };
  }).filter((article) => article.title && article.url);
}

function parseNewsApi(payload, category, { limit = 12, fetchedAt = new Date().toISOString() } = {}) {
  const list = payload && Array.isArray(payload.articles) ? payload.articles : [];
  return list.slice(0, limit).map((item) => {
    const date = new Date(item.publishedAt || fetchedAt);
    return {
      category,
      title: cleanText(item.title),
      summary: cleanText(item.description).slice(0, 600),
      content: cleanText(item.content || item.description || item.title).slice(0, 2000),
      publishedAt: Number.isFinite(date.getTime()) ? date.toISOString() : fetchedAt,
      sourceName: cleanText(item.source && item.source.name),
      url: canonicalUrl(item.url),
      thumbnailUrl: safeHttpUrl(item.urlToImage) || CATEGORY_THUMBNAILS[category],
      fetchedAt,
    };
  }).filter((article) => article.title && article.url);
}

function dateKeyInZone(value, timeZone = "Asia/Tokyo") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const read = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function localClock(value, timeZone = "Asia/Tokyo") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const read = (type) => parts.find((part) => part.type === type)?.value || "00";
  return { date: `${read("year")}-${read("month")}-${read("day")}`, minutes: Number(read("hour")) * 60 + Number(read("minute")) };
}

function normalizeFeedUrl(value, fallback) {
  const url = safeHttpUrl(value || fallback);
  if (!url) throw new Error("feed-url-invalid");
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || /^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    throw new Error("feed-url-private-host");
  }
  for (const key of parsed.searchParams.keys()) {
    if (/key|token|secret|password|auth/i.test(key)) throw new Error("feed-url-contains-secret");
  }
  return parsed.toString();
}

function normalizeSettings(input = {}) {
  const feeds = input.feeds || {};
  return {
    enabled: input.enabled !== false,
    provider: input.provider === "newsapi" ? "newsapi" : "rss",
    frequency: ["manual", "hourly", "every3h", "every6h", "daily"].includes(input.frequency) ? input.frequency : DEFAULT_SETTINGS.frequency,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(input.time || "") ? input.time : DEFAULT_SETTINGS.time,
    timeZone: input.timeZone === "UTC" ? "UTC" : "Asia/Tokyo",
    maxPerCategory: Math.max(3, Math.min(30, Number(input.maxPerCategory) || DEFAULT_SETTINGS.maxPerCategory)),
    feeds: {
      japan: normalizeFeedUrl(feeds.japan || process.env.NEWS_FEED_JAPAN_URL, DEFAULT_FEEDS.japan),
      world: normalizeFeedUrl(feeds.world || process.env.NEWS_FEED_WORLD_URL, DEFAULT_FEEDS.world),
      stocks: normalizeFeedUrl(feeds.stocks || process.env.NEWS_FEED_STOCKS_URL, DEFAULT_FEEDS.stocks),
    },
  };
}

function isDue(settings, now = new Date()) {
  if (!settings.enabled || settings.frequency === "manual") return false;
  const lastAttempt = Date.parse(settings.lastAttemptAt || "");
  if (Number.isFinite(lastAttempt) && now.getTime() - lastAttempt < 12 * 60_000) return false;
  if (FREQUENCY_MS[settings.frequency]) {
    const lastSuccess = Date.parse(settings.lastSuccessAt || "");
    return !Number.isFinite(lastSuccess) || now.getTime() - lastSuccess >= FREQUENCY_MS[settings.frequency];
  }
  const local = localClock(now, settings.timeZone);
  const [hour, minute] = settings.time.split(":").map(Number);
  return local.minutes >= hour * 60 + minute && settings.lastSuccessDate !== local.date;
}

function articleDocId(article) {
  const identity = canonicalUrl(article.url) || `${article.category}|${article.sourceName}|${article.title.toLowerCase().replace(/\s+/g, "")}`;
  return `auto_${article.category}_${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`upstream-${response.status}`);
    return response;
  } finally { clearTimeout(timer); }
}

async function fetchCategory(category, settings) {
  const fetchedAt = new Date().toISOString();
  if (settings.provider === "newsapi") {
    const apiKey = process.env.NEWS_API_KEY;
    if (!apiKey) throw new Error("NEWS_API_KEY is missing");
    const queries = { japan: "日本 経済 OR 政治 OR 社会", world: "国際 OR 世界 経済", stocks: "株式 OR 株価 OR 証券市場" };
    const params = new URLSearchParams({ q: queries[category], language: "ja", sortBy: "publishedAt", pageSize: String(settings.maxPerCategory), apiKey });
    const response = await fetchWithTimeout(`https://newsapi.org/v2/everything?${params}`, { headers: { "User-Agent": "my-app-news-fetcher/1.0" } });
    const payload = await response.json();
    if (payload.status === "error") throw new Error(`newsapi-${payload.code || "error"}`);
    return parseNewsApi(payload, category, { limit: settings.maxPerCategory, fetchedAt });
  }
  const response = await fetchWithTimeout(settings.feeds[category], { headers: { "User-Agent": "my-app-news-fetcher/1.0", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" } });
  return parseFeed(await response.text(), category, { limit: settings.maxPerCategory, fetchedAt });
}

async function saveArticles(db, articles, timeZone) {
  if (!articles.length) return { fetched: 0, saved: 0 };
  const fetched = articles.length;
  const uniqueArticles = Array.from(new Map(articles.map((article) => [articleDocId(article), article])).values());
  const refs = uniqueArticles.map((article) => db.collection("news").doc(articleDocId(article)));
  const existing = await db.getAll(...refs);
  const batch = db.batch();
  const now = new Date().toISOString();
  let saved = 0;
  uniqueArticles.forEach((article, index) => {
    const isNew = !existing[index].exists;
    if (isNew) saved += 1;
    batch.set(refs[index], {
      ...article,
      dateKey: dateKeyInZone(article.publishedAt, timeZone),
      automated: true,
      dedupeKey: articleDocId(article),
      createdAt: isNew ? now : (existing[index].data().createdAt || now),
      updatedAt: now,
    }, { merge: true });
  });
  await batch.commit();
  return { fetched, saved };
}

async function getNewsSettings(db) {
  const snapshot = await db.collection("newsSettings").doc("default").get();
  const stored = snapshot.exists ? snapshot.data() : {};
  return { ...stored, ...normalizeSettings(stored) };
}

async function updateNewsSettings(db, patch) {
  const normalized = normalizeSettings(patch);
  await db.collection("newsSettings").doc("default").set({ ...normalized, updatedAt: new Date().toISOString() }, { merge: true });
  return getNewsSettings(db);
}

function publicSettings(settings) {
  const { enabled, provider, frequency, time, timeZone, maxPerCategory, feeds, lastAttemptAt, lastSuccessAt, lastStatus, lastResult } = settings;
  return { enabled, provider, frequency, time, timeZone, maxPerCategory, feeds, lastAttemptAt: lastAttemptAt || "", lastSuccessAt: lastSuccessAt || "", lastStatus: lastStatus || "idle", lastResult: lastResult || null, newsApiConfigured: !!process.env.NEWS_API_KEY };
}

async function runNewsSync(db, { force = false, trigger = "scheduled" } = {}) {
  const settingsRef = db.collection("newsSettings").doc("default");
  const now = new Date();
  const acquired = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(settingsRef);
    const stored = snapshot.exists ? snapshot.data() : {};
    const settings = { ...stored, ...normalizeSettings(stored) };
    const lockUntil = Date.parse(settings.lockUntil || "");
    if (Number.isFinite(lockUntil) && lockUntil > now.getTime()) return { started: false, reason: "busy", settings };
    if (!force && !isDue(settings, now)) return { started: false, reason: "not-due", settings };
    transaction.set(settingsRef, {
      ...normalizeSettings(settings),
      lastAttemptAt: now.toISOString(),
      lastStatus: "fetching",
      lastTrigger: trigger,
      lockUntil: new Date(now.getTime() + LOCK_MS).toISOString(),
    }, { merge: true });
    return { started: true, settings };
  });
  if (!acquired.started) return { ok: true, skipped: true, reason: acquired.reason, settings: publicSettings(acquired.settings) };

  const results = {};
  const errors = {};
  await Promise.all(CATEGORY_KEYS.map(async (category) => {
    try {
      const articles = await fetchCategory(category, acquired.settings);
      results[category] = await saveArticles(db, articles, acquired.settings.timeZone);
    } catch (error) {
      errors[category] = String(error && error.message || error).replace(/apiKey=[^&]+/gi, "apiKey=***").slice(0, 200);
    }
  }));

  const succeeded = CATEGORY_KEYS.length - Object.keys(errors).length;
  const status = succeeded === 0 ? "failed" : (succeeded < CATEGORY_KEYS.length ? "partial" : "success");
  const finishedAt = new Date();
  const summary = {
    fetched: Object.values(results).reduce((sum, item) => sum + item.fetched, 0),
    saved: Object.values(results).reduce((sum, item) => sum + item.saved, 0),
    categories: results,
    errors,
  };
  const update = {
    lastStatus: status,
    lastResult: summary,
    lastFinishedAt: finishedAt.toISOString(),
    lockUntil: FieldValue.delete(),
  };
  if (succeeded > 0) {
    update.lastSuccessAt = finishedAt.toISOString();
    update.lastSuccessDate = localClock(finishedAt, acquired.settings.timeZone).date;
  }
  await settingsRef.set(update, { merge: true });
  return { ok: status !== "failed", skipped: false, status, ...summary, settings: publicSettings({ ...acquired.settings, ...update }) };
}

module.exports = {
  CATEGORY_KEYS, DEFAULT_SETTINGS, DEFAULT_FEEDS,
  canonicalUrl, parseFeed, parseNewsApi, dateKeyInZone,
  normalizeSettings, isDue, articleDocId,
  getNewsSettings, updateNewsSettings, publicSettings, runNewsSync,
};
