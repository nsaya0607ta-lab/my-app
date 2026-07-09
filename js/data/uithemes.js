/* 設定＞スキン設定で切り替える「UIテーマ（背景の配色）」のカタログ。
   購入不要・端末ローカルの単純な表示設定（js/data/skins.jsの購入制スキンとは別物）。
   追加するときはここに1要素足し、css/style.cssに
   body[data-theme="キー"]{...} のブロックを対応させる。 */
export const UI_THEME_DATA = [
  { key:"default", icon:"🔵", name:"デフォルト",           sub:"スタイリッシュ・ブルー" },
  { key:"dark",    icon:"🌙", name:"ダーク・モード",        sub:"ミッドナイト" },
  { key:"sakura",  icon:"🌸", name:"サクラ・ピンク",        sub:"和風モダン" },
  { key:"forest",  icon:"🌿", name:"フォレスト・グリーン",  sub:"ナチュラル" },
];
