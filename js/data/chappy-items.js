/* =========================================================================
   🏠 チャッピーハウス：モノのカタログ
   家具／お部屋テーマ／壁紙・床・窓・カーテン・照明／衣装・帽子・
   アクセサリー・メガネ・くつ／背景 と、それらを引けるガチャの設定。

   ・price が数値ならショップで買える。null のものはガチャ限定。
   ・event が入っているものは、その季節イベント開催中だけ手に入る限定品。
   ・rarity は "n" | "r" | "sr" | "ssr"。演出とソート順に使う。
   ・cute（可愛さ）と comfort（快適度）はお部屋の「おしゃれ」「居心地」に効く。
   ========================================================================= */

export const CHAPPY_RARITY = {
  n:   { key: "n",   label: "ノーマル", star: 1, color: "#9fb8cf" },
  r:   { key: "r",   label: "レア",     star: 2, color: "#6fb6e6" },
  sr:  { key: "sr",  label: "スーパーレア", star: 3, color: "#c69bea" },
  ssr: { key: "ssr", label: "ウルトラレア", star: 4, color: "#f2b846" },
};

export const CHAPPY_RARITY_ORDER = ["ssr", "sr", "r", "n"];

/* =========================================================================
   家具（置くとお部屋が可愛く・居心地よくなる）
   place: floor（床置き）／wall（壁掛け）／hang（吊るす）
   act:   チャッピーがこの家具を使ってする行動のID（js/data/chappy-quests.js）
   ========================================================================= */
