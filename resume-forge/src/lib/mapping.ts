// Fonctions utilitaires pour le mapping SQLite vers TypeScript

export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

const JSON_FIELDS = ['metadata', 'tags', 'settings', 'override_data', 'overrideData', 'match_criteria', 'matchCriteria'];

export function keysToCamelCase<T>(obj: unknown): T {
  if (obj === null || typeof obj !== 'object') {
    return obj as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => keysToCamelCase(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  const objRecord = obj as Record<string, unknown>;

  for (const key of Object.keys(objRecord)) {
    const camelKey = toCamelCase(key);
    let value = objRecord[key];

    // Parser uniquement les champs JSON connus
    if (typeof value === 'string' && (JSON_FIELDS.includes(key) || JSON_FIELDS.includes(camelKey))) {
      try {
        value = JSON.parse(value);
      } catch (e) {
        // En cas d'erreur de parsing, garder la chaîne d'origine
      }
    }
    result[camelKey] = value;
  }
  return result as T;
}

export function keysToSnakeCase<T>(obj: unknown): T {
  if (obj === null || typeof obj !== 'object') {
    return obj as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => keysToSnakeCase(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  const objRecord = obj as Record<string, unknown>;

  for (const key of Object.keys(objRecord)) {
    const snakeKey = toSnakeCase(key);
    let value = objRecord[key];

    // Sérialiser uniquement les champs JSON connus ou si la valeur est un objet
    if ((JSON_FIELDS.includes(key) || JSON_FIELDS.includes(snakeKey)) && typeof value === 'object' && value !== null) {
      value = JSON.stringify(value);
    } else if (typeof value === 'boolean') {
      // SQLite stocke les booléens comme des entiers 0/1.
      // Passer un booléen JS peut être sérialisé en chaîne "true"/"false"
      // par certaines versions de tauri-plugin-sql, ce qui serait lu comme
      // chaîne non-vide (truthy) en retour. On force toujours 0/1.
      value = value ? 1 : 0;
    } else if (typeof value === 'object' && value !== null) {
        // Fallback optionnel si l'utilisateur envoie un objet inattendu (pour éviter [object Object])
        value = JSON.stringify(value);
    }
    result[snakeKey] = value;
  }
  return result as T;
}
