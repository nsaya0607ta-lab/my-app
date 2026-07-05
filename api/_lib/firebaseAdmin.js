const admin = require("firebase-admin");

// Firebase Admin SDKの初期化はサーバーレス関数のコールドスタートごとに
// 一度だけ行えばよい（admin.apps に既存インスタンスがあれば使い回す）。
// サービスアカウントの認証情報はVercelの環境変数から読み込む：
//   FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
// FIREBASE_PRIVATE_KEY はVercelのUI上で改行がリテラルの "\n" として
// 保存されがちなため、ここで実際の改行に戻す。
function getAdmin() {
  if (!admin.apps.length) {
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
  }
  return admin;
}

// リクエストの Authorization: Bearer <FirebaseのIDトークン> を検証し、
// 対応するFirebase UIDを返す。フロントエンドは常に
// state.currentUser.getIdToken() で取得した最新のIDトークンをこのヘッダに
// 載せて各 /api/google/* エンドポイントを呼び出す。
async function verifyFirebaseIdToken(req) {
  const authHeader = req.headers.authorization || "";
  const m = /^Bearer (.+)$/.exec(authHeader);
  if (!m) {
    const err = new Error("missing-id-token");
    err.statusCode = 401;
    throw err;
  }
  try {
    const decoded = await getAdmin().auth().verifyIdToken(m[1]);
    return decoded.uid;
  } catch (e) {
    const err = new Error("invalid-id-token");
    err.statusCode = 401;
    throw err;
  }
}

module.exports = { getAdmin, verifyFirebaseIdToken };
