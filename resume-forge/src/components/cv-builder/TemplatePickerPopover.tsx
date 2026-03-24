import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface TemplatePickerPopoverProps {
  currentTemplateId: string;
  onSelect: (templateId: string) => void;
}

const TEMPLATES = [
  { id: 'ats-classic', name: 'ATS Classique' },
  { id: 'ats-modern', name: 'ATS Moderne' },
  { id: 'elegant', name: 'Élégant' },
  { id: 'minimalist', name: 'Minimaliste' },
];

function AtsClassicSvg() {
  return (
    <svg viewBox="0 0 80 110" className="w-full h-full">
      <rect width="80" height="110" fill="white" />
      <rect x="20" y="8" width="40" height="4" rx="1" fill="#3b82f6" />
      <rect x="25" y="15" width="30" height="2" rx="0.5" fill="#93c5fd" />
      <rect x="18" y="20" width="44" height="1.5" rx="0.5" fill="#d1d5db" />
      <rect x="8" y="30" width="30" height="2" rx="0.5" fill="#3b82f6" />
      <rect x="8" y="35" width="64" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="8" y="39" width="60" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="8" y="43" width="55" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="8" y="52" width="25" height="2" rx="0.5" fill="#3b82f6" />
      <rect x="8" y="57" width="64" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="8" y="61" width="58" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="8" y="65" width="62" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="8" y="74" width="28" height="2" rx="0.5" fill="#3b82f6" />
      <rect x="8" y="79" width="50" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="8" y="83" width="45" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="8" y="92" width="22" height="2" rx="0.5" fill="#3b82f6" />
      <rect x="8" y="97" width="40" height="1.5" rx="0.5" fill="#e5e7eb" />
    </svg>
  );
}

function AtsModernSvg() {
  return (
    <svg viewBox="0 0 80 110" className="w-full h-full">
      <rect width="80" height="110" fill="white" />
      <rect x="22" y="8" width="36" height="4" rx="1" fill="#1e40af" />
      <rect x="26" y="15" width="28" height="2" rx="0.5" fill="#60a5fa" />
      <rect x="20" y="20" width="40" height="1.5" rx="0.5" fill="#d1d5db" />
      <rect x="8" y="30" width="32" height="2" rx="0.5" fill="#1e40af" />
      <rect x="14" y="35" width="58" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="14" y="39" width="54" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="14" y="43" width="50" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="8" y="52" width="28" height="2" rx="0.5" fill="#1e40af" />
      <rect x="14" y="57" width="58" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="14" y="61" width="52" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="14" y="65" width="56" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="8" y="74" width="30" height="2" rx="0.5" fill="#1e40af" />
      <rect x="14" y="79" width="48" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="14" y="83" width="42" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="8" y="92" width="24" height="2" rx="0.5" fill="#1e40af" />
      <rect x="14" y="97" width="38" height="1.5" rx="0.5" fill="#e5e7eb" />
    </svg>
  );
}

function ElegantSvg() {
  return (
    <svg viewBox="0 0 80 110" className="w-full h-full">
      <rect width="80" height="110" fill="white" />
      <rect x="0" y="0" width="3" height="110" fill="#7c3aed" />
      <rect x="20" y="8" width="40" height="4" rx="1" fill="#7c3aed" />
      <rect x="24" y="15" width="32" height="2" rx="0.5" fill="#a78bfa" />
      <rect x="18" y="20" width="44" height="1.5" rx="0.5" fill="#d1d5db" />
      <rect x="10" y="30" width="30" height="2" rx="0.5" fill="#7c3aed" />
      <rect x="10" y="35" width="62" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="10" y="39" width="58" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="10" y="43" width="55" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="10" y="52" width="26" height="2" rx="0.5" fill="#7c3aed" />
      <rect x="10" y="57" width="62" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="10" y="61" width="56" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="10" y="65" width="60" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="10" y="74" width="28" height="2" rx="0.5" fill="#7c3aed" />
      <rect x="10" y="79" width="50" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="10" y="83" width="44" height="1.5" rx="0.5" fill="#e5e7eb" />
      <rect x="10" y="92" width="22" height="2" rx="0.5" fill="#7c3aed" />
      <rect x="10" y="97" width="38" height="1.5" rx="0.5" fill="#e5e7eb" />
    </svg>
  );
}

function MinimalistSvg() {
  return (
    <svg viewBox="0 0 80 110" className="w-full h-full">
      <rect width="80" height="110" fill="white" />
      <rect x="8" y="10" width="28" height="3" rx="0.5" fill="#374151" />
      <rect x="8" y="16" width="20" height="1.5" rx="0.5" fill="#9ca3af" />
      <rect x="8" y="20" width="35" height="1" rx="0.5" fill="#d1d5db" />
      <rect x="8" y="32" width="18" height="1.5" rx="0.5" fill="#374151" />
      <rect x="8" y="38" width="60" height="1" rx="0.5" fill="#f3f4f6" />
      <rect x="8" y="43" width="56" height="1" rx="0.5" fill="#f3f4f6" />
      <rect x="8" y="48" width="52" height="1" rx="0.5" fill="#f3f4f6" />
      <rect x="8" y="58" width="20" height="1.5" rx="0.5" fill="#374151" />
      <rect x="8" y="64" width="60" height="1" rx="0.5" fill="#f3f4f6" />
      <rect x="8" y="69" width="54" height="1" rx="0.5" fill="#f3f4f6" />
      <rect x="8" y="74" width="58" height="1" rx="0.5" fill="#f3f4f6" />
      <rect x="8" y="84" width="22" height="1.5" rx="0.5" fill="#374151" />
      <rect x="8" y="90" width="44" height="1" rx="0.5" fill="#f3f4f6" />
      <rect x="8" y="95" width="38" height="1" rx="0.5" fill="#f3f4f6" />
    </svg>
  );
}

const TEMPLATE_SVGS: Record<string, () => React.ReactElement> = {
  'ats-classic': AtsClassicSvg,
  'ats-modern': AtsModernSvg,
  'elegant': ElegantSvg,
  'minimalist': MinimalistSvg,
};

export function TemplatePickerPopover({ currentTemplateId, onSelect }: TemplatePickerPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    // pointerdown unifie mouse + touch, plus fiable que mousedown sur Android WebView
    const handlePointerOutside = (e: PointerEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerOutside);
    return () => document.removeEventListener('pointerdown', handlePointerOutside);
  }, [isOpen]);

  const currentName = TEMPLATES.find(t => t.id === currentTemplateId)?.name || currentTemplateId;

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-md focus:ring-blue-500 focus:border-blue-500 px-3 py-2 flex items-center gap-1.5 hover:bg-gray-100 transition-colors min-h-[44px]"
      >
        {currentName}
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-50">
          {/* Grille 2x2 sur mobile, rangée unique sur desktop */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TEMPLATES.map(template => {
              const SvgComponent = TEMPLATE_SVGS[template.id];
              const isActive = template.id === currentTemplateId;
              return (
                <button
                  key={template.id}
                  onClick={() => {
                    onSelect(template.id);
                    setIsOpen(false);
                  }}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <div
                    className={`w-20 h-[110px] rounded-md border-2 overflow-hidden transition-colors ${
                      isActive
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-300 bg-white'
                    }`}
                  >
                    {SvgComponent && <SvgComponent />}
                  </div>
                  <span className={`text-[11px] font-medium ${
                    isActive ? 'text-blue-600' : 'text-gray-600 group-hover:text-gray-900'
                  }`}>
                    {template.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
