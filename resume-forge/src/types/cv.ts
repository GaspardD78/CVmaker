export interface CVDocument {
  id: string;
  profileId: string;
  name: string;
  templateId: string;
  targetJob: string | null;
  targetCompany: string | null;
  customSummary: string | null;
  settings: Record<string, unknown>;
  isFavorite: boolean;
  lastExported: string | null;
  markdownContent: string | null;
  markdownMode: 0 | 1;
  createdAt: string;
  updatedAt: string;
}

export type BlockType = 'section_header' | 'entry_ref' | 'custom_text';

export interface CVBlock {
  id: string;
  cvId: string;
  entryId: string | null;
  blockType: BlockType;
  sectionName: string | null;
  customContent: string | null;
  sortOrder: number;
  isVisible: boolean;
  overrideData: Record<string, unknown>;
  createdAt: string;
}