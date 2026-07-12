export default {
  id: "s034",
  pack: "permissions-newbie",
  title: "所有者とグループを一度に変更する",
  difficulty: "中級",
  difficultyLevel: 3,
  category: "所有者・グループ",
  requester: { name: "松本さん", role: "先輩エンジニア", avatar: "👨" },
  request: [
    "release_notes.txt の所有者もグループも一緒に変更したいんだけど、",
    "一回のコマンドでできる？ 所有者は hayashi、グループは devteam にしたいです。",
  ],
  initialEnv: {
    dirs: ["~/release"],
    files: [
      { path: "~/release/release_notes.txt", content: "v1.2.0\n- バグ修正\n- パフォーマンス改善\n", mode: "644" },
    ],
  },
  steps: [
    {
      id: "chown-owner-group",
      label: "release_notes.txt の所有者を hayashi、グループを devteam に変更する",
      hint: [
        "所有者とグループを1つのコマンドで同時に変更できます。",
        "chown コマンドを使います。",
        "chown 所有者:グループ ファイル名 の形です。chown hayashi:devteam release_notes.txt のように実行します。",
      ],
      goal: { type: "ownerGroup", path: "~/release/release_notes.txt", owner: "hayashi", group: "devteam" },
    },
  ],
  clearComment: "さすが！一発でできるんだね、覚えておくよ。",
  explanation: {
    why: "chownは「所有者:グループ」のようにコロンで区切って指定すると、所有者とグループを1回のコマンドでまとめて変更できます。chown hayashi release_notes.txt と chgrp devteam release_notes.txt を2回に分けて実行しても最終的な状態は同じですが、chown hayashi:devteam release_notes.txt なら1コマンドで済み、操作ミスや作業漏れも起きにくくなります。",
    alternatives: "chown hayashi:devteam file と chown hayashi: file（コロンの後を省略すると所有者と同名のグループに設定される環境もあります）、chown :devteam file（所有者は変えずグループだけ変更＝chgrpと同じ）など、コロンの前後を省略することで挙動を使い分けられます。所有者だけ、グループだけを変えたいときは、それぞれchown・chgrpを単体で使う方が意図が伝わりやすい場合もあります。",
    lpic: "LPIC Level1では chown OWNER:GROUP FILE という表記のバリエーション（OWNER単体、:GROUP単体、OWNER:GROUP）を理解しているかが問われます。また、実際のLinuxでは所有者の変更部分にはroot権限が必要になる点も合わせて出題されるため、『何が一般ユーザーでもでき、何がrootでないとできないか』を区別して覚えておくことが重要です。",
  },
};
