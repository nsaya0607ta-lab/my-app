export default {
  id: "s030",
  pack: "permissions-newbie",
  title: "編集できない設定ファイルの原因調査",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "権限・調査",
  requester: { name: "山田さん", role: "開発部", avatar: "👨" },
  request: [
    "設定ファイルを書き換えたいんだけど、",
    "権限がなくて編集できないみたい。原因を調べて教えてもらえる？ ファイルは ~/app/config.conf です。",
  ],
  initialEnv: {
    dirs: ["~/app"],
    files: [
      { path: "~/app/config.conf", content: "APP_ENV=production\nAPP_DEBUG=false\n", mode: "644", owner: "yamada", group: "dev" },
    ],
  },
  steps: [
    {
      id: "investigate",
      label: "ls -l で config.conf の所有者・権限を確認する",
      hint: [
        "まずはファイルの状態を目で確認するコマンドを使います。",
        "ls コマンドを使います。",
        "詳細情報（権限・所有者・グループ）まで表示するには -l オプションを付けます。ls -l app/config.conf のように実行してみましょう。",
      ],
      goal: { type: "commandRan", cmd: "ls", flag: "l" },
    },
  ],
  clearComment: "なるほど、権限が原因だったのか！ありがとう、助かったよ。",
  explanation: {
    why: "ls -l を実行すると、各ファイルの「種類＋権限（例: -rw-r--r--）」「所有者」「グループ」が一覧で確認できます。今回の config.conf は所有者が yamada、グループが dev で、権限は rw-r--r--（所有者だけ書き込み可、グループ・その他は読み取りのみ）でした。あなた（student）は所有者でもyamadaさんと同じグループでもないため、「その他」の権限＝読み取りのみが適用され、書き込みができなかったというわけです。「原因を調べる」ときは、まずchmodする前にls -lで現状を確認する習慣をつけましょう。",
    alternatives: "権限を確認する方法としては ls -l のほかに、ls -la（隠しファイルも含めて一覧表示）や ls -l 特定のファイル名だけを指定する方法もあります。実際のLinuxには stat コマンド（より詳細な権限・タイムスタンプ情報を表示）もありますが、この学習環境ではls -lが権限確認の基本ツールです。",
    lpic: "LPIC Level1では、ls -l の出力（先頭の1文字がファイル種別 d/-/l、続く9文字が所有者・グループ・その他の rwx、その後に所有者名・グループ名が続く）を正しく読み取れるかが頻出です。「なぜアクセスできないのか」を権限・所有者・グループの3要素から切り分けて説明できることは、試験だけでなく実務のトラブルシューティングでもそのまま役立ちます。",
  },
};
