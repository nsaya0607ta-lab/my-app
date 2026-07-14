const TWO_GIB = 2 * 1024 * 1024 * 1024;
const FSTAB_SWAP_LINE = '/swapfile none swap sw 0 0';

function nodeAt(vfs, path){
  return vfs.getNode(vfs.resolvePath(path));
}

function swapArea(shell, path = '/swapfile'){
  if(!(shell.swapFiles instanceof Map)) return null;
  return shell.swapFiles.get(path) || null;
}

function swapAllocated(vfs, shell, path = '/swapfile', sizeBytes = TWO_GIB){
  const node = nodeAt(vfs, path);
  const area = swapArea(shell, path);
  return !!node && node.type === 'file' && !!area && area.sizeBytes === sizeBytes;
}

function swapInitialized(vfs, shell, path = '/swapfile'){
  return swapAllocated(vfs, shell, path, swapArea(shell, path)?.sizeBytes || TWO_GIB)
    && !!swapArea(shell, path)?.initialized;
}

function swapActive(vfs, shell, path = '/swapfile'){
  return swapInitialized(vfs, shell, path) && !!swapArea(shell, path)?.active;
}

function normalizedCommand(raw){
  const parts = String(raw || '').trim().split(/\s+/).filter(Boolean);
  if(parts[0] === 'sudo') parts.shift();
  return { raw:String(raw || '').trim(), parts };
}

function commandWasRun(ctx, cmd, pattern){
  const history = (ctx && ctx.history) || [];
  return history.some(raw => {
    const item = normalizedCommand(raw);
    if(item.parts[0] !== cmd) return false;
    return pattern ? pattern.test(item.raw) : true;
  });
}

function commandsWereRunInOrder(ctx, patterns){
  const history = ((ctx && ctx.history) || []).map(raw => String(raw || '').trim());
  let cursor = 0;
  for(const pattern of patterns){
    let found = false;
    while(cursor < history.length){
      if(pattern.test(history[cursor++])){ found = true; break; }
    }
    if(!found) return false;
  }
  return true;
}

function fstabContainsSwap(vfs){
  const res = vfs.readFile('/etc/fstab');
  if(res.error) return false;
  return res.content.split(/\r?\n/).some(line => line.trim() === FSTAB_SWAP_LINE);
}

function standardFstabFile(){
  return {
    path: '/etc/fstab',
    content: '# /etc/fstab: static file system information.\n',
    mode: '644',
    owner: 'root',
    group: 'root',
  };
}

function standardSwapFile(mode = '600'){
  return {
    path: '/swapfile',
    content: '',
    mode,
    owner: 'root',
    group: 'root',
  };
}

function standardSwapState({ initialized = false, active = false } = {}){
  return {
    path: '/swapfile',
    sizeBytes: TWO_GIB,
    usedBytes: 0,
    initialized,
    active,
  };
}

export const s092 = {
  id: 's092',
  pack: 'swap-file-basics',
  title: '現在のSwap状態を確認する',
  difficulty: 'LPIC Level1',
  difficultyLevel: 1,
  category: 'Swap管理',
  requester: { name: '山田先輩', role: 'インフラ運用チーム', avatar: '👨‍💻' },
  request: [
    'このサーバーはメモリ不足に備えてSwapを追加する予定です。',
    '作業前に、現在有効なSwapとメモリ状況を確認してください。',
  ],
  initialEnv: { files: [standardFstabFile()], swapFiles: [] },
  steps: [
    {
      id: 'show-current-swap',
      label: '現在有効なSwap領域を一覧で確認する',
      hint: [
        '有効になっているSwap領域だけを一覧表示するコマンドを使います。',
        'swapon コマンドに、一覧表示用の長いオプションを付けます。',
        'swapon --show と入力します。何も表示されなければ、現在有効なSwapはありません。',
      ],
      goal: { type: 'custom', fn: (vfs, shell, ctx) => commandWasRun(ctx, 'swapon', /swapon\s+--show(?:\s|$)/) },
    },
    {
      id: 'show-memory',
      label: '物理メモリとSwapの容量・使用量を読みやすい単位で確認する',
      hint: [
        '物理メモリとSwapをまとめて確認できるコマンドを使います。',
        'free コマンドに、人が読みやすい単位で表示するオプションを付けます。',
        'free -h と入力します。',
      ],
      goal: { type: 'custom', fn: (vfs, shell, ctx) => commandWasRun(ctx, 'free', /free\s+-[a-zA-Z]*h/) },
    },
  ],
  clearComment: '作業前の状態確認は完了です。現在はSwapが未設定なので、次に2GBのSwapファイルを作成しましょう。',
  explanation: {
    why: 'swapon --showは「現在有効になっているSwap領域の一覧」を確認するコマンドです。一方、free -hは物理メモリとSwapの総容量・使用量・空き容量をまとめて確認します。作業前に両方を確認しておくと、既存Swapを重複して追加する事故を防ぎ、追加後の変化も比較できます。',
    alternatives: 'Swapの情報は cat /proc/swaps でも確認できます。メモリ全体の状況は top でも見られますが、初学者が容量を短時間で確認する用途では free -h が分かりやすいです。',
    lpic: 'LPIC Level1では、swaponがSwapの有効化と一覧確認に使われること、freeが物理メモリとSwapの使用状況を表示すること、それぞれの役割の違いを理解しておく必要があります。',
  },
};

