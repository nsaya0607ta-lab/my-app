/* =========================================================================
   カテゴリ: 検索
   対象コマンド: find, locate, which, whereis, grep
   ========================================================================= */
import { USER } from '../../constants.js';
import {
  all, argIncludes, argMatches, contentIs, flagUsed, isDir, isFile, overwriteRedirectUsed,
  pwdEndsWith, redirectedTo, usesCmd,
} from '../helpers.js';

const HOME = `/home/${USER}`;
const LAB = `${HOME}/search-lab`;

export const searchMissions = [
  {
    id: "search-01", category: "search", level: "beginner",
    title: "search-lab という名前のディレクトリを作成してください。",
    hint: "mkdir search-lab",
    answer: "mkdir search-lab",
    explanation: "このカテゴリの作業場所として search-lab ディレクトリを使います。",
    check: isDir(LAB),
  },
  {
    id: "search-02", category: "search", level: "beginner",
    title: "search-lab ディレクトリへ移動してください。",
    hint: "cd search-lab",
    answer: "cd search-lab",
    explanation: "以降のミッションは search-lab ディレクトリの中で進めます。",
    check: pwdEndsWith("search-lab"),
  },
  {
    id: "search-03", category: "search", level: "beginner",
    title: "app.log error.log access.log という3個の空ファイルを一度に作成してください。",
    hint: "touch には複数のファイル名を並べて指定できます。",
    answer: "touch app.log error.log access.log",
    explanation: "続く grep / find の練習用にログファイルを用意します。",
    check: all(isFile(`${LAB}/app.log`), isFile(`${LAB}/error.log`), isFile(`${LAB}/access.log`)),
  },
  {
    id: "search-04", category: "search", level: "beginner",
    title: "echo で app.log に「ERROR: disk full」という行を書き込んでください。",
    hint: 'echo "ERROR: disk full" > app.log',
    answer: 'echo "ERROR: disk full" > app.log',
    explanation: "grep で検索するための、それらしいログ内容を作ります。",
    check: all(usesCmd("echo"), overwriteRedirectUsed, redirectedTo(`${LAB}/app.log`), contentIs(`${LAB}/app.log`, "ERROR: disk full\n")),
  },
  {
    id: "search-05", category: "search", level: "beginner",
    title: "app.log に「INFO: started」という行を追記してください。",
    hint: 'echo "INFO: started" >> app.log',
    answer: 'echo "INFO: started" >> app.log',
    explanation: "追記には >> を使います。",
    check: contentIs(`${LAB}/app.log`, "ERROR: disk full\nINFO: started\n"),
  },
  {
    id: "search-06", category: "search", level: "beginner",
    title: "app.log に「ERROR: timeout」という行をさらに追記してください。",
    hint: 'echo "ERROR: timeout" >> app.log',
    answer: 'echo "ERROR: timeout" >> app.log',
    explanation: "ERROR という文字列を含む行が2行になりました。次から grep で検索してみましょう。",
    check: contentIs(`${LAB}/app.log`, "ERROR: disk full\nINFO: started\nERROR: timeout\n"),
  },
  {
    id: "search-07", category: "search", level: "beginner",
    title: "grep で app.log から「ERROR」を含む行を検索してください。",
    hint: "grep パターン ファイル名 の順で指定します。",
    answer: "grep ERROR app.log",
    explanation: "grep は指定したパターン（正規表現）にマッチする行だけを表示します。",
    check: all(usesCmd("grep"), argIncludes("grep", "ERROR"), argIncludes("grep", "app.log")),
  },
  {
    id: "search-08", category: "search", level: "intermediate",
    title: "grep -i で大文字・小文字を区別せずに「error」を検索してください。",
    hint: "-i オプション（ignore case）を付けます。",
    answer: "grep -i error app.log",
    explanation: "-i を付けると、ERROR でも error でも Error でも同じものとして検索します。",
    check: all(usesCmd("grep"), flagUsed("grep", "i"), argMatches("grep", /^error$/i)),
  },
  {
    id: "search-09", category: "search", level: "intermediate",
    title: "grep -n で行番号付きで「ERROR」を検索してください。",
    hint: "-n オプションを付けると、マッチした行の行番号も一緒に表示されます。",
    answer: "grep -n ERROR app.log",
    explanation: "-n（number）は、ログの何行目に該当するかを確認したいときに便利です。",
    check: all(usesCmd("grep"), flagUsed("grep", "n"), argIncludes("grep", "ERROR")),
  },
  {
    id: "search-10", category: "search", level: "intermediate",
    title: "grep -v で「ERROR」を含まない行だけを表示してください。",
    hint: "-v オプション（invert）を付けると、マッチしなかった行だけが表示されます。",
    answer: "grep -v ERROR app.log",
    explanation: "-v は「除外検索」に使います。ログから特定の種類の行だけを取り除きたいときに便利です。",
    check: all(usesCmd("grep"), flagUsed("grep", "v"), argIncludes("grep", "ERROR")),
  },
  {
    id: "search-11", category: "search", level: "intermediate",
    title: "grep -c で「ERROR」にマッチした行数だけを表示してください。",
    hint: "-c オプション（count）を付けると、マッチした行の内容ではなく件数のみが表示されます。",
    answer: "grep -c ERROR app.log",
    explanation: "-c は該当行数だけを知りたいときに便利で、内容そのものは表示されません。",
    check: all(usesCmd("grep"), flagUsed("grep", "c"), argIncludes("grep", "ERROR")),
  },
  {
    id: "search-12", category: "search", level: "intermediate",
    title: "find で、現在のディレクトリ以下から拡張子が .log のファイルを検索してください。",
    hint: 'find . -name "*.log" のようにワイルドカード付きで指定します。',
    answer: 'find . -name "*.log"',
    explanation: "find は -name オプションで名前のパターン（*, ? のワイルドカードが使える）を指定して検索できます。",
    check: all(usesCmd("find"), argIncludes("find", "-name"), argMatches("find", /\*\.log/)),
  },
  {
    id: "search-13", category: "search", level: "intermediate",
    title: "find で、現在のディレクトリ以下からファイル（ディレクトリではない）だけを検索してください。",
    hint: "-type f を付けると、通常ファイルだけに絞り込めます。",
    answer: "find . -type f",
    explanation: "-type オプションでは f（ファイル）、d（ディレクトリ）、l（シンボリックリンク）で種類を絞り込めます。",
    check: all(usesCmd("find"), argIncludes("find", "-type"), argIncludes("find", "f")),
  },
  {
    id: "search-14", category: "search", level: "beginner",
    title: "which で grep コマンドの実行ファイルの場所を調べてください。",
    hint: "which コマンド名",
    answer: "which grep",
    explanation: "which は、そのコマンドを実行したときに使われる実行ファイルのパスを、PATH環境変数の中から探して表示します。",
    check: all(usesCmd("which"), argIncludes("which", "grep")),
  },
  {
    id: "search-15", category: "search", level: "beginner",
    title: "whereis で grep コマンドの実行ファイル・マニュアルの場所を調べてください。",
    hint: "whereis コマンド名",
    answer: "whereis grep",
    explanation: "whereis は which よりも詳しく、実行ファイルに加えてmanページの場所なども表示します。",
    check: all(usesCmd("whereis"), argIncludes("whereis", "grep")),
  },
  {
    id: "search-16", category: "search", level: "intermediate",
    title: "locate で app.log というファイルを検索してください。",
    hint: "locate パターン で、ファイル名データベースの中からパターンを含むパスを検索します。",
    answer: "locate app.log",
    explanation: "locate は find と違い、あらかじめ作られたファイル名の索引（データベース）から高速に検索する仕組みです（本環境では常に最新のファイル一覧から検索します）。",
    check: all(usesCmd("locate"), argIncludes("locate", "app.log")),
  },
];
