import React from 'react';

interface MarkdownRendererProps {
  text: string;
}

export function MarkdownRenderer({ text }: MarkdownRendererProps) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(<ul key={`ul-${elements.length}`} className="list-disc pl-5 my-1">{currentList}</ul>);
      currentList = [];
    }
  };

  const parseInlineElements = (lineText: string, lineIndex: number) => {
    // Basic bold parsing: **text**
    const parts = lineText.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return <strong key={`${lineIndex}-${i}`}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const content = trimmed.substring(2).trim();
      currentList.push(
        <li key={`li-${index}`}>
          {parseInlineElements(content, index)}
        </li>
      );
    } else {
      flushList();
      if (trimmed === '') {
        // preserve empty lines as small spacing if needed, or just a br
        elements.push(<br key={`br-${index}`} />);
      } else {
        elements.push(
          <p key={`p-${index}`}>
            {parseInlineElements(line, index)}
          </p>
        );
      }
    }
  });

  flushList();

  return <>{elements}</>;
}