export const s093 = {
  id: 's093',
  pack: 'swap-file-basics',
  title: '2GBのSwap用ファイルを作成する',
  difficulty: 'LPIC Level1',
  difficultyLevel: 1,
  category: 'Swap管理',
  requester: { name: '山田先輩', role: 'インフラ運用チーム', avatar: '👨‍💻' },
  request: [
    '現在のサーバーにはSwapがありません。',
    'ルートディレクトリ直下に、2GBのSwap用ファイルを作成してください。',
  ],
  initialEnv: { files: [standardFstabFile()], swapFiles: [] },
  steps: [
    {
      id: 'allocate-swapfile',
      label: '/swapfileとして2GBのファイルを作成する',
      hint: [
        '指定した容量のファイルを確保する fallocate コマンドを使います。',
        '-l で容量を指定し、保存場所を /swapfile にします。ルート直下への作成には管理者権限が必要です。',
        'sudo fallocate -l 2G /swapfile と入力します。',
      ],
      goal: { type: 'custom', fn: (vfs, shell) => swapAllocated(vfs, shell) },
    },
  ],
  clearComment: '2GBのSwap用ファイルを作成できました。まだ通常のファイルなので、次は権限を安全にします。',
  explanation: {
    why: 'fallocate -l 2G /swapfileは、/swapfileという名前で2GB分の領域を確保します。-lはlength（長さ・容量）の指定です。この時点では、2GBの通常ファイルが存在するだけで、LinuxはまだSwap領域として利用しません。',
    alternatives: '環境によっては dd if=/dev/zero of=/swapfile bs=1M count=2048 でも作成できます。ただし今回はLPIC Level1の基本手順として、短く分かりやすいfallocateを使用します。',
    lpic: 'LPIC Level1では、Swapファイルの作成・権限設定・mkswap・swaponという段階を区別することが重要です。「ファイルを作っただけではSwapではない」という点を押さえます。',
  },
};

export const s094 = {
  id: 's094',
  pack: 'swap-file-basics',
  title: 'Swapファイルの危険な権限を修正する',
  difficulty: 'LPIC Level1',
  difficultyLevel: 1,
  category: 'Swap管理',
  requester: { name: '佐藤さん', role: 'セキュリティ担当', avatar: '👩‍💼' },
  request: [
    '作成した/swapfileを確認したところ、一般ユーザーも読み取れる権限になっています。',
    'rootだけが読み書きできる安全な権限に修正してください。',
  ],
  initialEnv: {
    files: [standardFstabFile(), standardSwapFile('644')],
    swapFiles: [standardSwapState()],
  },
  steps: [
    {
      id: 'chmod-600',
      label: '/swapfileの権限を600に変更する',
      hint: [
        '所有者だけに読み取りと書き込みを許可し、グループとその他には権限を与えません。',
        'chmodを数値モードで使います。root所有のファイルなので管理者権限が必要です。',
        'sudo chmod 600 /swapfile と入力します。',
      ],
      goal: { type: 'octal', path: '/swapfile', value: '600' },
    },
  ],
  clearComment: '権限を600にできました。Swapにはメモリ内容が書き出される可能性があるため、この制限が重要です。',
  explanation: {
    why: 'chmod 600は、所有者に読み取り(r)と書き込み(w)を許可し、グループとその他のユーザーには一切の権限を与えません。Swapには実行中プログラムのメモリ内容が保存される可能性があるため、一般ユーザーが読める状態は安全ではありません。',
    alternatives: '記号モードでは chmod u=rw,go= /swapfile としても同じ最終状態になります。ただしSwapファイルの手順では、600という数値指定が一般的です。',
    lpic: 'LPIC Level1では、chmodの数値モードで4=読み取り、2=書き込み、1=実行を組み合わせる考え方が問われます。600は「所有者rw、グループ---、その他---」です。',
  },
};

