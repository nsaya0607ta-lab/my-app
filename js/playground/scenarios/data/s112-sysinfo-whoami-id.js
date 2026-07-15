export default {
  id: "s112",
  title: "作業前の身元確認：自分は誰？",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "システム情報確認",
  requester: { name: "山田先輩", role: "インフラ運用チーム", avatar: "👨‍💻" },
  request: [
    "共用サーバーで作業するときの鉄則を教えるよ。それは「作業前に、自分がどのユーザーでログインしているか確認する」こと。",
    "root のつもりで一般ユーザーだったり、その逆だったりすると大事故につながるからね。",
    "まず今のユーザー名を確認して、次にUIDや所属グループの詳細も見てみよう。",
  ],
  steps: [
    {
      id: "whoami-check",
      label: "whoami で現在のユーザー名を確認する",
      hint: [
        "現在ログインしているユーザー名を表示するコマンドがあります。",
        "「私は誰？」という意味の名前のコマンドです。",
        "whoami と入力します。",
      ],
      goal: { type: "commandRan", cmd: "whoami" },
    },
    {
      id: "id-check",
      label: "id でUID・GID・所属グループを確認する",
      hint: [
        "ユーザー名だけでなく、ユーザーID（UID）や所属グループまで確認できるコマンドがあります。",
        "id コマンドです。",
        "id と入力します。uid=・gid=・groups= の3つが表示されます。",
      ],
      goal: { type: "commandRan", cmd: "id" },
    },
  ],
  clearComment: "そう、それ！whoami と id は地味だけど、su で切り替えた後や本番サーバーに入った直後に必ず打つ癖をつけると、事故が確実に減るよ。",
  explanation: {
    why: "whoami は現在の実効ユーザー名だけをシンプルに表示します。id はさらに詳しく、uid（ユーザーID番号）・gid（プライマリグループID）・groups（所属している全グループ）を表示します。Linuxの権限判定は内部的にユーザー名ではなくUID/GIDの数値で行われるため、「uid=0 なら root」という対応も覚えておくと役立ちます。",
    alternatives: "id ユーザー名 のように引数を付けると、他のユーザーの情報も確認できます。また、環境変数で確認する echo $USER や、今ログインしている全ユーザーを見る who・w というコマンドもあります。su - で切り替えた直後に whoami で確認する、という組み合わせが実務の定番です。",
    lpic: "LPIC Level1（102試験）では、id が表示する uid/gid/groups の意味、root の UID が 0 であること、whoami・who・w の違いが出題されます。",
  },
};
