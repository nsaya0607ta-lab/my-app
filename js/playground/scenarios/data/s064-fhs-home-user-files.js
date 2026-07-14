export default {
  id: "s064",
  title: "退勤した担当者の引き継ぎ資料を探せ",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "FHS・ディレクトリ構成",
  pack: "fhs-operations",
  requester: { name: "中村先輩", role: "運用チーム", avatar: "🧑‍💼" },
  request: [
    "【現場からの依頼】担当のsatoさんが退勤したので、共有予定の引き継ぎ資料があるか確認して。",
    "【状況】一般ユーザーが個人で作成したファイルの保存場所を判断し、Documents内の資料を読んでください。",
    "【問題】一般ユーザーごとのホームディレクトリは、どこに置かれるでしょうか。",
  ],
  initialEnv: {
    dirs: ["/home/sato/Documents"],
    files: [
      { path: "/home/sato/Documents/handover.txt", content: "引き継ぎ事項: 23時のバックアップジョブを確認すること。\n", mode: "644", owner: "sato", group: "users" },
    ],
  },
  steps: [
    {
      id: "list-user-documents",
      label: "/home/sato/Documents のファイルを確認する",
      hint: [
        "一般ユーザーのホームは通常 /home/ユーザー名 です。",
        "ls -l /home/sato/Documents を実行します。",
      ],
      goal: { type: "commandRan", cmd: "ls", pattern: "/home/sato/Documents" },
    },
    {
      id: "read-handover",
      label: "handover.txt の内容を確認する",
      hint: "cat /home/sato/Documents/handover.txt で内容を表示できます。",
      goal: { type: "commandRan", cmd: "cat", pattern: "/home/sato/Documents/handover\\.txt" },
    },
  ],
  clearComment: "23時のバックアップ確認だね。一般ユーザーのファイルの場所を正しく判断できたよ。",
  explanation: {
    why: "【正解】/home です。一般ユーザーは通常 /home/ユーザー名 を自分のホームディレクトリとして使います。文書、ダウンロードファイル、シェル設定の .bashrc など、そのユーザー個人のデータが保存されます。",
    alternatives: "【確認コマンド】ls -la /home/sato、ls -l /home/sato/Documents、cat /home/sato/Documents/handover.txt。現在の自分のホームは echo $HOME や pwd でも確認できます。",
    lpic: "LPIC Level1では、一般ユーザーのホームが通常 /home 配下にあり、rootだけは例外として /root を使う点がよく問われます。両者を混同しないようにしましょう。",
  },
};