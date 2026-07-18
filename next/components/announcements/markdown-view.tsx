import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactElement } from "react";

type Props = Readonly<{ content: string }>;

export function MarkdownView({ content }: Props): ReactElement {
  return (
    <div className="markdown-body text-sm leading-relaxed text-zinc-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="pixel-text mt-3 mb-1 text-base">{children}</h1>,
          h2: ({ children }) => <h2 className="pixel-text mt-3 mb-1 text-base">{children}</h2>,
          h3: ({ children }) => <h3 className="pixel-text mt-2 mb-1 text-sm">{children}</h3>,
          h4: ({ children }) => <h4 className="font-bold text-white mt-2 mb-1 text-sm">{children}</h4>,
          h5: ({ children }) => <h5 className="font-bold text-white mt-2 mb-1 text-xs uppercase">{children}</h5>,
          h6: ({ children }) => <h6 className="font-bold text-zinc-300 mt-2 mb-1 text-xs uppercase">{children}</h6>,
          p: ({ children }) => <p className="my-2">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-300 underline hover:text-amber-200"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
          em: ({ children }) => <em className="italic text-zinc-100">{children}</em>,
          del: ({ children }) => <del className="line-through text-zinc-400">{children}</del>,
          code: ({ children }) => (
            <code className="font-mono text-amber-200 bg-black/40 px-1">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="bg-black/40 border border-black/60 p-3 overflow-x-auto my-2">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-zinc-600 pl-3 text-zinc-300 italic my-2">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <table className="border-collapse text-xs my-2">{children}</table>
          ),
          th: ({ children }) => (
            <th className="border border-zinc-700 px-2 py-1 text-left font-bold text-white bg-black/40">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-zinc-700 px-2 py-1">{children}</td>
          ),
          hr: () => <hr className="my-4 border-t border-zinc-700" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}