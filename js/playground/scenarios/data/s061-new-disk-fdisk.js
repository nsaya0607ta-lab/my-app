export default {
  id: "s061",
  title: "新しいディスクを使えるようにしよう",
  difficulty: "Linux Level1",
  difficultyLevel: 2,
  category: "ディスク・パーティション管理",
  requester: { name: "先輩", role: "インフラチーム", avatar: "👨‍💻" },
  request: [
    "新しい500GBのディスクをサーバーへ追加したよ。",
    "でも、このままではまだ使えない。",
    "パーティションを作って、ファイルシステムを作成し、マウントまでお願い！",
  ],
  steps: [
    {
      id: "check-disk",
      label: "新しいディスク（/dev/sdb）を確認する",
      hint: [
        "新しいディスクは追加しただけでは使えません。まず現在のディスク構成を確認しましょう。",
        "ブロックデバイス（ディスク）を一覧表示するコマンドを使います。lsblk コマンド、または fdisk -l を使います。",
        "lsblk と入力して、/dev/sda に加えて /dev/sdb（500GB・パーティションなし）が増えていることを確認しましょう。",
      ],
      goal: {
        type: "custom",
        fn: (vfs, shell, ctx) => {
          const hist = (ctx && ctx.history) || [];
          return hist.some(raw => {
            const parts = raw.trim().split(/\s+/).filter(Boolean);
            if(!parts.length) return false;
            if(parts[0] === "lsblk") return true;
            return parts[0] === "fdisk" && parts.includes("-l");
          });
        },
      },
    },
    {
      id: "fdisk-create-partition",
      label: "fdisk で /dev/sdb にパーティションを作成する",
      hint: [
        "一般ユーザーのままではパーティションの作成はできません。まず管理者（root）に切り替えましょう。",
        "su コマンドで root に切り替えてから（パスワードは root です）、fdisk コマンドで /dev/sdb を指定して開きます。",
        "su → パスワード root → fdisk /dev/sdb と入力します。fdiskの中では n（新規パーティション）→ p（基本パーティション）→ 1（パーティション番号）→ Enter（開始セクタは既定値）→ Enter（終了セクタも既定値＝ディスク全体）→ w（書き込んで終了）の順に入力します。",
      ],
      goal: { type: "partitionCreated", diskName: "sdb" },
    },
    {
      id: "mkfs-ext4",
      label: "作成したパーティションに ext4 ファイルシステムを作成する",
      hint: [
        "パーティションを作成しただけでは使えません。ファイルシステムを作成する必要があります。",
        "ext4形式でファイルシステムを作成するコマンドを使います。mkfs.ext4 コマンドです。",
        "mkfs.ext4 /dev/sdb1 と入力します（fdiskで作成したパーティション番号に合わせてください）。",
      ],
      goal: { type: "filesystemCreated", diskName: "sdb", fsType: "ext4" },
    },
    {
      id: "mkdir-mountpoint",
      label: "マウント先ディレクトリ /mnt/data を作成する",
      hint: [
        "マウントする前に、マウント先となる空のディレクトリを用意しておく必要があります。",
        "mkdir コマンドでディレクトリを作成します。/mnt 以下は root専用のディレクトリなので、root のまま（または再度 su してから）実行してください。",
        "mkdir /mnt/data と入力します。",
      ],
      goal: { type: "dirExists", path: "/mnt/data" },
    },
    {
      id: "mount-disk",
      label: "/dev/sdb1 を /mnt/data にマウントする",
      hint: [
        "最後はマウントしないと、せっかく作ったファイルシステムも利用できません。",
        "mount コマンドで、デバイス名とマウント先ディレクトリを指定します。",
        "mount /dev/sdb1 /mnt/data と入力します。",
      ],
      goal: { type: "mounted", mountpoint: "/mnt/data", diskName: "sdb" },
    },
    {
      id: "verify-mount",
      label: "df -h または lsblk で正常にマウントされたことを確認する",
      hint: [
        "本当にマウントできているか、最後に確認しておきましょう。",
        "ディスクの使用状況・マウント状況を確認するコマンドを使います。df -h または lsblk です。",
        "df -h と入力し、/mnt/data の行に /dev/sdb1 が表示されていればOKです（lsblk でも確認できます）。",
      ],
      goal: {
        type: "custom",
        fn: (vfs, shell, ctx) => {
          const mountedOk = shell.mounts.some(m => m.mountpoint === "/mnt/data" && /^\/dev\/sdb\d+$/.test(m.device));
          if(!mountedOk) return false;
          const hist = (ctx && ctx.history) || [];
          return hist.some(raw => {
            const parts = raw.trim().split(/\s+/).filter(Boolean);
            return parts[0] === "df" || parts[0] === "lsblk";
          });
        },
      },
    },
  ],
  clearComment: "お疲れさまでした！新しいディスクが利用できるようになりました！",
  explanation: {
    why: "①lsblk：現在サーバーに接続されているブロックデバイス（ディスク）とパーティション、マウント先を一覧表示します。新しいディスクを使い始めるときは、まずこれでディスクが認識されているかを確認するのが基本です。②fdisk：ディスクのパーティションテーブルを対話的に編集するコマンドです。今回使った n・p・1・w にはそれぞれ意味があります。「n」は新しいパーティションを作成する操作、「p」はそのパーティションの種類を『基本パーティション（primary）』にする指定（1台のディスクには基本パーティションを最大4つまでしか作れないため、拡張パーティション「e」と区別します）、「1」はパーティション番号（1番目のパーティションであることを示す）、そして「w」は編集内容をディスクへ書き込んで確定する操作です。fdiskは「w」を入力するまでは一切ディスクへ書き込まず、メモリ上で編集するだけなので、途中で「q」と入力すればいつでも変更なしで終了でき、安全に操作を試せます。③mkfs.ext4：パーティションを作っただけではまだ『空の領域』にすぎず、OSがファイルを読み書きするための仕組み（ファイルシステム）が存在しません。mkfs.ext4はそのパーティションにext4形式のファイルシステムを新規作成するコマンドです。④mkdir：マウント（後述）の受け皿となる空のディレクトリを作成します。今回は /mnt/data を作成しました。⑤mount：ファイルシステムを作成したパーティションを、指定したディレクトリ（マウントポイント）に接続し、そのディレクトリ配下でディスクの中身を読み書きできるようにします。⑥df -h：マウントされているファイルシステムの一覧と使用量を人間が読みやすい単位で表示し、/mnt/data に /dev/sdb1 がきちんとマウントされていることを最終確認します。",
    alternatives: "パーティション操作にはfdiskのほかにparted（GPTディスクをより柔軟に扱える対話式コマンド）やgdisk（GPT専用）もよく使われます。ファイルシステム作成はmkfs.ext4のかわりに mkfs -t ext4 /dev/sdb1 のように書くこともできます（結果は同じです）。今回作成したマウントはサーバーを再起動すると消えてしまうため、実務では /etc/fstab にデバイス・マウントポイント・ファイルシステムの種類を1行追記し、再起動後も自動でマウントされるようにするのが定石です。マウントを解除したいときは umount /mnt/data（または umount /dev/sdb1）を使います。なお、実際の現場ではroot権限が必要な操作に sudo fdisk /dev/sdb のように『そのコマンド1回だけ』管理者権限を借りる方法もよく使われますが、この学習環境ではsuでroot に切り替えてから実行する方法のみに対応しています。",
    lpic: "LPIC Level1では、ディスクの利用開始までの一連の流れ（① ディスク確認 → ② パーティション作成 → ③ ファイルシステム作成 → ④ マウントポイント作成 → ⑤ マウント → ⑥ 利用開始）が頻出のテーマです。特に「パーティションを作成しただけでは使えない（フォーマットが必要）」「フォーマットしただけでは使えない（マウントが必要）」という段階を踏む点、fdiskの n/p/w のような基本操作、mountとdfの組み合わせでマウント結果を確認する手順は、実技・知識どちらの面でもよく問われます。",
  },
};
