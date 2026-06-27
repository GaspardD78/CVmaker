import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { getAllTemplates, getTemplate } from '../../templates';
import { CATEGORY_LABELS, CATEGORY_HINTS, type TemplateCategory } from '../../theme/tokens';

interface TemplatePickerPopoverProps {
  currentTemplateId: string;
  onSelect: (templateId: string) => void;
}

// ── Mini SVG previews ──────────────────────────────────────────────────────
// Chaque preview utilise la couleur d'accent de la palette principale du template.

interface PreviewProps {
  accent: string;
  ink?: string;
}

function PreviewClassic({ accent, ink = '#111827' }: PreviewProps) {
  return (
    <svg viewBox="0 0 80 110" className="w-full h-full">
      <rect width="80" height="110" fill="white" />
      <rect x="16" y="10" width="48" height="4" rx="0.5" fill={ink} />
      <rect x="22" y="17" width="36" height="2" rx="0.5" fill="#6b7280" />
      <rect x="8" y="22" width="64" height="0.8" fill={accent} />
      {[30, 52, 74, 92].map((y, i) => (
        <g key={i}>
          <rect x="8" y={y} width="30" height="2" rx="0.3" fill={ink} />
          <rect x="8" y={y + 3} width="64" height="0.5" fill="#d1d5db" />
          <rect x="8" y={y + 6} width="60" height="1.3" fill="#e5e7eb" />
          <rect x="8" y={y + 10} width="56" height="1.3" fill="#e5e7eb" />
          {y !== 92 && <rect x="8" y={y + 14} width="50" height="1.3" fill="#e5e7eb" />}
        </g>
      ))}
    </svg>
  );
}

function PreviewModern({ accent, ink = '#111827' }: PreviewProps) {
  return (
    <svg viewBox="0 0 80 110" className="w-full h-full">
      <rect width="80" height="110" fill="white" />
      <rect x="22" y="10" width="36" height="4" rx="0.5" fill={ink} />
      <rect x="26" y="17" width="28" height="2" rx="0.5" fill={accent} />
      {[28, 52, 76, 94].map((y, i) => (
        <g key={i}>
          <rect x="8" y={y} width="26" height="2" rx="0.3" fill={accent} />
          <rect x="8" y={y + 3.5} width="64" height="0.8" fill={accent} opacity="0.4" />
          <rect x="8" y={y + 7} width="58" height="1.3" fill="#e5e7eb" />
          <rect x="8" y={y + 10.5} width="62" height="1.3" fill="#e5e7eb" />
          {y !== 94 && <rect x="8" y={y + 14} width="54" height="1.3" fill="#e5e7eb" />}
        </g>
      ))}
    </svg>
  );
}

function PreviewElegant({ accent, ink = '#111827' }: PreviewProps) {
  return (
    <svg viewBox="0 0 80 110" className="w-full h-full">
      <rect width="80" height="110" fill="white" />
      <rect x="0" y="0" width="2.5" height="110" fill={accent} />
      <rect x="18" y="10" width="44" height="4" rx="0.5" fill={ink} />
      <rect x="24" y="17" width="32" height="2" rx="0.5" fill={accent} opacity="0.8" />
      {[28, 50, 72, 92].map((y, i) => (
        <g key={i}>
          <rect x="10" y={y} width="24" height="1.8" rx="0.3" fill={accent} />
          <rect x="10" y={y + 3} width="60" height="0.4" fill={accent} opacity="0.3" />
          <rect x="10" y={y + 6} width="60" height="1.2" fill="#e5e7eb" />
          <rect x="10" y={y + 9.5} width="54" height="1.2" fill="#e5e7eb" />
          {y !== 92 && <rect x="10" y={y + 13} width="50" height="1.2" fill="#e5e7eb" />}
        </g>
      ))}
    </svg>
  );
}

function PreviewMinimalist({ accent, ink = '#111827' }: PreviewProps) {
  return (
    <svg viewBox="0 0 80 110" className="w-full h-full">
      <rect width="80" height="110" fill="white" />
      <rect x="10" y="14" width="30" height="3" rx="0.3" fill={ink} />
      <rect x="10" y="20" width="18" height="1.3" rx="0.3" fill="#9ca3af" />
      {[34, 56, 78, 96].map((y, i) => (
        <g key={i}>
          <rect x="10" y={y} width="14" height="1.3" rx="0.2" fill={accent} opacity="0.6" />
          <rect x="10" y={y + 4} width="60" height="1" fill="#f3f4f6" />
          <rect x="10" y={y + 7.5} width="56" height="1" fill="#f3f4f6" />
          {y !== 96 && <rect x="10" y={y + 11} width="52" height="1" fill="#f3f4f6" />}
        </g>
      ))}
    </svg>
  );
}

