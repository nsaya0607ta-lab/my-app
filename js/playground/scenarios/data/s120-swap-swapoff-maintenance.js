const TWO_GIB = 2 * 1024 * 1024 * 1024;
const FSTAB_SWAP_LINE = '/swapfile none swap sw 0 0';

function swapArea(shell, path = '/swapfile'){
  if(!(shell.swapFiles instanceof Map)) return null;
  return shell.swapFiles.get(path) || null;
}

function commandWasRun(ctx, pattern){
  return ((ctx && ctx.history) || []).some(raw => pattern.test(String(raw || '').trim()));
}

// swapoff実行後に、確認コマンド（swapon --show または free）を実行したか
function verifiedAfterSwapoff(ctx){
  const history = ((ctx && ctx.history) || []).map(raw => String(raw || '').trim());
  let swapoffAt = -1;
  history.forEach((raw, i) => { if(/^(?:sudo\s+)?swapoff\s+\/swapfile\s*$/.test(raw)) swapoffAt = i; });
  if(swapoffAt === -1) return false;
  return history.some((raw, i) => i > swapoffAt && (/^swapon\s+--show(?:\s|$)/.test(raw) || /^free(?:\s|$)/.test(raw)));
}

export default {
  id: 's120',
  pack: 'swap-file-basics',
  title: 'メンテナンスのためSwapを無効化する',
  difficulty: 'LPIC Level1',
  difficultyLevel: 2,
  category: 'Swap管理',
  requester: { name: '運用リーダー', role: 'インフラ運用チーム', avatar: '🧑‍💼' },
  request: [
    'ディスクのメンテナンスを行うため、現在有効になっている/swapfileを一時的に無効化する必要があります。',
    '作業前の状態確認、無効化、無効化されたことの確認まで、手順どおりにお願いします。',
  ],
  initialEnv: {
    files: [
      { path: '/etc/fstab', content: `# /etc/fstab: static file system information.\n${FSTAB_SWAP_LINE}\n`, mode: '644', owner: 'root', group: 'root' },
      { path: '/swapfile', content: '', mode: '600', owner: 'root', group: 'root' },
    ],
    swapFiles: [{ path: '/swapfile', sizeBytes: TWO_GIB, usedBytes: 0, initialized: true, active: true }],
  },
  steps: [
    {
      id: 'check-before',
      label: '無効化の前に、現在有効なSwapを一覧で確認する',
      hint: [
        '操作の前に「今どうなっているか」を確認するのが運用の基本です。',
        '有効なSwap領域の一覧表示には swapon の一覧表示オプションを使います。',
        'swapon --show と入力します。NAME列に /swapfile が表示されているはずです。',
      ],
      goal: { type: 'custom', fn: (vfs, shell, ctx) => commandWasRun(ctx, /^swapon\s+--show(?:\s|$)/) },
    },
    {
      id: 'swapoff-disable',
      label: '/swapfile を無効化する',
      hint: [
        'swapon の反対の操作をするコマンドを使います。管理者権限が必要です。',
        'swapoff コマンドに対象のファイルを指定します。',
        'sudo swapoff /swapfile と入力します。',
      ],
      goal: {
        type: 'custom',
        fn: (vfs, shell) => {
          const area = swapArea(shell);
          return !!area && area.initialized && !area.active;
        },
      },
    },
    {
      id: 'check-after',
      label: '無効化されたことを swapon --show または free -h で確認する',
      hint: [
        '無効化の後も、必ず結果を確認して作業を終えます。',
        'swapon --show で一覧から消えたこと、または free -h でSwap容量が0になったことを確認します。',
        'swapon --show と入力します（何も表示されなければ、有効なSwapはありません）。',
      ],
      goal: {
        type: 'custom',
        fn: (vfs, shell, ctx) => {
          const area = swapArea(shell);
          return !!area && !area.active && verifiedAfterSwapoff(ctx);
        },
      },
    },
  ],
  clearComment: 'Swapの無効化と確認まで完了です。メンテナンスが終わったら swapon /swapfile で再度有効化できます。有効化と無効化はセットで覚えておきましょう。',
  explanation: {
    why: 'swapoff は、swapon で有効化したSwap領域を無効化するコマンドです。無効化の際、Swapに退避されていたデータは物理メモリへ書き戻されるため、実際のサーバーではメモリに十分な空きがあるタイミングで実行する必要があります。Swapファイルの削除やサイズ変更、ディスクメンテナンスの前には必ず swapoff で無効化してから作業します。',
    alternatives: 'swapoff -a を使うと、有効になっているすべてのSwap領域をまとめて無効化できます（swapon -a の反対）。なお /etc/fstab に記述が残っている場合、swapoff しても再起動すると自動で有効化される点に注意が必要です。恒久的に無効化したい場合は、swapoff に加えて /etc/fstab の該当行の削除（またはコメントアウト）も行います。',
    lpic: 'LPIC Level1では、swapon（有効化・--showで一覧）とswapoff（無効化）が対になること、swapoff時にSwap上のデータが物理メモリへ戻されること、/etc/fstabとの関係（再起動時の自動有効化）が問われます。',
  },
};
