/**
 * Modales d'aide à la configuration du module Veille Emploi.
 * Destinées aux utilisateurs non techniques : étapes numérotées,
 * liens cliquables, boutons copier-coller.
 */

import { useState, useEffect, type ReactNode } from 'react';
import { X, Copy, Check, ExternalLink, HelpCircle, Sparkles, Wand2, ListChecks, AlignLeft, ClipboardPaste, AlertCircle } from 'lucide-react';
import type { SearchProfile } from '@/types/job-watch';
import { APEC_FONCTIONS_HIERARCHY, APEC_SECTEURS, APEC_TELETRAVAIL, APEC_SALAIRES } from '@/lib/watcher/parsers/apec-ids';

// ── Primitives ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      title="Copier"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
    >
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
      {text}
    </button>
  );
}

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300 break-all"
    >
      {children}
      <ExternalLink className="w-3 h-3 flex-shrink-0" />
    </a>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
        {n}
      </span>
      <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{children}</div>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      💡 {children}
    </div>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60" />

      {/* Panel */}
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-base">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
          {children}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Help button trigger ───────────────────────────────────────────────────────

interface HelpButtonProps {
  label?: string;
  onClick: () => void;
}

export function HelpButton({ label = "Comment faire ?", onClick }: HelpButtonProps) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
    >
      <HelpCircle className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

// ── Help modals ───────────────────────────────────────────────────────────────

export function FranceTravailHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="🇫🇷 Configurer France Travail" onClose={onClose}>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        France Travail met à disposition une API officielle gratuite pour accéder aux offres d'emploi.
        Il faut créer un compte développeur et une application.
      </p>

      <div className="space-y-3">
        <Step n={1}>
          Rendez-vous sur la plateforme développeur France Travail :{' '}
          <ExtLink href="https://francetravail.io/inscription">
            francetravail.io/inscription
          </ExtLink>
          <br />
          <span className="text-gray-500 text-xs">Créez un compte gratuit avec votre adresse e-mail.</span>
        </Step>

        <Step n={2}>
          Une fois connecté, cliquez sur <strong>« Mes applications »</strong> dans le menu, puis{' '}
          <strong>« Créer une application »</strong>.
          <br />
          <span className="text-gray-500 text-xs">Donnez-lui un nom quelconque, ex : « ResumeForge »</span>
        </Step>

        <Step n={3}>
          Dans votre application, cliquez sur l'onglet <strong>« API »</strong>, puis cliquez sur{' '}
          <strong>« Ajouter une API »</strong>.
          Recherchez et activez l'API :{' '}
          <strong>« Offres d'emploi v2 »</strong>
          <br />
          <span className="text-gray-500 text-xs">
            Il faut aussi cocher le scope : <CopyButton text="api_offresdemploiv2 o2dsoffre" />
          </span>
        </Step>

        <Step n={4}>
          Retournez dans <strong>« Mes applications »</strong> et cliquez sur votre application.
          Vous trouverez vos identifiants :<br />
          <ul className="mt-1.5 space-y-1 list-none">
            <li>→ <strong>Client ID</strong> : copiez-le dans le champ « Client ID » ci-dessous</li>
            <li>→ <strong>Client Secret</strong> : copiez-le dans le champ « Client Secret » ci-dessous</li>
          </ul>
        </Step>

        <Step n={5}>
          Ajoutez ensuite la source <strong>France Travail</strong> dans la section « Sources »
          et configurez vos mots-clés et département.
        </Step>
      </div>

      <Note>
        Le token OAuth2 est renouvelé automatiquement par ResumeForge. Vous n'avez pas à vous en occuper.
      </Note>
    </Modal>
  );
}

export function NavitiaHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="🚇 Configurer le calcul de trajet (IDFM PRIM)" onClose={onClose}>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Le portail PRIM d'Île-de-France Mobilités calcule automatiquement le temps de
        trajet en transports en commun vers chaque offre via l'API Navitia v2.
      </p>

      <div className="space-y-3">
        <Step n={1}>
          Allez sur : <ExtLink href="https://prim.iledefrance-mobilites.fr/fr/apis/idfm-navitia-general-v2">prim.iledefrance-mobilites.fr</ExtLink>
          <br />
          Créez un compte ou connectez-vous.
        </Step>

        <Step n={2}>
          Rendez-vous dans <strong>« Mes jetons d'authentification »</strong> &gt; onglet <strong>« API »</strong>.
          <br />
          Cliquez sur <strong>« Générer un jeton »</strong>.
        </Step>

        <Step n={3}>
          Copiez immédiatement le jeton affiché (il ne sera plus visible ensuite).
          <br />
          <span className="text-gray-500 text-xs">Collez-le dans le champ « Clé API PRIM » ci-dessous.</span>
        </Step>

        <Step n={4}>
          Dans <strong>« Adresse de départ »</strong>, entrez votre adresse personnelle complète :<br />
          <span className="italic text-gray-500 text-xs">ex : 12 rue de la Paix, 75002 Paris</span>
        </Step>

        <Step n={5}>
          Réglez <strong>« Heure de départ »</strong> sur l'heure à laquelle vous partiriez typiquement
          le matin, ex : <CopyButton text="09:00" />
        </Step>
      </div>

      <Note>
        Le calcul de trajet ne fonctionne que pour les offres en Île-de-France (couverture IDFM).
        Pour d'autres régions, le statut « Non calculé » s'affichera.
      </Note>
    </Modal>
  );
}

