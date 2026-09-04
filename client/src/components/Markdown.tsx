import { useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';

/**
 * LLMs are inconsistent about math delimiters. Two fixes before parsing:
 *
 *  1. Gemini sometimes emits TeX-style `\(...\)` / `\[...\]`, which remark-math
 *     does not recognise at all.
 *  2. It writes display math as `$$x$$` on a single line. micromark treats the
 *     trailing text on an opening `$$` fence as *meta*, so that silently
 *     degrades to inline math. Expanding it to a real fence restores centred,
 *     full-size display rendering.
 */
function normalizeMath(src: string): string {
  return src
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, body: string) => `\n\n$$\n${body.trim()}\n$$\n\n`)
    .replace(/\\\((.+?)\\\)/g, (_, body: string) => `$${body}$`)
    .replace(
      /^[ \t]*\$\$[ \t]*(\S[^\n]*?)[ \t]*\$\$[ \t]*$/gm,
      (_, body: string) => `$$\n${body}\n$$`
    );
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  // Pull the language off the inner <code class="language-ts hljs"> element.
  const lang = useMemo(() => {
    const child = Array.isArray(children) ? children[0] : children;
    const cls =
      (child as { props?: { className?: string } })?.props?.className ?? '';
    return /language-([\w+-]+)/.exec(cls)?.[1] ?? 'code';
  }, [children]);

  async function copy() {
    const text = ref.current?.innerText ?? '';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — nothing useful to do */
    }
  }

  return (
    <div className="codeblock">
      <div className="codeblock__bar">
        <span className="codeblock__lang">{lang}</span>
        <button className="codeblock__copy" onClick={copy} type="button">
          {copied ? '✓ copied' : '⧉ copy'}
        </button>
      </div>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}

export function Markdown({ children }: { children: string }) {
  const source = useMemo(() => normalizeMath(children), [children]);

  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeKatex,
          [rehypeHighlight, { detect: true, ignoreMissing: true }]
        ]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="md__tablewrap">
              <table>{children}</table>
            </div>
          )
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
