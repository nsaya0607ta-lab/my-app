import { parseFlags, fsError, errLine } from './_util.js';

export default function ln(ctx){
  const { flags, operands } = parseFlags(ctx.args);
  if(operands.length < 2) return { lines:[], err:[ errLine("ln: missing file operand") ] };
  const [target, linkPath] = operands;
  const res = ctx.vfs.link(target, linkPath, { symbolic: flags.has("s") });
  if(!res.error) return { lines:[], err:[] };
  if(res.error.error === "EPERM_DIR") return { lines:[], err:[ errLine(`ln: ${target}: hard link not allowed for directory`) ] };
  const verb = res.error.stat ? "failed to access" : "failed to create";
  return { lines:[], err:[ fsError("ln", verb, res.error) ] };
}
