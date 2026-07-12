/* =========================================================================
   カテゴリ: 日時
   対象コマンド: date, cal
   ========================================================================= */
import {
  all, cmdIs, contentMatches, hasPipe, overwriteRedirectUsed, usesCmd, usesCmds,
} from '../helpers.js';

export const datetimeMissions = [
  {
    id: "datetime-01", category: "datetime", level: "beginner",
    title: "date で現在の日付と時刻を表示してください。",
    hint: "date",
    answer: "date",
    explanation: "date は現在のシステム日時を表示します。",
    check: cmdIs("date"),
  },
  {
    id: "datetime-02", category: "datetime", level: "beginner",
    title: "cal で今月のカレンダーを表示してください。",
    hint: "cal",
    answer: "cal",
    explanation: "cal は今月のカレンダーを表示し、今日の日付がハイライトされます。",
    check: cmdIs("cal"),
  },
  {
    id: "datetime-03", category: "datetime", level: "intermediate",
    title: "date の出力を cat へパイプでつないで表示してください。",
    hint: "date | cat",
    answer: "date | cat",
    explanation: "date のような通常のコマンドも、他のコマンドと同じようにパイプで別のコマンドの標準入力へつなげられます。",
    check: all(hasPipe, usesCmds("date", "cat")),
  },
  {
    id: "datetime-04", category: "datetime", level: "intermediate",
    title: "cal の出力を today.txt というファイルへリダイレクトして保存してください。",
    hint: "cal > today.txt",
    answer: "cal > today.txt",
    explanation: "> を使えば、date や cal のような表示専用コマンドの出力もファイルへ保存できます。",
    check: all(usesCmd("cal"), overwriteRedirectUsed, contentMatches("today.txt", /\S/)),
  },
];
