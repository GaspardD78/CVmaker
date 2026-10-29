/**
 * Contrôles du garde-fou liés au ciblage (avertissements, jamais bloquants). Fonctions pures :
 * `ai-cv-guard.ts` leur fournit le texte effectif du CV. Ils ne touchent jamais à
 * l'anti-invention, qui reste identique quel que soit le ciblage.
 */
import { normalizeLabel } from './cv-sections';
import type { Equivalence, ResolvedTarget } from './cv-targets';

export type TargetGuardCode =
  | 'target-forbidden-term' | 'target-equivalence-applied' | 'target-photo' | 'target-reader-mentioned'
  | 'unsupported-title';

export interface TargetIssue {
  code: TargetGuardCode;
  message: string;
  entryId?: string;
}

/** Un emplacement de texte du CV final. */
export interface TargetTextField {
  where: string;
  text: string;
  entryId?: string;
}

export interface TargetGuardInput {
  target: ResolvedTarget;
  /** Textes du CV final visibles : titre, accroche, entrées (titre, employeur, puces, overrides). */
  fields: readonly TargetTextField[];
  /** Texte propre au candidat (profil maître) : une expression qui s'y trouve n'est pas imputable au ciblage. */
  ownText: string;
  /** La photo est-elle affichée ? */
  photoShown: boolean;
  /** Titres que le candidat a réellement tenus (profil, expériences). */
  heldTitles: readonly string[];
  /** Titre du CV proposé. */
  title?: string;
  /** Expériences dont le titre est surchargé : { id, source, override }. */
  titleOverrides: readonly { entryId: string; source: string; override: string }[];
  /** Le CV est-il rédigé en français ? Les traductions fidèles d'intitulés sont alors hors sujet. */
  french: boolean;
}

const key = (s: string): string => normalizeLabel(s).replace(/[’‘]/g, "'");

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (haystack: string, needle: string): boolean =>
  needle !== '' && new RegExp(`(^|[^a-z0-9])${esc(needle)}($|[^a-z0-9])`).test(haystack);

/** Équivalence de la fiche qui traite le terme évité (le terme est, ou fait partie de, l'expression d'origine). */
export function equivalenceFor(term: string, equivalences: readonly Equivalence[]): Equivalence | undefined {
  const t = key(term);
  return equivalences.find(e => key(e.from) === t) ?? equivalences.find(e => hasWord(key(e.from), t));
}

export function checkTarget(input: TargetGuardInput): TargetIssue[] {
  const { target } = input;
  const issues: TargetIssue[] = [];
  const sheet = target.sheet;

  // ── Termes à éviter pour ce type de structure ──
  if (sheet && sheet.avoidTerms.length > 0) {
    for (const term of sheet.avoidTerms) {
      const t = key(term);
      const where = input.fields.filter(f => hasWord(key(f.text), t));
      if (where.length === 0) continue;
      const eq = equivalenceFor(term, sheet.vocabulaire.equivalences);
      const places = [...new Set(where.map(w => w.where))].slice(0, 4).join(', ');
      issues.push({
        code: 'target-forbidden-term',
        message: `Terme à éviter pour « ${sheet.label} » : « ${term} » (${places}).${eq ? ` Équivalence de la fiche : « ${eq.to} ».` : ''}`,
        entryId: where.find(w => w.entryId)?.entryId,
      });
    }
  }

  // ── Intitulés : seules les équivalences de la fiche sont des traductions acceptées ──
  if (sheet && sheet.vocabulaire.equivalences.length > 0) {
    const eqs = sheet.vocabulaire.equivalences;
    const viaEquivalence = (source: string, candidate: string): Equivalence | undefined => {
      const s = key(source);
      const c = key(candidate);
      return eqs.find(e => key(e.to) === c && (hasWord(s, key(e.from)) || s === key(e.from)));
    };

    if (input.title) {
      const head = key(input.title.split(/\s[-|:]\s/)[0]);
      const held = input.heldTitles.map(key).filter(Boolean);
      if (head && !held.some(h => h.includes(head) || head.includes(h))) {
        const hit = held.map(h => viaEquivalence(h, head)).find((e): e is Equivalence => e !== undefined);
        if (hit) {
          issues.push({ code: 'target-equivalence-applied', message: `Titre « ${input.title} » : équivalence de la fiche appliquée (« ${hit.from} » → « ${hit.to} »).` });
        }
      }
    }

    if (input.french) {
      for (const o of input.titleOverrides) {
        if (key(o.source) === key(o.override)) continue;
        const hit = viaEquivalence(o.source, o.override);
        if (hit) {
          issues.push({
            code: 'target-equivalence-applied',
            message: `Intitulé « ${o.source} » traduit en « ${o.override} » : équivalence de la fiche (« ${hit.from} » → « ${hit.to} »).`,
            entryId: o.entryId,
          });
        } else {
          issues.push({
            code: 'unsupported-title',
            message: `Intitulé « ${o.source} » remplacé par « ${o.override} » : hors des équivalences de la fiche « ${sheet.label} ».`,
            entryId: o.entryId,
          });
        }
      }
    }
  }

  // ── Photo ──
  if (sheet?.affichage.photo === 'non' && input.photoShown) {
    issues.push({ code: 'target-photo', message: `La fiche « ${sheet.label} » déconseille la photo : elle est affichée sur ce CV (à retirer dans le design).` });
  }

  // ── Premier lecteur et personne qui transmet le CV ──
  const reader: { label: string; term: string }[] = [];
  if (target.readerName) reader.push({ label: 'Nom du premier lecteur', term: target.readerName });
  if (target.readerRole) reader.push({ label: 'Fonction du premier lecteur', term: target.readerRole });
  if (target.referrerName) reader.push({ label: 'Personne qui transmet le CV', term: target.referrerName });
  const own = key(input.ownText);
  for (const r of reader) {
    const t = key(r.term);
    // Une expression du profil du candidat lui-même (ex. son propre intitulé de poste) n'est pas une mention du lecteur.
    if (hasWord(own, t)) continue;
    const where = input.fields.filter(f => hasWord(key(f.text), t));
    if (where.length === 0) continue;
    issues.push({
      code: 'target-reader-mentioned',
      message: `${r.label} (« ${r.term} ») apparaît dans le CV (${[...new Set(where.map(w => w.where))].slice(0, 3).join(', ')}) : à retirer.`,
      entryId: where.find(w => w.entryId)?.entryId,
    });
  }

  return issues;
}
