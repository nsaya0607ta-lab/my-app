/* =========================================================================
   manPages — `man <cmd>` 用の簡易マニュアルデータ。
   実際のman(1)ページを模した最小限のNAME/SYNOPSIS/DESCRIPTION/OPTIONSのみ。
   ========================================================================= */

export const MAN_PAGES = {
  pwd:    { synopsis:"pwd", desc:"現在の作業ディレクトリの絶対パスを表示する。" },
  ls:     { synopsis:"ls [-alh] [FILE...]", desc:"ディレクトリの内容を一覧表示する。", options:[
    ["-a","「.」で始まる隠しファイルも含めてすべて表示する"],
    ["-l","パーミッション・所有者・サイズ・更新日時などを含む詳細形式で表示する"],
    ["-h","-l と併用し、サイズを人間が読みやすい単位（K/M/G）で表示する"],
  ]},
  cd:     { synopsis:"cd [DIR]", desc:"作業ディレクトリを変更する。引数を省略するとホームディレクトリへ移動する。" },
  mkdir:  { synopsis:"mkdir [-p] DIR...", desc:"新しいディレクトリを作成する。", options:[["-p","必要な親ディレクトリもまとめて作成する"]] },
  rmdir:  { synopsis:"rmdir DIR...", desc:"空のディレクトリを削除する。中身が残っている場合は削除できない。" },
  touch:  { synopsis:"touch FILE...", desc:"空のファイルを作成する。既に存在する場合はタイムスタンプ（更新日時）だけを更新する。" },
  cp:     { synopsis:"cp [-r] SRC DEST", desc:"ファイルやディレクトリをコピーする。", options:[["-r","ディレクトリを再帰的にコピーする"]] },
  mv:     { synopsis:"mv SRC DEST", desc:"ファイルやディレクトリを移動、またはリネームする。" },
  rm:     { synopsis:"rm [-rf] FILE...", desc:"ファイルやディレクトリを削除する。", options:[
    ["-r","ディレクトリを再帰的に削除する"], ["-f","確認なしで削除し、存在しないファイルでもエラーにしない"],
  ]},
  cat:    { synopsis:"cat FILE...", desc:"ファイルの内容を標準出力へ連結して表示する。" },
  less:   { synopsis:"less FILE", desc:"ファイルの内容をページ単位で閲覧する。qで終了する。" },
  head:   { synopsis:"head [-n N] FILE", desc:"ファイルの先頭部分を表示する。既定は10行。", options:[["-n N","先頭N行を表示する"]] },
  tail:   { synopsis:"tail [-n N] FILE", desc:"ファイルの末尾部分を表示する。既定は10行。", options:[["-n N","末尾N行を表示する"]] },
  echo:   { synopsis:"echo [TEXT...]", desc:"引数の文字列を標準出力へ表示する。`>` でファイルへのリダイレクトができる。" },
  nano:   { synopsis:"nano FILE", desc:"シンプルなテキストエディタ。Ctrl+Oで保存、Ctrl+Xで終了する（簡易版）。" },
  find:   { synopsis:"find [PATH] [-name PAT] [-type f|d]", desc:"条件を指定してファイル・ディレクトリを検索する。", options:[
    ["-name PAT","ファイル名がPATに一致するものを検索する（*, ? のワイルドカードが使える）"],
    ["-type f|d","種類（f=ファイル, d=ディレクトリ）で絞り込む"],
  ]},
  locate: { synopsis:"locate PATTERN", desc:"ファイル名データベースからPATTERNを含むパスを検索する。" },
  which:  { synopsis:"which CMD", desc:"CMDが実行されたときに使われる実行ファイルのパスをPATHから探して表示する。" },
  whereis:{ synopsis:"whereis CMD", desc:"コマンドの実行ファイル・マニュアルの場所を表示する。" },
  grep:   { synopsis:"grep [-invc] PATTERN [FILE]", desc:"PATTERNにマッチする行を検索して表示する。", options:[
    ["-i","大文字・小文字を区別しない"], ["-v","マッチしなかった行を表示する"],
    ["-n","行番号を付けて表示する"], ["-c","マッチした行数のみを表示する"],
  ]},
  sort:   { synopsis:"sort [-rnu] [FILE]", desc:"行を並べ替えて表示する。", options:[
    ["-r","逆順に並べ替える"], ["-n","数値として並べ替える"], ["-u","重複行を1つにまとめる"],
  ]},
  uniq:   { synopsis:"uniq [-c] [FILE]", desc:"連続する重複行を1つにまとめる。", options:[["-c","各行の出現回数を先頭に表示する"]] },
  wc:     { synopsis:"wc [-lwc] [FILE]", desc:"行数・単語数・バイト数を数える。", options:[
    ["-l","行数のみを表示する"], ["-w","単語数のみを表示する"], ["-c","バイト数のみを表示する"],
  ]},
  cut:    { synopsis:"cut -d DELIM -f N[,N...] [FILE]", desc:"各行から指定した区切り文字のフィールドを取り出す。" },
  tr:     { synopsis:"tr [-ds] SET1 [SET2]", desc:"標準入力の文字をSET1からSET2へ変換する。", options:[
    ["-d","SET1に含まれる文字を削除する"], ["-s","連続して繰り返される同一文字を1文字に圧縮する"],
  ]},
  chmod:  { synopsis:"chmod MODE FILE...", desc:"ファイルのアクセス権を変更する。8進数（755など）またはシンボリック（u+x など）で指定する。" },
  chown:  { synopsis:"chown OWNER[:GROUP] FILE...", desc:"ファイルの所有者・所属グループを変更する（本環境では表示上の変更のみ）。" },
  ln:     { synopsis:"ln [-s] TARGET LINK", desc:"リンクを作成する。既定はハードリンク、-sでシンボリックリンクを作成する。" },
  df:     { synopsis:"df [-h]", desc:"マウントされているファイルシステムのディスク使用量を表示する。", options:[["-h","人間が読みやすい単位で表示する"]] },
  du:     { synopsis:"du [-sh] [PATH]", desc:"ファイル・ディレクトリの使用容量を再帰的に集計する。", options:[
    ["-s","ディレクトリごとの合計のみを表示する"], ["-h","人間が読みやすい単位で表示する"],
  ]},
  free:   { synopsis:"free [-h]", desc:"物理メモリとスワップの使用状況を表示する。", options:[["-h","人間が読みやすい単位で表示する"]] },
  ps:     { synopsis:"ps [aux|-ef]", desc:"実行中のプロセスを一覧表示する。", options:[["aux","全ユーザーの全プロセスをBSD形式で表示する"]] },
  top:    { synopsis:"top", desc:"CPU・メモリ使用率などをリアルタイムに表示するプロセス監視コマンド（本環境では1回分のスナップショットのみ表示する簡易版）。" },
  kill:   { synopsis:"kill [-9] PID", desc:"指定したPIDのプロセスにシグナルを送る。既定はSIGTERM(15)。" },
  killall:{ synopsis:"killall [-9] NAME", desc:"プロセス名を指定して該当する全プロセスにシグナルを送る。" },
  hostname:{ synopsis:"hostname", desc:"システムのホスト名を表示する。" },
  whoami: { synopsis:"whoami", desc:"現在ログインしているユーザー名を表示する。" },
  id:     { synopsis:"id", desc:"現在のユーザーのUID・GID・所属グループを表示する。" },
  uname:  { synopsis:"uname [-a]", desc:"システム情報を表示する。", options:[["-a","カーネル名・ホスト名・バージョンなどすべての情報を表示する"]] },
  date:   { synopsis:"date", desc:"現在の日付と時刻を表示する。" },
  cal:    { synopsis:"cal", desc:"今月のカレンダーを表示する。" },
  history:{ synopsis:"history", desc:"これまでに入力したコマンドの履歴を表示する。" },
  clear:  { synopsis:"clear", desc:"ターミナル画面をクリアする。" },
  man:    { synopsis:"man CMD", desc:"CMDのマニュアルページを表示する。" },
  help:   { synopsis:"help", desc:"対応コマンドの一覧を表示する。" },
  env:    { synopsis:"env", desc:"現在設定されている環境変数を一覧表示する。" },
  export: { synopsis:"export NAME=VALUE", desc:"シェル変数を環境変数として設定する。引数なしで実行すると設定済みの一覧を表示する。" },
  alias:  { synopsis:"alias [NAME=VALUE]", desc:"コマンドの別名（エイリアス）を設定する。引数なしで実行すると設定済みの一覧を表示する。" },
  unalias:{ synopsis:"unalias NAME", desc:"設定済みのエイリアスを削除する。" },
};