export function EmailHelpModal({ onClose }: { onClose: () => void }) {
  const [provider, setProvider] = useState<'gmail' | 'outlook' | 'other'>('gmail');

  return (
    <Modal title="📧 Configurer l'email digest" onClose={onClose}>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        ResumeForge envoie un récapitulatif quotidien des nouvelles offres par e-mail.
        Choisissez votre fournisseur :
      </p>

      <div className="flex gap-2">
        {(['gmail', 'outlook', 'other'] as const).map(p => (
          <button
            key={p}
            onClick={() => setProvider(p)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
              provider === p
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {p === 'gmail' ? 'Gmail' : p === 'outlook' ? 'Outlook / Hotmail' : 'Autre'}
          </button>
        ))}
      </div>

      {provider === 'gmail' && (
        <div className="space-y-3">
          <Note>
            Gmail nécessite un <strong>mot de passe d'application</strong> (pas votre mot de passe habituel).
          </Note>
          <Step n={1}>
            Activez la validation en deux étapes sur votre compte Google si ce n'est pas déjà fait :{' '}
            <ExtLink href="https://myaccount.google.com/security">myaccount.google.com/security</ExtLink>
          </Step>
          <Step n={2}>
            Accédez aux mots de passe d'application :{' '}
            <ExtLink href="https://myaccount.google.com/apppasswords">
              myaccount.google.com/apppasswords
            </ExtLink>
          </Step>
          <Step n={3}>
            Cliquez sur <strong>« Créer »</strong>, nommez-le « ResumeForge », et copiez le mot de passe
            à 16 caractères généré.
          </Step>
          <Step n={4}>
            Renseignez dans ResumeForge :
            <ul className="mt-2 space-y-1.5 text-xs">
              <li>Serveur SMTP : <CopyButton text="smtp.gmail.com" /></li>
              <li>Port : <CopyButton text="587" /></li>
              <li>Utilisateur : <span className="italic text-gray-500">votre adresse Gmail</span></li>
              <li>Mot de passe : <span className="italic text-gray-500">le mot de passe à 16 caractères</span></li>
            </ul>
          </Step>
        </div>
      )}

      {provider === 'outlook' && (
        <div className="space-y-3">
          <Note>
            Outlook/Hotmail utilise un <strong>mot de passe d'application</strong> si la vérification en deux étapes est activée.
          </Note>
          <Step n={1}>
            Activez la vérification en deux étapes :{' '}
            <ExtLink href="https://account.microsoft.com/security">
              account.microsoft.com/security
            </ExtLink>
          </Step>
          <Step n={2}>
            Créez un mot de passe d'application dans{' '}
            <strong>Sécurité avancée → Mots de passe d'application</strong>.
          </Step>
          <Step n={3}>
            Renseignez dans ResumeForge :
            <ul className="mt-2 space-y-1.5 text-xs">
              <li>Serveur SMTP : <CopyButton text="smtp-mail.outlook.com" /></li>
              <li>Port : <CopyButton text="587" /></li>
              <li>Utilisateur : <span className="italic text-gray-500">votre adresse Outlook</span></li>
              <li>Mot de passe : <span className="italic text-gray-500">le mot de passe d'application</span></li>
            </ul>
          </Step>
        </div>
      )}

      {provider === 'other' && (
        <div className="space-y-3">
          <Step n={1}>
            Demandez à votre fournisseur e-mail ses paramètres SMTP sortants.
            Les informations à chercher : <strong>serveur SMTP, port, SSL/TLS</strong>.
          </Step>
          <Step n={2}>
            Paramètres courants selon les fournisseurs :
            <table className="mt-2 text-xs w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <th className="px-2 py-1 text-left border border-gray-200 dark:border-gray-700">Fournisseur</th>
                  <th className="px-2 py-1 text-left border border-gray-200 dark:border-gray-700">Serveur</th>
                  <th className="px-2 py-1 text-left border border-gray-200 dark:border-gray-700">Port</th>
                </tr>
              </thead>
              <tbody className="text-gray-600 dark:text-gray-400">
                <tr>
                  <td className="px-2 py-1 border border-gray-200 dark:border-gray-700">OVH</td>
                  <td className="px-2 py-1 border border-gray-200 dark:border-gray-700">ssl0.ovh.net</td>
                  <td className="px-2 py-1 border border-gray-200 dark:border-gray-700">465 (SSL)</td>
                </tr>
                <tr>
                  <td className="px-2 py-1 border border-gray-200 dark:border-gray-700">Orange</td>
                  <td className="px-2 py-1 border border-gray-200 dark:border-gray-700">smtp.orange.fr</td>
                  <td className="px-2 py-1 border border-gray-200 dark:border-gray-700">465 (SSL)</td>
                </tr>
                <tr>
                  <td className="px-2 py-1 border border-gray-200 dark:border-gray-700">Free</td>
                  <td className="px-2 py-1 border border-gray-200 dark:border-gray-700">smtp.free.fr</td>
                  <td className="px-2 py-1 border border-gray-200 dark:border-gray-700">465 (SSL)</td>
                </tr>
              </tbody>
            </table>
          </Step>
          <Note>
            Si votre fournisseur propose le port 465, utilisez-le (chiffrement SSL direct, plus fiable que STARTTLS).
          </Note>
        </div>
      )}
    </Modal>
  );
}

export function LinkedInRssHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="🔗 Configurer LinkedIn (flux RSS)" onClose={onClose}>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        LinkedIn ne fournit pas directement de flux RSS. On utilise un service tiers
        pour convertir la recherche d'offres LinkedIn en RSS.
      </p>

      <div className="space-y-3">
        <Step n={1}>
          Allez sur LinkedIn et faites une recherche d'offres avec vos critères habituels :{' '}
          <ExtLink href="https://www.linkedin.com/jobs/search">
            linkedin.com/jobs/search
          </ExtLink>
        </Step>

        <Step n={2}>
          Copiez l'URL complète de la page de résultats dans votre navigateur.<br />
          <span className="text-gray-500 text-xs">Elle ressemble à :<br />
          <span className="font-mono text-xs break-all text-gray-600 dark:text-gray-400">
            https://www.linkedin.com/jobs/search/?keywords=recruteur&location=Paris
          </span>
          </span>
        </Step>

        <Step n={3}>
          Rendez-vous sur <ExtLink href="https://rss.app">rss.app</ExtLink>{' '}
          (gratuit jusqu'à 3 flux).<br />
          Collez votre URL LinkedIn dans le champ de création de flux RSS.
          Copiez l'URL RSS générée (commence par <span className="font-mono text-xs">https://rss.app/feeds/</span>).
        </Step>

        <Step n={4}>
          Dans ResumeForge, ajoutez la source <strong>LinkedIn (RSS tiers)</strong> et collez
          l'URL RSS dans le champ dédié.
        </Step>
      </div>

      <Note>
        Alternative gratuite : <ExtLink href="https://www.jobicy.com/?feed=job_feed">jobicy.com</ExtLink>{' '}
        propose aussi des flux RSS d'offres LinkedIn agrégées par secteur.
      </Note>
    </Modal>
  );
}

