function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function inline(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return html;
}

function cells(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((value) => value.trim());
}

function isDivider(line) {
  const values = cells(line);
  return values.length > 0 && values.every((value) => /^:?-{3,}:?$/.test(value));
}

export function parseMarkdown(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  let index = 0;
  const flush = () => {
    const text = paragraph.join(' ').trim();
    if (text) blocks.push({ type: 'paragraph', text });
    paragraph = [];
  };

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      index += 1;
      continue;
    }

    const fence = /^```([^`]*)$/.exec(trimmed);
    if (fence) {
      flush();
      const code = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', language: fence[1].trim(), code: code.join('\n') });
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flush();
      blocks.push({ type: 'rule' });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      flush();
      const values = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        values.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'quote', text: values.join(' ') });
      continue;
    }

    if (index + 1 < lines.length && trimmed.includes('|') && isDivider(lines[index + 1])) {
      flush();
      const headers = cells(trimmed);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(cells(lines[index]));
        index += 1;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    const unordered = /^[-*+]\s+(.+)$/.exec(trimmed);
    const ordered = /^\d+[.)]\s+(.+)$/.exec(trimmed);
    if (unordered || ordered) {
      flush();
      const isOrdered = Boolean(ordered);
      const items = [];
      while (index < lines.length) {
        const match = isOrdered
          ? /^\d+[.)]\s+(.+)$/.exec(lines[index].trim())
          : /^[-*+]\s+(.+)$/.exec(lines[index].trim());
        if (!match) break;
        items.push(match[1].trim());
        index += 1;
      }
      blocks.push({ type: 'list', ordered: isOrdered, items });
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }
  flush();
  return blocks;
}

function bodyHtml(markdown) {
  return parseMarkdown(markdown).map((block) => {
    if (block.type === 'heading') return `<h${block.level}>${inline(block.text)}</h${block.level}>`;
    if (block.type === 'paragraph') return `<p>${inline(block.text)}</p>`;
    if (block.type === 'quote') return `<blockquote>${inline(block.text)}</blockquote>`;
    if (block.type === 'rule') return '<hr />';
    if (block.type === 'code') {
      return `<div class="code-card"><div class="code-label">${escapeHtml(block.language || 'command')}</div><pre><code>${escapeHtml(block.code)}</code></pre></div>`;
    }
    if (block.type === 'list') {
      const tag = block.ordered ? 'ol' : 'ul';
      return `<${tag}>${block.items.map((item) => `<li>${inline(item)}</li>`).join('')}</${tag}>`;
    }
    return `<div class="table-wrap"><table><thead><tr>${block.headers.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${block.rows.map((row) => `<tr>${block.headers.map((_, index) => `<td>${inline(row[index] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }).join('\n');
}

function tocHtml(markdown) {
  const headings = parseMarkdown(markdown).filter((block) => block.type === 'heading' && block.level <= 3);
  if (!headings.length) return '';
  return `<section class="toc avoid-break"><h2>目次</h2><ol>${headings.map((entry) => `<li class="level-${entry.level}">${escapeHtml(entry.text)}</li>`).join('')}</ol></section>`;
}

export function renderGeminiPdfHtml({ title, chatDate, markdown, documentType, createdAt }) {
  const created = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(createdAt || new Date());

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 13mm 15mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #1b2632; background: #fff; font-family: "Noto Sans CJK JP", "Noto Sans JP", "Yu Gothic", sans-serif; font-size: 10.2pt; line-height: 1.7; overflow-wrap: anywhere; }
  .cover { min-height: 260mm; margin: -13mm -15mm -16mm; padding: 28mm 20mm 18mm; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; background: linear-gradient(145deg,#f4f9fc 0%,#fff 68%); }
  .cover-mark { width: 58px; height: 7px; border-radius: 99px; background: #377d9b; margin-bottom: 18mm; }
  .cover h1 { margin: 0; color: #17384a; font-size: 25pt; line-height: 1.35; letter-spacing: .02em; }
  .subtitle { margin-top: 7mm; color: #506572; font-size: 12pt; }
  .meta { border-top: 1px solid #c9d6dd; padding-top: 7mm; color: #526572; display: grid; gap: 2mm; }
  h1,h2,h3,h4 { color: #173f55; break-after: avoid; page-break-after: avoid; }
  h2 { margin: 10mm 0 4mm; padding: 2.5mm 0 2.5mm 4mm; border-left: 5px solid #377d9b; background: #f0f6f9; font-size: 16pt; }
  h3 { margin: 7mm 0 3mm; padding-bottom: 1.5mm; border-bottom: 1px solid #cad8df; font-size: 13pt; }
  h4 { margin: 5mm 0 2mm; font-size: 11.5pt; }
  p { margin: 0 0 3mm; }
  strong { color: #b13a35; }
  em { color: #225a78; }
  code { font-family: Consolas, "Noto Sans Mono CJK JP", monospace; background: #edf2f5; padding: .1em .35em; border-radius: 4px; font-size: .92em; }
  ul,ol { margin: 2mm 0 4mm 6mm; padding-left: 5mm; }
  li { margin: 1.1mm 0; }
  blockquote { margin: 4mm 0; padding: 4mm 5mm; border-left: 5px solid #5b88a2; background: #f3f8fb; color: #284b5e; break-inside: avoid; }
  .code-card { margin: 4mm 0 5mm; overflow: hidden; border: 1px solid #a9bac4; border-radius: 8px; background: #19232c; color: #f5f7f9; break-inside: avoid; }
  .code-label { padding: 1.8mm 3mm; background: #2a3944; color: #d8e4ea; font-size: 8.5pt; }
  pre { margin: 0; padding: 4mm; white-space: pre-wrap; word-break: break-word; font-size: 8.8pt; line-height: 1.55; }
  pre code { padding: 0; color: inherit; background: transparent; }
  .table-wrap { margin: 4mm 0 6mm; break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th,td { border: 1px solid #9fb0ba; padding: 2.2mm 2.5mm; vertical-align: top; font-size: 9pt; }
  th { background: #eaf2f6; color: #183f54; text-align: left; }
  tr { break-inside: avoid; }
  hr { border: 0; border-top: 1px solid #cad5dc; margin: 8mm 0; }
  .toc { margin: 0 0 9mm; padding: 6mm; border: 1px solid #c7d6de; border-radius: 8px; background: #fbfdfe; }
  .toc h2 { margin-top: 0; }
  .toc .level-3 { margin-left: 5mm; color: #526572; }
  .avoid-break { break-inside: avoid; }
  .footer-note { margin-top: 12mm; padding-top: 4mm; border-top: 1px solid #d4dde2; color: #71818b; font-size: 8.3pt; }
</style>
</head>
<body>
<section class="cover">
  <div><div class="cover-mark"></div><h1>${escapeHtml(title)}</h1><p class="subtitle">${escapeHtml(documentType || 'Gemini 学習・業務資料')}</p></div>
  <div class="meta"><div><strong>対象日：</strong>${escapeHtml(chatDate)}</div><div><strong>作成日：</strong>${escapeHtml(created)}</div><div><strong>作成元：</strong>PDFフォルダー内 Gemini チャット</div></div>
</section>
<main>${tocHtml(markdown)}${bodyHtml(markdown)}<p class="footer-note">この資料は対象日のチャット内容をもとに再構成されています。補足事項は本文中で明示しています。</p></main>
</body>
</html>`;
}
