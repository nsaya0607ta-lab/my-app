/**
 * --dry-run 用のサンプルレポート。
 *
 * Gemini が returnするのと同じ形の JSON をそのまま持つ。デザイン調整のときに
 * API を叩かずレイアウトだけを確認できるよう、表・枠・コード・比較表など
 * すべてのブロック種別を1つ以上含めている。
 */
export const SAMPLE_REPORT = {
  dateLabel: '2026-07-24',
  certCode: 'LPIC-1',
  report: {
    title: '2026-07-24 LPIC-1 学習レポート',
    summary:
      '昨日は演習を3回、合計72問に取り組み、正答率は[[b:68%]]でした。特に[[r:ファイル検索とパーミッション]]の分野で取りこぼしが目立ちます。今日はそこを重点的に固めましょう。',
    flow: [
      '誤答の確認',
      'find と grep の違いを整理',
      'パーミッションの計算練習',
      '実機で操作',
      '試験直前チェック',
    ],
    sections: [
      {
        heading: '1. 昨日つまずいた問題の振り返り',
        blocks: [
          {
            type: 'paragraph',
            text: '復習リストに残っているのは主に[[r:find]]と[[r:chmod]]の2系統です。どちらも「オプションの意味を取り違える」ことが原因になっています。',
          },
          {
            type: 'subheading',
            text: 'find の -name と -iname',
          },
          {
            type: 'paragraph',
            text: '[[c:-name]]は大文字・小文字を区別しますが、[[c:-iname]]は区別しません。[[b:試験では「大文字小文字を無視して検索」という表現が出たら -iname が正解です。]]',
          },
          {
            type: 'code',
            lines: [
              '$ find /var/log -iname "*.LOG"',
              '/var/log/boot.log',
              '/var/log/dnf.log',
            ],
          },
          {
            type: 'callout',
            variant: 'caution',
            title: '注意点',
            text: '[[c:-name]]のパターンは必ずクォートで囲むこと。囲まないとシェルが先に展開してしまい、意図しない結果になります。',
          },
        ],
      },
      {
        heading: '2. コマンドの比較で整理する',
        blocks: [
          {
            type: 'paragraph',
            text: '似た用途のコマンドは、[[b:「何を探すか」]]で覚えると混乱しません。',
          },
          {
            type: 'table',
            columns: ['コマンド', '探す対象', '代表的なオプション'],
            rows: [
              { cells: ['find', 'ファイル名・属性', '-name / -type / -mtime'] },
              { cells: ['grep', 'ファイルの中身', '-i / -r / -n'] },
              { cells: ['locate', '事前作成のDB', '-i / -n'] },
              { cells: ['which', 'PATH上の実行ファイル', '-a'] },
            ],
          },
          {
            type: 'callout',
            variant: 'important',
            title: '重要ポイント',
            text: '[[r:locate]]はデータベースを参照するため高速ですが、[[b:updatedb を実行するまで新しいファイルは見つかりません。]]',
          },
        ],
      },
      {
        heading: '3. パーミッションを計算できるようにする',
        blocks: [
          {
            type: 'paragraph',
            text: '数値表記は[[r:読み4・書き2・実行1]]の足し算です。所有者・グループ・その他の順に3桁で表します。',
          },
          {
            type: 'list',
            items: [
              '[[c:755]] → rwxr-xr-x（所有者は全権、他は読み+実行）',
              '[[c:644]] → rw-r--r--（所有者は読み書き、他は読みのみ）',
              '[[c:600]] → rw-------（所有者のみ読み書き）',
            ],
          },
          {
            type: 'code',
            lines: [
              '$ chmod 644 report.txt',
              '$ ls -l report.txt',
              '-rw-r--r-- 1 user user 1024 Jul 24 09:12 report.txt',
            ],
          },
          {
            type: 'callout',
            variant: 'question',
            title: '疑問点',
            text: 'ディレクトリに対する[[c:x]]は「中に入れる権限」です。読めるのに cd できない場合は、ここを疑ってください。',
          },
        ],
      },
    ],
    commands: [
      { command: 'find', summary: '条件を指定してファイルを検索する。[[r:-type f]]で通常ファイルのみに絞る。' },
      { command: 'grep', summary: 'ファイルの[[b:中身]]を検索する。[[r:-r]]で再帰、[[r:-n]]で行番号。' },
      { command: 'chmod', summary: 'パーミッションを変更する。数値表記と記号表記の両方が問われる。' },
      { command: 'chown', summary: '所有者を変更する。[[c:chown user:group file]]の形を覚える。' },
      { command: 'umask', summary: '新規作成時の既定パーミッションを決める[[b:マスク値]]。' },
    ],
    confusions: [
      {
        topic: '大文字小文字の区別',
        left: 'find -name',
        right: 'find -iname',
        note: '-name は区別する。「無視して検索」と書かれていたら -iname。',
      },
      {
        topic: '再帰の指定',
        left: 'grep -r',
        right: 'grep -R',
        note: '-R はシンボリックリンクも辿る。-r は辿らない。',
      },
      {
        topic: 'コピー時の属性',
        left: 'cp file',
        right: 'cp -p file',
        note: '-p が無いとタイムスタンプと権限が引き継がれない。',
      },
      {
        topic: '所有者とグループ',
        left: 'chown user file',
        right: 'chown user:group file',
        note: 'コロン以降を省くとグループは変わらない。',
      },
    ],
    workflow: [
      {
        step: 'ログの中からエラー行を探す',
        command: 'grep -rn "error" /var/log/ 2>/dev/null',
        note: '権限エラーの出力は 2>/dev/null で捨てる。',
      },
      {
        step: '直近1日で更新されたファイルを洗い出す',
        command: 'find /etc -type f -mtime -1',
        note: '-mtime -1 は「24時間以内」。',
      },
      {
        step: '設定ファイルの権限を安全側に直す',
        command: 'chmod 600 /etc/myapp/secret.conf',
        note: '所有者以外から読めないようにする。',
      },
      {
        step: '所有者をサービス用ユーザーへ変更する',
        command: 'chown myapp:myapp /etc/myapp/secret.conf',
      },
    ],
    examCheck: [
      '-name と -iname の違いを説明できる',
      '755 と 644 を rwx 表記へ即座に変換できる',
      'grep の -r / -n / -i の意味を言える',
      'locate が updatedb に依存することを覚えている',
      'chown のコロン記法でグループまで変更できる',
      'ディレクトリの x が「入る権限」であると理解している',
    ],
  },
};
