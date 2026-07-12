import { errLine } from './_util.js';

// 実際のsleepは指定秒数のあいだ処理をブロックするが、本環境のコマンドは
// 同期的に即座に完了するシミュレータのため、フォアグラウンドでは何も
// 起きずにすぐ戻る（何も出力しない、という結果自体はsleep本来の挙動と同じ）。
// 学習の主眼は「時間のかかる処理を & でバックグラウンドへ回す」点にある。
export default function sleep(ctx){
  const arg = ctx.args.find(a => !a.startsWith("-"));
  if(!arg) return { lines:[], err:[ errLine("sleep: missing operand") ] };
  if(!/^\d+(\.\d+)?$/.test(arg)) return { lines:[], err:[ errLine(`sleep: invalid time interval '${arg}'`) ] };
  return { lines:[], err:[] };
}
