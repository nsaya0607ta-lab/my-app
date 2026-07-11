import { errLine, outLine } from './_util.js';

function expandSet(s){
  const out = [];
  for(let i = 0; i < s.length; i++){
    if(s[i+1] === "-" && s[i+2]){
      const start = s.charCodeAt(i), end = s.charCodeAt(i+2);
      for(let c = start; c <= end; c++) out.push(String.fromCharCode(c));
      i += 2;
    } else out.push(s[i]);
  }
  return out;
}

function linesFromText(text){
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  return body === "" ? [] : body.split("\n").map(outLine);
}

export default function tr(ctx){
  const flagChars = new Set(ctx.args.filter(a => a.startsWith("-") && a !== "-").flatMap(a => a.slice(1).split("")));
  const positional = ctx.args.filter(a => !a.startsWith("-") || a === "-");
  const del = flagChars.has("d");
  const squeeze = flagChars.has("s");
  const [set1raw, set2raw] = positional;

  if(!set1raw) return { lines:[], err:[ errLine("usage: tr [-ds] string1 [string2]") ] };
  if(ctx.stdin == null) return { lines:[], err:[ errLine("tr: 標準入力がありません（パイプで文字列を渡してください。例: echo hi | tr a-z A-Z）") ] };

  const s1 = expandSet(set1raw);
  const s1Set = new Set(s1);
  let chars = [...ctx.stdin];

  if(del){
    chars = chars.filter(ch => !s1Set.has(ch));
  } else if(set2raw){
    const s2 = expandSet(set2raw);
    const map = new Map();
    s1.forEach((ch, i) => map.set(ch, s2.length ? s2[Math.min(i, s2.length-1)] : ch));
    chars = chars.map(ch => map.has(ch) ? map.get(ch) : ch);
  }

  if(squeeze){
    const squeezeSet = set2raw ? new Set(expandSet(set2raw)) : s1Set;
    const out = [];
    let prev = null;
    chars.forEach(ch => {
      if(squeezeSet.has(ch) && ch === prev) return;
      out.push(ch);
      prev = ch;
    });
    chars = out;
  }

  return { lines: linesFromText(chars.join("")), err:[] };
}
