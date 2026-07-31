// POST /api/valuegame?action=reveal  body: { roomId, round, order:[cardId,...] }
//
// 数字の公開。ここではじめて全員ぶんの数字がクライアントへ返る。
// 並べ替えの単位はプレイヤーではなくカード（2〜3人なら1人2枚ある）。
//
// 公開してよいかの判定はすべてサーバー側で行う：
//   ・呼び出した人がそのルームのプレイヤーであること
//   ・そのラウンドの数字が既に配られていること
//   ・すべてのカードの回答が確定していること（＝まだ考えている人がいる間は返さない）
// これを満たさない限り、たとえリクエストを偽装しても数字は返らない。
//
// 判定結果（成功／失敗・残りライフ）もサーバーが計算してルームへ書き込むため、
// クライアントが「成功した」と偽ってもBPの判定には影響しない。
const { verifyFirebaseIdToken, getAdmin } = require("../_lib/firebaseAdmin");
const { decryptJSON } = require("../_lib/vgCrypto");

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
  const order = Array.isArray(body.order) ? body.order.map((x) => String(x).slice(0, 64)) : [];
  if (!roomId) {
    res.status(400).json({ error: "invalid-room", message: "ルームが指定されていません。" });
    return;
  }

  let db;
  try {
    db = getAdmin().firestore();
  } catch (e) {
    console.error("valuegame reveal: admin init failed:", e);
    res.status(500).json({ error: "server-misconfigured", message: "サーバー設定に問題があります。" });
    return;
  }

  const roomRef = db.collection("vgRooms").doc(roomId);
  const secretRef = db.collection("vgSecrets").doc(`${roomId}_${round}`);

  try {
    const result = await db.runTransaction(async (tx) => {
      const roomSnap = await tx.get(roomRef);
      if (!roomSnap.exists) { const e = new Error("room-not-found"); e.statusCode = 404; throw e; }
      const room = roomSnap.data() || {};
      const players = (room.players || []).filter((p) => p && !p.spectator);
      if (!players.some((p) => p.id === uid)) { const e = new Error("not-a-player"); e.statusCode = 403; throw e; }

      // 既に公開済みなら、その結果をそのまま返す（二重公開・再接続への対応）
      if (room.revealed && room.revealed.round === round) {
        return room.revealed;
      }

      const secretSnap = await tx.get(secretRef);
      if (!secretSnap.exists) { const e = new Error("not-dealt"); e.statusCode = 409; throw e; }
      const payload = decryptJSON((secretSnap.data() || {}).enc);
      const numbers = payload.numbers || {};
      // カードの一覧は配布時のもの（暗号化して保管したもの）を正とする。
      // cards を持たない古い形式は「1人1枚・カードID＝UID」として扱う
      const cards = (Array.isArray(payload.cards) && payload.cards.length)
        ? payload.cards
        : players.map((p) => ({ id: p.id, ownerId: p.id, index: 0 }));

      const answers = room.answers || {};
      const missing = cards.filter((c) => !answers[c.id]);
      if (missing.length) {
        const e = new Error("not-all-answered"); e.statusCode = 409; throw e;
      }

      // 並び順は「送られてきた順」をそのまま使うが、カードの集合が一致するかは
      // サーバー側で検証する（存在しないIDや重複を混ぜられないように）
      const ids = cards.map((c) => c.id);
      const cleaned = order.filter((id, i) => ids.includes(id) && order.indexOf(id) === i);
      const finalOrder = cleaned.length === ids.length ? cleaned : ids.slice();

      let ok = true;
      for (let i = 0; i < finalOrder.length - 1; i++) {
        if (numbers[finalOrder[i]] > numbers[finalOrder[i + 1]]) { ok = false; break; }
      }

      const trueOrder = ids.slice().sort((a, b) => numbers[a] - numbers[b]);
      const trueRankOf = {};
      trueOrder.forEach((id, i) => { trueRankOf[id] = i + 1; });

      const ownerOf = {};
      cards.forEach((c) => { ownerOf[c.id] = c.ownerId; });
      const cardIndexOf = {};
      cards.forEach((c) => { cardIndexOf[c.id] = Number(c.index) || 0; });

      const rows = finalOrder.map((id, i) => {
        const p = players.find((x) => x.id === ownerOf[id]) || {};
        return {
          cardId: id,
          cardIndex: cardIndexOf[id] || 0,
          playerId: ownerOf[id] || id,
          name: p.name || "",
          answer: answers[id] || "",
          number: numbers[id],
          guessRank: i + 1,
          trueRank: trueRankOf[id],
        };
      }).sort((a, b) => a.number - b.number);

      // 価値観のズレ（0〜100）
      const n = rows.length;
      const sum = rows.reduce((s, r) => s + Math.abs(r.guessRank - r.trueRank), 0);
      const max = n < 2 ? 1 : (n % 2 === 0 ? (n * n / 2) : ((n * n - 1) / 2));
      const gap = Math.round(sum / max * 100);

      const lives = ok ? (room.lives || 0) : Math.max(0, (room.lives || 0) - 1);
      const clearedRounds = (room.clearedRounds || 0) + (ok ? 1 : 0);
      const revealed = { round, ok, gap, rows, finalOrder, at: new Date().toISOString() };

      tx.set(roomRef, {
        phase: "reveal",
        revealed,
        lives,
        clearedRounds,
        perfect: (room.perfect !== false) && ok,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      return revealed;
    });

    res.status(200).json(result);
  } catch (e) {
    const code = e.statusCode || 500;
    if (code >= 500) console.error("valuegame reveal failed:", e);
    const messages = {
      404: "ルームが見つかりませんでした。",
      403: "このルームのプレイヤーではありません。",
      409: e.message === "not-all-answered"
        ? "まだ全員の回答がそろっていません。"
        : "このラウンドの数字がまだ配られていません。",
    };
    res.status(code).json({ error: e.message, message: messages[code] || "公開に失敗しました。もう一度お試しください。" });
  }
};
