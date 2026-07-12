/* =========================================================================
   コマンドレジストリ — コマンド名 -> run(ctx) 実装のマップ。
   新しいコマンドを追加する場合は commands/*.js に1ファイル追加し、
   ここへ登録するだけでよい（screen.js / commandExecutor.js の変更は不要）。
   ========================================================================= */
import pwd from './pwd.js';
import ls from './ls.js';
import cd from './cd.js';
import mkdir from './mkdir.js';
import rmdir from './rmdir.js';
import touch from './touch.js';
import cp from './cp.js';
import mv from './mv.js';
import rm from './rm.js';
import cat from './cat.js';
import less from './less.js';
import head from './head.js';
import tail from './tail.js';
import echo from './echo.js';
import nano from './nano.js';
import find from './find.js';
import locate from './locate.js';
import which from './which.js';
import whereis from './whereis.js';
import grep from './grep.js';
import sort from './sort.js';
import uniq from './uniq.js';
import wc from './wc.js';
import cut from './cut.js';
import tr from './tr.js';
import chmod from './chmod.js';
import chown from './chown.js';
import ln from './ln.js';
import df from './df.js';
import du from './du.js';
import free from './free.js';
import ps from './ps.js';
import top from './top.js';
import kill from './kill.js';
import killall from './killall.js';
import hostname from './hostname.js';
import whoami from './whoami.js';
import id from './id.js';
import uname from './uname.js';
import date from './date.js';
import cal from './cal.js';
import history from './history.js';
import clear from './clear.js';
import man from './man.js';
import help from './help.js';
import env from './env.js';
import exportCmd from './export.js';
import alias from './alias.js';
import unalias from './unalias.js';
import crontab from './crontab.js';
import tee from './tee.js';
import awk from './awk.js';
import su from './su.js';
import exitCmd from './exit.js';

export const COMMAND_REGISTRY = {
  pwd, ls, cd, mkdir, rmdir, touch, cp, mv, rm, cat, less, head, tail, echo, nano,
  find, locate, which, whereis, grep, sort, uniq, wc, cut, tr, chmod, chown, ln,
  df, du, free, ps, top, kill, killall, hostname, whoami, id, uname, date, cal,
  history, clear, man, help, env, export: exportCmd, alias, unalias, crontab, tee, awk,
  su, exit: exitCmd,
};

export const COMMAND_NAMES = Object.keys(COMMAND_REGISTRY);
