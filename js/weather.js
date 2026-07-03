/* =========================================================================
   お天気カード用の天気情報取得。
   - 位置情報: ブラウザのGeolocation APIでユーザーの現在地を取得する
     （権限が無い/取得できない場合は東京をデフォルト地点として扱う）
   - 天気データ: Open-Meteo（https://open-meteo.com）の無料APIを第一候補とし、
     株価取得（stocks.js）と同じfetchDirectOrProxied()（直接fetch→失敗時のみ
     無料CORSプロキシ経由）で取得する。それでも取得できなかった場合に備え、
     完全に別系統の無料API・wttr.in（https://wttr.in）を予備の取得先として
     試す（Open-Meteo・CORSプロキシが軒並み使えない環境でも復旧できるように
     する二段構えの耐障害設計）
   - 地域名（都市名）: BigDataCloudの無料リバースジオコーディングAPI
     （こちらも同様にfetchDirectOrProxied()経由で取得する）
   ========================================================================= */

import { fetchDirectOrProxied } from './cors-proxy.js';

const DEFAULT_LOCATION = { lat: 35.6762, lon: 139.6503 };
const DEFAULT_CITY = "東京";
const GEO_TIMEOUT_MS = 8000;
const FETCH_TIMEOUT_MS = 8000;
const CACHE_KEY = "weather_cache_v2"; // currentTime追加に伴い旧キャッシュを無効化
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

// wttr.in（World Weather Online由来）のweatherCode → アイコン・日本語表記。
// Open-Meteoとはコード体系が異なる予備プロバイダ用の簡易マッピング
// （公式コード一覧を大まかにグルーピング。厳密な一致より見た目の妥当性を優先）
const WTTR_CODE_GROUPS = [
  { codes: [113], icon: "☀️", label: "快晴" },
  { codes: [116], icon: "🌤️", label: "晴れ" },
  { codes: [119, 122], icon: "☁️", label: "曇り" },
  { codes: [143, 248, 260], icon: "🌫️", label: "霧" },
  { codes: [176, 263, 266, 293, 296, 353], icon: "🌦️", label: "小雨" },
  { codes: [281, 284, 311, 314], icon: "🌧️", label: "着氷性の雨" },
  { codes: [299, 302, 305, 308, 356, 359], icon: "🌧️", label: "雨" },
  { codes: [182, 317, 320, 362, 365], icon: "🌨️", label: "みぞれ" },
  { codes: [200, 386, 389, 392, 395], icon: "⛈️", label: "雷雨" },
  { codes: [227, 230, 323, 326, 329, 332, 335, 338, 350, 368, 371, 374, 377], icon: "❄️", label: "雪" },
];
function describeWttrCode(codeStr){
  const code = parseInt(codeStr, 10);
  const group = WTTR_CODE_GROUPS.find(g => g.codes.includes(code));
  return group ? { icon: group.icon, label: group.label } : { icon: "🌡️", label: "" };
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
    const res = await fetchDirectOrProxied(url, { timeoutMs: FETCH_TIMEOUT_MS });
    const data = await res.json();
    return data.locality || data.city || data.principalSubdivision || null;
  } catch(e){
    console.warn("[weather] 地域名の取得に失敗しました:", e.message);
    return null;
  }
}

const HOURLY_STEP_HOURS = 6; // 6時間おき
const HOURLY_STEPS = 4;      // 6・12・18・24時間後の4つ

// 現在時刻からの経過時間(ms)に最も近いhourlyの時刻インデックスを探す
function nearestHourlyIndex(times, targetMs){
  let best = -1, bestDiff = Infinity;
  times.forEach((t, i) => {
    const diff = Math.abs(new Date(t).getTime() - targetMs);
    if(diff < bestDiff){ bestDiff = diff; best = i; }
  });
  return best;
}

