import type { ReactNode } from "react";

function isSafeHref(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith("/");
}

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const chunks: ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = pattern.exec(text)) !== null) {
    const full = match[0];
    const start = match.index;
    if (start > cursor) {
      chunks.push(text.slice(cursor, start));
    }

    if (match[2]) {
      chunks.push(<strong key={`${keyPrefix}-b-${idx}`}>{match[2]}</strong>);
    } else if (match[4]) {
      chunks.push(<em key={`${keyPrefix}-i-${idx}`}>{match[4]}</em>);
    } else if (match[6] && match[7]) {
      const label = match[6];
      const href = match[7].trim();
      if (isSafeHref(href)) {
        const external = /^https?:\/\//i.test(href);
        chunks.push(
          <a
            key={`${keyPrefix}-l-${idx}`}
            href={href}
            className="break-words text-sky-400 underline underline-offset-2 hover:text-sky-500 [overflow-wrap:anywhere]"
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer" : undefined}
          >
            {label}
          </a>,
        );
      } else {
        chunks.push(full);
      }
    } else {
      chunks.push(full);
    }

    cursor = start + full.length;
    idx += 1;
  }

  if (cursor < text.length) {
    chunks.push(text.slice(cursor));
  }
  return chunks;
}

function renderParagraph(lines: string[], key: string): ReactNode {
  return (
    <p key={key} className="break-words leading-relaxed text-slate-200 [overflow-wrap:anywhere]">
      {lines.map((line, idx) => (
        <span key={`${key}-ln-${idx}`}>
          {idx > 0 ? <br /> : null}
          {parseInline(line, `${key}-${idx}`)}
        </span>
      ))}
    </p>
  );
}

export function renderMarkdownBlocks(markdown: string): ReactNode[] {
  const lines = (markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let blockIdx = 0;

  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const line = raw.trimEnd();
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test((lines[i] ?? "").trim())) {
        items.push((lines[i] ?? "").trim().replace(/^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ul key={`blk-ul-${blockIdx++}`} className="list-disc space-y-1 break-words pl-5 text-slate-200 [overflow-wrap:anywhere]">
          {items.map((item, itemIdx) => (
            <li key={`ul-item-${itemIdx}`}>{parseInline(item, `ul-${blockIdx}-${itemIdx}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test((lines[i] ?? "").trim())) {
        items.push((lines[i] ?? "").trim().replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ol key={`blk-ol-${blockIdx++}`} className="list-decimal space-y-1 break-words pl-5 text-slate-200 [overflow-wrap:anywhere]">
          {items.map((item, itemIdx) => (
            <li key={`ol-item-${itemIdx}`}>{parseInline(item, `ol-${blockIdx}-${itemIdx}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() &&
      !/^[-*]\s+/.test((lines[i] ?? "").trim()) &&
      !/^\d+\.\s+/.test((lines[i] ?? "").trim())
    ) {
      paragraphLines.push((lines[i] ?? "").trimEnd());
      i += 1;
    }
    blocks.push(renderParagraph(paragraphLines, `blk-p-${blockIdx++}`));
  }

  return blocks;
}

export function markdownToPlainText(markdown: string): string {
  return (markdown ?? "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
