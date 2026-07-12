const EMP_CSV =
  "E001,田中太郎,営業,320000\n" +
  "E002,鈴木花子,総務,280000\n" +
  "E003,佐藤次郎,営業,350000\n" +
  "E004,高橋三郎,経理,300000\n" +
  "E005,伊藤久美,人事,270000\n" +
  "E006,渡辺健一,営業,360000\n" +
  "E007,山本愛,経理,290000\n";

export default {
  id: "s026",
  title: "CSVファイルもちゃんと読み込みたい",
  difficulty: "LPIC Level1",
  difficultyLevel: 4,
  category: "テキスト処理",
  requester: { name: "インフラ担当", role: "", avatar: "👨" },
  request: [
    "インフラ担当です。人事から社員データをCSV形式でもらったんだけど、",
    "そのまま awk にかけてもうまく列が分かれてくれなくて。",
    "employees.csv から名前だけ取り出して csv_names.txt に保存できるか、試してもらえますか？",
  ],
  initialEnv: {
    files: [{ path: "~/employees.csv", content: EMP_CSV }],
  },
  steps: [
    {
      id: "parse-csv",
      label: "employees.csv から名前だけを csv_names.txt に書き出す",
      hint: [
        "CSVはカンマ区切りです。awk はデフォルトでは空白を区切り文字として使うため、そのままだと1列にまとまってしまいます。",
        "区切り文字（フィールドセパレータ）を切り替えるオプションがあります。",
        "-F オプションで区切り文字を指定します。例: awk -F \",\" '{print $2}' employees.csv > csv_names.txt",
      ],
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/csv_names.txt");
          if(res.error) return false;
          const lines = res.content.split("\n").map(l => l.trim()).filter(Boolean);
          const expected = ["田中太郎", "鈴木花子", "佐藤次郎", "高橋三郎", "伊藤久美", "渡辺健一", "山本愛"];
          return lines.length === expected.length && expected.every((name, i) => lines[i] === name);
        },
      },
    },
  ],
  explanation: {
    why: "awk はデフォルトで空白（スペースやタブ）を区切り文字として使いますが、-F オプションを付けることで任意の文字に切り替えられます。CSV（Comma-Separated Values）はその名の通りカンマ区切りなので、-F \",\" と指定すれば正しく列に分割できます。",
    alternatives: "1行だけの簡易的な確認であれば、echo \"E001,田中太郎,営業,320000\" | tr ',' ' ' のように tr コマンドでカンマをスペースに変換してから awk に渡す、という方法もありますが、ファイル全体を扱うには不向きです。素直に -F \",\" を使うのが確実です。",
    lpic: "LPIC Level1では、awk の -F オプション（区切り文字の指定）や、組み込み変数 FS（Field Separator）との関係がよく出題されます。-F \",\" と awk 'BEGIN{FS=\",\"}' はどちらも同じ意味になる、という点も押さえておきましょう。",
  },
  clearComment: "助かりました！これでCSVでももう困らなさそうです。",
};
