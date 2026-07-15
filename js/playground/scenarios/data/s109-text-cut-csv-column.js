const CSV_FILE =
  "E001,田中太郎,営業\n" +
  "E002,鈴木花子,総務\n" +
  "E003,佐藤次郎,営業\n" +
  "E004,高橋三郎,経理\n" +
  "E005,伊藤久美,人事\n";

const NAME_LINES = ["田中太郎", "鈴木花子", "佐藤次郎", "高橋三郎", "伊藤久美"];

export default {
  id: "s109",
  title: "CSVから名前の列だけ切り出す",
  difficulty: "初級〜中級",
  difficultyLevel: 1,
  category: "テキスト処理",
  requester: { name: "田中さん", role: "人事部", avatar: "👩" },
  request: [
    "社員名簿をCSV形式（カンマ区切り）で members.csv に用意しました。",
    "宛名ラベルを作りたいので、2列目の「名前」だけを取り出して names.txt に保存してもらえますか？",
  ],
  initialEnv: {
    files: [{ path: "~/members.csv", content: CSV_FILE }],
  },
  steps: [
    {
      id: "cut-view",
      label: "cut で members.csv の名前列を表示してみる",
      hint: [
        "区切り文字で区切られた特定の列（フィールド）を取り出すには cut コマンドが便利です。",
        "-d で区切り文字、-f で何列目かを指定します。今回はカンマ区切りの2列目です。",
        "cut -d \",\" -f 2 members.csv と入力します。",
      ],
      goal: { type: "commandRan", cmd: "cut" },
    },
    {
      id: "cut-save",
      label: "名前列を names.txt に保存する",
      hint: [
        "表示できたら、あとは結果をファイルへ保存するだけです。",
        "> のリダイレクトで保存先ファイルを指定します。",
        "cut -d \",\" -f 2 members.csv > names.txt と入力します。",
      ],
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/names.txt");
          if(res.error) return false;
          const lines = res.content.split("\n").filter(Boolean);
          return lines.length === NAME_LINES.length && NAME_LINES.every((l, i) => lines[i] === l);
        },
      },
    },
  ],
  clearComment: "名前だけきれいに並んでる！これでラベル印刷に回せます、ありがとうございます！",
  explanation: {
    why: "cut は各行を区切り文字で分割し、指定した列（フィールド）だけを取り出すコマンドです。-d（delimiter）で区切り文字を、-f（field）で列番号を指定します。CSVやコロン区切りの /etc/passwd のような「規則正しい区切りのデータ」から特定の列を抜くのが得意です。",
    alternatives: "複数列を取り出すこともできます: cut -d \",\" -f 1,2 members.csv で1列目と2列目。同じ処理は awk -F \",\" '{print $2}' members.csv でも可能です。単純な列の抜き出しは cut、条件による絞り込みや計算を伴うなら awk、と使い分けると読みやすいコマンドになります。",
    lpic: "LPIC Level1（102試験）では、cut の -d と -f の組み合わせが最重要です。「/etc/passwd からユーザー名だけ取り出す cut -d: -f1」は定番の出題パターンなので、そのまま覚えておくと得点源になります。",
  },
};
