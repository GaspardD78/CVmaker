export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  /** Whether this template requires a specific block to be selected */
  requiresBlock?: boolean;
  /** Whether this template requires a contact name */
  requiresContactName?: boolean;
}

export interface PromptGeneratorState {
  jobOffer: string;
  selectedTemplateId: string;
  generatedPrompt: string;
}
