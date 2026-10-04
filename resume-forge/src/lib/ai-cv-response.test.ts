import { describe, it, expect } from 'bun:test';
import {
  parseAiCvResponse,
  aiEntryToOverrideData,
  planCvBlockOrder,
  type OrderableBlock,
} from './ai-cv-response';

describe('parseAiCvResponse', () => {
  it('parses the legacy schema (no overrides, no suggestions) unchanged', () => {
    const raw = JSON.stringify({
      title: 'Dev',
      summary: 'Accroche',
      entries: [
        { id: 'a', visible: true, description: '• x' },
        { id: 'b', visible: false },
      ],
    });
    const result = parseAiCvResponse(raw);
    expect(result.title).toBe('Dev');
    expect(result.summary).toBe('Accroche');
    expect(result.entries).toEqual([
      { id: 'a', visible: true, description: '• x' },
      { id: 'b', visible: false },
    ]);
    expect(result.suggestedEntries).toEqual([]);
  });

  it('strips markdown code fences before parsing', () => {
    const raw = '```json\n{"entries":[{"id":"a","visible":true}]}\n```';
    const result = parseAiCvResponse(raw);
    expect(result.entries).toEqual([{ id: 'a', visible: true }]);
  });

  it('defaults visible to true and only hides on explicit false', () => {
    const raw = JSON.stringify({ entries: [{ id: 'a' }, { id: 'b', visible: false }] });
    const result = parseAiCvResponse(raw);
    expect(result.entries[0].visible).toBe(true);
    expect(result.entries[1].visible).toBe(false);
  });

  it('parses display overrides and keeps multiline descriptions', () => {
    const raw = JSON.stringify({
      entries: [
        {
          id: 'a',
          visible: true,
          description: '• line 1\n• line 2',
          titleOverride: 'Chargé de recrutement',
          companyOverride: 'ACME',
          datesOverride: '2021 - 2023',
        },
      ],
    });
    const [entry] = parseAiCvResponse(raw).entries;
    expect(entry.description).toBe('• line 1\n• line 2');
    expect(entry.titleOverride).toBe('Chargé de recrutement');
    expect(entry.companyOverride).toBe('ACME');
    expect(entry.datesOverride).toBe('2021 - 2023');
  });

  it('drops malformed / empty override fields (clean fallback)', () => {
    const raw = JSON.stringify({
      entries: [
        { id: 'a', visible: true, titleOverride: '   ', companyOverride: 42, datesOverride: null },
      ],
    });
    const [entry] = parseAiCvResponse(raw).entries;
    expect(entry.titleOverride).toBeUndefined();
    expect(entry.companyOverride).toBeUndefined();
    expect(entry.datesOverride).toBeUndefined();
  });

  it('drops entries without a usable id', () => {
    const raw = JSON.stringify({
      entries: [{ id: '', visible: true }, { visible: true }, { id: 'ok', visible: true }, null, 'bad'],
    });
    const result = parseAiCvResponse(raw);
    expect(result.entries).toEqual([{ id: 'ok', visible: true }]);
  });

  it('returns empty arrays when entries / suggestedEntries are missing or not arrays', () => {
    expect(parseAiCvResponse('{}').entries).toEqual([]);
    expect(parseAiCvResponse('{}').suggestedEntries).toEqual([]);
    expect(parseAiCvResponse('{"entries":"nope"}').entries).toEqual([]);
  });

  it('validates suggestedEntries and filters invalid ones', () => {
    const raw = JSON.stringify({
      suggestedEntries: [
        { entryType: 'experience', title: 'Lead', subtitle: 'ACME', isCurrent: true, reason: 'pertinent' },
        { entryType: 'not-a-type', title: 'X' }, // invalid type → dropped
        { entryType: 'skill' }, // missing title → dropped
        { title: 'no type' }, // missing type → dropped
      ],
    });
    const result = parseAiCvResponse(raw);
    expect(result.suggestedEntries).toEqual([
      { entryType: 'experience', title: 'Lead', subtitle: 'ACME', isCurrent: true, reason: 'pertinent' },
    ]);
  });

  it('keeps isCurrent only when it is a real boolean', () => {
    const raw = JSON.stringify({
      suggestedEntries: [{ entryType: 'experience', title: 'A', isCurrent: 'true' }],
    });
    expect(parseAiCvResponse(raw).suggestedEntries[0].isCurrent).toBeUndefined();
  });

  it('throws on non-JSON input', () => {
    expect(() => parseAiCvResponse('not json at all')).toThrow();
  });

  it('throws when the root is not an object', () => {
    expect(() => parseAiCvResponse('[1,2,3]')).toThrow();
    expect(() => parseAiCvResponse('"a string"')).toThrow();
  });
});

