import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import puppeteer from 'puppeteer';

import { generateDocument } from './gemini.mjs';
import { renderGeminiPdfHtml } from './render.mjs';

const TIME_ZONE = 'Asia/Tokyo';
const MAX_RULES_PER_RUN = 30;
const MAX_ATTEMPTS = 3;

function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing');
  const parsed = JSON.parse(raw);
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is invalid');
  }
  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: String(parsed.private_key).replace(/\\n/g, '\n'),
  };
}

const account = serviceAccount();
const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
if (!bucketName) throw new Error('FIREBASE_STORAGE_BUCKET is missing');

const app =
  getApps()[0] ??
  initializeApp({
    credential: cert(account),
    storageBucket: bucketName,
  });
const db = getFirestore(app);
const bucket = getStorage(app).bucket(bucketName);

function zonedParts(date = new Date(), timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    time: `${map.hour}:${map.minute}`,
    minutes: Number(map.hour) * 60 + Number(map.minute),
  };
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00+09:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return zonedParts(date).date;
}

function templateVariables(template, dateKey, values = {}) {
  const [yyyy, mm, dd] = dateKey.split('-');
  const weekday = new Intl.DateTimeFormat('ja-JP', {
    timeZone: TIME_ZONE,
    weekday: 'short',
  }).format(new Date(`${dateKey}T12:00:00+09:00`));
  const replacements = {
    'yyyy-mm-dd': dateKey,
    yyyymmdd: `${yyyy}${mm}${dd}`,
    yyyy,
    mm,
    dd,
    weekday,
    chat_title: values.chatTitle || '',
    rule_name: values.ruleName || '',
  };
  return Object.entries(replacements).reduce(
    (value, [key, replacement]) => value.replaceAll(key, replacement),
    String(template || ''),
  );
}

function sanitizeFileName(value) {
  const cleaned = String(value || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  const name = cleaned || 'Gemini.pdf';
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}

function scheduledMinutes(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(time || ''));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function dueToday(rule, now) {
  if (!rule.enabled) return false;
  const target = scheduledMinutes(rule.time);
  if (target === null || now.minutes < target) return false;
  return rule.lastRunDate !== now.date || rule.lastRunStatus === 'failed';
}

async function renderPdf(html) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('print');
    return Buffer.from(
      await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate:
          '<div style="width:100%;font-size:8px;color:#71818b;text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
        margin: { top: '13mm', right: '15mm', bottom: '18mm', left: '15mm' },
      }),
    );
  } finally {
    await browser.close();
  }
}

async function acquireRun(userRef, ruleRef, rule, runDate, chatDate) {
  const runId = `${ruleRef.id}_${runDate.replaceAll('-', '')}`;
  const runRef = userRef.collection('pdfGenerationRuns').doc(runId);
  const acquired = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(runRef);
    const existing = snapshot.exists ? snapshot.data() : null;
    if (existing?.status === 'success' || existing?.status === 'skipped') return false;
    if (existing?.status === 'running') {
      const updated = existing.updatedAt?.toDate?.()?.getTime?.() || 0;
      if (Date.now() - updated < 30 * 60_000) return false;
    }
    const attempt = Number(existing?.attempt || 0) + 1;
    if (attempt > MAX_ATTEMPTS) return false;
    transaction.set(
      runRef,
      {
        ruleId: ruleRef.id,
        ruleName: rule.name || '自動PDF',
        chatDate,
        runDate,
        status: 'running',
        attempt,
        createdAt: existing?.createdAt || FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        error: FieldValue.delete(),
      },
      { merge: true },
    );
    return true;
  });
  return acquired ? { runId, runRef } : null;
}

