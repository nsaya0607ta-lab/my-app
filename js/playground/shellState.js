/* =========================================================================
   ShellState — VFS以外のシェル状態（環境変数・alias・疑似プロセス表・
   起動時刻）をまとめて保持する。screen.jsのモジュール変数から生成され、
   「リセット」のたびに reset() で初期状態に戻る。
   ========================================================================= */
import { USER, HOSTNAME } from './constants.js';

function defaultEnv(){
  return new Map([
    ["HOME", `/home/${USER}`],
    ["USER", USER],
    ["LOGNAME", USER],
    ["SHELL", "/bin/bash"],
    ["TERM", "xterm-256color"],
    ["LANG", "ja_JP.UTF-8"],
    ["PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"],
    ["HOSTNAME", HOSTNAME],
    ["PWD", `/home/${USER}`],
  ]);
}

function defaultAliases(){
  return new Map([
    ["ll", "ls -l"],
    ["la", "ls -a"],
    ["l", "ls -la"],
  ]);
}

function defaultProcesses(){
  return [
    { pid:1,   ppid:0,   user:"root",    cpu:0.0, mem:0.1, tty:"?",     stat:"Ss", cmd:"/sbin/init" },
    { pid:2,   ppid:0,   user:"root",    cpu:0.0, mem:0.0, tty:"?",     stat:"S",  cmd:"[kthreadd]" },
    { pid:118, ppid:1,   user:"root",    cpu:0.0, mem:0.2, tty:"?",     stat:"Ss", cmd:"/usr/sbin/cron -f" },
    { pid:245, ppid:1,   user:"root",    cpu:0.1, mem:0.3, tty:"?",     stat:"Ss", cmd:"/usr/sbin/sshd -D" },
    { pid:512, ppid:1,   user:"student", cpu:0.2, mem:0.6, tty:"?",     stat:"Ss", cmd:"/lib/systemd/systemd --user" },
    { pid:640, ppid:512, user:"student", cpu:0.0, mem:0.4, tty:"pts/0", stat:"Ss", cmd:"-bash" },
    { pid:801, ppid:640, user:"student", cpu:1.3, mem:0.8, tty:"pts/0", stat:"R+", cmd:"top" },
    { pid:955, ppid:640, user:"student", cpu:0.3, mem:1.1, tty:"pts/0", stat:"S+", cmd:"node playground.js" },
  ];
}

export class ShellState {
  constructor(){ this.reset(); }

  reset(){
    this.env = defaultEnv();
    this.aliases = defaultAliases();
    this.processes = defaultProcesses();
    this.cronJobs = []; // crontabコマンドで登録されたジョブ（{min,hour,dom,mon,dow,command,raw}）
    this.jobs = []; // シェルのジョブテーブル（&で背景実行 / Ctrl+Zで停止したジョブ）。{id,pid,cmd,status:"running"|"stopped"}
    this.nextJobId = 1;
    this.bootedAt = new Date();
    this.nextPid = 1200;
  }

  // Firestoreへ保存する形（プレーンなJSONのみ）に変換する。processes/bootedAtは
  // 疑似的な表示用データに過ぎないため保存対象に含めない（毎回既定値に戻る）
  toJSON(){
    return { env: Object.fromEntries(this.env), aliases: Object.fromEntries(this.aliases) };
  }

  loadFromJSON(data){
    if(!data || typeof data !== "object") return;
    if(data.env && typeof data.env === "object") this.env = new Map(Object.entries(data.env));
    if(data.aliases && typeof data.aliases === "object") this.aliases = new Map(Object.entries(data.aliases));
  }

  findProcess(pidOrName){
    return this.processes.filter(p => String(p.pid) === String(pidOrName) || p.cmd.split(/\s+/)[0].replace(/^-/, "").replace(/^\[|\]$/g, "") === pidOrName);
  }

  killPid(pid){
    const idx = this.processes.findIndex(p => p.pid === pid);
    if(idx === -1) return false;
    this.processes.splice(idx, 1);
    return true;
  }

  // &（バックグラウンド実行）で新しいジョブを登録する。jobs/fg/bgコマンドは
  // すべてこのジョブテーブルを介して操作する（ps/killが見るprocessesとは
  // 別の一覧。実際のシェルも「ジョブ」と「プロセス」は別の概念）
  addJob(cmd, status = "running"){
    const job = { id: this.nextJobId++, pid: this.nextPid++, cmd, status };
    this.jobs.push(job);
    return job;
  }

  // 引数なし（現在のジョブ＝直近に追加されたもの）または %1 / 1 のような
  // ジョブ番号指定でジョブを1件探す（fg/bgの対象決定に使う）
  findJob(token){
    if(!this.jobs.length) return null;
    if(token === undefined || token === null || token === "") return this.jobs[this.jobs.length - 1];
    const id = parseInt(String(token).replace(/^%/, ""), 10);
    if(Number.isNaN(id)) return null;
    return this.jobs.find(j => j.id === id) || null;
  }

  removeJob(job){
    const idx = this.jobs.indexOf(job);
    if(idx !== -1) this.jobs.splice(idx, 1);
  }
}