describe('aiEntryToOverrideData', () => {
  it('maps display overrides onto the generic merge keys', () => {
    const patch = aiEntryToOverrideData(
      {
        id: 'a',
        visible: true,
        description: '• new',
        titleOverride: 'New Title',
        companyOverride: 'New Co',
        datesOverride: '2020 - 2022',
      },
      {},
    );
    expect(patch).toEqual({
      description: '• new',
      title: 'New Title',
      subtitle: 'New Co',
      datesOverride: '2020 - 2022',
    });
  });

  it('merges over existing overrides without clobbering unrelated keys', () => {
    const patch = aiEntryToOverrideData(
      { id: 'a', visible: true, titleOverride: 'T' },
      { displayFormat: 'badges', subtitle: 'keep-me' },
    );
    expect(patch.displayFormat).toBe('badges');
    expect(patch.subtitle).toBe('keep-me'); // companyOverride absent → not touched
    expect(patch.title).toBe('T');
  });

  it('does not add keys for absent overrides (backward compatible)', () => {
    const patch = aiEntryToOverrideData({ id: 'a', visible: true }, undefined);
    expect(patch).toEqual({});
  });

  it('applies only the description when it is the only field (legacy behaviour)', () => {
    const patch = aiEntryToOverrideData({ id: 'a', visible: true, description: '• d' }, { title: 'old' });
    expect(patch).toEqual({ title: 'old', description: '• d' });
  });

  it('maps subtitleOverride onto subtitle and wins over companyOverride', () => {
    const patch = aiEntryToOverrideData(
      { id: 'a', visible: true, companyOverride: 'Co', subtitleOverride: 'Courant - C1' },
      {},
    );
    expect(patch.subtitle).toBe('Courant - C1');
  });
});

describe('parseAiCvResponse — restructuration fields', () => {
  it('parses entryOrder, sectionOrder and skillGroups', () => {
    const raw = JSON.stringify({
      entries: [{ id: 'a', visible: true }],
      entryOrder: ['b', 'a', '  ', 'b'],
      sectionOrder: ['Compétences', 'Formations'],
      skillGroups: [
        { category: 'Langages', entryIds: ['s1', 's2'] },
        { category: 'Outils', entryIds: ['s3'] },
      ],
    });
    const result = parseAiCvResponse(raw);
    expect(result.entryOrder).toEqual(['b', 'a']); // trimmed empty + dedup dropped
    expect(result.sectionOrder).toEqual(['Compétences', 'Formations']);
    expect(result.skillGroups).toEqual([
      { category: 'Langages', entryIds: ['s1', 's2'] },
      { category: 'Outils', entryIds: ['s3'] },
    ]);
  });

  it('drops skill groups without a category or without entry IDs', () => {
    const raw = JSON.stringify({
      entries: [],
      skillGroups: [
        { category: 'Valide', entryIds: ['s1'] },
        { category: '  ', entryIds: ['s2'] }, // empty category → dropped
        { category: 'Vide', entryIds: [] }, // no IDs → dropped
        { entryIds: ['s3'] }, // no category → dropped
      ],
    });
    expect(parseAiCvResponse(raw).skillGroups).toEqual([{ category: 'Valide', entryIds: ['s1'] }]);
  });

  it('leaves restructuration fields undefined when absent or empty', () => {
    const result = parseAiCvResponse('{"entries":[]}');
    expect(result.entryOrder).toBeUndefined();
    expect(result.sectionOrder).toBeUndefined();
    expect(result.skillGroups).toBeUndefined();
    expect(parseAiCvResponse('{"entries":[],"entryOrder":[]}').entryOrder).toBeUndefined();
  });
});

