export default {
  id: "s085",
  title: "使用率が高いファイルシステムを探せ",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ディスク容量確認",
  pack: "disk-usage-basics",
  requester: { name: "佐藤主任", role: "基盤チーム", avatar: "👨‍🔧" },
  request: [
    "【現場からの依頼】ディスク使用率が高い場所がないか、一覧で確認して報告して。",
    "【状況】特定のディレクトリではなく、複数のファイルシステムを比較して使用率が最も高いものを探します。",
    "【問題】どのコマンドを実行し、結果のどこを比較するべきでしょうか。",
  ],
  initialEnv: {},
  steps: [
    {
      id: "compare-use-percent",
      label: "df -hで各ファイルシステムの使用率を比較する",
      hint: [
        "ファイルシステムごとの使用率を一覧で確認するにはdfを使います。",
        "読みやすい単位で表示するには-hを付けます。",
        "df -hを実行し、Use%列を比較しましょう。",
      ],
      goal: { type: "commandRan", cmd: "df", pattern: "^df\\s+-h$" },
    },
  ],
  clearComment: "Use%を比較して、使用率が最も高いファイルシステムを判断できたね。",
  explanation: {
    why: "【正解コマンド】df -h。dfはマウントされている各ファイルシステムの容量を一覧表示します。duではディレクトリごとの容量は分かりますが、ファイルシステム全体の使用率を比較する用途には向きません。",
    alternatives: "【実行結果の見方】Use%列を上から比較し、数値が最も大きい行を確認します。その行のFilesystem列が対象デバイス、Mounted on列が利用されている場所です。",
    lpic: "LPIC Level1では、df -hのSize・Used・Avail・Use%・Mounted onの意味を読み取れるようにしておきましょう。",
  },
};