export const s095 = {
  id: 's095',
  pack: 'swap-file-basics',
  title: '通常ファイルをSwap領域として初期化する',
  difficulty: 'LPIC Level1',
  difficultyLevel: 1,
  category: 'Swap管理',
  requester: { name: '山田先輩', role: 'インフラ運用チーム', avatar: '👨‍💻' },
  request: [
    '/swapfileの作成と権限設定は完了しています。',
    'まだ通常のファイルなので、Swap領域として使える形式に初期化してください。',
  ],
  initialEnv: {
    files: [standardFstabFile(), standardSwapFile('600')],
    swapFiles: [standardSwapState()],
  },
  steps: [
    {
      id: 'mkswap',
      label: '/swapfileをSwap領域として初期化する',
      hint: [
        'Swap用の署名と管理情報を作成するコマンドを使います。',
        'コマンド名はmake swapを短くしたものです。管理者権限で実行します。',
        'sudo mkswap /swapfile と入力します。',
      ],
      goal: { type: 'custom', fn: (vfs, shell) => swapInitialized(vfs, shell) },
    },
  ],
  clearComment: 'Swap形式への初期化が完了しました。ただし、まだ現在のOSでは有効になっていません。',
  explanation: {
    why: 'mkswapは通常ファイルやパーティションにSwap用の管理情報を書き込み、Swapとして認識できる形式にします。fallocateは容量を確保するだけなので、mkswapを実行するまでSwap領域としては使用できません。',
    alternatives: 'Swap専用パーティションを使う場合も、対象を/dev/sdb2などに変えてmkswapを実行します。今回は扱いやすいSwapファイル方式を使用しています。',
    lpic: 'LPIC Level1では、mkfsが通常のファイルシステムを作るのに対し、mkswapはSwap領域を初期化するコマンドであることを区別します。',
  },
};

export const s096 = {
  id: 's096',
  pack: 'swap-file-basics',
  title: '初期化済みのSwapを有効化する',
  difficulty: 'LPIC Level1',
  difficultyLevel: 1,
  category: 'Swap管理',
  requester: { name: '山田先輩', role: 'インフラ運用チーム', avatar: '👨‍💻' },
  request: [
    'mkswapまでは完了していますが、まだSwapとして使われていません。',
    '現在稼働中のLinuxで/swapfileを有効にしてください。',
  ],
  initialEnv: {
    files: [standardFstabFile(), standardSwapFile('600')],
    swapFiles: [standardSwapState({ initialized:true })],
  },
  steps: [
    {
      id: 'swapon-enable',
      label: '/swapfileを現在のLinuxで有効化する',
      hint: [
        '初期化済みのSwapを利用開始するコマンドを使います。',
        'swaponコマンドに対象ファイルを指定し、管理者権限で実行します。',
        'sudo swapon /swapfile と入力します。',
      ],
      goal: { type: 'custom', fn: (vfs, shell) => swapActive(vfs, shell) },
    },
  ],
  clearComment: 'Swapが有効になりました。次は、本当に有効化されたか一覧で確認しましょう。',
  explanation: {
    why: 'mkswapはSwapとして使える形式を作るだけで、利用開始までは行いません。swapon /swapfileを実行すると、そのSwap領域が現在稼働中のLinuxに登録され、メモリ不足時に利用できる状態になります。',
    alternatives: 'すべての/etc/fstab登録済みSwapを有効にする場合は swapon -a を使えます。今回は対象を明確にするため、/swapfileを直接指定します。',
    lpic: 'LPIC Level1では、mkswapとswaponの役割を分けて覚えます。「初期化済みだが未有効」という状態を判断できることが重要です。',
  },
};