describe('planCvBlockOrder', () => {
  // Helper to build a simple CV layout: two sections each with entries.
  const block = (
    id: string,
    blockType: OrderableBlock['blockType'],
    extra: Partial<OrderableBlock> = {},
  ): OrderableBlock => ({ id, blockType, sectionName: null, entryId: null, ...extra });

  it('returns the same flat order when no directives are given', () => {
    const blocks: OrderableBlock[] = [
      block('h1', 'section_header', { sectionName: 'Expériences Professionnelles' }),
      block('e1', 'entry_ref', { entryId: 'exp1' }),
      block('e2', 'entry_ref', { entryId: 'exp2' }),
    ];
    expect(planCvBlockOrder(blocks, {})).toEqual(['h1', 'e1', 'e2']);
  });

  it('reorders entries within their section, ranked first then originals', () => {
    const blocks: OrderableBlock[] = [
      block('h1', 'section_header', { sectionName: 'Compétences' }),
      block('a', 'entry_ref', { entryId: 's1' }),
      block('b', 'entry_ref', { entryId: 's2' }),
      block('c', 'entry_ref', { entryId: 's3' }),
    ];
    expect(planCvBlockOrder(blocks, { entryOrder: ['s3', 's1'] })).toEqual(['h1', 'c', 'a', 'b']);
  });

  it('reorders sections by label (case/space-insensitive), unranked last', () => {
    const blocks: OrderableBlock[] = [
      block('h1', 'section_header', { sectionName: 'Expériences Professionnelles' }),
      block('e1', 'entry_ref', { entryId: 'exp1' }),
      block('h2', 'section_header', { sectionName: 'Compétences' }),
      block('s1', 'entry_ref', { entryId: 'sk1' }),
      block('h3', 'section_header', { sectionName: 'Langues' }),
      block('l1', 'entry_ref', { entryId: 'la1' }),
    ];
    const order = planCvBlockOrder(blocks, { sectionOrder: ['compétences', 'EXPÉRIENCES PROFESSIONNELLES'] });
    expect(order).toEqual(['h2', 's1', 'h1', 'e1', 'h3', 'l1']);
  });

  const sub = (id: string, name: string): OrderableBlock =>
    block(id, 'section_header', { sectionName: name, overrideData: { level: 'sub' } });

  it('regroups skills under sub-headers, keeping the skills header (all groups are sub-headers)', () => {
    const blocks: OrderableBlock[] = [
      block('skH', 'section_header', { sectionName: 'Compétences' }),
      block('a', 'entry_ref', { entryId: 's1' }),
      block('b', 'entry_ref', { entryId: 's2' }),
      block('c', 'entry_ref', { entryId: 's3' }),
      // Newly created sub-headers, appended at the tail before reordering:
      sub('g1', 'Langages'),
      sub('g2', 'Outils'),
    ];
    const order = planCvBlockOrder(blocks, {
      skillsHeaderId: 'skH',
      skillGroups: [
        { headerBlockId: 'g1', entryIds: ['s2'] },
        { headerBlockId: 'g2', entryIds: ['s3'] },
      ],
    });
    // Ungrouped s1 stays first (no label), then each group under its sub-header.
    expect(order).toEqual(['skH', 'a', 'g1', 'b', 'g2', 'c']);
  });

  it('pulls group sub-headers out of another section', () => {
    const blocks: OrderableBlock[] = [
      block('skH', 'section_header', { sectionName: 'Compétences' }),
      block('a', 'entry_ref', { entryId: 's1' }),
      block('b', 'entry_ref', { entryId: 's2' }),
      block('lH', 'section_header', { sectionName: 'Langues' }),
      block('l', 'entry_ref', { entryId: 'l1' }),
      sub('g1', 'A'),
      sub('g2', 'B'),
    ];
    const order = planCvBlockOrder(blocks, {
      skillsHeaderId: 'skH',
      skillGroups: [{ headerBlockId: 'g1', entryIds: ['s1'] }, { headerBlockId: 'g2', entryIds: ['s2'] }],
    });
    expect(order).toEqual(['skH', 'g1', 'a', 'g2', 'b', 'lH', 'l']);
  });

  it('keeps entryOrder within each sub-header segment', () => {
    const blocks: OrderableBlock[] = [
      block('skH', 'section_header', { sectionName: 'Compétences' }),
      sub('g1', 'A'),
      block('a', 'entry_ref', { entryId: 's1' }),
      block('b', 'entry_ref', { entryId: 's2' }),
      sub('g2', 'B'),
      block('c', 'entry_ref', { entryId: 's3' }),
      block('d', 'entry_ref', { entryId: 's4' }),
    ];
    expect(planCvBlockOrder(blocks, { entryOrder: ['s2', 's4'] })).toEqual(['skH', 'g1', 'b', 'a', 'g2', 'd', 'c']);
  });

  it('matches sectionOrder on the target label and the internal key (accent-insensitive)', () => {
    const blocks: OrderableBlock[] = [
      block('h1', 'section_header', { sectionName: 'Expériences Professionnelles' }),
      block('e1', 'entry_ref', { entryId: 'x' }),
      block('h2', 'section_header', { sectionName: 'Skills', overrideData: { sectionKey: 'Compétences' } }),
      block('s1', 'entry_ref', { entryId: 'sk' }),
      block('h3', 'section_header', { sectionName: 'Langues' }),
      block('l1', 'entry_ref', { entryId: 'la' }),
    ];
    // « competences » (clé interne, sans accent) et « Languages » (libellé cible).
    const order = planCvBlockOrder(blocks, {
      sectionOrder: ['Languages', 'competences'],
      sectionLabels: { Langues: 'Languages' },
    });
    expect(order).toEqual(['h3', 'l1', 'h2', 's1', 'h1', 'e1']);
  });

  it('never drops a block, even a stale sub-header', () => {
    const blocks: OrderableBlock[] = [
      block('skH', 'section_header', { sectionName: 'Compétences' }),
      block('a', 'entry_ref', { entryId: 's1' }),
      sub('stale', 'Ancienne catégorie'),
      sub('g1', 'Nouvelle'),
    ];
    const order = planCvBlockOrder(blocks, {
      skillsHeaderId: 'skH',
      skillGroups: [{ headerBlockId: 'g1', entryIds: ['s1'] }],
    });
    expect([...order].sort()).toEqual(['a', 'g1', 'skH', 'stale']);
    expect(order).toEqual(['skH', 'g1', 'a', 'stale']);
  });

  it('property: every input ID appears exactly once on random layouts', () => {
    let seed = 42;
    const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
    for (let round = 0; round < 200; round++) {
      const blocks: OrderableBlock[] = [];
      const entryIds: string[] = [];
      const n = 1 + Math.floor(rand() * 25);
      for (let i = 0; i < n; i++) {
        const kind = rand();
        if (kind < 0.2) blocks.push(block(`h${i}`, 'section_header', { sectionName: pick(['Compétences', 'Langues', 'Formations', 'Skills']) }));
        else if (kind < 0.3) blocks.push(sub(`sub${i}`, `Cat ${i}`));
        else if (kind < 0.35) blocks.push(block(`t${i}`, 'custom_text'));
        else { blocks.push(block(`b${i}`, 'entry_ref', { entryId: `e${i}` })); entryIds.push(`e${i}`); }
      }
      const headers = blocks.filter(b => b.blockType === 'section_header');
      const subs = blocks.filter(b => b.overrideData?.level === 'sub');
      const skillsHeader = headers.find(h => h.overrideData?.level !== 'sub');
      const order = planCvBlockOrder(blocks, {
        entryOrder: rand() < 0.5 ? [...entryIds].sort(() => rand() - 0.5).slice(0, 5) : undefined,
        sectionOrder: rand() < 0.5 ? ['Langues', 'compétences'] : undefined,
        skillsHeaderId: skillsHeader?.id,
        skillGroups: subs.slice(0, 3).map(s => ({ headerBlockId: s.id, entryIds: entryIds.slice(0, 2) })),
      });
      expect(order.length).toBe(blocks.length);
      expect(new Set(order)).toEqual(new Set(blocks.map(b => b.id)));
    }
  });
});

