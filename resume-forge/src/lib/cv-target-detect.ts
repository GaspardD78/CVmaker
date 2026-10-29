/**
 * Détection automatique du ciblage, côté application et avant le prompt : heuristiques
 * simples sur le texte de l'annonce et le nom de l'entreprise, sans IA. Un axe incertain
 * n'est pas détecté (il reste à `auto`, l'IA pourra le proposer via `analyse.cible`).
 */
import { isPublicSectorText } from './watcher/public-sector';
import type { DetectedTarget, TargetType } from './cv-targets';

const CABINET_RE = new RegExp([
  'cabinet de recrutement', 'cabinet de chasse', 'chasseu[rs]e? de t[êe]tes?', 'chasse de t[êe]tes?', 'executive search',
  'search & selection', 'agence d.int[ée]rim', 'travail temporaire', 'int[ée]rim\\b', 'cabinet RH', 'cabinet de conseil en recrutement',
  'approche directe', 'mandats? de recrutement', 'recrutement pour le compte de nos clients', 'pour le compte de nos clients',
].join('|'), 'i');

const ESN_RE = new RegExp([
  '\\bESN\\b', '\\bSSII\\b', '\\bSS2I\\b', 'soci[ée]t[ée] de conseil', 'cabinet de conseil(?! en recrutement)',
  'conseil en ing[ée]nierie', 'services? num[ée]riques?', 'soci[ée]t[ée] de services', 'intercontrat', '\\bTJM\\b',
  'missions? chez nos clients', 'staffing', 'consultants? (?:en|chez)', 'prestations? de services? informatiques?',
].join('|'), 'i');

/** « administration système/réseau » est de l'informatique, pas le secteur public. */
const IT_ADMINISTRATION_RE = /administrat(?:eur|rice|ion)s?\s+(?:syst[èe]mes?|r[ée]seaux?|de bases?|s[ée]curit[ée]|windows|linux|it|informatique)/gi;

function count(re: RegExp, text: string): number {
  return (text.match(new RegExp(re.source, 'gi')) ?? []).length;
}

/** Type de structure détecté, ou `undefined` si aucun signal net (ou signaux contradictoires). */
export function detectTargetType(jobOfferText: string, company?: string | null): TargetType | undefined {
  const text = `${company ?? ''}\n${jobOfferText}`;
  if (isPublicSectorText(company ?? '', jobOfferText.replace(IT_ADMINISTRATION_RE, ' '))) return 'public';
  const cabinet = count(CABINET_RE, text);
  const esn = count(ESN_RE, text);
  if (cabinet === 0 && esn === 0) return undefined;
  if (cabinet === esn) return undefined;
  return cabinet > esn ? 'cabinet' : 'esn';
}

/** Axes détectés par l'application : type de structure, et `annonce` quand un texte d'annonce est fourni. */
export function detectTarget(input: { jobOfferText: string; company?: string | null }): DetectedTarget {
  const detected: DetectedTarget = {};
  const type = detectTargetType(input.jobOfferText, input.company);
  if (type) detected.type = type;
  if (input.jobOfferText.trim()) detected.intent = 'annonce';
  return detected;
}