export const CHAPPY_FURNITURE = [
  // ---- 基本の家具（ショップ） ----
  { id: "bed",       name: "ふかふかベッド", icon: "🛏️", place: "floor", cute: 3, comfort: 5, rarity: "r",  price: 220, act: "sleep",   desc: "チャッピーがぐっすり眠れる" },
  { id: "sofa",      name: "まるいソファ",   icon: "🛋️", place: "floor", cute: 3, comfort: 4, rarity: "r",  price: 200, act: "relax",   desc: "だらーんとくつろげる" },
  { id: "bookshelf", name: "本だな",         icon: "📚", place: "floor", cute: 2, comfort: 2, rarity: "n",  price: 120, act: "read",    desc: "読書がすきになる" },
  { id: "tv",        name: "テレビ",         icon: "📺", place: "floor", cute: 2, comfort: 3, rarity: "r",  price: 260, act: "tv",      desc: "ぼーっと見ちゃう" },
  { id: "plant",     name: "観葉植物",       icon: "🪴", place: "floor", cute: 3, comfort: 2, rarity: "n",  price: 90,  act: "water",   desc: "お部屋の空気がやさしくなる" },
  { id: "rug",       name: "ふわふわラグ",   icon: "🟣", place: "floor", cute: 3, comfort: 3, rarity: "n",  price: 110, act: "roll",    desc: "ころころ転がりたくなる" },
  { id: "clock",     name: "かけ時計",       icon: "🕰️", place: "wall",  cute: 2, comfort: 1, rarity: "n",  price: 80,               desc: "時間がわかって安心" },
  { id: "kitchen",   name: "ミニキッチン",   icon: "🍳", place: "floor", cute: 3, comfort: 4, rarity: "sr", price: 480, act: "cook",    desc: "おりょうりができる" },
  { id: "table",     name: "まるテーブル",   icon: "🪑", place: "floor", cute: 2, comfort: 3, rarity: "n",  price: 140, act: "eat",     desc: "ごはんがおいしくなる" },
  { id: "pc",        name: "パソコン",       icon: "💻", place: "floor", cute: 2, comfort: 3, rarity: "r",  price: 320, act: "study",   desc: "おべんきょうがはかどる" },
  { id: "game",      name: "ゲーム機",       icon: "🎮", place: "floor", cute: 3, comfort: 4, rarity: "r",  price: 300, act: "game",    desc: "たのしさがぐんぐん上がる" },
  { id: "aquarium",  name: "水そう",         icon: "🐠", place: "floor", cute: 4, comfort: 4, rarity: "sr", price: 560, act: "fish",    desc: "ゆらゆら眺めて癒される" },
  { id: "lamp",      name: "まるランプ",     icon: "💡", place: "floor", cute: 3, comfort: 3, rarity: "n",  price: 130,              desc: "夜のお部屋がやわらかく光る" },
  { id: "flower",    name: "おはなの花びん", icon: "💐", place: "floor", cute: 4, comfort: 2, rarity: "r",  price: 180, act: "smell",   desc: "いいにおいがする" },
  { id: "cushion",   name: "クッション",     icon: "🧸", place: "floor", cute: 4, comfort: 3, rarity: "n",  price: 100, act: "hug",     desc: "ぎゅっと抱きしめたくなる" },
  { id: "desk",      name: "べんきょう机",   icon: "🗒️", place: "floor", cute: 2, comfort: 2, rarity: "n",  price: 150, act: "study",   desc: "勉強スイッチが入る" },
  { id: "mirror",    name: "すがた見",       icon: "🪞", place: "wall",  cute: 3, comfort: 1, rarity: "r",  price: 190, act: "dressup", desc: "おしゃれチェックできる" },
  { id: "painting",  name: "かべの絵",       icon: "🖼️", place: "wall",  cute: 3, comfort: 2, rarity: "r",  price: 210,              desc: "お部屋がギャラリーみたい" },
  { id: "guitar",    name: "ミニギター",     icon: "🎸", place: "floor", cute: 3, comfort: 2, rarity: "r",  price: 280, act: "music",   desc: "ぽろんと弾いてくれる" },
  { id: "bath",      name: "ひのきのおふろ", icon: "🛁", place: "floor", cute: 3, comfort: 5, rarity: "sr", price: 520, act: "bath",    desc: "せいけつがぐんと上がる" },
  { id: "mobile",    name: "つりさげモビール", icon: "🎐", place: "hang", cute: 4, comfort: 2, rarity: "r", price: 230,              desc: "ゆらゆら揺れてかわいい" },
  { id: "garland",   name: "ガーランド",     icon: "🎏", place: "hang",  cute: 3, comfort: 1, rarity: "n",  price: 120,              desc: "お部屋がぱっと華やぐ" },

  // ---- ガチャ限定（家具ガチャ） ----
  { id: "piano",     name: "こびとピアノ",   icon: "🎹", place: "floor", cute: 4, comfort: 4, rarity: "sr", price: null, act: "music",  desc: "夜にそっと弾いてくれる" },
  { id: "telescope", name: "ほしぞら望遠鏡", icon: "🔭", place: "floor", cute: 4, comfort: 3, rarity: "sr", price: null, act: "star",   desc: "流れ星が見つけやすくなる" },
  { id: "hammock",   name: "ハンモック",     icon: "🪢", place: "floor", cute: 4, comfort: 5, rarity: "sr", price: null, act: "nap",    desc: "おひるねが最高になる" },
  { id: "fountain",  name: "ちいさな噴水",   icon: "⛲", place: "floor", cute: 5, comfort: 4, rarity: "ssr",price: null, act: "water",  desc: "水の音でストレスがすーっと引く" },
  { id: "cloudbed",  name: "くもベッド",     icon: "☁️", place: "floor", cute: 5, comfort: 5, rarity: "ssr",price: null, act: "sleep",  desc: "ふわふわで夢見ごこち" },
  { id: "rainbow",   name: "にじのアーチ",   icon: "🌈", place: "hang",  cute: 5, comfort: 3, rarity: "ssr",price: null,               desc: "見るたび元気になれる" },
  { id: "catbed",    name: "ねこハウス",     icon: "🏡", place: "floor", cute: 4, comfort: 4, rarity: "sr", price: null, act: "nap",    desc: "ときどきお客さんが来るかも" },
  { id: "popcorn",   name: "ポップコーン機", icon: "🍿", place: "floor", cute: 4, comfort: 3, rarity: "r",  price: null, act: "snack",  desc: "映画のじかんがたのしくなる" },

  // ---- 季節イベント限定 ----
  { id: "sakura",    name: "さくらの木",     icon: "🌸", place: "floor", cute: 5, comfort: 3, rarity: "sr", price: null, event: "spring", act: "hanami", desc: "春だけのおはなみスポット" },
  { id: "koinobori", name: "こいのぼり",     icon: "🎏", place: "hang",  cute: 4, comfort: 2, rarity: "r",  price: null, event: "spring", desc: "風にゆられて泳ぐ" },
  { id: "hanabi",    name: "打ち上げ花火",   icon: "🎆", place: "wall",  cute: 5, comfort: 3, rarity: "sr", price: null, event: "summer", act: "hanabi", desc: "夜になるとぱっと開く" },
  { id: "surfboard", name: "サーフボード",   icon: "🏄", place: "floor", cute: 4, comfort: 2, rarity: "r",  price: null, event: "summer", act: "surf",   desc: "海のきぶんになれる" },
  { id: "watermelon",name: "すいか",         icon: "🍉", place: "floor", cute: 4, comfort: 2, rarity: "n",  price: null, event: "summer", act: "snack",  desc: "夏のごちそう" },
  { id: "momiji",    name: "もみじの盆栽",   icon: "🍁", place: "floor", cute: 4, comfort: 3, rarity: "r",  price: null, event: "autumn", act: "smell",  desc: "秋のいろどり" },
  { id: "pumpkin",   name: "かぼちゃランタン", icon: "🎃", place: "floor", cute: 4, comfort: 2, rarity: "sr", price: null, event: "autumn", act: "spook", desc: "夜にぼうっと光る" },
  { id: "kotatsu",   name: "こたつ",         icon: "🔥", place: "floor", cute: 4, comfort: 5, rarity: "sr", price: null, event: "winter", act: "kotatsu",desc: "一度入ると出られない" },
  { id: "xmastree",  name: "クリスマスツリー", icon: "🎄", place: "floor", cute: 5, comfort: 3, rarity: "ssr", price: null, event: "winter", act: "xmas", desc: "12月だけのきらきら" },
  { id: "snowman",   name: "ゆきだるま",     icon: "⛄", place: "floor", cute: 4, comfort: 2, rarity: "r",  price: null, event: "winter", act: "snow",   desc: "とけないように作った" },
];

