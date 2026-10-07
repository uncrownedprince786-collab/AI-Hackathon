/**
 * Minimal markdown renderer for blog posts.
 *
 * Content is written by us or generated into `content/blog`, so it is trusted,
 * but every line of text is HTML-escaped before any formatting is applied, so
 * only the tags this file emits can ever reach the page.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(text: string): string {
  let out = escapeHtml(text);

  // `code`
  out = out.replace(/`([^`]+)`/g, (_m, code: string) => `<code>${code}</code>`);
  // **bold**
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // *emphasis*
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // [label](https://url)
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label: string, url: string) => {
    const safe = url.replace(/"/g, "&quot;");
    return `<a href="${safe}" rel="noopener noreferrer nofollow" target="_blank">${label}</a>`;
  });
  // [label](/internal/path) — site links stay on-site, no nofollow.
  out = out.replace(/\[([^\]]+)\]\((\/[^)\s]+)\)/g, (_m, label: string, path: string) => {
    const safe = path.replace(/"/g, "&quot;");
    return `<a href="${safe}">${label}</a>`;
  });

  return out;
}

/** Splits a markdown document into well-formed blocks. */
export function renderMarkdown(markdown: string): string {
  const source = markdown.replace(/\r\n/g, "\n").trim();
  const lines = source.split("\n");
  const html: string[] = [];

  let paragraph: string[] = [];
  let list: string[] = [];
  let ordered = false;
  let code: string[] = [];
  let quote: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      const tag = ordered ? "ol" : "ul";
      html.push(`<${tag}>${list.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`);
      list = [];
      ordered = false;
    }
  };
  const flushCode = () => {
    if (code.length) {
      html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      code = [];
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      html.push(`<blockquote><p>${inline(quote.join(" "))}</p></blockquote>`);
      quote = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushCode();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.startsWith("```")) {
      if (code.length) flushCode();
      else {
        flushAll();
        code = [];
        code.push("");
      }
      continue;
    }
    if (code.length) {
      code[code.length - 1] = code[code.length - 1] ? `${code[code.length - 1]}\n${line}` : line;
      continue;
    }

    if (!line.trim()) {
      flushAll();
      continue;
    }

    const heading = line.match(/^(#{2,3})\s+(.*)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushAll();
      html.push("<hr />");
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      flushQuote();
      if (!ordered) list.push(bullet[1]);
      else {
        flushList();
        ordered = false;
        list.push(bullet[1]);
      }
      continue;
    }

    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (numbered) {
      flushParagraph();
      flushQuote();
      if (!ordered) {
        flushList();
        ordered = true;
        list.push(numbered[1]);
      } else list.push(numbered[1]);
      continue;
    }

    if (line.startsWith("> ")) {
      flushParagraph();
      flushList();
      quote.push(line.slice(2));
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(line.trim());
  }

  flushAll();

  // Only our own tags exist at this point: every piece of user text went
  // through escapeHtml before any inline formatting was applied.
  return html.join("\n").trim();
}
