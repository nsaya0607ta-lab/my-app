/* =========================================================================
   ⏱ Linux内時間経過・イベント機能：データ定義
   実際のリアルタイム監視ではなく、アプリ内だけで完結する疑似Linuxの
   「時間が進むとイベントが起こる」シミュレーション用データ。

   各イベントテンプレートの形：
     {
       id: string,
       message: string,          // 通知に表示する短い文
       severity: "info"|"notice"|"warning"|"critical",  // 情報/注意/警告/重大
       relatedPath: string[]|null, // 「調査する」で移動するLPIC1_DIR_FS上のパス
       weight: number,            // 出現しやすさの重み（大きいほど出やすい）
     }
   ========================================================================= */

export const DIRX_SEVERITY_META = {
  info:     { label: "情報", cssClass: "dirx-sev-info" },
  notice:   { label: "注意", cssClass: "dirx-sev-notice" },
  warning:  { label: "警告", cssClass: "dirx-sev-warning" },
  critical: { label: "重大", cssClass: "dirx-sev-critical" },
};

export const DIRX_EVENTS = [
  {
    id: "e-newlog",
    message: "/var/logに新しいログが追加されました",
    severity: "info",
    relatedPath: ["var", "log"],
    weight: 3,
  },
  {
    id: "e-tmpfile",
    message: "/tmpに一時ファイルが作成されました",
    severity: "info",
    relatedPath: ["tmp"],
    weight: 3,
  },
  {
    id: "e-newuser",
    message: "新しいユーザーが追加されました",
    severity: "info",
    relatedPath: ["etc", "passwd"],
    weight: 2,
  },
  {
    id: "e-newdevice",
    message: "新しいデバイスが接続され、/devにデバイスファイルが追加されました",
    severity: "info",
    relatedPath: ["dev"],
    weight: 2,
  },
  {
    id: "e-logsize",
    message: "/var/logの容量が増加しています",
    severity: "notice",
    relatedPath: ["var", "log"],
    weight: 2,
  },
  {
    id: "e-diskusage",
    message: "ディスク使用率が80％を超えました",
    severity: "warning",
    relatedPath: ["var"],
    weight: 1.4,
  },
  {
    id: "e-sshdown",
    message: "SSHサービスが停止しました",
    severity: "critical",
    relatedPath: ["etc", "ssh", "sshd_config"],
    weight: 0.8,
  },
  {
    id: "e-configchanged",
    message: "設定ファイルが変更されました",
    severity: "notice",
    relatedPath: ["etc"],
    weight: 1.6,
  },
  {
    id: "e-mounterror",
    message: "起動時のマウント処理でエラーが発生しました",
    severity: "critical",
    relatedPath: ["etc", "fstab"],
    weight: 0.8,
  },
  {
    id: "e-tmpaccum",
    message: "不要な一時ファイルが蓄積しています",
    severity: "notice",
    relatedPath: ["tmp"],
    weight: 1.6,
  },
];

// 重要度の「重さ」（システム状態や既読バッジの優先度計算に使う）
export const DIRX_SEVERITY_RANK = { info: 0, notice: 1, warning: 2, critical: 3 };
