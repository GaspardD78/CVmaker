import { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Loader2, X, Check } from 'lucide-react';

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
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isValid, setIsValid] = useState(false);
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
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      setIsValid(false);
      return;
    }
    
    // Si la requête correspond exactement à la valeur (qui a été sélectionnée)
    if (query === value) {
      setIsValid(true);
      return;
    }

    setIsValid(false);

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const isPostalCode = /^\d{5}$/.test(query.trim());
        const param = isPostalCode ? `codePostal=${query.trim()}` : `nom=${encodeURIComponent(query)}`;
        const res = await fetch(`https://geo.api.gouv.fr/communes?${param}&fields=nom,code,codesPostaux,codeDepartement&limit=5`);
        if (!res.ok) throw new Error('API error');
        const data: GeoCommune[] = await res.json();
        setResults(data);
        setIsOpen(true);
        setSelectedIndex(-1);
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
    setIsValid(false);
    onSelect('', '', '');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || results.length === 0) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        handleSelect(results[selectedIndex]);
      } else if (results.length > 0) {
        // Sélectionne le premier par défaut
        handleSelect(results[0]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
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
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          className={`w-full pl-8 pr-16 ${className} ${isValid ? 'border-green-400 focus:ring-green-500 bg-green-50/30 dark:bg-green-900/10' : ''}`}
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isLoading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
          {isValid && !isLoading && <Check className="w-4 h-4 text-green-500" />}
          {query && !isLoading && (
            <button
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600"
              title="Effacer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-1">
          <ul className="max-h-60 overflow-auto py-1">
            {results.map((c, i) => (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => handleSelect(c)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-start gap-2 transition-colors ${
                    selectedIndex === i ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <MapPin className={`w-4 h-4 mt-0.5 flex-shrink-0 ${selectedIndex === i ? 'text-blue-500' : 'text-gray-400'}`} />
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
