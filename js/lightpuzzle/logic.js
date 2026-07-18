/* =========================================================================
   ライト消しパズル：ゲームロジック（DOM非依存・盤面データの形に依存しない
   純粋関数のみ）。ステージデータ（js/data/lightpuzzle-stages.js）からは
   盤面生成・最少手数計算のために呼ばれ、画面（js/lightpuzzle/screen.js）
   からはタップ処理・ヒント計算のために呼ばれる。

   盤面は size*size の boolean[]（true=点灯）。インデックスは
   row*size+col（0-indexed、左上が0）。反転ルールは「タップしたマス＋
   上下左右のマス」のみで、斜めは対象外。
   ========================================================================= */

// タップしたマス index を押したときに反転するマス（自分＋上下左右）のインデックス一覧
export function affectedIndices(size, index){
  const x = index % size, y = Math.floor(index / size);
  const out = [index];
  if(y > 0) out.push(index - size);       // 上
  if(y < size - 1) out.push(index + size); // 下
  if(x > 0) out.push(index - 1);          // 左
  if(x < size - 1) out.push(index + 1);   // 右
  return out;
}

export function cloneBoard(board){ return board.slice(); }

// 指定マスを押した結果の新しい盤面を返す（元の配列は変更しない）
export function pressCell(board, size, index){
  const next = board.slice();
  for(const i of affectedIndices(size, index)) next[i] = !next[i];
  return next;
}

export function isSolved(board){ return board.every(v => !v); }

export function litCount(board){ return board.reduce((n, v) => n + (v ? 1 : 0), 0); }

/* =========================================================================
   GF(2)上の連立方程式として解く：盤面を全消灯にする「押すマスの組み合わせ」を
   ガウス・ジョルダン消去法で求める。押すマスの集合はどの順番で押しても・
   同じマスを2回押せば元に戻る（=打ち消し合う）ため、この一次方程式の解＝
   有効な操作の組み合わせとなる。
   自由変数（不定解）が残る場合は総当たりし、反転させるマス数が最小の解を選ぶ
   （＝最少手数）。3×3〜5×5（最大25変数）なら自由変数は数個程度で十分高速。
   ========================================================================= */
function buildRows(size, board){
  const n = size * size;
  const rows = new Array(n);
  for(let i = 0; i < n; i++){
    let coef = 0;
    for(const j of affectedIndices(size, i)) coef |= (1 << j);
    const rhs = board[i] ? 1 : 0;
    rows[i] = coef | (rhs << n);
  }
  return rows;
}

function popcount(v){
  let c = 0;
  while(v){ v &= v - 1; c++; }
  return c;
}

// 盤面 board を全消灯にする最少の「押すマス集合」を求める。
// 戻り値：{ moves: number[]（押すマスのインデックス配列）, count: number } または解なしで null
export function solveMinimal(board, size){
  const n = size * size;
  if(n <= 0 || n > 30) return null; // ビット演算の安全域外（本アプリでは最大25）
  const rows = buildRows(size, board);
  const full = (1 << n) - 1;

  const pivotRowForCol = new Array(n).fill(-1);
  let r = 0;
  for(let col = 0; col < n && r < n; col++){
    let sel = -1;
    for(let k = r; k < n; k++){
      if((rows[k] >>> col) & 1){ sel = k; break; }
    }
    if(sel === -1) continue;
    if(sel !== r){ const tmp = rows[r]; rows[r] = rows[sel]; rows[sel] = tmp; }
    for(let k = 0; k < n; k++){
      if(k !== r && ((rows[k] >>> col) & 1)) rows[k] ^= rows[r];
    }
    pivotRowForCol[col] = r;
    r++;
  }
  // 矛盾チェック（係数がすべて0なのに右辺が1＝解なし）。ステージ生成は
  // 必ず「有効な操作の組み合わせ」から作るため通常は発生しない
  for(let k = r; k < n; k++){
    if((rows[k] & full) === 0 && ((rows[k] >>> n) & 1)) return null;
  }

  const freeCols = [];
  for(let col = 0; col < n; col++) if(pivotRowForCol[col] === -1) freeCols.push(col);

  function buildSolution(freeBits){
    let x = 0;
    for(let i = 0; i < freeCols.length; i++){
      if((freeBits >>> i) & 1) x |= (1 << freeCols[i]);
    }
    for(let col = 0; col < n; col++){
      const pr = pivotRowForCol[col];
      if(pr === -1) continue;
      let val = (rows[pr] >>> n) & 1;
      const rowFree = rows[pr] & full & ~(1 << col);
      val ^= popcount(rowFree & x) & 1;
      if(val) x |= (1 << col); else x &= ~(1 << col);
    }
    return x;
  }

  const kernelDim = freeCols.length;
  const combos = 1 << kernelDim;
  let best = null, bestCount = Infinity;
  for(let m = 0; m < combos; m++){
    const x = buildSolution(m);
    const cnt = popcount(x);
    if(cnt < bestCount){ bestCount = cnt; best = x; }
  }
  if(best == null) return null;
  const moves = [];
  for(let i = 0; i < n; i++) if((best >>> i) & 1) moves.push(i);
  return { moves, count: bestCount };
}

// 現在の盤面から「次に押すことをおすすめするマス」を1つだけ返す。
// 盤面がすでに全消灯なら null
export function nextHintMove(board, size){
  if(isSolved(board)) return null;
  const sol = solveMinimal(board, size);
  if(!sol || sol.moves.length === 0) return null;
  return sol.moves[0];
}

/* =========================================================================
   決定的な擬似乱数（mulberry32）。ステージごとに固定シードを使うことで、
   毎回同じ初期配置が再現される（起動のたびに変わるランダム生成ではない）。
   ========================================================================= */
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 「完成状態（全消灯）から有効な操作を複数回行う」方式で、必ず解ける初期配置を作る。
// shuffleCount 個の異なるマスを選んで押すことで、それらのマスを押せば必ず解ける
// （＝クリア不能な配置を作らない）。実際の最少手数は solveMinimal で別途計算する
export function generateSolvableBoard(size, shuffleCount, seed){
  const n = size * size;
  const rnd = mulberry32(seed);
  const pool = Array.from({ length: n }, (_, i) => i);
  // フィッシャー–イェーツで先頭 shuffleCount 件を抽出
  for(let i = pool.length - 1; i > 0; i--){
    const j = Math.floor(rnd() * (i + 1));
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }
  const picks = pool.slice(0, Math.min(shuffleCount, n));
  let board = new Array(n).fill(false);
  for(const idx of picks) board = pressCell(board, size, idx);
  return board;
}