describe('parseAiCvResponse - schéma v2', () => {
  const v2 = {
    schemaVersion: 2,
    analyse: {
      langue_annonce: 'EN',
      indispensables: ['SIEM', 'Python', 'SIEM'],
      importants: ['Docker'],
      correspondances: [{ exigence: 'SIEM', entryId: 'x1' }, { exigence: 'Docker', entryId: null }, { nope: true }],
      ecarts: ['Kubernetes'],
    },
    title: 'SOC Analyst',
    entries: [{ id: 'a', visible: true }],
    sectionLabels: { 'Compétences': 'Skills', vide: '  ', 42: 'x' },
    warnings: ['Quantifier le périmètre ?'],
    champInconnu: { a: 1 },
  };

  it('parse analyse, sectionLabels et warnings (déduplication, normalisation de la langue)', () => {
    const r = parseAiCvResponse(JSON.stringify(v2));
    expect(r.schemaVersion).toBe(2);
    expect(r.analyse).toEqual({
      langueAnnonce: 'en',
      indispensables: ['SIEM', 'Python'],
      importants: ['Docker'],
      correspondances: [{ exigence: 'SIEM', entryId: 'x1' }, { exigence: 'Docker', entryId: null }],
      ecarts: ['Kubernetes'],
    });
    expect(r.sectionLabels).toEqual({ 'Compétences': 'Skills', '42': 'x' });
    expect(r.warnings).toEqual(['Quantifier le périmètre ?']);
    expect((r as unknown as Record<string, unknown>).champInconnu).toBeUndefined();
  });

  it('accepte langue_annonce sous forme de nom (« anglais ») et ignore une valeur inconnue', () => {
    expect(parseAiCvResponse('{"analyse":{"langue_annonce":"anglais"}}').analyse?.langueAnnonce).toBe('en');
    expect(parseAiCvResponse('{"analyse":{"langue_annonce":"klingon","ecarts":["x"]}}').analyse?.langueAnnonce).toBeUndefined();
  });

  it('ignore une analyse vide ou mal formée', () => {
    expect(parseAiCvResponse('{"analyse":{}}').analyse).toBeUndefined();
    expect(parseAiCvResponse('{"analyse":"oups"}').analyse).toBeUndefined();
  });

  it('l\'ancien schéma n\'a aucun champ v2', () => {
    const r = parseAiCvResponse('{"title":"t","entries":[]}');
    expect(r.analyse).toBeUndefined();
    expect(r.sectionLabels).toBeUndefined();
    expect(r.warnings).toBeUndefined();
    expect(r.schemaVersion).toBeUndefined();
  });
});

