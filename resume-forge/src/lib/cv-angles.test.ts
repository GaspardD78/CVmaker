import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_ANGLES, angleSnapshot, entryAffinity, existingCategoryOrder, fieldsToRow, nextAffinity,
  parseAffinityFile, planAffinityImport, readAngleSnapshot, resolveAngle, rowToAngle, slugify,
  uniqueSlug, withAffinity, withoutAngleTags,
} from './cv-angles';
import { makeEntry } from './test-helpers/cv-fixtures';
import { makeCategoryEntries } from './test-helpers/skill-fixtures';

const angle = { ...DEFAULT_ANGLES[0], slug: 'angle-x' };

describe('angles de départ', () => {
  it('3 angles génériques, titre = titre du profil, aucun tiret cadratin', () => {
    expect(DEFAULT_ANGLES.map(a => a.slug)).toEqual(['partner-it-cyber', 'evaluation-formation', 'projets-rh']);
    for (const a of DEFAULT_ANGLES) {
      expect(a.titleRule).toBe('profile');
      expect(a.olderPolicy).toBe('one-line');
      expect(JSON.stringify(a)).not.toContain('—');
    }
  });
});

describe('slugs', () => {
  it('slugify : minuscules, sans accents ni symboles', () => {
    expect(slugify('Évaluation & formation')).toBe('evaluation-formation');
    expect(slugify('  Partenaire IT / cyber ')).toBe('partenaire-it-cyber');
  });
  it('uniqueSlug évite les slugs pris', () => {
    expect(uniqueSlug('Projets RH', ['projets-rh'])).toBe('projets-rh-2');
    expect(uniqueSlug('Projets RH', ['projets-rh', 'projets-rh-2'])).toBe('projets-rh-3');
    expect(uniqueSlug('!!!', [])).toBe('angle');
  });
});

describe('tags angle: / hide:', () => {
  it('angle:x = en tête, hide:x = masquée, sans tag = neutre', () => {
    expect(entryAffinity(['angle:angle-x'], 'angle-x')).toBe('lead');
    expect(entryAffinity(['hide:angle-x'], 'angle-x')).toBe('hide');
    expect(entryAffinity(['angle:autre', 'UX/UI'], 'angle-x')).toBe('neutral');
  });

  it('withAffinity ne touche ni aux étiquettes ni aux autres angles', () => {
    const tags = ['UX/UI', 'angle:autre', 'hide:angle-x'];
    expect(withAffinity(tags, 'angle-x', 'lead')).toEqual(['UX/UI', 'angle:autre', 'angle:angle-x']);
    expect(withAffinity(tags, 'angle-x', 'neutral')).toEqual(['UX/UI', 'angle:autre']);
    expect(withoutAngleTags(['Luxe', 'angle:angle-x', 'hide:angle-x'], 'angle-x')).toEqual(['Luxe']);
  });

  it('cycle de la matrice : neutre, en tête, masquée, neutre', () => {
    expect(nextAffinity('neutral')).toBe('lead');
    expect(nextAffinity('lead')).toBe('hide');
    expect(nextAffinity('hide')).toBe('neutral');
  });
});

describe('resolveAngle / existingCategoryOrder', () => {
  const entries = [
    makeEntry('e1', 'experience', 'Poste A', { tags: ['angle:angle-x', 'UX/UI'] }),
    makeEntry('e2', 'experience', 'Poste B', { tags: ['hide:angle-x'] }),
    makeEntry('e3', 'experience', 'Poste C', { tags: ['UX/UI'] }),
    ...makeCategoryEntries(),
  ];

  it('entrées en tête et masquées d\'après les tags, entrée sans tag neutre', () => {
    const spec = resolveAngle(angle, entries);
    expect(spec.leadEntryIds).toEqual(['e1']);
    expect(spec.hideEntryIds).toEqual(['e2']);
  });

  it('ordre des catégories : titres existants seulement, sans casse ni accents', () => {
    expect(existingCategoryOrder(['outils soc', 'Inexistante', 'Langages', 'Langages'], entries)).toEqual(['Outils SOC', 'Langages']);
  });
});

describe('instantané cv.settings.cvAngle', () => {
  it('copie les listes et se relit', () => {
    const spec = { ...angle, leadEntryIds: ['e1'], hideEntryIds: ['e2'] };
    const snap = angleSnapshot(spec, 'library');
    spec.leadEntryIds.push('e9'); // une modification ultérieure ne réécrit pas l'historique
    expect(snap.leadEntryIds).toEqual(['e1']);
    expect(readAngleSnapshot({ cvAngle: JSON.parse(JSON.stringify(snap)) })).toEqual(snap);
  });
  it('absent ou invalide : null', () => {
    expect(readAngleSnapshot({})).toBeNull();
    expect(readAngleSnapshot({ cvAngle: 'x' })).toBeNull();
    expect(readAngleSnapshot(null)).toBeNull();
  });
});

describe('ligne SQL', () => {
  it('fieldsToRow / rowToAngle (ordre des catégories en JSON)', () => {
    const row = fieldsToRow(angle);
    expect(row.skill_category_order).toBe(JSON.stringify(angle.skillCategoryOrder));
    const back = rowToAngle({ id: 'a', profile_id: 'p', sort_order: 2, ...row });
    expect(back.skillCategoryOrder).toEqual(angle.skillCategoryOrder);
    expect(back.titleRule).toBe('profile');
    expect(rowToAngle({ title_rule: 'autre', older_policy: 'x', skill_category_order: '{' }).olderPolicy).toBe('one-line');
  });
});

describe('fichier d\'affinités', () => {
  const entries = [
    makeEntry('e1', 'experience', 'Analyste (Acme)', { tags: ['UX/UI', 'angle:angle-x'] }),
    makeEntry('e2', 'skill', 'Langages'),
  ];

  it('lecture : seuls les tags angle:/hide: sont retenus, lignes invalides signalées', () => {
    const { rows, errors } = parseAffinityFile(JSON.stringify([
      { entryType: 'experience', title: 'Analyste (Acme)', tags: ['angle:angle-x', 'Luxe', 'hide:autre'] },
      { entryType: 'inconnu', title: 'X', tags: [] },
    ]));
    expect(rows).toEqual([{ entryType: 'experience', title: 'Analyste (Acme)', tags: ['angle:angle-x', 'hide:autre'] }]);
    expect(errors).toHaveLength(1);
    expect(() => parseAffinityFile('{}')).toThrow();
  });

  it('plan : rapprochement type + titre normalisé, tags ajoutés sans doublon ni suppression', () => {
    const plan = planAffinityImport([
      { entryType: 'experience', title: 'analyste (ACME)', tags: ['angle:angle-x', 'hide:autre'] },
      { entryType: 'skill', title: 'Langages', tags: ['angle:angle-x'] },
      { entryType: 'skill', title: 'Absente', tags: ['angle:angle-x'] },
      { entryType: 'experience', title: 'Langages', tags: ['angle:angle-x'] },
    ], entries);
    expect(plan.matched).toBe(2);
    expect(plan.unmatched.map(r => r.title)).toEqual(['Absente', 'Langages']);
    expect(plan.updates).toEqual([
      { entryId: 'e1', entryType: 'experience', title: 'Analyste (Acme)', added: ['hide:autre'], tags: ['UX/UI', 'angle:angle-x', 'hide:autre'] },
      { entryId: 'e2', entryType: 'skill', title: 'Langages', added: ['angle:angle-x'], tags: ['angle:angle-x'] },
    ]);
    expect(plan.addedTagCount).toBe(2);
  });
});
