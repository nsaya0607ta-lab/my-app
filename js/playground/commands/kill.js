import { errLine } from './_util.js';

// "-9"/"-SIGKILL"/"-KILL" ならSIGKILL(9)、それ以外（既定/-15/-SIGTERM/-TERM）はSIGTERM(15)として扱う
function parseSignal(args){
  for(const a of args){
    if(!a.startsWith("-")) continue;
    const v = a.slice(1);
    if(v === "9" || /^(SIGKILL|KILL)$/i.test(v)) return 9;
    if(v === "15" || /^(SIGTERM|TERM)$/i.test(v)) return 15;
  }
  return 15;
}

export default function kill(ctx){
  const pids = ctx.args.filter(a => !a.startsWith("-"));
  if(!pids.length) return { lines:[], err:[ errLine("usage: kill [-signal] pid...") ] };
  const signal = parseSignal(ctx.args);
  const err = [];
  pids.forEach(raw => {
    if(!/^\d+$/.test(raw)){ err.push(errLine(`bash: kill: ${raw}: arguments must be process or job IDs`)); return; }
    const pid = parseInt(raw, 10);
    if(pid === 1){ err.push(errLine(`bash: kill: (1) - Operation not permitted`)); return; }
    const proc = ctx.state.processes.find(p => p.pid === pid);
    if(!proc){ err.push(errLine(`bash: kill: (${pid}) - No such process`)); return; }
    // stubbornなプロセスはSIGTERM（既定）を無視する。実際のLinuxでも、
    // シグナルハンドラの実装次第でSIGTERMが無視されることがあり、その
    // 場合はSIGKILL(9番)で強制終了する必要がある、という状況を再現する。
    if(proc.stubborn && signal !== 9) return;
    ctx.state.killPid(pid);
  });
  return { lines:[], err };
}
