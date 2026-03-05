const NUM_BLOCKS = 100;

class MockDb {
  public executeCount = 0;
  public selectCount = 0;

  async execute(query: string, params?: any[]) {
    this.executeCount++;
    // Simulate IPC latency
    await new Promise(r => setTimeout(r, 1));
  }

  async select(query: string, params?: any[]) {
    this.selectCount++;
    await new Promise(r => setTimeout(r, 1));
    if (query.includes('FROM cv_blocks')) {
      return Array.from({ length: NUM_BLOCKS }).map((_, i) => ({
        id: `old-block-${i}`,
        cv_id: params?.[0],
        entry_id: `entry-${i}`,
        block_type: 'experience',
        section_name: 'Exp',
        custom_content: null,
        sort_order: i,
        is_visible: 1,
        override_data: '{}'
      }));
    }
    return [{ id: 'new-cv-id' }];
  }
}

async function runNPlusOne(db: MockDb, id: string, newCvId: string) {
  const rawBlocks = await db.select('SELECT * FROM cv_blocks WHERE cv_id = $1', [id]);
  for (const block of rawBlocks) {
    const blockToInsert: any = { ...block, id: undefined, cv_id: newCvId, created_at: undefined };
    // Simplified insertion logic
    await db.execute(`INSERT INTO cv_blocks (...) VALUES (...)`, []);
  }
}

async function runInsertSelect(db: MockDb, id: string, newCvId: string) {
  await db.execute(
    `INSERT INTO cv_blocks (...) SELECT ... FROM cv_blocks WHERE cv_id = $2`,
    [newCvId, id]
  );
}

async function main() {
  console.log('--- Benchmarking N+1 Query vs INSERT SELECT ---');

  const db1 = new MockDb();
  const start1 = performance.now();
  await runNPlusOne(db1, 'old-cv-id', 'new-cv-id');
  const end1 = performance.now();
  console.log(`N+1 approach took: ${(end1 - start1).toFixed(2)}ms (Queries: ${db1.selectCount + db1.executeCount})`);

  const db2 = new MockDb();
  const start2 = performance.now();
  await runInsertSelect(db2, 'old-cv-id', 'new-cv-id');
  const end2 = performance.now();
  console.log(`INSERT SELECT approach took: ${(end2 - start2).toFixed(2)}ms (Queries: ${db2.selectCount + db2.executeCount})`);
}

main();
