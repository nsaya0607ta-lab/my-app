import { parseFlags, fsError, errLine } from './_util.js';

export default function mv(ctx){
  const { operands } = parseFlags(ctx.args);
  if(operands.length < 2) return { lines:[], err:[ errLine(`mv: missing ${operands.length ? "destination file" : "file"} operand`) ] };
  const dest = operands[operands.length-1];
  const sources = operands.slice(0, -1);
  const err = [];
  sources.forEach(src => {
    const res = ctx.vfs.move(src, dest);
    if(!res.error) return;
    const verb = res.error.stat ? "cannot stat" : "cannot move";
    err.push(fsError("mv", verb, res.error));
  });
  return { lines:[], err };
}
