#!/usr/bin/env node
// イントロドンの楽曲マスター（Firestore: introQuizSongs コレクション）へ、
// CSVファイルから一括インポート（新規作成／既存idの更新）を行うスクリプト。
//
// 使い方:
//   FIREBASE_PROJECT_ID=xxx FIREBASE_CLIENT_EMAIL=xxx FIREBASE_PRIVATE_KEY="xxx" \
//     node scripts/importIntroQuizSongs.js path/to/songs.csv
//   （もしくは package.json の "import:introquiz-songs" スクリプト経由でも実行可）
//
// 環境変数は api/_lib/firebaseAdmin.js と同じ、Vercelに設定しているサービス
// アカウントの認証情報（FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL /
// FIREBASE_PRIVATE_KEY）をそのままローカルでも使う。
//
// CSVの列（1行目はヘッダー。title/artist/videoId は必須、それ以外は空欄可）：
//   id            任意の一意な文字列。省略時は自動採番（＝毎回新規追加になる
//                 ので、既存曲を更新したい場合は必ずidを指定すること）
//   title         正式タイトル（必須・判定にも使う）
//   artist        アーティスト名（必須）
//   videoId       YouTube動画ID（必須。11文字、埋め込み再生が許可されている
//                 ものに限る。IDはYouTubeのURLの "v=" 以降 or 短縮URL末尾）
//   titleKana     判定用ひらがな読み（例: ぐれんげ）。あいまい検索・表記ゆれ
//                 判定の精度に直結するため、できるだけ入力すること
//   titleRomaji   公式のローマ字/英語表記（例: Gurenge）。無ければ空欄
//   titleEn       正式な英語タイトルがあれば（無ければ空欄）
//   artistKana    アーティスト名のひらがな読み（任意・将来の拡張用）
//   artistRomaji  アーティスト名のローマ字表記（任意・将来の拡張用）
//   active        TRUE/FALSE（空欄はTRUE扱い。出題対象から一時的に外したい
//                 ときはFALSEにする）
const fs = require("fs");
const path = require("path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// ダブルクォート・カンマ・改行を含むフィールドに対応した最小限のRFC4180 CSVパーサー
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function toBool(v, defaultValue) {
  if (v === undefined || v === "") return defaultValue;
  return /^(true|1|yes|y)$/i.test(v.trim());
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("使い方: node scripts/importIntroQuizSongs.js path/to/songs.csv");
    process.exit(1);
  }

  const text = fs.readFileSync(path.resolve(csvPath), "utf8");
  const rows = parseCsv(text);
  if (!rows.length) { console.error("CSVが空です"); process.exit(1); }

  const header = rows.shift().map((h) => h.trim());
  for (const required of ["title", "artist", "videoId"]) {
    if (!header.includes(required)) {
      console.error(`CSVヘッダーに必須列 "${required}" が見つかりません`);
      process.exit(1);
    }
  }

  const app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
  const db = getFirestore(app);
  const col = db.collection("introQuizSongs");

  let imported = 0, skipped = 0;
  for (const row of rows) {
    const rec = {};
    header.forEach((h, i) => { rec[h] = (row[i] || "").trim(); });

    if (!rec.title || !rec.artist || !rec.videoId) {
      console.warn("スキップ（title/artist/videoIdのいずれかが空）:", rec);
      skipped++;
      continue;
    }
    if (!/^[\w-]{11}$/.test(rec.videoId)) {
      console.warn(`スキップ（videoIdの形式が不正: "${rec.videoId}"）:`, rec.title);
      skipped++;
      continue;
    }

    const id = rec.id || col.doc().id;
    await col.doc(id).set({
      title: rec.title,
      artist: rec.artist,
      videoId: rec.videoId,
      titleKana: rec.titleKana || "",
      titleRomaji: rec.titleRomaji || "",
      titleEn: rec.titleEn || "",
      artistKana: rec.artistKana || "",
      artistRomaji: rec.artistRomaji || "",
      active: toBool(rec.active, true),
      updatedAt: Date.now(),
    }, { merge: true });
    imported++;
  }

  console.log(`✅ 完了: ${imported}件を登録・更新しました（スキップ: ${skipped}件）`);
}

main().catch((e) => {
  console.error("インポートに失敗しました:", e);
  process.exit(1);
});
