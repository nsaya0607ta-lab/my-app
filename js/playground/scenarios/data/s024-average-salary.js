const EMP_FILE =
  "E001 田中太郎 営業 320000\n" +
  "E002 鈴木花子 総務 280000\n" +
  "E003 佐藤次郎 営業 350000\n" +
  "E004 高橋三郎 経理 300000\n" +
  "E005 伊藤久美 人事 270000\n" +
  "E006 渡辺健一 営業 360000\n" +
  "E007 山本愛 経理 290000\n";

export default {
  id: "s024",
  title: "平均給与を知りたい",
  difficulty: "LPIC Level1",
  difficultyLevel: 4,
  category: "テキスト処理",
  requester: { name: "経理部", role: "", avatar: "👩" },
  request: [
    "経理からです。給与の平均を出したいんだけど、電卓で1件ずつ足すのは大変で。",
    "employees.txt から平均給与を計算して、avg_salary.txt に保存してもらえる？",
  ],
  initialEnv: {
    files: [{ path: "~/employees.txt", content: EMP_FILE }],
  },
  steps: [
    {
      id: "average-salary",
      label: "平均給与を計算して avg_salary.txt に保存する",
      hint: [
        "各行の値を合計したいときは、awk の中で自分の変数に足し込んでいきます（例: sum += $4）。",
        "全部の行を読み終えたあとに、END ブロックで合計を件数で割って平均を求めます。",
        "件数は組み込み変数 NR（読み込んだ行数）でわかります。例: awk '{sum+=$4} END{print sum/NR}' employees.txt > avg_salary.txt",
      ],
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/avg_salary.txt");
          if(res.error) return false;
          return Math.abs(parseFloat(res.content.trim()) - 310000) < 0.5;
        },
      },
    },
  ],
  explanation: {
    why: "平均を求めるには「合計」と「件数」の両方が必要です。合計は自分で用意した変数（sum など）に各行の値を足し込んでいくことで求められ、件数は組み込み変数 NR がちょうど「最後に読み終えた行の行数＝全件数」を表しているので、そのまま使えます。END で sum/NR を計算すれば平均になります。",
    alternatives: "件数があらかじめ分かっている場合は awk '{sum+=$4} END{print sum/7}' のように固定値で割ることもできますが、社員が増減するたびに数値を書き換える必要があり、ミスの元になります。NR を使えば、社員が何人になっても書き換え不要です。",
    lpic: "LPIC Level1では、awk が算術演算（+, -, *, /）に対応していること、そして未初期化の変数（sum など）が自動的に0として扱われる、という仕様がよく出題されます。",
  },
  clearComment: "ばっちり！これで来期の給与テーブルの参考にするよ。",
};