export function SourcesHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="⚙️ Configurer les sources d'offres" onClose={onClose}>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Chaque source nécessite une configuration minimale. Voici les recommandations
        par source.
      </p>

      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">APEC</h4>
          <div className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <p>Source automatique. Renseignez les <strong>titres de poste visés</strong>,
            le ou les <strong>département(s)</strong> (ex : 75, 92) et le <strong>type de contrat</strong>.</p>
            <p className="text-xs text-gray-500">Les mots-clés sont combinés en OU — 3 à 5 intitulés courts donnent les meilleurs résultats.</p>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">France Travail</h4>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Nécessite des identifiants OAuth2. Cliquez sur{' '}
            <span className="font-medium text-blue-600 dark:text-blue-400">« Comment obtenir ? »</span>{' '}
            dans la section France Travail des options avancées pour le guide pas-à-pas.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Renseignez le <strong>code INSEE</strong> (ex : 75056 Paris) <em>et</em> au moins un <strong>département</strong> (ex : 75) —
            si l'API rejette le code commune, la recherche bascule automatiquement sur le département.
          </p>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Welcome to the Jungle</h4>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Source automatique. Les offres sont extraites depuis la page de recherche publique.
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            ⚠ WTTJ est une application JavaScript — les résultats peuvent être limités selon les
            conditions de scraping. Si vous obtenez 0 offres, renseignez une <strong>ville</strong> dans
            la section Localisation (champ « Ville — WTTJ »).
          </p>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">LinkedIn</h4>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Nécessite une URL RSS externe. Cliquez sur{' '}
            <span className="font-medium text-blue-600 dark:text-blue-400">« Comment faire ? »</span>{' '}
            dans la configuration LinkedIn pour le guide.
          </p>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Mantiks</h4>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Agrégateur FR nécessitant une <strong>clé API mantiks.io</strong> (Options avancées).
            L'intégration utilise l'endpoint <code>/company/search</code> avec authentification par
            header <code>x-api-key</code>. L'URL de base par défaut est <code>https://api.mantiks.io</code>{' '}
            — à ne modifier qu'en cas de changement d'API.
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
            <strong>Zone géographique (obligatoire côté API) :</strong> Mantiks requiert des <em>IDs de lieu</em>{' '}
            (entiers), pas un nom de ville. Par défaut, l'application les résout automatiquement à partir de la
            ville configurée dans votre profil de recherche (appel à <code>/location/search?name=&lt;ville&gt;</code>).
            Si vous souhaitez forcer des IDs spécifiques, renseignez-les manuellement dans le champ
            « IDs de lieu Mantiks » (séparés par virgule).
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
            <strong>Coût :</strong> 1 crédit par entreprise retournée (indépendamment du nombre d'offres).
            Documentation complète :{' '}
            <ExtLink href="https://mantiks-api.readme.io/reference/getting-started-with-your-api">mantiks-api.readme.io</ExtLink>.
          </p>
        </div>
      </div>

      <Note>
        Commencez par APEC + LinkedIn RSS — ce sont les plus fiables. Ajoutez France Travail
        une fois les credentials configurés.
      </Note>
    </Modal>
  );
}

// ── Profile assistant (contextual help + prompt generator) ───────────────────

/**
 * A ready-to-apply preset covering the three most common job hunts.
 * Users can one-click apply a preset to their SearchProfile, then tune.
 */
const PROFILE_PRESETS: Array<{
  id: string;
  icon: string;
  label: string;
  summary: string;
  profile: Partial<SearchProfile>;
}> = [
  {
    id: 'dev-web',
    icon: '💻',
    label: 'Développeur·se Web',
    summary: 'Front/Back CDI, stack moderne, exclusion SSII',
    profile: {
      jobTitles: ['Développeur Web', 'Full Stack', 'Front End', 'Back End'],
      skills: ['React', 'TypeScript', 'Node', 'PostgreSQL', 'Git'],
      domains: ['Tech', 'SaaS', 'Scale-up', 'Startup'],
      excludeTitles: ['stagiaire', 'alternant', 'apprenti'],
      excludeDomains: ['ESN', 'SSII'],
      contractTypes: ['CDI'],
      salary: { min: 45000, target: 55000 },
      scoring: { mode: 'balanced' },
    },
  },
  {
    id: 'recruteur',
    icon: '🧲',
    label: 'Recruteur·se / Talent Acquisition',
    summary: 'TAM, sourcing, RH, exclusion ingénieur/technique',
    profile: {
      jobTitles: ['Recruteur', 'Talent Acquisition Manager', 'Talent Partner', 'Chargé de recrutement'],
      skills: ['sourcing', 'LinkedIn Recruiter', 'ATS', 'recrutement'],
      domains: ['Tech', 'Cybersécurité', 'SaaS'],
      excludeTitles: [
        'stagiaire', 'alternant', 'ingénieur', 'technicien',
        'commercial', 'vendeur', 'cariste', 'électricien',
      ],
      excludeDomains: ['BTP', 'Restauration', 'VPC'],
      contractTypes: ['CDI'],
      salary: { min: 40000, target: 50000 },
      scoring: { mode: 'balanced' },
      apecFonctions: ['Chargé de recrutement', 'Responsable recrutement', 'Développement RH'],
    },
  },
  {
    id: 'data',
    icon: '📊',
    label: 'Data Analyst / Data Scientist',
    summary: 'Python, SQL, ML, CDI ou freelance',
    profile: {
      jobTitles: ['Data Analyst', 'Data Scientist', 'Data Engineer'],
      skills: ['Python', 'SQL', 'Pandas', 'dbt', 'Airflow'],
      domains: ['Tech', 'FinTech', 'E-commerce', 'Scale-up'],
      excludeTitles: ['stagiaire', 'alternant', 'commercial'],
      excludeDomains: ['ESN', 'SSII'],
      contractTypes: ['CDI', 'Freelance'],
      salary: { min: 45000, target: 60000 },
      scoring: { mode: 'balanced' },
    },
  },
];

