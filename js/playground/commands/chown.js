import { parseFlags, fsError, errLine } from './_util.js';

export default function chown(ctx){
  const { flags, operands } = parseFlags(ctx.args);
  if(operands.length < 2) return { lines:[], err:[ errLine("chown: missing operand") ] };
  const [spec, ...paths] = operands;
  const err = [];
  paths.forEach(path => {
    const res = ctx.vfs.chown(path, spec, { recursive: flags.has("R") });
    if(res.error) err.push(fsError("chown", "cannot access", res.error));
  });
  return { lines:[], err };
}
