import type { ReactNode } from 'react';

type InlineToken =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'link'; value: string; href: string };

type Block =
  | { kind: 'paragraph'; value: string }
  | { kind: 'heading'; level: number; value: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'code'; language: string; value: string };

function parseInlineTokens(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const pattern = /(\[([^\]\n]+)\]\((https?:\/\/[^)\n]+)\))|(\*\*([^*\n]+)\*\*)|(`([^`\n]+)`)|(https?:\/\/[^\s<]+)/gu;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const matched = match[0] ?? '';
    const index = match.index ?? 0;
    if (index > lastIndex) {
      tokens.push({ kind: 'text', value: text.slice(lastIndex, index) });
    }

    if (match[2] && match[3]) {
      tokens.push({ kind: 'link', value: match[2], href: match[3] });
    } else if (match[5]) {
      tokens.push({ kind: 'bold', value: match[5] });
    } else if (match[7]) {
      tokens.push({ kind: 'code', value: match[7] });
    } else if (matched) {
      tokens.push({ kind: 'link', value: matched, href: matched });
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
  if (value) {
    blocks.push({ kind: 'paragraph', value });
  }
  lines.length = 0;
}

function parseBlocks(text: string): Block[] {
  const normalized = text.replace(/\r\n/g, '\n');
  const blocks: Block[] = [];
  const paragraphLines: string[] = [];
  const lines = normalized.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';

    if (line.startsWith('```')) {
      flushParagraph(paragraphLines, blocks);
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').startsWith('```')) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      blocks.push({
        kind: 'code',
        language,
        value: codeLines.join('\n'),
      });
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

    const listMatch = line.match(/^[-*]\s+(.+)$/u);
    if (listMatch) {
      flushParagraph(paragraphLines, blocks);
      const items = [listMatch[1]];
      while (index + 1 < lines.length) {
        const next = lines[index + 1] ?? '';
        const nextMatch = next.match(/^[-*]\s+(.+)$/u);
        if (!nextMatch) break;
        items.push(nextMatch[1]);
        index += 1;
      }
      blocks.push({ kind: 'list', items });
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

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return parseInlineTokens(text).map((token, index) => {
    const key = `${keyPrefix}:${index}`;
    switch (token.kind) {
      case 'bold':
        return <strong key={key} className="font-semibold">{token.value}</strong>;
      case 'code':
        return (
          <code key={key} className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.9em] text-inherit">
            {token.value}
          </code>
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
    default:
      return 'text-sm font-semibold';
  }
}

type MessageContentProps = {
  text: string;
};

function MessageContent({ text }: MessageContentProps) {
  const blocks = parseBlocks(text);

  return (
    <div className="space-y-3 text-sm">
      {blocks.map((block, blockIndex) => {
        if (block.kind === 'heading') {
          const Tag = (`h${Math.min(block.level, 6)}` as keyof JSX.IntrinsicElements);
          return (
            <Tag key={`heading:${blockIndex}`} className={headingClass(block.level)}>
              {renderInline(block.value, `heading:${blockIndex}`)}
            </Tag>
          );
        }

        if (block.kind === 'list') {
          return (
            <ul key={`list:${blockIndex}`} className="list-disc pl-5 space-y-1">
              {block.items.map((item, itemIndex) => (
                <li key={`list:${blockIndex}:${itemIndex}`}>{renderInline(item, `list:${blockIndex}:${itemIndex}`)}</li>
              ))}
            </ul>
          );
        }

        if (block.kind === 'code') {
          return (
            <div key={`code:${blockIndex}`} className="overflow-hidden rounded-xl border border-black/5 bg-gray-950 text-gray-100">
              {block.language ? (
                <div className="border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-gray-400">
                  {block.language}
                </div>
              ) : null}
              <pre className="overflow-x-auto px-4 py-3 text-xs leading-6">
                <code>{block.value}</code>
              </pre>
            </div>
          );
        }

        return (
          <p key={`paragraph:${blockIndex}`} className="whitespace-pre-wrap leading-7">
            {renderInline(block.value, `paragraph:${blockIndex}`)}
          </p>
        );
      })}
    </div>
  );
}

export default MessageContent;
