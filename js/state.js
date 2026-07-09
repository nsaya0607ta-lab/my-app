// 状態オブジェクト
export const S = {
  screen:"select", cert:null, mode:"exam", coins:0,
  currentSkin:"default",       // 現在適用中のスキン
  ownedSkins:["default"],      // 購入済みスキンのリスト
  deck:[], idx:0, picks:[], sel:[], revealed:false, last:null,
  commandCmd:null,             // コマンド別演習中に選択中のコマンド（例："grep"）。通常演習/試験ではnull
  newsDetail:null,             // ニュース詳細画面に表示中の項目（{title,content,dateKey,label,icon,returnScreen}）
};

export const state = {
  practicePick:false,
  historyTab:"all",       // 履歴タブ: all | practice | exam | review
  rankingTab:"overall",   // ランキングタブ: overall | 資格id（例：az900）
  db:null, currentUserId:null, currentUser:null,
  authReady:false, guestMode:false, authMode:"signup", authBusy:false,
  cloudData:null, profileChecked:false,
  unsub:null, lbAutoDone:false,
};