function PreviewTech({ accent, ink = '#111827' }: PreviewProps) {
  return (
    <svg viewBox="0 0 80 110" className="w-full h-full">
      <rect width="80" height="110" fill="white" />
      <rect x="8" y="10" width="38" height="3.5" rx="0.3" fill={ink} />
      <rect x="8" y="16" width="24" height="1.5" rx="0.2" fill={accent} />
      <rect x="8" y="22" width="64" height="0.6" fill={accent} opacity="0.5" />
      {/* Skills badges */}
      <g>
        <rect x="8" y="28" width="20" height="1.8" rx="0.3" fill={accent} />
        <rect x="8" y="32" width="10" height="3" rx="0.8" fill={accent} opacity="0.2" />
        <rect x="20" y="32" width="12" height="3" rx="0.8" fill={accent} opacity="0.2" />
        <rect x="34" y="32" width="9" height="3" rx="0.8" fill={accent} opacity="0.2" />
        <rect x="45" y="32" width="11" height="3" rx="0.8" fill={accent} opacity="0.2" />
        <rect x="58" y="32" width="8" height="3" rx="0.8" fill={accent} opacity="0.2" />
      </g>
      {[42, 62, 80, 96].map((y, i) => (
        <g key={i}>
          <rect x="8" y={y} width="22" height="1.8" rx="0.3" fill={accent} />
          <rect x="8" y={y + 4} width="60" height="1" fill="#e5e7eb" />
          <rect x="8" y={y + 7} width="56" height="1" fill="#e5e7eb" />
          {y !== 96 && <rect x="8" y={y + 10} width="52" height="1" fill="#e5e7eb" />}
        </g>
      ))}
    </svg>
  );
}

function PreviewExecutive({ accent, ink = '#111827' }: PreviewProps) {
  return (
    <svg viewBox="0 0 80 110" className="w-full h-full">
      <rect width="80" height="110" fill="white" />
      <rect x="14" y="10" width="52" height="4.5" rx="0.3" fill={ink} />
      <rect x="22" y="17" width="36" height="2" rx="0.3" fill={accent} />
      <rect x="12" y="22" width="56" height="0.5" fill={accent} opacity="0.5" />
      {[28, 50, 72, 92].map((y, i) => (
        <g key={i}>
          <rect x="20" y={y} width="40" height="0.5" fill={accent} />
          <rect x="26" y={y + 2} width="28" height="2" rx="0.3" fill={accent} />
          <rect x="20" y={y + 5.5} width="40" height="0.5" fill={accent} />
          <rect x="8" y={y + 8.5} width="64" height="1.1" fill="#e5e7eb" />
          <rect x="8" y={y + 11.5} width="60" height="1.1" fill="#e5e7eb" />
          {y !== 92 && <rect x="8" y={y + 14.5} width="56" height="1.1" fill="#e5e7eb" />}
        </g>
      ))}
    </svg>
  );
}

function PreviewCreative({ accent, ink = '#111827' }: PreviewProps) {
  return (
    <svg viewBox="0 0 80 110" className="w-full h-full">
      <rect width="80" height="110" fill="white" />
      <rect x="6" y="8" width="52" height="6" rx="0.5" fill={ink} />
      <rect x="6" y="16" width="32" height="2" rx="0.3" fill={accent} />
      {[26, 50, 74, 94].map((y, i) => (
        <g key={i}>
          <rect x="8" y={y} width="22" height="2.2" rx="0.3" fill={accent} />
          <rect x="8" y={y + 3.2} width="8" height="1" fill={accent} />
          <rect x="8" y={y + 6} width="60" height="1.2" fill="#e5e7eb" />
          <rect x="8" y={y + 9} width="58" height="1.2" fill="#e5e7eb" />
          {y !== 94 && <rect x="8" y={y + 12} width="50" height="1.2" fill="#e5e7eb" />}
        </g>
      ))}
      {/* Skills badges rounded */}
      <g>
        <rect x="8" y="36" width="12" height="3.5" rx="1.5" fill={accent} opacity="0.25" />
        <rect x="22" y="36" width="14" height="3.5" rx="1.5" fill={accent} opacity="0.25" />
        <rect x="38" y="36" width="10" height="3.5" rx="1.5" fill={accent} opacity="0.25" />
      </g>
    </svg>
  );
}

