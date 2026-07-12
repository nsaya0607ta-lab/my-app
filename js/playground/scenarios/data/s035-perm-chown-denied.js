export default {
  id: "s035",
  pack: "permissions-newbie",
  title: "所有者変更に失敗した原因を調べる",
  difficulty: "中級",
  difficultyLevel: 3,
  category: "権限・root",
  requester: { name: "小林さん", role: "開発部", avatar: "👩" },
  request: [
    "handover.txt の所有者を変更しようとしたら失敗しました。",
    "後任の木村さん（ユーザー名: kimura）へ変更したいのですが、原因を調べて対応してもらえますか？",
  ],
  initialEnv: {
    files: [
      { path: "~/handover.txt", content: "引き継ぎ事項:\n- サーバーの定期メンテナンス\n- 監視アラートの対応手順\n", mode: "644" },
    ],
    strictChown: true,
  },
  steps: [
    {
      id: "su-root",
      label: "root ユーザーに切り替える",
      hint: [
        "まずは chown handover.txt を実行してみましょう。エラーメッセージをよく読んでください。",
        "「Operation not permitted」と表示されるはずです。所有者の変更には特別な権限が必要です。su コマンドを使います。",
        "su（または su root）でrootへ切り替えます。パスワードは root です。",
      ],
      goal: { type: "becameRoot" },
    },
    {
      id: "chown-owner",
      label: "handover.txt の所有者を kimura に変更する",
      hint: [
        "root に切り替えたら、もう一度同じコマンドを試してみましょう。",
        "chown コマンドを使います。",
        "chown kimura handover.txt を実行します。",
      ],
      // suでrootへ切り替えると~はrootのホーム(/root)を指すようになるため、
      // ここでは（誰に切り替わっていても指す場所が変わらない）絶対パスで判定する
      goal: { type: "owner", path: "/home/student/handover.txt", value: "kimura" },
    },
  ],
  clearComment: "原因がroot権限だったんですね！助かりました、ありがとうございます。",
  explanation: {
    why: "実際のLinuxでは、ファイルの所有者を変更できるのはroot（管理者）だけです。たとえ自分がそのファイルの所有者であっても、一般ユーザーの権限のままでは chown で他人に所有権を譲ることはできません（もしできてしまうと、ディスク容量の割り当て＝クォータを他人に押し付けるといった不正が可能になってしまうためです）。今回のようにchownが「Operation not permitted」で失敗した場合は、まずsuでrootに切り替えてから同じコマンドを再実行する、という対応が定石です。",
    alternatives: "root権限が必要な操作は、suでrootに切り替えて実行する方法のほかに、sudo chown kimura handover.txt のように「そのコマンド1回だけ」管理者権限で実行する方法もあります（sudoは一時的に権限を借りるイメージで、suのようにユーザーを切り替えたままにしない分、操作範囲を絞りやすい利点があります）。この学習環境ではsuのみ対応しています。",
    lpic: "LPIC Level1では、一般ユーザーがchownで所有者を変更しようとした際に発生する Operation not permitted エラーと、その対応としてのsu（スーパーユーザーへの切り替え）はセットで頻出のテーマです。「グループの変更（chgrp）は所属グループの範囲内なら一般ユーザーでも可能」「所有者の変更（chown）はroot専用」という違いも、この2つの過去のシナリオと合わせて整理しておきましょう。",
  },
};
