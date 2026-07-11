import { parseFlags, fsError, errLine } from './_util.js';

export default function chmod(ctx){
  const { flags, operands } = parseFlags(ctx.args);
  if(operands.length < 2) return { lines:[], err:[ errLine("chmod: missing operand") ] };
  const [spec, ...paths] = operands;
  const err = [];
  paths.forEach(path => {
    const res = ctx.vfs.chmod(path, spec, { recursive: flags.has("R") });
    if(res.error){
      if(res.error.error === "EINVAL") err.push(errLine(`chmod: invalid mode: '${spec}'`));
      else err.push(fsError("chmod", "cannot access", res.error));
    }
  });
  return { lines:[], err };
}
