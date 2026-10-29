import { useState } from 'react';
import { parseHeaderExtras } from '@/lib/header-extras';

interface HeaderExtrasEditorProps {
  /** Nom du champ caché envoyé avec le formulaire (tableau JSON). */
  name: string;
  initial: string[] | undefined;
}

/** Liste éditable de mentions d'en-tête (ex. « Mobilité Île-de-France »). */
export function HeaderExtrasEditor({ name, initial }: HeaderExtrasEditorProps) {
  const [items, setItems] = useState<string[]>(parseHeaderExtras(initial));
  const [draft, setDraft] = useState('');

  const add = () => {
    const next = parseHeaderExtras([...items, draft]);
    setItems(next);
    setDraft('');
  };

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: items.length ? 8 : 0 }}>
        {items.map(item => (
          <span key={item} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '3px 8px', borderRadius: 99, background: 'var(--rf-surface)', border: '1px solid var(--rf-border)', color: 'var(--rf-text)' }}>
            {item}
            <button type="button" aria-label={`Retirer ${item}`} onClick={() => setItems(items.filter(i => i !== item))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rf-muted)', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Ex : Mobilité Île-de-France"
          style={{ flex: 1, padding: '8px 10px', fontSize: 13, background: 'var(--rf-surface)', border: '1px solid var(--rf-border)', borderRadius: 8, color: 'var(--rf-text)' }}
        />
        <button type="button" className="rf-btn-secondary" onClick={add} disabled={!draft.trim()}>Ajouter</button>
      </div>
    </div>
  );
}
