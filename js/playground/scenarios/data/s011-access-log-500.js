export default {
  id: "s011",
  title: "本番サーバのエラー調査",
  difficulty: "LPIC Level1",
  difficultyLevel: 4,
  category: "ログ調査",
  requester: { name: "加藤さん", role: "SRE", avatar: "🧑‍💻" },
  request: [
    "本番Webサーバで昨夜からエラーが多発してるって報告があって。",
    "/var/log/access.log から ステータスコード500 の行だけ抜き出して、",
    "error500.txt に保存しておいてもらえますか。障害報告書に添付します。",
  ],
  initialEnv: {
    dirs: ["/var/log"],
    files: [
      { path: "/var/log/access.log", content:
        '10.0.0.1 GET /index.html 200\n' +
        '10.0.0.2 GET /api/order 500\n' +
        '10.0.0.3 GET /login 200\n' +
        '10.0.0.4 POST /api/pay 500\n' +
        '10.0.0.5 GET /about 404\n',
      },
    ],
  },
  steps: [
    {
      id: "grep-500",
      label: "ステータス500の行だけを error500.txt にまとめる",
      hint: "grep でパターンを指定して絞り込めます。例: grep 500 /var/log/access.log > error500.txt",
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/error500.txt");
          if(res.error) return false;
          const lines = res.content.split("\n").filter(Boolean);
          return lines.length >= 2 && lines.every(l => l.includes("500"));
        },
      },
    },
  ],
  explanation: {
    why: "障害調査では「まずログから該当する行だけを絞り込み、証跡として保存する」という流れが基本です。grep 500 access.log > error500.txt のようにパターンとファイルを指定し、リダイレクトで結果を保存します。",
    alternatives: "似たパターン（例えば404も気になる場合）をまとめて拾いたいときは、正規表現を使って grep -E \"500|404\" access.log のようにOR条件で絞り込むこともできます。行番号を残したい場合は -n を付けます。",
    lpic: "LPIC Level1では grep の正規表現の基礎（., *, ^, $ など）や、-E（拡張正規表現を有効にする）オプションの有無による書式の違いがよく出題されます。",
  },
};