export const s097 = {
  id: 's097',
  pack: 'swap-file-basics',
  title: 'Swapが有効になったことを確認する',
  difficulty: 'LPIC Level1',
  difficultyLevel: 1,
  category: 'Swap管理',
  requester: { name: '運用リーダー', role: 'インフラ運用チーム', avatar: '🧑‍💼' },
  request: [
    'swaponは実行済みです。',
    '作業報告の前に、/swapfileが有効なSwapとして表示されることを確認してください。',
  ],
  initialEnv: {
    files: [standardFstabFile(), standardSwapFile('600')],
    swapFiles: [standardSwapState({ initialized:true, active:true })],
  },
  steps: [
    {
      id: 'verify-swapon-show',
      label: '有効なSwap一覧に/swapfileが表示されることを確認する',
      hint: [
        '現在有効なSwap領域だけを一覧表示します。',
        'swaponに--showオプションを付けます。この確認操作にはsudoは不要です。',
        'swapon --show と入力し、NAME列に/swapfileが表示されることを確認します。',
      ],
      goal: {
        type: 'custom',
        fn: (vfs, shell, ctx) => swapActive(vfs, shell) && commandWasRun(ctx, 'swapon', /swapon\s+--show(?:\s|$)/),
      },
    },
  ],
  clearComment: '有効なSwap一覧に/swapfileが表示されました。これで現在のOSへの有効化を確認できました。',
  explanation: {
    why: 'swapon --showは、現在カーネルが利用可能な状態として認識しているSwap領域を一覧表示します。コマンドがエラーなく終了しただけでなく、確認コマンドで結果を確かめるのが運用作業の基本です。',
    alternatives: 'cat /proc/swapsでも、同じように有効なSwap領域を確認できます。',
    lpic: 'LPIC Level1では、設定変更コマンドと確認コマンドを組み合わせる考え方が重要です。swapon /swapfileで有効化し、swapon --showで確認します。',
  },
};

export const s098 = {
  id: 's098',
  pack: 'swap-file-basics',
  title: 'swapon --showとfree -hを使い分ける',
  difficulty: 'LPIC Level1',
  difficultyLevel: 1,
  category: 'Swap管理',
  requester: { name: '新人教育担当', role: 'インフラ研修', avatar: '👩‍🏫' },
  request: [
    'Swapの設定結果を2つの観点で確認してください。',
    '有効なSwapの名前と、物理メモリを含む容量・使用量の両方を報告してください。',
  ],
  initialEnv: {
    files: [standardFstabFile(), standardSwapFile('600')],
    swapFiles: [standardSwapState({ initialized:true, active:true })],
  },
  steps: [
    {
      id: 'show-swap-name',
      label: '有効なSwap領域の名前・種類・容量を確認する',
      hint: ['Swap領域そのものの一覧を表示します。', 'swapon --showを使います。', 'swapon --show と入力します。'],
      goal: { type: 'custom', fn: (vfs, shell, ctx) => commandWasRun(ctx, 'swapon', /swapon\s+--show(?:\s|$)/) },
    },
    {
      id: 'show-memory-usage',
      label: '物理メモリとSwapの総容量・使用量を確認する',
      hint: ['メモリ全体の使用状況を見ます。', 'freeに-hオプションを付けます。', 'free -h と入力します。'],
      goal: { type: 'custom', fn: (vfs, shell, ctx) => commandWasRun(ctx, 'free', /free\s+-[a-zA-Z]*h/) },
    },
  ],
  clearComment: '2つの確認コマンドを正しく使い分けられました。',
  explanation: {
    why: 'swapon --showは「どのSwap領域が有効か」を確認するため、NAME・TYPE・SIZEなどを表示します。free -hは「物理メモリとSwapがどれだけ使われているか」を確認するため、Mem行とSwap行を表示します。同じ確認作業でも、知りたい情報によって使い分けます。',
    alternatives: '有効なSwap一覧は/proc/swaps、メモリの詳細は/proc/meminfoでも確認できますが、日常運用ではswapon --showとfree -hが簡潔です。',
    lpic: 'LPIC Level1では、似たコマンドの役割を区別する問題が出ます。swapon --showはSwapデバイス一覧、free -hはメモリ使用量です。',
  },
};