function PreviewAcademic({ accent, ink = '#111827' }: PreviewProps) {
  return (
    <svg viewBox="0 0 80 110" className="w-full h-full">
      <rect width="80" height="110" fill="white" />
      <rect x="16" y="9" width="48" height="3.5" rx="0.3" fill={ink} />
      <rect x="24" y="15" width="32" height="1.5" rx="0.3" fill={accent} />
      <rect x="8" y="19" width="64" height="0.5" fill={accent} opacity="0.5" />
      {[23, 42, 60, 78, 94].map((y, i) => (
        <g key={i}>
          <rect x="8" y={y} width="24" height="1.6" rx="0.3" fill={accent} />
          <rect x="8" y={y + 3} width="62" height="0.8" fill="#f3f4f6" />
          <rect x="8" y={y + 5} width="58" height="0.8" fill="#f3f4f6" />
          <rect x="8" y={y + 7} width="60" height="0.8" fill="#f3f4f6" />
          {y !== 94 && <rect x="8" y={y + 9} width="54" height="0.8" fill="#f3f4f6" />}
        </g>
      ))}
    </svg>
  );
}

/** Two-column sidebar preview (graphic templates). */
function PreviewSidebar({
  accent, ink = '#111827', side = 'left', band,
}: PreviewProps & { side?: 'left' | 'right'; band?: string }) {
  const bandW = 28;
  const bandX = side === 'left' ? 0 : 80 - bandW;
  const mainX = side === 'left' ? bandW + 5 : 5;
  const cx = bandX + bandW / 2;
  const bandColor = band || ink;
  return (
    <svg viewBox="0 0 80 110" className="w-full h-full">
      <rect width="80" height="110" fill="white" />
      {/* Sidebar band */}
      <rect x={bandX} y="0" width={bandW} height="110" fill={bandColor} />
      {/* Photo */}
      <circle cx={cx} cy="16" r="9" fill="white" opacity="0.9" />
      {/* Contact lines */}
      {[30, 33, 36].map((y) => (
        <rect key={y} x={bandX + 5} y={y} width="18" height="1.2" rx="0.4" fill="white" opacity="0.55" />
      ))}
      {/* Sidebar section heading + pills */}
      <rect x={bandX + 5} y="44" width="14" height="1.6" rx="0.4" fill="white" opacity="0.85" />
      {[[5, 49, 9], [16, 49, 7], [5, 53, 7], [14, 53, 9]].map(([x, y, w], i) => (
        <rect key={i} x={bandX + x} y={y} width={w} height="3" rx="1.5" fill="white" opacity="0.28" />
      ))}
      <rect x={bandX + 5} y="62" width="14" height="1.6" rx="0.4" fill="white" opacity="0.85" />
      {[67, 70, 73].map((y) => (
        <rect key={y} x={bandX + 5} y={y} width="17" height="1.2" rx="0.4" fill="white" opacity="0.5" />
      ))}
      {/* Main column: name + title */}
      <rect x={mainX} y="10" width="34" height="4" rx="0.5" fill={ink} />
      <rect x={mainX} y="16" width="22" height="2" rx="0.4" fill={accent} />
      {/* Main sections */}
      {[26, 50, 76, 96].map((y, i) => (
        <g key={i}>
          <rect x={mainX} y={y} width="24" height="2" rx="0.3" fill={accent} />
          <rect x={mainX} y={y + 3.5} width="42" height="0.6" fill={accent} opacity="0.4" />
          <rect x={mainX} y={y + 6} width="42" height="1.2" fill="#e5e7eb" />
          <rect x={mainX} y={y + 9} width="38" height="1.2" fill="#e5e7eb" />
          {y !== 96 && <rect x={mainX} y={y + 12} width="40" height="1.2" fill="#e5e7eb" />}
        </g>
      ))}
    </svg>
  );
}

function PreviewSidebarModern(p: PreviewProps) {
  return <PreviewSidebar {...p} side="left" band="#1e293b" />;
}
function PreviewSidebarTech(p: PreviewProps) {
  return <PreviewSidebar {...p} side="left" band="#064e3b" />;
}
function PreviewSidebarElegant(p: PreviewProps) {
  return <PreviewSidebar {...p} side="right" band="#cbd5e1" ink={p.ink} />;
}

