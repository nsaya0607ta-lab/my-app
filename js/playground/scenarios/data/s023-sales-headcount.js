const EMP_FILE =
  "E001 田中太郎 営業 320000\n" +
  "E002 鈴木花子 総務 280000\n" +
  "E003 佐藤次郎 営業 350000\n" +
  "E004 高橋三郎 経理 300000\n" +
  "E005 伊藤久美 人事 270000\n" +
  "E006 渡辺健一 営業 360000\n" +
  "E007 山本愛 経理 290000\n";

export default {
  id: "s023",
  title: "営業部は何人いる？",
  difficulty: "中級",
  difficultyLevel: 3,
  category: "テキスト処理",
  requester: { name: "営業部", role: "", avatar: "👨" },
  request: [
    "突然だけど、営業部は今何人いるか教えてくれない？",
    "人数だけで良いんだ。employees.txt を見て、sales_count.txt に保存しておいてもらえるかな。",
  ],
  initialEnv: {
    files: [{ path: "~/employees.txt", content: EMP_FILE }],
  },
  steps: [
    {
      id: "count-sales",
      label: "営業部の人数を数えて sales_count.txt に保存する",
      hint: [
        "条件に一致した行だけを数えたいときは、awk の中で自分の変数を使えます。",
        "パターンに一致した行のたびに、変数を1つずつ増やします（count++ のように書けます）。",
        "例: awk '$3==\"営業\"{count++} END{print count}' employees.txt > sales_count.txt",
      ],
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/sales_count.txt");
          if(res.error) return false;
          return res.content.trim() === "3";
        },
      },
    },
  ],
  explanation: {
    why: "awk には組み込み変数 NR（読み込んだ行数の合計）がありますが、これはあくまで「全体の行数」なので、条件に合う行だけを数えるには自分で変数（count など）を用意し、条件に一致するたびに1ずつ増やす必要があります。最後に END でその値を表示すれば、条件付きの件数が求められます。",
    alternatives: "awk '$3==\"営業\"' employees.txt | wc -l のように、絞り込んだ結果をパイプで wc -l に渡して数える方法もよく使われます。awk 1本で完結させたいときは自作の変数を、既にある2つのコマンドを組み合わせたいときは wc を、という使い分けができます。",
    lpic: "LPIC Level1では、awk が自分で変数を宣言・初期化しなくても使える（未定義の変数は0や空文字として扱われる）という特徴と、NRのような組み込み変数との違いがよく出題されます。",
  },
  clearComment: "ありがとう！ちょうど人員配置の参考になるよ。",
};
