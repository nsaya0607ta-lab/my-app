const USERS_FILE =
  "tanaka\n" +
  "suzuki\n" +
  "tanaka\n" +
  "sato\n" +
  "suzuki\n" +
  "tanaka\n" +
  "ito\n" +
  "sato\n";

const UNIQUE_USERS = ["ito", "sato", "suzuki", "tanaka"];

export default {
  id: "s108",
  title: "アクセスしたユーザーの重複を取り除く",
  difficulty: "初級〜中級",
  difficultyLevel: 1,
  category: "テキスト処理",
  requester: { name: "先輩", role: "開発チーム", avatar: "👨‍💻" },
  request: [
    "今日システムにアクセスしたユーザーのID一覧を access_users.txt に出力したんだけど、同じ人が何回もログインしてて重複だらけなんだ。",
    "重複を取り除いた「今日アクセスした人の一覧」を unique_users.txt に保存してほしい。",
    "ついでに、誰が何回アクセスしたかも知りたいな。",
  ],
  initialEnv: {
    files: [{ path: "~/access_users.txt", content: USERS_FILE }],
  },
  steps: [
    {
      id: "sort-uniq-save",
      label: "重複を除いた一覧を unique_users.txt に保存する",
      hint: [
        "重複行をまとめるには uniq コマンドを使います。ただし uniq は「連続した」重複しかまとめられないため、先に sort で並べ替えるのが鉄則です。",
        "sort と uniq をパイプ（|）でつなぎ、結果を > でファイルへ保存します。",
        "sort access_users.txt | uniq > unique_users.txt と入力します。",
      ],
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/unique_users.txt");
          if(res.error) return false;
          const lines = res.content.split("\n").filter(Boolean);
          return lines.length === UNIQUE_USERS.length && UNIQUE_USERS.every((l, i) => lines[i] === l);
        },
      },
    },
    {
      id: "uniq-count",
      label: "uniq -c で各ユーザーのアクセス回数を表示する",
      hint: [
        "uniq に -c オプションを付けると、まとめた行数（＝出現回数）を行頭に表示してくれます。",
        "こちらも sort してから uniq -c に渡します。",
        "sort access_users.txt | uniq -c と入力します。tanaka が3回なのが分かるはずです。",
      ],
      goal: { type: "commandRan", pattern: "uniq\\s+-c" },
    },
  ],
  clearComment: "4人がアクセスしてて、tanaka さんが3回か。sort → uniq の合わせ技、ちゃんと身についてるね！",
  explanation: {
    why: "uniq は「連続する同じ行」を1つにまとめるコマンドです。重要なのは、離れた場所にある重複はまとめられないこと。そのため実務では、ほぼ必ず sort で並べ替えてから uniq に渡します（sort file | uniq）。-c を付けると各行の出現回数が先頭に付くため、集計にも使えます。",
    alternatives: "単純な重複除去だけなら sort -u file でも同じ結果になります（sort | uniq の短縮形と考えられます）。出現回数のランキングを作りたいときは sort file | uniq -c | sort -nr が定番の組み合わせで、アクセスログの「頻出IPアドレス調査」などで多用されます。",
    lpic: "LPIC Level1（102試験）では、「uniq は連続した重複行しか処理しない（だから sort が先）」という性質が最頻出ポイントです。uniq -c（回数表示）・-d（重複行のみ表示）・-u（重複していない行のみ表示）も出題されます。",
  },
};