export const CHAPPY_FURNITURE_BY_ID = Object.fromEntries(CHAPPY_FURNITURE.map(f => [f.id, f]));

/* =========================================================================
   お部屋テーマ（壁と床の雰囲気をまとめて変える）
   wall / floor は CSS グラデーション。accent は小物の色に使う。
   ========================================================================= */
export const CHAPPY_THEMES = [
  { id: "plain",  name: "ふつうのおへや", icon: "🏠", reqRoomLv: 1, price: 0,
    wall: "linear-gradient(180deg,#dff2fd,#eef9ff)", floor: "linear-gradient(180deg,#fdeee2,#fbe3d4)", accent: "#7cc7f0" },
  { id: "wa",     name: "和風",   icon: "🎋", reqRoomLv: 3, price: 300,
    wall: "linear-gradient(180deg,#f3ecdc,#faf5e9)", floor: "linear-gradient(180deg,#e2d4b4,#d6c39c)", accent: "#c2703f" },
  { id: "nordic", name: "北欧",   icon: "🧶", reqRoomLv: 3, price: 300,
    wall: "linear-gradient(180deg,#eef1f4,#f8fafc)", floor: "linear-gradient(180deg,#f0dcc4,#e3c8a8)", accent: "#8fb0c9" },
  { id: "cafe",   name: "カフェ", icon: "☕", reqRoomLv: 3, price: 380,
    wall: "linear-gradient(180deg,#efe1d2,#f8efe4)", floor: "linear-gradient(180deg,#c99a6d,#b5875b)", accent: "#a4703f" },
  { id: "star",   name: "星空",   icon: "🌌", reqRoomLv: 8, price: 900,
    wall: "linear-gradient(180deg,#2b3568,#4a4d86)", floor: "linear-gradient(180deg,#3c3c68,#2f2f56)", accent: "#f7d774", starry: true },
  { id: "sea",    name: "海",     icon: "🌊", reqRoomLv: 8, price: 900,
    wall: "linear-gradient(180deg,#bfe9f7,#dff6fd)", floor: "linear-gradient(180deg,#f6e6c3,#efd9ad)", accent: "#3fa9d6" },
  { id: "forest", name: "森",     icon: "🌲", reqRoomLv: 8, price: 900,
    wall: "linear-gradient(180deg,#d8ecd6,#eef7ec)", floor: "linear-gradient(180deg,#c7b394,#b39d7d)", accent: "#5d9a63" },
];

