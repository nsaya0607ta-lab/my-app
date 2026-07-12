export default {
  id: "s010",
  title: "毎朝自動実行される読み取り専用ファイルの用意",
  difficulty: "中級",
  difficultyLevel: 3,
  category: "権限・cron",
  requester: { name: "Aさん", role: "チームメンバー", avatar: "👩" },
  request: [
    "testディレクトリを作って、その中にtest.txtを作りたい。",
    "このファイルは誰にも書き換えられないようにしたい。",
    "さらに毎日朝8時に自動で実行されるようにしたい。",
  ],
  steps: [
    {
      id: "mkdir",
      label: "test ディレクトリを作成する",
      hint: "mkdir コマンドで新しいディレクトリを作成できます。",
      goal: { type: "dirExists", path: "~/test" },
    },
    {
      id: "touch",
      label: "test の中に test.txt を作成する",
      hint: "cd test で移動してから touch test.txt、または touch test/test.txt でも作成できます。",
      goal: { type: "fileExists", path: "~/test/test.txt" },
    },
    {
      id: "chmod",
      label: "test.txt を誰にも書き換えられないようにする",
      hint: "chmod で書き込み権限を外します。例: chmod 444 test/test.txt（444/400/a-w など、書き込み権限が誰にも無い状態ならOKです）",
      goal: { type: "permission", path: "~/test/test.txt", rule: "no-write" },
    },
    {
      id: "cron",
      label: "毎日朝8時に実行されるようcrontabへ登録する",
      hint: "crontab -e で疑似エディタが開きます。「分 時 日 月 曜日 コマンド」の順で書きます。毎朝8時ちょうどなら 0 8 * * * のように指定します。例: 0 8 * * * /home/student/test/test.txt",
      goal: { type: "cronRegistered", min: "0", hour: "8", commandIncludes: "test.txt" },
    },
  ],
  explanation: {
    why: "この依頼は4つの目的が組み合わさっています。①mkdir/touchでディレクトリとファイルを用意する ②chmodで「誰にも書き換えられない」状態（読み取り専用）にする ③crontabに登録して定期実行させる、という一連の流れは、監視スクリプトやバッチ処理を安全に自動実行させたいときの典型的なパターンです。読み取り専用にしておくことで、実行中にうっかり内容が書き換えられてしまう事故を防げます。",
    alternatives: "権限は chmod 444（誰も書けない・全員読める）でも chmod 400（自分だけ読める）でも「誰にも書き換えられない」という目的は満たせます。crontabの編集は crontab -e のほかに、(crontab -l; echo \"0 8 * * * ...\") | crontab - のようにパイプで既存のジョブに追記する方法もよく使われます。",
    lpic: "LPIC Level1では crontab の書式（分 時 日 月 曜日 の5フィールド、各フィールドの意味と * の扱い）や、crontab -l / -e / -r の違いが頻出です。また、パーミッションとcronを組み合わせて「安全に自動実行する」という考え方は、実務でもよく問われる総合的なテーマです。",
  },
};
