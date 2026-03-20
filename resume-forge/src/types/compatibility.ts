export interface MatchedKeyword {
  /** Canonical term as it appears in the job description */
  jobTerm: string;
  /** Actual token found in the CV (may differ via synonym) */
  cvTerm: string;
  /** True when matched via synonym rather than exact form */
  isSynonym: boolean;
  /** TF weight of this term in the job description (0–1) */
  weight: number;
  /** Which CV entry contained this term, if identifiable */
  cvRef?: { entryId: string; entryTitle: string };
}

export interface MissingKeyword {
  jobTerm: string;
  weight: number;
}

export interface AxisScore {
  /** 0–100 */
  score: number;
  matched: MatchedKeyword[];
  missing: MissingKeyword[];
}

export type AdviceType = 'missing_keyword' | 'synonym_expansion';
export type AdviceSeverity = 'high' | 'medium' | 'low';
export type AdviceAxis = 'skills' | 'experience' | 'education' | 'keywords';

export interface Advice {
  type: AdviceType;
  severity: AdviceSeverity;
  axis: AdviceAxis;
  message: string;
  /**
   * For missing_keyword: true when at least one known synonym variant exists
   * (the user can concretely add it to their CV). False for highly specific
   * terms with no known equivalent — informative only.
   */
  actionable?: boolean;
  /** Present for synonym_expansion: which CV entry uses the non-canonical form */
  cvRef?: { entryId: string; entryTitle: string };
}

export interface CompatibilityScoreDetails {
  axes: {
    skills: AxisScore;
    experience: AxisScore;
    education: AxisScore;
    keywords: AxisScore;
  };
  advice: Advice[];
}

export interface CompatibilityScore {
  id: string;
  applicationId: string;
  cvId: string;
  scoreGlobal: number;
  scoreSkills: number;
  scoreExperience: number;
  scoreEducation: number;
  scoreKeywords: number;
  details: CompatibilityScoreDetails;
  cvContentHash: string;
  jobDescriptionHash: string;
  computedAt: string;
}
