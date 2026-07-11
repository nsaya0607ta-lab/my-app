import { fsError, errLine, outLine } from './_util.js';

function splitBody(text){
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  return body === "" ? [] : body.split("\n");
}

export default function cut(ctx){
  const args = ctx.args.slice();
  let delim = "\t";
  let fields = null;
  const files = [];
  for(let i = 0; i < args.length; i++){
    const a = args[i];
    if(a === "-d"){ delim = args[++i]; }
    else if(a.startsWith("-d") && a.length > 2){ delim = a.slice(2); }
    else if(a === "-f"){ fields = args[++i]; }
    else if(a.startsWith("-f") && a.length > 2){ fields = a.slice(2); }
    else files.push(a);
  }
  if(!fields) return { lines:[], err:[ errLine("cut: you must specify a list of bytes, characters, or fields") ] };
  const idxList = fields.split(",").map(s => parseInt(s, 10) - 1);

  const process = (text) => splitBody(text).map(line => {
    const cols = line.split(delim);
    return idxList.map(i => cols[i] ?? "").join(delim);
  });

  if(!files.length) return { lines: process(ctx.stdin || "").map(outLine), err:[] };
  const lines = [];
  const err = [];
  files.forEach(f => {
    const res = ctx.vfs.readFile(f);
    if(res.error){ err.push(fsError("cut", null, res.error)); return; }
    lines.push(...process(res.content).map(outLine));
  });
  return { lines, err };
}
