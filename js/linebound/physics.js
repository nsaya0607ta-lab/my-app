/* =========================================================================
   🎯 ラインバウンド：物理エンジン（自作・軽量2D）
   既存プロジェクトに物理エンジンが無いため、Canvas 2D と組み合わせて使う
   前提の最小限の剛体風シミュレーションをここに実装する。DOM操作は一切
   行わない（描画・入力は js/linebound/screen.js 側の責務）。

   ・ボールは常に円（半径 BALL_RADIUS）
   ・障害物／ユーザーが引いた線はすべて「線分＋太さ」＝カプセルとして扱う
     ことで、線同士が重なっても衝突判定が破綻しない（各線分は独立して
     判定するだけで、CSG的な結合処理が不要）
   ・固定障害物・トゲ・ゴム壁・動く壁を1つの障害物レジストリ
     （OBSTACLE_HANDLERS）で扱う。新しい種類（回転する棒・加速エリア等）は
     ハンドラを1つ追加するだけで拡張できる設計にしてある
   ========================================================================= */

export const BALL_RADIUS = 9;
export const LINE_HALF_THICKNESS = 4;   // ユーザーが引く線の半太さ
export const WALL_HALF_THICKNESS = 5;   // 固定壁・ゴム壁・動く壁の半太さ
export const SPIKE_RADIUS = 10;         // トゲ1本あたりの当たり判定半径

const GRAVITY = 1000;               // world units / s^2
const AIR_DRAG = 0.02;             // 空気抵抗（1秒あたりの速度減衰率）
const MAX_SPEED = 2200;            // 暴走防止の速度上限
const SLEEP_SPEED = 14;            // これ未満の速度が続くと「静止」とみなす
const SLEEP_TIME = 0.85;           // 静止とみなすまでの継続時間（秒）
const STUCK_FAIL_TIME = 1.6;       // 静止状態がこれだけ続いたら失敗
const MAX_FLIGHT_TIME = 20;        // 発射からの絶対タイムリミット（秒、保険）
const WALL_RESTITUTION = 0.5;
const WALL_FRICTION = 0.10;
const RUBBER_RESTITUTION = 0.95;
const RUBBER_FRICTION = 0.02;
const LINE_RESTITUTION = 0.42;
const LINE_FRICTION = 0.14;

export function deg2rad(d){ return d * Math.PI / 180; }

/* ---- 幾何ユーティリティ：円 vs カプセル（線分＋太さ）の衝突解決 ---- */
function resolveCircleSegment(bx, by, bvx, bvy, radius, x1, y1, x2, y2, halfThickness, restitution, friction, wallVX, wallVY){
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy || 1e-6;
  let t = ((bx - x1) * dx + (by - y1) * dy) / lenSq;
  if(t < 0) t = 0; else if(t > 1) t = 1;
  const cx = x1 + dx * t, cy = y1 + dy * t;
  const nx0 = bx - cx, ny0 = by - cy;
  const dist = Math.hypot(nx0, ny0) || 1e-6;
  const minDist = radius + halfThickness;
  if(dist >= minDist) return null;
  const nx = nx0 / dist, ny = ny0 / dist;
  const penetration = minDist - dist;
  const wvx = wallVX || 0, wvy = wallVY || 0;
  const rvx = bvx - wvx, rvy = bvy - wvy;
  const vn = rvx * nx + rvy * ny;
  let outVX = bvx, outVY = bvy;
  if(vn < 0){
    const tanX = rvx - vn * nx, tanY = rvy - vn * ny;
    const tFactor = 1 - friction;
    const reflectedN = -vn * restitution;
    outVX = tanX * tFactor + nx * reflectedN + wvx;
    outVY = tanY * tFactor + ny * reflectedN + wvy;
  }
  return {
    x: bx + nx * penetration,
    y: by + ny * penetration,
    vx: outVX, vy: outVY,
    nx, ny, penetration,
  };
}

