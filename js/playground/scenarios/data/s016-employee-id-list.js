const EMP_FILE =
  "E001 田中太郎 営業 320000\n" +
  "E002 鈴木花子 総務 280000\n" +
  "E003 佐藤次郎 営業 350000\n" +
  "E004 高橋三郎 経理 300000\n" +
  "E005 伊藤久美 人事 270000\n" +
  "E006 渡辺健一 営業 360000\n" +
  "E007 山本愛 経理 290000\n";

export default {
  id: "s016",
  title: "社員番号だけ抜き出したい",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "テキスト処理",
  requester: { name: "田中さん", role: "人事部", avatar: "👩" },
  request: [
    "はじめまして、人事部の田中です。新人さんがLinuxコマンドに詳しいって聞いて、早速お願いしたいことが。",
    "社員一覧（employees.txt）から社員番号だけを取り出してほしいんです。",
    "資料に貼り付けたいので、employee_ids.txt というファイルに保存してもらえますか？",
  ],
  initialEnv: {
    files: [{ path: "~/employees.txt", content: EMP_FILE }],
  },
  steps: [
    {
      id: "extract-id",
      label: "社員番号だけを employee_ids.txt に書き出す",
      hint: [
        "スペースで区切られた列（フィールド）を扱うときは awk コマンドが便利です。",
        "取り出した値を出力するには print を使います。",
        "1列目（社員番号）は $1 で参照できます。例: awk '{print $1}' employees.txt > employee_ids.txt",
      ],
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/employee_ids.txt");
          if(res.error) return false;
          const lines = res.content.split("\n").map(l => l.trim()).filter(Boolean);
          const expected = ["E001", "E002", "E003", "E004", "E005", "E006", "E007"];
          return lines.length === expected.length && expected.every((id, i) => lines[i] === id);
        },
      },
    },
  ],
  explanation: {
    why: "awk はファイルを1行ずつ読み込み、スペースやタブで自動的に列（フィールド）へ分割してくれます。1列目は $1、2列目は $2 …という番号で参照できるので、awk '{print $1}' のように書くだけで社員番号だけを取り出せます。「必要な列だけ抜き出して資料にする」という作業は、日々の業務でとてもよく出てきます。",
    alternatives: "同じ結果は cut -d ' ' -f1 employees.txt でも得られます。cut は区切り文字と列番号だけを指定するシンプルな道具なので、条件分岐が不要な単純な抜き出しであればこちらの方が短く書けることもあります。逆に、条件で絞り込んだり計算したりしたい場合はawkの方が柔軟です。",
    lpic: "LPIC Level1（102試験）の「テキストストリームのフィルタ処理」領域では、awk '{print $N}' の基本形が頻出します。$0（行全体）と $1,$2...（各フィールド）の違い、そしてデフォルトの区切り文字が空白であることを理解しているかがよく問われます。",
  },
  clearComment: "助かった！これでそのまま資料に貼り付けられるよ、ありがとう！",
};
