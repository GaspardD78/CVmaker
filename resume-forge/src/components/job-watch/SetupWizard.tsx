import { useState, useMemo } from 'react';
import { ChevronRight, ChevronLeft, Rocket, UserRound, Target, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { useProfileStore } from '@/stores/profileStore';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { buildSearchProfileFromProfile } from '@/lib/watcher/scorer';
import type { JobSource } from '@/types/job-watch';
import { DEFAULT_SEARCH_PROFILE } from '@/types/job-watch';

import { SOURCE_LABELS } from '@/lib/watcher/sources';
import { APEC_SECTEURS, APEC_TELETRAVAIL, APEC_SALAIRES } from '@/lib/watcher/parsers/apec-ids';

const DEFAULT_SOURCES: JobSource[] = ['apec', 'wttj'];
// Emploi Territorial n'est pas proposé ici (le site refuse les requêtes automatiques) :
// il reste ajoutable à la main depuis la configuration.
const ALL_SOURCES: JobSource[] = ['apec', 'wttj', 'linkedin', 'france_travail'];

type Step = 'profile' | 'intent' | 'sources';

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { profile, entries } = useProfileStore();
  const { upsertConfig, saveSettings, settings, updateSearchProfile } = useJobWatchStore();

  const [step, setStep] = useState<Step>('profile');

  // Step 2: SearchProfile draft (pre-filled from CV profile)
  const autoProfile = useMemo(
    () => buildSearchProfileFromProfile(profile, entries),
    [profile, entries],
  );

  const [rolePrimaryText, setRolePrimaryText] = useState(
    autoProfile.jobTitles?.join(', ') ?? '',
  );
  const [domReqText, setDomReqText] = useState(
    autoProfile.skills?.slice(0, 5).join(', ') ?? '',
  );
  const [domPrefText, setDomPrefText] = useState(
    autoProfile.skills?.slice(5, 10).join(', ') ?? '',
  );
  const [mustExcludeText, setMustExcludeText] = useState('');
  const [salaryTarget, setSalaryTarget] = useState('');
  const [locationText, setLocationText] = useState(profile?.city ?? '');
  const [apecSecteurs, setApecSecteurs] = useState<string[]>([]);
  const [apecTeletravail, setApecTeletravail] = useState<string[]>([]);
  const [apecSalaires, setApecSalaires] = useState<string[]>([]);

  // Step 3: Source selection
  const hasFtCredentials = Boolean(settings.ftClientId && settings.ftClientSecret);
  const [selectedSources, setSelectedSources] = useState<JobSource[]>(
    hasFtCredentials ? [...DEFAULT_SOURCES, 'france_travail'] : DEFAULT_SOURCES,
  );

  const profileSkills = useMemo(
    () => entries.filter(e => e.entryType === 'skill').map(e => e.title),
    [entries],
  );

  const parseList = (raw: string): string[] =>
    raw.split(',').map(k => k.trim()).filter(Boolean);

  const toggleSource = (source: JobSource) => {
    setSelectedSources(prev =>
      prev.includes(source) ? prev.filter(s => s !== source) : [...prev, source],
    );
  };

  const toggleApecSecteur = (label: string) =>
    setApecSecteurs(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]);
  const toggleApecTeletravail = (label: string) =>
    setApecTeletravail(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]);
  const toggleApecSalaire = (label: string) =>
    setApecSalaires(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]);

  const steps: Step[] = ['profile', 'intent', 'sources'];
  const currentIndex = steps.indexOf(step);
  const canGoNext = step !== 'sources';
  const canGoPrev = step !== 'profile';

  const handleFinish = async () => {
    // 1. Save unified SearchProfile
    const newProfile = {
      ...DEFAULT_SEARCH_PROFILE,
      jobTitles:     parseList(rolePrimaryText),
      skills:        parseList(domReqText),
      domains:       parseList(domPrefText),
      excludeTitles: parseList(mustExcludeText),
      location: {
        ...DEFAULT_SEARCH_PROFILE.location,
        label: locationText,
        city:  locationText,
      },
      salary: {
        min:    null,
        target: salaryTarget ? Number(salaryTarget) : null,
      },
      apecSecteurs,
      apecTeletravail,
      apecSalaires,
    };

    await saveSettings(settings);
    // Crée la première piste du portefeuille avec ce profil de recherche.
    await updateSearchProfile(newProfile);

    // 2. Create source entries (simplified — no per-source keywords)
    // Elles sont rattachées à la piste qui vient d'être créée.
    for (const source of selectedSources) {
      await upsertConfig({ source, rssUrl: null, enabled: 1 });
    }

    toast.success(`Configuration créée pour ${selectedSources.length} source(s)`);
    onComplete();
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
          <div className="flex items-center gap-3">
            <Rocket className="w-6 h-6 text-white" />
            <div>
              <h2 className="text-lg font-bold text-white">Configuration de la Veille</h2>
              <p className="text-sm text-blue-100">
                {step === 'profile' && 'Vérifions votre profil'}
                {step === 'intent' && 'Définissez ce que vous cherchez'}
                {step === 'sources' && 'Choisissez vos sources'}
              </p>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex gap-2 mt-3">
            {steps.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 rounded-full flex-1 transition-colors ${
                  i <= currentIndex ? 'bg-white' : 'bg-white/30'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">

          {/* Step 1: Profile review */}
          {step === 'profile' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
                <UserRound className="w-5 h-5" />
                <h3 className="font-semibold">Votre profil</h3>
              </div>

              {profile?.title ? (
                <div className="space-y-3">
                  <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 px-4 py-3">
                    <p className="text-sm font-medium text-green-800 dark:text-green-300">
                      {profile.title}
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      {profile.firstName} {profile.lastName}
                      {profile.city ? ` · ${profile.city}` : ''}
                    </p>
                  </div>

                  {profileSkills.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                        Compétences détectées ({profileSkills.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {profileSkills.slice(0, 12).map(skill => (
                          <span key={skill} className="px-2 py-0.5 rounded text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                            {skill}
                          </span>
                        ))}
                        {profileSkills.length > 12 && (
                          <span className="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-500">
                            +{profileSkills.length - 12} autres
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-400">
                    Ces informations seront utilisées pour pré-remplir votre recherche.
                  </p>
                </div>
              ) : (
                <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-4 py-3">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Aucun titre de profil détecté. Remplissez votre profil pour un pré-remplissage automatique, ou configurez manuellement à l'étape suivante.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Search Intent */}
          {step === 'intent' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
                <Target className="w-5 h-5" />
                <h3 className="font-semibold">Critères de recherche</h3>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Rôle principal (séparés par des virgules)
                </label>
                <input
                  type="text"
                  value={rolePrimaryText}
                  onChange={e => setRolePrimaryText(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Développeur fullstack, Tech Lead"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Domaine requis (technologies, compétences obligatoires)
                </label>
                <input
                  type="text"
                  value={domReqText}
                  onChange={e => setDomReqText(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="React, TypeScript, Node.js"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Domaine préféré (nice-to-have)
                </label>
                <input
                  type="text"
                  value={domPrefText}
                  onChange={e => setDomPrefText(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="GraphQL, Docker, AWS"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Exclure (termes à rejeter)
                </label>
                <input
                  type="text"
                  value={mustExcludeText}
                  onChange={e => setMustExcludeText(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="stage, alternance, bénévole"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Salaire cible (€/an)
                  </label>
                  <input
                    type="number"
                    value={salaryTarget}
                    onChange={e => setSalaryTarget(e.target.value)}
                    className="w-full text-sm px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="45000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Localisation
                  </label>
                  <input
                    type="text"
                    value={locationText}
                    onChange={e => setLocationText(e.target.value)}
                    className="w-full text-sm px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Paris"
                  />
                </div>
              </div>

              {/* APEC Filters block */}
              <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                <label className="block text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-2">
                  Filtres spécifiques APEC (Optionnel)
                </label>
                
                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] text-gray-500 mb-1">Secteurs</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.keys(APEC_SECTEURS).map(label => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => toggleApecSecteur(label)}
                          className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                            apecSecteurs.includes(label)
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11px] text-gray-500 mb-1">Télétravail</p>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.keys(APEC_TELETRAVAIL).map(label => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => toggleApecTeletravail(label)}
                            className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                              apecTeletravail.includes(label)
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-500 mb-1">Salaire</p>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.keys(APEC_SALAIRES).map(label => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => toggleApecSalaire(label)}
                            className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                              apecSalaires.includes(label)
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Sources */}
          {step === 'sources' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
                <Globe className="w-5 h-5" />
                <h3 className="font-semibold">Sources d'offres</h3>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Sélectionnez les plateformes à surveiller. Vous pourrez en ajouter d'autres plus tard.
              </p>

              <div className="space-y-2">
                {ALL_SOURCES.map(source => {
                  const needsFt = source === 'france_travail' && !hasFtCredentials;
                  const needsRss = source === 'linkedin_rss';
                  return (
                    <label
                      key={source}
                      className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                        selectedSources.includes(source)
                          ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      } ${needsFt ? 'opacity-50' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSources.includes(source)}
                        onChange={() => !needsFt && toggleSource(source)}
                        disabled={needsFt}
                        className="w-4 h-4 rounded accent-blue-600"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                          {SOURCE_LABELS[source]}
                        </span>
                        {needsFt && (
                          <p className="text-[10px] text-amber-500 mt-0.5">
                            Nécessite les clés API (configurable dans les paramètres)
                          </p>
                        )}
                        {needsRss && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            Nécessite une URL RSS tierce
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex justify-between">
          {canGoPrev ? (
            <button
              onClick={() => setStep(steps[currentIndex - 1])}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Précédent
            </button>
          ) : (
            <div />
          )}

          {canGoNext ? (
            <button
              onClick={() => setStep(steps[currentIndex + 1])}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              Suivant
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={selectedSources.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white transition-colors"
            >
              <Rocket className="w-4 h-4" />
              Lancer la veille
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
