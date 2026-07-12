export default {
  id: "s008",
  title: "長いログパスのショートカット作成",
  difficulty: "中級",
  difficultyLevel: 3,
  category: "ファイル操作",
  requester: { name: "渡辺さん", role: "先輩エンジニア", avatar: "👨‍💻" },
  request: [
    "毎回 /var/log/app.log って打つの面倒だから、",
    "ホームディレクトリに applog という名前でショートカット（シンボリックリンク）を作っておいてくれる？",
  ],
  initialEnv: {
    dirs: ["/var/log"],
    files: [
      { path: "/var/log/app.log", content: "INFO server started\n" },
    ],
  },
  steps: [
    {
      id: "symlink",
      label: "applog という名前で /var/log/app.log へのシンボリックリンクを作る",
      hint: "ln -s リンク先 リンク名 の順で指定します。例: ln -s /var/log/app.log ~/applog",
      goal: { type: "symlink", path: "~/applog", target: "/var/log/app.log" },
    },
  ],
  explanation: {
    why: "ln -s は「ショートカット」にあたるシンボリックリンクを作るコマンドです。作成したリンク（applog）を cat や less で開くと、実体である /var/log/app.log の中身がそのまま見えます。長いパスを何度も打つ必要がなくなり、設定ファイルの切り替えなどにもよく使われます。",
    alternatives: "-s を付けずに ln target link とすると「ハードリンク」になり、こちらは同じファイル実体を指す別名という扱いになります（ディレクトリには使えません）。用途に応じて使い分けます。",
    lpic: "LPIC Level1では、シンボリックリンクとハードリンクの違い（ハードリンクは同じinodeを共有し元ファイルを消しても消えない／シンボリックリンクは経路を指すだけなので元ファイルを消すとリンク切れになる）が定番の出題です。",
  },
};
