import { parseFlags, errLine, fsError, outLine } from './_util.js';

function splitBody(text){
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  return body === "" ? [] : body.split("\n");
}

export default function grep(ctx){
  const { flags, operands } = parseFlags(ctx.args);
  if(!operands.length) return { lines:[], err:[ errLine("Usage: grep [OPTION]... PATTERNS [FILE]...") ] };
  const pattern = operands[0];
  const files = operands.slice(1);
  let re;
  try{ re = new RegExp(pattern, flags.has("i") ? "i" : ""); }
  catch(e){ return { lines:[], err:[ errLine(`grep: ${pattern}: repetition-operator operand invalid`) ] }; }

  const invert = flags.has("v");
  const withNum = flags.has("n");
  const countOnly = flags.has("c");

  const processText = (text, label) => {
    const prefix = label ? `${label}:` : "";
    const matched = splitBody(text).map((line, i) => ({ line, num: i+1 })).filter(({line}) => re.test(line) !== invert);
    if(countOnly) return [ outLine(`${prefix}${matched.length}`) ];
    return matched.map(({line, num}) => outLine(`${prefix}${withNum ? num + ":" : ""}${line}`));
  };

  if(!files.length) return { lines: processText(ctx.stdin || "", null), err:[] };

  const lines = [];
  const err = [];
  files.forEach(f => {
    const res = ctx.vfs.readFile(f);
    if(res.error){ err.push(fsError("grep", null, res.error)); return; }
    lines.push(...processText(res.content, files.length > 1 ? f : null));
  });
  return { lines, err };
}
