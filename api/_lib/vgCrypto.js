// 🃏 価値観ゲーム：各プレイヤーの数字を「サーバーだけが読める形」で保管するための暗号化。
//
// なぜ暗号化するのか
//   このゲームは「他人の数字が公開前に分かってはいけない」ことがルールの根幹。
//   Firestoreのルームドキュメントには数字を一切書かず、配った数字はここで
//   暗号化してから vgSecrets コレクションへ保管する。こうしておけば、
//   ・クライアントはそもそもルームドキュメントから数字を読めない
//   ・仮に vgSecrets のドキュメントを読めたとしても中身は暗号文
//   となり、Firestoreのセキュリティルールの設定に依存せず秘匿できる。
//
// 鍵の出どころ
//   VG_SECRET_KEY が設定されていればそれを使う。未設定の場合は、サーバー
//   専用の環境変数である FIREBASE_PRIVATE_KEY から鍵を導出する（この値は
//   もともとサーバーにしか無い秘密なので、新しい環境変数を追加しなくても
//   安全に運用できる）。どちらも無い場合は例外を投げ、配布処理自体を止める
//   （鍵無しで平文保存に落とすと秘匿の前提が崩れるため）。
const crypto = require("crypto");

let cachedKey = null;

function secretKey() {
  if (cachedKey) return cachedKey;
  const raw = process.env.VG_SECRET_KEY || process.env.FIREBASE_PRIVATE_KEY || "";
  if (!raw) {
    const err = new Error("vg-secret-key-missing");
    err.statusCode = 500;
    throw err;
  }
  // 任意長の文字列から32バイトの鍵を作る
  cachedKey = crypto.createHash("sha256").update(String(raw)).digest();
  return cachedKey;
}

// オブジェクト → "iv:authTag:ciphertext"（すべてbase64）
function encryptJSON(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const plain = Buffer.from(JSON.stringify(obj), "utf8");
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

// "iv:authTag:ciphertext" → オブジェクト。改ざんされていれば例外になる
function decryptJSON(packed) {
  const parts = String(packed || "").split(":");
  if (parts.length !== 3) {
    const err = new Error("vg-secret-corrupt");
    err.statusCode = 500;
    throw err;
  }
  const [ivB64, tagB64, encB64] = parts;
  const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(encB64, "base64")), decipher.final()]);
  return JSON.parse(dec.toString("utf8"));
}

module.exports = { encryptJSON, decryptJSON };
