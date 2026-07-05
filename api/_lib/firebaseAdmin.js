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

  // Admin SDKの初期化失敗（環境変数の設定ミス等）は「トークンが不正」とは
  // 別の問題のため、401ではなく500として区別する。ここを分けないと、環境
  // 変数の設定ミスがクライアント側には「連携に失敗しました」としか見えず
  // 原因究明ができなくなる。
  let adminApp;
  try {
    adminApp = getAdmin();
  } catch (e) {
    console.error("firebase admin init failed:", e);
    const err = new Error("server-misconfigured: " + e.message);
    err.statusCode = 500;
    throw err;
  }

  try {
    const decoded = await adminApp.auth().verifyIdToken(m[1]);
    return decoded.uid;
  } catch (e) {
    console.error("verifyIdToken failed:", e.message);
    const err = new Error("invalid-id-token: " + e.message);
    err.statusCode = 401;
    throw err;
  }
}

module.exports = { getAdmin, verifyFirebaseIdToken };
