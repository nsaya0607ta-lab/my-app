const GIB = 1024 ** 3;

function historyItems(ctx){
  return ((ctx && ctx.history) || []).map(raw => String(raw || '').trim());
}

// umount成功（=マウント解除済み）の後に、df か lsblk で確認したか
function verifiedAfterUmount(ctx){
  const history = historyItems(ctx);
  let umountAt = -1;
  history.forEach((raw, i) => { if(/^umount\s+(\/mnt\/data|\/dev\/sdb1)\s*$/.test(raw)) umountAt = i; });
  if(umountAt === -1) return false;
  return history.some((raw, i) => i > umountAt && /^(df|lsblk)(\s|$)/.test(raw));
}

export default {
  id: "s121",
  title: "ディスク交換前の安全な取り外し",
  difficulty: "Linux Level1",
  difficultyLevel: 2,
  category: "ディスク・パーティション管理",
  requester: { name: "先輩", role: "インフラチーム", avatar: "👨‍💻" },
  request: [
    "データ保管用に使ってきた500GBのディスク（/dev/sdb1）を、明日新しいディスクに交換することになったよ。",
    "今は /mnt/data にマウントされたままだから、このまま抜くとデータが壊れる恐れがある。",
    "マウント状況を確認してから、安全にアンマウント（取り外し）して、外れたことの確認までお願い！",
  ],
  initialEnv: {
    dirs: ["/mnt/data"],
    partitions: [{ diskName: "sdb", num: 1, sizeBytes: 500 * GIB, fsType: "ext4" }],
    mounts: [{ device: "/dev/sdb1", mountpoint: "/mnt/data", fsType: "ext4" }],
  },
  steps: [
    {
      id: "check-mounted",
      label: "df -h または lsblk で /dev/sdb1 のマウント状況を確認する",
      hint: [
        "作業の前に、対象のディスクが本当に /mnt/data へマウントされているかを確認しましょう。",
        "マウント状況は df -h（ファイルシステム一覧）または lsblk（ブロックデバイス一覧）で確認できます。",
        "df -h と入力し、/dev/sdb1 の行のマウント先が /mnt/data になっていることを確認します。",
      ],
      goal: {
        type: "custom",
        fn: (vfs, shell, ctx) => historyItems(ctx).some(raw => /^(df|lsblk)(\s|$)/.test(raw)),
      },
    },
    {
      id: "umount-disk",
      label: "root になって /mnt/data をアンマウントする",
      hint: [
        "マウントの解除には管理者（root）権限が必要です。まず su で root に切り替えましょう（パスワードは root です）。",
        "アンマウントには umount コマンドを使います。マウント先ディレクトリかデバイス名のどちらでも指定できます。",
        "su → パスワード root → umount /mnt/data と入力します（umount /dev/sdb1 でもOKです）。",
      ],
      goal: {
        type: "custom",
        fn: (vfs, shell) => !shell.mounts.some(m => m.mountpoint === "/mnt/data"),
      },
    },
    {
      id: "verify-umount",
      label: "df -h または lsblk で、アンマウントされたことを確認する",
      hint: [
        "取り外し作業の最後は、本当に外れたかの確認です。",
        "もう一度 df -h または lsblk を実行します。",
        "df -h と入力し、一覧から /mnt/data の行が消えていればアンマウント成功です。",
      ],
      goal: {
        type: "custom",
        fn: (vfs, shell, ctx) => !shell.mounts.some(m => m.mountpoint === "/mnt/data") && verifiedAfterUmount(ctx),
      },
    },
  ],
  clearComment: "完璧！これで明日は安心してディスクを交換できるよ。「マウントしたまま抜かない」はインフラエンジニアの鉄則だからね。",
  explanation: {
    why: "umount は、mount で接続したファイルシステムをディレクトリツリーから安全に切り離すコマンドです。マウントしたままディスクを物理的に取り外すと、書き込み途中のデータが失われたりファイルシステムが破損したりする恐れがあります。umount はキャッシュ上の未書き込みデータをディスクへ書き出してから切り離すため、取り外し前には必ず実行します。指定はマウントポイント（umount /mnt/data）でもデバイス名（umount /dev/sdb1）でも構いません。",
    alternatives: "「umount: target is busy」というエラーが出る場合は、誰かがそのディレクトリをカレントディレクトリにしていたり、ファイルを開いているプロセスが残っていたりするサインです。lsof や fuser コマンドで使用中のプロセスを特定してから再実行します。自分が cd /mnt/data の中にいるだけでも busy になるので、まず cd で外へ出るのが最初の対処です。なお、コマンド名は unmount ではなく umount（nが1つ少ない）なので注意しましょう。",
    lpic: "LPIC Level1では、mount と umount が対になること、umount の引数にデバイス名とマウントポイントのどちらも使えること、「target is busy」エラーの原因と対処（lsof / fuser）が頻出です。コマンド名のつづり（umount）も引っかけ問題として出題されます。",
  },
};