/* ---- 障害物レジストリ：type ごとに「時刻tにおける現在の線分ジオメトリ」
   と「衝突特性（反発係数・摩擦）」を返すハンドラを登録する。
   新しい障害物（回転する棒・加速/減速エリア・ワープ・ゲート等）を追加
   するときは、ここへハンドラを1つ足すだけでよい ---- */
const OBSTACLE_HANDLERS = {
  wall: {
    segmentsAt(ob){
      return [{ x1: ob.x1, y1: ob.y1, x2: ob.x2, y2: ob.y2, vx: 0, vy: 0,
                halfThickness: ob.halfThickness || WALL_HALF_THICKNESS,
                restitution: WALL_RESTITUTION, friction: WALL_FRICTION }];
    },
  },
  rubber: {
    segmentsAt(ob){
      return [{ x1: ob.x1, y1: ob.y1, x2: ob.x2, y2: ob.y2, vx: 0, vy: 0,
                halfThickness: ob.halfThickness || WALL_HALF_THICKNESS,
                restitution: RUBBER_RESTITUTION, friction: RUBBER_FRICTION }];
    },
  },
  movingWall: {
    segmentsAt(ob, t){
      const period = Math.max(0.2, ob.period || 2.4);
      const amp = ob.amplitude || 0;
      const axLen = Math.hypot(ob.axisX, ob.axisY) || 1;
      const ax = ob.axisX / axLen, ay = ob.axisY / axLen;
      const phase = ob.phase || 0;
      const w = (2 * Math.PI) / period;
      const off = amp * Math.sin(w * t + phase);
      const offV = amp * w * Math.cos(w * t + phase);
      const ox = ax * off, oy = ay * off;
      const vx = ax * offV, vy = ay * offV;
      return [{ x1: ob.x1 + ox, y1: ob.y1 + oy, x2: ob.x2 + ox, y2: ob.y2 + oy, vx, vy,
                halfThickness: ob.halfThickness || WALL_HALF_THICKNESS,
                restitution: WALL_RESTITUTION, friction: WALL_FRICTION }];
    },
  },
  // 拡張余地：回転する棒／加速・減速エリア／ワープホール／スイッチゲートは
  // 次フェーズで OBSTACLE_HANDLERS にハンドラを追加するだけで組み込める
  // （ステージデータの obstacles[].type を増やすだけで済む設計）。
};

function obstacleSegments(ob, t){
  const handler = OBSTACLE_HANDLERS[ob.type];
  if(!handler || !handler.segmentsAt) return [];
  return handler.segmentsAt(ob, t);
}

/* ---- ユーザーが引いた線（複数点の折れ線）を線分列に展開 ---- */
function lineSegments(line){
  const segs = [];
  const pts = line.points;
  for(let i = 0; i < pts.length - 1; i++){
    segs.push({ x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y,
                vx: 0, vy: 0, halfThickness: LINE_HALF_THICKNESS,
                restitution: LINE_RESTITUTION, friction: LINE_FRICTION });
  }
  return segs;
}

/* =========================================================================
   シミュレーション本体
   ========================================================================= */
export function createSimulation({ world, obstacles, lines, goal }){
  return {
    world,                 // {w,h}
    obstacles: obstacles || [],
    lines: lines || [],
    goal,                  // {x,y,r}
    ball: null,
    time: 0,
    sleepTimer: 0,
    stuckTimer: 0,
    launched: false,
    finished: false,       // "goal" | "fail" | null
  };
}

export function launchBall(sim, x, y, angleDeg, speed){
  const rad = deg2rad(angleDeg);
  sim.ball = { x, y, vx: Math.cos(rad) * speed, vy: Math.sin(rad) * speed, radius: BALL_RADIUS };
  sim.time = 0;
  sim.sleepTimer = 0;
  sim.stuckTimer = 0;
  sim.launched = true;
  sim.finished = null;
}

