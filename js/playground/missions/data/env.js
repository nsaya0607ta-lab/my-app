/* =========================================================================
   カテゴリ: 環境変数
   対象コマンド: env, export, alias, unalias
   ========================================================================= */
import {
  all, aliasIs, aliasUnset, cmdIs, envIs, rawFirstWordIs, usesCmd,
} from '../helpers.js';

export const envMissions = [
  {
    id: "env-01", category: "env", level: "beginner",
    title: "env で現在設定されている環境変数の一覧を表示してください。",
    hint: "env",
    answer: "env",
    explanation: "env は、現在のシェルに設定されているすべての環境変数を「名前=値」の形式で一覧表示します。",
    check: cmdIs("env"),
  },
  {
    id: "env-02", category: "env", level: "beginner",
    title: "export で MYVAR という環境変数に hello という値を設定してください。",
    hint: "export 名前=値",
    answer: "export MYVAR=hello",
    explanation: "export は、シェル変数を「環境変数」として設定し、子プロセスにも引き継がれるようにします。",
    check: envIs("MYVAR", "hello"),
  },
  {
    id: "env-03", category: "env", level: "beginner",
    title: "export で PROMPT_TAG という環境変数に study という値を設定してください。",
    hint: "export PROMPT_TAG=study",
    answer: "export PROMPT_TAG=study",
    explanation: "環境変数は好きな名前で何個でも設定できます。",
    check: envIs("PROMPT_TAG", "study"),
  },
  {
    id: "env-04", category: "env", level: "intermediate",
    title: "alias で ll2 という名前のエイリアスを ls -la として登録してください。",
    hint: "alias 名前='コマンド' の形式で登録します。",
    answer: "alias ll2='ls -la'",
    explanation: "alias は長いコマンドに短い別名を付けられる機能で、よく使うコマンドの入力を省略するのに便利です。",
    check: aliasIs("ll2", "ls -la"),
  },
  {
    id: "env-05", category: "env", level: "beginner",
    title: "alias（引数なし）で、現在登録されているエイリアスの一覧を表示してください。",
    hint: "alias",
    answer: "alias",
    explanation: "alias を引数なしで実行すると、登録済みのエイリアスがすべて一覧表示されます。",
    check: cmdIs("alias"),
  },
  {
    id: "env-06", category: "env", level: "intermediate",
    title: "先ほど登録した ll2 というエイリアスを、実際にコマンドとして実行してみてください。",
    hint: "エイリアス名をそのままコマンドのように入力するだけです（ll2 と入力してEnter）。",
    answer: "ll2",
    explanation: "エイリアスを実行すると、登録しておいた本来のコマンド（ここでは ls -la）に置き換えられてから実行されます。",
    check: all(rawFirstWordIs("ll2"), usesCmd("ls")),
  },
  {
    id: "env-07", category: "env", level: "intermediate",
    title: "unalias で ll2 エイリアスを削除してください。",
    hint: "unalias 名前",
    answer: "unalias ll2",
    explanation: "unalias は登録したエイリアスを削除します。削除後に ll2 と入力しても、もう ls -la には展開されなくなります。",
    check: aliasUnset("ll2"),
  },
  {
    id: "env-08", category: "env", level: "intermediate",
    title: "unalias -a で、登録されているエイリアスをすべて削除してください。",
    hint: "-a オプション（all）を付けると、登録済みのエイリアスを一括削除できます。",
    answer: "unalias -a",
    explanation: "-a を付けると、最初から用意されていた ll・la・l などの既定のエイリアスも含め、すべて削除されます。",
    check: (ctx) => ctx.state.aliases.size === 0,
  },
];
