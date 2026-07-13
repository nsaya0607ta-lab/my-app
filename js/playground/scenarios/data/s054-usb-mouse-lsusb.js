export default {
  id: "s054",
  title: "USBマウスが動かない",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ハードウェア・メモリ・カーネルモジュール管理",
  requester: { name: "先輩", role: "インフラチーム", avatar: "🧑‍💻" },
  request: [
    "USBマウスを挿したのに動かない…。",
    "まずはLinuxが認識しているか確認しよう。",
  ],
  steps: [
    {
      id: "lsusb-check",
      label: "lsusb でUSBデバイス一覧を確認する",
      hint: [
        "USBポートに接続されている機器の一覧を確認します。",
        "lsusb コマンドを使います。",
        "そのまま lsusb と入力するだけでOKです。",
      ],
      goal: { type: "commandRan", cmd: "lsusb" },
    },
  ],
  clearComment: "『Logitech, Inc. M105 Corded Mouse』の行がある、ちゃんと認識はされてるね。じゃあ次はドライバ側を疑ってみよう。",
  explanation: {
    why: "lsusb は、USBバスに接続されているデバイス（マウス、キーボード、USBメモリなど）の一覧を表示するコマンドです。『マウスが動かない』というトラブルでは、まず lsusb でハードウェアとしてLinuxに認識されているかどうかを確認するのが最初の一歩になります。ここで表示されなければUSBポートやケーブルなど物理的な問題を疑い、表示されていればマウスを動かすためのドライバ（カーネルモジュール）や設定の問題だと切り分けられます。",
    alternatives: "各デバイスの詳細（ベンダーID・プロダクトIDごとの情報）まで見たい場合は lsusb -v、特定の機器だけに絞りたい場合は lsusb | grep -i mouse のように grep と組み合わせる方法もあります。",
    lpic: "LPIC Level1では、lspciとlsusbの違い（PCIバスかUSBバスか）に加えて、出力に含まれる『ID ベンダーID:プロダクトID』の形式や、これらのコマンドが『ハードウェアの存在確認』であって『ドライバの動作確認』ではない、という位置づけを理解しておくことが重要です。",
  },
};
