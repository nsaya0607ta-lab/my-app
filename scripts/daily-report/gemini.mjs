/**
 * Gemini へレポート生成を依頼する。
 *
 * api/gemini/chat.js と同じ方針:
 *  - APIキーは環境変数からのみ読む
 *  - 短いタイムアウト + 少ないリトライ (無料枠のクォータを無駄に消費しない)
 * cron から呼ぶのでストリーミングはせず generateContent を使う。
 *
 * 出力は responseSchema で構造を固定した JSON。HTML を直接書かせると
 * レイアウトが崩れるため、描画は render.mjs 側の責務にしている。
 */
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const TIMEOUT_MS = 120000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ */
/* 出力スキーマ                                                        */
/* ------------------------------------------------------------------ */

const BLOCK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    type: {
      type: 'STRING',
      enum: ['paragraph', 'subheading', 'list', 'table', 'code', 'callout'],
      description: 'ブロックの種類',
    },
    text: { type: 'STRING', description: 'paragraph / subheading / callout の本文' },
    title: { type: 'STRING', description: 'callout の見出し' },
    variant: {
      type: 'STRING',
      enum: ['important', 'caution', 'question'],
      description: 'callout の種類。important=重要ポイント、caution=注意点、question=疑問点',
    },
    items: { type: 'ARRAY', items: { type: 'STRING' }, description: 'list の項目' },
    columns: { type: 'ARRAY', items: { type: 'STRING' }, description: 'table の見出し行' },
    rows: {
      type: 'ARRAY',
      description: 'table の各行',
      items: {
        type: 'OBJECT',
        properties: { cells: { type: 'ARRAY', items: { type: 'STRING' } } },
        required: ['cells'],
      },
    },
    lines: { type: 'ARRAY', items: { type: 'STRING' }, description: 'code の各行' },
  },
  required: ['type'],
};

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING', description: 'レポートの表題' },
    summary: { type: 'STRING', description: '前日の学習を1〜2文で振り返る導入' },
    flow: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: '今日の学習フロー。3〜5個の短いステップ名',
    },
    sections: {
      type: 'ARRAY',
      description: '本文。大見出しごとのまとまり',
      items: {
        type: 'OBJECT',
        properties: {
          heading: { type: 'STRING' },
          blocks: { type: 'ARRAY', items: BLOCK_SCHEMA },
        },
        required: ['heading', 'blocks'],
      },
    },
    commands: {
      type: 'ARRAY',
      description: '今日の重要コマンド一覧',
      items: {
        type: 'OBJECT',
        properties: {
          command: { type: 'STRING' },
          summary: { type: 'STRING' },
        },
        required: ['command', 'summary'],
      },
    },
    confusions: {
      type: 'ARRAY',
      description: '間違えやすいオプション・大文字小文字・サブコマンドの比較',
      items: {
        type: 'OBJECT',
        properties: {
          topic: { type: 'STRING', description: '比較の対象' },
          left: { type: 'STRING' },
          right: { type: 'STRING' },
          note: { type: 'STRING', description: '取り違えたときに何が起きるか' },
        },
        required: ['topic', 'left', 'right', 'note'],
      },
    },
    workflow: {
      type: 'ARRAY',
      description: '現場での一連の操作例',
      items: {
        type: 'OBJECT',
        properties: {
          step: { type: 'STRING' },
          command: { type: 'STRING' },
          note: { type: 'STRING' },
        },
        required: ['step', 'command'],
      },
    },
    examCheck: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: '試験直前に確認するポイント',
    },
  },
  required: ['title', 'summary', 'flow', 'sections', 'commands', 'confusions', 'workflow', 'examCheck'],
};

/* ------------------------------------------------------------------ */
/* プロンプト                                                          */
/* ------------------------------------------------------------------ */

const STYLE_RULES = [
  '【文字装飾の記法（厳守）】本文の文字列の中では、次の3つの記法だけを使ってください。それ以外の記号による装飾（Markdownの*や#など）は一切使わないこと。',
  '  ・重要語句、コマンド名、試験で問われる部分 → [[r:テキスト]]（赤で表示されます）',
  '  ・重要な説明、結論、注意点 → [[b:テキスト]]（青で表示されます）',
  '  ・文中に埋め込むコマンドやパス → [[c:ls -la]]（等幅で表示されます）',
  '  ・記法は入れ子にしないこと。',
  '【分量】全体でA4縦3〜4ページ、多くても6ページに収まる量にしてください。sections は3〜5個、各 section の blocks は3〜6個が目安です。',
  '【構成】見ただけで「どの順番で学習すればよいか」が分かる並びにしてください。',
  '【表】コマンドやオプションの比較は必ず table ブロックにしてください。columns は2〜4列に収めること。',
  '【コマンド例】実行例は code ブロックにし、1行目は「$ 」で始め、2行目以降は実行結果を書いてください。',
  '【枠】特に覚えるべき点は callout ブロック（important / caution / question）で囲んでください。各 section に多くても1つ。',
];

