
import { useState, useEffect } from 'react';
import {
  Save, ToggleLeft, ToggleRight, UserRound, ChevronDown, ChevronUp,
  Plus, Trash2, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { useProfileStore } from '@/stores/profileStore';
import type {
  JobWatchConfig as ConfigType,
  JobWatchSettings,
  JobSource,
  SearchProfile,
} from '@/types/job-watch';
import { DEFAULT_SEARCH_PROFILE } from '@/types/job-watch';
import { summarizeSourceQuery } from '@/lib/watcher/profile-to-query';
import { buildSearchProfileFromProfile } from '@/lib/watcher/scorer';
import {
  HelpButton,
  FranceTravailHelpModal,
  NavitiaHelpModal,
  EmailHelpModal,
  LinkedInRssHelpModal,
  SourcesHelpModal,
} from './ConfigHelpModal';

// ── Constants ────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<JobSource, string> = {
  apec:               'APEC',
  wttj:               'Welcome to the Jungle',
  linkedin_rss:       'LinkedIn (RSS tiers)',
  france_travail:     'France Travail',
  emploi_territorial: 'Emploi Territorial',
  mantiks:            'Mantiks',
};

const SOURCE_DESCRIPTIONS: Partial<Record<JobSource, string>> = {
  emploi_territorial: 'Offres de la fonction publique territoriale (communes, métropoles, départements…)',
  mantiks:            'Agrégateur FR — nécessite une clé API mantiks.io',
  linkedin_rss:       'Via flux RSS tiers (rss.app, jobicy…)',
  france_travail:     'API officielle — nécessite des credentials OAuth2',
};

const ALL_SOURCES: JobSource[] = [
  'france_travail', 'apec', 'wttj', 'emploi_territorial', 'linkedin_rss', 'mantiks',
];

/** Sources that require an RSS URL (required) */
const RSS_REQUIRED_SOURCES: JobSource[] = ['linkedin_rss', 'emploi_territorial'];

type HelpModal = 'sources' | 'ft' | 'navitia' | 'email' | 'linkedin' | null;

// ── Helpers ──────────────────────────────────────────────────────────────────

const parseList = (s: string): string[] => s.split(',').map(k => k.trim()).filter(Boolean);
const joinList  = (a: string[]): string => a.join(', ');

// ── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title, children, defaultOpen = true,
}: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 text-left"
      >
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</span>
        {open
          ? <ChevronUp className="w-4 h-4 text-gray-400" />
          : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-4 py-4 space-y-4">{children}</div>}
    </section>
  );
}

// ── Field with label + help ──────────────────────────────────────────────────

