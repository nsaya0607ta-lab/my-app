import { parseFlags, fsError, outLine, padStart } from './_util.js';

function counts(text){
  const lines = (text.match(/\n/g) || []).length;
  const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
  const bytes = text.length;
  return { lines, words, bytes };
}

function formatRow(c, flags, label){
  const parts = [];
  if(flags.has("l")) parts.push(padStart(c.lines, 7));
  if(flags.has("w")) parts.push(padStart(c.words, 7));
  if(flags.has("c")) parts.push(padStart(c.bytes, 7));
  if(!parts.length) parts.push(padStart(c.lines, 7), padStart(c.words, 7), padStart(c.bytes, 7));
  if(label) parts.push(label);
  return outLine(parts.join(" ").trimStart());
}

export default function wc(ctx){
  const { flags, operands } = parseFlags(ctx.args);
  if(!operands.length){
    return { lines:[ formatRow(counts(ctx.stdin || ""), flags, null) ], err:[] };
  }
  const lines = [];
  const err = [];
  let total = { lines:0, words:0, bytes:0 };
  operands.forEach(path => {
    const res = ctx.vfs.readFile(path);
    if(res.error){ err.push(fsError("wc", null, res.error)); return; }
    const c = counts(res.content);
    total.lines += c.lines; total.words += c.words; total.bytes += c.bytes;
    lines.push(formatRow(c, flags, path));
  });
  if(operands.length > 1) lines.push(formatRow(total, flags, "total"));
  return { lines, err };
}
