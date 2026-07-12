#!/usr/bin/env node
// YouTube再生リストの中身（動画タイトル・videoId）をYouTube Data API v3で取得し、
// イントロドンの楽曲マスターCSV（scripts/importIntroQuizSongs.js が読み込む形式）
// のたたき台を生成するスクリプト。
//
// タイトル/アーティストの分割は「アーティスト - 曲名」表記のヒューリスティックな
// 推測でしかなく、カナ読み・ローマ字表記はYouTube側の情報からは取得できないため
// 空欄のまま出力する。生成されたCSVは必ず内容を確認・修正してから
// `npm run import:introquiz-songs -- path/to/csv` でインポートすること。
//
// 使い方:
//   YOUTUBE_API_KEY=xxx node scripts/fetchYouTubePlaylist.js <再生リストIDまたはURL> [出力先csv]
//   （もしくは package.json の "fetch:youtube-playlist" スクリプト経由でも実行可）
//
// YouTube Data APIキーの取得方法:
//   1. https://console.cloud.google.com/ でプロジェクトを作成（または既存のものを使う）
//   2. 「APIとサービス」→「ライブラリ」で "YouTube Data API v3" を有効化
//   3. 「認証情報」→「認証情報を作成」→「APIキー」で作成
//      （公開プレイリストの読み取りだけならOAuth同意画面の設定は不要）
//
// 再生リストIDの確認方法:
//   PC版YouTubeでプレイリストを開き、URLの "list=" 以降（"PL" から始まる34文字
//   程度の文字列）をそのまま使う。モバイルアプリの「共有」リンクは途中で
//   切れて渡されることがあるため、疑わしい場合はPC版のURLで確認すること。
const fs = require("fs");
const path = require("path");

const API_BASE = "https://www.googleapis.com/youtube/v3";

function extractPlaylistId(input) {
  if (!input.includes("://")) return input; // 素のIDがそのまま渡された場合
  const url = new URL(input);
  const id = url.searchParams.get("list");
  if (!id) throw new Error(`URLに list= パラメータが見つかりません: ${input}`);
  return id;
}

// 動画タイトルによくある飾り（【MV】(Official Video) 等）を取り除く
const TITLE_NOISE_RE = /[【\[(（]\s*(official\s*(music\s*)?video|official\s*mv|mv|lyric\s*video|music\s*video|audio|4k|hd)\s*[】\])）]/gi;
function cleanTitle(raw) {
  return raw.replace(TITLE_NOISE_RE, "").replace(/\s{2,}/g, " ").trim();
}

// 「アーティスト - 曲名」「曲名 / アーティスト」等のよくある区切りを推測で分割する
// （精度は保証できないため、生成後に必ず目視確認すること）
function guessArtistTitle(rawTitle, channelTitle) {
  const cleaned = cleanTitle(rawTitle);
  const dashMatch = cleaned.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) return { artist: dashMatch[1].trim(), title: dashMatch[2].trim() };
  const slashMatch = cleaned.match(/^(.+?)\s*\/\s*(.+)$/);
  if (slashMatch) return { title: slashMatch[1].trim(), artist: slashMatch[2].trim() };
  return { artist: channelTitle || "", title: cleaned };
}

function csvField(v) {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function fetchAllPlaylistItems(playlistId, apiKey) {
  const items = [];
  let pageToken = "";
  do {
    const url = new URL(`${API_BASE}/playlistItems`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`YouTube API エラー (${res.status}): ${body}`);
    }
    const data = await res.json();
    for (const item of data.items || []) {
      const snippet = item.snippet || {};
      const videoId = snippet.resourceId && snippet.resourceId.videoId;
      if (!videoId) continue;
      // 削除済み・非公開動画は snippet.title が "Private video"/"Deleted video" になる
      if (snippet.title === "Private video" || snippet.title === "Deleted video") continue;
      items.push({
        videoId,
        rawTitle: snippet.title || "",
        channelTitle: snippet.videoOwnerChannelTitle || snippet.channelTitle || "",
      });
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return items;
}

async function main() {
  const [, , playlistArg, outArg] = process.argv;
  if (!playlistArg) {
    console.error("使い方: YOUTUBE_API_KEY=xxx node scripts/fetchYouTubePlaylist.js <再生リストIDまたはURL> [出力先csv]");
    process.exit(1);
  }
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error("環境変数 YOUTUBE_API_KEY が設定されていません。");
    process.exit(1);
  }

  const playlistId = extractPlaylistId(playlistArg);
  const outPath = path.resolve(outArg || `scripts/playlist-${playlistId}.csv`);

  console.log(`プレイリスト ${playlistId} を取得しています…`);
  const items = await fetchAllPlaylistItems(playlistId, apiKey);
  if (!items.length) {
    console.error("動画が1件も取得できませんでした（プレイリストIDや公開設定を確認してください）。");
    process.exit(1);
  }

  const header = ["id", "title", "artist", "videoId", "titleKana", "titleRomaji", "titleEn", "artistKana", "artistRomaji", "active"];
  const lines = [header.join(",")];
  items.forEach((item) => {
    const { artist, title } = guessArtistTitle(item.rawTitle, item.channelTitle);
    // idはvideoIdをそのまま使う（プレイリストへの曲追加・並べ替え後に再取得しても
    // 既存曲のドキュメントIDがぶれず、importIntroQuizSongs.js のmerge:trueで
    // 正しく同じ曲として上書き更新できるようにするため）
    lines.push([`yt_${item.videoId}`, title, artist, item.videoId, "", "", "", "", "", "TRUE"].map(csvField).join(","));
  });

  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  console.log(`✅ ${items.length}件を書き出しました: ${outPath}`);
  console.log("⚠️  title/artistの分割は推測です。titleKana等の読み仮名とあわせて内容を必ず確認・修正してから");
  console.log(`   npm run import:introquiz-songs -- ${path.relative(process.cwd(), outPath)}`);
  console.log("   でFirestoreへ反映してください。");
}

main().catch((e) => {
  console.error("取得に失敗しました:", e.message || e);
  process.exit(1);
});
