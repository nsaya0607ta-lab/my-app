/* =========================================================================
   🎯 ラインバウンド：ステージデータ
   ステージの内容はすべてこのファイル（設定データ）から追加・調整できる
   ようにし、js/linebound 配下のロジック／画面コードへ直接書き込まない。

   座標系：各ステージが持つ world（{w,h}）を基準とした「論理座標」。
   画面サイズやデバイスの解像度が変わっても、この論理座標だけを使って
   物理演算・当たり判定を行うことで、表示側のスケーリングに影響されない
   （js/linebound/screen.js 側で論理座標⇔画面ピクセルの変換を行う）。
   x：右が正、y：下が正（Canvas 2Dと同じ向き）。angle は度数法で
   0=右、90=下、-90=上、180/-180=左。

   ステージ1件のフィールド：
     id                … ステージ番号
     world              … 論理座標系のサイズ {w,h}
     launch             … 発射地点・発射方向・ボール速度 {x,y,angle,speed}
     goal               … ゴール位置と半径 {x,y,r}
     obstacles          … 障害物の配列（type ごとの形式は下記）
     inkLimit           … このステージで引ける線の合計の長さ（インク量）
     timeLimit          … 参考タイム（ms）。クリア画面の目安表示・自己ベスト
                          比較にのみ使用し、超過しても失敗にはしない
     star2InkMax        … 星2の条件：使用インクがこの値以下でクリア
     star3Condition     … 星3の条件（省略時は下記 DEFAULT_STAR3_CONDITION）
     firstClearReward   … 初回クリア報酬 {coins, chappyCoins}
     star3Reward        … 星3達成の追加報酬 {coins, chappyCoins}
     noHintReward       … ヒント未使用の追加報酬 {coins}
     hints              … 段階的ヒント（下記 hint 形式）の配列

   障害物 obstacles[].type：
     "wall"       固定壁    … {x1,y1,x2,y2}
     "spike"      トゲ      … {x,y,radius}（触れたら即失敗）
     "rubber"     ゴム壁    … {x1,y1,x2,y2}（反発係数が高い）
     "movingWall" 動く壁    … {x1,y1,x2,y2,axisX,axisY,amplitude,period,phase?}
                    （axisX/axisYの単位ベクトル方向に、振幅amplitude・
                     周期period秒で正弦振動する）
   拡張予定（次フェーズ、まだハンドラ未実装）："rotor"（回転する棒）、
   "accel"/"decel"（加速/減速エリア）、"warp"（ワープホール）、
   "gate"（スイッチで開くゲート）。obstacles[].type を増やし、
   js/linebound/physics.js の OBSTACLE_HANDLERS にハンドラを追加すれば
   組み込める設計にしてある。

   hint 形式：
     { type:"area",  text, rect:{x,y,w,h} }         … 線を引くおすすめエリア
     { type:"arrow", text, from:{x,y}, angleDeg }    … 跳ね返したい向きの矢印
     { type:"line",  text, points:[{x,y},...] }      … 正解の線の一部分
   ========================================================================= */

export const LINEBOUND_WORLD = { w: 360, h: 640 };

export const DEFAULT_STAR3_CONDITION = { maxShots: 1, noHint: true };

function boundaryWalls(){
  return [
    { id: "b-left", type: "wall", x1: 0, y1: -40, x2: 0, y2: 680 },
    { id: "b-right", type: "wall", x1: 360, y1: -40, x2: 360, y2: 680 },
    { id: "b-top", type: "wall", x1: -40, y1: 0, x2: 400, y2: 0 },
  ];
}

const DEFAULT_REWARDS = {
  firstClearReward: { coins: 20, chappyCoins: 2 },
  star3Reward: { coins: 10, chappyCoins: 1 },
  noHintReward: { coins: 5 },
};

