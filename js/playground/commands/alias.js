import { outLine, errLine } from './_util.js';

export default function alias(ctx){
  if(!ctx.args.length){
    const lines = [...ctx.state.aliases.entries()].sort((a,b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => outLine(`alias ${k}='${v}'`));
    return { lines, err:[] };
  }
  const lines = [];
  const err = [];
  ctx.args.forEach(arg => {
    const eq = arg.indexOf("=");
    if(eq === -1){
      if(ctx.state.aliases.has(arg)) lines.push(outLine(`alias ${arg}='${ctx.state.aliases.get(arg)}'`));
      else err.push(errLine(`alias: ${arg}: not found`));
      return;
    }
    const name = arg.slice(0, eq);
    let value = arg.slice(eq+1);
    if((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) value = value.slice(1,-1);
    ctx.state.aliases.set(name, value);
  });
  return { lines, err };
}
