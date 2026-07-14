export default {
  id: "s068",
  title: "Linuxが起動しない原因を調べろ",
  difficulty: "LPIC Level1",
  difficultyLevel: 3,
  category: "FHS・ディレクトリ構成",
  pack: "fhs-operations",
  requester: { name: "田中課長", role: "インフラ基盤", avatar: "⚠️" },
  request: [
    "【現場からの依頼】カーネル更新後、サーバーが起動途中で止まる。起動関連ファイルを確認して。",
    "【状況】GRUB設定が存在しないカーネル名を参照している可能性があります。",
    "【問題】Linuxの起動に必要なカーネルやブートローダー設定は、どのディレクトリを確認するべきでしょうか。",
  ],
  initialEnv: {
    dirs: ["/boot/grub"],
    files: [
      { path: "/boot/vmlinuz-6.8.0", content: "kernel image placeholder\n", owner: "root", group: "root" },
      { path: "/boot/initramfs-6.8.0.img", content: "initramfs image placeholder\n", owner: "root", group: "root" },
      { path: "/boot/grub/grub.cfg", content: "menuentry 'Linux' {\n  linux /vmlinuz-6.9.0 root=/dev/sda1 ro\n  initrd /initramfs-6.9.0.img\n}\n", owner: "root", group: "root" },
    ],
  },
  steps: [
    {
      id: "list-boot-files",
      label: "/boot に存在する起動ファイルを確認する",
      hint: [
        "カーネルイメージやinitramfsは /boot に置かれます。",
        "ls -l /boot を実行します。",
      ],
      goal: { type: "commandRan", cmd: "ls", pattern: "/boot" },
    },
    {
      id: "read-grub-config",
      label: "GRUB設定が参照しているカーネル名を確認する",
      hint: [
        "GRUBの設定は /boot/grub 配下を確認します。",
        "cat /boot/grub/grub.cfg を実行し、実在するファイル名と比べます。",
      ],
      goal: { type: "commandRan", cmd: "cat", pattern: "/boot/grub/grub\\.cfg" },
    },
  ],
  clearComment: "実在するのは6.8.0なのに、GRUBは6.9.0を参照しているね。原因の切り分けができたよ。",
  explanation: {
    why: "【正解】/boot です。/boot にはLinuxカーネルのイメージ、initramfs、GRUBなどブートローダーの設定が置かれます。起動障害では、設定が参照しているカーネルやinitramfsが実際に存在するか確認します。",
    alternatives: "【確認コマンド】ls -l /boot、ls -l /boot/grub、cat /boot/grub/grub.cfg。実機ではgrub設定の再生成やレスキューモードでの調査が必要になる場合があります。",
    lpic: "LPIC Level1では、/boot の役割、ブートローダー、カーネル、initramfsの関係が出題されます。/bootを通常の設定ファイル置き場である /etc と混同しないことが大切です。",
  },
};