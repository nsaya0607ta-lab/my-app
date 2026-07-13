export default {
  id: "s058",
  title: "メモリ不足？",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ハードウェア・メモリ・カーネルモジュール管理",
  requester: { name: "部長", role: "システム部", avatar: "👨‍💼" },
  request: [
    "最近サーバーが重いって問い合わせが増えてる。",
    "まずはメモリ使用量を確認してみよう。",
  ],
  steps: [
    {
      id: "free-check",
      label: "free でメモリ使用量を確認する",
      hint: [
        "物理メモリとスワップの使用状況を確認します。",
        "free コマンドを使います。",
        "そのまま free と入力するだけでOKです。",
      ],
      goal: { type: "commandRan", cmd: "free" },
    },
  ],
  clearComment: "ふむ、数字は見れたね。ただKB単位だとちょっとパッと見で分かりづらいな…。",
  explanation: {
    why: "free は、物理メモリ（Mem）とスワップ（Swap）の使用状況を表示するコマンドです。total（総容量）・used（使用中）・free（未使用）・shared（共有メモリ）・buff/cache（バッファ・キャッシュ）・available（実質的に空きとして使える量）という列があり、特にbuff/cacheはOSがディスクアクセスを高速化するために一時的に使っているだけで、必要になればすぐ解放できる領域なので、『used が多い＝メモリ不足』と早合点せず、availableの値で実際の余裕を判断するのがポイントです。",
    alternatives: "リアルタイムに変化を追いたい場合は free -s 5（5秒ごとに再表示）、プロセスごとのメモリ使用量まで見たい場合は top や ps aux と組み合わせて確認します。",
    lpic: "LPIC Level1では、free コマンドが表示する各列の意味（特にbuff/cacheが『空き扱いにできるキャッシュ』であること）と、topやvmstatなど他のメモリ監視コマンドとの使い分けが問われます。",
  },
};
