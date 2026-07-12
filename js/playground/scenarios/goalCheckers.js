/* =========================================================================
   goalCheckers — シナリオの「達成条件（goal）」をLinux環境の状態から判定する。
   コマンド文字列の一致ではなく、常にVFS/ShellStateの現在の状態を見て判定
   するため、複数の正解コマンド（cd test / cd ./test 等）をまとめて許容できる。

   goal は { type: "...", ...パラメータ } というプレーンオブジェクト（JSON化可能）
   で、シナリオ定義ファイル（scenarios/data/*.js）から渡される。type に応じた
   判定関数は下の GOAL_CHECKERS に登録し、新しい判定が必要になったらここへ
   1件追加するだけでよい（シナリオ側は type 名を指定するだけで良い設計）。
   ========================================================================= */
import { cronJobsMatch } from '../cronUtil.js';

function nodeAt(vfs, path, opts = {}){
  const segs = vfs.resolvePath(path);
  return opts.raw ? vfs.rawChild(segs) : vfs.getNode(segs);
}

function permBits(mode){
  return { owner: mode.slice(0, 3), group: mode.slice(3, 6), other: mode.slice(6, 9) };
}

// 「誰にも書き込めない」「オーナーしか書き込めない」のような意味的な権限判定。
// 8進数(444/400)でもシンボリック(a-w等)でも、結果として同じmode文字列に
// なるため、ルール名を増やすだけで chmod の複数正解を自然に許容できる。
function checkPermRule(mode, rule){
  const { owner, group, other } = permBits(mode);
  switch(rule){
    case "no-write":            return !owner.includes("w") && !group.includes("w") && !other.includes("w");
    case "owner-write-only":    return owner.includes("w") && !group.includes("w") && !other.includes("w");
    case "owner-exec":          return owner.includes("x");
    case "no-group-other-access": return group === "---" && other === "---";
    case "world-readable":      return other.includes("r");
    case "world-no-access":     return other === "---";
    default: return false;
  }
}

export const GOAL_CHECKERS = {
  // ディレクトリが存在する
  dirExists: (vfs, shell, g) => {
    const n = nodeAt(vfs, g.path);
    return !!n && n.type === "dir";
  },

  // ファイルが存在する（contains指定時は内容の部分一致も条件に含める）
  fileExists: (vfs, shell, g) => {
    const n = nodeAt(vfs, g.path);
    if(!n || n.type !== "file") return false;
    if(g.contains !== undefined) return n.content.includes(g.contains);
    return true;
  },

  // 指定パスに何も存在しない（削除できたかの確認用）
  notExists: (vfs, shell, g) => !nodeAt(vfs, g.path, { raw: true }),

  // ファイルの中身が条件を満たす（includes=部分一致 / pattern=正規表現）
  fileContains: (vfs, shell, g) => {
    const res = vfs.readFile(g.path);
    if(res.error) return false;
    if(g.pattern) return new RegExp(g.pattern, g.flags || "").test(res.content);
    return res.content.includes(g.includes || "");
  },

  // パーミッションが目的を満たしているか（rule参照）
  permission: (vfs, shell, g) => {
    const n = nodeAt(vfs, g.path, { raw: true });
    if(!n) return false;
    return checkPermRule(n.mode, g.rule);
  },

  // シンボリックリンクが存在する（target指定時はリンク先の一致も確認）
  symlink: (vfs, shell, g) => {
    const n = nodeAt(vfs, g.path, { raw: true });
    if(!n || n.type !== "link") return false;
    if(g.target){
      const wantSegs = vfs.resolvePath(g.target);
      if(vfs.absPath(n.target) !== vfs.absPath(wantSegs)) return false;
    }
    return true;
  },

  // 環境変数が設定されている（equals=完全一致 / pattern=正規表現 / 省略時は存在確認のみ）
  envVar: (vfs, shell, g) => {
    if(!shell.env.has(g.name)) return false;
    const value = shell.env.get(g.name);
    if(g.equals !== undefined) return value === g.equals;
    if(g.pattern) return new RegExp(g.pattern, g.flags || "").test(value);
    return true;
  },

  // crontabに条件を満たすジョブが登録されている
  cronRegistered: (vfs, shell, g) => cronJobsMatch(shell.cronJobs, g),

  // 指定したプロセスが（kill/killallで）いなくなっている
  processGone: (vfs, shell, g) => !shell.processes.some(p => (g.pid && p.pid === g.pid) || (g.match && p.cmd.includes(g.match))),

  // ディスク使用量が閾値未満になっている（削除・整理系シナリオ用）
  diskUsageUnder: (vfs, shell, g) => {
    const n = nodeAt(vfs, g.path);
    if(!n) return false;
    return vfs.du(n) < g.maxBytes;
  },

  // 上記だけでは表現しづらい判定を、シナリオ定義ファイル側で直接書くための逃げ道
  custom: (vfs, shell, g) => !!g.fn(vfs, shell),
};

export function evaluateGoal(goal, vfs, shell){
  const checker = GOAL_CHECKERS[goal.type];
  if(!checker) return false;
  try{ return !!checker(vfs, shell, goal); }
  catch(e){ return false; }
}
