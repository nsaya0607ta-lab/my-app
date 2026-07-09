/* 設定＞タップ音設定で切り替える効果音のカタログ。
   音源ファイルは使わず、js/audio.jsのWeb Audio APIで都度合成する。
   追加するときはここに1要素足し、js/audio.jsにplay関数を対応させる。 */
export const TAP_SOUND_DATA = [
  { key:"wood",  icon:"🪵", name:"ポポッ",         sub:"木を優しく叩く音（デフォルト）" },
  { key:"drop",  icon:"💧", name:"コトッ",         sub:"静かな水滴の音" },
  { key:"click", icon:"⌨️", name:"プチッ",         sub:"スマート・クリック" },
  { key:"mute",  icon:"🔇", name:"ミュート",       sub:"すべてのボタンを無音にする" },
];
