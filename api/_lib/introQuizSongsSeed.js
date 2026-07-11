// イントロドンの「ダミー曲」フォールバックデータ。
//
// 本番運用では楽曲マスターは Firestore の introQuizSongs コレクションで管理する
// （api/_lib/introQuizSongsRepo.js 参照）。このファイルはそのコレクションが
// 空のとき（初回デプロイ直後など）だけ使われる最終フォールバックであり、
// 動作確認用に実在する有名曲の公式MVのYouTube動画IDを入れてある
// （2026年7月時点でWeb検索により実在確認済み）。
//
// 各フィールドの意味：
//   title        表示・判定に使う正式タイトル
//   artist       アーティスト名
//   videoId      再生用のYouTube動画ID
//   titleKana    判定用のひらがな読み（表記ゆれ吸収の要。カタカナで書いても
//                api/_lib/textMatch.js 側でひらがなに正規化して比較する）
//   titleRomaji  公式のローマ字表記（例："紅蓮華" → "Gurenge"。一般的な変換
//                規則では再現できない固有の表記なので、値として直接持たせる）
//   titleEn      正式な英語表記があれば（無ければ空文字）
//   artistKana / artistRomaji … アーティスト名の読み・ローマ字（将来アーティスト名
//                でも判定したくなった場合の予備。現状の判定ロジックでは未使用）
//   active       出題対象かどうか（埋め込み再生が無効化された曲はfalseにして除外する）
//
// 注意：
//   ・レーベル側の設定変更により、他サイトへの埋め込み再生（IFrame埋め込み）が
//     後から無効化されるケースがある。videoId は運用中も定期的に再生確認し、
//     無効化されていた曲は active:false にするか差し替えること。
//   ・著作権・利用規約を確認の上、必要に応じて自社で権利関係を把握できる曲に
//     差し替えること。
const INTRO_QUIZ_SONGS_SEED = [
  {
    id: "song001", title: "アイドル", artist: "YOASOBI", videoId: "ZRtdQ81jPUQ",
    titleKana: "あいどる", titleRomaji: "Idol", titleEn: "Idol",
    artistKana: "よあそび", artistRomaji: "YOASOBI", active: true,
  },
  {
    id: "song002", title: "Lemon", artist: "米津玄師", videoId: "SX_ViT4Ra7k",
    titleKana: "れもん", titleRomaji: "Lemon", titleEn: "Lemon",
    artistKana: "よねづけんし", artistRomaji: "Kenshi Yonezu", active: true,
  },
  {
    id: "song003", title: "うっせぇわ", artist: "Ado", videoId: "Qp3b-RXtz4w",
    titleKana: "うっせぇわ", titleRomaji: "Usseewa", titleEn: "",
    artistKana: "あど", artistRomaji: "Ado", active: true,
  },
  {
    id: "song004", title: "紅蓮華", artist: "LiSA", videoId: "x1FV6IrjZCY",
    titleKana: "ぐれんげ", titleRomaji: "Gurenge", titleEn: "",
    artistKana: "りさ", artistRomaji: "LiSA", active: true,
  },
  {
    id: "song005", title: "Pretender", artist: "Official髭男dism", videoId: "TQ8WlA2GXbk",
    titleKana: "ぷりてんだー", titleRomaji: "Pretender", titleEn: "Pretender",
    artistKana: "おふぃしゃるひげだんでぃずむ", artistRomaji: "Official HIGE DANdism", active: true,
  },
];

module.exports = { INTRO_QUIZ_SONGS_SEED };
