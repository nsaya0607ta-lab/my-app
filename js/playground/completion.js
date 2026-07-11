/* =========================================================================
   Tab補完 — 入力中の1単語目はコマンド名／alias名、2単語目以降はVFS上の
   ファイル・ディレクトリ名を候補として補完する。bashと同様に、
   候補が1つなら確定、複数なら共通接頭辞まで、それ以上伸ばせなければ
   候補一覧を返す（呼び出し側がターミナルへ表示する）。
   ========================================================================= */

function splitWords(str){
  const words = [];
  const re = /\S+/g;
  let m;
  while((m = re.exec(str))) words.push({ value: m[0], start: m.index, end: m.index + m[0].length });
  return words;
}

function isCommandPosition(left, wordStart){
  const before = left.slice(0, wordStart).trim();
  return before === "" || before.endsWith("|");
}

function longestCommonPrefix(strings){
  let lcp = strings[0];
  for(const s of strings.slice(1)){
    let i = 0;
    while(i < lcp.length && i < s.length && lcp[i] === s[i]) i++;
    lcp = lcp.slice(0, i);
  }
  return lcp;
}

function completeFilename(vfs, prefix){
  const slashIdx = prefix.lastIndexOf("/");
  const dirPart = slashIdx >= 0 ? (prefix.slice(0, slashIdx) || (prefix.startsWith("/") ? "/" : "")) : "";
  const namePart = slashIdx >= 0 ? prefix.slice(slashIdx + 1) : prefix;
  const listPath = dirPart || ".";
  const res = vfs.list(listPath);
  if(res.error) return [];
  return res.entries
    .filter(e => e.name.startsWith(namePart))
    .map(e => ({ label: (dirPart ? dirPart + "/" : "") + e.name, isDir: e.type === "dir" }));
}

// text/cursorPos: 入力欄の現在の文字列とカーソル位置
// ctx: { vfs, commandNames: string[] }
export function getCompletions(text, cursorPos, ctx){
  const left = text.slice(0, cursorPos);
  const words = splitWords(left);
  const endsWithSpace = left.length === 0 || /\s$/.test(left);
  let wordStart, prefix;
  if(!words.length || endsWithSpace){
    wordStart = cursorPos;
    prefix = "";
  } else {
    const last = words[words.length - 1];
    wordStart = last.start;
    prefix = last.value;
  }

  const commandPos = isCommandPosition(left, wordStart);
  const matches = commandPos
    ? [...new Set(ctx.commandNames)].filter(n => n.startsWith(prefix)).sort().map(label => ({ label, isDir:false }))
    : completeFilename(ctx.vfs, prefix);

  if(matches.length === 0) return { wordStart, prefix, matches: [] };
  if(matches.length === 1){
    const m = matches[0];
    return { wordStart, prefix, matches, completion: m.label + (m.isDir ? "/" : " ") };
  }
  const lcp = longestCommonPrefix(matches.map(m => m.label));
  if(lcp.length > prefix.length) return { wordStart, prefix, matches, completion: lcp };
  return { wordStart, prefix, matches };
}
