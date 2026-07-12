const EMP_FILE =
  "E001 田中太郎 営業 320000\n" +
  "E002 鈴木花子 総務 280000\n" +
  "E003 佐藤次郎 営業 350000\n" +
  "E004 高橋三郎 経理 300000\n" +
  "E005 伊藤久美 人事 270000\n" +
  "E006 渡辺健一 営業 360000\n" +
  "E007 山本愛 経理 290000\n";

export default {
  id: "s019",
  title: "給与30万円以上の社員を知りたい",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "テキスト処理",
  requester: { name: "山本さん", role: "経理部", avatar: "👨" },
  request: [
    "経理の山本です。給与の集計をしていて確認したいことがあって。",
    "employees.txt の中で、給与が30万円以上の社員だけ知りたいんだ。",
    "該当する行を high_salary.txt に保存してもらえる？",
  ],
  initialEnv: {
    files: [{ path: "~/employees.txt", content: EMP_FILE }],
  },
  steps: [
    {
      id: "filter-salary",
      label: "給与30万円以上の行だけを high_salary.txt に書き出す",
      hint: [
        "数値の比較にも awk の条件（パターン）が使えます。",
        "4列目が給与なので $4 を条件に使います。",
        "「以上」は >= で表せます。例: awk '$4>=300000' employees.txt > high_salary.txt",
      ],
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/high_salary.txt");
          if(res.error) return false;
          const lines = res.content.split("\n").filter(Boolean);
          const expected = [
            "E001 田中太郎 営業 320000",
            "E003 佐藤次郎 営業 350000",
            "E004 高橋三郎 経理 300000",
            "E006 渡辺健一 営業 360000",
          ];
          return lines.length === expected.length && expected.every((l, i) => lines[i] === l);
        },
      },
    },
  ],
  explanation: {
    why: "awk はフィールドの値を数値として比較することもできます。$3==\"営業\" のような文字列比較と同じ書き方で、$4>=300000 のように数値の大小を条件にできます。「等しいかどうか」と「大小」のどちらの条件も、パターンとして書けるのがポイントです。",
    alternatives: "sort -k4 -n employees.txt で給与順に並べ替えてから目視で確認する、という方法もありますが、件数が多くなると非効率です。条件を機械的に判定できる awk の方が、集計作業には向いています。",
    lpic: "LPIC Level1では、awk の比較演算子（==, !=, <, <=, >, >=）や、フィールドの値が自動的に数値として扱われるケースについて問われることがあります。文字列を数値として比較する際の注意点も押さえておきましょう。",
  },
  clearComment: "助かるよ！これで昇給対象のチェックがしやすくなる。",
};
