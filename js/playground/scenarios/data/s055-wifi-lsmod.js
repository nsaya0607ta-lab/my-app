export default {
  id: "s055",
  title: "Wi-Fiが使えない",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "ハードウェア・メモリ・カーネルモジュール管理",
  requester: { name: "先輩", role: "インフラチーム", avatar: "🧑‍💻" },
  request: [
    "Wi-Fiが繋がらない…。",
    "必要なカーネルモジュールが読み込まれているか確認してみよう。",
  ],
  steps: [
    {
      id: "lsmod-check",
      label: "lsmod で読み込み済みのカーネルモジュールを確認する",
      hint: [
        "現在カーネルに読み込まれているモジュール（ドライバ）の一覧を確認します。",
        "lsmod コマンドを使います。",
        "そのまま lsmod と入力するだけでOKです。一覧に iwlwifi が無いことに気づけましたか？",
      ],
      goal: { type: "commandRan", cmd: "lsmod" },
    },
  ],
  clearComment: "見た？一覧に iwlwifi が無いね。これがWi-Fiの無線LANドライバなんだ。",
  explanation: {
    why: "lsmod は、現在カーネルに読み込まれている（動作中の）モジュールの一覧を、Module（モジュール名）・Size（サイズ）・Used by（利用している他モジュールの数）の3列で表示するコマンドです。lspciがハードウェアの存在確認だったのに対し、lsmodは『そのハードウェアを動かすためのドライバ（ソフトウェア側）が実際に読み込まれているか』を確認するためのコマンドで、ここが両者の役割の違いです。Wi-Fiが使えないときは、ハードウェア（lspci）は認識されていてもドライバ（lsmod）が読み込まれていない、というケースが典型的な原因の一つです。",
    alternatives: "特定のモジュールだけを探したい場合は lsmod | grep iwlwifi のように grep と組み合わせます。似たコマンドに /proc/modules を直接見る方法もありますが、lsmodはこれを人間が読みやすい形式に整形して表示しているものです。",
    lpic: "LPIC Level1では、lsmod（現在読み込まれているモジュールの一覧）、modprobe（モジュールを読み込む・取り外す）、modinfo（モジュールの詳細情報を見る）という3つのコマンドの役割分担を正確に区別できることが求められます。『調べる（lsmod/modinfo）』と『操作する（modprobe）』の違いを意識しておきましょう。",
  },
};
