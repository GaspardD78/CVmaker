import { describe, expect, test } from 'bun:test';
import { DEFAULT_DATE_SETTINGS, formatEntryDates, formatMonthYear, readDateSettings, yearOf, type DateSettings } from './entry-dates';

const MONTH_YEAR = DEFAULT_DATE_SETTINGS;
const YEAR: DateSettings = { dateFormat: 'year', showEducationYears: true };
const YEAR_NO_EDUCATION: DateSettings = { dateFormat: 'year', showEducationYears: false };
const MONTH_YEAR_NO_EDUCATION: DateSettings = { dateFormat: 'month-year', showEducationYears: false };

const exp = (startDate?: string | null, endDate?: string | null, isCurrent = false) => ({ entryType: 'experience', startDate, endDate, isCurrent });
const edu = (startDate?: string | null, endDate?: string | null) => ({ entryType: 'education', startDate, endDate, isCurrent: false });
const cert = (startDate?: string | null, endDate?: string | null) => ({ entryType: 'certification', startDate, endDate, isCurrent: false });

describe('readDateSettings', () => {
  test('défauts : mois et année, années de formation affichées', () => {
    expect(readDateSettings(undefined)).toEqual(MONTH_YEAR);
    expect(readDateSettings(null)).toEqual(MONTH_YEAR);
    expect(readDateSettings({})).toEqual(MONTH_YEAR);
  });

  test('dateFormat : seul « year » active le mode année', () => {
    expect(readDateSettings({ dateFormat: 'year' }).dateFormat).toBe('year');
    expect(readDateSettings({ dateFormat: 'month-year' }).dateFormat).toBe('month-year');
    for (const bad of ['', 'Year', 'years', 'annee', 1, true, null, {}]) {
      expect(readDateSettings({ dateFormat: bad }).dateFormat).toBe('month-year');
    }
  });

  test('showEducationYears : seul false masque les années de formation', () => {
    expect(readDateSettings({ showEducationYears: false }).showEducationYears).toBe(false);
    expect(readDateSettings({ showEducationYears: 'false' }).showEducationYears).toBe(false);
    expect(readDateSettings({ showEducationYears: true }).showEducationYears).toBe(true);
    for (const other of ['', 'true', 0, 1, null, undefined, 'no']) {
      expect(readDateSettings({ showEducationYears: other }).showEducationYears).toBe(true);
    }
  });
});

describe('yearOf', () => {
  test("lit l'année dans la chaîne, quel que soit le fuseau", () => {
    expect(yearOf('2007-01')).toBe('2007');
    expect(yearOf('2007-01-01')).toBe('2007');
    expect(yearOf('2007-12-31T23:59:59Z')).toBe('2007');
    expect(yearOf('2007')).toBe('2007');
    expect(yearOf(' 2007-06')).toBe('2007');
  });

  test("une chaîne qui ne commence pas par une année suit la lecture historique", () => {
    expect(yearOf('date inconnue')).toBe('date inconnue');
    expect(yearOf('12345-01')).not.toBe('1234');
  });
});