describe('parseAiCvResponse - texte parasite', () => {
  it('extrait l\'objet JSON entouré de prose et de fences', () => {
    const raw = 'Voici votre CV :\n```json\n{"title":"Dev","entries":[{"id":"a"}]}\n```\nN\'hésitez pas à me dire si...';
    const r = parseAiCvResponse(raw);
    expect(r.title).toBe('Dev');
    expect(r.entries).toHaveLength(1);
  });

  it('gère accolades et guillemets dans les chaînes, et une accolade parasite avant l\'objet', () => {
    const raw = 'Note {importante} :\n{"summary":"Un } piège \\" { ici","entries":[]} fin';
    expect(parseAiCvResponse(raw).summary).toBe('Un } piège " { ici');
  });

  it('retient le premier objet valide quand il y en a deux', () => {
    expect(parseAiCvResponse('{"title":"A"} puis {"title":"B"}').title).toBe('A');
  });

  it('lève une erreur quand aucun objet n\'existe ou qu\'il est tronqué', () => {
    expect(() => parseAiCvResponse('aucun json ici')).toThrow();
    expect(() => parseAiCvResponse('{"title":"coupé"')).toThrow();
  });
});

describe('parseAiCvResponse - analyse.angle (champ additif)', () => {
  it('objet { slug, raison } ou slug seul ; absent : undefined', () => {
    const base = { entries: [], analyse: { indispensables: ['A'] } };
    const withObj = parseAiCvResponse(JSON.stringify({ ...base, analyse: { ...base.analyse, angle: { slug: 'soc', raison: 'Annonce orientée détection' } } }));
    expect(withObj.analyse?.angle).toEqual({ slug: 'soc', raison: 'Annonce orientée détection' });
    expect(parseAiCvResponse(JSON.stringify({ ...base, analyse: { angle: 'soc' } })).analyse?.angle).toEqual({ slug: 'soc' });
    expect(parseAiCvResponse(JSON.stringify(base)).analyse?.angle).toBeUndefined();
  });
});

describe('parseAiCvResponse - analyse.alertes_cap (champ additif)', () => {
  it('liste de chaînes dédoublonnée ; absente : undefined ; schéma v2 conservé', () => {
    const r = parseAiCvResponse(JSON.stringify({ schemaVersion: 2, entries: [], analyse: { alertes_cap: ['Trajet trop long', 'Trajet trop long', ''] } }));
    expect(r.analyse?.alertesCap).toEqual(['Trajet trop long']);
    expect(r.schemaVersion).toBe(2);
    expect(parseAiCvResponse(JSON.stringify({ entries: [], analyse: { ecarts: ['X'] } })).analyse?.alertesCap).toBeUndefined();
  });
});
