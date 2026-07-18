/* =========================================================================
   🧭 探索ミッション：データ定義
   「ディレクトリを触って学ぶ」画面（js/render.js の renderDirExplorer）の
   疑似ファイルシステム（LPIC1_DIR_FS）を舞台にした、目的のファイル／
   ディレクトリを探すミッション一覧。実際のOSには一切アクセスしない。

   各ミッションの形：
     {
       id: string,             // 一意なID（進捗保存のキーにもなる）
       title: string,          // ミッション名
       prompt: string,         // 問題文
       difficulty: "初級" | "中級" | "LPIC-1",
       answerPath: string[],   // 正解のパス（LPIC1_DIR_FS上のセグメント配列）
       rewardAC: number,       // 満額（ヒント未使用）で獲得できるAC
       rewardExp: number,      // 獲得経験値（探索ミッション専用のEXP）
       hints: string[],        // ヒント（段階的に開放。使うほど後述のペナルティ）
       correctNote: string,    // 正解時に表示する、正解ファイルの役割の説明
       relatedCommands: string[], // 正解時に表示する関連コマンド
     }

   不正解時の説明文はハードコードせず、選択された場所のLPIC1_DIR_FS上の
   detail.role をその場で引用して表示する（js/dirxStore.js参照）。
   ========================================================================= */

export const DIRX_MISSIONS = [
  {
    id: "m-passwd",
    title: "ユーザー情報を探せ",
    prompt: "Linuxに登録されているユーザー情報が保存されたファイルを探してください。",
    difficulty: "初級",
    answerPath: ["etc", "passwd"],
    rewardAC: 30,
    rewardExp: 20,
    hints: [
      "設定ファイルが集まるディレクトリにあります。",
      "ユーザーに関係するファイルです。",
      "ファイル名は「pass」から始まります。",
    ],
    correctNote: "Linuxに登録されているユーザー情報を保存するファイルです。ただし、現在のパスワードそのものは /etc/shadow に保存されます。",
    relatedCommands: ["cat /etc/passwd", "getent passwd"],
  },
  {
    id: "m-sshd-config",
    title: "SSH設定ファイルを探せ",
    prompt: "SSHサーバー全体の設定を行うファイルを探してください。",
    difficulty: "中級",
    answerPath: ["etc", "ssh", "sshd_config"],
    rewardAC: 50,
    rewardExp: 35,
    hints: [
      "設定ファイルが集まるディレクトリの中に、専用のサブディレクトリがあります。",
      "リモートログインの仕組み（SSH）に関係するディレクトリです。",
      "ファイル名は「sshd_」から始まります。",
    ],
    correctNote: "SSHサーバー(sshd)の動作を設定するファイルです。待受ポート番号やrootログインの可否などを設定します。",
    relatedCommands: ["cat /etc/ssh/sshd_config", "systemctl restart sshd"],
  },
  {
    id: "m-fstab",
    title: "自動マウントの設定を確認せよ",
    prompt: "Linux起動時に、どのファイルシステムをどこへマウントするか設定するファイルを探してください。",
    difficulty: "中級",
    answerPath: ["etc", "fstab"],
    rewardAC: 50,
    rewardExp: 35,
    hints: [
      "設定ファイルが集まるディレクトリにあります。",
      "「マウント」に関係するファイルです。",
      "ファイル名は「fs」から始まります。",
    ],
    correctNote: "起動時に自動でマウントするファイルシステムの一覧を定義するファイルです。デバイス・マウントポイント・ファイルシステム種別などを1行ずつ列挙します。",
    relatedCommands: ["cat /etc/fstab", "mount -a"],
  },
  {
    id: "m-shadow",
    title: "ユーザーのパスワード情報を探せ",
    prompt: "暗号化されたユーザーのパスワード情報が保存されているファイルを探してください。",
    difficulty: "LPIC-1",
    answerPath: ["etc", "shadow"],
    rewardAC: 80,
    rewardExp: 60,
    hints: [
      "設定ファイルが集まるディレクトリにあります。",
      "似た名前のファイル /etc/passwd とは別の、root専用のファイルです。",
      "ファイル名は「shadow」です。",
    ],
    correctNote: "ユーザーの暗号化パスワードやパスワードの有効期限などを保存するファイルです。パーミッションが厳しく設定され、root以外は読み取れません。",
    relatedCommands: ["chage -l student", "cat /etc/shadow（要root）"],
  },
  {
    id: "m-vmlinuz",
    title: "起動に必要なカーネルを探せ",
    prompt: "Linux起動時に読み込まれるカーネルイメージを探してください。",
    difficulty: "中級",
    answerPath: ["boot", "vmlinuz"],
    rewardAC: 50,
    rewardExp: 35,
    hints: [
      "起動に必要なファイルが集まるディレクトリにあります。",
      "カーネル本体そのものを表すファイルです。",
      "ファイル名は「vmlinuz」です。",
    ],
    correctNote: "起動時にブートローダーが読み込む、Linuxカーネル本体の実体です。",
    relatedCommands: ["uname -r", "ls -l /boot/vmlinuz*"],
  },
  {
    id: "m-var-log",
    title: "ログの保存場所を探せ",
    prompt: "Linuxのシステムログが主に保存されるディレクトリを探してください。",
    difficulty: "初級",
    answerPath: ["var", "log"],
    rewardAC: 30,
    rewardExp: 20,
    hints: [
      "「可変データ」を保存するディレクトリの中にあります。",
      "起動ログや認証ログなどが集まるディレクトリです。",
      "ディレクトリ名は「log」です。",
    ],
    correctNote: "システムやアプリケーションのログファイルを格納するディレクトリです。ログの肥大化はディスク容量不足の代表的な原因になります。",
    relatedCommands: ["tail -f /var/log/syslog", "ls /var/log"],
  },
];

// ヒントを使うほど獲得ACを段階的に減らす（最低保証あり）。経験値は減らさない。
export function missionRewardForHints(mission, hintsUsed){
  const n = Math.max(0, Math.min(hintsUsed || 0, mission.hints.length));
  const penaltyRatio = [1, 0.8, 0.6, 0.45][n] ?? 0.45;
  const ac = Math.max(10, Math.round(mission.rewardAC * penaltyRatio));
  return { ac, exp: mission.rewardExp };
}
