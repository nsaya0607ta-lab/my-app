export const L = ["A","B","C","D","E"];

export const IMP_POINTS = {1:15, 2:18, 3:21, 4:24, 5:27}; // 重要度 → 配点
// ▼▼▼ 【新設】IPアドレス計算・変換用の共通ロジック ▼▼▼

export const DC_PHASES = [
  { min:0,  band:"b1", name:"ガレージ期",     note:"プレハブにラックを設置" },
  { min:4,  band:"b2", name:"オンプレ脱却期", note:"空調と配線の整った建物へ" },
  { min:7,  band:"b3", name:"リージョン期",   note:"複数棟のキャンパスに拡張" },
  { min:10, band:"b4", name:"グローバル期",   note:"世界中に拠点が点灯", worldmap:true },
];

export const REGIONS = [
  { name:"東京",        x:270, y:52, lv:10 },
  { name:"シンガポール", x:248, y:80, lv:10 },
  { name:"バージニア",   x:78,  y:50, lv:11 },
  { name:"西ヨーロッパ", x:160, y:40, lv:11 },
  { name:"カリフォルニア", x:38, y:52, lv:12 },
  { name:"シドニー",     x:292, y:106, lv:12 },
  { name:"ブラジル",     x:96,  y:90, lv:12 },
];

export const OVERALL_STEP = 300;
