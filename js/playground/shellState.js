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
    this.bootedAt = new Date();
    this.nextPid = 1200;
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
}
