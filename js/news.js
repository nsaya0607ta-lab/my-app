/* =========================================================================
   ニュース取得の共通処理。
   日本ニュース画面・海外ニュース画面・ホーム画面の「今日のニュース」カードは
   すべてこのモジュールを通してFirestore（window.News、db.js）へアクセスする。
   カテゴリごとにメモリ上へキャッシュし、CACHE_TTL_MS内の再訪問では
   Firestoreへ問い合わせない（画面を行き来しても不要なAPIアクセスを増やさない）。
   ========================================================================= */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5分

const store = {}; // category -> { items, error, fetchedAt, promise }

function entry(category){
  return store[category] || (store[category] = { items: null, error: null, fetchedAt: 0, promise: null });
}

function todayKey(){
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// カテゴリ全件を取得する。TTL内かつforce指定がなければキャッシュを返すだけで
// Firestoreへは問い合わせない。同時に複数箇所（ホーム／ニュース画面）から
// 呼ばれても、進行中のPromiseを共有して実際の取得は1回だけにする
export function fetchNewsCategory(category, { force = false } = {}){
  const e = entry(category);
  if(e.promise) return e.promise;
  if(!force && e.items !== null && (Date.now() - e.fetchedAt) < CACHE_TTL_MS){
    return Promise.resolve(e.items);
  }
  e.promise = (async () => {
    try{
      const rows = window.News ? await window.News.listByCategory(category) : [];
      e.items = rows || [];
      e.error = null;
    }catch(err){
      // 取得済みのデータがあればそのまま残す（一時的な失敗で表示が消えないように）
      e.error = err;
    }finally{
      e.fetchedAt = Date.now();
      e.promise = null;
    }
    return e.items;
  })();
  return e.promise;
}

// 直近の取得結果を同期的に読む。未取得ならitemsはnull
export function getNewsCategoryState(category){
  const e = entry(category);
  return { items: e.items, error: e.error, fetchedAt: e.fetchedAt, loading: !!e.promise };
}

// 管理者がニュースを登録／削除した直後など、明示的に最新化したい場合に使う
export function invalidateNewsCategory(category){
  entry(category).fetchedAt = 0;
}

// 今日の日付のニュースだけを、登録の新しい順に返す（limit指定でその件数まで）
export function todaysNewsForCategory(category, limit){
  const items = entry(category).items || [];
  const key = todayKey();
  const todays = items
    .filter(n => n.dateKey === key)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return typeof limit === "number" ? todays.slice(0, limit) : todays;
}
