import { parseFlags, fsError, errLine } from './_util.js';

export default function mkdir(ctx){
  const { flags, operands } = parseFlags(ctx.args);
  if(!operands.length) return { lines:[], err:[ errLine("mkdir: missing operand") ] };
  const err = [];
  operands.forEach(path => {
    const res = ctx.vfs.makeDir(path, { parents: flags.has("p") });
    if(res.error) err.push(fsError("mkdir", "cannot create directory", res.error));
  });
  return { lines:[], err };
}
