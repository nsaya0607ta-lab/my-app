import { parseFlags, fsError, errLine } from './_util.js';

export default function cp(ctx){
  const { flags, operands } = parseFlags(ctx.args);
  if(operands.length < 2) return { lines:[], err:[ errLine(`cp: missing ${operands.length ? "destination file" : "file"} operand`) ] };
  const dest = operands[operands.length-1];
  const sources = operands.slice(0, -1);
  const err = [];
  sources.forEach(src => {
    const res = ctx.vfs.copy(src, dest, { recursive: flags.has("r") || flags.has("R") });
    if(!res.error) return;
    if(res.error.error === "EISDIR_NEEDS_R"){ err.push(errLine(`cp: -r not specified; omitting directory '${src}'`)); return; }
    const verb = res.error.stat ? "cannot stat" : "cannot create";
    err.push(fsError("cp", verb, res.error));
  });
  return { lines:[], err };
}
