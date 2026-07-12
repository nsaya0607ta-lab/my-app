const EMP_FILE =
  "E001 田中太郎 営業 320000\n" +
  "E002 鈴木花子 総務 280000\n" +
  "E003 佐藤次郎 営業 350000\n" +
  "E004 高橋三郎 経理 300000\n" +
  "E005 伊藤久美 人事 270000\n" +
  "E006 渡辺健一 営業 360000\n" +
  "E007 山本愛 経理 290000\n";

export default {
  id: "s027",
  title: "見やすく整形したレポートがほしい",
  difficulty: "LPIC Level1",
  difficultyLevel: 4,
  category: "テキスト処理",
  requester: { name: "教育担当", role: "", avatar: "👨" },
  request: [
    "教育担当です。研修の総仕上げに、もう1つだけお願いしたいことが。",
    "employees.txt から社員番号・名前・部署を、桁を揃えて見やすく整形して表示してほしいんだ。",
    "format_report.txt という名前で保存してもらえるかな。",
  ],
  initialEnv: {
    files: [{ path: "~/employees.txt", content: EMP_FILE }],
  },
  steps: [
    {
      id: "format-printf",
      label: "社員番号・名前・部署を整形して format_report.txt に書き出す",
      hint: [
        "文字列を桁揃えして表示したいときは、print ではなく printf コマンドが使えます。",
        "printf \"書式\", 値1, 値2, ... という形で書きます。%-Ns は「左詰めでN桁分の幅を確保する」という書式です。",
        "例: awk '{printf \"%-6s %-8s %-4s\\n\", $1, $2, $3}' employees.txt > format_report.txt（printfは改行を自動で入れないので \\n を忘れずに）",
      ],
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/format_report.txt");
          if(res.error) return false;
          const lines = res.content.split("\n").map(l => l.replace(/\s+$/, "")).filter(Boolean);
          const rows = [
            ["E001", "田中太郎", "営業"],
            ["E002", "鈴木花子", "総務"],
            ["E003", "佐藤次郎", "営業"],
            ["E004", "高橋三郎", "経理"],
            ["E005", "伊藤久美", "人事"],
            ["E006", "渡辺健一", "営業"],
            ["E007", "山本愛", "経理"],
          ];
          if(lines.length !== rows.length) return false;
          return rows.every(([id, name, dept], i) => new RegExp(`^${id}\\s+${name}\\s+${dept}$`).test(lines[i]));
        },
      },
    },
  ],
  explanation: {
    why: "print は値をそのまま OFS（デフォルトは半角スペース1つ）で区切って出力しますが、桁数を揃えて表を整えるには printf が必要です。%-6s のように「変換指定子（sは文字列、dは整数など）」と「幅」を組み合わせることで、列の幅を自分でコントロールできます。",
    alternatives: "同じような整形は column -t コマンドでも簡単にできます。awk '{print $1, $2, $3}' employees.txt | column -t のように、awkで必要な列だけ抜き出してから column -t に渡すと、値の長さに応じて自動的に幅を揃えてくれます。細かく桁数を指定したい場合は printf、手早く整えたい場合は column、と使い分けられます。",
    lpic: "LPIC Level1では、printf の主な変換指定子（%s, %d, %f など）と、print との違い（printfは改行を自動で付けない、桁数や書式を細かく指定できる）が出題されます。シェルの printf コマンドと awk の printf 文が似た書式を持つことも押さえておきましょう。",
  },
  clearComment: "きれいにまとまったね！これで研修も卒業だ。",
};
