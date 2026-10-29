import { getSetting, setSetting } from './db';

/**
 * Réglages typés propres à un profil, dans la table globale `settings` (clé/valeur) :
 * clé `<nom>:<profileId>`. Mécanique commune à `cv_personal_rules`, `cv_bullet_focus`
 * et `cv_verb_tense`.
 */

/** Noms de réglages par profil (préfixes de `settings.key`, sans le `:`), repris par la sauvegarde. */
export const PROFILE_SETTING_NAMES = ['cv_personal_rules', 'cv_bullet_focus'] as const;

export function profileSettingKey(name: string, profileId: string): string {
  return `${name}:${profileId}`;
}

export async function loadProfileSetting(name: string, profileId: string): Promise<string | null> {
  return getSetting(profileSettingKey(name, profileId));
}

export async function saveProfileSetting(name: string, profileId: string, value: string): Promise<void> {
  await setSetting(profileSettingKey(name, profileId), value);
}
