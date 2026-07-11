import { parseFlags, fsError, errLine } from './_util.js';

export default function rm(ctx){
  const { flags, operands } = parseFlags(ctx.args);
  const force = flags.has("f");
  if(!operands.length){
    if(force) return { lines:[], err:[] };
    return { lines:[], err:[ errLine("rm: missing operand") ] };
  }
  const err = [];
  operands.forEach(path => {
    const res = ctx.vfs.remove(path, { recursive: flags.has("r") || flags.has("R"), force });
    if(res.error && !force) err.push(fsError("rm", "cannot remove", res.error));
  });
  return { lines:[], err };
}
