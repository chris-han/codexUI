import hljs from 'highlight.js/lib/common';
import type { CSSProperties, ReactNode } from 'react';

type InlineToken =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'italic'; value: string }
  | { kind: 'strikethrough'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'link'; value: string; href: string }
  | { kind: 'file'; value: string; path: string; displayPath: string };

type ListItem = { paragraphs: string[] };
type TaskListItem = { checked: boolean; text: string };
type TableAlignment = 'left' | 'center' | 'right';

type Block =
  | { kind: 'paragraph'; value: string }
  | { kind: 'heading'; level: number; value: string }
  | { kind: 'blockquote'; value: string }
  | { kind: 'unorderedList'; items: ListItem[] }
  | { kind: 'orderedList'; items: ListItem[]; start: number }
  | { kind: 'taskList'; items: TaskListItem[] }
  | { kind: 'table'; headers: string[]; rows: string[][]; alignments: TableAlignment[] }
  | { kind: 'codeBlock'; language: string; value: string }
  | { kind: 'thematicBreak' }
  | { kind: 'image'; url: string; alt: string; markdown: string };

function isFilePath(value: string): boolean {
  if (!value || /\s/u.test(value)) return false;
  if (value.endsWith('/') || value.endsWith('\\')) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value)) return false;
  return (
    value.startsWith('/') ||
    /^[A-Za-z]:[\\/]/u.test(value) ||
    value.startsWith('./') ||
    value.startsWith('../') ||
    value.startsWith('~/') ||
    value.includes('/') ||
    value.includes('\\')
  );
}

function trimLinkWrappers(value: string): { core: string; trailing: string } {
  let core = value;
  let trailing = '';
  while (/[)"'`\]}>”’]$/u.test(core)) {
    trailing = core.slice(-1) + trailing;
    core = core.slice(0, -1);
  }
  return { core, trailing };
}

function parseFileReference(value: string): { path: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const { core } = trimLinkWrappers(trimmed);
  return isFilePath(core) ? { path: core } : null;
}

function normalizeCodeLanguage(language: string): string {
  const aliases: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    sh: 'bash',
    yml: 'yaml',
    md: 'markdown',
  };
  const token = language.trim().split(/\s+/u)[0]?.toLowerCase() ?? '';
  if (!token) return '';
  return aliases[token] ?? token;
}

function highlightCode(language: string, value: string): string {
  const normalizedLanguage = normalizeCodeLanguage(language);
  if (!normalizedLanguage) return hljs.highlightAuto(value).value;
  try {
    if (hljs.getLanguage(normalizedLanguage)) {
      return hljs.highlight(value, {
        language: normalizedLanguage,
        ignoreIllegals: true,
      }).value;
    }
  } catch {
    // Fall back to auto/plain highlighting below.
  }
  return hljs.highlightAuto(value).value;
}

function splitMarkdownTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return null;
  const normalized = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
  const withoutTrailing = normalized.endsWith('|') ? normalized.slice(0, -1) : normalized;
  const cells = withoutTrailing.split('|').map((cell) => cell.trim());
  return cells.length > 1 ? cells : null;
}

function parseTableAlignments(line: string): TableAlignment[] | null {
  const cells = splitMarkdownTableRow(line);
  if (!cells || cells.length === 0) return null;
  const alignments: TableAlignment[] = [];
  for (const cell of cells) {
    if (!/^:?-{3,}:?$/u.test(cell)) return null;
    if (cell.startsWith(':') && cell.endsWith(':')) alignments.push('center');
    else if (cell.endsWith(':')) alignments.push('right');
    else alignments.push('left');
  }
  return alignments;
}

function normalizeTableCells(cells: string[], width: number): string[] {
  const normalized = cells.slice(0, width);
  while (normalized.length < width) normalized.push('');
  return normalized;
}

function readTableBlock(lines: string[], startIndex: number): Extract<Block, { kind: 'table' }> | null {
  if (startIndex + 1 >= lines.length) return null;
  const headers = splitMarkdownTableRow(lines[startIndex] ?? '');
  const alignments = parseTableAlignments(lines[startIndex + 1] ?? '');
  if (!headers || !alignments || headers.length !== alignments.length) return null;

  const trimmedHeader = (lines[startIndex] ?? '').trim();
  if (!trimmedHeader.startsWith('|') && (trimmedHeader.match(/\|/gu)?.length ?? 0) < 2) return null;

  const width = headers.length;
  const rows: string[][] = [];
  let index = startIndex + 2;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!line.trim()) break;
    const row = splitMarkdownTableRow(line);
    if (!row) break;
    rows.push(normalizeTableCells(row, width));
    index += 1;
  }

  return {
    kind: 'table',
    headers: normalizeTableCells(headers, width),
    rows,
    alignments,
  };
}

