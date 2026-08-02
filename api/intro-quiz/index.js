// イントロドン（曲当てクイズ）関連のAPIをまとめた単一エンドポイント。
// Vercel Hobbyプラン（Serverless Functions 12個まで）の上限に収めるため、
// 旧 start.js / answer.js / artists.js / confirm.js / reveal.js の5ファイルを
// この1ファイルに統合し、body.action で処理を振り分ける。
// 各アクションの実装内容そのものは統合前と同一（ロジックの変更はしていない）。
const { verifyFirebaseIdToken, getAdmin } = require("../_lib/firebaseAdmin");
const { pickSong, getArtists } = require("../_lib/introQuizSongsRepo");
const { matchAnswer } = require("../_lib/textMatch");
const { finalizeSession, SESSION_TTL_MS, MAX_ATTEMPTS_PER_SESSION } = require("../_lib/introQuizDaily");

const MATCH_FIELDS = ["title", "titleKana", "titleRomaji", "titleEn"];
// 自動正解には届かないが、読みがある程度近い場合は確認を出す。
// 音声認識の1〜2文字の聞き違いを救いつつ、短い別タイトルの誤正解は避ける。
const SUGGEST_THRESHOLD = 0.65;

// 「イントロドンに挑戦」ボタン（モード選択後）を押した直後に呼ばれる処理。
// 出題モード（mode: "random" | "artist"）に応じてサーバー側で出題曲を1曲選び、
// 再生用のvideoId・sessionIdだけをフロントへ返す（正解曲の情報は一切含めない）。
async function handleStart(req, res, uid, admin, body) {
  const mode = body.mode === "artist" ? "artist" : "random";
  const artist = mode === "artist" && typeof body.artist === "string" ? body.artist.trim().slice(0, 80) : "";
  if (mode === "artist" && !artist) {
    res.status(400).json({ error: "bad-request" });
    return;
  }

  const db = admin.firestore();
  let song;
  try {
    song = await pickSong(db, { mode, artist });
  } catch (e) {
    console.error("intro-quiz start: failed to pick song:", e);
    res.status(500).json({ error: "internal-error" });
    return;
  }

  if (!song) {
    // 出題できる曲が無い（アーティスト指定で0曲だった場合を含む）→ イベント自体を発生させない
    res.status(200).json({ ok: true, available: false });
    return;
  }

  const sessionId = "iq" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const match = {};
  for (const f of MATCH_FIELDS) match[f] = song[f] || "";

  try {
    await db.collection("introQuizSessions").doc(sessionId).set({
      uid,
      videoId: song.videoId,
      title: song.title,
      artist: song.artist || "",
      match,
      mode,
      artistFilter: artist,
      used: false,
      attempts: 0,
      pendingSuggestion: null,
      createdAt: Date.now(),
    });
  } catch (e) {
    console.error("intro-quiz start: failed to create session:", e);
    res.status(500).json({ error: "internal-error" });
    return;
  }

  res.status(200).json({
    ok: true,
    available: true,
    sessionId,
    videoId: song.videoId,
  });
}

