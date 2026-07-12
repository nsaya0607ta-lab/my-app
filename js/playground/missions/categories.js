/* =========================================================================
   ミッションのカテゴリ定義（表示順・ラベル・アイコン）。
   実際のミッション本体は missions/data/*.js に、カテゴリごとに分けて置く。
   ========================================================================= */

export const MISSION_CATEGORIES = [
  { key:"file-basic",     label:"ファイル・ディレクトリ操作", icon:"🗂️" },
  { key:"file-content",   label:"ファイル内容操作",           icon:"📄" },
  { key:"search",         label:"検索",                       icon:"🔍" },
  { key:"text",           label:"テキスト加工",               icon:"✂️" },
  { key:"permissions",    label:"権限",                       icon:"🔐" },
  { key:"system",         label:"システム",                   icon:"🖥️" },
  { key:"disk",           label:"ディスク",                   icon:"💽" },
  { key:"datetime",       label:"日時",                       icon:"🗓️" },
  { key:"env",            label:"環境変数",                   icon:"🌱" },
  { key:"redirect",       label:"リダイレクト・パイプ",       icon:"🔀" },
  { key:"misc",           label:"その他",                     icon:"🧩" },
];

export const CATEGORY_KEYS = MISSION_CATEGORIES.map(c => c.key);