export const CHAPPY_THEME_BY_ID = Object.fromEntries(CHAPPY_THEMES.map(t => [t.id, t]));

/* =========================================================================
   内装パーツ（壁紙・床・窓・カーテン・照明）
   cat ごとに別カテゴリとして扱い、部屋レベルで解放される。
   ========================================================================= */
export const CHAPPY_DECOR = [
  // 壁紙
  { id: "wp-plain",  cat: "wallpaper", name: "むじ",         icon: "⬜", price: 0,   cute: 0, css: "" },
  { id: "wp-dot",    cat: "wallpaper", name: "みずたま",     icon: "⚪", price: 120, cute: 2, css: "radial-gradient(circle,rgba(255,255,255,.75) 2.4px,transparent 2.6px) 0 0/22px 22px" },
  { id: "wp-stripe", cat: "wallpaper", name: "ストライプ",   icon: "📏", price: 120, cute: 2, css: "repeating-linear-gradient(90deg,rgba(255,255,255,.5) 0 10px,transparent 10px 22px)" },
  { id: "wp-heart",  cat: "wallpaper", name: "ハート",       icon: "💗", price: 220, cute: 3, css: "radial-gradient(circle at 50% 45%,rgba(251,208,218,.85) 3px,transparent 3.2px) 0 0/28px 28px" },
  { id: "wp-star",   cat: "wallpaper", name: "スター",       icon: "⭐", price: 260, cute: 3, css: "radial-gradient(circle,rgba(247,215,116,.9) 2.2px,transparent 2.4px) 0 0/26px 26px" },
  { id: "wp-check",  cat: "wallpaper", name: "チェック",     icon: "🧇", price: 200, cute: 2, css: "repeating-linear-gradient(90deg,rgba(255,255,255,.4) 0 12px,transparent 12px 24px),repeating-linear-gradient(0deg,rgba(255,255,255,.4) 0 12px,transparent 12px 24px)" },

  // 床
  { id: "fl-plain",  cat: "floor", name: "むじ",       icon: "⬜", price: 0,   cute: 0, css: "" },
  { id: "fl-wood",   cat: "floor", name: "フローリング", icon: "🪵", price: 140, cute: 1, css: "repeating-linear-gradient(90deg,rgba(0,0,0,.05) 0 1px,transparent 1px 34px)" },
  { id: "fl-tatami", cat: "floor", name: "たたみ",     icon: "🟩", price: 200, cute: 2, css: "repeating-linear-gradient(0deg,rgba(120,150,90,.18) 0 2px,transparent 2px 18px)" },
  { id: "fl-tile",   cat: "floor", name: "タイル",     icon: "🔲", price: 200, cute: 2, css: "repeating-linear-gradient(90deg,rgba(255,255,255,.35) 0 1px,transparent 1px 26px),repeating-linear-gradient(0deg,rgba(255,255,255,.35) 0 1px,transparent 1px 26px)" },
  { id: "fl-carpet", cat: "floor", name: "カーペット", icon: "🧶", price: 260, cute: 3, css: "radial-gradient(circle,rgba(255,255,255,.3) 1.6px,transparent 1.8px) 0 0/9px 9px" },

  // 窓
  { id: "wd-round",  cat: "window", name: "まる窓",     icon: "🪟", price: 0,   cute: 1, shape: "round" },
  { id: "wd-square", cat: "window", name: "四角い窓",   icon: "🔳", price: 160, cute: 1, shape: "square" },
  { id: "wd-arch",   cat: "window", name: "アーチ窓",   icon: "⛪", price: 300, cute: 3, shape: "arch" },
  { id: "wd-bay",    cat: "window", name: "出窓",       icon: "🏵️", price: 420, cute: 4, shape: "bay" },

  // カーテン
  { id: "ct-none",   cat: "curtain", name: "なし",     icon: "🚫", price: 0,   cute: 0, color: null },
  { id: "ct-cream",  cat: "curtain", name: "クリーム", icon: "🟡", price: 140, cute: 2, color: "#ffeec9" },
  { id: "ct-sky",    cat: "curtain", name: "そらいろ", icon: "🔵", price: 140, cute: 2, color: "#bfe6fb" },
  { id: "ct-pink",   cat: "curtain", name: "ももいろ", icon: "🩷", price: 180, cute: 3, color: "#fbd0da" },
  { id: "ct-lace",   cat: "curtain", name: "レース",   icon: "🕸️", price: 320, cute: 4, color: "rgba(255,255,255,.85)" },

  // 照明
  { id: "lt-plain",  cat: "light", name: "ふつう",       icon: "💡", price: 0,   cute: 0, glow: null },
  { id: "lt-warm",   cat: "light", name: "あたたかい光", icon: "🕯️", price: 200, cute: 2, glow: "rgba(255,214,150,.42)" },
  { id: "lt-cool",   cat: "light", name: "すずしい光",   icon: "❄️", price: 200, cute: 2, glow: "rgba(180,222,255,.42)" },
  { id: "lt-fairy",  cat: "light", name: "フェアリー",   icon: "🧚", price: 420, cute: 4, glow: "rgba(255,196,232,.45)", sparkle: true },
  { id: "lt-lantern",cat: "light", name: "ちょうちん",   icon: "🏮", price: 380, cute: 3, glow: "rgba(255,150,120,.42)" },
];

