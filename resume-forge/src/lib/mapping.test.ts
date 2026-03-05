import { describe, it, expect } from 'bun:test';
import { keysToSnakeCase, keysToCamelCase } from './mapping';

describe('mapping utilities', () => {
  describe('keysToSnakeCase', () => {
    it('should return null when input is null', () => {
      expect(keysToSnakeCase(null)).toBeNull();
    });

    it('should return undefined when input is undefined', () => {
      expect(keysToSnakeCase(undefined)).toBeUndefined();
    });

    it('should return primitive values unchanged', () => {
      expect(keysToSnakeCase<number>(123)).toBe(123);
      expect(keysToSnakeCase<string>('hello')).toBe('hello');
      expect(keysToSnakeCase<boolean>(true)).toBe(true);
      expect(keysToSnakeCase<boolean>(false)).toBe(false);
    });

    it('should handle arrays of primitives', () => {
      const input = [1, '2', true];
      expect(keysToSnakeCase<any[]>(input)).toEqual(input);
    });

    it('should convert simple object keys to snake_case', () => {
      const input = { firstName: 'John', lastName: 'Doe' };
      const expected = { first_name: 'John', last_name: 'Doe' };
      expect(keysToSnakeCase<any>(input)).toEqual(expected);
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
      expect(keysToSnakeCase<any[]>(input)).toEqual(expected);
    });
  });

  describe('keysToCamelCase', () => {
    it('should return null when input is null', () => {
      expect(keysToCamelCase(null)).toBeNull();
    });

    it('should return undefined when input is undefined', () => {
      expect(keysToCamelCase(undefined)).toBeUndefined();
    });

    it('should return primitive values unchanged', () => {
      expect(keysToCamelCase<number>(123)).toBe(123);
      expect(keysToCamelCase<string>('hello')).toBe('hello');
      expect(keysToCamelCase<boolean>(true)).toBe(true);
    });

    it('should convert snake_case keys to camelCase', () => {
      const input = { first_name: 'John', last_name: 'Doe' };
      const expected = { firstName: 'John', lastName: 'Doe' };
      expect(keysToCamelCase<any>(input)).toEqual(expected);
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

    it('should gracefully handle invalid JSON in known JSON fields', () => {
      const invalidJsonString = '{ invalid json " : 1';
      const input = {
        metadata: invalidJsonString
      };
      const result = keysToCamelCase<any>(input);

      // The catch block in keysToCamelCase should keep the original string
      // when JSON.parse fails
      expect(result.metadata).toBe(invalidJsonString);
    });

    it('should handle nested arrays', () => {
      const input = [{ first_name: 'John' }, { first_name: 'Jane' }];
      const expected = [{ firstName: 'John' }, { firstName: 'Jane' }];
      expect(keysToCamelCase<any[]>(input)).toEqual(expected);
    });
  });
});
