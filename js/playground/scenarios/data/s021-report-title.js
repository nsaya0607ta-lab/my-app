const EMP_FILE =
  "E001 田中太郎 営業 320000\n" +
  "E002 鈴木花子 総務 280000\n" +
  "E003 佐藤次郎 営業 350000\n" +
  "E004 高橋三郎 経理 300000\n" +
  "E005 伊藤久美 人事 270000\n" +
  "E006 渡辺健一 営業 360000\n" +
  "E007 山本愛 経理 290000\n";

export default {
  id: "s021",
  title: "レポートにタイトルを付けたい",
  difficulty: "中級",
  difficultyLevel: 3,
  category: "テキスト処理",
  requester: { name: "先輩エンジニア", role: "", avatar: "👨" },
  request: [
    "お、ちょうどいいところに。ちょっと頼みたいんだけど。",
    "employees.txt の中身をそのままレポートとして提出したいんだけど、味気ないから先頭にタイトルを付けてほしいんだ。",
    "「===== 社員一覧レポート =====」というタイトルを1行目に入れて、そのあとに社員データを続けて、report_title.txt に保存してくれる？",
  ],
  // アプリ内キーボードでは打てない日本語を、ワンタップで入力欄へ挿入できるようにする
  quickTexts: ["===== 社員一覧レポート =====", "社員一覧レポート"],
  initialEnv: {
    files: [{ path: "~/employees.txt", content: EMP_FILE }],
  },
  steps: [
    {
      id: "add-title",
      label: "タイトル付きのレポートを report_title.txt に書き出す",
      hint: [
        "データを処理する前に、一度だけ実行したい処理には BEGIN ブロックが使えます。",
        "BEGIN{ ... } の中に print でタイトルの文字列を書きます。",
        "例: awk 'BEGIN{print \"===== 社員一覧レポート =====\"} {print}' employees.txt > report_title.txt",
      ],
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/report_title.txt");
          if(res.error) return false;
          const lines = res.content.split("\n").filter(Boolean);
          const body = [
            "E001 田中太郎 営業 320000",
            "E002 鈴木花子 総務 280000",
            "E003 佐藤次郎 営業 350000",
            "E004 高橋三郎 経理 300000",
            "E005 伊藤久美 人事 270000",
            "E006 渡辺健一 営業 360000",
            "E007 山本愛 経理 290000",
          ];
          if(lines.length !== body.length + 1) return false;
          if(lines[0] !== "===== 社員一覧レポート =====") return false;
          return body.every((l, i) => lines[i + 1] === l);
        },
      },
    },
  ],
  explanation: {
    why: "awk のプログラムは「BEGIN{ 最初に1回だけ実行する処理 }」「{ 各行ごとに実行する処理 }」「END{ 最後に1回だけ実行する処理 }」の3つの部品を組み合わせて書けます。BEGIN はまだ1行も読み込む前に実行されるので、見出しやタイトルを付けるのにぴったりです。",
    alternatives: "echo \"===== 社員一覧レポート =====\" > report_title.txt としてタイトルだけ書き込み、続けて cat employees.txt >> report_title.txt（追記モード）でデータを追加する、という2段階の方法でも同じ結果になります。1つのコマンドで完結させたいときは awk の BEGIN が便利です。",
    lpic: "LPIC Level1では、awk プログラムが BEGIN／メインの処理／END という3つのパートで構成されることと、それぞれが「いつ」実行されるのかを理解しているかが問われます。",
  },
  clearComment: "いいね！これで提出資料っぽくなったよ、ありがとう！",
};
