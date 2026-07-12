import { LINE, errLine } from './_util.js';
import { applyUserEnv } from '../users.js';

// exit：suで切り替えたユーザーから1段階だけ元のユーザーへ戻る（実際の
// Linuxのログインシェルと同様）。suを一度もしていない状態（最初にログイン
// したユーザーのまま）では、これ以上戻る先がない旨を表示するだけにする
// （実際のシェルなら端末そのものを閉じる操作だが、この学習環境では
// ターミナルを閉じることはできないため）。
export default function exitCmd(ctx){
  if(!ctx.session) return { lines:[], err:[ errLine("exit: このモードでは利用できません") ] };

  if(!ctx.session.canExit()){
    return { lines:[ LINE("これ以上 exit できません（最初にログインしたユーザーです）", "pg-muted") ], err:[] };
  }

  ctx.session.exit();
  applyUserEnv(ctx.vfs, ctx.state, ctx.session.current());
  return { lines:[], err:[] };
}
