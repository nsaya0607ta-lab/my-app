import { parseFlags, fsError, outLine } from './_util.js';

function splitBody(text){
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  return body === "" ? [] : body.split("\n");
}

export default function sort(ctx){
  const { flags, operands } = parseFlags(ctx.args);
  let source;
  let err = [];
  if(operands.length){
    const res = ctx.vfs.readFile(operands[0]);
    if(res.error) return { lines:[], err:[ fsError("sort", null, res.error) ] };
    source = res.content;
  } else {
    source = ctx.stdin || "";
  }
  let lines = splitBody(source);
  const numeric = flags.has("n");
  lines = lines.slice().sort((a, b) => numeric ? (parseFloat(a)||0) - (parseFloat(b)||0) : a.localeCompare(b));
  if(flags.has("r")) lines.reverse();
  if(flags.has("u")) lines = lines.filter((l, i) => i === 0 || l !== lines[i-1]);
  return { lines: lines.map(outLine), err };
}
