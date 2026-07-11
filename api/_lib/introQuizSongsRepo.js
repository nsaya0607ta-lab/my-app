// イントロドンの楽曲マスターへのアクセス層。
//
// 本番の楽曲データは Firestore の introQuizSongs コレクション（1曲＝1ドキュメント）
// で管理し、大量の楽曲を追加・編集してもデプロイ不要で反映できるようにする。
// コレクションが空の場合（初回デプロイ直後など）は動作確認用のダミーデータ
// （introQuizSongsSeed.js）にフォールバックし、機能自体が止まらないようにする。
//
// サーバーレス関数はウォームインスタンス間でモジュールスコープの変数を使い回せる
// ため、簡易的なインメモリキャッシュ（TTL付き）を持たせ、リクエストのたびに
// Firestoreへ読みに行かないようにしている。
const { INTRO_QUIZ_SONGS_SEED } = require("./introQuizSongsSeed");

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { songs: null, fetchedAt: 0 };

async function fetchActiveSongs(db) {
  const now = Date.now();
  if (cache.songs && now - cache.fetchedAt < CACHE_TTL_MS) return cache.songs;

  let songs = [];
  try {
    const snap = await db.collection("introQuizSongs").where("active", "==", true).get();
    songs = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  } catch (e) {
    console.error("introQuizSongsRepo: Firestore fetch failed, falling back to seed data:", e);
  }
  if (!songs.length) songs = INTRO_QUIZ_SONGS_SEED;

  cache = { songs, fetchedAt: now };
  return songs;
}

// 管理画面等でマスターデータを更新した直後に、次のリクエストから最新化したい
// 場合に呼ぶ（現状のAPI群からは未使用。将来の管理APIのために用意）
function invalidateCache() {
  cache = { songs: null, fetchedAt: 0 };
}

// { artist, count } の配列を、五十音（ロケール）順で返す
async function getArtists(db) {
  const songs = await fetchActiveSongs(db);
  const counts = new Map();
  for (const s of songs) {
    if (!s.artist) continue;
    counts.set(s.artist, (counts.get(s.artist) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([artist, count]) => ({ artist, count }))
    .sort((a, b) => a.artist.localeCompare(b.artist, "ja"));
}

// mode:"random" なら全曲から、mode:"artist" なら指定アーティストの曲から
// ランダムに1曲選ぶ。該当曲が無ければ null を返す
async function pickSong(db, { mode, artist } = {}) {
  const songs = await fetchActiveSongs(db);
  const pool = mode === "artist" && artist ? songs.filter((s) => s.artist === artist) : songs;
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = { fetchActiveSongs, getArtists, pickSong, invalidateCache };