export const s099 = {
  id: 's099',
  pack: 'swap-file-basics',
  title: '再起動後もSwapを自動で有効化する',
  difficulty: 'LPIC Level1',
  difficultyLevel: 2,
  category: 'Swap管理',
  requester: { name: '運用リーダー', role: 'インフラ運用チーム', avatar: '🧑‍💼' },
  request: [
    '現在は/swapfileが有効ですが、swaponだけでは再起動後に自動復旧しません。',
    '/etc/fstabへ設定を追加し、起動時に自動で有効になるようにしてください。',
  ],
  initialEnv: {
    files: [standardFstabFile(), standardSwapFile('600')],
    swapFiles: [standardSwapState({ initialized:true, active:true })],
  },
  steps: [
    {
      id: 'add-fstab-line',
      label: `/etc/fstabに「${FSTAB_SWAP_LINE}」を追加する`,
      hint: [
        '実際のLinuxでは sudo vi /etc/fstab などでファイルを開き、末尾へ1行追加します。',
        'このプレイグラウンドでは、echoの出力をsudo tee -aへパイプするとroot所有のファイルへ追記できます。',
        `echo "${FSTAB_SWAP_LINE}" | sudo tee -a /etc/fstab と入力します。`,
      ],
      goal: { type: 'custom', fn: (vfs) => fstabContainsSwap(vfs) },
    },
    {
      id: 'check-fstab',
      label: '/etc/fstabに設定が保存されたことを確認する',
      hint: ['ファイルの内容を表示するコマンドを使います。', 'cat /etc/fstabで確認できます。', 'cat /etc/fstab と入力します。'],
      goal: { type: 'custom', fn: (vfs, shell, ctx) => fstabContainsSwap(vfs) && commandWasRun(ctx, 'cat', /cat\s+\/etc\/fstab/) },
    },
  ],
  clearComment: '永続化設定が完了しました。次回起動時は/etc/fstabの記述をもとにSwapが自動で有効化されます。',
  explanation: {
    why: 'swapon /swapfileで有効になるのは、現在稼働中のOSに対してだけです。/etc/fstabへ「/swapfile none swap sw 0 0」を追加すると、OS起動時にこの行が読み込まれ、Swapが自動で有効になります。',
    alternatives: '実務では sudo vi /etc/fstab や sudo nano /etc/fstabで編集する方法が一般的です。この学習環境では、echoとsudo tee -aを使って同じ1行を安全に追記します。編集後は設定ミスを避けるため、catやgrepで内容を確認します。',
    lpic: 'LPIC Level1では、/etc/fstabが起動時のマウントやSwap有効化を定義する設定ファイルであること、各フィールドの意味を理解することが重要です。',
  },
};

const ORDER_PATTERNS = [
  /^(?:sudo\s+)?fallocate\s+-l\s+2G\s+\/swapfile\s*$/,
  /^(?:sudo\s+)?chmod\s+600\s+\/swapfile\s*$/,
  /^(?:sudo\s+)?mkswap\s+\/swapfile\s*$/,
  /^(?:sudo\s+)?swapon\s+\/swapfile\s*$/,
];

