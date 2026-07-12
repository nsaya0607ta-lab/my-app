/* =========================================================================
   ミッション判定用の小さな述語（predicate）を組み立てるヘルパー集。
   どのミッションも `check(ctx) => boolean` という同じ形の関数を持つ。
   ctx = { vfs, state, pipeline, raw, isError }
     vfs      … 実行後のVirtualFileSystem（状態は既に反映済み）
     state    … 実行後のShellState（env/aliases等）
     pipeline … 実行されたパイプライン（CommandExecutorが返す展開済み配列。
                各要素は { cmd, args, redirect, append, inputRedirect }）
     raw      … 入力されたコマンド文字列そのもの
     isError  … 標準エラー出力が1行でもあったか

   ここでは「実際に状態がどう変わったか」を優先して検証する（chmod 755でも
   u+x,g+x...でも結果のモードが同じなら合格、等）。ls/grep/findのように
   状態を変えない読み取り系コマンドだけ、パイプラインの内容（コマンド名・
   フラグ・引数）を見て判定する。
   ========================================================================= */
import { modeToOctal } from '../vfs.js';

function escapeReg(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function node(ctx, path){ return ctx.vfs.getNode(ctx.vfs.resolvePath(path)); }

// --- パイプライン（コマンド・引数）検証 -------------------------------------
export const usesCmd = (name) => (ctx) => ctx.pipeline.some(s => s.cmd === name);
export const usesCmds = (...names) => (ctx) => names.every(n => ctx.pipeline.some(s => s.cmd === n));
export const cmdIs = (name) => (ctx) => ctx.pipeline.length === 1 && ctx.pipeline[0].cmd === name;
export const firstCmdIs = (name) => (ctx) => !!ctx.pipeline[0] && ctx.pipeline[0].cmd === name;
export const lastCmdIs = (name) => (ctx) => { const last = ctx.pipeline[ctx.pipeline.length - 1]; return !!last && last.cmd === name; };
export const pipelineLengthIs = (n) => (ctx) => ctx.pipeline.length === n;
export const hasPipe = (ctx) => ctx.pipeline.length > 1;
export const noError = (ctx) => !ctx.isError;

export const argIncludes = (name, val) => (ctx) => ctx.pipeline.some(s => s.cmd === name && s.args.includes(val));
export const argMatches = (name, re) => (ctx) => ctx.pipeline.some(s => s.cmd === name && s.args.some(a => re.test(a)));
export const flagUsed = (name, flag) => (ctx) => ctx.pipeline.some(s => s.cmd === name &&
  s.args.some(a => a.startsWith("-") && a !== "-" && !a.startsWith("--") && a.slice(1).includes(flag)));
export const longFlagUsed = (name, long) => (ctx) => ctx.pipeline.some(s => s.cmd === name && s.args.includes(`--${long}`));

// redirect/inputRedirectは入力された生のトークン（相対パスのことが多い）を
// 保持しているため、絶対パスと比較できるよう常にVFSの解決ルールを通す
export const redirectedTo = (absPath) => (ctx) => {
  const last = ctx.pipeline[ctx.pipeline.length - 1];
  if(!last || !last.redirect) return false;
  return ctx.vfs.absPath(ctx.vfs.resolvePath(last.redirect)) === absPath;
};
export const appendRedirectUsed = (ctx) => { const last = ctx.pipeline[ctx.pipeline.length - 1]; return !!(last && last.redirect && last.append); };
export const overwriteRedirectUsed = (ctx) => { const last = ctx.pipeline[ctx.pipeline.length - 1]; return !!(last && last.redirect && !last.append); };
export const inputRedirectIs = (absPath) => (ctx) => {
  const first = ctx.pipeline[0];
  if(!first || !first.inputRedirect) return false;
  return ctx.vfs.absPath(ctx.vfs.resolvePath(first.inputRedirect)) === absPath;
};

// --- パス・ファイル状態検証（実行後のVFSを直接見る） -----------------------
export const pwdIs = (path) => (ctx) => ctx.vfs.pwd() === path;
export const pwdEndsWith = (name) => { const re = new RegExp(`(^|/)${escapeReg(name)}$`); return (ctx) => re.test(ctx.vfs.pwd()); };

export const exists = (path) => (ctx) => !!node(ctx, path);
export const notExists = (path) => (ctx) => !node(ctx, path);
export const isDir = (path) => (ctx) => { const n = node(ctx, path); return !!n && n.type === "dir"; };
export const isFile = (path) => (ctx) => { const n = node(ctx, path); return !!n && n.type === "file"; };
export const isSymlink = (path) => (ctx) => { const raw = ctx.vfs.rawChild(ctx.vfs.resolvePath(path)); return !!raw && raw.type === "link"; };
export const linkTargetIs = (path, absTarget) => (ctx) => {
  const raw = ctx.vfs.rawChild(ctx.vfs.resolvePath(path));
  return !!raw && raw.type === "link" && ctx.vfs.absPath(raw.target) === absTarget;
};
export const isHardLinkOf = (path, ofPath) => (ctx) => {
  const a = ctx.vfs.rawChild(ctx.vfs.resolvePath(path));
  const b = ctx.vfs.rawChild(ctx.vfs.resolvePath(ofPath));
  return !!a && !!b && a === b;
};

export const contentIs = (path, text) => (ctx) => { const r = ctx.vfs.readFile(path); return !r.error && r.content === text; };
export const contentIncludes = (path, sub) => (ctx) => { const r = ctx.vfs.readFile(path); return !r.error && r.content.includes(sub); };
export const contentMatches = (path, re) => (ctx) => { const r = ctx.vfs.readFile(path); return !r.error && re.test(r.content); };
export const fileEmpty = (path) => (ctx) => { const r = ctx.vfs.readFile(path); return !r.error && r.content === ""; };

export const modeIs = (path, rwx) => (ctx) => { const n = node(ctx, path); return !!n && n.mode === rwx; };
export const octalIs = (path, octal) => (ctx) => { const n = node(ctx, path); return !!n && modeToOctal(n.mode) === octal; };
export const ownerIs = (path, owner) => (ctx) => { const n = node(ctx, path); return !!n && n.owner === owner; };
export const groupIs = (path, group) => (ctx) => { const n = node(ctx, path); return !!n && n.group === group; };

// --- シェル状態検証 ---------------------------------------------------------
export const envIs = (name, val) => (ctx) => ctx.state.env.get(name) === val;
export const envUnset = (name) => (ctx) => !ctx.state.env.has(name);
export const aliasIs = (name, val) => (ctx) => ctx.state.aliases.get(name) === val;
export const aliasUnset = (name) => (ctx) => !ctx.state.aliases.has(name);

export const processGone = (pid) => (ctx) => !ctx.state.processes.some(p => p.pid === pid);
export const processNameGone = (name) => (ctx) =>
  !ctx.state.processes.some(p => p.cmd.split(/\s+/)[0].replace(/^-/, "").replace(/^\[|\]$/g, "") === name);

// head/tail の `-n N` / `-nN` / `--lines=N` のどの書き方でも判定できるようにする
export const nFlagIs = (name, n) => (ctx) => ctx.pipeline.some(s => {
  if(s.cmd !== name) return false;
  for(let i = 0; i < s.args.length; i++){
    const a = s.args[i];
    if(a === "-n" && parseInt(s.args[i+1], 10) === n) return true;
    const short = /^-n(\d+)$/.exec(a); if(short && parseInt(short[1], 10) === n) return true;
    const long = /^--lines=(\d+)$/.exec(a); if(long && parseInt(long[1], 10) === n) return true;
  }
  return false;
});

// cut の `-d`/`-f` を、区切り文字とフィールド番号がそれぞれ一致するかで判定する
// （"-d:" 結合形でも "-d" ":" 分離形でも同じ意味として扱う。cut.js自身の
// 引数解析と同じロジックでパースし直す）
export const cutSpecIs = (delim, fields) => (ctx) => ctx.pipeline.some(s => {
  if(s.cmd !== "cut") return false;
  let d = null, f = null;
  for(let i = 0; i < s.args.length; i++){
    const a = s.args[i];
    if(a === "-d") d = s.args[++i];
    else if(a.startsWith("-d") && a.length > 2) d = a.slice(2);
    else if(a === "-f") f = s.args[++i];
    else if(a.startsWith("-f") && a.length > 2) f = a.slice(2);
  }
  return d === delim && f === fields;
});

// alias展開後ではなく「入力そのもの」で判定したいとき用（例: 定義したエイリアス
// 名をそのまま実行したことを確認する）
export const rawFirstWordIs = (word) => (ctx) => (ctx.raw || "").trim().split(/\s+/)[0] === word;

// --- 組み合わせ --------------------------------------------------------------
export const all = (...preds) => (ctx) => preds.every(p => p(ctx));
export const any = (...preds) => (ctx) => preds.some(p => p(ctx));
