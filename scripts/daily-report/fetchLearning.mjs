/**
 * Firestore から前日分の学習履歴を取り出す。
 *
 * データ構造 (js/core.js の saveToCloud / js/learning-sync.js の hydrateAllCerts):
 *   users/{uid}.certs.{certId} = {
 *     bp, wrong: number[], marked: number[],
 *     history: [{ id, date(ISO), modeLabel, mode, correct, total, score, ... }],  // 最大50件
 *     cmdStats: { [cmd]: { attempts, correct, wrong, streakWrong, aiScore, ... } }
 *   }
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/** JST での「前日」の 0:00〜24:00 を UTC の Date で返す。 */
export function previousDayRange(now = new Date()) {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  // JST の日付を切り出し、その前日の 0:00 JST を UTC に戻す
  const jstMidnight = Date.UTC(
    jstNow.getUTCFullYear(),
    jstNow.getUTCMonth(),
    jstNow.getUTCDate(),
  );
  const start = new Date(jstMidnight - JST_OFFSET_MS - 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const label = new Date(jstMidnight - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { start, end, label };
}

function initFirestore() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Vercel / GitHub Secrets ではリテラルの "\n" で保存されがちなので実際の改行へ戻す
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY が設定されていません',
    );
  }

  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return getFirestore(app);
}

/**
 * 前日に解いた記録を資格ごとにまとめて返す。
 * 学習が無かった資格は含めない。
 */
export async function fetchYesterdayLearning({ uid, now = new Date() } = {}) {
  if (!uid) throw new Error('LEARNING_UID が設定されていません');

  const range = previousDayRange(now);
  const snapshot = await initFirestore().collection('users').doc(uid).get();
  if (!snapshot.exists) {
    return { ...range, certs: [], hasActivity: false };
  }

  const certs = snapshot.data()?.certs ?? {};
  const results = [];

  for (const [certId, data] of Object.entries(certs)) {
    if (!data || typeof data !== 'object') continue;

    const sessions = (Array.isArray(data.history) ? data.history : []).filter((entry) => {
      if (!entry || typeof entry.date !== 'string') return false;
      const at = new Date(entry.date);
      return !Number.isNaN(at.getTime()) && at >= range.start && at < range.end;
    });
    if (sessions.length === 0) continue;

    results.push({
      certId,
      bp: typeof data.bp === 'number' ? data.bp : 0,
      sessions,
      // wrong は「現在の復習リスト」なので前日分に限定できない。
      // レポートでは「いま復習が必要な問題」として扱う。
      wrong: Array.isArray(data.wrong) ? [...new Set(data.wrong)] : [],
      cmdStats: data.cmdStats && typeof data.cmdStats === 'object' ? data.cmdStats : {},
    });
  }

  return { ...range, certs: results, hasActivity: results.length > 0 };
}

/**
 * cmdStats から「間違えやすいコマンド」を抽出する。
 * 誤答率が高い順、同率なら試行回数が多い順。
 */
export function weakCommands(cmdStats, limit = 12) {
  return Object.entries(cmdStats)
    .map(([command, stat]) => {
      const attempts = Number(stat?.attempts) || 0;
      const wrong = Number(stat?.wrong) || 0;
      return {
        command,
        attempts,
        wrong,
        correct: Number(stat?.correct) || 0,
        streakWrong: Number(stat?.streakWrong) || 0,
        wrongRate: attempts > 0 ? wrong / attempts : 0,
      };
    })
    .filter((entry) => entry.attempts > 0 && entry.wrong > 0)
    .sort((a, b) => b.wrongRate - a.wrongRate || b.attempts - a.attempts)
    .slice(0, limit);
}
