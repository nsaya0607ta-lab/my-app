/* =========================================================================
   無料CORSプロキシ経由のfetchヘルパー（ニュース・株価取得で共通利用）
   1つのプロキシがダウン・レート制限中でも他が使えるよう、順番に試す。
   ========================================================================= */

export const CORS_PROXIES = [
  url => "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
  url => "https://corsproxy.io/?url=" + encodeURIComponent(url),
  url => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(url),
];

export function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

// 複数の無料CORSプロキシを順番に試し、最初に成功したResponseを返す
export async function fetchViaProxies(url, { timeoutMs = 8000 } = {}) {
  let lastErr = new Error("no proxy available");
  for (const buildProxyUrl of CORS_PROXIES) {
    try {
      const res = await withTimeout(fetch(buildProxyUrl(url)), timeoutMs);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}
