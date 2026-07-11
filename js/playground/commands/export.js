import { outLine, errLine } from './_util.js';

export default function exportCmd(ctx){
  if(!ctx.args.length){
    const lines = [...ctx.state.env.entries()].sort((a,b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => outLine(`declare -x ${k}="${v}"`));
    return { lines, err:[] };
  }
  const err = [];
  ctx.args.forEach(arg => {
    const eq = arg.indexOf("=");
    if(eq === -1){ err.push(errLine(`export: '${arg}': not a valid identifier`)); return; }
    const name = arg.slice(0, eq);
    const value = arg.slice(eq+1);
    ctx.state.env.set(name, value);
  });
  return { lines:[], err };
}
