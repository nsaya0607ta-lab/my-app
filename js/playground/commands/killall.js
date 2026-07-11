import { errLine } from './_util.js';

export default function killall(ctx){
  const names = ctx.args.filter(a => !a.startsWith("-"));
  if(!names.length) return { lines:[], err:[ errLine("Usage: killall [-signal] name ...") ] };
  const err = [];
  names.forEach(name => {
    const matches = ctx.state.processes.filter(p => p.cmd.split(/\s+/)[0].replace(/^-/, "").replace(/^\[|\]$/g, "") === name);
    if(!matches.length){ err.push(errLine(`killall: ${name}: no process found`)); return; }
    matches.forEach(p => ctx.state.killPid(p.pid));
  });
  return { lines:[], err };
}
