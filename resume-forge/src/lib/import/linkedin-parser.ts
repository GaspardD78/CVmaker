import JSZip from 'jszip';
import { parseCsv } from './csv-parser';
import type { ImportPayload, ImportProfileData, ImportEntryData } from './types';

/**
 * Parses a LinkedIn data export ZIP file into an ImportPayload.
 * LinkedIn exports the following files (not all may be present):
 *   Profile.csv, Positions.csv, Education.csv, Skills.csv,
 *   Certifications.csv, Languages.csv, Projects.csv,
 *   Volunteer Experiences.csv, Interests.csv
 */
export async function parseLinkedInZip(arrayBuffer: ArrayBuffer): Promise<ImportPayload> {
  const zip = await JSZip.loadAsync(arrayBuffer);

  const readCsv = async (name: string): Promise<Record<string, string>[]> => {
    // LinkedIn sometimes puts files in a subfolder
    const file =
      zip.file(name) ??
      zip.file(`Basic_LinkedInDataExport_*/` + name) ??
      Object.values(zip.files).find(f => f.name.endsWith('/' + name) || f.name === name);
    if (!file) return [];
    const text = await file.async('text');
    return parseCsv(text);
  };

  const [profileRows, positionRows, educationRows, skillRows, certRows, langRows, projectRows, volunteerRows] =
    await Promise.all([
      readCsv('Profile.csv'),
      readCsv('Positions.csv'),
      readCsv('Education.csv'),
      readCsv('Skills.csv'),
      readCsv('Certifications.csv'),
      readCsv('Languages.csv'),
      readCsv('Projects.csv'),
      readCsv('Volunteer Experiences.csv').then(r => r.length ? r : readCsv('Volunteering Experiences.csv')),
    ]);

  const profile = parseProfile(profileRows);
  const entries: ImportEntryData[] = [
    ...parsePositions(positionRows),
    ...parseEducation(educationRows),
    ...parseSkills(skillRows),
    ...parseCertifications(certRows),
    ...parseLanguages(langRows),
    ...parseProjects(projectRows),
    ...parseVolunteer(volunteerRows),
  ];

  return { profile, entries };
}

// ── Field accessors (handle slight naming variations across LinkedIn locales) ──

function get(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const val = row[k];
    if (val !== undefined && val !== '') return val;
  }
  return '';
}

function parseLinkedInDate(raw: string): string {
  if (!raw) return '';
  // LinkedIn dates: "Jan 2020", "2020", "01/2020"
  const monthMap: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  };
  const match = raw.match(/^(\w{3})\s+(\d{4})$/);
  if (match) return `${match[2]}-${monthMap[match[1]] ?? '01'}`;
  if (/^\d{4}$/.test(raw)) return raw;
  return raw;
}

// ── Section parsers ──

function parseProfile(rows: Record<string, string>[]): ImportProfileData {
  if (!rows.length) return {};
  const r = rows[0];
  return {
    firstName: get(r, 'First Name', 'Prénom') || undefined,
    lastName: get(r, 'Last Name', 'Nom') || undefined,
    email: get(r, 'Email Address', 'Adresse email') || undefined,
    phone: get(r, 'Phone Numbers', 'Téléphone') || undefined,
    address: get(r, 'Address', 'Adresse') || undefined,
    city: get(r, 'City', 'Ville', 'Geo Location') || undefined,
    country: get(r, 'Country', 'Pays') || undefined,
    title: get(r, 'Headline', 'Titre') || undefined,
    summary: get(r, 'Summary', 'Résumé') || undefined,
    linkedinUrl: get(r, 'Website', 'URL du profil') || undefined,
  };
}

function parsePositions(rows: Record<string, string>[]): ImportEntryData[] {
  return rows
    .filter(r => get(r, 'Title', 'Intitulé'))
    .map(r => {
      const finishedOn = get(r, 'Finished On', 'Date de fin');
      return {
        entryType: 'experience' as const,
        title: get(r, 'Title', 'Intitulé'),
        subtitle: get(r, 'Company Name', 'Nom de l\'entreprise') || undefined,
        location: get(r, 'Location', 'Lieu') || undefined,
        startDate: parseLinkedInDate(get(r, 'Started On', 'Date de début')) || undefined,
        endDate: finishedOn ? parseLinkedInDate(finishedOn) : undefined,
        isCurrent: !finishedOn,
        description: get(r, 'Description') || undefined,
      };
    });
}

