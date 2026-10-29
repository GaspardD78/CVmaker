import { normalizeLabel } from './cv-sections';
import type { Profile } from '@/types/profile';
import type { AiCvHeader } from './ai-cv-response';

/** Réglages d'en-tête d'un CV (`cv.settings`) : tous optionnels, valeur absente = comportement par défaut. */
export interface HeaderSettings {
  /** Affiche le permis du profil (défaut : oui s'il est renseigné). */
  showDrivingLicense?: boolean;
  /** Mentions du profil masquées pour ce CV. */
  hiddenHeaderExtras?: string[];
}

const key = (s: string): string => normalizeLabel(s).replace(/[’‘]/g, "'");

/** Mentions libres d'une valeur lue en base (tableau, JSON texte ou rien) : chaînes non vides, sans doublon. */
export function parseHeaderExtras(raw: unknown): string[] {
  let value: unknown = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const text = item.trim();
    if (text && !seen.has(key(text))) { seen.add(key(text)); out.push(text); }
  }
  return out;
}

/** Valeur à écrire en base pour `profiles.header_extras` (JSON, `null` si vide). */
export function serializeHeaderExtras(extras: readonly string[]): string | null {
  const clean = parseHeaderExtras(extras);
  return clean.length ? JSON.stringify(clean) : null;
}

/** Mentions de `candidates` qui existent dans le profil, avec le libellé exact du profil (anti-invention). */
export function matchProfileExtras(candidates: readonly string[], profileExtras: readonly string[]): string[] {
  const byKey = new Map(profileExtras.map(e => [key(e), e] as const));
  const out: string[] = [];
  for (const c of candidates) {
    const original = byKey.get(key(c));
    if (original !== undefined && !out.includes(original)) out.push(original);
  }
  return out;
}

export function readHeaderSettings(settings: Record<string, unknown> | null | undefined): HeaderSettings {
  const s = settings ?? {};
  return {
    showDrivingLicense: typeof s.showDrivingLicense === 'boolean' ? s.showDrivingLicense : undefined,
    hiddenHeaderExtras: Array.isArray(s.hiddenHeaderExtras)
      ? s.hiddenHeaderExtras.filter((v): v is string => typeof v === 'string')
      : undefined,
  };
}

/**
 * Profil tel qu'il s'affiche dans l'en-tête de CE CV : permis et mentions filtrés
 * par les réglages du CV. Le profil maître n'est pas modifié (copie).
 */
export function profileForHeader(profile: Profile, settings: Record<string, unknown> | null | undefined): Profile {
  const { showDrivingLicense, hiddenHeaderExtras } = readHeaderSettings(settings);
  const hidden = new Set((hiddenHeaderExtras ?? []).map(key));
  const license = profile.drivingLicense?.trim() || null;
  return {
    ...profile,
    drivingLicense: showDrivingLicense === false ? null : license,
    headerExtras: parseHeaderExtras(profile.headerExtras).filter(e => !hidden.has(key(e))),
  };
}

/**
 * Réglages `cv.settings` déduits du champ `header` de l'IA : `extras` liste les mentions à
 * afficher, toutes les autres mentions du profil sont masquées. Patch vide sans `header`.
 */
export function headerSettingsPatch(
  header: AiCvHeader,
  profile: Pick<Profile, 'drivingLicense' | 'headerExtras'> | null | undefined,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (header.showDrivingLicense !== undefined) patch.showDrivingLicense = header.showDrivingLicense;
  if (header.extras) {
    const wanted = new Set(header.extras.map(key));
    patch.hiddenHeaderExtras = parseHeaderExtras(profile?.headerExtras).filter(e => !wanted.has(key(e)));
  }
  return patch;
}