export const LINEBOUND_STAGES = [
  {
    id: 1,
    title: "はじめてのバウンド",
    description: "線を1本引いて、ゴールへ導こう。",
    world: LINEBOUND_WORLD,
    launch: { x: 60, y: 560, angle: -90, speed: 650 },
    goal: { x: 250, y: 613, r: 34 },
    obstacles: [...boundaryWalls()],
    inkLimit: 160,
    timeLimit: 20000,
    star2InkMax: 130,
    ...DEFAULT_REWARDS,
    hints: [
      { type: "area", text: "この辺りに線を引いてみよう", rect: { x: 6, y: 354, w: 130, h: 152 } },
      { type: "arrow", text: "ボールをこの向きへはね返そう", from: { x: 60, y: 430 }, angleDeg: 44 },
      { type: "line", text: "正解の線の一部を表示するよ", points: [{ x: 20, y: 470 }, { x: 60, y: 430 }] },
    ],
  },
  {
    id: 2,
    title: "壁をよけて",
    description: "固定された壁を避けてゴールへ導こう。",
    world: LINEBOUND_WORLD,
    launch: { x: 60, y: 560, angle: -90, speed: 650 },
    goal: { x: 300, y: 480, r: 32 },
    obstacles: [...boundaryWalls(), { id: "w1", type: "wall", x1: 170, y1: 0, x2: 170, y2: 410 }],
    inkLimit: 190,
    timeLimit: 25000,
    star2InkMax: 185,
    ...DEFAULT_REWARDS,
    hints: [
      { type: "area", text: "この辺りに線を引いてみよう", rect: { x: 6, y: 423, w: 135, h: 200 } },
      { type: "arrow", text: "ボールをこの向きへはね返そう", from: { x: 64, y: 536 }, angleDeg: -13 },
      { type: "line", text: "正解の線の一部を表示するよ", points: [{ x: 29, y: 612 }, { x: 64, y: 536 }] },
    ],
  },
  {
    id: 3,
    title: "2回バウンド",
    description: "壁とラインで2回はね返してゴールへ導こう。",
    world: LINEBOUND_WORLD,
    launch: { x: 60, y: 560, angle: -90, speed: 650 },
    goal: { x: 163, y: 630, r: 32 },
    obstacles: [...boundaryWalls(), { id: "w1", type: "wall", x1: 210, y1: 500, x2: 210, y2: 560 }],
    inkLimit: 200,
    timeLimit: 30000,
    star2InkMax: 140,
    ...DEFAULT_REWARDS,
    hints: [
      { type: "area", text: "この辺りに線を引いてみよう", rect: { x: 6, y: 354, w: 130, h: 152 } },
      { type: "arrow", text: "ボールをこの向きへはね返そう", from: { x: 60, y: 430 }, angleDeg: 63 },
      { type: "line", text: "正解の線の一部を表示するよ", points: [{ x: 20, y: 470 }, { x: 60, y: 430 }] },
    ],
  },
  {
    id: 4,
    title: "トゲに注意",
    description: "トゲに触れないよう、ゴールへ導こう。",
    world: LINEBOUND_WORLD,
    launch: { x: 60, y: 560, angle: -90, speed: 650 },
    goal: { x: 270, y: 470, r: 30 },
    obstacles: [
      ...boundaryWalls(),
      { id: "sp1", type: "spike", x: 160, y: 460, radius: 10 },
      { id: "sp2", type: "spike", x: 160, y: 495, radius: 10 },
    ],
    inkLimit: 190,
    timeLimit: 25000,
    star2InkMax: 110,
    ...DEFAULT_REWARDS,
    hints: [
      { type: "area", text: "この辺りに線を引いてみよう", rect: { x: 6, y: 463, w: 102, h: 153 } },
      { type: "arrow", text: "ボールをこの向きへはね返そう", from: { x: 40, y: 539 }, angleDeg: -17 },
      { type: "line", text: "正解の線の一部を表示するよ", points: [{ x: 55.6, y: 498.6 }, { x: 40.5, y: 539.1 }] },
    ],
  },
  {
    id: 5,
    title: "少ないインクで",
    description: "インク量が少ない。短い線でゴールへ導こう。",
    world: LINEBOUND_WORLD,
    launch: { x: 60, y: 560, angle: -90, speed: 650 },
    goal: { x: 250, y: 613, r: 34 },
    obstacles: [...boundaryWalls()],
    inkLimit: 110,
    timeLimit: 20000,
    star2InkMax: 100,
    ...DEFAULT_REWARDS,
    hints: [
      { type: "area", text: "この辺りに短い線を引いてみよう", rect: { x: 6, y: 362, w: 128, h: 136 } },
      { type: "arrow", text: "ボールをこの向きへはね返そう", from: { x: 60, y: 430 }, angleDeg: 44 },
      { type: "line", text: "正解の線の一部を表示するよ", points: [{ x: 28.2, y: 461.8 }, { x: 60, y: 430 }] },
    ],
  },
  {
    id: 6,
    title: "ゴム壁バウンド",
    description: "よく跳ねるゴム壁を利用してゴールへ導こう。",
    world: LINEBOUND_WORLD,
    launch: { x: 60, y: 560, angle: -90, speed: 650 },
    goal: { x: 150, y: 624, r: 28 },
    obstacles: [...boundaryWalls(), { id: "r1", type: "rubber", x1: 250, y1: 640, x2: 360, y2: 480 }],
    inkLimit: 200,
    timeLimit: 28000,
    star2InkMax: 140,
    ...DEFAULT_REWARDS,
    hints: [
      { type: "area", text: "この辺りに線を引いてみよう", rect: { x: 6, y: 354, w: 130, h: 152 } },
      { type: "arrow", text: "ボールをこの向きへはね返そう", from: { x: 60, y: 430 }, angleDeg: 65 },
      { type: "line", text: "正解の線の一部を表示するよ", points: [{ x: 20, y: 470 }, { x: 60, y: 430 }] },
    ],
  },
  {
    id: 7,
    title: "動く壁をかわす",
    description: "左右に動く壁のタイミングを見てゴールへ導こう。",
    world: LINEBOUND_WORLD,
    launch: { x: 60, y: 560, angle: -90, speed: 650 },
    goal: { x: 280, y: 500, r: 32 },
    obstacles: [
      ...boundaryWalls(),
      { id: "m1", type: "movingWall", x1: 150, y1: 340, x2: 150, y2: 480, axisX: 1, axisY: 0, amplitude: 60, period: 2.2 },
    ],
    inkLimit: 200,
    timeLimit: 28000,
    star2InkMax: 185,
    ...DEFAULT_REWARDS,
    hints: [
      { type: "area", text: "この辺りに線を引いてみよう", rect: { x: 6, y: 403, w: 154, h: 218 } },
      { type: "arrow", text: "ボールをこの向きへはね返そう", from: { x: 80, y: 512 }, angleDeg: -4 },
      { type: "line", text: "正解の線の一部を表示するよ", points: [{ x: 124.3, y: 439.4 }, { x: 80.2, y: 512.3 }] },
    ],
  },
  {
    id: 8,
    title: "障害物ラッシュ",
    description: "複数の障害物を避けながらゴールへ導こう。",
    world: LINEBOUND_WORLD,
    launch: { x: 60, y: 560, angle: -90, speed: 650 },
    goal: { x: 250, y: 613, r: 34 },
    obstacles: [
      ...boundaryWalls(),
      { id: "w1", type: "wall", x1: 170, y1: 0, x2: 170, y2: 420 },
      { id: "sp1", type: "spike", x: 250, y: 300, radius: 10 },
      { id: "r1", type: "rubber", x1: 60, y1: 300, x2: 140, y2: 220 },
    ],
    inkLimit: 190,
    timeLimit: 30000,
    star2InkMax: 140,
    ...DEFAULT_REWARDS,
    hints: [
      { type: "area", text: "この辺りに線を引いてみよう", rect: { x: 6, y: 354, w: 130, h: 152 } },
      { type: "arrow", text: "ボールをこの向きへはね返そう", from: { x: 60, y: 430 }, angleDeg: 44 },
      { type: "line", text: "正解の線の一部を表示するよ", points: [{ x: 20, y: 470 }, { x: 60, y: 430 }] },
    ],
  },
  {
    id: 9,
    title: "せまい通路",
    description: "せまい通路の間を通してゴールへ導こう。",
    world: LINEBOUND_WORLD,
    launch: { x: 60, y: 560, angle: -90, speed: 650 },
    goal: { x: 250, y: 613, r: 30 },
    obstacles: [
      ...boundaryWalls(),
      { id: "w1", type: "wall", x1: 150, y1: 560, x2: 150, y2: 640 },
      { id: "w2", type: "wall", x1: 300, y1: 560, x2: 300, y2: 640 },
    ],
    inkLimit: 190,
    timeLimit: 28000,
    star2InkMax: 140,
    ...DEFAULT_REWARDS,
    hints: [
      { type: "area", text: "この辺りに線を引いてみよう", rect: { x: 6, y: 354, w: 130, h: 152 } },
      { type: "arrow", text: "ボールをこの向きへはね返そう", from: { x: 60, y: 430 }, angleDeg: 44 },
      { type: "line", text: "正解の線の一部を表示するよ", points: [{ x: 20, y: 470 }, { x: 60, y: 430 }] },
    ],
  },
  {
    id: 10,
    title: "すべての力を合わせて",
    description: "壁・トゲ・ゴム壁・動く壁、すべてを組み合わせたステージ。",
    world: LINEBOUND_WORLD,
    launch: { x: 60, y: 560, angle: -90, speed: 650 },
    goal: { x: 250, y: 613, r: 28 },
    obstacles: [
      ...boundaryWalls(),
      { id: "w1", type: "wall", x1: 170, y1: 0, x2: 170, y2: 400 },
      { id: "sp1", type: "spike", x: 250, y: 280, radius: 10 },
      { id: "r1", type: "rubber", x1: 60, y1: 280, x2: 140, y2: 200 },
      { id: "m1", type: "movingWall", x1: 150, y1: 120, x2: 260, y2: 120, axisX: 0, axisY: 1, amplitude: 40, period: 2.4 },
    ],
    inkLimit: 210,
    timeLimit: 35000,
    star2InkMax: 150,
    ...DEFAULT_REWARDS,
    hints: [
      { type: "area", text: "この辺りに線を引いてみよう", rect: { x: 6, y: 354, w: 130, h: 152 } },
      { type: "arrow", text: "ボールをこの向きへはね返そう", from: { x: 60, y: 430 }, angleDeg: 44 },
      { type: "line", text: "正解の線の一部を表示するよ", points: [{ x: 20, y: 470 }, { x: 60, y: 430 }] },
    ],
  },
];

export function lineboundStageById(id){
  return LINEBOUND_STAGES.find(s => s.id === Number(id)) || null;
}

export function lineboundNextStageId(id){
  const idx = LINEBOUND_STAGES.findIndex(s => s.id === Number(id));
  if(idx < 0 || idx + 1 >= LINEBOUND_STAGES.length) return null;
  return LINEBOUND_STAGES[idx + 1].id;
}
