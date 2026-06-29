import './db.js';
import { loadCoins, migrateOldData } from './core.js';
import { render } from './render.js';
import { S, state } from './state.js';

migrateOldData();
S.coins = loadCoins();
render();

// 安全装置：8秒待ってもFirebaseの準備が終わらない（通信が遅い/失敗）場合は
// 固まらないようログイン画面へ進める。ゲスト利用への導線もそこにあります。
setTimeout(function(){
  if(!state.authReady && !state.guestMode){ state.authReady = true; render(); }
}, 8000);

