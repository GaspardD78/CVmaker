/**
 * Modales d'aide à la configuration du module Veille Emploi.
 * Destinées aux utilisateurs non techniques : étapes numérotées,
 * liens cliquables, boutons copier-coller.
 */

import { useState, type ReactNode } from 'react';
import { X, Copy, Check, ExternalLink, HelpCircle } from 'lucide-react';

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
    <Modal title="🚇 Configurer le calcul de trajet (Navitia)" onClose={onClose}>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Navitia calcule automatiquement le temps de trajet en transports en commun
        vers chaque offre. C'est gratuit jusqu'à 3 000 requêtes/jour.
      </p>

      <div className="space-y-3">
        <Step n={1}>
          Allez sur : <ExtLink href="https://navitia.io/navitia-api/">navitia.io</ExtLink>
          <br />
          Cliquez sur <strong>« Get your free API key »</strong>.
        </Step>

        <Step n={2}>
          Remplissez le formulaire d'inscription (prénom, e-mail, mot de passe).
          Confirmez votre e-mail si demandé.
        </Step>

        <Step n={3}>
          Une fois connecté, votre <strong>clé API</strong> s'affiche sur votre tableau de bord.
          Elle ressemble à :<br />
          <CopyButton text="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          <br />
          <span className="text-gray-500 text-xs">Copiez-la et collez-la dans le champ « Clé API Navitia ».</span>
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
        Le calcul de trajet ne fonctionne que pour les offres en Île-de-France (couverture Navitia standard).
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
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">APEC · HelloWork · Welcome to the Jungle</h4>
          <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <p>Ces sources sont automatiques. Renseignez simplement :</p>
            <ul className="space-y-1 ml-3 list-disc text-sm">
              <li>
                <strong>Mots-clés</strong> : séparés par des virgules.{' '}
                <span className="text-gray-500 text-xs">ex : recruteur, talent acquisition, RH</span>
              </li>
              <li>
                <strong>Localisation</strong> : ville ou région.{' '}
                <span className="text-gray-500 text-xs">ex : Paris, Lyon, Bordeaux</span>
              </li>
              <li>
                <strong>Rayon</strong> : distance en km autour de la localisation.{' '}
                <span className="text-gray-500 text-xs">ex : 30 km</span>
              </li>
            </ul>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">France Travail</h4>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Nécessite une clé API. Cliquez sur{' '}
            <span className="font-medium text-blue-600 dark:text-blue-400">« Comment faire ? »</span>{' '}
            dans la section France Travail pour les instructions détaillées.
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Le <strong>code commune INSEE</strong> (ex : 75056 pour Paris) permet de filtrer
            par ville précise. Le <strong>département</strong> (ex : 75, 92) élargit la recherche.
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
      </div>

      <Note>
        Commencez par activer 1 ou 2 sources seulement. Vous pourrez en ajouter d'autres une fois
        que la collecte fonctionne.
      </Note>
    </Modal>
  );
}
