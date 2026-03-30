import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'sonner';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import type { JobWatchConfig as ConfigType, JobWatchSettings, JobSource } from '@/types/job-watch';
import {
  HelpButton,
  FranceTravailHelpModal,
  NavitiaHelpModal,
  EmailHelpModal,
  LinkedInRssHelpModal,
  SourcesHelpModal,
} from './ConfigHelpModal';

const SOURCE_LABELS: Record<JobSource, string> = {
  apec:          'APEC',
  indeed:        'Indeed',
  wttj:          'Welcome to the Jungle',
  linkedin_rss:  'LinkedIn (RSS tiers)',
  france_travail:'France Travail',
};

const ALL_SOURCES: JobSource[] = ['apec', 'indeed', 'wttj', 'linkedin_rss', 'france_travail'];
const RSS_URL_SOURCES: JobSource[] = ['linkedin_rss'];
const RSS_URL_OPTIONAL: JobSource[] = ['apec', 'indeed', 'wttj'];

type HelpModal = 'sources' | 'ft' | 'navitia' | 'email' | 'linkedin' | null;

// ── Source config row ────────────────────────────────────────────────────────

interface SourceRowProps {
  config: ConfigType;
  onSave:      (c: ConfigType) => void;
  onDelete:    (id: string) => void;
  onToggle:    (c: ConfigType) => void;
  onOpenHelp:  (modal: HelpModal) => void;
}