// ── Guided questions ─────────────────────────────────────────────────────────

interface GuidedAnswers {
  jobTitle:     string;
  experience:   string;
  city:         string;
  contract:     string[];
  salaryMin:    string;
  salaryTarget: string;
  excludedSectors: string;
  extra: string;
}

const EMPTY_GUIDED: GuidedAnswers = {
  jobTitle:        '',
  experience:      '',
  city:            '',
  contract:        ['CDI'],
  salaryMin:       '',
  salaryTarget:    '',
  excludedSectors: '',
  extra:           '',
};

function buildContextFromGuided(a: GuidedAnswers): string {
  const parts: string[] = [];
  if (a.jobTitle)      parts.push(`Poste visé : ${a.jobTitle}.`);
  if (a.experience)    parts.push(`Expérience : ${a.experience}.`);
  if (a.city)          parts.push(`Localisation : ${a.city}.`);
  if (a.contract.length) parts.push(`Type de contrat : ${a.contract.join(', ')}.`);
  if (a.salaryMin)     parts.push(`Salaire minimum : ${a.salaryMin} €/an.`);
  if (a.salaryTarget)  parts.push(`Salaire cible : ${a.salaryTarget} €/an.`);
  if (a.excludedSectors) parts.push(`Secteurs à exclure : ${a.excludedSectors}.`);
  if (a.extra)         parts.push(a.extra);
  return parts.join('\n');
}

const CONTRACT_OPTIONS = ['CDI', 'CDD', 'Freelance', 'Alternance', 'Stage'];
const EXPERIENCE_OPTIONS = [
  { value: 'moins de 2 ans', label: '< 2 ans' },
  { value: '2 à 5 ans',      label: '2–5 ans' },
  { value: '5 à 10 ans',     label: '5–10 ans' },
  { value: 'plus de 10 ans', label: '> 10 ans' },
];

/**
 * Generates an LLM prompt the user can paste into ChatGPT / Claude / Mistral
 * to help them draft a SearchProfile. The prompt includes the full JSON schema
 * and asks the LLM to return a ready-to-paste JSON object.
 */
function buildLlmPrompt(userContext: string): string {
  const trimmed = userContext.trim() || '[Décrivez ici en français votre parcours, vos compétences, le type de poste que vous cherchez, votre localisation, vos contraintes (télétravail, salaire, secteurs à éviter…).]';

  const apecFonctionsStr = APEC_FONCTIONS_HIERARCHY.map(c => 
    `- ${c.label} (ID: ${c.id})\n` + c.children.map(ch => `  - ${ch.label} (ID: ${ch.id})`).join('\n')
  ).join('\n');
  const apecSecteursStr = Object.entries(APEC_SECTEURS).map(([k, v]) => `- ${k} (ID: ${v})`).join('\n');
  const apecTeletravailStr = Object.entries(APEC_TELETRAVAIL).map(([k, v]) => `- ${k} (ID: ${v})`).join('\n');
  const apecSalairesStr = Object.entries(APEC_SALAIRES).map(([k, v]) => `- ${k} (ID: ${v})`).join('\n');

  return `Tu es un coach emploi français. Je veux configurer un profil de recherche pour un agrégateur d'offres (APEC, France Travail, Welcome to the Jungle, LinkedIn, Mantiks).

## Mon profil / mon besoin
${trimmed}

## Ta mission
Rédige un profil de recherche optimal au format JSON strict, qui respecte EXACTEMENT ce schéma :

\`\`\`json
{
  "name": "string — nom court du profil",
  "jobTitles": ["string"],        // 3 à 6 intitulés de postes visés, courts, sans ponctuation
  "skills": ["string"],           // 5 à 10 compétences / outils clés
  "domains": ["string"],          // 2 à 5 secteurs / environnements préférés
  "excludeTitles": ["string"],    // titres qui doivent DISQUALIFIER une offre
  "excludeDomains": ["string"],   // secteurs à exclure
  "location": {
    "label": "string",            // ex: "Paris (75)"
    "city": "string",             // ex: "Paris"
    "inseeCode": "string",        // code INSEE 5 chars, PAS le code postal. Ex: 75056 Paris, 69123 Lyon, 13055 Marseille
    "departmentCodes": ["string"], // ex: ["75", "92", "93", "94"]
    "radiusKm": 30
  },
  "contractTypes": ["CDI"],       // parmi: CDI, CDD, Freelance, Alternance, Stage
  "salary": { "min": 40000, "target": 50000 },
  "scoring": { "mode": "balanced" }, // loose | balanced | strict
  "blacklistedCompanies": [],
  "apecFonctions": [],            // tableau d'IDs (entiers) pour le filtre métier APEC (voir liste ci-dessous)
  "apecSecteurs": [],             // tableau d'IDs (entiers)
  "apecTeletravail": [],          // tableau d'IDs (entiers)
  "apecSalaires": []              // tableau d'IDs (entiers)
}
\`\`\`

## Valeurs autorisées pour apecFonctions (IDs APEC)
Utilise UNIQUEMENT les IDs numériques suivants (tableau d'entiers, vide si aucun ne correspond) :
${apecFonctionsStr}

## Valeurs autorisées pour apecSecteurs (IDs APEC) :
${apecSecteursStr}

## Valeurs autorisées pour apecTeletravail (IDs APEC) :
${apecTeletravailStr}

## Valeurs autorisées pour apecSalaires (IDs APEC) :
${apecSalairesStr}

## Utilisation des Filtres APEC
Appliquez les IDs en combinaisons ciblées pour 50-200 résultats optimaux.
- Fonctions : Privilégiez IDs feuilles (600xxx) pour précision ; combinez 2-3 max. Exemple: IT + RH : 600080,600120.
- Lieux : Région + 1-3 départements ; évitez "France" seul (trop large). Exemple: Île-de-France : 711 ou 75,78,92.
- Contrat/Exp : CDI prioritaire (101888) ; 6+ ans pour cadres (20044+). Exemple: CDI 10+ ans : 101888,20045.
- Autres : Ajoutez télétravail (101951) si pertinent ; salaire min pour filtrer. Exemple: Télétravail régulier + >50k€.

## Règles
1. Ne propose QUE du JSON valide, rien d'autre avant ni après.
2. Les intitulés (\`jobTitles\`) doivent être les plus susceptibles de matcher des offres réelles en France — évite les anglicismes internes aux entreprises.
3. Pour \`excludeTitles\`, pense aux faux positifs courants du métier visé (ex: un recruteur tech exclura "ingénieur", "technicien", "commercial").
4. Pour \`inseeCode\` : ATTENTION, ce n'est PAS le code postal. Si tu n'es pas sûr, mets une chaîne vide \`""\` et je rechercherai moi-même sur insee.fr.
5. Pour \`departmentCodes\` : donne 1 à 5 départements cohérents avec la zone visée.
6. Le \`scoring.mode\` recommandé est \`"balanced"\` sauf demande explicite.
7. Pour \`apecFonctions\`, \`apecSecteurs\`, \`apecTeletravail\`, \`apecSalaires\` : sélectionne les IDs EXACTS qui correspondent. Si rien ne correspond, laisse un tableau vide.
8. Si une info manque dans mon profil, choisis une valeur raisonnable sans demander de clarification.

Rends-moi uniquement le JSON.`;
}

