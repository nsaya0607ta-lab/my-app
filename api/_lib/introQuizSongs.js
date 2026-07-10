// 「イントロドン」で出題する曲のマスターデータ。
// サーバー側のこのファイルだけが保持し、フロントエンドには絶対に配列その
// ものを渡さない（渡すのは api/intro-quiz/start.js がシャッフルして作った
// 「選択肢の曲名」と「再生用のvideoId」だけ）。
//
// videoId は下記のダミー値なので、実運用では著作権・利用規約を確認した上で
// 実在のYouTube動画IDに差し替えること。曲を増やす場合はこの配列に追記する
// だけでよい（idは配列内で一意であればよい）。
const INTRO_QUIZ_SONGS = [
  { id: "song001", videoId: "REPLACE_WITH_VIDEO_ID_1", title: "曲名A" },
  { id: "song002", videoId: "REPLACE_WITH_VIDEO_ID_2", title: "曲名B" },
  { id: "song003", videoId: "REPLACE_WITH_VIDEO_ID_3", title: "曲名C" },
  { id: "song004", videoId: "REPLACE_WITH_VIDEO_ID_4", title: "曲名D" },
  { id: "song005", videoId: "REPLACE_WITH_VIDEO_ID_5", title: "曲名E" },
];

module.exports = { INTRO_QUIZ_SONGS };
