import { errLine } from './_util.js';
import { applyUserEnv } from '../users.js';

// su [ユーザー名]（省略時はroot）。
// ・自分がすでにrootなら、実際のLinuxと同様パスワードなしで即座に切り替わる。
// ・それ以外は呼び出し側（screen.js）へ awaitPassword を返し、次の1行を
//   パスワード入力として扱ってもらう（画面側で認証してからスタックを積む）。
export default function su(ctx){
  if(!ctx.session) return { lines:[], err:[ errLine("su: このモードでは利用できません") ] };

  const target = ctx.args[0] || "root";
  const user = ctx.session.find(target);
  if(!user) return { lines:[], err:[ errLine(`su: user ${target} does not exist`) ] };

  if(ctx.session.isRoot()){
    ctx.session.switchTo(user.username);
    applyUserEnv(ctx.vfs, ctx.state, user);
    return { lines:[], err:[] };
  }

  return { lines:[], err:[], awaitPassword: user.username };
}
