const APP_LOG_LINES = [
  "2026-07-15 09:00:12 INFO  アプリケーション起動",
  "2026-07-15 09:15:03 INFO  ユーザーログイン: user_a",
  "2026-07-15 10:02:44 INFO  商品検索: キーワード=notebook",
  "2026-07-15 10:30:21 WARN  応答時間が2秒を超過",
  "2026-07-15 11:11:09 INFO  ユーザーログイン: user_b",
  "2026-07-15 11:45:56 INFO  注文確定: order-1023",
  "2026-07-15 12:20:33 INFO  ユーザーログアウト: user_a",
  "2026-07-15 13:05:18 ERROR DB接続がタイムアウト",
  "2026-07-15 13:05:19 ERROR 注文処理に失敗: order-1024",
  "2026-07-15 13:06:02 ERROR 決済APIから応答なし",
];
const APP_LOG = APP_LOG_LINES.join("\n") + "\n";

export default {
  id: "s106",
  title: "障害発生！最新のログを今すぐ確認",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "テキスト処理",
  requester: { name: "運用リーダー", role: "インフラ運用チーム", avatar: "🧑‍💼" },
  request: [
    "たった今、注文が通らないって問い合わせが来た！アプリのログ /var/log/webapp/app.log を見てくれ。",
    "障害調査で大事なのは「一番新しいログ」だ。末尾の3行を取り出して recent_errors.txt に保存して、すぐ共有してほしい。",
  ],
  initialEnv: {
    dirs: ["/var/log/webapp"],
    files: [{ path: "/var/log/webapp/app.log", content: APP_LOG }],
  },
  steps: [
    {
      id: "tail-view",
      label: "tail で app.log の末尾を確認する",
      hint: [
        "ファイルの末尾部分だけを表示するコマンドがあります。",
        "tail コマンドです。オプションなしだと末尾10行を表示します。",
        "tail /var/log/webapp/app.log と入力して、最新のログを確認しましょう。",
      ],
      goal: { type: "commandRan", cmd: "tail" },
    },
    {
      id: "tail-save",
      label: "末尾3行を recent_errors.txt に保存する",
      hint: [
        "表示する行数は -n オプションで指定できます。",
        "tail -n 3 で末尾3行になります。保存には > のリダイレクトを使います。",
        "tail -n 3 /var/log/webapp/app.log > recent_errors.txt と入力します。",
      ],
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/recent_errors.txt");
          if(res.error) return false;
          const lines = res.content.split("\n").filter(Boolean);
          return lines.length === 3 && APP_LOG_LINES.slice(-3).every((l, i) => lines[i] === l);
        },
      },
    },
  ],
  clearComment: "DB接続タイムアウトか…原因が絞れたぞ。ログは常に末尾から見る、いい動きだった！",
  explanation: {
    why: "tail はファイルの末尾部分を表示するコマンドです。ログファイルは新しい記録が末尾へ追記されていくため、「いま何が起きているか」を知るには tail が最短ルートです。head（先頭）と対になるコマンドで、-n で行数を指定できるのも同じです。",
    alternatives: "実際の障害対応では tail -f app.log がよく使われます。-f（follow）を付けると、ファイルに追記される新しい行をリアルタイムで表示し続けるため、「ログを流しっぱなしにして再現を待つ」という監視ができます。grep と組み合わせて tail -n 100 app.log | grep ERROR のようにエラー行だけ絞り込むのも定番です。",
    lpic: "LPIC Level1（101試験）では、tail の -n（行数指定）と -f（追記の追跡）が最重要オプションです。「ログ監視に使うコマンドとオプションは？」という形で頻出します。",
  },
};
