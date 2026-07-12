/* =========================================================================
   カテゴリ: ディスク
   対象コマンド: df, du, free
   ========================================================================= */
import { USER } from '../../constants.js';
import { all, argIncludes, cmdIs, flagUsed, usesCmd } from '../helpers.js';

const HOME = `/home/${USER}`;

export const diskMissions = [
  {
    id: "disk-01", category: "disk", level: "beginner",
    title: "df でファイルシステムのディスク使用量を表示してください。",
    hint: "df",
    answer: "df",
    explanation: "df（disk free）は、マウントされている各ファイルシステムの総容量・使用量・空き容量を表示します。",
    check: cmdIs("df"),
  },
  {
    id: "disk-02", category: "disk", level: "beginner",
    title: "df -h で人間が読みやすい単位（K/M/G）で表示してください。",
    hint: "-h オプション（human-readable）を付けます。",
    answer: "df -h",
    explanation: "-h を付けると、バイト数の代わりにK/M/Gなどの単位で読みやすく表示されます。",
    check: all(usesCmd("df"), flagUsed("df", "h")),
  },
  {
    id: "disk-03", category: "disk", level: "beginner",
    title: "du で現在のディレクトリの使用容量を表示してください。",
    hint: "du",
    answer: "du",
    explanation: "du（disk usage）は、指定したディレクトリ以下のファイル・サブディレクトリの使用容量を再帰的に集計します。",
    check: cmdIs("du"),
  },
  {
    id: "disk-04", category: "disk", level: "intermediate",
    title: "du -sh でホームディレクトリの合計使用量を、人間が読みやすい単位で表示してください。",
    hint: "-s（合計のみ）と -h（読みやすい単位）を組み合わせます。",
    answer: `du -sh ${HOME}`,
    explanation: "-s（summarize）は合計だけを表示し、-h と組み合わせるとサイズ確認によく使う定番の書き方になります。",
    check: all(usesCmd("du"), flagUsed("du", "s"), flagUsed("du", "h"), argIncludes("du", HOME)),
  },
  {
    id: "disk-05", category: "disk", level: "intermediate",
    title: "du -a でホームディレクトリ以下のファイル1つ1つの使用量を表示してください。",
    hint: "-a オプション（all）を付けると、ディレクトリだけでなくファイルごとの使用量も表示されます。",
    answer: `du -a ${HOME}`,
    explanation: "-a を付けないとディレクトリ単位の合計しか表示されませんが、-a を付けるとファイル単位でも表示されます。",
    check: all(usesCmd("du"), flagUsed("du", "a"), argIncludes("du", HOME)),
  },
  {
    id: "disk-06", category: "disk", level: "beginner",
    title: "free で物理メモリとスワップの使用状況を表示してください。",
    hint: "free",
    answer: "free",
    explanation: "free は、システム全体のメモリ（RAM）とスワップ領域の使用状況を表示します。",
    check: cmdIs("free"),
  },
  {
    id: "disk-07", category: "disk", level: "beginner",
    title: "free -h で人間が読みやすい単位でメモリ使用状況を表示してください。",
    hint: "-h オプションを付けます。",
    answer: "free -h",
    explanation: "-h を付けると、KB単位の数値ではなくK/M/Gで読みやすく表示されます。",
    check: all(usesCmd("free"), flagUsed("free", "h")),
  },
];
