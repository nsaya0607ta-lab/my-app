/* =========================================================================
   💡 ライト消しパズル：ステージデータ
   ステージの内容はすべてこのファイル（設定データ）から追加・調整できる
   ようにし、js/lightpuzzle 配下のロジック／画面コードへ直接書き込まない。
   反転ルール（タップ＋上下左右のみ反転）や最少手数の計算といった
   「ゲームロジック」は js/lightpuzzle/logic.js 側にすべて分離してあり、
   このファイルはそれを呼び出してステージのパラメータを組み立てるだけ。

   ステージ1件の型（TypeScript表記。実体はプレーンなJSオブジェクト）：
     type LightPuzzleStage = {
       id: number;                 // ステージ番号（1〜）
       size: number;                // 盤面の一辺のマス数（3・4・5…）
       initialBoard: boolean[];     // 初期配置（true=点灯）。長さ = size*size
       optimalMoves: number;        // 最少手数の目安（js/lightpuzzle/logic.js
                                     // の solveMinimal() で厳密に計算した値）
       star2MoveMax: number;        // 星2条件：この手数以内でクリア
       coinReward: number;          // 初回クリアで付与する通常コイン(AC)
       houseCoinReward: number;     // 初回クリアで付与するチャッピーハウスコイン
       star3CoinReward: number;     // 星3初回達成で追加付与する通常コイン(AC)
       star3HouseCoinReward: number;// 星3初回達成で追加付与するチャッピーハウスコイン
       title: string;
       description: string;
     };

   初期配置の作り方（＝必ず解ける配置にするための方式）：
     「全消灯（完成状態）から、有効な操作（タップ）を複数回行う」ことで
     初期配置を作る（generateSolvableBoard）。押した操作は自分自身の逆操作
     でもあるため、生成に使ったマスをもう一度押せば必ず全消灯に戻せる＝
     クリア不能な配置を作らない。ステージごとに固定シード値を使うので、
     読み込むたびに同じ初期配置が再現される（実行のたびに変わらない）。
     実際の最少手数は生成に使った手数と一致するとは限らない（複数の押し方が
     同じ結果になることがあるため）ので、solveMinimal() で厳密に計算し直す。

   ステージを追加する手順：
     1. STAGE_SEEDS配列へ { id, size, shuffle, seed, title, description } を追加
     2. seed は他のステージと重複しない適当な整数でよい（盤面が変わるだけ）
     3. 難易度を上げたいときは shuffle（生成に使う操作回数）を増やす
     4. optimalMoves・star2MoveMax はこのファイルが自動計算するので手入力不要
   ========================================================================= */
import { generateSolvableBoard, solveMinimal } from '../lightpuzzle/logic.js';

const DEFAULT_REWARD = {
  coinReward: 40,          // 初回クリア：通常コイン(AC)
  houseCoinReward: 20,     // 初回クリア：チャッピーハウスコイン
  star3CoinReward: 30,     // 星3初回達成：追加の通常コイン(AC)
  star3HouseCoinReward: 15,// 星3初回達成：追加のチャッピーハウスコイン
};

// 星2条件（基準手数）：最少手数に少し余裕を持たせた値を自動算出する
function star2MoveMaxFor(optimalMoves){
  return optimalMoves + Math.max(2, Math.ceil(optimalMoves * 0.6));
}

const STAGE_SEEDS = [
  // ---- 初級（3×3）：ステージ1〜5 ----
  { id: 1, size: 3, shuffle: 2, seed: 7922, title: "はじめての1手", description: "3×3の盤面に慣れよう。少ない手数でクリアできるはず。" },
  { id: 2, size: 3, shuffle: 3, seed: 15841, title: "3手でクリア", description: "上下左右の反転を意識して、順番にライトを消していこう。" },
  { id: 3, size: 3, shuffle: 4, seed: 23760, title: "端と角を狙う", description: "端や角のマスは反転する範囲が狭い。うまく利用しよう。" },
  { id: 4, size: 3, shuffle: 5, seed: 31679, title: "少しずつ複雑に", description: "手数が増えてきた。焦らず1手ずつ確認しよう。" },
  { id: 5, size: 3, shuffle: 6, seed: 39598, title: "初級の仕上げ", description: "3×3の総仕上げ。最少手数を目指してみよう。" },
  // ---- 中級（4×4）：ステージ6〜10 ----
  { id: 6, size: 4, shuffle: 3, seed: 47517, title: "4×4へようこそ", description: "盤面が広がった。まずは基本の反転を確認しよう。" },
  { id: 7, size: 4, shuffle: 4, seed: 55436, title: "広がる盤面", description: "マスが増えるほど、反転の影響範囲も考える必要が出てくる。" },
  { id: 8, size: 4, shuffle: 5, seed: 63355, title: "中級の壁", description: "点灯パターンが複雑になってきた。ヒントも活用しよう。" },
  { id: 9, size: 4, shuffle: 6, seed: 71274, title: "手数を意識して", description: "最少手数との差を意識しながらクリアを目指そう。" },
  { id: 10, size: 4, shuffle: 7, seed: 79226, title: "中級の仕上げ", description: "4×4の総仕上げ。星3クリアに挑戦してみよう。" },
  // ---- 上級（5×5）：ステージ11〜15 ----
  { id: 11, size: 5, shuffle: 7, seed: 87112, title: "5×5へようこそ", description: "最大の盤面。落ち着いて1マスずつ確認しよう。" },
  { id: 12, size: 5, shuffle: 8, seed: 95031, title: "広い盤面を読む", description: "点灯しているマスが多い。全体のパターンを見渡そう。" },
  { id: 13, size: 5, shuffle: 9, seed: 102950, title: "上級の壁", description: "手数が増える中級・上級の難所。ヒントを味方にしよう。" },
  { id: 14, size: 5, shuffle: 10, seed: 110869, title: "最少手数への挑戦", description: "最少手数でのクリアには正確な手順が必要になる。" },
  { id: 15, size: 5, shuffle: 12, seed: 118788, title: "最終ステージ", description: "すべての力を試す最終問題。ヒントなし・星3クリアに挑戦しよう。" },
];

export const LIGHTPUZZLE_STAGES = STAGE_SEEDS.map(({ id, size, shuffle, seed, title, description }) => {
  const initialBoard = generateSolvableBoard(size, shuffle, seed);
  const solved = solveMinimal(initialBoard, size);
  const optimalMoves = solved ? solved.count : shuffle;
  return {
    id, size, title, description,
    initialBoard,
    optimalMoves,
    star2MoveMax: star2MoveMaxFor(optimalMoves),
    ...DEFAULT_REWARD,
  };
});

export function lightPuzzleStageById(id){
  return LIGHTPUZZLE_STAGES.find(s => s.id === Number(id)) || null;
}

export function lightPuzzleNextStageId(id){
  const idx = LIGHTPUZZLE_STAGES.findIndex(s => s.id === Number(id));
  if(idx < 0 || idx + 1 >= LIGHTPUZZLE_STAGES.length) return null;
  return LIGHTPUZZLE_STAGES[idx + 1].id;
}