export const CHAPPY_DECOR_BY_ID = Object.fromEntries(CHAPPY_DECOR.map(d => [d.id, d]));
export const CHAPPY_DECOR_CATS = [
  { key: "wallpaper", label: "壁紙",     icon: "🧱" },
  { key: "floor",     label: "床",       icon: "🪵" },
  { key: "window",    label: "窓",       icon: "🪟" },
  { key: "curtain",   label: "カーテン", icon: "🪞" },
  { key: "light",     label: "照明",     icon: "💡" },
];

// 内装パーツの初期装備（未購入でも必ず選べるもの）
export const CHAPPY_DECOR_DEFAULTS = {
  wallpaper: "wp-plain", floor: "fl-plain", window: "wd-round", curtain: "ct-none", light: "lt-plain",
};

/* =========================================================================
   着せ替え（衣装・帽子・アクセサリー・メガネ・くつ）
   slot ごとに1つだけ装備できる。cute はおしゃれ度に効く。
   ========================================================================= */
export const CHAPPY_WEAR = [
  // ---- 衣装 ----
  { id: "w-none",     slot: "outfit", name: "はだかんぼ",   icon: "🤍", price: 0,   cute: 0, rarity: "n" },
  { id: "w-pajama",   slot: "outfit", name: "パジャマ",     icon: "🌙", price: 150, cute: 3, rarity: "n",  color: "#cfe4ff", desc: "夜に着ると睡眠が上がりやすい", bonus: { sleep: 1 } },
  { id: "w-uniform",  slot: "outfit", name: "制服",         icon: "🎒", price: 260, cute: 3, rarity: "r",  color: "#9fb8d8", desc: "勉強のやる気が出る",         bonus: { study: 1 } },
  { id: "w-hoodie",   slot: "outfit", name: "パーカー",     icon: "🧥", price: 220, cute: 3, rarity: "n",  color: "#f6c9a8", desc: "らくちんでごきげん" },
  { id: "w-suit",     slot: "outfit", name: "スーツ",       icon: "👔", price: 340, cute: 3, rarity: "r",  color: "#5f6f88", desc: "きりっと大人っぽく" },
  { id: "w-summer",   slot: "outfit", name: "夏服",         icon: "🩳", price: 200, cute: 3, rarity: "n",  color: "#bfe6fb", desc: "夏はすずしい" },
  { id: "w-winter",   slot: "outfit", name: "冬服",         icon: "🧣", price: 200, cute: 3, rarity: "n",  color: "#e8c8d4", desc: "冬はあったかい" },
  { id: "w-raincoat", slot: "outfit", name: "レインコート", icon: "🌧️", price: 280, cute: 3, rarity: "r",  color: "#ffe28a", desc: "雨の日がすきになる" },
  { id: "w-santa",    slot: "outfit", name: "サンタ",       icon: "🎅", price: null, cute: 5, rarity: "ssr", color: "#e56b6b", event: "winter", desc: "冬イベント限定" },
  { id: "w-halloween",slot: "outfit", name: "ハロウィン",   icon: "🧛", price: null, cute: 5, rarity: "sr",  color: "#8a6fb0", event: "autumn", desc: "秋イベント限定" },
  { id: "w-kigurumi", slot: "outfit", name: "着ぐるみ",     icon: "🐻", price: null, cute: 5, rarity: "ssr", color: "#dbb28a", desc: "もこもこで最強にかわいい", bonus: { fun: 1 } },
  { id: "w-yukata",   slot: "outfit", name: "ゆかた",       icon: "🎐", price: null, cute: 5, rarity: "sr",  color: "#a8d8e8", event: "summer", desc: "夏イベント限定" },
  { id: "w-hakama",   slot: "outfit", name: "はかま",       icon: "🎍", price: null, cute: 4, rarity: "sr",  color: "#c46b7f", event: "spring", desc: "春イベント限定" },
  { id: "w-labcoat",  slot: "outfit", name: "はくい",       icon: "🥼", price: 400, cute: 3, rarity: "r",   color: "#f2f6fa", desc: "けんきゅう者きぶん",       bonus: { study: 1 } },

  // ---- 帽子 ----
  { id: "h-none",     slot: "hat", name: "なし",         icon: "🚫", price: 0,   cute: 0, rarity: "n" },
  { id: "h-cap",      slot: "hat", name: "キャップ",     icon: "🧢", price: 120, cute: 2, rarity: "n" },
  { id: "h-straw",    slot: "hat", name: "むぎわら帽子", icon: "👒", price: 160, cute: 3, rarity: "n" },
  { id: "h-beret",    slot: "hat", name: "ベレー帽",     icon: "🎨", price: 200, cute: 3, rarity: "r" },
  { id: "h-crown",    slot: "hat", name: "おうかん",     icon: "👑", price: null, cute: 5, rarity: "ssr", desc: "がんばった証" },
  { id: "h-ribbon",   slot: "hat", name: "おおきなリボン", icon: "🎀", price: 240, cute: 4, rarity: "r" },
  { id: "h-santahat", slot: "hat", name: "サンタ帽",     icon: "🎄", price: null, cute: 4, rarity: "sr", event: "winter" },
  { id: "h-flower",   slot: "hat", name: "花かんむり",   icon: "🌷", price: null, cute: 4, rarity: "sr", event: "spring" },

  // ---- アクセサリー ----
  { id: "a-none",     slot: "acc", name: "なし",       icon: "🚫", price: 0,   cute: 0, rarity: "n" },
  { id: "a-scarf",    slot: "acc", name: "マフラー",   icon: "🧣", price: 150, cute: 3, rarity: "n" },
  { id: "a-bowtie",   slot: "acc", name: "ちょうネクタイ", icon: "🎗️", price: 170, cute: 3, rarity: "r" },
  { id: "a-necklace", slot: "acc", name: "ほしのネックレス", icon: "⭐", price: 300, cute: 4, rarity: "r" },
  { id: "a-wings",    slot: "acc", name: "ちいさな羽",  icon: "🪽", price: null, cute: 5, rarity: "ssr" },
  { id: "a-backpack", slot: "acc", name: "リュック",   icon: "🎒", price: 200, cute: 3, rarity: "n" },
  { id: "a-bell",     slot: "acc", name: "すず",       icon: "🔔", price: 180, cute: 3, rarity: "r" },

  // ---- メガネ ----
  { id: "g-none",     slot: "glasses", name: "なし",       icon: "🚫", price: 0,   cute: 0, rarity: "n" },
  { id: "g-round",    slot: "glasses", name: "まるメガネ", icon: "👓", price: 160, cute: 3, rarity: "n",  bonus: { study: 1 } },
  { id: "g-sun",      slot: "glasses", name: "サングラス", icon: "🕶️", price: 220, cute: 3, rarity: "r" },
  { id: "g-heart",    slot: "glasses", name: "ハートめがね", icon: "😍", price: null, cute: 4, rarity: "sr" },
  { id: "g-goggle",   slot: "glasses", name: "ゴーグル",   icon: "🥽", price: 240, cute: 3, rarity: "r" },

  // ---- くつ ----
  { id: "s-none",     slot: "shoes", name: "はだし",     icon: "🚫", price: 0,   cute: 0, rarity: "n" },
  { id: "s-sneaker",  slot: "shoes", name: "スニーカー", icon: "👟", price: 140, cute: 2, rarity: "n" },
  { id: "s-boots",    slot: "shoes", name: "ブーツ",     icon: "🥾", price: 200, cute: 3, rarity: "r" },
  { id: "s-sandal",   slot: "shoes", name: "サンダル",   icon: "🩴", price: 120, cute: 2, rarity: "n" },
  { id: "s-glass",    slot: "shoes", name: "ガラスのくつ", icon: "🥿", price: null, cute: 5, rarity: "ssr" },
  { id: "s-rain",     slot: "shoes", name: "長ぐつ",     icon: "🌂", price: 160, cute: 3, rarity: "n" },
];

