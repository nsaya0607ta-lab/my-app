/* =========================================================================
   CommandParser — ターミナルへの入力1行を { cmd, args, redirect } に変換する。
   "..." '...' によるクォート、echo の `>` によるファイルへのリダイレクトに
   対応する（例: echo "hello world" > memo.txt）。
   ========================================================================= */

function tokenize(raw){
  const tokens = [];
  let cur = "";
  let quote = null;
  for(let i=0; i<raw.length; i++){
    const ch = raw[i];
    if(quote){
      if(ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if(ch === '"' || ch === "'"){ quote = ch; continue; }
    if(/\s/.test(ch)){
      if(cur){ tokens.push(cur); cur = ""; }
      continue;
    }
    if(ch === ">"){
      if(cur){ tokens.push(cur); cur = ""; }
      tokens.push(">");
      continue;
    }
    cur += ch;
  }
  if(cur) tokens.push(cur);
  return tokens;
}

export function parseCommand(raw){
  const trimmed = (raw||"").trim();
  if(!trimmed) return null;
  const tokens = tokenize(trimmed);
  const cmd = tokens[0];
  const rest = tokens.slice(1);
  const gtIdx = rest.indexOf(">");
  if(gtIdx === -1) return { cmd, args: rest, redirect: null };
  return { cmd, args: rest.slice(0, gtIdx), redirect: rest[gtIdx+1] || null };
}
