import type { EntryType } from '@/types/profile';

export type ImportFormat = 'linkedin' | 'pdf' | 'docx' | 'json';

export type ImportStep = 'source' | 'process' | 'preview' | 'done';

export interface ImportProfileData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  title?: string;
  summary?: string;
}

export interface ImportEntryData {
  entryType: EntryType;
  title: string;
  subtitle?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
  tags?: string[];
}

export interface ImportPayload {
  profile?: ImportProfileData;
  entries?: ImportEntryData[];
}

/** Field-level diff for the profile merge UI */
export type ProfileFieldKey = keyof ImportProfileData;

export interface ProfileFieldDiff {
  key: ProfileFieldKey;
  label: string;
  existing: string | null;
  imported: string | null;
  /** User's choice: keep existing or use imported value */
  useImported: boolean;
}

/** Entry with a selected flag for the preview checklist */
export interface SelectableEntry {
  data: ImportEntryData;
  selected: boolean;
  /** Heuristic: potential duplicate detected in existing entries */
  possibleDuplicate: boolean;
}
