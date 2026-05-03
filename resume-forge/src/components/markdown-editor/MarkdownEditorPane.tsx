interface MarkdownEditorPaneProps {
  value: string;
  onChange: (value: string) => void;
}

export function MarkdownEditorPane({ value, onChange }: MarkdownEditorPaneProps) {
  return (
    <div className="h-full flex flex-col border-r border-gray-200">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide">
        Markdown
      </div>
      <textarea
        className="flex-1 w-full resize-none font-mono text-sm p-4 pb-32 outline-none bg-white text-gray-800 leading-relaxed"
        style={{ touchAction: 'manipulation' }}
        value={value}
        onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
        onChange={() => {/* controlled via onInput */}}
        placeholder="Commencez à rédiger votre CV en Markdown..."
        spellCheck={false}
      />
    </div>
  );
}
