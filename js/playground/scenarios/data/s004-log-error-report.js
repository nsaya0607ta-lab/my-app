export default {
  id: "s004",
  title: "アプリログからのエラー抽出",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "テキスト処理",
  requester: { name: "山田さん", role: "運用担当", avatar: "🧑‍💻" },
  request: [
    "昨日の夜間バッチでエラーが出てたらしいんだけど、",
    "/var/log/app.log の中から ERROR の行だけ抜き出して、",
    "ホームディレクトリの error_report.txt にまとめておいてくれる？",
  ],
  initialEnv: {
    dirs: ["/var/log"],
    files: [
      { path: "/var/log/app.log", content: "INFO batch start\nERROR db connection failed\nINFO retrying\nERROR timeout while syncing\nINFO batch finished\n" },
    ],
  },
  steps: [
    {
      id: "grep-report",
      label: "ERRORの行だけを error_report.txt にまとめる",
      hint: "grep でパターンにマッチする行だけ取り出せます。出力をファイルへ書き込むには > を使います。例: grep ERROR /var/log/app.log > error_report.txt",
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/error_report.txt");
          if(res.error) return false;
          const lines = res.content.split("\n").filter(Boolean);
          return lines.length >= 2 && lines.every(l => l.includes("ERROR"));
        },
      },
    },
  ],
  explanation: {
    why: "grep はパターンにマッチする行だけを抜き出すコマンドです。「>」は標準出力をファイルへ上書き保存するリダイレクト、「>>」は追記です。「調べた結果をファイルに残す」という作業は障害調査・報告のたびに発生する、非常に実務的な操作です。",
    alternatives: "行番号も一緒に残しておきたい場合は grep -n ERROR /var/log/app.log > error_report.txt のように -n を付けます。大文字小文字を気にせず探したいときは -i を組み合わせます。",
    lpic: "LPIC Level1では grep の主要オプション（-i, -v, -n, -c）とリダイレクト（>, >>）・パイプ（|）の違いが頻出です。「>>と>のどちらが追記か」は特に定番の出題ポイントです。",
  },
};
