import { errLine } from './_util.js';

export default function unalias(ctx){
  if(!ctx.args.length) return { lines:[], err:[ errLine("unalias: usage: unalias [-a] name [name ...]") ] };
  if(ctx.args.includes("-a")){ ctx.state.aliases.clear(); return { lines:[], err:[] }; }
  const err = [];
  ctx.args.forEach(name => {
    if(ctx.state.aliases.has(name)) ctx.state.aliases.delete(name);
    else err.push(errLine(`unalias: ${name}: not found`));
  });
  return { lines:[], err };
}
