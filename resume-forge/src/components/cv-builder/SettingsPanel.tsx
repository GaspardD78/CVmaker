import { parseHeaderExtras, readHeaderSettings } from '@/lib/header-extras';
import type { Profile } from '@/types/profile';
import { normalizeBulletFocus, resolveBulletFocus, type BulletFocus } from '@/lib/cv-focus-rules';
import { BulletFocusSelect } from './BulletFocusSelect';

interface SettingsPanelProps {
  /** Profil maître (permis et mentions d'en-tête proposés en cases à cocher). */
  profile?: Profile | null;
  /** Réglages (`cv.settings`) du CV courant. */
  cvSettings?: Record<string, unknown>;
  onCvSettingsChange?: (patch: Record<string, unknown>) => void;
  /** Orientation du profil (hérité quand le CV n'a pas de réglage propre). */
  profileBulletFocus?: BulletFocus;
  targetJob: string;
  setTargetJob: (v: string) => void;
  targetCompany: string;
  setTargetCompany: (v: string) => void;
  customSummary: string;
  setCustomSummary: (v: string) => void;
}

export function SettingsPanel({
  profile, cvSettings, onCvSettingsChange, profileBulletFocus,
  targetJob, setTargetJob,
  targetCompany, setTargetCompany,
  customSummary, setCustomSummary,
}: SettingsPanelProps) {
  const license = profile?.drivingLicense?.trim();
  const extras = parseHeaderExtras(profile?.headerExtras);
  const header = readHeaderSettings(cvSettings);
  const hidden = new Set(header.hiddenHeaderExtras ?? []);
  const toggleExtra = (extra: string, shown: boolean) => {
    const next = new Set(hidden);
    if (shown) next.delete(extra); else next.add(extra);
    onCvSettingsChange?.({ hiddenHeaderExtras: [...next] });
  };

  return (
    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg shadow-sm text-sm text-gray-900">
      <h3 className="font-semibold text-blue-900 mb-2">Paramètres de ce CV</h3>
      <div className="space-y-2">
        <div>
          <label className="block text-xs text-gray-700 mb-1">Poste ciblé</label>
          <input
            type="text"
            value={targetJob}
            onChange={e => setTargetJob(e.target.value)}
            className="w-full p-1.5 border rounded focus:ring focus:ring-blue-200"
            placeholder="Ex: Développeur React"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-700 mb-1">Entreprise ciblée</label>
          <input
            type="text"
            value={targetCompany}
            onChange={e => setTargetCompany(e.target.value)}
            className="w-full p-1.5 border rounded focus:ring focus:ring-blue-200"
            placeholder="Ex: Google"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-700 mb-1">Résumé personnalisé</label>
          <textarea
            value={customSummary}
            onChange={e => setCustomSummary(e.target.value)}
            className="w-full p-1.5 border rounded focus:ring focus:ring-blue-200 resize-y h-20"
            placeholder="Accroche spécifique à ce CV..."
          />
        </div>
        {onCvSettingsChange && (
          <div>
            <label className="block text-xs text-gray-700 mb-1" htmlFor="cv-bullet-focus">Orientation des puces</label>
            <BulletFocusSelect
              id="cv-bullet-focus"
              value={normalizeBulletFocus(cvSettings?.bulletFocus) ?? ''}
              inheritFrom={resolveBulletFocus(null, profileBulletFocus)}
              onChange={v => onCvSettingsChange({ bulletFocus: v || undefined })}
            />
          </div>
        )}
        {onCvSettingsChange && (license || extras.length > 0) && (
          <div>
            <span className="block text-xs text-gray-700 mb-1">Mentions d'en-tête</span>
            {license && (
              <label className="flex items-center gap-2 text-xs text-gray-800">
                <input
                  type="checkbox"
                  checked={header.showDrivingLicense !== false}
                  onChange={e => onCvSettingsChange({ showDrivingLicense: e.target.checked })}
                />
                {license}
              </label>
            )}
            {extras.map(extra => (
              <label key={extra} className="flex items-center gap-2 text-xs text-gray-800">
                <input type="checkbox" checked={!hidden.has(extra)} onChange={e => toggleExtra(extra, e.target.checked)} />
                {extra}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
