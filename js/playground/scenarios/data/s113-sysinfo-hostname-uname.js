export default {
  id: "s113",
  title: "サーバー情報の棚卸し報告",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "システム情報確認",
  requester: { name: "部長", role: "システム部", avatar: "👨‍💼" },
  request: [
    "社内サーバーの棚卸しをやっている。今ログインしているサーバーの情報を報告してくれ。",
    "必要なのは「ホスト名」と「カーネルのバージョン」の2つだ。頼んだぞ。",
  ],
  steps: [
    {
      id: "hostname-check",
      label: "hostname でホスト名を確認する",
      hint: [
        "システムに付けられた名前（ホスト名）を表示するコマンドがあります。",
        "そのまま「ホスト名」という意味の英単語がコマンド名です。",
        "hostname と入力します。",
      ],
      goal: { type: "commandRan", cmd: "hostname" },
    },
    {
      id: "uname-check",
      label: "uname でカーネルバージョンを確認する",
      hint: [
        "カーネルなどのシステム情報を表示するには uname コマンドを使います。オプションなしだと「Linux」としか表示されません。",
        "カーネルのリリースバージョンを表示するオプションは -r（release）です。",
        "uname -r と入力します（uname -a ですべての情報をまとめて確認してもOKです）。",
      ],
      goal: { type: "commandRan", cmd: "uname", pattern: "uname\\s+-[a-zA-Z]*[ra]" },
    },
  ],
  clearComment: "linux-playground、カーネル6.8系か。よし、台帳に記録した。すぐ調べて報告できるのは強みだぞ。",
  explanation: {
    why: "hostname はネットワーク上でこのマシンを識別するための名前（ホスト名）を表示します。uname はカーネルを中心としたシステム情報を表示するコマンドで、-r でカーネルリリース、-a で全情報（カーネル名・ホスト名・バージョン・アーキテクチャなど）をまとめて確認できます。障害報告やソフトウェアの対応バージョン確認で、この2つはセットでよく使われます。",
    alternatives: "uname -n でもホスト名を表示できます（hostname とほぼ同じ出力）。マシンのアーキテクチャだけ知りたいときは uname -m（x86_64 など）。ディストリビューションの名前やバージョン（Ubuntu 24.04 など）はカーネル情報とは別物で、cat /etc/os-release で確認します。",
    lpic: "LPIC Level1では、uname の -r（カーネルリリース）・-a（全情報）・-m（アーキテクチャ）の使い分けが頻出です。「カーネルバージョンを確認するコマンドは？」という素直な問題がよく出ます。",
  },
};
