import { describe, expect, test } from 'bun:test';
import { isAllowedAlertLink, cleanAlertLink } from './link-safety';
import { isSenderAllowed, senderAddress } from './sender-allowlist';
import { selectNewUids, advanceCursor, initialSince } from './uid-tracker';

describe('liens d\'e-mail', () => {
  test('domaines attendus et sous-domaines', () => {
    expect(isAllowedAlertLink('https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/123')).toBe(true);
    expect(isAllowedAlertLink('https://www.emploi-territorial.fr/offre/o0942-x')).toBe(true);
    expect(isAllowedAlertLink('https://apec.fr/x')).toBe(true);
  });
  test('refuse imitation, http, identifiants, autre domaine, javascript:', () => {
    for (const bad of [
      'https://apec.fr.evil.example/x', 'https://evilapec.fr/x', 'http://www.apec.fr/x',
      'https://user:pw@www.apec.fr/x', 'https://tracker.example/r?u=https://apec.fr', 'javascript:alert(1)', 'pas un lien',
    ]) expect(isAllowedAlertLink(bad)).toBe(false);
  });
  test('nettoyage : requête de suivi et ancre retirées', () => {
    expect(cleanAlertLink('https://www.apec.fr/o/1?utm_source=mail#x')).toBe('https://www.apec.fr/o/1');
    expect(cleanAlertLink('https://evil.example/o/1')).toBeNull();
  });
});

describe('expéditeurs', () => {
  test('adresse extraite de l\'en-tête From', () => {
    expect(senderAddress('APEC <Alertes@Apec.fr>')).toBe('alertes@apec.fr');
    expect(senderAddress('alertes@apec.fr')).toBe('alertes@apec.fr');
    expect(senderAddress('sans adresse')).toBeNull();
  });
  test('liste blanche par adresse ou domaine ; vide = tout refusé', () => {
    expect(isSenderAllowed('APEC <alertes@apec.fr>', ['apec.fr'])).toBe(true);
    expect(isSenderAllowed('x <a@mail.apec.fr>', ['apec.fr'])).toBe(true);
    expect(isSenderAllowed('x <a@apec.fr>', ['b@apec.fr'])).toBe(false);
    expect(isSenderAllowed('x <a@evilapec.fr>', ['apec.fr'])).toBe(false);
    expect(isSenderAllowed('x <a@apec.fr>', [])).toBe(false);
  });
});

describe('suivi par UID', () => {
  test('premier passage : tout est nouveau ; ensuite seuls les UID supérieurs', () => {
    expect(selectNewUids([3, 1, 2, 2], null, 7)).toEqual([1, 2, 3]);
    expect(selectNewUids([1, 2, 3, 4], { uidValidity: 7, lastUid: 3 }, 7)).toEqual([4]);
  });
  test('pas de double import après avancement du curseur', () => {
    const first = selectNewUids([1, 2, 3], null, 7);
    const cursor = advanceCursor(null, 7, first);
    expect(selectNewUids([1, 2, 3], cursor, 7)).toEqual([]);
  });
  test('UIDVALIDITY changé : on repart de zéro', () => {
    expect(selectNewUids([1, 2], { uidValidity: 7, lastUid: 50 }, 8)).toEqual([1, 2]);
    expect(advanceCursor({ uidValidity: 7, lastUid: 50 }, 8, [2])).toEqual({ uidValidity: 8, lastUid: 2 });
  });
  test('le curseur ne recule jamais', () => {
    expect(advanceCursor({ uidValidity: 7, lastUid: 10 }, 7, [3])).toEqual({ uidValidity: 7, lastUid: 10 });
    expect(advanceCursor({ uidValidity: 7, lastUid: 10 }, 7, [])).toEqual({ uidValidity: 7, lastUid: 10 });
  });
  test('fenêtre initiale de 30 jours', () => {
    expect(initialSince(new Date('2026-10-06T12:00:00Z'))).toBe('6-Sep-2026');
  });
});
