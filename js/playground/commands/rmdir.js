import { parseFlags, fsError, errLine } from './_util.js';

export default function rmdir(ctx){
  const { operands } = parseFlags(ctx.args);
  if(!operands.length) return { lines:[], err:[ errLine("rmdir: missing operand") ] };
  const err = [];
  operands.forEach(path => {
    const res = ctx.vfs.removeDir(path);
    if(res.error) err.push(fsError("rmdir", "failed to remove", res.error));
  });
  return { lines:[], err };
}
