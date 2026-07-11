import { errLine, fsError } from './_util.js';

export default function less(ctx){
  const path = ctx.args[0];
  if(!path){
    if(ctx.stdin != null) return { lines:[], err:[], overlay:{ type:"less", path:"(標準入力)", content: ctx.stdin } };
    return { lines:[], err:[ errLine("less: missing filename (\"less --help\" for help)") ] };
  }
  const res = ctx.vfs.readFile(path);
  if(res.error) return { lines:[], err:[ fsError("less", null, res.error) ] };
  return { lines:[], err:[], overlay:{ type:"less", path, content: res.content } };
}
