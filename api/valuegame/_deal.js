// POST /api/valuegame?action=deal  body: { roomId, round }
//
// ラウンド開始時に1〜100の数字を全員へ配る。
//
// ★このエンドポイントが返すのは「呼び出した本人の数字」だけ。
// 全員ぶんの数字は暗号化して vgSecrets/{roomId}_{round} に保管し、
// 公開のタイミング（/api/valuegame?action=reveal）まで誰にも返さない。
// ルームドキュメント（クライアントが読めるvgRooms）には数字を一切書かない。
//
// 同じラウンドに対して複数人が同時に呼んでも配り直しが起きないよう、
// 配布はトランザクション内で「まだ配っていない場合だけ」行う。
const { verifyFirebaseIdToken, getAdmin } = require("../_lib/firebaseAdmin");
const { encryptJSON, decryptJSON } = require("../_lib/vgCrypto");

const MIN_NUMBER = 1;
const MAX_NUMBER = 100;

// お題は各ラウンドでサーバーが選ぶ（クライアントが選ぶと、配られた数字と
// 都合のよいお題を組み合わせられてしまうため）
const TOPIC_IDS = [
  "want", "scary", "happy", "food", "place", "animal", "cert", "app", "dayoff",
  "hype", "gift", "hardwork", "house", "reliable", "studyhard", "morning",
  "chappy", "nostalgic", "relax", "annoying", "luxury", "skill", "sound",
  "hot", "brave", "smell", "fast", "childhood", "hobby", "meeting", "sweet",
  "expensive", "quiet", "helpful", "tired", "cute", "wait", "teamwork",
  "weather", "message",
];

function dealNumbers(n) {
  const pool = [];
  for (let i = MIN_NUMBER; i <= MAX_NUMBER; i++) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  return pool.slice(0, Math.max(0, n));
}

function pickTopic(used) {
  const fresh = TOPIC_IDS.filter((t) => !(used || []).includes(t));
  const from = fresh.length ? fresh : TOPIC_IDS;
  return from[Math.floor(Math.random() * from.length)];
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }

  let uid;
  try {
    uid = await verifyFirebaseIdToken(req);
  } catch (e) {
    res.status(e.statusCode || 401).json({ error: e.message });
    return;
  }

  const body = req.body || {};
  const roomId = String(body.roomId || "").slice(0, 64);
  const round = Math.max(1, Math.min(5, Number(body.round) || 1));
  if (!roomId) {
    res.status(400).json({ error: "invalid-room", message: "ルームが指定されていません。" });
    return;
  }

  let db;
  try {
    db = getAdmin().firestore();
  } catch (e) {
    console.error("valuegame deal: admin init failed:", e);
    res.status(500).json({ error: "server-misconfigured", message: "サーバー設定に問題があります。" });
    return;
  }

  const roomRef = db.collection("vgRooms").doc(roomId);
  const secretRef = db.collection("vgSecrets").doc(`${roomId}_${round}`);

  try {
    const result = await db.runTransaction(async (tx) => {
      const roomSnap = await tx.get(roomRef);
      if (!roomSnap.exists) {
        const err = new Error("room-not-found"); err.statusCode = 404; throw err;
      }
      const room = roomSnap.data() || {};
      const players = (room.players || []).filter((p) => p && !p.spectator);
      const me = players.find((p) => p.id === uid);
      if (!me) {
        // 観戦者・部外者には数字を配らない（数字を得る手段そのものを与えない）
        const err = new Error("not-a-player"); err.statusCode = 403; throw err;
      }

      const secretSnap = await tx.get(secretRef);
      if (secretSnap.exists) {
        // 既に配布済み：本人の数字だけ返す（再接続・ページ更新からの復帰もここを通る）
        const payload = decryptJSON((secretSnap.data() || {}).enc);
        return { myNumber: payload.numbers[uid], topicId: payload.topicId, redealt: false };
      }

      // このラウンドの数字とお題を決める
      const ids = players.map((p) => p.id);
      const nums = dealNumbers(ids.length);
      const numbers = {};
      ids.forEach((id, i) => { numbers[id] = nums[i]; });
      const topicId = pickTopic(room.usedTopicIds || []);

      tx.set(secretRef, {
        roomId, round,
        enc: encryptJSON({ numbers, topicId }),
        createdAt: new Date().toISOString(),
      });

      // ルームドキュメントには「配り終えた」ことと、全員に見せてよい情報だけを書く。
      // numbers は絶対に含めない
      tx.set(roomRef, {
        status: "playing",
        gameId: room.gameId || `vg${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
        round,
        topicId,
        phase: "answer",
        answers: {},
        votes: {},
        finalOrder: [],
        revealed: null,
        usedTopicIds: [...(room.usedTopicIds || []), topicId],
        roundStartedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      return { myNumber: numbers[uid], topicId, redealt: true };
    });

    res.status(200).json(result);
  } catch (e) {
    const code = e.statusCode || 500;
    if (code >= 500) console.error("valuegame deal failed:", e);
    res.status(code).json({
      error: e.message,
      message: code === 404 ? "ルームが見つかりませんでした。"
        : code === 403 ? "このルームのプレイヤーではありません。"
        : "配布に失敗しました。もう一度お試しください。",
    });
  }
};
