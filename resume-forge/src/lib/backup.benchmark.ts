
/**
 * Benchmark for backup restore insertion (applyRows).
 */

const IPC_LATENCY_MS = 1;

class MockDb {
  public executeCount = 0;

  async execute(query: string, values?: any[]): Promise<void> {
    this.executeCount++;
    // Simulate IPC latency
    await new Promise(resolve => setTimeout(resolve, IPC_LATENCY_MS));
  }
}

async function applyRowsOriginal(
  db: MockDb,
  table: string,
  rows: Record<string, unknown>[],
  strategy: 'replace_insert' | 'merge' | 'ignore',
): Promise<void> {
  if (rows.length === 0) return;

  const keyword = strategy === 'merge' ? 'OR REPLACE' : 'OR IGNORE';
  const columns = Object.keys(rows[0]);
  const colStr = columns.join(', ');

  for (const row of rows) {
    const values = columns.map(c => row[c]);
    const placeholders = columns.map((_, i) => `?${i + 1}`).join(', ');
    await db.execute(`INSERT ${keyword} INTO ${table} (${colStr}) VALUES (${placeholders})`, values);
  }
}

async function applyRowsOptimized(
  db: MockDb,
  table: string,
  rows: Record<string, unknown>[],
  strategy: 'replace_insert' | 'merge' | 'ignore',
): Promise<void> {
  if (rows.length === 0) return;

  const keyword = strategy === 'merge' ? 'OR REPLACE' : 'OR IGNORE';
  const columns = Object.keys(rows[0]);
  const colStr = columns.join(', ');

  const BATCH_SIZE = 30;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const allPlaceholders: string[] = [];
    const allValues: unknown[] = [];

    for (let rowIndex = 0; rowIndex < chunk.length; rowIndex++) {
      const row = chunk[rowIndex];
      const rowPlaceholders = columns.map((_, colIndex) =>
        `?${rowIndex * columns.length + colIndex + 1}`
      ).join(', ');
      allPlaceholders.push(`(${rowPlaceholders})`);

      for (const col of columns) {
        allValues.push(row[col]);
      }
    }

    const query = `INSERT ${keyword} INTO ${table} (${colStr}) VALUES ${allPlaceholders.join(', ')}`;
    await db.execute(query, allValues);
  }
}

async function runBenchmark() {
  const rowCount = 500;
  const table = 'master_entries';
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    id: `id-${i}`,
    profile_id: 'prof-1',
    entry_type: 'experience',
    title: `Title ${i}`,
    subtitle: `Subtitle ${i}`,
    location: 'Paris',
    start_date: '2020-01-01',
    end_date: null,
    is_current: 1,
    description: 'Some description text here...',
    metadata: '{}',
    sort_order: i,
    tags: '[]',
    created_at: '2023-01-01',
    updated_at: '2023-01-01',
  }));

  console.log(`--- Benchmarking applyRows with ${rowCount} rows ---`);

  const dbOriginal = new MockDb();
  const startOriginal = performance.now();
  await applyRowsOriginal(dbOriginal, table, rows, 'merge');
  const endOriginal = performance.now();
  const timeOriginal = endOriginal - startOriginal;

  console.log(`\nOriginal (N+1):`);
  console.log(`  Time: ${timeOriginal.toFixed(2)}ms`);
  console.log(`  Queries: ${dbOriginal.executeCount}`);

  const dbOptimized = new MockDb();
  const startOptimized = performance.now();
  await applyRowsOptimized(dbOptimized, table, rows, 'merge');
  const endOptimized = performance.now();
  const timeOptimized = endOptimized - startOptimized;

  console.log(`\nOptimized (Batched with chunk size 30):`);
  console.log(`  Time: ${timeOptimized.toFixed(2)}ms`);
  console.log(`  Queries: ${dbOptimized.executeCount}`);

  const speedup = (timeOriginal / timeOptimized).toFixed(2);
  console.log(`\nSpeedup: ${speedup}x`);
}

runBenchmark();
