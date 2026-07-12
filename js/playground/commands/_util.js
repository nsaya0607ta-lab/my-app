/* =========================================================================
   コマンド実装が共通で使う小道具（トークン行の生成・フラグ解析・
   errno風メッセージ・サイズ整形など）。各 commands/*.js から読み込む。
   ========================================================================= */

export const LINE = (text, cls) => [{ text, cls }];
export const outLine = (text) => LINE(text);
export const errLine = (text) => LINE(text, "pg-err");

export const ERRNO_TEXT = {
  ENOENT: "No such file or directory",
  EISDIR: "Is a directory",
  ENOTDIR: "Not a directory",
  EACCES: "Permission denied",
  ENOTEMPTY: "Directory not empty",
  EEXIST: "File exists",
  ELOOP: "Too many levels of symbolic links",
  EINVAL: "invalid mode",
};

export function errnoText(err){
  return ERRNO_TEXT[err.error] || "Unknown error";
}

// "-la" "-l" "--all" のような引数列を { flags:Set(短縮1文字), long:Set(--長い名前), operands:[残りの引数] } に分解する
export function parseFlags(args){
  const flags = new Set();
  const long = new Set();
  const operands = [];
  for(const arg of args){
    if(arg === "-" || !arg.startsWith("-")){ operands.push(arg); continue; }
    if(arg.startsWith("--")){ long.add(arg.slice(2)); continue; }
    arg.slice(1).split("").forEach(ch => flags.add(ch));
  }
  return { flags, long, operands };
}

export function ok(result){ return result && !result.error; }

export function fsError(cmd, verb, err){
  const path = err.path;
  const text = errnoText(err);
  if(verb) return errLine(`${cmd}: ${verb} '${path}': ${text}`);
  return errLine(`${cmd}: ${path}: ${text}`);
}

// バイト数 -> 人間が読みやすい単位（du/df/free -h 用。1024基準）
export function humanSize(bytes){
  const units = ["B", "K", "M", "G", "T"];
  let v = bytes, i = 0;
  while(v >= 1024 && i < units.length - 1){ v /= 1024; i++; }
  const num = i === 0 ? String(v) : (v >= 10 ? v.toFixed(0) : v.toFixed(1));
  return `${num}${units[i]}`;
}

export function pad(str, width){
  str = String(str);
  return str.length >= width ? str : str + " ".repeat(width - str.length);
}
export function padStart(str, width){
  str = String(str);
  return str.length >= width ? str : " ".repeat(width - str.length) + str;
}

const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const WEEK_ABBR = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export function formatMtime(d){
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const mon = MONTH_ABBR[d.getMonth()];
  const day = padStart(d.getDate(), 2);
  if(sameYear){
    const hh = padStart(d.getHours(), 2);
    const mm = padStart(d.getMinutes(), 2);
    return `${mon} ${day} ${hh}:${mm}`;
  }
  return `${mon} ${day}  ${d.getFullYear()}`;
}

export { MONTH_ABBR, WEEK_ABBR };

// which / whereis / man /補完の対象になる「インストール済みコマンド」一覧
export const PATH_COMMANDS = [
  "pwd","ls","cd","mkdir","rmdir","touch","cp","mv","rm","cat","less","head","tail",
  "echo","nano","find","locate","which","whereis","grep","sort","uniq","wc","cut","tr",
  "chmod","chown","ln","df","du","free","ps","top","kill","killall","hostname","whoami",
  "id","uname","date","cal","history","clear","man","help","env","export","alias","unalias",
  "crontab","tee","awk",
];

export const BIN_DIR = {
  cd: null, echo: "/bin", pwd: "/bin", export: null, alias: null, unalias: null,
  history: null, help: null, clear: "/usr/bin", crontab: "/usr/bin",
};

export function binPathFor(cmd){
  if(cmd in BIN_DIR) return BIN_DIR[cmd];
  return ["ls","cp","mv","rm","cat","mkdir","rmdir","touch","chmod","chown","ln","df","du","free","ps","kill","hostname","whoami","id","uname","date","which"].includes(cmd)
    ? "/bin" : "/usr/bin";
}