export const s100 = {
  id: 's100',
  pack: 'swap-file-basics',
  title: '本番前演習：Swap作成を最初から完了する',
  difficulty: 'LPIC Level1',
  difficultyLevel: 2,
  category: 'Swap管理',
  requester: { name: '運用リーダー', role: 'インフラ運用チーム', avatar: '🧑‍💼' },
  request: [
    '検証用サーバーに2GBのSwapを追加してください。',
    '作成・権限設定・初期化・有効化・確認・自動有効化まで、正しい順番で一通りお願いします。',
  ],
  initialEnv: { files: [standardFstabFile()], swapFiles: [] },
  steps: [
    {
      id: 'full-create',
      label: '2GBの/swapfileを作成する',
      hint: ['最初は容量を確保します。', '-l 2Gで容量、/swapfileで保存場所を指定します。', 'sudo fallocate -l 2G /swapfile'],
      goal: { type: 'custom', fn: (vfs, shell) => swapAllocated(vfs, shell, '/swapfile', TWO_GIB) },
    },
    {
      id: 'full-permission',
      label: '/swapfileをrootだけが読み書きできる権限にする',
      hint: ['Swapファイルは一般ユーザーから保護します。', '数値モード600を指定します。', 'sudo chmod 600 /swapfile'],
      goal: { type: 'octal', path: '/swapfile', value: '600' },
    },
    {
      id: 'full-initialize',
      label: '/swapfileをSwap形式に初期化する',
      hint: ['通常ファイルのままではSwapとして使えません。', 'mkswapを使います。', 'sudo mkswap /swapfile'],
      goal: { type: 'custom', fn: (vfs, shell) => swapInitialized(vfs, shell) },
    },
    {
      id: 'full-enable',
      label: '/swapfileを現在のOSで有効化する',
      hint: ['初期化後に利用開始する操作が必要です。', 'swaponに対象ファイルを指定します。', 'sudo swapon /swapfile'],
      goal: { type: 'custom', fn: (vfs, shell) => swapActive(vfs, shell) },
    },
    {
      id: 'full-check-swap',
      label: 'swapon --showで有効なSwapを確認する',
      hint: ['有効化後は結果を確認します。', 'swaponの一覧表示オプションを使います。', 'swapon --show'],
      goal: { type: 'custom', fn: (vfs, shell, ctx) => swapActive(vfs, shell) && commandWasRun(ctx, 'swapon', /swapon\s+--show(?:\s|$)/) },
    },
    {
      id: 'full-check-memory',
      label: 'free -hでメモリとSwapの使用量を確認する',
      hint: ['物理メモリとSwapをまとめて見ます。', '読みやすい単位にする-hを付けます。', 'free -h'],
      goal: { type: 'custom', fn: (vfs, shell, ctx) => commandWasRun(ctx, 'free', /free\s+-[a-zA-Z]*h/) },
    },
    {
      id: 'full-fstab',
      label: `/etc/fstabへ「${FSTAB_SWAP_LINE}」を追加する`,
      hint: [
        '再起動後も自動で有効にするには/etc/fstabへ記述します。',
        '実環境ではsudo vi /etc/fstabで編集します。このプレイグラウンドではsudo tee -aを使います。',
        `echo "${FSTAB_SWAP_LINE}" | sudo tee -a /etc/fstab`,
      ],
      goal: { type: 'custom', fn: (vfs) => fstabContainsSwap(vfs) },
    },
    {
      id: 'full-order',
      label: '作成→権限設定→初期化→有効化の順番で実行する',
      hint: [
        'ファイルがなければchmodやmkswapはできません。mkswap前に権限を安全にし、mkswap後にswaponします。',
        '順番を間違えた場合は、画面のリセットを押して最初からやり直します。',
        'fallocate → chmod → mkswap → swapon の順番です。',
      ],
      goal: { type: 'custom', fn: (vfs, shell, ctx) => commandsWereRunInOrder(ctx, ORDER_PATTERNS) },
    },
  ],
  clearComment: '全手順を正しい順番で完了できました。作成・安全化・初期化・有効化・確認・永続化の流れを現場でも使えます。',
  explanation: {
    why: 'Swapファイル作成の基本順序は、①fallocateで容量を確保、②chmod 600で保護、③mkswapでSwap形式へ初期化、④swaponで現在のOSに有効化、⑤swapon --showとfree -hで確認、⑥/etc/fstabへ記述して再起動後も自動有効化、です。各コマンドは前段階で作られた状態を前提にしています。',
    alternatives: '管理者権限はsudoを各コマンドへ付ける方法のほか、suでrootへ切り替えて作業する方法もあります。/etc/fstabの編集にはviやnanoを使えます。このプレイグラウンドではteeによる追記にも対応しています。',
    lpic: 'LPIC Level1では、単独のコマンド名だけでなく、Swapを利用可能にするまでの順番、swapon --showとfree -hの違い、/etc/fstabによる永続化が問われます。',
  },
};
