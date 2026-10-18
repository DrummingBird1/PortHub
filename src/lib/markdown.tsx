import type { ReactNode } from "react";

/**
 * Minimal, safe Markdown renderer for release notes.
 *
 * Safety by construction: raw HTML is stripped to text first, output is built from React
 * elements only (no `dangerouslySetInnerHTML`), and links are never real `href`s. Only
 * https://github.com/ links become clickable, through the `onLink` callback, which goes to a
 * Rust command that re-checks the URL.
 */

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/** Remove HTML (tags, comments, script/style bodies) and decode common entities. */
export function stripHtml(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (e) => ENTITIES[e] ?? e);
}

export const isGithubLink = (url: string): boolean =>
  /^https:\/\/github\.com\/[\w\-./?=&#%+~]+$/.test(url);

export type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; text: string }
  | { type: "quote"; text: string }
  | { type: "rule" };

/** Line-based block parser. */
export function parseBlocks(markdown: string): Block[] {
  const lines = stripHtml(markdown).split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    const text = para.join(" ").trim();
    if (text) blocks.push({ type: "paragraph", text });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        code.push(lines[i] ?? "");
        i++;
      }
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      blocks.push({
        type: "heading",
        level: heading[1]?.length ?? 1,
        text: (heading[2] ?? "").replace(/\s#+$/, ""),
      });
      continue;
    }
    if (/^([-*_])(\s*\1){2,}$/.test(trimmed)) {
      flush();
      blocks.push({ type: "rule" });
      continue;
    }
    const item = /^(?:[-*+]|(\d+)[.)])\s+(.*)$/.exec(trimmed);
    if (item) {
      flush();
      const ordered = item[1] !== undefined;
      const last = blocks.at(-1);
      const text = item[2] ?? "";
      if (last?.type === "list" && last.ordered === ordered) last.items.push(text);
      else blocks.push({ type: "list", ordered, items: [text] });
      continue;
    }
    if (trimmed.startsWith(">")) {
      flush();
      const text = trimmed.replace(/^>\s?/, "");
      const last = blocks.at(-1);
      if (last?.type === "quote") last.text += ` ${text}`;
      else blocks.push({ type: "quote", text });
      continue;
    }
    if (trimmed === "") {
      flush();
      continue;
    }
    para.push(trimmed);
  }
  flush();
  return blocks;
}

const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(!?\[[^\]]*\]\([^)\s]*\))/;

/** Inline formatting: code, bold, italic, links (images become their alt text). */
export function renderInline(
  text: string,
  onLink?: (url: string) => void,
  keyPrefix = "i",
): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;
  while (rest.length > 0) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${n++}`;
    if (m[1]) out.push(<code key={key}>{tok.slice(1, -1)}</code>);
    else if (m[2])
      out.push(<strong key={key}>{renderInline(tok.slice(2, -2), onLink, key)}</strong>);
    else if (m[3]) out.push(<em key={key}>{renderInline(tok.slice(1, -1), onLink, key)}</em>);
    else {
      const link = /^(!?)\[([^\]]*)\]\(([^)\s]*)\)$/.exec(tok);
      const isImage = link?.[1] === "!";
      const label = link?.[2] ?? "";
      const url = link?.[3] ?? "";
      if (isImage) {
        if (label) out.push(label);
      } else if (onLink && isGithubLink(url)) {
        out.push(
          <button
            key={key}
            type="button"
            className="md-link"
            title={url}
            onClick={() => {
              onLink(url);
            }}
          >
            {label || url}
          </button>,
        );
      } else {
        out.push(label || url);
      }
    }
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

export function Markdown({ source, onLink }: { source: string; onLink?: (url: string) => void }) {
  const blocks = parseBlocks(source);
  return (
    <div className="markdown">
      {blocks.map((b, i) => {
        const key = `b${i}`;
        switch (b.type) {
          case "heading": {
            const level = Math.min(6, b.level + 2);
            const Tag = `h${level}` as "h3" | "h4" | "h5" | "h6";
            return <Tag key={key}>{renderInline(b.text, onLink, key)}</Tag>;
          }
          case "paragraph":
            return <p key={key}>{renderInline(b.text, onLink, key)}</p>;
          case "list": {
            const items = b.items.map((it, j) => (
              <li key={`${key}-${j}`}>{renderInline(it, onLink, `${key}-${j}`)}</li>
            ));
            return b.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
          }
          case "code":
            return (
              <pre key={key}>
                <code>{b.text}</code>
              </pre>
            );
          case "quote":
            return <blockquote key={key}>{renderInline(b.text, onLink, key)}</blockquote>;
          case "rule":
            return <hr key={key} />;
        }
      })}
    </div>
  );
}
