import { fsError, outLine } from './_util.js';

function linesFromText(text){
  if(!text) return [];
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  return body === "" ? [] : body.split("\n").map(outLine);
}

export default function cat(ctx){
  if(!ctx.args.length){
    return { lines: ctx.stdin != null ? linesFromText(ctx.stdin) : [], err:[] };
  }
  const lines = [];
  const err = [];
  ctx.args.forEach(path => {
    const res = ctx.vfs.readFile(path);
    if(res.error){ err.push(fsError("cat", null, res.error)); return; }
    lines.push(...linesFromText(res.content));
  });
  return { lines, err };
}