// ── JSON response parser ─────────────────────────────────────────────────────

interface ParseResult {
  ok: boolean;
  profile?: Partial<SearchProfile>;
  error?: string;
  /** Non-blocking warnings the user should review */
  warnings?: string[];
}

/**
 * Parses + validates the JSON the user pastes from an LLM into a Partial<SearchProfile>.
 *
 * - Tolerant of markdown code fences (```json … ```), leading text, trailing text
 * - Coerces each field to the expected shape, drops unknown values
 * - Returns warnings for values that were silently corrected so the user can review
 */
function parseLlmProfileJson(raw: string): ParseResult {
  const input = raw.trim();
  if (!input) return { ok: false, error: 'Collez d\'abord la réponse JSON de l\'IA.' };

  // Strip ```json … ``` fences if present
  let cleaned = input
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  // If there's trailing text after a valid JSON object, try to isolate the first { … }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace  = cleaned.lastIndexOf('}');
  if (firstBrace > 0 || (firstBrace >= 0 && lastBrace > firstBrace && lastBrace < cleaned.length - 1)) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(cleaned);
  } catch (err) {
    return { ok: false, error: `JSON invalide : ${err instanceof Error ? err.message : String(err)}` };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, error: 'Le JSON doit être un objet { … }.' };
  }

  const warnings: string[] = [];
  const profile: Partial<SearchProfile> = {};

  const asStringArray = (v: unknown, field: string): string[] | undefined => {
    if (v === undefined || v === null) return undefined;
    if (!Array.isArray(v)) { warnings.push(`${field} n'est pas un tableau — ignoré`); return undefined; }
    const out = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map(s => s.trim());
    return out.length > 0 ? out : undefined;
  };

  const asNumberArray = (v: unknown, field: string): number[] | undefined => {
    if (v === undefined || v === null) return undefined;
    if (!Array.isArray(v)) { warnings.push(`${field} n'est pas un tableau — ignoré`); return undefined; }
    const out = v.filter((x): x is number => typeof x === 'number');
    return out.length > 0 ? out : undefined;
  };

  // Maps inversées pour récupérer les libellés depuis les IDs
  const APEC_FONCTIONS_MAP: Record<number, string> = {};
  APEC_FONCTIONS_HIERARCHY.forEach(c => {
    if (c.id !== null) APEC_FONCTIONS_MAP[c.id] = c.label;
    c.children.forEach(ch => { APEC_FONCTIONS_MAP[ch.id] = ch.label; });
  });
  const APEC_SECTEURS_MAP = Object.fromEntries(Object.entries(APEC_SECTEURS).map(([k,v]) => [v, k]));
  const APEC_TELETRAVAIL_MAP = Object.fromEntries(Object.entries(APEC_TELETRAVAIL).map(([k,v]) => [v, k]));
  const APEC_SALAIRES_MAP = Object.fromEntries(Object.entries(APEC_SALAIRES).map(([k,v]) => [v, k]));

  if (typeof data.name === 'string' && data.name.trim()) profile.name = data.name.trim();

  const jobTitles = asStringArray(data.jobTitles, 'jobTitles');
  if (jobTitles) profile.jobTitles = jobTitles;
  const skills = asStringArray(data.skills, 'skills');
  if (skills) profile.skills = skills;
  const domains = asStringArray(data.domains, 'domains');
  if (domains) profile.domains = domains;
  const excludeTitles = asStringArray(data.excludeTitles, 'excludeTitles');
  if (excludeTitles) profile.excludeTitles = excludeTitles;
  const excludeDomains = asStringArray(data.excludeDomains, 'excludeDomains');
  if (excludeDomains) profile.excludeDomains = excludeDomains;
  const blacklistedCompanies = asStringArray(data.blacklistedCompanies, 'blacklistedCompanies');
  if (blacklistedCompanies) profile.blacklistedCompanies = blacklistedCompanies;

  const apecFonctionsIds = asNumberArray(data.apecFonctions, 'apecFonctions');
  if (apecFonctionsIds) {
    const kept = apecFonctionsIds.map(id => APEC_FONCTIONS_MAP[id]).filter(Boolean);
    if (kept.length < apecFonctionsIds.length) {
      warnings.push(`apecFonctions : IDs inconnus ignorés`);
    }
    profile.apecFonctions = kept;
  }

  const apecSecteursIds = asNumberArray(data.apecSecteurs, 'apecSecteurs');
  if (apecSecteursIds) {
    const kept = apecSecteursIds.map(id => APEC_SECTEURS_MAP[id]).filter(Boolean);
    profile.apecSecteurs = kept;
  }

  const apecTeletravailIds = asNumberArray(data.apecTeletravail, 'apecTeletravail');
  if (apecTeletravailIds) {
    const kept = apecTeletravailIds.map(id => APEC_TELETRAVAIL_MAP[id]).filter(Boolean);
    profile.apecTeletravail = kept;
  }

  const apecSalairesIds = asNumberArray(data.apecSalaires, 'apecSalaires');
  if (apecSalairesIds) {
    const kept = apecSalairesIds.map(id => APEC_SALAIRES_MAP[id]).filter(Boolean);
    profile.apecSalaires = kept;
  }

  if (typeof data.location === 'object' && data.location !== null && !Array.isArray(data.location)) {
    const loc = data.location as Record<string, unknown>;
    const locationPatch: Partial<SearchProfile['location']> = {};
    if (typeof loc.label === 'string')     locationPatch.label     = loc.label.trim();
    if (typeof loc.city === 'string')      locationPatch.city      = loc.city.trim();
    if (typeof loc.inseeCode === 'string') {
      const code = loc.inseeCode.trim().toUpperCase();
      locationPatch.inseeCode = code;
      if (code && !/^(2[AB]\d{3}|\d{5})$/.test(code)) {
        warnings.push(`inseeCode "${code}" semble invalide — vérifiez sur insee.fr`);
      }
    }
    const depts = asStringArray(loc.departmentCodes, 'location.departmentCodes');
    if (depts) locationPatch.departmentCodes = depts;
    if (typeof loc.radiusKm === 'number' && loc.radiusKm >= 0) {
      locationPatch.radiusKm = loc.radiusKm;
    }
    if (Object.keys(locationPatch).length > 0) {
      profile.location = locationPatch as SearchProfile['location'];
    }
  }

  const contractTypes = asStringArray(data.contractTypes, 'contractTypes');
  if (contractTypes) {
    const valid = ['CDI', 'CDD', 'Freelance', 'Alternance', 'Stage', 'Fonctionnaire'];
    const kept = contractTypes.filter(ct => valid.includes(ct));
    if (kept.length < contractTypes.length) {
      warnings.push(`contractTypes : valeurs inconnues ignorées (seuls ${valid.join(', ')} sont acceptés)`);
    }
    if (kept.length > 0) profile.contractTypes = kept;
  }

  if (typeof data.salary === 'object' && data.salary !== null && !Array.isArray(data.salary)) {
    const sal = data.salary as Record<string, unknown>;
    const salaryPatch: Partial<SearchProfile['salary']> = {};
    if (sal.min === null || typeof sal.min === 'number')       salaryPatch.min    = sal.min as number | null;
    if (sal.target === null || typeof sal.target === 'number') salaryPatch.target = sal.target as number | null;
    if (Object.keys(salaryPatch).length > 0) {
      profile.salary = { min: null, target: null, ...salaryPatch };
    }
  }

  if (typeof data.scoring === 'object' && data.scoring !== null && !Array.isArray(data.scoring)) {
    const sc = data.scoring as Record<string, unknown>;
    if (sc.mode === 'loose' || sc.mode === 'balanced' || sc.mode === 'strict') {
      profile.scoring = { mode: sc.mode };
    }
  }

  if (Object.keys(profile).length === 0) {
    return { ok: false, error: 'Aucun champ exploitable trouvé dans le JSON.' };
  }

  return { ok: true, profile, warnings: warnings.length > 0 ? warnings : undefined };
}

