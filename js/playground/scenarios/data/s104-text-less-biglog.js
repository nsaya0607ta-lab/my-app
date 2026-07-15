const ACCESS_LOG = Array.from({ length: 120 }, (_, i) => {
  const min = String(i % 60).padStart(2, "0");
  const hour = String(9 + Math.floor(i / 60)).padStart(2, "0");
  const paths = ["/index.html", "/products", "/cart", "/login", "/api/items"];
  const status = i === 87 ? 500 : 200;
  return `192.168.1.${(i % 20) + 10} - - [15/Jul/2026:${hour}:${min}:00 +0900] "GET ${paths[i % paths.length]} HTTP/1.1" ${status} ${1000 + i * 13}`;
}).join("\n") + "\n";

export default {
  id: "s104",
  title: "巨大なログはlessでゆっくり読む",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "テキスト処理",
  requester: { name: "先輩", role: "インフラチーム", avatar: "👨‍💻" },
  request: [
    "Webサーバーのアクセスログを目視で確認してほしいんだけど、cat で開くと一瞬で画面が流れちゃって読めないんだよね。",
    "/var/log/webapp/access.log を、スクロールしながらじっくり確認できる方法で開いてみて。",
  ],
  initialEnv: {
    dirs: ["/var/log/webapp"],
    files: [{ path: "/var/log/webapp/access.log", content: ACCESS_LOG }],
  },
  steps: [
    {
      id: "less-open",
      label: "less で /var/log/webapp/access.log を開く",
      hint: [
        "長いファイルを1画面ずつ確認するには、ページャーと呼ばれる種類のコマンドを使います。",
        "代表的なページャーが less コマンドです。less ファイルパス で開きます。",
        "less /var/log/webapp/access.log と入力します。開いたら矢印キーやスペースでスクロールし、q で閉じます。",
      ],
      goal: { type: "commandRan", cmd: "less", pattern: "access\\.log" },
    },
  ],
  clearComment: "そうそう、それが正解！長いログを cat で流すのは事故のもとだから、less で開く癖をつけておくと現場で助かるよ。",
  explanation: {
    why: "less はファイルを一度に全部出力せず、1画面分ずつ表示するページャーです。矢印キーや スペース（1ページ進む）、b（1ページ戻る）で自由に行き来でき、q で終了します。cat は短いファイル向き、数百行を超えるログや設定ファイルは less、と使い分けるのが基本です。",
    alternatives: "似たページャーに more がありますが、more は基本的に前へ進むだけなのに対し、less は前後に自由に移動できます（「less is more（lessはmoreより高機能）」という洒落で覚えられます）。また less の画面内では / に続けて文字列を入力すると検索もできるため、大きなログから特定のエラーを探す用途にも向いています。",
    lpic: "LPIC Level1（101試験）では、cat・less・more の使い分け、less の基本操作（q で終了、/ で検索）、パイプと組み合わせて「コマンド | less」と長い出力を読む使い方が出題されます。",
  },
};
