import { parseFlags, fsError, errLine } from './_util.js';

export default function touch(ctx){
  const { operands } = parseFlags(ctx.args);
  if(!operands.length) return { lines:[], err:[ errLine("touch: missing file operand") ] };
  const err = [];
  operands.forEach(path => {
    const res = ctx.vfs.touch(path);
    if(res.error) err.push(fsError("touch", "cannot touch", res.error));
  });
  return { lines:[], err };
}
