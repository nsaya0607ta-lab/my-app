export default {
  id: "s033",
  pack: "permissions-newbie",
  title: "開発チーム向けにグループだけ変更",
  difficulty: "中級",
  difficultyLevel: 3,
  category: "所有者・グループ",
  requester: { name: "渡辺さん", role: "インフラ担当", avatar: "👩" },
  request: [
    "開発チームが編集できるように、",
    "deploy.yml の所属グループだけを dev へ変更してほしいです。所有者はそのままで大丈夫です。",
  ],
  initialEnv: {
    dirs: ["~/deploy"],
    files: [
      { path: "~/deploy/deploy.yml", content: "env: production\nreplicas: 3\n", mode: "664" },
    ],
  },
  steps: [
    {
      id: "chgrp-dev",
      label: "deploy.yml の所属グループを dev に変更する",
      hint: [
        "所有者ではなく「グループ」だけを変更するコマンドを使います。",
        "chgrp コマンドを使います。",
        "chgrp 新しいグループ名 ファイル名 の形です。chgrp dev deploy.yml のように実行します。",
      ],
      goal: { type: "group", path: "~/deploy/deploy.yml", value: "dev" },
    },
  ],
  clearComment: "ばっちりです、これで開発チーム全員が編集できるようになりました。",
  explanation: {
    why: "chgrpはファイルの「所属グループ」だけを変更するコマンドです。所有者は変えずにグループだけを付け替えたい場合、chownでも chown :dev deploy.yml のように書けますが、chgrp dev deploy.yml と書いた方が「グループだけを変える」という意図がコマンド名からも明確になります。グループ単位で権限を管理しておくと、チームのメンバーが増減しても『devグループに入っているかどうか』だけ管理すればよくなり、ファイルを1つずつ調整する必要がなくなります。",
    alternatives: "chgrp dev deploy.yml と chown :dev deploy.yml は同じ結果になります。ディレクトリごと配下のファイルもまとめて変更したい場合は、どちらのコマンドも -R オプション（再帰的に適用）を付けられます（例: chgrp -R dev ~/deploy）。",
    lpic: "LPIC Level1では chgrp GROUP FILE という基本構文に加え、「一般ユーザーでも、自分が所属しているグループへならchgrpできる（root権限は不要）」という点が、chown（所有者変更・root権限が必要）との対比でよく出題されます。『所有者の変更＝root専用』『グループの変更＝所属グループの範囲内なら一般ユーザーでも可能』という違いを覚えておきましょう。",
  },
};