function describeSessions(sessions) {
  return sessions
    .map((s) => {
      const accuracy = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
      const time = typeof s.date === 'string' ? s.date.slice(11, 16) : '';
      return `  ・${time} ${s.modeLabel ?? ''}：${s.correct}/${s.total}問正解（正答率${accuracy}%、スコア${s.score ?? '-'}）`;
    })
    .join('\n');
}

function describeWrongQuestions(questions) {
  if (questions.length === 0) return '  （復習リストは空です）';
  return questions
    .map((q) => {
      const parts = [
        `  ・[問題${q.id}]${q.command ? `（コマンド: ${q.command}）` : ''} ${q.question}`,
        `    選択肢: ${q.options.join(' / ')}`,
        `    正解: ${q.answers.join(' , ') || '(不明)'}`,
      ];
      if (q.explanation) parts.push(`    解説: ${q.explanation}`);
      return parts.join('\n');
    })
    .join('\n');
}

function describeWeakCommands(weak) {
  if (weak.length === 0) return '  （コマンド別の統計はまだありません）';
  return weak
    .map(
      (w) =>
        `  ・${w.command}：${w.attempts}回中${w.wrong}回不正解（誤答率${Math.round(w.wrongRate * 100)}%${w.streakWrong > 0 ? `、直近${w.streakWrong}連続で不正解` : ''}）`,
    )
    .join('\n');
}

export function buildPrompt({ dateLabel, certCode, certName, sessions, wrongQuestions, weak }) {
  return [
    `あなたは ${certCode}（${certName}）の学習を支援する講師です。`,
    `${dateLabel} に学習者が解いた記録をもとに、翌朝に読む「振り返り＋今日の学習」レポートを作成してください。`,
    '',
    `■ ${dateLabel} の演習記録`,
    describeSessions(sessions),
    '',
    '■ 現在の復習リスト（間違えたまま正解できていない問題）',
    describeWrongQuestions(wrongQuestions),
    '',
    '■ コマンド別の誤答統計',
    describeWeakCommands(weak),
    '',
    '■ 作成方針',
    '・上の実データだけを根拠にしてください。解いていない範囲の話を作り出さないこと。',
    '・復習リストの問題は「なぜ間違えやすいのか」まで踏み込んで解説してください。',
    '・誤答統計で弱いコマンドは、似たコマンドとの違いが分かる比較表を必ず入れてください。',
    '・最後の commands / confusions / workflow / examCheck は必ず埋めてください。',
    '',
    ...STYLE_RULES,
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* 呼び出し                                                            */
/* ------------------------------------------------------------------ */

async function callOnce(apiKey, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/** レポート JSON を生成して返す。 */
export async function generateReport(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY が設定されていません');

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await callOnce(apiKey, prompt);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        // 429 / 5xx は一時的な可能性があるので再試行、それ以外は即座に諦める
        if (response.status !== 429 && response.status < 500) {
          throw new Error(`Gemini API error ${response.status}: ${body.slice(0, 500)}`);
        }
        lastError = new Error(`Gemini API error ${response.status}: ${body.slice(0, 300)}`);
      } else {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? '')
          .join('')
          .trim();

        if (!text) {
          const reason =
            data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || 'unknown';
          lastError = new Error(`Gemini からテキストが得られませんでした (${reason})`);
        } else {
          return JSON.parse(text);
        }
      }
    } catch (error) {
      // JSON.parse の失敗もここに来る。スキーマ指定していても稀に壊れるため再試行する
      lastError = error;
      if (error?.message?.startsWith('Gemini API error 4')) throw error;
    }

    if (attempt < MAX_ATTEMPTS) {
      console.warn(`  Gemini 呼び出し失敗 (${attempt}/${MAX_ATTEMPTS}): ${lastError?.message}`);
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError ?? new Error('Gemini 呼び出しに失敗しました');
}
