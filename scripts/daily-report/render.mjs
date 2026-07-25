/**
 * レポート JSON を印刷用 HTML に変換する。
 *
 * Gemini には [[r:…]] / [[b:…]] / [[c:…]] の3記法だけを使わせ、
 * ここで一度すべて HTML エスケープしてからその3つだけをタグへ戻す。
 * こうすることで、モデルが崩れた HTML を返してもレイアウトは壊れない。
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const CSS_PATH = path.join(import.meta.dirname, 'template.css');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** エスケープ済みテキストの [[r:…]] [[b:…]] [[c:…]] をタグへ戻す。 */
function inline(value) {
  return escapeHtml(value).replace(
    /\[\[([rbc]):([\s\S]*?)\]\]/g,
    (_match, kind, body) => {
      const className = kind === 'r' ? 'em-red' : kind === 'b' ? 'em-blue' : 'em-code';
      return `<span class="${className}">${body}</span>`;
    },
  );
}

const CALLOUT_LABELS = {
  important: '重要ポイント',
  caution: '注意点',
  question: '疑問点',
};

function renderBlock(block) {
  if (!block || typeof block !== 'object') return '';

  switch (block.type) {
    case 'subheading':
      return `<h3 class="sub">${inline(block.text)}</h3>`;

    case 'paragraph':
      return `<p>${inline(block.text)}</p>`;

    case 'list': {
      const items = (block.items ?? []).map((item) => `<li>${inline(item)}</li>`).join('');
      return items ? `<ul>${items}</ul>` : '';
    }

    case 'table': {
      const columns = block.columns ?? [];
      const rows = block.rows ?? [];
      if (columns.length === 0 && rows.length === 0) return '';
      const head = columns.length
        ? `<thead><tr>${columns.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`
        : '';
      const body = rows
        .map((row) => {
          const cells = Array.isArray(row?.cells) ? row.cells : [];
          return `<tr>${cells.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`;
        })
        .join('');
      return `<table>${head}<tbody>${body}</tbody></table>`;
    }

    case 'code': {
      const lines = (block.lines ?? []).map((line) => escapeHtml(line)).join('\n');
      return lines ? `<pre class="code">${lines}</pre>` : '';
    }

    case 'callout': {
      const variant = CALLOUT_LABELS[block.variant] ? block.variant : 'important';
      const title = block.title ? inline(block.title) : CALLOUT_LABELS[variant];
      return `<aside class="callout ${variant}"><p class="callout-title">${title}</p><p>${inline(block.text)}</p></aside>`;
    }

    default:
      // 想定外の type でも本文が入っていれば落とさず段落として出す
      return block.text ? `<p>${inline(block.text)}</p>` : '';
  }
}

function renderFlow(flow) {
  if (!Array.isArray(flow) || flow.length === 0) return '';
  const steps = flow
    .map(
      (step, index) =>
        `<li class="flow-step"><span class="flow-num">${index + 1}</span><span class="flow-label">${inline(step)}</span></li>`,
    )
    .join('');
  return `<section class="flow-wrap"><h2>今日の学習フロー</h2><ol class="flow">${steps}</ol></section>`;
}

function renderSections(sections) {
  if (!Array.isArray(sections)) return '';
  return sections
    .map((section) => {
      const blocks = (section.blocks ?? []).map(renderBlock).join('');
      return `<section class="chunk"><h2>${inline(section.heading)}</h2>${blocks}</section>`;
    })
    .join('');
}

function renderCommands(commands) {
  if (!Array.isArray(commands) || commands.length === 0) return '';
  const rows = commands
    .map(
      (entry) =>
        `<tr><td class="cmd-cell">${escapeHtml(entry.command)}</td><td>${inline(entry.summary)}</td></tr>`,
    )
    .join('');
  return `<section class="chunk"><h2>今日の重要コマンド一覧</h2><table><thead><tr><th style="width:26%">コマンド</th><th>要点</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function renderConfusions(confusions) {
  if (!Array.isArray(confusions) || confusions.length === 0) return '';
  const rows = confusions
    .map(
      (entry) =>
        `<tr><td>${inline(entry.topic)}</td><td class="cmd-cell">${escapeHtml(entry.left)}</td><td class="cmd-cell">${escapeHtml(entry.right)}</td><td>${inline(entry.note)}</td></tr>`,
    )
    .join('');
  return `<section class="chunk"><h2>間違えやすいオプション・大文字小文字・サブコマンド</h2><table><thead><tr><th style="width:20%">項目</th><th style="width:18%">A</th><th style="width:18%">B</th><th>取り違えるとどうなるか</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function renderWorkflow(workflow) {
  if (!Array.isArray(workflow) || workflow.length === 0) return '';
  const items = workflow
    // 番号は <ol> が自動で振るので、ここでは付けない
    .map(
      (entry) =>
        `<li><span class="wf-step">${inline(entry.step)}</span><code class="wf-cmd">${escapeHtml(entry.command)}</code>${entry.note ? `<span class="wf-note">${inline(entry.note)}</span>` : ''}</li>`,
    )
    .join('');
  return `<section class="chunk"><h2>現場での一連の操作例</h2><ol class="workflow">${items}</ol></section>`;
}

function renderExamCheck(examCheck) {
  if (!Array.isArray(examCheck) || examCheck.length === 0) return '';
  const items = examCheck.map((entry) => `<li>${inline(entry)}</li>`).join('');
  return `<section class="chunk"><h2>試験直前に確認するポイント</h2><ul class="check">${items}</ul></section>`;
}

/** レポート JSON から完全な HTML 文書を作る。 */
export async function renderHtml(report, { dateLabel, certCode }) {
  const css = await readFile(CSS_PATH, 'utf8');
  const title = report.title || `${dateLabel} ${certCode} 学習レポート`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body>
<header class="doc-head">
  <h1>${escapeHtml(title)}</h1>
  <p class="doc-meta">${escapeHtml(certCode)} ／ ${escapeHtml(dateLabel)} の学習の振り返り</p>
</header>
${report.summary ? `<p class="lead">${inline(report.summary)}</p>` : ''}
${renderFlow(report.flow)}
${renderSections(report.sections)}
<hr class="appendix-rule">
${renderCommands(report.commands)}
${renderConfusions(report.confusions)}
${renderWorkflow(report.workflow)}
${renderExamCheck(report.examCheck)}
</body>
</html>`;
}