async function loadChat(userRef, chatDate) {
  const chatRef = userRef.collection('geminiChats').doc(chatDate);
  const [chatSnapshot, messageSnapshot, preferencesSnapshot] = await Promise.all([
    chatRef.get(),
    chatRef.collection('messages').orderBy('createdAt', 'asc').limit(250).get(),
    userRef.collection('geminiSettings').doc('default').get(),
  ]);
  const messages = messageSnapshot.docs
    .map((doc) => doc.data())
    .filter((message) => message.role === 'user' || message.role === 'model')
    .map((message) => ({ role: message.role, text: String(message.text || '').trim() }))
    .filter((message) => message.text);
  return {
    title: String(chatSnapshot.data()?.title || `${chatDate}のチャット`),
    messages,
    preferences: preferencesSnapshot.exists ? preferencesSnapshot.data() : {},
  };
}

async function updateRunFailure(runRef, ruleRef, error) {
  const message = error instanceof Error ? error.message.slice(0, 1000) : 'Unknown error';
  await Promise.all([
    runRef.set(
      { status: 'failed', error: message, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    ),
    ruleRef.set(
      {
        lastRunAt: FieldValue.serverTimestamp(),
        lastRunStatus: 'failed',
        lastError: message,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    ),
  ]);
}

async function generateForRule(ruleDoc, now) {
  const rule = ruleDoc.data();
  const userRef = ruleDoc.ref.parent.parent;
  if (!userRef || userRef.parent.id !== 'users') return false;
  const uid = userRef.id;
  const chatDate = rule.chatTarget === 'previousDay' ? addDays(now.date, -1) : now.date;
  const acquired = await acquireRun(userRef, ruleDoc.ref, rule, now.date, chatDate);
  if (!acquired) return false;
  const { runId, runRef } = acquired;

  try {
    const chat = await loadChat(userRef, chatDate);
    if (!chat.messages.length) {
      await Promise.all([
        runRef.set(
          { status: 'skipped', error: '対象日のチャットが空です', updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        ),
        ruleDoc.ref.set(
          {
            lastRunAt: FieldValue.serverTimestamp(),
            lastRunDate: now.date,
            lastRunStatus: 'skipped',
            lastError: '対象日のチャットが空です',
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
      ]);
      return false;
    }

    const title = templateVariables(rule.titleTemplate || '学習まとめ yyyy-mm-dd', chatDate, {
      chatTitle: chat.title,
      ruleName: rule.name,
    });
    const fileName = sanitizeFileName(
      templateVariables(rule.fileNameTemplate || '学習_yyyymmdd.pdf', chatDate, {
        chatTitle: chat.title,
        ruleName: rule.name,
      }),
    );
    const markdown = await generateDocument({
      chatDate,
      title,
      purpose: rule.purpose,
      instructions: rule.instructions,
      messages: chat.messages,
      preferences: chat.preferences,
    });
    const html = renderGeminiPdfHtml({
      title,
      chatDate,
      markdown,
      documentType: rule.purpose || '学習・業務資料',
      createdAt: new Date(),
    });
    const pdf = await renderPdf(html);
    const objectPath = `users/${uid}/gemini-generated/${runId}.pdf`;
    await bucket.file(objectPath).save(pdf, {
      resumable: false,
      contentType: 'application/pdf',
      metadata: {
        cacheControl: 'private,no-store',
        metadata: { runId, chatDate, ruleId: ruleDoc.id, fileName },
      },
    });

    const tags = ['Gemini生成', chatDate];
    if (/LPIC|Linux|rpm|systemd|find\s|grep\s|yum|apt/i.test(markdown)) tags.push('LPIC');
    if (String(rule.purpose || '').includes('学習') || /学習|復習|試験/.test(markdown)) tags.push('学習まとめ');

    const generatedRef = userRef.collection('geminiGeneratedPdfs').doc(runId);
    await db.runTransaction(async (transaction) => {
      transaction.set(generatedRef, {
        runId,
        ruleId: ruleDoc.id,
        ruleName: rule.name || '自動PDF',
        chatDate,
        fileName,
        title,
        folderId: rule.folderId || 'root',
        folderPath: rule.folderPath || 'PDFフォルダー',
        duplicateMode: rule.duplicateMode || 'replaceSameDate',
        objectPath,
        size: pdf.length,
        tags: [...new Set(tags)],
        notifyOnSuccess: rule.notifyOnSuccess !== false,
        status: 'ready',
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.set(
        runRef,
        {
          status: 'success',
          fileName,
          folderId: rule.folderId || 'root',
          objectPath,
          updatedAt: FieldValue.serverTimestamp(),
          error: FieldValue.delete(),
        },
        { merge: true },
      );
      transaction.set(
        ruleDoc.ref,
        {
          lastRunAt: FieldValue.serverTimestamp(),
          lastRunDate: now.date,
          lastRunStatus: 'success',
          lastError: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });

    if (rule.keepChat === false) {
      await deleteChat(userRef, chatDate);
    }
    console.log(`Generated ${uid}/${fileName} from ${chatDate}`);
    return true;
  } catch (error) {
    console.error(`Failed rule ${uid}/${ruleDoc.id}:`, error);
    await updateRunFailure(runRef, ruleDoc.ref, error);
    return false;
  }
}

async function deleteQuery(snapshot) {
  const attachments = [];
  let batch = db.batch();
  let count = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (Array.isArray(data.attachments)) attachments.push(...data.attachments);
    batch.delete(doc.ref);
    count += 1;
    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count % 400 !== 0) await batch.commit();
  return attachments;
}

async function deleteChat(userRef, chatDate) {
  const chatRef = userRef.collection('geminiChats').doc(chatDate);
  const messages = await chatRef.collection('messages').get();
  const attachments = await deleteQuery(messages);
  await chatRef.delete().catch(() => undefined);
  await Promise.all(
    attachments
      .map((entry) => String(entry?.storagePath || ''))
      .filter((path) => path.startsWith(`users/${userRef.id}/gemini-temp/`))
      .map((path) => bucket.file(path).delete({ ignoreNotFound: true })),
  );
  await bucket.deleteFiles({ prefix: `users/${userRef.id}/gemini-temp/${chatDate}/` }).catch(() => undefined);
}

async function cleanupExpiredChats() {
  const snapshot = await db
    .collectionGroup('geminiChats')
    .where('expiresAt', '<=', Timestamp.now())
    .limit(30)
    .get();
  for (const chat of snapshot.docs) {
    const userRef = chat.ref.parent.parent;
    if (userRef?.parent.id === 'users') await deleteChat(userRef, chat.id);
  }
  if (!snapshot.empty) console.log(`Removed ${snapshot.size} expired chats`);
}

async function cleanupImportedPdfs() {
  const snapshot = await db
    .collectionGroup('geminiGeneratedPdfs')
    .where('status', '==', 'imported')
    .where('cleanupAt', '<=', Timestamp.now())
    .limit(30)
    .get();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const objectPath = String(data.objectPath || '');
    if (objectPath.includes('/gemini-generated/')) {
      await bucket.file(objectPath).delete({ ignoreNotFound: true }).catch(() => undefined);
    }
    await doc.ref.delete().catch(() => undefined);
  }
  if (!snapshot.empty) console.log(`Removed ${snapshot.size} imported PDF staging objects`);
}

async function main() {
  const now = zonedParts();
  console.log(`Gemini PDF scheduler: ${now.date} ${now.time} ${TIME_ZONE}`);
  await Promise.all([cleanupExpiredChats(), cleanupImportedPdfs()]);

  const rulesSnapshot = await db
    .collectionGroup('pdfGenerationRules')
    .where('enabled', '==', true)
    .limit(MAX_RULES_PER_RUN)
    .get();
  const due = rulesSnapshot.docs.filter((doc) => dueToday(doc.data(), now));
  console.log(`Enabled rules=${rulesSnapshot.size}, due=${due.length}`);

  let generated = 0;
  for (const rule of due) {
    if (await generateForRule(rule, now)) generated += 1;
  }
  console.log(`Generated PDFs=${generated}`);
}

await main();
