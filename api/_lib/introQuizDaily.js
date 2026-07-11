// イントロドンの「1日3回まで」報酬ロジックと、セッション確定処理の共通部分。
// answer.js（即正解／試行回数上限での強制開示）・confirm.js（サジェスト確定）・
// reveal.js（諦めて開示）の3つのエンドポイントから共通で呼び出す。
//
// 日次の挑戦回数は Firestore ドキュメントID `${uid}_${dateKey}` で管理しており、
// ユーザーごと・日付ごとに完全に独立している（全ユーザー共通のグローバルな
// カウンターではない）。dateKeyはUTCではなく日本時間基準で区切ることで、
// 日本時間の深夜0時〜9時台に「日付が前日のまま」ズレる問題を避けている。
const { FieldValue } = require("firebase-admin/firestore");

// セッションの有効期限。開始から長時間放置された回答（＝別タブで使い回す等）を
// 無効化するための保険で、通常のプレイでは問題にならない長さにする
const SESSION_TTL_MS = 10 * 60 * 1000;

// 自由記述の回答は入力ミスもあり得るため複数回の再入力を許容するが、無制限だと
// 総当たりで正解を探られてしまうため、1プレイ（1セッション）あたりの送信回数
// に上限を設ける。上限に達したら自動的に「諦めて開示」と同じ扱いにする
const MAX_ATTEMPTS_PER_SESSION = 5;

function jstDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

// その日の何回目の挑戦（＝セッション）かに応じた報酬（正解時のみ加算される）
//   1回目: 50BP + 10AC / 2〜3回目: 50BPのみ / 4回目以降: 0BP・0AC
function rewardForAttempt(attemptNumber) {
  if (attemptNumber === 1) return { bp: 50, ac: 10 };
  if (attemptNumber === 2 || attemptNumber === 3) return { bp: 50, ac: 0 };
  return { bp: 0, ac: 0 };
}

// セッションを「使用済み」として確定する。1セッション＝1プレイに対し必ず1回だけ
// 呼ばれる想定（呼び出し側は同じFirestoreトランザクション内で事前に
// session.used===false を確認していること）。正解時のみ、その日の挑戦回数に
// 応じた報酬をユーザーへ加算する。
async function finalizeSession(tx, db, { uid, sessionRef, correct }) {
  const dateKey = jstDateKey(new Date());
  const dailyRef = db.collection("introQuizDaily").doc(`${uid}_${dateKey}`);
  const userRef = db.collection("users").doc(uid);

  const dailySnap = await tx.get(dailyRef);
  const attemptNumber = (dailySnap.exists ? (dailySnap.data().count || 0) : 0) + 1;
  const reward = correct ? rewardForAttempt(attemptNumber) : { bp: 0, ac: 0 };

  tx.set(sessionRef, { used: true, answeredAt: Date.now(), pendingSuggestion: null }, { merge: true });
  tx.set(dailyRef, { uid, dateKey, count: attemptNumber, updatedAt: Date.now() }, { merge: true });
  if (reward.bp > 0 || reward.ac > 0) {
    tx.set(userRef, {
      coins: FieldValue.increment(reward.ac),
      introQuizBp: FieldValue.increment(reward.bp),
    }, { merge: true });
  }

  return { attemptNumber, reward, capReached: attemptNumber >= 4 };
}

module.exports = { jstDateKey, rewardForAttempt, finalizeSession, SESSION_TTL_MS, MAX_ATTEMPTS_PER_SESSION };
