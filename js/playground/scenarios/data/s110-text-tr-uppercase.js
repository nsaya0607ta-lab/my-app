const CODES_FILE =
  "abc-101\n" +
  "Def-102\n" +
  "ghi-103\n" +
  "JKl-104\n" +
  "mno-105\n";

const UPPER_LINES = ["ABC-101", "DEF-102", "GHI-103", "JKL-104", "MNO-105"];

export default {
  id: "s110",
  title: "商品コードの表記ゆれを大文字に統一",
  difficulty: "初級〜中級",
  difficultyLevel: 1,
  category: "テキスト処理",
  requester: { name: "佐藤さん", role: "企画チーム", avatar: "🧑‍💼" },
  request: [
    "各店舗から集めた商品コードの一覧 codes.txt、担当者によって大文字だったり小文字だったりバラバラなんだよね…。",
    "システムに取り込むために、全部大文字に統一して codes_upper.txt に保存してもらえる？",
  ],
  initialEnv: {
    files: [{ path: "~/codes.txt", content: CODES_FILE }],
  },
  steps: [
    {
      id: "tr-view",
      label: "tr で codes.txt を大文字に変換して表示する",
      hint: [
        "文字の変換には tr コマンドを使います。tr はファイルを直接開けないので、cat の出力をパイプ（|）で渡します。",
        "tr 変換前の文字集合 変換後の文字集合 の形で指定します。a-z のように範囲でまとめて書けます。",
        "cat codes.txt | tr a-z A-Z と入力します。",
      ],
      goal: { type: "commandRan", pattern: "(^|\\|\\s*)tr\\s" },
    },
    {
      id: "tr-save",
      label: "変換結果を codes_upper.txt に保存する",
      hint: [
        "表示できたら、結果を > でファイルへ保存しましょう。",
        "パイプの最後に > 保存先ファイル名 を付けます。",
        "cat codes.txt | tr a-z A-Z > codes_upper.txt と入力します。",
      ],
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/codes_upper.txt");
          if(res.error) return false;
          const lines = res.content.split("\n").filter(Boolean);
          return lines.length === UPPER_LINES.length && UPPER_LINES.every((l, i) => lines[i] === l);
        },
      },
    },
  ],
  clearComment: "全部大文字に揃った！これでインポートエラーも出ないはず。地味だけど大事な作業、ありがとう！",
  explanation: {
    why: "tr（translate）は、標準入力の文字を1文字単位で別の文字へ変換するコマンドです。tr a-z A-Z なら a→A、b→B…と対応する位置の文字へ置き換えます。ファイル名を引数に取れないため、cat file | tr ... や tr ... < file のように標準入力経由で渡すのが特徴です。",
    alternatives: "tr -d '文字集合' で指定した文字の削除（例: tr -d ',' でカンマを除去）、tr -s ' ' で連続する空白を1つに圧縮、といった使い方もあります。単語や行単位の複雑な置換は sed、列を意識した処理は awk が向いており、「1文字単位の変換・削除は tr」と覚えると使い分けやすいです。",
    lpic: "LPIC Level1（102試験）では、tr が標準入力からしか読めないこと（cat file | tr や < file が必要）、-d（削除）・-s（圧縮）オプションが頻出ポイントです。",
  },
};
