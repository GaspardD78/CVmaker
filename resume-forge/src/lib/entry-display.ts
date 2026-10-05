/**
 * Titre d'affichage d'une entrée. Les titres de la bibliothèque peuvent porter
 * l'employeur entre parenthèses pour rester uniques (l'import retrouve une
 * entrée par `entryType` + `title`) : « Recruteur (Société) » sous l'employeur
 * « Société » s'afficherait en double. `displayTitle` retire ce suffixe à
 * l'affichage seulement ; le `title` brut reste la clé de rapprochement.
 */
import { normalizeLabel } from './cv-sections';

const TRAILING_PAREN = /^(.*\S)\s*\(([^()]+)\)\s*$/;

/**
 * Retire le suffixe « (X) » de `title` quand X désigne l'employeur : X et le
 * sous-titre, normalisés (`normalizeLabel`), sont égaux ou l'un contient
 * l'autre. Sinon le titre est rendu tel quel (« Mission (Phase 2) »).
 */
export function displayTitle(title: string, subtitle: string | null | undefined): string {
  const match = TRAILING_PAREN.exec(title);
  const sub = normalizeLabel(subtitle ?? '');
  if (!match || !sub) return title;
  const inner = normalizeLabel(match[2]);
  if (!inner) return title;
  return inner === sub || sub.includes(inner) || inner.includes(sub) ? match[1].trim() : title;
}

/**
 * Titre affiché d'une entrée sur un CV : une surcharge de titre du bloc
 * (`overrideData.title`) prime et s'affiche telle quelle ; sinon le titre de la
 * bibliothèque, sans l'employeur en double (sous-titre effectif, surcharge comprise).
 */
export function entryDisplayTitle(
  entry: { title: string; subtitle: string | null },
  overrideData?: Record<string, unknown> | null,
): string {
  const titleOverride = overrideData?.title;
  if (typeof titleOverride === 'string' && titleOverride.trim()) return titleOverride;
  const subtitle = typeof overrideData?.subtitle === 'string' ? overrideData.subtitle : entry.subtitle;
  return displayTitle(entry.title, subtitle);
}
