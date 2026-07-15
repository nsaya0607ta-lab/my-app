export default {
  id: "s101",
  title: "ファイル名の変更と整理整頓",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ファイル操作",
  requester: { name: "佐藤さん", role: "企画チーム", avatar: "🧑‍💼" },
  request: [
    "この前の定例会議の議事録、draft.txt っていう仮の名前のまま放置しちゃってて…。",
    "正式名の minutes_0715.txt に変えて、docs フォルダの中へ移動しておいてもらえる？",
  ],
  initialEnv: {
    dirs: ["~/docs"],
    files: [{ path: "~/draft.txt", content: "7/15 定例会議 議事録\n・新機能の進捗確認\n・リリース日程の調整\n" }],
  },
  steps: [
    {
      id: "mv-rename",
      label: "draft.txt を minutes_0715.txt にリネームする",
      hint: [
        "ファイル名の変更には mv コマンドを使います。「移動」と「リネーム」は同じコマンドです。",
        "mv 元のファイル名 新しいファイル名 の順に指定します。",
        "mv draft.txt minutes_0715.txt と入力します。",
      ],
      goal: {
        type: "custom",
        fn: (vfs) => {
          const oldGone = !vfs.getNode(vfs.resolvePath("~/draft.txt"));
          if(!oldGone) return false;
          const home = vfs.readFile("~/minutes_0715.txt");
          const docs = vfs.readFile("~/docs/minutes_0715.txt");
          return (!home.error && home.content.includes("議事録")) || (!docs.error && docs.content.includes("議事録"));
        },
      },
    },
    {
      id: "mv-move",
      label: "minutes_0715.txt を docs フォルダの中へ移動する",
      hint: [
        "ファイルの移動にも mv コマンドを使います。移動先にディレクトリを指定すると、その中へファイルが移動します。",
        "mv 移動したいファイル 移動先ディレクトリ の順に指定します。",
        "mv minutes_0715.txt docs と入力します（mv minutes_0715.txt docs/ でもOKです）。",
      ],
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/docs/minutes_0715.txt");
          return !res.error && res.content.includes("議事録") && !vfs.getNode(vfs.resolvePath("~/minutes_0715.txt"));
        },
      },
    },
  ],
  clearComment: "ありがとう！これで議事録がちゃんと整理されたよ。仮の名前のまま放置、やりがちだから助かる〜。",
  explanation: {
    why: "mv は move（移動）の略ですが、Linuxでは「リネーム」も mv で行います。mv 旧名 新名 のように同じディレクトリ内で名前を変えればリネーム、mv ファイル ディレクトリ のように移動先へディレクトリを指定すれば移動になります。cp と違って元のファイルは残らない（移動する）点に注意しましょう。",
    alternatives: "リネームと移動は1回でまとめて行うこともできます: mv draft.txt docs/minutes_0715.txt。移動先のパスにファイル名まで書けば「移動しながら名前も変える」という動きになります。また、移動先に同名のファイルがあると確認なしで上書きされるため、心配な場合は mv -i で確認プロンプトを出すのが安全です。",
    lpic: "LPIC Level1（101試験）では、mv が「移動」と「リネーム」の両方を担うこと、cp（複製）との違い、上書き時の挙動（-i オプション）が頻出テーマです。",
  },
};
