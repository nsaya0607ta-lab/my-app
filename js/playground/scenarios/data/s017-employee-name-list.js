const EMP_FILE =
  "E001 田中太郎 営業 320000\n" +
  "E002 鈴木花子 総務 280000\n" +
  "E003 佐藤次郎 営業 350000\n" +
  "E004 高橋三郎 経理 300000\n" +
  "E005 伊藤久美 人事 270000\n" +
  "E006 渡辺健一 営業 360000\n" +
  "E007 山本愛 経理 290000\n";

export default {
  id: "s017",
  title: "名前だけの一覧がほしい",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "テキスト処理",
  requester: { name: "鈴木さん", role: "総務部", avatar: "👨" },
  request: [
    "お疲れさま、総務の鈴木です。人事の田中さんから聞いたよ、Linuxコマンドに強いんだってね。",
    "今度は名前だけの一覧を作りたくて。employees.txt から名前だけ抜き出してほしいんだ。",
    "employee_names.txt という名前で保存してもらえるかな。",
  ],
  initialEnv: {
    files: [{ path: "~/employees.txt", content: EMP_FILE }],
  },
  steps: [
    {
      id: "extract-name",
      label: "名前だけを employee_names.txt に書き出す",
      hint: [
        "今回も awk で列を取り出します。",
        "print で出力したい列を指定します。",
        "2列目（名前）は $2 です。例: awk '{print $2}' employees.txt > employee_names.txt",
      ],
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/employee_names.txt");
          if(res.error) return false;
          const lines = res.content.split("\n").map(l => l.trim()).filter(Boolean);
          const expected = ["田中太郎", "鈴木花子", "佐藤次郎", "高橋三郎", "伊藤久美", "渡辺健一", "山本愛"];
          return lines.length === expected.length && expected.every((name, i) => lines[i] === name);
        },
      },
    },
  ],
  explanation: {
    why: "列番号を変えるだけで、取り出す項目を自由に切り替えられるのが awk の強みです。社員番号のときは $1 でしたが、名前は2列目なので $2 を指定するだけで済みます。どの列に何のデータがあるかさえ把握していれば、応用が効きます。",
    alternatives: "cut -d ' ' -f2 employees.txt でも同じ結果になります。ただしデータの中に連続する空白が混ざっている場合、cut は列がずれてしまうことがあります。awk はデフォルトで連続する空白をまとめて1つの区切りとして扱うため、こうした揺れに強いという違いがあります。",
    lpic: "LPIC Level1では、cutとawkのどちらでも同じ処理ができる場面で、それぞれの得意・不得意（区切り文字の柔軟性、計算や条件分岐の可否など）を理解しているかが問われます。",
  },
  clearComment: "いいね、これで総務の名簿がすぐ作れるよ！",
};
