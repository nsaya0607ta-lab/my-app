/* =========================================================================
   CommandExecutor — CommandParserが解釈したパイプライン（ステージの配列）を
   コマンドレジストリ（commands/index.js）経由で順に実行し、パイプ
   （前段の標準出力を次段の標準入力へ）とリダイレクト（> / >>）を再現する。
   alias展開もここで行う（実行直前に、各ステージの先頭語をaliasマップで
   置き換える。無限ループ防止のため同一名は1回のみ展開する）。

   戻り値: { lines, err, overlay, clear, isError }
     lines … 最終ステージの標準出力（ターミナル描画用トークン行の配列）
     err   … 全ステージ分の標準エラー出力
     overlay … nano/lessなど、通常のターミナル行ではなく専用画面を開く場合
     clear   … clearコマンド実行時のみ true
   ========================================================================= */
import { COMMAND_REGISTRY } from './commands/index.js';
import { errLine, fsError } from './commands/_util.js';

function expandAliases(pipeline, aliases){
  return pipeline.map(stage => {
    let cmd = stage.cmd;
    let extra = [];
    const seen = new Set();
    while(aliases.has(cmd) && !seen.has(cmd)){
      seen.add(cmd);
      const parts = aliases.get(cmd).trim().split(/\s+/).filter(Boolean);
      if(!parts.length) break;
      cmd = parts[0];
      extra = parts.slice(1).concat(extra);
    }
    return { ...stage, cmd, args: extra.concat(stage.args) };
  });
}

// 実際のコマンド出力と同様、各行は改行で終端される（末尾行も含む）ものとして
// パイプ・リダイレクトへ渡す（例: `... | wc -l` が正しい行数を数えられるように）。
function linesToText(lines){
  if(!lines.length) return "";
  return lines.map(tokens => tokens.map(t => t.text).join("")).join("\n") + "\n";
}

export function executeCommand(env, pipeline){
  const { vfs, state, session } = env;
  const expanded = expandAliases(pipeline, state.aliases);

  let stdin = null;
  let lastLines = [];
  let overlay = null;
  let awaitPassword = null;
  let cleared = false;
  const err = [];

  if(expanded[0] && expanded[0].inputRedirect){
    const res = vfs.readFile(expanded[0].inputRedirect);
    if(res.error) return { lines:[], err:[ fsError("bash", null, res.error) ], isError:true, pipeline: expanded };
    stdin = res.content;
  }

  for(let i = 0; i < expanded.length; i++){
    const stage = expanded[i];
    const isLast = i === expanded.length - 1;
    const handler = COMMAND_REGISTRY[stage.cmd];
    if(!handler){
      err.push(errLine(`${stage.cmd}: command not found`));
      lastLines = [];
      stdin = "";
      continue;
    }
    const ctx = { vfs, state, session, history: env.history, args: stage.args, stdin };
    const result = handler(ctx) || { lines:[], err:[] };
    if(result.clear){ cleared = true; break; }
    (result.err || []).forEach(l => err.push(l));
    lastLines = result.lines || [];
    if(result.overlay && isLast) overlay = result.overlay;
    if(result.awaitPassword && isLast) awaitPassword = result.awaitPassword;
    stdin = linesToText(lastLines);
  }

  if(cleared) return { clear:true };

  let displayLines = lastLines;
  const lastStage = expanded[expanded.length - 1];
  if(!overlay && lastStage && lastStage.redirect){
    const res = vfs.writeFile(lastStage.redirect, linesToText(lastLines), { append: lastStage.append });
    if(res.error) err.push(fsError("bash", null, res.error));
    displayLines = [];
  }

  return { lines: displayLines, err, overlay, awaitPassword, isError: err.length > 0, pipeline: expanded };
}