export const CHAPPY_WEAR_BY_ID = Object.fromEntries(CHAPPY_WEAR.map(w => [w.id, w]));

export const CHAPPY_WEAR_SLOTS = [
  { key: "outfit",  label: "衣装",         icon: "👕", none: "w-none" },
  { key: "hat",     label: "帽子",         icon: "🧢", none: "h-none" },
  { key: "acc",     label: "アクセサリー", icon: "🎗️", none: "a-none" },
  { key: "glasses", label: "メガネ",       icon: "👓", none: "g-none" },
  { key: "shoes",   label: "くつ",         icon: "👟", none: "s-none" },
];

// 初期装備（コインを払わずに最初から着られる）
export const CHAPPY_WEAR_DEFAULTS = { outfit: "w-none", hat: "h-none", acc: "a-none", glasses: "g-none", shoes: "s-none" };

/* =========================================================================
   背景（お部屋の外・窓の向こうに見える景色）
   ========================================================================= */
export const CHAPPY_BACKGROUNDS = [
  { id: "bg-town",    name: "しずかな町", icon: "🏘️", price: 0,    rarity: "n",   sky: "linear-gradient(180deg,#cfeaff,#eaf7ff)" },
  { id: "bg-hill",    name: "みどりの丘", icon: "⛰️", price: 260,  rarity: "n",   sky: "linear-gradient(180deg,#cdeeff,#e7f7e4)" },
  { id: "bg-sea",     name: "うみべ",     icon: "🏖️", price: 320,  rarity: "r",   sky: "linear-gradient(180deg,#bfe9f7,#dff6fd)" },
  { id: "bg-night",   name: "よぞら",     icon: "🌙", price: 380,  rarity: "r",   sky: "linear-gradient(180deg,#2c3563,#4b4f88)", starry: true },
  { id: "bg-sakura",  name: "さくら並木", icon: "🌸", price: null, rarity: "sr",  event: "spring", sky: "linear-gradient(180deg,#ffe3ef,#fff2f7)" },
  { id: "bg-hanabi",  name: "花火大会",   icon: "🎆", price: null, rarity: "sr",  event: "summer", sky: "linear-gradient(180deg,#2b2f5c,#4a3f6e)" },
  { id: "bg-momiji",  name: "紅葉の山",   icon: "🍁", price: null, rarity: "sr",  event: "autumn", sky: "linear-gradient(180deg,#ffe0c2,#fff1e0)" },
  { id: "bg-snow",    name: "ゆきげしき", icon: "❄️", price: null, rarity: "sr",  event: "winter", sky: "linear-gradient(180deg,#dbe9f7,#f3f9ff)" },
  { id: "bg-galaxy",  name: "うちゅう",   icon: "🌌", price: null, rarity: "ssr", sky: "linear-gradient(180deg,#191b3a,#3a2f5e)", starry: true },
  { id: "bg-aurora",  name: "オーロラ",   icon: "🌠", price: null, rarity: "ssr", sky: "linear-gradient(180deg,#173a4d,#2b6b62)", starry: true },
];

