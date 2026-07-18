/* =========================================================================
   Linux ディレクトリ探検（学習用サンドボックス）データ
   実際のOSのファイルシステムには一切アクセスしない、アプリ内だけで完結する
   「疑似Linuxファイルシステム」。LPIC-1のFHS（ファイルシステム階層標準）
   範囲を、実際にクリックして開きながら学べるようにするためのツリーデータ。

   各ノードの形（ディレクトリ／ファイル共通）：
     {
       type: "dir" | "file",
       kind: string,          // 中央一覧の「種類」に出す短いラベル
       desc: string,          // 中央一覧の「説明」に出す一言
       lpicImportant: bool,   // trueならLPIC-1で重要（青バッジ）
       examHot: bool,         // trueなら特に試験頻出（金バッジ）。lpicImportantとは独立
       isVirtual: bool,       // /proc, /sys など「実体を持たない仮想FS」の目印
       detail: {
         role: string,          // 役割
         stores: string,        // 何を保存する場所か
         examples: string[],    // 代表例
         commands: string[],    // 関連コマンド
         examPoint: string,     // 試験でのポイント
         beginnerNote: string,  // 初学者向け一言メモ
       },
       children?: { [name]: Node }  // dirのみ
     }
   ========================================================================= */

function dir(opts, children){
  return { type:"dir", children: children || {}, ...opts };
}
function file(opts){
  return { type:"file", ...opts };
}

