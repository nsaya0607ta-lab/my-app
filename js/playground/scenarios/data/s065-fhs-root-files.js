export default {
  id: "s065",
  title: "rootの保守メモを確認せよ",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "FHS・ディレクトリ構成",
  pack: "fhs-operations",
  requester: { name: "山田主任", role: "基盤チーム", avatar: "👨‍🔧" },
  request: [
    "【現場からの依頼】前任者がrootユーザー用の保守メモを残したらしい。内容を確認して。",
    "【状況】一般ユーザーからはアクセスできないroot専用のホームディレクトリに、maintenance.txtがあります。",
    "【問題】rootユーザーのホームディレクトリは、どこでしょうか。",
  ],
  initialEnv: {
    files: [
      { path: "/root/maintenance.txt", content: "保守メモ: 再起動後にnginxとbackup.timerを確認すること。\n", mode: "600", owner: "root", group: "root" },
    ],
  },
  steps: [
    {
      id: "root-login",
      label: "rootユーザーへ切り替える",
      hint: [
        "/root は通常、一般ユーザーから読み取れません。",
        "su を実行し、パスワードには root と入力します。",
      ],
      goal: { type: "becameRoot" },
    },
    {
      id: "read-root-note",
      label: "/root/maintenance.txt を確認する",
      hint: [
        "rootのホームは /home/root ではありません。",
        "cat /root/maintenance.txt を実行します。",
      ],
      goal: { type: "commandRan", cmd: "cat", pattern: "/root/maintenance\\.txt" },
    },
    {
      id: "leave-root",
      label: "確認後にexitで一般ユーザーへ戻る",
      hint: "exit を実行してrootシェルを終了します。",
      goal: { type: "backToOriginalUser" },
    },
  ],
  clearComment: "再起動後の確認項目が分かったね。rootのホームが /root だと判断できているよ。",
  explanation: {
    why: "【正解】/root です。rootユーザーだけは、一般ユーザーのような /home/root ではなく /root をホームディレクトリとして使います。管理者用スクリプト、保守メモ、rootのシェル設定などが置かれることがあります。通常は強いアクセス制限が設定されています。",
    alternatives: "【確認コマンド】su、ls -la /root、cat /root/maintenance.txt。実環境では sudo -i で管理者シェルへ入る構成もあります。確認後は exit で戻る習慣を付けましょう。",
    lpic: "LPIC Level1では、一般ユーザーは /home/ユーザー名、rootユーザーは /root という例外関係が基本事項です。また、/ はルートディレクトリ、/root はrootユーザーのホームという違いにも注意してください。",
  },
};