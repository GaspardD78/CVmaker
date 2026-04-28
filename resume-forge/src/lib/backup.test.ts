
import { describe, it, expect, mock } from 'bun:test';

// Mock Tauri plugins before importing backup
mock.module('@tauri-apps/plugin-dialog', () => ({
  save: () => {},
  open: () => {}
}));
mock.module('@tauri-apps/plugin-fs', () => ({
  writeTextFile: () => {},
  readTextFile: () => {}
}));
mock.module('@/lib/db', () => ({
  getDb: () => ({})
}));

// Mock validation
mock.module('./validation', () => ({
  filterAllowedColumns: (table: string, data: any) => data
}));

// Now import applyRows
import { applyRows } from './backup';

describe('applyRows logic', () => {
  it('should construct correct multi-value INSERT queries with chunking', async () => {
    const capturedQueries: string[] = [];
    const capturedValues: any[][] = [];

    const db = {
      execute: async (query: string, values: any[]) => {
        capturedQueries.push(query);
        capturedValues.push(values);
      }
    } as any;

    // Create 40 rows. With BATCH_SIZE = 30, it should result in 2 queries (30 rows + 10 rows)
    const rows = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, name: `User ${i + 1}` }));

    await applyRows(db, 'users', rows, 'merge');

    expect(capturedQueries.length).toBe(2);

    // First query: 30 rows
    expect(capturedQueries[0]).toContain('INSERT OR REPLACE INTO users (id, name) VALUES');
    expect(capturedValues[0].length).toBe(60); // 30 rows * 2 columns
    expect(capturedValues[0][0]).toBe(1);
    expect(capturedValues[0][1]).toBe('User 1');
    expect(capturedValues[0][58]).toBe(30);
    expect(capturedValues[0][59]).toBe('User 30');

    // Second query: 10 rows
    expect(capturedQueries[1]).toContain('INSERT OR REPLACE INTO users (id, name) VALUES');
    expect(capturedValues[1].length).toBe(20); // 10 rows * 2 columns
    expect(capturedValues[1][0]).toBe(31);
    expect(capturedValues[1][1]).toBe('User 31');
    expect(capturedValues[1][18]).toBe(40);
    expect(capturedValues[1][19]).toBe('User 40');
  });

  it('should handle single row', async () => {
    const capturedQueries: string[] = [];
    const capturedValues: any[][] = [];

    const db = {
      execute: async (query: string, values: any[]) => {
        capturedQueries.push(query);
        capturedValues.push(values);
      }
    } as any;

    const rows = [
      { id: 1, name: 'Alice' }
    ];

    await applyRows(db, 'users', rows, 'ignore');

    expect(capturedQueries.length).toBe(1);
    expect(capturedQueries[0]).toBe('INSERT OR IGNORE INTO users (id, name) VALUES (?1, ?2)');
    expect(capturedValues[0]).toEqual([1, 'Alice']);
  });
});
