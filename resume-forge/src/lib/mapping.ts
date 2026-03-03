// Utility functions for SQLite to TypeScript mappings

export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

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

    // Auto parse JSON strings coming from SQLite
    if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
      try {
        value = JSON.parse(value);
      } catch (e) {
        // Not a valid JSON string, keep it as is
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

    // Auto stringify object/arrays going into SQLite
    if (typeof value === 'object' && value !== null) {
      value = JSON.stringify(value);
    }
    result[snakeKey] = value;
  }
  return result as T;
}
