export default {
  id: "s037",
  pack: "permissions-newbie",
  title: "バックアップスクリプトの引き継ぎ対応",
  difficulty: "LPIC Level1",
  difficultyLevel: 4,
  category: "総合",
  requester: { name: "岡田さん", role: "システム管理者", avatar: "👩" },
  request: [
    "バックアップスクリプトが実行できず、さらに担当者も変更になりました。",
    "~/ops/backup.sh に実行権限を付与し、所有者を森田さん（ユーザー名: morita）へ変更してから、",
    "ls -l で正しく反映されたか確認してください。",
  ],
  initialEnv: {
    dirs: ["~/ops"],
    files: [
      { path: "~/ops/backup.sh", content: "#!/bin/bash\necho \"バックアップ処理を実行しました\"\n", mode: "644" },
    ],
  },
  steps: [
    {
      id: "chmod-exec",
      label: "backup.sh に実行権限を付与する",
      hint: [
        "まずは実行できない原因を解消するコマンドを使います。",
        "chmod コマンドを使います。",
        "chmod +x ops/backup.sh または chmod 755 ops/backup.sh のように実行権限を付与します。",
      ],
      goal: { type: "permission", path: "~/ops/backup.sh", rule: "owner-exec" },
    },
    {
      id: "chown-owner",
      label: "backup.sh の所有者を morita に変更する",
      hint: [
        "続けて、担当者交代にともなう変更を行うコマンドを使います。",
        "chown コマンドを使います。",
        "chown morita ops/backup.sh のように所有者を変更します。",
      ],
      goal: { type: "owner", path: "~/ops/backup.sh", value: "morita" },
    },
    {
      id: "verify-ls",
      label: "ls -l で変更が反映されたことを確認する",
      hint: [
        "最後に、変更結果を目で確認するコマンドを使います。",
        "ls コマンドを使います。",
        "ls -l ops/backup.sh のように -l オプションを付けて確認します。",
      ],
      goal: { type: "commandRan", cmd: "ls", flag: "l" },
    },
  ],
  clearComment: "完璧です！これでバックアップが正常に動きます、助かりました。",
  explanation: {
    why: "この依頼は、これまで学んだchmod（実行権限の付与）・chown（所有者の変更）・ls -l（結果の確認）を組み合わせた、実務そのままの総合的なタスクです。①実行できない原因（xビットがない）をchmodで解消し、②担当者交代に合わせてchownで所有者を更新し、③最後に必ずls -lで「意図した状態になっているか」を目で確認する、という3ステップは、権限まわりのトラブル対応における基本的な流れです。変更しっぱなしにせず必ず確認する、という習慣が実務では特に重要になります。",
    alternatives: "chmod 755 backup.sh のように数値でまとめて指定しても、chmod u+x backup.sh のようにシンボリックで実行権限だけ足しても、目的（所有者が実行できる状態にする）は達成できます。所有者変更も chown morita backup.sh のほか、グループも同時に変えるなら chown morita:ops backup.sh のようにまとめることもできます。確認は ls -l のほか、対象ファイルだけを指定する ls -l backup.sh でも構いません。",
    lpic: "LPIC Level1の試験では、単発のコマンドの意味を問う問題だけでなく、このように複数のコマンドを組み合わせて『ある状態を実現する』手順を問う総合問題も出題されます。chmod・chown・ls -lはいずれも101試験の頻出コマンドであり、それぞれを単独で覚えるだけでなく、『実行できない→権限を疑う→ls -lで確認→chmod/chownで直す→再度ls -lで確認する』という一連の流れとして身につけておくと、試験にも実際のサーバー運用にもそのまま活かせます。",
  },
};
