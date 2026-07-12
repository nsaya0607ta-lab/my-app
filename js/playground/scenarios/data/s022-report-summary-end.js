const EMP_FILE =
  "E001 田中太郎 営業 320000\n" +
  "E002 鈴木花子 総務 280000\n" +
  "E003 佐藤次郎 営業 350000\n" +
  "E004 高橋三郎 経理 300000\n" +
  "E005 伊藤久美 人事 270000\n" +
  "E006 渡辺健一 営業 360000\n" +
  "E007 山本愛 経理 290000\n";

export default {
  id: "s022",
  title: "レポートの最後に集計終了と入れたい",
  difficulty: "中級",
  difficultyLevel: 3,
  category: "テキスト処理",
  requester: { name: "先輩エンジニア", role: "", avatar: "👩" },
  request: [
    "さっきのレポート、見やすくなって助かったよ。",
    "もう一声、employees.txt の社員データを全部出力したあとに『集計終了』って一言添えてほしいんだ。",
    "report_end.txt という名前で保存してもらえる？",
  ],
  initialEnv: {
    files: [{ path: "~/employees.txt", content: EMP_FILE }],
  },
  steps: [
    {
      id: "add-end-message",
      label: "最後に「集計終了」を付けたレポートを report_end.txt に書き出す",
      hint: [
        "全部のデータを処理し終えたあとに、一度だけ実行したい処理には END ブロックが使えます。",
        "END{ ... } の中に print で表示したい文字列を書きます。",
        "例: awk '{print} END{print \"集計終了\"}' employees.txt > report_end.txt",
      ],
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/report_end.txt");
          if(res.error) return false;
          const lines = res.content.split("\n").filter(Boolean);
          const body = [
            "E001 田中太郎 営業 320000",
            "E002 鈴木花子 総務 280000",
            "E003 佐藤次郎 営業 350000",
            "E004 高橋三郎 経理 300000",
            "E005 伊藤久美 人事 270000",
            "E006 渡辺健一 営業 360000",
            "E007 山本愛 経理 290000",
          ];
          if(lines.length !== body.length + 1) return false;
          if(lines[lines.length - 1] !== "集計終了") return false;
          return body.every((l, i) => lines[i] === l);
        },
      },
    },
  ],
  explanation: {
    why: "BEGIN が「最初に1回だけ」実行されるのに対して、END は「すべての行を読み終えたあとに1回だけ」実行されます。集計結果のまとめや、締めのメッセージを最後に加えたいときに使う場所です。",
    alternatives: "cat employees.txt > report_end.txt でデータを書き出したあと、echo \"集計終了\" >> report_end.txt（追記）を続けて実行する、という2コマンドでも同じ結果になります。1つのコマンドにまとめたい場合は awk の END が便利です。",
    lpic: "LPIC Level1では、BEGIN/ENDがそれぞれ「入力データを読む前」「読み終えたあと」というタイミングで実行される点、そして通常のパターン{アクション}が「1行ごと」に実行される点を区別できるかが問われます。",
  },
  clearComment: "完璧！これでレポートの体裁が整ったよ、ありがとう！",
};
