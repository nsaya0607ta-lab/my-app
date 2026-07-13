/* 設定＞スキン設定で切り替える「UIテーマ（背景の配色）」のカタログ。
   購入不要・端末ローカルの単純な表示設定（js/data/skins.jsの購入制スキンとは別物）。
   追加するときはここに1要素足し、css/style.cssに
   body[data-theme="キー"]{...} のブロックを対応させる。 */
export const UI_THEME_DATA = [
  { key:"default",  icon:"🔵", name:"デフォルト",           sub:"スタイリッシュ・ブルー" },
  { key:"dark",     icon:"🌙", name:"ダーク・モード",        sub:"ミッドナイト" },
  { key:"sakura",   icon:"🌸", name:"サクラ・ピンク",        sub:"和風モダン" },
  { key:"forest",   icon:"🌿", name:"フォレスト・グリーン",  sub:"ナチュラル" },
  { key:"dogcafe",  icon:"🐶", name:"わんこカフェ",         sub:"肉球＆ベージュブラウンのやさしい雰囲気" },
  { key:"catday",   icon:"🐱", name:"ねこ日和",             sub:"猫シルエットの落ち着いたクリームカラー" },
  { key:"dreamsky", icon:"☁️", name:"ゆめかわスカイ",       sub:"雲と虹のふんわりパステルブルー" },
  { key:"wasakura", icon:"🌸", name:"和風さくら",           sub:"桜と和柄の上品な淡いピンク" },
  { key:"galaxy",   icon:"🌌", name:"ギャラクシー",         sub:"星空きらめく幻想的なネイビー" },
];