// ユーザーがテキスト入力欄に曲名を入力して送信したときに呼ばれる処理。
// レーベンシュタイン距離ベースの類似度判定（api/_lib/textMatch.js）で
// 完全一致／「もしかして」サジェスト／不正解の3パターンに振り分ける。
async function handleAnswer(req, res, uid, admin, body) {
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : "";
  const answerText = typeof body.answerText === "string" ? body.answerText.slice(0, 200) : "";
  const answerAlternatives = Array.isArray(body.answerAlternatives)
    ? body.answerAlternatives
      .filter((value) => typeof value === "string")
      .slice(0, 8)
      .map((value) => value.slice(0, 200).trim())
      .filter(Boolean)
    : [];
  const answerTexts = Array.from(new Set([answerText.trim(), ...answerAlternatives].filter(Boolean)));
  if (!sessionId || !answerTexts.length) {
    res.status(400).json({ error: "bad-request" });
    return;
  }

  const db = admin.firestore();
  const sessionRef = db.collection("introQuizSessions").doc(sessionId);

  try {
    const result = await db.runTransaction(async (tx) => {
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists) {
        const e = new Error("session-not-found"); e.statusCode = 404; throw e;
      }
      const session = sessionSnap.data();
      if (session.uid !== uid) {
        // 他人のセッションIDを流用しようとした場合も「見つからない」と同じ扱いにする
        const e = new Error("session-not-found"); e.statusCode = 404; throw e;
      }
      if (session.used) {
        const e = new Error("session-already-used"); e.statusCode = 409; throw e;
      }
      if (Date.now() - session.createdAt > SESSION_TTL_MS) {
        const e = new Error("session-expired"); e.statusCode = 410; throw e;
      }

      const attempts = (session.attempts || 0) + 1;
      const candidates = MATCH_FIELDS
        .map((f) => ({ field: f, value: session.match && session.match[f] }))
        .filter((c) => c.value);
      // SpeechRecognitionは複数の変換候補を返す。先頭が誤った漢字でも、別候補の
      // ひらがな・カタカナ読みが合っていれば正解にできるよう全候補を比較する。
      const matches = answerTexts.map((text) => matchAnswer(text, candidates));
      const match = matches.reduce((best, current) => {
        if (current.exact !== best.exact) return current.exact ? current : best;
        if (current.confident !== best.confident) return current.confident ? current : best;
        return current.score > best.score ? current : best;
      });

      if (match.exact || match.confident) {
        const fin = await finalizeSession(tx, db, { uid, sessionRef, correct: true });
        return {
          done: true, correct: true, bp: fin.reward.bp, ac: fin.reward.ac, capReached: fin.capReached,
          videoId: session.videoId, title: session.title, artist: session.artist,
        };
      }

      if (match.score >= SUGGEST_THRESHOLD) {
        tx.set(sessionRef, { attempts, pendingSuggestion: { title: session.title, score: match.score } }, { merge: true });
        return {
          done: false, status: "suggest",
          suggestedTitle: session.title, suggestedArtist: session.artist, score: match.score,
        };
      }

      if (attempts >= MAX_ATTEMPTS_PER_SESSION) {
        // 試行回数の上限に達した→強制的に答えを開示して確定する（不正解扱い、報酬なし）
        const fin = await finalizeSession(tx, db, { uid, sessionRef, correct: false });
        return {
          done: true, correct: false, bp: 0, ac: 0, capReached: fin.capReached,
          videoId: session.videoId, title: session.title, artist: session.artist,
        };
      }

      tx.set(sessionRef, { attempts }, { merge: true });
      return { done: false, status: "incorrect", attemptsLeft: MAX_ATTEMPTS_PER_SESSION - attempts };
    });

    res.status(200).json(Object.assign({ ok: true }, result));
  } catch (e) {
    const statusCode = e.statusCode || 500;
    if (statusCode >= 500) console.error("intro-quiz answer error:", e);
    res.status(statusCode).json({ error: e.message || "internal-error" });
  }
}

