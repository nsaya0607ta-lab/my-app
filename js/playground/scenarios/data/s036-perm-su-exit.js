export default {
  id: "s036",
  pack: "permissions-newbie",
  title: "root への切り替えと復帰",
  difficulty: "中級",
  difficultyLevel: 3,
  category: "ユーザー切替",
  requester: { name: "中村さん", role: "教育担当", avatar: "👨" },
  request: [
    "rootユーザーへ切り替えて作業してください。",
    "終わったら、必ず元のユーザーへ戻してください。su → whoami → exit → whoami の流れで確認してみましょう。",
    "/root/handover_note.txt はroot専用のファイルです。rootになったら中身も見てみてください。",
  ],
  initialEnv: {
    files: [
      { path: "/root/handover_note.txt", content: "新人エンジニアへ: これはroot専用の引き継ぎメモです。\n", owner: "root", group: "root", mode: "600" },
    ],
  },
  steps: [
    {
      id: "su-root",
      label: "root ユーザーに切り替える",
      hint: [
        "ユーザーを切り替えるコマンドを使います。",
        "su コマンドを使います。",
        "su（または su root）でrootへ切り替えます。パスワードは root です。切り替わったら whoami で確認してみましょう。",
      ],
      goal: { type: "becameRoot" },
    },
    {
      id: "exit-back",
      label: "作業が終わったら元のユーザーに戻る",
      hint: [
        "rootの作業が終わったら、元のユーザーへ戻るコマンドを使います。",
        "exit コマンドを使います。",
        "exit と入力するだけで、suする前のユーザーへ1段階戻ります。whoami で student に戻っていることを確認しましょう。",
      ],
      goal: { type: "backToOriginalUser" },
    },
  ],
  clearComment: "ばっちりです。ユーザー切り替えの基本はこれで完璧ですね。",
  explanation: {
    why: "su はユーザーを切り替えるコマンドで、引数を省略するとrootに切り替わります。切り替えたあとは、パスワードで認証したユーザーとしてコマンドを実行できるようになります。作業が終わったら exit で元のユーザーに戻る、というのが実際の運用でも徹底されるルールです。root権限のまま作業を続けてしまうと、うっかり重要なファイルを削除したり書き換えたりするリスクが上がるため、『rootが必要な作業だけrootで行い、終わったらすぐ戻る』という習慣が重要です。whoamiは今の実効ユーザーを表示するコマンドで、su前後で必ず確認する癖をつけると事故を防げます。",
    alternatives: "su はユーザーを何段階でも重ねて切り替えられます（su → su → …としてexitを繰り返すと1段階ずつ戻ります）。一時的に1つのコマンドだけ管理者権限で実行したい場合は、ユーザーを切り替えずに sudo コマンド名 のように使う方法もあります（この学習環境ではsu/exitのみに対応しています）。",
    lpic: "LPIC Level1では、su（ユーザー切り替え・引数省略時はroot）、su -（環境変数も切り替え先ユーザーのものに完全に入れ替える。この学習環境の su は作業ディレクトリを引き継ぐ通常のsuの挙動です）、whoami（実効ユーザー名の表示）、id（UID/GID・所属グループの表示）の違いがよく出題されます。root専用ファイル（今回の/root/handover_note.txtのように700や600でroot所有になっているもの）にアクセスするにはsuまたはsudoが必須、という理解も重要な出題ポイントです。",
  },
};