export const CHAPPY_BACKGROUND_BY_ID = Object.fromEntries(CHAPPY_BACKGROUNDS.map(b => [b.id, b]));

/* =========================================================================
   ガチャ
   ・cost はコイン。ticket を持っていれば1回ぶんコインの代わりに使える。
   ・weights はレアリティの排出率（合計100）。
   ・すでに持っているものが出たら、レアリティに応じてコインへ変換される。
   ========================================================================= */
export const CHAPPY_GACHA = [
  { key: "furniture", name: "かぐガチャ",   icon: "🪑", cost: 120, ticket: "furniture",
    weights: { n: 55, r: 32, sr: 11, ssr: 2 }, desc: "お部屋に置ける家具が出るよ" },
  { key: "costume",   name: "いしょうガチャ", icon: "👗", cost: 120, ticket: "costume",
    weights: { n: 55, r: 32, sr: 11, ssr: 2 }, desc: "衣装・帽子・小物が出るよ" },
  { key: "background",name: "はいけいガチャ", icon: "🌄", cost: 200, ticket: "background",
    weights: { n: 45, r: 35, sr: 16, ssr: 4 }, desc: "窓の向こうの景色が出るよ" },
  { key: "event",     name: "イベントガチャ", icon: "🎪", cost: 180, ticket: "event", eventOnly: true,
    weights: { n: 40, r: 35, sr: 20, ssr: 5 }, desc: "開催中のイベント限定品が出るよ" },
];

export const CHAPPY_GACHA_BY_KEY = Object.fromEntries(CHAPPY_GACHA.map(g => [g.key, g]));

// ダブったときの返金額（コイン）
export const CHAPPY_DUPE_COINS = { n: 20, r: 45, sr: 110, ssr: 260 };

// 10連まわしたときの割引率（10回ぶんのコインを9回ぶんにする）
export const CHAPPY_GACHA_TEN_DISCOUNT = 0.9;