const TEMPLATE_PREVIEWS: Record<string, React.ComponentType<PreviewProps>> = {
  'ats-classic':     PreviewClassic,
  'ats-modern':      PreviewModern,
  'elegant':         PreviewElegant,
  'minimalist':      PreviewMinimalist,
  'tech':            PreviewTech,
  'executive':       PreviewExecutive,
  'creative':        PreviewCreative,
  'academic':        PreviewAcademic,
  'sidebar-modern':  PreviewSidebarModern,
  'sidebar-tech':    PreviewSidebarTech,
  'sidebar-elegant': PreviewSidebarElegant,
};

// ── Composant principal ────────────────────────────────────────────────────

const CATEGORY_ORDER: TemplateCategory[] = ['ats', 'executive', 'tech', 'creative', 'academic', 'graphic'];

export function TemplatePickerPopover({ currentTemplateId, onSelect }: TemplatePickerPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handle = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerOutside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerOutside);
    return () => document.removeEventListener('pointerdown', handlePointerOutside);
  }, [isOpen]);

  const handleToggle = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
        zIndex: 100,
        maxHeight: `calc(100vh - ${rect.bottom + 24}px)`,
        overflowY: 'auto',
      });
    }
    setIsOpen(v => !v);
  };

  const allTemplates = getAllTemplates();
  const current = getTemplate(currentTemplateId);

  return (
    <div ref={containerRef}>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-md focus:ring-blue-500 focus:border-blue-500 px-3 py-2 flex items-center gap-1.5 hover:bg-gray-100 transition-colors min-h-[44px]"
      >
        <span className="text-gray-500 text-xs hidden sm:inline">Template :</span>
        <span className="font-medium">{current.name}</span>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop mobile/desktop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[90] animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />

          <div
            ref={dropdownRef}
            style={isMobile ? {} : dropdownStyle}
            className={`
              bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-2xl z-[100] flex flex-col
              ${isMobile 
                ? 'fixed inset-x-0 bottom-0 rounded-t-2xl max-h-[85vh] animate-in slide-in-from-bottom duration-300' 
                : 'rounded-xl w-[620px] max-w-[720px] max-h-[85vh]'
              }
            `}
          >
            {isMobile && (
              <div className="flex flex-col items-center py-3 shrink-0">
                <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full mb-2" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Choisir un modèle</h3>
              </div>
            )}

            <div className={`p-4 overflow-y-auto ${isMobile ? 'pb-12' : ''}`}>
              {CATEGORY_ORDER.map(cat => {
                const items = allTemplates.filter(t => t.category === cat);
                if (items.length === 0) return null;
                return (
                  <div key={cat} className="mb-4 last:mb-0">
                    <div className="flex items-center gap-2 mb-1 px-1">
                      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                        {CATEGORY_LABELS[cat]}
                      </span>
                      <span className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                    </div>
                    {CATEGORY_HINTS[cat] && (
                      <p className="text-[10.5px] text-amber-700 dark:text-amber-400 px-1 mb-2 leading-snug">
                        {CATEGORY_HINTS[cat]}
                      </p>
                    )}
                    <div className={`grid gap-2.5 ${isMobile ? 'grid-cols-2' : 'grid-cols-4'}`}>
                      {items.map(template => {
                        const Preview = TEMPLATE_PREVIEWS[template.id];
                        const isActive = template.id === currentTemplateId;
                        const accent = template.palettes?.[0]?.accent || '#1f2937';
                        const ink = template.palettes?.[0]?.ink || '#111827';
                        return (
                          <button
                            key={template.id}
                            onClick={() => {
                              onSelect(template.id);
                              setIsOpen(false);
                            }}
                            className="flex flex-col items-center gap-1.5 group rounded-lg p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                          >
                            <div
                              className={`relative w-full aspect-[80/110] rounded-md border-2 overflow-hidden transition-colors ${
                                isActive
                                  ? 'border-blue-500 ring-2 ring-blue-200'
                                  : 'border-gray-200 dark:border-gray-700 group-hover:border-blue-300 bg-white'
                              }`}
                              style={isActive ? {} : { background: 'white' }}
                            >
                              {Preview && <Preview accent={accent} ink={ink} />}
                              {template.atsOptimized === false && (
                                <span
                                  className="absolute top-1 right-1 px-1 py-px text-[8px] font-bold uppercase tracking-wide rounded bg-amber-500 text-white shadow-sm"
                                  title="CV graphique — destiné à un recruteur humain, non optimisé pour les filtres ATS"
                                >
                                  Non-ATS
                                </span>
                              )}
                            </div>
                            <span className={`text-[11px] font-medium text-center leading-tight ${
                              isActive
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-gray-700 dark:text-gray-300'
                            }`}>
                              {template.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
