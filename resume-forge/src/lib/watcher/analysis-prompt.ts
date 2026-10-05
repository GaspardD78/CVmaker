/**
 * Prompt d'analyse de la Veille (spec 005) : un seul générateur, deux modes.
 *
 * Toute l'information vient de `WatchAnalysisContext` ; ce fichier ne fait que
 * la mettre en texte. Les libellés sont identiques dans les deux modes : seules
 * l'ouverture de la mission et l'accent mis sur les métriques ou sur les offres
 * diffèrent.
 */

import type { AnalysisOffer, Ratio, WatchAnalysisContext } from './analysis-context';
import { EXCLUSION_WARNING } from './engine-rules';
import { NEAR_IDENTICAL_THRESHOLD } from './title-overlap';
import {
  APEC_FONCTIONS_ALL_LABELS, APEC_SALAIRES, APEC_SECTEURS, APEC_TELETRAVAIL,
} from './parsers/apec-ids';

export const WATCH_ANALYSIS_SCHEMA = 'watch-analysis/v1';

export type WatchAnalysisMode = 'performance' | 'diagnostic';

// ── Mise en forme ────────────────────────────────────────────────────────────

const list = (items: string[], empty = 'aucun'): string => (items.length > 0 ? items.join(', ') : empty);
const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);
const pct = (n: number): string => `${Math.round(n * 100)} %`;

function formatRatio(r: Ratio, unit = 'offres'): string {
  if (r.percent === null) return 'non calculable (aucune offre)';
  if (r.denominator === 0) return `${r.percent} % (échantillon non communiqué)`;
  return `${r.percent} % de ${r.denominator} ${unit} (${r.numerator}/${r.denominator})`;
}

