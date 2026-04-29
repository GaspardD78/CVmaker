import { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Loader2, X } from 'lucide-react';

interface GeoCommune {
  nom: string;
  code: string; // INSEE code
  codeDepartement: string;
  codesPostaux: string[];
  _score: number;
}

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (city: string, insee: string, dept: string) => void;
  placeholder?: string;
  className?: string;
}

export function LocationAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Ex: Bordeaux, Paris, 69001...",
  className = "",
}: LocationAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<GeoCommune[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query.trim() || query === value) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(query)}&fields=nom,code,codesPostaux,codeDepartement&limit=5`);
        if (!res.ok) throw new Error('API error');
        const data: GeoCommune[] = await res.json();
        setResults(data);
        setIsOpen(true);
      } catch (err) {
        console.error('Failed to fetch geo communes:', err);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, value]);

  const handleSelect = (commune: GeoCommune) => {
    const label = `${commune.nom} (${commune.codeDepartement})`;
    setQuery(label);
    onChange(label);
    setIsOpen(false);
    onSelect(commune.nom, commune.code, commune.codeDepartement);
  };

  const handleClear = () => {
    setQuery('');
    onChange('');
    setResults([]);
    onSelect('', '', '');
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
          }}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          className={`w-full pl-8 pr-8 ${className}`}
        />
        {isLoading ? (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
        ) : query ? (
          <button
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-1">
          <ul className="max-h-60 overflow-auto py-1">
            {results.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => handleSelect(c)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-start gap-2 transition-colors"
                >
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{c.nom}</span>
                    <span className="text-gray-500 dark:text-gray-400 ml-1">({c.codeDepartement})</span>
                    {c.codesPostaux && c.codesPostaux.length > 0 && (
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        CP: {c.codesPostaux.slice(0, 3).join(', ')}{c.codesPostaux.length > 3 ? '...' : ''}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