interface ProfileAssistantModalProps {
  onClose: () => void;
  /** Called when the user applies a preset — receives a partial SearchProfile */
  onApplyPreset?: (partial: Partial<SearchProfile>) => void;
  /** Current profile, used to pre-fill the prompt context */
  currentProfileHint?: string;
}

export function ProfileAssistantModal({
  onClose,
  onApplyPreset,
  currentProfileHint = '',
}: ProfileAssistantModalProps) {
  const [tab, setTab] = useState<'help' | 'presets' | 'prompt'>('help');
  const [promptMode, setPromptMode] = useState<'guided' | 'freetext'>('guided');
  const [guided, setGuided] = useState<GuidedAnswers>(EMPTY_GUIDED);
  const [userContext, setUserContext] = useState(currentProfileHint);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);

  // Sync guided → freetext when in guided mode
  useEffect(() => {
    if (promptMode === 'guided') {
      setUserContext(buildContextFromGuided(guided));
    }
  }, [guided, promptMode]);

  const prompt = buildLlmPrompt(userContext);

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const setG = <K extends keyof GuidedAnswers>(k: K, v: GuidedAnswers[K]) =>
    setGuided(prev => ({ ...prev, [k]: v }));

  const toggleContract = (ct: string) =>
    setG('contract', guided.contract.includes(ct)
      ? guided.contract.filter(c => c !== ct)
      : [...guided.contract, ct]);

  const handleParseJson = () => {
    setParseResult(parseLlmProfileJson(jsonInput));
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setJsonInput(text);
      setParseResult(parseLlmProfileJson(text));
    } catch {
      setParseResult({ ok: false, error: 'Impossible de lire le presse-papiers — collez manuellement.' });
    }
  };

  const handleApplyJson = () => {
    if (!parseResult?.ok || !parseResult.profile || !onApplyPreset) return;
    onApplyPreset(parseResult.profile);
    onClose();
  };

  return (
    <Modal title="Assistant de configuration" onClose={onClose}>
      {/* Tabs */}
      <div className="flex gap-1 -mt-2 -mx-1 pb-2 border-b border-gray-200 dark:border-gray-700">
        {([
          ['help',    'Guide rapide',  HelpCircle],
          ['presets', 'Profils types', Sparkles],
          ['prompt',  'Générer avec IA', Wand2],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === id
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Help ── */}
      {tab === 'help' && (
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Chaque champ du profil pilote à la fois la <strong>requête envoyée</strong> aux sources
            et le <strong>score</strong> des offres remontées. Bien le remplir est la clé pour ne
            pas passer à côté d'offres pertinentes… ou en recevoir trop.
          </p>

          <div className="space-y-2">
            <FieldHelp label="Titres de poste visés" example='ex : "Recruteur, Talent Acquisition, RRH"'>
              <strong>3 à 6 intitulés courts</strong> qui apparaîtront dans le titre d'une offre
              qui vous intéresse. <em>Moins, c'est mieux</em> : plus il y en a, plus la recherche
              est restrictive (APEC/FT combinent certains mots-clés en ET).
            </FieldHelp>

            <FieldHelp label="Compétences / outils" example='ex : "ATS, LinkedIn Recruiter, Python"'>
              Utilisées uniquement pour le <strong>scoring</strong> — pas envoyées aux API comme
              mots-clés de recherche (elles rendraient la requête trop restrictive). Chaque
              compétence trouvée dans une offre lui donne <strong>+5 pts</strong>.
            </FieldHelp>

            <FieldHelp label="Exclure ces rôles" example='ex : "stagiaire, alternant, ingénieur"'>
              Termes qui <strong>disqualifient</strong> une offre (score → 0). Pensez aux faux
              positifs récurrents : un recruteur tech voudra exclure "ingénieur", "technicien",
              "commercial" — sinon les sources renvoient des centaines d'offres hors-cible.
            </FieldHelp>

            <FieldHelp label="Code INSEE" example='ex : 75056 (Paris), 69123 (Lyon), 13055 (Marseille)'>
              <strong>Requis pour France Travail</strong> pour filtrer par ville précise.
              Attention : le code INSEE d'une commune n'est <strong>pas</strong> son code postal !
              Le bon code se trouve sur{' '}
              <ExtLink href="https://www.insee.fr/fr/information/2560452">insee.fr</ExtLink>.
              En cas d'erreur, la recherche bascule automatiquement sur le département.
            </FieldHelp>

            <FieldHelp label="Département(s)" example="ex : 75, 92, 93, 94">
              Utilisé par APEC (multi-départements) et comme repli France Travail.
              Séparés par des virgules.
            </FieldHelp>

            <FieldHelp label="Rayon (km)" example="ex : 30">
              Distance autour de votre localisation. 30 km est un bon défaut pour une grande
              agglomération.
            </FieldHelp>

            <FieldHelp label="APEC — Filtre par métier" example='ex : "Chargé de recrutement", "Développement RH"'>
              Filtre <strong>exact côté serveur</strong> spécifique à APEC. Sélectionnez les
              sous-fonctions qui correspondent à votre métier — l'API renvoie uniquement les
              offres classées dans ces catégories. Plus précis que les mots-clés, qui cherchent
              aussi dans le corps de l'offre.{' '}
              <em>Facultatif</em> : si vide, APEC applique uniquement le filtre mots-clés.
            </FieldHelp>

            <FieldHelp label="Mode de scoring">
              <ul className="space-y-0.5 text-xs">
                <li>• <strong>Permissif</strong> : ramène beaucoup d'offres, tri au filtre.</li>
                <li>• <strong>Équilibré</strong> (recommandé) : bon compromis précision/recall.</li>
                <li>• <strong>Strict</strong> : le titre du poste DOIT apparaître dans l'offre.</li>
              </ul>
            </FieldHelp>
          </div>

          <Note>
            Si vous recevez 0 offres, relâchez d'abord le profil : moins de titres, moins d'exclusions,
            scoring "Permissif". Vous pourrez resserrer ensuite.
          </Note>
        </div>
      )}

      {/* ── Tab: Presets ── */}
      {tab === 'presets' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Cliquez sur un profil type pour le <strong>pré-remplir</strong>. Vous pourrez ensuite
            ajuster chaque champ avant de sauvegarder.
          </p>
          <div className="space-y-2">
            {PROFILE_PRESETS.map(preset => (
              <div
                key={preset.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                      {preset.icon} {preset.label}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{preset.summary}</p>
                  </div>
                  {onApplyPreset && (
                    <button
                      type="button"
                      onClick={() => { onApplyPreset(preset.profile); onClose(); }}
                      className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium whitespace-nowrap transition-colors"
                    >
                      Appliquer
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {(preset.profile.jobTitles ?? []).slice(0, 4).map(t => (
                    <span key={t} className="px-1.5 py-0.5 text-[10px] rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                      {t}
                    </span>
                  ))}
                  {(preset.profile.excludeTitles ?? []).slice(0, 3).map(t => (
                    <span key={t} className="px-1.5 py-0.5 text-[10px] rounded bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                      ≠ {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <Note>
            Les presets sont des points de départ — adaptez toujours la localisation (INSEE,
            départements) et la fourchette de salaire à votre cas.
          </Note>
        </div>
      )}

      {/* ── Tab: Prompt generator ── */}
      {tab === 'prompt' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Générez un prompt que vous collez dans ChatGPT, Claude ou Mistral.
            L'IA vous rend un JSON prêt à recopier dans les champs.
          </p>

          {/* Mode toggle */}
          <div className="flex gap-1 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
            {([
              ['guided',   'Questions guidées', ListChecks],
              ['freetext', 'Texte libre',        AlignLeft],
            ] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPromptMode(id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  promptMode === id
                    ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>

          {/* ── Guided questions ── */}
          {promptMode === 'guided' && (
            <div className="space-y-2.5 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">
                    Intitulé de poste visé *
                  </label>
                  <input
                    type="text"
                    className="w-full text-xs px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="ex : Recruteur, Talent Acquisition, Data Analyst…"
                    value={guided.jobTitle}
                    onChange={e => setG('jobTitle', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">
                    Ville / région
                  </label>
                  <input
                    type="text"
                    className="w-full text-xs px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="ex : Paris, Lyon, Bordeaux…"
                    value={guided.city}
                    onChange={e => setG('city', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Expérience
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {EXPERIENCE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setG('experience', guided.experience === opt.value ? '' : opt.value)}
                      className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
                        guided.experience === opt.value
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Type de contrat
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {CONTRACT_OPTIONS.map(ct => (
                    <button
                      key={ct}
                      type="button"
                      onClick={() => toggleContract(ct)}
                      className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
                        guided.contract.includes(ct)
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400'
                      }`}
                    >
                      {ct}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">
                    Salaire minimum (€/an)
                  </label>
                  <input
                    type="number" min={0} step={1000}
                    className="w-full text-xs px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="ex : 40000"
                    value={guided.salaryMin}
                    onChange={e => setG('salaryMin', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">
                    Salaire cible (€/an)
                  </label>
                  <input
                    type="number" min={0} step={1000}
                    className="w-full text-xs px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="ex : 50000"
                    value={guided.salaryTarget}
                    onChange={e => setG('salaryTarget', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">
                  Secteurs / rôles à exclure
                </label>
                <input
                  type="text"
                  className="w-full text-xs px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="ex : ESN, SSII, commercial, BTP…"
                  value={guided.excludedSectors}
                  onChange={e => setG('excludedSectors', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">
                  Précisions libres (optionnel)
                </label>
                <textarea
                  rows={2}
                  className="w-full text-xs px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  placeholder="ex : télétravail hybride souhaité, secteur cybersécurité uniquement…"
                  value={guided.extra}
                  onChange={e => setG('extra', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* ── Free text ── */}
          {promptMode === 'freetext' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Votre contexte
              </label>
              <textarea
                rows={5}
                className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                value={userContext}
                onChange={e => setUserContext(e.target.value)}
                placeholder={
                  'ex : 8 ans d\'expérience en recrutement tech, spécialisé cybersécurité.\n' +
                  'Je vis à Paris, je cherche un CDI Senior Talent Partner dans une scale-up.\n' +
                  'Je ne veux pas d\'ESN ni de postes commerciaux.'
                }
              />
            </div>
          )}

          {/* Generated prompt */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                Prompt généré
              </label>
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
              >
                {copiedPrompt
                  ? <><Check className="w-3 h-3" /> Copié !</>
                  : <><Copy className="w-3 h-3" /> Copier</>}
              </button>
            </div>
            <pre className="text-[10px] leading-relaxed font-mono bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap text-gray-700 dark:text-gray-300">
              {prompt}
            </pre>
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <p><strong>Mode d'emploi :</strong></p>
            <ol className="ml-4 list-decimal space-y-0.5">
              <li>Copiez le prompt, collez-le dans{' '}
                <ExtLink href="https://claude.ai/new">Claude</ExtLink> ·{' '}
                <ExtLink href="https://chatgpt.com">ChatGPT</ExtLink> ·{' '}
                <ExtLink href="https://chat.mistral.ai">Mistral</ExtLink>.
              </li>
              <li>Copiez la réponse JSON de l'IA et collez-la ci-dessous — l'app remplit les champs automatiquement.</li>
            </ol>
          </div>

          {/* ── JSON paste & apply ── */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Coller la réponse JSON de l'IA
              </label>
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-[10px] font-medium hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                <ClipboardPaste className="w-3 h-3" />
                Coller depuis presse-papiers
              </button>
            </div>
            <textarea
              rows={5}
              className="w-full text-[11px] font-mono px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              value={jsonInput}
              onChange={e => { setJsonInput(e.target.value); setParseResult(null); }}
              placeholder={'{\n  "name": "…",\n  "jobTitles": [ "…" ],\n  …\n}'}
            />

            {parseResult && !parseResult.ok && (
              <div className="flex items-start gap-1.5 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 px-2.5 py-1.5 text-[11px] text-red-700 dark:text-red-300">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{parseResult.error}</span>
              </div>
            )}

            {parseResult?.ok && parseResult.profile && (
              <div className="space-y-1.5">
                <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 px-2.5 py-1.5">
                  <p className="text-[11px] font-medium text-green-700 dark:text-green-300 flex items-center gap-1">
                    <Check className="w-3 h-3" /> JSON valide — {Object.keys(parseResult.profile).length} champ(s) détecté(s)
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.keys(parseResult.profile).map(k => (
                      <span key={k} className="px-1.5 py-0.5 text-[9px] rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-mono">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
                {parseResult.warnings && parseResult.warnings.length > 0 && (
                  <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-2.5 py-1.5 text-[10px] text-amber-700 dark:text-amber-300">
                    <p className="font-medium mb-0.5">Avertissements :</p>
                    <ul className="list-disc ml-3 space-y-0.5">
                      {parseResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleParseJson}
                disabled={!jsonInput.trim()}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs font-medium hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Vérifier
              </button>
              <button
                type="button"
                onClick={handleApplyJson}
                disabled={!parseResult?.ok || !onApplyPreset}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Check className="w-3 h-3" />
                Appliquer au profil
              </button>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">
              Les champs seront pré-remplis dans la configuration. Pensez à vérifier le code INSEE sur{' '}
              <ExtLink href="https://www.insee.fr/fr/information/2560452">insee.fr</ExtLink>{' '}
              avant de sauvegarder — les LLM se trompent souvent dessus.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Small labelled help item used by the ProfileAssistantModal guide tab.
 * Keeps the layout consistent without pulling in a heavier UI kit.
 */
function FieldHelp({ label, example, children }: { label: string; example?: string; children: ReactNode }) {
  return (
    <div className="border-l-2 border-blue-400 pl-2.5 py-0.5">
      <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{label}</p>
      <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{children}</div>
      {example && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 italic mt-0.5">{example}</p>
      )}
    </div>
  );
}
