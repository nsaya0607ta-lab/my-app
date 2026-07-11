/* =========================================================================
   CommandExecutor — CommandParserが解釈した { cmd, args, redirect } を
   VirtualFileSystemへ適用し、ターミナルに描画する行データを返す。
   戻り値は { lines, isError } か、clear専用の { clear:true } のいずれか。
   lines は「1行 = トークン配列」の形（[{text, cls}]の配列）で、
   ls のディレクトリ／ファイルの色分けなどに使う。
   ========================================================================= */

const LINE = (text, cls) => [{ text, cls }];

const HELP_LINES = [
  LINE("対応コマンド一覧："),
  LINE("  pwd            現在のディレクトリを表示"),
  LINE("  ls             現在のディレクトリの中身を表示"),
  LINE("  cd <dir>       ディレクトリを移動"),
  LINE("  mkdir <name>   ディレクトリを作成"),
  LINE("  touch <name>   空のファイルを作成"),
  LINE("  cat <file>     ファイルの中身を表示"),
  LINE("  echo <text>    文字列を表示（> file で書き込み）"),
  LINE("  clear          画面をクリア"),
  LINE("  help           このヘルプを表示"),
];

function execLs(vfs, args){
  const res = vfs.list(args[0]);
  if(res.error) return { lines:[LINE(res.error, "pg-err")], isError:true };
  if(!res.entries.length) return { lines:[], isError:false };
  const tokens = res.entries.map(e => ({ text: e.name, cls: e.type === "dir" ? "pg-dir" : "pg-file" }));
  return { lines:[tokens], isError:false };
}

function execCd(vfs, args){
  const res = vfs.changeDir(args[0]);
  if(res.error) return { lines:[LINE(res.error, "pg-err")], isError:true };
  return { lines:[], isError:false };
}

function execMkdir(vfs, args){
  const res = vfs.makeDir(args[0]);
  if(res.error) return { lines:[LINE(res.error, "pg-err")], isError:true };
  return { lines:[], isError:false };
}

function execTouch(vfs, args){
  const res = vfs.touch(args[0]);
  if(res.error) return { lines:[LINE(res.error, "pg-err")], isError:true };
  return { lines:[], isError:false };
}

function execCat(vfs, args){
  const res = vfs.readFile(args[0]);
  if(res.error) return { lines:[LINE(res.error, "pg-err")], isError:true };
  if(!res.content) return { lines:[], isError:false };
  const body = res.content.endsWith("\n") ? res.content.slice(0,-1) : res.content;
  return { lines: body.split("\n").map(l => LINE(l)), isError:false };
}

function execEcho(vfs, args, redirect){
  const text = args.join(" ");
  if(!redirect) return { lines:[LINE(text)], isError:false };
  const res = vfs.writeFile(redirect, text + "\n");
  if(res.error) return { lines:[LINE(res.error, "pg-err")], isError:true };
  return { lines:[], isError:false };
}

export function executeCommand(vfs, parsed){
  switch(parsed.cmd){
    case "pwd": return { lines:[LINE(vfs.pwd())], isError:false };
    case "ls": return execLs(vfs, parsed.args);
    case "cd": return execCd(vfs, parsed.args);
    case "mkdir": return execMkdir(vfs, parsed.args);
    case "touch": return execTouch(vfs, parsed.args);
    case "cat": return execCat(vfs, parsed.args);
    case "echo": return execEcho(vfs, parsed.args, parsed.redirect);
    case "clear": return { clear:true };
    case "help": return { lines: HELP_LINES, isError:false };
    default: return { lines:[LINE(`${parsed.cmd}: command not found`, "pg-err")], isError:true };
  }
}
