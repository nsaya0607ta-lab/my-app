export default {
  id: "s069",
  title: "追加ディスクとUSB機器を確認せよ",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "FHS・ディレクトリ構成",
  pack: "fhs-operations",
  requester: { name: "森先輩", role: "ハードウェア担当", avatar: "💾" },
  request: [
    "【現場からの依頼】新しいディスクとUSBシリアル機器を接続した。OS上に対応するファイルがあるか確認して。",
    "【状況】追加ディスクはsdb、USBシリアル機器はttyUSB0として認識される想定です。",
    "【問題】Linuxが機器をファイルとして扱うためのデバイスファイルは、どのディレクトリにありますか。",
  ],
  initialEnv: {
    dirs: ["/dev"],
    files: [
      { path: "/dev/sda", content: "", owner: "root", group: "disk" },
      { path: "/dev/sda1", content: "", owner: "root", group: "disk" },
      { path: "/dev/sdb", content: "", owner: "root", group: "disk" },
      { path: "/dev/sdb1", content: "", owner: "root", group: "disk" },
      { path: "/dev/ttyUSB0", content: "", owner: "root", group: "dialout" },
    ],
  },
  steps: [
    {
      id: "list-dev",
      label: "/dev 内のデバイスファイルを確認する",
      hint: [
        "Linuxではディスクや端末などの機器を特殊なファイルとして表現します。",
        "その代表的な保存先は /dev です。",
        "ls -l /dev を実行し、sdbやttyUSB0を探します。",
      ],
      goal: { type: "commandRan", cmd: "ls", pattern: "/dev" },
    },
  ],
  clearComment: "sdbとttyUSB0が見つかったね。OSが作成したデバイスファイルを確認できたよ。",
  explanation: {
    why: "【正解】/dev です。/dev にはディスク、パーティション、端末、USBシリアル機器などに対応するデバイスファイルがあります。例として /dev/sda、/dev/sdb1、/dev/tty、/dev/null などがあります。通常の文書ファイルではなく、カーネルを通して機器へアクセスする入口です。",
    alternatives: "【確認コマンド】ls -l /dev、ls -l /dev/sdb、ls -l /dev/ttyUSB0。機器一覧の確認には lsblk、lsusb、lspci も使われますが、機器へアクセスするファイル自体は /dev にあります。",
    lpic: "LPIC Level1では、/dev がデバイスファイルの保存先であること、ディスク名やパーティション名の表し方が問われます。/sysは機器情報、/devは機器へのアクセス口という違いを意識しましょう。",
  },
};