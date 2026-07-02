/* =========================================================================
   お天気カード用の天気情報取得。
   - 位置情報: ブラウザのGeolocation APIでユーザーの現在地を取得する
     （権限が無い/取得できない場合は東京をデフォルト地点として扱う）
   - 天気データ: Open-Meteo（https://open-meteo.com）の無料API。
     APIキー登録不要・CORSも許可されているため、ブラウザから直接fetchできる
   - 地域名（都市名）: BigDataCloudの無料リバースジオコーディングAPI
     （こちらもAPIキー不要・CORS許可済み。クライアントサイド利用を想定）
   ========================================================================= */

const DEFAULT_LOCATION = { lat: 35.6762, lon: 139.6503 };
const DEFAULT_CITY = "東京";
const GEO_TIMEOUT_MS = 8000;
const FETCH_TIMEOUT_MS = 8000;
const CACHE_KEY = "weather_cache_v1";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15分キャッシュ

// WMO Weather interpretation code（Open-Meteoが返すweather_code）→ アイコン・日本語表記
const WEATHER_CODES = {
  0: { icon: "☀️", label: "快晴" },
  1: { icon: "🌤️", label: "晴れ" },
  2: { icon: "⛅", label: "薄曇り" },
  3: { icon: "☁️", label: "曇り" },
  45: { icon: "🌫️", label: "霧" },
  48: { icon: "🌫️", label: "霧氷" },
  51: { icon: "🌦️", label: "小雨" },
  53: { icon: "🌦️", label: "小雨" },
  55: { icon: "🌧️", label: "雨" },
  56: { icon: "🌧️", label: "着氷性の雨" },
  57: { icon: "🌧️", label: "着氷性の雨" },
  61: { icon: "🌦️", label: "小雨" },
  63: { icon: "🌧️", label: "雨" },
  65: { icon: "🌧️", label: "大雨" },
  66: { icon: "🌧️", label: "着氷性の雨" },
  67: { icon: "🌧️", label: "着氷性の雨" },
  71: { icon: "🌨️", label: "小雪" },
  73: { icon: "🌨️", label: "雪" },
  75: { icon: "❄️", label: "大雪" },
  77: { icon: "❄️", label: "霧雪" },
  80: { icon: "🌦️", label: "にわか雨" },
  81: { icon: "🌧️", label: "にわか雨" },
  82: { icon: "⛈️", label: "激しいにわか雨" },
  85: { icon: "🌨️", label: "にわか雪" },
  86: { icon: "❄️", label: "激しいにわか雪" },
  95: { icon: "⛈️", label: "雷雨" },
  96: { icon: "⛈️", label: "雷雨（雹）" },
  99: { icon: "⛈️", label: "雷雨（雹）" },
};
function describeWeatherCode(code){
  return WEATHER_CODES[code] || { icon: "🌡️", label: "" };
}

function withTimeout(promise, ms){
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

// ブラウザのGeolocation APIで現在地を取得する。権限が無い・非対応・失敗した
// 場合は null を返す（呼び出し側でデフォルト地点にフォールバックする）
function getCurrentPosition(){
  return new Promise((resolve) => {
    if(!("geolocation" in navigator)){ resolve(null); return; }
    let settled = false;
    const timer = setTimeout(() => { if(!settled){ settled = true; resolve(null); } }, GEO_TIMEOUT_MS);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if(settled) return;
        settled = true; clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        if(settled) return;
        settled = true; clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: 10 * 60 * 1000 }
    );
  });
}

// 緯度経度から地域名（市区町村名）を取得する。取得できない場合は null
async function reverseGeocode(lat, lon){
  try{
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ja`;
    const res = await withTimeout(fetch(url), FETCH_TIMEOUT_MS);
    if(!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    return data.locality || data.city || data.principalSubdivision || null;
  } catch(e){
    console.warn("[weather] 地域名の取得に失敗しました:", e.message);
    return null;
  }
}

// 現在の気温・天気・降水確率を取得する
async function fetchForecast(lat, lon){
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,weather_code",
    hourly: "precipitation_probability",
    timezone: "auto",
    forecast_days: "1",
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const res = await withTimeout(fetch(url), FETCH_TIMEOUT_MS);
  if(!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  if(!data.current || typeof data.current.temperature_2m !== "number"){
    throw new Error("invalid forecast response");
  }
  const temp = Math.round(data.current.temperature_2m);
  const { icon, label } = describeWeatherCode(data.current.weather_code);

  // 降水確率は current には含まれないため、hourly から現在時刻に一致（または
  // 最も近い）時刻のポイントを探して拾う
  let pop = null;
  const times = data.hourly?.time || [];
  const pops = data.hourly?.precipitation_probability || [];
  if(times.length && pops.length){
    let idx = times.indexOf(data.current.time);
    if(idx < 0){
      const nowMs = Date.now();
      let best = 0, bestDiff = Infinity;
      times.forEach((t, i) => {
        const diff = Math.abs(new Date(t).getTime() - nowMs);
        if(diff < bestDiff){ bestDiff = diff; best = i; }
      });
      idx = best;
    }
    if(typeof pops[idx] === "number") pop = pops[idx];
  }

  return { temp, icon, label, pop };
}

function loadCache(){
  try{
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if(raw && raw.data && (Date.now() - raw.savedAt) < CACHE_TTL_MS) return raw.data;
  } catch(e){}
  return null;
}
function saveCache(data){
  try{ localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data })); } catch(e){}
}

// 天気情報一式を取得する。位置情報が得られない場合はデフォルト地点（東京）に
// フォールバックし、その旨を isDefaultLocation で伝える（実際の現在地の
// データであるかのように誤認させないため、呼び出し側でラベル表示に使う）。
// 天気データ自体の取得に失敗した場合は null を返す。
export async function getWeather(){
  const cached = loadCache();
  if(cached) return cached;

  const pos = await getCurrentPosition();
  const { lat, lon } = pos || DEFAULT_LOCATION;
  const isDefaultLocation = !pos;

  let forecast;
  try{
    forecast = await fetchForecast(lat, lon);
  } catch(e){
    console.warn("[weather] 天気情報の取得に失敗しました:", e.message);
    return null;
  }

  const city = isDefaultLocation ? DEFAULT_CITY : ((await reverseGeocode(lat, lon)) || "現在地");

  const result = { ...forecast, city, isDefaultLocation };
  saveCache(result);
  return result;
}
