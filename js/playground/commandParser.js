/* =========================================================================
   CommandParser — ターミナルへの入力1行を「パイプライン」（ステージの配列）
   に変換する。各ステージは { cmd, args, redirect, append, inputRedirect } の形。
   対応する記法：
     "..." '...'   クォート（内部の空白・記号をまとめて1トークンにする）
     >  file        上書きリダイレクト
     >> file        追記リダイレクト
     <  file        入力リダイレクト（先頭ステージの標準入力にファイルを渡す）
     cmd1 | cmd2     パイプ（cmd1の標準出力をcmd2の標準入力に渡す）
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
    if(ch === "|"){
      if(cur){ tokens.push(cur); cur = ""; }
      tokens.push("|");
      continue;
    }
    if(ch === ">"){
      if(cur){ tokens.push(cur); cur = ""; }
      if(raw[i+1] === ">"){ tokens.push(">>"); i++; }
      else tokens.push(">");
      continue;
    }
    if(ch === "<"){
      if(cur){ tokens.push(cur); cur = ""; }
      tokens.push("<");
      continue;
    }
    cur += ch;
  }
  if(cur) tokens.push(cur);
  return tokens;
}

function parseStage(tokens){
  const cmd = tokens[0];
  const rest = tokens.slice(1);
  const args = [];
  let redirect = null, append = false, inputRedirect = null;
  for(let i = 0; i < rest.length; i++){
    const t = rest[i];
    if(t === ">" || t === ">>"){ redirect = rest[++i] || null; append = t === ">>"; continue; }
    if(t === "<"){ inputRedirect = rest[++i] || null; continue; }
    args.push(t);
  }
  return { cmd, args, redirect, append, inputRedirect };
}

// 戻り値: ステージ（{cmd,args,redirect,append}）の配列。空入力は null。
export function parseCommand(raw){
  const trimmed = (raw||"").trim();
  if(!trimmed) return null;
  const tokens = tokenize(trimmed);
  const stagesTokens = [[]];
  tokens.forEach(t => {
    if(t === "|") stagesTokens.push([]);
    else stagesTokens[stagesTokens.length-1].push(t);
  });
  const pipeline = stagesTokens.filter(t => t.length).map(parseStage);
  return pipeline.length ? pipeline : null;
}
