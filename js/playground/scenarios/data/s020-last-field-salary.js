const EMP_FILE =
  "E001 田中太郎 営業 320000\n" +
  "E002 鈴木花子 総務 280000\n" +
  "E003 佐藤次郎 営業 350000\n" +
  "E004 高橋三郎 経理 300000\n" +
  "E005 伊藤久美 人事 270000\n" +
  "E006 渡辺健一 営業 360000\n" +
  "E007 山本愛 経理 290000\n";

export default {
  id: "s020",
  title: "一番最後の項目だけほしい",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "テキスト処理",
  requester: { name: "部長", role: "", avatar: "👩" },
  request: [
    "お疲れさま。部長の私だけど、ちょっと頼みたいことがあって。",
    "employees.txt の一番最後の項目、つまり各行の最後の列だけを一覧にしてほしいの。",
    "list_last_field.txt に保存しておいてもらえる？",
  ],
  initialEnv: {
    files: [{ path: "~/employees.txt", content: EMP_FILE }],
  },
  steps: [
    {
      id: "extract-last-field",
      label: "各行の最後の列だけを list_last_field.txt に書き出す",
      hint: [
        "列の数がいくつあるか分からないときは、組み込み変数 NF が使えます。NF はその行の列数を表します。",
        "最後の列は $NF のように、$ のあとに列数の変数を書くと参照できます。",
        "例: awk '{print $NF}' employees.txt > list_last_field.txt",
      ],
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/list_last_field.txt");
          if(res.error) return false;
          const lines = res.content.split("\n").map(l => l.trim()).filter(Boolean);
          const expected = ["320000", "280000", "350000", "300000", "270000", "360000", "290000"];
          return lines.length === expected.length && expected.every((v, i) => lines[i] === v);
        },
      },
    },
  ],
  explanation: {
    why: "この社員一覧は4列なので $4 と書いても最後の列（給与）を取り出せますが、もしファイルによって列数がバラバラだったら $4 では通用しません。NF は「今読んでいる行の列数」を自動で数えてくれる組み込み変数なので、$NF と書けば常に「その行の最後の列」を指せます。",
    alternatives: "列数が常に4列だと分かっているなら awk '{print $4}' でも同じ結果になります。ただしログファイルのように行ごとに項目数が変わりうるデータでは、$NF の方が安全で汎用的です。",
    lpic: "LPIC Level1では、NR（現在までに読み込んだ行数）と NF（現在の行のフィールド数）という2つの組み込み変数の違いがよく問われます。$NF のように変数を使ってフィールド番号を指定できる、という点も出題されやすいポイントです。",
  },
  clearComment: "ありがとう！これでどの列でも柔軟に対応できるって分かったわ。",
};
