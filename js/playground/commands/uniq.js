import { parseFlags, fsError, outLine, padStart } from './_util.js';

function splitBody(text){
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  return body === "" ? [] : body.split("\n");
}

export default function uniq(ctx){
  const { flags, operands } = parseFlags(ctx.args);
  let source;
  if(operands.length){
    const res = ctx.vfs.readFile(operands[0]);
    if(res.error) return { lines:[], err:[ fsError("uniq", null, res.error) ] };
    source = res.content;
  } else {
    source = ctx.stdin || "";
  }
  const lines = splitBody(source);
  const groups = [];
  lines.forEach(l => {
    const last = groups[groups.length-1];
    if(last && last.line === l) last.count++;
    else groups.push({ line: l, count: 1 });
  });
  const out = groups.map(g => outLine(flags.has("c") ? `${padStart(g.count, 4)} ${g.line}` : g.line));
  return { lines: out, err:[] };
}
