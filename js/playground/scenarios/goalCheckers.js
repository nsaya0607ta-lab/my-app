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
import { modeToOctal } from '../vfs.js';

// ゴール判定用のパスは常に既定ユーザー(student)のホームを基準に解決する。
// su で root に切り替えた後だと vfs.resolvePath の "~" は /root になって
// しまい、シナリオ開始時にstudentのホーム配下へ作った実ファイルと食い違う
// ため、ここでは currentHomeSegs ではなく defaultHomeSegs を使って展開する。
function resolveGoalPath(vfs, path){
  if(path === "~") return "/" + vfs.defaultHomeSegs().join("/");
  if(path.startsWith("~/")) return "/" + vfs.defaultHomeSegs().concat(path.slice(2).split("/").filter(Boolean)).join("/");
  return path;
}

function nodeAt(vfs, path, opts = {}){
  const segs = vfs.resolvePath(resolveGoalPath(vfs, path));
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
    const res = vfs.readFile(resolveGoalPath(vfs, g.path));
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

  // 8進数のモードが厳密に一致しているか（755のような「この数字ちょうど」
  // を求めるシナリオ用。8進数指定でもシンボリック指定でも、結果として
  // 同じmodeになれば通る＝コマンドの書き方は問わない）
  octal: (vfs, shell, g) => {
    const n = nodeAt(vfs, g.path, { raw: true });
    if(!n) return false;
    return modeToOctal(n.mode) === g.value;
  },

  // 所有者(owner)が指定した値になっているか
  owner: (vfs, shell, g) => {
    const n = nodeAt(vfs, g.path, { raw: true });
    return !!n && n.owner === g.value;
  },

  // 所属グループ(group)が指定した値になっているか
  group: (vfs, shell, g) => {
    const n = nodeAt(vfs, g.path, { raw: true });
    return !!n && n.group === g.value;
  },

  // 所有者・グループを同時に指定した値へ変更できているか（chown user:group）
  ownerGroup: (vfs, shell, g) => {
    const n = nodeAt(vfs, g.path, { raw: true });
    return !!n && n.owner === g.owner && n.group === g.group;
  },

  // シンボリックリンクが存在する（target指定時はリンク先の一致も確認）
  symlink: (vfs, shell, g) => {
    const n = nodeAt(vfs, g.path, { raw: true });
    if(!n || n.type !== "link") return false;
    if(g.target){
      const wantSegs = vfs.resolvePath(resolveGoalPath(vfs, g.target));
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

  // ジョブテーブル（&でのバックグラウンド実行・jobs/fg/bg）の状態を判定する。
  // state:"running"/"stopped" は該当ジョブがその状態で存在するか、
  // state:"none" は該当ジョブがジョブテーブルから消えている（fgで完了した等）
  // ことを判定する。match指定時はコマンド文字列の部分一致で対象を絞り込む。
  job: (vfs, shell, g) => {
    const matches = shell.jobs.filter(j => !g.match || j.cmd.includes(g.match));
    if(g.state === "none") return matches.length === 0;
    return matches.some(j => j.status === g.state);
  },

  // ディスク使用量が閾値未満になっている（削除・整理系シナリオ用）
  diskUsageUnder: (vfs, shell, g) => {
    const n = nodeAt(vfs, g.path);
    if(!n) return false;
    return vfs.du(n) < g.maxBytes;
  },

  // 指定したカーネルモジュールが（modprobeで）読み込み済みになっているか
  moduleLoaded: (vfs, shell, g) => shell.kernelModules.has(g.name),

  // 指定したディスク（例:"sdb"）に、fdiskで少なくとも1つパーティションが
  // 作られているか（パーティション番号は問わない＝1でも2でも許容する）
  partitionCreated: (vfs, shell, g) => {
    const disk = shell.disks.get(g.diskName);
    return !!disk && disk.partitions.length > (g.morethan || 0);
  },

  // 指定したディスクの、いずれかのパーティションに指定したファイルシステム
  // （mkfs.ext4なら"ext4"）が作成されているか
  filesystemCreated: (vfs, shell, g) => {
    const disk = shell.disks.get(g.diskName);
    return !!disk && disk.partitions.some(p => p.fsType === g.fsType);
  },

  // 指定したディスク由来のパーティションが、指定したマウントポイントへ
  // マウントされているか（"/dev/sdb1"のような具体的なパーティション番号は
  // 問わない＝fdiskでどの番号を選んでも、そのパーティションをマウントすれば通る）
  mounted: (vfs, shell, g) => shell.mounts.some(m => {
    if(m.mountpoint !== g.mountpoint) return false;
    if(!g.diskName) return true;
    return new RegExp(`^/dev/${g.diskName}\\d+$`).test(m.device);
  }),

  // これまでに実行したコマンド（履歴）の中に条件を満たすものがあるか。
  // ls -l で権限を確認する、のような「状態を変えない操作」を行ったかどうかは
  // VFS/ShellStateの現在の状態だけでは判定できないため、履歴を直接見る。
  commandRan: (vfs, shell, g, ctx) => {
    const list = (ctx && ctx.history) || [];
    return list.some(raw => {
      const parts = raw.trim().split(/\s+/).filter(Boolean);
      if(!parts.length) return false;
      if(g.cmd && parts[0] !== g.cmd) return false;
      if(g.flag && !parts.slice(1).some(p => /^-[a-zA-Z]+$/.test(p) && p.includes(g.flag))) return false;
      if(g.pattern && !new RegExp(g.pattern, g.flags || "").test(raw)) return false;
      return true;
    });
  },

  // 一度でもrootユーザーへ切り替えたことがあるか（su成功後はexitで戻っても
  // 保持され続けるフラグを見る＝「rootで作業した」達成感がexitで消えない）
  becameRoot: (vfs, shell, g, ctx) => !!(ctx && ctx.userSession && ctx.userSession.everRoot),

  // rootへ切り替えた実績があり、かつ今は最初にログインしたユーザーまで
  // exitで戻ってきているか（su → 作業 → exit の一連の流れができたか）
  backToOriginalUser: (vfs, shell, g, ctx) => !!(ctx && ctx.userSession && ctx.userSession.everRoot && ctx.userSession.stack.length === 1),

  // 上記だけでは表現しづらい判定を、シナリオ定義ファイル側で直接書くための逃げ道
  custom: (vfs, shell, g, ctx) => !!g.fn(vfs, shell, ctx),
};

export function evaluateGoal(goal, vfs, shell, ctx){
  const checker = GOAL_CHECKERS[goal.type];
  if(!checker) return false;
  try{ return !!checker(vfs, shell, goal, ctx || {}); }
  catch(e){ return false; }
}
