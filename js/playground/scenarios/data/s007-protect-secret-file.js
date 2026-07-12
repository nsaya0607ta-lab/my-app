export default {
  id: "s007",
  title: "秘密情報ファイルの保護",
  difficulty: "中級",
  difficultyLevel: 3,
  category: "権限",
  requester: { name: "伊藤さん", role: "セキュリティ担当", avatar: "🧑‍💻" },
  request: [
    "secret.env にAPIキーが書いてあるんだけど、",
    "自分（ファイルの所有者）以外は中身を読んだり書き換えたりできないようにしておいて。",
  ],
  initialEnv: {
    files: [
      { path: "~/secret.env", content: "API_KEY=xxxxxxxx\n" },
    ],
  },
  steps: [
    {
      id: "chmod",
      label: "所有者以外がアクセスできないように権限を変更する",
      hint: "chmod で権限を変更できます。8進数なら chmod 600 secret.env、記号なら chmod go-rwx secret.env でも同じ結果になります。",
      goal: { type: "permission", path: "~/secret.env", rule: "no-group-other-access" },
    },
  ],
  explanation: {
    why: "chmod はファイルのアクセス権（読み取り r・書き込み w・実行 x）を、所有者(u)・グループ(g)・その他(o)ごとに設定するコマンドです。「自分だけがアクセスできる」状態にするには、グループとその他の権限を全て外します（600や700）。APIキーやパスワードのようなファイルは必ずこの形で管理します。",
    alternatives: "8進数（600）とシンボリック（go-rwx や go=）はどちらも結果は同じです。8進数は「rwxrwxrwx」を2進数のビットに見立てて 4(r)+2(w)+1(x) を3クラス分並べたもの、シンボリックは「誰の(u/g/o)」「どうする(+/-/=)」「何を(r/w/x)」を直接指定する方式です。",
    lpic: "LPIC Level1では8進数とシンボリック記法の変換（例: rw-------は600）が頻出します。また、ディレクトリのx権限（そのディレクトリに入れるか）とファイルのx権限（実行できるか）の意味の違いもよく問われるポイントです。",
  },
};