// 固定dtで1ステップ進める。壁/線への着弾など、演出用イベントを配列で返す
export function stepSimulation(sim, dt){
  const events = [];
  if(!sim.ball || sim.finished) return events;
  const b = sim.ball;

  b.vy += GRAVITY * dt;
  const drag = Math.max(0, 1 - AIR_DRAG * dt);
  b.vx *= drag; b.vy *= drag;
  const speed = Math.hypot(b.vx, b.vy);
  if(speed > MAX_SPEED){ const k = MAX_SPEED / speed; b.vx *= k; b.vy *= k; }

  b.x += b.vx * dt;
  b.y += b.vy * dt;
  sim.time += dt;

  // 障害物（固定壁・ゴム壁・動く壁）との衝突
  for(const ob of sim.obstacles){
    if(ob.type === "spike"){
      const d = Math.hypot(b.x - ob.x, b.y - ob.y);
      if(d < b.radius + (ob.radius || SPIKE_RADIUS)){
        sim.finished = "fail";
        events.push({ type: "fail", reason: "spike" });
        return events;
      }
      continue;
    }
    for(const seg of obstacleSegments(ob, sim.time)){
      const r = resolveCircleSegment(b.x, b.y, b.vx, b.vy, b.radius, seg.x1, seg.y1, seg.x2, seg.y2,
        seg.halfThickness, seg.restitution, seg.friction, seg.vx, seg.vy);
      if(r){
        b.x = r.x; b.y = r.y; b.vx = r.vx; b.vy = r.vy;
        events.push({ type: "hit", kind: ob.type, x: b.x, y: b.y });
      }
    }
  }

  // ユーザーが引いた線との衝突
  for(const line of sim.lines){
    for(const seg of lineSegments(line)){
      const r = resolveCircleSegment(b.x, b.y, b.vx, b.vy, b.radius, seg.x1, seg.y1, seg.x2, seg.y2,
        seg.halfThickness, seg.restitution, seg.friction, 0, 0);
      if(r){
        b.x = r.x; b.y = r.y; b.vx = r.vx; b.vy = r.vy;
        events.push({ type: "hit", kind: "line", x: b.x, y: b.y });
      }
    }
  }

  // ゴール判定
  if(sim.goal){
    const d = Math.hypot(b.x - sim.goal.x, b.y - sim.goal.y);
    if(d < b.radius + sim.goal.r){
      sim.finished = "goal";
      events.push({ type: "goal" });
      return events;
    }
  }

  // 画面外（落下エリア）判定
  const margin = b.radius + 4;
  if(b.x < -margin || b.x > sim.world.w + margin || b.y > sim.world.h + margin || b.y < -sim.world.h){
    sim.finished = "fail";
    events.push({ type: "fail", reason: "outofbounds" });
    return events;
  }

  // 静止（スタック）判定：細かい振動で永遠に終わらないようにする
  const spd = Math.hypot(b.vx, b.vy);
  if(spd < SLEEP_SPEED){
    sim.sleepTimer += dt;
    if(sim.sleepTimer > SLEEP_TIME){
      b.vx = 0; b.vy = 0; // 完全停止させ、細かい振動を止める
      sim.stuckTimer += dt;
      if(sim.stuckTimer > STUCK_FAIL_TIME){
        sim.finished = "fail";
        events.push({ type: "fail", reason: "stuck" });
        return events;
      }
    }
  } else {
    sim.sleepTimer = 0;
    sim.stuckTimer = 0;
  }

  if(sim.time > MAX_FLIGHT_TIME){
    sim.finished = "fail";
    events.push({ type: "fail", reason: "timeout" });
  }

  return events;
}

// 表示用：障害物の現在ジオメトリ（動く壁のアニメーション込み）をまとめて返す
export function obstacleRenderState(obstacles, t){
  return obstacles.map(ob => {
    if(ob.type === "spike") return { ob, segs: [] };
    return { ob, segs: obstacleSegments(ob, t) };
  });
}
