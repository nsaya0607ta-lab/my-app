import { errLine } from './_util.js';

function parseSignal(args){
  for(const a of args){
    if(!a.startsWith("-")) continue;
    const v = a.slice(1);
    if(v === "9" || /^(SIGKILL|KILL)$/i.test(v)) return 9;
    if(v === "15" || /^(SIGTERM|TERM)$/i.test(v)) return 15;
  }
  return 15;
}

export default function killall(ctx){
  const names = ctx.args.filter(a => !a.startsWith("-"));
  if(!names.length) return { lines:[], err:[ errLine("Usage: killall [-signal] name ...") ] };
  const signal = parseSignal(ctx.args);
  const err = [];
  names.forEach(name => {
    const matches = ctx.state.processes.filter(p => p.cmd.split(/\s+/)[0].replace(/^-/, "").replace(/^\[|\]$/g, "") === name);
    if(!matches.length){ err.push(errLine(`killall: ${name}: no process found`)); return; }
    matches.forEach(p => {
      if(p.stubborn && signal !== 9) return;
      ctx.state.killPid(p.pid);
    });
  });
  return { lines:[], err };
}
