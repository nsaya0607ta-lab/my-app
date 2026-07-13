/* 設定＞タップ音設定で切り替える効果音のカタログ。
   音源ファイルは使わず、js/audio.jsのWeb Audio APIで都度合成する。
   追加するときはここに1要素足し、js/audio.jsにplay関数を対応させる。 */
export const TAP_SOUND_DATA = [
  { key:"wood",      icon:"🪵", name:"ポポッ",         sub:"木を優しく叩く音（デフォルト）" },
  { key:"drop",      icon:"💧", name:"コトッ",         sub:"静かな水滴の音" },
  { key:"click",     icon:"⌨️", name:"プチッ",         sub:"スマート・クリック" },
  { key:"mute",      icon:"🔇", name:"ミュート",       sub:"すべてのボタンを無音にする" },
  { key:"bell",      icon:"🔔", name:"ベル",           sub:"軽く綺麗なベル音" },
  { key:"furin",     icon:"🎐", name:"風鈴",           sub:"夏らしい優しい音" },
  { key:"sparkle",   icon:"✨", name:"キラッ",         sub:"ゲーム風の短い効果音" },
  { key:"retrogame", icon:"🎮", name:"レトロゲーム",   sub:"8bit風クリック音" },
  { key:"iphone",    icon:"📱", name:"iPhone風",       sub:"シンプルで心地よいタップ音" },
];
