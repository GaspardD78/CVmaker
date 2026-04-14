import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface MarkdownPreviewPaneProps {
  markdown: string;
  printableId?: string;
}

const CV_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="text-2xl font-bold text-gray-900 mb-1 leading-tight">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-semibold text-gray-800 mt-5 mb-2 pb-1 border-b border-gray-300 uppercase tracking-wide">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-gray-800 mt-3 mb-0.5">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-sm text-gray-700 mb-2 leading-relaxed">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside text-sm text-gray-700 mb-2 space-y-0.5 pl-2">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside text-sm text-gray-700 mb-2 space-y-0.5 pl-2">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-gray-900">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-gray-600">{children}</em>
  ),
  hr: () => (
    <hr className="border-t border-gray-300 my-3" />
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-blue-600 underline text-sm">{children}</a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-gray-300 pl-3 text-gray-600 italic my-2">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="bg-gray-100 rounded px-1 text-xs font-mono text-gray-800">{children}</code>
  ),
  table: ({ children }) => (
    <table className="text-sm border-collapse w-full mb-2">{children}</table>
  ),
  th: ({ children }) => (
    <th className="border border-gray-300 px-2 py-1 text-left font-semibold bg-gray-50">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-gray-300 px-2 py-1">{children}</td>
  ),
};

export function MarkdownPreviewPane({ markdown, printableId }: MarkdownPreviewPaneProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide">
        Aperçu
      </div>
      <div className="flex-1 overflow-y-auto bg-white">
        <div
          id={printableId ?? 'markdown-printable'}
          className="p-8 min-h-full max-w-2xl mx-auto"
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={CV_COMPONENTS}
          >
            {markdown}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
