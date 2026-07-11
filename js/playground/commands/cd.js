import { fsError } from './_util.js';

export default function cd(ctx){
  const target = ctx.args[0];
  const res = ctx.vfs.changeDir(target);
  if(res.error) return { lines:[], err:[ fsError("bash: cd", null, res.error) ] };
  return { lines:[], err:[] };
}
