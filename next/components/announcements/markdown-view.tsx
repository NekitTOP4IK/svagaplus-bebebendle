import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactElement } from "react";

type Props = Readonly<{ content: string }>;

/**
 * Renders markdown using react-markdown + remark-gfm (no rehype-raw).
 * Element styling is provided by the surrounding container:
 *   - `.mc-body` for the dark Minecraft-inventory look (overlay, admin preview).
 * If rendered elsewhere, wrap with a sibling styling class.
 *
 * Only link-safety attributes are wired here (target, rel) — everything else
 * (headings, lists, strong, em, code, tables, quotes, hr) is themed by CSS.
 */
export function MarkdownView({ content }: Props): ReactElement {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}