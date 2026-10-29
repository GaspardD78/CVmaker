import { getSetting, setSetting } from './db';
import { parseSheetOverrides, serializeSheetOverrides, type SheetOverrides } from './cv-targets';

/**
 * Réglages typés propres à un profil, dans la table globale `settings` (clé/valeur) :
 * clé `<nom>:<profileId>`. Mécanique commune à `cv_personal_rules`, `cv_bullet_focus`
 * et `cv_verb_tense`.
 */

/** Noms de réglages par profil (préfixes de `settings.key`, sans le `:`), repris par la sauvegarde. */
export const PROFILE_SETTING_NAMES = ['cv_personal_rules', 'cv_bullet_focus', 'cv_target_sheets'] as const;

export function profileSettingKey(name: string, profileId: string): string {
  return `${name}:${profileId}`;
}

export async function loadProfileSetting(name: string, profileId: string): Promise<string | null> {
  return getSetting(profileSettingKey(name, profileId));
}

export async function saveProfileSetting(name: string, profileId: string, value: string): Promise<void> {
  await setSetting(profileSettingKey(name, profileId), value);
}

/** Fiches de ciblage personnalisées du profil (`cv_target_sheets:{profileId}`, seuls les champs modifiés). */
export const TARGET_SHEETS_SETTING = 'cv_target_sheets';

export async function loadTargetSheetOverrides(profileId: string): Promise<SheetOverrides> {
  return parseSheetOverrides(await loadProfileSetting(TARGET_SHEETS_SETTING, profileId));
}

export async function saveTargetSheetOverrides(profileId: string, overrides: SheetOverrides): Promise<void> {
  await saveProfileSetting(TARGET_SHEETS_SETTING, profileId, serializeSheetOverrides(overrides));
}
