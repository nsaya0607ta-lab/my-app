export default {
  id: "s006",
  title: "顧客リストの件数集計",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "テキスト処理",
  requester: { name: "中村さん", role: "営業企画", avatar: "🧑‍💼" },
  request: [
    "users.csv に登録されているデータが何件あるか知りたくて。",
    "件数を user_count.txt というファイルに書いておいてもらえますか？",
  ],
  initialEnv: {
    files: [
      { path: "~/users.csv", content: "1,Sato\n2,Suzuki\n3,Tanaka\n" },
    ],
  },
  steps: [
    {
      id: "count",
      label: "users.csv の行数を数えて user_count.txt に保存する",
      hint: "wc -l で行数を数えられます。出力をファイルへ保存するには > を使います。例: wc -l users.csv > user_count.txt",
      goal: { type: "fileContains", path: "~/user_count.txt", pattern: "\\b3\\b" },
    },
  ],
  explanation: {
    why: "wc（word count）はファイルの行数・単語数・バイト数を数えるコマンドです。-l を付けると行数だけに絞り込めます。「集計してファイルに残す」という作業はレポート作成などで頻繁に登場します。",
    alternatives: "cat users.csv | wc -l > user_count.txt のように、cat の出力をパイプで wc に渡しても同じ結果になります（このファイル1つだけを数えるなら wc -l users.csv の方が簡潔です）。ヘッダー行がある表形式のファイルでは、grep -v で見出し行を除外してから数えることもよくあります。",
    lpic: "LPIC Level1では wc の各オプション（-l/-w/-c）に加え、パイプでコマンドをつなげたときにデータがどう流れるか（標準出力→標準入力）を理解しているかが問われます。",
  },
};