describe('formatEntryDates, mois et année (comportement historique)', () => {
  test('expérience : période, en cours, début seul, fin seule', () => {
    expect(formatEntryDates(exp('2020-03', '2022-08'), undefined, MONTH_YEAR)).toBe('mars 2020 - août 2022');
    expect(formatEntryDates(exp('2022-09', null, true), undefined, MONTH_YEAR)).toBe('septembre 2022 - Présent');
    expect(formatEntryDates(exp('2020-03'), undefined, MONTH_YEAR)).toBe('mars 2020');
    expect(formatEntryDates(exp(null, '2022-08'), undefined, MONTH_YEAR)).toBe('août 2022');
    expect(formatEntryDates(exp(null, null, true), undefined, MONTH_YEAR)).toBe('Présent');
    expect(formatEntryDates(exp(), undefined, MONTH_YEAR)).toBe('');
  });

  test('« en cours » l\'emporte sur une date de fin', () => {
    expect(formatEntryDates(exp('2022-09', '2023-01', true), undefined, MONTH_YEAR)).toBe('septembre 2022 - Présent');
  });

  test('formation et certification : années seules, comme avant', () => {
    expect(formatEntryDates(edu('2010-09', '2012-06'), undefined, MONTH_YEAR)).toBe('2010 - 2012');
    expect(formatEntryDates(cert('2023-01', '2025-01'), undefined, MONTH_YEAR)).toBe('2023 - 2025');
    expect(formatEntryDates(cert('2024-06'), undefined, MONTH_YEAR)).toBe('2024');
  });

  test('projet : mois et année', () => {
    expect(formatEntryDates({ entryType: 'project', startDate: '2021-05', endDate: '2022-01' }, undefined, MONTH_YEAR)).toBe('mai 2021 - janvier 2022');
  });

  test("masquer les années de formation ne touche pas aux autres types", () => {
    expect(formatEntryDates(edu('2010-09', '2012-06'), undefined, MONTH_YEAR_NO_EDUCATION)).toBe('');
    expect(formatEntryDates(exp('2020-03', '2022-08'), undefined, MONTH_YEAR_NO_EDUCATION)).toBe('mars 2020 - août 2022');
    expect(formatEntryDates(cert('2023-01', '2025-01'), undefined, MONTH_YEAR_NO_EDUCATION)).toBe('2023 - 2025');
  });

  test("missingEnd « today » (DOCX) : « Aujourd'hui » sans date de fin, jamais pour « en cours » ni sans début", () => {
    expect(formatEntryDates(exp('2020-03'), undefined, MONTH_YEAR, { missingEnd: 'today' })).toBe("mars 2020 - Aujourd'hui");
    expect(formatEntryDates(exp('2020-03'), undefined, MONTH_YEAR, { missingEnd: 'omit' })).toBe('mars 2020');
    expect(formatEntryDates(exp('2020-03', null, true), undefined, MONTH_YEAR, { missingEnd: 'today' })).toBe('mars 2020 - Présent');
    expect(formatEntryDates(exp(), undefined, MONTH_YEAR, { missingEnd: 'today' })).toBe('');
  });
});

describe('formatEntryDates, mode année', () => {
  test('toutes les dates en année seule', () => {
    expect(formatEntryDates(exp('2020-03', '2022-08'), undefined, YEAR)).toBe('2020 - 2022');
    expect(formatEntryDates({ entryType: 'project', startDate: '2021-05', endDate: '2023-01' }, undefined, YEAR)).toBe('2021 - 2023');
    expect(formatEntryDates(edu('2010-09', '2012-06'), undefined, YEAR)).toBe('2010 - 2012');
    expect(formatEntryDates(cert('2023-01', '2025-01'), undefined, YEAR)).toBe('2023 - 2025');
  });

  test('« Présent » conservé pour les postes en cours', () => {
    expect(formatEntryDates(exp('2022-09', null, true), undefined, YEAR)).toBe('2022 - Présent');
    expect(formatEntryDates(exp('2022-09', '2023-04', true), undefined, YEAR)).toBe('2022 - Présent');
    expect(formatEntryDates(exp(null, null, true), undefined, YEAR)).toBe('Présent');
    // Même année de début et « en cours » : on garde la mention.
    expect(formatEntryDates(exp('2026-02', null, true), undefined, YEAR)).toBe('2026 - Présent');
  });

  test("« Aujourd'hui » conservé avec missingEnd « today »", () => {
    expect(formatEntryDates(exp('2020-03'), undefined, YEAR, { missingEnd: 'today' })).toBe("2020 - Aujourd'hui");
    expect(formatEntryDates(exp('2020-03'), undefined, YEAR)).toBe('2020');
  });

  test('période dans une seule année : une année, pas « 2023 - 2023 »', () => {
    expect(formatEntryDates(exp('2023-02', '2023-09'), undefined, YEAR)).toBe('2023');
    expect(formatEntryDates(edu('2023-01', '2023-12'), undefined, YEAR)).toBe('2023');
  });

  test('un intercontrat entre deux années disparaît visuellement', () => {
    // décembre 2015 → janvier 2016 : deux périodes qui se touchent en années.
    expect(formatEntryDates(exp('2014-09', '2015-12'), undefined, YEAR)).toBe('2014 - 2015');
    expect(formatEntryDates(exp('2016-01', '2020-02'), undefined, YEAR)).toBe('2016 - 2020');
  });

  test('début seul, fin seule, aucune date', () => {
    expect(formatEntryDates(exp('2020-03'), undefined, YEAR)).toBe('2020');
    expect(formatEntryDates(exp(null, '2022-08'), undefined, YEAR)).toBe('2022');
    expect(formatEntryDates(exp(), undefined, YEAR)).toBe('');
  });

  test('insensible au fuseau : « 2007-01 » reste 2007', () => {
    expect(formatEntryDates(edu('2007-01', '2010-06'), undefined, YEAR)).toBe('2007 - 2010');
    expect(formatEntryDates(exp('2016-01', '2020-01'), undefined, YEAR)).toBe('2016 - 2020');
    expect(formatEntryDates(exp('2020', '2022'), undefined, YEAR)).toBe('2020 - 2022');
  });
});

