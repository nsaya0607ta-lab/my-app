import { fsError, outLine } from './_util.js';

function linesFromText(text){
  if(!text) return [];
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  return body === "" ? [] : body.split("\n").map(outLine);
}

export default function tee(ctx){
  const args = ctx.args.slice();
  const append = args.includes("-a");
  const files = args.filter(a => !a.startsWith("-"));
  const text = ctx.stdin || "";
  const err = [];
  files.forEach(path => {
    const res = ctx.vfs.writeFile(path, text, { append });
    if(res.error) err.push(fsError("tee", null, res.error));
  });
  return { lines: linesFromText(text), err };
}
