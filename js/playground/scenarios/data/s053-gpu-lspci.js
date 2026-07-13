export default {
  id: "s053",
  title: "グラフィックボードは認識されてる？",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ハードウェア・メモリ・カーネルモジュール管理",
  requester: { name: "先輩", role: "インフラチーム", avatar: "🧑‍💻" },
  request: [
    "新しいグラフィックボードを取り付けたんだけど、本当にLinuxが認識しているか確認してくれる？",
  ],
  steps: [
    {
      id: "lspci-check",
      label: "lspci でPCIデバイス一覧を確認する",
      hint: [
        "マザーボードのPCI/PCIeバスに接続されている機器（グラフィックボードなど）の一覧を確認します。",
        "lspci コマンドを使います。",
        "そのまま lspci と入力するだけでOKです。",
      ],
      goal: { type: "commandRan", cmd: "lspci" },
    },
  ],
  clearComment: "お、ちゃんと『NVIDIA Corporation』の行があるね！認識されてる、ありがとう！",
  explanation: {
    why: "lspci は、マザーボードのPCI/PCIeバスに接続されているすべてのデバイス（グラフィックボード、ネットワークカード、USBコントローラ、オーディオデバイスなど）を、カーネルが認識している情報から一覧表示するコマンドです。新しいハードウェアを取り付けた直後にまず lspci を実行するのは、『OSがハードウェアの存在そのものを認識できているか』を切り分けるための基本動作です。ここで表示されなければ物理的な接続不良やスロットの相性を疑い、表示されていればここから先はドライバ（カーネルモジュール）側の問題だと判断できます。",
    alternatives: "より詳しく調べたいときは lspci -v（詳細表示）、lspci -k（使用中のカーネルドライバも表示）、特定の種類だけ見たいときは lspci | grep VGA のように grep と組み合わせる方法もよく使われます。",
    lpic: "LPIC Level1（101試験）の『ハードウェア設定』領域では、lspci・lsusb・lsmod・modprobe・modinfoといったハードウェア確認系コマンドの役割の違いが問われます。lspciは『PCIバス上のデバイスの一覧』、lsusbは『USBバス上のデバイスの一覧』というように、対象となるバスの違いをまず区別できるようにしておきましょう。",
  },
};
