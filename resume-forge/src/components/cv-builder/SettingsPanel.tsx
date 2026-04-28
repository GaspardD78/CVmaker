interface SettingsPanelProps {
  targetJob: string;
  setTargetJob: (v: string) => void;
  targetCompany: string;
  setTargetCompany: (v: string) => void;
  customSummary: string;
  setCustomSummary: (v: string) => void;
}

export function SettingsPanel({
  targetJob, setTargetJob,
  targetCompany, setTargetCompany,
  customSummary, setCustomSummary,
}: SettingsPanelProps) {
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
      </div>
    </div>
  );
}
