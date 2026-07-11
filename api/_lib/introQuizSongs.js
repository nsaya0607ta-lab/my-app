// 「イントロドン」で出題する曲のマスターデータ。
// サーバー側のこのファイルだけが保持し、フロントエンドには絶対に配列その
// ものを渡さない（渡すのは api/intro-quiz/start.js がシャッフルして作った
// 「選択肢の曲名・アーティスト名」と「再生用のvideoId」だけ）。
//
// 動作確認用に、実在する有名曲の公式MVのYouTube動画IDを最初から入れてある
// （2026年7月時点でWeb検索により実在確認済み）。ただし以下の点に注意：
//   ・レーベル側の設定変更により、他サイトへの埋め込み再生（IFrame埋め込み）
//     が後から無効化されるケースがある。videoId は運用中も定期的に
//     再生確認し、無効化されていた曲は差し替えること。
//   ・著作権・利用規約を確認の上、必要に応じて自社で権利関係を把握できる
//     曲に差し替えること。
//   ・曲を増減する場合はこの配列を編集するだけでよい（idは配列内で一意で
//     あればよい）。3択を作るには最低3曲必要（api/intro-quiz/start.js側で
//     3曲未満の場合はイベント自体を発生させない仕様になっている）。
const INTRO_QUIZ_SONGS = [
  { id: "song001", videoId: "ZRtdQ81jPUQ", title: "アイドル", artist: "YOASOBI" },
  { id: "song002", videoId: "SX_ViT4Ra7k", title: "Lemon", artist: "米津玄師" },
  { id: "song003", videoId: "Qp3b-RXtz4w", title: "うっせぇわ", artist: "Ado" },
  { id: "song004", videoId: "x1FV6IrjZCY", title: "紅蓮華", artist: "LiSA" },
  { id: "song005", videoId: "TQ8WlA2GXbk", title: "Pretender", artist: "Official髭男dism" },
];

module.exports = { INTRO_QUIZ_SONGS };
