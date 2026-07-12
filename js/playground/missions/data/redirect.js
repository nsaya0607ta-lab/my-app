/* =========================================================================
   カテゴリ: リダイレクト・パイプ
   対象記法・コマンド: > , >> , < , | , tee
   ========================================================================= */
import { USER } from '../../constants.js';
import {
  all, appendRedirectUsed, argIncludes, contentIs, exists, flagUsed, hasPipe,
  inputRedirectIs, isDir, overwriteRedirectUsed, pipelineLengthIs, pwdEndsWith,
  redirectedTo, usesCmd, usesCmds,
} from '../helpers.js';

const HOME = `/home/${USER}`;
const LAB = `${HOME}/redirlab`;

export const redirectMissions = [
  {
    id: "redirect-01", category: "redirect", level: "beginner",
    title: "redirlab という名前のディレクトリを作成してください。",
    hint: "mkdir redirlab",
    answer: "mkdir redirlab",
    explanation: "このカテゴリの作業場所として redirlab ディレクトリを使います。",
    check: isDir(LAB),
  },
  {
    id: "redirect-02", category: "redirect", level: "beginner",
    title: "redirlab ディレクトリへ移動してください。",
    hint: "cd redirlab",
    answer: "cd redirlab",
    explanation: "以降のミッションは redirlab ディレクトリの中で進めます。",
    check: pwdEndsWith("redirlab"),
  },
  {
    id: "redirect-03", category: "redirect", level: "beginner",
    title: "echo で out.txt に「first」という内容を書き込んでください（上書き）。",
    hint: "> は上書きリダイレクトです。",
    answer: 'echo "first" > out.txt',
    explanation: "> は標準出力の先をファイルへ切り替えます。ファイルが既にあれば中身は上書きされます。",
    check: all(usesCmd("echo"), overwriteRedirectUsed, redirectedTo(`${LAB}/out.txt`), contentIs(`${LAB}/out.txt`, "first\n")),
  },
  {
    id: "redirect-04", category: "redirect", level: "beginner",
    title: "out.txt に「second」という内容を追記してください（上書きしないこと）。",
    hint: ">> は追記リダイレクトです。",
    answer: 'echo "second" >> out.txt',
    explanation: ">> を使うと、既存の内容を残したまま末尾に追加できます。",
    check: all(usesCmd("echo"), appendRedirectUsed, redirectedTo(`${LAB}/out.txt`), contentIs(`${LAB}/out.txt`, "first\nsecond\n")),
  },
  {
    id: "redirect-05", category: "redirect", level: "intermediate",
    title: "cat で out.txt の内容を表示し、その結果を wc -l へパイプで渡して行数を数えてください。",
    hint: "cat out.txt | wc -l",
    answer: "cat out.txt | wc -l",
    explanation: "| （パイプ）は、前のコマンドの標準出力を、次のコマンドの標準入力へそのままつなげます。",
    check: all(hasPipe, usesCmds("cat", "wc"), flagUsed("wc", "l")),
  },
  {
    id: "redirect-06", category: "redirect", level: "intermediate",
    title: "cat out.txt の結果を grep へパイプでつないで、「first」を含む行だけを表示してください。",
    hint: "cat out.txt | grep first",
    answer: "cat out.txt | grep first",
    explanation: "パイプは何段でもつなげられ、複数のコマンドを組み合わせて1つの処理を作れます。",
    check: all(hasPipe, usesCmds("cat", "grep"), argIncludes("grep", "first")),
  },
  {
    id: "redirect-07", category: "redirect", level: "intermediate",
    title: "ls の結果を tee で list.txt へ保存しつつ、画面にも表示してください。",
    hint: "ls | tee list.txt",
    answer: "ls | tee list.txt",
    explanation: "tee は標準入力の内容を画面（標準出力）とファイルの両方へ同時に出力する、分岐コックのようなコマンドです。",
    check: all(hasPipe, usesCmds("ls", "tee"), argIncludes("tee", "list.txt"), exists(`${LAB}/list.txt`)),
  },
  {
    id: "redirect-08", category: "redirect", level: "intermediate",
    title: "echo \"more\" の結果を tee -a で out.txt に追記してください。",
    hint: "tee は既定では上書きですが、-a オプションを付けると追記になります。",
    answer: 'echo "more" | tee -a out.txt',
    explanation: "tee -a は echo … >> と似ていますが、画面にも同時に表示される点が異なります。",
    check: all(hasPipe, usesCmds("echo", "tee"), argIncludes("tee", "-a"), argIncludes("tee", "out.txt")),
  },
  {
    id: "redirect-09", category: "redirect", level: "intermediate",
    title: "< を使って、out.txt の内容を標準入力として wc -l に渡し、行数を数えてください。",
    hint: "wc -l < out.txt のように、コマンドの後ろに < ファイル名 を書きます。",
    answer: "wc -l < out.txt",
    explanation: "< は入力リダイレクトで、キーボードからの入力の代わりにファイルの内容を標準入力として渡します。",
    check: all(usesCmd("wc"), flagUsed("wc", "l"), inputRedirectIs(`${LAB}/out.txt`)),
  },
  {
    id: "redirect-10", category: "redirect", level: "intermediate",
    title: "out.txt を < で読み込んで sort し、結果を sorted.txt へ > で保存してください。",
    hint: "sort < out.txt > sorted.txt のように、入力と出力のリダイレクトを同時に使えます。",
    answer: "sort < out.txt > sorted.txt",
    explanation: "1つのコマンドに対して、入力リダイレクト（<）と出力リダイレクト（>）を同時に指定することもできます。",
    check: all(usesCmd("sort"), inputRedirectIs(`${LAB}/out.txt`), overwriteRedirectUsed, redirectedTo(`${LAB}/sorted.txt`)),
  },
  {
    id: "redirect-11", category: "redirect", level: "intermediate",
    title: "cat out.txt | sort | uniq を実行し、その結果を final.txt へ保存してください。",
    hint: "パイプは複数つなげられます。最後の段にだけ > を付けます。",
    answer: "cat out.txt | sort | uniq > final.txt",
    explanation: "3段以上のパイプラインでも、最後のコマンドの出力だけを > でファイルへリダイレクトできます。",
    check: all(pipelineLengthIs(3), usesCmds("cat", "sort", "uniq"), overwriteRedirectUsed, redirectedTo(`${LAB}/final.txt`)),
  },
];
