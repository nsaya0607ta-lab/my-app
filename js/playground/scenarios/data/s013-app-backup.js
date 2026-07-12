export default {
  id: "s013",
  title: "本番反映前のフルバックアップ",
  difficulty: "LPIC Level1",
  difficultyLevel: 4,
  category: "バックアップ",
  requester: { name: "山本さん", role: "チームリーダー", avatar: "👨‍💼" },
  request: [
    "これから app フォルダに手を入れる予定なんだけど、",
    "念のため作業前に app フォルダを丸ごと app_backup という名前でバックアップしておいて。",
  ],
  initialEnv: {
    dirs: ["~/app", "~/app/src"],
    files: [
      { path: "~/app/main.py", content: "print('hello')\n" },
      { path: "~/app/src/util.py", content: "def helper(): pass\n" },
    ],
  },
  steps: [
    {
      id: "backup",
      label: "app フォルダを丸ごと app_backup としてコピーする",
      hint: "ディレクトリごとコピーするには -r（再帰的）オプションが必要です。例: cp -r app app_backup",
      goal: { type: "fileExists", path: "~/app_backup/main.py", contains: "hello" },
    },
    {
      id: "backup-nested",
      label: "サブディレクトリの中身もコピーされている",
      hint: "-r を付けていれば、サブディレクトリ（src）の中身も含めてそのままコピーされます。",
      goal: { type: "fileExists", path: "~/app_backup/src/util.py" },
    },
  ],
  explanation: {
    why: "ディレクトリを丸ごとコピーするには cp -r（recursive、再帰的）が必要です。-r を付け忘れると「omitting directory」というエラーになり、ディレクトリはコピーされません。本番作業前のバックアップは、事故が起きたときにすぐ切り戻せるようにするための基本的な安全策です。",
    alternatives: "日付入りのバックアップ名にする（app_backup_20260712 のように）ことで、複数回バックアップを取っても上書きされずに履歴が残せます。より大規模なバックアップには tar や rsync が使われますが、この環境では cp -r で基本の考え方を押さえます。",
    lpic: "LPIC Level1では cp の -r（再帰）・-p（属性を保持）などのオプションの意味、および tar/gzip によるアーカイブ・圧縮の基礎知識もあわせて問われます。",
  },
};