function parseEducation(rows: Record<string, string>[]): ImportEntryData[] {
  return rows
    .filter(r => get(r, 'School Name', 'Nom de l\'école'))
    .map(r => ({
      entryType: 'education' as const,
      title: get(r, 'Degree Name', 'Diplôme', 'Notes') || get(r, 'School Name', 'Nom de l\'école'),
      subtitle: get(r, 'School Name', 'Nom de l\'école') || undefined,
      startDate: parseLinkedInDate(get(r, 'Start Date', 'Date de début')) || undefined,
      endDate: parseLinkedInDate(get(r, 'End Date', 'Date de fin')) || undefined,
      description: [
        get(r, 'Field Of Study', 'Domaine d\'études'),
        get(r, 'Activities', 'Activités'),
        get(r, 'Notes'),
      ].filter(Boolean).join('\n') || undefined,
    }));
}

function parseSkills(rows: Record<string, string>[]): ImportEntryData[] {
  return rows
    .filter(r => get(r, 'Name', 'Nom'))
    .map(r => ({
      entryType: 'skill' as const,
      title: get(r, 'Name', 'Nom'),
    }));
}

function parseCertifications(rows: Record<string, string>[]): ImportEntryData[] {
  return rows
    .filter(r => get(r, 'Name', 'Nom'))
    .map(r => {
      const finishedOn = get(r, 'Finished On', 'Date de fin');
      return {
        entryType: 'certification' as const,
        title: get(r, 'Name', 'Nom'),
        subtitle: get(r, 'Authority', 'Organisme') || undefined,
        startDate: parseLinkedInDate(get(r, 'Started On', 'Date de début')) || undefined,
        endDate: finishedOn ? parseLinkedInDate(finishedOn) : undefined,
        description: [
          get(r, 'License Number', 'Numéro de licence') ? `Numéro : ${get(r, 'License Number', 'Numéro de licence')}` : '',
          get(r, 'Url') ? `URL : ${get(r, 'Url')}` : '',
        ].filter(Boolean).join('\n') || undefined,
      };
    });
}

function parseLanguages(rows: Record<string, string>[]): ImportEntryData[] {
  return rows
    .filter(r => get(r, 'Name', 'Nom'))
    .map(r => ({
      entryType: 'language' as const,
      title: get(r, 'Name', 'Nom'),
      subtitle: get(r, 'Proficiency', 'Maîtrise', 'Niveau') || undefined,
    }));
}

function parseProjects(rows: Record<string, string>[]): ImportEntryData[] {
  return rows
    .filter(r => get(r, 'Title', 'Titre'))
    .map(r => {
      const finishedOn = get(r, 'Finished On', 'Date de fin');
      return {
        entryType: 'project' as const,
        title: get(r, 'Title', 'Titre'),
        startDate: parseLinkedInDate(get(r, 'Started On', 'Date de début')) || undefined,
        endDate: finishedOn ? parseLinkedInDate(finishedOn) : undefined,
        description: [
          get(r, 'Description'),
          get(r, 'Url') ? `URL : ${get(r, 'Url')}` : '',
        ].filter(Boolean).join('\n') || undefined,
      };
    });
}

function parseVolunteer(rows: Record<string, string>[]): ImportEntryData[] {
  return rows
    .filter(r => get(r, 'Organization', 'Organisation'))
    .map(r => {
      const finishedOn = get(r, 'Finished On', 'Date de fin');
      return {
        entryType: 'volunteer' as const,
        title: get(r, 'Role', 'Rôle') || get(r, 'Organization', 'Organisation'),
        subtitle: get(r, 'Organization', 'Organisation') || undefined,
        startDate: parseLinkedInDate(get(r, 'Started On', 'Date de début')) || undefined,
        endDate: finishedOn ? parseLinkedInDate(finishedOn) : undefined,
        description: [
          get(r, 'Cause', 'Cause'),
          get(r, 'Description'),
        ].filter(Boolean).join('\n') || undefined,
      };
    });
}