function SourceRow({ config, onSave, onDelete, onToggle, onOpenHelp }: SourceRowProps) {
  const [draft, setDraft] = useState<ConfigType>(config);
  // Separate raw text state for the keywords input so commas can be typed freely.
  // Parsed into the array only on blur or save.
  const [keywordsText, setKeywordsText] = useState(config.keywords.join(', '));

  useEffect(() => {
    setDraft(config);
    setKeywordsText(config.keywords.join(', '));
  }, [config]);

  const parsedKeywords = keywordsText.split(',').map(k => k.trim()).filter(Boolean);
  const isDirty =
    JSON.stringify({ ...draft, keywords: parsedKeywords }) !== JSON.stringify(config);

  const commitKeywords = () => {
    setDraft(d => ({ ...d, keywords: parsedKeywords }));
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {SOURCE_LABELS[config.source]}
          </span>
          {config.source === 'linkedin_rss' && (
            <HelpButton label="Comment faire ?" onClick={() => onOpenHelp('linkedin')} />
          )}
          {config.source === 'france_travail' && (
            <HelpButton label="Comment faire ?" onClick={() => onOpenHelp('ft')} />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggle({ ...draft, keywords: parsedKeywords })}
            title={draft.enabled ? 'Désactiver' : 'Activer'}
            className="text-gray-400 hover:text-blue-600 transition-colors"
          >
            {draft.enabled === 1
              ? <ToggleRight className="w-5 h-5 text-blue-600" />
              : <ToggleLeft  className="w-5 h-5" />
            }
          </button>
          <button onClick={() => onDelete(config.id)} className="text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Keywords — raw text input, parsed on blur */}
      <div>
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
          Mots-clés (séparés par des virgules)
        </label>
        <input
          type="text"
          value={keywordsText}
          onChange={e => setKeywordsText(e.target.value)}
          onBlur={commitKeywords}
          className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="recruteur, talent acquisition, RH"
        />
      </div>

      {/* Location + radius */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
            {config.source === 'france_travail' ? 'Code commune INSEE (optionnel)' : 'Localisation'}
          </label>
          <input
            type="text"
            value={draft.location ?? ''}
            onChange={e => setDraft(d => ({ ...d, location: e.target.value || null }))}
            className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder={config.source === 'france_travail' ? '75056 (Paris), 69123 (Lyon)…' : 'Paris'}
          />
        </div>
        {config.source !== 'wttj' && config.source !== 'linkedin_rss' && (
          <div className="w-24">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Rayon (km)</label>
            <input
              type="number"
              min={0}
              max={500}
              value={draft.radiusKm}
              onChange={e => setDraft(d => ({ ...d, radiusKm: Number(e.target.value) }))}
              className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      {/* France Travail: département filter */}
      {config.source === 'france_travail' && (
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
            Département (optionnel)
            <span className="ml-1 text-gray-400">— élargit la recherche à tout le département</span>
          </label>
          <input
            type="text"
            value={draft.ftDeptCode ?? ''}
            onChange={e => setDraft(d => ({ ...d, ftDeptCode: e.target.value || null }))}
            className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="75, 92, 93, 78…"
          />
        </div>
      )}

      {/* RSS URL */}
      {(RSS_URL_SOURCES.includes(config.source) || RSS_URL_OPTIONAL.includes(config.source)) && (
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
            URL RSS
            {RSS_URL_OPTIONAL.includes(config.source) && (
              <span className="ml-1 text-gray-400">(optionnel — générée automatiquement si vide)</span>
            )}
            {RSS_URL_SOURCES.includes(config.source) && (
              <span className="ml-1 text-red-400">*</span>
            )}
          </label>
          <input
            type="url"
            value={draft.rssUrl ?? ''}
            onChange={e => setDraft(d => ({ ...d, rssUrl: e.target.value || null }))}
            className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder={RSS_URL_SOURCES.includes(config.source) ? 'https://rss.app/feeds/...' : 'Laisser vide pour générer automatiquement'}
          />
        </div>
      )}

      {isDirty && (
        <button
          onClick={() => onSave({ ...draft, keywords: parsedKeywords })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          <Save className="w-3.5 h-3.5" /> Sauvegarder
        </button>
      )}
    </div>
  );
}

// ── Main config page ─────────────────────────────────────────────────────────

export function JobWatchConfigView() {
  const { configs, settings, upsertConfig, deleteConfig, saveSettings, fetchConfigs } = useJobWatchStore();
  const [settingsDraft, setSettingsDraft] = useState<JobWatchSettings>(settings);
  const [savingSettings, setSavingSettings] = useState(false);
  const [helpModal, setHelpModal] = useState<HelpModal>(null);

  useEffect(() => { setSettingsDraft(settings); }, [settings]);

  const unusedSources = ALL_SOURCES.filter(s => !configs.some(c => c.source === s));

  const handleAddSource = async (source: JobSource) => {
    await upsertConfig({
      source,
      keywords:      [],
      location:      null,
      radiusKm:      50,
      contractTypes: [],
      rssUrl:        null,
      ftDeptCode:    null,
      enabled:       1,
    });
  };

  const handleSaveConfig = async (c: ConfigType) => {
    await upsertConfig(c);
    await fetchConfigs();
    toast.success('Configuration sauvegardée');
  };

  const handleToggle = async (c: ConfigType) => {
    await upsertConfig({ ...c, enabled: c.enabled === 1 ? 0 : 1 });
  };

  const handleDeleteConfig = async (id: string) => {
    await deleteConfig(id);
    toast.success('Source supprimée');
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await saveSettings(settingsDraft);
      toast.success('Paramètres sauvegardés');
    } catch (err) {
      toast.error(`Erreur : ${err instanceof Error ? err.message : 'inconnue'}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const updateSetting = <K extends keyof JobWatchSettings>(key: K, value: JobWatchSettings[K]) => {
    setSettingsDraft(d => ({ ...d, [key]: value }));
  };

  const parseKeywordList = (raw: string): string[] =>
    raw.split(',').map(k => k.trim()).filter(Boolean);

  const closeHelp = () => setHelpModal(null);

  return (
    <div className="space-y-6">

      {/* ── Sources ── */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Sources</h3>
          <HelpButton label="Guide de configuration" onClick={() => setHelpModal('sources')} />
        </div>
        {configs.length === 0 ? (
          <p className="text-sm text-gray-400 mb-3">Aucune source configurée.</p>
        ) : (
          <div className="space-y-3">
            {configs.map(c => (
              <SourceRow
                key={c.id}
                config={c}
                onSave={handleSaveConfig}
                onDelete={handleDeleteConfig}
                onToggle={handleToggle}
                onOpenHelp={setHelpModal}
              />
            ))}
          </div>
        )}
        {unusedSources.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {unusedSources.map(s => (
              <button
                key={s}
                onClick={() => handleAddSource(s)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter {SOURCE_LABELS[s]}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── France Travail OAuth2 ── */}
      <section>
        <div className="flex items-center gap-3 mb-1">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">France Travail (API officielle)</h3>
          <HelpButton label="Comment obtenir les clés ?" onClick={() => setHelpModal('ft')} />
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
          Ces identifiants sont nécessaires pour utiliser la source France Travail.
          Créez une application gratuite sur{' '}
          <span className="text-blue-500">francetravail.io</span>{' '}
          et activez l'API <em>Offres d'emploi v2</em>.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Client ID</label>
            <input
              type="text"
              value={settingsDraft.ftClientId}
              onChange={e => updateSetting('ftClientId', e.target.value)}
              className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="PAR_resumeforge_xxxxxxxx"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Client Secret</label>
            <input
              type="password"
              value={settingsDraft.ftClientSecret}
              onChange={e => updateSetting('ftClientSecret', e.target.value)}
              className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="••••••••••••••••"
            />
          </div>
        </div>
      </section>

      {/* ── Scoring ── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Scoring</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Mots-clés positifs (+10 pts chacun)
            </label>
            <textarea
              rows={3}
              value={settingsDraft.positiveKeywords.join(', ')}
              onChange={e => updateSetting('positiveKeywords', parseKeywordList(e.target.value))}
              className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              placeholder="cybersécurité, IAM, Talent Acquisition"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Mots-clés négatifs (-20 pts chacun)
            </label>
            <textarea
              rows={3}
              value={settingsDraft.negativeKeywords.join(', ')}
              onChange={e => updateSetting('negativeKeywords', parseKeywordList(e.target.value))}
              className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              placeholder="stagiaire, alternance, bénévole"
            />
          </div>
        </div>
      </section>

      {/* ── Temps de trajet ── */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Temps de trajet (Navitia)</h3>
          <HelpButton label="Comment configurer ?" onClick={() => setHelpModal('navitia')} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Clé API Navitia
            </label>
            <input
              type="password"
              value={settingsDraft.navitiaApiKey}
              onChange={e => updateSetting('navitiaApiKey', e.target.value)}
              className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="••••••••••••••••"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Adresse de départ</label>
            <input
              type="text"
              value={settingsDraft.commuteOriginAddress}
              onChange={e => updateSetting('commuteOriginAddress', e.target.value)}
              className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="9 rue des Lilas, Carrières-sous-Poissy 78955"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Heure de départ souhaitée</label>
            <input
              type="time"
              value={settingsDraft.commuteDepartureTime}
              onChange={e => updateSetting('commuteDepartureTime', e.target.value)}
              className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Seuil max (min) : <span className="font-semibold text-gray-800 dark:text-gray-100">{settingsDraft.commuteMaxMinutes}</span>
            </label>
            <input
              type="range"
              min={10}
              max={120}
              step={5}
              value={settingsDraft.commuteMaxMinutes}
              onChange={e => updateSetting('commuteMaxMinutes', Number(e.target.value))}
              className="w-full accent-blue-600"
            />
          </div>
        </div>
      </section>

      {/* ── Email digest ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Email digest quotidien</h3>
            <HelpButton label="Comment configurer ?" onClick={() => setHelpModal('email')} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settingsDraft.emailDigestEnabled}
              onChange={e => updateSetting('emailDigestEnabled', e.target.checked)}
              className="w-4 h-4 rounded accent-blue-600"
            />
            <span className="text-xs text-gray-600 dark:text-gray-300">Activé</span>
          </label>
        </div>
        <div className={`grid gap-3 sm:grid-cols-2 ${!settingsDraft.emailDigestEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Email destinataire</label>
            <input
              type="email"
              value={settingsDraft.emailTo}
              onChange={e => updateSetting('emailTo', e.target.value)}
              className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="vous@example.com"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Heure d'envoi</label>
            <input
              type="time"
              value={settingsDraft.emailDigestTime}
              onChange={e => updateSetting('emailDigestTime', e.target.value)}
              className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Serveur SMTP</label>
            <input
              type="text"
              value={settingsDraft.emailSmtpHost}
              onChange={e => updateSetting('emailSmtpHost', e.target.value)}
              className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="smtp.gmail.com"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Port SMTP</label>
            <input
              type="number"
              value={settingsDraft.emailSmtpPort}
              onChange={e => updateSetting('emailSmtpPort', Number(e.target.value))}
              className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Utilisateur SMTP</label>
            <input
              type="text"
              value={settingsDraft.emailSmtpUser}
              onChange={e => updateSetting('emailSmtpUser', e.target.value)}
              className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="vous@gmail.com"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Mot de passe SMTP</label>
            <input
              type="password"
              value={settingsDraft.emailSmtpPassword}
              onChange={e => updateSetting('emailSmtpPassword', e.target.value)}
              className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>
        </div>
      </section>

      {/* ── Collecte ── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Collecte</h3>
        <div className="max-w-xs">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
            Intervalle (heures) : <span className="font-semibold text-gray-800 dark:text-gray-100">{settingsDraft.fetchIntervalHours}h</span>
          </label>
          <input
            type="range"
            min={1}
            max={24}
            step={1}
            value={settingsDraft.fetchIntervalHours}
            onChange={e => updateSetting('fetchIntervalHours', Number(e.target.value))}
            className="w-full accent-blue-600"
          />
        </div>
      </section>

      {/* Save all settings */}
      <div className="pt-2">
        <button
          onClick={handleSaveSettings}
          disabled={savingSettings}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
        >
          <Save className="w-4 h-4" />
          {savingSettings ? 'Sauvegarde…' : 'Sauvegarder les paramètres'}
        </button>
      </div>

      {/* ── Help modals ── */}
      {helpModal === 'sources'  && <SourcesHelpModal      onClose={closeHelp} />}
      {helpModal === 'ft'       && <FranceTravailHelpModal onClose={closeHelp} />}
      {helpModal === 'navitia'  && <NavitiaHelpModal        onClose={closeHelp} />}
      {helpModal === 'email'    && <EmailHelpModal          onClose={closeHelp} />}
      {helpModal === 'linkedin' && <LinkedInRssHelpModal    onClose={closeHelp} />}
    </div>
  );
}
