/* =========================================================================
   カテゴリ: その他
   対象コマンド: history, clear, man, help
   ========================================================================= */
import { all, argIncludes, cmdIs, hasPipe, usesCmd, usesCmds } from '../helpers.js';

export const miscMissions = [
  {
    id: "misc-01", category: "misc", level: "beginner",
    title: "help で対応しているコマンドの一覧を表示してください。",
    hint: "help",
    answer: "help",
    explanation: "help は、この環境で使える全コマンドをカテゴリ別に一覧表示します。",
    check: cmdIs("help"),
  },
  {
    id: "misc-02", category: "misc", level: "beginner",
    title: "man で ls コマンドのマニュアルを表示してください。",
    hint: "man コマンド名",
    answer: "man ls",
    explanation: "man（manual）は、指定したコマンドの使い方・オプションの説明を表示します。",
    check: all(usesCmd("man"), argIncludes("man", "ls")),
  },
  {
    id: "misc-03", category: "misc", level: "beginner",
    title: "man で chmod コマンドのマニュアルを表示してください。",
    hint: "man chmod",
    answer: "man chmod",
    explanation: "分からないコマンドがあれば、まず man で調べる習慣をつけましょう。",
    check: all(usesCmd("man"), argIncludes("man", "chmod")),
  },
  {
    id: "misc-04", category: "misc", level: "beginner",
    title: "man で grep コマンドのマニュアルを表示してください。",
    hint: "man grep",
    answer: "man grep",
    explanation: "grep のオプション（-i, -v, -n, -c など）もmanで確認できます。",
    check: all(usesCmd("man"), argIncludes("man", "grep")),
  },
  {
    id: "misc-05", category: "misc", level: "beginner",
    title: "history でこれまでに入力したコマンドの履歴を表示してください。",
    hint: "history",
    answer: "history",
    explanation: "history は、これまで入力したコマンドを番号付きで一覧表示します。↑/↓キーでの呼び出しにも使われています。",
    check: cmdIs("history"),
  },
  {
    id: "misc-06", category: "misc", level: "beginner",
    title: "clear でターミナルの画面をクリアしてください。",
    hint: "clear",
    answer: "clear",
    explanation: "clear は画面表示だけをクリアし、コマンド履歴やファイルシステムの状態には影響しません。",
    check: cmdIs("clear"),
  },
  {
    id: "misc-07", category: "misc", level: "intermediate",
    title: "history の出力を grep へパイプでつないで、「man」を含む履歴だけを表示してください。",
    hint: "history | grep man",
    answer: "history | grep man",
    explanation: "history もパイプでつなげられるので、grep と組み合わせれば過去に打った特定のコマンドだけを絞り込めます。",
    check: all(hasPipe, usesCmds("history", "grep"), argIncludes("grep", "man")),
  },
];
