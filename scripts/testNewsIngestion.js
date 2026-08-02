const assert = require("node:assert/strict");
const {
  articleDocId,
  canonicalUrl,
  dateKeyInZone,
  isDue,
  normalizeSettings,
  parseFeed,
  parseNewsApi,
} = require("../api/_lib/newsIngestion");

const RSS = `<?xml version="1.0"?><rss><channel>
  <item>
    <title><![CDATA[市場ニュース &amp; 今日]]></title>
    <description><![CDATA[<p>株価が上昇しました。</p>]]></description>
    <link>https://example.com/story?utm_source=test&amp;id=1</link>
    <pubDate>Sun, 02 Aug 2026 01:30:00 GMT</pubDate>
    <source>Example News</source>
    <media:thumbnail url="https://example.com/image.jpg" />
  </item>
</channel></rss>`;

const parsed = parseFeed(RSS, "stocks", { limit: 5, fetchedAt: "2026-08-02T02:00:00.000Z" });
assert.equal(parsed.length, 1);
assert.equal(parsed[0].title, "市場ニュース & 今日");
assert.equal(parsed[0].summary, "株価が上昇しました。");
assert.equal(parsed[0].url, "https://example.com/story?id=1");
assert.equal(parsed[0].thumbnailUrl, "https://example.com/image.jpg");

const apiParsed = parseNewsApi({ articles: [{
  title: "海外ニュース", description: "概要", content: "本文", publishedAt: "2026-08-01T23:30:00Z",
  source: { name: "Wire" }, url: "https://wire.example/a", urlToImage: "https://wire.example/a.jpg",
}] }, "world");
assert.equal(apiParsed[0].sourceName, "Wire");
assert.equal(apiParsed[0].thumbnailUrl, "https://wire.example/a.jpg");

assert.equal(canonicalUrl("https://example.com/a?utm_campaign=x&id=2#top"), "https://example.com/a?id=2");
assert.equal(dateKeyInZone("2026-08-01T23:30:00Z", "Asia/Tokyo"), "2026-08-02");
assert.equal(articleDocId(parsed[0]), articleDocId({ ...parsed[0], title: "changed" }));

const base = normalizeSettings({ frequency: "daily", time: "07:00", timeZone: "Asia/Tokyo" });
assert.equal(isDue(base, new Date("2026-08-01T21:59:00Z")), false);
assert.equal(isDue(base, new Date("2026-08-01T22:01:00Z")), true);
assert.equal(isDue({ ...base, lastSuccessDate: "2026-08-02" }, new Date("2026-08-01T22:01:00Z")), false);
assert.equal(isDue({ ...base, frequency: "manual" }, new Date("2026-08-01T22:01:00Z")), false);
assert.equal(isDue({ ...base, frequency: "hourly", lastSuccessAt: "2026-08-02T00:30:00Z" }, new Date("2026-08-02T01:00:00Z")), false);
assert.equal(isDue({ ...base, frequency: "hourly", lastSuccessAt: "2026-08-02T00:00:00Z" }, new Date("2026-08-02T01:01:00Z")), true);

assert.throws(() => normalizeSettings({ feeds: { japan: "http://127.0.0.1/feed" } }), /private-host/);
assert.throws(() => normalizeSettings({ feeds: { japan: "https://example.com/feed?apiKey=secret" } }), /contains-secret/);

console.log("news ingestion: ok");
