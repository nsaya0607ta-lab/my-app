export default {
  id: "s119",
  title: "よく打つコマンドに短い別名を付ける",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "シェル環境",
  requester: { name: "山田先輩", role: "インフラ運用チーム", avatar: "👨‍💻" },
  request: [
    "ログ調査のたびに ls -l /var/log って打つの、地味に面倒じゃない？よく使う長いコマンドには「エイリアス（別名）」を付けられるんだ。",
    "まず今設定されているエイリアスの一覧を見てみよう。それから loglist という名前で ls -l /var/log のエイリアスを作って、実際に動かしてみて。",
    "最後に、作ったエイリアスを削除する方法も練習しておこう。",
  ],
  initialEnv: {
    dirs: ["/var/log"],
    files: [
      { path: "/var/log/syslog", content: "Jul 15 09:00:01 linux-playground systemd[1]: Started Daily apt upgrade.\n", owner: "root", group: "root" },
      { path: "/var/log/auth.log", content: "Jul 15 09:12:44 linux-playground sshd[245]: Accepted publickey for student\n", owner: "root", group: "root" },
    ],
  },
  steps: [
    {
      id: "alias-list",
      label: "alias で設定済みのエイリアス一覧を表示する",
      hint: [
        "エイリアスの確認・設定にはどちらも alias コマンドを使います。",
        "引数を付けずに実行すると、設定済みの一覧が表示されます。",
        "alias と入力します。ll などの定番エイリアスが最初から設定されているのが分かります。",
      ],
      goal: { type: "commandRan", pattern: "^\\s*alias\\s*$" },
    },
    {
      id: "alias-create",
      label: "loglist という名前で ls -l /var/log のエイリアスを作る",
      hint: [
        "エイリアスは alias 名前='コマンド' の形で設定します。空白を含むコマンドはクォートで囲みます。",
        "名前は loglist、中身は ls -l /var/log です。",
        "alias loglist='ls -l /var/log' と入力します。",
      ],
      goal: { type: "commandRan", pattern: "^\\s*alias\\s+loglist=" },
    },
    {
      id: "alias-use",
      label: "作った loglist を実行してみる",
      hint: [
        "エイリアスは普通のコマンドと同じように、名前を打つだけで実行できます。",
        "設定した別名をそのまま入力します。",
        "loglist と入力します。ls -l /var/log と同じ結果が表示されれば成功です。",
      ],
      goal: { type: "commandRan", cmd: "loglist" },
    },
    {
      id: "alias-remove",
      label: "unalias で loglist を削除する",
      hint: [
        "エイリアスの削除には unalias コマンドを使います。",
        "unalias 名前 の形で指定します。",
        "unalias loglist と入力します。もう一度 loglist を打つとエラーになる＝削除成功です。",
      ],
      goal: {
        type: "custom",
        fn: (vfs, shell, ctx) => {
          // 「作成してから削除した」ことを確認する（先にunaliasだけ打っても達成にしない）
          const hist = (ctx && ctx.history) || [];
          const createdAt = hist.findIndex(raw => /^\s*alias\s+loglist=/.test(raw));
          let removedAt = -1;
          hist.forEach((raw, i) => { if(/^\s*unalias\s+loglist\b/.test(raw)) removedAt = i; });
          return createdAt !== -1 && removedAt > createdAt && !shell.aliases.has("loglist");
        },
      },
    },
  ],
  clearComment: "設定→利用→削除まで一通りできたね。自分の作業スタイルに合わせたエイリアスを揃えていくと、作業速度が目に見えて上がるよ。",
  explanation: {
    why: "alias は、長いコマンドや打ち間違えやすいコマンドに短い別名を付ける仕組みです。alias 名前='コマンド' で設定し、引数なしの alias で一覧確認、unalias 名前 で削除します。ll（ls -l）や la（ls -a）のように、多くの環境で最初から定義されている定番エイリアスもあります。",
    alternatives: "ターミナルで設定したエイリアスは、そのシェルを閉じると消えてしまいます。いつも使えるようにするには ~/.bashrc に alias 行を書いておき、新しいシェルの起動時に読み込ませるのが定石です。エイリアスか本物のコマンドかを確認したいときは type 名前 が便利です。また、rm='rm -i' のように既存コマンド名へ安全確認付きの別名を付ける使い方も現場でよく見られます。",
    lpic: "LPIC Level1（102試験）の「シェル環境のカスタマイズ」で、alias / unalias の書式、~/.bashrc による永続化、エイリアスとシェル関数の違いが出題されます。",
  },
};
