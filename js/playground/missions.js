/* =========================================================================
   Missions — Linuxプレイグラウンドのチュートリアル課題（5問固定）。
   各ミッションは、直前に実行されたコマンド（CommandParserの解釈結果）と
   実行後のVFSの状態から、達成したかどうかを check() で判定する。
   ========================================================================= */

export const MISSIONS = [
  {
    title: "studyフォルダを作成してください",
    hint: "mkdir コマンドを使うと、新しいディレクトリを作成できます。",
    answer: "mkdir study",
    check: (parsed) => parsed.cmd === "mkdir" && parsed.args[0] === "study",
  },
  {
    title: "studyへ移動してください",
    hint: "cd コマンドでディレクトリを移動できます。",
    answer: "cd study",
    check: (parsed, vfs) => parsed.cmd === "cd" && /(^|\/)study$/.test(vfs.pwd()),
  },
  {
    title: "linux.txtを作成してください",
    hint: "touch コマンドで空のファイルを作成できます。",
    answer: "touch linux.txt",
    check: (parsed) => parsed.cmd === "touch" && parsed.args[0] === "linux.txt",
  },
  {
    title: "linux.txtをcatで表示してください",
    hint: "cat コマンドでファイルの中身を表示できます。",
    answer: "cat linux.txt",
    check: (parsed) => parsed.cmd === "cat" && parsed.args[0] === "linux.txt",
  },
  {
    title: "echoでlinux.txtに内容を書き込んでください",
    hint: "echo 内容 > ファイル名 で、ファイルへ書き込めます。",
    answer: 'echo "Hello Linux" > linux.txt',
    check: (parsed) => parsed.cmd === "echo" && parsed.redirect === "linux.txt",
  },
];