function Field({
  label, help, children,
}: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
        {help && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400 dark:text-gray-500">
            <Info className="w-3 h-3" /> {help}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

const inputCls = 'w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500';
const textareaCls = inputCls + ' resize-none';

// ── Main component ────────────────────────────────────────────────────────────

export function JobWatchConfigView() {
  const {
    configs, settings,
    upsertConfig, deleteConfig,
    saveSettings, updateSearchProfile,
    fetchConfigs,
  } = useJobWatchStore();
  const { profile, entries } = useProfileStore();

  // ── SearchProfile draft ───────────────────────────────────────────────────

  const sp = settings.searchProfile ?? DEFAULT_SEARCH_PROFILE;

  const [jobTitlesText,    setJobTitlesText]    = useState(joinList(sp.jobTitles));
  const [skillsText,       setSkillsText]       = useState(joinList(sp.skills));
  const [domainsText,      setDomainsText]      = useState(joinList(sp.domains));
  const [excludeTitlesText, setExcludeTitlesText] = useState(joinList(sp.excludeTitles));
  const [excludeDomainsText, setExcludeDomainsText] = useState(joinList(sp.excludeDomains));
  const [blacklistText,    setBlacklistText]    = useState(joinList(sp.blacklistedCompanies));

  const [locationLabel,    setLocationLabel]    = useState(sp.location.label);
  const [locationCity,     setLocationCity]     = useState(sp.location.city);
  const [inseeCode,        setInseeCode]        = useState(sp.location.inseeCode);
  const [deptCodes,        setDeptCodes]        = useState(joinList(sp.location.departmentCodes));
  const [radiusKm,         setRadiusKm]         = useState(sp.location.radiusKm);

  const [contractTypes,    setContractTypes]    = useState<string[]>(sp.contractTypes);
  const [salaryMin,        setSalaryMin]        = useState(sp.salary.min != null ? String(sp.salary.min) : '');
  const [salaryTarget,     setSalaryTarget]     = useState(sp.salary.target != null ? String(sp.salary.target) : '');
  const [scoringMode,      setScoringMode]      = useState<'loose' | 'balanced' | 'strict'>(sp.scoring.mode);

  // ── Settings draft ────────────────────────────────────────────────────────

  const [settingsDraft, setSettingsDraft] = useState<JobWatchSettings>(settings);

  useEffect(() => {
    const sp2 = settings.searchProfile ?? DEFAULT_SEARCH_PROFILE;
    setJobTitlesText(joinList(sp2.jobTitles));
    setSkillsText(joinList(sp2.skills));
    setDomainsText(joinList(sp2.domains));
    setExcludeTitlesText(joinList(sp2.excludeTitles));
    setExcludeDomainsText(joinList(sp2.excludeDomains));
    setBlacklistText(joinList(sp2.blacklistedCompanies));
    setLocationLabel(sp2.location.label);
    setLocationCity(sp2.location.city);
    setInseeCode(sp2.location.inseeCode);
    setDeptCodes(joinList(sp2.location.departmentCodes));
    setRadiusKm(sp2.location.radiusKm);
    setContractTypes(sp2.contractTypes);
    setSalaryMin(sp2.salary.min != null ? String(sp2.salary.min) : '');
    setSalaryTarget(sp2.salary.target != null ? String(sp2.salary.target) : '');
    setScoringMode(sp2.scoring.mode);
    setSettingsDraft(settings);
  }, [settings]);

  const [helpModal, setHelpModal] = useState<HelpModal>(null);
  const [saving, setSaving] = useState(false);

  // ── Build current SearchProfile ───────────────────────────────────────────

  const buildProfile = (): SearchProfile => ({
    name: sp.name,
    jobTitles:    parseList(jobTitlesText),
    skills:       parseList(skillsText),
    domains:      parseList(domainsText),
    excludeTitles: parseList(excludeTitlesText),
    excludeDomains: parseList(excludeDomainsText),
    location: {
      label:           locationLabel,
      city:            locationCity,
      inseeCode:       inseeCode,
      departmentCodes: parseList(deptCodes),
      radiusKm,
    },
    contractTypes,
    salary: {
      min:    salaryMin    ? Number(salaryMin)    : null,
      target: salaryTarget ? Number(salaryTarget) : null,
    },
    scoring: { mode: scoringMode },
    blacklistedCompanies: parseList(blacklistText),
  });

  // ── Save handlers ────────────────────────────────────────────────────────

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateSearchProfile(buildProfile());
      toast.success('Profil de recherche sauvegardé');
    } catch (err) {
      toast.error(`Erreur : ${err instanceof Error ? err.message : 'inconnue'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await saveSettings({ ...settingsDraft, searchProfile: buildProfile() });
      toast.success('Paramètres sauvegardés');
    } catch (err) {
      toast.error(`Erreur : ${err instanceof Error ? err.message : 'inconnue'}`);
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof JobWatchSettings>(key: K, value: JobWatchSettings[K]) =>
    setSettingsDraft(d => ({ ...d, [key]: value }));

  // ── Import from CV profile ────────────────────────────────────────────────

  const handleImportFromProfile = () => {
    if (!profile) { toast.error('Aucun profil trouvé'); return; }
    const partial = buildSearchProfileFromProfile(profile, entries);
    if (partial.jobTitles?.length) {
      const existing = parseList(jobTitlesText);
      setJobTitlesText(joinList([...new Set([...existing, ...partial.jobTitles])]));
    }
    if (partial.skills?.length) {
      const existing = parseList(skillsText);
      setSkillsText(joinList([...new Set([...existing, ...partial.skills])]));
    }
    if (partial.location?.city && !locationCity) {
      setLocationCity(partial.location.city);
      setLocationLabel(partial.location.label ?? partial.location.city);
    }
    toast.success('Données importées depuis le profil');
  };

  // ── Contract type toggle ──────────────────────────────────────────────────

  const toggleContract = (ct: string) =>
    setContractTypes(prev =>
      prev.includes(ct) ? prev.filter(c => c !== ct) : [...prev, ct]
    );

  // ── Source management ─────────────────────────────────────────────────────

  const unusedSources = ALL_SOURCES.filter(s => !configs.some(c => c.source === s));

  const handleAddSource = async (source: JobSource) => {
    await upsertConfig({ source, rssUrl: null, enabled: 1 });
    await fetchConfigs();
  };

  const handleToggle = async (c: ConfigType) => {
    await upsertConfig({ ...c, enabled: c.enabled === 1 ? 0 : 1 });
  };

  const handleSaveRssUrl = async (c: ConfigType, rssUrl: string) => {
    await upsertConfig({ ...c, rssUrl: rssUrl || null });
    toast.success('URL RSS sauvegardée');
  };

  const handleDeleteConfig = async (id: string) => {
    await deleteConfig(id);
    toast.success('Source supprimée');
  };

  const closeHelp = () => setHelpModal(null);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 max-w-3xl">

      {/* ── 1. Search profile ── */}
      <Section title="Ce que je cherche">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Un seul profil pilote les requêtes envoyées à toutes les sources <em>et</em> le scoring des offres.
          </p>
          {profile && (
            <button
              onClick={handleImportFromProfile}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              <UserRound className="w-3 h-3" /> Importer depuis mon profil
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Titres de poste visés" help="+35 pts si dans le titre de l'offre">
            <textarea rows={2} className={textareaCls}
              value={jobTitlesText}
              onChange={e => setJobTitlesText(e.target.value)}
              placeholder="Recruteur, Talent Acquisition Manager, RRH"
            />
          </Field>

          <Field label="Compétences / outils" help="+5 pts par compétence trouvée">
            <textarea rows={2} className={textareaCls}
              value={skillsText}
              onChange={e => setSkillsText(e.target.value)}
              placeholder="ATS, LinkedIn Recruiter, sourcing, Workday"
            />
          </Field>

          <Field label="Secteurs / environnements" help="+3 pts par secteur trouvé">
            <textarea rows={2} className={textareaCls}
              value={domainsText}
              onChange={e => setDomainsText(e.target.value)}
              placeholder="Tech, SaaS, Scale-up, FinTech"
            />
          </Field>

          <Field label="Entreprises exclues" help="Score → 0">
            <textarea rows={2} className={textareaCls}
              value={blacklistText}
              onChange={e => setBlacklistText(e.target.value)}
              placeholder="SSII Corp, Agence X"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Exclure ces rôles" help="Score → 0 si trouvé dans le titre">
            <textarea rows={2} className={textareaCls}
              value={excludeTitlesText}
              onChange={e => setExcludeTitlesText(e.target.value)}
              placeholder="stagiaire, alternant, commercial, bénévole"
            />
          </Field>

          <Field label="Exclure ces secteurs" help="Score → 0 si trouvé dans l'offre">
            <textarea rows={2} className={textareaCls}
              value={excludeDomainsText}
              onChange={e => setExcludeDomainsText(e.target.value)}
              placeholder="BTP, Restauration, VPC"
            />
          </Field>
        </div>
      </Section>

      {/* ── 2. Location ── */}
      <Section title="Localisation">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Zone de recherche (libellé affiché)" help="Ex: Paris (75)">
            <input type="text" className={inputCls}
              value={locationLabel}
              onChange={e => setLocationLabel(e.target.value)}
              placeholder="Paris (75)"
            />
          </Field>

          <Field label="Rayon (km)" help="Utilisé par France Travail et APEC">
            <input type="number" min={0} max={200} className={inputCls}
              value={radiusKm}
              onChange={e => setRadiusKm(Number(e.target.value))}
            />
          </Field>

          <Field label="Code INSEE — France Travail" help="5 chiffres : 75056 Paris, 69123 Lyon, 13055 Marseille">
            <input type="text" className={inputCls} maxLength={5}
              value={inseeCode}
              onChange={e => setInseeCode(e.target.value.replace(/\D/g, ''))}
              placeholder="75056"
            />
          </Field>

          <Field label="Département(s) — APEC" help="Séparés par des virgules : 75, 92, 93">
            <input type="text" className={inputCls}
              value={deptCodes}
              onChange={e => setDeptCodes(e.target.value)}
              placeholder="75, 92, 93, 78"
            />
          </Field>

          <Field label="Ville — WTTJ / Emploi Territorial" help="Nom exact de la ville">
            <input type="text" className={inputCls}
              value={locationCity}
              onChange={e => setLocationCity(e.target.value)}
              placeholder="Paris"
            />
          </Field>
        </div>
      </Section>

      {/* ── 3. Contract & salary ── */}
      <Section title="Contrat & Salaire">
        <Field label="Types de contrat">
          <div className="flex flex-wrap gap-2 mt-1">
            {['CDI', 'CDD', 'Freelance', 'Alternance', 'Stage', 'Fonctionnaire'].map(ct => (
              <button
                key={ct}
                type="button"
                onClick={() => toggleContract(ct)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  contractTypes.includes(ct)
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400'
                }`}
              >
                {ct}
              </button>
            ))}
          </div>
          {contractTypes.length === 0 && (
            <p className="text-[11px] text-amber-500 mt-1">Aucun contrat sélectionné = toutes les offres acceptées</p>
          )}
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Salaire minimum (€/an)" help="-30 pts si l'offre est en-dessous">
            <input type="number" min={0} step={1000} className={inputCls}
              value={salaryMin}
              onChange={e => setSalaryMin(e.target.value)}
              placeholder="35000"
            />
          </Field>

          <Field label="Salaire cible (€/an)" help="+20 pts si l'offre dépasse de 10%">
            <input type="number" min={0} step={1000} className={inputCls}
              value={salaryTarget}
              onChange={e => setSalaryTarget(e.target.value)}
              placeholder="45000"
            />
          </Field>
        </div>

        <Field label="Mode de scoring">
          <div className="grid gap-2 sm:grid-cols-3 mt-1">
            {([
              ['loose',    'Permissif',  'Résultats larges, moins précis'],
              ['balanced', 'Équilibré',  'Recommandé — bon compromis'],
              ['strict',   'Strict',     'Titre DOIT correspondre, contrat respecté'],
            ] as const).map(([value, label, desc]) => (
              <button
                key={value}
                type="button"
                onClick={() => setScoringMode(value)}
                className={`p-2.5 rounded-lg border text-left transition-colors ${
                  scoringMode === value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-600 hover:border-blue-300'
                }`}
              >
                <p className={`text-xs font-semibold ${scoringMode === value ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-200'}`}>
                  {label}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">{desc}</p>
              </button>
            ))}
          </div>
        </Field>

        <button
          onClick={handleSaveProfile}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Sauvegarde…' : 'Sauvegarder le profil de recherche'}
        </button>
      </Section>

      {/* ── 4. Sources ── */}
      <Section title="Sources actives">
        <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">
          Les critères de votre profil (ci-dessus) sont envoyés automatiquement à chaque source active.
        </p>

        <div className="space-y-2">
          {configs.map(c => (
            <SourceRow
              key={c.id}
              config={c}
              settings={settingsDraft}
              onToggle={handleToggle}
              onDelete={handleDeleteConfig}
              onSaveRssUrl={handleSaveRssUrl}
              onUpdateSetting={updateSetting}
              onOpenHelp={setHelpModal}
            />
          ))}
        </div>

        {unusedSources.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
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
      </Section>

      {/* ── 5. Advanced ── */}
      <Section title="Options avancées" defaultOpen={false}>

        {/* France Travail credentials */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">France Travail — Credentials OAuth2</p>
            <HelpButton label="Comment obtenir ?" onClick={() => setHelpModal('ft')} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input type="text" className={inputCls} placeholder="Client ID"
              value={settingsDraft.ftClientId}
              onChange={e => updateSetting('ftClientId', e.target.value)}
            />
            <input type="password" autoComplete="new-password" className={inputCls} placeholder="Client Secret"
              value={settingsDraft.ftClientSecret}
              onChange={e => updateSetting('ftClientSecret', e.target.value)}
            />
          </div>
        </div>

        {/* Mantiks API key */}
        <div>
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Mantiks — Clé API</p>
          <input type="password" autoComplete="new-password" className={inputCls} placeholder="Clé API Mantiks"
            value={(settingsDraft as unknown as Record<string, string>)['mantiksApiKey'] ?? ''}
            onChange={e => setSettingsDraft(d => ({ ...d, mantiksApiKey: e.target.value } as unknown as JobWatchSettings))}
          />
        </div>

        {/* Commute */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Temps de trajet (PRIM/Navitia)</p>
            <HelpButton label="Comment configurer ?" onClick={() => setHelpModal('navitia')} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Clé API PRIM">
              <input type="password" autoComplete="new-password" className={inputCls}
                value={settingsDraft.navitiaApiKey}
                onChange={e => updateSetting('navitiaApiKey', e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            <Field label="Adresse de départ">
              <input type="text" className={inputCls}
                value={settingsDraft.commuteOriginAddress}
                onChange={e => updateSetting('commuteOriginAddress', e.target.value)}
                placeholder="9 rue des Lilas, 78955 Carrières-sous-Poissy"
              />
            </Field>
            <Field label="Heure de départ">
              <input type="time" className={inputCls}
                value={settingsDraft.commuteDepartureTime}
                onChange={e => updateSetting('commuteDepartureTime', e.target.value)}
              />
            </Field>
            <Field label={`Seuil max : ${settingsDraft.commuteMaxMinutes} min`}>
              <input type="range" min={10} max={120} step={5} className="w-full accent-blue-600"
                value={settingsDraft.commuteMaxMinutes}
                onChange={e => updateSetting('commuteMaxMinutes', Number(e.target.value))}
              />
            </Field>
          </div>
        </div>

        {/* Email digest */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Email digest quotidien</p>
              <HelpButton label="Comment configurer ?" onClick={() => setHelpModal('email')} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded accent-blue-600"
                checked={settingsDraft.emailDigestEnabled}
                onChange={e => updateSetting('emailDigestEnabled', e.target.checked)}
              />
              <span className="text-xs text-gray-600 dark:text-gray-300">Activé</span>
            </label>
          </div>
          <div className={`grid gap-2 sm:grid-cols-2 ${!settingsDraft.emailDigestEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
            <input type="email" className={inputCls} placeholder="vous@example.com"
              value={settingsDraft.emailTo}
              onChange={e => updateSetting('emailTo', e.target.value)}
            />
            <input type="time" className={inputCls}
              value={settingsDraft.emailDigestTime}
              onChange={e => updateSetting('emailDigestTime', e.target.value)}
            />
            <input type="text" className={inputCls} placeholder="smtp.gmail.com"
              value={settingsDraft.emailSmtpHost}
              onChange={e => updateSetting('emailSmtpHost', e.target.value)}
            />
            <input type="number" className={inputCls} placeholder="587"
              value={settingsDraft.emailSmtpPort}
              onChange={e => updateSetting('emailSmtpPort', Number(e.target.value))}
            />
            <input type="text" className={inputCls} placeholder="utilisateur SMTP"
              value={settingsDraft.emailSmtpUser}
              onChange={e => updateSetting('emailSmtpUser', e.target.value)}
            />
            <input type="password" autoComplete="new-password" className={inputCls} placeholder="mot de passe SMTP"
              value={settingsDraft.emailSmtpPassword}
              onChange={e => updateSetting('emailSmtpPassword', e.target.value)}
            />
          </div>
        </div>

        {/* Fetch interval */}
        <Field label={`Fréquence de collecte : toutes les ${settingsDraft.fetchIntervalHours}h`}>
          <input type="range" min={1} max={24} step={1} className="w-full accent-blue-600"
            value={settingsDraft.fetchIntervalHours}
            onChange={e => updateSetting('fetchIntervalHours', Number(e.target.value))}
          />
        </Field>

        <button
          onClick={handleSaveSettings}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Sauvegarde…' : 'Sauvegarder les options avancées'}
        </button>
      </Section>

      {/* ── Help modals ── */}
      {helpModal === 'sources'  && <SourcesHelpModal       onClose={closeHelp} />}
      {helpModal === 'ft'       && <FranceTravailHelpModal  onClose={closeHelp} />}
      {helpModal === 'navitia'  && <NavitiaHelpModal         onClose={closeHelp} />}
      {helpModal === 'email'    && <EmailHelpModal           onClose={closeHelp} />}
      {helpModal === 'linkedin' && <LinkedInRssHelpModal     onClose={closeHelp} />}
    </div>
  );
}

// ── Source row ───────────────────────────────────────────────────────────────

interface SourceRowProps {
  config: ConfigType;
  settings: JobWatchSettings;
  onToggle: (c: ConfigType) => void;
  onDelete: (id: string) => void;
  onSaveRssUrl: (c: ConfigType, url: string) => void;
  onUpdateSetting: <K extends keyof JobWatchSettings>(key: K, value: JobWatchSettings[K]) => void;
  onOpenHelp: (modal: HelpModal) => void;
}

function SourceRow({
  config, settings, onToggle, onDelete, onSaveRssUrl, onOpenHelp,
}: SourceRowProps) {
  const [rssUrlDraft, setRssUrlDraft] = useState(config.rssUrl ?? '');
  const [rssEdited, setRssEdited]     = useState(false);

  const profile = settings.searchProfile ?? DEFAULT_SEARCH_PROFILE;
  const queryPreview = summarizeSourceQuery(config.source, profile);

  const needsRss = RSS_REQUIRED_SOURCES.includes(config.source);

  return (
    <div className={`border rounded-lg p-3 space-y-2 ${config.enabled ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-800 opacity-60'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggle({ ...config })}
            title={config.enabled ? 'Désactiver' : 'Activer'}
            className="text-gray-400 hover:text-blue-600 transition-colors"
          >
            {config.enabled === 1
              ? <ToggleRight className="w-5 h-5 text-blue-600" />
              : <ToggleLeft  className="w-5 h-5" />}
          </button>
          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {SOURCE_LABELS[config.source]}
            </span>
            {SOURCE_DESCRIPTIONS[config.source] && (
              <p className="text-[10px] text-gray-400">{SOURCE_DESCRIPTIONS[config.source]}</p>
            )}
          </div>
          {config.source === 'linkedin_rss' && (
            <HelpButton label="Comment faire ?" onClick={() => onOpenHelp('linkedin')} />
          )}
          {config.source === 'france_travail' && (
            <HelpButton label="Credentials" onClick={() => onOpenHelp('ft')} />
          )}
        </div>
        <button onClick={() => onDelete(config.id)} className="text-gray-300 hover:text-red-500 transition-colors ml-2">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Query preview */}
      {config.enabled === 1 && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">
          {queryPreview}
        </p>
      )}

      {/* RSS URL (required for linkedin_rss + emploi_territorial) */}
      {needsRss && (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-[10px] text-gray-400 mb-1">
              URL RSS <span className="text-red-400">*</span>
            </label>
            <input
              type="url"
              value={rssUrlDraft}
              onChange={e => { setRssUrlDraft(e.target.value); setRssEdited(true); }}
              className="w-full text-xs px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="https://rss.app/feeds/..."
            />
          </div>
          {rssEdited && (
            <button
              onClick={() => { onSaveRssUrl(config, rssUrlDraft); setRssEdited(false); }}
              className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              <Save className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
