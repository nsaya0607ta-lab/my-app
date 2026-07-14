export default {
  id: "s071",
  title: "OSが認識したデバイス状態を調べろ",
  difficulty: "LPIC Level1",
  difficultyLevel: 3,
  category: "FHS・ディレクトリ構成",
  pack: "fhs-operations",
  requester: { name: "加藤先輩", role: "ネットワーク・基盤", avatar: "🔌" },
  request: [
    "【現場からの依頼】追加したディスクとネットワークインターフェースを、カーネルがどう認識しているか確認して。",
    "【状況】eth0の稼働状態と、ブロックデバイスsdbの情報をファイル形式で確認します。",
    "【問題】デバイスやドライバ、カーネル内部の構造化された情報は、どの仮想ファイルシステムで確認できますか。",
  ],
  initialEnv: {
    dirs: ["/sys/class/net/eth0", "/sys/block/sdb"],
    files: [
      { path: "/sys/class/net/eth0/operstate", content: "up\n", owner: "root", group: "root" },
      { path: "/sys/class/net/eth0/address", content: "02:42:ac:11:00:02\n", owner: "root", group: "root" },
      { path: "/sys/block/sdb/size", content: "976773168\n", owner: "root", group: "root" },
      { path: "/sys/block/sdb/removable", content: "0\n", owner: "root", group: "root" },
    ],
  },
  steps: [
    {
      id: "list-sys-net",
      label: "/sys/class/net 配下のネットワークデバイスを確認する",
      hint: [
        "機器を種類別に整理した情報は /sys/class 配下にあります。",
        "ls -l /sys/class/net を実行します。",
      ],
      goal: { type: "commandRan", cmd: "ls", pattern: "/sys/class/net" },
    },
    {
      id: "read-eth0-state",
      label: "eth0の稼働状態を確認する",
      hint: "cat /sys/class/net/eth0/operstate を実行します。",
      goal: { type: "commandRan", cmd: "cat", pattern: "/sys/class/net/eth0/operstate" },
    },
    {
      id: "read-sdb-size",
      label: "sdbのデバイス情報を確認する",
      hint: [
        "ブロックデバイスの情報は /sys/block 配下にあります。",
        "cat /sys/block/sdb/size を実行します。",
      ],
      goal: { type: "commandRan", cmd: "cat", pattern: "/sys/block/sdb/size" },
    },
  ],
  clearComment: "eth0はupで、sdbもカーネルに認識されているね。/sysの役割を正しく判断できたよ。",
  explanation: {
    why: "【正解】/sys です。/sys はsysfsと呼ばれる仮想ファイルシステムで、カーネルが認識しているデバイス、ドライバ、バス、クラスなどの情報を階層構造で公開します。/sys/class/net や /sys/block などが代表例です。",
    alternatives: "【確認コマンド】ls -l /sys/class/net、cat /sys/class/net/eth0/operstate、cat /sys/block/sdb/size。実務では ip link、lsblk、udevadm などを併用します。",
    lpic: "LPIC Level1では /sys と /proc の違いが問われます。/procは主にプロセスやカーネル状態、/sysは主にデバイスやドライバを体系的に表す仮想ファイルシステムです。",
  },
};