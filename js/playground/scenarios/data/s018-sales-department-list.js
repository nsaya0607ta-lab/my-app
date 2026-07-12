const EMP_FILE =
  "E001 田中太郎 営業 320000\n" +
  "E002 鈴木花子 総務 280000\n" +
  "E003 佐藤次郎 営業 350000\n" +
  "E004 高橋三郎 経理 300000\n" +
  "E005 伊藤久美 人事 270000\n" +
  "E006 渡辺健一 営業 360000\n" +
  "E007 山本愛 経理 290000\n";

export default {
  id: "s018",
  title: "営業部の社員だけ調べたい",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "テキスト処理",
  requester: { name: "佐藤さん", role: "営業部", avatar: "👩" },
  request: [
    "営業部の佐藤です、突然ごめんね。",
    "employees.txt の中から営業部の社員だけを調べたくて。",
    "該当する行をそのまま sales_employees.txt に保存してもらえますか？",
  ],
  initialEnv: {
    files: [{ path: "~/employees.txt", content: EMP_FILE }],
  },
  steps: [
    {
      id: "filter-sales",
      label: "営業部の行だけを sales_employees.txt に書き出す",
      hint: [
        "awk では条件（パターン）を書くと、条件に合う行だけを処理できます。",
        "3列目が部署なので、$3 を条件に使います。",
        "文字列が等しいかどうかは == で比較します。例: awk '$3==\"営業\"' employees.txt > sales_employees.txt",
      ],
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/sales_employees.txt");
          if(res.error) return false;
          const lines = res.content.split("\n").filter(Boolean);
          const expected = [
            "E001 田中太郎 営業 320000",
            "E003 佐藤次郎 営業 350000",
            "E006 渡辺健一 営業 360000",
          ];
          return lines.length === expected.length && expected.every((l, i) => lines[i] === l);
        },
      },
    },
  ],
  explanation: {
    why: "awk は「パターン { アクション }」という形で書けて、アクション（{ }の中身）を省略すると「条件に合う行をそのまま表示する」という意味になります。$3==\"営業\" のような条件をパターンとして指定するだけで、部署が営業の行だけを抜き出せます。",
    alternatives: "同じ結果は grep \"営業\" employees.txt でも得られますが、grep は行の中に「営業」という文字列が含まれているかどうかしか見ないため、もし社員名に「営業」という文字が入っていたりすると誤って一致してしまう可能性があります。awk なら $3 のように列を指定して比較できるので、より正確に絞り込めます。",
    lpic: "LPIC Level1では、awk のパターンマッチング（正規表現によるマッチと、フィールドを使った比較の違い）がよく出題されます。grep との使い分け方も定番の論点です。",
  },
  clearComment: "ありがとう！これで営業部の名簿がすぐ分かるよ。",
};
