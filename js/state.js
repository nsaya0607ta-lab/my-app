// 状態オブジェクト
export const S = {
  screen:"select", cert:null, mode:"exam", coins:0,
  currentSkin:"default",       // 現在適用中のスキン
  ownedSkins:["default"],      // 購入済みスキンのリスト
  uiTheme:"default",           // 設定＞スキン設定で切り替えるUIテーマ（default/dark/sakura/forest）
  tapSound:"wood",             // 設定＞タップ音設定で切り替える効果音（wood/drop/click/mute）
  deck:[], idx:0, picks:[], sel:[], revealed:false, last:null,
  qTimes:[], qShownAt:0,       // 出題ごとの回答時間（秒）と現在の問題の表示時刻（AIおすすめ復習用）
  commandCmd:null,             // コマンド別演習中に選択中のコマンド（例："grep"）。通常演習/試験ではnull
  markedRun:false,             // 「後で見直す」ブックマークの問題だけで演習中ならtrue
  newsDetail:null,             // ニュース詳細画面に表示中の項目（{title,content,dateKey,label,icon,returnScreen}）
  scenarioId:null,             // シナリオモードで選択中のシナリオID。nullなら一覧表示
};

export const state = {
  practicePick:false,
  aiReviewShowAll:false,  // AIおすすめ復習：「もっと見る」で全件表示中ならtrue
  historyTab:"all",       // 履歴タブ: all | practice | exam | review
  rankingTab:"overall",   // ランキングタブ: overall | 資格id（例：az900）
  db:null, currentUserId:null, currentUser:null,
  authReady:false, guestMode:false, authMode:"signup", authBusy:false,
  cloudData:null, profileChecked:false,
  unsub:null, lbAutoDone:false,
};
