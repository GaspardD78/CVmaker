import { describe, it, expect } from 'bun:test';
import { keysToSnakeCase, keysToCamelCase } from './mapping';

describe('mapping utilities', () => {
  describe('keysToSnakeCase', () => {
    it('should return null when input is null', () => {
      expect(keysToSnakeCase(null)).toBe(null);
    });

    it('should return undefined when input is undefined', () => {
      expect(keysToSnakeCase(undefined)).toBe(undefined);
    });

    it('should return primitive values unchanged', () => {
      expect(keysToSnakeCase(123)).toBe(123);
      expect(keysToSnakeCase('hello')).toBe('hello');
      expect(keysToSnakeCase(true)).toBe(true);
      expect(keysToSnakeCase(false)).toBe(false);
    });

    it('should handle arrays of primitives', () => {
      const input = [1, '2', true];
      expect(keysToSnakeCase(input)).toEqual(input);
    });

    it('should convert simple object keys to snake_case', () => {
      const input = { firstName: 'John', lastName: 'Doe' };
      const expected = { first_name: 'John', last_name: 'Doe' };
      expect(keysToSnakeCase(input)).toEqual(expected);
    });

    it('should recursively convert nested objects and stringify them (current behavior)', () => {
      const input = { userProfile: { firstName: 'John' } };
      // Note: current implementation stringifies nested objects when converting to snake case for SQLite
      const result = keysToSnakeCase<any>(input);
      expect(result.user_profile).toBe(JSON.stringify({ firstName: 'John' }));
    });

    it('should handle arrays of objects', () => {
      const input = [{ firstName: 'John' }, { firstName: 'Jane' }];
      const expected = [{ first_name: 'John' }, { first_name: 'Jane' }];
      expect(keysToSnakeCase(input)).toEqual(expected);
    });
  });

  describe('keysToCamelCase', () => {
    it('should return null when input is null', () => {
      expect(keysToCamelCase(null)).toBe(null);
    });

    it('should return undefined when input is undefined', () => {
      expect(keysToCamelCase(undefined)).toBe(undefined);
    });

    it('should return primitive values unchanged', () => {
      expect(keysToCamelCase(123)).toBe(123);
      expect(keysToCamelCase('hello')).toBe('hello');
      expect(keysToCamelCase(true)).toBe(true);
    });

    it('should convert snake_case keys to camelCase', () => {
      const input = { first_name: 'John', last_name: 'Doe' };
      const expected = { firstName: 'John', lastName: 'Doe' };
      expect(keysToCamelCase(input)).toEqual(expected);
    });

    it('should parse known JSON fields', () => {
      const input = {
        metadata: JSON.stringify({ color: 'blue' }),
        other_field: 'regular string'
      };
      const result = keysToCamelCase<any>(input);
      expect(result.metadata).toEqual({ color: 'blue' });
      expect(result.otherField).toBe('regular string');
    });

    it('should handle nested arrays', () => {
      const input = [{ first_name: 'John' }, { first_name: 'Jane' }];
      const expected = [{ firstName: 'John' }, { firstName: 'Jane' }];
      expect(keysToCamelCase(input)).toEqual(expected);
    });
  });
});
