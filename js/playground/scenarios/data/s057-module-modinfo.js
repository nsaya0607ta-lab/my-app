export default {
  id: "s057",
  title: "このモジュールって何？",
  difficulty: "中級",
  difficultyLevel: 3,
  category: "ハードウェア・メモリ・カーネルモジュール管理",
  requester: { name: "先輩", role: "インフラチーム", avatar: "🧑‍💻" },
  request: [
    "さっき読み込んだ iwlwifi ってモジュール、結局何のためにあるんだろう？",
    "詳しい情報を調べてみよう。",
  ],
  steps: [
    {
      id: "modinfo-check",
      label: "modinfo で iwlwifi の詳細情報を確認する",
      hint: [
        "モジュールの詳しい情報（説明・作者・ライセンス・依存モジュールなど）を確認します。",
        "modinfo コマンドを使います。",
        "modinfo iwlwifi と入力します。",
      ],
      goal: { type: "commandRan", cmd: "modinfo", pattern: "^modinfo\\s+iwlwifi" },
    },
  ],
  clearComment: "なるほど、Intel製のWi-Fiドライバだったんだね。descriptionを見ればひと目で分かるね。",
  explanation: {
    why: "modinfo は、指定したカーネルモジュールの詳細情報（filename＝モジュールファイルの場所、description＝何をするモジュールか、author＝作者、license＝ライセンス、depends＝依存する他のモジュール、vermagic＝対応するカーネルバージョンなど）を表示するコマンドです。lsmodが『今読み込まれているか』という“状態”を見るのに対し、modinfoは読み込み済みかどうかに関わらず『そのモジュールがそもそも何なのか』という“定義情報”を見るためのコマンドで、この違いがポイントです。",
    alternatives: "特定の項目だけを見たい場合は modinfo -d iwlwifi（description のみ）や modinfo -F license iwlwifi のように -F フィールド名 で絞り込むこともできます。",
    lpic: "LPIC Level1では、modinfoで確認できる各フィールド（description・license・depends など）の意味と、lsmod（状態確認）・modprobe（操作）・modinfo（情報確認）という3コマンドの役割の違いが問われます。『困ったら、まずmodinfoで正体を調べる』という発想は実務調査の基本です。",
  },
};
