import { outLine, LINE } from './_util.js';

const GROUPS = [
  ["ファイル操作", ["pwd","ls","cd","mkdir","rmdir","touch","cp","mv","rm","ln","find","locate"]],
  ["テキスト処理", ["cat","less","head","tail","echo","nano","grep","sort","uniq","wc","cut","tr","awk"]],
  ["権限", ["chmod","chown"]],
  ["ユーザー切替", ["su","exit"]],
  ["システム情報", ["df","du","free","ps","top","kill","killall","hostname","whoami","id","uname","date","cal","crontab"]],
  ["シェル", ["history","clear","man","help","env","export","alias","unalias","which","whereis"]],
  ["リダイレクト／パイプ", ["tee"]],
];

export default function help(){
  const lines = [ outLine("対応コマンド一覧（詳しい使い方は man コマンド名 で確認できます）：") ];
  GROUPS.forEach(([title, cmds]) => {
    lines.push(outLine(""));
    lines.push(LINE(`# ${title}`, "pg-muted"));
    lines.push(outLine(`  ${cmds.join("  ")}`));
  });
  return { lines, err:[] };
}
