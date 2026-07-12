export default {
  id: "s032",
  pack: "permissions-newbie",
  title: "担当者交代にともなう所有者変更",
  difficulty: "中級",
  difficultyLevel: 3,
  category: "所有者・グループ",
  requester: { name: "鈴木さん", role: "開発リーダー", avatar: "👨" },
  request: [
    "このファイル、担当者が変わったから所有者も変更しておいて。",
    "report.csv の後任は中川さん（ユーザー名: nakagawa）です。",
  ],
  initialEnv: {
    files: [
      { path: "~/report.csv", content: "月,売上\n1月,1200000\n2月,1350000\n", mode: "644" },
    ],
  },
  steps: [
    {
      id: "chown-owner",
      label: "report.csv の所有者を nakagawa に変更する",
      hint: [
        "ファイルの所有者を変更するコマンドを使います。",
        "chown コマンドを使います。",
        "chown 新しい所有者名 ファイル名 の形です。chown nakagawa report.csv のように実行します。",
      ],
      goal: { type: "owner", path: "~/report.csv", value: "nakagawa" },
    },
  ],
  clearComment: "ありがとう、これで中川さんが正式にこのファイルを管理できるね。",
  explanation: {
    why: "chownはファイルの「所有者」を変更するコマンドです。担当者交代や引き継ぎのたびに、ファイルを新しい担当者名義に変更しておくことで、誰が最終的な責任者なのかをシステム上でも明確にできます。chownの後ろに新しい所有者名、その後ろに対象ファイルを指定するだけのシンプルな構文です。",
    alternatives: "今回は所有者だけを変更しましたが、chown nakagawa: report.csv のように末尾にコロンだけを付けると、所有者と同時にグループも同名のグループへ変更できます（環境によって挙動が異なる場合があります）。所有者はそのままでグループだけ変えたい場合は、次にお願いするchgrpコマンドを使います。",
    lpic: "LPIC Level1では、chown [OWNER][:GROUP] FILE という基本構文と、-Rオプション（ディレクトリ以下を再帰的に変更）がよく問われます。また、実際のLinuxではファイルの所有者変更にはroot権限が必要という点も重要な出題ポイントです（このシナリオ集でも後ほど体験します）。",
  },
};
