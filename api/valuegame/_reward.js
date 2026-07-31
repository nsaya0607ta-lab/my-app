// POST /api/valuegame?action=reward
//   body: { gameId, mode, difficulty, rounds, clearedRounds, answeredRounds,
//           success, perfect, livesLeft, roomId, opponentIds:[uid,...] }
//
// 価値観ゲームのBP付与を判定する唯一の場所。クライアントは「このゲームが
// 終わった」という事実だけを送り、金額の計算・上限・二重付与の判定はすべて
// ここで行う（クライアントが金額を送ってきても採用しない）。
//
// 実装している不正防止：
//   ・ゲームIDでの二重付与防止 … users/{uid}/bpGrants/{gameId} の存在チェックと
//     書き込みをトランザクション内で不可分に行う。同じ結果を何度送っても
//     2回目以降は 409 を返して1BPも増えない。
//   ・1日のゲームBP上限     … users/{uid}/bpDaily/{JSTの日付} に当日の累計を持ち、
//     上限を超える分は切り詰める。
//   ・開始直後の退出・放置   … answeredRounds が0のときは参加報酬も付けない。
//   ・同じ相手との短時間の連続プレイ … 直近の対戦相手を記録しておき、
//     一定時間内に同じ相手と再度遊んだ場合は報酬を減額する。
//   ・オンラインの成否は自己申告を信用しない … roomId があるときは、
//     サーバーが管理しているルームの状態（lives/clearedRounds）で上書き検証する。
//   ・「フレンドとプレイ」の水増し防止 … 同席者のうち、実際にフレンド登録が
//     成立している相手がいる場合だけボーナスを付ける（vgFriends を参照）。
//
// 付与理由とゲームIDは users/{uid}/bpGrants に残るため、後から履歴を追える。
const { verifyFirebaseIdToken, getAdmin } = require("../_lib/firebaseAdmin");
const {
  VG_DAILY_CAP, VG_REPEAT_WINDOW_MS, applyDailyCap, buildRewards, jstDateKey,
} = require("../_lib/vgRewards");

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
  const gameId = String(body.gameId || "").slice(0, 64);
  if (!gameId) {
    res.status(400).json({ error: "invalid-game-id", message: "ゲームIDがありません。" });
    return;
  }
  const roomId = String(body.roomId || "").slice(0, 64);
  const opponentIds = Array.isArray(body.opponentIds)
    ? body.opponentIds.map((x) => String(x).slice(0, 64)).filter((x) => x && x !== uid).slice(0, 16)
    : [];

  let db;
  try {
    db = getAdmin().firestore();
  } catch (e) {
    console.error("valuegame reward: admin init failed:", e);
    res.status(500).json({ error: "server-misconfigured", message: "サーバー設定に問題があります。" });
    return;
  }

  const dateKey = jstDateKey();
  const userRef = db.collection("users").doc(uid);
  const grantRef = userRef.collection("bpGrants").doc(gameId);
  const dailyRef = userRef.collection("bpDaily").doc(dateKey);
  const roomRef = roomId ? db.collection("vgRooms").doc(roomId) : null;

  try {
    const result = await db.runTransaction(async (tx) => {
      // 1) 同じゲームIDで既に付与済みなら、ここで打ち切る（二重送信対策）
      const grantSnap = await tx.get(grantRef);
      if (grantSnap.exists) {
        const e = new Error("already-granted"); e.statusCode = 409; throw e;
      }

      const dailySnap = await tx.get(dailyRef);
      const daily = dailySnap.exists ? (dailySnap.data() || {}) : {};
      const alreadyToday = Math.max(0, Number(daily.gameBP) || 0);

      // 2) オンラインの場合、勝敗はクライアントの申告ではなくルームの実状態で決める
      let success = !!body.success;
      let perfect = !!body.perfect;
      let finished = !!body.success || Number(body.clearedRounds || 0) > 0 || Number(body.answeredRounds || 0) > 0;
      let answeredRounds = Math.max(0, Math.min(5, Number(body.answeredRounds) || 0));
      let withFriend = false;
      let friendCheckRefs = [];

      if (roomRef) {
        const roomSnap = await tx.get(roomRef);
        if (roomSnap.exists) {
          const room = roomSnap.data() || {};
          const players = (room.players || []).filter((p) => p && !p.spectator);
          if (!players.some((p) => p.id === uid)) {
            const e = new Error("not-a-player"); e.statusCode = 403; throw e;
          }
          // 「フレンドとプレイ」は、実際にフレンド登録が成立している相手と
          // 遊んだ場合だけ対象にする。以前は「自分以外の実プレイヤーがいれば」
          // という判定だったため、初対面の人と遊んでもボーナスが入っていた。
          // フレンド関係は vgFriends の1件（2人で共有）で表すので、
          // 同席者ぶんのIDを組み立ててまとめて確認する。
          friendCheckRefs = players
            .map((p) => p.id)
            .filter((id) => id && id !== uid)
            .map((id) => db.collection("vgFriends").doc([uid, id].sort().join("__")));
          // 成功＝「ライフが0になる前に規定ラウンドを最後までやり切った」。
          // 途中のラウンドで順番を外してライフが減っていても、最後まで
          // ライフが残っていればクリア扱い（協力ゲームとしての標準的なルール）。
          // パーフェクトの方は一度もライフを失っていないことが条件。
          success = (room.lives || 0) > 0 && (room.round || 0) >= (room.rounds || 0) && room.status === "finished";
          perfect = success && room.perfect !== false;
          finished = room.status === "finished" || (room.lives || 0) <= 0;
          // 放置判定に使うのは「進んだラウンド数」。クリア数だと、失敗続きの
          // 人が放置扱いになってしまう
          answeredRounds = Math.max(answeredRounds, Number(room.round) || 0);
        }
      }

      // 3) 同席者のうち、実際にフレンドが成立している人がいるかを確認する。
      // トランザクション内の読み取りは書き込みより前に済ませる必要があるため、
      // ここでまとめて取得する（vgFriends は Admin SDK からのみ触る）。
      for (const ref of friendCheckRefs) {
        const snap = await tx.get(ref);
        if (snap.exists && (snap.data() || {}).status === "accepted") { withFriend = true; break; }
      }

      // 4) 本日の初勝利かどうか（当日の記録で判定する）
      const firstWinToday = success && !daily.wonToday;

      // 5) 同じ相手との短時間の連続プレイなら減額する
      const recent = (daily.recentOpponents && typeof daily.recentOpponents === "object") ? daily.recentOpponents : {};
      const now = Date.now();
      const repeat = opponentIds.some((id) => {
        const at = Number(recent[id]) || 0;
        return at > 0 && (now - at) < VG_REPEAT_WINDOW_MS;
      });

      const raw = buildRewards({ answeredRounds, finished, success, perfect, firstWinToday, withFriend, repeat });
      const capped = applyDailyCap(raw, alreadyToday);

      // 6) 記録（付与額が0でも「このゲームIDは処理済み」として必ず残す）
      tx.set(grantRef, {
        gameId,
        mode: String(body.mode || "solo").slice(0, 16),
        difficulty: String(body.difficulty || "normal").slice(0, 16),
        roomId,
        items: capped.items,
        total: capped.total,
        success, perfect, finished, answeredRounds, repeat, withFriend,
        dateKey,
        at: new Date().toISOString(),
      });

      const nextRecent = { ...recent };
      opponentIds.forEach((id) => { nextRecent[id] = now; });
      // 記録が増え続けないよう、直近16人ぶんだけ残す
      const trimmed = Object.entries(nextRecent)
        .sort((a, b) => b[1] - a[1]).slice(0, 16)
        .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {});

      tx.set(dailyRef, {
        dateKey,
        gameBP: alreadyToday + capped.total,
        wonToday: !!daily.wonToday || success,
        recentOpponents: trimmed,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      return { items: capped.items, total: capped.total, capped: capped.capped, dailyCap: VG_DAILY_CAP };
    });

    res.status(200).json(result);
  } catch (e) {
    const code = e.statusCode || 500;
    if (code >= 500) console.error("valuegame reward failed:", e);
    const messages = {
      409: "このゲームのBPは受け取り済みです。",
      403: "このルームのプレイヤーではありません。",
    };
    res.status(code).json({ error: e.message, message: messages[code] || "BPの付与に失敗しました。" });
  }
};
