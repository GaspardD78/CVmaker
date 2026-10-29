import type { CVBlock } from '@/types/cv';
import type { EntryType, MasterEntry, Profile } from '@/types/profile';
import { makeEntry } from './cv-fixtures';

/**
 * Fixture anonymisée du cas de bout en bout « chargé de recrutement généraliste » : employeurs, écoles et
 * contenus fictifs, aucune donnée réelle. Quatre postes détaillés, deux lignes à fusionner (2 puis 3 postes
 * anciens), formation, compétences en catégories, certification et centre d'intérêt à masquer.
 */

export const GENERALIST_NOW = new Date(Date.UTC(2026, 5, 15));

export const GENERALIST_PROFILE: Profile = {
  id: 'p-gen', firstName: 'Camille', lastName: 'Exemple', email: 'camille.exemple@example.com', phone: null,
  address: null, city: 'Lyon', postalCode: null, country: 'France', linkedinUrl: null, githubUrl: null, portfolioUrl: null,
  photoPath: null, title: 'Chargé de recrutement', summary: 'Chargé de recrutement polyvalent.',
  drivingLicense: 'Permis B', headerExtras: [], createdAt: '', updatedAt: '',
};

const exp = (id: string, title: string, subtitle: string, start: string, end: string | null, description: string) =>
  makeEntry(id, 'experience', title, { subtitle, startDate: start, endDate: end, isCurrent: end === null, description, profileId: 'p-gen' });

export const GENERALIST_ENTRIES: MasterEntry[] = [
  // Postes détaillés (les plus récents).
  exp('d1', 'Chargé de recrutement', 'Agence Alpha', '2022-01', null,
    "- Piloter les recrutements de la direction avec les responsables de service\n- Rédiger les fiches de poste et les annonces\n- Conduire les entretiens et les jurys de sélection\n- Suivre les candidatures dans un ATS"),
  exp('d2', 'Chargé de recrutement', 'Groupe Beta', '2019-03', '2021-12',
    "- Accompagner les managers dans l'évaluation des candidats\n- Organiser des recrutements collectifs pour 12 postes\n- Former les encadrants à l'entretien"),
  exp('d3', 'Chargé de recrutement', 'Cabinet Gamma', '2017-01', '2019-02',
    "- Gérer les recrutements de bout en bout\n- Animer la relation avec les écoles\n- Mettre en place des procédures de recrutement"),
  exp('d4', 'Assistant RH', 'Société Delta', '2015-06', '2016-12',
    "- Assurer le suivi administratif des recrutements\n- Participer aux jurys\n- Accueillir les nouveaux agents"),
  // Ligne fusionnée n° 1 : deux postes (dates calculées : mars 2013 à mai 2015).
  exp('a1', 'Chargé de recrutement (Epsilon)', 'Epsilon', '2014-01', '2015-05',
    "- Conduire des recrutements pour plusieurs services\n- Rédiger des comptes rendus d'entretien"),
  exp('a2', 'Chargé de recrutement (Zeta)', 'Zeta', '2013-03', '2013-12',
    "- Rechercher des candidats par candidature spontanée\n- Planifier les entretiens"),
  // Ligne fusionnée n° 2 : trois postes (dates calculées : septembre 2010 à février 2013).
  exp('b1', 'Assistant recrutement (Eta)', 'Eta', '2012-02', '2013-02',
    "- Assister les recruteurs dans les entretiens\n- Tenir le tableau de suivi des candidatures"),
  exp('b2', 'Assistant recrutement (Theta)', 'Theta', '2011-06', '2012-01',
    "- Publier les annonces\n- Trier les candidatures reçues"),
  exp('b3', 'Assistant recrutement (Iota)', 'Iota', '2010-09', '2011-05',
    "- Accueillir les candidats\n- Classer les dossiers de candidature"),
  makeEntry('ed1', 'education', 'Master Ressources humaines', { subtitle: 'Université fictive', startDate: '2008', endDate: '2010', profileId: 'p-gen' }),
  makeEntry('ed2', 'education', 'Licence Psychologie', { subtitle: 'Université fictive', startDate: '2005', endDate: '2008', profileId: 'p-gen' }),
  makeEntry('k1', 'skill', 'Recrutement', { description: '- Entretien\n- Rédaction de fiches de poste\n- Jurys', profileId: 'p-gen' }),
  makeEntry('k2', 'skill', 'Outils', { description: '- ATS\n- Tableur\n- Messagerie', profileId: 'p-gen' }),
  makeEntry('c1', 'certification', 'Formation au recrutement sans discrimination', { subtitle: 'Organisme fictif', startDate: '2019', profileId: 'p-gen' }),
  makeEntry('i1', 'interest', 'Randonnée', { profileId: 'p-gen' }),
];