describe('formatEntryDates, masquage des années de formation', () => {
  test('masque toutes les dates des formations, « en cours » compris', () => {
    expect(formatEntryDates(edu('2010-09', '2012-06'), undefined, YEAR_NO_EDUCATION)).toBe('');
    expect(formatEntryDates({ entryType: 'education', startDate: '2022-09', isCurrent: true }, undefined, YEAR_NO_EDUCATION)).toBe('');
  });

  test('masque aussi la surcharge datesOverride des formations', () => {
    expect(formatEntryDates(edu('2010-09', '2012-06'), '2010 - 2012', YEAR_NO_EDUCATION)).toBe('');
  });

  test('ne touche ni les expériences, ni les projets, ni les certifications', () => {
    expect(formatEntryDates(exp('2020-03', '2022-08'), undefined, YEAR_NO_EDUCATION)).toBe('2020 - 2022');
    expect(formatEntryDates({ entryType: 'project', startDate: '2021-05', endDate: '2023-01' }, undefined, YEAR_NO_EDUCATION)).toBe('2021 - 2023');
    expect(formatEntryDates(cert('2023-01', '2025-01'), undefined, YEAR_NO_EDUCATION)).toBe('2023 - 2025');
  });

  test('affichées par défaut', () => {
    expect(formatEntryDates(edu('2010-09', '2012-06'), undefined, YEAR)).toBe('2010 - 2012');
  });
});

describe('formatEntryDates, datesOverride', () => {
  test('affichée telle quelle, dans les deux modes (texte libre)', () => {
    expect(formatEntryDates(exp('2020-03', '2022-08'), ' mars 2020 – août 2022 ', MONTH_YEAR)).toBe('mars 2020 – août 2022');
    expect(formatEntryDates(exp('2020-03', '2022-08'), 'mars 2020 – août 2022', YEAR)).toBe('mars 2020 – août 2022');
  });

  test('ignorée si vide, blanche ou pas une chaîne', () => {
    expect(formatEntryDates(exp('2020-03', '2022-08'), '', YEAR)).toBe('2020 - 2022');
    expect(formatEntryDates(exp('2020-03', '2022-08'), '   ', YEAR)).toBe('2020 - 2022');
    expect(formatEntryDates(exp('2020-03', '2022-08'), 2020, YEAR)).toBe('2020 - 2022');
    expect(formatEntryDates(exp('2020-03', '2022-08'), null, YEAR)).toBe('2020 - 2022');
  });

  test('suffit à elle seule, sans aucune date', () => {
    expect(formatEntryDates(exp(), '2021 - 2023', MONTH_YEAR)).toBe('2021 - 2023');
  });
});

describe('formatMonthYear', () => {
  test('mois lu dans la chaîne', () => {
    expect(formatMonthYear('2020-03')).toBe('mars 2020');
    expect(formatMonthYear('2007-01')).toBe('janvier 2007');
    expect(formatMonthYear('2015-12')).toBe('décembre 2015');
    expect(formatMonthYear('2020-3')).toBe('mars 2020');
    expect(formatMonthYear('2020-03-01')).toBe('mars 2020');
    expect(formatMonthYear('2020-03-15')).toBe('mars 2020');
    expect(formatMonthYear(' 2020-03 ')).toBe('mars 2020');
  });

  test('une année seule donne janvier, comme avant', () => {
    expect(formatMonthYear('2020')).toBe('janvier 2020');
  });

  test("une heure éventuelle est lue telle quelle, sans conversion de fuseau", () => {
    expect(formatMonthYear('2020-01-31T23:30:00+01:00')).toBe('janvier 2020');
    expect(formatMonthYear('2020-03-01T00:00:00Z')).toBe('mars 2020');
  });

  test("les noms de mois sont ceux d'Intl fr-FR, pour les 12 mois", () => {
    for (let month = 1; month <= 12; month++) {
      const expected = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(2021, month - 1, 15)));
      expect(formatMonthYear(`2021-${String(month).padStart(2, '0')}`)).toBe(expected);
    }
  });

  test('un mois hors de 1 à 12 ou un autre format suit la lecture via Date', () => {
    expect(formatMonthYear('2020-13')).toBe('2020-13');
    expect(formatMonthYear('2020-00')).toBe('2020-00');
    expect(formatMonthYear('date inconnue')).toBe('date inconnue');
    expect(formatMonthYear('01/2020')).toBe('01/2020');
  });
});

