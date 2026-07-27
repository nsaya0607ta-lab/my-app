const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

function modelName() {
  return String(process.env.GEMINI_MODEL || 'gemini-3.5-flash').replace(/^models\//, '');
}

function apiKey() {
  const value = process.env.GEMINI_API_KEY;
  if (!value) throw new Error('GEMINI_API_KEY is missing');
  return value;
}

function extractText(data) {
  return (data?.candidates || [])
    .flatMap((candidate) => candidate?.content?.parts || [])
    .map((part) => String(part?.text || ''))
    .join('')
    .trim();
}

function systemPrompt(preferences = {}) {
  return [
    'あなたは、復習したくなる高品質な学習資料・業務資料を作る編集者です。',
    'ユーザーが質問した部分、勘違いしていた部分、詰まった部分、最終的な正しい理解を明確に区別してください。',
    '会話で扱っていない知識を無断で広げすぎず、追加する場合は「補足」と明記してください。',
    preferences.beginnerFriendly !== false ? '専門用語には初学者向けの短い説明を添えてください。' : '',
    preferences.includeCommandExamples !== false
      ? 'Linux・LPICでは、コマンドの目的、構文、オプション、実行例、結果例、よくある間違い、類似コマンドとの違いを示してください。'
      : '',
    preferences.includeExamTips !== false ? '資格学習では試験ポイントと覚え方を含めてください。' : '',
    preferences.preferTables !== false ? '比較が有効な箇所ではMarkdown表を使用してください。' : '',
    String(preferences.responsePolicy || ''),
    'Markdownで出力し、内部の推論過程は開示しないでください。',
  ]
    .filter(Boolean)
    .join('\n');
}

function documentPrompt({ chatDate, title, purpose, instructions, messages }) {
  const conversation = messages
    .map((message) => `${message.role === 'model' ? 'Gemini' : 'ユーザー'}:\n${message.text}`)
    .join('\n\n');

  return `対象日の会話を、単なる会話ログではなく、理解しやすい順番へ再構成した資料にしてください。

対象日: ${chatDate}
資料タイトル: ${title}
用途: ${purpose || '復習・学習'}
追加指示: ${instructions || 'なし'}

必須構成:
1. 今日扱った内容の全体像
2. 学習または業務の目的
3. 内容の流れ
4. 重要用語
5. 詳しい解説
6. ユーザーが質問した部分
7. ユーザーが勘違いしていた部分
8. 詰まったポイント
9. 正しい理解
10. 覚え方
11. 注意点
12. 復習問題
13. 最後の確認事項

LinuxやLPICの内容では必要に応じて次を含めてください:
- コマンドの目的・基本構文・主なオプション
- 実行例と実行結果例
- 間違いやすい指定
- 類似コマンドとの違い
- 試験で問われやすいポイント
- 覚え方と実務での使用例

会話:
${conversation}`;
}

export async function generateDocument(input) {
  const response = await fetch(
    `${ENDPOINT}/${encodeURIComponent(modelName())}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey(),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(input.preferences) }] },
        contents: [{ role: 'user', parts: [{ text: documentPrompt(input) }] }],
        generationConfig: {
          temperature: 0.25,
          topP: 0.85,
          maxOutputTokens: 16384,
        },
      }),
    },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Gemini API ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  const markdown = extractText(data);
  if (!markdown) throw new Error('Gemini returned an empty document');
  return markdown;
}
