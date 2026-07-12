/* =========================================================================
   カテゴリ: ファイル内容操作
   対象コマンド: cat, less, head, tail, echo, nano
   ========================================================================= */
import { USER } from '../../constants.js';
import {
  all, argIncludes, contentIs, isDir, isFile, nFlagIs, overwriteRedirectUsed,
  pwdEndsWith, redirectedTo, usesCmd,
} from '../helpers.js';

const HOME = `/home/${USER}`;
const NOTES = `${HOME}/notes`;

export const fileContentMissions = [
  {
    id: "file-content-01", category: "file-content", level: "beginner",
    title: "notes という名前のディレクトリを作成してください。",
    hint: "mkdir notes",
    answer: "mkdir notes",
    explanation: "このカテゴリの作業場所として notes ディレクトリを使います。",
    check: isDir(NOTES),
  },
  {
    id: "file-content-02", category: "file-content", level: "beginner",
    title: "notes ディレクトリへ移動してください。",
    hint: "cd notes",
    answer: "cd notes",
    explanation: "以降のミッションは notes ディレクトリの中で進めます。",
    check: pwdEndsWith("notes"),
  },
  {
    id: "file-content-03", category: "file-content", level: "beginner",
    title: "echo を使って「Hello Linux」という内容の welcome.txt を作成してください。",
    hint: "echo \"文字列\" > ファイル名 で、指定した内容のファイルを新規作成できます。",
    answer: 'echo "Hello Linux" > welcome.txt',
    explanation: "echo は本来、文字列を標準出力へ表示するコマンドですが、> でリダイレクトすることでファイルへの書き込みに使えます。",
    check: all(usesCmd("echo"), overwriteRedirectUsed, redirectedTo(`${NOTES}/welcome.txt`), contentIs(`${NOTES}/welcome.txt`, "Hello Linux\n")),
  },
  {
    id: "file-content-04", category: "file-content", level: "beginner",
    title: "cat で welcome.txt の中身を表示してください。",
    hint: "cat ファイル名 でファイルの内容をそのまま表示できます。",
    answer: "cat welcome.txt",
    explanation: "cat（concatenate）はファイルの内容を標準出力へそのまま出力します。複数ファイルを並べると連結して表示されます。",
    check: all(usesCmd("cat"), argIncludes("cat", "welcome.txt")),
  },
  {
    id: "file-content-05", category: "file-content", level: "beginner",
    title: "welcome.txt に「second line」という行を追記してください（上書きしないこと）。",
    hint: ">> を使うと、既存の内容を消さずに末尾へ追記できます。",
    answer: 'echo "second line" >> welcome.txt',
    explanation: "> は上書き、>> は追記です。間違えて > を使うと元の内容が消えてしまうので注意しましょう。",
    check: all(usesCmd("echo"), (ctx) => { const last = ctx.pipeline[ctx.pipeline.length-1]; return !!last && last.redirect === "welcome.txt" && last.append; }, contentIs(`${NOTES}/welcome.txt`, "Hello Linux\nsecond line\n")),
  },
  {
    id: "file-content-06", category: "file-content", level: "beginner",
    title: "head -n 1 で welcome.txt の先頭1行だけを表示してください。",
    hint: "head -n 数字 ファイル名 で、先頭から指定した行数だけ表示できます。",
    answer: "head -n 1 welcome.txt",
    explanation: "head は既定では先頭10行を表示しますが、-n で行数を指定できます。",
    check: all(usesCmd("head"), nFlagIs("head", 1), argIncludes("head", "welcome.txt")),
  },
  {
    id: "file-content-07", category: "file-content", level: "beginner",
    title: "tail -n 1 で welcome.txt の末尾1行だけを表示してください。",
    hint: "tail は head と逆で、末尾から指定した行数を表示します。",
    answer: "tail -n 1 welcome.txt",
    explanation: "tail も -n で行数を指定でき、ログファイルの最新部分だけを確認するときによく使われます。",
    check: all(usesCmd("tail"), nFlagIs("tail", 1), argIncludes("tail", "welcome.txt")),
  },
  {
    id: "file-content-08", category: "file-content", level: "intermediate",
    title: "システムの /etc/passwd の中身を cat で表示してください。",
    hint: "/etc/passwd はユーザー情報が書かれた設定ファイルで、一般ユーザーでも読み取れます。",
    answer: "cat /etc/passwd",
    explanation: "/etc/passwd はすべてのユーザーが読み取れるように権限（rw-r--r--）が設定されているシステムファイルの代表例です。",
    check: all(usesCmd("cat"), argIncludes("cat", "/etc/passwd")),
  },
  {
    id: "file-content-09", category: "file-content", level: "intermediate",
    title: "head で /etc/passwd を表示してください。",
    hint: "head /etc/passwd （行数指定は省略可）",
    answer: "head /etc/passwd",
    explanation: "行数を指定しない場合、head は既定の10行まで表示します。ファイルの行数がそれより少なければ、あるだけ表示されます。",
    check: all(usesCmd("head"), argIncludes("head", "/etc/passwd")),
  },
  {
    id: "file-content-10", category: "file-content", level: "intermediate",
    title: "tail で /etc/passwd を表示してください。",
    hint: "tail /etc/passwd （行数指定は省略可）",
    answer: "tail /etc/passwd",
    explanation: "tail も head と同様、指定がなければ既定10行（無ければあるだけ）を表示します。",
    check: all(usesCmd("tail"), argIncludes("tail", "/etc/passwd")),
  },
  {
    id: "file-content-11", category: "file-content", level: "intermediate",
    title: "nano で diary.txt を開き、何行か好きな文章を書いて保存・終了してください。",
    hint: "nano ファイル名 でエディタが開きます。文字を入力したら Ctrl+O で保存、Ctrl+X で終了します。",
    answer: "nano diary.txt",
    explanation: "nano はターミナル上で使えるシンプルなテキストエディタです。echo と違い、複数行の文章を自由に書けます。",
    check: all(usesCmd("nano"), isFile(`${NOTES}/diary.txt`), (ctx) => ctx.vfs.readFile(`${NOTES}/diary.txt`).content.trim().length > 0),
  },
  {
    id: "file-content-12", category: "file-content", level: "beginner",
    title: "less で diary.txt の内容をページ表示してください（q で閉じられます）。",
    hint: "less ファイル名 で、スクロールしながら内容を閲覧できます。",
    answer: "less diary.txt",
    explanation: "less は cat と違い、長いファイルをスクロールしながら閲覧するのに向いています。q キーで閲覧を終了します。",
    check: all(usesCmd("less"), argIncludes("less", "diary.txt")),
  },
  {
    id: "file-content-13", category: "file-content", level: "intermediate",
    title: "cat で welcome.txt と diary.txt を、一度のコマンドで連結して表示してください。",
    hint: "cat には複数のファイル名を並べて指定できます。",
    answer: "cat welcome.txt diary.txt",
    explanation: "cat に複数のファイルを渡すと、指定した順番でそのまま連結して出力します。",
    check: all(usesCmd("cat"), argIncludes("cat", "welcome.txt"), argIncludes("cat", "diary.txt")),
  },
  {
    id: "file-content-14", category: "file-content", level: "intermediate",
    title: "head -n 5 で /etc/passwd を表示してください（実際の行数が5行未満でも試してみましょう）。",
    hint: "head -n 5 ファイル名",
    answer: "head -n 5 /etc/passwd",
    explanation: "指定した行数よりファイルの行数が少ない場合、head はエラーにはならず、あるだけの行を表示します。",
    check: all(usesCmd("head"), nFlagIs("head", 5), argIncludes("head", "/etc/passwd")),
  },
];