const HEADERS: [EntryType, string][] = [
  ['experience', 'Expériences Professionnelles'], ['education', 'Formations'], ['skill', 'Compétences'],
  ['certification', 'Certifications'], ['interest', "Centres d'intérêt"],
];

/** Blocs d'un CV fraîchement créé : un en-tête par type, puis une entrée par bloc, dans l'ordre du profil. */
export function makeGeneralistBlocks(entries: readonly MasterEntry[] = GENERALIST_ENTRIES): CVBlock[] {
  const blocks: CVBlock[] = [];
  let order = 0;
  for (const [type, label] of HEADERS) {
    const list = entries.filter(e => e.entryType === type);
    if (list.length === 0) continue;
    blocks.push({ id: `h-${type}`, cvId: 'cv-gen', entryId: null, blockType: 'section_header', sectionName: label, customContent: null, sortOrder: order++, isVisible: true, overrideData: {}, createdAt: '' });
    for (const e of list) {
      blocks.push({ id: `b-${e.id}`, cvId: 'cv-gen', entryId: e.id, blockType: 'entry_ref', sectionName: null, customContent: null, sortOrder: order++, isVisible: true, overrideData: {}, createdAt: '' });
    }
  }
  return blocks;
}

export const GENERALIST_TITLE = 'Chargé de recrutement · Évaluation et conseil aux encadrants';

export const GENERALIST_SKILL_LINES = [
  { text: 'Analyse des besoins et rédaction de fiches de poste', sources: ['d1'] },
  { text: "Conduite d'entretiens et participation aux jurys de sélection", sources: ['d1', 'd4'] },
  { text: 'Évaluation des candidats et conseil aux encadrants', sources: ['d2'] },
  { text: 'Organisation de recrutements collectifs', sources: ['d2'] },
  { text: 'Mise en place de procédures et suivi administratif des recrutements', sources: ['d3', 'd4'] },
  // Sources : entrées fusionnées (leurs blocs sont masqués par la fusion, la source reste valide).
  { text: 'Recherche de candidats et planification des entretiens', sources: ['a2'] },
  { text: 'Accueil des candidats et suivi des dossiers de candidature', sources: ['b3'] },
];

/** Réponse de l'IA (schéma v2 additif), telle qu'un LLM rigoureux la produirait pour une annonce du secteur public. */
export function generalistResponse(overrides: { d1Description?: string } = {}): Record<string, unknown> {
  return {
    schemaVersion: 2,
    analyse: {
      langue_annonce: 'fr',
      indispensables: ['Conduite de recrutements', 'Conseil aux encadrants'],
      importants: ['Recrutements collectifs'],
      correspondances: [
        { exigence: 'Conduite de recrutements', entryId: 'd1' },
        { exigence: 'Conseil aux encadrants', entryId: 'd2' },
      ],
      ecarts: [],
    },
    title: GENERALIST_TITLE,
    summary: "Plus de dix ans d'expérience en recrutement dans le secteur public : évaluation des candidats, conseil et formation des encadrants, conduite de procédures de recrutement.",
    header: { showDrivingLicense: true },
    entries: [
      { id: 'd1', visible: true, description: overrides.d1Description ?? "- Piloter les recrutements de la direction avec les responsables de service\n- Rédiger les fiches de poste et les annonces\n- Conduire les entretiens et les jurys de sélection\n- Suivre les candidatures dans un ATS" },
      { id: 'd2', visible: true, description: "- Accompagner les managers dans l'évaluation des candidats\n- Organiser des recrutements collectifs pour 12 postes\n- Former les encadrants à l'entretien" },
      { id: 'd3', visible: true, description: "- Gérer les recrutements de bout en bout\n- Animer la relation avec les écoles\n- Mettre en place des procédures de recrutement" },
      { id: 'd4', visible: true, description: "- Assurer le suivi administratif des recrutements\n- Participer aux jurys\n- Accueillir les nouveaux agents" },
      { id: 'a1', visible: true }, { id: 'a2', visible: true },
      { id: 'b1', visible: true }, { id: 'b2', visible: true }, { id: 'b3', visible: true },
      { id: 'ed1', visible: true }, { id: 'ed2', visible: true },
      { id: 'k1', visible: false }, { id: 'k2', visible: false }, { id: 'c1', visible: false }, { id: 'i1', visible: false },
    ],
    mergedEntries: [
      { ids: ['a1', 'a2'], titleOverride: 'Chargé de recrutement', description: "- Conduire des recrutements pour plusieurs services\n- Rechercher des candidats et planifier les entretiens" },
      { ids: ['b1', 'b2', 'b3'], titleOverride: 'Assistant recrutement' },
    ],
    cvSkillLines: GENERALIST_SKILL_LINES,
    sectionOrder: ['Expériences Professionnelles', 'Compétences', 'Formations'],
    suggestedEntries: [],
  };
}