export const LPIC1_DIR_FS = dir({
  kind: "ルートディレクトリ",
  desc: "Linuxのファイルシステム階層の最上位。すべてのディレクトリはここから枝分かれする。",
  lpicImportant: true,
  examHot: false,
  detail: {
    role: "Linuxのファイルシステム全体の出発点となる、ただ一つの頂点ディレクトリです。",
    stores: "Windowsのように「C:」「D:」というドライブ文字は存在せず、ディスクやUSBメモリなどもすべて / 以下のどこかに接続（マウント）されて一つの木構造として扱われます。",
    examples: ["/bin", "/etc", "/home", "/var", "/usr"],
    commands: ["ls /", "cd /", "pwd"],
    examPoint: "FHS（Filesystem Hierarchy Standard）は、この / 以下のディレクトリ構成を定めた標準規格。LPIC-1の頻出テーマ。",
    beginnerNote: "/ = 家で言う「玄関」。ここからすべての部屋（ディレクトリ）につながっている。",
  },
}, {

  bin: dir({
    kind: "コマンド格納ディレクトリ",
    desc: "ls・cp・cat など、基本的なコマンドの実行ファイルを格納する。",
    lpicImportant: true,
    detail: {
      role: "一般ユーザーを含むすべてのユーザーが使う、基本的なコマンド（実行ファイル）を格納するディレクトリです。",
      stores: "ls, cp, mv, cat, bash などの基本コマンド本体（バイナリファイル）。",
      examples: ["/bin/ls", "/bin/cat", "/bin/bash"],
      commands: ["ls /bin", "which ls", "file /bin/ls"],
      examPoint: "最近の主要ディストリビューションでは /bin は /usr/bin へのシンボリックリンクになっていることが多い（UsrMerge）。ls -l / で確認できる。",
      beginnerNote: "/bin = よく使う基本コマンドの置き場、とまず覚えよう。",
    },
  }),

  boot: dir({
    kind: "起動用ディレクトリ",
    desc: "Linux起動に必要なカーネルやブートローダーの設定を格納する。",
    lpicImportant: true,
    examHot: true,
    detail: {
      role: "Linux起動時に必要なカーネル本体やブートローダー関連ファイルを格納します。",
      stores: "カーネルイメージ、initramfs（初期RAMディスク）、GRUBの設定ファイルなど、起動に不可欠なファイル一式。",
      examples: ["vmlinuz-6.1.0", "initramfs-6.1.0.img", "grub/grub.cfg"],
      commands: ["ls /boot", "grub-mkconfig -o /boot/grub/grub.cfg"],
      examPoint: "grub-mkconfig の出力先は /boot/grub/grub.cfg。/boot だけを別パーティションとして切り出す運用も頻出。",
      beginnerNote: "/boot = 起動に絶対必要なファイルの部屋。うっかり消すと起動できなくなるので要注意。",
    },
  }, {
    "vmlinuz": file({
      kind: "カーネルイメージ",
      desc: "Linuxカーネル本体の圧縮イメージファイル。",
      lpicImportant: true,
      detail: {
        role: "起動時にブートローダーが読み込む、Linuxカーネル本体の実体です。",
        stores: "圧縮されたカーネルの実行イメージ。",
        examples: ["vmlinuz-6.1.0-generic"],
        commands: ["uname -r", "ls -l /boot/vmlinuz*"],
        examPoint: "ファイル名にカーネルバージョンが含まれることが多く、uname -r の結果と対応する。",
        beginnerNote: "vmlinuz = Linuxの心臓部（カーネル）そのもの。",
      },
    }),
    "initramfs": file({
      kind: "初期RAMディスク",
      desc: "起動途中で一時的に使う最小限のファイルシステムイメージ。",
      lpicImportant: true,
      detail: {
        role: "本来のルートファイルシステムをマウントする前に、起動処理に必要な最小限のドライバ等を一時的に読み込むためのイメージです。",
        stores: "起動初期に必要なカーネルモジュールや小さなプログラム群。",
        examples: ["initramfs-6.1.0.img"],
        commands: ["lsinitramfs", "update-initramfs -u"],
        examPoint: "ディスクドライバの読み込みなど、本体起動前の下準備を担う点が試験で問われやすい。",
        beginnerNote: "initramfs = 本番の部屋（/）に入る前に使う、仮の控室のようなもの。",
      },
    }),
    "grub": dir({
      kind: "ブートローダー設定",
      desc: "GRUBブートローダーの設定ファイルを格納する。",
      lpicImportant: true,
      detail: {
        role: "ブートローダーGRUBの設定ファイル一式を格納するディレクトリです。",
        stores: "起動メニューの内容や、どのカーネルを起動するかといった設定。",
        examples: ["grub.cfg"],
        commands: ["cat /boot/grub/grub.cfg", "update-grub"],
        examPoint: "grub.cfgは直接編集せず、/etc/default/grub等を編集してgrub-mkconfigで再生成するのが基本。",
        beginnerNote: "/boot/grub = 起動メニューの設計図が入っている場所。",
      },
    }, {
      "grub.cfg": file({
        kind: "設定ファイル",
        desc: "GRUBの起動メニュー定義ファイル（自動生成される）。",
        lpicImportant: true,
        detail: {
          role: "実際に画面に表示される起動メニューの内容を定義する設定ファイルです。",
          stores: "起動可能なカーネル一覧、デフォルトの起動エントリ、タイムアウト秒数など。",
          examples: ["set default=0", "set timeout=5"],
          commands: ["grub-mkconfig -o /boot/grub/grub.cfg"],
          examPoint: "手作業で直接編集するファイルではなく、grub-mkconfigコマンドが自動生成するファイルという点が頻出。",
          beginnerNote: "grub.cfg = 起動画面に出てくるメニューの中身。",
        },
      }),
    }),
  }),

  dev: dir({
    kind: "デバイスファイル置き場",
    desc: "ディスクや端末などのハードウェアをファイルとして扱う特殊ファイル。",
    lpicImportant: true,
    examHot: true,
    detail: {
      role: "ハードウェアデバイスを「ファイル」として扱うための特殊ファイル（デバイスファイル）を格納します。",
      stores: "ディスク、端末（tty）、nullデバイスなど、実際のハードウェアや仮想デバイスに対応するファイル。",
      examples: ["/dev/sda", "/dev/null", "/dev/tty"],
      commands: ["ls /dev", "lsblk", "mknod"],
      examPoint: "/dev は udev により起動時・接続時に動的に生成される。/dev/null は入力を破棄するブラックホールとして頻出。",
      beginnerNote: "/dev = ハードウェアを『ファイルのふり』をして扱う場所。",
    },
  }, {
    "sda": file({
      kind: "デバイスファイル（ディスク）",
      desc: "1台目のストレージデバイス全体を表すデバイスファイル。",
      lpicImportant: true,
      detail: {
        role: "接続されている1台目のストレージデバイス（ディスク）全体を表すデバイスファイルです。",
        stores: "実データそのものではなく、ディスクへアクセスするための「窓口」。",
        examples: ["/dev/sda1（1番目のパーティション）", "/dev/sda2"],
        commands: ["lsblk", "fdisk -l /dev/sda"],
        examPoint: "sda, sdb, sdc... の順に検出されたディスクへ割り当てられる。パーティションは末尾に数字が付く（例:sda1）。",
        beginnerNote: "/dev/sda = パソコンに繋がっているディスクそのものの入り口。",
      },
    }),
    "null": file({
      kind: "デバイスファイル（null）",
      desc: "書き込んだデータをすべて破棄する特殊デバイス。",
      lpicImportant: true,
      detail: {
        role: "書き込まれたデータをすべて破棄し、読み出すと常に何も返さない特殊なデバイスファイルです。",
        stores: "何も保存しない（ブラックホールのような役割）。",
        examples: ["command > /dev/null 2>&1"],
        commands: ["echo hello > /dev/null"],
        examPoint: "不要な標準出力・標準エラー出力を捨てたいときのリダイレクト先として頻出。",
        beginnerNote: "/dev/null = 何を入れても消えてなくなる、魔法のゴミ箱。",
      },
    }),
    "tty": file({
      kind: "デバイスファイル（端末）",
      desc: "現在の端末（ターミナル）を表すデバイスファイル。",
      lpicImportant: false,
      detail: {
        role: "現在操作している端末（ターミナル）そのものを表すデバイスファイルです。",
        stores: "端末への入出力そのもの。",
        examples: ["/dev/tty1", "/dev/pts/0"],
        commands: ["tty", "echo hi > /dev/tty"],
        examPoint: "ttyコマンドで自分が使っている端末デバイス名を確認できる。",
        beginnerNote: "/dev/tty = 今あなたが見ている画面そのものを指すファイル。",
      },
    }),
  }),

  etc: dir({
    kind: "設定ファイル置き場",
    desc: "システム全体の設定ファイルを格納する、運用上とても重要な場所。",
    lpicImportant: true,
    examHot: true,
    detail: {
      role: "システム全体の設定ファイルを格納する、Linux運用で最も重要なディレクトリの一つです。",
      stores: "サービスや各種アプリケーションの設定ファイル。基本的にテキスト形式で、直接編集して設定変更するものが多い。",
      examples: ["/etc/passwd", "/etc/fstab", "/etc/ssh/sshd_config"],
      commands: ["cat /etc/xxxx", "less /etc/xxxx"],
      examPoint: "LPIC-1では/etc配下の主要ファイル（passwd, fstab, hostsなど）の役割がそのまま出題される。",
      beginnerNote: "/etc = 設定ファイル置き場、とまず覚えよう。",
    },
  }, {
    "passwd": file({
      kind: "設定ファイル（ユーザー情報）",
      desc: "ユーザーアカウントの一覧情報（パスワードそのものは含まない）。",
      lpicImportant: true,
      detail: {
        role: "システムに登録されているユーザーアカウントの情報を保存するファイルです。",
        stores: "ユーザー名、UID、GID、コメント、ホームディレクトリ、ログインシェルなど。暗号化パスワードは含まない。",
        examples: ["root:x:0:0:root:/root:/bin/bash", "student:x:1000:1000:student:/home/student:/bin/bash"],
        commands: ["cat /etc/passwd", "getent passwd"],
        examPoint: "2番目のフィールドは常に'x'（実体は/etc/shadowにある）。フィールドの並び順を問う問題が頻出。",
        beginnerNote: "/etc/passwd = ユーザー名簿。パスワードそのものは入っていない。",
      },
    }),
    "shadow": file({
      kind: "設定ファイル（パスワード情報）",
      desc: "暗号化されたパスワードや有効期限を保存する、root専用ファイル。",
      lpicImportant: true,
      detail: {
        role: "ユーザーの暗号化パスワードやパスワードの有効期限などを保存するファイルです。",
        stores: "ハッシュ化されたパスワード、最終変更日、有効期限などのアカウントセキュリティ情報。",
        examples: ["root:$6$...:19700:0:99999:7:::"],
        commands: ["chage -l student", "cat /etc/shadow（要root）"],
        examPoint: "パーミッションが厳しく(600等)設定され、root以外は読み取れない点が重要。パスワード管理はchageコマンドとセットで出題される。",
        beginnerNote: "/etc/shadow = パスワードの本当の保管庫。rootしか見られない。",
      },
    }),
    "group": file({
      kind: "設定ファイル（グループ情報）",
      desc: "システムに登録されているグループの一覧情報。",
      lpicImportant: true,
      detail: {
        role: "システムに登録されているグループの情報を保存するファイルです。",
        stores: "グループ名、GID、そのグループに所属する追加ユーザーの一覧。",
        examples: ["sudo:x:27:student"],
        commands: ["cat /etc/group", "groups student"],
        examPoint: "1ユーザーが所属できるグループは「プライマリグループ」1つ＋「追加（セカンダリ）グループ」複数、という考え方とセットで問われる。",
        beginnerNote: "/etc/group = グループの名簿。",
      },
    }),
    "hosts": file({
      kind: "設定ファイル（名前解決）",
      desc: "ホスト名とIPアドレスの対応を手動で設定するファイル。",
      lpicImportant: true,
      detail: {
        role: "ホスト名とIPアドレスの対応関係を手動で設定するファイルです。",
        stores: "IPアドレスとホスト名（別名を含む）のペア。",
        examples: ["127.0.0.1  localhost", "192.168.1.10  fileserver"],
        commands: ["cat /etc/hosts", "ping fileserver"],
        examPoint: "DNSより先に参照されることが多く（/etc/nsswitch.confの設定次第）、名前解決トラブルの切り分けで頻出。",
        beginnerNote: "/etc/hosts = 簡易的な『名前とIPアドレスの対応表』。",
      },
    }),
    "hostname": file({
      kind: "設定ファイル（ホスト名）",
      desc: "このマシン自身のホスト名が書かれたファイル。",
      lpicImportant: false,
      detail: {
        role: "このマシン自身のホスト名を保存するファイルです。",
        stores: "1行のホスト名文字列。",
        examples: ["linux-playground"],
        commands: ["hostname", "cat /etc/hostname", "hostnamectl"],
        examPoint: "systemd環境ではhostnamectlで変更した内容もこのファイルへ反映される。",
        beginnerNote: "/etc/hostname = このパソコンの名前が書いてある場所。",
      },
    }),
    "resolv.conf": file({
      kind: "設定ファイル（DNS）",
      desc: "問い合わせ先DNSサーバーを指定するファイル。",
      lpicImportant: true,
      detail: {
        role: "名前解決の際に問い合わせるDNSサーバー（ネームサーバー）の情報を設定するファイルです。",
        stores: "nameserverの行に列挙されたDNSサーバーのIPアドレス。",
        examples: ["nameserver 8.8.8.8"],
        commands: ["cat /etc/resolv.conf"],
        examPoint: "nameserverの指定が誤っていると名前解決に失敗する。NetworkManager等により自動生成されることも多い。",
        beginnerNote: "/etc/resolv.conf = 『どこに名前を聞きに行くか』を書いた設定。",
      },
    }),
    "fstab": file({
      kind: "設定ファイル（マウント）",
      desc: "起動時に自動マウントするファイルシステムの一覧。",
      lpicImportant: true,
      detail: {
        role: "起動時に自動でマウントするファイルシステムの一覧を定義するファイルです。",
        stores: "デバイス、マウントポイント、ファイルシステム種別、マウントオプション、dumpフラグ、fsckの順序を1行ずつ列挙。",
        examples: ["/dev/sda1  /  ext4  defaults  0  1"],
        commands: ["cat /etc/fstab", "mount -a"],
        examPoint: "各フィールドの意味と並び順、mount -aによる一括マウント確認がLPIC-1で頻出。",
        beginnerNote: "/etc/fstab = 起動時に自動でマウントする設定の一覧表。",
      },
    }),
    "crontab": file({
      kind: "設定ファイル（定期実行）",
      desc: "システム全体で定期実行するジョブの定義ファイル。",
      lpicImportant: true,
      detail: {
        role: "システム全体で定期的に実行するジョブ（cronジョブ）を定義するファイルです。",
        stores: "分・時・日・月・曜日・実行ユーザー・実行コマンドの並び。",
        examples: ["0 3 * * *  root  /usr/local/bin/backup.sh"],
        commands: ["cat /etc/crontab", "crontab -l"],
        examPoint: "個人のcrontab -eで編集するファイルと違い、/etc/crontabには「実行ユーザー」欄が1つ多い点が問われやすい。",
        beginnerNote: "/etc/crontab = 決まった時間に自動実行する処理の予定表。",
      },
    }),
    "profile": file({
      kind: "設定ファイル（シェル環境）",
      desc: "全ユーザー共通のログイン時シェル環境設定。",
      lpicImportant: true,
      detail: {
        role: "全ユーザー共通の、ログイン時シェル環境設定を行うファイルです。",
        stores: "環境変数の設定やログイン時に実行したい共通処理。",
        examples: ["export PATH=$PATH:/usr/local/bin"],
        commands: ["cat /etc/profile"],
        examPoint: "ログインシェル起動時に読み込まれ、個々のユーザーの~/.bash_profileや~/.bashrcで追加・上書きできる、という優先順位が頻出。",
        beginnerNote: "/etc/profile = 全員共通のログイン時の初期設定。",
      },
    }),
    "sudoers": file({
      kind: "設定ファイル（権限）",
      desc: "sudoで誰がどのコマンドを実行できるかを定義するファイル。",
      lpicImportant: true,
      detail: {
        role: "sudoコマンドを使って、誰がどのコマンドを管理者権限で実行できるかを定義するファイルです。",
        stores: "ユーザー（またはグループ）ごとの、実行を許可するコマンドの範囲。",
        examples: ["student ALL=(ALL) ALL"],
        commands: ["visudo", "sudo -l"],
        examPoint: "直接テキストエディタで編集せず、構文チェック付きのvisudoコマンドで編集するのが鉄則、という点が頻出。",
        beginnerNote: "/etc/sudoers = 『誰が管理者権限を借りられるか』のルールブック。",
      },
    }),
    "ssh": dir({
      kind: "設定ディレクトリ（SSH）",
      desc: "SSHサーバー・クライアントの設定ファイルを格納する。",
      lpicImportant: true,
      detail: {
        role: "SSH（リモートログイン）のサーバー・クライアント設定ファイルを格納するディレクトリです。",
        stores: "サーバー側の挙動を決めるsshd_configなど。",
        examples: ["sshd_config"],
        commands: ["systemctl restart sshd"],
        examPoint: "リモート管理の基本であるSSHの設定はセキュリティ関連の出題でも頻出。",
        beginnerNote: "/etc/ssh = リモートログイン(SSH)の設定部屋。",
      },
    }, {
      "sshd_config": file({
        kind: "設定ファイル（SSHサーバー）",
        desc: "SSHサーバー(sshd)の動作を設定するファイル。",
        lpicImportant: true,
        detail: {
          role: "SSHサーバー(sshd)の動作を設定するファイルです。",
          stores: "待受ポート番号、rootログインの可否、パスワード認証の可否など。",
          examples: ["Port 22", "PermitRootLogin no"],
          commands: ["sshd -t", "systemctl reload sshd"],
          examPoint: "PermitRootLogin no にしてrootの直接SSHログインを禁止するのは、定番のセキュリティ強化設定として頻出。",
          beginnerNote: "sshd_config = SSH接続のルールを決める設定ファイル。",
        },
      }),
    }),
    "systemd": dir({
      kind: "設定ディレクトリ（systemd）",
      desc: "systemd（起動・サービス管理の仕組み）の設定を格納する。",
      lpicImportant: true,
      detail: {
        role: "初期化・サービス管理システムであるsystemdの設定ファイル群を格納するディレクトリです。",
        stores: "サービスの自動起動設定（unitファイルへのシンボリックリンク）など。",
        examples: ["system/multi-user.target.wants/"],
        commands: ["systemctl status", "systemctl enable"],
        examPoint: "systemctl enableで作られるシンボリックリンクの置き場所として出題されることがある。",
        beginnerNote: "/etc/systemd = サービスの自動起動などを管理する設定部屋。",
      },
    }),
    "pam.d": dir({
      kind: "設定ディレクトリ（認証）",
      desc: "PAM（認証の仕組み）のサービス別設定を格納する。",
      lpicImportant: true,
      detail: {
        role: "PAM（Pluggable Authentication Modules）のサービスごとの設定ファイルを格納するディレクトリです。",
        stores: "sshdやloginなど、サービスごとの認証ルール。",
        examples: ["sshd", "login", "sudo"],
        commands: ["cat /etc/pam.d/sshd"],
        examPoint: "認証の挙動（パスワードポリシー等）をサービスごとに柔軟に設定できる仕組みとして紹介されることが多い。",
        beginnerNote: "/etc/pam.d = ログイン認証のルールを細かく設定する場所。",
      },
    }),
    "cron.d": dir({
      kind: "設定ディレクトリ（定期実行）",
      desc: "アプリなどが追加する個別のcronジョブ定義を格納する。",
      lpicImportant: false,
      detail: {
        role: "パッケージなどが追加で配置する、個別のcronジョブ定義ファイルを格納するディレクトリです。",
        stores: "/etc/crontabと同様の書式（実行ユーザー欄あり）のジョブ定義ファイル。",
        examples: ["logrotate"],
        commands: ["ls /etc/cron.d"],
        examPoint: "/etc/cron.dailyや/etc/cron.weeklyなど、周期別ディレクトリと合わせて出題されることがある。",
        beginnerNote: "/etc/cron.d = アプリごとの自動実行スケジュールを追加する場所。",
      },
    }),
  }),

  home: dir({
    kind: "一般ユーザーのホーム",
    desc: "一般ユーザーそれぞれの個人用ディレクトリを格納する。",
    lpicImportant: true,
    detail: {
      role: "一般ユーザーそれぞれのホームディレクトリを格納する場所です。",
      stores: "個々のユーザーの個人ファイルや、~/.bashrcなどの個人設定（ドットファイル）。",
      examples: ["/home/student", "/home/alice"],
      commands: ["cd ~", "echo $HOME", "ls /home"],
      examPoint: "useradd -m でユーザーを作成すると、/home配下にホームディレクトリが自動作成される（-mを付けないと作成されない点が頻出）。",
      beginnerNote: "/home = 一般ユーザーのホーム。",
    },
  }, {
    student: dir({
      kind: "ユーザーディレクトリ",
      desc: "学習用ユーザー「student」のホームディレクトリ（サンプル）。",
      lpicImportant: false,
      detail: {
        role: "この学習用サンドボックスにおける、一般ユーザー「student」のホームディレクトリです。",
        stores: "studentユーザー個人のファイルや、Documents・Downloadsなどの個人用フォルダ。",
        examples: ["/home/student/Documents", "/home/student/Downloads"],
        commands: ["cd ~", "pwd"],
        examPoint: "一般ユーザーは自分のホーム配下では自由にファイル操作ができる（他ユーザーのホームには通常アクセスできない）。",
        beginnerNote: "ここがstudentさんの『自分の部屋』。",
      },
    }, {
      Documents: dir({
        kind: "個人用フォルダ",
        desc: "studentユーザーが作成した文書ファイルなどを保存するフォルダ。",
        lpicImportant: false,
        detail: {
          role: "studentユーザーが作成した文書ファイルなどを保存する個人用フォルダです。",
          stores: "レポートやメモなどの個人ファイル。",
          examples: ["memo.txt"],
          commands: ["ls ~/Documents"],
          examPoint: "FHSで厳密に定義された場所ではなく、デスクトップ環境の慣習で作られる個人用フォルダの例。",
          beginnerNote: "自分専用の書類フォルダ、というイメージでOK。",
        },
      }, {
        "memo.txt": file({
          kind: "テキストファイル",
          desc: "学習用のメモファイル（サンプル）。",
          lpicImportant: false,
          detail: {
            role: "studentユーザーが作成した、ただのテキストファイルのサンプルです。",
            stores: "自由なテキスト内容。",
            examples: ["Linux学習メモ"],
            commands: ["cat ~/Documents/memo.txt"],
            examPoint: "特に試験範囲ではなく、一般ユーザーが自分のファイルを自由に置ける場所であることを示すサンプル。",
            beginnerNote: "普通の一般ファイル。ここに自由にメモを置ける。",
          },
        }),
      }),
      Downloads: dir({
        kind: "個人用フォルダ",
        desc: "ダウンロードしたファイルを保存するフォルダ。",
        lpicImportant: false,
        detail: {
          role: "ダウンロードしたファイルを保存する個人用フォルダです。",
          stores: "ブラウザ等からダウンロードしたファイル。",
          examples: ["sample.zip"],
          commands: ["ls ~/Downloads"],
          examPoint: "FHS上の必須ディレクトリではなく、デスクトップ環境の慣習によるフォルダの一例。",
          beginnerNote: "ダウンロードしたファイルが入る、あの馴染みのフォルダ。",
        },
      }, {
        "sample.zip": file({
          kind: "圧縮ファイル",
          desc: "ダウンロード済みファイルのサンプル。",
          lpicImportant: false,
          detail: {
            role: "ダウンロード済みファイルのサンプルとして置かれた、ただの圧縮ファイルです。",
            stores: "圧縮されたバイナリデータ。",
            examples: ["sample.zip"],
            commands: ["unzip sample.zip"],
            examPoint: "特に試験範囲ではない、一般的なファイルの一例。",
            beginnerNote: "普通のZIPファイル。特に特別な意味はない。",
          },
        }),
      }),
    }),
  }),

  lib: dir({
    kind: "共有ライブラリ",
    desc: "/bin, /sbinのコマンドが必要とする共有ライブラリを格納する。",
    lpicImportant: true,
    detail: {
      role: "起動時や/bin, /sbin配下のコマンドが必要とする共有ライブラリ、カーネルモジュールを格納します。",
      stores: "プログラムの実行に必要な共有ライブラリ（.soファイル）。",
      examples: ["libc.so.6", "ld-linux.so.2"],
      commands: ["ldd /bin/ls", "ldconfig"],
      examPoint: "/lib も /usr/lib へのシンボリックリンクになっている場合が多い（UsrMerge）。ldconfigでライブラリキャッシュを更新する点も頻出。",
      beginnerNote: "/lib = プログラムが動くために必要な部品（ライブラリ）置き場。",
    },
  }),

  lib64: dir({
    kind: "共有ライブラリ（64bit）",
    desc: "64bit環境専用の共有ライブラリを格納する。",
    lpicImportant: true,
    detail: {
      role: "64bit専用の共有ライブラリを格納するディレクトリです（64bit環境のみ存在）。",
      stores: "64bit版の共有ライブラリ。",
      examples: ["ld-linux-x86-64.so.2"],
      commands: ["ls /lib64"],
      examPoint: "32bit/64bit混在環境で、アーキテクチャごとにライブラリを分けて格納するための仕組み。",
      beginnerNote: "/lib64 = 64bit版のライブラリ置き場。",
    },
  }),

  media: dir({
    kind: "リムーバブルメディア",
    desc: "USBメモリやCD/DVDなどが自動的にマウントされる場所。",
    lpicImportant: false,
    detail: {
      role: "USBメモリやCD/DVDなど、リムーバブルメディアが自動的にマウントされる場所です。",
      stores: "接続されたリムーバブルメディアの中身（マウントポイントとして機能）。",
      examples: ["/media/usb", "/media/cdrom"],
      commands: ["ls /media", "mount", "umount"],
      examPoint: "デスクトップ環境が自動マウントする際の標準的なマウントポイントとして紹介される。",
      beginnerNote: "/media = USBメモリなどを挿すと自動的に出てくる場所。",
    },
  }),

  mnt: dir({
    kind: "一時マウント用",
    desc: "管理者が手動で一時的にマウントするための汎用ディレクトリ。",
    lpicImportant: false,
    detail: {
      role: "管理者が手動で一時的にファイルシステムをマウントするための汎用ディレクトリです。",
      stores: "手動マウントされたファイルシステムの中身。",
      examples: ["/mnt/data", "/mnt/backup"],
      commands: ["mount /dev/sdb1 /mnt", "umount /mnt"],
      examPoint: "/mediaが自動マウント向けなのに対し、/mntは管理者による一時的な手動マウント向け、という使い分けが頻出。",
      beginnerNote: "/mnt = ちょっと借りてくる一時的な置き場。",
    },
  }),

  opt: dir({
    kind: "追加アプリケーション",
    desc: "パッケージ管理に依存しない追加ソフトウェアを格納する。",
    lpicImportant: true,
    detail: {
      role: "パッケージ管理システム（apt/yum等）に依存しない、追加のアプリケーションソフトウェアを格納します。",
      stores: "アプリごとにサブディレクトリを作り、自身に必要なファイルをまとめて格納する自己完結型のソフトウェア。",
      examples: ["/opt/google/chrome", "/opt/vendor-app"],
      commands: ["ls /opt"],
      examPoint: "標準パッケージ管理外でインストールされた商用ソフトなどの置き場所として出題される。",
      beginnerNote: "/opt = 標準のパッケージ管理外で追加インストールしたソフトの置き場。",
    },
  }),

  proc: dir({
    kind: "仮想ファイルシステム",
    desc: "実行中のプロセスやカーネルの情報を見られる仮想的な場所（実体はない）。",
    lpicImportant: true,
    examHot: true,
    isVirtual: true,
    detail: {
      role: "実行中のプロセスやカーネルの状態を、ファイルのように参照できる仮想ファイルシステムです。",
      stores: "ディスク上には実体がなく、カーネルがメモリ上の情報をその場で生成して見せています。",
      examples: ["/proc/cpuinfo", "/proc/meminfo", "/proc/1（PID1のプロセス情報）"],
      commands: ["cat /proc/cpuinfo", "cat /proc/meminfo", "ls /proc"],
      examPoint: "/procはディスク使用量が実質0（仮想FS）。psコマンドなど多くのシステム情報コマンドの情報源にもなっている。",
      beginnerNote: "/proc = プロセスやカーネルの中身を覗き見できる、特殊な窓。実際のファイルではない。",
    },
  }, {
    "cpuinfo": file({
      kind: "仮想ファイル",
      desc: "CPUの情報を確認できる仮想ファイル。",
      lpicImportant: true,
      isVirtual: true,
      detail: {
        role: "搭載されているCPUの情報をカーネルがその場で見せている仮想ファイルです。",
        stores: "CPUのモデル名、コア数、クロック周波数などの情報（ディスク上に実体はない）。",
        examples: ["model name", "cpu cores"],
        commands: ["cat /proc/cpuinfo"],
        examPoint: "catコマンドで参照するのが定番。lscpuコマンドも同じ情報を整形して表示する。",
        beginnerNote: "cat /proc/cpuinfo で今のCPU情報がすぐ見られる。",
      },
    }),
    "meminfo": file({
      kind: "仮想ファイル",
      desc: "メモリの使用状況を確認できる仮想ファイル。",
      lpicImportant: true,
      isVirtual: true,
      detail: {
        role: "現在のメモリ使用状況をカーネルがその場で見せている仮想ファイルです。",
        stores: "全メモリ量、空き容量、スワップの状況などの情報。",
        examples: ["MemTotal", "MemFree", "SwapTotal"],
        commands: ["cat /proc/meminfo", "free -h"],
        examPoint: "freeコマンドはこの/proc/meminfoの情報を整形して表示している、という関係性が問われることがある。",
        beginnerNote: "cat /proc/meminfo で今のメモリ状況がすぐ見られる。",
      },
    }),
    "uptime": file({
      kind: "仮想ファイル",
      desc: "システム起動からの経過時間を確認できる仮想ファイル。",
      lpicImportant: false,
      isVirtual: true,
      detail: {
        role: "システムが起動してからの経過時間を、カーネルがその場で見せている仮想ファイルです。",
        stores: "起動からの経過秒数と、アイドル状態の合計秒数。",
        examples: ["12345.67 9800.12"],
        commands: ["cat /proc/uptime", "uptime"],
        examPoint: "uptimeコマンドの裏側で参照されている情報源の一つ。",
        beginnerNote: "起動してからどれくらい経ったかが分かるファイル。",
      },
    }),
    "version": file({
      kind: "仮想ファイル",
      desc: "カーネルのバージョン情報を確認できる仮想ファイル。",
      lpicImportant: false,
      isVirtual: true,
      detail: {
        role: "現在動作しているカーネルのバージョン情報を、カーネルがその場で見せている仮想ファイルです。",
        stores: "カーネルバージョン、ビルド日時、コンパイラ情報など。",
        examples: ["Linux version 6.1.0"],
        commands: ["cat /proc/version", "uname -a"],
        examPoint: "uname -aと同様の情報が得られる、という対応関係を押さえておくとよい。",
        beginnerNote: "今動いているカーネルのバージョンが分かるファイル。",
      },
    }),
    "mounts": file({
      kind: "仮想ファイル",
      desc: "現在マウントされているファイルシステムの一覧を確認できる仮想ファイル。",
      lpicImportant: true,
      isVirtual: true,
      detail: {
        role: "現在マウントされているすべてのファイルシステムを、カーネルがその場で見せている仮想ファイルです。",
        stores: "デバイス、マウントポイント、ファイルシステム種別、マウントオプションの一覧。",
        examples: ["/dev/sda1 / ext4 rw,relatime 0 0"],
        commands: ["cat /proc/mounts", "mount"],
        examPoint: "/etc/fstabは「起動時にマウントする設定」、/proc/mountsは「今実際にマウントされている状態」という違いが頻出。",
        beginnerNote: "今、実際に何がマウントされているかが分かるファイル。",
      },
    }),
  }),

  root: dir({
    kind: "管理者のホーム",
    desc: "root（管理者）ユーザー専用のホームディレクトリ。",
    lpicImportant: true,
    detail: {
      role: "root（管理者）ユーザー専用のホームディレクトリです。",
      stores: "root自身の個人設定ファイルなど。",
      examples: ["/root/.bashrc"],
      commands: ["sudo ls /root"],
      examPoint: "一般ユーザーのホームは/home配下だが、rootだけは/home/rootではなく/root（ルート直下）という点が頻出。パーミッションも通常700で他ユーザーは入れない。",
      beginnerNote: "/root = 管理者専用の特別なホーム。/home じゃないので注意。",
    },
  }),

  run: dir({
    kind: "実行時データ",
    desc: "起動後に生成される実行時の一時的な情報を格納する。",
    lpicImportant: true,
    detail: {
      role: "システム起動後に生成される、実行時の一時的な情報を格納します。",
      stores: "実行中プロセスのPIDファイルやロックファイルなど。",
      examples: ["/run/lock", "/run/user/1000"],
      commands: ["ls /run"],
      examPoint: "以前は/var/runが使われていたが、現在は/runに統一。tmpfs（メモリ上）で、再起動時にクリアされる点が頻出。",
      beginnerNote: "/run = 今起動している間だけ使う一時データ置き場。",
    },
  }),

  sbin: dir({
    kind: "管理コマンド格納ディレクトリ",
    desc: "システム管理用のコマンド（主にroot向け）を格納する。",
    lpicImportant: true,
    detail: {
      role: "システム管理用のコマンド（主にroot専用）を格納します。",
      stores: "reboot, fdisk, ifconfigなど、システムの状態を変更する管理系コマンド。",
      examples: ["/sbin/reboot", "/sbin/fdisk"],
      commands: ["ls /sbin", "which fdisk"],
      examPoint: "一般ユーザーも実行できるコマンドはあるが、多くは root権限が必要という点、/binとの役割の違いが頻出。",
      beginnerNote: "/sbin = 管理者向けコマンドの置き場。",
    },
  }),

  srv: dir({
    kind: "サービス提供データ",
    desc: "そのシステムが提供するサービス用データを格納する。",
    lpicImportant: false,
    detail: {
      role: "そのシステムが外部へ提供するサービス用データを格納します。",
      stores: "Webサーバーやftpサーバーが公開するデータなど。",
      examples: ["/srv/www", "/srv/ftp"],
      commands: ["ls /srv"],
      examPoint: "必須ではないが、サーバー提供データの置き場として使われることがある、という程度の理解でよい。",
      beginnerNote: "/srv = サーバーとして提供するデータの置き場。",
    },
  }),

  sys: dir({
    kind: "仮想ファイルシステム",
    desc: "デバイスやカーネルの構造を見られる仮想的な場所（実体はない）。",
    lpicImportant: true,
    examHot: true,
    isVirtual: true,
    detail: {
      role: "デバイスやカーネルのデータ構造をファイルのように参照・操作できる仮想ファイルシステムです。",
      stores: "ディスク上には実体がなく、カーネルがデバイスやドライバの情報をその場で生成して見せています。",
      examples: ["/sys/class", "/sys/block"],
      commands: ["ls /sys/class", "cat /sys/block/sda/size"],
      examPoint: "/procがプロセス中心なのに対し、/sysはデバイス・ドライバ・カーネルオブジェクト中心、という役割分担が頻出。",
      beginnerNote: "/sys = デバイスの情報を覗ける、もう一つの特殊な窓。",
    },
  }, {
    block: dir({
      kind: "仮想ディレクトリ",
      desc: "ブロックデバイス（ディスク等）の情報が並ぶ場所。",
      lpicImportant: false,
      isVirtual: true,
      detail: {
        role: "ブロックデバイス（ディスクなど）に関する情報を、カーネルがその場で見せている仮想ディレクトリです。",
        stores: "各ディスクデバイスのサイズや状態などの情報。",
        examples: ["/sys/block/sda"],
        commands: ["ls /sys/block", "cat /sys/block/sda/size"],
        examPoint: "ディスクの詳細情報を確認する経路の一つとして紹介される。",
        beginnerNote: "ディスクなどの詳しい情報が並んでいる場所。",
      },
    }),
    class: dir({
      kind: "仮想ディレクトリ",
      desc: "デバイスの種類（クラス）ごとに情報が整理された場所。",
      lpicImportant: false,
      isVirtual: true,
      detail: {
        role: "デバイスをその種類（クラス）ごとに分類して見せている仮想ディレクトリです。",
        stores: "ネットワークインターフェースやTTYなど、種類別のデバイス情報。",
        examples: ["/sys/class/net"],
        commands: ["ls /sys/class/net"],
        examPoint: "デバイスの種類ごとの一覧性を確保するための仕組みとして紹介される。",
        beginnerNote: "デバイスが『種類別』に整理されている場所。",
      },
    }),
    devices: dir({
      kind: "仮想ディレクトリ",
      desc: "カーネルが認識しているデバイスの実体構造が並ぶ場所。",
      lpicImportant: false,
      isVirtual: true,
      detail: {
        role: "カーネルが認識しているデバイスの、実際の階層構造を見せている仮想ディレクトリです。",
        stores: "デバイスツリー上の各デバイスの詳細情報。",
        examples: ["/sys/devices/pci0000:00"],
        commands: ["ls /sys/devices"],
        examPoint: "/sys/classなどは、この/sys/devicesの実体構造への「見やすい入り口（シンボリックリンク）」を提供している、という関係性がある。",
        beginnerNote: "デバイスの『本当の構造』が入っている、少し専門的な場所。",
      },
    }),
    module: dir({
      kind: "仮想ディレクトリ",
      desc: "読み込まれているカーネルモジュールの情報が並ぶ場所。",
      lpicImportant: false,
      isVirtual: true,
      detail: {
        role: "現在読み込まれているカーネルモジュールの情報を見せている仮想ディレクトリです。",
        stores: "各モジュールのパラメータや依存関係などの情報。",
        examples: ["/sys/module/nvidia"],
        commands: ["lsmod", "ls /sys/module"],
        examPoint: "lsmodコマンドの結果と対応する情報がここにも存在する、という関連性がある。",
        beginnerNote: "読み込まれているカーネルの追加機能（モジュール）の情報が並ぶ場所。",
      },
    }),
  }),

  tmp: dir({
    kind: "一時ファイル置き場",
    desc: "アプリやユーザーが一時的に使うファイルを格納する。",
    lpicImportant: true,
    examHot: true,
    detail: {
      role: "アプリケーションやユーザーが一時的に使うファイルを格納する場所です。",
      stores: "一時的な作業ファイル。長期保存には向かない。",
      examples: ["/tmp/tempfile.txt"],
      commands: ["ls /tmp", "stat /tmp"],
      examPoint: "パーミッションは通常1777（sticky bit付き）。sticky bitにより、自分が作成したファイル以外は他ユーザーが削除できない。再起動で消える設定のディストリも多い。",
      beginnerNote: "/tmp = 一時ファイルの置き場。長期保存には向かない。",
    },
  }),

  usr: dir({
    kind: "共有プログラム置き場",
    desc: "コマンド・ライブラリ・共有データなど、大部分のプログラム資産を格納する。",
    lpicImportant: true,
    examHot: true,
    detail: {
      role: "コマンド、ライブラリ、ドキュメントなど、システム全体で共有して使うプログラム資産の大部分を格納します。",
      stores: "一般ユーザー向けの大量のコマンドや、共有ライブラリ、ドキュメント類。",
      examples: ["/usr/bin/python3", "/usr/share/doc"],
      commands: ["which python3", "ls /usr/bin"],
      examPoint: "usrは「User」ではなく歴史的には「Unix System Resources」に由来するとされ、近年は/binや/sbinも/usr配下へ統合(UsrMerge)される傾向にある。",
      beginnerNote: "/usr = たくさんのコマンドやデータが詰まった、実は一番大きなディレクトリ。",
    },
  }, {
    bin: dir({
      kind: "コマンド格納ディレクトリ",
      desc: "一般ユーザー向けコマンドの大部分を格納する（/binより数が多い）。",
      lpicImportant: true,
      detail: {
        role: "一般ユーザー向けの大部分のコマンドを格納するディレクトリです。",
        stores: "/binより格段に多い数のコマンド実行ファイル。",
        examples: ["/usr/bin/python3", "/usr/bin/vim"],
        commands: ["ls /usr/bin | wc -l"],
        examPoint: "多くのディストリで/binは/usr/binへのシンボリックリンクとして統合されている(UsrMerge)。",
        beginnerNote: "コマンドの実体の多くは実はここに入っている。",
      },
    }),
    sbin: dir({
      kind: "管理コマンド格納ディレクトリ",
      desc: "起動に必須ではない管理系コマンドを格納する。",
      lpicImportant: true,
      detail: {
        role: "システム管理向けコマンドのうち、起動に必須ではないものを格納します。",
        stores: "追加でインストールされた管理系コマンド類。",
        examples: ["/usr/sbin/useradd"],
        commands: ["ls /usr/sbin"],
        examPoint: "/sbinとの役割分担（起動に必須かどうか）が問われることがある。",
        beginnerNote: "管理コマンドのうち、起動には必須でないものが入っている。",
      },
    }),
    lib: dir({
      kind: "共有ライブラリ",
      desc: "/usr/bin, /usr/sbin配下のプログラムが使う共有ライブラリ。",
      lpicImportant: true,
      detail: {
        role: "/usr/bin, /usr/sbin配下のプログラムが利用する共有ライブラリを格納します。",
        stores: "各種アプリケーションが依存する共有ライブラリ。",
        examples: ["/usr/lib/x86_64-linux-gnu"],
        commands: ["ldd"],
        examPoint: "/libが/usr/libへ統合されるUsrMergeの動きとあわせて理解しておく。",
        beginnerNote: "アプリが必要とする部品(ライブラリ)がたくさん入っている場所。",
      },
    }),
    share: dir({
      kind: "共有データ",
      desc: "ドキュメントやmanページなど、アーキテクチャに依存しない共有データ。",
      lpicImportant: true,
      detail: {
        role: "アーキテクチャに依存しない共有データ（ドキュメント、manページ、アイコンなど）を格納します。",
        stores: "manページ、ドキュメント、アイコン、ロケールデータなど。",
        examples: ["/usr/share/doc", "/usr/share/man"],
        commands: ["man ls", "ls /usr/share/doc"],
        examPoint: "manコマンドが参照するマニュアルページの格納場所として頻出。",
        beginnerNote: "manページやドキュメントなど、共通で使うデータが入っている場所。",
      },
    }),
  }),

  var: dir({
    kind: "可変データ置き場",
    desc: "ログなど、内容がどんどん変化していくデータを格納する。",
    lpicImportant: true,
    examHot: true,
    detail: {
      role: "ログファイルやスプールなど、内容が変化し続けるデータを格納します。",
      stores: "システムやアプリケーションのログ、印刷・メールの待ち行列データなど。",
      examples: ["/var/log/syslog", "/var/spool/mail"],
      commands: ["tail -f /var/log/syslog", "ls /var/log"],
      examPoint: "var = variable(可変)の略。ログ肥大化によるディスク容量逼迫は、LPIC-1のトラブルシューティングで頻出のテーマ。",
      beginnerNote: "/var = ログなど、どんどん増えたり変わったりするデータの置き場。",
    },
  }, {
    log: dir({
      kind: "ログ格納ディレクトリ",
      desc: "システムやアプリケーションのログファイルを格納する。",
      lpicImportant: true,
      detail: {
        role: "システムやアプリケーションのログファイルを格納するディレクトリです。",
        stores: "起動ログ、認証ログ、アプリケーションログなど。",
        examples: ["syslog", "auth.log"],
        commands: ["tail -f /var/log/syslog", "less /var/log/messages"],
        examPoint: "ログの肥大化はディスク容量不足の代表的な原因。logrotateによる自動ローテーションもLPIC頻出テーマ。",
        beginnerNote: "/var/log = いろんな記録（ログ）が溜まる場所。",
      },
    }, {
      "syslog": file({
        kind: "ログファイル",
        desc: "システム全般のログを記録するファイル。",
        lpicImportant: true,
        detail: {
          role: "システム全般の動作ログを記録するファイルです。",
          stores: "カーネルや各種サービスが出力したログメッセージ。",
          examples: ["Jul 18 10:00:01 host sshd[123]: Accepted password for student"],
          commands: ["tail -f /var/log/syslog", "grep error /var/log/syslog"],
          examPoint: "トラブルシューティングの基本として、まず確認すべきログファイルの代表例。",
          beginnerNote: "システムに何が起きたかを記録した日記のようなファイル。",
        },
      }),
    }),
    tmp: dir({
      kind: "一時ファイル置き場",
      desc: "再起動をまたいでも保持したい一時ファイルを格納する。",
      lpicImportant: true,
      detail: {
        role: "再起動をまたいでも保持したい一時ファイルを格納するディレクトリです。",
        stores: "/tmpより長く保持したい一時データ。",
        examples: ["/var/tmp/build-cache"],
        commands: ["ls /var/tmp"],
        examPoint: "/tmpは再起動で消えることがあるが、/var/tmpはより長く保持される想定で使われる、という違いが頻出。",
        beginnerNote: "/var/tmp = /tmpより長生きする一時ファイル置き場。",
      },
    }),
    spool: dir({
      kind: "処理待ちデータ置き場",
      desc: "印刷待ちやメールなど、処理待ちのデータ（スプール）を格納する。",
      lpicImportant: true,
      detail: {
        role: "印刷待ちやメールなど、処理を待っているデータ（スプール）を格納するディレクトリです。",
        stores: "印刷ジョブ、未読メール、cronジョブの実行待ち情報など。",
        examples: ["/var/spool/mail", "/var/spool/cron"],
        commands: ["ls /var/spool/mail", "ls /var/spool/cron"],
        examPoint: "spool＝順番に処理されるのを待つデータの一時置き場、という語源からのイメージを問われることがある。",
        beginnerNote: "/var/spool = 印刷やメールなど『順番待ち』のデータ置き場。",
      },
    }),
  }),
});