function parseInlineTokens(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const pattern =
    /(\[([^\]\n]+)\]\(([^)\n]+)\))|(\*\*([^*\n]+)\*\*)|(~~([^~\n]+)~~)|(\*([^*\n]+)\*)|(`([^`\n]+)`)|((?:https?:\/\/|\/|\.\.?\/|~\/)[^\s<]+)/gu;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const matched = match[0] ?? '';
    const index = match.index ?? 0;
    if (index > lastIndex) {
      tokens.push({ kind: 'text', value: text.slice(lastIndex, index) });
    }

    if (match[2] && match[3]) {
      const fileReference = parseFileReference(match[3]);
      if (fileReference) {
        tokens.push({
          kind: 'file',
          value: match[2],
          path: fileReference.path,
          displayPath: match[2] || fileReference.path,
        });
      } else {
        tokens.push({ kind: 'link', value: match[2], href: match[3] });
      }
    } else if (match[5]) {
      tokens.push({ kind: 'bold', value: match[5] });
    } else if (match[7]) {
      tokens.push({ kind: 'strikethrough', value: match[7] });
    } else if (match[9]) {
      tokens.push({ kind: 'italic', value: match[9] });
    } else if (match[11]) {
      tokens.push({ kind: 'code', value: match[11] });
    } else if (matched) {
      const fileReference = parseFileReference(matched);
      if (fileReference) {
        tokens.push({
          kind: 'file',
          value: matched,
          path: fileReference.path,
          displayPath: matched,
        });
      } else {
        tokens.push({ kind: 'link', value: matched, href: matched });
      }
    }

    lastIndex = index + matched.length;
  }

  if (lastIndex < text.length) {
    tokens.push({ kind: 'text', value: text.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ kind: 'text', value: text }];
}

function flushParagraph(lines: string[], blocks: Block[]): void {
  const value = lines.join('\n').trim();
  if (value) blocks.push({ kind: 'paragraph', value });
  lines.length = 0;
}

function parseTextBlocks(text: string): Block[] {
  const normalized = text.replace(/\r\n/g, '\n');
  const blocks: Block[] = [];
  const paragraphLines: string[] = [];
  const lines = normalized.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';

    const table = readTableBlock(lines, index);
    if (table) {
      flushParagraph(paragraphLines, blocks);
      blocks.push(table);
      index += 1 + table.rows.length;
      continue;
    }

    if (line.startsWith('```')) {
      flushParagraph(paragraphLines, blocks);
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').startsWith('```')) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      blocks.push({ kind: 'codeBlock', language, value: codeLines.join('\n') });
      continue;
    }

    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/u.test(line)) {
      flushParagraph(paragraphLines, blocks);
      blocks.push({ kind: 'thematicBreak' });
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/u);
    if (headingMatch) {
      flushParagraph(paragraphLines, blocks);
      blocks.push({
        kind: 'heading',
        level: headingMatch[1].length,
        value: headingMatch[2],
      });
      continue;
    }

    const blockquoteMatch = line.match(/^>\s?(.*)$/u);
    if (blockquoteMatch) {
      flushParagraph(paragraphLines, blocks);
      const quoteLines = [blockquoteMatch[1]];
      while (index + 1 < lines.length) {
        const nextMatch = (lines[index + 1] ?? '').match(/^>\s?(.*)$/u);
        if (!nextMatch) break;
        quoteLines.push(nextMatch[1]);
        index += 1;
      }
      blocks.push({ kind: 'blockquote', value: quoteLines.join('\n').trim() });
      continue;
    }

    const taskMatch = line.match(/^[-*]\s+\[( |x|X)\]\s+(.+)$/u);
    if (taskMatch) {
      flushParagraph(paragraphLines, blocks);
      const items: TaskListItem[] = [{
        checked: taskMatch[1].toLowerCase() === 'x',
        text: taskMatch[2],
      }];
      while (index + 1 < lines.length) {
        const nextMatch = (lines[index + 1] ?? '').match(/^[-*]\s+\[( |x|X)\]\s+(.+)$/u);
        if (!nextMatch) break;
        items.push({
          checked: nextMatch[1].toLowerCase() === 'x',
          text: nextMatch[2],
        });
        index += 1;
      }
      blocks.push({ kind: 'taskList', items });
      continue;
    }

    const unorderedMatch = line.match(/^[-*]\s+(.+)$/u);
    if (unorderedMatch) {
      flushParagraph(paragraphLines, blocks);
      const items: ListItem[] = [{ paragraphs: [unorderedMatch[1]] }];
      while (index + 1 < lines.length) {
        const nextMatch = (lines[index + 1] ?? '').match(/^[-*]\s+(.+)$/u);
        if (!nextMatch) break;
        items.push({ paragraphs: [nextMatch[1]] });
        index += 1;
      }
      blocks.push({ kind: 'unorderedList', items });
      continue;
    }

    const orderedMatch = line.match(/^(\d+)\.\s+(.+)$/u);
    if (orderedMatch) {
      flushParagraph(paragraphLines, blocks);
      const start = Number.parseInt(orderedMatch[1], 10) || 1;
      const items: ListItem[] = [{ paragraphs: [orderedMatch[2]] }];
      while (index + 1 < lines.length) {
        const nextMatch = (lines[index + 1] ?? '').match(/^\d+\.\s+(.+)$/u);
        if (!nextMatch) break;
        items.push({ paragraphs: [nextMatch[1]] });
        index += 1;
      }
      blocks.push({ kind: 'orderedList', items, start });
      continue;
    }

    if (!line.trim()) {
      flushParagraph(paragraphLines, blocks);
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph(paragraphLines, blocks);
  return blocks;
}

function parseBlocks(text: string): Block[] {
  if (!text.includes('![') || !text.includes('](')) {
    const blocks = parseTextBlocks(text);
    return blocks.length > 0 ? blocks : [{ kind: 'paragraph', value: text }];
  }

  const blocks: Block[] = [];
  const imagePattern = /!\[([^\]]*)\]\(([^)\n]+)\)/gu;
  let cursor = 0;

  for (const match of text.matchAll(imagePattern)) {
    const [fullMatch, altRaw, urlRaw] = match;
    const start = match.index ?? -1;
    if (start < 0) continue;
    const end = start + fullMatch.length;
    if (start > cursor) {
      blocks.push(...parseTextBlocks(text.slice(cursor, start)));
    }
    blocks.push({
      kind: 'image',
      url: urlRaw.trim(),
      alt: altRaw.trim(),
      markdown: fullMatch,
    });
    cursor = end;
  }

  if (cursor < text.length) {
    blocks.push(...parseTextBlocks(text.slice(cursor)));
  }

  return blocks.length > 0 ? blocks : [{ kind: 'paragraph', value: text }];
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return parseInlineTokens(text).map((token, index) => {
    const key = `${keyPrefix}:${index}`;
    switch (token.kind) {
      case 'bold':
        return <strong key={key} className="font-semibold text-slate-900">{token.value}</strong>;
      case 'italic':
        return <em key={key} className="italic">{token.value}</em>;
      case 'strikethrough':
        return <s key={key} className="line-through">{token.value}</s>;
      case 'code':
        return (
          <code key={key} className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.9em] text-inherit">
            {token.value}
          </code>
        );
      case 'file':
        return (
          <a
            key={key}
            href={token.path}
            target="_blank"
            rel="noreferrer"
            className="text-inherit underline decoration-current/40 underline-offset-4"
            title={token.path}
          >
            {token.displayPath}
          </a>
        );
      case 'link':
        return (
          <a
            key={key}
            href={token.href}
            target="_blank"
            rel="noreferrer"
            className="text-inherit underline decoration-current/40 underline-offset-4"
            title={token.href}
          >
            {token.value}
          </a>
        );
      default:
        return <span key={key}>{token.value}</span>;
    }
  });
}

function headingClass(level: number): string {
  switch (level) {
    case 1:
      return 'text-lg font-semibold';
    case 2:
      return 'text-base font-semibold';
    case 3:
      return 'text-sm font-semibold';
    default:
      return 'text-sm font-semibold';
  }
}

function listItemParagraphs(item: ListItem, keyPrefix: string): ReactNode {
  return item.paragraphs.map((paragraph, index) => (
    <div key={`${keyPrefix}:${index}`} className="leading-7">
      {renderInline(paragraph, `${keyPrefix}:${index}`)}
    </div>
  ));
}

type MessageContentProps = {
  text: string;
};

function MessageContent({ text }: MessageContentProps) {
  const blocks = parseBlocks(text);

  return (
    <div className="space-y-3 text-sm">
      {blocks.map((block, blockIndex) => {
        if (block.kind === 'paragraph') {
          return (
            <p key={`paragraph:${blockIndex}`} className="whitespace-pre-wrap leading-7">
              {renderInline(block.value, `paragraph:${blockIndex}`)}
            </p>
          );
        }

        if (block.kind === 'heading') {
          const Tag = (`h${Math.min(block.level, 6)}` as keyof JSX.IntrinsicElements);
          return (
            <Tag key={`heading:${blockIndex}`} className={headingClass(block.level)}>
              {renderInline(block.value, `heading:${blockIndex}`)}
            </Tag>
          );
        }

        if (block.kind === 'blockquote') {
          return (
            <blockquote
              key={`blockquote:${blockIndex}`}
              className="border-l-2 border-slate-300 pl-4 text-slate-700 whitespace-pre-wrap leading-7"
            >
              {renderInline(block.value, `blockquote:${blockIndex}`)}
            </blockquote>
          );
        }

        if (block.kind === 'unorderedList') {
          return (
            <ul key={`ul:${blockIndex}`} className="list-disc pl-5 space-y-1">
              {block.items.map((item, itemIndex) => (
                <li key={`ul:${blockIndex}:${itemIndex}`}>{listItemParagraphs(item, `ul:${blockIndex}:${itemIndex}`)}</li>
              ))}
            </ul>
          );
        }

        if (block.kind === 'orderedList') {
          return (
            <ol key={`ol:${blockIndex}`} className="list-decimal pl-5 space-y-1" start={block.start}>
              {block.items.map((item, itemIndex) => (
                <li key={`ol:${blockIndex}:${itemIndex}`}>{listItemParagraphs(item, `ol:${blockIndex}:${itemIndex}`)}</li>
              ))}
            </ol>
          );
        }

        if (block.kind === 'taskList') {
          return (
            <ul key={`task:${blockIndex}`} className="space-y-2">
              {block.items.map((item, itemIndex) => (
                <li key={`task:${blockIndex}:${itemIndex}`} className="flex items-start gap-2">
                  <span className="pt-0.5 text-slate-600">{item.checked ? '☑' : '☐'}</span>
                  <div className="leading-7">{renderInline(item.text, `task:${blockIndex}:${itemIndex}`)}</div>
                </li>
              ))}
            </ul>
          );
        }

        if (block.kind === 'table') {
          return (
            <div key={`table:${blockIndex}`} className="w-full overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-xl border border-slate-200 bg-white text-sm text-slate-800">
                <thead>
                  <tr>
                    {block.headers.map((cell, cellIndex) => (
                      <th
                        key={`table:${blockIndex}:head:${cellIndex}`}
                        className={`border-b border-l border-slate-200 bg-slate-100 px-3 py-2 text-left align-top font-semibold text-slate-900 whitespace-pre-wrap break-words ${cellIndex === 0 ? 'border-l-0' : ''}`}
                        style={{ overflowWrap: 'anywhere', textAlign: block.alignments[cellIndex] }}
                      >
                        {renderInline(cell, `table:${blockIndex}:head:${cellIndex}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                {block.rows.length > 0 ? (
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={`table:${blockIndex}:row:${rowIndex}`}>
                        {row.map((cell, cellIndex) => (
                          <td
                            key={`table:${blockIndex}:row:${rowIndex}:cell:${cellIndex}`}
                            className={`border-b border-l border-slate-200 px-3 py-2 align-top whitespace-pre-wrap break-words ${cellIndex === 0 ? 'border-l-0' : ''} ${rowIndex === block.rows.length - 1 ? 'border-b-0' : ''}`}
                            style={{ overflowWrap: 'anywhere', textAlign: block.alignments[cellIndex] }}
                          >
                            {renderInline(cell, `table:${blockIndex}:row:${rowIndex}:cell:${cellIndex}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ) : null}
              </table>
            </div>
          );
        }

        if (block.kind === 'codeBlock') {
          return (
            <div key={`code:${blockIndex}`} className="overflow-hidden rounded-xl border border-black/5 bg-gray-950 text-gray-100">
              {block.language ? (
                <div className="border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-gray-400">
                  {block.language}
                </div>
              ) : null}
              <pre className="overflow-x-auto px-4 py-3 text-xs leading-6">
                <code className="hljs" dangerouslySetInnerHTML={{ __html: highlightCode(block.language, block.value) }} />
              </pre>
            </div>
          );
        }

        if (block.kind === 'thematicBreak') {
          return <hr key={`hr:${blockIndex}`} className="border-slate-200" />;
        }

        const imageStyle: CSSProperties = {
          maxHeight: '22rem',
        };
        return (
          <a
            key={`image:${blockIndex}`}
            href={block.url}
            target="_blank"
            rel="noreferrer"
            className="block"
            title={block.alt || 'Embedded image'}
          >
            <img
              className="max-w-full rounded-xl border border-slate-200 object-contain"
              style={imageStyle}
              src={block.url}
              alt={block.alt || 'Embedded image'}
              loading="lazy"
            />
          </a>
        );
      })}
    </div>
  );
}

export default MessageContent;