// 現在の気温・天気・降水確率・6時間おき（4つ）の降水確率を取得する
async function fetchForecast(lat, lon){
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,weather_code",
    hourly: "precipitation_probability",
    timezone: "auto",
    forecast_days: "2", // 24時間後まで含めるため2日分取得する
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const res = await fetchDirectOrProxied(url, { timeoutMs: FETCH_TIMEOUT_MS });
  const data = await res.json();
  if(!data.current || typeof data.current.temperature_2m !== "number"){
    throw new Error("invalid forecast response");
  }
  const temp = Math.round(data.current.temperature_2m);
  const { icon, label } = describeWeatherCode(data.current.weather_code);

  const times = data.hourly?.time || [];
  const pops = data.hourly?.precipitation_probability || [];

  // 降水確率は current には含まれないため、hourly から現在時刻に一致（または
  // 最も近い）時刻のポイントを探して拾う
  let pop = null;
  if(times.length && pops.length){
    let idx = times.indexOf(data.current.time);
    if(idx < 0) idx = nearestHourlyIndex(times, Date.now());
    if(typeof pops[idx] === "number") pop = pops[idx];
  }

  // 6時間おき（6・12・18・24時間後）の降水確率
  const hourly6 = [];
  if(times.length && pops.length){
    const nowMs = Date.now();
    for(let step = 1; step <= HOURLY_STEPS; step++){
      const targetMs = nowMs + step * HOURLY_STEP_HOURS * 60 * 60 * 1000;
      const i = nearestHourlyIndex(times, targetMs);
      if(i >= 0 && typeof pops[i] === "number"){
        hourly6.push({ time: times[i], pop: pops[i] });
      }
    }
  }

  // currentTime: この観測値がいつ時点のものか（timezone=autoにより現地時刻の
  // ISO文字列が返る）。表示側で「HH:MM時点」ラベルに使う
  return { temp, icon, label, pop, hourly6, currentTime: data.current.time || null };
}

// wttr.inのweather[]（日ごとの3時間刻み予報）から、Open-Meteoと同じ形式の
// 時刻配列・降水確率配列を組み立てる。各hourly要素のtimeは"0","300",...,
// "2100"のようなHHMM形式の文字列（3時間おき）
function wttrTimesAndPops(weatherDays){
  const times = [], pops = [];
  (weatherDays || []).forEach(day => {
    (day.hourly || []).forEach(h => {
      const t = parseInt(h.time, 10) || 0;
      const hh = String(Math.floor(t / 100)).padStart(2, "0");
      const mm = String(t % 100).padStart(2, "0");
      times.push(`${day.date}T${hh}:${mm}`);
      pops.push(parseInt(h.chanceofrain, 10) || 0);
    });
  });
  return { times, pops };
}

// Open-Meteo（直接fetch＋CORSプロキシ）が軒並み失敗した場合の予備プロバイダ。
// wttr.inは緯度経度を直接パスに指定でき、CORSも許可されている無料API。
// 降水確率は current_condition には含まれないため（temp/天気のみ）、
// weather[].hourly[]（3時間刻み）から現在時刻・6時間おきに最も近い値を
// Open-Meteoと同じロジック（nearestHourlyIndex）で拾う
async function fetchWttrFallback(lat, lon){
  const url = `https://wttr.in/${lat},${lon}?format=j1`;
  const res = await fetchDirectOrProxied(url, { timeoutMs: FETCH_TIMEOUT_MS });
  const data = await res.json();
  const cur = data.current_condition && data.current_condition[0];
  if(!cur || typeof cur.temp_C === "undefined"){
    throw new Error("invalid wttr response");
  }
  const temp = Math.round(parseFloat(cur.temp_C));
  const { icon, label } = describeWttrCode(cur.weatherCode);

  const { times, pops } = wttrTimesAndPops(data.weather);

  let pop = null;
  if(times.length && pops.length){
    const idx = nearestHourlyIndex(times, Date.now());
    if(idx >= 0 && typeof pops[idx] === "number") pop = pops[idx];
  }

  const hourly6 = [];
  if(times.length && pops.length){
    const nowMs = Date.now();
    for(let step = 1; step <= HOURLY_STEPS; step++){
      const targetMs = nowMs + step * HOURLY_STEP_HOURS * 60 * 60 * 1000;
      const i = nearestHourlyIndex(times, targetMs);
      if(i >= 0 && typeof pops[i] === "number"){
        hourly6.push({ time: times[i], pop: pops[i] });
      }
    }
  }

  return { temp, icon, label, pop, hourly6, currentTime: null };
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
    console.warn("[weather] Open-Meteoでの天気取得に失敗しました。予備の天気APIを試します:", e.message);
    try{
      forecast = await fetchWttrFallback(lat, lon);
    } catch(e2){
      console.warn("[weather] 予備の天気APIでも取得に失敗しました:", e2.message);
      return null;
    }
  }

  const city = isDefaultLocation ? DEFAULT_CITY : ((await reverseGeocode(lat, lon)) || "現在地");

  const result = { ...forecast, city, isDefaultLocation };
  saveCache(result);
  return result;
}
