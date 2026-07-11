import { errLine } from './_util.js';

export default function kill(ctx){
  const pids = ctx.args.filter(a => !a.startsWith("-"));
  if(!pids.length) return { lines:[], err:[ errLine("usage: kill [-signal] pid...") ] };
  const err = [];
  pids.forEach(raw => {
    if(!/^\d+$/.test(raw)){ err.push(errLine(`bash: kill: ${raw}: arguments must be process or job IDs`)); return; }
    const pid = parseInt(raw, 10);
    if(pid === 1){ err.push(errLine(`bash: kill: (1) - Operation not permitted`)); return; }
    const killed = ctx.state.killPid(pid);
    if(!killed) err.push(errLine(`bash: kill: (${pid}) - No such process`));
  });
  return { lines:[], err };
}
