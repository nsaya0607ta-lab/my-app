export default {
  id: "s056",
  title: "ドライバーを読み込もう",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "ハードウェア・メモリ・カーネルモジュール管理",
  requester: { name: "先輩", role: "インフラチーム", avatar: "🧑‍💻" },
  request: [
    "原因が分かった！",
    "Wi-Fiドライバー（iwlwifi というモジュール）が読み込まれていないみたい。",
    "必要なモジュールを読み込んでみよう。",
  ],
  steps: [
    {
      id: "modprobe-load",
      label: "modprobe で iwlwifi モジュールを読み込む",
      hint: [
        "『足りないモジュールを読み込む』ためのコマンドを使います。",
        "modprobe コマンドを使います。",
        "modprobe iwlwifi と入力します。",
      ],
      goal: { type: "moduleLoaded", name: "iwlwifi" },
    },
  ],
  clearComment: "お、Wi-Fiに繋がった！さすが、ナイス対応！",
  explanation: {
    why: "modprobe は、指定したカーネルモジュールをカーネルへ読み込む（＝ドライバを有効化する）コマンドです。似たコマンドに insmod がありますが、insmod は指定したモジュール単体しか読み込めないのに対し、modprobe はそのモジュールが依存している他のモジュール（今回でいう cfg80211 など）も自動的に一緒に解決して読み込んでくれる点が実務でよく使われる理由です。すでに読み込み済みのモジュールに対して実行しても二重に読み込まれることはなく、安全に再実行できます。",
    alternatives: "読み込んだモジュールを取り外したいときは modprobe -r iwlwifi（またはrmmod iwlwifi）を使います。読み込み時に詳しい経過を見たい場合は modprobe -v iwlwifi のように -v（verbose）オプションを付けることもできます。",
    lpic: "LPIC Level1では、insmod／modprobe／rmmodの違い（依存関係を自動解決するかどうか）と、-r オプションでモジュールを取り外せることが頻出です。『まずlsmodで状態を確認し、足りなければmodprobeで読み込む』という一連の流れそのものが実務でもそのまま使える手順です。",
  },
};