// answerが「もしかして」サジェスト（status:"suggest"）を返したあと、
// ユーザーがその提案を受け入れる／拒否するときに呼ばれる処理。
// 正解の曲名はクライアントから受け取らず、必ずセッションに保存済みの
// pendingSuggestionを使う（クライアントが任意の曲名を送りつけて正解にすることを防ぐ）。
async function handleConfirm(req, res, uid, admin, body) {
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : "";
  const accept = body.accept === true;
  if (!sessionId) {
    res.status(400).json({ error: "bad-request" });
    return;
  }

  const db = admin.firestore();
  const sessionRef = db.collection("introQuizSessions").doc(sessionId);

  try {
    const result = await db.runTransaction(async (tx) => {
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists) {
        const e = new Error("session-not-found"); e.statusCode = 404; throw e;
      }
      const session = sessionSnap.data();
      if (session.uid !== uid) {
        const e = new Error("session-not-found"); e.statusCode = 404; throw e;
      }
      if (session.used) {
        const e = new Error("session-already-used"); e.statusCode = 409; throw e;
      }
      if (!session.pendingSuggestion) {
        const e = new Error("no-pending-suggestion"); e.statusCode = 409; throw e;
      }
      if (Date.now() - session.createdAt > SESSION_TTL_MS) {
        const e = new Error("session-expired"); e.statusCode = 410; throw e;
      }

      if (accept) {
        const fin = await finalizeSession(tx, db, { uid, sessionRef, correct: true });
        return {
          done: true, correct: true, bp: fin.reward.bp, ac: fin.reward.ac, capReached: fin.capReached,
          videoId: session.videoId, title: session.title, artist: session.artist,
        };
      }

      const attempts = session.attempts || 0;
      if (attempts >= MAX_ATTEMPTS_PER_SESSION) {
        const fin = await finalizeSession(tx, db, { uid, sessionRef, correct: false });
        return {
          done: true, correct: false, bp: 0, ac: 0, capReached: fin.capReached,
          videoId: session.videoId, title: session.title, artist: session.artist,
        };
      }

      tx.set(sessionRef, { pendingSuggestion: null }, { merge: true });
      return { done: false, status: "incorrect", attemptsLeft: MAX_ATTEMPTS_PER_SESSION - attempts };
    });

    res.status(200).json(Object.assign({ ok: true }, result));
  } catch (e) {
    const statusCode = e.statusCode || 500;
    if (statusCode >= 500) console.error("intro-quiz confirm error:", e);
    res.status(statusCode).json({ error: e.message || "internal-error" });
  }
}

// 「諦めて答えを見る」ボタンから呼ばれる処理。セッションを不正解として確定し
// （報酬なし）、正解の曲名・動画を開示する。
async function handleReveal(req, res, uid, admin, body) {
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : "";
  if (!sessionId) {
    res.status(400).json({ error: "bad-request" });
    return;
  }

  const db = admin.firestore();
  const sessionRef = db.collection("introQuizSessions").doc(sessionId);

  try {
    const result = await db.runTransaction(async (tx) => {
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists) {
        const e = new Error("session-not-found"); e.statusCode = 404; throw e;
      }
      const session = sessionSnap.data();
      if (session.uid !== uid) {
        const e = new Error("session-not-found"); e.statusCode = 404; throw e;
      }
      if (session.used) {
        const e = new Error("session-already-used"); e.statusCode = 409; throw e;
      }
      if (Date.now() - session.createdAt > SESSION_TTL_MS) {
        const e = new Error("session-expired"); e.statusCode = 410; throw e;
      }

      const fin = await finalizeSession(tx, db, { uid, sessionRef, correct: false });
      return {
        done: true, correct: false, bp: 0, ac: 0, capReached: fin.capReached,
        videoId: session.videoId, title: session.title, artist: session.artist,
      };
    });

    res.status(200).json(Object.assign({ ok: true }, result));
  } catch (e) {
    const statusCode = e.statusCode || 500;
    if (statusCode >= 500) console.error("intro-quiz reveal error:", e);
    res.status(statusCode).json({ error: e.message || "internal-error" });
  }
}

// イントロドンのモード選択画面（「歌手を選ぶ」モード）で使う、出題可能な
// アーティスト一覧を返す処理。曲数（count）も一緒に返す。
async function handleArtists(req, res, uid, admin) {
  let artists = [];
  try {
    artists = await getArtists(admin.firestore());
  } catch (e) {
    console.error("intro-quiz artists: fetch failed:", e);
  }
  res.status(200).json({ ok: true, artists });
}

const ACTIONS = {
  start: handleStart,
  answer: handleAnswer,
  confirm: handleConfirm,
  reveal: handleReveal,
  artists: handleArtists,
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }

  const body = req.body || {};
  const handler = ACTIONS[body.action];
  if (!handler) {
    res.status(400).json({ error: "unknown-action" });
    return;
  }

  let uid;
  try {
    uid = await verifyFirebaseIdToken(req);
  } catch (e) {
    res.status(e.statusCode || 401).json({ error: e.message });
    return;
  }

  let admin;
  try {
    admin = getAdmin();
  } catch (e) {
    console.error("intro-quiz: admin init failed:", e);
    res.status(500).json({ error: "server-misconfigured" });
    return;
  }

  await handler(req, res, uid, admin, body);
};