function formatOffer(o: AnalysisOffer, index: number): string {
  const score = o.disqualified
    ? `Écartée par le moteur : ${o.disqualified}`
    : `Score ${o.score}${o.storedScore !== null ? ` (affiché dans l'app : ${o.storedScore}, ancienne configuration)` : ''}` +
      ` = ${o.breakdown.map(b => `${b.label} ${signed(b.points)}`).join(', ')}`;
  const facts = [
    o.company ?? 'entreprise non précisée', o.location ?? 'lieu non précisé', o.source,
    o.contract ?? 'contrat non précisé',
    o.salary ?? 'salaire non précisé',
    o.remote ? `télétravail ${o.remote}` : 'télétravail non précisé',
    o.ageDays !== null ? `${o.ageDays} j` : 'âge inconnu',
  ].join(' · ');
  return `${index + 1}. [${score}] ${o.title}\n   ${facts} → ${o.action}` +
    (o.excerpt ? `\n   Extrait : ${o.excerpt}` : '');
}

// ── Sections ─────────────────────────────────────────────────────────────────

function rulesSection(ctx: WatchAnalysisContext): string {
  return `## 1. Comment le moteur de la veille fonctionne (règles exactes)
${ctx.engineRules.map(r => `- ${r}`).join('\n')}

⚠ ${EXCLUSION_WARNING}`;
}

function portfolioSection(ctx: WatchAnalysisContext): string {
  const { others, nearIdentical } = ctx.portfolio;
  if (others.length === 0) {
    return `## 2. Contexte
Cette analyse porte sur la piste « ${ctx.track.name} », seule piste du portefeuille.`;
  }
  const lines = others.map(o =>
    `- ${o.name} : ${list(o.jobTitles, 'aucun intitulé')} (recouvrement d'intitulés : ${pct(o.overlap)})`);
  const flags = nearIdentical.map(o =>
    `⚠ Piste quasi identique à « ${o.name} » (recouvrement ${pct(o.overlap)}, seuil ${pct(NEAR_IDENTICAL_THRESHOLD)}) : ` +
    `les deux pistes ramènent les mêmes offres. Propose de les différencier ou de les fusionner, ` +
    `pas d'ajouter des intitulés communs.`);
  return `## 2. Contexte : une piste parmi ${others.length + 1}
Cette analyse porte sur la piste « ${ctx.track.name} » d'un portefeuille de recherche.
Les autres pistes couvrent :
${lines.join('\n')}
${flags.length > 0 ? `\n${flags.join('\n')}\n` : ''}
N'élargis pas cette piste vers un domaine déjà couvert par une autre : le portefeuille explore
délibérément plusieurs directions, et les faire converger le viderait de son sens.`;
}

function candidateSection(ctx: WatchAnalysisContext): string {
  const c = ctx.candidate;
  const loc = ctx.track.location;
  return `## 3. Profil du candidat
- Titre actuel : ${c.title ?? 'non renseigné'}
- Compétences principales : ${list(c.mainSkills, 'non renseignées')}
- Expérience : ${c.experienceYears !== null ? `environ ${c.experienceYears} ans` : 'non calculable'}
- Localisation recherchée : ${loc ? `${loc.label}, rayon ${loc.radiusKm} km` : 'non renseignée'}${c.city ? ` (domicile : ${c.city})` : ''}
- Contrat recherché : ${list(ctx.track.contractTypes, 'tous')}`;
}

function configSection(ctx: WatchAnalysisContext): string {
  const t = ctx.track;
  const exclusions = t.exclusions.length > 0
    ? t.exclusions.map(e => `${e.term} (${e.scope === 'title' ? 'titre' : 'titre + description'})`).join(', ')
    : 'aucune';
  return `## 4. Configuration actuelle de la piste « ${t.name} »
- Mode de scoring : ${t.scoringMode}
- Intitulés visés : ${list(t.jobTitles)}
- Exclusions (portée) : ${exclusions}
- Mots-clés bonus : ${list(t.skills)}
- Domaines bonus : ${list(t.domains)}
- Domaines obligatoires : ${list(t.requiredDomains)}
- Salaire minimum : ${t.salary.min !== null ? `${t.salary.min} €/an` : 'non défini'}
- Salaire cible : ${t.salary.target !== null ? `${t.salary.target} €/an` : 'non défini'}
- Fonctions APEC : ${list(t.apec.fonctions)}
- Secteurs APEC : ${list(t.apec.secteurs)}
- Télétravail APEC : ${list(t.apec.teletravail)}
- Tranches de salaire APEC : ${list(t.apec.salaires)}${t.isEmpty ? '\n- ⚠ La piste est vide.' : ''}`;
}

function inconsistenciesSection(ctx: WatchAnalysisContext): string {
  const body = ctx.inconsistencies.length > 0
    ? ctx.inconsistencies.map(i => `- [${i.severity}] ${i.message}`).join('\n')
    : 'Aucune incohérence détectée automatiquement.';
  return `## 5. Incohérences détectées par le code (faits, pas des hypothèses)\n${body}`;
}

function metricsSection(ctx: WatchAnalysisContext): string {
  const m = ctx.metrics;
  const d = m.scoreDistribution;
  const lines = [
    `- Période : ${ctx.period.from} → ${ctx.period.to} (${m.periodDays} jours)`,
    `- Offres collectées (dédoublonnées) : ${m.offers} (≈ ${m.perWeek} par semaine)`,
    `- Pertinence, offres ouvertes : ${formatRatio(m.pertinence)}`,
    `- Conversion, offres importées dans le Kanban : ${formatRatio(m.conversion)}`,
    `- Notées (pouce haut/bas) : ${m.rated} · rejetées (pouce bas ou archivage) : ${m.rejected} · importées : ${m.imported}`,
    `- Offres sans aucun tri : ${m.untreated} sur ${m.offers}`,
    `- Répartition des scores recalculés : ${d.high} ≥ 70, ${d.medium} entre 40 et 69, ${d.low} sous 40, ${d.disqualified} écartées par le moteur`,
  ];
  if (m.zeroAction) {
    lines.push(
      m.offers === 0
        ? "- ⚠ Aucune offre sur la période : la piste ne collecte rien."
        : `- ⚠ AUCUNE ACTION sur les ${m.offers} offres : ni pouce, ni archivage, ni import. ` +
          "Il n'existe donc aucun rejet à analyser et le système n'a rien appris de tes goûts. " +
          "Les « patterns de rejet » seraient inventés : ne les devine pas.",
    );
  }
  return `## 6. Métriques\n${lines.join('\n')}`;
}

function learnedSection(ctx: WatchAnalysisContext): string {
  const s = ctx.learned.signals;
  const body = s.length === 0
    ? 'Pas assez de données (aucun terme n\'a atteint 3 points).'
    : s.map(x => `- « ${x.term} » : ${x.sense === 'positive' ? 'apprécié' : 'rejeté'}, compteur ${x.count}` +
        (x.conflict ? ' ⚠ EN CONFLIT avec le profil de la piste (probable artefact)' : '')).join('\n');
  return `## 7. Signaux appris
Ils proviennent des TITRES des offres triées uniquement (mots et paires de mots), sans distinguer rôle et domaine.
Compteur = points cumulés (import Kanban +2, pouce haut +1, pouce bas +1, archivage rapide +2).
${body}`;
}

function offersSection(ctx: WatchAnalysisContext): string {
  const { total, shown, items } = ctx.offers;
  const heading = shown < total
    ? `les ${shown} plus récentes sur ${total}`
    : `${total} offre${total > 1 ? 's' : ''}`;
  return `## 8. Offres (${heading}, dédoublonnées, ${ctx.metrics.periodDays} derniers jours)
Les scores sont recalculés avec la configuration actuelle et décomposés (la somme est bornée entre 0 et 100).
${items.length > 0 ? items.map(formatOffer).join('\n') : 'Aucune offre.'}`;
}

function missionSection(ctx: WatchAnalysisContext, mode: WatchAnalysisMode): string {
  const opening = mode === 'performance'
    ? "Explique pourquoi la pertinence et la conversion sont à ce niveau, puis optimise la configuration."
    : "Lis les offres une à une, repère ce qui n'a pas de sens pour ce candidat, puis corrige la configuration.";
  const noAction = ctx.metrics.zeroAction && ctx.metrics.offers > 0
    ? `\n⚠ Aucune action utilisateur : dis-le explicitement dans le diagnostic, n'invente aucun rejet, et place ` +
      `en PREMIER dans « actions_utilisateur » : « trier les ${ctx.metrics.offers} offres sans action » ` +
      `(pouce haut/bas) pour que le système apprenne. Ne propose de changer la requête que si le problème ` +
      `est visible indépendamment du tri.\n`
    : '';
  return `## Ta mission
${opening}
${noAction}
Distingue explicitement la cause principale parmi quatre :
- **requete** : intitulés trop larges/étroits, exclusions, filtres APEC (fonctions, secteurs, tranches) mal réglés ;
- **scoring** : le score ne reflète pas l'adéquation (salaire ou ancienneté qui dominent, domaine sous-pondéré) ;
- **comportement** : pas de tri, pas d'import, signal appris inexploitable ;
- **marche** : offres rares ou exigences hors profil (anglais, séniorité, lieu, salaire).

Règles :
- Appuie chaque constat sur un fait du contexte (offre, métrique, incohérence) ; ne spécule pas.
- Une exclusion ne se propose que si le terme n'apparaît dans aucune offre pertinente (section 8) ; préfère la retirer d'un veto trop large.
- Ne retire jamais tous les intitulés visés. N'ajoute pas d'intitulé déjà porté par une autre piste.
- Les valeurs APEC doivent reprendre EXACTEMENT les libellés autorisés ci-dessous, sinon elles seront ignorées.
- Si une incohérence de la section 5 est réelle, corrige-la en priorité.`;
}

function outputSection(): string {
  return `## Format de sortie
Réponds par UN SEUL bloc JSON (entre \`\`\`json et \`\`\`), puis exactement 5 lignes de synthèse en français.
N'ajoute que les changements utiles : une liste vide signifie « ne rien changer ».

\`\`\`json
{
  "schema": "${WATCH_ANALYSIS_SCHEMA}",
  "diagnostic": { "cause_principale": "requete|scoring|comportement|marche", "constats": ["..."] },
  "patch": {
    "jobTitles":     { "add": [], "remove": [] },
    "excludeTitles": { "add": [], "remove": [] },
    "skills":        { "add": [], "remove": [] },
    "domains":       { "add": [], "remove": [] },
    "apecFonctions": { "add": [], "remove": [] },
    "apecSalaires":  { "set": [] },
    "apecTeletravail": { "add": [], "remove": [] },
    "salary":        { "min": null, "target": null }
  },
  "learned_to_forget": [],
  "justifications": [{ "change": "...", "raison": "...", "impact_attendu": "..." }],
  "actions_utilisateur": ["trier les N offres sans action", "..."]
}
\`\`\`

Correspondance : « skills » = Mots-clés bonus, « domains » = Domaines bonus, « excludeTitles » = Exclusions.
« learned_to_forget » : termes appris à oublier (section 7, surtout ceux en conflit avec le profil).
« actions_utilisateur » : ce que le candidat doit faire lui-même (trier, importer, élargir le lieu…).

Libellés APEC autorisés :
- apecFonctions : ${APEC_FONCTIONS_ALL_LABELS.join(' ; ')}
- apecSalaires (une ou plusieurs tranches) : ${Object.keys(APEC_SALAIRES).join(' ; ')}
- apecTeletravail : ${Object.keys(APEC_TELETRAVAIL).join(' ; ')}
(Secteurs APEC, non modifiables par ce patch : ${Object.keys(APEC_SECTEURS).join(' ; ')})`;
}

// ── API publique ─────────────────────────────────────────────────────────────

export function generateWatchAnalysisPrompt(ctx: WatchAnalysisContext, mode: WatchAnalysisMode): string {
  return [
    "Tu es un expert en sourcing et en recherche d'emploi cadre. Tu analyses la configuration d'une veille d'emploi " +
      "automatisée et ses résultats, et tu proposes des corrections sûres et applicables.",
    rulesSection(ctx),
    portfolioSection(ctx),
    candidateSection(ctx),
    configSection(ctx),
    inconsistenciesSection(ctx),
    metricsSection(ctx),
    learnedSection(ctx),
    offersSection(ctx),
    missionSection(ctx, mode),
    outputSection(),
  ].join('\n\n') + '\n';
}
