/* =========================================================================
   カテゴリ: 権限
   対象コマンド: chmod, chown, ln
   ========================================================================= */
import { USER } from '../../constants.js';
import {
  all, flagUsed, groupIs, isDir, isFile, isHardLinkOf, isSymlink, linkTargetIs,
  octalIs, ownerIs, pwdEndsWith, usesCmd,
} from '../helpers.js';

const HOME = `/home/${USER}`;
const LAB = `${HOME}/permlab`;

export const permissionsMissions = [
  {
    id: "permissions-01", category: "permissions", level: "beginner",
    title: "permlab という名前のディレクトリを作成してください。",
    hint: "mkdir permlab",
    answer: "mkdir permlab",
    explanation: "このカテゴリの作業場所として permlab ディレクトリを使います。",
    check: isDir(LAB),
  },
  {
    id: "permissions-02", category: "permissions", level: "beginner",
    title: "permlab ディレクトリへ移動してください。",
    hint: "cd permlab",
    answer: "cd permlab",
    explanation: "以降のミッションは permlab ディレクトリの中で進めます。",
    check: pwdEndsWith("permlab"),
  },
  {
    id: "permissions-03", category: "permissions", level: "beginner",
    title: "script.sh という空ファイルを作成してください。",
    hint: "touch script.sh",
    answer: "touch script.sh",
    explanation: "権限変更の練習用ファイルを用意します。",
    check: isFile(`${LAB}/script.sh`),
  },
  {
    id: "permissions-04", category: "permissions", level: "beginner",
    title: "chmod で script.sh の権限を 755（所有者は読み書き実行、グループとその他は読み取りと実行）にしてください。",
    hint: "chmod 755 ファイル名 のように8進数（数字）で指定できます。",
    answer: "chmod 755 script.sh",
    explanation: "755 は rwxr-xr-x を意味します。所有者(7=rwx)・グループ(5=r-x)・その他(5=r-x)の3桁で指定します。",
    check: all(usesCmd("chmod"), octalIs(`${LAB}/script.sh`, "755")),
  },
  {
    id: "permissions-05", category: "permissions", level: "beginner",
    title: "data.txt という空ファイルを作成してください。",
    hint: "touch data.txt",
    answer: "touch data.txt",
    explanation: "続けて別の権限パターンを練習するための、もう1つのファイルを用意します。",
    check: isFile(`${LAB}/data.txt`),
  },
  {
    id: "permissions-06", category: "permissions", level: "beginner",
    title: "chmod で data.txt の権限を 644（所有者は読み書き、グループとその他は読み取りのみ）にしてください。",
    hint: "chmod 644 data.txt",
    answer: "chmod 644 data.txt",
    explanation: "644 は rw-r--r-- を意味し、一般的な設定ファイルによく使われる権限です。",
    check: all(usesCmd("chmod"), octalIs(`${LAB}/data.txt`, "644")),
  },
  {
    id: "permissions-07", category: "permissions", level: "intermediate",
    title: "chmod のシンボリックモードで、data.txt からその他ユーザーの読み取り権限を外してください。",
    hint: "chmod o-r ファイル名 のように「誰の(u/g/o)」「+か-か」「何の権限(r/w/x)」を組み合わせて指定します。",
    answer: "chmod o-r data.txt",
    explanation: "シンボリックモードでは u（所有者）・g（グループ）・o（その他）に対して +（付与）/-（剥奪）/=（設定）で権限を変更できます。644から o-r で640（rw-r-----）になります。",
    check: all(usesCmd("chmod"), octalIs(`${LAB}/data.txt`, "640")),
  },
  {
    id: "permissions-08", category: "permissions", level: "intermediate",
    title: "chmod で data.txt の所有者とグループに実行権限を追加してください（u+x,g+x）。",
    hint: "カンマで区切ると、複数の指定を1回のコマンドでまとめて行えます。",
    answer: "chmod u+x,g+x data.txt",
    explanation: "カンマ区切りで複数の変更を同時に適用できます。640 に u+x,g+x を適用すると750（rwxr-x---）になります。",
    check: all(usesCmd("chmod"), octalIs(`${LAB}/data.txt`, "750")),
  },
  {
    id: "permissions-09", category: "permissions", level: "intermediate",
    title: "chmod -R で、現在のディレクトリ（permlab）以下すべての権限を 700 にしてください。",
    hint: "-R オプション（recursive）を付けると、ディレクトリの中身にもまとめて適用されます。",
    answer: "chmod -R 700 .",
    explanation: "-R を付けると、指定したディレクトリ自身だけでなく、その中のファイル・サブディレクトリすべてに再帰的に同じ変更が適用されます。",
    check: all(usesCmd("chmod"), flagUsed("chmod", "R"), octalIs(LAB, "700"), octalIs(`${LAB}/script.sh`, "700"), octalIs(`${LAB}/data.txt`, "700")),
  },
  {
    id: "permissions-10", category: "permissions", level: "intermediate",
    title: "chown で data.txt の所有者を root に変更してください。",
    hint: "chown 新しい所有者 ファイル名",
    answer: "chown root data.txt",
    explanation: "chown（change owner）はファイルの所有者を変更します。実際のLinuxでは root権限が必要ですが、この練習環境では自由に変更できます。",
    check: all(usesCmd("chown"), ownerIs(`${LAB}/data.txt`, "root")),
  },
  {
    id: "permissions-11", category: "permissions", level: "intermediate",
    title: "chown で data.txt の所有者とグループを両方 student に戻してください。",
    hint: "chown 所有者:グループ ファイル名 の形式で、コロン区切りで両方指定できます。",
    answer: "chown student:student data.txt",
    explanation: "コロンの後にグループ名を書くと、所有者とグループを同時に変更できます。",
    check: all(usesCmd("chown"), ownerIs(`${LAB}/data.txt`, "student"), groupIs(`${LAB}/data.txt`, "student")),
  },
  {
    id: "permissions-12", category: "permissions", level: "intermediate",
    title: "ln -s で data.txt へのシンボリックリンク data-link を作成してください。",
    hint: "ln -s リンク先 リンク名",
    answer: "ln -s data.txt data-link",
    explanation: "-s（symbolic）を付けると、実体を指し示す「ショートカット」のようなシンボリックリンクを作成します。",
    check: all(usesCmd("ln"), isSymlink(`${LAB}/data-link`), linkTargetIs(`${LAB}/data-link`, `${LAB}/data.txt`)),
  },
  {
    id: "permissions-13", category: "permissions", level: "intermediate",
    title: "ln（-s を付けずに）で script.sh のハードリンク script-hard を作成してください。",
    hint: "-s を付けないと、実体（inode）を共有するハードリンクになります。",
    answer: "ln script.sh script-hard",
    explanation: "ハードリンクは同じ実体（inode）を指す別名です。片方の内容を書き換えると、もう片方にも同じ変更が反映されます。",
    check: all(usesCmd("ln"), isHardLinkOf(`${LAB}/script-hard`, `${LAB}/script.sh`)),
  },
  {
    id: "permissions-14", category: "permissions", level: "beginner",
    title: "ls -l で permlab の中身の権限・リンクの様子を確認してください。",
    hint: "ls -l を付けると、シンボリックリンクは「-> リンク先」も一緒に表示されます。",
    answer: "ls -l",
    explanation: "ls -l の出力の先頭1文字が「l」になっているものがシンボリックリンクです。",
    check: all(usesCmd("ls"), flagUsed("ls", "l")),
  },
];
