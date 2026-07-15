const HISTORY_LINES = [
  "2026-01-10 v1.0.0 初回リリース",
  "2026-02-01 v1.1.0 ログイン機能追加",
  "2026-02-20 v1.1.1 ログイン画面の不具合修正",
  "2026-03-15 v1.2.0 決済機能追加",
  "2026-04-02 v1.2.1 決済エラーの修正",
  "2026-04-28 v1.3.0 検索機能追加",
  "2026-05-19 v1.3.1 検索速度の改善",
  "2026-06-10 v1.4.0 通知機能追加",
  "2026-06-30 v1.4.1 通知の文言修正",
  "2026-07-08 v1.5.0 管理画面リニューアル",
  "2026-07-12 v1.5.1 管理画面の権限まわり修正",
  "2026-07-15 v1.5.2 軽微な表示崩れ修正",
];
const HISTORY_FILE = HISTORY_LINES.join("\n") + "\n";

export default {
  id: "s105",
  title: "リリース履歴の最初の3件だけほしい",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "テキスト処理",
  requester: { name: "田中さん", role: "人事部", avatar: "👩" },
  request: [
    "新人研修の資料で「このサービスの歴史」を紹介したいんです。",
    "release_history.txt の最初の3行（初期のリリース記録）だけを取り出して、first_releases.txt に保存してもらえますか？",
  ],
  initialEnv: {
    files: [{ path: "~/release_history.txt", content: HISTORY_FILE }],
  },
  steps: [
    {
      id: "head-view",
      label: "head で release_history.txt の先頭部分を確認する",
      hint: [
        "ファイルの先頭部分だけを表示するコマンドがあります。",
        "head コマンドです。オプションなしだと先頭10行を表示します。",
        "head release_history.txt と入力して、まず先頭の内容を確認しましょう。",
      ],
      goal: { type: "commandRan", cmd: "head" },
    },
    {
      id: "head-save",
      label: "先頭3行だけを first_releases.txt に保存する",
      hint: [
        "表示する行数は -n オプションで変更できます。",
        "head -n 3 で先頭3行になります。ファイルへの保存は > のリダイレクトを使います。",
        "head -n 3 release_history.txt > first_releases.txt と入力します。",
      ],
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/first_releases.txt");
          if(res.error) return false;
          const lines = res.content.split("\n").filter(Boolean);
          return lines.length === 3 && HISTORY_LINES.slice(0, 3).every((l, i) => lines[i] === l);
        },
      },
    },
  ],
  clearComment: "ぴったり3行！v1.0.0の頃の話、研修で盛り上がりそうです。ありがとうございます！",
  explanation: {
    why: "head はファイルの先頭部分を表示するコマンドです。オプションを付けなければ先頭10行、head -n 3 のように -n で行数を指定できます。「巨大なファイルの中身をちらっと確認したい」「先頭のヘッダー行だけ取り出したい」という場面で毎日のように使う基本コマンドです。",
    alternatives: "head -n 3 は head -3 と短く書ける環境もあります。逆にファイルの末尾を見たいときは tail を使います。head と tail を組み合わせると「4行目から6行目だけ」のような中間の取り出しもできます: head -n 6 file | tail -n 3。",
    lpic: "LPIC Level1（101試験）の「テキストストリームのフィルタ処理」で、head / tail の既定が10行であること、-n による行数指定は最頻出レベルの知識です。",
  },
};
