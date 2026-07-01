export type EntryType =
  | 'experience'
  | 'education'
  | 'skill'
  | 'certification'
  | 'language'
  | 'interest'
  | 'project'
  | 'volunteer';

export interface Profile {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  photoPath: string | null;
  title: string | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MasterEntry {
  id: string;
  profileId: string;
  entryType: EntryType;
  title: string;
  subtitle: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
  metadata: Record<string, unknown>;
  sortOrder: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** Append-only audit trail row: one raw CV variant that contributed to a master entry. */
export interface EntryVariantHistory {
  id: string;
  masterEntryId: string;
  sourceCvId: string | null;
  sourceCvName: string | null;
  rawTitle: string | null;
  rawSubtitle: string | null;
  rawLocation: string | null;
  rawStartDate: string | null;
  rawEndDate: string | null;
  rawIsCurrent: boolean;
  rawDescription: string | null;
  matchScore: number | null;
  matchCriteria: Record<string, unknown>;
  resolution: 'merged' | 'new_entry';
  syncedAt: string;
}