// Les dates sont lues dans la chaîne : même texte quel que soit le fuseau de la machine.
// Chaque fuseau est évalué dans un processus Bun distinct (la variable TZ est lue au démarrage).
describe('indépendance du fuseau horaire', () => {
  const ZONES = ['Europe/Paris', 'UTC', 'America/New_York', 'America/Los_Angeles', 'Pacific/Honolulu', 'America/Sao_Paulo', 'Asia/Tokyo', 'Pacific/Auckland', 'Asia/Kolkata'];
  const MODULE = import.meta.dir + '/entry-dates';
  const SCRIPT = `
    import { formatEntryDates, formatMonthYear, DEFAULT_DATE_SETTINGS } from ${JSON.stringify(MODULE)};
    const year = { dateFormat: 'year', showEducationYears: true };
    const e = (entryType, startDate, endDate) => ({ entryType, startDate, endDate, isCurrent: false });
    console.log(JSON.stringify([
      ['2007-01', '2020-03', '2020-01-01', '2020-12', '2020', '2020-01-31T23:30:00+01:00'].map(formatMonthYear),
      formatEntryDates(e('experience', '2016-01', '2020-02'), undefined, DEFAULT_DATE_SETTINGS),
      formatEntryDates(e('education', '2007-01', '2010-06'), undefined, DEFAULT_DATE_SETTINGS),
      formatEntryDates(e('experience', '2016-01', '2020-02'), undefined, year),
      formatEntryDates(e('education', '2007-01', '2010-06'), undefined, year),
    ]));
  `;
  const run = (tz: string) => {
    const r = Bun.spawnSync([process.execPath, '-e', SCRIPT], { env: { ...process.env, TZ: tz } });
    if (r.exitCode !== 0) throw new Error(`${tz} : ${r.stderr.toString()}`);
    return JSON.parse(r.stdout.toString());
  };

  test('même résultat dans 9 fuseaux, positifs et négatifs', () => {
    const expected = [
      ['janvier 2007', 'mars 2020', 'janvier 2020', 'décembre 2020', 'janvier 2020', 'janvier 2020'],
      'janvier 2016 - février 2020',
      '2007 - 2010',
      '2016 - 2020',
      '2007 - 2010',
    ];
    for (const tz of ZONES) expect(run(tz)).toEqual(expected);
  });
});

describe('langue du CV (cv.settings.cvLanguage)', () => {
  const exp = (start: string, end: string | null, current = false) => ({ entryType: 'experience', startDate: start, endDate: end, isCurrent: current });

  test('readDateSettings lit la langue, défaut français', () => {
    expect(readDateSettings({}).language).toBe('fr');
    expect(readDateSettings({ cvLanguage: 'en' }).language).toBe('en');
    expect(readDateSettings({ cvLanguage: 'n/a' }).language).toBe('fr');
  });

  test('anglais : mois en anglais, « Present »', () => {
    const s = readDateSettings({ cvLanguage: 'en' });
    expect(formatEntryDates(exp('2021-01', null, true), undefined, s)).toBe('January 2021 - Present');
    expect(formatEntryDates(exp('2018-09', '2020-12'), undefined, s)).toBe('September 2018 - December 2020');
    expect(formatEntryDates(exp('2020-03', null), undefined, s, { missingEnd: 'today' })).toBe('March 2020 - Today');
  });

  test('allemand : mois via Intl, « Heute »', () => {
    const s = readDateSettings({ cvLanguage: 'de' });
    expect(formatEntryDates(exp('2021-03', null, true), undefined, s)).toBe('März 2021 - Heute');
  });

  test('mode année et surcharge inchangés quelle que soit la langue', () => {
    const s = { ...readDateSettings({ cvLanguage: 'en', dateFormat: 'year' }) };
    expect(formatEntryDates(exp('2021-01', '2022-05'), undefined, s)).toBe('2021 - 2022');
    expect(formatEntryDates(exp('2021-01', null, true), '2021 - now', s)).toBe('2021 - now');
  });
});
