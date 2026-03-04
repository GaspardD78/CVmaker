// Utility functions for SQLite to TypeScript mappings

export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

const JSON_FIELDS = ['metadata', 'tags', 'settings', 'override_data', 'overrideData'];

export function keysToCamelCase<T>(obj: any): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => keysToCamelCase(item)) as any;
  }

  const result: any = {};
  for (const key of Object.keys(obj)) {
    const camelKey = toCamelCase(key);
    let value = obj[key];

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

export function keysToSnakeCase<T>(obj: any): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => keysToSnakeCase(item)) as any;
  }

  const result: any = {};
  for (const key of Object.keys(obj)) {
    const snakeKey = toSnakeCase(key);
    let value = obj[key];

    // Sérialiser uniquement les champs JSON connus ou si la valeur est un objet
    if ((JSON_FIELDS.includes(key) || JSON_FIELDS.includes(snakeKey)) && typeof value === 'object' && value !== null) {
      value = JSON.stringify(value);
    } else if (typeof value === 'object' && value !== null) {
        // Fallback optionnel si l'utilisateur envoie un objet inattendu (pour éviter [object Object])
        value = JSON.stringify(value);
    }
    result[snakeKey] = value;
  }
  return result as T;
}
