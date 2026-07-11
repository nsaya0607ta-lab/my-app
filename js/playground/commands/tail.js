import { fsError, outLine } from './_util.js';

function bodyLines(text){
  if(!text) return [];
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  return body === "" ? [] : body.split("\n");
}

function extractCount(args, defaultN){
  let n = defaultN;
  const files = [];
  for(let i = 0; i < args.length; i++){
    const a = args[i];
    if(a === "-n"){ n = parseInt(args[++i], 10) || defaultN; continue; }
    const short = /^-n(\d+)$/.exec(a);
    if(short){ n = parseInt(short[1], 10); continue; }
    const long = /^--lines=(\d+)$/.exec(a);
    if(long){ n = parseInt(long[1], 10); continue; }
    files.push(a);
  }
  return { n, files };
}

export default function tail(ctx){
  const { n, files } = extractCount(ctx.args, 10);
  if(!files.length){
    return { lines: ctx.stdin != null ? bodyLines(ctx.stdin).slice(-n).map(outLine) : [], err:[] };
  }
  const lines = [];
  const err = [];
  files.forEach((path, i) => {
    const res = ctx.vfs.readFile(path);
    if(res.error){ err.push(fsError("tail", null, res.error)); return; }
    if(files.length > 1){ if(i > 0) lines.push(outLine("")); lines.push(outLine(`==> ${path} <==`)); }
    lines.push(...bodyLines(res.content).slice(-n).map(outLine));
  });
  return { lines, err };
}
