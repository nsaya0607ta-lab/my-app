/* =========================================================================
   カテゴリ: テキスト加工
   対象コマンド: sort, uniq, wc, cut, tr
   ========================================================================= */
import { USER } from '../../constants.js';
import {
  all, argIncludes, contentIs, cutSpecIs, flagUsed, hasPipe, isDir, isFile,
  overwriteRedirectUsed, pwdEndsWith, redirectedTo, usesCmd, usesCmds,
} from '../helpers.js';

const HOME = `/home/${USER}`;
const LAB = `${HOME}/textlab`;

export const textMissions = [
  {
    id: "text-01", category: "text", level: "beginner",
    title: "textlab という名前のディレクトリを作成してください。",
    hint: "mkdir textlab",
    answer: "mkdir textlab",
    explanation: "このカテゴリの作業場所として textlab ディレクトリを使います。",
    check: isDir(LAB),
  },
  {
    id: "text-02", category: "text", level: "beginner",
    title: "textlab ディレクトリへ移動してください。",
    hint: "cd textlab",
    answer: "cd textlab",
    explanation: "以降のミッションは textlab ディレクトリの中で進めます。",
    check: pwdEndsWith("textlab"),
  },
  {
    id: "text-03", category: "text", level: "intermediate",
    title: "nano で fruits.txt を開き、banana・apple・banana・cherry のように、重複を含む果物の名前を1行ずつ書いて保存してください。",
    hint: "nano fruits.txt でエディタを開き、Enterキーで改行しながら複数行入力できます。",
    answer: "nano fruits.txt",
    explanation: "echo は1回につき1行しか書き込めませんが、nano なら複数行の文章を自由に作成できます。sort/uniq の練習用に、重複行を含む簡単なリストを作りましょう。",
    check: all(usesCmd("nano"), isFile(`${LAB}/fruits.txt`), (ctx) => ctx.vfs.readFile(`${LAB}/fruits.txt`).content.trim().length > 0),
  },
  {
    id: "text-04", category: "text", level: "beginner",
    title: "sort で fruits.txt の内容をアルファベット順に並べ替えて表示してください。",
    hint: "sort ファイル名",
    answer: "sort fruits.txt",
    explanation: "sort は行を辞書順（既定では文字コード順）に並べ替えて表示します。元のファイルは変更されません。",
    check: all(usesCmd("sort"), argIncludes("sort", "fruits.txt")),
  },
  {
    id: "text-05", category: "text", level: "intermediate",
    title: "sort -r で fruits.txt を逆順に並べ替えて表示してください。",
    hint: "-r オプション（reverse）を付けます。",
    answer: "sort -r fruits.txt",
    explanation: "-r を付けると並び順が逆転します。",
    check: all(usesCmd("sort"), flagUsed("sort", "r"), argIncludes("sort", "fruits.txt")),
  },
  {
    id: "text-06", category: "text", level: "intermediate",
    title: "sort と uniq をパイプでつないで、fruits.txt から重複行を取り除いて表示してください。",
    hint: "uniq は「連続する」重複行しかまとめられないため、先に sort で同じ行を隣り合わせにする必要があります。",
    answer: "sort fruits.txt | uniq",
    explanation: "uniq は隣り合う同じ行だけをまとめる仕組みなので、ソートされていないデータには sort と組み合わせて使うのが定石です。",
    check: all(hasPipe, usesCmds("sort", "uniq")),
  },
  {
    id: "text-07", category: "text", level: "intermediate",
    title: "sort | uniq -c で、それぞれの果物が何回登場したかを数えて表示してください。",
    hint: "uniq -c を付けると、各行の先頭に出現回数が表示されます。",
    answer: "sort fruits.txt | uniq -c",
    explanation: "-c（count）オプションを付けることで、集計コマンドのように使えます。",
    check: all(hasPipe, usesCmds("sort", "uniq"), flagUsed("uniq", "c")),
  },
  {
    id: "text-08", category: "text", level: "beginner",
    title: "wc -l で fruits.txt の行数を数えてください。",
    hint: "-l オプション（lines）を付けます。",
    answer: "wc -l fruits.txt",
    explanation: "wc（word count）は既定で行数・単語数・バイト数の3つを表示しますが、-l を付けると行数だけになります。",
    check: all(usesCmd("wc"), flagUsed("wc", "l"), argIncludes("wc", "fruits.txt")),
  },
  {
    id: "text-09", category: "text", level: "beginner",
    title: "wc -w で fruits.txt の単語数を数えてください。",
    hint: "-w オプション（words）を付けます。",
    answer: "wc -w fruits.txt",
    explanation: "-w を付けると単語数（空白区切りの個数）だけを表示します。",
    check: all(usesCmd("wc"), flagUsed("wc", "w"), argIncludes("wc", "fruits.txt")),
  },
  {
    id: "text-10", category: "text", level: "intermediate",
    title: "echo で fields.txt に「root:x:0:0:root:/root:/bin/bash」という/etc/passwd風の1行を書き込んでください。",
    hint: 'echo "root:x:0:0:root:/root:/bin/bash" > fields.txt',
    answer: 'echo "root:x:0:0:root:/root:/bin/bash" > fields.txt',
    explanation: "cut の練習用に、コロン区切りのデータを用意します。",
    check: all(usesCmd("echo"), overwriteRedirectUsed, redirectedTo(`${LAB}/fields.txt`), contentIs(`${LAB}/fields.txt`, "root:x:0:0:root:/root:/bin/bash\n")),
  },
  {
    id: "text-11", category: "text", level: "intermediate",
    title: "cut で fields.txt から「:」区切りの1番目のフィールドだけを取り出してください。",
    hint: "cut -d 区切り文字 -f 番号 ファイル名",
    answer: "cut -d: -f1 fields.txt",
    explanation: "-d でフィールドの区切り文字を、-f で取り出したいフィールドの番号を指定します。",
    check: all(usesCmd("cut"), cutSpecIs(":", "1"), argIncludes("cut", "fields.txt")),
  },
  {
    id: "text-12", category: "text", level: "intermediate",
    title: "cut で fields.txt から1番目と7番目のフィールドを取り出してください。",
    hint: "-f 1,7 のようにカンマで区切ると、複数のフィールドを取り出せます。",
    answer: "cut -d: -f1,7 fields.txt",
    explanation: "カンマ区切りで複数のフィールド番号を指定できます。",
    check: all(usesCmd("cut"), cutSpecIs(":", "1,7"), argIncludes("cut", "fields.txt")),
  },
  {
    id: "text-13", category: "text", level: "intermediate",
    title: "echo \"hello world\" を tr で大文字に変換してください。",
    hint: "tr は標準入力を必要とするため、パイプ（|）で echo の出力を渡します。",
    answer: 'echo "hello world" | tr a-z A-Z',
    explanation: "tr は SET1 の文字を SET2 の文字へ1文字ずつ変換します。a-z のような範囲指定も使えます。",
    check: all(hasPipe, usesCmds("echo", "tr"), argIncludes("tr", "a-z"), argIncludes("tr", "A-Z")),
  },
  {
    id: "text-14", category: "text", level: "intermediate",
    title: "echo \"hello world\" から tr -d で「l」の文字だけを削除してください。",
    hint: "-d オプション（delete）を付けると、SET1に含まれる文字を削除できます。",
    answer: 'echo "hello world" | tr -d l',
    explanation: "-d を付けると変換ではなく削除になります。SET2は不要です。",
    check: all(hasPipe, usesCmds("echo", "tr"), flagUsed("tr", "d"), argIncludes("tr", "l")),
  },
  {
    id: "text-15", category: "text", level: "intermediate",
    title: "echo \"aabbcc\" から tr -s で連続する同じ文字を1文字に圧縮してください。",
    hint: "-s オプション（squeeze）を付けます。",
    answer: 'echo "aabbcc" | tr -s a-z',
    explanation: "-s を付けると、連続して繰り返された文字が1文字にまとめられます（aabbcc → abc）。",
    check: all(hasPipe, usesCmds("echo", "tr"), flagUsed("tr", "s")),
  },
];
