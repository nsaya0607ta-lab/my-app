/* =========================================================================
   🛠 障害対応モード：シナリオ定義
   「ディレクトリを触って学ぶ」画面の疑似ファイルシステムと、最小限の
   疑似ターミナル（js/dirxStore.js の runIncidentCommand）を使って原因調査・
   復旧を体験する学習用シナリオ。実際のOS・実際のコマンド実行には一切
   アクセスしない、すべてアプリ内で完結する疑似データ。

   各シナリオの形：
     {
       id, title, symptom, difficulty("初級"|"中級"|"LPIC-1"), estMinutes,
       rewardAC, rewardExp,
       investigateTargets: [{ id, label, path?: string[], command?: string }],
       relatedCommands: string[],
       causeOptions: [{ id, label, correct, explain }],
       fixOptions:   [{ id, label, correct, explain }],
       lpicPoint: string,
       terminal: { [command]: string },  // 疑似コマンドの出力（完全一致）
     }
   ========================================================================= */

export const DIRX_SCENARIOS = [
  {
    id: "s-ssh",
    title: "SSH接続ができない",
    symptom: "ユーザーから「サーバーへSSH接続できない」と連絡がありました。",
    difficulty: "中級",
    estMinutes: 8,
    rewardAC: 80,
    rewardExp: 60,
    investigateTargets: [
      { id: "sshd_config", label: "sshd_configの中身を確認する", path: ["etc", "ssh", "sshd_config"], command: "cat /etc/ssh/sshd_config" },
      { id: "service", label: "SSHサービスの状態を確認する", command: "systemctl status sshd" },
      { id: "log", label: "エラーログを確認する", path: ["var", "log", "syslog"], command: "cat /var/log/syslog" },
    ],
    relatedCommands: ["systemctl status sshd", "systemctl restart sshd", "cat /etc/ssh/sshd_config", "cat /var/log/syslog"],
    resolvesEventIds: ["e-sshdown"],
    causeOptions: [
      { id: "stopped", label: "SSHサービスが停止している", correct: true, explain: "systemctl status sshdの結果、sshdがinactive（停止中）でした。SSH接続不可の直接の原因です。" },
      { id: "disk", label: "ディスク容量が不足している", correct: false, explain: "ディスク容量とSSH接続の可否には直接の関係はありません。" },
      { id: "passwdmissing", label: "passwdファイルが存在しない", correct: false, explain: "/etc/passwdは正常に存在しており、ユーザー情報に問題はありませんでした。" },
      { id: "timezone", label: "タイムゾーンが間違っている", correct: false, explain: "タイムゾーンの設定はSSH接続の可否には影響しません。" },
    ],
    fixOptions: [
      { id: "restart", label: "SSHサービスを再起動する", correct: true, explain: "systemctl restart sshdでサービスを起動し直すことで、SSH接続が復旧します。" },
      { id: "deluser", label: "ユーザーを削除する", correct: false, explain: "ユーザーを削除しても、SSHサービスが停止したままでは誰も接続できず、問題は解決しません。" },
      { id: "rmlogs", label: "ログファイルをすべて削除する", correct: false, explain: "すべてのログを削除すると、障害調査に必要な記録まで失われる可能性があります。必要なファイルを確認してから整理しましょう。" },
      { id: "reinstall", label: "OSを再インストールする", correct: false, explain: "軽微なサービス停止に対してOS再インストールは過剰な対応です。他のデータや設定まで失われてしまいます。" },
    ],
    lpicPoint: "systemctlによるサービスの状態確認・起動・停止・再起動はLPIC-1の頻出操作です。sshd_configの主要ディレクティブ（Port, PermitRootLoginなど）もあわせて押さえましょう。",
    terminal: {
      "systemctl status sshd": "● sshd.service - OpenSSH server\n   Loaded: loaded\n   Active: inactive (dead)\n\n→ サービスが停止しているようです。",
      "systemctl restart sshd": "sshd.service を再起動しました。\n● sshd.service - OpenSSH server\n   Active: active (running)",
      "cat /etc/ssh/sshd_config": "Port 22\nPermitRootLogin no\nPasswordAuthentication yes\n\n→ 設定内容そのものに誤りは見当たりません。",
      "cat /var/log/syslog": "... sshd[1023]: Stopping OpenSSH server ...\n... systemd: sshd.service: Deactivated successfully.\n\n→ 何らかの理由でサービスが停止（Deactivated）した記録があります。",
    },
  },
  {
    id: "s-disk",
    title: "ディスク容量不足",
    symptom: "ディスクの空き容量が少ないという警告が発生しました。",
    difficulty: "初級",
    estMinutes: 6,
    rewardAC: 50,
    rewardExp: 40,
    investigateTargets: [
      { id: "df", label: "ディスク全体の使用率を確認する", command: "df -h" },
      { id: "var-log", label: "/var/logの使用量を確認する", path: ["var", "log"], command: "du -sh /var/log" },
      { id: "tmp", label: "/tmpの使用量を確認する", path: ["tmp"], command: "du -sh /tmp" },
      { id: "home", label: "/homeの使用量を確認する", path: ["home"], command: "du -sh /home" },
    ],
    relatedCommands: ["df -h", "du -sh /var/log", "du -sh /tmp", "du -sh /home"],
    resolvesEventIds: ["e-diskusage", "e-logsize", "e-tmpaccum"],
    causeOptions: [
      { id: "logbloat", label: "ログファイルが肥大化している", correct: true, explain: "du -sh /var/logの結果が他と比べて突出して大きく、ログの肥大化が空き容量不足の主因でした。" },
      { id: "tmpbloat", label: "一時ファイルが大量に残っている", correct: false, explain: "du -sh /tmpの結果は他と比べて小さく、主因ではありませんでした。" },
      { id: "userfiles", label: "ユーザーファイルが容量を使用している", correct: false, explain: "du -sh /homeの結果は通常範囲内で、容量不足の主因ではありませんでした。" },
      { id: "sshdown2", label: "SSHサービスが停止している", correct: false, explain: "SSHサービスの状態とディスク容量には直接の関係はありません。" },
    ],
    fixOptions: [
      { id: "cleanlog", label: "不要なログを整理する", correct: true, explain: "肥大化したログを整理（ローテーション・古いログの削除）することで空き容量が回復します。" },
      { id: "cleantmp", label: "一時ファイルを削除する", correct: false, explain: "/tmpの一時ファイルは主因ではないため、これだけでは十分な効果が得られません。" },
      { id: "deluser2", label: "ユーザーを削除する", correct: false, explain: "ユーザーを削除すると個人データが失われる可能性があり、容量不足の根本的な解決にもなりません。" },
      { id: "reinstall2", label: "OSを再インストールする", correct: false, explain: "ログの整理で解決できる問題に対して、OS再インストールは過剰でデータ損失のリスクも大きい対応です。" },
    ],
    lpicPoint: "df -hはファイルシステム全体の使用率、du -shは指定ディレクトリ配下の使用量を調べるコマンドです。原因の切り分けにこの2つを組み合わせて使う点がLPIC-1で頻出です。",
    terminal: {
      "df -h": "Filesystem   Size  Used  Avail  Use%  Mounted on\n/dev/sda1     40G   37G   1.6G   96%   /\n\n→ 空き容量が非常に少なくなっています。",
      "du -sh /var/log": "812M   /var/log\n\n→ 他のディレクトリと比べて突出して大きいようです。",
      "du -sh /tmp": "48M    /tmp",
      "du -sh /home": "120M   /home",
    },
  },
  {
    id: "s-fstab",
    title: "起動時にファイルシステムがマウントされない",
    symptom: "Linux起動後、特定のファイルシステムがマウントされていません。",
    difficulty: "LPIC-1",
    estMinutes: 10,
    rewardAC: 100,
    rewardExp: 75,
    investigateTargets: [
      { id: "fstab", label: "/etc/fstabの中身を確認する", path: ["etc", "fstab"], command: "cat /etc/fstab" },
      { id: "lsblk", label: "ディスクの一覧を確認する", command: "lsblk" },
      { id: "blkid", label: "実際のUUIDを確認する", command: "blkid" },
    ],
    relatedCommands: ["cat /etc/fstab", "lsblk", "blkid", "mount -a"],
    resolvesEventIds: ["e-mounterror"],
    causeOptions: [
      { id: "uuidwrong", label: "UUIDが間違っている", correct: true, explain: "blkidで確認した実際のUUIDと、/etc/fstabに記載されたUUIDが一致していませんでした。" },
      { id: "nomountpoint", label: "マウントポイントが存在しない", correct: false, explain: "該当のマウントポイント用ディレクトリ自体は存在しており、原因ではありませんでした。" },
      { id: "badformat", label: "fstabの記述形式が間違っている", correct: false, explain: "各フィールドの並び順や区切りは正しく記述されており、書式自体に誤りはありませんでした。" },
      { id: "sshdown3", label: "SSHサービスが停止している", correct: false, explain: "SSHサービスの状態とマウント処理には直接の関係はありません。" },
    ],
    fixOptions: [
      { id: "fixuuid", label: "正しいUUIDに修正する", correct: true, explain: "blkidで確認した正しいUUIDに/etc/fstabを書き換えることで、起動時に正しくマウントされるようになります。" },
      { id: "mkmountpoint", label: "マウントポイントを作成する", correct: false, explain: "マウントポイント自体はすでに存在するため、これだけでは解決しません。" },
      { id: "wipefstab", label: "fstabの記述をすべて削除する", correct: false, explain: "fstabの記述をすべて削除すると、他の正常なマウント設定まで失われてしまいます。" },
      { id: "reinstall3", label: "OSを再インストールする", correct: false, explain: "設定ファイルの1行修正で解決できる問題に対して、OS再インストールは過剰な対応です。" },
    ],
    lpicPoint: "/etc/fstabはデバイス・マウントポイント・ファイルシステム種別・オプション・dump・fsck順の並びで記述します。blkidで実際のUUIDを確認し突き合わせる切り分け方がLPIC-1で頻出です。",
    terminal: {
      "cat /etc/fstab": "UUID=1111-AAAA  /data  ext4  defaults  0  2\n\n→ /dataというマウントポイント向けの設定が1行あります。",
      "lsblk": "NAME   SIZE  MOUNTPOINT\nsda     40G  /\nsdb1    20G  /data\n\n→ sdb1が/dataとして使われる想定のようです。",
      "blkid": "/dev/sdb1: UUID=\"2222-BBBB\" TYPE=\"ext4\"\n\n→ fstabに書かれているUUID(1111-AAAA)と一致していません。",
      "mount -a": "mount: /data: can't find UUID=1111-AAAA.\n\n→ UUIDの不一致によりマウントに失敗しています。",
    },
  },
  {
    id: "s-login",
    title: "ユーザーがログインできない",
    symptom: "特定のユーザーがLinuxへログインできません。",
    difficulty: "中級",
    estMinutes: 8,
    rewardAC: 80,
    rewardExp: 60,
    investigateTargets: [
      { id: "passwd2", label: "/etc/passwdでユーザー情報を確認する", path: ["etc", "passwd"], command: "grep user /etc/passwd" },
      { id: "shadow2", label: "アカウントの状態を確認する", command: "passwd -S user" },
      { id: "home2", label: "ホームディレクトリの権限を確認する", path: ["home"], command: "ls -ld /home/user" },
    ],
    relatedCommands: ["grep user /etc/passwd", "passwd -S user", "ls -ld /home/user"],
    causeOptions: [
      { id: "nologin", label: "ログインシェルが/sbin/nologinになっている", correct: true, explain: "/etc/passwdの該当ユーザーの行で、ログインシェルが/sbin/nologinに設定されていました。" },
      { id: "locked", label: "アカウントがロックされている", correct: false, explain: "passwd -Sの結果ではアカウントはロックされておらず、原因ではありませんでした。" },
      { id: "homeperm", label: "ホームディレクトリの権限に問題がある", correct: false, explain: "ホームディレクトリの権限は問題なく設定されていました。" },
      { id: "diskfull2", label: "ディスク容量が不足している", correct: false, explain: "ディスク容量とログイン可否には直接の関係はありません。" },
    ],
    fixOptions: [
      { id: "fixshell", label: "ログインシェルを/bin/bashに変更する", correct: true, explain: "chshコマンドなどでログインシェルを通常のシェルに変更することで、ログインできるようになります。" },
      { id: "deluser3", label: "ユーザーを削除する", correct: false, explain: "ユーザーを削除すると個人データが失われ、根本的な解決にもなりません。" },
      { id: "rmlogs3", label: "ログファイルをすべて削除する", correct: false, explain: "すべてのログを削除すると、障害調査に必要な記録まで失われる可能性があります。" },
      { id: "reinstall4", label: "OSを再インストールする", correct: false, explain: "シェルの設定変更で解決できる問題に対して、OS再インストールは過剰な対応です。" },
    ],
    lpicPoint: "/etc/passwdの7番目のフィールド（ログインシェル）が/sbin/nologinや/bin/falseだと対話ログインできません。passwd -Sによるアカウント状態確認とあわせて頻出です。",
    terminal: {
      "grep user /etc/passwd": "user:x:1001:1001::/home/user:/sbin/nologin\n\n→ ログインシェルが/sbin/nologinになっています。",
      "passwd -S user": "user P 2026-01-01 0 99999 7 -1\n\n→ P はアカウントが有効（ロックされていない）ことを示します。",
      "ls -ld /home/user": "drwxr-xr-x 2 user user 4096 Jan  1 09:00 /home/user\n\n→ 権限は正常です。",
    },
  },
  {
    id: "s-dns",
    title: "名前解決ができない",
    symptom: "IPアドレスでは通信できますが、ホスト名では通信できません。",
    difficulty: "初級",
    estMinutes: 6,
    rewardAC: 50,
    rewardExp: 40,
    investigateTargets: [
      { id: "resolv", label: "/etc/resolv.confを確認する", path: ["etc", "resolv.conf"], command: "cat /etc/resolv.conf" },
      { id: "hosts", label: "/etc/hostsを確認する", path: ["etc", "hosts"], command: "cat /etc/hosts" },
      { id: "ping", label: "名前解決を試す", command: "ping example.com" },
    ],
    relatedCommands: ["cat /etc/resolv.conf", "cat /etc/hosts", "ping example.com"],
    causeOptions: [
      { id: "noresolv", label: "resolv.confにnameserverが存在しない", correct: true, explain: "/etc/resolv.confを確認すると、nameserverの行が記載されていませんでした。" },
      { id: "wrongdns", label: "DNSサーバーの設定が間違っている", correct: false, explain: "nameserverの行自体が存在しないため、「間違った値が設定されている」状態とは異なります。" },
      { id: "badhosts", label: "hostsの記述が間違っている", correct: false, explain: "/etc/hostsの記述に誤りはなく、localhostの設定も正常でした。" },
      { id: "sshdown4", label: "SSHサービスが停止している", correct: false, explain: "SSHサービスの状態と名前解決には直接の関係はありません。" },
    ],
    fixOptions: [
      { id: "addns", label: "resolv.confにnameserverを追記する", correct: true, explain: "nameserver 8.8.8.8 のような行を/etc/resolv.confに追記することで、名前解決ができるようになります。" },
      { id: "wipehosts", label: "hostsファイルをすべて削除する", correct: false, explain: "hostsファイルには正常な設定（localhostなど）も含まれており、すべて削除すると別の問題を招く可能性があります。" },
      { id: "deluser4", label: "ユーザーを削除する", correct: false, explain: "ユーザーの削除と名前解決の問題には関係がありません。" },
      { id: "reinstall5", label: "OSを再インストールする", correct: false, explain: "設定ファイルへの1行追記で解決できる問題に対して、OS再インストールは過剰な対応です。" },
    ],
    lpicPoint: "/etc/resolv.confのnameserver行、/etc/hostsの静的な名前解決という2つの経路の役割分担がLPIC-1で頻出です。",
    terminal: {
      "cat /etc/resolv.conf": "# Generated by NetworkManager\n\n→ nameserverの行が見当たりません。",
      "cat /etc/hosts": "127.0.0.1  localhost\n\n→ 設定に誤りは見当たりません。",
      "ping example.com": "ping: example.com: Name or service not known\n\n→ IPアドレスへのping（例: ping 93.184.216.34）は成功します。",
    },
  },
];
